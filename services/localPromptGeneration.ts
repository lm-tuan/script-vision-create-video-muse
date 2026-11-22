import { createHash, randomUUID } from 'crypto';
import type { PromptEntry } from '@/types';
import { parsePrompts, validatePromptOutput, validateTimeRanges } from '@/core/prompt/PromptParser';
import { parseTimeRangeToMs } from '@/core/time';

export function localPromptBatchSize(value = process.env.LOCAL_PROMPT_BATCH_SIZE): number {
    if (!value || !/^\d+$/.test(value.trim())) return 5;
    const size = Number(value);
    return Number.isSafeInteger(size) && size >= 1 && size <= 15 ? size : 5;
}

export function splitLocalScenes(durations: string): string[] {
    const scenes = durations.split(/(?=^[ \t]*Scene[ \t]+\d+\b)/gim)
        .filter(scene => /^[ \t]*Scene[ \t]+\d+\b/i.test(scene));
    const ids = scenes.map(scene => Number(/^\s*Scene\s+(\d+)/i.exec(scene)![1]));
    if (!ids.length || ids.some(id => !Number.isSafeInteger(id) || id < 1) || new Set(ids).size !== ids.length) {
        throw new Error('API local: durations phải có Scene hợp lệ và không trùng số cảnh.');
    }
    for (const scene of scenes) {
        const parentLine = scene.split(/\r?\n/).map(line => line.trim()).find(line => rangePattern.test(line));
        if (!parentLine || !strictRange(parentLine)) {
            throw new Error('API local: durations có mốc thời gian không hợp lệ; cần HH:MM:SS,mmm - HH:MM:SS,mmm.');
        }
    }
    return scenes;
}

const rangePattern = /^(\d{2,}:\d{2}:\d{2}[,.]\d{3})\s*-\s*(\d{2,}:\d{2}:\d{2}[,.]\d{3})$/;
function strictRange(text: string) {
    const match = rangePattern.exec(text.trim());
    if (!match || match.slice(1).some(time => {
        const parts = time.split(':');
        return Number(parts[1]) > 59 || Number(parts[2].slice(0, 2)) > 59;
    })) return null;
    const range = parseTimeRangeToMs(text);
    return range.endMs > range.startMs ? range : null;
}

// Keep shared parser behavior unchanged. Local generation has stricter admission checks.
export function validateLocalBatch(output: string, scenes: string[]): PromptEntry[] {
    const expected = scenes.map(scene => Number(/^\s*Scene\s+(\d+)/i.exec(scene)![1]));
    const parsed = parsePrompts(output);
    const validation = validatePromptOutput(parsed, expected);
    if (validation.missingScenes.length || validation.emptyPromptScenes.length ||
        parsed.some(scene => !expected.includes(scene.sceneNumber))) {
        throw new Error(`API local: thiếu/rỗng hoặc thừa prompt cho cảnh ${expected.join(', ')}.`);
    }
    for (const [index, sceneNumber] of expected.entries()) {
        const entry = parsed.find(scene => scene.sceneNumber === sceneNumber)!;
        const parentLine = scenes[index].split(/\r?\n/).map(line => line.trim())
            .find(line => rangePattern.test(line));
        const parent = parentLine ? strictRange(parentLine) : null;
        if (!parent) throw new Error(`API local: mốc thời gian cảnh ${sceneNumber} không hợp lệ.`);
        const images = entry.prompts;
        if (images.length < 1 || images.length > 3 || images.some((image, i) => image.imageNumber !== i + 1)) {
            throw new Error(`API local: số ảnh hoặc thứ tự Image không hợp lệ ở cảnh ${sceneNumber}.`);
        }
        let previousEnd = parent.startMs;
        for (const image of images) {
            const range = strictRange(image.timeRange);
            const minimum = Math.min(3000, parent.endMs - parent.startMs);
            if (!range || range.startMs !== previousEnd || range.endMs > parent.endMs ||
                range.endMs - range.startMs < minimum) {
                throw new Error(`API local: timeline không hợp lệ ở cảnh ${sceneNumber}, ảnh ${image.imageNumber}.`);
            }
            previousEnd = range.endMs;
        }
        if (previousEnd !== parent.endMs) throw new Error(`API local: prompt chưa phủ hết cảnh ${sceneNumber}.`);
    }
    return parsed;
}

export type LocalPromptEvent =
    | { type: 'started'; jobId: string; resumeKey: string; totalScenes: number; batchSize: number }
    | { type: 'batch'; jobId: string; prompts: PromptEntry[]; completedScenes: number; totalScenes: number; cached: boolean };

type Session = { fingerprint: string; outputs: Map<number, string>; touched: number; active: boolean; completed: boolean };
const sessions = new Map<string, Session>();
const TTL_MS = 30 * 60_000;
const MAX_SESSIONS = 8;
const MAX_SESSION_CHARS = 2_000_000;

function cleanSessions() {
    for (const [key, session] of sessions) {
        if (!session.active && Date.now() - session.touched > TTL_MS) sessions.delete(key);
    }
}

