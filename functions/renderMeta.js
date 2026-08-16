/**
 * Server-rendered <head> metadata for archive detail pages.
 *
 * The app is a client-rendered SPA, so the HTML Firebase Hosting serves contains
 * only a generic title and no per-page metadata. Googlebot executes JavaScript
 * and eventually sees the real tags; social scrapers (Facebook, iMessage, Slack,
 * LinkedIn, WhatsApp, X) do not. Every shared archive link therefore rendered as
 * "Senoia Area Historical Society | Digital Archive" with no image.
 *
 * This function intercepts the detail routes, reads the Firestore document, and
 * injects real title/description/og tags plus JSON-LD into the shell before
 * serving it. The body is byte-for-byte the shell the SPA normally boots from,
 * so React hydrates exactly as before.
 *
 * It renders for every visitor rather than sniffing user agents: the injected
 * metadata is derived from the same data the page goes on to render, so there is
 * no cloaking risk, and serving one response to everyone avoids the fragility of
 * maintaining a crawler list. Responses carry an s-maxage so Firebase's CDN
 * absorbs the traffic and the function itself runs rarely.
 */

const fs = require('fs');
const path = require('path');
const { onRequest } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const { getFirestore } = require('firebase-admin/firestore');

const seo = require('./shared/seo.cjs');

const DATABASE_ID = 'sahs-archives';
const SITE_NAME = 'Senoia Area Historical Society';

/** Route prefix -> how to load and describe that kind of document. */
const ROUTES = {
    items: {
        collection: 'archive_items',
        buildSeo: seo.buildItemSeo,
        buildJsonLd: seo.buildItemJsonLd,
        breadcrumb: { name: 'Archive', path: '/archive' },
        prefix: '/items',
    },
    collections: {
        collection: 'collections',
        buildSeo: seo.buildCollectionSeo,
        buildJsonLd: seo.buildCollectionJsonLd,
        breadcrumb: { name: 'Collections', path: '/collections' },
        prefix: '/collections',
    },
    library: {
        collection: 'library_books',
        buildSeo: seo.buildBookSeo,
        buildJsonLd: seo.buildBookJsonLd,
        breadcrumb: { name: 'Library', path: '/library' },
        prefix: '/library',
    },
};

/**
 * Second path segments that are app routes rather than document ids.
 * /library/add and /library/edit/:id would otherwise be looked up as book ids.
 */
const RESERVED_SEGMENTS = new Set(['add', 'edit', 'new']);

/**
 * Metadata served for anything non-public.
 *
 * ItemDetail refuses to render a private item to a non-staff visitor, so echoing
 * a private title or image into server-rendered HTML would expose something the
 * app deliberately hides — and make it trivially scrapable. Private documents get
 * the generic site description and nothing document-specific.
 */
const PRIVATE_META = {
    title: `${SITE_NAME} | Digital Archive`,
    description: seo.DEFAULT_DESCRIPTION,
    noindex: true,
};

/**
 * An item is hidden if it is private itself or belongs to a private collection —
 * the same two conditions ItemDetail checks before rendering.
 */
async function isHiddenItem(db, data) {
    if (data.is_private === true) return true;

    const collectionIds = [...(data.collection_ids || []), data.collection_id]
        .filter((id) => typeof id === 'string' && id !== '');
    if (collectionIds.length === 0) return false;

    const refs = [...new Set(collectionIds)].map((id) => db.collection('collections').doc(id));
    const snaps = await db.getAll(...refs);
    return snaps.some((snap) => snap.exists && snap.get('is_private') === true);
}

let shellCache = null;

function loadShell() {
    if (shellCache) return shellCache;
    shellCache = fs.readFileSync(path.join(__dirname, 'shell.html'), 'utf8');
    return shellCache;
}

