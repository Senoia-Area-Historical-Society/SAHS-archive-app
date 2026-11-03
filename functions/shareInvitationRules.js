/**
 * The decisions and content behind functions/shareInvitation.js, as pure
 * functions.
 *
 * DELIBERATELY FREE OF IMPORTS so `src/test/` can exercise them — the same split
 * as collectionPrivacyRules.js / collectionPrivacy.js.
 *
 * When a research folder is shared, its new collaborator is emailed an
 * invitation. That used to be written by the browser into the website's `mail`
 * queue, which the website closed in Sept 2026 because anyone could queue any
 * message there — so the write was refused, no invitation was sent, and the
 * member was told "Failed to share folder" for a share that had worked. The
 * email is now sent server-side, only for an address that firestore.rules has
 * already let onto the folder's `sharedWith`.
 */

const RESEND_URL = "https://api.resend.com/emails";

/** Escapes text for interpolation into the HTML body. Folder names and
 * descriptions are typed by members. */
function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function normalisedList(list) {
    if (!Array.isArray(list)) return [];
    return list
        .filter(e => typeof e === "string")
        .map(e => e.trim().toLowerCase())
        .filter(Boolean);
}

/**
 * The addresses to invite when a folder goes from `before` to `after`: those
 * newly in `sharedWith`, without duplicates and never the owner. A folder being
 * created starts unshared (firestore.rules), so only updates invite anyone.
 */
function newCollaborators(before, after) {
    if (!before || !after) return [];
    const had = new Set(normalisedList(before.sharedWith));
    const owner = typeof after.ownerEmail === "string" ? after.ownerEmail.trim().toLowerCase() : "";
    return [...new Set(normalisedList(after.sharedWith))].filter(e => !had.has(e) && e !== owner);
}

/**
 * The invitation email, as a Resend `POST /emails` body.
 *
 * `museumName` is site_settings/appearance.museumName and `siteUrl` the
 * archive's own address (SITE_URL), so another install names itself and links
 * to itself. Replies go to whoever shared the folder.
 */
function buildInvitationEmail({ to, fromAddress, museumName, siteUrl, folderName, folderDescription, sharerName, sharerEmail }) {
    const museum = museumName || "the archive";
    const folder = folderName || "Untitled folder";
    const workspaceUrl = `${String(siteUrl).replace(/\/+$/, "")}/my-research`;
    const sharer = sharerName && sharerName !== sharerEmail ? `${sharerName} (${sharerEmail})` : sharerEmail;

    const text = [
        `${sharer} has shared the research folder "${folder}" with you.`,
        folderDescription ? `\n${folderDescription}\n` : "",
        `Open it in your ${museum} Research Workspace: ${workspaceUrl}`,
    ].join("\n");

    const html = `
<div style="font-family: sans-serif; padding: 24px; max-width: 600px; margin: auto; background-color: #faf7f2; border: 1px solid #e1d8c7; border-radius: 8px;">
  <h2 style="color: #2b2b2b; font-family: serif; border-bottom: 1px solid #e1d8c7; padding-bottom: 12px; margin-top: 0;">${escapeHtml(museum)} Research Workspace</h2>
  <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;"><strong>${escapeHtml(sharer)}</strong> has shared a research folder with you:</p>
  <div style="background-color: #ffffff; padding: 16px; border-left: 4px solid #c8b89c; border-radius: 4px; margin: 20px 0;">
    <h3 style="margin: 0; color: #2b2b2b; font-family: serif;">${escapeHtml(folder)}</h3>${folderDescription ? `
    <p style="margin: 8px 0 0 0; color: #666666; font-size: 13px; font-style: italic; line-height: 1.4;">${escapeHtml(folderDescription)}</p>` : ""}
  </div>
  <p style="color: #4a4a4a; font-size: 14px; line-height: 1.6;">You can view the folder, add archive items to it and share notes with its other collaborators.</p>
  <a href="${escapeHtml(workspaceUrl)}" style="display: inline-block; background-color: #2b2b2b; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 16px;">Open Research Workspace</a>
  <hr style="border: 0; border-top: 1px solid #e1d8c7; margin: 24px 0;" />
  <p style="font-size: 11px; color: #8c8c8c; margin-bottom: 0;">Sent by the ${escapeHtml(museum)} online archive because a member shared a folder with this address.</p>
</div>`;

    return {
        from: `${museum.replace(/[<>"]/g, "")} <${fromAddress}>`,
        to: [to],
        reply_to: sharerEmail,
        subject: `${sharer} shared a research folder with you`,
        text,
        html,
    };
}

/**
 * The fetch() arguments to send `email` through Resend. The idempotency key
 * stops a retried trigger sending the same invitation twice.
 */
function resendRequest(email, apiKey, idempotencyKey) {
    return {
        url: RESEND_URL,
        init: {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "Idempotency-Key": idempotencyKey,
            },
            body: JSON.stringify(email),
        },
    };
}

module.exports = { escapeHtml, newCollaborators, buildInvitationEmail, resendRequest };
