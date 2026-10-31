import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain CommonJS, deliberately untyped and import-free so this
// test does not drag firebase-functions into the site build. See the module header.
import * as rules from '../../functions/collectionPrivacyRules.js';
import * as client from '../lib/itemPrivacy';

const { ownPrivacy, forcedPrivacy, effectivePrivacy, privacyCollectionIdsOf, privacyPatch } = rules;

/**
 * `is_private` is the *effective* value — what firestore.rules and every public
 * query read — so it is a denormalised field: an item is private if the curator
 * said so, if it is a pending or deaccessioned artifact, or if any collection it
 * belongs to is. `functions/collectionPrivacy.js` maintains it.
 *
 * The curator's choice is `is_private_own`, which the client always writes and the
 * triggers never change. The earlier design inferred it from the shape of a change
 * ("is_private moved, is_private_own did not"), which is also the shape of the
 * collection trigger's own inheritance write — so a collection going private
 * pinned its items private for good. These tests pin the fix: inheritance is
 * reversible.
 */

const PRIVATE_COLLECTIONS = new Set(['privcol']);
const NONE = new Set<string>();

/** Applies a trigger's patch the way Firestore would. */
const apply = (data: Record<string, unknown>, patch: Record<string, unknown> | null) =>
    patch ? { ...data, ...patch } : data;

describe('ownPrivacy — what the curator actually chose', () => {
    it('reads is_private_own when it is set', () => {
        expect(ownPrivacy({ is_private: true, is_private_own: false })).toBe(false);
        expect(ownPrivacy({ is_private: false, is_private_own: true })).toBe(true);
    });

    // No is_private_own yet. Correct for existing data: the backfill reported zero
    // items inheriting privacy, so every stored `is_private` is a genuine choice.
    it('falls back to is_private on documents predating the field', () => {
        expect(ownPrivacy({ is_private: true })).toBe(true);
        expect(ownPrivacy({ is_private: false })).toBe(false);
        expect(ownPrivacy({})).toBe(false);
    });
});

describe('inheritance is reversible', () => {
    /**
     * The bug. Collection goes private: the collection trigger writes
     * is_private: true and leaves is_private_own alone. The item trigger then
     * runs on that write — and must not read it as the curator choosing private.
     */
    it('releases an item when its collection goes public again', () => {
        let item: Record<string, unknown> = { collection_ids: ['col'], is_private: false, is_private_own: false };

        // Collection trigger: col is now private.
        item = apply(item, privacyPatch(item, new Set(['col'])));
        expect(item).toMatchObject({ is_private: true, is_private_own: false });

        // Item trigger, firing on that write: nothing further to do.
        expect(privacyPatch(item, new Set(['col']))).toBeNull();

        // Collection trigger: col is public again.
        item = apply(item, privacyPatch(item, NONE));
        expect(item).toMatchObject({ is_private: false, is_private_own: false });
    });

    it('freezes the fallback before inheriting, on documents predating is_private_own', () => {
        let item: Record<string, unknown> = { collection_ids: ['col'], is_private: false };

        item = apply(item, privacyPatch(item, new Set(['col'])));
        // Without is_private_own recorded here, the fallback would later read the
        // inherited `true` back as the curator's choice.
        expect(item).toMatchObject({ is_private: true, is_private_own: false });

        item = apply(item, privacyPatch(item, NONE));
        expect(item.is_private).toBe(false);
    });

    it('keeps a curator-private item private when its collection goes public', () => {
        let item: Record<string, unknown> = { collection_ids: ['col'], is_private: true, is_private_own: true };
        item = apply(item, privacyPatch(item, new Set(['col'])));
        item = apply(item, privacyPatch(item, NONE));
        expect(item).toMatchObject({ is_private: true, is_private_own: true });
    });
});

