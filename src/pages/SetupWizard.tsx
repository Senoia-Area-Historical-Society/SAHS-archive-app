import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowRight, ShieldCheck, Palette, Building2, CheckCircle2 } from 'lucide-react';

export function SetupWizard() {
    const { user, isSetupComplete } = useAuth();
    const navigate = useNavigate();

    const [step, setStep] = useState(1);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Organization data
    const [museumName, setMuseumName] = useState('');
    const [museumShortName, setMuseumShortName] = useState('');
    const [sidebarTitle, setSidebarTitle] = useState('');

    // Branding data
    const [heroTitle, setHeroTitle] = useState('');
    const [heroSubtitle, setHeroSubtitle] = useState('Preserving Our Past, Inspiring Our Future');
    const [theme, setTheme] = useState('classic');

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
                contentBlocks: {
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

            // Navigate home
            window.location.href = '/'; // Hard reload to fetch all settings freshly
        } catch (err) {
            console.error("Error completing setup:", err);
            setError("Failed to save settings. Check your database rules.");
            setIsProcessing(false);
        }
    };

    return (
        <div className="min-h-screen bg-cream py-12 px-4 sm:px-6 flex flex-col items-center font-sans">
            <div className="max-w-xl w-full">
                
                {/* Header */}
                <div className="text-center mb-10">
                    <h1 className="text-3xl md:text-4xl font-serif font-bold text-charcoal tracking-tight mb-2">
                        Welcome to your Archive
                    </h1>
                    <p className="text-charcoal-light font-medium">Let's get your organization set up.</p>
                </div>

                {/* Main Card */}
                <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-tan-light/30 overflow-hidden">
                    
                    {/* Progress Bar */}
                    <div className="flex w-full h-1.5 bg-tan-light/20">
                        <div className={`h-full bg-tan transition-all duration-500`} style={{ width: `${(step / 3) * 100}%` }} />
                    </div>

                    <div className="p-8 md:p-12">
                        
                        {error && (
                            <div className="mb-6 p-4 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100">
                                {error}
                            </div>
                        )}

                        {step === 1 && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="w-12 h-12 bg-tan/10 rounded-2xl flex items-center justify-center text-tan mb-6">
                                    <ShieldCheck size={24} />
                                </div>
                                <h2 className="text-xl font-bold text-charcoal mb-4">Claim Database Ownership</h2>
                                <p className="text-charcoal/70 mb-6 leading-relaxed text-sm">
                                    You are currently logged in as <strong>{user.email}</strong>. 
                                    Since this is a new installation, the system needs an initial Administrator. 
                                    Clicking below will securely assign your account full Admin privileges.
                                </p>
                                <button
                                    onClick={handleClaimAdmin}
                                    disabled={isProcessing}
                                    className="w-full py-4 bg-charcoal text-white rounded-xl font-bold uppercase tracking-wider text-sm hover:bg-black transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-md"
                                >
                                    {isProcessing ? <Loader2 size={18} className="animate-spin" /> : "Claim Admin & Continue"}
                                </button>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="w-12 h-12 bg-tan/10 rounded-2xl flex items-center justify-center text-tan mb-6">
                                    <Building2 size={24} />
                                </div>
                                <h2 className="text-xl font-bold text-charcoal mb-4">Organization Details</h2>
                                
                                <div className="space-y-5">
                                    <div>
                                        <label className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Full Organization Name</label>
                                        <input 
                                            id="museumName"
                                            type="text" 
                                            value={museumName}
                                            onChange={e => setMuseumName(e.target.value)}
                                            placeholder="e.g. Senoia Area Historical Society"
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
                                            placeholder="e.g. SAHS"
                                            className="w-full px-4 py-3 bg-cream/30 border border-tan-light/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-tan/30 transition-all text-sm"
                                        />
                                        <p className="text-[11px] text-charcoal/50 mt-1.5">Used in tabs, breadcrumbs, and tight spaces.</p>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Navigation Sidebar Title</label>
                                        <textarea 
                                            id="sidebarTitle"
                                            value={sidebarTitle}
                                            onChange={e => setSidebarTitle(e.target.value)}
                                            placeholder="e.g. Senoia&#10;Historical Society"
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
                                <h2 className="text-xl font-bold text-charcoal mb-4">Homepage Branding</h2>
                                
                                <div className="space-y-5">
                                    <div>
                                        <label className="block text-xs font-bold text-charcoal/70 uppercase tracking-wider mb-2">Homepage Hero Title</label>
                                        <textarea 
                                            id="heroTitle"
                                            value={heroTitle}
                                            onChange={e => setHeroTitle(e.target.value)}
                                            placeholder="e.g. Senoia&#10;Historical Society"
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
                                        </select>
                                    </div>
                                </div>

                                <div className="flex gap-3 mt-8">
                                    <button
                                        onClick={() => setStep(2)}
                                        className="px-6 py-4 border border-tan/20 text-charcoal/60 rounded-xl font-bold uppercase tracking-wider text-sm hover:bg-tan/5 transition-colors"
                                    >
                                        Back
                                    </button>
                                    <button
                                        onClick={handleCompleteSetup}
                                        disabled={isProcessing || !heroTitle}
                                        className="flex-1 py-4 bg-tan text-white rounded-xl font-bold uppercase tracking-wider text-sm hover:bg-tan-dark transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-md"
                                    >
                                        {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <><CheckCircle2 size={18} /> Complete Setup</>}
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
