import { describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
import appearanceContext from '../contexts/AppearanceContext.tsx?raw';
import home from '../pages/Home.tsx?raw';
import { DEFAULT_DESCRIPTION, DEFAULT_OG_IMAGE, DEFAULT_SITE_NAME, SITE_URL, buildItemSeo, buildPageSeo, describeItem } from '../lib/seo';
import { FIRST_RUN_VALUES } from '../lib/setupWizardFields';
import { buildOrganizationJsonLd } from '../lib/structuredData';

/**
 * A new museum sees these before it has set anything. SAHS's own wording lives in
 * its site_settings/appearance document and in deploy/sahs-head.html.
 */
describe('what a newly set-up museum sees', () => {
    it.each([
        ['index.html', indexHtml],
        ['AppearanceContext defaults', appearanceContext],
        ['Home defaults', home],
        ['the default site name', DEFAULT_SITE_NAME],
        ['the default description', DEFAULT_DESCRIPTION],
        ['the museum description', String(buildOrganizationJsonLd('Example Museum').description)],
        ['the site address', SITE_URL],
        ['the default share image', String(DEFAULT_OG_IMAGE)],
        ['the museum structured data', JSON.stringify(buildOrganizationJsonLd('Example Museum'))],
        ['the Setup Wizard first-run values', JSON.stringify(FIRST_RUN_VALUES)],
    ])('%s does not name Senoia or SAHS', (_label, text) => {
        expect(text).not.toMatch(/senoia|coweta|sahs/i);
    });

    // These run without SITE_URL or SITE_OG_IMAGE, as a museum's first build does.
    it('takes its address from where it is served, and has no default share image', () => {
        expect(SITE_URL).toBe(globalThis.location?.origin ?? '');
        expect(DEFAULT_OG_IMAGE).toBeUndefined();
        expect(buildPageSeo('Archive', 'd', '/archive').image).toBeUndefined();
    });

    it('points an unedited QR code at the site itself', () => {
        // Home.tsx and EditableText both fall back to window.location.origin on a blank value.
        expect(FIRST_RUN_VALUES.contentBlocks.qrValue).toBe('');
    });

    it('describes an item with the museum it belongs to', () => {
        const item = { item_type: 'Artifact' as const };
        expect(describeItem(item, 'Example Museum')).toContain('Example Museum');
        expect(buildItemSeo(item, 'Example Museum').description).toContain('Example Museum');
    });
});

/**
 * The code itself, not just its defaults. One museum's name, domain or people in
 * a comment, a label or an example is how a deployment's identity leaks back in.
 * Tests may use SAHS as fixture data; a deployment's own config (deploy/,
 * functions/.env.<project id>, .firebaserc, the deploy workflows) is not code and
 * is not scanned.
 */
const sources = {
    ...import.meta.glob(['../**/*.{ts,tsx,css}', '!../test/**'], { query: '?raw', import: 'default', eager: true }),
    ...import.meta.glob('../../functions/*.js', { query: '?raw', import: 'default', eager: true }),
    ...import.meta.glob('../../scripts/**/*.cjs', { query: '?raw', import: 'default', eager: true }),
    ...import.meta.glob('../../docker/*.cjs', { query: '?raw', import: 'default', eager: true }),
    ...import.meta.glob(['../../*.rules', '../../vite.config.ts', '../../Dockerfile'], {
        query: '?raw', import: 'default', eager: true,
    }),
} as Record<string, string>;

describe('the code', () => {
    it('found the files to check', () => {
        const files = Object.keys(sources);
        expect(files.length).toBeGreaterThan(100);
        for (const expected of ['../../firestore.rules', '../../vite.config.ts', '../../scripts/demo.cjs', '../App.tsx']) {
            expect(files).toContain(expected);
        }
    });

    it.each(Object.entries(sources))('%s does not name Senoia or SAHS', (_file, text) => {
        expect(text).not.toMatch(/senoia|coweta|sahs/i);
    });
});
