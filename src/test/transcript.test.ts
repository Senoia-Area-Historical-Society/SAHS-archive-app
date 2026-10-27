import { describe, it, expect } from 'vitest';
import { parseTranscriptString, serializeTranscriptLines } from '../lib/transcript';

/**
 * The bug these guard: every Edit Item save rebuilt the transcript as
 * `[mm:ss] speaker: text`, inventing `[00:00]` times, empty speakers, and
 * speakers out of any colon ("At 10:30" became speaker "At 10").
 */

const roundTrip = (text: string) => serializeTranscriptLines(parseTranscriptString(text));

describe('transcript rows', () => {
    it('round-trips the timestamped format unchanged', () => {
        const text = '[00:30] Narrator: Look inside of me\n[00:35] Narrator: To walk inside the void';
        expect(roundTrip(text)).toBe(text);
    });

    it('does not invent a time or a speaker for plain prose', () => {
        expect(roundTrip('We moved to Senoia in 1952.')).toBe('We moved to Senoia in 1952.');
    });

    it('does not read a clock time as a speaker', () => {
        const rows = parseTranscriptString('At 10:30 we left for church.');
        expect(rows[0].speaker).toBe('');
        expect(roundTrip('At 10:30 we left for church.')).toBe('At 10:30 we left for church.');
    });

    it('keeps hour timestamps', () => {
        const rows = parseTranscriptString('[01:02:03] Jane: hi');
        expect(rows[0]).toMatchObject({ timestamp: '01:02:03', speaker: 'Jane', text: 'hi' });
        expect(roundTrip('[01:02:03] Jane: hi')).toBe('[01:02:03] Jane: hi');
    });

    it('reads an untimed speaker line', () => {
        expect(parseTranscriptString('Jane Smith: We lived on Main Street.')[0])
            .toMatchObject({ timestamp: '', speaker: 'Jane Smith', text: 'We lived on Main Street.' });
    });
});
