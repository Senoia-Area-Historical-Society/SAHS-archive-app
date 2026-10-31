/**
 * Keeps an item's media in step with the item's privacy, as the item changes.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * Media privacy lives in object ACLs, not in storage.rules (which cannot read
 * Firestore) — see "Media privacy" in CLAUDE.md. scripts/reconcile-media-visibility.cjs
 * enforces that across the whole bucket, but only fortnightly. Until it ran:
 *
 *   - an item made private (or put into a private collection) kept its scans
 *     public at storage.googleapis.com, and their download tokens working; and
 *   - the storage-resize-images extension, configured with MAKE_PUBLIC=true,
 *     published a 400px and a 1000px copy of every upload — private items'
 *     included — the moment it was resized.
 *
 * The extension is now configured with MAKE_PUBLIC=false
 * (extensions/storage-resize-images.env — applied by `firebase deploy --only
 * extensions`, which the CI deploy does not run), so a new thumbnail starts
 * restricted. This trigger applies the reconcile
 * script's rule to one item whenever its effective `is_private` or its media
 * changes: every object it references, and their thumbnails, made public if the
 * item is public, and restricted — public ACL removed and download token revoked
 * — if it is not. functions/mediaVisibilityRules.js holds the decisions.
 *
 * ── Thumbnails that arrive late ──────────────────────────────────────────────
 *
 * The editors upload first and write the document after, and the extension
 * resizes asynchronously, so the last image's thumbnails often do not exist yet
 * when this runs. For an original uploaded in the last few minutes, the trigger
 * waits a bounded time for its thumbnails and applies the item's visibility as
 * they appear. A Storage finalize trigger would be the direct signal, but a first
 * Storage-triggered function needs a project IAM grant (pubsub.publisher for the
 * Storage service agent) that the deploy account may not be able to make, and a
 * failed grant fails the whole functions deploy. A thumbnail missed here stays
 * restricted — the card falls back to the public original — until the next item
 * write or reconcile run. That is the safe direction.
 *
 * ── What it does not cover ───────────────────────────────────────────────────
 *
 * Only `archive_items`. Collection artwork, portraits and site assets are still
 * reconciled fortnightly. And it cannot apply "restricted wins" across
 * documents: an object referenced by a public item and a private one is made
 * public here. The editors give every upload a unique path, so that needs a
 * hand-edited URL; the reconcile run restores the restrictive reading.
 *
 * ── Retries ──────────────────────────────────────────────────────────────────
 *
 * `retry: true`, because a dropped event in the restricting direction leaves a
 * private item's media public. Idempotent: it re-reads the item and each
 * object's current ACL, and changes only what disagrees. A failure to restrict
 * throws, and so retries, for up to an hour; a failure to publish is only logged,
 * since the cost is a slower image, not an exposure.
 */

const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const {
    thumbPathsFor,
    isThumbPath,
    expectsThumbnails,
    mediaTargets,
    mediaSignature,
    visibilityActions,
} = require("./mediaVisibilityRules");

const DATABASE = "sahs-archives";

/** How recent an original must be for its thumbnails to be worth waiting for. */
const FRESH_UPLOAD_MS = 10 * 60 * 1000;
/** How long to wait for them, and how often to look. */
const THUMB_WAIT_MS = 75 * 1000;
const THUMB_POLL_MS = 5 * 1000;
/** How long a failing event keeps asking to be retried. */
const RETRY_WINDOW_MS = 60 * 60 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The object's metadata including its ACL, or null if it does not exist. */
async function readObject(file) {
    try {
        const [meta] = await file.getMetadata({ projection: "full" });
        return meta;
    } catch (err) {
        if (err.code === 404) return null;
        throw err;
    }
}

/**
 * Brings one object into line. Returns the metadata it found (null if absent)
 * and whether anything changed.
 */
