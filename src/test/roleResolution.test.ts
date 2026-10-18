import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain CommonJS, deliberately untyped and import-free so this
// test does not drag firebase-functions into the site build. See the module header.
import { supportEmailsOf, resolveRole, changedSupportEmails } from '../../functions/roleResolution.js';

/**
 * The role a user's Auth claim should carry decides their Storage access, so a
 * mistake here is invisible to firestore.rules tests: a support admin removed
 * from the list would go on uploading to the bucket.
 */

const SUPPORT = ['catnolan@senoiahistory.com', 'jeremywarren@senoiahistory.com'];

describe('resolveRole', () => {
    it('makes a support admin an admin with no role document', () => {
        expect(resolveRole('jeremywarren@senoiahistory.com', SUPPORT, undefined)).toBe('admin');
    });

    it('keeps a support admin an admin even if their role document says curator', () => {
        expect(resolveRole('catnolan@senoiahistory.com', SUPPORT, 'curator')).toBe('admin');
    });

    it('matches the support list case-insensitively', () => {
        expect(resolveRole('Jeremywarren@Senoiahistory.com', SUPPORT, undefined)).toBe('admin');
    });

    it('falls back to the granted role for everyone else', () => {
        expect(resolveRole('a@example.org', SUPPORT, 'curator')).toBe('curator');
        expect(resolveRole('a@example.org', SUPPORT, 'admin')).toBe('admin');
    });

    it('gives no role for an unknown or missing one', () => {
        expect(resolveRole('a@example.org', SUPPORT, 'superadmin')).toBeNull();
        expect(resolveRole('a@example.org', SUPPORT, undefined)).toBeNull();
    });

    it('drops a removed support admin to whatever they were granted', () => {
        expect(resolveRole('jeremywarren@senoiahistory.com', [], undefined)).toBeNull();
        expect(resolveRole('catnolan@senoiahistory.com', [], 'curator')).toBe('curator');
    });
});

describe('supportEmailsOf', () => {
    it('lowercases the stored list', () => {
        expect(supportEmailsOf({ emails: ['A@X.org'] })).toEqual(['a@x.org']);
    });

    it('treats a missing or malformed list as empty', () => {
        expect(supportEmailsOf(null)).toEqual([]);
        expect(supportEmailsOf({})).toEqual([]);
        expect(supportEmailsOf({ emails: 'a@x.org' })).toEqual([]);
    });
});

describe('changedSupportEmails', () => {
    it('reports additions and removals, not unchanged addresses', () => {
        expect(changedSupportEmails({ emails: ['a@x.org', 'b@x.org'] }, { emails: ['b@x.org', 'c@x.org'] }).sort())
            .toEqual(['a@x.org', 'c@x.org']);
    });

    it('reports everyone when the list is created or deleted', () => {
        expect(changedSupportEmails(null, { emails: ['a@x.org'] })).toEqual(['a@x.org']);
        expect(changedSupportEmails({ emails: ['a@x.org'] }, null)).toEqual(['a@x.org']);
    });
});
