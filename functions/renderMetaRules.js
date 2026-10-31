/**
 * The decisions behind functions/renderMeta.js, as plain data and pure functions.
 *
 * DELIBERATELY FREE OF IMPORTS so `src/test/` can exercise them — the same split
 * as collectionPrivacyRules.js / collectionPrivacy.js. renderMeta.js pulls in
 * firebase-functions and firebase-admin, which the site build cannot follow.
 */

/**
 * How long Firebase's CDN may serve a rendered page without asking renderMeta.
 *
 * This was `s-maxage=3600, stale-while-revalidate=86400`. The page embeds the
 * item's title, description and image URL, so when a curator made an item
 * private, the CDN went on handing those to anyone — and to every link-preview
 * scraper — for up to an hour, then for up to a day more while it revalidated in
 * the background. The SPA hides the item at once; the cached <head> did not.
 *
 * Five minutes bounds that window to something a curator can wait out, at the
 * cost of renderMeta running up to twelve times as often per popular URL. That
 * is still at most one Firestore read (plus one per collection the item is in)
 * per URL per five minutes, which this archive's traffic can easily afford.
 * stale-while-revalidate is short for the same reason: it extends how long an
 * outdated copy can be served, and only saves a visitor the function's latency.
 */
const CACHE_CONTROL = 'public, max-age=0, s-maxage=300, stale-while-revalidate=60';

/**
 * Collections that exist only in the app, not as Firestore documents. The
 * Collections page lists them and CollectionDetail builds each from a query on
 * `collection_status`, so a lookup by id finds nothing and renderMeta used to
 * answer `/collections/on-loan` — a link on the public Collections page — with a
 * 404 "Page Not Found" head.
 *
 * Keep in step with VIRTUAL_COLLECTIONS in src/pages/Collections.tsx and the
 * matching branches in src/pages/CollectionDetail.tsx. The private two are
 * staff-only there, so here they get the generic private head like any private
 * collection: 200 and noindex, not 404.
 */
const VIRTUAL_COLLECTIONS = {
    'pending-acquisitions': {
        title: 'Pending Acquisitions',
        description: () => 'Curated repository of items awaiting formal accessioning. These items are strictly confidential and visible to archive staff only.',
        is_private: true,
    },
    'deaccessioned-artifacts': {
        title: 'Deaccessioned & Stolen',
        description: () => 'Preservation records for items that have been legally deaccessioned, retired, or stolen from our physical collection.',
        is_private: true,
    },
    'on-loan': {
        title: 'Items on Loan',
        description: (siteName) => `A curated showcase of items currently on loan to the ${siteName} for temporary exhibition.`,
        is_private: false,
    },
};

/** The virtual collection with this id, shaped like a collection document; or null. */
function virtualCollection(id, siteName) {
    if (!Object.prototype.hasOwnProperty.call(VIRTUAL_COLLECTIONS, id)) return null;
    const vc = VIRTUAL_COLLECTIONS[id];
    return { id, title: vc.title, description: vc.description(siteName), is_private: vc.is_private };
}

/**
 * Whether a document is publicly readable on its own flag.
 *
 * firestore.rules allows a public read only when `is_private == false`, so a
 * document with the field missing is staff-only. renderMeta used to test
 * `is_private === true`, which treated a missing field as public and put the
 * title and image of documents the app itself would not show into the head.
 */
function isPublicFlag(data) {
    return data.is_private === false;
}

module.exports = { CACHE_CONTROL, VIRTUAL_COLLECTIONS, virtualCollection, isPublicFlag };
