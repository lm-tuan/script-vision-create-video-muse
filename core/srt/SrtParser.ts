import { parseSrtTimeToMs } from '../time';

export interface SrtSubtitle {
    index: number;
    startMs: number;
    endMs: number;
    text: string;
}

/**
 * Parses an SRT file content string into an array of SrtSubtitle objects with exact millisecond timestamps.
 */
export function parseSrt(srtText: string): SrtSubtitle[] {
    if (!srtText) return [];
    
    const blocks = srtText.split(/\r?\n\r?\n/).filter(b => b.trim().length > 0);
    const subtitles: SrtSubtitle[] = [];
    const timeRegex = /(\d{2}:\d{2}:\d{2}[,.][\d]{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.][\d]{3})/;

    for (const block of blocks) {
        const lines = block.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length >= 3) {
            const index = parseInt(lines[0], 10);
            const timeRange = lines[1];
            const text = lines.slice(2).join('\n'); // Preserve line breaks in subtitles if any

            const match = timeRegex.exec(timeRange);
            if (match && !isNaN(index)) {
                const startMs = parseSrtTimeToMs(match[1]);
                const endMs = parseSrtTimeToMs(match[2]);
                subtitles.push({
                    index,
                    startMs,
                    endMs,
                    text
                });
            }
        }
    }
    return subtitles;
}

/**
 * Returns a Map of subtitle index to its subtitle details.
 */
export function parseSrtToMap(srtText: string): Map<number, SrtSubtitle> {
    const subs = parseSrt(srtText);
    const map = new Map<number, SrtSubtitle>();
    for (const sub of subs) {
        map.set(sub.index, sub);
    }
    return map;
}

/**
 * Extracts all subtitle index numbers present in the SRT content.
 */
export function getSrtIndices(srtText: string): number[] {
    return parseSrt(srtText).map(s => s.index);
}

/**
 * Gets the total duration of the SRT content (the end timestamp of the final subtitle) in milliseconds.
 */
export function getSrtTotalDurationMs(srtText: string): number {
    const subs = parseSrt(srtText);
    if (subs.length === 0) return 0;
    return Math.max(...subs.map(s => s.endMs));
}
