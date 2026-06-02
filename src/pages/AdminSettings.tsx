import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Settings, Shield, UserPlus, Trash2, Mail, Loader2, UserMinus, Star, Upload, Image as ImageIcon, Save, Check } from 'lucide-react';
import { db, storage } from '../lib/firebase';
import { collection, getDocs, doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

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

    useEffect(() => {
        if (!realIsAdmin) return;
        fetchRoles();
        fetchSpotlightSettings();
    }, [realIsAdmin]);

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
            <div className="flex justify-between items-end mb-8 border-b border-tan-light/50 pb-6 pr-4">
                <div>
                    <h1 className="text-4xl font-serif font-bold mb-3 text-charcoal tracking-tight flex items-center gap-3">
                        <Settings className="text-tan" size={32} />
                        Admin Settings
                    </h1>
                    <p className="text-charcoal/70 text-lg max-w-2xl">
                        Manage privileged users and access control rules.
                    </p>
                </div>
            </div>

            {/* Role Simulation Section */}
            <div className="mb-10 bg-tan/5 border border-tan-light/50 rounded-2xl p-6 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <h2 className="text-xl font-serif font-bold text-charcoal mb-2 flex items-center gap-2">
                            <Shield className="text-tan" size={24} />
                            Role Simulation
                        </h2>
                        <p className="text-charcoal/70 text-sm max-w-xl">
                            Preview the website as a different user level. This only affects your current browser session and does not change your actual database permissions.
                        </p>
                    </div>
                    
                    <div className="flex items-center gap-2 p-1 bg-cream rounded-xl border border-tan-light/30 self-start md:self-auto">
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
                            onClick={() => setSimulatedRole('visitor')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${simulatedRole === 'visitor' ? 'bg-white text-tan shadow-sm' : 'text-charcoal/60 hover:text-charcoal'}`}
                        >
                            Visitor
                        </button>
                    </div>
                </div>
                {simulatedRole && (
                    <div className="mt-4 px-4 py-2 bg-tan/10 rounded-lg inline-flex items-center gap-2 text-tan text-xs font-bold uppercase tracking-wider">
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
                                className="w-full bg-tan text-white px-5 py-3 rounded-lg font-medium hover:bg-charcoal transition-colors hover:scale-[1.02] active:scale-[0.98] mt-2 flex items-center justify-center"
                            >
                                {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : 'Assign Role'}
                            </button>
                        </form>
                    </div>
                </div>

                {/* List of current Users */}
                <div className="lg:col-span-2 space-y-4">
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

            {/* Homepage Content Settings */}
            <div className="mt-12 mb-8 border-t border-tan-light/50 pt-12">
                <div className="mb-8">
                    <h2 className="text-3xl font-serif font-bold text-charcoal flex items-center gap-3">
                        <Star className="text-tan" size={28} />
                        Homepage Content
                    </h2>
                    <p className="text-charcoal/70 max-w-2xl mt-2">Manage the dynamic content areas displayed on the public landing page.</p>
                </div>

                <div className="bg-white rounded-2xl border border-tan-light/50 shadow-sm overflow-hidden">
                    <div className="p-6 bg-cream/30 border-b border-tan-light/50 flex items-center justify-between">
                         <h3 className="text-xl font-serif font-bold text-charcoal">Spotlight</h3>
                         <label className="flex items-center gap-3 cursor-pointer">
                            <span className="text-sm font-bold text-charcoal/60 uppercase tracking-widest">{spotlightEnabled ? 'Enabled' : 'Hidden'}</span>
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
                                            <span className="text-sm text-charcoal/60">Ready to upload on save</span>
                                        </div>
                                    ) : spotlightImageUrl ? (
                                        <div className="flex flex-col items-center w-full">
                                            <img src={spotlightImageUrl} alt="Current Spotlight" className="w-32 h-32 object-cover rounded-full shadow-md mb-4 border-2 border-tan" />
                                            <span className="text-sm font-bold text-tan">Current Image Active</span>
                                            <span className="text-xs text-charcoal/40 mt-1">Upload a new file below to replace this</span>
                                        </div>
                                    ) : (
                                        <div className="text-charcoal/40 flex flex-col items-center">
                                            <ImageIcon size={48} className="mb-3 opacity-50" />
                                            <span className="font-medium">No image uploaded</span>
                                        </div>
                                    )}
                                    
                                    <label className="mt-4 flex items-center justify-center gap-2 bg-white border border-tan text-tan px-4 py-2 rounded-lg font-bold cursor-pointer hover:bg-tan hover:text-white transition-all shadow-sm">
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
                                <button type="submit" disabled={isSavingSpotlight} className="w-full bg-tan text-white px-8 py-4 rounded-xl font-bold hover:bg-charcoal transition-all shadow-md active:scale-95 flex items-center justify-center gap-2">
                                    {isSavingSpotlight ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                                    {isSavingSpotlight ? 'Saving...' : 'Save Spotlight Configuration'}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
