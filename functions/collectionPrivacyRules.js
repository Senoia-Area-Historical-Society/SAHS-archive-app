/**
 * The privacy decisions behind functions/collectionPrivacy.js, as pure functions.
 *
 * DELIBERATELY FREE OF IMPORTS so `src/test/` can exercise them. The trigger half
 * pulls in firebase-functions and firebase-admin; a test importing that would drag
 * both into the site's build. Same split as the website's ticketEmailContent.ts /
 * ticketEmail.ts pair — see the CI trap documented there.
 *
 * The logic worth testing is the intent rule: `is_private` is the *effective*
 * value, so the trigger has to tell "the curator just changed this" from "we just
 * changed this", or its own write looks like a new intent and inheritance can
 * never be undone.
 */

/**
 * The collection ids an item belongs to.
 *
 * Both shapes are live: `collection_ids` is the current multi-collection field and
 * `collection_id` the older single one. Mirrors `collectionIdsOf` in
 * scripts/migrate-item-privacy-and-paperwork.cjs and the precedence BrowseArchive
 * used — keep the three in step.
 */
function collectionIdsOf(data) {
    if (Array.isArray(data.collection_ids) && data.collection_ids.length > 0) return data.collection_ids;
    return data.collection_id ? [data.collection_id] : [];
}

/**
 * The curator's own privacy choice for an item.
 *
 * `before` distinguishes "the client just set is_private" from "we set it". When
 * `is_private` moved but `is_private_own` did not, the write came from the editor
 * expressing a new intent, and that is what to record. Otherwise the stored
 * `is_private_own` stands, falling back to `is_private` for documents that predate
 * the field.
 */
function ownPrivacy(before, after) {
    const clientChangedIsPrivate =
        before !== undefined &&
        before.is_private !== after.is_private &&
        before.is_private_own === after.is_private_own;

    if (clientChangedIsPrivate) return after.is_private === true;
    if (typeof after.is_private_own === "boolean") return after.is_private_own;
    return after.is_private === true;
}

/** `is_private_own` OR any collection it belongs to being private. */
function effectivePrivacy(own, data, privateCollectionIds) {
    return own || collectionIdsOf(data).some((cid) => privateCollectionIds.has(cid));
}

module.exports = { collectionIdsOf, ownPrivacy, effectivePrivacy };
