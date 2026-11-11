import { describe, expect, it } from 'vitest';
import firebaseTs from '../lib/firebase.ts?raw';

/**
 * Each install names its archive's Firestore database once, in
 * functions/.env.<project id>. A literal database name anywhere in the app or the
 * functions would quietly pin every museum's install to SAHS's database, and a
 * trigger bound to a database that isn't the archive's never fires.
 */
const functionModules = import.meta.glob('../../functions/*.js', {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>;

const LITERAL_DATABASE = /['"`]sahs-archives['"`]/;

describe('the archive database name', () => {
    it('is not hardcoded in the web app', () => {
        expect(firebaseTs).not.toMatch(LITERAL_DATABASE);
        expect(firebaseTs).toContain('getFirestore(app, __ARCHIVE_DATABASE__)');
    });

    it.each(Object.entries(functionModules))('is not hardcoded in %s', (_file, source) => {
        expect(source).not.toMatch(LITERAL_DATABASE);
    });

    const triggerModules = Object.entries(functionModules).filter(
        ([file, source]) => !file.endsWith('/database.js') && /^\s+database:/m.test(source),
    );

    it('is used by every module that defines Firestore triggers', () => {
        expect(triggerModules.length).toBeGreaterThanOrEqual(6);
    });

    it.each(triggerModules)('%s binds every trigger to the ARCHIVE_DATABASE param', (_file, source) => {
        const bindings = source.match(/^\s+database:\s*([^,\n]+)/gm) ?? [];
        expect(bindings.length).toBeGreaterThan(0);
        for (const binding of bindings) {
            expect(binding.trim()).toBe('database: ARCHIVE_DATABASE');
        }
        expect(source).toMatch(/require\(["']\.\/database["']\)/);
    });
});
