import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useAppearance } from '../contexts/AppearanceContext';
import { db } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import {
    Landmark,
    Search,
    FolderHeart,
    CheckCircle2,
    ArrowRight,
    ArrowLeft,
    X,
    Bookmark,
    Sparkles,
    BookOpen,
    MapPin,
    Mic,
    FileText,
    Shield
} from 'lucide-react';

export function MemberSetupWizard() {
    const { user, memberData, isMemberWizardOpen, closeMemberWizard, updateMemberData } = useAuth();
    const { settings } = useAppearance();
    const navigate = useNavigate();

    const [step, setStep] = useState(1);
    const [isSaving, setIsSaving] = useState(false);

    const museumName = settings?.museumName || 'Senoia Area Historical Society';
    const museumShortName = settings?.museumShortName || 'SAHS';

    if (!isMemberWizardOpen) return null;

    const handleComplete = async (redirectPath?: string) => {
        setIsSaving(true);
        try {
            if (user?.email) {
                localStorage.setItem(`sahs_wizard_completed_${user.email.toLowerCase()}`, 'true');
            }

            if (memberData?.id) {
                await updateDoc(doc(db, 'members', memberData.id), {
                    hasCompletedMemberWizard: true
                });
                updateMemberData({ hasCompletedMemberWizard: true });
            }
        } catch (err) {
            console.error('Error saving wizard completion status:', err);
        } finally {
            setIsSaving(false);
            closeMemberWizard();
            if (redirectPath) {
                navigate(redirectPath);
            }
        }
    };

    const totalSteps = 4;

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 sm:p-6 bg-charcoal/70 backdrop-blur-md animate-in fade-in duration-300">
            <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-tan-light/60 flex flex-col max-h-[90vh]">
                
                {/* Top Header Bar */}
                <div className="bg-cream/80 border-b border-tan-light/50 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-tan/15 text-tan flex items-center justify-center font-serif font-bold text-sm">
                            {step}
                        </div>
                        <div>
                            <p className="text-xs font-black uppercase tracking-widest text-tan">{museumShortName} Member Tour</p>
                            <p className="text-xs text-charcoal/60 font-sans">Step {step} of {totalSteps}</p>
                        </div>
                    </div>

                    <button
                        onClick={() => handleComplete()}
                        className="text-charcoal/40 hover:text-charcoal p-1.5 rounded-full hover:bg-tan/10 transition-colors"
                        title="Close Tour"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-cream-dark/30 h-1.5">
                    <div
                        className="bg-tan h-full transition-all duration-300 ease-out"
                        style={{ width: `${(step / totalSteps) * 100}%` }}
                    />
                </div>

                {/* Modal Content Body */}
                <div className="p-6 sm:p-8 flex-1 overflow-y-auto font-sans">
                    {step === 1 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="w-16 h-16 rounded-2xl bg-tan/10 text-tan flex items-center justify-center mx-auto shadow-inner">
                                <Landmark size={36} />
                            </div>
                            <div className="text-center space-y-2">
                                <h2 className="text-3xl font-serif font-bold text-charcoal tracking-tight">
                                    Welcome to the {museumShortName} Digital Archive!
                                </h2>
                                <p className="text-charcoal/70 text-base max-w-lg mx-auto">
                                    As a valued member of the <span className="font-semibold text-charcoal">{museumName}</span>, you enjoy exclusive digital access to historical records, research tools, and local history collections.
                                </p>
                            </div>

                            <div className="bg-cream/60 border border-tan-light/60 rounded-2xl p-4 sm:p-5 space-y-3">
                                <div className="flex items-center gap-3">
                                    <Shield className="text-emerald-600 shrink-0" size={20} />
                                    <p className="text-sm font-bold text-charcoal">
                                        Member Tier: <span className="text-tan-dark">{memberData?.tier || 'Paying Member'}</span>
                                    </p>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-charcoal/80">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                                        <span>Full High-Res Document Scans</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                                        <span>Personal Research Workspace</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                                        <span>Saved Notes & Folders</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                                        <span>Commenting Privileges</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="w-16 h-16 rounded-2xl bg-tan/10 text-tan flex items-center justify-center mx-auto shadow-inner">
                                <Search size={36} />
                            </div>
                            <div className="text-center space-y-2">
                                <h2 className="text-2xl sm:text-3xl font-serif font-bold text-charcoal tracking-tight">
                                    Explore Archives & Collections
                                </h2>
                                <p className="text-charcoal/70 text-sm sm:text-base max-w-lg mx-auto">
                                    Discover thousands of historical items organized by type, topic, and era.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                                <div className="p-4 rounded-xl bg-white border border-tan-light/60 shadow-xs flex items-start gap-3">
                                    <div className="p-2 rounded-lg bg-tan/10 text-tan shrink-0">
                                        <FileText size={20} />
                                    </div>
                                    <div>
                                        <h3 className="font-serif font-bold text-charcoal text-sm">{settings.tabNames?.documents || 'Historical Scans & Documents'}</h3>
                                        <p className="text-xs text-charcoal/60 mt-0.5">Letters, deeds, newspapers, and family records.</p>
                                    </div>
                                </div>

                                {settings.featureToggles?.enableOralHistories !== false && (
                                    <div className="p-4 rounded-xl bg-white border border-tan-light/60 shadow-xs flex items-start gap-3">
                                        <div className="p-2 rounded-lg bg-tan/10 text-tan shrink-0">
                                            <Mic size={20} />
                                        </div>
                                        <div>
                                            <h3 className="font-serif font-bold text-charcoal text-sm">{settings.tabNames?.oralHistories || 'Oral Histories'}</h3>
                                            <p className="text-xs text-charcoal/60 mt-0.5">Audio interviews & transcripts of community residents.</p>
                                        </div>
                                    </div>
                                )}

                                {settings.featureToggles?.enableMap !== false && (
                                    <div className="p-4 rounded-xl bg-white border border-tan-light/60 shadow-xs flex items-start gap-3">
                                        <div className="p-2 rounded-lg bg-tan/10 text-tan shrink-0">
                                            <MapPin size={20} />
                                        </div>
                                        <div>
                                            <h3 className="font-serif font-bold text-charcoal text-sm">Interactive Map</h3>
                                            <p className="text-xs text-charcoal/60 mt-0.5">Locate historic homes, buildings, and exhibit areas.</p>
                                        </div>
                                    </div>
                                )}

                                {settings.featureToggles?.enableLibrary !== false && (
                                    <div className="p-4 rounded-xl bg-white border border-tan-light/60 shadow-xs flex items-start gap-3">
                                        <div className="p-2 rounded-lg bg-tan/10 text-tan shrink-0">
                                            <BookOpen size={20} />
                                        </div>
                                        <div>
                                            <h3 className="font-serif font-bold text-charcoal text-sm">{settings.tabNames?.library || 'Book Library'}</h3>
                                            <p className="text-xs text-charcoal/60 mt-0.5">Browse reference books and museum catalog.</p>
                                        </div>
                                    </div>
                                )}

                                {settings.featureToggles?.enableCollections !== false && (
                                    <div className="p-4 rounded-xl bg-white border border-tan-light/60 shadow-xs flex items-start gap-3">
                                        <div className="p-2 rounded-lg bg-tan/10 text-tan shrink-0">
                                            <Bookmark size={20} />
                                        </div>
                                        <div>
                                            <h3 className="font-serif font-bold text-charcoal text-sm">Special Collections</h3>
                                            <p className="text-xs text-charcoal/60 mt-0.5">Curated thematic groupings of archives & photos.</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="w-16 h-16 rounded-2xl bg-tan/10 text-tan flex items-center justify-center mx-auto shadow-inner">
                                <FolderHeart size={36} />
                            </div>
                            <div className="text-center space-y-2">
                                <h2 className="text-2xl sm:text-3xl font-serif font-bold text-charcoal tracking-tight">
                                    My Research Workspace
                                </h2>
                                <p className="text-charcoal/70 text-sm sm:text-base max-w-lg mx-auto">
                                    Keep your research organized with personal folders, pinned items, and private research notes.
                                </p>
                            </div>

                            <div className="bg-cream/50 border border-tan-light/60 rounded-2xl p-5 space-y-4">
                                <div className="flex items-start gap-3">
                                    <div className="p-2 rounded-lg bg-tan/15 text-tan shrink-0 mt-0.5">
                                        <Bookmark size={18} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-charcoal text-sm">Bookmark & Pin Items</h4>
                                        <p className="text-xs text-charcoal/70 mt-0.5">Click the bookmark icon on any document or photo to save it directly to your research library.</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3">
                                    <div className="p-2 rounded-lg bg-tan/15 text-tan shrink-0 mt-0.5">
                                        <FolderHeart size={18} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-charcoal text-sm">Organize Folders</h4>
                                        <p className="text-xs text-charcoal/70 mt-0.5">Group related historic items by family name, topic, or street address in custom folders.</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3">
                                    <div className="p-2 rounded-lg bg-tan/15 text-tan shrink-0 mt-0.5">
                                        <Sparkles size={18} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-charcoal text-sm">Private Research Notes</h4>
                                        <p className="text-xs text-charcoal/70 mt-0.5">Attach private notes and family genealogy findings directly to items in your research area.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="space-y-6 text-center animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto shadow-inner">
                                <CheckCircle2 size={36} />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-3xl font-serif font-bold text-charcoal tracking-tight">
                                    You're All Set!
                                </h2>
                                <p className="text-charcoal/70 text-base max-w-md mx-auto">
                                    Thank you for supporting the {museumName}. Where would you like to start exploring?
                                </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                                <button
                                    onClick={() => handleComplete('/archive')}
                                    className="p-4 rounded-xl border border-tan-light bg-white hover:bg-tan/5 text-left transition-colors flex items-center justify-between group"
                                >
                                    <div>
                                        <p className="font-bold font-serif text-charcoal text-sm group-hover:text-tan transition-colors">Browse Digital Archive</p>
                                        <p className="text-xs text-charcoal/60">Search historic photos & items</p>
                                    </div>
                                    <ArrowRight size={18} className="text-tan group-hover:translate-x-1 transition-transform" />
                                </button>

                                <button
                                    onClick={() => handleComplete('/research')}
                                    className="p-4 rounded-xl border border-tan-light bg-white hover:bg-tan/5 text-left transition-colors flex items-center justify-between group"
                                >
                                    <div>
                                        <p className="font-bold font-serif text-charcoal text-sm group-hover:text-tan transition-colors">Open My Research</p>
                                        <p className="text-xs text-charcoal/60">View saved folders & notes</p>
                                    </div>
                                    <ArrowRight size={18} className="text-tan group-hover:translate-x-1 transition-transform" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="bg-cream/60 border-t border-tan-light/50 px-6 py-4 flex items-center justify-between">
                    {step > 1 ? (
                        <button
                            onClick={() => setStep(prev => prev - 1)}
                            className="px-4 py-2.5 rounded-xl border border-tan-light text-charcoal hover:bg-tan/10 text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2"
                        >
                            <ArrowLeft size={16} />
                            Back
                        </button>
                    ) : (
                        <div />
                    )}

                    {step < totalSteps ? (
                        <button
                            onClick={() => setStep(prev => prev + 1)}
                            className="px-6 py-2.5 rounded-xl bg-tan text-white hover:bg-tan-dark text-xs font-bold uppercase tracking-wider transition-colors shadow-sm flex items-center gap-2 ml-auto"
                        >
                            Next Step
                            <ArrowRight size={16} />
                        </button>
                    ) : (
                        <button
                            onClick={() => handleComplete()}
                            disabled={isSaving}
                            className="px-6 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-bold uppercase tracking-wider transition-colors shadow-sm flex items-center gap-2 ml-auto disabled:opacity-50"
                        >
                            {isSaving ? 'Saving...' : 'Finish Tour'}
                            <CheckCircle2 size={16} />
                        </button>
                    )}
                </div>

            </div>
        </div>
    );
}
