import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useAppearance } from '../contexts/AppearanceContext';
import { db, storage, functions } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { useNavigate, Navigate } from 'react-router-dom';
import { Loader2, ArrowRight, ShieldCheck, Palette, Building2, CheckCircle2, Link as LinkIcon, MapPin, Type, FileText, Upload, Trash2, Image as ImageIcon, Sliders, Info, Undo2 } from 'lucide-react';
import {
    FIRST_RUN_VALUES,
    WIZARD_FEATURES,
    changedWizardFields,
    firstRunAppearanceWrite,
    rerunAppearanceWrite,
    wizardValuesFromSettings,
    type WizardValues,
} from '../lib/setupWizardFields';

// Names for the "what will be saved" summary on a re-run.
const FIELD_LABELS: Record<string, string> = {
    museumName: 'Full organization name',
    museumShortName: 'Short name',
    sidebarTitle: 'Sidebar title',
    heroTitle: 'Homepage hero title',
    heroSubtitle: 'Hero subtitle',
    theme: 'Color theme',
    logoUrl: 'Logo',
    backgroundImages: 'Slider images',
    contactSupportUrl: 'Contact/Support URL',
    archiveFeedbackUrl: 'Feedback form URL',
    suggestionBoxUrl: 'Suggestion box URL',
    stripeBillingPortalUrl: 'Stripe portal URL',
    instagramUrl: 'Instagram URL',
    facebookUrl: 'Facebook URL',
    youtubeUrl: 'YouTube URL',
    mapCenterLat: 'Map latitude',
    mapCenterLng: 'Map longitude',
    mapDefaultZoom: 'Map zoom',
};

function describeField(path: string): string {
    const [group, key] = path.split('.');
    if (group === 'tabNames') return `Tab name: ${key}`;
    if (group === 'contentBlocks') return `Content block: ${key}`;
    if (group === 'featureToggles') return `Feature: ${WIZARD_FEATURES.find(f => f.key === key)?.label ?? key}`;
    return FIELD_LABELS[path] ?? path;
}

