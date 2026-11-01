/**
 * Creates member_logins/{secondary email} = { memberId } for every member record
 * that lists a secondary email.
 *
 * ── Why this is needed ───────────────────────────────────────────────────────
 *
 * A secondary email is a spouse or family member sharing a membership. Their
 * address has no record of its own, and only staff may search the members
 * collection, so they were never recognised as members: sign-in rejected them,
 * and the rules refused them every member write. member_logins is how the app
 * and firestore.rules now find the record a secondary address belongs to.
 *
 * functions/memberLogins.js keeps those pointers in step from now on, but it
 * runs only when a member record is written. Records that already had a
 * secondary email need their pointer created once — that is this script.
 *
 * It uses the same decision as the function (functions/memberLoginRules.js),
 * and it also reports pointers whose record no longer lists the address. Those
 * grant nothing (the rules check the record), and are deleted only with --prod.
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *
 *   node scripts/backfill-member-logins.cjs           # DRY RUN (default)
 *   node scripts/backfill-member-logins.cjs --prod    # apply
 *
 * Idempotent: a second run reports zero changes.
 */

const admin = require('firebase-admin');
const { secondaryEmailOf } = require('../functions/memberLoginRules');

const DATABASE_ID = 'sahs-archives';
const PROD = process.argv.slice(2).includes('--prod');

admin.initializeApp({ projectId: 'sahs-archives' });
const db = admin.firestore();
db.settings({ databaseId: DATABASE_ID });

async function run() {
    console.log(`Mode: ${PROD ? 'PRODUCTION WRITE' : 'DRY RUN (no writes)'}`);
    console.log(`Database: ${DATABASE_ID}\n`);

    const [members, logins] = await Promise.all([
        db.collection('members').get(),
        db.collection('member_logins').get(),
    ]);

    const existing = new Map(logins.docs.map(d => [d.id, d.data().memberId]));
    const wanted = new Map();
    let toSet = 0;
    let correct = 0;
    let stale = 0;

    for (const record of members.docs) {
        const email = secondaryEmailOf(record.data());
        if (!email) continue;
        if (wanted.has(email)) {
            console.log(`  CLASH    ${email} is the secondary email on both ${wanted.get(email)} and ${record.id}; pointing at ${record.id}`);
        }
        wanted.set(email, record.id);
    }

    for (const [email, memberId] of wanted) {
        if (existing.get(email) === memberId) {
            correct++;
            continue;
        }
        toSet++;
        console.log(`  SET      ${email} -> ${memberId}`);
        if (PROD) {
            await db.collection('member_logins').doc(email).set({ memberId, updatedAt: new Date().toISOString() });
        }
    }

    for (const [email, memberId] of existing) {
        if (wanted.has(email)) continue;
        stale++;
        console.log(`  STALE    ${email} -> ${memberId} (that record no longer lists it)`);
        if (PROD) {
            await db.collection('member_logins').doc(email).delete();
        }
    }

    console.log('\nResults');
    console.log(`  member records                ${members.size}`);
    console.log(`  with a secondary email        ${wanted.size}`);
    console.log(`  pointer already correct       ${correct}`);
    console.log(`  pointer ${PROD ? 'set          ' : 'to set       '}         ${toSet}`);
    console.log(`  stale pointer ${PROD ? 'deleted' : 'to delete'}       ${stale}`);
    if (!PROD && (toSet || stale)) console.log('\nDry run — re-run with --prod to apply.');
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
