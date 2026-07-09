import React, { createContext, useContext, useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface ThemeConfig {
    name: string;
    cream: string;
    beige: string;
    tanLight: string;
    tan: string;
    tanDark: string;
    charcoal: string;
    charcoalLight: string;
}

export const THEME_PRESETS: Record<string, ThemeConfig> = {
    classic: {
        name: 'Classic SAHS (Heritage Cream)',
        cream: '#fcfaf6',
        beige: '#f1ede4',
        tanLight: '#e1d7c6',
        tan: '#8b7355',
        tanDark: '#68543f',
        charcoal: '#3a2d1d',
        charcoalLight: '#746048'
    },
    burgundy: {
        name: 'Heritage Burgundy & Rose',
        cream: '#faf6f6',
        beige: '#ebdcdc',
        tanLight: '#d9b6b6',
        tan: '#8a2b37',
        tanDark: '#5e1b23',
        charcoal: '#2e191b',
        charcoalLight: '#613f42'
    },
    forest: {
        name: 'Historic Forest Green',
        cream: '#f5f7f2',
        beige: '#e3e8dc',
        tanLight: '#c2d1b8',
        tan: '#2d5a27',
        tanDark: '#1c3b1a',
        charcoal: '#1a2419',
        charcoalLight: '#475945'
    },
    navy: {
        name: 'Maritime Navy & Slate',
        cream: '#f4f6f9',
        beige: '#e2e6ed',
        tanLight: '#c2cbdc',
        tan: '#1a365d',
        tanDark: '#112240',
        charcoal: '#101726',
        charcoalLight: '#46536b'
    },
    gold: {
        name: 'Vintage Gold & Charcoal',
        cream: '#faf9f5',
        beige: '#ebdcb9',
        tanLight: '#d9c9a0',
        tan: '#996515',
        tanDark: '#70470b',
        charcoal: '#24201a',
        charcoalLight: '#595045'
    }
};

export interface FeatureToggles {
    enableLibrary: boolean;
    enableOralHistories: boolean;
    enableMembership: boolean;
    enableMap: boolean;
    enableCollections: boolean;
}

interface AppearanceSettings {
    theme: string;
    heroTitle: string;
    heroSubtitle: string;
    backgroundImages: string[];
    logoUrl?: string;
    instagramUrl?: string;
    facebookUrl?: string;
    youtubeUrl?: string;
    sidebarTitle?: string;
    museumName?: string;
    museumShortName?: string;
    tabNames?: Record<string, string>;
    contentBlocks?: Record<string, string>;
    featureToggles?: FeatureToggles;
    contactSupportUrl?: string;
    archiveFeedbackUrl?: string;
    suggestionBoxUrl?: string;
    mapCenterLat?: number;
    mapCenterLng?: number;
    mapDefaultZoom?: number;
    stripeBillingPortalUrl?: string;
}

interface AppearanceContextType {
    settings: AppearanceSettings;
    loading: boolean;
    refreshSettings: () => Promise<void>;
    isAppearanceEditMode: boolean;
    setIsAppearanceEditMode: React.Dispatch<React.SetStateAction<boolean>>;
    updateContentBlock: (key: string, value: string) => Promise<void>;
}

const DEFAULT_SETTINGS: AppearanceSettings = {
    theme: 'classic',
    museumName: 'Senoia Area Historical Society',
    museumShortName: 'Senoia',
    contactSupportUrl: "https://www.senoiahistory.com/contact-sahs",
    archiveFeedbackUrl: "https://docs.google.com/forms/d/e/1FAIpQLSfxS94_L22fNGxOxHOememW717MDBXl_e-fqSyWr6R3AbcEcQ/viewform?usp=dialog",
    suggestionBoxUrl: "https://docs.google.com/forms/d/e/1FAIpQLSdoQbNvRVS8QZKeilZJKoTC9iTwFRxDalJJv9dcfq81NytRBw/viewform?usp=header",
    mapCenterLat: 33.3001,
    mapCenterLng: -84.5544,
    mapDefaultZoom: 13,
    stripeBillingPortalUrl: "https://billing.stripe.com/p/login/3cscOSe99bt8bvi000",
    heroTitle: 'Senoia Area\nHistorical Society',
    heroSubtitle: 'Preserving Our Past, Inspiring Our Future',
    backgroundImages: [
        "/home-pharmacy.jpg",
        "/home-street-view.jpg",
        "/home-old-main.png",
        "/home-industrial.jpg"
    ],
    logoUrl: '',
    instagramUrl: "https://www.instagram.com/senoiahistory/",
    facebookUrl: "https://www.facebook.com/profile.php?id=100064525936225&sk=directory_contact_info",
    youtubeUrl: "https://www.youtube.com/@SenoiaAreaHistoricalSociety",
    sidebarTitle: "Senoia Area\nHistorical Society",
    tabNames: {
        home: "Home",
        senoiaStories: "Senoia Stories",
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
        homeShareTitle: "Help Us Spread the\nHistory of Senoia",
        homeShareDesc: "Our mission is to preserve and share the rich heritage of our community. Share this archive with friends and family, or follow us on social media for daily historical insights.",
        footerCopyrightTitle: "Copyright & Usage Notice",
        footerCopyrightDesc: "All information, documents, photographs, and materials provided on this website are the exclusive property of the Senoia Area Historical Society. All rights are reserved. The materials are made available for personal, educational, and non-commercial research purposes only. Any reproduction, distribution, modification, public display, or commercial use of any photographs, scans, documents, or other content found on this website is strictly prohibited without the express written permission of the Senoia Area Historical Society.",
        footerAiTitle: "Authenticity & AI Disclaimer",
        footerAiDesc: "The Senoia Area Historical Society is committed to preserving history. No artificial intelligence (AI) is used to generate, transcribe, alter, or enhance the historical documents, photographs, and metadata within this archive. All historical materials are manually curated, researched, and transcribed by our dedicated curators and volunteers to ensure complete authenticity.\n\nWhile AI tools were utilized to assist our development team in coding and building the software infrastructure of this website, AI is strictly prohibited from altering the historical records themselves.",
        exploreTitle: "Explore Our Archives",
        exploreSubtitle: "Discover the stories, people, and events that shaped our community",
        exploreDocTitle: "Historical Documents",
        exploreDocDesc: "Dive into primary sources including letters, ledgers, meeting minutes, and local government records. These documents offer a firsthand look at the daily life, governance, and development of Senoia throughout the decades.",
        exploreFigTitle: "Historic Figures",
        exploreFigDesc: "Read about the individuals who have left a lasting impact on our community. Discover the history behind the names of local landmarks and the pioneers who built Senoia.",
        exploreOrgTitle: "Historic Organizations",
        exploreOrgDesc: "Explore the history of local businesses, churches, schools, and civic groups that have served as the foundation of our community's social and economic life.",
        exploreArtTitle: "Artifact Collection",
        exploreArtDesc: "Our collection of physical artifacts captures the material history of Senoia. From textiles and furniture to ceramics and historical memorabilia.",
        exploreSearchTitle: "Search the Archive",
        exploreSearchDesc: "Looking for something specific? Use our advanced search tool to query the archive by keyword, date, location, or subject tags. Use filters and categories to narrow down your search results.",
        qrTitle: "SAHS Website",
        qrSubtitle: "Scan to Visit Archive",
        qrValue: "https://sahs-archives.web.app",
        storiesTitle: "Senoia Stories",
        storiesTitleItalic: "Stories",
        storiesDesc: "A collection of oral history interviews dedicated to preserving the voices, memories, and personal histories that shaped the Senoia Area community over the decades.",
        storiesLogoUrl: ""
    },
    featureToggles: {
        enableLibrary: true,
        enableOralHistories: true,
        enableMembership: true,
        enableMap: true,
        enableCollections: true
    }
};

const AppearanceContext = createContext<AppearanceContextType>({} as AppearanceContextType);

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<AppearanceSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [isAppearanceEditMode, setIsAppearanceEditMode] = useState(false);

    const applyTheme = (themeKey: string) => {
        const theme = THEME_PRESETS[themeKey] || THEME_PRESETS.classic;
        const root = document.documentElement;
        root.style.setProperty('--color-cream', theme.cream);
        root.style.setProperty('--color-beige', theme.beige);
        root.style.setProperty('--color-tan-light', theme.tanLight);
        root.style.setProperty('--color-tan', theme.tan);
        root.style.setProperty('--color-tan-dark', theme.tanDark);
        root.style.setProperty('--color-charcoal', theme.charcoal);
        root.style.setProperty('--color-charcoal-light', theme.charcoalLight);
    };

    const updateContentBlock = async (key: string, value: string) => {
        try {
            const currentBlocks = settings.contentBlocks || {};
            await setDoc(doc(db, 'site_settings', 'appearance'), {
                contentBlocks: {
                    ...currentBlocks,
                    [key]: value
                }
            }, { merge: true });
            await refreshSettings();
        } catch (error) {
            console.error("Failed to update content block", error);
            alert("Failed to update content block.");
        }
    };

    const refreshSettings = async () => {
        try {
            const snap = await getDoc(doc(db, 'site_settings', 'appearance'));
            if (snap.exists()) {
                const data = snap.data();
                const fetched: AppearanceSettings = {
                    theme: data.theme || 'classic',
                    heroTitle: data.heroTitle || DEFAULT_SETTINGS.heroTitle,
                    heroSubtitle: data.heroSubtitle || DEFAULT_SETTINGS.heroSubtitle,
                    backgroundImages: (data.backgroundImages && data.backgroundImages.length > 0)
                        ? data.backgroundImages
                        : DEFAULT_SETTINGS.backgroundImages,
                    logoUrl: data.logoUrl || '',
                    instagramUrl: data.instagramUrl || DEFAULT_SETTINGS.instagramUrl,
                    facebookUrl: data.facebookUrl || DEFAULT_SETTINGS.facebookUrl,
                    youtubeUrl: data.youtubeUrl || DEFAULT_SETTINGS.youtubeUrl,
                    sidebarTitle: data.sidebarTitle || DEFAULT_SETTINGS.sidebarTitle,
                    museumName: data.museumName || DEFAULT_SETTINGS.museumName,
                    museumShortName: data.museumShortName || DEFAULT_SETTINGS.museumShortName,
                    tabNames: {
                        ...DEFAULT_SETTINGS.tabNames,
                        ...(data.tabNames || {})
                    },
                    contentBlocks: {
                        ...DEFAULT_SETTINGS.contentBlocks,
                        ...(data.contentBlocks || {})
                    },
                    featureToggles: {
                        ...DEFAULT_SETTINGS.featureToggles,
                        ...(data.featureToggles || {})
                    },
                    contactSupportUrl: data.contactSupportUrl !== undefined ? data.contactSupportUrl : DEFAULT_SETTINGS.contactSupportUrl,
                    archiveFeedbackUrl: data.archiveFeedbackUrl !== undefined ? data.archiveFeedbackUrl : DEFAULT_SETTINGS.archiveFeedbackUrl,
                    suggestionBoxUrl: data.suggestionBoxUrl !== undefined ? data.suggestionBoxUrl : DEFAULT_SETTINGS.suggestionBoxUrl,
                    mapCenterLat: data.mapCenterLat !== undefined ? Number(data.mapCenterLat) : DEFAULT_SETTINGS.mapCenterLat,
                    mapCenterLng: data.mapCenterLng !== undefined ? Number(data.mapCenterLng) : DEFAULT_SETTINGS.mapCenterLng,
                    mapDefaultZoom: data.mapDefaultZoom !== undefined ? Number(data.mapDefaultZoom) : DEFAULT_SETTINGS.mapDefaultZoom,
                    stripeBillingPortalUrl: data.stripeBillingPortalUrl !== undefined ? data.stripeBillingPortalUrl : DEFAULT_SETTINGS.stripeBillingPortalUrl
                };
                setSettings(fetched);
                applyTheme(fetched.theme);
            } else {
                setSettings(DEFAULT_SETTINGS);
                applyTheme('classic');
            }
        } catch (e) {
            console.error("Failed to load appearance settings from db", e);
            setSettings(DEFAULT_SETTINGS);
            applyTheme('classic');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refreshSettings();
    }, []);

    return (
        <AppearanceContext.Provider value={{ 
            settings, 
            loading, 
            refreshSettings, 
            isAppearanceEditMode, 
            setIsAppearanceEditMode, 
            updateContentBlock 
        }}>
            {children}
        </AppearanceContext.Provider>
    );
}

export const useAppearance = () => useContext(AppearanceContext);
