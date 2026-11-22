/**
 * Time utility module for integer millisecond arithmetic and formatting.
 * Audio-Master Timeline Pipeline Single Source of Truth helper.
 */

/**
 * Parses an SRT timestamp format "HH:MM:SS,mmm" or "HH:MM:SS.mmm" into integer milliseconds.
 * Also supports partial formats like "MM:SS.mmm", "SS.mmm" or "HH:MM:SS".
 */
export function parseSrtTimeToMs(timeStr: string): number {
    if (!timeStr) return 0;
    const clean = timeStr.trim().replace(',', '.'); // replace comma with dot for standard decimal parsing
    const parts = clean.split(':');
    
    let hours = 0;
    let minutes = 0;
    let secondsStr = '';

    if (parts.length === 3) {
        hours = parseInt(parts[0], 10) || 0;
        minutes = parseInt(parts[1], 10) || 0;
        secondsStr = parts[2] || '0';
    } else if (parts.length === 2) {
        minutes = parseInt(parts[0], 10) || 0;
        secondsStr = parts[1] || '0';
    } else if (parts.length === 1) {
        secondsStr = parts[0] || '0';
    }

    const secParts = secondsStr.split('.');
    const seconds = parseInt(secParts[0], 10) || 0;
    const msStr = (secParts[1] || '0').padEnd(3, '0').substring(0, 3);
    const ms = parseInt(msStr, 10) || 0;

    return hours * 3600000 + minutes * 60000 + seconds * 1000 + ms;
}

/**
 * Formats integer milliseconds into standard SRT timestamp format "HH:MM:SS,mmm".
 */
export function formatMsToSrtTime(ms: number): string {
    if (ms < 0) ms = 0;
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = ms % 1000;

    const hh = hours.toString().padStart(2, '0');
    const mm = minutes.toString().padStart(2, '0');
    const ss = seconds.toString().padStart(2, '0');
    const mmm = milliseconds.toString().padStart(3, '0');

    return `${hh}:${mm}:${ss},${mmm}`;
}

/**
 * Formats a start and end millisecond range into human-readable format: "HH:MM:SS,mmm - HH:MM:SS,mmm".
 */
export function formatTimeRange(startMs: number, endMs: number): string {
    return `${formatMsToSrtTime(startMs)} - ${formatMsToSrtTime(endMs)}`;
}

/**
 * Parses a time range string (e.g. "00:00:12,726 - 00:00:15,720" or "00:12-00:15") into start/end milliseconds.
 */
export function parseTimeRangeToMs(rangeStr: string): { startMs: number; endMs: number } {
    if (!rangeStr || !rangeStr.includes('-')) {
        return { startMs: 0, endMs: 0 };
    }
    const parts = rangeStr.split('-');
    const startMs = parseSrtTimeToMs(parts[0]);
    const endMs = parseSrtTimeToMs(parts[1]);
    return { startMs, endMs };
}

/**
 * Calculates duration in milliseconds.
 */
export function durationMs(startMs: number, endMs: number): number {
    return Math.max(0, endMs - startMs);
}

/**
 * Converts milliseconds to frame count at a given FPS, rounded to the nearest integer.
 */
export function msToFrames(ms: number, fps: number = 25): number {
    return Math.round((ms / 1000) * fps);
}

/**
 * Converts frame count to milliseconds at a given FPS.
 */
export function framesToMs(frames: number, fps: number = 25): number {
    return Math.round((frames / fps) * 1000);
}

