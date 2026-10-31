import { describe, it, expect } from 'vitest';
import {
    parseMemberDate,
    formatMemberDate,
    isMembershipDatePast,
    renewedExpiry,
    oneYearFromToday,
    memberEditChanges,
    type MemberEditFields,
} from '../lib/memberDates';

/**
 * The bug these guard: `new Date('2027-03-01')` is midnight UTC, which is the
 * evening of Feb 28 anywhere in the US, so the membership roll showed every
 * expiry date a day early. These assertions read the local calendar date, so
 * they hold in any time zone the tests run in.
 */
describe('member dates are calendar dates', () => {
    it('parses YYYY-MM-DD as that day, locally', () => {
        const d = parseMemberDate('2027-03-01')!;
        expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2027, 3, 1]);
    });

    it('formats YYYY-MM-DD as the same day', () => {
        const expected = new Date(2027, 2, 1).toLocaleDateString();
        expect(formatMemberDate('2027-03-01')).toBe(expected);
    });

    it('still parses a full ISO timestamp (joinedAt) as an instant', () => {
        const d = parseMemberDate('2026-05-28T15:30:00.000Z')!;
        expect(d.toISOString()).toBe('2026-05-28T15:30:00.000Z');
    });

    it('falls back for missing or unreadable dates', () => {
        expect(formatMemberDate(undefined)).toBe('N/A');
        expect(formatMemberDate('not a date', undefined, 'Unknown')).toBe('Unknown');
        expect(parseMemberDate('')).toBeNull();
    });
});

describe('a membership runs to the end of its expiry day', () => {
    const lateOnMarch1 = new Date(2027, 2, 1, 23, 30);

    it('is not past on its last day, even late in the evening', () => {
        expect(isMembershipDatePast('2027-03-01', lateOnMarch1)).toBe(false);
    });

    it('is past the next day', () => {
        expect(isMembershipDatePast('2027-03-01', new Date(2027, 2, 2, 0, 1))).toBe(true);
    });

    it('never expires a lifetime membership', () => {
        expect(isMembershipDatePast('Never', lateOnMarch1)).toBe(false);
    });
});

describe('renewing', () => {
    const today = new Date(2026, 9, 31, 20, 0); // Oct 31 2026, 8pm local

    it('adds a year to an expiry still ahead', () => {
        expect(renewedExpiry('2027-01-15', today)).toBe('2028-01-15');
    });

    it('renews a lapsed member from today, not from the old date', () => {
        expect(renewedExpiry('2025-06-01', today)).toBe('2027-10-31');
    });

    it('defaults new members to a year from today in local time', () => {
        // toISOString() would have given 2027-11-01 for this evening in the US.
        expect(oneYearFromToday(today)).toBe('2027-10-31');
    });
});

/**
 * The bug these guard: saving an edit rewrote the whole record from the form's
 * fields, so `hasCompletedMemberWizard` (and anything else the form doesn't
 * show) was dropped, and the member saw the setup wizard again.
 */
describe('editing a member writes only what changed', () => {
    const original: MemberEditFields = {
        name: 'Jane Doe',
        email: 'jane@example.com',
        secondaryEmail: 'john@example.com',
        secondaryName: 'John Doe',
        expiresAt: 'Never',
        isRecurring: false,
        isFreeOneYear: false,
        status: 'active',
    };

    it('writes nothing when nothing changed', () => {
        expect(memberEditChanges(original, { ...original })).toEqual({});
    });

    it('writes just the changed field', () => {
        expect(memberEditChanges(original, { ...original, name: 'Jane Smith' })).toEqual({ name: 'Jane Smith' });
    });

    it('can never carry fields the form does not manage', () => {
        const edited = { ...original, name: 'Jane Smith', hasCompletedMemberWizard: false, joinedAt: 'x' } as MemberEditFields;
        const changes = memberEditChanges(original, edited);
        expect(Object.keys(changes)).toEqual(['name']);
    });

    it('normalises whitespace and case before comparing', () => {
        expect(memberEditChanges(original, { ...original, email: '  JANE@example.com ', name: 'Jane Doe ' })).toEqual({});
    });

    it('treats a cleared secondary contact as a change to null', () => {
        expect(memberEditChanges(original, { ...original, secondaryEmail: '', secondaryName: '' }))
            .toEqual({ secondaryEmail: null, secondaryName: null });
    });

    it('treats undefined and false flags alike', () => {
        const legacy = { ...original, isRecurring: undefined, isFreeOneYear: undefined };
        expect(memberEditChanges(legacy, { ...legacy, isRecurring: false, isFreeOneYear: false })).toEqual({});
    });

    it('includes a status change when reactivating', () => {
        const lapsed = { ...original, expiresAt: '2025-01-01', status: 'expired' as const };
        expect(memberEditChanges(lapsed, { ...lapsed, status: 'active', expiresAt: '2027-10-31' }))
            .toEqual({ status: 'active', expiresAt: '2027-10-31' });
    });
});
