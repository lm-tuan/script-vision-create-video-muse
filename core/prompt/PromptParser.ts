/**
 * Shared Prompt Parser — single source of truth.
 *
 * Previously duplicated in:
 *   /api/prompt/route.ts
 *   /api/generate/route.ts
 *   /api/generate/stream/route.ts
 *
 * This version merges the best features from all three copies:
 *   - Scene+Image one-line pattern  (all copies)
 *   - Scene header pattern          (all copies)
 *   - Image-only fallback           (all copies)
 *   - Continuation-line append      (/api/prompt only — now shared)
 *   - Fallback for unparseable text  (all copies)
 */

import type { PromptEntry, SubPrompt } from '@/types';
import { parseSrtTimeToMs, formatMsToSrtTime } from '@/core/time';

export function parsePrompts(text: string): PromptEntry[] {
    const results: PromptEntry[] = [];
    const lines = text.split(/\r?\n/);
    const sceneMap = new Map<number, SubPrompt[]>();
    let currentSceneNumber = 1;
    let lastSubPrompt: SubPrompt | null = null;

    for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        const normalizedLine = line.replace(/[\u2013\u2014~]/g, "-").trim();

        // 1. Match Scene + Image in one line:
        //    "Scene 1:Image 1 (00:00:00,518 - 00:00:04,000): Loose hand-drawn..."
        const patternSceneAndImage = normalizedLine.match(
            /^(?:[-*+\d\.\s]+)?Scene\s+(\d+)\s*[:,-]?\s*Image\s+(\d+)\s*\(([^)]+)\)\s*[:,-]?\s*(.*)$/i
        );
        if (patternSceneAndImage) {
            const sceneNum = parseInt(patternSceneAndImage[1]);
            const imageNum = parseInt(patternSceneAndImage[2]);
            const timeRange = patternSceneAndImage[3].trim();
            const prompt = patternSceneAndImage[4].trim();

            if (!sceneMap.has(sceneNum)) {
                sceneMap.set(sceneNum, []);
            }
            const newSub: SubPrompt = { imageNumber: imageNum, timeRange, prompt };
            sceneMap.get(sceneNum)!.push(newSub);
            lastSubPrompt = newSub;
            currentSceneNumber = sceneNum;
            continue;
        }

        // 2. Match Scene Header: "Prompt Scene 1" or "Scene 1"
        const patternSceneHeader = normalizedLine.match(
            /^(?:Prompt\s+)?Scene\s+(\d+)\s*$/i
        );
        if (patternSceneHeader) {
            currentSceneNumber = parseInt(patternSceneHeader[1]);
            lastSubPrompt = null; // reset continuation target on new scene header
            continue;
        }

        // 3. Match Image only (legacy fallback): "Image 1 (00:00 - 00:03): ..."
        const patternImageOnly = normalizedLine.match(
            /^(?:[-*+\d\.\s]+)?Image\s+(\d+)\s*\(([^)]+)\)\s*[:,-]?\s*(.*)$/i
        );
        if (patternImageOnly) {
            const imageNum = parseInt(patternImageOnly[1]);
            const timeRange = patternImageOnly[2].trim();
            const prompt = patternImageOnly[3].trim();

            if (!sceneMap.has(currentSceneNumber)) {
                sceneMap.set(currentSceneNumber, []);
            }
            const newSub: SubPrompt = { imageNumber: imageNum, timeRange, prompt };
            sceneMap.get(currentSceneNumber)!.push(newSub);
            lastSubPrompt = newSub;
            continue;
        }

        // 4. Continuation line: not a header / not a pattern → append to last prompt
        //    This handles cases where AI wraps long prompts across multiple lines.
        if (lastSubPrompt) {
            lastSubPrompt.prompt = lastSubPrompt.prompt
                ? `${lastSubPrompt.prompt} ${line}`
                : line;
        }
    }

    const sortedSceneNumbers = Array.from(sceneMap.keys()).sort((a, b) => a - b);
    for (const sceneNum of sortedSceneNumbers) {
        results.push({
            sceneNumber: sceneNum,
            prompts: sceneMap.get(sceneNum)!,
        });
    }

    // Fallback: if nothing was parsed, treat entire text as a single prompt
    if (results.length === 0 && text.trim().length > 0) {
        results.push({
            sceneNumber: 1,
            prompts: [{ imageNumber: 1, timeRange: "", prompt: text.trim() }],
        });
    }

    return results;
}

