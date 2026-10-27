/**
 * Oral history transcripts: the text form stored on the item, and the rows the
 * Edit Item transcript editor works with.
 */

/**
 * Splits a transcript into editor rows. A row's time and speaker are blank when
 * the line has none, so `serializeTranscriptLines` writes the line back as it was.
 *
 * A speaker is text before a colon that starts with a letter, is at most 40
 * characters, and is followed by a space. That keeps "At 10:30 we left" whole
 * instead of reading "At 10" as a speaker.
 */
export function parseTranscriptString(text: string) {
    if (!text) return [];
    return text.split('\n').filter(line => line.trim().length > 0).map((line, idx) => {
        const id = `line-${idx}-${Date.now()}-${Math.random()}`;
        let rest = line.trim();
        let timestamp = '';
        const time = rest.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?)\]\s*(.*)$/);
        if (time) {
            timestamp = time[1];
            rest = time[2];
        }
        const speaker = rest.match(/^([A-Za-z][^:]{0,39}):\s+(.*)$/);
        if (speaker) {
            return { id, timestamp, speaker: speaker[1].trim(), text: speaker[2].trim() };
        }
        return { id, timestamp, speaker: '', text: rest };
    });
}

/** The inverse of `parseTranscriptString`: a blank time or speaker is left out. */
export function serializeTranscriptLines(lines: { timestamp: string; speaker: string; text: string }[]): string {
    return lines
        .map(line => `${line.timestamp ? `[${line.timestamp}] ` : ''}${line.speaker ? `${line.speaker}: ` : ''}${line.text}`)
        .join('\n');
}
