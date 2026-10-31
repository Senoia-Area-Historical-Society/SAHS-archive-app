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

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    initializeTestEnvironment,
    assertFails,
    assertSucceeds,
    type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

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

/**
 * A support admin: on the deployment_config/support list, with no role document
 * and no claim. jeremywarren@ is exactly this in production.
 */
const supportAdmin = () => testEnv.authenticatedContext('perm', { email: 'jeremywarren@senoiahistory.com' });

/** A museum's own admin, granted in Admin Settings, before their claim lands. */
const museumAdmin = () => testEnv.authenticatedContext('museumadmin', { email: 'admin@examplemuseum.org' });

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
        await setDoc(doc(db, 'user_roles', 'admin@examplemuseum.org'), { role: 'admin' });
        // Mirrors production: the two addresses that used to be hardcoded.
        await setDoc(doc(db, 'deployment_config', 'support'), {
            emails: ['catnolan@senoiahistory.com', 'jeremywarren@senoiahistory.com'],
        });
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
    /** An address the installer put on the setup list, at a museum that isn't SAHS. */
    const director = () => testEnv.authenticatedContext('director', { email: 'director@examplemuseum.org' });

    const clearSetup = (setupAdmins: string[] | null = ['director@examplemuseum.org']) =>
        testEnv.withSecurityRulesDisabled(async (ctx) => {
            const db = ctx.firestore();
            const { deleteDoc } = await import('firebase/firestore');
            await setDoc(doc(db, 'site_settings', 'setup'), { isComplete: false });
            // isSetupComplete() is an OR — the appearance document alone satisfies it,
            // so a test that only flips isComplete would prove nothing.
            await deleteDoc(doc(db, 'site_settings', 'appearance'));
            if (setupAdmins) {
                await setDoc(doc(db, 'deployment_config', 'bootstrap'), { emails: setupAdmins });
            }
        });

    it('refuses a stranger self-granting admin even when setup is incomplete', async () => {
        await clearSetup();
        const db = stranger().firestore();
        await assertFails(setDoc(doc(db, 'user_roles', 'stranger@example.com'), { role: 'admin' }));
    });

    it('lets a listed setup admin from any domain bootstrap the first admin', async () => {
        await clearSetup();
        const db = director().firestore();
        await assertSucceeds(setDoc(doc(db, 'user_roles', 'director@examplemuseum.org'), { role: 'admin' }));
    });

    it('matches the listed address case-insensitively', async () => {
        await clearSetup();
        const db = testEnv.authenticatedContext('director2', { email: 'Director@ExampleMuseum.org' }).firestore();
        await assertSucceeds(setDoc(doc(db, 'user_roles', 'director@examplemuseum.org'), { role: 'admin' }));
    });

    it('no longer lets a SAHS address bootstrap on the domain alone', async () => {
        await clearSetup();
        const db = domainOnly().firestore();
        await assertFails(setDoc(doc(db, 'user_roles', 'newvolunteer@senoiahistory.com'), { role: 'admin' }));
    });

    it('lets nobody bootstrap when no setup list has been written', async () => {
        await clearSetup(null);
        const db = director().firestore();
        await assertFails(setDoc(doc(db, 'user_roles', 'director@examplemuseum.org'), { role: 'admin' }));
    });

    it('refuses a listed setup admin once setup is complete', async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            await setDoc(doc(ctx.firestore(), 'deployment_config', 'bootstrap'), { emails: ['director@examplemuseum.org'] });
        });
        // Fixtures already mark setup complete; only the permanent admins may write.
        const db = director().firestore();
        await assertFails(setDoc(doc(db, 'user_roles', 'director@examplemuseum.org'), { role: 'admin' }));
    });

    it('refuses a listed setup admin granting a role on someone else\'s document', async () => {
        await clearSetup();
        const db = director().firestore();
        await assertFails(setDoc(doc(db, 'user_roles', 'stranger@example.com'), { role: 'admin' }));
    });

    it('refuses a stranger granting themselves admin on someone else\'s document', async () => {
        await clearSetup();
        const db = stranger().firestore();
        await assertFails(setDoc(doc(db, 'user_roles', 'director@examplemuseum.org'), { role: 'admin' }));
    });

    it('refuses a stranger adding themselves to the setup list', async () => {
        await clearSetup();
        const db = stranger().firestore();
        await assertFails(setDoc(doc(db, 'deployment_config', 'bootstrap'), { emails: ['stranger@example.com'] }));
    });

    it('keeps the setup list unreadable and unwritable even to a listed setup admin', async () => {
        await clearSetup();
        const db = director().firestore();
        await assertFails(getDoc(doc(db, 'deployment_config', 'bootstrap')));
        await assertFails(setDoc(doc(db, 'deployment_config', 'bootstrap'), { emails: ['director@examplemuseum.org', 'friend@example.com'] }));
    });

    it('lets a listed setup admin write settings during setup', async () => {
        await clearSetup();
        const db = director().firestore();
        await assertSucceeds(setDoc(doc(db, 'site_settings', 'appearance'), { museumName: 'Example Museum' }));
    });

    it('lets a listed setup admin complete the whole wizard in its real order', async () => {
        // SetupWizard: claim admin (step 1), then write appearance, then setup.
        await clearSetup();
        const db = director().firestore();
        await assertSucceeds(setDoc(doc(db, 'user_roles', 'director@examplemuseum.org'), { role: 'admin' }));
        await assertSucceeds(setDoc(doc(db, 'site_settings', 'appearance'), { museumName: 'Example Museum' }));
        await assertSucceeds(setDoc(doc(db, 'site_settings', 'setup'), { isComplete: true }));
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
     * The break-glass path. The support admins hold no user_roles document —
     * jeremywarren@ has no role claim either — so the list itself must admit them.
     */
    it('still admits a support admin with no role document', async () => {
        const db = supportAdmin().firestore();
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

/**
 * The two addresses that were hardcoded into every rules file are now the
 * support list. A museum installing the code can see it and remove it, so
 * removal has to actually work, and a museum's own admins have to be able to
 * manage roles without it — before, only those two addresses could.
 */
describe('support admins and role management', () => {
    const setSupport = (emails: string[] | null) => testEnv.withSecurityRulesDisabled(async (ctx) => {
        const ref = doc(ctx.firestore(), 'deployment_config', 'support');
        if (emails) {
            await setDoc(ref, { emails });
        } else {
            const { deleteDoc } = await import('firebase/firestore');
            await deleteDoc(ref);
        }
    });

    it('lets a support admin grant roles', async () => {
        const db = supportAdmin().firestore();
        await assertSucceeds(setDoc(doc(db, 'user_roles', 'new@example.com'), { role: 'curator' }));
    });

    it('stops admitting an address once it is removed from the list', async () => {
        await setSupport(['catnolan@senoiahistory.com']);
        const db = supportAdmin().firestore();
        await assertFails(setDoc(doc(db, 'archive_items', 'x'), { title: 'No', is_private: false }));
        await assertFails(setDoc(doc(db, 'user_roles', 'new@example.com'), { role: 'curator' }));
    });

    it('admits nobody as a support admin when there is no list', async () => {
        await setSupport(null);
        const db = supportAdmin().firestore();
        await assertFails(setDoc(doc(db, 'archive_items', 'x'), { title: 'No', is_private: false }));
    });

    it('lets a museum admin grant and revoke roles with no support admins at all', async () => {
        await setSupport(null);
        const db = museumAdmin().firestore();
        await assertSucceeds(setDoc(doc(db, 'user_roles', 'new@example.com'), { role: 'curator' }));
        await assertSucceeds(setDoc(doc(db, 'user_roles', 'new@example.com'), { role: 'admin' }));
        const { deleteDoc } = await import('firebase/firestore');
        await assertSucceeds(deleteDoc(doc(db, 'user_roles', 'new@example.com')));
    });

    it('lets an admin holding only the claim grant roles', async () => {
        const db = staff().firestore();
        await assertSucceeds(setDoc(doc(db, 'user_roles', 'new@example.com'), { role: 'curator' }));
    });

    it('refuses a role that does not exist', async () => {
        const db = museumAdmin().firestore();
        await assertFails(setDoc(doc(db, 'user_roles', 'new@example.com'), { role: 'superadmin' }));
    });

    it('refuses a curator granting roles', async () => {
        const db = curator().firestore();
        await assertFails(setDoc(doc(db, 'user_roles', 'new@example.com'), { role: 'curator' }));
        await assertFails(setDoc(doc(db, 'user_roles', 'curator@example.com'), { role: 'admin' }));
    });

    it('refuses a stranger granting roles', async () => {
        const db = stranger().firestore();
        await assertFails(setDoc(doc(db, 'user_roles', 'stranger@example.com'), { role: 'admin' }));
    });

    it('shows the support list to the museum\'s staff', async () => {
        await assertSucceeds(getDoc(doc(museumAdmin().firestore(), 'deployment_config', 'support')));
        await assertSucceeds(getDoc(doc(curator().firestore(), 'deployment_config', 'support')));
        await assertSucceeds(getDoc(doc(supportAdmin().firestore(), 'deployment_config', 'support')));
    });

    it('hides the support list from the public and from members', async () => {
        await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'deployment_config', 'support')));
        await assertFails(getDoc(doc(stranger().firestore(), 'deployment_config', 'support')));
        await assertFails(getDoc(doc(member().firestore(), 'deployment_config', 'support')));
    });

    it('lets nobody change the support list from the app, admins included', async () => {
        const list = { emails: ['someone@example.com'] };
        await assertFails(setDoc(doc(museumAdmin().firestore(), 'deployment_config', 'support'), list));
        await assertFails(setDoc(doc(supportAdmin().firestore(), 'deployment_config', 'support'), list));
        await assertFails(setDoc(doc(staff().firestore(), 'deployment_config', 'support'), list));
    });

    it('still hides the setup list, even from staff', async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            await setDoc(doc(ctx.firestore(), 'deployment_config', 'bootstrap'), { emails: ['director@examplemuseum.org'] });
        });
        await assertFails(getDoc(doc(museumAdmin().firestore(), 'deployment_config', 'bootstrap')));
    });
});

