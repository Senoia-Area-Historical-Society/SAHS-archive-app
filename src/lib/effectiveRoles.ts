/**
 * Turns a user's real roles plus a requested simulation into the roles the UI
 * should actually act on.
 *
 * Extracted from `AuthContext` so it can be tested: this is the one place where a
 * value the visitor controls (`localStorage['sahs_simulated_role']`) meets the
 * flags that decide what the app shows.
 *
 * ── The bug this fixes ───────────────────────────────────────────────────────
 *
 * `handleSetSimulatedRole` already refuses for anyone who is not a real admin
 * ("Only real admins can simulate roles"), but that is not the only way the value
 * arrives: `storedSimulatedRole()` seeds React state directly from localStorage on
 * mount, which bypasses the setter entirely. The derivation then read:
 *
 *     const effectiveIsMember = simulatedRole === 'member' || (isMember && !simulatedRole);
 *
 * The first clause has no reference to any real role, so **any** signed-in
 * account could set that key to `'member'` and get `isMember`, and with it
 * `hasResearchAccess`. The admin and curator lines were written correctly — both
 * begin with the real flag — so this was one line out of three, which is exactly
 * how it survived review.
 *
 * Firestore rules were never fooled: research folders, notes and personal pins all
 * require `isActiveMember()` server-side, so the practical effect was a non-member
 * unlocking the research UI and then having every action fail with a raw
 * permission error. A confusing break rather than a breach — but the UI should not
 * be deciding access from an unauthenticated string either way.
 *
 * The fix is to gate the simulation itself rather than to patch the member line:
 * a simulation is honoured only for an account that may simulate, so an
 * unauthorised value is ignored everywhere at once instead of in each consumer.
 *
 * A note on the neighbouring comment in AuthContext, which says validating the
 * stored string is "correctness rather than a hole being closed": that was right
 * about the *shape* of the value and incomplete about its *authority*. Checking
 * that localStorage holds a real role name does not establish that this user may
 * assume it.
 */

/** The roles an admin can preview the site as. */
export type SimulatedRole = 'admin' | 'curator' | 'member' | 'visitor';

/** What the user actually is, before any simulation is applied. */
export interface RealRoles {
    isAdmin: boolean;
    isCurator: boolean;
    isMember: boolean;
}

export interface EffectiveRoles {
    /** The simulation actually in force — null when the user may not simulate. */
    simulatedRole: SimulatedRole | null;
    isAdmin: boolean;
    isCurator: boolean;
    isSAHSUser: boolean;
    isMember: boolean;
    hasResearchAccess: boolean;
}

export function deriveEffectiveRoles(
    real: RealRoles,
    requestedSimulation: SimulatedRole | null
): EffectiveRoles {
    // Only a real admin may simulate — the same rule `handleSetSimulatedRole`
    // applies, enforced here too so it also covers the localStorage-seeded path.
    // Everyone else's stored value is ignored entirely, which additionally stops a
    // stale key from *removing* a curator's access, as it used to.
    const simulatedRole = real.isAdmin ? requestedSimulation : null;

    const isAdmin = real.isAdmin && (!simulatedRole || simulatedRole === 'admin');
    const isCurator =
        (real.isAdmin || real.isCurator) &&
        (!simulatedRole || simulatedRole === 'admin' || simulatedRole === 'curator');
    const isSAHSUser = isAdmin || isCurator;

    // While simulating, membership is whatever the simulation says — 'visitor' and
    // the staff roles all mean "not a member". Otherwise it is the real thing.
    const isMember = simulatedRole ? simulatedRole === 'member' : real.isMember;

    return {
        simulatedRole,
        isAdmin,
        isCurator,
        isSAHSUser,
        isMember,
        hasResearchAccess: isSAHSUser || isMember,
    };
}
