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
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

/** A signed-in account with no role and no membership — e.g. a personal Gmail. */
const stranger = () => testEnv.authenticatedContext('stranger', { email: 'stranger@example.com' });
/** An active member, the identity that shares research folders. */
const member = () => testEnv.authenticatedContext('member', { email: 'member@example.com' });
/** A curator granted by role claim, with no SAHS email address. */
const curator = () => testEnv.authenticatedContext('curator', { email: 'curator@example.com', role: 'curator' });
/**
 * A Workspace account holding a role, via the claim userRoles.js mirrors onto the
 * token. This is what staff access looks like now that the bare-domain grant is
 * gone — the address alone no longer admits anyone.
 */
const staff = () => testEnv.authenticatedContext('staff', { email: 'staff@senoiahistory.com', role: 'admin' });

/** A Workspace address with no role and no claim — admitted until this change. */
const domainOnly = () => testEnv.authenticatedContext('domainonly', { email: 'newvolunteer@senoiahistory.com' });

/** One of the two hardcoded permanent admins, who hold no role document. */
const permanentAdmin = () => testEnv.authenticatedContext('perm', { email: 'jeremywarren@senoiahistory.com' });

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

/**
 * `accession_paperwork_urls` was a field on the world-readable archive_items
 * document, publishing the storage paths of donor and provenance scans. It moves
 * to a subcollection so the rules can gate it — the parent stays public because
 * the public archive is public.
 */
describe('archive_items/{id}/provenance — accession paperwork is staff-only', () => {
    beforeEach(async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            const db = ctx.firestore();
            await setDoc(doc(db, 'archive_items', 'item1'), { title: 'A Photograph', is_private: false });
            await setDoc(doc(db, 'archive_items', 'item1', 'provenance', 'paperwork'), {
                accession_paperwork_urls: ['accession_paperwork/deed.pdf'],
            });
        });
    });

    it('refuses an anonymous read of the paperwork', async () => {
        const db = testEnv.unauthenticatedContext().firestore();
        await assertFails(getDoc(doc(db, 'archive_items', 'item1', 'provenance', 'paperwork')));
    });

    it('refuses a signed-in stranger', async () => {
        const db = stranger().firestore();
        await assertFails(getDoc(doc(db, 'archive_items', 'item1', 'provenance', 'paperwork')));
    });

    // An active member has research access, but provenance paperwork is not part
    // of it — this is the one place members are deliberately outside the line.
    it('refuses an active member', async () => {
        const db = member().firestore();
        await assertFails(getDoc(doc(db, 'archive_items', 'item1', 'provenance', 'paperwork')));
    });

    it('lets staff read and write it', async () => {
        const db = staff().firestore();
        await assertSucceeds(getDoc(doc(db, 'archive_items', 'item1', 'provenance', 'paperwork')));
        await assertSucceeds(setDoc(doc(db, 'archive_items', 'item1', 'provenance', 'paperwork'), {
            accession_paperwork_urls: ['accession_paperwork/deed.pdf', 'accession_paperwork/letter.pdf'],
        }));
    });

    it('lets a role-granted curator read it', async () => {
        const db = curator().firestore();
        await assertSucceeds(getDoc(doc(db, 'archive_items', 'item1', 'provenance', 'paperwork')));
    });

    // The parent item stays publicly readable — this is a public archive, and
    // narrowing that is a separate change gated on the is_private backfill.
    it('leaves the parent item publicly readable', async () => {
        const db = testEnv.unauthenticatedContext().firestore();
        await assertSucceeds(getDoc(doc(db, 'archive_items', 'item1')));
    });
});

/**
 * The rule these exercise closes the last of audit finding C2: privacy was
 * enforced only in the browser, so anyone querying Firestore directly read
 * private items. The list-query cases matter most — a public query that does not
 * constrain is_private is now REJECTED, and because the pages catch that, a
 * missed query would render as an empty archive rather than an error.
 */
