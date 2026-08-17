/**
 * Response shapes for the three ISBN lookup sources the book forms fall through.
 *
 * AddBook and EditBook run the same cascade — Open Library, then Google Books,
 * then our own `lookupIsbnFallback` function scraping isbnsearch.org — so the
 * shapes live here rather than being declared twice.
 *
 * Every field is optional, and deliberately so. These are third-party responses
 * we neither control nor validate: a record can be missing a publisher, a cover,
 * or an author list, and the forms already guard each read. Describing them as
 * required would be a more confident type that was less true.
 *
 * Each interface covers only the fields the forms actually read. That is the
 * point — an unlisted field becomes a compile error rather than silently
 * resolving to `any` and being read as undefined at runtime.
 */

/** Open Library returns authors, publishers and subjects as named objects. */
export interface NamedEntry {
    name: string;
}

/** Google Books `volumeInfo`. Authors and categories are plain strings here. */
export interface GoogleBookInfo {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    categories?: string[];
    imageLinks?: {
        thumbnail?: string;
        smallThumbnail?: string;
    };
}

/** What the `lookupIsbnFallback` Cloud Function returns in its `book` field. */
export interface FallbackBookInfo {
    title?: string;
    /** Already joined into a display string by the function, unlike the others. */
    authors?: string;
    publisher?: string;
    publishYear?: string | number;
    coverUrl?: string;
}
