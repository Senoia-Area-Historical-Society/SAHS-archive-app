#!/usr/bin/env node
/**
 * Generates thumbnail variants for images already in Cloud Storage.
 *
 * The storage-resize-images extension only processes new uploads — its backfill
 * parameters are commented out upstream and unavailable — so everything
 * uploaded before it was installed needs this one-off pass.
 *
 * It produces exactly the paths src/lib/imageThumbs.ts derives, so a card can
 * construct a thumbnail URL without a lookup:
 *
 *   archive_media/scan.png  ->  archive_media/thumbs/scan_400x400.webp
 *                               archive_media/thumbs/scan_1000x1000.webp
 *
 * Usage:
 *   node scripts/backfill-thumbnails.cjs --dry-run      # report only, writes nothing
 *   node scripts/backfill-thumbnails.cjs --limit 20     # try a small batch first
 *   node scripts/backfill-thumbnails.cjs                # full run
 *   node scripts/backfill-thumbnails.cjs --concurrency 8 # default is 4
 *
 * Safe to re-run: existing thumbnails are skipped, so an interrupted run resumes
 * where it left off. Originals are never modified or deleted.
 *
 * This is deliberately not wired into CI. It downloads and re-encodes tens of
 * gigabytes and should be run deliberately, once, with someone watching.
 */

const admin = require('firebase-admin');
const sharp = require('sharp');

const BUCKET = 'sahs-archives.firebasestorage.app';
const SIZES = [400, 1000]; // must match THUMB_SIZES in src/lib/imageThumbs.ts
const RESIZED_DIR = 'thumbs'; // must match RESIZED_DIR there

// Top-level prefixes only. Library covers live at archive_media/library_covers/,
// nested under archive_media/, so they are already covered — an earlier version of
// this list had a top-level 'library_covers/' entry that matched nothing.
// accession_paperwork/ is deliberately absent: staff-only, never rendered to the
// public, so it does not need public thumbnails. content_images/, portraits/,
// posts/ and public/ belong to the sahs-website app sharing this bucket.
const PREFIXES = [
    'archive_media/',
    'collections/',
    'additional_media/',
    'site_assets/',
];

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const numFlag = (name, fallback) => {
    const i = args.indexOf(name);
    if (i === -1) return fallback;
    const n = Number(args[i + 1]);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};
const LIMIT = numFlag('--limit', Infinity);
const CONCURRENCY = numFlag('--concurrency', 4);

const IMAGE_RE = /\.(jpe?g|png|webp|tiff?|gif)$/i;

function thumbPath(objectPath, size) {
    const lastSlash = objectPath.lastIndexOf('/');
    const dir = lastSlash === -1 ? '' : objectPath.slice(0, lastSlash);
    const file = lastSlash === -1 ? objectPath : objectPath.slice(lastSlash + 1);
    const dot = file.lastIndexOf('.');
    const stem = dot === -1 ? file : file.slice(0, dot);
    const resizedDir = dir ? `${dir}/${RESIZED_DIR}` : RESIZED_DIR;
    return `${resizedDir}/${stem}_${size}x${size}.webp`;
}

const stats = {
    sourceImages: 0, alreadyDone: 0, processed: 0, failed: 0,
    bytesIn: 0, bytesOut: 0,
};

async function resizeOne(bucket, file, targets, index, total) {
    const objectPath = file.name;
    const originalBytes = Number(file.metadata.size || 0);

    if (DRY_RUN) {
        console.log(`  [${index}/${total}] would resize ${objectPath} (${(originalBytes / 1048576).toFixed(1)} MB)`);
        stats.processed += 1;
        stats.bytesIn += originalBytes;
        return;
    }

    const [buffer] = await file.download();
    stats.bytesIn += buffer.length;
    let written = 0;

    for (const { size, path } of targets) {
        const out = await sharp(buffer, { limitInputPixels: false })
            .rotate() // honour EXIF orientation
            .resize(size, size, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 82 })
            .toBuffer();

        await bucket.file(path).save(out, {
            contentType: 'image/webp',
            resumable: false,
            metadata: { cacheControl: 'public, max-age=31536000, immutable' },
        });

        // imageThumbs.ts builds unsigned URLs, matching the extension's
        // MAKE_PUBLIC setting, so these must be readable without a token.
        await bucket.file(path).makePublic();

        stats.bytesOut += out.length;
        written += out.length;
    }

    stats.processed += 1;
    const pct = (100 - (written / Math.max(buffer.length, 1)) * 100).toFixed(0);
    console.log(`  [${index}/${total}] ${objectPath} — ${(buffer.length / 1048576).toFixed(1)} MB -> ${(written / 1024).toFixed(0)} KB (-${pct}%)`);
}

