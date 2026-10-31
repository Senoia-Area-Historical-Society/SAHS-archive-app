/**
 * Accession paperwork — read and write helpers for the staff-only subcollection.
 *
 * `accession_paperwork_urls` used to live as a field on the `archive_items`
 * document itself, which `firestore.rules` makes world-readable (the archive is
 * public). The field is described in `src/types/database.ts:169` as
 * "Admin/Curator only scans of paperwork" and is rendered in no public view —
 * only `EditItem` reads it back — so the effect was to publish the storage paths
 * of donor and provenance scans to anyone, for no feature's benefit.
 *
 * It now lives at `archive_items/{id}/provenance/paperwork`, gated at
 * `isSAHSUser()`.
 *
 * ── Transition state ─────────────────────────────────────────────────────────
 *
 * The rollout was: copy the field into the subcollection with
 * `scripts/migrate-item-privacy-and-paperwork.cjs --prod`, deploy a client that
 * reads and writes the subcollection (still writing the parent field too, for
 * cached bundles), drop that parent write, then remove the field from the
 * documents with `--delete-legacy`.
 *
 * `writeLegacyField` is now false and `loadAccessionPaperwork` no longer reads the
 * parent field, so this client neither publishes nor depends on it — every
 * paperwork save had been copying the list back onto the world-readable document.
 * What remains is the last step: run the script with `--prod --delete-legacy` to
 * strip the field from the documents that still carry it. Until then those
 * copies stay readable, but nothing refreshes or extends them.
 */

import { arrayUnion, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Whether saves also copy the list onto the parent document. False, because that
 * copy is world-readable; kept only so the transition above stays legible.
 */
const writeLegacyField = false;

const paperworkRef = (itemId: string) =>
    doc(db, 'archive_items', itemId, 'provenance', 'paperwork');

/**
 * The item's accession paperwork URLs, or null if they could not be read.
 *
 * Null rather than [] on failure, because to a caller that saves the two mean
 * different things: [] is "this item has no paperwork", null is "unknown".
 * EditItem used to get [] for both, so a save made before the read resolved — or
 * after it failed — wrote `[] + new uploads` over the real list.
 *
 * There is deliberately no fallback to the parent document's legacy
 * `accession_paperwork_urls`: that copy is world-readable and on its way out, and
 * nothing should keep it load-bearing. A missing subcollection document is a
 * successful read of "no paperwork".
 */
export async function loadAccessionPaperwork(itemId: string): Promise<string[] | null> {
    try {
        const snap = await getDoc(paperworkRef(itemId));
        const urls = snap.exists() ? snap.data()?.accession_paperwork_urls : undefined;
        return Array.isArray(urls) ? urls : [];
    } catch (err) {
        // Denied or offline. Warned rather than swallowed silently, because a
        // staff user seeing an empty paperwork list should be traceable to a cause.
        console.warn('Could not read provenance paperwork:', err);
        return null;
    }
}

/**
 * Replaces the paperwork URLs in the staff-only subcollection. Only for a caller
 * that actually holds the current list — otherwise use appendAccessionPaperwork.
 *
 * Returns the patch the caller should merge into its own `archive_items` update
 * so there is exactly one write to the parent document. With `writeLegacyField`
 * off it is always empty.
 */
export async function saveAccessionPaperwork(
    itemId: string,
    urls: string[]
): Promise<{ accession_paperwork_urls?: string[] }> {
    await setDoc(paperworkRef(itemId), {
        accession_paperwork_urls: urls,
        updatedAt: new Date().toISOString(),
    }, { merge: true });

    return writeLegacyField ? { accession_paperwork_urls: urls } : {};
}

/**
 * Adds paperwork URLs without knowing the current list.
 *
 * For a save made while the list is unknown — still loading, or the read failed.
 * `arrayUnion` appends on the server, so the new uploads are kept and the
 * existing entries are never overwritten.
 */
export async function appendAccessionPaperwork(itemId: string, urls: string[]): Promise<void> {
    if (urls.length === 0) return;
    await setDoc(paperworkRef(itemId), {
        accession_paperwork_urls: arrayUnion(...urls),
        updatedAt: new Date().toISOString(),
    }, { merge: true });
}
