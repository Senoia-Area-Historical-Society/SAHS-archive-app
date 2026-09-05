/**
 * Prepares `archive_items` for rules-enforced privacy, and moves accession
 * paperwork URLs off the public document.
 *
 * ── Why ──────────────────────────────────────────────────────────────────────
 *
 * `firestore.rules` has `match /archive_items/{item} { allow read: if true; }`.
 * Privacy is enforced only in the browser — `BrowseArchive.tsx:108` and
 * `SearchArchive.tsx:255` download the whole collection and `.filter()` private
 * items out — so anyone querying Firestore directly reads everything. Two
 * separate problems follow, and this script fixes the data half of each.
 *
 * 1. PRIVACY BACKFILL. Of 1,533 items, only 231 carry an `is_private` field at
 *    all. That is the blocker for the real fix: a rule of the form
 *    `allow read: if resource.data.is_private == false || isSAHSUser()` forces
 *    every public query to add `where('is_private','==',false)`, and Firestore
 *    does NOT match documents where the field is absent. Making that change
 *    without this backfill would hide ~1,302 items — 85% of the archive — from
 *    the public site, silently, with every test still green.
 *
 *    The value written is *effective* privacy: an item is private if it says so
 *    itself, or if any collection it belongs to is private. That mirrors what
 *    `BrowseArchive` computes client-side today via `collectionPrivacyMap`, so
 *    materializing it changes no visible behaviour.
 *
 *    NOTE this makes `is_private` a denormalized field with a sync obligation:
 *    after this runs, un-privating a *collection* no longer un-privates its
 *    items on its own. Re-run this script after any collection privacy change,
 *    or add a Firestore trigger, BEFORE switching the rules over. Until the
 *    rules change lands the field is inert — the client already treats absent
 *    and `false` identically (`item.is_private === true`) — which is exactly
 *    why this is safe to run on its own.
 *
 * 2. PAPERWORK SPLIT. `accession_paperwork_urls` is described in
 *    `src/types/database.ts:169` as "Admin/Curator only scans of paperwork" and
 *    is rendered in NO public view — confirmed absent from ItemDetail,
 *    CollectionDetail, BrowseArchive and SearchArchive; only `EditItem.tsx:487`
 *    reads it back, and that page is staff-only. Publishing those object paths
 *    on a world-readable document hands out the location of donor and
 *    provenance scans. Combined with a blanket `allow read: if true` on Storage
 *    (see the audit's C1), a disclosed path is a working download.
 *
 *    They move to `archive_items/{id}/provenance/paperwork`, which
 *    `firestore.rules` gates at `isSAHSUser()`.
 *
 * ── Phases, and why they are separate ────────────────────────────────────────
 *
 * The copy and the delete are deliberately two runs. Deleting the parent field
 * before the client that reads the new location is deployed would lose curators
 * their paperwork links; copying first is additive and reversible. Run order:
 *
 *   1. deploy rules (the subcollection must be writable)
 *   2. node scripts/migrate-item-privacy-and-paperwork.cjs            # dry run
 *   3. node scripts/migrate-item-privacy-and-paperwork.cjs --prod     # copy + backfill
 *   4. deploy the client that reads/writes the subcollection
 *   5. node scripts/migrate-item-privacy-and-paperwork.cjs --prod --delete-legacy
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *
 *   node scripts/migrate-item-privacy-and-paperwork.cjs                 # DRY RUN (default)
 *   node scripts/migrate-item-privacy-and-paperwork.cjs --prod          # write
 *   node scripts/migrate-item-privacy-and-paperwork.cjs --prod --delete-legacy
 *   node scripts/migrate-item-privacy-and-paperwork.cjs --only=privacy  # one job
 *   node scripts/migrate-item-privacy-and-paperwork.cjs --only=paperwork
 *
 * Dry run is the DEFAULT and `--prod` is a publish, not a rehearsal — the same
 * convention the sibling repo's seed scripts use. Idempotent: a second run
 * reports zero changes.
 */