/** The member a folder is shared with — `other@example.com` is an active member. */
const collaborator = () => testEnv.authenticatedContext('other', { email: 'other@example.com' });

/**
 * research_folders. The update rule checked only who the caller was in the
 * existing document, so a collaborator could rewrite ownerEmail and sharedWith,
 * take the folder over, and then delete it as its new "owner". And sharing was
 * checked only in the browser, so a folder could be shared with anyone.
 */
describe('research_folders — collaborators cannot take a folder over', () => {
    beforeEach(async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            const db = ctx.firestore();
            await setDoc(doc(db, 'research_folders', 'f1'), {
                name: 'Mill families', description: '', createdAt: '2026-10-01T00:00:00.000Z',
                itemIds: ['a'], ownerEmail: 'member@example.com', sharedWith: ['other@example.com'],
            });
            await setDoc(doc(db, 'members', 'third@example.com'), {
                status: 'active', expiresAt: 'Never', name: 'Third Member',
            });
        });
    });

    it('refuses a collaborator rewriting ownerEmail', async () => {
        const db = collaborator().firestore();
        await assertFails(updateDoc(doc(db, 'research_folders', 'f1'), { ownerEmail: 'other@example.com' }));
    });

    it('refuses a collaborator rewriting sharedWith', async () => {
        const db = collaborator().firestore();
        await assertFails(updateDoc(doc(db, 'research_folders', 'f1'), { sharedWith: [] }));
        await assertFails(updateDoc(doc(db, 'research_folders', 'f1'), { sharedWith: arrayUnion('third@example.com') }));
    });

    it('refuses the whole takeover in one write', async () => {
        const db = collaborator().firestore();
        await assertFails(updateDoc(doc(db, 'research_folders', 'f1'), {
            ownerEmail: 'other@example.com', sharedWith: [],
        }));
    });

    it('refuses a collaborator deleting the folder', async () => {
        const db = collaborator().firestore();
        await assertFails(deleteDoc(doc(db, 'research_folders', 'f1')));
    });

    it('still lets a collaborator change the contents, name and description', async () => {
        const db = collaborator().firestore();
        await assertSucceeds(updateDoc(doc(db, 'research_folders', 'f1'), { itemIds: ['a', 'b'] }));
        await assertSucceeds(updateDoc(doc(db, 'research_folders', 'f1'), { name: 'Mill families, 1890s', description: 'x' }));
    });

    it('refuses the owner handing the folder to someone else', async () => {
        const db = member().firestore();
        await assertFails(updateDoc(doc(db, 'research_folders', 'f1'), { ownerEmail: 'other@example.com' }));
    });

    it('lets staff reassign a folder\'s owner', async () => {
        const db = staff().firestore();
        await assertSucceeds(updateDoc(doc(db, 'research_folders', 'f1'), { ownerEmail: 'other@example.com' }));
    });

    it('lets the owner remove a collaborator, and still delete their folder', async () => {
        const db = member().firestore();
        await assertSucceeds(updateDoc(doc(db, 'research_folders', 'f1'), { sharedWith: arrayRemove('other@example.com') }));
        await assertSucceeds(deleteDoc(doc(db, 'research_folders', 'f1')));
    });
});

