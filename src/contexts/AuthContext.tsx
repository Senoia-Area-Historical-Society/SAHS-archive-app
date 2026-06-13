import { createContext, useContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, googleProvider, db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useLocation } from 'react-router-dom';
import type { Member } from '../types/database';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    loginWithGoogle: () => Promise<void>;
    logout: () => Promise<void>;
    isSAHSUser: boolean; // Effective role
    isAdmin: boolean;    // Effective role
    isCurator: boolean;  // Effective role
    realIsAdmin: boolean; // Actual database role
    realIsCurator: boolean; // Actual database role
    simulatedRole: 'admin' | 'curator' | 'member' | 'visitor' | null;
    setSimulatedRole: (role: 'admin' | 'curator' | 'member' | 'visitor' | null) => void;
    isEditingMode: boolean;
    setIsEditingMode: (value: boolean) => void;
    lastSearchPath: string;
    isMember: boolean;
    isExpiredMember: boolean; // Logged in but membership has lapsed
    memberData: Member | null;
    hasResearchAccess: boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isCurator, setIsCurator] = useState(false);
    const [isEditingMode, setIsEditingMode] = useState(false);
    const [lastSearchPath, setLastSearchPath] = useState('/archive');
    const [simulatedRole, setSimulatedRole] = useState<'admin' | 'curator' | 'member' | 'visitor' | null>(() => {
        return localStorage.getItem('sahs_simulated_role') as any || null;
    });
    const [isMember, setIsMember] = useState(false);
    const [isExpiredMember, setIsExpiredMember] = useState(false);
    const [memberData, setMemberData] = useState<Member | null>(null);

    const location = useLocation();

    const handleSetSimulatedRole = (role: 'admin' | 'curator' | 'member' | 'visitor' | null) => {
        if (!isAdmin) return; // Only real admins can simulate roles
        setSimulatedRole(role);
        if (role) {
            localStorage.setItem('sahs_simulated_role', role);
        } else {
            localStorage.removeItem('sahs_simulated_role');
        }
    };

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser && currentUser.email) {
                const email = currentUser.email.toLowerCase();
                if (email === 'catnolan@senoiahistory.com' || email === 'jeremywarren@senoiahistory.com') {
                    setIsAdmin(true);
                    setIsCurator(false);
                } else {
                    try {
                        const roleDoc = await getDoc(doc(db, 'user_roles', email));
                        if (roleDoc.exists()) {
                            const role = roleDoc.data().role;
                            if (role === 'admin') {
                                setIsAdmin(true);
                                setIsCurator(false);
                            } else if (role === 'curator') {
                                setIsAdmin(false);
                                setIsCurator(true);
                            } else {
                                setIsAdmin(false);
                                setIsCurator(false);
                            }
                        } else if (email.endsWith('@senoiahistory.com')) {
                            setIsAdmin(false);
                            setIsCurator(true);
                        } else {
                            setIsAdmin(false);
                            setIsCurator(false);
                        }
                    } catch {
                        if (email.endsWith('@senoiahistory.com')) {
                            setIsAdmin(false);
                            setIsCurator(true);
                        } else {
                            setIsAdmin(false);
                            setIsCurator(false);
                        }
                    }
                }

                // Verify member status — keep expired members logged in with data intact
                try {
                    const memberDoc = await getDoc(doc(db, 'members', email));
                    if (memberDoc.exists()) {
                        const mData = memberDoc.data() as Member;
                        const isExpired = mData.expiresAt !== 'Never' && new Date(mData.expiresAt) < new Date();
                        if (mData.status === 'active' && !isExpired) {
                            setIsMember(true);
                            setIsExpiredMember(false);
                            setMemberData(mData);
                        } else {
                            // Expired or manually set to inactive — allow login but block write features
                            setIsMember(false);
                            setIsExpiredMember(true);
                            setMemberData(mData); // Keep data so UI can show renewal details
                        }
                    } else {
                        setIsMember(false);
                        setIsExpiredMember(false);
                        setMemberData(null);
                    }
                } catch (memberErr) {
                    console.error('Error fetching member status:', memberErr);
                    setIsMember(false);
                    setIsExpiredMember(false);
                    setMemberData(null);
                }
            } else {
                setIsAdmin(false);
                setIsCurator(false);
                setIsMember(false);
                setIsExpiredMember(false);
                setMemberData(null);
            }
            setUser(currentUser);
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    // Track last search/browse path
    useEffect(() => {
        if (location.pathname === '/archive' || location.pathname === '/search') {
            setLastSearchPath(location.pathname + location.search);
        }
    }, [location]);

    const loginWithGoogle = async () => {
        try {
            googleProvider.setCustomParameters({ prompt: 'select_account' });

            const result = await signInWithPopup(auth, googleProvider);
            const userEmail = result.user.email;

            if (!userEmail) {
                await signOut(auth);
                throw new Error("No email associated with this Google account.");
            }

            const email = userEmail.toLowerCase();
            
            // 1. Allow hardcoded admins/curators
            if (email === 'catnolan@senoiahistory.com' || email === 'jeremywarren@senoiahistory.com' || email.endsWith('@senoiahistory.com')) {
                return;
            }

            // 2. Allow Firestore role accounts (permission-denied here is expected for plain members)
            try {
                const roleDoc = await getDoc(doc(db, 'user_roles', email));
                if (roleDoc.exists() && ['admin', 'curator'].includes(roleDoc.data().role)) {
                    return;
                }
            } catch {
                // Plain members can't read user_roles — fall through to member check
            }

            // 3. Allow members (active OR expired — expired members can log in but get a renewal prompt)
            const memberDoc = await getDoc(doc(db, 'members', email));
            if (memberDoc.exists()) {
                // Any record in members collection = allow login. Expiry is handled in the UI.
                return;
            }

            // Reject anyone with no record at all
            await signOut(auth);
            throw new Error("Unauthorized. Your account is not currently an active curator, administrator, or registered paying member.");
        } catch (error) {
            console.error("Auth error", error);
            throw error;
        }
    };

    const logout = async () => {
        await signOut(auth);
    };

    const effectiveIsAdmin = isAdmin && (!simulatedRole || simulatedRole === 'admin');
    const effectiveIsCurator = (isAdmin || isCurator) && (!simulatedRole || simulatedRole === 'admin' || simulatedRole === 'curator');
    const effectiveIsSAHSUser = effectiveIsAdmin || effectiveIsCurator;
    const effectiveIsMember = simulatedRole === 'member' || (isMember && !simulatedRole);
    const hasResearchAccess = effectiveIsSAHSUser || effectiveIsMember;

    return (
        <AuthContext.Provider value={{ 
            user, 
            loading, 
            loginWithGoogle, 
            logout, 
            isSAHSUser: effectiveIsSAHSUser, 
            isAdmin: effectiveIsAdmin, 
            isCurator: effectiveIsCurator,
            realIsAdmin: isAdmin,
            realIsCurator: isCurator,
            simulatedRole,
            setSimulatedRole: handleSetSimulatedRole,
            isEditingMode,
            setIsEditingMode,
            lastSearchPath,
            isMember,
            isExpiredMember,
            memberData,
            hasResearchAccess
        }}>
            {loading ? (
                <div className="min-h-screen bg-cream flex flex-col items-center justify-center gap-4">
                    <div className="w-12 h-12 border-4 border-tan/30 border-t-tan rounded-full animate-spin"></div>
                    <p className="font-serif text-charcoal/60 text-lg">Initializing SAHS Archive...</p>
                </div>
            ) : children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
