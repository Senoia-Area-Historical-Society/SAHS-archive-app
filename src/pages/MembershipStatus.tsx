import { useAuth } from '../contexts/AuthContext';
import { useAppearance } from '../contexts/AppearanceContext';
import { Shield, Award, Calendar, ArrowRight, CheckCircle, Info, Landmark, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

export function MembershipStatus() {
    const { user, isMember, isExpiredMember, memberData, simulatedRole } = useAuth();
    const { settings } = useAppearance();

    if (settings.featureToggles?.enableMembership === false) {
        return (
            <div className="flex-1 p-8 font-sans text-center flex flex-col justify-center items-center min-h-[400px]">
                <h1 className="text-3xl font-serif font-bold text-charcoal mb-4">Module Disabled</h1>
                <p className="text-charcoal/60 max-w-md">The Membership module is not active for this archive site.</p>
            </div>
        );
    }

    // Determine what display data to show based on real/simulated roles
    const displayAsSimulated = simulatedRole === 'member';
    const hasMembership = isMember || displayAsSimulated;

    // Construct membership details (shown for active, expired, and simulated)
    const memberName = displayAsSimulated 
        ? (user?.displayName || 'Jane Doe (Simulated)') 
        : (memberData?.name || user?.displayName || 'Active Researcher');
    const memberEmail = user?.email || 'member@senoiahistory.com';
    const memberTier = displayAsSimulated ? 'Individual Member' : (memberData?.tier || 'Paying Member');
    const memberJoined = displayAsSimulated 
        ? 'May 28, 2026' 
        : (memberData?.joinedAt ? new Date(memberData.joinedAt).toLocaleDateString() : 'N/A');
    const memberExpires = displayAsSimulated 
        ? 'May 28, 2027' 
        : (memberData?.expiresAt === 'Never' 
            ? 'Never (Lifetime / No Expiration)' 
            : (memberData?.expiresAt ? new Date(memberData.expiresAt).toLocaleDateString() : 'N/A'));

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500 font-sans">
            {/* Header */}
            <div>
                <h1 className="text-4xl font-serif font-bold text-charcoal mb-3 tracking-tight flex items-center gap-3">
                    <Landmark className="text-tan" size={36} />
                    Membership Status
                </h1>
                <p className="text-charcoal/70 text-lg max-w-xl">
                    View your registration details, paying membership tier, and digital archive access benefits.
                </p>
            </div>

            {/* Simulated Banner Indicator */}
            {displayAsSimulated && (
                <div className="bg-tan/10 border border-tan/20 rounded-xl p-4 flex items-center gap-3 text-tan text-sm font-bold uppercase tracking-wider">
                    <Shield size={18} />
                    <span>Role Simulation Active: Viewing as Simulated Paying Member</span>
                </div>
            )}

            {/* Expired membership banner */}
            {isExpiredMember && !displayAsSimulated && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle size={20} className="text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-sm">
                        <p className="font-bold text-amber-800">Your membership has expired</p>
                        <p className="text-amber-700 mt-0.5 leading-relaxed">
                            You can still view your saved research, but new notes, folders, and comments are paused until you renew. Contact SAHS or use the Stripe portal below to reinstate your membership.
                        </p>
                    </div>
                </div>
            )}

            {/* Main Content Layout */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                
                {/* Membership Card */}
                <div className="md:col-span-2 space-y-6">
                    {hasMembership ? (
                        <div className="bg-white border border-tan-light/50 rounded-2xl overflow-hidden shadow-sm">
                            {/* Card Hero Header */}
                            <div className="bg-cream/40 p-6 md:p-8 border-b border-tan-light/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <p className="text-xs font-black text-tan uppercase tracking-widest">{settings.museumName || 'Senoia Area Historical Society'}</p>
                                    <h2 className="text-2xl font-serif font-bold text-charcoal">{memberName}</h2>
                                    <p className="text-sm text-charcoal/60">{memberEmail}</p>
                                </div>
                                <div className="flex flex-col sm:items-end gap-2 shrink-0">
                                    <span className="sm:self-start bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest text-center">
                                        Active Registered
                                    </span>
                                    {(memberData?.isRecurring || displayAsSimulated) && (
                                        <span className="sm:self-end bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-center">
                                            Recurring
                                        </span>
                                    )}
                                    {memberData?.isFreeOneYear && (
                                        <span className="sm:self-end bg-green-50 text-green-700 border border-green-200 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-center">
                                            1-Yr Free (Realtor Paid)
                                        </span>
                                    )}
                                    {memberData?.expiresAt === 'Never' && (
                                        <span className="sm:self-end bg-purple-50 text-purple-700 border border-purple-200 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-center">
                                            Lifetime
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Card Detailed Grid */}
                            <div className="p-6 md:p-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div className="flex gap-3.5 items-start">
                                    <div className="p-2.5 bg-tan/10 text-tan rounded-lg shrink-0">
                                        <Award size={20} />
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-black text-charcoal/40 uppercase tracking-widest mb-0.5">Membership Tier</p>
                                        <p className="text-base font-serif font-bold text-charcoal leading-snug">{memberTier}</p>
                                    </div>
                                </div>

                                <div className="flex gap-3.5 items-start">
                                    <div className="p-2.5 bg-tan/10 text-tan rounded-lg shrink-0">
                                        <Calendar size={20} />
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-black text-charcoal/40 uppercase tracking-widest mb-0.5">Joined Date</p>
                                        <p className="text-base font-serif font-bold text-charcoal leading-snug">{memberJoined}</p>
                                    </div>
                                </div>

                                <div className="flex gap-3.5 items-start sm:col-span-2">
                                    <div className="p-2.5 bg-tan/10 text-tan rounded-lg shrink-0">
                                        <Calendar size={20} />
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-black text-charcoal/40 uppercase tracking-widest mb-0.5">Membership Expiration</p>
                                        <p className="text-base font-serif font-bold text-charcoal leading-snug">{memberExpires}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Stripe Billing Portal Card Footer */}
                            <div className="bg-tan/5 border-t border-tan-light/30 px-6 py-5 md:px-8 md:py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <h4 className="text-sm font-bold text-charcoal font-serif">Manage Subscription</h4>
                                    <p className="text-xs text-charcoal/60 leading-relaxed max-w-md">
                                        Update your payment method, view billing history, download invoices, or renew your subscription directly via our secure Stripe member portal.
                                    </p>
                                </div>
                                {settings.stripeBillingPortalUrl && (
                                    <a
                                        href={settings.stripeBillingPortalUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-tan text-white hover:bg-tan-dark active:bg-tan-dark/90 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 shadow-sm whitespace-nowrap"
                                    >
                                        Stripe Portal <ArrowRight size={14} />
                                    </a>
                                )}
                            </div>
                        </div>
                    ) : isExpiredMember && memberData ? (
                        /* Expired member — show their details in a muted state with renewal CTA */
                        <div className="bg-white border border-amber-200 rounded-2xl overflow-hidden shadow-sm">
                            <div className="bg-amber-50/50 p-6 md:p-8 border-b border-amber-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <p className="text-xs font-black text-amber-600 uppercase tracking-widest">{settings.museumName}</p>
                                    <h2 className="text-2xl font-serif font-bold text-charcoal">{memberData.name || user?.displayName}</h2>
                                    <p className="text-sm text-charcoal/60">{user?.email}</p>
                                </div>
                                <span className="self-start bg-amber-100 text-amber-800 border border-amber-300 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest">
                                    Membership Expired
                                </span>
                            </div>

                            <div className="p-6 md:p-8 grid grid-cols-1 sm:grid-cols-2 gap-6 opacity-60">
                                <div className="flex gap-3.5 items-start">
                                    <div className="p-2.5 bg-charcoal/5 text-charcoal/40 rounded-lg shrink-0"><Award size={20} /></div>
                                    <div>
                                        <p className="text-[11px] font-black text-charcoal/40 uppercase tracking-widest mb-0.5">Membership Tier</p>
                                        <p className="text-base font-serif font-bold text-charcoal leading-snug">{memberData.tier || 'Member'}</p>
                                    </div>
                                </div>
                                <div className="flex gap-3.5 items-start">
                                    <div className="p-2.5 bg-charcoal/5 text-charcoal/40 rounded-lg shrink-0"><Calendar size={20} /></div>
                                    <div>
                                        <p className="text-[11px] font-black text-charcoal/40 uppercase tracking-widest mb-0.5">Originally Joined</p>
                                        <p className="text-base font-serif font-bold text-charcoal leading-snug">
                                            {memberData.joinedAt ? new Date(memberData.joinedAt).toLocaleDateString() : 'N/A'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-3.5 items-start sm:col-span-2">
                                    <div className="p-2.5 bg-red-50 text-red-400 rounded-lg shrink-0"><Calendar size={20} /></div>
                                    <div>
                                        <p className="text-[11px] font-black text-charcoal/40 uppercase tracking-widest mb-0.5">Expired On</p>
                                        <p className="text-base font-serif font-bold text-red-600 leading-snug">
                                            {memberData.expiresAt ? new Date(memberData.expiresAt).toLocaleDateString() : 'N/A'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-amber-50 border-t border-amber-100 px-6 py-5 md:px-8 md:py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <h4 className="text-sm font-bold text-amber-900 font-serif">Renew Your Membership</h4>
                                    <p className="text-xs text-amber-800/70 leading-relaxed max-w-md">
                                        Renew to restore full research access — your saved folders, notes, and pins are all waiting for you.
                                    </p>
                                </div>
                                {settings.stripeBillingPortalUrl && (
                                    <a
                                        href={settings.stripeBillingPortalUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-amber-600 text-white hover:bg-amber-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 shadow-sm whitespace-nowrap"
                                    >
                                        Renew Now <ArrowRight size={14} />
                                    </a>
                                )}
                            </div>
                        </div>
                    ) : (
                        /* Staff Access (No membership, but holds Curator/Admin privileges) */
                        <div className="bg-white border border-tan-light/50 rounded-2xl p-6 md:p-8 shadow-sm space-y-6">
                            <div className="flex items-start gap-4">
                                <div className="p-3 bg-red-50 text-red-600 rounded-xl">
                                    <Shield size={28} />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-xl font-serif font-bold text-charcoal">Assigned Curation Privileges</h3>
                                    <p className="text-sm text-charcoal/60 leading-relaxed">
                                        You are signed in as an administrator or curator. You have complete access to the digital archives, shelving directories, and curation systems.
                                    </p>
                                </div>
                            </div>

                            <div className="p-4 bg-tan/5 rounded-xl border border-tan/10 flex items-start gap-3 text-xs text-charcoal/70 leading-relaxed font-sans">
                                <Info size={16} className="text-tan shrink-0 mt-0.5" />
                                <div>
                                    <span className="font-bold text-charcoal">Want to preview the paying member view?</span>
                                    <br />
                                    As an administrator, you can toggle the **Member** view simulation at any time under the <Link to="/settings" className="text-tan hover:underline font-bold">Admin Settings</Link> dashboard to test public workspace features exactly as members see them.
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Digital Access Benefits sidebar */}
                <div className="space-y-6">
                    <div className="bg-white border border-tan-light/50 p-6 rounded-2xl shadow-sm space-y-5">
                        <h3 className="text-sm font-black text-charcoal/40 uppercase tracking-wider border-b border-tan-light/30 pb-3 font-sans">
                            Research Privileges
                        </h3>
                        
                        <ul className="space-y-4 font-sans text-sm text-charcoal/80">
                            <li className="flex items-start gap-3">
                                <CheckCircle size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                                <div>
                                    <span className="font-bold text-charcoal">Historical Annotations</span>
                                    <p className="text-xs text-charcoal/60 mt-0.5">Post comments, translation notes, and historical logs directly under archive items.</p>
                                </div>
                            </li>
                            <li className="flex items-start gap-3">
                                <CheckCircle size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                                <div>
                                    <span className="font-bold text-charcoal">Research Folders</span>
                                    <p className="text-xs text-charcoal/60 mt-0.5">Group related documents, cemetery maps, and family registries into shareable research folders.</p>
                                </div>
                            </li>
                            <li className="flex items-start gap-3">
                                <CheckCircle size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                                <div>
                                    <span className="font-bold text-charcoal">Private Pins Mapping</span>
                                    <p className="text-xs text-charcoal/60 mt-0.5">Drop personal bookmarks and custom geolocated research notes across historical blueprints.</p>
                                </div>
                            </li>
                            <li className="flex items-start gap-3">
                                <CheckCircle size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                                <div>
                                    <span className="font-bold text-charcoal">Archival Image Downloads</span>
                                    <p className="text-xs text-charcoal/60 mt-0.5">Download high-resolution historical photographs and scanned documents directly to your local device.</p>
                                </div>
                            </li>
                        </ul>
                    </div>

                    <div className="bg-tan/5 border border-tan-light/30 p-6 rounded-2xl space-y-4 leading-relaxed text-xs text-charcoal/70">
                        <div className="space-y-2">
                            <h4 className="font-serif font-bold text-sm text-charcoal">Need to Renew or Inquire?</h4>
                            <p>
                                For inquiries about your {settings.museumName || 'museum'} paying membership tier, expiration, or lifetime registry, please visit our museum or contact our support team.
                            </p>
                        </div>
                        {settings.stripeBillingPortalUrl && (
                            <a 
                                href={settings.stripeBillingPortalUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-tan text-white hover:bg-tan-dark active:bg-tan-dark/90 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 shadow-sm text-center font-sans"
                            >
                                Stripe Billing Portal <ArrowRight size={12} />
                            </a>
                        )}
                        {settings.contactSupportUrl && (
                            <div className="border-t border-tan-light/30 pt-3">
                                <a 
                                    href={settings.contactSupportUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 font-bold text-tan hover:text-tan-dark transition-colors uppercase tracking-wider text-[11px] font-sans"
                                >
                                    Contact {settings.museumShortName || 'Museum'} Support <ArrowRight size={11} />
                                </a>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
