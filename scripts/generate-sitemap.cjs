#!/usr/bin/env node
/**
 * Generates dist/sitemap.xml from Firestore.
 *
 * Runs in CI *after* the Google Cloud OIDC auth step and *before* deploy, so it
 * can read Firestore with Application Default Credentials and still have the
 * file land in dist/ in time to be uploaded. It is deliberately not part of
 * `npm run build`, which has no credentials.
 *
 * Freshness tradeoff: the sitemap refreshes on deploy, so items a curator adds
 * between deploys won't appear until the next push to main. With a ~1,500 item
 * catalogue that changes slowly this is a reasonable trade; if items start being
 * added daily, serve the sitemap from a Cloud Function instead.
 *
 * Failure policy: this must never block a deploy. If Firestore is unreachable,
 * it writes a sitemap of the static routes and exits 0 rather than shipping
 * nothing — but it exits non-zero on a *write* failure, since a silently missing
 * sitemap is the exact problem this script exists to fix.
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const SITE_URL = 'https://archives.senoiahistory.com';
const DATABASE_ID = 'sahs-archives';
const OUT_PATH = path.join(__dirname, '..', 'dist', 'sitemap.xml');

/** Public, indexable routes. Must stay in sync with robots.txt. */
const STATIC_ROUTES = [
    { path: '/', changefreq: 'weekly', priority: '1.0' },
    { path: '/archive', changefreq: 'daily', priority: '0.9' },
    { path: '/collections', changefreq: 'weekly', priority: '0.8' },
    { path: '/library', changefreq: 'weekly', priority: '0.8' },
    { path: '/stories', changefreq: 'weekly', priority: '0.8' },
    { path: '/map', changefreq: 'monthly', priority: '0.6' },
];

function escapeXml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Firestore stores dates as ISO strings, Timestamps, or nothing at all.
 * Returns a W3C date (YYYY-MM-DD) or undefined — an invalid <lastmod> makes
 * Search Console reject the whole sitemap, so anything unparseable is dropped.
 */
function toLastmod(value) {
    if (!value) return undefined;

    let date;
    if (typeof value.toDate === 'function') {
        date = value.toDate();
    } else {
        date = new Date(value);
    }

    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return undefined;
    // Guard against clock-skewed or placeholder future dates.
    if (date.getTime() > Date.now()) return undefined;

    return date.toISOString().slice(0, 10);
}

function urlEntry({ loc, lastmod, changefreq, priority }) {
    const lines = [`    <loc>${escapeXml(loc)}</loc>`];
    if (lastmod) lines.push(`    <lastmod>${lastmod}</lastmod>`);
    if (changefreq) lines.push(`    <changefreq>${changefreq}</changefreq>`);
    if (priority) lines.push(`    <priority>${priority}</priority>`);
    return `  <url>\n${lines.join('\n')}\n  </url>`;
}

function buildSitemap(entries) {
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...entries.map(urlEntry),
        '</urlset>',
        '',
    ].join('\n');
}

async function collectFromFirestore(db) {
    const entries = [];

    // Archive items — the bulk of the sitemap.
    const items = await db.collection('archive_items').get();
    let skippedPrivate = 0;
    items.forEach((doc) => {
        if (doc.get('is_private') === true) {
            skippedPrivate += 1;
            return;
        }
        entries.push({
            loc: `${SITE_URL}/items/${doc.id}`,
            lastmod: toLastmod(doc.get('updated_at') || doc.get('created_at')),
            changefreq: 'monthly',
            priority: '0.7',
        });
    });
    console.log(`  archive_items: ${items.size} read, ${skippedPrivate} private skipped`);

    const collections = await db.collection('collections').get();
    let skippedPrivateCollections = 0;
    collections.forEach((doc) => {
        if (doc.get('is_private') === true) {
            skippedPrivateCollections += 1;
            return;
        }
        entries.push({
            loc: `${SITE_URL}/collections/${doc.id}`,
            lastmod: toLastmod(doc.get('created_at')),
            changefreq: 'weekly',
            priority: '0.8',
        });
    });
    console.log(`  collections: ${collections.size} read, ${skippedPrivateCollections} private skipped`);

    const books = await db.collection('library_books').get();
    books.forEach((doc) => {
        entries.push({
            loc: `${SITE_URL}/library/${doc.id}`,
            lastmod: toLastmod(doc.get('updated_at') || doc.get('created_at')),
            changefreq: 'monthly',
            priority: '0.7',
        });
    });
    console.log(`  library_books: ${books.size} read`);

    return entries;
}

async function main() {
    const staticEntries = STATIC_ROUTES.map((route) => ({
        loc: `${SITE_URL}${route.path === '/' ? '/' : route.path}`,
        changefreq: route.changefreq,
        priority: route.priority,
    }));

    let dynamicEntries = [];

    try {
        admin.initializeApp({ projectId: 'sahs-archives' });
        const db = admin.firestore();
        db.settings({ databaseId: DATABASE_ID });

        console.log(`Reading Firestore database "${DATABASE_ID}"…`);
        dynamicEntries = await collectFromFirestore(db);
    } catch (err) {
        // A deploy that ships a stale-but-valid sitemap beats a failed deploy.
        console.error('WARNING: could not read Firestore, writing static routes only.');
        console.error(err.message);
    }

    const entries = [...staticEntries, ...dynamicEntries];

    const outDir = path.dirname(OUT_PATH);
    if (!fs.existsSync(outDir)) {
        throw new Error(`${outDir} does not exist — run "npm run build" before generating the sitemap.`);
    }

    fs.writeFileSync(OUT_PATH, buildSitemap(entries), 'utf8');
    console.log(`Wrote ${entries.length} URLs to ${OUT_PATH}`);

    if (dynamicEntries.length === 0) {
        // Surface this as a GitHub Actions annotation rather than a buried log
        // line: the deploy still succeeds, but shipping a 6-URL sitemap in place
        // of a ~1,500-URL one should not pass unnoticed.
        console.log(
            '::warning title=Sitemap degraded::Firestore was unreachable; ' +
            'sitemap.xml contains static routes only. Re-run the deploy to restore the full sitemap.'
        );
    }
}

main().then(
    () => process.exit(0),
    (err) => {
        // Reaching here means the file could not be written at all. Fail loudly:
        // silently shipping no sitemap is the problem this script exists to fix.
        console.error('FATAL: sitemap generation failed.');
        console.error(err);
        process.exit(1);
    }
);
