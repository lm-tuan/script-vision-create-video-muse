import { formatMsToSrtTime } from '../time';
import { SrtSubtitle } from './SrtParser';

/**
 * Serializes an array of subtitle objects into a standard SRT string representation.
 */
export function writeSrt(subtitles: SrtSubtitle[]): string {
    const lines: string[] = [];
    for (let i = 0; i < subtitles.length; i++) {
        const sub = subtitles[i];
        lines.push((i + 1).toString());
        lines.push(`${formatMsToSrtTime(sub.startMs)} --> ${formatMsToSrtTime(sub.endMs)}`);
        lines.push(sub.text);
        lines.push(''); // Empty line separating subtitle blocks
    }
    return lines.join('\n');
}