describe('research_folders — shareable only with members', () => {
    beforeEach(async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            const db = ctx.firestore();
            await setDoc(doc(db, 'research_folders', 'f1'), {
                name: 'Mill families', itemIds: [], ownerEmail: 'member@example.com', sharedWith: [],
            });
            await setDoc(doc(db, 'members', 'lapsed@example.com'), {
                status: 'expired', expiresAt: '2020-01-01', name: 'Lapsed Member',
            });
            await setDoc(doc(db, 'members', 'third@example.com'), {
                status: 'active', expiresAt: 'Never', name: 'Third Member',
            });
        });
    });

    it('lets the owner share with an active member, as the client does it', async () => {
        const db = member().firestore();
        await assertSucceeds(updateDoc(doc(db, 'research_folders', 'f1'), { sharedWith: arrayUnion('other@example.com') }));
    });

    it('lets the owner share with staff', async () => {
        const db = member().firestore();
        await assertSucceeds(updateDoc(doc(db, 'research_folders', 'f1'), { sharedWith: arrayUnion('curator@example.com') }));
    });

    it('refuses sharing with a non-member', async () => {
        const db = member().firestore();
        await assertFails(updateDoc(doc(db, 'research_folders', 'f1'), { sharedWith: arrayUnion('stranger@example.com') }));
    });

    it('refuses sharing with an expired member', async () => {
        const db = member().firestore();
        await assertFails(updateDoc(doc(db, 'research_folders', 'f1'), { sharedWith: arrayUnion('lapsed@example.com') }));
    });

    /** The domain grant is gone; a bare @senoiahistory.com address is not a member. */
    it('refuses sharing with a Workspace address that holds no role', async () => {
        const db = member().firestore();
        await assertFails(updateDoc(doc(db, 'research_folders', 'f1'), { sharedWith: arrayUnion('newvolunteer@senoiahistory.com') }));
    });

    it('refuses adding two at once, even a non-member alongside a member', async () => {
        const db = member().firestore();
        await assertFails(updateDoc(doc(db, 'research_folders', 'f1'), {
            sharedWith: ['stranger@example.com', 'other@example.com'],
        }));
        await assertFails(updateDoc(doc(db, 'research_folders', 'f1'), {
            sharedWith: ['other@example.com', 'third@example.com'],
        }));
    });

    it('applies to staff too', async () => {
        const db = staff().firestore();
        await assertFails(updateDoc(doc(db, 'research_folders', 'f1'), { sharedWith: arrayUnion('stranger@example.com') }));
    });

    it('refuses creating a folder already shared, which would skip the check', async () => {
        const db = member().firestore();
        await assertFails(setDoc(doc(db, 'research_folders', 'f2'), {
            name: 'New', itemIds: [], ownerEmail: 'member@example.com', sharedWith: ['stranger@example.com'],
        }));
        await assertSucceeds(setDoc(doc(db, 'research_folders', 'f3'), {
            name: 'New', itemIds: [], ownerEmail: 'member@example.com', sharedWith: [],
        }));
    });
});

