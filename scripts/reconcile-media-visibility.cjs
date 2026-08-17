#!/usr/bin/env node
/**
 * Enforces one invariant across every media object in Cloud Storage:
 *
 *     an object is publicly readable if and only if the Firestore document
 *     that references it is publicly visible.
 *
 * Why this exists rather than a folder layout
 * -------------------------------------------
 * Storage security rules cannot read Firestore. There is no rule expressing
 * "public unless this item's doc says is_private", so visibility has to be
 * carried by something the storage layer itself can see. The two candidates are
 * the object's path and the object's ACL. Paths mean moving bytes every time a
 * curator changes a flag — and a collection going private changes the visibility
 * of every item inside it at once. An ACL is a single metadata write.
 *
 * So visibility lives in the ACL, and this script is the one operation that
 * reconciles it with Firestore. Three triggers, one primitive: initial
 * migration, after a privacy change, and as a periodic audit.
 *
 * Two things have to be true for a restricted object to actually be restricted
 * -----------------------------------------------------------------------------
 * 1. No public ACL, so https://storage.googleapis.com/<bucket>/<path> denies.
 * 2. No Firebase download token, because a token BYPASSES security rules
 *    entirely. This was measured, not assumed: an object under
 *    accession_paperwork/ — whose rule is `allow read: if isSAHSUser()` —
 *    returned HTTP 200 and 802 KB to an anonymous request carrying its stored
 *    token. Tightening rules alone would have left every already-issued URL
 *    working forever.
 *
 * Curators still need to see restricted media. Once the token is gone the app
 * calls getDownloadURL() on demand, which requires auth and is checked against
 * the rules — and mints a fresh token. That token is not written to Firestore,
 * and the next run of this script revokes it again. Mint on demand, revoke on
 * reconcile.
 *
 * Usage:
 *   node scripts/reconcile-media-visibility.cjs --dry-run   # report only
 *   node scripts/reconcile-media-visibility.cjs             # apply
 *   node scripts/reconcile-media-visibility.cjs --verbose   # list every object
 *
 * Idempotent. Re-running makes no changes once the bucket already agrees with
 * Firestore, so it is safe on a schedule.
 */

const admin = require('firebase-admin');

const BUCKET = 'sahs-archives.firebasestorage.app';
const DATABASE_ID = 'sahs-archives';
const RESIZED_DIR = 'thumbs'; // must match RESIZED_IMAGES_PATH / imageThumbs.ts
const THUMB_SIZES = [400, 1000]; // must match IMG_SIZES / THUMB_SIZES

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');

const stats = {
    docsRead: 0,
    shouldBePublic: 0,
    shouldBeRestricted: 0,
    madePublic: 0,
    restricted: 0,
    tokensRevoked: 0,
    alreadyCorrect: 0,
    missing: 0,
    unattributed: 0,
    orphanRestricted: 0,
    orphanThumbs: 0,
    failed: 0,
};

/** Recovers a bucket object path from either URL shape Storage hands out. */
function objectPathFromUrl(url) {
    if (!url || typeof url !== 'string') return null;
    const firebase = url.match(/firebasestorage\.googleapis\.com\/v0\/b\/([^/]+)\/o\/([^?]+)/);
    if (firebase) return safeDecode(firebase[2]);
    const gcs = url.match(/storage\.googleapis\.com\/([^/]+)\/([^?]+)/);
    if (gcs) return safeDecode(gcs[2]);
    return null;
}

function safeDecode(v) {
    try { return decodeURIComponent(v); } catch { return null; }
}

/** Derived variants share their original's visibility, so they move together. */
function thumbPathsFor(objectPath) {
    const lastSlash = objectPath.lastIndexOf('/');
    const dir = lastSlash === -1 ? '' : objectPath.slice(0, lastSlash);
    const file = lastSlash === -1 ? objectPath : objectPath.slice(lastSlash + 1);
    const dot = file.lastIndexOf('.');
    const stem = dot === -1 ? file : file.slice(0, dot);
    const resizedDir = dir ? `${dir}/${RESIZED_DIR}` : RESIZED_DIR;
    return THUMB_SIZES.map((s) => `${resizedDir}/${stem}_${s}x${s}.webp`);
}

/**
 * Collections holding member or staff data. Anything media-like inside them is
 * restricted regardless of the document's own fields.
 */
const RESTRICTED_COLLECTIONS = new Set([
    'research_folders', 'research_notes', 'members', 'mail', 'user_roles', 'notifications',
]);

/**
 * Field names that are staff-only wherever they appear, whatever the parent
 * document's visibility. Accession paperwork is the archive's donor and
 * provenance record; an item being public does not make its paperwork public.
 */
const RESTRICTED_FIELDS = new Set(['accession_paperwork_urls']);

