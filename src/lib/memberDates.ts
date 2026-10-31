/**
 * Dates on the membership roll, and the edits Admin Settings makes to a member.
 *
 * Extracted from `AdminSettings` so they can be tested.
 *
 * ── Why date-only strings need their own parser ──────────────────────────────
 *
 * `expiresAt` is stored as a bare `YYYY-MM-DD`. JavaScript parses that form as
 * midnight **UTC**, not local time, so `new Date('2027-03-01').toLocaleDateString()`
 * printed "2/28/2027" for anyone west of Greenwich — every US museum saw each
 * expiry date one day early. The same parse made a membership count as expired
 * from about 7 or 8pm Eastern on the evening *before* its last day.
 *
 * `joinedAt` is a full ISO timestamp, which carries its own time and parses
 * correctly, so only the date-only form is special-cased.
 */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses a member date. `YYYY-MM-DD` becomes local midnight; anything else goes to `Date`. */
export function parseMemberDate(value: string | null | undefined): Date | null {
    if (!value) return null;
    const m = DATE_ONLY.exec(value);
    const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
    return isNaN(date.getTime()) ? null : date;
}

/** Formats a member date for display, or `fallback` when it is missing or unreadable. */
export function formatMemberDate(
    value: string | null | undefined,
    options?: Intl.DateTimeFormatOptions,
    fallback = 'N/A',
): string {
    const date = parseMemberDate(value);
    return date ? date.toLocaleDateString(undefined, options) : fallback;
}

/** A local date as `YYYY-MM-DD` — what `<input type="date">` and `expiresAt` hold. */
export function toDateOnly(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** A year from today, the default expiry for a new or reactivated member. */
export function oneYearFromToday(now = new Date()): string {
    const next = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    return toDateOnly(next);
}

/**
 * Whether an expiry date has passed. A membership runs to the end of its
 * `expiresAt` day, which is how `isActiveMember()` in firestore.rules reads it
 * (`expiresAt >= today`).
 */
export function isMembershipDatePast(expiresAt: string | null | undefined, now = new Date()): boolean {
    if (!expiresAt || expiresAt === 'Never') return false;
    const expiry = parseMemberDate(expiresAt);
    if (!expiry) return false;
    if (DATE_ONLY.test(expiresAt)) return expiresAt < toDateOnly(now);
    return expiry < now;
}

/**
 * The expiry "Renew 1yr" sets: a year on from the current expiry if it is still
 * ahead, otherwise a year on from today, so a lapsed member is not renewed into
 * a date that has already passed.
 */
export function renewedExpiry(expiresAt: string, now = new Date()): string {
    const current = parseMemberDate(expiresAt);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const base = current && current > today ? current : today;
    return toDateOnly(new Date(base.getFullYear() + 1, base.getMonth(), base.getDate()));
}

/** The member fields the Edit form manages. Everything else on the record is left alone. */
export interface MemberEditFields {
    name: string;
    email: string;
    secondaryEmail?: string | null;
    secondaryName?: string | null;
    expiresAt: string;
    isRecurring?: boolean;
    isFreeOneYear?: boolean;
    status?: 'active' | 'expired';
}

/**
 * The fields an edit actually changed, normalised the way they are stored.
 *
 * Saving an edit used to `setDoc` a fresh object over the whole record. Anything
 * the form did not list was dropped — most visibly `hasCompletedMemberWizard`,
 * so every member an admin edited was shown the Member Setup Wizard again on
 * their next sign-in. Writing only what changed leaves the rest as it was.
 */
export function memberEditChanges(original: MemberEditFields, edited: MemberEditFields): Partial<MemberEditFields> {
    const normalise = (f: MemberEditFields): MemberEditFields => ({
        name: f.name.trim(),
        email: f.email.trim().toLowerCase(),
        secondaryEmail: f.secondaryEmail?.trim().toLowerCase() || null,
        secondaryName: f.secondaryName?.trim() || null,
        expiresAt: f.expiresAt,
        isRecurring: f.isRecurring || false,
        isFreeOneYear: f.isFreeOneYear || false,
        status: f.status,
    });
    const before = normalise(original);
    const after = normalise(edited);
    const changes: Partial<MemberEditFields> = {};
    for (const key of Object.keys(after) as (keyof MemberEditFields)[]) {
        if (after[key] !== undefined && after[key] !== before[key]) {
            (changes as Record<string, unknown>)[key] = after[key];
        }
    }
    return changes;
}
