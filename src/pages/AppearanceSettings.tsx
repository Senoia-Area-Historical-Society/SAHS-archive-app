import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useAppearance, THEME_PRESETS } from '../contexts/AppearanceContext';
import { db, storage } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Palette, Upload, Trash2, ArrowLeft, Loader2, Plus, Sparkles, Check, Image as ImageIcon, Building, Sliders } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

export function AppearanceSettings() {
    const { realIsAdmin } = useAuth();
    const { settings, refreshSettings } = useAppearance();
    const navigate = useNavigate();

    // Form states
    const [selectedTheme, setSelectedTheme] = useState(settings.theme);
    const [heroTitle, setHeroTitle] = useState(settings.heroTitle);
    const [heroSubtitle, setHeroSubtitle] = useState(settings.heroSubtitle);
    const [backgroundImages, setBackgroundImages] = useState<string[]>(settings.backgroundImages);
    
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // Logo states
    const [logoUrl, setLogoUrl] = useState(settings.logoUrl || '');
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);
    const logoInputRef = useRef<HTMLInputElement>(null);

    // Sidebar & Social states
    const [sidebarTitle, setSidebarTitle] = useState(settings.sidebarTitle || '');
    const [instagramUrl, setInstagramUrl] = useState(settings.instagramUrl || '');
    const [facebookUrl, setFacebookUrl] = useState(settings.facebookUrl || '');
    const [youtubeUrl, setYoutubeUrl] = useState(settings.youtubeUrl || '');

    // Museum Branding states
    const [museumName, setMuseumName] = useState(settings.museumName || '');
    const [museumShortName, setMuseumShortName] = useState(settings.museumShortName || '');

    // Feature Toggles states
    const [enableLibrary, setEnableLibrary] = useState(settings.featureToggles?.enableLibrary !== false);
    const [enableOralHistories, setEnableOralHistories] = useState(settings.featureToggles?.enableOralHistories !== false);
    const [enableMembership, setEnableMembership] = useState(settings.featureToggles?.enableMembership !== false);
    const [enableMap, setEnableMap] = useState(settings.featureToggles?.enableMap !== false);
    const [enableCollections, setEnableCollections] = useState(settings.featureToggles?.enableCollections !== false);

    // Redirect if not admin
    useEffect(() => {
        if (!realIsAdmin) {
            navigate('/');
        }
    }, [realIsAdmin, navigate]);

    // Sync state when context settings load
    useEffect(() => {
        setSelectedTheme(settings.theme);
        setHeroTitle(settings.heroTitle);
        setHeroSubtitle(settings.heroSubtitle);
        setBackgroundImages(settings.backgroundImages);
        setLogoUrl(settings.logoUrl || '');
        setSidebarTitle(settings.sidebarTitle || '');
        setInstagramUrl(settings.instagramUrl || '');
        setFacebookUrl(settings.facebookUrl || '');
        setYoutubeUrl(settings.youtubeUrl || '');
        setMuseumName(settings.museumName || '');
        setMuseumShortName(settings.museumShortName || '');
        setEnableLibrary(settings.featureToggles?.enableLibrary !== false);
        setEnableOralHistories(settings.featureToggles?.enableOralHistories !== false);
        setEnableMembership(settings.featureToggles?.enableMembership !== false);
        setEnableMap(settings.featureToggles?.enableMap !== false);
        setEnableCollections(settings.featureToggles?.enableCollections !== false);
    }, [settings]);

    const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert('Please select an image file.');
            return;
        }

        setIsUploading(true);
        try {
            const fileRef = ref(storage, `site_assets/hero_slider_${Date.now()}_${file.name}`);
            await uploadBytes(fileRef, file);
            const downloadUrl = await getDownloadURL(fileRef);
            
            setBackgroundImages(prev => [...prev, downloadUrl]);
        } catch (error) {
            console.error('Error uploading image:', error);
            alert('Failed to upload image. Please try again.');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert('Please select an image file.');
            return;
        }

        setIsUploadingLogo(true);
        try {
            const fileRef = ref(storage, `site_assets/logo_${Date.now()}_${file.name}`);
            await uploadBytes(fileRef, file);
            const downloadUrl = await getDownloadURL(fileRef);
            setLogoUrl(downloadUrl);
        } catch (error) {
            console.error('Error uploading logo:', error);
            alert('Failed to upload logo. Please try again.');
        } finally {
            setIsUploadingLogo(false);
            if (logoInputRef.current) logoInputRef.current.value = '';
        }
    };

    const handleRemoveLogo = () => {
        setLogoUrl('');
    };

    const handleDeleteImage = (indexToDelete: number) => {
        if (backgroundImages.length <= 1) {
            alert('You must keep at least one background image for the slider.');
            return;
        }
        setBackgroundImages(prev => prev.filter((_, idx) => idx !== indexToDelete));
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await setDoc(doc(db, 'site_settings', 'appearance'), {
                theme: selectedTheme,
                heroTitle: heroTitle.trim(),
                heroSubtitle: heroSubtitle.trim(),
                backgroundImages: backgroundImages,
                logoUrl: logoUrl,
                sidebarTitle: sidebarTitle.trim(),
                instagramUrl: instagramUrl.trim(),
                facebookUrl: facebookUrl.trim(),
                youtubeUrl: youtubeUrl.trim(),
                museumName: museumName.trim(),
                museumShortName: museumShortName.trim(),
                featureToggles: {
                    enableLibrary,
                    enableOralHistories,
                    enableMembership,
                    enableMap,
                    enableCollections
                }
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

    return (
        <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8 font-sans text-charcoal">
            {/* Header */}
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
                        Configure the portal's branding, color palette, and homepage slides.
                    </p>
                </div>
            </div>

            <form onSubmit={handleSave} className="space-y-10">
                {/* 1. Theme Selector */}
                <div className="bg-white rounded-2xl border border-tan-light/50 shadow-sm p-6 sm:p-8">
                    <div className="flex items-center gap-2 mb-6 border-b border-tan-light/20 pb-4">
                        <Palette className="text-tan" size={24} />
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
                                    
                                    {/* Color Swatch Preview */}
                                    <div className="flex gap-2">
                                        <div className="w-6 h-6 rounded-full border border-black/5 shadow-xs" style={{ backgroundColor: config.cream }} title="Cream background" />
                                        <div className="w-6 h-6 rounded-full border border-black/5 shadow-xs" style={{ backgroundColor: config.beige }} title="Beige secondary" />
                                        <div className="w-6 h-6 rounded-full border border-black/5 shadow-xs" style={{ backgroundColor: config.tan }} title="Tan primary accent" />
                                        <div className="w-6 h-6 rounded-full border border-black/5 shadow-xs" style={{ backgroundColor: config.charcoal }} title="Charcoal text/base" />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 2. General Museum Information */}
                <div className="bg-white rounded-2xl border border-tan-light/50 shadow-sm p-6 sm:p-8">
                    <div className="flex items-center gap-2 mb-6 border-b border-tan-light/20 pb-4">
                        <Building className="text-tan" size={24} />
                        <h2 className="font-serif text-xl font-bold">General Museum Information</h2>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-charcoal mb-2">Museum Full Name</label>
                            <input
                                type="text"
                                required
                                value={museumName}
                                onChange={e => setMuseumName(e.target.value)}
                                className="w-full px-4 py-3 border border-tan-light rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/50 bg-cream/10 text-base"
                                placeholder="e.g. Senoia Area Historical Society"
                            />
                            <p className="text-xs text-charcoal/50 mt-1">Used dynamically throughout the app, including in the page footer, metadata defaults, and copyright disclaimers.</p>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-charcoal mb-2">Museum Short Name</label>
                            <input
                                type="text"
                                required
                                value={museumShortName}
                                onChange={e => setMuseumShortName(e.target.value)}
                                className="w-full px-4 py-3 border border-tan-light rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/50 bg-cream/10 text-base"
                                placeholder="e.g. Senoia"
                            />
                            <p className="text-xs text-charcoal/50 mt-1">Used in location-based descriptions, map context, and community section names.</p>
                        </div>
                    </div>
                </div>

                {/* 3. Logo Upload */}
                <div className="bg-white rounded-2xl border border-tan-light/50 shadow-sm p-6 sm:p-8">
                    <div className="flex items-center gap-2 mb-6 border-b border-tan-light/20 pb-4">
                        <ImageIcon className="text-tan" size={24} />
                        <h2 className="font-serif text-xl font-bold">Website Logo / Profile Pic</h2>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-6">
                        {/* Current Logo Preview */}
                        <div className="w-24 h-24 rounded-2xl bg-cream border border-tan-light/40 flex items-center justify-center overflow-hidden shrink-0 shadow-sm relative group">
                            {logoUrl ? (
                                <img src={logoUrl} alt="Website Logo Preview" className="w-full h-full object-contain p-2" />
                            ) : (
                                <div className="flex flex-col items-center justify-center text-charcoal/30">
                                    <ImageIcon size={32} />
                                    <span className="text-[10px] mt-1 font-bold uppercase tracking-wider">Default</span>
                                </div>
                            )}
                        </div>

                        {/* Upload Controls */}
                        <div className="flex-1 space-y-3 w-full">
                            <p className="text-sm text-charcoal-light font-medium leading-relaxed">
                                Upload a custom logo to replace the default SAHS icon shown at the top of the sidebar. Transparent PNGs work best.
                            </p>
                            <div className="flex flex-wrap gap-3">
                                <input
                                    type="file"
                                    accept="image/*"
                                    ref={logoInputRef}
                                    onChange={handleUploadLogo}
                                    className="hidden"
                                />
                                <button
                                    type="button"
                                    onClick={() => logoInputRef.current?.click()}
                                    disabled={isUploadingLogo}
                                    className="flex items-center gap-2 bg-tan text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-tan-dark transition-all disabled:opacity-50"
                                >
                                    {isUploadingLogo ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            Uploading...
                                        </>
                                    ) : (
                                        <>
                                            <Upload size={16} />
                                            Upload Logo
                                        </>
                                    )}
                                </button>
                                {logoUrl && (
                                    <button
                                        type="button"
                                        onClick={handleRemoveLogo}
                                        className="flex items-center gap-2 border border-red-200 text-red-600 px-4 py-2 rounded-xl text-sm font-bold hover:bg-red-50 transition-colors"
                                    >
                                        <Trash2 size={16} />
                                        Reset to Default
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Sidebar Title Input */}
                    <div className="mt-6 border-t border-tan-light/20 pt-6">
                        <label className="block text-sm font-bold text-charcoal mb-2">Sidebar Header Title</label>
                        <textarea
                            required
                            rows={2}
                            value={sidebarTitle}
                            onChange={e => setSidebarTitle(e.target.value)}
                            className="w-full px-4 py-2 border border-tan-light rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/50 bg-cream/10 font-serif"
                            placeholder="e.g. Senoia Area&#10;Historical Society"
                        />
                        <p className="text-xs text-charcoal/50 mt-1">This text appears at the top left of the sidebar layout. Use a newline to separate lines.</p>
                    </div>
                </div>

                {/* 2. Hero Content */}
                <div className="bg-white rounded-2xl border border-tan-light/50 shadow-sm p-6 sm:p-8">
                    <div className="flex items-center gap-2 mb-6 border-b border-tan-light/20 pb-4">
                        <Sparkles className="text-tan" size={24} />
                        <h2 className="font-serif text-xl font-bold">Homepage Hero Section</h2>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-charcoal mb-2">Main Heading Title</label>
                            <textarea
                                required
                                rows={2}
                                value={heroTitle}
                                onChange={e => setHeroTitle(e.target.value)}
                                className="w-full px-4 py-2 border border-tan-light rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/50 bg-cream/10"
                                placeholder="e.g. Senoia Area&#10;Historical Society"
                            />
                            <p className="text-xs text-charcoal/50 mt-1">Use newlines to break header text across rows on desktop.</p>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-charcoal mb-2">Hero Subtitle</label>
                            <input
                                type="text"
                                required
                                value={heroSubtitle}
                                onChange={e => setHeroSubtitle(e.target.value)}
                                className="w-full px-4 py-3 border border-tan-light rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/50 bg-cream/10 text-base"
                                placeholder="e.g. Preserving Our Past, Inspiring Our Future"
                            />
                        </div>
                    </div>
                </div>

                {/* 3. Slider Background Images */}
                <div className="bg-white rounded-2xl border border-tan-light/50 shadow-sm p-6 sm:p-8">
                    <div className="flex items-center justify-between mb-6 border-b border-tan-light/20 pb-4">
                        <div className="flex items-center gap-2">
                            <Upload className="text-tan" size={24} />
                            <h2 className="font-serif text-xl font-bold">Background Slider Images</h2>
                        </div>
                        
                        <div>
                            <input
                                type="file"
                                accept="image/*"
                                ref={fileInputRef}
                                onChange={handleUploadImage}
                                className="hidden"
                            />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploading}
                                className="flex items-center gap-2 bg-tan text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-tan-dark transition-all disabled:opacity-50"
                            >
                                {isUploading ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" />
                                        Uploading...
                                    </>
                                ) : (
                                    <>
                                        <Plus size={16} />
                                        Add Slide Image
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Image Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {backgroundImages.map((url, idx) => (
                            <div 
                                key={idx} 
                                className="relative rounded-xl overflow-hidden aspect-video border border-tan-light/50 shadow-xs group bg-cream flex items-center justify-center"
                            >
                                <img 
                                    src={url} 
                                    alt={`Slide ${idx + 1}`} 
                                    className="w-full h-full object-cover select-none"
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteImage(idx)}
                                        className="bg-red-600 hover:bg-red-800 text-white p-2 rounded-lg shadow transition-colors flex items-center gap-1.5 text-xs font-bold"
                                        title="Delete Slide Image"
                                    >
                                        <Trash2 size={14} />
                                        Remove
                                    </button>
                                </div>
                                <span className="absolute bottom-2 left-2 bg-charcoal/70 text-white text-[10px] px-2 py-0.5 rounded-md font-sans">
                                    Slide {idx + 1}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 5. Social Media Links */}
                <div className="bg-white rounded-2xl border border-tan-light/50 shadow-sm p-6 sm:p-8">
                    <div className="flex items-center gap-2 mb-6 border-b border-tan-light/20 pb-4">
                        <Palette className="text-tan" size={24} />
                        <h2 className="font-serif text-xl font-bold">Social Media Links</h2>
                    </div>

                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label className="block text-sm font-bold text-charcoal mb-2">Instagram URL</label>
                                <input
                                    type="url"
                                    value={instagramUrl}
                                    onChange={e => setInstagramUrl(e.target.value)}
                                    className="w-full px-4 py-3 border border-tan-light rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/50 bg-cream/10 text-sm"
                                    placeholder="https://www.instagram.com/your-page"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-charcoal mb-2">Facebook URL</label>
                                <input
                                    type="url"
                                    value={facebookUrl}
                                    onChange={e => setFacebookUrl(e.target.value)}
                                    className="w-full px-4 py-3 border border-tan-light rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/50 bg-cream/10 text-sm"
                                    placeholder="https://www.facebook.com/your-page"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-charcoal mb-2">YouTube URL</label>
                                <input
                                    type="url"
                                    value={youtubeUrl}
                                    onChange={e => setYoutubeUrl(e.target.value)}
                                    className="w-full px-4 py-3 border border-tan-light rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/50 bg-cream/10 text-sm"
                                    placeholder="https://www.youtube.com/your-channel"
                                />
                            </div>
                        </div>
                        <p className="text-xs text-charcoal/50">These URLs control the social icons at the top of the sidebar and in the homepage footer. Leave empty to hide the respective social icon.</p>
                    </div>
                </div>

                {/* 6. Active Feature Modules */}
                <div className="bg-white rounded-2xl border border-tan-light/50 shadow-sm p-6 sm:p-8">
                    <div className="flex items-center gap-2 mb-6 border-b border-tan-light/20 pb-4">
                        <Sliders className="text-tan" size={24} />
                        <h2 className="font-serif text-xl font-bold">Active Feature Modules</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Book Library */}
                        <div className="flex items-center justify-between p-4 bg-cream/10 border border-tan-light/30 rounded-xl">
                            <div>
                                <h3 className="text-sm font-bold text-charcoal">Book Library System</h3>
                                <p className="text-xs text-charcoal/50 mt-1">Catalog, manage, and search physical books in the museum library.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEnableLibrary(!enableLibrary)}
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${enableLibrary ? 'bg-tan' : 'bg-charcoal/20'}`}
                            >
                                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${enableLibrary ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                        </div>

                        {/* Oral Histories */}
                        <div className="flex items-center justify-between p-4 bg-cream/10 border border-tan-light/30 rounded-xl">
                            <div>
                                <h3 className="text-sm font-bold text-charcoal">Oral Histories (Community Stories)</h3>
                                <p className="text-xs text-charcoal/50 mt-1">Publish and play narrator recordings, transcripts, and community stories.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEnableOralHistories(!enableOralHistories)}
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${enableOralHistories ? 'bg-tan' : 'bg-charcoal/20'}`}
                            >
                                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${enableOralHistories ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                        </div>

                        {/* Membership System */}
                        <div className="flex items-center justify-between p-4 bg-cream/10 border border-tan-light/30 rounded-xl">
                            <div>
                                <h3 className="text-sm font-bold text-charcoal">Membership System</h3>
                                <p className="text-xs text-charcoal/50 mt-1">Manage paid museum memberships, profile benefits, and private folders.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEnableMembership(!enableMembership)}
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${enableMembership ? 'bg-tan' : 'bg-charcoal/20'}`}
                            >
                                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${enableMembership ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                        </div>

                        {/* Map Discovery */}
                        <div className="flex items-center justify-between p-4 bg-cream/10 border border-tan-light/30 rounded-xl">
                            <div>
                                <h3 className="text-sm font-bold text-charcoal">Map Discovery Tools</h3>
                                <p className="text-xs text-charcoal/50 mt-1">Geographic item mapping and interactive floor maps for museum navigation.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEnableMap(!enableMap)}
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${enableMap ? 'bg-tan' : 'bg-charcoal/20'}`}
                            >
                                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${enableMap ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                        </div>

                        {/* Curated Collections */}
                        <div className="flex items-center justify-between p-4 bg-cream/10 border border-tan-light/30 rounded-xl font-sans">
                            <div>
                                <h3 className="text-sm font-bold text-charcoal">Curated Collections</h3>
                                <p className="text-xs text-charcoal/50 mt-1">Group and display archival records under custom themes and temporary exhibitions.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEnableCollections(!enableCollections)}
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${enableCollections ? 'bg-tan' : 'bg-charcoal/20'}`}
                            >
                                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${enableCollections ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Submit Block */}
                <div className="flex justify-end gap-4 border-t border-tan-light/20 pt-6">
                    <button
                        type="button"
                        onClick={() => navigate('/')}
                        className="px-6 py-3 border border-tan text-tan rounded-xl hover:bg-tan/5 transition-colors font-bold uppercase tracking-wider text-sm"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isSaving}
                        className="px-8 py-3 bg-tan text-white rounded-xl hover:bg-tan-dark transition-all disabled:opacity-50 font-bold uppercase tracking-wider text-sm flex items-center gap-2 shadow-md"
                    >
                        {isSaving && <Loader2 size={16} className="animate-spin" />}
                        Save Changes
                    </button>
                </div>
            </form>
        </div>
    );
}