const admin = require('firebase-admin');

const DATABASE_ID = 'sahs-archives';
const BATCH_LIMIT = 400; // under Firestore's 500-write cap, with headroom

const args = process.argv.slice(2);
const PROD = args.includes('--prod');
const DELETE_LEGACY = args.includes('--delete-legacy');
const onlyArg = args.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.split('=')[1] : null;
const DO_PRIVACY = !ONLY || ONLY === 'privacy';
const DO_PAPERWORK = !ONLY || ONLY === 'paperwork';

if (DELETE_LEGACY && !PROD) {
    console.log('--delete-legacy is shown as a dry run below; add --prod to apply it.\n');
}

admin.initializeApp({ projectId: 'sahs-archives' });
const db = admin.firestore();
db.settings({ databaseId: DATABASE_ID });

const stats = {
    itemsRead: 0,
    privacyAlreadySet: 0,
    privacyBackfilledFalse: 0,
    privacyBackfilledTrue: 0,
    privacyInheritedFromCollection: 0,
    paperworkCopied: 0,
    paperworkAlreadyCopied: 0,
    paperworkLegacyDeleted: 0,
    itemsWithoutPaperwork: 0,
    collectionsRead: 0,
    collectionsAlreadySet: 0,
    collectionsBackfilled: 0,
};

/**
 * The collection ids an item belongs to.
 *
 * Both shapes are live: `collection_ids` is the current multi-collection field
 * and `collection_id` the older single one. `BrowseArchive.tsx:106` reads them
 * with exactly this precedence, so this must not diverge from it.
 */
function collectionIdsOf(data) {
    if (Array.isArray(data.collection_ids) && data.collection_ids.length > 0) return data.collection_ids;
    return data.collection_id ? [data.collection_id] : [];
}

/** Effective privacy: the item's own flag OR any collection it sits in. */
function effectivePrivacy(data, privateCollectionIds) {
    if (data.is_private === true) return { value: true, inherited: false };
    const inherited = collectionIdsOf(data).some((cid) => privateCollectionIds.has(cid));
    return { value: inherited, inherited };
}

/** Commits a list of {ref, op} operations in batches, or reports them on a dry run. */
async function commitAll(operations) {
    if (!PROD) return;
    for (let i = 0; i < operations.length; i += BATCH_LIMIT) {
        const batch = db.batch();
        for (const op of operations.slice(i, i + BATCH_LIMIT)) op(batch);
        await batch.commit();
    }
}

