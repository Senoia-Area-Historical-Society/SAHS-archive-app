import { useState, useMemo } from 'react';
import { thumbnailUrl, publicMediaUrl } from '../lib/imageThumbs';
import { resolveRestrictedMedia } from '../lib/restrictedMedia';

interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    src: string;
    alt: string;
    optimizedWidth?: number;
    quality?: number;
    priority?: boolean;
}

/**
 * URLs to try, cheapest and most-correct first.
 *
 * Each step exists for a reason:
 *
 *  1. The resized variant. A grid cell rendering at ~260px used to download the
 *     full archival scan — up to 33 MB. Missing until the backfill reaches it.
 *  2. The original by object ACL. This is the form that reflects whether the
 *     object is actually public, because visibility now lives in the ACL rather
 *     than in a blanket storage.rules `allow read: if true`.
 *  3. The stored URL. Still carries a permanent download token for public
 *     objects, so it works — but a token bypasses security rules, which is why
 *     the app should not depend on it and why restricted objects no longer have
 *     one. Kept as a safety net for anything the reconcile script has not
 *     covered.
 *
 * If all three fail the image is restricted, and a signed-in curator gets a
 * fresh authenticated URL instead — see requestAuthorisedUrl.
 */
function candidateSources(src: string, optimizedWidth: number, quality: number): string[] {
    if (!src) return [];

    const thumb = thumbnailUrl(src, optimizedWidth);
    if (thumb) {
        const original = publicMediaUrl(src);
        return original ? [thumb, original, src] : [thumb, src];
    }

    // googleusercontent images are already served at sensible sizes and aren't
    // ours to resize.
    const isGoogleHosted = src.includes('firebasestorage.googleapis.com') ||
                           src.includes('storage.googleapis.com') ||
                           src.includes('googleusercontent.com');

    if (src.startsWith('http') && !src.includes('images.weserv.nl') && !isGoogleHosted) {
        return [`https://images.weserv.nl/?url=${encodeURIComponent(src)}&w=${optimizedWidth}&q=${quality}&output=webp&fit=cover`, src];
    }
    return [src];
}

export function OptimizedImage({ src, alt, optimizedWidth = 400, quality = 80, priority = false, ...props }: OptimizedImageProps) {
    const derived = useMemo(
        () => candidateSources(src, optimizedWidth, quality),
        [src, optimizedWidth, quality]
    );

    // Extra candidates obtained at runtime (an authorised URL), and how many of the
    // list has already failed.
    const [extra, setExtra] = useState<string[]>([]);
    const [failed, setFailed] = useState(0);
    // The authorised-URL call is made at most once per src.
    const [requested, setRequested] = useState(false);

    // Reset when the image changes, by comparing against the previous render rather
    // than resetting from an effect.
    //
    // The previous version reset the index inside a useEffect, which is the pattern
    // react-hooks/set-state-in-effect flags on this file. The race it allows is
    // real — onError can fire before React flushes the mount effect, and because a
    // failed <img> whose src string does not change is never re-requested, a reset
    // at that moment would strand the element on a URL it already knows is dead —
    // but it is a latent hazard rather than something observed here. Comparing
    // against the previous render removes the window entirely and costs nothing.
    const [seenSrc, setSeenSrc] = useState(src);
    if (seenSrc !== src) {
        setSeenSrc(src);
        setExtra([]);
        setFailed(0);
        setRequested(false);
    }

    if (!src) return null;

    const sources = [...derived, ...extra];
    const index = Math.min(failed, sources.length - 1);

    /**
     * Last resort for restricted media. Restricted objects have no public ACL and
     * no download token, so every candidate above 403s even for staff.
     *
     * This previously called getDownloadURL(), which cannot work: that reads
     * `downloadTokens` from the object's metadata and throws when the field is
     * absent — it does not mint one. Revoking the token is exactly what made it
     * absent, so a curator got a broken image and the error was swallowed here.
     * A Cloud Function checks the caller is staff and returns a signed URL that
     * expires.
     */
    const requestAuthorisedUrl = async () => {
        const url = await resolveRestrictedMedia(src);
        if (!url) return;
        // Advancing the counter alongside appending is the point: index is derived
        // from `failed`, so adding a candidate without it left the element pinned to
        // the exhausted stored URL while the working one sat unused at the end of
        // the list. The audio player had no chain to get wrong, which is why it
        // recovered and this did not.
        setExtra((prev) => (prev.includes(url) ? prev : [...prev, url]));
        setFailed((prev) => prev + 1);
    };

    return (
        <img
            src={sources[index] ?? src}
            alt={alt}
            onError={() => {
                if (index < sources.length - 1) {
                    setFailed(failed + 1);
                } else if (!requested) {
                    setRequested(true);
                    void requestAuthorisedUrl();
                }
            }}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            {...(priority ? ({ fetchpriority: 'high' } as any) : {})}
            {...props}
        />
    );
}
