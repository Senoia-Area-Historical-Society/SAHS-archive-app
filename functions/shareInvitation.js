/**
 * Emails a research folder's new collaborator an invitation, through Resend.
 * See shareInvitationRules.js for why this is server-side and who is invited.
 *
 * Runs on every folder update but sends only for addresses newly in
 * `sharedWith`, which firestore.rules lets only the owner or staff add, and only
 * for an active member or staff. So the most anyone can do is email someone
 * they were already allowed to share with.
 *
 * Configuration:
 *   RESEND_API_KEY            secret (Secret Manager) — the same Resend account
 *                             the website sends from
 *   INVITATION_FROM_ADDRESS   environment variable (functions/.env.<project id>) —
 *                             an address on a domain verified in that Resend
 *                             account. No default: with a key but no address,
 *                             nothing is sent and the function logs an error.
 *                             Not a defineString() param: CI deploys
 *                             non-interactively, and the CLI refuses a param with
 *                             no stored value there even when it has a default.
 *
 * The emulator never sends: it logs the email instead, so `npm run demo` cannot
 * mail a real address.
 */

const { onDocumentUpdatedWithAuthContext } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { SITE_URL } = require("./shared/seo.cjs");
const { newCollaborators, buildInvitationEmail, resendRequest } = require("./shareInvitationRules");

const { ARCHIVE_DATABASE, archiveDb } = require("./database");
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const INVITATION_FROM_ADDRESS = process.env.INVITATION_FROM_ADDRESS || "";

/**
 * The person who made the share: the signed-in user behind the write when the
 * event carries one, otherwise the folder's owner (who is almost always it).
 */
async function sharerOf(event, folder) {
    let email = typeof folder.ownerEmail === "string" ? folder.ownerEmail.toLowerCase() : "";
    if (event.authId && event.authType !== "service_account" && event.authType !== "system") {
        try {
            const user = await admin.auth().getUser(event.authId);
            if (user.email) email = user.email.toLowerCase();
        } catch (err) {
            logger.warn(`shareInvitation: could not look up user ${event.authId}`, err);
        }
    }
    let name = "";
    if (email) {
        const member = await archiveDb().collection("members").doc(email).get();
        if (member.exists && typeof member.data().name === "string") name = member.data().name.trim();
    }
    return { email, name };
}

exports.sendShareInvitation = onDocumentUpdatedWithAuthContext({
    document: "research_folders/{folderId}",
    database: ARCHIVE_DATABASE,
    secrets: [RESEND_API_KEY],
    maxInstances: 5,
}, async (event) => {
    const folderId = event.params.folderId;
    const before = event.data.before.data();
    const after = event.data.after.data();
    const invitees = newCollaborators(before, after);
    if (invitees.length === 0) return;

    const [sharer, appearance] = await Promise.all([
        sharerOf(event, after),
        archiveDb().collection("site_settings").doc("appearance").get(),
    ]);
    const museumName = appearance.exists ? appearance.data().museumName : "";
    const emulated = process.env.FUNCTIONS_EMULATOR === "true";
    const apiKey = emulated ? "" : RESEND_API_KEY.value();
    if (apiKey && !SITE_URL) {
        // seo.cjs was bundled without SITE_URL (scripts/site-url.cjs), so the
        // email's only link would be relative and lead nowhere.
        logger.error(`shareInvitation: functions were built without SITE_URL — not sending invitations for folder ${folderId}`);
        return;
    }
    if (apiKey && !INVITATION_FROM_ADDRESS) {
        // Resend refuses a sender on a domain the account hasn't verified, and only
        // the install knows which domain that is.
        logger.error(`shareInvitation: INVITATION_FROM_ADDRESS is not set — not sending invitations for folder ${folderId}`);
        return;
    }

    for (const to of invitees) {
        const email = buildInvitationEmail({
            to,
            fromAddress: INVITATION_FROM_ADDRESS,
            museumName,
            siteUrl: SITE_URL,
            folderName: after.name,
            folderDescription: after.description,
            sharerName: sharer.name,
            sharerEmail: sharer.email,
        });

        if (!apiKey) {
            logger.info(`shareInvitation: ${emulated ? "emulator — not sending" : "RESEND_API_KEY not set — skipping"} invitation for folder ${folderId}`, { to, subject: email.subject, from: email.from });
            continue;
        }

        const { url, init } = resendRequest(email, apiKey, `share-${folderId}-${to}-${event.id}`);
        const res = await fetch(url, init);
        if (res.ok) {
            logger.info(`shareInvitation: invited ${to} to folder ${folderId}`);
        } else {
            logger.error(`shareInvitation: Resend refused the invitation for ${to} to folder ${folderId}`, { status: res.status, body: await res.text() });
        }
    }
});
