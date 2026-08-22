/**
 * Mirrors the `user_roles` Firestore collection onto each user's Auth custom
 * claims, so a role granted in Admin Settings is visible somewhere Storage
 * Rules can actually see it.
 *
 * Storage Rules cannot query a *named* Firestore database — only the default
 * one — and this project's Firestore lives at "sahs-archives", not default.
 * That's why storage.rules and restrictedMedia.js's isSAHSUser() only ever
 * recognised the @senoiahistory.com domain plus a couple of hardcoded emails:
 * anyone granted curator/admin through user_roles with any other address was
 * invisible to them. Custom claims sidestep the problem entirely, because
 * they ride along on the ID token itself.
 *
 * Two paths keep a role and its claim in sync:
 *  - syncUserRoleClaims fires the moment a role is written or removed, for
 *    anyone who already has an Auth account.
 *  - syncMyRoleClaim covers the case Firestore triggers can't: a role granted
 *    to an email before that person has ever signed in. AuthContext calls it
 *    once per session; it's a no-op once the claim already matches.
 */

const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

const VALID_ROLES = ["admin", "curator"];

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

    const currentClaims = user.customClaims || {};
    if (currentClaims.role === role) return;

    await admin.auth().setCustomUserClaims(user.uid, { ...currentClaims, role });
    logger.info(`Set role claim "${role}" for ${email} (uid ${user.uid}).`);
}

exports.syncUserRoleClaims = onDocumentWritten({
    document: "user_roles/{email}",
    database: "sahs-archives",
    maxInstances: 10
}, async (event) => {
    const email = event.params.email.toLowerCase();
    const after = event.data.after.exists ? event.data.after.data() : null;
    const role = after && VALID_ROLES.includes(after.role) ? after.role : null;

    try {
        if (role) {
            await applyRoleClaim(email, role);
        } else {
            // Doc deleted, or role field cleared/invalid — revoke the claim.
            const user = await admin.auth().getUserByEmail(email).catch((err) => {
                if (err.code === "auth/user-not-found") return null;
                throw err;
            });
            if (user && user.customClaims && user.customClaims.role) {
                const { role: _dropped, ...rest } = user.customClaims;
                await admin.auth().setCustomUserClaims(user.uid, rest);
                logger.info(`Revoked role claim for ${email} (uid ${user.uid}).`);
            }
        }
    } catch (err) {
        logger.error(`Failed to sync role claim for ${email}:`, err);
        throw err;
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
    const db = getFirestore("sahs-archives");
    const roleDoc = await db.collection("user_roles").doc(email).get();
    const role = roleDoc.exists && VALID_ROLES.includes(roleDoc.data().role) ? roleDoc.data().role : null;

    if (request.auth.token.role === role) {
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