async function run() {
    console.log(`Mode: ${PROD ? 'PRODUCTION WRITE' : 'DRY RUN (no writes)'}`);
    console.log(`Database: ${DATABASE_ID}`);
    console.log(`Jobs: ${[DO_PRIVACY && 'privacy-backfill', DO_PAPERWORK && 'paperwork-split'].filter(Boolean).join(', ')}`);
    if (DELETE_LEGACY) console.log('Including: delete legacy accession_paperwork_urls field');
    console.log('');

    const collectionsSnap = await db.collection('collections').get();
    const privateCollectionIds = new Set();
    collectionsSnap.docs.forEach((d) => {
        if (d.data().is_private === true) privateCollectionIds.add(d.id);
    });
    stats.collectionsRead = collectionsSnap.size;
    console.log(`Collections: ${collectionsSnap.size} (private: ${privateCollectionIds.size})`);

    // `collections` needs the same treatment as `archive_items`, for the same
    // reason: closing its public read means public queries must filter on
    // is_private, and Firestore does not match documents where the field is
    // absent. Two of the four collections lack it. Same trap, smaller scale.
    const collectionOps = [];
    if (DO_PRIVACY) {
        for (const d of collectionsSnap.docs) {
            if (typeof d.data().is_private === 'boolean') {
                stats.collectionsAlreadySet++;
            } else {
                stats.collectionsBackfilled++;
                collectionOps.push((batch) => batch.update(d.ref, { is_private: false }));
            }
        }
    }

    const snap = await db.collection('archive_items').get();
    stats.itemsRead = snap.size;

    const operations = [];
    const samples = [];

    for (const doc of snap.docs) {
        const data = doc.data();

        if (DO_PRIVACY) {
            const { value, inherited } = effectivePrivacy(data, privateCollectionIds);
            if (typeof data.is_private === 'boolean' && data.is_private === value) {
                stats.privacyAlreadySet++;
            } else {
                if (inherited) stats.privacyInheritedFromCollection++;
                if (value) stats.privacyBackfilledTrue++; else stats.privacyBackfilledFalse++;
                operations.push((batch) => batch.update(doc.ref, { is_private: value }));
                if (samples.length < 3) {
                    samples.push(`  privacy  ${doc.id}: is_private ${JSON.stringify(data.is_private)} -> ${value}${inherited ? ' (inherited from collection)' : ''}`);
                }
            }
        }

        if (DO_PAPERWORK) {
            const urls = data.accession_paperwork_urls;
            if (!Array.isArray(urls) || urls.length === 0) {
                stats.itemsWithoutPaperwork++;
            } else {
                const target = doc.ref.collection('provenance').doc('paperwork');
                const existing = await target.get();
                const alreadyThere =
                    existing.exists &&
                    Array.isArray(existing.data().accession_paperwork_urls) &&
                    existing.data().accession_paperwork_urls.length === urls.length;

                if (alreadyThere) {
                    stats.paperworkAlreadyCopied++;
                } else {
                    stats.paperworkCopied++;
                    operations.push((batch) =>
                        batch.set(target, {
                            accession_paperwork_urls: urls,
                            migratedAt: new Date().toISOString(),
                        }, { merge: true }));
                    if (samples.length < 6) {
                        samples.push(`  paperwork ${doc.id}: ${urls.length} url(s) -> archive_items/${doc.id}/provenance/paperwork`);
                    }
                }

                // Only ever removed once the copy is confirmed present, so a
                // half-finished run cannot lose the links.
                if (DELETE_LEGACY && (alreadyThere || !PROD)) {
                    stats.paperworkLegacyDeleted++;
                    operations.push((batch) =>
                        batch.update(doc.ref, {
                            accession_paperwork_urls: admin.firestore.FieldValue.delete(),
                        }));
                }
            }
        }
    }

    await commitAll([...collectionOps, ...operations]);

    console.log('');
    if (samples.length) {
        console.log('Sample changes:');
        samples.forEach((s) => console.log(s));
        console.log('');
    }
    console.log('Results');
    console.log(`  collections read                 ${stats.collectionsRead}`);
    if (DO_PRIVACY) {
        console.log(`    is_private already correct     ${stats.collectionsAlreadySet}`);
        console.log(`    is_private -> false            ${stats.collectionsBackfilled}`);
    }
    console.log(`  items read                       ${stats.itemsRead}`);
    if (DO_PRIVACY) {
        console.log(`  is_private already correct       ${stats.privacyAlreadySet}`);
        console.log(`  is_private -> false (backfill)   ${stats.privacyBackfilledFalse}`);
        console.log(`  is_private -> true               ${stats.privacyBackfilledTrue}`);
        console.log(`    of which inherited             ${stats.privacyInheritedFromCollection}`);
    }
    if (DO_PAPERWORK) {
        console.log(`  paperwork copied                 ${stats.paperworkCopied}`);
        console.log(`  paperwork already copied         ${stats.paperworkAlreadyCopied}`);
        console.log(`  items with no paperwork          ${stats.itemsWithoutPaperwork}`);
        if (DELETE_LEGACY) console.log(`  legacy field deleted             ${stats.paperworkLegacyDeleted}`);
    }
    console.log(`  writes ${PROD ? 'COMMITTED' : 'that WOULD be made'}      ${collectionOps.length + operations.length}`);
    if (!PROD) console.log('\nDry run — nothing was written. Re-run with --prod to apply.');
}

run().then(() => process.exit(0)).catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
