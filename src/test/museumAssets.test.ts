import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
import { buildOrganizationJsonLd } from '../lib/structuredData';

/**
 * public/ ships in every install's build, so it holds only what any archive
 * needs. A museum's icons, photos and logos come from its own SITE_PUBLIC_DIR
 * (vite.config.ts); SAHS's are in deploy/sahs-public.
 */
const PUBLIC_ALLOWLIST = ['robots.txt'];

describe('files every install ships', () => {
    it('public/ holds nothing museum-specific', () => {
        expect(readdirSync('public').sort()).toEqual(PUBLIC_ALLOWLIST);
    });

    it('index.html links no icon outside the block a museum replaces', () => {
        const outsideHeadBlock = indexHtml.replace(/<!-- site-head:start -->[\s\S]*?<!-- site-head:end -->/, '');
        expect(outsideHeadBlock).not.toMatch(/rel="(icon|apple-touch-icon)"/);
    });

    it('structured data names a logo only when the museum has one', () => {
        expect(buildOrganizationJsonLd('Example Museum')).not.toHaveProperty('logo');
        expect(buildOrganizationJsonLd('Example Museum', 'https://example.org/logo.png')).toMatchObject({
            logo: 'https://example.org/logo.png',
        });
    });
});
