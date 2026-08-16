#!/usr/bin/env node
/**
 * Prepares the two generated inputs the renderMeta Cloud Function needs.
 *
 *   functions/shared/seo.cjs  - the app's own metadata builders, bundled to CJS
 *   functions/shell.html      - the built SPA shell the function injects into
 *
 * Why bundle rather than reimplement: src/lib/seo.ts and src/lib/structuredData.ts
 * were written free of React and DOM references precisely so the server can produce
 * identical metadata. Copying that logic into functions/ by hand would drift the
 * first time someone edits a title format.
 *
 * Why copy the shell rather than fetch it at runtime: the shell references
 * content-hashed asset filenames that change every build. Copying it from dist/
 * during the same CI run that deploys guarantees the function serves a shell
 * pointing at assets that actually exist.
 *
 * Both outputs are committed so the repo stays deployable on its own, and CI
 * regenerates them before every deploy so they cannot go stale in production.
 * Run after `npm run build`.
 */

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const SHARED_DIR = path.join(ROOT, 'functions', 'shared');
const SHARED_OUT = path.join(SHARED_DIR, 'seo.cjs');
const SHELL_SRC = path.join(ROOT, 'dist', 'index.html');
const SHELL_OUT = path.join(ROOT, 'functions', 'shell.html');

const BANNER = `/**
 * GENERATED FILE - DO NOT EDIT.
 * Bundled from src/lib/seo.ts and src/lib/structuredData.ts by
 * scripts/prepare-functions.cjs. Edit those sources instead.
 */`;

// A tiny entry point so both modules land in one bundle with a flat export surface.
const ENTRY = `
export {
    buildItemSeo, buildCollectionSeo, buildBookSeo, buildPageSeo,
    truncate, absoluteUrl, formatTitle, describeItem,
    SITE_URL, DEFAULT_SITE_NAME, DEFAULT_DESCRIPTION, DEFAULT_OG_IMAGE,
} from './src/lib/seo';
export {
    buildItemJsonLd, buildCollectionJsonLd, buildBookJsonLd,
    buildBreadcrumbJsonLd, buildOrganizationJsonLd, buildWebSiteJsonLd,
} from './src/lib/structuredData';
`;

function buildShared() {
    fs.mkdirSync(SHARED_DIR, { recursive: true });

    esbuild.buildSync({
        stdin: {
            contents: ENTRY,
            resolveDir: ROOT,
            loader: 'ts',
        },
        outfile: SHARED_OUT,
        bundle: true,
        platform: 'node',
        target: 'node20',
        format: 'cjs',
        banner: { js: BANNER },
        logLevel: 'warning',
    });

    const bytes = fs.statSync(SHARED_OUT).size;
    console.log(`  functions/shared/seo.cjs   ${(bytes / 1024).toFixed(1)} KB`);
}

function copyShell() {
    if (!fs.existsSync(SHELL_SRC)) {
        throw new Error(
            `${SHELL_SRC} not found. Run "npm run build" before this script — the ` +
            `function serves the built shell, which references content-hashed assets.`
        );
    }

    const html = fs.readFileSync(SHELL_SRC, 'utf8');

    // The shell must carry the module script, or the function would serve a page
    // that renders metadata but never boots the app.
    if (!/<script[^>]+type="module"/.test(html)) {
        throw new Error('dist/index.html has no module script — refusing to copy a shell that would not boot.');
    }

    fs.writeFileSync(SHELL_OUT, html, 'utf8');
    console.log(`  functions/shell.html       ${(html.length / 1024).toFixed(1)} KB`);
}

console.log('Preparing Cloud Function inputs…');
buildShared();
copyShell();

// Smoke-test the bundle so a broken export surface fails here rather than at a
// cold start in production.
const shared = require(SHARED_OUT);
const probe = shared.buildItemSeo(
    { id: 'probe', title: 'Probe', description: 'Probe item.', item_type: 'Artifact' },
    'Senoia Area Historical Society'
);
if (!probe.title || !probe.canonical) {
    throw new Error('Bundled seo module did not produce a usable result.');
}
console.log('  smoke test                 ok');
