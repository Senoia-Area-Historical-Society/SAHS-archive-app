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
 * Several addresses may be given. The list is replaced, not appended to. The
 * remaining options are in scripts/lib/emailListScript.cjs.
 *
 * Idempotent: running it again with the same addresses changes nothing.
 */

const { runEmailListScript } = require('./lib/emailListScript.cjs');

runEmailListScript({
    docId: 'bootstrap',
    label: 'setup admins',
    usage: 'Usage: node scripts/set-setup-admins.cjs <email> [<email>...] [--prod | --emulator]',
});
