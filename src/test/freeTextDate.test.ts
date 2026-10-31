import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { formatFreeTextDate, parseIsoDateLocal } from '../lib/freeTextDate';

/**
 * The bug these guard: interview dates are free text, and the item page showed
 * them with `new Date(text).toLocaleDateString()` — "Invalid Date" for "Spring
 * 1987", "January 1, 1995" for "1995", and the day before for "2026-04-12"
 * anywhere west of UTC.
 *
 * Run in a US time zone, where the UTC reading of an ISO date is the previous
 * day, so the off-by-one would show here if it came back.
 */

let originalTz: string | undefined;
beforeAll(() => {
    originalTz = process.env.TZ;
    process.env.TZ = 'America/New_York';
});
afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
});

describe('formatFreeTextDate', () => {
    it('shows an ISO date as that calendar day, not the day before', () => {
        expect(formatFreeTextDate('2026-04-12', undefined, 'en-US')).toBe('April 12, 2026');
        expect(formatFreeTextDate('2026-01-01', undefined, 'en-US')).toBe('January 1, 2026');
    });

    it('shows text that is not a full date exactly as entered', () => {
        expect(formatFreeTextDate('Spring 1987', undefined, 'en-US')).toBe('Spring 1987');
        expect(formatFreeTextDate('1995', undefined, 'en-US')).toBe('1995');
        expect(formatFreeTextDate('c. 1950', undefined, 'en-US')).toBe('c. 1950');
        expect(formatFreeTextDate('October 12, 1995', undefined, 'en-US')).toBe('October 12, 1995');
    });

    it('never shows "Invalid Date"', () => {
        for (const text of ['2026-02-30', '2026-13-01', 'not a date', '12/45/2001']) {
            expect(formatFreeTextDate(text, undefined, 'en-US')).not.toMatch(/invalid/i);
            expect(formatFreeTextDate(text, undefined, 'en-US')).toBe(text);
        }
    });

    it('returns an empty string for blank input', () => {
        expect(formatFreeTextDate('', undefined, 'en-US')).toBe('');
        expect(formatFreeTextDate('   ', undefined, 'en-US')).toBe('');
        expect(formatFreeTextDate(null)).toBe('');
        expect(formatFreeTextDate(undefined)).toBe('');
    });

    it('formats an ISO date-time as the instant it names', () => {
        expect(formatFreeTextDate('2026-05-28T15:00:00.000Z', undefined, 'en-US')).toBe('May 28, 2026');
    });

    it('takes the caller\'s format options', () => {
        expect(formatFreeTextDate('2027-05-28', {}, 'en-US')).toBe('5/28/2027');
    });
});

describe('parseIsoDateLocal', () => {
    it('reads YYYY-MM-DD as local midnight', () => {
        const date = parseIsoDateLocal('2026-04-12');
        expect(date?.getFullYear()).toBe(2026);
        expect(date?.getMonth()).toBe(3);
        expect(date?.getDate()).toBe(12);
        expect(date?.getHours()).toBe(0);
    });

    it('rejects days that do not exist and other shapes', () => {
        expect(parseIsoDateLocal('2026-02-30')).toBeNull();
        expect(parseIsoDateLocal('2026-4-12')).toBeNull();
        expect(parseIsoDateLocal('April 12, 2026')).toBeNull();
    });

    it('keeps years below 100 rather than moving them to the 1900s', () => {
        expect(parseIsoDateLocal('0050-06-01')?.getFullYear()).toBe(50);
    });
});
