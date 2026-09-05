/**
 * Brings every Auth account's `role` custom claim into line with `user_roles`.
 *
 * ── Why this is needed ───────────────────────────────────────────────────────
 *
 * There are two places a role is read, and they see different things.
 *
 * `firestore.rules` can consult the `user_roles` collection directly, via
 * `get()`. `storage.rules` cannot — Storage Rules cannot read Firestore at all,
 * and certainly not the *named* `sahs-archives` database this project uses. So
 * Storage recognises only three things: the `role` custom claim on the ID token,
 * an `@senoiahistory.com` email, and two hardcoded addresses.
 *
 * `functions/userRoles.js` exists to close that gap — `syncUserRoleClaims` sets
 * the claim whenever a role document is written, and `syncMyRoleClaim` self-heals
 * on sign-in. Accounts granted a role before those functions existed have neither,
 * and nothing has gone back for them. As of 2026-09-05 four role holders had no
 * claim, and two of them have no `@senoiahistory.com` address either, so they are
 * invisible to Storage Rules entirely:
 *
 *   cathrinennolan@gmail.com      admin    — cannot upload media
 *   kaitlin.carter1108@gmail.com  curator  — cannot upload media
 *   shelleykiley@senoiahistory.com  curator — works only via the domain fallback
 *   calebwalls@senoiahistory.com    curator — works only via the domain fallback
 *
 * The first two are a live bug today. The last two matter for the audit's H2: the
 * plan is to drop the `@senoiahistory.com` clause from the rules, and doing that
 * before this backfill would take their Storage access away with it.
 *
 * Run this, confirm every role holder reports a claim, and only then remove the
 * domain clause.
 *
 * ── What it does ─────────────────────────────────────────────────────────────
 *
 * For each `user_roles` document: look up the Auth account by email, and set
 * `role` if it is missing or disagrees. Existing custom claims are preserved by
 * spreading, exactly as `applyRoleClaim` in functions/userRoles.js does — this
 * script is deliberately a mirror of that function, not a second implementation.
 *
 * It also reports the inverse — an account carrying a `role` claim with no
 * matching role document — but does NOT revoke it unless `--revoke-orphans` is
 * passed. Revoking access is not something a backfill should do by default.
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *
 *   node scripts/backfill-role-claims.cjs                    # DRY RUN (default)
 *   node scripts/backfill-role-claims.cjs --prod             # apply
 *   node scripts/backfill-role-claims.cjs --prod --revoke-orphans
 *
 * If you are authenticating with bare user ADC (`gcloud auth application-default
 * login`), the Auth half needs a quota project or every lookup 403s with
 * "identitytoolkit.googleapis.com API requires a quota project". Set it for the
 * single run rather than globally:
 *
 *   GOOGLE_CLOUD_QUOTA_PROJECT=sahs-archives node scripts/backfill-role-claims.cjs
 *
 * Deliberately scoped to the command: `gcloud auth application-default
 * set-quota-project` changes it for every tool on the machine, and an ADC quota
 * project is what routed the August 2026 Vertex AI spend. A service-account key
 * carries its own project and needs none of this.
 *
 * Idempotent: a second run reports zero changes.
 *
 * ── After running ────────────────────────────────────────────────────────────
 *
 * `setCustomUserClaims` does NOT invalidate tokens that are already issued. Each
 * affected person picks the claim up on their next token refresh — within about an
 * hour, or immediately if they sign out and back in. Tell them that rather than
 * letting them conclude the fix did not work.
 */

const admin = require('firebase-admin');

const DATABASE_ID = 'sahs-archives';

/** Mirrors VALID_ROLES in functions/userRoles.js — the only roles Storage honours. */
const VALID_ROLES = ['admin', 'curator'];

const args = process.argv.slice(2);
const PROD = args.includes('--prod');
const REVOKE_ORPHANS = args.includes('--revoke-orphans');

admin.initializeApp({ projectId: 'sahs-archives' });
const db = admin.firestore();
db.settings({ databaseId: DATABASE_ID });

const stats = {
    roleDocs: 0,
    alreadyCorrect: 0,
    claimSet: 0,
    noAuthAccount: 0,
    invalidRole: 0,
    orphanClaims: 0,
    orphanClaimsRevoked: 0,
};