/**
 * Validate parsed prompts against the expected scene list.
 * Returns a list of scene numbers that are missing or have empty prompts.
 */
export function validatePromptOutput(
    parsed: PromptEntry[],
    expectedSceneNumbers: number[]
): { missingScenes: number[]; emptyPromptScenes: number[]; shortPromptScenes: number[] } {
    const parsedSceneSet = new Set(parsed.map(p => p.sceneNumber));

    const missingScenes = expectedSceneNumbers.filter(n => !parsedSceneSet.has(n));

    const emptyPromptScenes: number[] = [];
    const shortPromptScenes: number[] = [];

    for (const entry of parsed) {
        if (!entry.prompts || entry.prompts.length === 0) {
            emptyPromptScenes.push(entry.sceneNumber);
            continue;
        }
        for (const sp of entry.prompts) {
            if (!sp.prompt || sp.prompt.trim().length === 0) {
                emptyPromptScenes.push(entry.sceneNumber);
                break;
            }
            // A prompt with fewer than 10 words is suspiciously short
            const wordCount = sp.prompt.trim().split(/\s+/).length;
            if (wordCount < 10) {
                shortPromptScenes.push(entry.sceneNumber);
                break;
            }
        }
    }

    return { missingScenes, emptyPromptScenes, shortPromptScenes };
}

// ─────────────────────────────────────────────────────────────────────────────
// Time-Range Validation & Auto-Fix
// ─────────────────────────────────────────────────────────────────────────────

export interface TimeRangeIssue {
    sceneNumber: number;
    imageNumber: number;
    type: 'too_short' | 'gap' | 'overlap' | 'missing_timerange';
    detail: string;
    /** Duration in ms of the offending image (for 'too_short') */
    durationMs?: number;
}

const MIN_IMAGE_DURATION_MS = 3000; // 3 seconds minimum per image

/**
 * Parse the timeRange string of a SubPrompt into { startMs, endMs }.
 * Returns null if the timeRange is missing or cannot be parsed.
 */
function parseSubTimeRange(timeRange: string): { startMs: number; endMs: number } | null {
    if (!timeRange || !timeRange.includes('-')) return null;
    // Handle dash inside SRT timestamps (HH:MM:SS,mmm - HH:MM:SS,mmm)
    // Split on ' - ' first, then fall back to last '-'
    const sepIdx = timeRange.indexOf(' - ');
    let startStr: string;
    let endStr: string;
    if (sepIdx !== -1) {
        startStr = timeRange.slice(0, sepIdx).trim();
        endStr = timeRange.slice(sepIdx + 3).trim();
    } else {
        // Last resort: split on the middle dash
        const lastDash = timeRange.lastIndexOf('-');
        startStr = timeRange.slice(0, lastDash).trim();
        endStr = timeRange.slice(lastDash + 1).trim();
    }
    const startMs = parseSrtTimeToMs(startStr);
    const endMs = parseSrtTimeToMs(endStr);
    if (endMs <= startMs) return null;
    return { startMs, endMs };
}

/**
 * Validate time ranges across all parsed prompts.
 *
 * Checks:
 *  1. Each image has a parseable timeRange (not missing/malformed).
 *  2. Each image duration >= MIN_IMAGE_DURATION_MS (3 s).
 *  3. No gap or overlap between consecutive images within the same scene.
 *
 * @param parsed - Output of parsePrompts()
 * @returns Array of TimeRangeIssue describing every detected problem.
 */
