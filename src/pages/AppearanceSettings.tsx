import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useAppearance, THEME_PRESETS } from '../contexts/AppearanceContext';
import { db, storage } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
    Palette, Upload, Trash2, ArrowLeft, Loader2, Plus, Sparkles, Check,
    Image as ImageIcon, Building, Sliders, MapPin, BookOpen, Share2, User
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

type TabId = 'branding' | 'homepage' | 'navigation' | 'links' | 'modules';

interface Tab {
    id: TabId;
    label: string;
    icon: React.ReactNode;
}

const TABS: Tab[] = [
    { id: 'branding',    label: 'Branding',       icon: <Palette size={16} /> },
    { id: 'homepage',    label: 'Homepage',        icon: <Sparkles size={16} /> },
    { id: 'navigation',  label: 'Navigation',      icon: <Sliders size={16} /> },
    { id: 'links',       label: 'Links & Social',  icon: <Share2 size={16} /> },
    { id: 'modules',     label: 'Modules',         icon: <BookOpen size={16} /> },
];

export function AppearanceSettings() {
    const { realIsAdmin } = useAuth();
    const { settings, refreshSettings } = useAppearance();
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState<TabId>('branding');

    // ── Branding ──────────────────────────────────────────────────────────────
    const [selectedTheme, setSelectedTheme] = useState(settings.theme);
    const [museumName, setMuseumName] = useState(settings.museumName || '');
    const [museumShortName, setMuseumShortName] = useState(settings.museumShortName || '');
    const [logoUrl, setLogoUrl] = useState(settings.logoUrl || '');
    const [sidebarTitle, setSidebarTitle] = useState(settings.sidebarTitle || '');
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);
    const logoInputRef = useRef<HTMLInputElement>(null);

    // ── Homepage ──────────────────────────────────────────────────────────────
    const [heroTitle, setHeroTitle] = useState(settings.heroTitle);
    const [heroSubtitle, setHeroSubtitle] = useState(settings.heroSubtitle);
    const [backgroundImages, setBackgroundImages] = useState<string[]>(settings.backgroundImages);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Spotlight
    const [spotlightEnabled, setSpotlightEnabled] = useState(settings.spotlight?.enabled ?? false);
    const [spotlightName, setSpotlightName] = useState(settings.spotlight?.name || '');
    const [spotlightRole, setSpotlightRole] = useState(settings.spotlight?.role || '');
    const [spotlightBio, setSpotlightBio] = useState(settings.spotlight?.bio || '');
    const [spotlightLinkedIn, setSpotlightLinkedIn] = useState(settings.spotlight?.linkedInUrl || '');
    const [spotlightImageUrl, setSpotlightImageUrl] = useState(settings.spotlight?.imageUrl || '');
    const [isUploadingSpotlight, setIsUploadingSpotlight] = useState(false);
    const spotlightImageRef = useRef<HTMLInputElement>(null);

    // ── Navigation ────────────────────────────────────────────────────────────
    const [enableLibrary, setEnableLibrary] = useState(settings.featureToggles?.enableLibrary !== false);
    const [enableOralHistories, setEnableOralHistories] = useState(settings.featureToggles?.enableOralHistories !== false);
    const [enableMembership, setEnableMembership] = useState(settings.featureToggles?.enableMembership !== false);
    const [enableMap, setEnableMap] = useState(settings.featureToggles?.enableMap !== false);
    const [enableCollections, setEnableCollections] = useState(settings.featureToggles?.enableCollections !== false);

    // ── Links & Social ────────────────────────────────────────────────────────
    const [instagramUrl, setInstagramUrl] = useState(settings.instagramUrl || '');
    const [facebookUrl, setFacebookUrl] = useState(settings.facebookUrl || '');
    const [youtubeUrl, setYoutubeUrl] = useState(settings.youtubeUrl || '');
    const [contactSupportUrl, setContactSupportUrl] = useState(settings.contactSupportUrl || '');
    const [archiveFeedbackUrl, setArchiveFeedbackUrl] = useState(settings.archiveFeedbackUrl || '');
    const [suggestionBoxUrl, setSuggestionBoxUrl] = useState(settings.suggestionBoxUrl || '');
    const [stripeBillingPortalUrl, setStripeBillingPortalUrl] = useState(settings.stripeBillingPortalUrl || '');

    // ── Modules ───────────────────────────────────────────────────────────────
    const [showLibraryNotice, setShowLibraryNotice] = useState(settings.showLibraryNotice !== false);
    const [libraryNoticeText, setLibraryNoticeText] = useState(settings.libraryNoticeText || '');
    const [mapCenterLat, setMapCenterLat] = useState(settings.mapCenterLat || 33.3001);
    const [mapCenterLng, setMapCenterLng] = useState(settings.mapCenterLng || -84.5544);
    const [mapDefaultZoom, setMapDefaultZoom] = useState(settings.mapDefaultZoom || 13);

    // ── Shared ────────────────────────────────────────────────────────────────
    const [isSaving, setIsSaving] = useState(false);

    // Redirect if not admin
    useEffect(() => {
        if (!realIsAdmin) navigate('/');
    }, [realIsAdmin, navigate]);

    // Sync when context loads
    useEffect(() => {
        setSelectedTheme(settings.theme);
        setMuseumName(settings.museumName || '');
        setMuseumShortName(settings.museumShortName || '');
        setLogoUrl(settings.logoUrl || '');
        setSidebarTitle(settings.sidebarTitle || '');
        setHeroTitle(settings.heroTitle);
        setHeroSubtitle(settings.heroSubtitle);
        setBackgroundImages(settings.backgroundImages);
        setSpotlightEnabled(settings.spotlight?.enabled ?? false);
        setSpotlightName(settings.spotlight?.name || '');
        setSpotlightRole(settings.spotlight?.role || '');
        setSpotlightBio(settings.spotlight?.bio || '');
        setSpotlightLinkedIn(settings.spotlight?.linkedInUrl || '');
        setSpotlightImageUrl(settings.spotlight?.imageUrl || '');
        setEnableLibrary(settings.featureToggles?.enableLibrary !== false);
        setEnableOralHistories(settings.featureToggles?.enableOralHistories !== false);
        setEnableMembership(settings.featureToggles?.enableMembership !== false);
        setEnableMap(settings.featureToggles?.enableMap !== false);
        setEnableCollections(settings.featureToggles?.enableCollections !== false);
        setInstagramUrl(settings.instagramUrl || '');
        setFacebookUrl(settings.facebookUrl || '');
        setYoutubeUrl(settings.youtubeUrl || '');
        setContactSupportUrl(settings.contactSupportUrl || '');
        setArchiveFeedbackUrl(settings.archiveFeedbackUrl || '');
        setSuggestionBoxUrl(settings.suggestionBoxUrl || '');
        setStripeBillingPortalUrl(settings.stripeBillingPortalUrl || '');
        setShowLibraryNotice(settings.showLibraryNotice !== false);
        setLibraryNoticeText(settings.libraryNoticeText || '');
        setMapCenterLat(settings.mapCenterLat || 33.3001);
        setMapCenterLng(settings.mapCenterLng || -84.5544);
        setMapDefaultZoom(settings.mapDefaultZoom || 13);
    }, [settings]);

    // ── Upload handlers ───────────────────────────────────────────────────────
    const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { alert('Please select an image file.'); return; }
        setIsUploading(true);
        try {
            const fileRef = ref(storage, `site_assets/hero_slider_${Date.now()}_${file.name}`);
            await uploadBytes(fileRef, file);
            const downloadUrl = await getDownloadURL(fileRef);
            setBackgroundImages(prev => [...prev, downloadUrl]);
        } catch { alert('Failed to upload image. Please try again.'); }
        finally { setIsUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
    };

    const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { alert('Please select an image file.'); return; }
        setIsUploadingLogo(true);
        try {
            const fileRef = ref(storage, `site_assets/logo_${Date.now()}_${file.name}`);
            await uploadBytes(fileRef, file);
            setLogoUrl(await getDownloadURL(fileRef));
        } catch { alert('Failed to upload logo. Please try again.'); }
        finally { setIsUploadingLogo(false); if (logoInputRef.current) logoInputRef.current.value = ''; }
    };

    const handleUploadSpotlightImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { alert('Please select an image file.'); return; }
        setIsUploadingSpotlight(true);
        try {
            const fileRef = ref(storage, `site_assets/spotlight_${Date.now()}_${file.name}`);
            await uploadBytes(fileRef, file);
            setSpotlightImageUrl(await getDownloadURL(fileRef));
        } catch { alert('Failed to upload spotlight image. Please try again.'); }
        finally { setIsUploadingSpotlight(false); if (spotlightImageRef.current) spotlightImageRef.current.value = ''; }
    };

    const handleDeleteImage = (indexToDelete: number) => {
        if (backgroundImages.length <= 1) { alert('You must keep at least one background image for the slider.'); return; }
        setBackgroundImages(prev => prev.filter((_, idx) => idx !== indexToDelete));
    };

    // ── Save ──────────────────────────────────────────────────────────────────
    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await setDoc(doc(db, 'site_settings', 'appearance'), {
                theme: selectedTheme,
                museumName: museumName.trim(),
                museumShortName: museumShortName.trim(),
                logoUrl,
                sidebarTitle: sidebarTitle.trim(),
                heroTitle: heroTitle.trim(),
                heroSubtitle: heroSubtitle.trim(),
                backgroundImages,
                spotlight: {
                    enabled: spotlightEnabled,
                    name: spotlightName.trim(),
                    role: spotlightRole.trim(),
                    bio: spotlightBio.trim(),
                    linkedInUrl: spotlightLinkedIn.trim(),
                    imageUrl: spotlightImageUrl,
                },
                featureToggles: { enableLibrary, enableOralHistories, enableMembership, enableMap, enableCollections },
                instagramUrl: instagramUrl.trim(),
                facebookUrl: facebookUrl.trim(),
                youtubeUrl: youtubeUrl.trim(),
                contactSupportUrl: contactSupportUrl.trim(),
                archiveFeedbackUrl: archiveFeedbackUrl.trim(),
                suggestionBoxUrl: suggestionBoxUrl.trim(),
                stripeBillingPortalUrl: stripeBillingPortalUrl.trim(),
                showLibraryNotice,
                libraryNoticeText: libraryNoticeText.trim(),
                mapCenterLat: Number(mapCenterLat) || 33.3001,
                mapCenterLng: Number(mapCenterLng) || -84.5544,
                mapDefaultZoom: Number(mapDefaultZoom) || 13,
                // Mirror heroTitle/heroSubtitle into contentBlocks so EditableText
                // components on the homepage (which read from contentBlocks[textKey])
                // stay in sync with the Appearance Settings form.
                contentBlocks: {
                    ...(settings.contentBlocks || {}),
                    heroTitle: heroTitle.trim(),
                    heroSubtitle: heroSubtitle.trim(),
                },
            }, { merge: true });
            await refreshSettings();
            alert('Appearance settings saved successfully!');
        } catch (error) {
            console.error('Error saving appearance settings:', error);
            alert('Failed to save appearance settings.');
        } finally {
            setIsSaving(false);
        }
    };

    if (!realIsAdmin) return null;

    // ── Reusable toggle component ─────────────────────────────────────────────
    const Toggle = ({ value, onChange }: { value: boolean; onChange: () => void }) => (
        <button
            type="button"
            onClick={onChange}
            className={`relative inline-flex h-8 w-16 shrink-0 cursor-pointer rounded-full border-2 border-tan-light/50 transition-colors duration-300 ease-in-out focus:outline-none items-center ${value ? 'bg-tan text-white' : 'bg-cream text-charcoal/40'}`}
        >
            <span className="sr-only">Toggle</span>
            <span className={`absolute text-[9px] font-black tracking-wider uppercase transition-all duration-300 ${value ? 'left-2.5 opacity-100 text-white' : 'right-2.5 opacity-100 text-charcoal/40'}`}>
                {value ? 'ON' : 'OFF'}
            </span>
            <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md border border-tan-light/20 transition-transform duration-300 ease-in-out ${value ? 'translate-x-8' : 'translate-x-0.5'}`} />
        </button>
    );

    const inputCls = "w-full px-4 py-3 border border-tan-light rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/50 bg-cream/10 text-base";
    const labelCls = "block text-sm font-bold text-charcoal mb-2";
    const hintCls  = "text-xs text-charcoal/50 mt-1";
    const cardCls  = "bg-white rounded-2xl border border-tan-light/50 shadow-sm p-6 sm:p-8 space-y-6";
    const sectionHeaderCls = "flex items-center gap-2 mb-6 pb-4 border-b border-tan-light/20";

    return (
        <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8 font-sans text-charcoal">
            {/* Page Header */}
            <div className="flex items-center gap-4 mb-8">
                <Link
                    to="/"
                    className="p-2 hover:bg-black/5 rounded-lg text-charcoal/60 hover:text-charcoal transition-colors"
                    title="Back to Home"
                >
                    <ArrowLeft size={20} />
                </Link>
                <div>
                    <h1 className="font-serif text-3xl md:text-4xl font-bold tracking-tight text-charcoal">
                        Website Appearance Settings
                    </h1>
                    <p className="text-sm text-charcoal-light mt-1 font-medium">
                        Configure branding, homepage, navigation, links, and module settings.
                    </p>
                </div>
            </div>

            {/* Tab Bar */}
            <div className="flex gap-1 bg-cream border border-tan-light/40 rounded-2xl p-1.5 mb-8 overflow-x-auto">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all duration-200 flex-1 justify-center ${
                            activeTab === tab.id
                                ? 'bg-white text-tan shadow-sm border border-tan-light/40'
                                : 'text-charcoal/60 hover:text-charcoal hover:bg-white/50'
                        }`}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            <form onSubmit={handleSave} className="space-y-8">

                {/* ── BRANDING TAB ─────────────────────────────────────────── */}
                {activeTab === 'branding' && (
                    <>
                        {/* Theme */}
                        <div className={cardCls.replace('space-y-6', '')}>
                            <div className={sectionHeaderCls}>
                                <Palette className="text-tan" size={22} />
                                <h2 className="font-serif text-xl font-bold">Theme Color Palette</h2>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {Object.entries(THEME_PRESETS).map(([key, config]) => {
                                    const isSelected = selectedTheme === key;
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => setSelectedTheme(key)}
                                            className={`relative p-5 rounded-xl border text-left transition-all duration-200 ${
                                                isSelected
                                                    ? 'border-tan ring-2 ring-tan/20 bg-tan/5'
                                                    : 'border-tan-light/40 hover:border-tan-light bg-cream/10 hover:bg-cream/40'
                                            }`}
                                        >
                                            <div className="flex justify-between items-start mb-3">
                                                <span className="font-bold text-base leading-snug">{config.name}</span>
                                                {isSelected && (
                                                    <span className="bg-tan text-white rounded-full p-1 flex items-center justify-center">
                                                        <Check size={12} strokeWidth={3} />
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex gap-2">
                                                <div className="w-6 h-6 rounded-full border border-black/5" style={{ backgroundColor: config.cream }} title="Cream" />
                                                <div className="w-6 h-6 rounded-full border border-black/5" style={{ backgroundColor: config.beige }} title="Beige" />
                                                <div className="w-6 h-6 rounded-full border border-black/5" style={{ backgroundColor: config.tan }} title="Tan" />
                                                <div className="w-6 h-6 rounded-full border border-black/5" style={{ backgroundColor: config.charcoal }} title="Charcoal" />
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Museum Info */}
                        <div className={cardCls}>
                            <div className={sectionHeaderCls}>
                                <Building className="text-tan" size={22} />
                                <h2 className="font-serif text-xl font-bold">General Museum Information</h2>
                            </div>
                            <div>
                                <label className={labelCls}>Museum Full Name</label>
                                <input type="text" required value={museumName} onChange={e => setMuseumName(e.target.value)} className={inputCls} placeholder="e.g. Senoia Area Historical Society" />
                                <p className={hintCls}>Used dynamically throughout the app, including in the page footer, metadata defaults, and copyright disclaimers.</p>
                            </div>
                            <div>
                                <label className={labelCls}>Museum Short Name</label>
                                <input type="text" required value={museumShortName} onChange={e => setMuseumShortName(e.target.value)} className={inputCls} placeholder="e.g. Senoia" />
                                <p className={hintCls}>Used in location-based descriptions, map context, and community section names.</p>
                            </div>
                        </div>

                        {/* Logo & Sidebar */}
                        <div className={cardCls}>
                            <div className={sectionHeaderCls}>
                                <ImageIcon className="text-tan" size={22} />
                                <h2 className="font-serif text-xl font-bold">Website Logo & Sidebar</h2>
                            </div>
                            <div className="flex flex-col sm:flex-row items-center gap-6">
                                <div className="w-24 h-24 rounded-2xl bg-cream border border-tan-light/40 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                                    {logoUrl ? (
                                        <img src={logoUrl} alt="Logo Preview" className="w-full h-full object-contain p-2" />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center text-charcoal/30">
                                            <ImageIcon size={32} />
                                            <span className="text-[10px] mt-1 font-bold uppercase tracking-wider">Default</span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 space-y-3 w-full">
                                    <p className="text-sm text-charcoal-light font-medium leading-relaxed">Upload a custom logo to replace the default icon in the sidebar. Transparent PNGs work best.</p>
                                    <div className="flex flex-wrap gap-3">
                                        <input type="file" accept="image/*" ref={logoInputRef} onChange={handleUploadLogo} className="hidden" />
                                        <button type="button" onClick={() => logoInputRef.current?.click()} disabled={isUploadingLogo} className="flex items-center gap-2 bg-tan text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-tan-dark transition-all disabled:opacity-50">
                                            {isUploadingLogo ? <><Loader2 size={16} className="animate-spin" />Uploading...</> : <><Upload size={16} />Upload Logo</>}
                                        </button>
                                        {logoUrl && (
                                            <button type="button" onClick={() => setLogoUrl('')} className="flex items-center gap-2 border border-red-200 text-red-600 px-4 py-2 rounded-xl text-sm font-bold hover:bg-red-50 transition-colors">
                                                <Trash2 size={16} />Reset to Default
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="border-t border-tan-light/20 pt-6">
                                <label className={labelCls}>Sidebar Header Title</label>
                                <textarea required rows={2} value={sidebarTitle} onChange={e => setSidebarTitle(e.target.value)} className="w-full px-4 py-2 border border-tan-light rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/50 bg-cream/10 font-serif" placeholder="e.g. Senoia Area&#10;Historical Society" />
                                <p className={hintCls}>Appears at the top of the sidebar. Use a newline to separate lines.</p>
                            </div>
                        </div>
                    </>
                )}

                {/* ── HOMEPAGE TAB ─────────────────────────────────────────── */}
                {activeTab === 'homepage' && (
                    <>
                        {/* Hero */}
                        <div className={cardCls}>
                            <div className={sectionHeaderCls}>
                                <Sparkles className="text-tan" size={22} />
                                <h2 className="font-serif text-xl font-bold">Hero Section</h2>
                            </div>
                            <div>
                                <label className={labelCls}>Main Heading Title</label>
                                <textarea required rows={2} value={heroTitle} onChange={e => setHeroTitle(e.target.value)} className="w-full px-4 py-2 border border-tan-light rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/50 bg-cream/10" placeholder="e.g. Senoia Area&#10;Historical Society" />
                                <p className={hintCls}>Use newlines to break the heading across rows on desktop.</p>
                            </div>
                            <div>
                                <label className={labelCls}>Hero Subtitle</label>
                                <input type="text" required value={heroSubtitle} onChange={e => setHeroSubtitle(e.target.value)} className={inputCls} placeholder="e.g. Preserving Our Past, Inspiring Our Future" />
                            </div>
                        </div>

                        {/* Background Slider */}
                        <div className="bg-white rounded-2xl border border-tan-light/50 shadow-sm p-6 sm:p-8">
                            <div className="flex items-center justify-between mb-6 pb-4 border-b border-tan-light/20">
                                <div className="flex items-center gap-2">
                                    <Upload className="text-tan" size={22} />
                                    <h2 className="font-serif text-xl font-bold">Background Slider Images</h2>
                                </div>
                                <div>
                                    <input type="file" accept="image/*" ref={fileInputRef} onChange={handleUploadImage} className="hidden" />
                                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="flex items-center gap-2 bg-tan text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-tan-dark transition-all disabled:opacity-50">
                                        {isUploading ? <><Loader2 size={16} className="animate-spin" />Uploading...</> : <><Plus size={16} />Add Slide</>}
                                    </button>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                {backgroundImages.map((url, idx) => (
                                    <div key={idx} className="relative rounded-xl overflow-hidden aspect-video border border-tan-light/50 shadow-xs group bg-cream">
                                        <img src={url} alt={`Slide ${idx + 1}`} className="w-full h-full object-cover select-none" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <button type="button" onClick={() => handleDeleteImage(idx)} className="bg-red-600 hover:bg-red-800 text-white p-2 rounded-lg shadow transition-colors flex items-center gap-1.5 text-xs font-bold" title="Remove Slide">
                                                <Trash2 size={14} />Remove
                                            </button>
                                        </div>
                                        <span className="absolute bottom-2 left-2 bg-charcoal/70 text-white text-[10px] px-2 py-0.5 rounded-md">Slide {idx + 1}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Spotlight */}
                        <div className={cardCls}>
                            <div className={sectionHeaderCls}>
                                <User className="text-tan" size={22} />
                                <h2 className="font-serif text-xl font-bold">Featured Spotlight Banner</h2>
                            </div>
                            <p className="text-sm text-charcoal/60 -mt-2 leading-relaxed">
                                Highlight a volunteer, intern, or notable community member with a full-width banner on the home page.
                            </p>

                            {/* Enable toggle */}
                            <div className="flex items-center justify-between p-4 bg-cream/10 border border-tan-light/30 rounded-xl">
                                <div>
                                    <h3 className="text-sm font-bold text-charcoal">Show Spotlight Banner</h3>
                                    <p className="text-xs text-charcoal/50 mt-0.5">Display the spotlight section on the home page.</p>
                                </div>
                                <Toggle value={spotlightEnabled} onChange={() => setSpotlightEnabled(v => !v)} />
                            </div>

                            <div className="space-y-6 pt-2">
                                    {/* Image upload + preview */}
                                    <div className="flex flex-col sm:flex-row items-start gap-6">
                                        {/* Circular preview */}
                                        <div className="shrink-0 flex flex-col items-center gap-2">
                                            <div className="w-28 h-28 rounded-full border-4 border-tan/30 overflow-hidden bg-cream flex items-center justify-center shadow-md">
                                                {spotlightImageUrl ? (
                                                    <img src={spotlightImageUrl} alt="Spotlight preview" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="flex flex-col items-center text-charcoal/30">
                                                        <User size={32} />
                                                        <span className="text-[10px] font-bold uppercase tracking-wider mt-1">Photo</span>
                                                    </div>
                                                )}
                                            </div>
                                            <input type="file" accept="image/*" ref={spotlightImageRef} onChange={handleUploadSpotlightImage} className="hidden" />
                                            <button type="button" onClick={() => spotlightImageRef.current?.click()} disabled={isUploadingSpotlight} className="flex items-center gap-1.5 bg-tan text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-tan-dark transition-all disabled:opacity-50">
                                                {isUploadingSpotlight ? <><Loader2 size={12} className="animate-spin" />Uploading...</> : <><Upload size={12} />Upload Photo</>}
                                            </button>
                                            {spotlightImageUrl && (
                                                <button type="button" onClick={() => setSpotlightImageUrl('')} className="text-xs text-red-500 hover:text-red-700 font-semibold">Remove</button>
                                            )}
                                        </div>

                                        {/* Text fields */}
                                        <div className="flex-1 space-y-4 w-full">
                                            <div>
                                                <label className={labelCls}>Full Name</label>
                                                <input type="text" value={spotlightName} onChange={e => setSpotlightName(e.target.value)} className={inputCls} placeholder="e.g. Jane Smith" />
                                            </div>
                                            <div>
                                                <label className={labelCls}>Title / Role</label>
                                                <input type="text" value={spotlightRole} onChange={e => setSpotlightRole(e.target.value)} className={inputCls} placeholder="e.g. Archive Volunteer, Spring 2026" />
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className={labelCls}>Bio / Quote</label>
                                        <textarea rows={4} value={spotlightBio} onChange={e => setSpotlightBio(e.target.value)} className="w-full px-4 py-3 border border-tan-light rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/50 bg-cream/10 text-sm leading-relaxed" placeholder="A short bio or memorable quote from this person..." />
                                        <p className={hintCls}>Displayed in italic as a pull quote on the home page banner.</p>
                                    </div>

                                    <div>
                                        <label className={labelCls}>LinkedIn URL <span className="font-normal text-charcoal/40">(optional)</span></label>
                                        <input type="url" value={spotlightLinkedIn} onChange={e => setSpotlightLinkedIn(e.target.value)} className={inputCls} placeholder="https://www.linkedin.com/in/..." />
                                        <p className={hintCls}>If provided, a "Connect on LinkedIn" button will appear on the banner.</p>
                                    </div>
                                </div>
                        </div>
                    </>
                )}

                {/* ── NAVIGATION TAB ───────────────────────────────────────── */}
                {activeTab === 'navigation' && (
                    <div className={cardCls.replace('space-y-6', '')}>
                        <div className={sectionHeaderCls}>
                            <Sliders className="text-tan" size={22} />
                            <h2 className="font-serif text-xl font-bold">Active Feature Modules</h2>
                        </div>
                        <p className="text-sm text-charcoal/60 mb-4">Enable or disable major sections of the archive. Disabled modules are hidden from the sidebar and their routes become unavailable.</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {[
                                { label: 'Book Library System', desc: 'Catalog, manage, and search physical books in the museum library.', value: enableLibrary, onChange: () => setEnableLibrary(v => !v) },
                                { label: 'Oral Histories (Community Stories)', desc: 'Publish and play narrator recordings, transcripts, and community stories.', value: enableOralHistories, onChange: () => setEnableOralHistories(v => !v) },
                                { label: 'Membership System', desc: 'Manage paid museum memberships, profile benefits, and private folders.', value: enableMembership, onChange: () => setEnableMembership(v => !v) },
                                { label: 'Map Discovery Tools', desc: 'Geographic item mapping and interactive floor maps for museum navigation.', value: enableMap, onChange: () => setEnableMap(v => !v) },
                                { label: 'Curated Collections', desc: 'Group and display archival records under custom themes and temporary exhibitions.', value: enableCollections, onChange: () => setEnableCollections(v => !v) },
                            ].map(item => (
                                <div key={item.label} className="flex items-center justify-between p-4 bg-cream/10 border border-tan-light/30 rounded-xl">
                                    <div>
                                        <h3 className="text-sm font-bold text-charcoal">{item.label}</h3>
                                        <p className="text-xs text-charcoal/50 mt-1">{item.desc}</p>
                                    </div>
                                    <Toggle value={item.value} onChange={item.onChange} />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── LINKS & SOCIAL TAB ───────────────────────────────────── */}
                {activeTab === 'links' && (
                    <div className={cardCls}>
                        <div className={sectionHeaderCls}>
                            <Share2 className="text-tan" size={22} />
                            <h2 className="font-serif text-xl font-bold">Social Media & Help Links</h2>
                        </div>
                        <p className="text-sm text-charcoal/60 -mt-2">Leaving any link blank will automatically hide it from the sidebar or disable the corresponding portal button.</p>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label className={labelCls}>Instagram URL</label>
                                <input type="url" value={instagramUrl} onChange={e => setInstagramUrl(e.target.value)} className={inputCls} placeholder="https://www.instagram.com/your-page" />
                            </div>
                            <div>
                                <label className={labelCls}>Facebook URL</label>
                                <input type="url" value={facebookUrl} onChange={e => setFacebookUrl(e.target.value)} className={inputCls} placeholder="https://www.facebook.com/your-page" />
                            </div>
                            <div>
                                <label className={labelCls}>YouTube URL</label>
                                <input type="url" value={youtubeUrl} onChange={e => setYoutubeUrl(e.target.value)} className={inputCls} placeholder="https://www.youtube.com/your-channel" />
                            </div>
                            <div>
                                <label className={labelCls}>Contact Support URL</label>
                                <input type="url" value={contactSupportUrl} onChange={e => setContactSupportUrl(e.target.value)} className={inputCls} placeholder="https://your-museum.org/contact" />
                            </div>
                            <div>
                                <label className={labelCls}>Archive Feedback URL</label>
                                <input type="url" value={archiveFeedbackUrl} onChange={e => setArchiveFeedbackUrl(e.target.value)} className={inputCls} placeholder="https://forms.google.com/..." />
                            </div>
                            <div>
                                <label className={labelCls}>Suggestion Box URL</label>
                                <input type="url" value={suggestionBoxUrl} onChange={e => setSuggestionBoxUrl(e.target.value)} className={inputCls} placeholder="https://forms.google.com/..." />
                            </div>
                            <div className="md:col-span-3">
                                <label className={labelCls}>Stripe Billing Portal URL</label>
                                <input type="url" value={stripeBillingPortalUrl} onChange={e => setStripeBillingPortalUrl(e.target.value)} className={inputCls} placeholder="https://billing.stripe.com/..." />
                                <p className={hintCls}>Used in the Membership Status page for the "Manage Billing" button.</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── MODULES TAB ──────────────────────────────────────────── */}
                {activeTab === 'modules' && (
                    <>
                        {/* Library Module */}
                        {enableLibrary && (
                            <div className={cardCls}>
                                <div className={sectionHeaderCls}>
                                    <BookOpen className="text-tan" size={22} />
                                    <h2 className="font-serif text-xl font-bold">Library Module Settings</h2>
                                </div>
                                <div className="flex items-center justify-between p-4 bg-cream/10 border border-tan-light/30 rounded-xl">
                                    <div>
                                        <h3 className="text-sm font-bold text-charcoal">Display Lending Notice Banner</h3>
                                        <p className="text-xs text-charcoal/50 mt-1">Show a reference-only warning at the top of the Library book search page.</p>
                                    </div>
                                    <Toggle value={showLibraryNotice} onChange={() => setShowLibraryNotice(v => !v)} />
                                </div>
                                {showLibraryNotice && (
                                    <div className="space-y-2">
                                        <label htmlFor="libraryNoticeText" className={labelCls}>Lending Notice Banner Text</label>
                                        <textarea
                                            id="libraryNoticeText"
                                            rows={3}
                                            value={libraryNoticeText}
                                            onChange={e => setLibraryNoticeText(e.target.value)}
                                            className="w-full px-4 py-3 border border-tan-light rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/50 bg-cream/10 text-sm leading-relaxed"
                                            placeholder="Books in our collection are reference-only and are currently not available for check out..."
                                        />
                                        <p className={hintCls}>Custom warning message displayed in the library notice block.</p>
                                    </div>
                                )}
                                {!enableLibrary && (
                                    <p className="text-sm text-charcoal/40 italic">Enable the Book Library module under the Navigation tab to configure these settings.</p>
                                )}
                            </div>
                        )}

                        {/* Map Settings */}
                        <div className={cardCls}>
                            <div className={sectionHeaderCls}>
                                <MapPin className="text-tan" size={22} />
                                <h2 className="font-serif text-xl font-bold">Default Map Settings</h2>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div>
                                    <label className={labelCls}>Default Latitude</label>
                                    <input type="number" step="any" value={mapCenterLat} onChange={e => setMapCenterLat(Number(e.target.value))} className={`${inputCls} font-mono`} placeholder="33.3001" />
                                </div>
                                <div>
                                    <label className={labelCls}>Default Longitude</label>
                                    <input type="number" step="any" value={mapCenterLng} onChange={e => setMapCenterLng(Number(e.target.value))} className={`${inputCls} font-mono`} placeholder="-84.5544" />
                                </div>
                                <div>
                                    <label className={labelCls}>Default Zoom Level</label>
                                    <input type="number" min="1" max="20" value={mapDefaultZoom} onChange={e => setMapDefaultZoom(Number(e.target.value))} className={`${inputCls} font-mono`} placeholder="13" />
                                </div>
                            </div>
                            <p className={hintCls}>Sets the initial center location and zoom for the Map Discovery page and curator workspace maps.</p>
                        </div>
                    </>
                )}

                {/* ── Save Bar ─────────────────────────────────────────────── */}
                <div className="flex justify-end gap-4 border-t border-tan-light/20 pt-6">
                    <button type="button" onClick={() => navigate('/')} className="px-6 py-3 border border-tan text-tan rounded-xl hover:bg-tan/5 transition-colors font-bold uppercase tracking-wider text-sm">
                        Cancel
                    </button>
                    <button type="submit" disabled={isSaving} className="px-8 py-3 bg-tan text-white rounded-xl hover:bg-tan-dark transition-all disabled:opacity-50 font-bold uppercase tracking-wider text-sm flex items-center gap-2 shadow-md">
                        {isSaving && <Loader2 size={16} className="animate-spin" />}
                        Save Changes
                    </button>
                </div>
            </form>
        </div>
    );
}
