import { createContext, useContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, googleProvider, db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useLocation } from 'react-router-dom';

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
    simulatedRole: 'admin' | 'curator' | 'visitor' | null;
    setSimulatedRole: (role: 'admin' | 'curator' | 'visitor' | null) => void;
    isEditingMode: boolean;
    setIsEditingMode: (value: boolean) => void;
    lastSearchPath: string;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isCurator, setIsCurator] = useState(false);
    const [isEditingMode, setIsEditingMode] = useState(false);
    const [lastSearchPath, setLastSearchPath] = useState('/archive');
    const [simulatedRole, setSimulatedRole] = useState<'admin' | 'curator' | 'visitor' | null>(() => {
        return localStorage.getItem('sahs_simulated_role') as any || null;
    });

    const location = useLocation();

    const handleSetSimulatedRole = (role: 'admin' | 'curator' | 'visitor' | null) => {
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
                } else if (email.endsWith('@senoiahistory.com')) {
                    setIsAdmin(false);
                    setIsCurator(true);
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
                        } else {
                            setIsAdmin(false);
                            setIsCurator(false);
                        }
                    } catch (error) {
                        console.error('Error fetching user role:', error);
                        setIsAdmin(false);
                        setIsCurator(false);
                    }
                }
            } else {
                setIsAdmin(false);
                setIsCurator(false);
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
            // Optional: You can force prompt select_account to make it easier for users with multiple googles
            googleProvider.setCustomParameters({ prompt: 'select_account' });

            const result = await signInWithPopup(auth, googleProvider);
            const userEmail = result.user.email;

            if (!userEmail) {
                await signOut(auth);
                throw new Error("No email associated with this Google account.");
            }

            const email = userEmail.toLowerCase();
            
            // Check for hardcoded admins and domain-wide curators
            if (email === 'catnolan@senoiahistory.com' || email === 'jeremywarren@senoiahistory.com' || email.endsWith('@senoiahistory.com')) {
                return;
            }

            // Check Firestore for roles (for other domains or specific overrides)
            const roleDoc = await getDoc(doc(db, 'user_roles', email));
            if (!roleDoc.exists() || !['admin', 'curator'].includes(roleDoc.data().role)) {
                // If not valid, immediately sign them out
                await signOut(auth);
                throw new Error("Unauthorized. Your account does not have curator or admin privileges.");
            }
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
            lastSearchPath
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