/**
 * Prefixes where nothing is ever public, whether or not a document references it.
 *
 * Firestore attribution cannot cover an object no document points at, and five
 * orphaned scans under accession_paperwork/ — including one named "Archival
 * Paperwork.pdf" — still carried live download tokens after the first reconcile
 * run, because it only visited referenced objects. An item can be deleted or have
 * its paperwork replaced while the uploaded file stays behind.
 *
 * A prefix is the right tool for exactly this case: it needs no attribution. It is
 * deliberately narrow. archive_media/ orphans are left alone because their
 * visibility genuinely is ambiguous, and content_images/, posts/ and public/
 * belong to the sahs-website app, which uses the default Firestore database rather
 * than this one — they only look unreferenced from here, they are served purely by
 * token, and revoking those would break that site.
 */
const RESTRICTED_PREFIXES = ['accession_paperwork/'];

/**
 * A thumbnail's originating object path, or null if this is not a thumbnail.
 *
 * The inverse of thumbPathsFor. It cannot recover the original's extension —
 * scan.png and scan.jpg both produce scan_400x400.webp — so it returns the stem
 * and the caller matches it against paths it already holds.
 */
function originStemFor(thumbPath) {
    const match = thumbPath.match(new RegExp(`^(.*)/${RESIZED_DIR}/(.+)_(\\d+)x\\3\\.webp$`));
    if (!match) return null;
    return `${match[1]}/${match[2]}`;
}

/**
 * Every Storage URL reachable from a document, found structurally rather than by
 * a list of field names.
 *
 * The field list was the fragility worth removing. This database has 19
 * collections, and galleries, historic_figures, posts, rooms and site_settings all
 * carry media that an enumerated list had missed. A document that grows a new
 * image field is covered here without anyone remembering to update this script.
 */
function collectUrls(value, restricted, out) {
    if (value === null || value === undefined) return;

    if (typeof value === 'string') {
        const path = objectPathFromUrl(value);
        if (path) out.push({ path, restricted });
        return;
    }
    if (Array.isArray(value)) {
        for (const entry of value) collectUrls(entry, restricted, out);
        return;
    }
    if (typeof value === 'object') {
        for (const [key, entry] of Object.entries(value)) {
            collectUrls(entry, restricted || RESTRICTED_FIELDS.has(key), out);
        }
    }
}

/**
 * Builds the desired visibility for every object Firestore references.
 *
 * Restricted wins over public: if two documents disagree about the same object,
 * the safe reading is the restrictive one. That matters because featured_image_url
 * usually duplicates an entry in file_urls, and an item can sit in several
 * collections at once.
 */
async function desiredVisibility() {
    const db = admin.firestore();
    db.settings({ databaseId: DATABASE_ID });

    const want = new Map(); // objectPath -> 'public' | 'restricted'
    const mark = (path, restricted) => {
        if (want.get(path) === 'restricted') return; // never downgrade to public
        want.set(path, restricted ? 'restricted' : 'public');
    };

    // Which collections are private, so items inside them inherit it.
    const privateCollections = new Set();
    const collectionDocs = await db.collection('collections').get();
    collectionDocs.forEach((doc) => {
        if (doc.data().is_private === true) privateCollections.add(doc.id);
    });

    for (const ref of await db.listCollections()) {
        const snapshot = await ref.get();
        stats.docsRead += snapshot.size;
        const collectionIsRestricted = RESTRICTED_COLLECTIONS.has(ref.id);

        snapshot.forEach((doc) => {
            const data = doc.data();

            // An item is hidden by its own flag or by any collection holding it.
            const docIsRestricted = collectionIsRestricted
                || data.is_private === true
                || (data.collection_id && privateCollections.has(data.collection_id))
                || (Array.isArray(data.collection_ids)
                    && data.collection_ids.some((id) => privateCollections.has(id)));

            const found = [];
            collectUrls(data, Boolean(docIsRestricted), found);
            for (const { path, restricted } of found) mark(path, restricted);
        });
    }

    return want;
}

/**
 * Brings one object into line with its desired visibility.
 *
 * Takes the File from the bucket listing rather than a path, because that listing
 * is requested with projection=full and therefore already carries the ACL and the
 * custom metadata. Fetching them per object cost two round trips each, which at
 * ~16,000 objects ran past ten minutes and timed out — the same shape of mistake
 * as the backfill's silent exists() checks, and the same fix: the listing already
 * had the answer.
 */
async function applyTo(file, visibility) {
    const meta = file.metadata || {};
    const hasToken = Boolean(meta.metadata && meta.metadata.firebaseStorageDownloadTokens);
    const isPublic = (meta.acl || []).some(
        (entry) => entry.entity === 'allUsers' && String(entry.role).toUpperCase() === 'READER'
    );

    if (visibility === 'public') {
        if (isPublic) { stats.alreadyCorrect += 1; return; }
        if (VERBOSE) console.log(`  public   ${file.name}`);
        if (!DRY_RUN) await file.makePublic();
        stats.madePublic += 1;
        return;
    }

    // Restricted: strip the public ACL and the token. Either alone is a hole.
    if (!isPublic && !hasToken) { stats.alreadyCorrect += 1; return; }

    if (VERBOSE || hasToken) {
        console.log(`  restrict ${file.name}${hasToken ? '  (revoking download token)' : ''}`);
    }
    if (!DRY_RUN) {
        if (isPublic) await file.makePrivate();
        if (hasToken) {
            // Removing the key is what invalidates the token; the Firebase
            // download endpoint then falls through to the security rules.
            await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: null } });
        }
    }
    if (isPublic) stats.restricted += 1;
    if (hasToken) stats.tokensRevoked += 1;
}

