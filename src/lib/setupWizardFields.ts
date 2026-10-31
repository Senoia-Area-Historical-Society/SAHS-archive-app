/**
 * What the Setup Wizard shows, and what it writes to `site_settings/appearance`.
 *
 * Extracted from `SetupWizard` so it can be tested.
 *
 * ── The bug this fixes ───────────────────────────────────────────────────────
 *
 * Admin Settings offers "Launch Wizard" to update an archive's names and
 * branding, but the wizard always started from hard-coded blanks and defaults and
 * saved every one of them over the appearance document. Re-running it to fix a
 * typo in the museum's name wiped the logo, the slideshow, the social and support
 * links, and reset every renamed tab and edited content block.
 *
 * On a re-run the wizard now starts from the archive's current settings and
 * writes only the fields the admin actually changed. A field emptied on purpose
 * differs from its starting value, so it is written — blank stays a deliberate
 * choice — while a field left alone is not written at all. First-run setup on an
 * empty archive still writes everything, with the same defaults as before plus
 * the feature toggles, which a fresh install never used to get.
 */
import type { AppearanceSettings, FeatureToggles } from '../contexts/AppearanceContext';

export interface WizardValues {
    museumName: string;
    museumShortName: string;
    sidebarTitle: string;
    heroTitle: string;
    heroSubtitle: string;
    theme: string;
    logoUrl: string;
    backgroundImages: string[];
    contactSupportUrl: string;
    archiveFeedbackUrl: string;
    suggestionBoxUrl: string;
    stripeBillingPortalUrl: string;
    instagramUrl: string;
    facebookUrl: string;
    youtubeUrl: string;
    // Kept as the strings the number inputs hold; parsed when written.
    mapCenterLat: string;
    mapCenterLng: string;
    mapDefaultZoom: string;
    tabNames: Record<string, string>;
    contentBlocks: Record<string, string>;
    featureToggles: FeatureToggles;
}

/** The features a museum can switch on, in the order the wizard lists them. */
export const WIZARD_FEATURES: { key: keyof FeatureToggles; label: string; desc: string }[] = [
    { key: 'enableCollections', label: 'Curated Collections', desc: 'Group and display archival records under custom themes and exhibitions.' },
    { key: 'enableMap', label: 'Map Discovery Tools', desc: 'A map of items by location, and an interactive floor map of the museum.' },
    { key: 'enableOralHistories', label: 'Oral Histories', desc: 'Publish and play narrator recordings, transcripts and community stories.' },
    { key: 'enableLibrary', label: 'Book Library', desc: 'Catalogue, manage and search the books in your library.' },
    { key: 'enableMembership', label: 'Membership', desc: 'Member sign-in, research folders and a membership status page. Needs a membership roll kept in Admin Settings.' },
];

/**
 * A fresh install's features. AppearanceContext defaults every toggle off, so
 * before the wizard set these a new archive came up with all five hidden. The
 * ones most museums use are on; Membership is off because it only works once
 * the museum keeps a membership roll here.
 */
export const FIRST_RUN_FEATURES: FeatureToggles = {
    enableCollections: true,
    enableMap: true,
    enableOralHistories: true,
    enableLibrary: true,
    enableMembership: false,
};