export async function generateLocalPrompts(options: {
    durations: string;
    buildPrompt: (batch: string) => string;
    callAI: (prompt: string) => Promise<string>;
    batchSize?: number;
    progressive?: boolean;
    resumeKey?: string;
    onEvent?: (event: LocalPromptEvent) => void;
    stopped?: () => boolean;
}): Promise<{ raw: string; batchSize: number; batches: number; elapsedMs: number }> {
    const started = Date.now();
    const jobId = randomUUID();
    const scenes = splitLocalScenes(options.durations);
    const batchSize = options.batchSize ?? localPromptBatchSize();
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 15) throw new Error('API local: invalid batch size');
    const batches: string[][] = [];
    for (let i = 0; i < scenes.length; i += batchSize) batches.push(scenes.slice(i, i + batchSize));
    // Includes rendered template, actual transcript, languages/style and batching policy.
    const fingerprint = createHash('sha256').update(JSON.stringify({
        version: 1, batchSize, prompt: options.buildPrompt(options.durations),
        endpoint: process.env.LOCAL_AI_BASE_URL || 'http://127.0.0.1:3900',
    })).digest('hex');
    let session: Session | undefined;
    let resumeKey = '';
    if (options.progressive) {
        cleanSessions();
        if (options.resumeKey) {
            session = sessions.get(options.resumeKey);
            if (!session || session.fingerprint !== fingerprint) {
                throw new Error('API local: phiên tiếp tục đã hết hạn hoặc dữ liệu/cấu hình đã đổi. Hãy tạo mới.');
            }
            if (session.active) throw new Error('API local: phiên này đang chạy.');
            resumeKey = options.resumeKey;
        } else {
            if (sessions.size >= MAX_SESSIONS) {
                const oldestCompleted = [...sessions].filter(([, item]) => !item.active && item.completed)
                    .sort((a, b) => a[1].touched - b[1].touched)[0];
                if (oldestCompleted) sessions.delete(oldestCompleted[0]);
            }
            if (sessions.size >= MAX_SESSIONS) {
                throw new Error('API local: bộ nhớ phiên đã đầy. Hãy tiếp tục phiên hiện có hoặc thử lại sau khi phiên hết hạn.');
            }
            resumeKey = randomUUID();
            session = { fingerprint, outputs: new Map(), touched: Date.now(), active: false, completed: false };
            sessions.set(resumeKey, session);
        }
        session!.active = true;
    }
    let completedScenes = 0;
    const outputs: string[] = [];
    try {
        options.onEvent?.({ type: 'started', jobId, resumeKey, totalScenes: scenes.length, batchSize });
        for (const [index, batch] of batches.entries()) {
            if (options.stopped?.()) throw new Error('API local: kết nối đã đóng, dừng trước nhóm tiếp theo.');
            const batchStarted = Date.now();
            const ids = batch.map(scene => Number(/^\s*Scene\s+(\d+)/i.exec(scene)![1]));
            const prompt = options.buildPrompt(batch.join('\n\n')) +
                `\n\nGenerate ONLY these scene numbers: ${ids.join(', ')}. Preserve their original numbers and timestamps. Return every requested scene and no other scenes.`;
            const cached = session?.outputs.has(index) ?? false;
            console.log(`[local-prompt] job=${jobId} batch=${index + 1}/${batches.length} scenes=[${ids}] inputChars=${prompt.length} cached=${cached}`);
            const output = cached ? session!.outputs.get(index)! : await options.callAI(prompt);
            const parsed = validateLocalBatch(output, batch);
            if (session && !cached) {
                const chars = [...session.outputs.values()].reduce((sum, value) => sum + value.length, 0) + output.length;
                if (chars > MAX_SESSION_CHARS) throw new Error('API local: kết quả vượt giới hạn bộ nhớ phiên.');
                session.outputs.set(index, output);
                session.touched = Date.now();
            }
            outputs.push(output);
            completedScenes += batch.length;
            console.log(`[local-prompt] job=${jobId} batch=${index + 1} elapsedMs=${Date.now() - batchStarted} scenes=${parsed.length} images=${parsed.reduce((sum, scene) => sum + scene.prompts.length, 0)} outputChars=${output.length} shortPrompts=${validatePromptOutput(parsed, ids).shortPromptScenes.length} timeIssues=${validateTimeRanges(parsed).filter(issue => issue.type !== 'too_short').length}`);
            options.onEvent?.({ type: 'batch', jobId, prompts: parsed, completedScenes, totalScenes: scenes.length, cached });
        }
        if (session) session.completed = true; // Allow recovery if the final network frame was lost.
        return { raw: outputs.join('\n\n'), batchSize, batches: batches.length, elapsedMs: Date.now() - started };
    } catch (error) {
        console.error(`[local-prompt] job=${jobId} failed elapsedMs=${Date.now() - started} completedScenes=${completedScenes}/${scenes.length}`);
        throw error;
    } finally {
        if (session) { session.active = false; session.touched = Date.now(); }
        if (session && session.outputs.size === 0 && options.stopped?.()) sessions.delete(resumeKey);
        console.log(`[local-prompt] job=${jobId} totalElapsedMs=${Date.now() - started} completedScenes=${completedScenes}/${scenes.length}`);
    }
}
