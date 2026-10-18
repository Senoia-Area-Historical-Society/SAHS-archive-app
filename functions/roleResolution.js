/**
 * Who holds which role, as pure functions — the decisions behind
 * functions/userRoles.js and functions/restrictedMedia.js.
 *
 * DELIBERATELY FREE OF IMPORTS so `src/test/` can exercise them; see the same
 * split in collectionPrivacyRules.js.
 *
 * A role comes from one of two places:
 *  - `user_roles/{email}`, granted by the museum's own admins in Admin Settings.
 *  - `deployment_config/support`, the support admins — the archive's developers,
 *    admitted by default so they can help with support, disclosed in Admin
 *    Settings, and removable with scripts/set-support-admins.cjs. They replace the
 *    two addresses that used to be hardcoded into every rules file.
 *
 * A support admin is an admin whatever user_roles says, so that taking someone's
 * curator role away cannot quietly strip support access too, and the reverse.
 */

const VALID_ROLES = ["admin", "curator"];

/** A support list as stored, normalised to lowercase. Anything malformed is empty. */
function supportEmailsOf(data) {
    const emails = data && data.emails;
    return Array.isArray(emails) ? emails.map((e) => String(e).toLowerCase()) : [];
}

/**
 * The role an address should carry on its Auth claim, or null for none.
 *
 * @param {string} email
 * @param {string[]} supportEmails  from supportEmailsOf()
 * @param {unknown} grantedRole      the `role` field of user_roles/{email}, if any
 */
function resolveRole(email, supportEmails, grantedRole) {
    if (supportEmails.includes(email.toLowerCase())) return "admin";
    return VALID_ROLES.includes(grantedRole) ? grantedRole : null;
}

/**
 * Addresses added to or removed from the support list by one write — the only
 * ones whose claims that write can have changed.
 */
function changedSupportEmails(beforeData, afterData) {
    const before = new Set(supportEmailsOf(beforeData));
    const after = new Set(supportEmailsOf(afterData));
    return [
        ...[...after].filter((e) => !before.has(e)),
        ...[...before].filter((e) => !after.has(e)),
    ];
}

module.exports = { VALID_ROLES, supportEmailsOf, resolveRole, changedSupportEmails };
