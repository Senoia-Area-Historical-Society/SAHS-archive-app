import { describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
import appearanceContext from '../contexts/AppearanceContext.tsx?raw';
import home from '../pages/Home.tsx?raw';
import { DEFAULT_DESCRIPTION, DEFAULT_SITE_NAME, buildItemSeo, describeItem } from '../lib/seo';
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
    ])('%s does not name Senoia or SAHS', (_label, text) => {
        expect(text).not.toMatch(/senoia|coweta|\bSAHS\b/i);
    });

    it('describes an item with the museum it belongs to', () => {
        const item = { item_type: 'Artifact' as const };
        expect(describeItem(item, 'Example Museum')).toContain('Example Museum');
        expect(buildItemSeo(item, 'Example Museum').description).toContain('Example Museum');
    });
});