/**
 * Comment create trusted every field the client sent: a member could post under
 * another address, wear an Admin badge, pick their own status, and comment on a
 * private item they cannot read.
 */
describe('comments — the author and role are the writer\'s own', () => {
    const comment = (overrides: Record<string, unknown> = {}) => ({
        itemId: 'public1', authorName: 'A Member', authorEmail: 'member@example.com',
        role: 'Member', content: 'Lovely photograph', createdAt: '2026-10-31T00:00:00.000Z',
        status: 'approved', ...overrides,
    });

    beforeEach(async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            const db = ctx.firestore();
            await setDoc(doc(db, 'archive_items', 'public1'), { title: 'Public', is_private: false });
            await setDoc(doc(db, 'archive_items', 'private1'), { title: 'Private', is_private: true });
        });
    });

    it('lets a member post a comment as themselves', async () => {
        const db = member().firestore();
        await assertSucceeds(setDoc(doc(db, 'archive_items', 'public1', 'comments', 'c1'), comment()));
    });

    it('refuses a forged author address', async () => {
        const db = member().firestore();
        await assertFails(setDoc(doc(db, 'archive_items', 'public1', 'comments', 'c1'),
            comment({ authorEmail: 'other@example.com' })));
    });

    it('refuses a member claiming a staff role', async () => {
        const db = member().firestore();
        await assertFails(setDoc(doc(db, 'archive_items', 'public1', 'comments', 'c1'), comment({ role: 'Admin' })));
        await assertFails(setDoc(doc(db, 'archive_items', 'public1', 'comments', 'c2'), comment({ role: 'Curator' })));
    });

    it('refuses a member choosing a status other than approved', async () => {
        const db = member().firestore();
        await assertFails(setDoc(doc(db, 'archive_items', 'public1', 'comments', 'c1'), comment({ status: 'featured' })));
    });

    it('refuses a member commenting on a private item', async () => {
        const db = member().firestore();
        await assertFails(setDoc(doc(db, 'archive_items', 'private1', 'comments', 'c1'), comment({ itemId: 'private1' })));
    });

    it('still refuses a stranger', async () => {
        const db = stranger().firestore();
        await assertFails(setDoc(doc(db, 'archive_items', 'public1', 'comments', 'c1'),
            comment({ authorEmail: 'stranger@example.com' })));
    });

    it('requires a curator to post as Curator, and not as Admin or Member', async () => {
        const db = curator().firestore();
        const mine = { authorEmail: 'curator@example.com' };
        await assertSucceeds(setDoc(doc(db, 'archive_items', 'private1', 'comments', 'c1'), comment({ ...mine, role: 'Curator' })));
        await assertFails(setDoc(doc(db, 'archive_items', 'public1', 'comments', 'c2'), comment({ ...mine, role: 'Admin' })));
        await assertFails(setDoc(doc(db, 'archive_items', 'public1', 'comments', 'c3'), comment({ ...mine, role: 'Member' })));
    });

    it('requires an admin — by claim, role document or support list — to post as Admin', async () => {
        await assertSucceeds(setDoc(doc(staff().firestore(), 'archive_items', 'public1', 'comments', 'c1'),
            comment({ authorEmail: 'staff@senoiahistory.com', role: 'Admin' })));
        await assertSucceeds(setDoc(doc(museumAdmin().firestore(), 'archive_items', 'public1', 'comments', 'c2'),
            comment({ authorEmail: 'admin@examplemuseum.org', role: 'Admin' })));
        await assertSucceeds(setDoc(doc(supportAdmin().firestore(), 'archive_items', 'public1', 'comments', 'c3'),
            comment({ authorEmail: 'jeremywarren@senoiahistory.com', role: 'Admin' })));
        await assertFails(setDoc(doc(museumAdmin().firestore(), 'archive_items', 'public1', 'comments', 'c4'),
            comment({ authorEmail: 'admin@examplemuseum.org', role: 'Curator' })));
    });
});

