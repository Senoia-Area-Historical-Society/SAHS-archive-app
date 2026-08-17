import { useState, useMemo } from 'react';
import { ref, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';
import { thumbnailUrl, publicMediaUrl, storageObjectPath } from '../lib/imageThumbs';

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
    }

    if (!src) return null;

    const sources = [...derived, ...extra];
    const index = Math.min(failed, sources.length - 1);

    /**
     * Last resort for restricted media. The reconcile script strips the download
     * token from anything non-public, so the stored URL 403s even for staff. This
     * asks Storage for a URL now, which is checked against storage.rules for the
     * signed-in user — so it succeeds for a curator and fails for everyone else.
     *
     * It does mint a fresh token on the object. That token is never written to
     * Firestore, and the next reconcile run revokes it: mint on demand, revoke on
     * reconcile.
     */
    const requestAuthorisedUrl = async () => {
        const objectPath = storageObjectPath(src);
        if (!objectPath) return;
        try {
            const url = await getDownloadURL(ref(storage, objectPath));
            setExtra((prev) => (prev.includes(url) ? prev : [...prev, url]));
        } catch {
            // Not signed in, or not a curator. Leave the broken image; the caller's
            // own placeholder handling applies.
        }
    };

    return (
        <img
            src={sources[index] ?? src}
            alt={alt}
            onError={() => {
                if (failed < derived.length - 1 + extra.length) {
                    setFailed(failed + 1);
                } else {
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
