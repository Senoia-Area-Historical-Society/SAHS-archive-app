/**
 * Choices for the Category and Condition dropdowns that Add Item and Edit Item
 * share, and a helper that stops Edit Item rewriting values it doesn't list.
 *
 * Edit Item's dropdowns used to set `defaultValue` to the stored value. A blank
 * or unlisted value matched no option, so the browser showed the first one and
 * saving the form stored it: an item with no recorded condition became
 * "Excellent", a document with no category became "Manuscript", and an item with
 * no file location became "SAHS (Physical Archive)". The same bug on Artifact
 * Type is described in `artifactTypes.ts`.
 */

export const DOCUMENT_CATEGORIES = [
    'Manuscript', 'Photograph', 'Map', 'Letter', 'Newspaper', 'Magazine', 'Legal Document', 'Other',
] as const;

// Spelled as the stored data spells it. `ItemCondition` in types/database.ts
// writes the last one 'Needs to be rescanned', which no stored item uses.
export const ITEM_CONDITIONS = [
    'Excellent', 'Good', 'Fair', 'Poor', 'Fragile', 'Needs To Be Rescanned',
] as const;

/**
 * True when a stored value isn't one of the listed choices, so Edit Item adds it
 * as its own `<option>` and saving keeps it instead of replacing it.
 */
export function isUnlisted(value: string | null | undefined, listed: readonly string[]): value is string {
    return !!value && !listed.includes(value);
}