export function validateTimeRanges(parsed: PromptEntry[]): TimeRangeIssue[] {
    const issues: TimeRangeIssue[] = [];

    for (const entry of parsed) {
        if (!entry.prompts || entry.prompts.length === 0) continue;

        let prevEndMs: number | null = null;

        for (const sp of entry.prompts) {
            const range = parseSubTimeRange(sp.timeRange || '');

            // 1. Missing / unparseable timeRange
            if (!range) {
                issues.push({
                    sceneNumber: entry.sceneNumber,
                    imageNumber: sp.imageNumber,
                    type: 'missing_timerange',
                    detail: `Scene ${entry.sceneNumber} Image ${sp.imageNumber}: timeRange "${sp.timeRange}" không hợp lệ hoặc bị thiếu.`,
                });
                prevEndMs = null;
                continue;
            }

            const durMs = range.endMs - range.startMs;

            // 2. Too short
            if (durMs < MIN_IMAGE_DURATION_MS) {
                issues.push({
                    sceneNumber: entry.sceneNumber,
                    imageNumber: sp.imageNumber,
                    type: 'too_short',
                    detail: `Scene ${entry.sceneNumber} Image ${sp.imageNumber}: thời lượng ${(durMs / 1000).toFixed(2)}s < 3s tối thiểu. (${sp.timeRange})`,
                    durationMs: durMs,
                });
            }

            // 3. Gap / overlap with previous image in the same scene
            if (prevEndMs !== null) {
                const delta = range.startMs - prevEndMs;
                if (delta > 100) {
                    // More than 100 ms gap
                    issues.push({
                        sceneNumber: entry.sceneNumber,
                        imageNumber: sp.imageNumber,
                        type: 'gap',
                        detail: `Scene ${entry.sceneNumber} Image ${sp.imageNumber}: có khoảng trống ${delta}ms so với ảnh trước. (prev end: ${formatMsToSrtTime(prevEndMs)}, this start: ${formatMsToSrtTime(range.startMs)})`,
                    });
                } else if (delta < -100) {
                    // More than 100 ms overlap
                    issues.push({
                        sceneNumber: entry.sceneNumber,
                        imageNumber: sp.imageNumber,
                        type: 'overlap',
                        detail: `Scene ${entry.sceneNumber} Image ${sp.imageNumber}: chồng lấp ${-delta}ms với ảnh trước. (prev end: ${formatMsToSrtTime(prevEndMs)}, this start: ${formatMsToSrtTime(range.startMs)})`,
                    });
                }
            }

            prevEndMs = range.endMs;
        }
    }

    return issues;
}

/**
 * Auto-fix time ranges for a scene whose images have timing problems.
 *
 * Strategy: given the scene's parent timeRange (start → end),
 * redistribute time EVENLY across all images, ensuring each image >= 3s.
 * If the total scene duration cannot accommodate all images at 3s each,
 * images are merged down until they fit.
 *
 * @param entry          - The PromptEntry to fix (mutated in-place).
 * @param sceneTimeRange - The authoritative timeRange of the parent scene
 *                         (from durations list), e.g. "00:00:12,000 - 00:00:25,000".
 * @returns              - true if a fix was applied, false if nothing could be done.
 */
export function autoFixTimeRanges(
    entry: PromptEntry,
    sceneTimeRange: string
): boolean {
    const parent = parseSubTimeRange(sceneTimeRange);
    if (!parent) return false;

    const { startMs, endMs } = parent;
    const totalMs = endMs - startMs;
    if (totalMs <= 0) return false;

    const images = entry.prompts;
    if (!images || images.length === 0) return false;

    // Determine how many images we can fit with >= 3s each
    let count = images.length;
    while (count > 1 && Math.floor(totalMs / count) < MIN_IMAGE_DURATION_MS) {
        count--;
    }
    // If even 1 image can't meet the 3s minimum, just assign the full range
    const perImageMs = Math.floor(totalMs / count);

    // Rebuild timeRanges evenly
    for (let i = 0; i < images.length; i++) {
        if (i < count) {
            const imgStartMs = startMs + i * perImageMs;
            const imgEndMs = i === count - 1 ? endMs : imgStartMs + perImageMs;
            images[i].timeRange = `${formatMsToSrtTime(imgStartMs)} - ${formatMsToSrtTime(imgEndMs)}`;
            images[i].imageNumber = i + 1;
        }
        // Drop excess images that can't fit
    }
    // Truncate array if images were merged down
    entry.prompts = images.slice(0, count);

    return true;
}
