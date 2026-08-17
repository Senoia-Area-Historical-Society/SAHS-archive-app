/**
 * Resolves a displayable URL for media the public may not read.
 *
 * Restricted objects carry no public ACL and no Firebase download token, because
 * a token bypasses Storage security rules entirely. Removing it also removes the
 * client SDK's only route to the bytes: getDownloadURL() reads `downloadTokens`
 * from the object's metadata and throws `storage/no-download-url` when the field
 * is absent — it does not mint one. Tokens are created at upload and nowhere
 * else.
 *
 * So a curator opening a private item saw a broken image and an audio player
 * stuck at 0:00. The restrictedMediaUrl callable checks the caller is staff and
 * returns a signed URL that expires, which works for every media type rather
 * than only the ones whose component happens to implement a fallback.
 *
 * Results are cached per object path for slightly less than their lifetime, so a
 * page with several restricted files makes one call each rather than one per
 * render.
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { storageObjectPath } from './imageThumbs';

interface SignedUrlResponse {
    url: string;
    expiresInSeconds: number;
}

const cache = new Map<string, { url: string; expiresAt: number }>();
const inFlight = new Map<string, Promise<string | null>>();

/** Refresh a little before expiry so an in-progress load can't outlive the URL. */
const EXPIRY_MARGIN_MS = 60_000;

export function clearRestrictedMediaCache(): void {
    cache.clear();
    inFlight.clear();
}

/**
 * A signed URL for `storedUrl`, or null if it isn't ours or the caller isn't
 * entitled to it. Never throws: callers treat null as "leave the media broken",
 * which is the correct outcome for a signed-out visitor.
 */
export async function resolveRestrictedMedia(storedUrl: string): Promise<string | null> {
    const objectPath = storageObjectPath(storedUrl);
    if (!objectPath) return null;

    const hit = cache.get(objectPath);
    if (hit && hit.expiresAt > Date.now()) return hit.url;

    const pending = inFlight.get(objectPath);
    if (pending) return pending;

    const request = (async () => {
        try {
            const callable = httpsCallable<{ objectPath: string }, SignedUrlResponse>(
                functions,
                'restrictedMediaUrl'
            );
            const { data } = await callable({ objectPath });
            if (!data || !data.url) return null;
            cache.set(objectPath, {
                url: data.url,
                expiresAt: Date.now() + Math.max(0, data.expiresInSeconds * 1000 - EXPIRY_MARGIN_MS),
            });
            return data.url;
        } catch {
            // Signed out, not staff, or the object is genuinely gone. All three mean
            // "no URL for you", and none of them should surface as an error here.
            return null;
        } finally {
            inFlight.delete(objectPath);
        }
    })();

    inFlight.set(objectPath, request);
    return request;
}
