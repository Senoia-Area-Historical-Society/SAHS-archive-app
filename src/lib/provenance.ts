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
 * `saveAccessionPaperwork` deliberately writes BOTH locations for now, and
 * `loadAccessionPaperwork` prefers the subcollection but falls back to the legacy
 * field. That is what makes the rollout safe in either order: a curator on a
 * cached bundle that still reads the old field keeps working, and a document that
 * has not been migrated yet still resolves.
 *
 * Once `scripts/migrate-item-privacy-and-paperwork.cjs --prod` has run and this
 * client is deployed, the legacy half comes out in two steps — drop
 * `writeLegacyField` here, deploy, then run the script again with
 * `--delete-legacy` to remove the field from the documents. Do not delete the
 * field before this client is live, or curators lose their paperwork links.
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

/** Set false once the migration has run and this client is deployed everywhere. */
const writeLegacyField = true;

const paperworkRef = (itemId: string) =>
    doc(db, 'archive_items', itemId, 'provenance', 'paperwork');

/**
 * The item's accession paperwork URLs.
 *
 * `legacyValue` is whatever the parent document carries, passed in by the caller
 * that already has it, so an unmigrated item still resolves without a second
 * read. Returns [] rather than throwing: a non-staff caller is denied by the
 * rules, and this is only ever rendered on staff screens.
 */
export async function loadAccessionPaperwork(
    itemId: string,
    legacyValue?: string[] | null
): Promise<string[]> {
    try {
        const snap = await getDoc(paperworkRef(itemId));
        const urls = snap.exists() ? snap.data()?.accession_paperwork_urls : undefined;
        if (Array.isArray(urls)) return urls;
    } catch (err) {
        // Denied or offline — fall through to whatever the parent had. Warned
        // rather than swallowed silently, because a staff user seeing an empty
        // paperwork list should be traceable to a cause.
        console.warn('Could not read provenance paperwork; falling back to the legacy field:', err);
    }
    return Array.isArray(legacyValue) ? legacyValue : [];
}

/**
 * Writes the paperwork URLs to the staff-only subcollection, and (during the
 * transition) to the legacy field as well.
 *
 * Returns the patch the caller should merge into its own `archive_items` update
 * so there is exactly one write to the parent document, rather than this helper
 * racing the caller's own save.
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