/** The wizard's starting values on an empty archive — unchanged from before. */
export const FIRST_RUN_VALUES: WizardValues = {
    museumName: '',
    museumShortName: '',
    sidebarTitle: '',
    heroTitle: '',
    heroSubtitle: 'Preserving Our Past, Inspiring Our Future',
    theme: 'classic',
    logoUrl: '',
    backgroundImages: [],
    contactSupportUrl: '',
    archiveFeedbackUrl: '',
    suggestionBoxUrl: '',
    stripeBillingPortalUrl: '',
    instagramUrl: '',
    facebookUrl: '',
    youtubeUrl: '',
    mapCenterLat: '33.3001',
    mapCenterLng: '-84.5544',
    mapDefaultZoom: '13',
    tabNames: {
        home: "Home",
        oralHistories: "Oral Histories",
        documents: "Documents",
        figures: "Historic Figures",
        orgs: "Historic Orgs",
        artifacts: "Artifact Collection",
        library: "Book Library",
        search: "Advanced Search",
        map: "Map View",
        collections: "Curated Collections",
        researchFolders: "My Research Folders",
        researchMap: "My Research Map",
        membership: "Membership Status",
        locations: "Museum Locations",
        tagging: "Tagging Hub",
        interactiveMap: "Interactive Map",
        qrSearch: "Search via QR Code",
        addItem: "Add Archive Item",
        addBook: "Add Library Book",
        audit: "Data Quality Audit",
        notifications: "Moderation Feed",
        appearance: "Website Appearance",
        settings: "Admin Settings"
    },
    contentBlocks: {
        homeShareTitle: "Help Us Spread the\nHistory",
        homeShareDesc: "Our mission is to preserve and share the rich heritage of our community. Share this archive with friends and family, or follow us on social media for daily historical insights.",
        footerCopyrightTitle: "Copyright & Usage Notice",
        footerCopyrightDesc: "All information, documents, photographs, and materials provided on this website are the exclusive property of our organization. All rights are reserved.",
        footerAiTitle: "Authenticity & AI Disclaimer",
        footerAiDesc: "We are committed to preserving history authentically. No artificial intelligence is used to generate, alter, or enhance the historical records.",
        exploreTitle: "Explore Our Archives",
        exploreSubtitle: "Discover the stories, people, and events that shaped our community",
        exploreDocTitle: "Historical Documents",
        exploreDocDesc: "Dive into primary sources including letters, ledgers, meeting minutes, and local government records.",
        exploreFigTitle: "Historic Figures",
        exploreFigDesc: "Read about the individuals who have left a lasting impact on our community.",
        exploreOrgTitle: "Historic Organizations",
        exploreOrgDesc: "Explore the history of local businesses, churches, schools, and civic groups.",
        exploreArtTitle: "Artifact Collection",
        exploreArtDesc: "Our collection of physical artifacts captures the material history of our community.",
        exploreSearchTitle: "Search the Archive",
        exploreSearchDesc: "Looking for something specific? Use our advanced search tool to query the archive by keyword, date, location, or subject tags.",
        qrTitle: "Archive Website",
        qrSubtitle: "Scan to Visit",
        qrValue: "https://example.com",
        storiesTitle: "Community Stories",
        storiesTitleItalic: "Stories",
        storiesDesc: "A collection of oral history interviews dedicated to preserving the voices, memories, and personal histories that shaped our community over the decades.",
        storiesLogoUrl: ""
    },
    featureToggles: FIRST_RUN_FEATURES,
};

/** Only the wizard's own keys of a map, in the wizard's order, taken from `source`. */
function pick(keys: Record<string, string>, source: Record<string, string> | undefined): Record<string, string> {
    return Object.fromEntries(Object.keys(keys).map(k => [k, source?.[k] ?? keys[k]]));
}

/**
 * The wizard's starting values on an archive that is already set up: what the
 * site shows now. `settings` is AppearanceContext's, so anything missing from
 * the stored document has already been filled with the default the site uses.
 */
export function wizardValuesFromSettings(settings: AppearanceSettings): WizardValues {
    const num = (n: number | undefined, fallback: string) =>
        n === undefined || Number.isNaN(n) ? fallback : String(n);
    return {
        museumName: settings.museumName ?? '',
        museumShortName: settings.museumShortName ?? '',
        sidebarTitle: settings.sidebarTitle ?? '',
        // The homepage shows contentBlocks.heroTitle ahead of heroTitle (EditableText).
        heroTitle: settings.contentBlocks?.heroTitle || settings.heroTitle || '',
        heroSubtitle: settings.contentBlocks?.heroSubtitle || settings.heroSubtitle || '',
        theme: settings.theme || 'classic',
        logoUrl: settings.logoUrl ?? '',
        backgroundImages: [...(settings.backgroundImages ?? [])],
        contactSupportUrl: settings.contactSupportUrl ?? '',
        archiveFeedbackUrl: settings.archiveFeedbackUrl ?? '',
        suggestionBoxUrl: settings.suggestionBoxUrl ?? '',
        stripeBillingPortalUrl: settings.stripeBillingPortalUrl ?? '',
        instagramUrl: settings.instagramUrl ?? '',
        facebookUrl: settings.facebookUrl ?? '',
        youtubeUrl: settings.youtubeUrl ?? '',
        mapCenterLat: num(settings.mapCenterLat, FIRST_RUN_VALUES.mapCenterLat),
        mapCenterLng: num(settings.mapCenterLng, FIRST_RUN_VALUES.mapCenterLng),
        mapDefaultZoom: num(settings.mapDefaultZoom, FIRST_RUN_VALUES.mapDefaultZoom),
        tabNames: pick(FIRST_RUN_VALUES.tabNames, settings.tabNames),
        contentBlocks: pick(FIRST_RUN_VALUES.contentBlocks, settings.contentBlocks),
        featureToggles: { ...FIRST_RUN_FEATURES, ...(settings.featureToggles ?? {}) },
    };
}

