/**
 * Display for dates that curators type as free text.
 *
 * Fields like `interview_date` are plain text inputs ("e.g. October 12, 1995"), and
 * the pages showed them with `new Date(text).toLocaleDateString()`. That fails
 * three ways:
 *
 *  - Text that isn't a full date ("Spring 1987", "c. 1950") became "Invalid Date".
 *  - A bare year was read as 1 January: "1995" showed as "January 1, 1995", a
 *    precision the record never had.
 *  - An ISO date ("2026-04-12") is read by the Date constructor as midnight UTC,
 *    so anywhere west of Greenwich it showed as the day before.
 *
 * So: an ISO date is parsed as a local calendar date, an ISO date-time is a real
 * instant and formats as one, and anything else is shown exactly as entered.
 */

export const LONG_DATE: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/**
 * A `YYYY-MM-DD` string as midnight local time, or null if the text is not one or
 * names a day that doesn't exist (2026-02-30).
 */
export function parseIsoDateLocal(text: string | null | undefined): Date | null {
    const match = text?.trim().match(ISO_DATE);
    if (!match) return null;
    const [year, month, day] = match.slice(1).map(Number);
    const date = new Date(2000, month - 1, day);
    // The constructor maps years 0-99 to 1900-1999; set the year separately.
    date.setFullYear(year);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
        return null;
    }
    return date;
}

/**
 * Free-text date for display. Never returns "Invalid Date"; blank input returns
 * an empty string so callers can keep their own "Not recorded" fallback.
 */
export function formatFreeTextDate(
    text: string | null | undefined,
    options: Intl.DateTimeFormatOptions = LONG_DATE,
    locales?: Intl.LocalesArgument,
): string {
    const trimmed = text?.trim() ?? '';
    if (!trimmed) return '';

    const local = parseIsoDateLocal(trimmed);
    if (local) return local.toLocaleDateString(locales, options);

    if (ISO_DATE_TIME.test(trimmed)) {
        const instant = new Date(trimmed);
        if (!Number.isNaN(instant.getTime())) return instant.toLocaleDateString(locales, options);
    }

    return trimmed;
}
