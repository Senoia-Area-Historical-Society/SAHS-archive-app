/**
 * Rewrites every artifact's `artifact_type` to one of the dropdown values in
 * `src/lib/artifactTypes.ts`.
 *
 * ── Why ──────────────────────────────────────────────────────────────────────
 *
 * In October 2026 the 1,253 artifacts carried 28 type labels for 14 real types:
 * `'Textile'`, `'textile'` and `'Textiles'`; `'Memorabilia'` and `'Memorabilla'`;
 * `'Printed'` beside `'print'`. That makes it hard to pull every item of one type
 * for an exhibit.
 *
 * It also uncovered a bug. Edit Item set its dropdown to the raw stored string;
 * `'Photo'` matched no option, the browser chose the first, `'textile'`, and
 * saving relabelled the item. About 25 of the 44 lowercase `'textile'` items are
 * not textiles — a piano, a BB gun, bank books, photos. The fix shipped with this
 * script. These items are recovered from their tags: `migration/migrate.js`
 * copied each item's original type into `tags`, and editing doesn't remove it.
 *
 * ── What it does, per artifact ───────────────────────────────────────────────
 *
 *   1. Stored value exactly `'textile'` and a tag naming a different type
 *      → restore that type. (Only `'textile'` can be the dropdown's fallback.)
 *   2. Otherwise, a known spelling → the canonical value (`'Photo'` → `'photo'`,
 *      `'Printed'` → `'print'`, `'Misc'` → `'miscellaneous'`).
 *   3. Anything unrecognised is left alone and listed for review.
 *
 * Only `artifact_type` is written. Tags are not touched.
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *
 *   node scripts/normalize-artifact-types.cjs          # DRY RUN (default)
 *   node scripts/normalize-artifact-types.cjs --prod   # write
 *
 * Under bare user ADC this fails with "Could not load the default credentials";
 * prefix the command with GOOGLE_APPLICATION_CREDENTIALS=migration/service-account.json.
 *
 * Every run writes `migration/artifact-type-report.csv` (git-ignored) with each
 * item's old and new value — that file is the undo record, so keep the one from
 * the `--prod` run. Idempotent: a second run reports zero changes.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const DATABASE_ID = 'sahs-archives';
const BATCH_LIMIT = 400; // under Firestore's 500-write cap, with headroom
const REPORT_PATH = path.join(__dirname, '..', 'migration', 'artifact-type-report.csv');

// Must stay in step with ARTIFACT_TYPES and ALIASES in src/lib/artifactTypes.ts.
const ARTIFACT_TYPES = [
    'textile', 'photo', 'print', 'award/trophy', 'memorabilia', 'furniture', 'ceramics',
    'miscellaneous', 'technology', 'signs', 'jewelry', 'metal', 'glass', 'agriculture',
];
const ALIASES = { textiles: 'textile', printed: 'print', memorabilla: 'memorabilia', misc: 'miscellaneous' };

const PROD = process.argv.slice(2).includes('--prod');

admin.initializeApp({ projectId: 'sahs-archives' });
const db = admin.firestore();
db.settings({ databaseId: DATABASE_ID });

function normalize(value) {
    const key = String(value ?? '').trim().toLowerCase();
    if (!key) return null;
    if (ARTIFACT_TYPES.includes(key)) return key;
    return ALIASES[key] ?? null;
}

/** The first tag that names a type other than textile, if any. */
function typeFromTags(tags) {
    if (!Array.isArray(tags)) return null;
    for (const tag of tags) {
        const t = normalize(tag);
        if (t && t !== 'textile') return t;
    }
    return null;
}

function decide(data) {
    const stored = data.artifact_type;
    if (stored === 'textile') {
        const fromTag = typeFromTags(data.tags);
        if (fromTag) return { next: fromTag, reason: 'restored from tag' };
    }
    const next = normalize(stored);
    if (!next) return { next: null, reason: 'unrecognised — review by hand' };
    return { next, reason: next === stored ? 'unchanged' : 'respelled' };
}

function csvCell(v) {
    const s = Array.isArray(v) ? v.join('; ') : String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function run() {
    console.log(`Mode: ${PROD ? 'PRODUCTION WRITE' : 'DRY RUN (no writes)'}`);
    console.log(`Database: ${DATABASE_ID}\n`);

    const snap = await db.collection('archive_items').where('item_type', '==', 'Artifact').get();
    const rows = [];
    const writes = [];
    const byReason = {};
    const transitions = {};

    snap.forEach((doc) => {
        const data = doc.data();
        const { next, reason } = decide(data);
        byReason[reason] = (byReason[reason] || 0) + 1;
        if (reason === 'unchanged') return;
        rows.push([doc.id, data.artifact_id, data.title, data.artifact_type, next ?? '', reason, data.tags]);
        if (next) {
            writes.push((batch) => batch.update(doc.ref, { artifact_type: next }));
            const key = `${JSON.stringify(data.artifact_type)} → ${next}${reason === 'restored from tag' ? ' (from tag)' : ''}`;
            transitions[key] = (transitions[key] || 0) + 1;
        }
    });

    const header = ['doc_id', 'artifact_id', 'title', 'old_type', 'new_type', 'reason', 'tags'];
    fs.writeFileSync(REPORT_PATH, [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n');

    console.log(`Artifacts read: ${snap.size}`);
    for (const [reason, n] of Object.entries(byReason)) console.log(`  ${reason}: ${n}`);
    console.log('\nChanges:');
    for (const [k, n] of Object.entries(transitions).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);
    console.log(`\nReport: ${REPORT_PATH}`);

    if (!PROD) {
        console.log(`\nDry run — ${writes.length} items would change. Re-run with --prod to write.`);
        return;
    }
    for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
        const batch = db.batch();
        for (const op of writes.slice(i, i + BATCH_LIMIT)) op(batch);
        await batch.commit();
    }
    console.log(`\nWrote ${writes.length} items.`);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
