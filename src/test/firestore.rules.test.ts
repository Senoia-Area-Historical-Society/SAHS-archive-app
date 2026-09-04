/**
 * Security-rules tests — the first automated tests in this repository.
 *
 * Why they exist: every high-severity finding in the 2026-09-04 audit was an
 * authorization defect in `firestore.rules`, and nothing in this repo could fail
 * when a rule was wrong. `npm run build` and `npm run lint` both pass happily
 * against a rule that hands the member roster to anyone with a Google account.
 *
 * These run against the Firestore emulator:
 *
 *     npm run test:rules
 *
 * which wraps `firebase emulators:exec --only firestore`. Seeding goes through
 * `withSecurityRulesDisabled` so fixtures are not themselves subject to the rules
 * under test.
 */

import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    initializeTestEnvironment,
    assertFails,
    assertSucceeds,
    type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

/** A signed-in account with no role and no membership — e.g. a personal Gmail. */
const stranger = () => testEnv.authenticatedContext('stranger', { email: 'stranger@example.com' });
/** An active member, the identity that shares research folders. */
const member = () => testEnv.authenticatedContext('member', { email: 'member@example.com' });
/** A curator granted by role claim, with no SAHS email address. */
const curator = () => testEnv.authenticatedContext('curator', { email: 'curator@example.com', role: 'curator' });
/** A Workspace account, which isSAHSUser() accepts on the domain alone. */
const staff = () => testEnv.authenticatedContext('staff', { email: 'staff@senoiahistory.com' });

beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: 'sahs-archives-rules-test',
        firestore: {
            rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
            host: '127.0.0.1',
            port: 8080,
        },
    });
});

afterAll(async () => { await testEnv?.cleanup(); });

beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        // Setup is complete in production; the bootstrap-clause tests below
        // deliberately clear these to model a fresh project.
        await setDoc(doc(db, 'site_settings', 'setup'), { isComplete: true });
        await setDoc(doc(db, 'site_settings', 'appearance'), { theme: 'default' });

        await setDoc(doc(db, 'members', 'member@example.com'), {
            status: 'active', expiresAt: 'Never', name: 'A Member',
        });
        await setDoc(doc(db, 'members', 'other@example.com'), {
            status: 'active', expiresAt: 'Never', name: 'Another Member',
        });
        await setDoc(doc(db, 'user_roles', 'curator@example.com'), { role: 'curator' });
    });
});

/**
 * The finding: documents are keyed by email, and `get` was `request.auth != null`.
 * `list` was restricted, which disguised it — the collection could not be
 * enumerated, but every record was directly addressable by guessing an address.
 */
describe('members — membership must not be an oracle', () => {
    it('refuses a signed-in stranger reading someone else\'s membership', async () => {
        const db = stranger().firestore();
        await assertFails(getDoc(doc(db, 'members', 'other@example.com')));
    });

    it('refuses an anonymous read', async () => {
        const db = testEnv.unauthenticatedContext().firestore();
        await assertFails(getDoc(doc(db, 'members', 'other@example.com')));
    });

    it('lets a member read their own record', async () => {
        const db = member().firestore();
        await assertSucceeds(getDoc(doc(db, 'members', 'member@example.com')));
    });

    it('lets staff read any record', async () => {
        const db = staff().firestore();
        await assertSucceeds(getDoc(doc(db, 'members', 'other@example.com')));
    });

    /**
     * Regression guard for the folder-sharing flow. `MyResearch.tsx:457` reads the
     * share target's member document to confirm they are an active member before
     * adding them as a collaborator. Tightening this rule to self-only would have
     * broken sharing silently — the read is inside a `catch` that only warns.
     */
    it('lets an active member read another member, which folder sharing depends on', async () => {
        const db = member().firestore();
        await assertSucceeds(getDoc(doc(db, 'members', 'other@example.com')));
    });

    it('still refuses a stranger writing a membership', async () => {
        const db = stranger().firestore();
        await assertFails(setDoc(doc(db, 'members', 'stranger@example.com'), { status: 'active' }));
    });
});

describe('user_roles — who holds admin is not public', () => {
    it('refuses a signed-in stranger reading someone else\'s role', async () => {
        const db = stranger().firestore();
        await assertFails(getDoc(doc(db, 'user_roles', 'curator@example.com')));
    });

    it('lets a user read their own role document', async () => {
        const db = curator().firestore();
        await assertSucceeds(getDoc(doc(db, 'user_roles', 'curator@example.com')));
    });

    /** The other half of the share-target check, at MyResearch.tsx ~445. */
    it('lets an active member read a role document, which folder sharing depends on', async () => {
        const db = member().firestore();
        await assertSucceeds(getDoc(doc(db, 'user_roles', 'curator@example.com')));
    });
});

/**
 * The finding: while isSetupComplete() is false, the bootstrap clause was
 * reachable by ANY authenticated account, so anyone with a Google account could
 * write user_roles/{their own address} = admin and take over the archive. The
 * whole boundary was the existence of two site_settings documents.
 */
describe('user_roles bootstrap — self-granting admin during first-run setup', () => {
    const clearSetup = () => testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, 'site_settings', 'setup'), { isComplete: false });
        // isSetupComplete() is an OR — the appearance document alone satisfies it,
        // so a test that only flips isComplete would prove nothing.
        await import('firebase/firestore').then(({ deleteDoc }) =>
            deleteDoc(doc(db, 'site_settings', 'appearance')));
    });

    it('refuses a stranger self-granting admin even when setup is incomplete', async () => {
        await clearSetup();
        const db = stranger().firestore();
        await assertFails(setDoc(doc(db, 'user_roles', 'stranger@example.com'), { role: 'admin' }));
    });

    it('still lets a SAHS account bootstrap the first admin', async () => {
        await clearSetup();
        const db = staff().firestore();
        await assertSucceeds(setDoc(doc(db, 'user_roles', 'staff@senoiahistory.com'), { role: 'admin' }));
    });

    it('refuses even a SAHS account once setup is complete', async () => {
        // Fixtures already mark setup complete; only the permanent admins may write.
        const db = staff().firestore();
        await assertFails(setDoc(doc(db, 'user_roles', 'staff@senoiahistory.com'), { role: 'admin' }));
    });

    it('refuses a stranger granting themselves admin on someone else\'s document', async () => {
        await clearSetup();
        const db = stranger().firestore();
        await assertFails(setDoc(doc(db, 'user_roles', 'catnolan@senoiahistory.com'), { role: 'admin' }));
    });
});

describe('site_settings — the documents that define isSetupComplete()', () => {
    it('refuses a stranger writing settings when setup is incomplete', async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            const { deleteDoc } = await import('firebase/firestore');
            await deleteDoc(doc(ctx.firestore(), 'site_settings', 'setup'));
            await deleteDoc(doc(ctx.firestore(), 'site_settings', 'appearance'));
        });
        const db = stranger().firestore();
        await assertFails(setDoc(doc(db, 'site_settings', 'appearance'), { theme: 'hacked' }));
    });

    it('lets staff write settings normally', async () => {
        const db = staff().firestore();
        await assertSucceeds(setDoc(doc(db, 'site_settings', 'appearance'), { theme: 'default' }));
    });
});
