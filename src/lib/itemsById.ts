/**
 * Archive items by id, for lists that hold ids rather than a query: an item's
 * linked records, a research folder, the research map.
 *
 * For the public these cannot be a single `where(documentId(), 'in', ids)` query.
 * Firestore checks a query that names its documents against every one of them, so
 * one id in the list that is private — or that no longer exists — fails the whole
 * query with permission-denied, and the public items go with it. That is what
 * emptied a member's research folder, and an item's linked documents, as soon as
 * a curator made one of them private or deleted it.
 *
 * So for the public each id is read on its own, and the ones that are refused or
 * missing are dropped. Staff may read every item, so they keep the chunked `in`
 * query — 30 ids per query, Firestore's limit.
 *
 * Items come back in the order of `ids`.
 */

import { collection, doc, documentId, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';
import type { ArchiveItem } from '../types/database';

export async function fetchItemsByIds(ids: string[], isSAHSUser: boolean): Promise<ArchiveItem[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];

    let items: ArchiveItem[];
    if (isSAHSUser) {
        const chunks: string[][] = [];
        for (let i = 0; i < unique.length; i += 30) {
            chunks.push(unique.slice(i, i + 30));
        }
        const snaps = await Promise.all(chunks.map(chunk =>
            getDocs(query(collection(db, 'archive_items'), where(documentId(), 'in', chunk)))));
        items = snaps.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...d.data() }) as ArchiveItem));
    } else {
        const reads = await Promise.allSettled(unique.map(id => getDoc(doc(db, 'archive_items', id))));
        items = reads.flatMap(read =>
            read.status === 'fulfilled' && read.value.exists() && read.value.data().is_private === false
                ? [{ id: read.value.id, ...read.value.data() } as ArchiveItem]
                : []);
    }

    const position = new Map(unique.map((id, i) => [id, i]));
    return items.sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
}
