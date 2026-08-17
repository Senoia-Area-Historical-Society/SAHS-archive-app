#!/usr/bin/env node
/**
 * Pre-renders the <head> of the six public list pages into dist/<route>.html.
 *
 * Why this exists
 * ---------------
 * PR #7 made detail pages serve real metadata by routing /items/**,
 * /collections/** and /library/** through the renderMeta function. Those globs
 * match /library/123 but not /library itself, so the five list pages fell
 * through to the catch-all rewrite and shipped the generic shell:
 *
 *     /items/Lap7BJ…   og:title = "Newnan-Coweta Magazine Article on Victor Dallas | …"
 *     /library         og:title = "Senoia Area Historical Society | Digital Archive"
 *
 * Google executes JavaScript and sees the title useSeo() sets, so indexing was
 * never affected. Social scrapers do not, so sharing a link to /archive or
 * /library previewed as the bare site name.
 *
 * Why static files rather than more renderMeta rewrites
 * ----------------------------------------------------
 * Adding /archive and friends to the rewrite list would work, but it moves the
 * busiest browse pages in the app from static hosting to a Cloud Function
 * invocation on every visit — latency and cost paid by every human reader, to
 * fix a preview that only scrapers see. Hosting matches a static file before it
 * considers a rewrite, so emitting real files keeps those pages on the CDN and
 * leaves renderMeta's 1,513-page hot path completely untouched.
 *
 * This needs `cleanUrls: true` in firebase.json. Without it, /archive would only
 * resolve to a directory index and Hosting would 301 to /archive/, which
 * contradicts the canonical this very script writes.
 *
 * Values come from Firestore, not from constants, because three of the six
 * titles are curator-editable — the museum name, the stories heading, and the
 * archive item count. Reading the same source the client reads is what keeps the
 * scraper's view and the rendered view from disagreeing.
 *
 * Runs in CI after the OIDC auth step and after `npm run build`, alongside
 * generate-sitemap.cjs, for the same reason: it needs both credentials and an
 * existing dist/.
 *
 * Failure policy matches the sitemap script. A Firestore outage falls back to
 * built-in defaults and still writes the files, because a page with a slightly
 * stale title is better than one with no metadata. A write failure exits
 * non-zero, since silently shipping nothing is the bug this script fixes.
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const { buildPageSeo, DEFAULT_SITE_NAME } = require('../functions/shared/seo.cjs');

const DATABASE_ID = 'sahs-archives';
const DIST = path.join(__dirname, '..', 'dist');
const SHELL = path.join(DIST, 'index.html');

/**
 * Must stay in sync with STATIC_ROUTES in generate-sitemap.cjs and with the
 * useSeo() call in each page component — those calls are the source of truth for
 * the wording, and are quoted here so a mismatch is visible in review.
 *
 * `/` is deliberately absent: the shell's own metadata is already the homepage's
 * correct metadata, so writing a second copy would only add drift.
 */
function routesFor(settings, itemCount) {
    const stories = (settings.contentBlocks && settings.contentBlocks.storiesTitle) || 'Senoia Stories';
    return [
        {
            file: 'archive.html',
            path: '/archive',
            title: 'Archive Collection',
            description: `Browse and search through our entire collection of ${itemCount} historical items`,
        },
        {
            file: 'collections.html',
            path: '/collections',
            title: 'Collections',
            description: 'Browse curated collections of photographs, documents and artifacts from the Senoia and Coweta County historical archive.',
        },
        {
            file: 'library.html',
            path: '/library',
            title: 'Reference Library',
            description: 'Search the reference library of books on Senoia, Coweta County and Georgia history, genealogy and local heritage.',
        },
        {
            file: 'stories.html',
            path: '/stories',
            title: stories,
            description: 'Listen to oral histories from the Senoia area — first-hand accounts and recorded memories preserved by the Senoia Area Historical Society.',
        },
        {
            file: 'map.html',
            path: '/map',
            title: 'Map Discovery',
            description: 'Explore the archive geographically — historic photographs, buildings and documents plotted across Senoia and Coweta County, Georgia.',
        },
    ];
}

