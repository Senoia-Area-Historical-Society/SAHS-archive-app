import { describe, it, expect } from 'vitest';
import { ITEM_CONDITIONS, isUnlisted, mergeLocationText } from '../lib/itemFieldOptions';

/**
 * The bug these guard: Edit Item's dropdowns showed their first choice for a
 * blank or unlisted stored value, and saving stored it. `isUnlisted` decides when
 * a stored value needs its own option so that saving keeps it.
 */

describe('isUnlisted', () => {
    it('is false for a listed value', () => {
        expect(isUnlisted('Good', ITEM_CONDITIONS)).toBe(false);
        expect(isUnlisted('Needs To Be Rescanned', ITEM_CONDITIONS)).toBe(false);
    });

    it('is false for a blank value, which the "Not recorded" option covers', () => {
        expect(isUnlisted('', ITEM_CONDITIONS)).toBe(false);
        expect(isUnlisted(null, ITEM_CONDITIONS)).toBe(false);
        expect(isUnlisted(undefined, ITEM_CONDITIONS)).toBe(false);
    });

    it('is true for a value the list does not hold, including a different capitalization', () => {
        expect(isUnlisted('Needs to be rescanned', ITEM_CONDITIONS)).toBe(true);
        expect(isUnlisted('Other Museum (Physical Archive)', ['SAHS (Physical Archive)', 'Digital Archive'])).toBe(true);
    });
});

/**
 * Add Item's "Specific Location in Archive" was never saved. It and the "Museum
 * Location" field below it both go to `museum_location` now.
 */
describe('mergeLocationText', () => {
    it('keeps whichever field was filled in', () => {
        expect(mergeLocationText('Cabinet 3, Drawer B', '')).toBe('Cabinet 3, Drawer B');
        expect(mergeLocationText(null, 'Shelf 4')).toBe('Shelf 4');
    });

    it('joins two different values and drops a repeat', () => {
        expect(mergeLocationText('Cabinet 3', 'Shelf 4')).toBe('Cabinet 3; Shelf 4');
        expect(mergeLocationText(' Shelf 4 ', 'shelf 4')).toBe('Shelf 4');
    });

    it('is empty when neither was filled in', () => {
        expect(mergeLocationText('  ', null, undefined)).toBe('');
    });
});
