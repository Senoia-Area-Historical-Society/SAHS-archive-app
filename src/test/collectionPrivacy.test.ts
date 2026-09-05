import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain CommonJS, deliberately untyped and import-free so this
// test does not drag firebase-functions into the site build. See the module header.
import { ownPrivacy, effectivePrivacy, collectionIdsOf } from '../../functions/collectionPrivacyRules.js';

/**
 * `is_private` is the *effective* value — what firestore.rules and every public
 * query read — so it is a denormalised field: an item is private if the curator
 * said so, or if any collection it belongs to is. `functions/collectionPrivacy.js`
 * maintains it, and these cover the two decisions that make that possible.
 *
 * The intent rule is the subtle one. The trigger writes `is_private` itself, so it
 * has to tell "the curator just changed this" from "I just changed this" — get
 * that wrong and the trigger reads its own inheritance write as a new curator
 * choice, at which point a collection going public again can never release its
 * items.
 */

const PRIVATE_COLLECTIONS = new Set(['privcol']);

describe('ownPrivacy — what the curator actually chose', () => {
    // No is_private_own yet. Correct for existing data: the backfill reported zero
    // items inheriting privacy, so every stored `is_private` is a genuine choice.
    it('falls back to is_private on documents predating the field', () => {
        expect(ownPrivacy(undefined, { is_private: true })).toBe(true);
        expect(ownPrivacy(undefined, { is_private: false })).toBe(false);
        expect(ownPrivacy(undefined, {})).toBe(false);
    });

    it('takes a new intent when the editor moves is_private alone', () => {
        expect(ownPrivacy(
            { is_private: false, is_private_own: false },
            { is_private: true, is_private_own: false },
        )).toBe(true);
        expect(ownPrivacy(
            { is_private: true, is_private_own: true },
            { is_private: false, is_private_own: true },
        )).toBe(false);
    });

    /**
     * The loop-safety case. When both fields move together the write came from the
     * trigger, not a curator — reading it as intent would make inheritance
     * permanent and unrecoverable.
     */
    it('does not read its own write as a new intent', () => {
        expect(ownPrivacy(
            { is_private: false, is_private_own: false },
            { is_private: true, is_private_own: false },   // inheritance applied
        )).toBe(true); // intent recorded from the client edit that preceded it

        expect(ownPrivacy(
            { is_private: true, is_private_own: false },
            { is_private: true, is_private_own: false },   // settled
        )).toBe(false); // still the curator's original "public"
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

    it('treats an item in no collection as uninherited', () => {
        expect(effectivePrivacy(false, {}, PRIVATE_COLLECTIONS)).toBe(false);
    });
});

describe('collectionIdsOf — both membership shapes', () => {
    // Must match BrowseArchive's precedence and the migration script's copy.
    it('prefers collection_ids and falls back to collection_id', () => {
        expect(collectionIdsOf({ collection_ids: ['a', 'b'], collection_id: 'c' })).toEqual(['a', 'b']);
        expect(collectionIdsOf({ collection_ids: [], collection_id: 'c' })).toEqual(['c']);
        expect(collectionIdsOf({ collection_id: 'c' })).toEqual(['c']);
        expect(collectionIdsOf({})).toEqual([]);
    });
});
