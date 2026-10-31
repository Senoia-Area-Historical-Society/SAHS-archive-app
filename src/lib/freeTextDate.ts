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

const MONTH = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;
const MONTH_PREFIXES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * A number that orders free-text dates chronologically — YYYYMMDD, with 00 for a
 * month or day the text doesn't give — or null when the text names no year.
 *
 * Comparing the text itself put "March 3, 1911" after "1940" and "c. 1890" after
 * both. So: an ISO or US numeric date (04/12/1858) gives all three parts,
 * otherwise the first four-digit number is the year ("c. 1890", "1940s",
 * "1850-1900"), with a month name and a day of the month when the text has them
 * ("March 3, 1911", "3 March 1911").
 */
export function freeTextDateSortKey(text: string | null | undefined): number | null {
    const trimmed = text?.trim() ?? '';
    const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return Number(iso[1]) * 10000 + Number(iso[2]) * 100 + Number(iso[3]);

    // US numeric, as the birth and founding date fields store it: 04/12/1858
    const us = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (us) return Number(us[3]) * 10000 + Number(us[1]) * 100 + Number(us[2]);

    const year = trimmed.match(/\b(\d{4})\b/);
    if (!year) return null;

    const monthName = trimmed.match(MONTH)?.[1].toLowerCase();
    const month = monthName ? MONTH_PREFIXES.indexOf(monthName.slice(0, 3)) + 1 : 0;
    const dayText = month ? trimmed.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/)?.[1] : undefined;
    const day = dayText && Number(dayText) >= 1 && Number(dayText) <= 31 ? Number(dayText) : 0;

    return Number(year[1]) * 10000 + month * 100 + day;
}