async function applyTo(file, visibility) {
    const meta = await readObject(file);
    if (!meta) return { meta: null, changed: false };

    const hasToken = Boolean(meta.metadata && meta.metadata.firebaseStorageDownloadTokens);
    const isPublic = (meta.acl || []).some(
        (entry) => entry.entity === "allUsers" && String(entry.role).toUpperCase() === "READER"
    );
    const actions = visibilityActions(visibility, isPublic, hasToken);

    if (actions.makePublic) await file.makePublic();
    if (actions.makePrivate) await file.makePrivate();
    // Removing the key is what invalidates the token; the Firebase download
    // endpoint then falls through to the security rules.
    if (actions.revokeToken) await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: null } });

    const changed = actions.makePublic || actions.makePrivate || actions.revokeToken;
    if (changed) logger.info(`syncItemMediaVisibility: ${visibility} ${file.name}`);
    return { meta, changed };
}

exports.syncItemMediaVisibility = onDocumentWritten({
    document: "archive_items/{itemId}",
    database: DATABASE,
    maxInstances: 10,
    retry: true,
    // Room for the bounded wait on late thumbnails.
    timeoutSeconds: 120,
}, async (event) => {
    if (!event.data?.after.exists) return; // deleted

    const bucket = admin.storage().bucket();
    const before = event.data.before.exists ? event.data.before.data() : undefined;
    if (before && mediaSignature(before, bucket.name) === mediaSignature(event.data.after.data(), bucket.name)) {
        return; // neither the media nor the item's visibility changed
    }

    // The Storage emulator does not model object ACLs, and with no emulator
    // running this would reach the production bucket. Nothing to do locally.
    if (process.env.FUNCTIONS_EMULATOR === "true") {
        logger.debug("syncItemMediaVisibility: skipped under the emulator");
        return;
    }

    // Current state, not the event's: a retried or late event must not apply an
    // older visibility over a newer one.
    const snap = await event.data.after.ref.get();
    if (!snap.exists) return;
    const targets = mediaTargets(snap.data(), bucket.name);

    const failures = [];
    const attempt = async (path, visibility) => {
        try {
            return await applyTo(bucket.file(path), visibility);
        } catch (err) {
            if (visibility === "restricted") failures.push(path);
            logger.error(`syncItemMediaVisibility: could not make ${path} ${visibility}: ${err.message}`);
            return { meta: null, changed: false };
        }
    };

    // Originals first, noting which are fresh uploads still due thumbnails.
    const awaiting = new Map(); // thumbnail path -> visibility
    for (const [path, visibility] of targets) {
        if (isThumbPath(path)) continue;
        const { meta } = await attempt(path, visibility);
        const fresh = meta && Date.now() - Date.parse(meta.timeCreated) < FRESH_UPLOAD_MS;
        if (fresh && expectsThumbnails(path, meta.contentType)) {
            for (const thumb of thumbPathsFor(path)) awaiting.set(thumb, targets.get(thumb));
        }
    }

    // Then every thumbnail that exists now.
    for (const [path, visibility] of targets) {
        if (!isThumbPath(path) || awaiting.has(path)) continue;
        await attempt(path, visibility);
    }

    // Then wait, briefly, for the fresh uploads' thumbnails. Keep looking until a
    // full pass finds them all present and changes nothing, so an ACL the
    // extension sets just after writing a thumbnail is caught too.
    const deadline = Date.now() + THUMB_WAIT_MS;
    for (;;) {
        let allPresent = true;
        let anyChanged = false;
        for (const [path, visibility] of awaiting) {
            const { meta, changed } = await attempt(path, visibility);
            if (!meta) allPresent = false;
            if (changed) anyChanged = true;
        }
        if ((allPresent && !anyChanged) || Date.now() + THUMB_POLL_MS > deadline) break;
        await sleep(THUMB_POLL_MS);
    }

    if (failures.length > 0) {
        const message = `could not restrict ${failures.length} object(s) for ${event.params.itemId}: ${failures.join(", ")}`;
        // Throwing is what earns the retry — but only for an hour. Retries run for
        // up to seven days, and a persistent failure (a missing permission, say)
        // is not worth a week of invocations; the reconcile run is the backstop.
        if (Date.now() - Date.parse(event.time) < RETRY_WINDOW_MS) throw new Error(message);
        logger.error(`syncItemMediaVisibility: giving up after retries — ${message}`);
    }
});