function escapeAttr(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Rewrites the shell's head for one route.
 *
 * Replaces rather than appends, because a duplicate og:title is ambiguous to a
 * scraper and some pick the first occurrence. The canonical and og:url are
 * added, not replaced: index.html deliberately omits both, since it is the shell
 * for every route and a hardcoded canonical there would declare all ~1,500 item
 * pages to be the homepage.
 */
function renderShell(shell, seo) {
    const title = escapeAttr(seo.title);
    const description = escapeAttr(seo.description);

    let html = shell
        .replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`)
        .replace(/(<meta\s+name="description"\s+content=")[\s\S]*?(")/, `$1${description}$2`)
        .replace(/(<meta\s+property="og:title"\s+content=")[\s\S]*?(")/, `$1${title}$2`)
        .replace(/(<meta\s+property="og:description"\s*\n?\s*content=")[\s\S]*?(")/, `$1${description}$2`)
        .replace(/(<meta\s+name="twitter:title"\s+content=")[\s\S]*?(")/, `$1${title}$2`)
        .replace(/(<meta\s+name="twitter:description"\s*\n?\s*content=")[\s\S]*?(")/, `$1${description}$2`);

    const injected = [
        `<link rel="canonical" href="${escapeAttr(seo.canonical)}" />`,
        `<meta property="og:url" content="${escapeAttr(seo.canonical)}" />`,
    ].join('\n    ');

    return html.replace('</head>', `  ${injected}\n  </head>`);
}

/** Everything this needs from Firestore, with defaults if it is unreachable. */
async function readSettings() {
    const fallback = { settings: {}, itemCount: 0, live: false };
    try {
        admin.initializeApp({ projectId: 'sahs-archives' });
        const db = admin.firestore();
        db.settings({ databaseId: DATABASE_ID });

        const [snap, items] = await Promise.all([
            db.doc('site_settings/appearance').get(),
            db.collection('archive_items').count().get(),
        ]);

        // Every item, private ones included, because that is what BrowseArchive
        // puts in the heading it also feeds to useSeo — `items` there is the
        // unfiltered fetch, and privacy is applied later for display only. This
        // script exists to make the scraper's view match the rendered view, so
        // it copies that count rather than correcting it. Whether that heading
        // should advertise items an anonymous visitor cannot open is a separate
        // question about the page, not about this file.
        return { settings: snap.exists ? snap.data() : {}, itemCount: items.data().count, live: true };
    } catch (err) {
        console.warn(`Firestore unavailable (${err.message}); using defaults.`);
        return fallback;
    }
}

async function main() {
    if (!fs.existsSync(SHELL)) {
        console.error(`No ${SHELL}. Run \`npm run build\` first.`);
        process.exit(1);
    }
    const shell = fs.readFileSync(SHELL, 'utf8');

    const { settings, itemCount, live } = await readSettings();
    const siteName = settings.museumName || DEFAULT_SITE_NAME;
    console.log(`site name: ${siteName}${live ? '' : ' (default — Firestore unreachable)'}`);
    console.log(`archive items: ${itemCount}`);

    for (const route of routesFor(settings, itemCount)) {
        const seo = buildPageSeo(route.title, route.description, route.path, siteName);
        const html = renderShell(shell, seo);

        // A replacement that silently matched nothing would ship the generic
        // shell under a route-specific filename — the exact bug being fixed, but
        // now harder to spot. Fail loudly instead.
        if (!html.includes(`<title>${escapeAttr(seo.title)}</title>`)) {
            console.error(`Title substitution failed for ${route.path}. Has index.html's head changed?`);
            process.exit(1);
        }
        if (!html.includes('rel="canonical"')) {
            console.error(`Canonical injection failed for ${route.path}.`);
            process.exit(1);
        }

        fs.writeFileSync(path.join(DIST, route.file), html);
        console.log(`  ${route.file.padEnd(18)} ${seo.title}`);
    }

    console.log('\nStatic list-page metadata written.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
