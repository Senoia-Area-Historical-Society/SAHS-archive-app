/**
 * The media-visibility decisions behind functions/mediaVisibility.js, as pure
 * functions.
 *
 * DELIBERATELY FREE OF IMPORTS so `src/test/` can exercise them — same split, and
 * same reason, as functions/collectionPrivacyRules.js.
 *
 * The invariant is the one scripts/reconcile-media-visibility.cjs enforces across
 * the whole bucket: an object is publicly readable if and only if the document
 * that references it is publicly visible, and a derived thumbnail shares its
 * original's visibility. These are that script's rules applied to a single item,
 * so the item's media changes when the item does rather than at the next
 * fortnightly run. Keep the two in step.
 */

/** Must match RESIZED_IMAGES_PATH in extensions/storage-resize-images.env. */
const RESIZED_DIR = "thumbs";

/** Must match IMG_SIZES in extensions/storage-resize-images.env. */
const THUMB_SIZES = [400, 1000];

/**
 * The only prefixes this code will ever touch. Anything else in the bucket —
 * notably the sahs-website app's content_images/, posts/ and public/, which are
 * served purely by token — is left alone, as the reconcile script leaves it.
 */
const MANAGED_PREFIXES = [
    "archive_media/",
    "additional_media/",
    "collections/",
    "portraits/",
    "site_assets/",
    "library_covers/",
    "accession_paperwork/",
];

/** Never public, whatever references them. */
const NEVER_PUBLIC_PREFIXES = ["accession_paperwork/"];

/** Fields that are staff-only wherever they appear. Mirrors RESTRICTED_FIELDS. */
const RESTRICTED_FIELDS = new Set(["accession_paperwork_urls"]);

/**
 * Prefixes the resize extension processes. Must match INCLUDE_PATH_LIST in
 * extensions/storage-resize-images.env.
 */
const RESIZED_PREFIXES = ["archive_media/", "collections/", "additional_media/", "site_assets/"];

function safeDecode(v) {
    try { return decodeURIComponent(v); } catch { return null; }
}

/**
 * The object path in `bucket` that a stored URL points at, or null if it is not a
 * Storage URL for that bucket. Both URL shapes Storage hands out are recognised.
 */
function objectPathFromUrl(url, bucket) {
    if (!url || typeof url !== "string") return null;
    const firebase = url.match(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/([^/]+)\/o\/([^?#]+)/);
    if (firebase) return firebase[1] === bucket ? safeDecode(firebase[2]) : null;
    const gcs = url.match(/^https:\/\/storage\.googleapis\.com\/([^/]+)\/([^?#]+)/);
    if (gcs) return gcs[1] === bucket ? safeDecode(gcs[2]) : null;
    return null;
}

function isThumbPath(path) {
    return path.includes(`/${RESIZED_DIR}/`) || path.startsWith(`${RESIZED_DIR}/`);
}

/** "archive_media/scan.png" -> its 400px and 1000px webp variants. */
function thumbPathsFor(objectPath) {
    const lastSlash = objectPath.lastIndexOf("/");
    const dir = lastSlash === -1 ? "" : objectPath.slice(0, lastSlash);
    const file = lastSlash === -1 ? objectPath : objectPath.slice(lastSlash + 1);
    const dot = file.lastIndexOf(".");
    const stem = dot === -1 ? file : file.slice(0, dot);
    const resizedDir = dir ? `${dir}/${RESIZED_DIR}` : RESIZED_DIR;
    return THUMB_SIZES.map((s) => `${resizedDir}/${stem}_${s}x${s}.webp`);
}

/** Whether the resize extension would produce thumbnails for this original. */
function expectsThumbnails(objectPath, contentType) {
    return typeof contentType === "string" &&
        contentType.startsWith("image/") &&
        !isThumbPath(objectPath) &&
        RESIZED_PREFIXES.some((p) => objectPath.startsWith(p));
}

function collectPaths(value, restricted, bucket, out) {
    if (value === null || value === undefined) return;
    if (typeof value === "string") {
        const path = objectPathFromUrl(value, bucket);
        if (path) out.push({ path, restricted });
        return;
    }
    if (Array.isArray(value)) {
        for (const entry of value) collectPaths(entry, restricted, bucket, out);
        return;
    }
    if (typeof value === "object") {
        for (const [key, entry] of Object.entries(value)) {
            collectPaths(entry, restricted || RESTRICTED_FIELDS.has(key), bucket, out);
        }
    }
}

/**
 * Desired visibility for every object an item document references, plus the
 * thumbnails derived from them, as a Map of path -> "public" | "restricted".
 *
 * Found structurally, as the reconcile script does, so a new media field is
 * covered without anyone remembering to list it. Public only when the item's
 * effective `is_private` is exactly false — the same test firestore.rules
 * applies — so a document missing the field keeps its media restricted.
 * Restricted wins when one path is referenced twice.
 */
function mediaTargets(data, bucket) {
    const itemIsPublic = data.is_private === false;
    const found = [];
    collectPaths(data, false, bucket, found);

    const want = new Map();
    const mark = (path, restricted) => {
        if (!MANAGED_PREFIXES.some((p) => path.startsWith(p))) return;
        const isRestricted = restricted || NEVER_PUBLIC_PREFIXES.some((p) => path.startsWith(p));
        if (want.get(path) === "restricted") return;
        want.set(path, isRestricted ? "restricted" : "public");
    };

    for (const { path, restricted } of found) mark(path, restricted || !itemIsPublic);
    for (const [path, visibility] of [...want]) {
        if (isThumbPath(path)) continue;
        for (const thumb of thumbPathsFor(path)) mark(thumb, visibility === "restricted");
    }
    return want;
}

/**
 * A stable fingerprint of `mediaTargets`, so the trigger can skip the many item
 * writes that change neither the media nor the item's visibility.
 */
function mediaSignature(data, bucket) {
    return JSON.stringify([...mediaTargets(data, bucket)].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/**
 * What to do to one object, given its current state.
 *
 * Restricting needs two things, as the reconcile script explains: no public ACL,
 * and no Firebase download token, because a token bypasses security rules
 * entirely. Making public needs only the ACL; tokens on public objects are left
 * alone.
 */
function visibilityActions(visibility, isPublic, hasToken) {
    if (visibility === "public") return { makePublic: !isPublic, makePrivate: false, revokeToken: false };
    return { makePublic: false, makePrivate: isPublic, revokeToken: hasToken };
}

module.exports = {
    RESIZED_DIR,
    THUMB_SIZES,
    objectPathFromUrl,
    thumbPathsFor,
    isThumbPath,
    expectsThumbnails,
    mediaTargets,
    mediaSignature,
    visibilityActions,
};
