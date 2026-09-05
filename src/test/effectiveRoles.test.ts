import { describe, it, expect } from 'vitest';
import { deriveEffectiveRoles, type SimulatedRole } from '../lib/effectiveRoles';

/**
 * The bug these guard: `effectiveIsMember` was
 * `simulatedRole === 'member' || (isMember && !simulatedRole)`. The first clause
 * referenced no real role, so any signed-in account could set
 * `localStorage['sahs_simulated_role'] = 'member'` and get `hasResearchAccess`.
 * The admin and curator lines beside it were written correctly, which is how one
 * wrong line out of three survived review.
 */

const stranger = { isAdmin: false, isCurator: false, isMember: false };
const realMember = { isAdmin: false, isCurator: false, isMember: true };
const realCurator = { isAdmin: false, isCurator: true, isMember: false };
const realAdmin = { isAdmin: true, isCurator: false, isMember: false };

describe('a simulation is only honoured for someone who may simulate', () => {
    it('ignores a stranger claiming to be a member', () => {
        const e = deriveEffectiveRoles(stranger, 'member');
        expect(e.isMember).toBe(false);
        expect(e.hasResearchAccess).toBe(false);
        expect(e.simulatedRole).toBeNull();
    });

    it('ignores a stranger claiming to be an admin', () => {
        const e = deriveEffectiveRoles(stranger, 'admin');
        expect(e.isAdmin).toBe(false);
        expect(e.isCurator).toBe(false);
        expect(e.isSAHSUser).toBe(false);
    });

    it('ignores a real member claiming to be an admin', () => {
        const e = deriveEffectiveRoles(realMember, 'admin');
        expect(e.isAdmin).toBe(false);
        expect(e.isSAHSUser).toBe(false);
        // Their genuine membership survives — the stray value is ignored, not punitive.
        expect(e.isMember).toBe(true);
    });

    /**
     * Regression: the old derivation would strip a curator's access when a stray
     * 'member' value was present, because the curator line required the
     * simulation to be admin/curator/absent. Ignoring unauthorised simulations
     * fixes that direction too.
     */
    it('does not let a stray value remove a real curator\'s access', () => {
        const e = deriveEffectiveRoles(realCurator, 'member');
        expect(e.isCurator).toBe(true);
        expect(e.isSAHSUser).toBe(true);
    });
});

describe('an admin previewing the site', () => {
    it('sees the archive as a member', () => {
        const e = deriveEffectiveRoles(realAdmin, 'member');
        expect(e.isAdmin).toBe(false);
        expect(e.isCurator).toBe(false);
        expect(e.isSAHSUser).toBe(false);
        expect(e.isMember).toBe(true);
        expect(e.hasResearchAccess).toBe(true);
    });

    it('sees the archive as a curator', () => {
        const e = deriveEffectiveRoles(realAdmin, 'curator');
        expect(e.isAdmin).toBe(false);
        expect(e.isCurator).toBe(true);
        expect(e.isMember).toBe(false);
    });

    it('sees the archive as a signed-out visitor', () => {
        const e = deriveEffectiveRoles(realAdmin, 'visitor');
        expect(e.isAdmin).toBe(false);
        expect(e.isCurator).toBe(false);
        expect(e.isMember).toBe(false);
        expect(e.hasResearchAccess).toBe(false);
    });

    it('keeps full access when simulating admin, or not simulating at all', () => {
        expect(deriveEffectiveRoles(realAdmin, 'admin').isAdmin).toBe(true);
        expect(deriveEffectiveRoles(realAdmin, null).isAdmin).toBe(true);
        expect(deriveEffectiveRoles(realAdmin, null).isSAHSUser).toBe(true);
    });
});

describe('no simulation in force', () => {
    it('passes the real roles through', () => {
        expect(deriveEffectiveRoles(realMember, null).isMember).toBe(true);
        expect(deriveEffectiveRoles(realMember, null).hasResearchAccess).toBe(true);
        expect(deriveEffectiveRoles(realCurator, null).isSAHSUser).toBe(true);
        expect(deriveEffectiveRoles(stranger, null).hasResearchAccess).toBe(false);
    });

    it('reports no simulation for a non-admin whatever was requested', () => {
        const roles: SimulatedRole[] = ['admin', 'curator', 'member', 'visitor'];
        for (const role of roles) {
            expect(deriveEffectiveRoles(stranger, role).simulatedRole).toBeNull();
        }
    });
});
