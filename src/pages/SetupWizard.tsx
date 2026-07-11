import React, { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, storage } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowRight, ShieldCheck, Palette, Building2, CheckCircle2, Link as LinkIcon, MapPin, Type, FileText, Upload, Trash2, Image as ImageIcon } from 'lucide-react';

export function SetupWizard() {
    const { user, isSetupComplete } = useAuth();
    const navigate = useNavigate();

    const [step, setStep] = useState(1);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Step 2: Organization data
    const [museumName, setMuseumName] = useState('');
    const [museumShortName, setMuseumShortName] = useState('');
    const [sidebarTitle, setSidebarTitle] = useState('');

    // Step 3: Branding data
    const [heroTitle, setHeroTitle] = useState('');
    const [heroSubtitle, setHeroSubtitle] = useState('Preserving Our Past, Inspiring Our Future');
    const [theme, setTheme] = useState('classic');
    const [logoUrl, setLogoUrl] = useState('');
    const [backgroundImages, setBackgroundImages] = useState<string[]>([]);
    
    // Upload loading states
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);
    const [isUploadingSlider, setIsUploadingSlider] = useState(false);

    // Refs
    const logoInputRef = useRef<HTMLInputElement>(null);
    const sliderInputRef = useRef<HTMLInputElement>(null);

    // Step 4: Social & Links
    const [contactSupportUrl, setContactSupportUrl] = useState('');
    const [archiveFeedbackUrl, setArchiveFeedbackUrl] = useState('');
    const [suggestionBoxUrl, setSuggestionBoxUrl] = useState('');
    const [stripeBillingPortalUrl, setStripeBillingPortalUrl] = useState('');
    const [instagramUrl, setInstagramUrl] = useState('');
    const [facebookUrl, setFacebookUrl] = useState('');
    const [youtubeUrl, setYoutubeUrl] = useState('');

    // Step 5: Map & Location
    const [mapCenterLat, setMapCenterLat] = useState('33.3001');
    const [mapCenterLng, setMapCenterLng] = useState('-84.5544');
    const [mapDefaultZoom, setMapDefaultZoom] = useState('13');

    // Step 6: Tabs
    const [tabNames, setTabNames] = useState({
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
    });

    // Step 7: Content Blocks
    const [contentBlocks, setContentBlocks] = useState({
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
    });

    // Handle Uploads
    const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { alert('Please select an image file.'); return; }
        setIsUploadingLogo(true);
        try {
            const fileRef = ref(storage, `site_assets/logo_${Date.now()}_${file.name}`);
            await uploadBytes(fileRef, file);
            const downloadUrl = await getDownloadURL(fileRef);
            setLogoUrl(downloadUrl);
        } catch (err) {
            console.error("Logo upload failed", err);
            alert('Failed to upload logo. Please try again.');
        } finally {
            setIsUploadingLogo(false);
            if (logoInputRef.current) logoInputRef.current.value = '';
        }
    };

    const handleUploadSlider = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { alert('Please select an image file.'); return; }
        setIsUploadingSlider(true);
        try {
            const fileRef = ref(storage, `site_assets/hero_slider_${Date.now()}_${file.name}`);
            await uploadBytes(fileRef, file);
            const downloadUrl = await getDownloadURL(fileRef);
            setBackgroundImages(prev => [...prev, downloadUrl]);
        } catch (err) {
            console.error("Slider image upload failed", err);
            alert('Failed to upload slider image. Please try again.');
        } finally {
            setIsUploadingSlider(false);
            if (sliderInputRef.current) sliderInputRef.current.value = '';
        }
    };

    const handleDeleteSliderImage = (indexToDelete: number) => {
        setBackgroundImages(prev => prev.filter((_, idx) => idx !== indexToDelete));
    };

    const updateTabName = (key: keyof typeof tabNames, value: string) => {
        setTabNames(prev => ({ ...prev, [key]: value }));
    };

    const updateContentBlock = (key: keyof typeof contentBlocks, value: string) => {
        setContentBlocks(prev => ({ ...prev, [key]: value }));
    };

    // If setup is complete, only real Admins are allowed to access this page manually
    if (isSetupComplete && !useAuth().realIsAdmin) {
        navigate('/', { replace: true });
        return null;
    }

    if (!user) {
        return (
            <div className="min-h-screen bg-cream flex items-center justify-center p-4">
                <div className="bg-white p-8 rounded-2xl shadow-sm text-center max-w-md w-full border border-tan-light/30">
                    <h1 className="font-serif text-2xl font-bold text-charcoal mb-4">Archive Setup</h1>
                    <p className="text-charcoal/60 mb-6 font-sans text-sm">Please log in via the main page to begin the setup wizard.</p>
                    <button onClick={() => navigate('/login')} className="px-6 py-2 bg-tan text-white rounded-lg font-bold text-sm">Go to Login</button>
                </div>
            </div>
        );
    }

    const handleClaimAdmin = async () => {
        setIsProcessing(true);
        setError(null);
        try {
            await setDoc(doc(db, 'user_roles', user.email!.toLowerCase()), {
                role: 'admin'
            });
            setStep(2);
        } catch (err) {
            console.error("Error claiming admin:", err);
            setError("Failed to set admin role. Check your database rules.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCompleteSetup = async () => {
        setIsProcessing(true);
        setError(null);
        try {
            // Write appearance settings
            await setDoc(doc(db, 'site_settings', 'appearance'), {
                theme,
                museumName,
                museumShortName,
                sidebarTitle,
                heroTitle,
                heroSubtitle,
                logoUrl,
                backgroundImages,
                contactSupportUrl,
                archiveFeedbackUrl,
                suggestionBoxUrl,
                stripeBillingPortalUrl,
                instagramUrl,
                facebookUrl,
                youtubeUrl,
                mapCenterLat: parseFloat(mapCenterLat),
                mapCenterLng: parseFloat(mapCenterLng),
                mapDefaultZoom: parseInt(mapDefaultZoom, 10),
                tabNames,
                contentBlocks: {
                    ...contentBlocks,
                    heroTitle,
                    heroSubtitle
                }
            }, { merge: true });

            // Mark setup as complete
            await setDoc(doc(db, 'site_settings', 'setup'), {
                isComplete: true,
                completedBy: user.email,
                completedAt: new Date().toISOString()
            });

            // Redirect to home
            navigate('/', { replace: true });
            window.location.reload(); // Force reload to pull new settings everywhere
        } catch (err) {
            console.error("Error saving setup:", err);
            setError("Failed to save settings. Please try again.");
            setIsProcessing(false);
        }
    };

    return (
        <div className="min-h-screen bg-cream/50 flex flex-col items-center justify-center p-4 lg:p-8 relative overflow-hidden font-sans">
            <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-tan-light/20 to-transparent pointer-events-none" />
            
            <div className="w-full max-w-2xl relative z-10">
                {/* Progress Tracker */}
                <div className="flex items-center justify-between mb-8 px-4">
                    {[1, 2, 3, 4, 5, 6, 7].map(s => (
                        <div key={s} className="flex flex-col items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-500
                                ${step === s ? 'bg-tan text-white scale-110 shadow-lg' : 
                                  step > s ? 'bg-tan/20 text-tan' : 'bg-tan-light/30 text-charcoal/30'}`}
                            >
                                {step > s ? <CheckCircle2 size={16} /> : s}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Step Container */}
                <div className="bg-white rounded-3xl shadow-xl shadow-tan/5 border border-tan-light/30 p-8 lg:p-12">
                    
                    {error && (
                        <div className="mb-8 p-4 bg-red-50 text-red-600 rounded-xl border border-red-100 text-sm font-medium">
                            {error}
                        </div>
                    )}

                    <div className="relative">
                        {step === 1 && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 text-center">
                                <div className="w-20 h-20 bg-tan/10 rounded-full flex items-center justify-center text-tan mx-auto mb-6">
                                    <ShieldCheck size={40} />
                                </div>
                                <h2 className="text-3xl font-serif font-bold text-charcoal mb-4">Claim Administrator</h2>
                                <p className="text-charcoal/60 mb-8 leading-relaxed max-w-md mx-auto">
                                    Welcome to your new Archive! Since this database is completely empty, the first person to log in must claim the master Administrator role.
                                </p>
                                <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 text-sm text-blue-900 mb-8 max-w-md mx-auto">
                                    You are logged in as <strong className="font-mono">{user.email}</strong>. This account will be granted permanent admin rights.
                                </div>
                                <button
                                    onClick={handleClaimAdmin}
                                    disabled={isProcessing}
                                    className="w-full py-4 bg-tan text-white rounded-xl font-bold uppercase tracking-wider text-sm hover:bg-tan-dark transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-md"
                                >
                                    {isProcessing ? <Loader2 className="animate-spin" /> : 'Claim Admin Rights'}
                                </button>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="w-12 h-12 bg-tan/10 rounded-2xl flex items-center justify-center text-tan mb-6">
                                    <Building2 size={24} />
                                </div>
                                <h2 className="text-xl font-bold text-charcoal mb-4">Core Organization</h2>
                                
                                <div className="space-y-5">
                                    <div>
                                        <label className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Full Organization Name</label>
                                        <input 
                                            id="museumName"
                                            type="text" 
                                            value={museumName}
                                            onChange={e => setMuseumName(e.target.value)}
                                            placeholder="e.g. Springfield Historical Society"
                                            className="w-full px-4 py-3 bg-cream/30 border border-tan-light/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/30 transition-all text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Short Name / Acronym</label>
                                        <input 
                                            id="museumShortName"
                                            type="text" 
                                            value={museumShortName}
                                            onChange={e => setMuseumShortName(e.target.value)}
                                            placeholder="e.g. SHS"
                                            className="w-full px-4 py-3 bg-cream/30 border border-tan-light/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/30 transition-all text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Navigation Sidebar Title</label>
                                        <textarea 
                                            id="sidebarTitle"
                                            value={sidebarTitle}
                                            onChange={e => setSidebarTitle(e.target.value)}
                                            placeholder="e.g. Springfield&#10;Historical Society"
                                            rows={2}
                                            className="w-full px-4 py-3 bg-cream/30 border border-tan-light/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/30 transition-all text-sm resize-none"
                                        />
                                    </div>
                                </div>

                                <button
                                    onClick={() => setStep(3)}
                                    disabled={!museumName || !museumShortName || !sidebarTitle}
                                    className="w-full mt-8 py-4 bg-tan text-white rounded-xl font-bold uppercase tracking-wider text-sm hover:bg-tan-dark transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-md"
                                >
                                    Continue <ArrowRight size={16} />
                                </button>
                            </div>
                        )}

                        {step === 3 && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="w-12 h-12 bg-tan/10 rounded-2xl flex items-center justify-center text-tan mb-6">
                                    <Palette size={24} />
                                </div>
                                <h2 className="text-xl font-bold text-charcoal mb-4">Homepage Branding & Assets</h2>
                                
                                <div className="space-y-5 max-h-[420px] overflow-y-auto pr-2 pb-4 custom-scrollbar">
                                    <div>
                                        <label className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Homepage Hero Title</label>
                                        <textarea 
                                            id="heroTitle"
                                            value={heroTitle}
                                            onChange={e => setHeroTitle(e.target.value)}
                                            placeholder="e.g. Springfield&#10;Historical Society"
                                            rows={2}
                                            className="w-full px-4 py-3 bg-cream/30 border border-tan-light/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/30 transition-all text-sm resize-none font-serif text-lg"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Hero Subtitle</label>
                                        <input 
                                            type="text" 
                                            value={heroSubtitle}
                                            onChange={e => setHeroSubtitle(e.target.value)}
                                            className="w-full px-4 py-3 bg-cream/30 border border-tan-light/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/30 transition-all text-sm italic font-serif"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Color Theme</label>
                                        <select 
                                            value={theme}
                                            onChange={e => setTheme(e.target.value)}
                                            className="w-full px-4 py-3 bg-cream/30 border border-tan-light/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/30 transition-all text-sm"
                                        >
                                            <option value="classic">Classic (Forest & Tan)</option>
                                            <option value="navy">Maritime (Navy & Slate)</option>
                                            <option value="gold">Vintage (Gold & Charcoal)</option>
                                            <option value="burgundy">Heritage (Burgundy & Rose)</option>
                                        </select>
                                    </div>

                                    {/* Logo Upload Field */}
                                    <div className="border-t border-tan-light/20 pt-4">
                                        <label className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Organization Logo</label>
                                        <div className="flex items-center gap-4 bg-cream/20 p-4 border border-tan-light/40 rounded-xl">
                                            <div className="w-16 h-16 rounded-xl bg-cream border border-tan-light/20 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                                                {logoUrl ? (
                                                    <img src={logoUrl} alt="Logo preview" className="w-full h-full object-contain p-1" />
                                                ) : (
                                                    <ImageIcon className="text-charcoal/20" size={24} />
                                                )}
                                            </div>
                                            <div className="flex-1">
                                                <input type="file" accept="image/*" ref={logoInputRef} onChange={handleUploadLogo} className="hidden" />
                                                <button
                                                    type="button"
                                                    onClick={() => logoInputRef.current?.click()}
                                                    disabled={isUploadingLogo}
                                                    className="flex items-center gap-2 bg-tan text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-tan-dark transition-all disabled:opacity-50"
                                                >
                                                    {isUploadingLogo ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                                    {logoUrl ? 'Change Logo' : 'Upload Logo'}
                                                </button>
                                                {logoUrl && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setLogoUrl('')}
                                                        className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-red-600 hover:text-red-800 transition-colors"
                                                    >
                                                        <Trash2 size={10} /> Remove Logo
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Background Slider Images Field */}
                                    <div className="border-t border-tan-light/20 pt-4">
                                        <label className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Background Slider Images</label>
                                        <div className="bg-cream/20 p-4 border border-tan-light/40 rounded-xl space-y-4">
                                            <input type="file" accept="image/*" ref={sliderInputRef} onChange={handleUploadSlider} className="hidden" />
                                            
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-charcoal/60">Upload slideshow images for the landing page.</span>
                                                <button
                                                    type="button"
                                                    onClick={() => sliderInputRef.current?.click()}
                                                    disabled={isUploadingSlider}
                                                    className="flex items-center gap-2 bg-tan text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-tan-dark transition-all disabled:opacity-50 shrink-0"
                                                >
                                                    {isUploadingSlider ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                                    Add Slider Image
                                                </button>
                                            </div>

                                            {backgroundImages.length > 0 ? (
                                                <div className="grid grid-cols-3 gap-2 pt-2">
                                                    {backgroundImages.map((img, idx) => (
                                                        <div key={idx} className="relative w-full aspect-video rounded-lg overflow-hidden border border-tan-light/20 group">
                                                            <img src={img} alt={`Slide ${idx + 1}`} className="w-full h-full object-cover" />
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteSliderImage(idx)}
                                                                className="absolute top-1 right-1 bg-red-600 text-white p-1 rounded-full opacity-90 hover:bg-red-700 transition-colors"
                                                            >
                                                                <Trash2 size={10} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-center py-6 border border-dashed border-tan-light/40 rounded-lg text-xs text-charcoal/40 font-medium">
                                                    No slider images uploaded. (A solid brand color will show instead).
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                </div>

                                <div className="flex gap-3 mt-8">
                                    <button onClick={() => setStep(2)} className="px-6 py-4 border border-tan/20 text-charcoal/60 rounded-xl font-bold uppercase tracking-wider text-sm hover:bg-tan/5 transition-colors">Back</button>
                                    <button
                                        onClick={() => setStep(4)}
                                        disabled={!heroTitle}
                                        className="flex-1 py-4 bg-tan text-white rounded-xl font-bold uppercase tracking-wider text-sm hover:bg-tan-dark transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-md"
                                    >
                                        Continue <ArrowRight size={16} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {step === 4 && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="w-12 h-12 bg-tan/10 rounded-2xl flex items-center justify-center text-tan mb-6">
                                    <LinkIcon size={24} />
                                </div>
                                <h2 className="text-xl font-bold text-charcoal mb-4">Social & Links</h2>
                                <p className="text-sm text-charcoal/60 mb-6">Connect your external pages. Leave blank if not applicable.</p>
                                
                                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 pb-4 custom-scrollbar">
                                    {[
                                        { label: 'Facebook URL', value: facebookUrl, setter: setFacebookUrl },
                                        { label: 'Instagram URL', value: instagramUrl, setter: setInstagramUrl },
                                        { label: 'YouTube URL', value: youtubeUrl, setter: setYoutubeUrl },
                                        { label: 'Contact/Support URL', value: contactSupportUrl, setter: setContactSupportUrl },
                                        { label: 'Feedback Form URL', value: archiveFeedbackUrl, setter: setArchiveFeedbackUrl },
                                        { label: 'Suggestion Box URL', value: suggestionBoxUrl, setter: setSuggestionBoxUrl },
                                        { label: 'Stripe Portal URL', value: stripeBillingPortalUrl, setter: setStripeBillingPortalUrl },
                                    ].map((field, i) => (
                                        <div key={i}>
                                            <label className="block text-[10px] font-bold text-charcoal/70 uppercase tracking-wider mb-1">{field.label}</label>
                                            <input 
                                                type="url" 
                                                value={field.value}
                                                onChange={e => field.setter(e.target.value)}
                                                className="w-full px-3 py-2 bg-cream/30 border border-tan-light/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-tan/30 transition-all text-sm"
                                            />
                                        </div>
                                    ))}
                                </div>

                                <div className="flex gap-3 mt-8">
                                    <button onClick={() => setStep(3)} className="px-6 py-4 border border-tan/20 text-charcoal/60 rounded-xl font-bold uppercase tracking-wider text-sm hover:bg-tan/5 transition-colors">Back</button>
                                    <button
                                        onClick={() => setStep(5)}
                                        className="flex-1 py-4 bg-tan text-white rounded-xl font-bold uppercase tracking-wider text-sm hover:bg-tan-dark transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-md"
                                    >
                                        Continue <ArrowRight size={16} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {step === 5 && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="w-12 h-12 bg-tan/10 rounded-2xl flex items-center justify-center text-tan mb-6">
                                    <MapPin size={24} />
                                </div>
                                <h2 className="text-xl font-bold text-charcoal mb-4">Map & Location Setup</h2>
                                
                                <div className="space-y-5">
                                    <div>
                                        <label className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Latitude</label>
                                        <input 
                                            type="number" step="any"
                                            value={mapCenterLat}
                                            onChange={e => setMapCenterLat(e.target.value)}
                                            className="w-full px-4 py-3 bg-cream/30 border border-tan-light/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/30 transition-all text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Longitude</label>
                                        <input 
                                            type="number" step="any"
                                            value={mapCenterLng}
                                            onChange={e => setMapCenterLng(e.target.value)}
                                            className="w-full px-4 py-3 bg-cream/30 border border-tan-light/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/30 transition-all text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Default Zoom Level</label>
                                        <input 
                                            type="number"
                                            value={mapDefaultZoom}
                                            onChange={e => setMapDefaultZoom(e.target.value)}
                                            className="w-full px-4 py-3 bg-cream/30 border border-tan-light/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/30 transition-all text-sm"
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-3 mt-8">
                                    <button onClick={() => setStep(4)} className="px-6 py-4 border border-tan/20 text-charcoal/60 rounded-xl font-bold uppercase tracking-wider text-sm hover:bg-tan/5 transition-colors">Back</button>
                                    <button
                                        onClick={() => setStep(6)}
                                        disabled={!mapCenterLat || !mapCenterLng}
                                        className="flex-1 py-4 bg-tan text-white rounded-xl font-bold uppercase tracking-wider text-sm hover:bg-tan-dark transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-md"
                                    >
                                        Continue <ArrowRight size={16} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {step === 6 && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="w-12 h-12 bg-tan/10 rounded-2xl flex items-center justify-center text-tan mb-6">
                                    <Type size={24} />
                                </div>
                                <h2 className="text-xl font-bold text-charcoal mb-4">Navigation Tabs</h2>
                                <p className="text-sm text-charcoal/60 mb-6">Customize the names of the tabs in your navigation bar.</p>
                                
                                <div className="grid grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2 pb-4 custom-scrollbar">
                                    {Object.entries(tabNames).map(([key, value]) => (
                                        <div key={key}>
                                            <label className="block text-[10px] font-bold text-charcoal/70 uppercase tracking-wider mb-1">{key}</label>
                                            <input 
                                                type="text" 
                                                value={value}
                                                onChange={e => updateTabName(key as keyof typeof tabNames, e.target.value)}
                                                className="w-full px-3 py-2 bg-cream/30 border border-tan-light/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-tan/30 transition-all text-xs"
                                            />
                                        </div>
                                    ))}
                                </div>

                                <div className="flex gap-3 mt-8">
                                    <button onClick={() => setStep(5)} className="px-6 py-4 border border-tan/20 text-charcoal/60 rounded-xl font-bold uppercase tracking-wider text-sm hover:bg-tan/5 transition-colors">Back</button>
                                    <button
                                        onClick={() => setStep(7)}
                                        className="flex-1 py-4 bg-tan text-white rounded-xl font-bold uppercase tracking-wider text-sm hover:bg-tan-dark transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-md"
                                    >
                                        Continue <ArrowRight size={16} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {step === 7 && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="w-12 h-12 bg-tan/10 rounded-2xl flex items-center justify-center text-tan mb-6">
                                    <FileText size={24} />
                                </div>
                                <h2 className="text-xl font-bold text-charcoal mb-4">Content Blocks & Footer</h2>
                                <p className="text-sm text-charcoal/60 mb-6">Final step! Customize the text blocks across your site.</p>
                                
                                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 pb-4 custom-scrollbar">
                                    {Object.entries(contentBlocks).map(([key, value]) => (
                                        <div key={key}>
                                            <label className="block text-[10px] font-bold text-charcoal/70 uppercase tracking-wider mb-1">{key}</label>
                                            <textarea 
                                                value={value}
                                                onChange={e => updateContentBlock(key as keyof typeof contentBlocks, e.target.value)}
                                                rows={value.length > 50 ? 3 : 1}
                                                className="w-full px-3 py-2 bg-cream/30 border border-tan-light/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-tan/30 transition-all text-xs resize-none"
                                            />
                                        </div>
                                    ))}
                                </div>

                                <div className="flex gap-3 mt-8">
                                    <button onClick={() => setStep(6)} className="px-6 py-4 border border-tan/20 text-charcoal/60 rounded-xl font-bold uppercase tracking-wider text-sm hover:bg-tan/5 transition-colors">Back</button>
                                    <button
                                        onClick={handleCompleteSetup}
                                        disabled={isProcessing}
                                        className="flex-1 py-4 bg-tan text-white rounded-xl font-bold uppercase tracking-wider text-sm hover:bg-tan-dark transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-md"
                                    >
                                        {isProcessing ? <Loader2 className="animate-spin" /> : 'Complete Setup'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
