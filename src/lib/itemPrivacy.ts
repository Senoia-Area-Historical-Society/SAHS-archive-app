/**
 * Item privacy as the editors write it.
 *
 * Two fields, two owners (see the Privacy model in CLAUDE.md):
 *
 *   - `is_private_own` is the curator's choice. Only the client writes it, and it
 *     must always be written explicitly — the triggers in
 *     functions/collectionPrivacy.js derive from it and never change it.
 *   - `is_private` is the effective value the rules and every public query read.
 *     The triggers maintain it, but the client writes it too, computed the same
 *     way, so an item is never public for the moments before the trigger runs.
 *
 * This mirrors functions/collectionPrivacyRules.js, which the browser bundle
 * cannot import (it is CommonJS). src/test/collectionPrivacy.test.ts checks the
 * two agree — keep them in step.
 */

import type { ArchiveItem, Collection } from '../types/database';

type PrivacyFields = Pick<ArchiveItem, 'is_private' | 'is_private_own'>;
type MembershipFields = Pick<ArchiveItem, 'collection_id' | 'collection_ids'>;
type StatusFields = { item_type?: string | null; collection_status?: string | null };

/**
 * The curator's own choice, falling back to `is_private` for documents that
 * predate `is_private_own` — the same fallback the triggers use.
 */
export function ownPrivacyOf(item: PrivacyFields): boolean {
    if (typeof item.is_private_own === 'boolean') return item.is_private_own;
    return item.is_private === true;
}

/**
 * Pending and deaccessioned artifacts are private whatever the curator chose. This
 * is never written into `is_private_own`, so accessioning restores the choice.
 */
export function isForcedPrivate(item: StatusFields): boolean {
    const type = typeof item.item_type === 'string' ? item.item_type.trim() : '';
    return type === 'Artifact' &&
        (item.collection_status === 'pending' || item.collection_status === 'deaccessioned');
}

/**
 * Both membership fields, merged. Privacy reads them as a union, so a stale legacy
 * `collection_id` pointing at a private collection still counts.
 */
export function privacyCollectionIdsOf(item: MembershipFields): string[] {
    const ids = new Set(item.collection_ids ?? []);
    if (item.collection_id) ids.add(item.collection_id);
    return [...ids];
}

/** The private collections, among `collections`, that an item sits in. */
export function privateCollectionsOf(
    item: MembershipFields,
    collections: Pick<Collection, 'id' | 'title' | 'is_private'>[]
): Pick<Collection, 'id' | 'title' | 'is_private'>[] {
    const ids = new Set(privacyCollectionIdsOf(item));
    return collections.filter((c) => c.is_private === true && ids.has(c.id));
}

/** `own` OR forced by artifact status OR in any private collection. */
export function effectivePrivacy(
    own: boolean,
    item: MembershipFields & StatusFields,
    privateCollectionIds: Set<string>
): boolean {
    return own ||
        isForcedPrivate(item) ||
        privacyCollectionIdsOf(item).some((id) => privateCollectionIds.has(id));
}

/** Ids of the private collections in a loaded collection list. */
export function privateCollectionIdSet(collections: Pick<Collection, 'id' | 'is_private'>[]): Set<string> {
    return new Set(collections.filter((c) => c.is_private === true).map((c) => c.id));
}

/**
 * The membership fields after adding an item to `collectionId` or removing it,
 * with the legacy `collection_id` folded into `collection_ids` so the two fields
 * agree.
 *
 * Writing `collection_ids` alone (with `arrayUnion` / `arrayRemove`) is what let
 * them drift: an item held in private P through `collection_id` alone and then
 * added to public Q became `collection_ids: ['Q']`, which every reader that
 * prefers `collection_ids` took to mean "only in Q". `collection_id` follows
 * EditItem's convention — the first of the ids, or null.
 */
export function membershipPatch(
    item: MembershipFields,
    collectionId: string,
    action: 'add' | 'remove'
): { collection_ids: string[]; collection_id: string | null } {
    const ids = item.collection_ids ? [...item.collection_ids] : [];
    if (item.collection_id && !ids.includes(item.collection_id)) ids.push(item.collection_id);

    const next = action === 'add'
        ? (ids.includes(collectionId) ? ids : [...ids, collectionId])
        : ids.filter((id) => id !== collectionId);

    return { collection_ids: next, collection_id: next[0] ?? null };
}
