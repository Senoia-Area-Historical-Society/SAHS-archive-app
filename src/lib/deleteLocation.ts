/**
 * Deleting a storage location (shelf, box, cabinet) without leaving anything
 * pointing at it.
 *
 * The list pages (ManageLocations, ManageRoomLocations) used to `deleteDoc` the
 * location and nothing else. Its items and books kept `museum_location_ids`
 * naming a location that no longer existed — so the Audit Dashboard still
 * counted them as placed and they never appeared under "Unplaced Artifacts" —
 * and boxes nested in it kept a dead `parent_location_id`, which hides them
 * from the room view. ManageRoomLocations' confirm dialog even promised to
 * "UNLINK all related artifacts". This does what LocationDetail's
 * `handleDeleteBox` already did, for every caller.
 *
 * Items and books may name a location by its slug (`id`) or its document id,
 * so both are matched.
 */

import { collection, deleteDoc, deleteField, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from './firebase';

const BATCH_LIMIT = 400; // under Firestore's 500-write cap, with headroom

export interface DeletedLocationCounts {
    items: number;
    books: number;
    boxes: number;
}

export async function deleteLocationAndUnassign(
    location: { docId: string; id?: string | null },
    actorEmail: string,
): Promise<DeletedLocationCounts> {
    const ids = Array.from(new Set([location.id, location.docId].filter((v): v is string => !!v)));
    const now = new Date().toISOString();

    const [itemsByList, itemsByLegacy, books, boxes] = await Promise.all([
        getDocs(query(collection(db, 'archive_items'), where('museum_location_ids', 'array-contains-any', ids))),
        getDocs(query(collection(db, 'archive_items'), where('museum_location_id', 'in', ids))),
        getDocs(query(collection(db, 'library_books'), where('museum_location_ids', 'array-contains-any', ids))),
        getDocs(query(collection(db, 'locations'), where('parent_location_id', '==', location.docId))),
    ]);

    const writes: ((batch: ReturnType<typeof writeBatch>) => void)[] = [];

    const items = new Map([...itemsByList.docs, ...itemsByLegacy.docs].map(d => [d.id, d]));
    items.forEach(itemDoc => {
        const data = itemDoc.data();
        const remaining = ((data.museum_location_ids as string[] | undefined) || []).filter(l => !ids.includes(l));
        const updates: Record<string, unknown> = {
            museum_location_ids: remaining,
            last_tagged_at: now,
            last_tagged_by: actorEmail,
        };
        if (ids.includes(data.museum_location_id)) updates.museum_location_id = remaining[0] ?? null;
        if (remaining.length === 0) updates.stage = 'Unassigned';
        writes.push(batch => batch.update(itemDoc.ref, updates));
    });

    books.docs.forEach(bookDoc => {
        const remaining = ((bookDoc.data().museum_location_ids as string[] | undefined) || []).filter(l => !ids.includes(l));
        writes.push(batch => batch.update(bookDoc.ref, {
            museum_location_ids: remaining,
            updated_at: now,
            updated_by_email: actorEmail,
        }));
    });

    // Nested boxes become top-level locations in the same room, as on LocationDetail.
    boxes.docs.forEach(boxDoc => {
        writes.push(batch => batch.update(boxDoc.ref, { parent_location_id: deleteField() }));
    });

    for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        writes.slice(i, i + BATCH_LIMIT).forEach(write => write(batch));
        await batch.commit();
    }

    // Last, so a failure part-way leaves the location in place to retry from.
    await deleteDoc(doc(db, 'locations', location.docId));

    return { items: items.size, books: books.size, boxes: boxes.size };
}
