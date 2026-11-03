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
 *   INVITATION_FROM_ADDRESS   optional environment variable (functions/.env) —
 *                             an address on a Resend-verified domain. Defaults
 *                             to the SAHS one: only updates.senoiahistory.com is
 *                             verified, not the apex (see sahs-website CLAUDE.md).
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
const { getFirestore } = require("firebase-admin/firestore");
const { SITE_URL } = require("./shared/seo.cjs");
const { newCollaborators, buildInvitationEmail, resendRequest } = require("./shareInvitationRules");

const DATABASE = "sahs-archives";
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const INVITATION_FROM_ADDRESS = process.env.INVITATION_FROM_ADDRESS || "archives@updates.senoiahistory.com";

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
        const member = await getFirestore(DATABASE).collection("members").doc(email).get();
        if (member.exists && typeof member.data().name === "string") name = member.data().name.trim();
    }
    return { email, name };
}

exports.sendShareInvitation = onDocumentUpdatedWithAuthContext({
    document: "research_folders/{folderId}",
    database: DATABASE,
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
        getFirestore(DATABASE).collection("site_settings").doc("appearance").get(),
    ]);
    const museumName = appearance.exists ? appearance.data().museumName : "";
    const emulated = process.env.FUNCTIONS_EMULATOR === "true";
    const apiKey = emulated ? "" : RESEND_API_KEY.value();

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
