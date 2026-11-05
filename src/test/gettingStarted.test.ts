import { describe, it, expect } from 'vitest';
import { buildGuideTasks, guideCardMode, guideStorageKey, type GuideFacts } from '../lib/gettingStarted';

const NOTHING: GuideFacts = { hasItem: false, hasCollection: false, hasLocation: false, hasColleague: false };
const EVERYTHING: GuideFacts = { hasItem: true, hasCollection: true, hasLocation: true, hasColleague: true };
const ids = (facts: GuideFacts, isAdmin: boolean, collectionsEnabled = true) =>
    buildGuideTasks(facts, { isAdmin, collectionsEnabled }).map((t) => t.id);

describe('buildGuideTasks', () => {
    it('gives an admin the whole list, with branding already done', () => {
        const tasks = buildGuideTasks(NOTHING, { isAdmin: true, collectionsEnabled: true });
        expect(tasks.map((t) => t.id)).toEqual(['branding', 'item', 'collection', 'location', 'colleague']);
        expect(tasks.filter((t) => t.done).map((t) => t.id)).toEqual(['branding']);
    });

    it('leaves a curator only the tasks a curator can do', () => {
        // /appearance and /settings are behind AdminRoute.
        expect(ids(NOTHING, false)).toEqual(['item', 'collection', 'location']);
    });

    it('drops the collection task when the museum has collections switched off', () => {
        expect(ids(NOTHING, true, false)).not.toContain('collection');
    });

    it('ticks each task from its own fact', () => {
        const tasks = buildGuideTasks({ ...NOTHING, hasLocation: true }, { isAdmin: false, collectionsEnabled: true });
        expect(tasks.filter((t) => t.done).map((t) => t.id)).toEqual(['location']);
    });

    it('is complete for an established archive', () => {
        expect(buildGuideTasks(EVERYTHING, { isAdmin: true, collectionsEnabled: true }).every((t) => t.done)).toBe(true);
    });
});

describe('guideCardMode', () => {
    const base = { allDone: false, dismissed: false, seenIncomplete: false, requested: false };

    it('shows unfinished tasks', () => {
        expect(guideCardMode(base)).toBe('progress');
    });

    it('stays closed once dismissed', () => {
        expect(guideCardMode({ ...base, dismissed: true })).toBe('hidden');
        expect(guideCardMode({ ...base, dismissed: true, allDone: true, seenIncomplete: true })).toBe('hidden');
    });

    it('says nothing to an archive that was already finished', () => {
        expect(guideCardMode({ ...base, allDone: true })).toBe('hidden');
    });

    it('marks the moment for someone who worked through it', () => {
        expect(guideCardMode({ ...base, allDone: true, seenIncomplete: true })).toBe('complete');
    });

    it('reopens from the sidebar, whatever was dismissed', () => {
        expect(guideCardMode({ ...base, dismissed: true, requested: true })).toBe('progress');
        expect(guideCardMode({ ...base, dismissed: true, requested: true, allDone: true })).toBe('complete');
    });
});

describe('guideStorageKey', () => {
    it('treats a re-created archive as new, so a rehearsal reset brings the card back', () => {
        expect(guideStorageKey('a@b.org', '2027-02-01T10:00:00Z')).not.toBe(guideStorageKey('a@b.org', '2027-02-02T10:00:00Z'));
    });

    it('ignores the case of the address', () => {
        expect(guideStorageKey('A@B.org', 'x')).toBe(guideStorageKey('a@b.org', 'x'));
    });

    it('still has a key on an archive with no setup record', () => {
        expect(guideStorageKey('a@b.org', undefined)).toContain('unknown');
    });
});
