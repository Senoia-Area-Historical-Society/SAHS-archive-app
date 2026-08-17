/**
 * Derives thumbnail URLs for images held in Firebase Storage.
 *
 * Grid cards render at roughly 260x200 but were being served the original
 * archival scans — measured at up to 33 MB for a single 4374x6002 PNG, around a
 * thousand times more data than the cell needs. OptimizedImage exempted Storage
 * URLs from its resizing proxy ("load directly for maximum speed"), so the
 * optimizedWidth={400} that DocumentCard already passes had no effect.
 *
 * The storage-resize-images extension writes variants next to each original.
 * With MAKE_PUBLIC enabled those variants need no signature or download token,
 * so their URL can be derived here from the original's object path — which
 * matters because 37 of every 40 stored URLs are signed storage.googleapis.com
 * links whose signature cannot be reused for a different object.
 *
 * Deriving a URL does not guarantee the object exists: the extension only
 * processes uploads, so images predating it are covered by a backfill
 * (scripts/backfill-thumbnails.cjs). Until then the derived URL 404s and
 * OptimizedImage's existing onError handler falls back to the original, which
 * is exactly today's behaviour. That makes this change safe to deploy before
 * any thumbnail exists.
 */

const BUCKET = 'sahs-archives.firebasestorage.app';

/** Must match IMG_SIZES in extensions/storage-resize-images.env. */
export const THUMB_SIZES = [400, 1000] as const;

/** Must match RESIZED_IMAGES_PATH in that same file. */
const RESIZED_DIR = 'thumbs';

/**
 * Pull the object path out of either URL shape Storage hands out:
 *   https://storage.googleapis.com/<bucket>/<path>?GoogleAccessId=...
 *   https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<encoded path>?alt=media
 */
export function storageObjectPath(url: string): string | null {
    if (!url) return null;

    const gcs = url.match(/^https:\/\/storage\.googleapis\.com\/([^/]+)\/([^?]+)/);
    if (gcs && gcs[1] === BUCKET) {
        return safeDecode(gcs[2]);
    }

    const firebase = url.match(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/([^/]+)\/o\/([^?]+)/);
    if (firebase && firebase[1] === BUCKET) {
        return safeDecode(firebase[2]);
    }

    return null;
}

function safeDecode(value: string): string | null {
    try {
        return decodeURIComponent(value);
    } catch {
        // Malformed percent-encoding: fall back to the original image rather
        // than constructing a nonsense path.
        return null;
    }
}

/** Pick the smallest generated size that still covers the rendered width. */
function chooseSize(targetWidth: number): number {
    return THUMB_SIZES.find((size) => size >= targetWidth) ?? THUMB_SIZES[THUMB_SIZES.length - 1];
}

/**
 * "archive_media/scan.png" -> "archive_media/thumbs/scan_400x400.webp"
 *
 * Mirrors the extension's own naming: the original filename without its
 * extension, suffixed with the size, written into RESIZED_IMAGES_PATH beside
 * the original, converted to webp.
 */
export function thumbObjectPath(objectPath: string, targetWidth: number): string {
    const size = chooseSize(targetWidth);
    const lastSlash = objectPath.lastIndexOf('/');
    const dir = lastSlash === -1 ? '' : objectPath.slice(0, lastSlash);
    const file = lastSlash === -1 ? objectPath : objectPath.slice(lastSlash + 1);

    const dot = file.lastIndexOf('.');
    const stem = dot === -1 ? file : file.slice(0, dot);

    const resizedDir = dir ? `${dir}/${RESIZED_DIR}` : RESIZED_DIR;
    return `${resizedDir}/${stem}_${size}x${size}.webp`;
}

/** Public URL for a resized variant, or null if this isn't a Storage URL we own. */
export function thumbnailUrl(originalUrl: string, targetWidth: number): string | null {
    const objectPath = storageObjectPath(originalUrl);
    if (!objectPath) return null;

    // Already a thumbnail; don't nest.
    if (objectPath.includes(`/${RESIZED_DIR}/`)) return null;

    const path = thumbObjectPath(objectPath, targetWidth);
    // MAKE_PUBLIC=true, so no signature or token is required.
    return `https://storage.googleapis.com/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
}