describe('privacyPatch — what a trigger writes', () => {
    it('never changes an existing is_private_own', () => {
        const patch = privacyPatch({ is_private: true, is_private_own: false }, NONE);
        expect(patch).toEqual({ is_private: false });
    });

    it('writes nothing when the item is already correct, so it is safe to retry', () => {
        const item = { collection_ids: ['privcol'], is_private: true, is_private_own: false };
        expect(privacyPatch(item, PRIVATE_COLLECTIONS)).toBeNull();
        const once = apply({ collection_ids: ['privcol'], is_private: false, is_private_own: false },
            privacyPatch({ collection_ids: ['privcol'], is_private: false, is_private_own: false }, PRIVATE_COLLECTIONS));
        expect(privacyPatch(once, PRIVATE_COLLECTIONS)).toBeNull();
    });

    it('honours the curator flipping is_private_own', () => {
        // The client writes both fields; the trigger agrees and does nothing.
        expect(privacyPatch({ is_private: true, is_private_own: true }, NONE)).toBeNull();
        // A stale effective value is corrected from is_private_own.
        expect(privacyPatch({ is_private: false, is_private_own: true }, NONE)).toEqual({ is_private: true });
    });

    it('does not record is_private_own when is_private is not changing', () => {
        expect(privacyPatch({ is_private: false }, NONE)).toBeNull();
    });
});

describe('forcedPrivacy — pending and deaccessioned artifacts', () => {
    it('forces pending and deaccessioned artifacts private', () => {
        expect(forcedPrivacy({ item_type: 'Artifact', collection_status: 'pending' })).toBe(true);
        expect(forcedPrivacy({ item_type: 'Artifact', collection_status: 'deaccessioned' })).toBe(true);
        expect(forcedPrivacy({ item_type: ' Artifact ', collection_status: 'pending' })).toBe(true);
    });

    it('leaves other statuses and other item types alone', () => {
        expect(forcedPrivacy({ item_type: 'Artifact', collection_status: 'permanent' })).toBe(false);
        expect(forcedPrivacy({ item_type: 'Artifact', collection_status: 'loan' })).toBe(false);
        expect(forcedPrivacy({ item_type: 'Document', collection_status: 'pending' })).toBe(false);
    });

    it('keeps the force out of is_private_own, so accessioning restores the choice', () => {
        let item: Record<string, unknown> = {
            item_type: 'Artifact', collection_status: 'pending', is_private: true, is_private_own: false,
        };
        expect(privacyPatch(item, NONE)).toBeNull();
        item = { ...item, collection_status: 'permanent' };
        expect(privacyPatch(item, NONE)).toEqual({ is_private: false });
    });

    it('stops the trigger making a pending artifact public', () => {
        expect(privacyPatch(
            { item_type: 'Artifact', collection_status: 'pending', is_private: false, is_private_own: false }, NONE,
        )).toEqual({ is_private: true });
    });
});

describe('effectivePrivacy — intent plus inheritance', () => {
    it('makes a public item private inside a private collection', () => {
        expect(effectivePrivacy(false, { collection_ids: ['privcol'] }, PRIVATE_COLLECTIONS)).toBe(true);
    });

    it('leaves a public item public in a public collection', () => {
        expect(effectivePrivacy(false, { collection_ids: ['pubcol'] }, PRIVATE_COLLECTIONS)).toBe(false);
    });

    it('keeps a privately-marked item private wherever it sits', () => {
        expect(effectivePrivacy(true, { collection_ids: ['pubcol'] }, PRIVATE_COLLECTIONS)).toBe(true);
        expect(effectivePrivacy(true, {}, PRIVATE_COLLECTIONS)).toBe(true);
    });

    it('honours the legacy single collection_id field', () => {
        expect(effectivePrivacy(false, { collection_id: 'privcol' }, PRIVATE_COLLECTIONS)).toBe(true);
    });

    /**
     * Item in private P through the legacy field only, then added to public Q by
     * arrayUnion: `collection_ids: ['Q']`, `collection_id: 'P'`. Membership
     * precedence reads that as "only in Q"; privacy must not.
     */
    it('honours a legacy collection_id that collection_ids does not repeat', () => {
        expect(effectivePrivacy(false, { collection_ids: ['pubcol'], collection_id: 'privcol' }, PRIVATE_COLLECTIONS)).toBe(true);
    });

    it('treats an item in no collection as uninherited', () => {
        expect(effectivePrivacy(false, {}, PRIVATE_COLLECTIONS)).toBe(false);
    });
});

