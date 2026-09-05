/**
 * The privacy constraint for public reads of `archive_items` and `collections`.
 *
 * ── Why every public query needs this ────────────────────────────────────────
 *
 * Privacy is currently enforced only in the browser: `BrowseArchive` and
 * `SearchArchive` download the entire collection and `.filter()` private items
 * out, and `ItemDetail` filters its related-item results the same way. Anyone
 * querying Firestore directly reads everything, because the rule is
 * `allow read: if true`.
 *
 * Closing that means the rule becomes
 * `allow read: if resource.data.is_private == false || isSAHSUser()`. Firestore
 * evaluates a rule against every document a *list* query would return and rejects
 * the whole query if any fails — so a public query must constrain `is_private`
 * itself, or it is refused outright. This helper is that constraint, in one place
 * so the rule and the queries cannot drift apart.
 *
 * ── Two things that make this dangerous to get wrong ─────────────────────────
 *
 * 1. **Firestore does not match documents where the field is absent.** A query
 *    filtering on `is_private` silently skips any document without it. That is why
 *    the backfill in `scripts/migrate-item-privacy-and-paperwork.cjs` had to run
 *    first — 1,302 of 1,533 items had no such field, and filtering before the
 *    backfill would have hidden 85% of the archive.
 *
 * 2. **Every shape needs a composite index.** `where('is_private','==',false)`
 *    combined with any other filter or `orderBy` requires one, and
 *    `firestore.indexes.json` is deployed *declaratively* — it is the authority,
 *    and an index must be listed and deployed before a query depends on it. Adding
 *    a new filtered query means adding its index there too.
 *
 * Staff read unfiltered: the rule's `|| isSAHSUser()` admits them, so passing
 * `true` here returns no constraint at all and the query shape is unchanged. That
 * is deliberate — it keeps staff off the composite indexes entirely and means the
 * admin pages need no edits.
 */

import { where, type QueryConstraint } from 'firebase/firestore';

/**
 * Spread into a `query(...)` call: `query(col, ...publicOnly(isSAHSUser), limit(20))`.
 *
 * Returns an empty array for staff so the call site reads the same either way and
 * no caller has to branch.
 */
export function publicOnly(isSAHSUser: boolean): QueryConstraint[] {
    return isSAHSUser ? [] : [where('is_private', '==', false)];
}
