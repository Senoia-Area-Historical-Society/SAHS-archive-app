/**
 * Mirrors each user's role onto their Auth custom claims, so a role is visible
 * somewhere Storage Rules can actually see it.
 *
 * Storage Rules cannot query a *named* Firestore database — only the default
 * one — and this project's Firestore lives at "sahs-archives", not default.
 * Custom claims sidestep the problem entirely, because they ride along on the
 * ID token itself.
 *
 * A role comes from user_roles/{email} or from the support list in
 * deployment_config/support; roleResolution.js decides between them.
 *
 * Three paths keep a role and its claim in sync:
 *  - syncUserRoleClaims fires the moment a role is written or removed, for
 *    anyone who already has an Auth account.
 *  - syncSupportAdminClaims does the same when the support list changes — in
 *    particular, it is what actually revokes access when a museum removes
 *    support admins, since Storage would otherwise go on honouring the claim.
 *  - syncMyRoleClaim covers the case Firestore triggers can't: a role granted
 *    to an email before that person has ever signed in. AuthContext calls it
 *    once per session; it's a no-op once the claim already matches.
 */

const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const { supportEmailsOf, resolveRole, changedSupportEmails } = require("./roleResolution");

const DATABASE = "sahs-archives";

/** The role `email` should hold right now, read fresh from both sources. */
async function currentRoleFor(email) {
    const db = getFirestore(DATABASE);
    const [supportDoc, roleDoc] = await Promise.all([
        db.collection("deployment_config").doc("support").get(),
        db.collection("user_roles").doc(email).get(),
    ]);
    return resolveRole(
        email,
        supportEmailsOf(supportDoc.exists ? supportDoc.data() : null),
        roleDoc.exists ? roleDoc.data().role : undefined,
    );
}

/** Sets or clears the `role` claim on `email`'s account, if it has one. */
async function applyRoleClaim(email, role) {
    let user;
    try {
        user = await admin.auth().getUserByEmail(email);
    } catch (err) {
        if (err.code === "auth/user-not-found") {
            // Granted before their first sign-in. syncMyRoleClaim picks this
            // up once the account actually exists.
            logger.info(`No Auth account yet for ${email}; claim will apply on first sign-in.`);
            return;
        }
        throw err;
    }

    const { role: currentRole, ...rest } = user.customClaims || {};
    if ((currentRole || null) === role) return;

    await admin.auth().setCustomUserClaims(user.uid, role ? { ...rest, role } : rest);
    logger.info(role
        ? `Set role claim "${role}" for ${email} (uid ${user.uid}).`
        : `Revoked role claim for ${email} (uid ${user.uid}).`);
}

exports.syncUserRoleClaims = onDocumentWritten({
    document: "user_roles/{email}",
    database: DATABASE,
    maxInstances: 10
}, async (event) => {
    const email = event.params.email.toLowerCase();
    try {
        await applyRoleClaim(email, await currentRoleFor(email));
    } catch (err) {
        logger.error(`Failed to sync role claim for ${email}:`, err);
        throw err;
    }
});

exports.syncSupportAdminClaims = onDocumentWritten({
    document: "deployment_config/support",
    database: DATABASE,
    maxInstances: 1
}, async (event) => {
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after.exists ? event.data.after.data() : null;
    for (const email of changedSupportEmails(before, after)) {
        try {
            await applyRoleClaim(email, await currentRoleFor(email));
        } catch (err) {
            logger.error(`Failed to sync support admin claim for ${email}:`, err);
            throw err;
        }
    }
});

exports.syncMyRoleClaim = onCall({
    memory: "256MiB",
    timeoutSeconds: 30,
    maxInstances: 10
}, async (request) => {
    if (!request.auth || !request.auth.token.email) {
        throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const email = request.auth.token.email.toLowerCase();
    const role = await currentRoleFor(email);

    if ((request.auth.token.role || null) === role) {
        return { updated: false, role };
    }

    const currentClaims = { ...(request.auth.token || {}) };
    // Strip standard JWT/Firebase reserved claims before re-spreading as custom claims.
    ["iss", "aud", "auth_time", "user_id", "sub", "iat", "exp", "firebase", "uid",
        "email", "email_verified", "name", "picture"].forEach((key) => delete currentClaims[key]);

    if (role) {
        currentClaims.role = role;
    } else {
        delete currentClaims.role;
    }

    await admin.auth().setCustomUserClaims(request.auth.uid, currentClaims);
    logger.info(`Self-heal: set role claim "${role}" for ${email} (uid ${request.auth.uid}).`);
    return { updated: true, role };
});
