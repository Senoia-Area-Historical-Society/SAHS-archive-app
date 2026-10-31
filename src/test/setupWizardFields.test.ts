import { describe, it, expect } from 'vitest';
import type { AppearanceSettings } from '../contexts/AppearanceContext';
import {
    FIRST_RUN_VALUES,
    changedWizardFields,
    firstRunAppearanceWrite,
    rerunAppearanceWrite,
    wizardValuesFromSettings,
} from '../lib/setupWizardFields';

/**
 * The bug these guard: re-running the Setup Wizard from Admin Settings started
 * from blank defaults and saved all of them over site_settings/appearance, so
 * fixing the museum's name also wiped the logo, slideshow, links, tab names and
 * content blocks.
 */

const live: AppearanceSettings = {
    theme: 'navy',
    museumName: 'Springfield Historical Society',
    museumShortName: 'SHS',
    sidebarTitle: 'Springfield\nHistorical Society',
    heroTitle: 'Springfield',
    heroSubtitle: 'Our town, our story',
    logoUrl: 'https://example.com/logo.png',
    backgroundImages: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
    facebookUrl: 'https://facebook.com/shs',
    instagramUrl: '',
    youtubeUrl: '',
    contactSupportUrl: 'https://shs.org/contact',
    archiveFeedbackUrl: '',
    suggestionBoxUrl: '',
    stripeBillingPortalUrl: '',
    mapCenterLat: 39.8,
    mapCenterLng: -89.6,
    mapDefaultZoom: 14,
    tabNames: { ...FIRST_RUN_VALUES.tabNames, home: 'Welcome', somethingElse: 'Not in the wizard' },
    contentBlocks: { ...FIRST_RUN_VALUES.contentBlocks, footerAiDesc: 'Our own words.', heroTitle: 'Springfield' },
    featureToggles: { enableLibrary: false, enableOralHistories: true, enableMembership: true, enableMap: true, enableCollections: true },
};

describe('a re-run starts from the current settings', () => {
    const v = wizardValuesFromSettings(live);

    it('pre-fills names, branding, links and map', () => {
        expect(v.museumName).toBe('Springfield Historical Society');
        expect(v.theme).toBe('navy');
        expect(v.logoUrl).toBe('https://example.com/logo.png');
        expect(v.backgroundImages).toEqual(live.backgroundImages);
        expect(v.facebookUrl).toBe('https://facebook.com/shs');
        expect(v.mapCenterLat).toBe('39.8');
        expect(v.mapDefaultZoom).toBe('14');
    });

    it('pre-fills tab names, content blocks and features', () => {
        expect(v.tabNames.home).toBe('Welcome');
        expect(v.contentBlocks.footerAiDesc).toBe('Our own words.');
        expect(v.featureToggles.enableLibrary).toBe(false);
        expect(v.featureToggles.enableMembership).toBe(true);
    });

    it('shows only the wizard\'s own tab and content keys', () => {
        expect(v.tabNames).not.toHaveProperty('somethingElse');
        expect(v.contentBlocks).not.toHaveProperty('heroTitle');
    });

    it('prefers the homepage\'s contentBlocks hero title, which is what visitors see', () => {
        const v2 = wizardValuesFromSettings({ ...live, contentBlocks: { heroTitle: 'Edited on the page' } });
        expect(v2.heroTitle).toBe('Edited on the page');
    });
});

describe('a re-run writes only what changed', () => {
    const initial = wizardValuesFromSettings(live);

    it('writes nothing when nothing changed', () => {
        expect(changedWizardFields(initial, { ...initial })).toEqual([]);
        expect(rerunAppearanceWrite(initial, { ...initial })).toEqual({});
    });

    it('writes a renamed museum and nothing else', () => {
        const write = rerunAppearanceWrite(initial, { ...initial, museumName: 'Springfield Museum' });
        expect(write).toEqual({ museumName: 'Springfield Museum' });
    });

    it('saves a deliberately emptied field as blank', () => {
        const write = rerunAppearanceWrite(initial, { ...initial, facebookUrl: '', logoUrl: '' });
        expect(write).toEqual({ facebookUrl: '', logoUrl: '' });
    });

    it('writes only the changed keys of tab names and content blocks', () => {
        const write = rerunAppearanceWrite(initial, {
            ...initial,
            tabNames: { ...initial.tabNames, map: 'Town Map' },
            contentBlocks: { ...initial.contentBlocks, qrTitle: '' },
        });
        expect(write).toEqual({ tabNames: { map: 'Town Map' }, contentBlocks: { qrTitle: '' } });
    });

    it('writes only the changed feature toggle', () => {
        const write = rerunAppearanceWrite(initial, {
            ...initial,
            featureToggles: { ...initial.featureToggles, enableLibrary: true },
        });
        expect(write).toEqual({ featureToggles: { enableLibrary: true } });
    });

    it('mirrors a changed hero title into contentBlocks, where the homepage reads it', () => {
        const write = rerunAppearanceWrite(initial, { ...initial, heroTitle: 'Springfield, Est. 1821' });
        expect(write).toEqual({ heroTitle: 'Springfield, Est. 1821', contentBlocks: { heroTitle: 'Springfield, Est. 1821' } });
    });

    it('writes map fields as numbers, and ignores a reformatted but equal number', () => {
        expect(rerunAppearanceWrite(initial, { ...initial, mapCenterLat: '39.80' })).toEqual({});
        expect(rerunAppearanceWrite(initial, { ...initial, mapDefaultZoom: '12' })).toEqual({ mapDefaultZoom: 12 });
    });

    it('treats removing a slider image as a change to the whole list', () => {
        const write = rerunAppearanceWrite(initial, { ...initial, backgroundImages: [live.backgroundImages[1]] });
        expect(write).toEqual({ backgroundImages: [live.backgroundImages[1]] });
    });
});

describe('first-run setup', () => {
    it('keeps today\'s defaults', () => {
        expect(FIRST_RUN_VALUES.museumName).toBe('');
        expect(FIRST_RUN_VALUES.heroSubtitle).toBe('Preserving Our Past, Inspiring Our Future');
        expect(FIRST_RUN_VALUES.mapCenterLat).toBe('33.3001');
    });

    it('writes every field, including the feature toggles a fresh install never got', () => {
        const write = firstRunAppearanceWrite({ ...FIRST_RUN_VALUES, museumName: 'New Museum', heroTitle: 'New' });
        expect(write.museumName).toBe('New Museum');
        expect(write.logoUrl).toBe('');
        expect(write.mapDefaultZoom).toBe(13);
        expect(write.tabNames).toEqual(FIRST_RUN_VALUES.tabNames);
        expect(write.featureToggles).toEqual({
            enableCollections: true,
            enableMap: true,
            enableOralHistories: true,
            enableLibrary: true,
            enableMembership: false,
        });
        expect((write.contentBlocks as Record<string, string>).heroTitle).toBe('New');
    });
});
