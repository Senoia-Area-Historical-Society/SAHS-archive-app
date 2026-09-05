/**
 * Keeps an item's `is_private` in step with the collections it belongs to.
 *
 * ── The obligation this discharges ───────────────────────────────────────────
 *
 * `firestore.rules` now gates reads on `resource.data.is_private == false`, and
 * every public query filters on the same field. That made `is_private` a
 * *denormalised* value: an item is private if the curator marked it so, **or** if
 * any collection it sits in is private. `BrowseArchive` used to compute that
 * second half in the browser, from a collection-privacy map it built by reading
 * the whole `collections` list — but that list is no longer public, and the
 * browser is no longer where privacy is decided.
 *
 * Without something maintaining it, marking a collection private would leave its
 * items publicly readable, silently. `scripts/migrate-item-privacy-and-paperwork.cjs`
 * documented re-running it by hand as the stopgap. This replaces that with a
 * trigger, because the drift is in the exposing direction and a human remembering
 * is not a control.
 *
 * ── Why there is a second field ──────────────────────────────────────────────
 *
 * `is_private` holds the *effective* value, because that is what the rules and the
 * queries read. That alone cannot survive a collection going public again: once
 * inheritance has forced an item to `true`, nothing records whether the curator
 * had also marked it private independently. So the curator's own choice is kept
 * in `is_private_own`, and effective privacy is derived:
 *
 *     is_private = is_private_own || (any collection it belongs to is private)
 *
 * `is_private_own` is written lazily rather than migrated: when it is absent it
 * falls back to `is_private`, which is exactly right for the existing data — the
 * backfill reported *zero* items inheriting privacy from a collection, so every
 * current `is_private: true` is a genuine curator choice, not an inherited one.
 *
 * ── Loop safety ──────────────────────────────────────────────────────────────
 *
 * Both triggers write to `archive_items`, and the item trigger watches it. That
 * terminates because the second pass computes the same values and writes nothing:
 * an update is only issued when the stored values actually differ from the
 * computed ones.
 */

const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions");
const { getFirestore } = require("firebase-admin/firestore");
const { ownPrivacy, effectivePrivacy } = require("./collectionPrivacyRules");

const DATABASE = "sahs-archives";
const BATCH_LIMIT = 400;

const db = () => getFirestore(DATABASE);

/** Every collection id currently marked private. */
async function loadPrivateCollectionIds() {
    const snap = await db().collection("collections").get();
    const ids = new Set();
    snap.docs.forEach((d) => {
        if (d.data().is_private === true) ids.add(d.id);
    });
    return ids;
}

/**
 * Recomputes one item. Fires on every item write, so it also covers the case a
 * collection-level trigger cannot see: an item being *added to* a private
 * collection.
 */
exports.syncItemPrivacy = onDocumentWritten({
    document: "archive_items/{itemId}",
    database: DATABASE,
    maxInstances: 10,
}, async (event) => {
    const after = event.data?.after.data();
    if (!after) return; // deleted
    const before = event.data?.before.exists ? event.data.before.data() : undefined;

    const privateCollectionIds = await loadPrivateCollectionIds();
    const own = ownPrivacy(before, after);
    const effective = effectivePrivacy(own, after, privateCollectionIds);

    if (after.is_private === effective && after.is_private_own === own) return;

    await event.data.after.ref.update({ is_private: effective, is_private_own: own });
    logger.info(
        `syncItemPrivacy: ${event.params.itemId} own=${own} effective=${effective}` +
        (effective !== own ? " (inherited from a private collection)" : "")
    );
});

/**
 * Recomputes every member item when a collection's privacy flips.
 *
 * Both membership shapes need their own query — Firestore cannot OR across a
 * scalar equality and an array-contains in one, and `or()` is a client-SDK
 * construct. Results are merged by document id.
 */
exports.syncCollectionPrivacy = onDocumentWritten({
    document: "collections/{collectionId}",
    database: DATABASE,
    maxInstances: 10,
}, async (event) => {
    const before = event.data?.before.exists ? event.data.before.data() : undefined;
    const after = event.data?.after.data();

    const wasPrivate = before?.is_private === true;
    const isPrivate = after?.is_private === true;
    // A deleted collection releases its members, so treat that as "now public".
    if (before !== undefined && wasPrivate === isPrivate) return;

    const id = event.params.collectionId;
    const privateCollectionIds = await loadPrivateCollectionIds();

    const items = new Map();
    for (const q of [
        db().collection("archive_items").where("collection_id", "==", id),
        db().collection("archive_items").where("collection_ids", "array-contains", id),
    ]) {
        const snap = await q.get();
        snap.docs.forEach((d) => items.set(d.id, d));
    }

    const pending = [];
    for (const doc of items.values()) {
        const data = doc.data();
        const own = ownPrivacy(undefined, data);
        const effective = effectivePrivacy(own, data, privateCollectionIds);
        if (data.is_private === effective && data.is_private_own === own) continue;
        pending.push({ ref: doc.ref, is_private: effective, is_private_own: own });
    }

    for (let i = 0; i < pending.length; i += BATCH_LIMIT) {
        const batch = db().batch();
        for (const p of pending.slice(i, i + BATCH_LIMIT)) {
            batch.update(p.ref, { is_private: p.is_private, is_private_own: p.is_private_own });
        }
        await batch.commit();
    }

    logger.info(
        `syncCollectionPrivacy: ${id} private=${isPrivate} — ` +
        `${items.size} member item(s), ${pending.length} updated`
    );
});
