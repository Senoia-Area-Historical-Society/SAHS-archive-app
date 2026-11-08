/**
 * Keyword search that forgives the way people actually type.
 *
 * The search boxes used to look for the typed text as one exact substring, so
 * "whistel", "1911 letter mayor" or "Holis" found nothing. This matches word by
 * word instead:
 *
 *  - Word order and filler words don't matter: every other word must appear
 *    somewhere in the record, in any field.
 *  - A word matches the start of a longer one ("photo" → "photographs") and a
 *    plural or other short ending is dropped ("letters" → "letter").
 *  - A misspelled word matches a word within one or two edits of it — but only
 *    when the typed word appears nowhere in the archive. "mill" is in the
 *    archive, so it never also matches "will" or "milk"; "whistel" is not, so it
 *    is read as "whistle".
 *  - Numbers (years, ID numbers) are never corrected: 1911 must not match 1912.
 *  - When no record has every word, the records with the most of them are
 *    returned, so a long question still finds something.
 *
 * Results carry a score, so pages can list the best match first: words in the
 * title count for more than words deep in a transcription.
 *
 * Everything runs in the browser over records the page has already loaded, so it
 * costs nothing and works the same for every museum and in the demo.
 */

export interface SearchField<T> {
    get: (record: T) => string | number | readonly (string | null | undefined)[] | null | undefined;
    weight: number;
}

interface Posting {
    record: number;
    weight: number;
}

export interface SearchIndex<T> {
    records: readonly T[];
    /** Every word in the records, with the records it appears in and its best field weight there. */
    vocabulary: Map<string, Posting[]>;
    /** Each record's text per field: normalised for the whole-phrase bonus, and as entered (lower case) for exact search. */
    fieldText: { text: string; raw: string; weight: number }[][];
}

export interface SearchHit<T> {
    record: T;
    score: number;
}

const STOP_WORDS = new Set([
    'a', 'an', 'and', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'from', 'with', 'by',
    'about', 'as', 'is', 'was', 'were', 'are', 'be', 'this', 'that', 'it', 'its', 'or',
]);

/** Lower case, accents and apostrophes removed, anything else that isn't a letter or digit turned into a space. */
export function normalise(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/['’‘`]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function words(text: string): string[] {
    const normalised = normalise(text);
    return normalised ? normalised.split(' ') : [];
}

/** The words of a query worth searching for: filler words go, unless that would leave nothing. */
export function queryTerms(query: string): string[] {
    const all = [...new Set(words(query))];
    const meaningful = all.filter(w => !STOP_WORDS.has(w));
    return meaningful.length > 0 ? meaningful : all;
}

function fieldValues<T>(field: SearchField<T>, record: T): string[] {
    const value = field.get(record);
    if (value === null || value === undefined) return [];
    if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
    return [String(value)];
}

export function buildSearchIndex<T>(records: readonly T[], fields: readonly SearchField<T>[]): SearchIndex<T> {
    const vocabulary = new Map<string, Posting[]>();
    const fieldText = records.map((record, index) => {
        const best = new Map<string, number>();
        const texts: { text: string; raw: string; weight: number }[] = [];
        for (const field of fields) {
            for (const value of fieldValues(field, record)) {
                const text = normalise(value);
                if (!text) continue;
                texts.push({ text, raw: value.toLowerCase(), weight: field.weight });
                for (const word of text.split(' ')) {
                    if ((best.get(word) ?? 0) < field.weight) best.set(word, field.weight);
                }
            }
        }
        for (const [word, weight] of best) {
            const postings = vocabulary.get(word);
            if (postings) postings.push({ record: index, weight });
            else vocabulary.set(word, [{ record: index, weight }]);
        }
        return texts;
    });
    return { records, vocabulary, fieldText };
}

/**
 * Edit distance counting a swap of two neighbouring letters as one edit
 * ("whistel" → "whistle"). Gives up and returns `max + 1` once it is certain to
 * exceed `max`.
 */
export function editDistance(a: string, b: string, max: number): number {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let previousPrevious: number[] = [];
    let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const current = [i];
        let rowMin = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            let value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                value = Math.min(value, previousPrevious[j - 2] + 1);
            }
            current[j] = value;
            if (value < rowMin) rowMin = value;
        }
        if (rowMin > max) return max + 1;
        previousPrevious = previous;
        previous = current;
    }
    return previous[b.length];
}

const hasDigit = (word: string) => /\d/.test(word);

