/**
 * Sets the support admins: the archive's developers, who hold admin access to
 * this archive so they can help with support.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * Two addresses used to be hardcoded as permanent admins in firestore.rules,
 * storage.rules, functions/restrictedMedia.js and AuthContext. That was fine for
 * one society, but every museum installing the code would have handed admin
 * access to people outside it without being told, and could not remove it
 * without editing the rules.
 *
 * They now live in `deployment_config/support`, which:
 *  - is admitted as admin by firestore.rules (isSupportAdmin) and, via the role
 *    claim functions/userRoles.js sets, by storage.rules and restrictedMedia.js;
 *  - is shown to the museum's staff in Admin Settings;
 *  - cannot be changed from the app — only by this script, with server
 *    credentials.
 *
 * Removing an address revokes its access: syncSupportAdminClaims clears the
 * claim as soon as the list is written. A token already issued stays valid for
 * up to an hour, as with any claim change.
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *
 *   node scripts/set-support-admins.cjs a@x.org b@x.org            # DRY RUN
 *   node scripts/set-support-admins.cjs a@x.org b@x.org --prod     # apply
 *   node scripts/set-support-admins.cjs --none --prod              # remove all
 *   node scripts/set-support-admins.cjs a@x.org --emulator         # local
 *
 * The list is replaced, not appended to. The remaining options are in
 * scripts/lib/emailListScript.cjs.
 *
 * Idempotent: running it again with the same addresses changes nothing.
 */

const { runEmailListScript } = require('./lib/emailListScript.cjs');

runEmailListScript({
    docId: 'support',
    label: 'support admins',
    usage: 'Usage: node scripts/set-support-admins.cjs <email> [<email>...] | --none  [--prod | --emulator]',
    allowNone: true,
});