const TOP_LEVEL_STRINGS = [
    'museumName', 'museumShortName', 'sidebarTitle', 'heroTitle', 'heroSubtitle', 'theme', 'logoUrl',
    'contactSupportUrl', 'archiveFeedbackUrl', 'suggestionBoxUrl', 'stripeBillingPortalUrl',
    'instagramUrl', 'facebookUrl', 'youtubeUrl',
] as const;

const MAP_NUMBERS = ['mapCenterLat', 'mapCenterLng', 'mapDefaultZoom'] as const;

/**
 * Every wizard field whose value differs from where it started, as a path —
 * `museumName`, `tabNames.home`, `featureToggles.enableMap`. A field emptied on
 * purpose is a change; a field left alone is not.
 */
export function changedWizardFields(initial: WizardValues, current: WizardValues): string[] {
    const changed: string[] = [];
    for (const key of TOP_LEVEL_STRINGS) {
        if (current[key] !== initial[key]) changed.push(key);
    }
    if (JSON.stringify(current.backgroundImages) !== JSON.stringify(initial.backgroundImages)) {
        changed.push('backgroundImages');
    }
    for (const key of MAP_NUMBERS) {
        if (Number(current[key]) !== Number(initial[key])) changed.push(key);
    }
    for (const group of ['tabNames', 'contentBlocks'] as const) {
        for (const key of Object.keys(current[group])) {
            if (current[group][key] !== initial[group][key]) changed.push(`${group}.${key}`);
        }
    }
    for (const key of Object.keys(current.featureToggles) as (keyof FeatureToggles)[]) {
        if (current.featureToggles[key] !== initial.featureToggles[key]) changed.push(`featureToggles.${key}`);
    }
    return changed;
}

/** First-run setup: everything the wizard collects, as before, plus the feature toggles. */
export function firstRunAppearanceWrite(values: WizardValues): Record<string, unknown> {
    return {
        theme: values.theme,
        museumName: values.museumName,
        museumShortName: values.museumShortName,
        sidebarTitle: values.sidebarTitle,
        heroTitle: values.heroTitle,
        heroSubtitle: values.heroSubtitle,
        logoUrl: values.logoUrl,
        backgroundImages: values.backgroundImages,
        contactSupportUrl: values.contactSupportUrl,
        archiveFeedbackUrl: values.archiveFeedbackUrl,
        suggestionBoxUrl: values.suggestionBoxUrl,
        stripeBillingPortalUrl: values.stripeBillingPortalUrl,
        instagramUrl: values.instagramUrl,
        facebookUrl: values.facebookUrl,
        youtubeUrl: values.youtubeUrl,
        mapCenterLat: parseFloat(values.mapCenterLat),
        mapCenterLng: parseFloat(values.mapCenterLng),
        mapDefaultZoom: parseInt(values.mapDefaultZoom, 10),
        tabNames: values.tabNames,
        contentBlocks: {
            ...values.contentBlocks,
            heroTitle: values.heroTitle,
            heroSubtitle: values.heroSubtitle,
        },
        featureToggles: values.featureToggles,
    };
}

/**
 * A re-run: only the changed fields, shaped for `setDoc(..., { merge: true })`.
 * Merge applies nested maps key by key, so `{ tabNames: { home: 'X' } }` renames
 * one tab and leaves the rest — including keys the wizard doesn't show — alone.
 */
export function rerunAppearanceWrite(initial: WizardValues, current: WizardValues): Record<string, unknown> {
    const write: Record<string, unknown> = {};
    const nested = (group: string): Record<string, unknown> =>
        (write[group] ??= {}) as Record<string, unknown>;

    for (const path of changedWizardFields(initial, current)) {
        const [group, key] = path.split('.');
        if (key) {
            nested(group)[key] = (current as unknown as Record<string, Record<string, unknown>>)[group][key];
        } else if (group === 'mapCenterLat' || group === 'mapCenterLng') {
            write[group] = parseFloat(current[group]);
        } else if (group === 'mapDefaultZoom') {
            write[group] = parseInt(current.mapDefaultZoom, 10);
        } else {
            write[group] = current[group as keyof WizardValues];
            // The homepage reads the hero text from contentBlocks first, so keep
            // the copy there in step, as first-run setup and Appearance Settings do.
            if (group === 'heroTitle' || group === 'heroSubtitle') {
                nested('contentBlocks')[group] = current[group];
            }
        }
    }
    return write;
}
