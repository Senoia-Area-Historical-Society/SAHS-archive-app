/**
 * Sets who may run first-run setup on a fresh archive.
 *
 * ── Why this is needed ───────────────────────────────────────────────────────
 *
 * On an empty archive the first person to sign in claims admin in the Setup
 * Wizard (src/pages/SetupWizard.tsx). That self-grant is the most dangerous
 * write the rules allow, so `firestore.rules` admits it only for an address in
 * `deployment_config/bootstrap` (see isBootstrapAdmin()). The app cannot read or
 * write that document; only a script with server credentials can, which is what
 * makes the list trustworthy.
 *
 * It replaces a hardcoded `@senoiahistory.com` match, so that another museum can
 * install this code without editing the rules.
 *
 * Once setup is complete the list has no further effect — every clause that
 * reads it is also gated on `!isSetupComplete()`.
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *
 *   node scripts/set-setup-admins.cjs director@museum.org            # DRY RUN
 *   node scripts/set-setup-admins.cjs director@museum.org --prod     # apply
 *   node scripts/set-setup-admins.cjs director@museum.org --emulator # local
 *
 * Several addresses may be given. The list is replaced, not appended to.
 *
 * `--emulator` writes to the local Firestore emulator (127.0.0.1:8080) and the
 * default database, which is what `npm run dev:emulators` reads — see
 * src/lib/firebase.ts. Otherwise the target is the `sahs-archives` project and its
 * named `sahs-archives` database; `--project` and `--database` override either.
 *
 * Idempotent: running it again with the same addresses changes nothing.
 */

const admin = require('firebase-admin');

const args = process.argv.slice(2);
const PROD = args.includes('--prod');
const EMULATOR = args.includes('--emulator');

function flagValue(name) {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
}

const PROJECT_ID = flagValue('--project') || 'sahs-archives';
const DATABASE_ID = flagValue('--database') || (EMULATOR ? '(default)' : 'sahs-archives');

const flagValues = new Set([flagValue('--project'), flagValue('--database')]);
const emails = args
    .filter((a) => !a.startsWith('--') && !flagValues.has(a))
    .map((a) => a.trim().toLowerCase());

if (emails.length === 0) {
    console.error('Usage: node scripts/set-setup-admins.cjs <email> [<email>...] [--prod | --emulator]');
    process.exit(1);
}
const invalid = emails.filter((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
if (invalid.length > 0) {
    console.error(`Not an email address: ${invalid.join(', ')}`);
    process.exit(1);
}
if (PROD && EMULATOR) {
    console.error('Pass --prod or --emulator, not both.');
    process.exit(1);
}

if (EMULATOR) {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
}

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();
db.settings({ databaseId: DATABASE_ID });

async function main() {
    const write = PROD || EMULATOR;
    const ref = db.collection('deployment_config').doc('bootstrap');

    console.log(`Mode: ${PROD ? 'PRODUCTION WRITE' : EMULATOR ? 'EMULATOR WRITE' : 'DRY RUN (no writes)'}`);
    console.log(`Project: ${PROJECT_ID}`);
    console.log(`Database: ${DATABASE_ID}`);
    console.log('');

    const snap = await ref.get();
    const current = snap.exists ? (snap.data().emails || []) : [];
    console.log(`Current setup admins: ${current.length ? current.join(', ') : '(none)'}`);
    console.log(`New setup admins:     ${emails.join(', ')}`);

    if (write) {
        await ref.set({
            emails,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log('\nWritten.');
    } else {
        console.log('\nDry run — pass --prod or --emulator to write.');
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
