/* eslint-disable react-refresh/only-export-components --
 * Same reasoning as AppearanceContext: provider plus its own hook is the
 * standard React shape, this rule is Fast Refresh only, and useAuth is imported
 * by 32 files. See the fuller note there.
 */
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, googleProvider, db, functions } from '../lib/firebase';
import { doc, getDoc, onSnapshot, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useLocation } from 'react-router-dom';
import { useAppearance } from './AppearanceContext';
import type { Member } from '../types/database';

/**
 * A curator/admin role granted in Admin Settings only reaches Storage Rules
 * once it's mirrored onto this user's Auth token as a custom claim — Storage
 * Rules can't read the user_roles Firestore doc directly. The Firestore
 * trigger in functions/userRoles.js sets that claim as soon as the role is
 * written, but for a role granted before this person's first-ever sign-in
 * there's no Auth account yet for it to attach to. This call closes that gap:
 * it re-checks user_roles for the current user and force-refreshes the ID
 * token if the claim just changed, so upload permissions work immediately
 * rather than after a sign-out/sign-in.
 */
async function syncRoleClaim(user: User) {
    try {
        const syncMyRoleClaim = httpsCallable<void, { updated: boolean }>(functions, 'syncMyRoleClaim');
        const { data } = await syncMyRoleClaim();
        if (data.updated) {
            await user.getIdToken(true);
        }
    } catch (err) {
        console.error('Failed to sync role claim:', err);
    }
}

/** The roles an admin can preview the site as. */
export type SimulatedRole = 'admin' | 'curator' | 'member' | 'visitor';

const SIMULATED_ROLES: readonly SimulatedRole[] = ['admin', 'curator', 'member', 'visitor'];

/**
 * Reads the simulated role back out of localStorage.
 *
 * This value crosses a trust boundary: localStorage is the browser owner's to
 * edit, so anything at all can be in that key. The previous `as any` asserted it
 * into the union without looking, which is what a cast does — it states a fact
 * rather than checking one. Everything downstream then treated an arbitrary
 * string as a role.
 *
 * Firestore rules are still the real gate and always were, so this is
 * correctness rather than a hole being closed. Unrecognised values now fall back
 * to no simulation instead of propagating.
 */