describe('privacyCollectionIdsOf — both membership fields, merged', () => {
    it('unions collection_ids and collection_id', () => {
        expect(privacyCollectionIdsOf({ collection_ids: ['a', 'b'], collection_id: 'c' })).toEqual(['a', 'b', 'c']);
        expect(privacyCollectionIdsOf({ collection_ids: ['a'], collection_id: 'a' })).toEqual(['a']);
        expect(privacyCollectionIdsOf({ collection_ids: [], collection_id: 'c' })).toEqual(['c']);
        expect(privacyCollectionIdsOf({ collection_id: 'c' })).toEqual(['c']);
        expect(privacyCollectionIdsOf({})).toEqual([]);
    });
});

describe('src/lib/itemPrivacy.ts agrees with the trigger', () => {
    // The client writes the effective value up front; if it disagreed with the
    // trigger, an item would flicker between the two answers.
    const cases: Record<string, unknown>[] = [
        {},
        { is_private: true },
        { is_private: false, is_private_own: true },
        { is_private: true, is_private_own: false },
        { collection_ids: ['privcol'] },
        { collection_ids: ['pubcol'], collection_id: 'privcol' },
        { collection_id: 'pubcol' },
        { item_type: 'Artifact', collection_status: 'pending' },
        { item_type: 'Artifact ', collection_status: 'deaccessioned', is_private_own: false },
        { item_type: 'Document', collection_status: 'pending' },
    ];

    it.each(cases)('agrees on %j', (item) => {
        const own = ownPrivacy(item);
        expect(client.ownPrivacyOf(item)).toBe(own);
        expect(client.isForcedPrivate(item)).toBe(forcedPrivacy(item));
        expect(client.privacyCollectionIdsOf(item)).toEqual(privacyCollectionIdsOf(item));
        expect(client.effectivePrivacy(own, item, PRIVATE_COLLECTIONS))
            .toBe(effectivePrivacy(own, item, PRIVATE_COLLECTIONS));
    });
});

describe('membershipPatch — CollectionDetail add and remove', () => {
    it('folds the legacy collection_id in when adding', () => {
        // The bug: arrayUnion left collection_ids: ['Q'] and the item became public.
        const patch = client.membershipPatch({ collection_id: 'P' }, 'Q', 'add');
        expect(patch).toEqual({ collection_ids: ['P', 'Q'], collection_id: 'P' });
        expect(effectivePrivacy(false, patch, new Set(['P']))).toBe(true);
    });

    it('does not duplicate an existing membership', () => {
        expect(client.membershipPatch({ collection_ids: ['Q'], collection_id: 'Q' }, 'Q', 'add'))
            .toEqual({ collection_ids: ['Q'], collection_id: 'Q' });
    });

    it('keeps the other collections when removing', () => {
        // The old remove cleared collection_id outright, dropping P with it.
        expect(client.membershipPatch({ collection_ids: ['Q'], collection_id: 'P' }, 'Q', 'remove'))
            .toEqual({ collection_ids: ['P'], collection_id: 'P' });
    });

    it('clears both fields when removing the last collection', () => {
        // Leaving collection_id behind would keep the item in the collection.
        expect(client.membershipPatch({ collection_ids: ['Q'], collection_id: 'Q' }, 'Q', 'remove'))
            .toEqual({ collection_ids: [], collection_id: null });
        expect(client.membershipPatch({ collection_id: 'Q' }, 'Q', 'remove'))
            .toEqual({ collection_ids: [], collection_id: null });
    });
});
