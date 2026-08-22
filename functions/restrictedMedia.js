/**
 * Issues short-lived signed URLs for media the public may not read.
 *
 * Restricted objects have no public ACL and, deliberately, no Firebase download
 * token — a token bypasses Storage security rules entirely, so leaving one in
 * place meant staff-only accession paperwork was anonymously downloadable by
 * anyone holding the URL.
 *
 * Removing the token also removes the only way the client SDK can read the
 * object. getDownloadURL() does NOT mint one: it reads `downloadTokens` from the
 * object's metadata and throws `storage/no-download-url` when the field is
 * absent (see downloadUrlFromResourceString in @firebase/storage). Tokens are
 * created at upload time and nowhere else. So a curator viewing a private item
 * got a broken image and an audio player stuck at 0:00.
 *
 * A signed URL is the right credential for this: it is minted server-side after
 * the caller's identity is checked, it expires, and it works for any media type
 * — image, audio, PDF — which per-component fallbacks in the UI never could.
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { randomUUID } = require("node:crypto");

/** Mirrors isSAHSUser() in storage.rules and the app's AuthContext. */
function isSAHSUser(auth) {
    const email = auth && auth.token && auth.token.email;
    if (!email) return false;
    // A role granted via Admin Settings (mirrored onto the token by
    // functions/userRoles.js) covers any email, not just the domain below.
    if (auth.token.role === "admin" || auth.token.role === "curator") return true;
    if (auth.token.email_verified === false) return false;
    return /@senoiahistory\.com$/i.test(email);
}

/**
 * Paths this function will ever sign. Anything outside them is refused, so a
 * compromised or careless caller cannot use it as a generic read oracle for the
 * whole bucket.
 */
const SIGNABLE_PREFIXES = [
    "archive_media/",
    "additional_media/",
    "accession_paperwork/",
    "collections/",
    "portraits/",
    "site_assets/",
];

const MAX_AGE_MS = 15 * 60 * 1000;

exports.restrictedMediaUrl = onCall({
    memory: "256MiB",
    timeoutSeconds: 30,
    maxInstances: 10,
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be signed in.");
    }
    if (!isSAHSUser(request.auth)) {
        throw new HttpsError("permission-denied", "Restricted media is available to archive staff only.");
    }

    const objectPath = request.data && request.data.objectPath;
    if (typeof objectPath !== "string" || !objectPath) {
        throw new HttpsError("invalid-argument", "Missing objectPath.");
    }
    // Reject traversal and absolute forms outright rather than normalising them.
    if (objectPath.includes("..") || objectPath.startsWith("/")) {
        throw new HttpsError("invalid-argument", "Malformed objectPath.");
    }
    if (!SIGNABLE_PREFIXES.some((prefix) => objectPath.startsWith(prefix))) {
        throw new HttpsError("invalid-argument", "That path is not signable.");
    }

    const file = admin.storage().bucket().file(objectPath);
    const [exists] = await file.exists();
    if (!exists) {
        throw new HttpsError("not-found", "No such object.");
    }

    // Preferred: a V4 signed URL. It expires on its own and leaves nothing behind
    // on the object.
    //
    // This needs the runtime service account to hold iam.serviceAccounts.signBlob
    // on itself, which is NOT granted by default — Cloud Functions v2 runs as the
    // Compute Engine default service account. Rather than fail closed and leave
    // curators looking at broken media until someone notices an IAM error in the
    // logs, fall back to minting a download token.
    try {
        const [url] = await file.getSignedUrl({
            action: "read",
            expires: Date.now() + MAX_AGE_MS,
            version: "v4",
        });
        return { url, expiresInSeconds: MAX_AGE_MS / 1000, mode: "signed" };
    } catch (err) {
        logger.warn(
            `Could not sign ${objectPath} (${err.message}); falling back to a download token. ` +
            "Grant roles/iam.serviceAccountTokenCreator to this function's service account to use signed URLs."
        );
    }

    // Fallback: mint a fresh download token and hand back the tokenised URL.
    //
    // Weaker than a signed URL — a token does not expire and bypasses storage
    // rules — but it is bounded in a way the old situation was not. Only staff can
    // obtain one, it is never written to Firestore, and
    // scripts/reconcile-media-visibility.cjs strips it again on its next run. That
    // is the "mint on demand, revoke on reconcile" cycle.
    try {
        const token = randomUUID();
        await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
        const bucketName = file.bucket.name;
        const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
        return { url, expiresInSeconds: MAX_AGE_MS / 1000, mode: "token" };
    } catch (err) {
        logger.error(`Failed to produce a URL for ${objectPath}:`, err);
        throw new HttpsError("internal", "Could not produce a URL for that object.");
    }
});