function escapeAttr(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeText(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * JSON-LD sits inside a <script> block, where the only sequence that can break
 * out is a literal "</script". Escaping the slash keeps the JSON valid while
 * making the sequence inert.
 */
function serializeJsonLd(value) {
    return JSON.stringify(value).replace(/<\/script/gi, '<\\/script');
}

/** Tags the shell declares as defaults, which the per-page values replace. */
const STATIC_TAGS_TO_STRIP = [
    /<title>[\s\S]*?<\/title>\s*/i,
    /<meta\s+name="description"[^>]*>\s*/i,
    /<meta\s+property="og:title"[^>]*>\s*/i,
    /<meta\s+property="og:description"[^>]*>\s*/i,
    /<meta\s+property="og:image"[^>]*>\s*/i,
    /<meta\s+property="og:image:width"[^>]*>\s*/i,
    /<meta\s+property="og:image:height"[^>]*>\s*/i,
    /<meta\s+property="og:image:alt"[^>]*>\s*/i,
    /<meta\s+property="og:type"[^>]*>\s*/i,
    /<meta\s+name="twitter:card"[^>]*>\s*/i,
    /<meta\s+name="twitter:title"[^>]*>\s*/i,
    /<meta\s+name="twitter:description"[^>]*>\s*/i,
    /<meta\s+name="twitter:image"[^>]*>\s*/i,
    /<meta\s+name="robots"[^>]*>\s*/i,
];

function renderHead(meta, jsonLdBlocks) {
    const lines = [
        `<title>${escapeText(meta.title)}</title>`,
        `<meta name="description" content="${escapeAttr(meta.description)}" />`,
        `<meta property="og:title" content="${escapeAttr(meta.title)}" />`,
        `<meta property="og:description" content="${escapeAttr(meta.description)}" />`,
        `<meta property="og:type" content="${escapeAttr(meta.type || 'website')}" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        `<meta name="twitter:title" content="${escapeAttr(meta.title)}" />`,
        `<meta name="twitter:description" content="${escapeAttr(meta.description)}" />`,
    ];

    if (meta.image) {
        lines.push(`<meta property="og:image" content="${escapeAttr(meta.image)}" />`);
        lines.push(`<meta name="twitter:image" content="${escapeAttr(meta.image)}" />`);
    }

    if (meta.noindex) {
        // A noindex page must not also assert a canonical or og:url; that would
        // tell a crawler both to skip the page and which URL to index for it.
        lines.push(`<meta name="robots" content="noindex, nofollow" />`);
    } else {
        lines.push(`<meta name="robots" content="index, follow, max-image-preview:large" />`);
        if (meta.canonical) {
            lines.push(`<link rel="canonical" href="${escapeAttr(meta.canonical)}" />`);
            lines.push(`<meta property="og:url" content="${escapeAttr(meta.canonical)}" />`);
        }
    }

    for (const block of jsonLdBlocks) {
        // data-managed-jsonld marks these as replaceable: when the SPA boots,
        // useJsonLd clears any tags carrying this attribute before adding its
        // own, so the page ends up with one copy of each entity rather than a
        // server copy and a client copy.
        lines.push(
            `<script type="application/ld+json" data-managed-jsonld="true">${serializeJsonLd(block)}</script>`
        );
    }

    return lines.map((line) => `    ${line}`).join('\n');
}

function injectIntoShell(shell, headHtml) {
    let html = shell;
    for (const pattern of STATIC_TAGS_TO_STRIP) {
        html = html.replace(pattern, '');
    }
    return html.replace('</head>', `${headHtml}\n  </head>`);
}

/** "/items/abc123" -> { route, id }; null when the path isn't a detail page. */
function parsePath(pathname) {
    const segments = pathname.split('?')[0].split('/').filter(Boolean);
    if (segments.length < 2) return null;

    const route = ROUTES[segments[0]];
    if (!route) return null;

    const id = segments[1];
    if (!id || RESERVED_SEGMENTS.has(id.toLowerCase())) return null;

    return { route, id, key: segments[0] };
}

// Exported for testing: the private-collection branch is hard to exercise over
// HTTP, because every item currently in a private collection is also private
// itself, which the earlier check short-circuits.
exports._isHiddenItem = isHiddenItem;
exports._parsePath = parsePath;

exports.renderMeta = onRequest(
    {
        region: 'us-central1',
        memory: '256MiB',
        timeoutSeconds: 15,
        // Metadata is derived entirely from publicly readable documents.
        invoker: 'public',
        concurrency: 80,
    },
    async (req, res) => {
        const shell = loadShell();

        // Browsers and scrapers only ever GET these URLs.
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.set('Allow', 'GET, HEAD');
            res.status(405).send('Method Not Allowed');
            return;
        }

        // Let the CDN absorb repeat traffic so the function runs rarely, and keep
        // serving a stale page while a new one is fetched rather than blocking.
        res.set('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
        res.set('Content-Type', 'text/html; charset=utf-8');

        let parsed = null;
        try {
            parsed = parsePath(req.path || '/');
        } catch (err) {
            logger.warn('renderMeta: could not parse path', { path: req.path, err: err.message });
        }

        // Not a detail URL (e.g. /library/add): serve the shell untouched so the
        // SPA routes it client-side exactly as before.
        if (!parsed) {
            res.status(200).send(shell);
            return;
        }

        try {
            const db = getFirestore(DATABASE_ID);
            const snap = await db.collection(parsed.route.collection).doc(parsed.id).get();

            if (!snap.exists) {
                // The SPA renders its own NotFound view for this URL. Mark it
                // noindex so a missing document can't enter the index as a
                // 200-status blank page.
                const head = renderHead(
                    {
                        title: `Page Not Found | ${SITE_NAME}`,
                        description: 'The page you are looking for could not be found in the digital archive.',
                        noindex: true,
                    },
                    []
                );
                res.status(404).send(injectIntoShell(shell, head));
                return;
            }

            const data = { ...snap.data(), id: snap.id };

            const hidden = parsed.key === 'items'
                ? await isHiddenItem(db, data)
                : data.is_private === true;

            if (hidden) {
                res.status(200).send(injectIntoShell(shell, renderHead(PRIVATE_META, [])));
                return;
            }

            const meta = parsed.route.buildSeo(data, SITE_NAME);

            const jsonLd = [];
            if (!meta.noindex) {
                jsonLd.push(parsed.route.buildJsonLd(data, SITE_NAME));
                jsonLd.push(
                    seo.buildBreadcrumbJsonLd([
                        { name: 'Home', path: '/' },
                        parsed.route.breadcrumb,
                        { name: data.title || 'Item', path: `${parsed.route.prefix}/${snap.id}` },
                    ])
                );
            }

            res.status(200).send(injectIntoShell(shell, renderHead(meta, jsonLd)));
        } catch (err) {
            // Never fail the page over metadata. A visitor still gets a working
            // app; only the pre-rendered tags are missing.
            logger.error('renderMeta: falling back to bare shell', {
                path: req.path,
                error: err.message,
            });
            res.status(200).send(shell);
        }
    }
);
