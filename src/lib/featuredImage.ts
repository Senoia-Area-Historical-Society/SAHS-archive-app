/**
 * Keeps an item's or collection's featured image pointing at something real.
 *
 * The edit forms track the featured image by the URL they preview it with, and a
 * file that has not been uploaded yet is previewed with a `blob:` object URL. That
 * URL exists only in the tab that made it. Two bugs let one reach Firestore as
 * `featured_image_url`: removing a newly added featured file left its `blob:` URL
 * selected, and Edit Collection read the featured URL back from React state that
 * the upload had not yet updated. Either way every visitor got a broken image.
 */

/** True for a URL that only this browser tab can load — a preview, not a stored file. */
export function isLocalPreviewUrl(url: string | null | undefined): boolean {
    return !!url && /^(blob|data):/i.test(url.trim());
}

/**
 * The featured image after one image is removed from the gallery.
 *
 * Removing any other image leaves the choice alone. Removing the featured one falls
 * back to the first image left, or to none — rather than to a URL that no longer
 * belongs to the item.
 */
export function featuredAfterRemoval(
    featured: string | null,
    removedUrl: string | null | undefined,
    remainingUrls: (string | null | undefined)[],
): string | null {
    if (!featured || featured !== removedUrl) return featured;
    return remainingUrls.find((url): url is string => !!url) ?? null;
}

/**
 * The value to store as `featured_image_url`, given the URLs actually saved.
 *
 * A stored URL is kept as it is. A local preview URL is never stored: if the upload
 * loop did not swap it for its download URL, the first saved image stands in.
 */
export function featuredUrlForSave(
    featured: string | null | undefined,
    savedUrls: string[],
): string | null {
    if (!featured) return null;
    if (!isLocalPreviewUrl(featured)) return featured;
    return savedUrls.find((url) => !!url && !isLocalPreviewUrl(url)) ?? null;
}

/**
 * Add Item tracks the featured image by its position in the file list. Removing an
 * image before it shifts it one place left, so the index has to follow; removing
 * the featured image itself falls back to the first one.
 */
export function featuredIndexAfterRemoval(featuredIndex: number, removedIndex: number): number {
    if (removedIndex < featuredIndex) return featuredIndex - 1;
    if (removedIndex === featuredIndex) return 0;
    return featuredIndex;
}