/** Bounded worker pool. One item failing must not abort the rest of the run. */
async function runPool(items, concurrency, worker) {
    let next = 0;
    const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        for (;;) {
            const i = next++;
            if (i >= items.length) return;
            try {
                await worker(items[i], i + 1);
            } catch (err) {
                stats.failed += 1;
                console.error(`  FAILED ${items[i].file.name}: ${err.message}`);
            }
        }
    });
    await Promise.all(runners);
}

function printSummary() {
    const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
    console.log('\n--- summary ---');
    console.log(`  source images found ${stats.sourceImages}`);
    console.log(`  already had thumbs  ${stats.alreadyDone}`);
    console.log(`  processed           ${stats.processed}`);
    console.log(`  failed              ${stats.failed}`);
    console.log(`  original bytes read ${mb(stats.bytesIn)}`);
    if (!DRY_RUN) {
        console.log(`  thumbnail bytes     ${mb(stats.bytesOut)}`);
        if (stats.bytesIn > 0) {
            console.log(`  size reduction      ${(100 - (stats.bytesOut / stats.bytesIn) * 100).toFixed(1)}%`);
        }
    }
}

async function main() {
    admin.initializeApp({ projectId: 'sahs-archives', storageBucket: BUCKET });
    const bucket = admin.storage().bucket();

    console.log(DRY_RUN ? 'DRY RUN — nothing will be written' : 'Backfilling thumbnails');
    console.log(`concurrency ${CONCURRENCY}${LIMIT === Infinity ? '' : `, limit ${LIMIT}`}\n`);

    // A Ctrl-C part way through a long run should still report what it managed.
    process.on('SIGINT', () => {
        console.log('\ninterrupted — re-running resumes where this left off');
        printSummary();
        process.exit(130);
    });

    const work = [];

    for (const prefix of PREFIXES) {
        process.stdout.write(`${prefix} listing... `);
        const [files] = await bucket.getFiles({ prefix });

        // The listing already contains the thumbnails — they live under this same
        // prefix. Membership in this Set replaces two bucket.file().exists() calls
        // per image, which was 2 network round trips each for work already done and
        // the reason a resumed run sat silent for minutes before its first output.
        const present = new Set(files.map((f) => f.name));

        let found = 0, done = 0;
        for (const file of files) {
            if (file.name.includes(`/${RESIZED_DIR}/`) || !IMAGE_RE.test(file.name)) continue;
            found += 1;
            const targets = SIZES
                .map((size) => ({ size, path: thumbPath(file.name, size) }))
                .filter((t) => !present.has(t.path));
            if (targets.length === 0) { done += 1; continue; }
            work.push({ file, targets });
        }

        stats.sourceImages += found;
        stats.alreadyDone += done;
        console.log(`${files.length} objects, ${found} source images, ${done} already done, ${found - done} to do`);
    }

    const queue = work.slice(0, LIMIT === Infinity ? work.length : LIMIT);
    if (queue.length < work.length) {
        console.log(`\nlimit ${LIMIT}: processing ${queue.length} of ${work.length} outstanding images`);
    }
    console.log(`\n${queue.length} image${queue.length === 1 ? '' : 's'} to process\n`);

    await runPool(queue, CONCURRENCY, ({ file, targets }, index) =>
        resizeOne(bucket, file, targets, index, queue.length)
    );

    printSummary();

    // A partial run still leaves the site working, because unresized images fall
    // back to their original. Signal failures for a human to look at, though.
    process.exit(stats.failed > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
