/**
 * SEO metadata derivation.
 *
 * Deliberately free of React and DOM references: these builders describe *what*
 * the metadata for a page should be, not how it gets applied. `useSeo` applies
 * them in the browser, and a server-side crawler renderer can import the same
 * functions without a `document`.
 */

import type { ArchiveItem, Collection, LibraryBook } from '../types/database';

/**
 * The archive's public origin, for canonical, og and JSON-LD URLs. Set per
 * deployment at build time (SITE_URL, scripts/site-url.cjs); without it the
 * browser uses the origin it was served from, and server-side code gets ''.
 */
export const SITE_URL: string =
    __SITE_URL__ || (globalThis as { location?: { origin?: string } }).location?.origin || '';

/** Only until a museum's name is known. Real names come from site_settings/appearance. */
export const DEFAULT_SITE_NAME = 'Digital Archive';

export const DEFAULT_DESCRIPTION =
    'Explore this digital archive of photographs, documents, oral histories, and artifacts.';

/**
 * What a shared link shows when its page has no image of its own (SITE_OG_IMAGE):
 * a full URL, or a path on SITE_URL. Unset, such a link has no image rather than
 * another museum's.
 */
export const DEFAULT_OG_IMAGE: string | undefined = !__SITE_OG_IMAGE__
    ? undefined
    : /^https?:\/\//.test(__SITE_OG_IMAGE__)
        ? __SITE_OG_IMAGE__
        : `${SITE_URL}${__SITE_OG_IMAGE__.startsWith('/') ? '' : '/'}${__SITE_OG_IMAGE__}`;

/** Google truncates around 155-160 characters; titles around 60. */
const DESCRIPTION_MAX = 155;
const TITLE_MAX = 60;

export interface SeoMeta {
    title: string;
    description: string;
    /** Absolute URL. Omitted for noindex pages, which should not assert a canonical. */
    canonical?: string;
    image?: string;
    type?: 'website' | 'article';
    noindex?: boolean;
}

/**
 * Trim to a whole word within `max`, adding an ellipsis only when text was
 * actually removed. Collapses whitespace so multi-line Firestore descriptions
 * don't produce ragged meta tags.
 */
export function truncate(text: string, max: number): string {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length <= max) return clean;

    const cut = clean.slice(0, max - 1);
    const lastSpace = cut.lastIndexOf(' ');
    // Fall back to a hard cut if there's no sensible word boundary.
    return `${(lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Absolute URL for a site-relative path. */
export function absoluteUrl(path: string): string {
    return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/** "Page Title | Museum Name", trimming the page part if long. */
export function formatTitle(pageTitle: string | undefined, siteName: string): string {
    if (!pageTitle || pageTitle.trim() === '') return siteName;
    return `${truncate(pageTitle, TITLE_MAX)} | ${siteName}`;
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | undefined {
    for (const value of values) {
        if (value && value.trim() !== '') return value.trim();
    }
    return undefined;
}

/**
 * Build a human-readable description for an archive item.
 *
 * Prefers the curator's description, then falls back to composing one from the
 * Dublin Core fields so that items with sparse metadata still get something
 * more useful than the site default.
 */
export function describeItem(item: Partial<ArchiveItem>, siteName: string = DEFAULT_SITE_NAME): string {
    const described = firstNonEmpty(item.description, item.transcription);
    if (described) return truncate(described, DESCRIPTION_MAX);

    const parts = [
        firstNonEmpty(item.item_type, 'Item'),
        item.date ? `dated ${item.date}` : undefined,
        item.creator ? `by ${item.creator}` : undefined,
        item.historical_address ? `at ${item.historical_address}` : undefined,
    ].filter(Boolean);

    return truncate(
        `${parts.join(' ')} from the ${siteName} archive.`,
        DESCRIPTION_MAX
    );
}

export function buildItemSeo(
    item: Partial<ArchiveItem> & { id?: string },
    siteName: string = DEFAULT_SITE_NAME
): SeoMeta {
    const name = firstNonEmpty(item.title, item.full_name, item.org_name) ?? 'Archive Item';

    return {
        title: formatTitle(name, siteName),
        description: describeItem(item, siteName),
        canonical: item.id ? absoluteUrl(`/items/${item.id}`) : undefined,
        image: firstNonEmpty(item.featured_image_url, item.file_urls?.[0]) ?? DEFAULT_OG_IMAGE,
        type: 'article',
        // Private items are readable only by staff; keep them out of the index.
        noindex: item.is_private === true,
    };
}

export function buildCollectionSeo(
    collection: Partial<Collection> & { id?: string },
    siteName: string = DEFAULT_SITE_NAME
): SeoMeta {
    const name = firstNonEmpty(collection.title) ?? 'Collection';
    const count = collection.item_count;

    const description = firstNonEmpty(collection.description)
        ?? `${name} — a curated collection${count ? ` of ${count} items` : ''} in the ${siteName} digital archive.`;

    return {
        title: formatTitle(name, siteName),
        description: truncate(description, DESCRIPTION_MAX),
        canonical: collection.id ? absoluteUrl(`/collections/${collection.id}`) : undefined,
        image: firstNonEmpty(collection.featured_image_url) ?? DEFAULT_OG_IMAGE,
        type: 'website',
        noindex: collection.is_private === true,
    };
}

export function buildBookSeo(
    book: Partial<LibraryBook> & { id?: string },
    siteName: string = DEFAULT_SITE_NAME
): SeoMeta {
    const name = firstNonEmpty(book.title) ?? 'Library Book';
    const authors = book.authors?.filter(Boolean).join(', ');

    const description = firstNonEmpty(book.description)
        ?? [
            name,
            authors ? `by ${authors}` : undefined,
            book.publish_year ? `(${book.publish_year})` : undefined,
            `— from the ${siteName} reference library.`,
        ].filter(Boolean).join(' ');

    return {
        title: formatTitle(name, siteName),
        description: truncate(description, DESCRIPTION_MAX),
        canonical: book.id ? absoluteUrl(`/library/${book.id}`) : undefined,
        image: firstNonEmpty(book.cover_image_url) ?? DEFAULT_OG_IMAGE,
        type: 'article',
    };
}

/** Static/browse pages: a title, a description, and a fixed path. */
export function buildPageSeo(
    pageTitle: string | undefined,
    description: string,
    path: string,
    siteName: string = DEFAULT_SITE_NAME
): SeoMeta {
    return {
        title: formatTitle(pageTitle, siteName),
        description: truncate(description, DESCRIPTION_MAX),
        canonical: absoluteUrl(path),
        type: 'website',
        image: DEFAULT_OG_IMAGE,
    };
}
