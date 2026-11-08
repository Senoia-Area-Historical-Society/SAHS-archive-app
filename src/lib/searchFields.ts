import type { SearchField } from './forgivingSearch';
import type { ArchiveItem, LibraryBook, MuseumLocation } from '../types/database';

/**
 * What the keyword boxes search, and how much a match in each field counts —
 * see forgivingSearch.ts. Names and IDs count most, long text least, so a word
 * in a title ranks above the same word deep in a transcription.
 */

export const ARCHIVE_ITEM_SEARCH_FIELDS: SearchField<ArchiveItem>[] = [
    { get: i => i.title, weight: 4 },
    { get: i => i.full_name, weight: 4 },
    { get: i => i.org_name, weight: 4 },
    { get: i => i.artifact_id, weight: 4 },
    { get: i => i.identifier, weight: 3 },
    { get: i => i.id, weight: 3 },
    { get: i => i.subject, weight: 2 },
    { get: i => i.tags, weight: 2 },
    { get: i => i.creator, weight: 2 },
    { get: i => i.also_known_as, weight: 2 },
    { get: i => i.alternative_names, weight: 2 },
    { get: i => i.occupation, weight: 1.5 },
    { get: i => i.coverage, weight: 1 },
    { get: i => i.birthplace, weight: 1 },
    { get: i => i.date, weight: 1 },
    { get: i => i.founding_date, weight: 1 },
    { get: i => i.dissolved_date, weight: 1 },
    { get: i => i.description, weight: 1 },
    { get: i => i.transcription, weight: 0.5 },
];

export const LIBRARY_BOOK_SEARCH_FIELDS: SearchField<LibraryBook>[] = [
    { get: b => b.title, weight: 4 },
    { get: b => b.isbn, weight: 4 },
    // The ISBN without its hyphens too, so it is found however it was typed.
    { get: b => b.isbn?.replace(/[^0-9xX]/g, ''), weight: 4 },
    { get: b => b.call_number, weight: 4 },
    { get: b => b.authors, weight: 3 },
    { get: b => b.subjects, weight: 2 },
    { get: b => b.publisher, weight: 1 },
    { get: b => b.description, weight: 1 },
];

export const LOCATION_SEARCH_FIELDS: SearchField<MuseumLocation>[] = [
    { get: l => l.name, weight: 4 },
    { get: l => l.id, weight: 3 },
    { get: l => l.description, weight: 1 },
];