describe('archive_items — private items are not public', () => {
    beforeEach(async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            const db = ctx.firestore();
            await setDoc(doc(db, 'archive_items', 'public1'), { title: 'A Public Photo', is_private: false });
            await setDoc(doc(db, 'archive_items', 'private1'), { title: 'A Private Deed', is_private: true });
            // Pre-backfill shape. Denied to the public: the rule reads the field
            // directly, which is what makes Firestore enforce the query filter, and
            // the price is that a document without the field fails closed. No such
            // document exists in production after the backfill.
            await setDoc(doc(db, 'archive_items', 'legacy1'), { title: 'No Flag At All' });
            await setDoc(doc(db, 'collections', 'pubcol'), { title: 'Public Collection', is_private: false });
            await setDoc(doc(db, 'collections', 'privcol'), { title: 'Private Collection', is_private: true });
        });
    });

    it('lets anyone read a public item', async () => {
        const db = testEnv.unauthenticatedContext().firestore();
        await assertSucceeds(getDoc(doc(db, 'archive_items', 'public1')));
    });

    it('refuses an anonymous read of a private item', async () => {
        const db = testEnv.unauthenticatedContext().firestore();
        await assertFails(getDoc(doc(db, 'archive_items', 'private1')));
    });

    it('refuses a signed-in stranger too', async () => {
        const db = stranger().firestore();
        await assertFails(getDoc(doc(db, 'archive_items', 'private1')));
    });

    it('lets staff read a private item', async () => {
        const db = staff().firestore();
        await assertSucceeds(getDoc(doc(db, 'archive_items', 'private1')));
    });

    // Fails closed, and staff still reach it. See the rule's comment for why a
    // direct field read (rather than a lenient `.get()` default) is required.
    it('denies the public an item with no is_private field, but not staff', async () => {
        await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'archive_items', 'legacy1')));
        await assertSucceeds(getDoc(doc(staff().firestore(), 'archive_items', 'legacy1')));
    });

    /**
     * The two that guard the archive itself. An unfiltered list is refused, and
     * the filter publicOnly() adds is what makes it pass — if these ever invert,
     * every browse page goes blank.
     */
    it('refuses an unfiltered list query from the public', async () => {
        const db = testEnv.unauthenticatedContext().firestore();
        await assertFails(getDocs(collection(db, 'archive_items')));
    });

    it('allows the list query publicOnly() builds', async () => {
        const db = testEnv.unauthenticatedContext().firestore();
        await assertSucceeds(getDocs(query(collection(db, 'archive_items'), where('is_private', '==', false))));
    });

    it('lets staff list everything unfiltered', async () => {
        const db = staff().firestore();
        await assertSucceeds(getDocs(collection(db, 'archive_items')));
    });

    it('applies the same rule to collections', async () => {
        const anon = testEnv.unauthenticatedContext().firestore();
        await assertSucceeds(getDoc(doc(anon, 'collections', 'pubcol')));
        await assertFails(getDoc(doc(anon, 'collections', 'privcol')));
        await assertFails(getDocs(collection(anon, 'collections')));
        await assertSucceeds(getDocs(query(collection(anon, 'collections'), where('is_private', '==', false))));
    });
});

/** Subcollections do not inherit the parent's rule, so comments needed closing separately. */
describe('comments follow their item\'s privacy', () => {
    beforeEach(async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            const db = ctx.firestore();
            await setDoc(doc(db, 'archive_items', 'public1'), { title: 'Public', is_private: false });
            await setDoc(doc(db, 'archive_items', 'private1'), { title: 'Private', is_private: true });
            await setDoc(doc(db, 'archive_items', 'public1', 'comments', 'c1'), { text: 'hi', authorEmail: 'a@b.com' });
            await setDoc(doc(db, 'archive_items', 'private1', 'comments', 'c2'), { text: 'secret', authorEmail: 'a@b.com' });
        });
    });

    it('lets anyone read comments on a public item', async () => {
        const db = testEnv.unauthenticatedContext().firestore();
        await assertSucceeds(getDoc(doc(db, 'archive_items', 'public1', 'comments', 'c1')));
    });

    it('refuses comments on a private item', async () => {
        const db = testEnv.unauthenticatedContext().firestore();
        await assertFails(getDoc(doc(db, 'archive_items', 'private1', 'comments', 'c2')));
    });

    it('lets staff read comments on a private item', async () => {
        const db = staff().firestore();
        await assertSucceeds(getDoc(doc(db, 'archive_items', 'private1', 'comments', 'c2')));
    });
});

/**
 * Audit finding H2. `isSAHSUser()` admitted any @senoiahistory.com address, which
 * meant a new volunteer, an intern, or someone mid-offboarding held
 * curator-equivalent write across the archive the moment they first signed in —
 * no role grant, no audit trail. The sibling sahs-website repo refuses to do this
 * and says so in its own rules; the two apps share one Auth instance and had
 * opposite policies on the same identities.
 */
describe('H2 — the email domain alone grants nothing', () => {
    beforeEach(async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            await setDoc(doc(ctx.firestore(), 'archive_items', 'public1'), { title: 'Public', is_private: false });
        });
    });

    it('refuses a Workspace address with no role', async () => {
        const db = domainOnly().firestore();
        await assertFails(setDoc(doc(db, 'archive_items', 'new1'), { title: 'Should not write', is_private: false }));
        await assertFails(getDocs(collection(db, 'archive_items')));
        await assertFails(getDoc(doc(db, 'members', 'other@example.com')));
    });

    it('still admits a role holder, via the claim', async () => {
        const db = staff().firestore();
        await assertSucceeds(setDoc(doc(db, 'archive_items', 'new2'), { title: 'Fine', is_private: false }));
    });

    /**
     * The break-glass path. Both permanent admins are hardcoded in the rules and
     * hold no user_roles document — jeremywarren@ has no role claim either, which
     * is why functions/restrictedMedia.js had to gain the same hardcoded pair when
     * its domain fallback went.
     */
    it('still admits a hardcoded permanent admin with no role document', async () => {
        const db = permanentAdmin().firestore();
        await assertSucceeds(setDoc(doc(db, 'archive_items', 'new3'), { title: 'Fine', is_private: false }));
    });

    it('leaves the public archive readable to everyone', async () => {
        const db = testEnv.unauthenticatedContext().firestore();
        await assertSucceeds(getDoc(doc(db, 'archive_items', 'public1')));
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
