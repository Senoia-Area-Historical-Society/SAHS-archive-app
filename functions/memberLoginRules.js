/**
 * The decisions behind functions/memberLogins.js, as pure functions.
 *
 * DELIBERATELY FREE OF IMPORTS so `src/test/` can exercise them — the same split
 * as collectionPrivacyRules.js / collectionPrivacy.js.
 *
 * A member record can list a secondary email: a spouse or family member who
 * shares the membership. That address has no record of its own, and a member
 * cannot search the members collection for it, so member_logins/{address} =
 * { memberId } is kept as the way to find the record it belongs to. AuthContext
 * reads it at sign-in and firestore.rules follows it in isActiveMemberAddress().
 */

/** The secondary email on a member record, lowercased, or null. */
function secondaryEmailOf(record) {
    const email = record && typeof record.secondaryEmail === "string"
        ? record.secondaryEmail.trim().toLowerCase()
        : "";
    return email || null;
}

/**
 * What to do to member_logins when members/{memberId} goes from `before` to
 * `after` (either null when the record is created or deleted).
 *
 * `remove` is the address that stops being a login for this record. Its pointer
 * is deleted only while it still points here: when an admin changes a member's
 * address, Admin Settings writes the new record and deletes the old one, and
 * the old record's delete must not remove the pointer the new one just set.
 *
 * `set` is the address that should point here. It is set on every write, not
 * only when the address changes, so a pointer that is missing — a record from
 * before this existed, or a failed write — is put back the next time the record
 * is saved.
 */
function memberLoginChanges(before, after) {
    const was = secondaryEmailOf(before);
    const now = secondaryEmailOf(after);
    return {
        remove: was && was !== now ? was : null,
        set: now,
    };
}

module.exports = { secondaryEmailOf, memberLoginChanges };
