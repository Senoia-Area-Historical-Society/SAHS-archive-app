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
const PREFIXES = ['archive_media/', 'collections/', 'library_covers/', 'site_assets/'];

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitFlag = args.indexOf('--limit');
const LIMIT = limitFlag === -1 ? Infinity : Number(args[limitFlag + 1]);

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
    scanned: 0, skippedNotImage: 0, skippedExisting: 0,
    processed: 0, failed: 0, bytesIn: 0, bytesOut: 0,
};

async function processFile(bucket, file) {
    const objectPath = file.name;

    if (objectPath.includes(`/${RESIZED_DIR}/`) || !IMAGE_RE.test(objectPath)) {
        stats.skippedNotImage += 1;
        return;
    }

    stats.scanned += 1;

    const targets = SIZES.map((size) => ({ size, path: thumbPath(objectPath, size) }));
    const existing = await Promise.all(
        targets.map((target) => bucket.file(target.path).exists().then(([found]) => found))
    );

    if (existing.every(Boolean)) {
        stats.skippedExisting += 1;
        return;
    }

    const originalBytes = Number(file.metadata.size || 0);

    if (DRY_RUN) {
        console.log(`  would resize ${objectPath} (${(originalBytes / 1048576).toFixed(1)} MB)`);
        stats.processed += 1;
        stats.bytesIn += originalBytes;
        return;
    }

    const [buffer] = await file.download();
    stats.bytesIn += buffer.length;

    for (let i = 0; i < targets.length; i += 1) {
        if (existing[i]) continue;
        const { size, path } = targets[i];

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
    }

    stats.processed += 1;
}

async function main() {
    admin.initializeApp({ projectId: 'sahs-archives', storageBucket: BUCKET });
    const bucket = admin.storage().bucket();

    console.log(DRY_RUN ? 'DRY RUN — nothing will be written\n' : 'Backfilling thumbnails\n');

    for (const prefix of PREFIXES) {
        console.log(`${prefix}`);
        const [files] = await bucket.getFiles({ prefix });

        for (const file of files) {
            if (stats.processed >= LIMIT) break;
            try {
                await processFile(bucket, file);
            } catch (err) {
                stats.failed += 1;
                console.error(`  FAILED ${file.name}: ${err.message}`);
            }
        }
        if (stats.processed >= LIMIT) break;
    }

    const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
    console.log('\n--- summary ---');
    console.log(`  images scanned      ${stats.scanned}`);
    console.log(`  already had thumbs  ${stats.skippedExisting}`);
    console.log(`  processed           ${stats.processed}`);
    console.log(`  failed              ${stats.failed}`);
    console.log(`  original bytes read ${mb(stats.bytesIn)}`);
    if (!DRY_RUN) {
        console.log(`  thumbnail bytes     ${mb(stats.bytesOut)}`);
        if (stats.bytesIn > 0) {
            console.log(`  size reduction      ${(100 - (stats.bytesOut / stats.bytesIn) * 100).toFixed(1)}%`);
        }
    }

    // A partial run still leaves the site working, because unresized images fall
    // back to their original. Signal failures for a human to look at, though.
    process.exit(stats.failed > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
