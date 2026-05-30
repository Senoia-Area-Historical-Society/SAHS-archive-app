import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Settings, Shield, UserPlus, Trash2, Mail, Loader2, UserMinus, Star, Upload, Image as ImageIcon, Save, Check, Users, UserCheck, CalendarClock, Search } from 'lucide-react';
import { db, storage } from '../lib/firebase';
import { collection, getDocs, doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import type { Member } from '../types/database';

interface UserRole {
    id: string; // the email
    role: 'admin' | 'curator';
    addedAt: string;
}

export function AdminSettings() {
    const { realIsAdmin, simulatedRole, setSimulatedRole } = useAuth();
    const [roles, setRoles] = useState<UserRole[]>([]);
    const [loading, setLoading] = useState(true);
    
    const [newEmail, setNewEmail] = useState('');
    const [newRole, setNewRole] = useState<'admin' | 'curator'>('curator');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Intern Spotlight State
    const [spotlightEnabled, setSpotlightEnabled] = useState(false);
    const [spotlightName, setSpotlightName] = useState('');
    const [spotlightRole, setSpotlightRole] = useState('');
    const [spotlightBio, setSpotlightBio] = useState('');
    const [spotlightLinkedIn, setSpotlightLinkedIn] = useState('');
    const [spotlightImageUrl, setSpotlightImageUrl] = useState('');
    const [spotlightImageFile, setSpotlightImageFile] = useState<File | null>(null);
    const [isSavingSpotlight, setIsSavingSpotlight] = useState(false);

    // Tabs state
    const [activeTab, setActiveTab] = useState<'roles' | 'members' | 'spotlight'>('roles');

    // Membership Roll state
    const [members, setMembers] = useState<Member[]>([]);
    const [membersLoading, setMembersLoading] = useState(true);
    const [newMemberEmail, setNewMemberEmail] = useState('');
    const [newMemberName, setNewMemberName] = useState('');
    const [newMemberExpiresAt, setNewMemberExpiresAt] = useState(() => {
        const nextYear = new Date();
        nextYear.setFullYear(nextYear.getFullYear() + 1);
        return nextYear.toISOString().split('T')[0];
    });
    const [newMemberIsLifetime, setNewMemberIsLifetime] = useState(false);
    const [isSubmittingMember, setIsSubmittingMember] = useState(false);
    const [memberSearchQuery, setMemberSearchQuery] = useState('');

    useEffect(() => {
        if (!realIsAdmin) return;
        fetchRoles();
        fetchMembers();
        fetchSpotlightSettings();
    }, [realIsAdmin]);

    const fetchMembers = async () => {
        setMembersLoading(true);
        try {
            const querySnapshot = await getDocs(collection(db, 'members'));
            const membersData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Member[];
            setMembers(membersData);
        } catch (error) {
            console.error("Error fetching members:", error);
        } finally {
            setMembersLoading(false);
        }
    };

    const handleAddMember = async (e: React.FormEvent) => {
        e.preventDefault();
        const email = newMemberEmail.toLowerCase().trim();
        const name = newMemberName.trim();
        
        if (!email || !name) return;
        
        setIsSubmittingMember(true);
        try {
            const joinedAt = new Date().toISOString();
            const expiresAt = newMemberIsLifetime ? 'Never' : new Date(newMemberExpiresAt).toISOString().split('T')[0];
            
            await setDoc(doc(db, 'members', email), {
                email,
                name,
                tier: 'Member',
                status: 'active',
                joinedAt,
                expiresAt
            });
            
            setNewMemberEmail('');
            setNewMemberName('');
            setNewMemberIsLifetime(false);
            const nextYear = new Date();
            nextYear.setFullYear(nextYear.getFullYear() + 1);
            setNewMemberExpiresAt(nextYear.toISOString().split('T')[0]);
            
            fetchMembers();
        } catch (error) {
            console.error('Error adding member', error);
            alert('Failed to add member.');
        } finally {
            setIsSubmittingMember(false);
        }
    };

    const handleDeleteMember = async (email: string) => {
        if (!window.confirm(`Are you sure you want to revoke membership for ${email}?`)) return;
        
        try {
            await deleteDoc(doc(db, 'members', email));
            fetchMembers();
        } catch (error) {
            console.error('Error deleting member', error);
            alert('Failed to delete member.');
        }
    };

    const handleToggleMemberStatus = async (member: Member) => {
        const newStatus = member.status === 'active' ? 'expired' : 'active';
        try {
            await setDoc(doc(db, 'members', member.email), {
                ...member,
                status: newStatus
            }, { merge: true });
            fetchMembers();
        } catch (error) {
            console.error('Error updating member status', error);
            alert('Failed to update status.');
        }
    };

    const handleRenewMember = async (member: Member) => {
        if (member.expiresAt === 'Never') return;
        
        const currentExp = new Date(member.expiresAt);
        const today = new Date();
        const baseDate = currentExp > today ? currentExp : today;
        
        const newExpDate = new Date(baseDate);
        newExpDate.setFullYear(newExpDate.getFullYear() + 1);
        const newExpiresAt = newExpDate.toISOString().split('T')[0];
        
        try {
            await setDoc(doc(db, 'members', member.email), {
                ...member,
                status: 'active',
                expiresAt: newExpiresAt
            }, { merge: true });
            fetchMembers();
        } catch (error) {
            console.error('Error renewing membership', error);
            alert('Failed to renew membership.');
        }
    };

    const fetchSpotlightSettings = async () => {
        try {
            const docSnap = await getDoc(doc(db, 'site_settings', 'intern_spotlight'));
            if (docSnap.exists()) {
                const data = docSnap.data();
                setSpotlightEnabled(data.enabled || false);
                setSpotlightName(data.name || '');
                setSpotlightRole(data.role || '');
                setSpotlightBio(data.bio || '');
                setSpotlightLinkedIn(data.linkedInUrl || '');
                setSpotlightImageUrl(data.imageUrl || '');
            }
        } catch (error) {
            console.error("Error fetching spotlight settings:", error);
        }
    };

    const fetchRoles = async () => {
        try {
            const querySnapshot = await getDocs(collection(db, 'user_roles'));
            const rolesData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as UserRole[];
            setRoles(rolesData);
        } catch (error) {
            console.error("Error fetching user roles:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        const email = newEmail.toLowerCase().trim();
        
        setIsSubmitting(true);
        try {
            await setDoc(doc(db, 'user_roles', email), {
                role: newRole,
                addedAt: new Date().toISOString()
            });
            setNewEmail('');
            setNewRole('curator');
            fetchRoles();
        } catch (error) {
            console.error('Error adding user role', error);
            alert('Failed to add user role.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteUser = async (email: string) => {
        if (!window.confirm(`Are you sure you want to revoke privileges for ${email}?`)) return;
        
        try {
            await deleteDoc(doc(db, 'user_roles', email));
            fetchRoles();
        } catch (error) {
            console.error('Error deleting user role', error);
            alert('Failed to delete user role.');
        }
    };

    const handleSaveSpotlight = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSavingSpotlight(true);
        try {
            let finalImageUrl = spotlightImageUrl;
            
            if (spotlightImageFile) {
                const fileRef = ref(storage, `site_assets/intern_spotlight_${Date.now()}_${spotlightImageFile.name}`);
                await uploadBytes(fileRef, spotlightImageFile);
                finalImageUrl = await getDownloadURL(fileRef);
                setSpotlightImageUrl(finalImageUrl);
                setSpotlightImageFile(null); // Clear pending file
            }

            await setDoc(doc(db, 'site_settings', 'intern_spotlight'), {
                enabled: spotlightEnabled,
                name: spotlightName,
                role: spotlightRole,
                bio: spotlightBio,
                linkedInUrl: spotlightLinkedIn,
                imageUrl: finalImageUrl,
                updatedAt: new Date().toISOString()
            });

            alert('Spotlight saved successfully!');
        } catch (error) {
            console.error('Error saving spotlight details:', error);
            if (error instanceof Error) {
                alert(`Failed to save spotlight settings: ${error.message}`);
            } else {
                alert(`Failed to save spotlight settings. Check console for details.`);
            }
        } finally {
            setIsSavingSpotlight(false);
        }
    };

    if (!realIsAdmin) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-cream/30 rounded-2xl border border-tan-light/50 h-full min-h-[50vh]">
                <Shield size={48} className="text-red-500/50 mb-4" />
                <h3 className="text-2xl font-serif font-bold text-charcoal mb-2">Access Denied</h3>
                <p className="text-charcoal/60 max-w-md">You must be a system administrator to view this page.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-500">
            <div className="flex justify-between items-end mb-6 pr-4">
                <div>
                    <h1 className="text-4xl font-serif font-bold mb-3 text-charcoal tracking-tight flex items-center gap-3">
                        <Settings className="text-tan" size={32} />
                        Admin Settings
                    </h1>
                    <p className="text-charcoal/70 text-lg max-w-2xl">
                        Manage membership rolls, user privileges, and dynamic content.
                    </p>
                </div>
            </div>

            {/* Tabs Navigation */}
            <div className="flex border-b border-tan-light/50 mb-8 overflow-x-auto pr-4 gap-2 scrollbar-none">
                <button
                    onClick={() => setActiveTab('roles')}
                    className={`pb-4 px-4 font-semibold text-sm border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
                        activeTab === 'roles'
                            ? 'border-tan text-tan font-bold'
                            : 'border-transparent text-charcoal/60 hover:text-charcoal'
                    }`}
                >
                    <Shield size={16} />
                    System Roles & Simulation
                </button>
                <button
                    onClick={() => setActiveTab('members')}
                    className={`pb-4 px-4 font-semibold text-sm border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
                        activeTab === 'members'
                            ? 'border-tan text-tan font-bold'
                            : 'border-transparent text-charcoal/60 hover:text-charcoal'
                    }`}
                >
                    <Users size={16} />
                    Membership Roll
                </button>
                <button
                    onClick={() => setActiveTab('spotlight')}
                    className={`pb-4 px-4 font-semibold text-sm border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
                        activeTab === 'spotlight'
                            ? 'border-tan text-tan font-bold'
                            : 'border-transparent text-charcoal/60 hover:text-charcoal'
                    }`}
                >
                    <Star size={16} />
                    Homepage Spotlight
                </button>
            </div>

            {/* TAB CONTENT: System Roles */}
            {activeTab === 'roles' && (
                <div className="space-y-8 animate-in fade-in duration-300">
                    {/* Role Simulation Section */}
                    <div className="bg-tan/5 border border-tan-light/50 rounded-2xl p-6 shadow-sm">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div>
                                <h2 className="text-xl font-serif font-bold text-charcoal mb-2 flex items-center gap-2">
                                    <Shield className="text-tan" size={24} />
                                    Role Simulation
                                </h2>
                                <p className="text-charcoal/70 text-sm max-w-xl font-sans">
                                    Preview the website as a different user level. This only affects your current browser session and does not change your actual database permissions.
                                </p>
                            </div>
                            
                            <div className="flex items-center gap-2 p-1 bg-cream rounded-xl border border-tan-light/30 self-start md:self-auto font-sans">
                                <button
                                    onClick={() => setSimulatedRole(null)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${!simulatedRole ? 'bg-white text-tan shadow-sm' : 'text-charcoal/60 hover:text-charcoal'}`}
                                >
                                    Real Admin
                                </button>
                                <button
                                    onClick={() => setSimulatedRole('curator')}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${simulatedRole === 'curator' ? 'bg-white text-tan shadow-sm' : 'text-charcoal/60 hover:text-charcoal'}`}
                                >
                                    Curator
                                </button>
                                <button
                                    onClick={() => setSimulatedRole('member')}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${simulatedRole === 'member' ? 'bg-white text-tan shadow-sm' : 'text-charcoal/60 hover:text-charcoal'}`}
                                >
                                    Member
                                </button>
                                <button
                                    onClick={() => setSimulatedRole('visitor')}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${simulatedRole === 'visitor' ? 'bg-white text-tan shadow-sm' : 'text-charcoal/60 hover:text-charcoal'}`}
                                >
                                    Visitor
                                </button>
                            </div>
                        </div>
                        {simulatedRole && (
                            <div className="mt-4 px-4 py-2 bg-tan/10 rounded-lg inline-flex items-center gap-2 text-tan text-xs font-bold uppercase tracking-wider font-sans">
                                <Shield size={14} />
                                Active: Simulating {simulatedRole} View
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Form to Add User */}
                        <div className="lg:col-span-1">
                            <div className="bg-white p-6 rounded-xl border border-tan-light/50 shadow-sm sticky top-24">
                                <h2 className="text-xl font-serif font-bold text-charcoal mb-6 flex items-center gap-2">
                                    <UserPlus size={20} className="text-tan" />
                                    Assign Privilege
                                </h2>
                                
                                <form onSubmit={handleAddUser} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-bold text-charcoal/60 uppercase tracking-widest mb-2 font-sans">User Email</label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/40" size={18} />
                                            <input 
                                                type="email" 
                                                required 
                                                placeholder="email@example.com"
                                                value={newEmail}
                                                onChange={(e) => setNewEmail(e.target.value)}
                                                className="w-full bg-cream pl-10 pr-4 py-3 rounded-lg border border-transparent focus:bg-white focus:border-tan outline-none transition-all font-sans text-charcoal"
                                            />
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-bold text-charcoal/60 uppercase tracking-widest mb-2 font-sans">Role Level</label>
                                        <select
                                            value={newRole}
                                            onChange={(e) => setNewRole(e.target.value as 'admin' | 'curator')}
                                            className="w-full bg-cream px-4 py-3 rounded-lg border border-transparent outline-none cursor-pointer focus:bg-white focus:border-tan transition-all font-sans text-charcoal"
                                        >
                                            <option value="curator">Curator (Add, Edit, Delete)</option>
                                            <option value="admin">Admin (All + Settings + AI)</option>
                                        </select>
                                    </div>
                                    
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="w-full bg-tan text-white px-5 py-3 rounded-lg font-medium hover:bg-charcoal transition-colors hover:scale-[1.02] active:scale-[0.98] mt-2 flex items-center justify-center font-sans"
                                    >
                                        {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : 'Assign Role'}
                                    </button>
                                </form>
                            </div>
                        </div>

                        {/* List of current Users */}
                        <div className="lg:col-span-2 space-y-4 font-sans">
                            <div className="bg-white rounded-xl border border-tan-light/50 overflow-hidden shadow-sm">
                                <div className="px-6 py-4 bg-cream/30 border-b border-tan-light/50 flex items-center justify-between">
                                    <h3 className="font-serif font-bold text-charcoal flex items-center gap-2">
                                        <Shield size={18} className="text-tan" />
                                        Database Assigned Roles
                                    </h3>
                                </div>
                                
                                {loading ? (
                                    <div className="p-8 text-center text-charcoal/60 font-serif">Loading...</div>
                                ) : roles.length === 0 ? (
                                    <div className="p-12 text-center text-charcoal/50 font-sans">
                                        <UserMinus size={32} className="mx-auto mb-3 opacity-50" />
                                        <p>No database overrides have been assigned yet.</p>
                                        <p className="text-sm mt-1">Hardcoded admins have automatic permanent access.</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-tan-light/30">
                                        {roles.map(role => (
                                            <div key={role.id} className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-cream/20 transition-colors">
                                                <div>
                                                    <p className="font-semibold text-charcoal font-sans">{role.id}</p>
                                                    <p className="text-xs font-bold uppercase tracking-wider mt-1 flex items-center gap-2">
                                                        {role.role === 'admin' ? (
                                                            <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">Admin</span>
                                                        ) : (
                                                            <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">Curator</span>
                                                        )}
                                                        <span className="text-charcoal/40 font-mono text-[10px] lowercase">Since {new Date(role.addedAt || Date.now()).toLocaleDateString()}</span>
                                                    </p>
                                                </div>
                                                <button 
                                                    onClick={() => handleDeleteUser(role.id)}
                                                    className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded transition-colors self-start sm:self-auto"
                                                    title="Revoke Overrides"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            
                            <div className="bg-blue-50/50 rounded-xl border border-blue-100 p-6 text-sm text-blue-900/70 font-sans leading-relaxed">
                                <strong>Permanent Admins:</strong> <code>catnolan@senoiahistory.com</code> and <code>jeremywarren@senoiahistory.com</code> are hardcoded as permanent system administrators. You cannot revoke their access here.
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB CONTENT: Membership Roll */}
            {activeTab === 'members' && (
                <div className="space-y-8 animate-in fade-in duration-300 font-sans">
                    {/* Metrics Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-white border border-tan-light/50 p-6 rounded-2xl shadow-sm flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-tan/10 text-tan flex items-center justify-center">
                                <Users size={24} />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-charcoal/50 uppercase tracking-wider font-sans">Total Members</p>
                                <p className="text-3xl font-serif font-bold text-charcoal">{members.length}</p>
                            </div>
                        </div>

                        <div className="bg-white border border-tan-light/50 p-6 rounded-2xl shadow-sm flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                <UserCheck size={24} />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-charcoal/50 uppercase tracking-wider font-sans">Active Members</p>
                                <p className="text-3xl font-serif font-bold text-charcoal">
                                    {members.filter(m => {
                                        const isExpired = m.expiresAt !== 'Never' && new Date(m.expiresAt) < new Date();
                                        return m.status === 'active' && !isExpired;
                                    }).length}
                                </p>
                            </div>
                        </div>

                        <div className="bg-white border border-tan-light/50 p-6 rounded-2xl shadow-sm flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
                                <CalendarClock size={24} />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-charcoal/50 uppercase tracking-wider font-sans">Expired Memberships</p>
                                <p className="text-3xl font-serif font-bold text-charcoal">
                                    {members.filter(m => {
                                        const isExpired = m.expiresAt !== 'Never' && new Date(m.expiresAt) < new Date();
                                        return m.status === 'expired' || isExpired;
                                    }).length}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Add Member Form */}
                        <div className="lg:col-span-1">
                            <div className="bg-white p-6 rounded-xl border border-tan-light/50 shadow-sm sticky top-24">
                                <h2 className="text-xl font-serif font-bold text-charcoal mb-6 flex items-center gap-2">
                                    <UserPlus size={20} className="text-tan" />
                                    Add Member
                                </h2>
                                
                                <form onSubmit={handleAddMember} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-bold text-charcoal/60 uppercase tracking-widest mb-2 font-sans">Member Name</label>
                                        <input 
                                            type="text" 
                                            required 
                                            placeholder="Jane Doe"
                                            value={newMemberName}
                                            onChange={(e) => setNewMemberName(e.target.value)}
                                            className="w-full bg-cream px-4 py-3 rounded-lg border border-transparent focus:bg-white focus:border-tan outline-none transition-all font-sans text-charcoal"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-charcoal/60 uppercase tracking-widest mb-2 font-sans">User Email</label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/40" size={18} />
                                            <input 
                                                type="email" 
                                                required 
                                                placeholder="member@example.com"
                                                value={newMemberEmail}
                                                onChange={(e) => setNewMemberEmail(e.target.value)}
                                                className="w-full bg-cream pl-10 pr-4 py-3 rounded-lg border border-transparent focus:bg-white focus:border-tan outline-none transition-all font-sans text-charcoal"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 py-2 font-sans">
                                        <input
                                            type="checkbox"
                                            id="isLifetime"
                                            checked={newMemberIsLifetime}
                                            onChange={(e) => setNewMemberIsLifetime(e.target.checked)}
                                            className="h-4 w-4 rounded border-tan-light text-tan focus:ring-tan cursor-pointer bg-cream border-transparent"
                                        />
                                        <label htmlFor="isLifetime" className="text-sm font-bold text-charcoal/70 cursor-pointer select-none">
                                            Lifetime / No Expiration
                                        </label>
                                    </div>

                                    {!newMemberIsLifetime && (
                                        <div>
                                            <label className="block text-sm font-bold text-charcoal/60 uppercase tracking-widest mb-2 font-sans">Expiration Date</label>
                                            <input 
                                                type="date" 
                                                required 
                                                value={newMemberExpiresAt}
                                                onChange={(e) => setNewMemberExpiresAt(e.target.value)}
                                                className="w-full bg-cream px-4 py-3 rounded-lg border border-transparent focus:bg-white focus:border-tan outline-none transition-all font-sans text-charcoal"
                                            />
                                        </div>
                                    )}
                                    
                                    <button
                                        type="submit"
                                        disabled={isSubmittingMember}
                                        className="w-full bg-tan text-white px-5 py-3 rounded-lg font-medium hover:bg-charcoal transition-colors hover:scale-[1.02] active:scale-[0.98] mt-2 flex items-center justify-center font-sans"
                                    >
                                        {isSubmittingMember ? <Loader2 className="animate-spin" size={20} /> : 'Add Member to Roll'}
                                    </button>
                                </form>
                            </div>
                        </div>

                        {/* Members Roll List */}
                        <div className="lg:col-span-2 space-y-4">
                            <div className="bg-white rounded-xl border border-tan-light/50 overflow-hidden shadow-sm">
                                <div className="px-6 py-4 bg-cream/30 border-b border-tan-light/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <h3 className="font-serif font-bold text-charcoal flex items-center gap-2">
                                        <Users size={18} className="text-tan" />
                                        Membership Registry
                                    </h3>
                                    
                                    <div className="relative w-full sm:w-64 font-sans">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/40" size={16} />
                                        <input
                                            type="text"
                                            placeholder="Search name or email..."
                                            value={memberSearchQuery}
                                            onChange={(e) => setMemberSearchQuery(e.target.value)}
                                            className="w-full bg-white pl-9 pr-4 py-2 rounded-lg border border-tan-light focus:border-tan outline-none transition-all text-sm text-charcoal font-sans"
                                        />
                                    </div>
                                </div>

                                {membersLoading ? (
                                    <div className="p-8 text-center text-charcoal/60 font-serif">Loading members...</div>
                                ) : members.length === 0 ? (
                                    <div className="p-12 text-center text-charcoal/50 font-sans">
                                        <UserMinus size={32} className="mx-auto mb-3 opacity-50" />
                                        <p>No members registered in the database yet.</p>
                                    </div>
                                ) : (() => {
                                    const filteredMembers = members.filter(m => 
                                        m.name.toLowerCase().includes(memberSearchQuery.toLowerCase()) ||
                                        m.email.toLowerCase().includes(memberSearchQuery.toLowerCase())
                                    );
                                    
                                    if (filteredMembers.length === 0) {
                                        return (
                                            <div className="p-8 text-center text-charcoal/50 font-sans">
                                                <p>No members match your search criteria.</p>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div className="divide-y divide-tan-light/30 font-sans">
                                            {filteredMembers.map(m => {
                                                const isExpired = m.expiresAt !== 'Never' && new Date(m.expiresAt) < new Date();
                                                const displayStatus = isExpired ? 'expired' : m.status;
                                                
                                                return (
                                                    <div key={m.id} className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-cream/20 transition-colors font-sans">
                                                        <div className="space-y-1 font-sans">
                                                            <div className="flex items-center gap-3">
                                                                <p className="font-semibold text-charcoal font-sans leading-none">{m.name}</p>
                                                                {displayStatus === 'active' ? (
                                                                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                                                        Active
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-xs font-bold uppercase tracking-wider text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                                                                        Expired
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-sm text-charcoal/60 font-sans">{m.email}</p>
                                                            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[11px] text-charcoal/40 font-medium font-sans">
                                                                <span>Joined: {new Date(m.joinedAt).toLocaleDateString()}</span>
                                                                <span>•</span>
                                                                <span className={displayStatus === 'expired' ? 'text-red-500 font-semibold' : ''}>
                                                                    Expires: {m.expiresAt === 'Never' ? 'Never (Lifetime)' : new Date(m.expiresAt).toLocaleDateString()}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="flex items-center gap-2 self-end sm:self-auto font-sans font-sans">
                                                            {m.expiresAt !== 'Never' && (
                                                                <button
                                                                    onClick={() => handleRenewMember(m)}
                                                                    className="px-3 py-1.5 bg-tan/10 text-tan hover:bg-tan hover:text-white rounded text-xs font-bold transition-all font-sans"
                                                                    title="Extend membership by 1 year"
                                                                >
                                                                    Renew 1yr
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => handleToggleMemberStatus(m)}
                                                                className={`px-3 py-1.5 border rounded text-xs font-bold transition-all ${
                                                                    displayStatus === 'active' 
                                                                        ? 'border-red-200 text-red-600 hover:bg-red-50 font-sans' 
                                                                        : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50 font-sans'
                                                                }`}
                                                            >
                                                                {displayStatus === 'active' ? 'Mark Expired' : 'Mark Active'}
                                                            </button>
                                                            <button 
                                                                onClick={() => handleDeleteMember(m.email)}
                                                                className="text-charcoal/40 hover:text-red-600 hover:bg-red-50 p-2 rounded transition-colors"
                                                                title="Revoke Membership"
                                                            >
                                                                <Trash2 size={18} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB CONTENT: Homepage Spotlight */}
            {activeTab === 'spotlight' && (
                <div className="bg-white rounded-2xl border border-tan-light/50 shadow-sm overflow-hidden animate-in fade-in duration-300">
                    <div className="p-6 bg-cream/30 border-b border-tan-light/50 flex items-center justify-between">
                         <h3 className="text-xl font-serif font-bold text-charcoal">Spotlight</h3>
                         <label className="flex items-center gap-3 cursor-pointer">
                            <span className="text-sm font-bold text-charcoal/60 uppercase tracking-widest font-sans">{spotlightEnabled ? 'Enabled' : 'Hidden'}</span>
                            <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${spotlightEnabled ? 'bg-tan' : 'bg-charcoal/20'}`}>
                                <input type="checkbox" className="sr-only" checked={spotlightEnabled} onChange={(e) => setSpotlightEnabled(e.target.checked)} />
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${spotlightEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                            </div>
                         </label>
                    </div>
                    
                    <form onSubmit={handleSaveSpotlight} className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-bold text-charcoal/60 uppercase tracking-widest mb-2 font-sans">Name</label>
                                <input type="text" value={spotlightName} onChange={(e) => setSpotlightName(e.target.value)} placeholder="e.g. Jane Doe" className="w-full bg-cream px-4 py-3 rounded-lg border border-transparent focus:bg-white focus:border-tan outline-none transition-all font-sans text-charcoal" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-charcoal/60 uppercase tracking-widest mb-2 font-sans">Title / Role</label>
                                <input type="text" value={spotlightRole} onChange={(e) => setSpotlightRole(e.target.value)} placeholder="e.g. Summer Archives Intern" className="w-full bg-cream px-4 py-3 rounded-lg border border-transparent focus:bg-white focus:border-tan outline-none transition-all font-sans text-charcoal" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-charcoal/60 uppercase tracking-widest mb-2 font-sans">LinkedIn URL (Optional)</label>
                                <input type="url" value={spotlightLinkedIn} onChange={(e) => setSpotlightLinkedIn(e.target.value)} placeholder="e.g. https://linkedin.com/in/username" className="w-full bg-cream px-4 py-3 rounded-lg border border-transparent focus:bg-white focus:border-tan outline-none transition-all font-sans text-charcoal" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-charcoal/60 uppercase tracking-widest mb-2 font-sans">Spotlight Biography</label>
                                <textarea value={spotlightBio} onChange={(e) => setSpotlightBio(e.target.value)} rows={4} placeholder="Describe their contributions to the archive..." className="w-full bg-cream px-4 py-3 rounded-lg border border-transparent focus:bg-white focus:border-tan outline-none transition-all font-sans text-charcoal resize-none"></textarea>
                            </div>
                        </div>
                        
                        <div className="flex flex-col h-full">
                            <div className="flex-grow space-y-6">
                                <div>
                                    <label className="block text-sm font-bold text-charcoal/60 uppercase tracking-widest mb-2 font-sans">Headshot Image</label>
                                    <div className="border-2 border-dashed border-tan-light/50 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:bg-cream/30 transition-colors relative group min-h-[200px]">
                                    {spotlightImageFile ? (
                                        <div className="text-charcoal flex flex-col items-center">
                                            <Check size={32} className="text-green-500 mb-2" />
                                            <span className="font-bold">{spotlightImageFile.name}</span>
                                            <span className="text-sm text-charcoal/60 font-sans">Ready to upload on save</span>
                                        </div>
                                    ) : spotlightImageUrl ? (
                                        <div className="flex flex-col items-center w-full font-sans">
                                            <img src={spotlightImageUrl} alt="Current Spotlight" className="w-32 h-32 object-cover rounded-full shadow-md mb-4 border-2 border-tan" />
                                            <span className="text-sm font-bold text-tan font-sans">Current Image Active</span>
                                            <span className="text-xs text-charcoal/40 mt-1 font-sans">Upload a new file below to replace this</span>
                                        </div>
                                    ) : (
                                        <div className="text-charcoal/40 flex flex-col items-center font-sans">
                                            <ImageIcon size={48} className="mb-3 opacity-50" />
                                            <span className="font-medium font-sans">No image uploaded</span>
                                        </div>
                                    )}
                                    
                                    <label className="mt-4 flex items-center justify-center gap-2 bg-white border border-tan text-tan px-4 py-2 rounded-lg font-bold cursor-pointer hover:bg-tan hover:text-white transition-all shadow-sm font-sans">
                                        <Upload size={16} />
                                        {spotlightImageUrl || spotlightImageFile ? 'Choose Different File' : 'Upload Image File'}
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                            if (e.target.files && e.target.files[0]) {
                                                setSpotlightImageFile(e.target.files[0]);
                                            }
                                        }} />
                                    </label>
                                </div>
                            </div>
                            </div>
                            
                            <div className="pt-6 mt-auto">
                                <button type="submit" disabled={isSavingSpotlight} className="w-full bg-tan text-white px-8 py-4 rounded-xl font-bold hover:bg-charcoal transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 font-sans">
                                    {isSavingSpotlight ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                                    {isSavingSpotlight ? 'Saving...' : 'Save Spotlight Configuration'}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