/** How many typing mistakes to forgive in a word of this length. */
function allowedEdits(term: string): number {
    if (hasDigit(term)) return 0;
    if (term.length >= 8) return 2;
    if (term.length >= 4) return 1;
    return 0;
}

/** How well an archive word answers a typed one, from 0 (not at all) to 1 (exactly). */
function closeMatch(term: string, word: string): number {
    if (word === term) return 1;
    // Still being typed, or a longer form: "photo" → "photographs".
    if (word.startsWith(term) && (term.length >= 2 || hasDigit(term))) return 0.85;
    // A plural or short ending on the typed word: "letters" → "letter".
    if (!hasDigit(term) && word.length >= 4 && term.startsWith(word) && term.length - word.length <= 2) return 0.85;
    return 0;
}

/**
 * For each word typed, how well each record answers it: the best of its word
 * weight × match quality.
 */
function scoresForTerm<T>(index: SearchIndex<T>, term: string): Map<number, number> {
    const scores = new Map<number, number>();
    const add = (word: string, quality: number) => {
        for (const { record, weight } of index.vocabulary.get(word) ?? []) {
            const score = weight * quality;
            if ((scores.get(record) ?? 0) < score) scores.set(record, score);
        }
    };

    for (const word of index.vocabulary.keys()) {
        const quality = closeMatch(term, word);
        if (quality > 0) add(word, quality);
    }

    // Only a word the archive doesn't contain is treated as a misspelling.
    const edits = allowedEdits(term);
    if (scores.size === 0 && edits > 0) {
        for (const word of index.vocabulary.keys()) {
            if (hasDigit(word)) continue;
            const distance = editDistance(term, word, edits);
            if (distance <= edits) add(word, 0.7 - 0.1 * (distance - 1));
        }
    }
    return scores;
}

/**
 * The records matching `query`, best first. Records matching every word come
 * back if there are any; otherwise those matching the most words (at least half
 * of them). An empty query matches nothing — the caller decides what "no search"
 * shows.
 */
export function forgivingSearch<T>(index: SearchIndex<T>, query: string): SearchHit<T>[] {
    const terms = queryTerms(query);
    if (terms.length === 0) return [];

    const totals = new Map<number, { score: number; matched: number }>();
    for (const term of terms) {
        for (const [record, score] of scoresForTerm(index, term)) {
            const total = totals.get(record) ?? { score: 0, matched: 0 };
            total.score += score;
            total.matched += 1;
            totals.set(record, total);
        }
    }
    if (totals.size === 0) return [];

    const mostMatched = Math.max(...[...totals.values()].map(t => t.matched));
    if (mostMatched < Math.ceil(terms.length / 2)) return [];

    // The query as typed, as a phrase somewhere in the record: a strong sign.
    const phrase = words(query).length > 1 ? normalise(query) : '';

    const hits: (SearchHit<T> & { order: number })[] = [];
    for (const [record, { score, matched }] of totals) {
        if (matched < mostMatched) continue;
        let total = score;
        if (phrase) {
            const best = Math.max(0, ...index.fieldText[record].filter(f => f.text.includes(phrase)).map(f => f.weight));
            total += best * 2;
        }
        hits.push({ record: index.records[record], score: total, order: record });
    }
    hits.sort((a, b) => b.score - a.score || a.order - b.order);
    return hits.map(({ record, score }) => ({ record, score }));
}

/**
 * Exact search, for when the forgiving kind finds too much: the records
 * containing the text exactly as typed, ignoring only capitals, scored by the
 * most important field it appears in.
 */
export function exactSearch<T>(index: SearchIndex<T>, query: string): SearchHit<T>[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const hits: SearchHit<T>[] = [];
    index.fieldText.forEach((fields, record) => {
        const score = Math.max(0, ...fields.filter(f => f.raw.includes(needle)).map(f => f.weight));
        if (score > 0) hits.push({ record: index.records[record], score });
    });
    return hits.sort((a, b) => b.score - a.score);
}

/**
 * Each matching record's score, keyed by the record itself, for pages that
 * filter and sort their own lists. Null when the query is empty: no search, so
 * everything matches.
 */
export function searchScores<T>(index: SearchIndex<T>, query: string, exact = false): Map<T, number> | null {
    if (!query.trim()) return null;
    const hits = exact ? exactSearch(index, query) : forgivingSearch(index, query);
    return new Map(hits.map(hit => [hit.record, hit.score]));
}
