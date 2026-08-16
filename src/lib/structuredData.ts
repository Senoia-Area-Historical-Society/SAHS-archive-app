/**
 * JSON-LD structured data builders.
 *
 * Pure, like seo.ts — no React, no DOM — so the same output can be produced
 * server-side. `useJsonLd` handles injection.
 *
 * The archive already stores rich Dublin Core metadata (creator, date, subject,
 * rights, coverage, historical_address). Structured data is what makes that
 * legible to search engines: `Photograph`/`ImageObject` is what surfaces
 * archival material in Google Images, and `Person` entities can feed the
 * knowledge graph for local historical figures.
 */

import type { ArchiveItem, Collection, LibraryBook, ItemType } from '../types/database';
import { SITE_URL, DEFAULT_SITE_NAME, absoluteUrl, describeItem } from './seo';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = Record<string, any>;

/**
 * Normalize the free-text dates in Firestore to ISO 8601, which schema.org
 * requires. The archive contains "2013", "07/16/1882", "2010-01-01" and "".
 * Anything that can't be confidently normalized is omitted — an invalid date
 * produces a Search Console structured-data error, which is worse than a
 * missing optional property.
 */
export function toSchemaDate(value: string | null | undefined): string | undefined {
    if (!value) return undefined;
    const raw = value.trim();
    if (raw === '') return undefined;

    // Already ISO: YYYY, YYYY-MM, or YYYY-MM-DD
    if (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(raw)) return raw;

    // US-style MM/DD/YYYY or M/D/YYYY
    const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (us) {
        const [, m, d, y] = us;
        const month = Number(m);
        const day = Number(d);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
        return undefined;
    }

    // A bare 4-digit year embedded in other text, e.g. "circa 1910"
    const year = raw.match(/\b(1[6-9]\d{2}|20\d{2})\b/);
    return year ? year[1] : undefined;
}

/** Drop null/undefined/empty values so we never emit empty JSON-LD properties. */
function compact(obj: Json): Json {
    const out: Json = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value === null || value === undefined) continue;
        if (typeof value === 'string' && value.trim() === '') continue;
        if (Array.isArray(value) && value.length === 0) continue;
        out[key] = value;
    }
    return out;
}

/** Map the archive's own taxonomy onto schema.org types. */
function schemaTypeFor(itemType: ItemType | undefined, artifactType?: string | null): string {
    switch (itemType) {
        case 'Historic Figure':
            return 'Person';
        case 'Historic Organization':
            return 'Organization';
        case 'Oral History':
            return 'AudioObject';
        case 'Document':
            // Photographs are catalogued as Documents but tagged as photos;
            // Photograph is the type that surfaces in Google Images.
            return /photo/i.test(artifactType || '') ? 'Photograph' : 'CreativeWork';
        case 'Artifact':
            return /photo/i.test(artifactType || '') ? 'Photograph' : 'CreativeWork';
        default:
            return 'CreativeWork';
    }
}

/** Sitewide publisher reference, used by every content node. */
function publisherRef(siteName: string): Json {
    return {
        '@type': 'Organization',
        name: siteName,
        url: SITE_URL,
    };
}

export function buildOrganizationJsonLd(siteName: string = DEFAULT_SITE_NAME): Json {
    return {
        '@context': 'https://schema.org',
        '@type': 'Museum',
        name: siteName,
        url: SITE_URL,
        logo: `${SITE_URL}/logo2.png`,
        description:
            'The Senoia Area Historical Society preserves and shares the history of Senoia and Coweta County, Georgia through a digital archive of photographs, documents, artifacts and oral histories.',
        address: {
            '@type': 'PostalAddress',
            addressLocality: 'Senoia',
            addressRegion: 'GA',
            addressCountry: 'US',
        },
    };
}

/**
 * WebSite node.
 *
 * Deliberately no `potentialAction`/`SearchAction`: a sitelinks search box
 * requires the search results URL to be crawlable, and robots.txt disallows
 * /search because those pages are permutations of content already indexable at
 * its canonical URL. Declaring an action against a disallowed path is inert at
 * best and can be reported as an error, so we keep the disallow and drop the
 * action rather than opening /search to crawlers for a cosmetic feature.
 */
