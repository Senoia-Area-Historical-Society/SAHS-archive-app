#!/usr/bin/env node
/**
 * Points site_settings/appearance.backgroundImages at the WebP hero images.
 *
 * The four hero slides were converted to WebP (404 KB -> 216 KB; home-old-main
 * was a photograph stored as PNG and went from 135 KB to 13 KB), but the stored
 * settings kept the original .jpg/.png paths — and stored settings take
 * precedence over the constant in Home.tsx. So the conversion had no effect in
 * production until Home.tsx grew a preferWebp() shim that rewrote those four
 * known paths at render time.
 *
 * This script does what the shim was standing in for, so the shim can go.
 *
 * Run this BEFORE deploying the code that removes preferWebp. Write-first is a
 * no-op against the currently deployed build, because preferWebp only matches
 * .jpg/.jpeg/.png and passes .webp through untouched. Code-first would leave the
 * heroes serving as JPEG while firebase.json preloads /home-pharmacy.webp — a
 * wasted fetch that warms nothing, and an LCP regression.
 *
 * Order is significant: entry 0 is preloaded via a Link header in firebase.json
 * and is the LCP element. The mapping below is positional for that reason.
 *
 * Usage:
 *   node scripts/set-hero-backgrounds.cjs --dry-run   # report only
 *   node scripts/set-hero-backgrounds.cjs             # apply
 *   node scripts/set-hero-backgrounds.cjs --revert    # restore the originals
 *
 * --revert exists because this writes production data: reverting the PR that
 * removes the shim does not undo the write, and the two have to move together.
 */

const admin = require('firebase-admin');
const fs = require('node:fs');
const path = require('node:path');

const DATABASE_ID = 'sahs-archives';
const DOC_PATH = 'site_settings/appearance';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

/**
 * The originals stay on disk and are not deleted: home-street-view.jpg is the
 * og:image in index.html, functions/shell.html and src/lib/seo.ts. Several
 * social crawlers still handle WebP badly, so JPEG is the right format there.
 */
const ORIGINAL = [
    '/home-pharmacy.jpg',
    '/home-street-view.jpg',
    '/home-old-main.png',
    '/home-industrial.jpg',
];

const WEBP = [
    '/home-pharmacy.webp',
    '/home-street-view.webp',
    '/home-old-main.webp',
    '/home-industrial.webp',
];

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const REVERT = args.includes('--revert');

async function main() {
    const target = REVERT ? ORIGINAL : WEBP;

    // Check the files are actually there before pointing production at them. A
    // missing asset here is four broken hero slides on the homepage, and the
    // only signal would be a 404 nobody is watching.
    const missing = target.filter((p) => !fs.existsSync(path.join(PUBLIC_DIR, p.slice(1))));
    if (missing.length) {
        console.error(`Not in public/: ${missing.join(', ')}`);
        console.error('Refusing to write — the homepage would render blank slides.');
        process.exit(1);
    }

    admin.initializeApp({ projectId: 'sahs-archives' });
    const db = admin.firestore();
    db.settings({ databaseId: DATABASE_ID });
    const ref = db.doc(DOC_PATH);

    const snap = await ref.get();
    if (!snap.exists) {
        console.error(`${DOC_PATH} does not exist. Nothing to update.`);
        process.exit(1);
    }

    const before = snap.data().backgroundImages || [];
    console.log('current:', JSON.stringify(before));
    console.log('target :', JSON.stringify(target));

    if (JSON.stringify(before) === JSON.stringify(target)) {
        console.log('\nAlready set. No write needed.');
        return;
    }

    // Positional mapping only makes sense if the stored list still is the list
    // this script knows about. If a curator has added, removed or reordered
    // slides through Appearance Settings, stop rather than overwrite their work.
    const sameStems = before.length === target.length &&
        before.every((p, i) => p.replace(/\.[^.]+$/, '') === target[i].replace(/\.[^.]+$/, ''));
    if (!sameStems) {
        console.error('\nStored list does not match the expected slides, in order.');
        console.error('It has been edited since this script was written — update it by hand.');
        process.exit(1);
    }

    if (DRY_RUN) {
        console.log('\n--- dry run --- nothing written.');
        return;
    }

    // update(), not set({merge:true}) — this touches one field and should fail
    // loudly if the document has gone missing rather than recreating it with a
    // single key and dropping every other setting.
    await ref.update({ backgroundImages: target });

    const after = (await ref.get()).data().backgroundImages;
    console.log('\nwritten :', JSON.stringify(after));
    console.log(JSON.stringify(after) === JSON.stringify(target) ? 'verified.' : 'MISMATCH — check the document.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