function storedSimulatedRole(): SimulatedRole | null {
    const stored = localStorage.getItem('sahs_simulated_role');
    return SIMULATED_ROLES.find((role) => role === stored) ?? null;
}

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
    simulatedRole: SimulatedRole | null;
    setSimulatedRole: (role: SimulatedRole | null) => void;
    isEditingMode: boolean;
    setIsEditingMode: (value: boolean) => void;
    lastSearchPath: string;
    isMember: boolean;
    isExpiredMember: boolean; // Logged in but membership has lapsed
    memberData: Member | null;
    hasResearchAccess: boolean;
    isSetupComplete: boolean;
    isMemberWizardOpen: boolean;
    openMemberWizard: () => void;
    closeMemberWizard: () => void;
    updateMemberData: (updated: Partial<Member>) => void;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isCurator, setIsCurator] = useState(false);
    const [isEditingMode, setIsEditingMode] = useState(false);
    const [lastSearchPath, setLastSearchPath] = useState('/archive');
    const [simulatedRole, setSimulatedRole] = useState<SimulatedRole | null>(storedSimulatedRole);
    const [isMember, setIsMember] = useState(false);
    const [isExpiredMember, setIsExpiredMember] = useState(false);
    const [memberData, setMemberData] = useState<Member | null>(null);
    const [isSetupComplete, setIsSetupComplete] = useState(true); // Default true to prevent flash
    const [isMemberWizardOpen, setIsMemberWizardOpen] = useState(false);
    // Tracks which uid syncRoleClaim has already run for, so it fires once per
    // sign-in rather than on every hourly token refresh onAuthStateChanged also reports.
    const roleClaimSyncedUid = useRef<string | null>(null);

    const openMemberWizard = () => setIsMemberWizardOpen(true);
    const closeMemberWizard = () => setIsMemberWizardOpen(false);

    const updateMemberData = (updated: Partial<Member>) => {
        setMemberData(prev => prev ? { ...prev, ...updated } : null);
    };

    const location = useLocation();

    const handleSetSimulatedRole = (role: SimulatedRole | null) => {
        if (!isAdmin) return; // Only real admins can simulate roles
        setSimulatedRole(role);
        if (role) {
            localStorage.setItem('sahs_simulated_role', role);
        } else {
            localStorage.removeItem('sahs_simulated_role');
        }
    };

    useEffect(() => {
        if (typeof window !== 'undefined' && window.location.search.includes('simulate=true')) {
            setIsSetupComplete(true);
            return;
        }
        const unsubSetup = onSnapshot(doc(db, 'site_settings', 'setup'), async (snapshot) => {
            if (snapshot.exists()) {
                setIsSetupComplete(snapshot.data().isComplete === true);
            } else {
                // Production Safety Net: if setup doc doesn't exist, check if appearance settings exist
                try {
                    const appSnap = await getDoc(doc(db, 'site_settings', 'appearance'));
                    if (appSnap.exists()) {
                        // Auto-create the setup document to mark it complete
                        await setDoc(doc(db, 'site_settings', 'setup'), {
                            isComplete: true,
                            completedAt: new Date().toISOString(),
                            autoMigrated: true
                        });
                        setIsSetupComplete(true);
                    } else {
                        setIsSetupComplete(false);
                    }
                } catch (e) {
                    console.error("Setup validation failed, defaulting to complete for safety:", e);
                    setIsSetupComplete(true); // Default to true on error to avoid locking out production
                }
            }
        });
        return () => unsubSetup();
    }, []);

    useEffect(() => {
        if (typeof window !== 'undefined' && window.location.search.includes('simulate=true')) {
            console.log("🛠️ Auth simulation bypass activated!");
            // A stand-in for a Firebase User carrying only the three fields the
            // app reads. `as unknown as User` rather than `as any` because it is
            // the same assertion either way and this spelling says so: the object
            // genuinely is not a User, and the double step is what TypeScript
            // makes you write when you know that.
            setUser({
                uid: 'mock_simulation_user_id',
                email: 'curator@senoiahistory.com',
                displayName: 'Mock Simulation Curator',
            } as unknown as User);
            setIsAdmin(true);
            setIsCurator(false);
            setIsSetupComplete(true);
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (typeof window !== 'undefined' && window.location.search.includes('simulate=true')) {
            return;
        }
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser && currentUser.email) {
                if (roleClaimSyncedUid.current !== currentUser.uid) {
                    roleClaimSyncedUid.current = currentUser.uid;
                    syncRoleClaim(currentUser);
                }

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

                // Verify member status — check primary email, then secondary email
                try {
                    let mData: Member | null = null;
                    const memberDoc = await getDoc(doc(db, 'members', email));
                    if (memberDoc.exists()) {
                        mData = { id: memberDoc.id, ...memberDoc.data() } as Member;
                    } else {
                        // Secondary email query
                        const secondaryQuery = query(collection(db, 'members'), where('secondaryEmail', '==', email));
                        const secondarySnap = await getDocs(secondaryQuery);
                        if (!secondarySnap.empty) {
                            const matchDoc = secondarySnap.docs[0];
                            mData = { id: matchDoc.id, ...matchDoc.data() } as Member;
                        }
                    }

                    if (mData) {
                        const isExpired = mData.expiresAt !== 'Never' && new Date(mData.expiresAt) < new Date();
                        if (mData.status === 'active' && !isExpired) {
                            setIsMember(true);
                            setIsExpiredMember(false);
                            setMemberData(mData);
                            // Auto-trigger Member Setup Wizard if not completed
                            if (mData.hasCompletedMemberWizard !== true) {
                                setTimeout(() => setIsMemberWizardOpen(true), 500);
                            }
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

    const value = {
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
        hasResearchAccess,
        isSetupComplete,
        isMemberWizardOpen,
        openMemberWizard,
        closeMemberWizard,
        updateMemberData
    };

    const { settings } = useAppearance();
    const shortName = settings?.museumShortName || 'Museum';

    return (
        <AuthContext.Provider value={value}>
            {loading ? (
                <div className="min-h-screen bg-cream flex flex-col items-center justify-center gap-4">
                    <div className="w-12 h-12 border-4 border-tan/30 border-t-tan rounded-full animate-spin"></div>
                    <p className="font-serif text-charcoal/60 text-lg">Initializing {shortName} Archive...</p>
                </div>
            ) : children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