export function buildWebSiteJsonLd(siteName: string = DEFAULT_SITE_NAME): Json {
    return {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: `${siteName} Digital Archive`,
        url: SITE_URL,
        publisher: publisherRef(siteName),
    };
}

export interface Crumb {
    name: string;
    path: string;
}

export function buildBreadcrumbJsonLd(crumbs: Crumb[]): Json {
    return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: crumbs.map((crumb, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: crumb.name,
            item: absoluteUrl(crumb.path),
        })),
    };
}

export function buildItemJsonLd(
    item: Partial<ArchiveItem> & { id?: string },
    siteName: string = DEFAULT_SITE_NAME
): Json {
    const type = schemaTypeFor(item.item_type, item.artifact_type);
    const url = item.id ? absoluteUrl(`/items/${item.id}`) : undefined;
    const image = item.featured_image_url || item.file_urls?.[0];

    // Subject keywords: the Dublin Core `subject` plus curator tags.
    const keywords = [item.subject, ...(item.tags || [])]
        .filter((k): k is string => typeof k === 'string' && k.trim() !== '')
        .join(', ');

    const base: Json = {
        '@context': 'https://schema.org',
        '@type': type,
        name: item.title,
        description: describeItem(item),
        url,
        image,
        identifier: item.archive_reference || item.identifier,
        keywords,
        isPartOf: {
            '@type': 'Collection',
            name: `${siteName} Digital Archive`,
            url: SITE_URL,
        },
    };

    if (type === 'Person') {
        return compact({
            ...base,
            name: item.full_name || item.title,
            alternateName: item.also_known_as,
            birthDate: toSchemaDate(item.birth_date),
            deathDate: toSchemaDate(item.death_date),
            birthPlace: item.birthplace,
            jobTitle: item.occupation,
            // Person has no publisher/dateCreated; those belong to the record.
            publisher: undefined,
        });
    }

    if (type === 'Organization') {
        return compact({
            ...base,
            name: item.org_name || item.title,
            alternateName: item.alternative_names,
            foundingDate: toSchemaDate(item.founding_date),
            dissolutionDate: toSchemaDate(item.dissolved_date),
        });
    }

    return compact({
        ...base,
        creator: item.creator ? { '@type': 'Person', name: item.creator } : undefined,
        dateCreated: toSchemaDate(item.date),
        contentLocation: item.historical_address
            ? { '@type': 'Place', name: item.historical_address }
            : undefined,
        license: item.rights,
        inLanguage: item.language || 'en',
        material: item.format,
        publisher: publisherRef(siteName),
        text: item.transcription || undefined,
    });
}

export function buildCollectionJsonLd(
    collection: Partial<Collection> & { id?: string },
    siteName: string = DEFAULT_SITE_NAME
): Json {
    return compact({
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: collection.title,
        description: collection.description,
        url: collection.id ? absoluteUrl(`/collections/${collection.id}`) : undefined,
        image: collection.featured_image_url,
        publisher: publisherRef(siteName),
    });
}

export function buildBookJsonLd(
    book: Partial<LibraryBook> & { id?: string },
    siteName: string = DEFAULT_SITE_NAME
): Json {
    const authors = (book.authors || []).filter(Boolean);

    return compact({
        '@context': 'https://schema.org',
        '@type': 'Book',
        name: book.title,
        description: book.description,
        url: book.id ? absoluteUrl(`/library/${book.id}`) : undefined,
        image: book.cover_image_url,
        author: authors.length
            ? authors.map((name) => ({ '@type': 'Person', name }))
            : undefined,
        publisher: book.publisher
            ? { '@type': 'Organization', name: book.publisher }
            : undefined,
        datePublished: toSchemaDate(
            book.publish_year != null ? String(book.publish_year) : undefined
        ),
        isbn: book.isbn,
        about: book.subjects,
        // The physical shelf reference within the reference library.
        identifier: book.call_number || book.accession_number,
        inLanguage: 'en',
        isPartOf: {
            '@type': 'Collection',
            name: `${siteName} Reference Library`,
            url: `${SITE_URL}/library`,
        },
    });
}
