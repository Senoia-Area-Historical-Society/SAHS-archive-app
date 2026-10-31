/**
 * The privacy decisions behind functions/collectionPrivacy.js, as pure functions.
 *
 * DELIBERATELY FREE OF IMPORTS so `src/test/` can exercise them. The trigger half
 * pulls in firebase-functions and firebase-admin; a test importing that would drag
 * both into the site's build. Same split as the website's ticketEmailContent.ts /
 * ticketEmail.ts pair — see the CI trap documented there.
 *
 * ── Who writes what ──────────────────────────────────────────────────────────
 *
 * `is_private_own` is the curator's choice, and only the client writes it. The
 * triggers never change an existing value; they derive `is_private` from it.
 *
 * An earlier version had the client write `is_private` alone and the trigger infer
 * intent from the shape of the change: "`is_private` moved and `is_private_own`
 * did not" meant a curator had acted. But that is also exactly the shape of the
 * collection trigger's own inheritance write. So when a collection went private,
 * the item trigger recorded `is_private_own: true` for every member, and the
 * items stayed private after the collection went public again. A change event
 * carries no author, so the inference cannot be made reliably — the field has to
 * be written explicitly by whoever owns it.
 *
 * src/lib/itemPrivacy.ts mirrors this module for the client, which writes the
 * effective value up front so an item never has a public window while the
 * trigger catches up. Keep the two in step.
 */

/** Artifact statuses that hide an item whatever the curator chose. */
const FORCED_PRIVATE_STATUSES = ["pending", "deaccessioned"];

/**
 * Every collection id that could make an item private: `collection_ids` AND the
 * legacy `collection_id`, not one or the other.
 *
 * The membership precedence used elsewhere (BrowseArchive, ItemDetail, the
 * migration script) ignores `collection_id` once `collection_ids` is non-empty.
 * That is tolerable for listing but wrong for privacy, and this module used it.
 * An item held in private collection P through the legacy field alone, then added
 * to public Q with `arrayUnion`, came out as `collection_ids: ['Q']` with
 * `collection_id: 'P'` — and became public. When the two fields disagree, the
 * restrictive reading is the safe one. scripts/reconcile-media-visibility.cjs
 * already reads both this way.
 */
function privacyCollectionIdsOf(data) {
    const ids = new Set(Array.isArray(data.collection_ids) ? data.collection_ids : []);
    if (data.collection_id) ids.add(data.collection_id);
    return [...ids];
}

/**
 * The curator's own privacy choice for an item.
 *
 * `is_private_own` when it is set. Documents predating the field fall back to
 * `is_private`, which is right for them: the backfill reported *zero* items
 * inheriting privacy from a collection, so every stored `is_private: true` on such
 * a document is a genuine curator choice. The triggers write the fallback into
 * `is_private_own` before they first change `is_private` (see ownPrivacyPatch), so
 * the fallback is never read from a value they wrote themselves.
 */
function ownPrivacy(data) {
    if (typeof data.is_private_own === "boolean") return data.is_private_own;
    return data.is_private === true;
}

/**
 * Pending and deaccessioned artifacts are private regardless of the curator's
 * choice — the editors disable the toggle for them. Kept out of `is_private_own`,
 * so accessioning an artifact restores whatever the curator had chosen.
 *
 * `item_type` is trimmed because some stored values carry stray whitespace, which
 * EditItem also trims on load.
 */
function forcedPrivacy(data) {
    const type = typeof data.item_type === "string" ? data.item_type.trim() : "";
    return type === "Artifact" && FORCED_PRIVATE_STATUSES.includes(data.collection_status);
}

/** `own` OR forced by artifact status OR any collection it belongs to being private. */
function effectivePrivacy(own, data, privateCollectionIds) {
    return own ||
        forcedPrivacy(data) ||
        privacyCollectionIdsOf(data).some((cid) => privateCollectionIds.has(cid));
}

/**
 * The update a trigger should make to bring `data` in line, or null if it is
 * already correct.
 *
 * Writes `is_private` only, plus `is_private_own` when the document lacks it — the
 * one moment the fallback has to be frozen, because the write is about to change
 * the `is_private` it falls back to. An existing `is_private_own` is never
 * touched: it belongs to the curator.
 *
 * Computed from current state alone, so applying it twice is the same as applying
 * it once. That is what makes the triggers safe to retry.
 */
function privacyPatch(data, privateCollectionIds) {
    const own = ownPrivacy(data);
    const effective = effectivePrivacy(own, data, privateCollectionIds);
    const patch = {};
    if (data.is_private !== effective) patch.is_private = effective;
    if (typeof data.is_private_own !== "boolean" && patch.is_private !== undefined) {
        patch.is_private_own = own;
    }
    return Object.keys(patch).length > 0 ? patch : null;
}

module.exports = {
    privacyCollectionIdsOf,
    ownPrivacy,
    forcedPrivacy,
    effectivePrivacy,
    privacyPatch,
};
