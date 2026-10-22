/**
 * Artifact types — the one list the Add Item and Edit Item dropdowns share.
 *
 * Values are stored lowercase (`'photo'`) and shown capitalized (`'Photo'`).
 *
 * Older items, from the original spreadsheet import, carry other spellings:
 * `'Photo'`, `'Printed'`, `'Textiles'`, `'Memorabilla'`. The Edit Item dropdown
 * used to set `defaultValue` to the raw stored string. No option matched it, so
 * the browser fell back to the first option — `'textile'` — and saving the form
 * silently relabelled a piano, a BB gun and a dozen photos as textiles.
 * `normalizeArtifactType` is what lets the dropdown find the right option for
 * those older spellings.
 *
 * `scripts/normalize-artifact-types.cjs` rewrites the stored data to these
 * values; its alias table must stay in step with `ALIASES` here.
 */

export const ARTIFACT_TYPES = [
    'textile', 'photo', 'print', 'award/trophy', 'memorabilia', 'furniture', 'ceramics',
    'miscellaneous', 'technology', 'signs', 'jewelry', 'metal', 'glass', 'agriculture',
] as const;

export type ArtifactType = typeof ARTIFACT_TYPES[number];

/** Older spellings, keyed lowercase, that mean one of the types above. */
const ALIASES: Record<string, ArtifactType> = {
    textiles: 'textile',
    printed: 'print',
    memorabilla: 'memorabilia',
    misc: 'miscellaneous',
};

/** The canonical type for a stored value, or null if it isn't one we know. */
export function normalizeArtifactType(value: string | null | undefined): ArtifactType | null {
    const key = (value ?? '').trim().toLowerCase();
    if (!key) return null;
    if ((ARTIFACT_TYPES as readonly string[]).includes(key)) return key as ArtifactType;
    return ALIASES[key] ?? null;
}

export function artifactTypeLabel(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}