/** Bounded pool so a write-heavy run isn't strictly sequential. */
async function runPool(items, concurrency, worker) {
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        for (;;) {
            const i = next++;
            if (i >= items.length) return;
            try {
                await worker(items[i]);
            } catch (err) {
                stats.failed += 1;
                console.error(`  FAILED ${items[i][0].name}: ${err.message}`);
            }
        }
    }));
}

async function main() {
    admin.initializeApp({ projectId: 'sahs-archives', storageBucket: BUCKET });
    const bucket = admin.storage().bucket();

    console.log(DRY_RUN ? 'DRY RUN — nothing will be changed\n' : 'Reconciling media visibility\n');

    process.stdout.write('reading Firestore... ');
    const want = await desiredVisibility();

    // Derived thumbnails inherit their original's visibility.
    for (const [path, visibility] of [...want]) {
        if (path.includes(`/${RESIZED_DIR}/`)) continue;
        for (const thumb of thumbPathsFor(path)) {
            if (!want.has(thumb)) want.set(thumb, visibility);
        }
    }

    for (const v of want.values()) {
        if (v === 'public') stats.shouldBePublic += 1; else stats.shouldBeRestricted += 1;
    }
    console.log(`${stats.docsRead} docs -> ${want.size} objects (${stats.shouldBePublic} public, ${stats.shouldBeRestricted} restricted)\n`);

    // projection=full returns each object's ACL and custom metadata inline, so the
    // whole run needs no per-object reads at all.
    process.stdout.write('listing bucket... ');
    const [allFiles] = await bucket.getFiles({ projection: 'full' });
    const filesByPath = new Map(allFiles.map((f) => [f.name, f]));
    const presentPaths = new Set(filesByPath.keys());
    console.log(`${presentPaths.size} objects\n`);

    // Objects no Firestore document points at. Mostly not touched — deciding their
    // visibility would be guessing — but anything under a never-public prefix is
    // restricted regardless, since that needs no attribution to decide.
    // Stems of every original Firestore references, so an orphaned thumbnail can be
    // told from one whose original is simply pending.
    const referencedStems = new Set();
    for (const path of want.keys()) {
        if (path.includes(`/${RESIZED_DIR}/`)) continue;
        const dot = path.lastIndexOf('.');
        referencedStems.add(dot === -1 ? path : path.slice(0, dot));
    }

    for (const name of presentPaths) {
        if (want.has(name)) continue;

        if (RESTRICTED_PREFIXES.some((prefix) => name.startsWith(prefix))) {
            want.set(name, 'restricted');
            stats.orphanRestricted += 1;
            continue;
        }

        // A thumbnail whose original no document references. The backfill calls
        // makePublic() on every variant it writes, and it skips media belonging to
        // non-public items — but an orphan belongs to no item at all, so it sails
        // through and gets a public 400px and 1000px rendering of an original that
        // is itself not public. Same invariant, opposite direction.
        const stem = originStemFor(name);
        if (stem && !referencedStems.has(stem)) {
            want.set(name, 'restricted');
            stats.orphanThumbs += 1;
            continue;
        }

        stats.unattributed += 1;
    }

    const entries = [];
    for (const [path, visibility] of want) {
        const file = filesByPath.get(path);
        if (!file) { stats.missing += 1; continue; }
        entries.push([file, visibility]);
    }

    console.log(`checking ${entries.length} objects...`);
    await runPool(entries, 8, ([file, visibility]) => applyTo(file, visibility));

    console.log('\n--- summary ---');
    console.log(`  firestore docs read     ${stats.docsRead}`);
    console.log(`  objects referenced      ${stats.shouldBePublic + stats.shouldBeRestricted}`);
    console.log(`    should be public      ${stats.shouldBePublic}`);
    console.log(`    should be restricted  ${stats.shouldBeRestricted}`);
    console.log(`  already correct         ${stats.alreadyCorrect}`);
    console.log(`  ${DRY_RUN ? 'would make public     ' : 'made public           '} ${stats.madePublic}`);
    console.log(`  ${DRY_RUN ? 'would restrict        ' : 'restricted            '} ${stats.restricted}`);
    console.log(`  ${DRY_RUN ? 'would revoke tokens   ' : 'tokens revoked        '} ${stats.tokensRevoked}`);
    console.log(`  referenced but absent   ${stats.missing}`);
    console.log(`  in bucket, unreferenced ${stats.unattributed}`);
    console.log(`  orphans in restricted prefixes ${stats.orphanRestricted}`);
    console.log(`  thumbnails of unreferenced originals ${stats.orphanThumbs}`);
    console.log(`  failed                  ${stats.failed}`);

    process.exit(stats.failed > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
