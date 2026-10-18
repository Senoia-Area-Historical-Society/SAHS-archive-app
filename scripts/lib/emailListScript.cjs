/**
 * The shared half of the scripts that write an address list into
 * `deployment_config` — set-setup-admins.cjs and set-support-admins.cjs.
 *
 * Both take the same arguments:
 *
 *   <email> [<email>...]   the new list; it replaces the old one
 *   --none                 an empty list (only where allowNone is set)
 *   --prod                 write to the real project
 *   --emulator             write to the local Firestore emulator
 *   --project <id>         default sahs-archives
 *   --database <id>        default sahs-archives
 *
 * With neither --prod nor --emulator it is a dry run: it reads and reports the
 * current list and writes nothing.
 *
 * `--emulator` targets the Firestore emulator at 127.0.0.1:8080, and the same
 * `sahs-archives` database the app uses there — see src/lib/firebase.ts.
 */

const admin = require('firebase-admin');

/**
 * @param {object} opts
 * @param {string} opts.docId      the deployment_config document to write
 * @param {string} opts.label      what the list is, for output ("setup admins")
 * @param {string} opts.usage      the script's own usage line
 * @param {boolean} [opts.allowNone]  whether --none (an empty list) is permitted
 */
function runEmailListScript({ docId, label, usage, allowNone = false }) {
    const args = process.argv.slice(2);
    const PROD = args.includes('--prod');
    const EMULATOR = args.includes('--emulator');
    const NONE = args.includes('--none');

    const flagValue = (name) => {
        const i = args.indexOf(name);
        return i === -1 ? undefined : args[i + 1];
    };
    const projectId = flagValue('--project') || 'sahs-archives';
    const databaseId = flagValue('--database') || 'sahs-archives';

    const flagValues = new Set([flagValue('--project'), flagValue('--database')]);
    const emails = args
        .filter((a) => !a.startsWith('--') && !flagValues.has(a))
        .map((a) => a.trim().toLowerCase());

    const fail = (message) => {
        console.error(message);
        process.exit(1);
    };
    if (NONE && !allowNone) fail(`--none is not supported here.\n${usage}`);
    if (NONE && emails.length > 0) fail('Pass addresses or --none, not both.');
    if (!NONE && emails.length === 0) fail(usage);
    const invalid = emails.filter((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
    if (invalid.length > 0) fail(`Not an email address: ${invalid.join(', ')}`);
    if (PROD && EMULATOR) fail('Pass --prod or --emulator, not both.');

    if (EMULATOR) {
        process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
    }

    admin.initializeApp({ projectId });
    const db = admin.firestore();
    db.settings({ databaseId });

    const main = async () => {
        const write = PROD || EMULATOR;
        const ref = db.collection('deployment_config').doc(docId);

        console.log(`Mode: ${PROD ? 'PRODUCTION WRITE' : EMULATOR ? 'EMULATOR WRITE' : 'DRY RUN (no writes)'}`);
        console.log(`Project: ${projectId}`);
        console.log(`Database: ${databaseId}`);
        console.log('');

        const snap = await ref.get();
        const current = snap.exists ? (snap.data().emails || []) : [];
        const show = (list) => (list.length ? list.join(', ') : '(none)');
        console.log(`Current ${label}: ${show(current)}`);
        console.log(`New ${label}:     ${show(emails)}`);

        if (write) {
            await ref.set({
                emails,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log('\nWritten.');
        } else {
            console.log('\nDry run — pass --prod or --emulator to write.');
        }
    };

    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = { runEmailListScript };