/**
 * research_notes. MyResearch queried by folderId alone, which the rule cannot
 * prove readable, so Firestore rejected it for every member and the journal came
 * up empty. These are the two query shapes it uses now.
 */
describe('research_notes — the queries MyResearch runs', () => {
    beforeEach(async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            const db = ctx.firestore();
            await setDoc(doc(db, 'research_folders', 'f1'), {
                name: 'Mill families', itemIds: ['a'], ownerEmail: 'member@example.com', sharedWith: ['other@example.com'],
            });
            await setDoc(doc(db, 'members', 'third@example.com'), { status: 'active', expiresAt: 'Never' });
            const note = (ownerEmail: string, isPrivate: boolean) => ({
                itemId: 'a', folderId: 'f1', ownerEmail, content: 'n', isPrivate, lastUpdated: '2026-10-01T00:00:00.000Z',
            });
            await setDoc(doc(db, 'research_notes', 'n1'), note('member@example.com', true));
            await setDoc(doc(db, 'research_notes', 'n2'), note('member@example.com', false));
            await setDoc(doc(db, 'research_notes', 'n3'), note('other@example.com', true));
            await setDoc(doc(db, 'research_notes', 'n4'), note('other@example.com', false));
        });
    });

    type Db = ReturnType<ReturnType<typeof member>['firestore']>;
    const mine = (db: Db, email: string) =>
        query(collection(db, 'research_notes'), where('folderId', '==', 'f1'), where('ownerEmail', '==', email));
    const shared = (db: Db) =>
        query(collection(db, 'research_notes'), where('folderId', '==', 'f1'), where('isPrivate', '==', false));

    it('refuses the old folderId-only query — the bug', async () => {
        const db = member().firestore();
        await assertFails(getDocs(query(collection(db, 'research_notes'), where('folderId', '==', 'f1'))));
    });

    it('lets a member list their own notes in a folder', async () => {
        const db = member().firestore();
        const snap = await assertSucceeds(getDocs(mine(db, 'member@example.com')));
        expect(snap.docs.map(d => d.id).sort()).toEqual(['n1', 'n2']);
    });

    it('lets a collaborator list the folder\'s shared notes, and their own', async () => {
        const db = collaborator().firestore();
        const sharedSnap = await assertSucceeds(getDocs(shared(db)));
        expect(sharedSnap.docs.map(d => d.id).sort()).toEqual(['n2', 'n4']);
        const mineSnap = await assertSucceeds(getDocs(mine(db, 'other@example.com')));
        expect(mineSnap.docs.map(d => d.id).sort()).toEqual(['n3', 'n4']);
    });

    it('refuses a non-collaborator listing the folder\'s shared notes', async () => {
        const db = testEnv.authenticatedContext('third', { email: 'third@example.com' }).firestore();
        await assertFails(getDocs(shared(db)));
    });

    it('refuses listing someone else\'s notes by owner', async () => {
        const db = collaborator().firestore();
        await assertFails(getDocs(mine(db, 'member@example.com')));
    });
});
