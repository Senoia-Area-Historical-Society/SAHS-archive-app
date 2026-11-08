import { describe, it, expect } from 'vitest';
import { buildSearchIndex, forgivingSearch, exactSearch, searchScores, editDistance, normalise, queryTerms, type SearchField } from '../lib/forgivingSearch';

interface Item {
    title: string;
    description?: string;
    tags?: string[];
    artifact_id?: string;
}

const items: Item[] = [
    { title: 'Mill Whistle', description: 'Steam whistle from the cotton mill.', artifact_id: '1001' },
    { title: 'Letter from Mayor Hollis, 1911', description: 'Handwritten letter to the town council.' },
    { title: 'Main Street Photograph, 1925', description: 'Photographs of the stores on Main Street.', tags: ['downtown'] },
    { title: 'Strike Banner', description: 'Painted banner carried by mill workers. They said it will be remembered.', artifact_id: '1003' },
    { title: 'Letter from Mayor Hollis, 1912', description: 'A second letter.' },
    { title: 'Café Menu', description: "O'Brien's lunch counter" },
];

const fields: SearchField<Item>[] = [
    { get: i => i.title, weight: 4 },
    { get: i => i.artifact_id, weight: 4 },
    { get: i => i.tags, weight: 2 },
    { get: i => i.description, weight: 1 },
];

const index = buildSearchIndex(items, fields);
const titles = (query: string) => forgivingSearch(index, query).map(h => h.record.title);

describe('forgivingSearch', () => {
    it('forgives a misspelling', () => {
        expect(titles('whistel')).toEqual(['Mill Whistle']);
        expect(titles('Holis')).toEqual(['Letter from Mayor Hollis, 1911', 'Letter from Mayor Hollis, 1912']);
        expect(titles('photgraph')).toEqual(['Main Street Photograph, 1925']);
    });

    it('ignores word order and filler words', () => {
        expect(titles('1911 letter mayor')).toEqual(['Letter from Mayor Hollis, 1911']);
        expect(titles('the whistle of the mill')).toEqual(['Mill Whistle']);
    });

    it('does not correct a word the archive contains', () => {
        // "mill" is a real word here, so it must not also match "will".
        expect(titles('mill')).toEqual(['Mill Whistle', 'Strike Banner']);
        expect(titles('will')).toEqual(['Strike Banner']);
    });

    it('never corrects numbers', () => {
        expect(titles('1911')).toEqual(['Letter from Mayor Hollis, 1911']);
        expect(titles('1001')).toEqual(['Mill Whistle']);
        expect(titles('1913')).toEqual([]);
    });

    it('matches the start of a longer word and drops plural endings', () => {
        expect(titles('photo')).toEqual(['Main Street Photograph, 1925']);
        expect(titles('banners')).toEqual(['Strike Banner']);
        expect(titles('100')).toEqual(['Mill Whistle', 'Strike Banner']);
    });

    it('lists title matches before description matches', () => {
        const hits = forgivingSearch(index, 'mill');
        expect(hits[0].record.title).toBe('Mill Whistle');
        expect(hits[0].score).toBeGreaterThan(hits[1].score);
    });

    it('searches arrays such as tags', () => {
        expect(titles('downtown')).toEqual(['Main Street Photograph, 1925']);
    });

    it('falls back to the records matching the most words', () => {
        expect(titles('things from the cotton mill')).toEqual(['Mill Whistle']);
        expect(titles('zebra giraffe')).toEqual([]);
    });

    it('ignores accents, apostrophes and punctuation', () => {
        expect(titles('cafe')).toEqual(['Café Menu']);
        expect(titles('obriens')).toEqual(['Café Menu']);
        expect(titles('hollis,')).toHaveLength(2);
    });

    it('matches nothing for an empty query', () => {
        expect(forgivingSearch(index, '   ')).toEqual([]);
    });
});

describe('exactSearch', () => {
    const exact = (query: string) => exactSearch(index, query).map(h => h.record.title);

    it('finds only the text exactly as typed, ignoring capitals', () => {
        expect(exact('Mayor Hollis, 1911')).toEqual(['Letter from Mayor Hollis, 1911']);
        expect(exact('whistel')).toEqual([]);
        expect(exact('1911 letter mayor')).toEqual([]);
        expect(exact('MILL')).toEqual(['Mill Whistle', 'Strike Banner']);
    });

    it('matches inside words, the way the old search did', () => {
        expect(exact('olli')).toEqual(['Letter from Mayor Hollis, 1911', 'Letter from Mayor Hollis, 1912']);
    });
});

describe('searchScores', () => {
    it('is null for an empty query and switches between forgiving and exact', () => {
        expect(searchScores(index, '  ')).toBeNull();
        expect(searchScores(index, 'whistel')?.size).toBe(1);
        expect(searchScores(index, 'whistel', true)?.size).toBe(0);
    });
});

describe('editDistance', () => {
    it('counts a swap of neighbouring letters as one edit', () => {
        expect(editDistance('whistel', 'whistle', 2)).toBe(1);
        expect(editDistance('mill', 'will', 1)).toBe(1);
        expect(editDistance('kitten', 'sitting', 3)).toBe(3);
    });

    it('gives up past the limit', () => {
        expect(editDistance('abcdef', 'uvwxyz', 1)).toBe(2);
    });
});

describe('normalise and queryTerms', () => {
    it('normalises text and drops filler words unless nothing else is left', () => {
        expect(normalise("Mayor Hollis's Letter—1911")).toBe('mayor holliss letter 1911');
        expect(queryTerms('the letter from the mayor')).toEqual(['letter', 'mayor']);
        expect(queryTerms('the')).toEqual(['the']);
    });
});
