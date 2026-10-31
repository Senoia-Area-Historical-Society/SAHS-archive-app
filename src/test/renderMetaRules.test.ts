import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain CommonJS, deliberately untyped and import-free so this
// test does not drag firebase-functions into the site build. See the module header.
import { CACHE_CONTROL, virtualCollection, isPublicFlag } from '../../functions/renderMetaRules.js';

/**
 * The bugs these guard: renderMeta answered `/collections/on-loan` — linked from
 * the public Collections page — with a 404, because no document has that id; let
 * the CDN keep serving a just-made-private item's title and image for over an
 * hour; and treated an item with no `is_private` field as public, which
 * firestore.rules does not.
 */

describe('virtualCollection', () => {
    it('describes the public on-loan collection, naming the museum', () => {
        const vc = virtualCollection('on-loan', 'Senoia Area Historical Society');
        expect(vc).toMatchObject({ id: 'on-loan', title: 'Items on Loan', is_private: false });
        expect(vc.description).toContain('Senoia Area Historical Society');
    });

    it('marks the staff-only collections private', () => {
        expect(virtualCollection('pending-acquisitions', 'X').is_private).toBe(true);
        expect(virtualCollection('deaccessioned-artifacts', 'X').is_private).toBe(true);
    });

    it('is null for a real collection id, including inherited object keys', () => {
        expect(virtualCollection('nn1oEjqdXRgopJfCLiBK', 'X')).toBeNull();
        expect(virtualCollection('constructor', 'X')).toBeNull();
    });
});

describe('isPublicFlag', () => {
    it('is public only when is_private is exactly false, as in firestore.rules', () => {
        expect(isPublicFlag({ is_private: false })).toBe(true);
        expect(isPublicFlag({ is_private: true })).toBe(false);
        expect(isPublicFlag({})).toBe(false);
        expect(isPublicFlag({ is_private: null })).toBe(false);
    });
});

describe('CACHE_CONTROL', () => {
    it('keeps the CDN copy to five minutes and a short stale window', () => {
        const sMaxAge = Number(/s-maxage=(\d+)/.exec(CACHE_CONTROL)?.[1]);
        const swr = Number(/stale-while-revalidate=(\d+)/.exec(CACHE_CONTROL)?.[1] ?? 0);
        expect(sMaxAge).toBeLessThanOrEqual(300);
        expect(sMaxAge + swr).toBeLessThanOrEqual(600);
    });
});