export function SetupWizard() {
    const { user, isSetupComplete, realIsAdmin } = useAuth();
    const { settings, loading: appearanceLoading } = useAppearance();
    const navigate = useNavigate();

    const [step, setStep] = useState(1);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 'first-run' on an empty archive; 'rerun' when an admin launches the wizard
    // again from Admin Settings to update an archive that is already set up.
    const [mode, setMode] = useState<'loading' | 'first-run' | 'rerun'>('loading');
    // Where every field started. On a re-run a field is written only if it no
    // longer matches this, so untouched fields keep their current values.
    const [initial, setInitial] = useState<WizardValues>(FIRST_RUN_VALUES);
    const [values, setValues] = useState<WizardValues>(FIRST_RUN_VALUES);

    // Upload loading states
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);
    const [isUploadingSlider, setIsUploadingSlider] = useState(false);

    // Refs
    const logoInputRef = useRef<HTMLInputElement>(null);
    const sliderInputRef = useRef<HTMLInputElement>(null);

    // Decide which kind of run this is from the documents themselves, the same
    // test as isSetupComplete() in firestore.rules, rather than from AuthContext's
    // isSetupComplete — that starts out true to avoid a flash and only turns false
    // once its listener fires.
    useEffect(() => {
        if (appearanceLoading || mode !== 'loading') return;
        let cancelled = false;
        Promise.all([
            getDoc(doc(db, 'site_settings', 'setup')),
            getDoc(doc(db, 'site_settings', 'appearance')),
        ]).then(([setupSnap, appearanceSnap]) => {
            if (cancelled) return;
            const alreadySetUp = (setupSnap.exists() && setupSnap.data().isComplete === true) || appearanceSnap.exists();
            if (alreadySetUp) {
                const current = wizardValuesFromSettings(settings);
                setInitial(current);
                setValues(current);
                setMode('rerun');
                // Step 1 is the first-run admin claim; a re-run skips it.
                setStep(2);
            } else {
                setMode('first-run');
            }
        }).catch(err => {
            // Never fall back to first-run here: its defaults would be saved over
            // whatever settings could not be read.
            console.error('Error loading current settings:', err);
            if (!cancelled) setError('Could not load the archive\'s current settings. Please reload the page and try again.');
        });
        return () => { cancelled = true; };
    }, [appearanceLoading, mode, settings]);

    const setField = <K extends keyof WizardValues>(key: K, value: WizardValues[K]) => {
        setValues(prev => ({ ...prev, [key]: value }));
    };

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
            setField('logoUrl', downloadUrl);
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
            setValues(prev => ({ ...prev, backgroundImages: [...prev.backgroundImages, downloadUrl] }));
        } catch (err) {
            console.error("Slider image upload failed", err);
            alert('Failed to upload slider image. Please try again.');
        } finally {
            setIsUploadingSlider(false);
            if (sliderInputRef.current) sliderInputRef.current.value = '';
        }
    };

    const handleDeleteSliderImage = (indexToDelete: number) => {
        setValues(prev => ({ ...prev, backgroundImages: prev.backgroundImages.filter((_, idx) => idx !== indexToDelete) }));
    };

    const updateTabName = (key: string, value: string) => {
        setValues(prev => ({ ...prev, tabNames: { ...prev.tabNames, [key]: value } }));
    };

    const updateContentBlock = (key: string, value: string) => {
        setValues(prev => ({ ...prev, contentBlocks: { ...prev.contentBlocks, [key]: value } }));
    };

    // On a re-run, a field that had a value and has been emptied is about to be
    // saved blank. Say so beside it, with a way back, so a blank is never an accident.
    const clearedNotice = (wasValue: string | undefined, isValue: string, restore: () => void) => {
        if (mode !== 'rerun' || !wasValue || isValue !== '') return null;
        return (
            <p className="mt-1 flex items-center gap-2 text-[11px] font-semibold text-amber-700">
                Will be saved blank.
                <button type="button" onClick={restore} className="inline-flex items-center gap-1 underline hover:text-amber-900">
                    <Undo2 size={11} /> Restore
                </button>
            </p>
        );
    };

    // If setup is complete, only real Admins are allowed to access this page manually.
    // realIsAdmin comes from the useAuth() call at the top of the component — calling
    // the hook inline here made it conditional, and navigating during render is a side
    // effect React does not allow. <Navigate> does the redirect on commit instead.
    if (isSetupComplete && !realIsAdmin) {
        return <Navigate to="/" replace />;
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

    if (mode === 'loading') {
        return (
            <div className="min-h-screen bg-cream flex items-center justify-center p-4 font-sans">
                {error ? (
                    <div className="bg-white p-8 rounded-2xl shadow-sm text-center max-w-md w-full border border-red-100 text-sm text-red-600">{error}</div>
                ) : (
                    <Loader2 className="animate-spin text-tan" size={32} />
                )}
            </div>
        );
    }

    const isRerun = mode === 'rerun';
    const pendingChanges = isRerun ? changedWizardFields(initial, values) : [];

    const handleClaimAdmin = async () => {
        // First-run bootstrap only. On a re-run the admin already holds their
        // access — possibly as a support admin with no user_roles document at all,
        // where writing one would leave them admin even after the museum removed
        // support access — so this step is never shown then.
        if (isRerun) return;
        setIsProcessing(true);
        setError(null);
        try {
            const roleRef = doc(db, 'user_roles', user.email!.toLowerCase());
            // Coming back to an unfinished setup finds the role already claimed.
            // Merge rather than overwrite, so addedAt and anything else on it survive.
            const existing = await getDoc(roleRef);
            if (!(existing.exists() && existing.data().role === 'admin')) {
                await setDoc(roleRef, {
                    role: 'admin',
                    ...(existing.exists() && existing.data().addedAt ? {} : { addedAt: new Date().toISOString() })
                }, { merge: true });
            }
            // Storage only sees a role through the token's claim, and this token
            // was issued before the role existed — so without a refresh the logo
            // and slideshow uploads two steps on are refused for up to an hour.
            // syncMyRoleClaim sets the claim from the document just written
            // rather than racing the syncUserRoleClaims trigger.
            try {
                await httpsCallable(functions, 'syncMyRoleClaim')();
                await user.getIdToken(true);
            } catch (claimErr) {
                // Not fatal: the role is saved, and the claim lands on next sign-in.
                console.error('Failed to refresh the admin claim:', claimErr);
            }
            setStep(2);
        } catch (err) {
            console.error("Error claiming admin:", err);
            // firestore.rules only lets an address listed in deployment_config/bootstrap
            // claim the first admin role, so a refusal almost always means this one isn't.
            if ((err as { code?: string }).code === 'permission-denied') {
                setError(`${user.email} is not on this archive's list of setup administrators. Whoever installed the archive can add it with scripts/set-setup-admins.cjs, then try again.`);
            } else {
                setError("Failed to set admin role. Please try again.");
            }
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCompleteSetup = async () => {
        setIsProcessing(true);
        setError(null);
        try {
            if (isRerun) {
                // Only what the admin changed. This used to write every field from
                // the wizard's blank defaults over the live settings.
                const write = rerunAppearanceWrite(initial, values);
                if (Object.keys(write).length > 0) {
                    await setDoc(doc(db, 'site_settings', 'appearance'), write, { merge: true });
                }
                // site_settings/setup already records when and by whom the archive
                // was first set up; a re-run leaves that alone.
            } else {
                // Write appearance settings
                await setDoc(doc(db, 'site_settings', 'appearance'), firstRunAppearanceWrite(values), { merge: true });

                // Mark setup as complete
                await setDoc(doc(db, 'site_settings', 'setup'), {
                    isComplete: true,
                    completedBy: user.email,
                    completedAt: new Date().toISOString()
                });
            }

            // Redirect to home
            navigate('/', { replace: true });
            window.location.reload(); // Force reload to pull new settings everywhere
        } catch (err) {
            console.error("Error saving setup:", err);
            setError("Failed to save settings. Please try again.");
            setIsProcessing(false);
        }
    };

    const steps = isRerun ? [2, 3, 4, 5, 6, 7, 8] : [1, 2, 3, 4, 5, 6, 7, 8];
    const isNumber = (v: string) => v.trim() !== '' && !Number.isNaN(Number(v));

    return (
        <div className="min-h-screen bg-cream/50 flex flex-col items-center justify-center p-4 lg:p-8 relative overflow-hidden font-sans">
            <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-tan-light/20 to-transparent pointer-events-none" />

            <div className="w-full max-w-2xl relative z-10">
                {/* Progress Tracker */}
                <div className="flex items-center justify-between mb-8 px-4">
                    {steps.map((s, i) => (
                        <div key={s} className="flex flex-col items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-500
                                ${step === s ? 'bg-tan text-white scale-110 shadow-lg' :
                                  step > s ? 'bg-tan/20 text-tan' : 'bg-tan-light/30 text-charcoal/30'}`}
                            >
                                {step > s ? <CheckCircle2 size={16} /> : i + 1}
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

                    {isRerun && (
                        <div className="mb-8 p-4 bg-blue-50/60 text-blue-900 rounded-xl border border-blue-100 text-xs leading-relaxed flex gap-3">
                            <Info size={16} className="shrink-0 mt-0.5" />
                            <div>
                                <strong>Updating your archive's settings.</strong> Every field shows what your site uses now.
                                Anything you leave alone stays exactly as it is. To remove something, empty the field — it will be saved blank.
                                Nothing is saved until you press Save Changes on the last step.
                            </div>
                        </div>
                    )}

                    <div className="relative">
                        {step === 1 && !isRerun && (
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
                                            value={values.museumName}
                                            onChange={e => setField('museumName', e.target.value)}
                                            placeholder="e.g. Springfield Historical Society"
                                            className="w-full px-4 py-3 bg-cream/30 border border-tan-light/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/30 transition-all text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Short Name / Acronym</label>
                                        <input
                                            id="museumShortName"
                                            type="text"
                                            value={values.museumShortName}
                                            onChange={e => setField('museumShortName', e.target.value)}
                                            placeholder="e.g. SHS"
                                            className="w-full px-4 py-3 bg-cream/30 border border-tan-light/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/30 transition-all text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Navigation Sidebar Title</label>
                                        <textarea
                                            id="sidebarTitle"
                                            value={values.sidebarTitle}
                                            onChange={e => setField('sidebarTitle', e.target.value)}
                                            placeholder="e.g. Springfield&#10;Historical Society"
                                            rows={2}
                                            className="w-full px-4 py-3 bg-cream/30 border border-tan-light/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/30 transition-all text-sm resize-none"
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-3 mt-8">
                                    {isRerun && (
                                        <button onClick={() => navigate('/settings')} className="px-6 py-4 border border-tan/20 text-charcoal/60 rounded-xl font-bold uppercase tracking-wider text-sm hover:bg-tan/5 transition-colors">Cancel</button>
                                    )}
                                    <button
                                        onClick={() => setStep(3)}
                                        disabled={!values.museumName || !values.museumShortName || !values.sidebarTitle}
                                        className="flex-1 py-4 bg-tan text-white rounded-xl font-bold uppercase tracking-wider text-sm hover:bg-tan-dark transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-md"
                                    >
                                        Continue <ArrowRight size={16} />
                                    </button>
                                </div>
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
                                            value={values.heroTitle}
                                            onChange={e => setField('heroTitle', e.target.value)}
                                            placeholder="e.g. Springfield&#10;Historical Society"
                                            rows={2}
                                            className="w-full px-4 py-3 bg-cream/30 border border-tan-light/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/30 transition-all text-sm resize-none font-serif text-lg"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Hero Subtitle</label>
                                        <input
                                            type="text"
                                            value={values.heroSubtitle}
                                            onChange={e => setField('heroSubtitle', e.target.value)}
                                            className="w-full px-4 py-3 bg-cream/30 border border-tan-light/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/30 transition-all text-sm italic font-serif"
                                        />
                                        {clearedNotice(initial.heroSubtitle, values.heroSubtitle, () => setField('heroSubtitle', initial.heroSubtitle))}
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Color Theme</label>
                                        <select
                                            value={values.theme}
                                            onChange={e => setField('theme', e.target.value)}
                                            className="w-full px-4 py-3 bg-cream/30 border border-tan-light/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/30 transition-all text-sm"
                                        >
                                            <option value="classic">Classic (Forest & Tan)</option>
                                            <option value="navy">Maritime (Navy & Slate)</option>
                                            <option value="gold">Vintage (Gold & Charcoal)</option>
                                            <option value="burgundy">Heritage (Burgundy & Rose)</option>
                                            {/* Settable in Website Appearance, so a re-run can find it already chosen. */}
                                            <option value="forest">Historic Forest Green</option>
                                        </select>
                                    </div>

                                    {/* Logo Upload Field */}
                                    <div className="border-t border-tan-light/20 pt-4">
                                        <label className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Organization Logo</label>
                                        <div className="flex items-center gap-4 bg-cream/20 p-4 border border-tan-light/40 rounded-xl">
                                            <div className="w-16 h-16 rounded-xl bg-cream border border-tan-light/20 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                                                {values.logoUrl ? (
                                                    <img src={values.logoUrl} alt="Logo preview" className="w-full h-full object-contain p-1" />
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
                                                    {values.logoUrl ? 'Change Logo' : 'Upload Logo'}
                                                </button>
                                                {values.logoUrl && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setField('logoUrl', '')}
                                                        className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-red-600 hover:text-red-800 transition-colors"
                                                    >
                                                        <Trash2 size={10} /> Remove Logo
                                                    </button>
                                                )}
                                                {clearedNotice(initial.logoUrl, values.logoUrl, () => setField('logoUrl', initial.logoUrl))}
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

                                            {values.backgroundImages.length > 0 ? (
                                                <div className="grid grid-cols-3 gap-2 pt-2">
                                                    {values.backgroundImages.map((img, idx) => (
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
                                            {isRerun && JSON.stringify(values.backgroundImages) !== JSON.stringify(initial.backgroundImages) && (
                                                <p className="flex items-center gap-2 text-[11px] font-semibold text-amber-700">
                                                    Slider images changed.
                                                    <button type="button" onClick={() => setField('backgroundImages', [...initial.backgroundImages])} className="inline-flex items-center gap-1 underline hover:text-amber-900">
                                                        <Undo2 size={11} /> Restore
                                                    </button>
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                </div>

                                <div className="flex gap-3 mt-8">
                                    <button onClick={() => setStep(2)} className="px-6 py-4 border border-tan/20 text-charcoal/60 rounded-xl font-bold uppercase tracking-wider text-sm hover:bg-tan/5 transition-colors">Back</button>
                                    <button
                                        onClick={() => setStep(4)}
                                        disabled={!values.heroTitle}
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
                                    <Sliders size={24} />
                                </div>
                                <h2 className="text-xl font-bold text-charcoal mb-4">Features</h2>
                                <p className="text-sm text-charcoal/60 mb-6">
                                    Choose which parts of the archive to turn on. Features left off are hidden from visitors.
                                    You can change these later in Website Appearance.
                                </p>

                                <div className="space-y-3">
                                    {WIZARD_FEATURES.map(feature => (
                                        <label key={feature.key} className="flex items-start gap-3 p-4 bg-cream/20 border border-tan-light/40 rounded-xl cursor-pointer hover:bg-cream/40 transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={values.featureToggles[feature.key]}
                                                onChange={e => setField('featureToggles', { ...values.featureToggles, [feature.key]: e.target.checked })}
                                                className="mt-0.5 h-4 w-4 rounded border-tan-light text-tan focus:ring-tan cursor-pointer"
                                            />
                                            <span>
                                                <span className="block text-sm font-bold text-charcoal">{feature.label}</span>
                                                <span className="block text-xs text-charcoal/60 mt-0.5">{feature.desc}</span>
                                            </span>
                                        </label>
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
                                    <LinkIcon size={24} />
                                </div>
                                <h2 className="text-xl font-bold text-charcoal mb-4">Social & Links</h2>
                                <p className="text-sm text-charcoal/60 mb-6">Connect your external pages. Leave blank if not applicable.</p>

                                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 pb-4 custom-scrollbar">
                                    {([
                                        { label: 'Facebook URL', key: 'facebookUrl' },
                                        { label: 'Instagram URL', key: 'instagramUrl' },
                                        { label: 'YouTube URL', key: 'youtubeUrl' },
                                        { label: 'Contact/Support URL', key: 'contactSupportUrl' },
                                        { label: 'Feedback Form URL', key: 'archiveFeedbackUrl' },
                                        { label: 'Suggestion Box URL', key: 'suggestionBoxUrl' },
                                        { label: 'Stripe Portal URL', key: 'stripeBillingPortalUrl' },
                                    ] as const).map(field => (
                                        <div key={field.key}>
                                            <label className="block text-[10px] font-bold text-charcoal/70 uppercase tracking-wider mb-1">{field.label}</label>
                                            <input
                                                type="url"
                                                value={values[field.key]}
                                                onChange={e => setField(field.key, e.target.value)}
                                                className="w-full px-3 py-2 bg-cream/30 border border-tan-light/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-tan/30 transition-all text-sm"
                                            />
                                            {clearedNotice(initial[field.key], values[field.key], () => setField(field.key, initial[field.key]))}
                                        </div>
                                    ))}
                                </div>

                                <div className="flex gap-3 mt-8">
                                    <button onClick={() => setStep(4)} className="px-6 py-4 border border-tan/20 text-charcoal/60 rounded-xl font-bold uppercase tracking-wider text-sm hover:bg-tan/5 transition-colors">Back</button>
                                    <button
                                        onClick={() => setStep(6)}
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
                                    <MapPin size={24} />
                                </div>
                                <h2 className="text-xl font-bold text-charcoal mb-4">Map & Location Setup</h2>

                                <div className="space-y-5">
                                    <div>
                                        <label className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Latitude</label>
                                        <input
                                            type="number" step="any"
                                            value={values.mapCenterLat}
                                            onChange={e => setField('mapCenterLat', e.target.value)}
                                            className="w-full px-4 py-3 bg-cream/30 border border-tan-light/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/30 transition-all text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Longitude</label>
                                        <input
                                            type="number" step="any"
                                            value={values.mapCenterLng}
                                            onChange={e => setField('mapCenterLng', e.target.value)}
                                            className="w-full px-4 py-3 bg-cream/30 border border-tan-light/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/30 transition-all text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Default Zoom Level</label>
                                        <input
                                            type="number"
                                            value={values.mapDefaultZoom}
                                            onChange={e => setField('mapDefaultZoom', e.target.value)}
                                            className="w-full px-4 py-3 bg-cream/30 border border-tan-light/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/30 transition-all text-sm"
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-3 mt-8">
                                    <button onClick={() => setStep(5)} className="px-6 py-4 border border-tan/20 text-charcoal/60 rounded-xl font-bold uppercase tracking-wider text-sm hover:bg-tan/5 transition-colors">Back</button>
                                    <button
                                        onClick={() => setStep(7)}
                                        // A blank zoom used to be saved as NaN; all three are numbers the map needs.
                                        disabled={!isNumber(values.mapCenterLat) || !isNumber(values.mapCenterLng) || !isNumber(values.mapDefaultZoom)}
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
                                    <Type size={24} />
                                </div>
                                <h2 className="text-xl font-bold text-charcoal mb-4">Navigation Tabs</h2>
                                <p className="text-sm text-charcoal/60 mb-6">Customize the names of the tabs in your navigation bar.</p>

                                <div className="grid grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2 pb-4 custom-scrollbar">
                                    {Object.entries(values.tabNames).map(([key, value]) => (
                                        <div key={key}>
                                            <label className="block text-[10px] font-bold text-charcoal/70 uppercase tracking-wider mb-1">{key}</label>
                                            <input
                                                type="text"
                                                value={value}
                                                onChange={e => updateTabName(key, e.target.value)}
                                                className="w-full px-3 py-2 bg-cream/30 border border-tan-light/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-tan/30 transition-all text-xs"
                                            />
                                            {clearedNotice(initial.tabNames[key], value, () => updateTabName(key, initial.tabNames[key]))}
                                        </div>
                                    ))}
                                </div>

                                <div className="flex gap-3 mt-8">
                                    <button onClick={() => setStep(6)} className="px-6 py-4 border border-tan/20 text-charcoal/60 rounded-xl font-bold uppercase tracking-wider text-sm hover:bg-tan/5 transition-colors">Back</button>
                                    <button
                                        onClick={() => setStep(8)}
                                        className="flex-1 py-4 bg-tan text-white rounded-xl font-bold uppercase tracking-wider text-sm hover:bg-tan-dark transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-md"
                                    >
                                        Continue <ArrowRight size={16} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {step === 8 && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="w-12 h-12 bg-tan/10 rounded-2xl flex items-center justify-center text-tan mb-6">
                                    <FileText size={24} />
                                </div>
                                <h2 className="text-xl font-bold text-charcoal mb-4">Content Blocks & Footer</h2>
                                <p className="text-sm text-charcoal/60 mb-6">Final step! Customize the text blocks across your site.</p>

                                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 pb-4 custom-scrollbar">
                                    {Object.entries(values.contentBlocks).map(([key, value]) => (
                                        <div key={key}>
                                            <label className="block text-[10px] font-bold text-charcoal/70 uppercase tracking-wider mb-1">{key}</label>
                                            <textarea
                                                value={value}
                                                onChange={e => updateContentBlock(key, e.target.value)}
                                                rows={value.length > 50 ? 3 : 1}
                                                className="w-full px-3 py-2 bg-cream/30 border border-tan-light/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-tan/30 transition-all text-xs resize-none"
                                            />
                                            {clearedNotice(initial.contentBlocks[key], value, () => updateContentBlock(key, initial.contentBlocks[key]))}
                                        </div>
                                    ))}
                                </div>

                                {isRerun && (
                                    <div className="mt-6 p-4 bg-cream/40 border border-tan-light/40 rounded-xl text-xs text-charcoal/80">
                                        {pendingChanges.length === 0 ? (
                                            <p>You haven't changed anything, so nothing will be saved.</p>
                                        ) : (
                                            <>
                                                <p className="font-bold mb-2">
                                                    {pendingChanges.length === 1 ? '1 change' : `${pendingChanges.length} changes`} will be saved; everything else stays as it is:
                                                </p>
                                                <ul className="list-disc pl-5 space-y-0.5 max-h-32 overflow-y-auto">
                                                    {pendingChanges.map(path => (
                                                        <li key={path}>{describeField(path)}</li>
                                                    ))}
                                                </ul>
                                            </>
                                        )}
                                    </div>
                                )}

                                <div className="flex gap-3 mt-8">
                                    <button onClick={() => setStep(7)} className="px-6 py-4 border border-tan/20 text-charcoal/60 rounded-xl font-bold uppercase tracking-wider text-sm hover:bg-tan/5 transition-colors">Back</button>
                                    <button
                                        onClick={handleCompleteSetup}
                                        disabled={isProcessing}
                                        className="flex-1 py-4 bg-tan text-white rounded-xl font-bold uppercase tracking-wider text-sm hover:bg-tan-dark transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-md"
                                    >
                                        {isProcessing ? <Loader2 className="animate-spin" /> : isRerun ? (pendingChanges.length === 0 ? 'Finish' : 'Save Changes') : 'Complete Setup'}
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