const lines = [];

async function backfillFromRoleDocs() {
    const snap = await db.collection('user_roles').get();
    stats.roleDocs = snap.size;

    const claimed = new Set();

    for (const doc of snap.docs) {
        const email = doc.id.toLowerCase();
        const role = doc.data().role;

        if (!VALID_ROLES.includes(role)) {
            // read_only / board_member / a typo: Storage has no concept of these,
            // so there is no claim to set. Not an error, but worth surfacing.
            stats.invalidRole++;
            lines.push(`  skip     ${email} — role "${role}" is not claim-bearing`);
            continue;
        }

        let user;
        try {
            user = await admin.auth().getUserByEmail(email);
        } catch (err) {
            if (err.code === 'auth/user-not-found') {
                // A role granted to an address that has never signed in. Harmless
                // in itself — but see the audit's note on Margaret Ordonez, whose
                // role sits on an address she does not use.
                stats.noAuthAccount++;
                lines.push(`  no-auth  ${email} — role "${role}" granted, but no Auth account has ever signed in`);
                continue;
            }
            throw err;
        }

        claimed.add(user.uid);
        const current = user.customClaims || {};

        if (current.role === role) {
            stats.alreadyCorrect++;
            continue;
        }

        stats.claimSet++;
        lines.push(`  SET      ${email} — role claim ${JSON.stringify(current.role)} -> "${role}"`);
        if (PROD) {
            // Spread first so any other custom claim on the account survives.
            await admin.auth().setCustomUserClaims(user.uid, { ...current, role });
        }
    }

    return claimed;
}

/**
 * Accounts holding a `role` claim that `user_roles` no longer backs.
 *
 * Reported by default and revoked only on request: a stale claim is a real
 * problem, but silently removing someone's access during a backfill is worse than
 * telling you about it.
 */
async function findOrphanClaims(claimedUids) {
    let pageToken;
    do {
        const page = await admin.auth().listUsers(1000, pageToken);
        for (const user of page.users) {
            const role = user.customClaims && user.customClaims.role;
            if (!role || claimedUids.has(user.uid)) continue;

            stats.orphanClaims++;
            lines.push(`  ORPHAN   ${user.email || user.uid} — holds claim "${role}" with no user_roles document`);

            if (REVOKE_ORPHANS) {
                stats.orphanClaimsRevoked++;
                if (PROD) {
                    const { role: _dropped, ...rest } = user.customClaims;
                    await admin.auth().setCustomUserClaims(user.uid, rest);
                }
            }
        }
        pageToken = page.pageToken;
    } while (pageToken);
}

async function run() {
    console.log(`Mode: ${PROD ? 'PRODUCTION WRITE' : 'DRY RUN (no writes)'}`);
    console.log(`Database: ${DATABASE_ID}`);
    if (REVOKE_ORPHANS) console.log('Including: revoke claims with no backing role document');
    console.log('');

    const claimedUids = await backfillFromRoleDocs();
    await findOrphanClaims(claimedUids);

    if (lines.length) {
        console.log('Changes:');
        lines.forEach((l) => console.log(l));
        console.log('');
    }

    console.log('Results');
    console.log(`  user_roles documents             ${stats.roleDocs}`);
    console.log(`  claim already correct            ${stats.alreadyCorrect}`);
    console.log(`  claim ${PROD ? 'set            ' : 'to set         '}          ${stats.claimSet}`);
    console.log(`  role not claim-bearing           ${stats.invalidRole}`);
    console.log(`  no Auth account yet              ${stats.noAuthAccount}`);
    console.log(`  orphan claims found              ${stats.orphanClaims}`);
    if (REVOKE_ORPHANS) console.log(`  orphan claims revoked            ${stats.orphanClaimsRevoked}`);

    if (!PROD) {
        console.log('\nDry run — nothing was written. Re-run with --prod to apply.');
    } else if (stats.claimSet > 0) {
        console.log(
            '\nNOTE: setCustomUserClaims does not invalidate tokens already issued.\n' +
            'Affected people pick the claim up on their next refresh (within ~1 hour),\n' +
            'or immediately if they sign out and back in.'
        );
    }
}

run().then(() => process.exit(0)).catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
});
