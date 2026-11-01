import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain CommonJS, deliberately untyped and import-free so this
// test does not drag firebase-functions into the site build. See the module header.
import * as rules from '../../functions/memberLoginRules.js';

const { secondaryEmailOf, memberLoginChanges } = rules;

describe('secondaryEmailOf', () => {
    it('reads the address lowercased and trimmed', () => {
        expect(secondaryEmailOf({ secondaryEmail: ' Spouse@Example.com ' })).toBe('spouse@example.com');
    });

    it('is null for no record, no address or a blank one', () => {
        expect(secondaryEmailOf(null)).toBeNull();
        expect(secondaryEmailOf({})).toBeNull();
        expect(secondaryEmailOf({ secondaryEmail: '  ' })).toBeNull();
        expect(secondaryEmailOf({ secondaryEmail: null })).toBeNull();
    });
});

describe('memberLoginChanges', () => {
    it('points a new secondary email at the record', () => {
        expect(memberLoginChanges(null, { secondaryEmail: 'a@example.com' })).toEqual({ remove: null, set: 'a@example.com' });
    });

    it('moves the pointer when the address changes', () => {
        expect(memberLoginChanges({ secondaryEmail: 'a@example.com' }, { secondaryEmail: 'b@example.com' }))
            .toEqual({ remove: 'a@example.com', set: 'b@example.com' });
    });

    it('removes it when the address is cleared or the record deleted', () => {
        expect(memberLoginChanges({ secondaryEmail: 'a@example.com' }, { secondaryEmail: '' })).toEqual({ remove: 'a@example.com', set: null });
        expect(memberLoginChanges({ secondaryEmail: 'a@example.com' }, null)).toEqual({ remove: 'a@example.com', set: null });
    });

    /** So a pointer missing from before the function existed is put back on the next save. */
    it('still sets the pointer when the address is unchanged', () => {
        expect(memberLoginChanges({ secondaryEmail: 'a@example.com' }, { secondaryEmail: 'A@example.com', status: 'active' }))
            .toEqual({ remove: null, set: 'a@example.com' });
    });
});
