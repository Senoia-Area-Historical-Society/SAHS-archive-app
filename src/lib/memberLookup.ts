/**
 * The member record an email address belongs to: its own record, keyed by the
 * address, or — for a spouse or family member listed as a secondary email —
 * the record that lists it.
 *
 * A secondary address has no record of its own, and only staff may search the
 * members collection, so the old `where('secondaryEmail', '==', email)` query
 * was refused for exactly the people it was for. member_logins/{email}, kept by
 * functions/memberLogins.js, says which record to read instead. The record must
 * still list the address — firestore.rules checks the same — so a stale pointer
 * finds nothing.
 *
 * Returns null when the address is on no record. Errors (a refused read) are
 * thrown for the caller to handle.
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { Member } from '../types/database';

export async function findMemberRecord(email: string): Promise<Member | null> {
    const address = email.trim().toLowerCase();

    const own = await getDoc(doc(db, 'members', address));
    if (own.exists()) return { id: own.id, ...own.data() } as Member;

    const login = await getDoc(doc(db, 'member_logins', address));
    const memberId: unknown = login.exists() ? login.data().memberId : null;
    if (typeof memberId !== 'string' || !memberId) return null;

    const record = await getDoc(doc(db, 'members', memberId));
    if (!record.exists() || record.data().secondaryEmail !== address) return null;
    return { id: record.id, ...record.data() } as Member;
}
