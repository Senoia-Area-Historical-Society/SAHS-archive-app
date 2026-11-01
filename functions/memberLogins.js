/**
 * Keeps member_logins/{secondary email} = { memberId } in step with the
 * secondary emails on member records — see memberLoginRules.js for why it
 * exists and what each change does.
 *
 * scripts/backfill-member-logins.cjs creates the pointers for records that
 * already had a secondary email before this function was deployed.
 */

const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions");
const { getFirestore } = require("firebase-admin/firestore");
const { memberLoginChanges } = require("./memberLoginRules");

const DATABASE = "sahs-archives";

exports.syncMemberLogins = onDocumentWritten({
    document: "members/{memberId}",
    database: DATABASE,
    maxInstances: 10
}, async (event) => {
    const memberId = event.params.memberId;
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after.exists ? event.data.after.data() : null;
    const { remove, set } = memberLoginChanges(before, after);
    const logins = getFirestore(DATABASE).collection("member_logins");

    if (remove) {
        const ref = logins.doc(remove);
        const snap = await ref.get();
        if (snap.exists && snap.data().memberId === memberId) {
            await ref.delete();
            logger.info(`Removed secondary login ${remove} from member ${memberId}.`);
        }
    }

    if (set) {
        const ref = logins.doc(set);
        const snap = await ref.get();
        if (!snap.exists || snap.data().memberId !== memberId) {
            if (snap.exists) {
                logger.warn(`Secondary login ${set} moved from member ${snap.data().memberId} to ${memberId}.`);
            }
            await ref.set({ memberId, updatedAt: new Date().toISOString() });
            logger.info(`Set secondary login ${set} for member ${memberId}.`);
        }
    }
});
