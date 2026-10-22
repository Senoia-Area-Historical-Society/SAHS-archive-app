import { describe, it, expect } from 'vitest';
import { ARTIFACT_TYPES, normalizeArtifactType } from '../lib/artifactTypes';

/**
 * The bug these guard: Edit Item set the dropdown's `defaultValue` to the raw
 * stored string. `'Photo'` or `'Printed'` matched no option, the browser chose
 * the first one, `'textile'`, and saving relabelled the item.
 */

describe('normalizeArtifactType', () => {
    it('accepts every dropdown value as-is', () => {
        for (const t of ARTIFACT_TYPES) expect(normalizeArtifactType(t)).toBe(t);
    });

    it('ignores capitalization and stray spaces', () => {
        expect(normalizeArtifactType('Photo')).toBe('photo');
        expect(normalizeArtifactType('Award/Trophy')).toBe('award/trophy');
        expect(normalizeArtifactType(' Metal ')).toBe('metal');
    });

    it('maps the older spellings from the spreadsheet import', () => {
        expect(normalizeArtifactType('Textiles')).toBe('textile');
        expect(normalizeArtifactType('Printed')).toBe('print');
        expect(normalizeArtifactType('Memorabilla')).toBe('memorabilia');
        expect(normalizeArtifactType('Misc')).toBe('miscellaneous');
    });

    it('returns null for empty or unknown values, never a guess', () => {
        expect(normalizeArtifactType('')).toBeNull();
        expect(normalizeArtifactType(null)).toBeNull();
        expect(normalizeArtifactType(undefined)).toBeNull();
        expect(normalizeArtifactType('Native American')).toBeNull();
    });
});
