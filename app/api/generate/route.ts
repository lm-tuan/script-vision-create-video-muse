import { NextResponse } from 'next/server';
import { AIProvider, callWithRetry, runWithConcurrencyLimit } from '@/services/ai';
import { readFileSync } from 'fs';
import { mkdir, writeFile as writeFileAsync } from 'fs/promises';
import { join } from 'path';
import { parseSrtTimeToMs, formatMsToSrtTime } from '@/core/time';
import { parsePrompts } from '@/core/prompt/PromptParser';
import type { PromptEntry } from '@/types';

// Max chars of transcript before splitting into chunks (Gemini Flash has 1M context, keep generous)
const MAX_CHARS_SINGLE_CALL = 15000;
// Max SRT blocks per chunk
const SRT_CHUNK_SIZE = 200;

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const content = typeof body.content === 'string' ? body.content : '';
        const aiProvider = 'local' as AIProvider;
        const longForm = Boolean(body.longForm);
        const language = typeof body.language === 'string' ? body.language : 'vi';

        const languageNames: Record<string, string> = {
            vi: 'Tiếng Việt (Vietnamese)',
            en: 'Tiếng Anh (English)',
            ja: 'Tiếng Nhật (Japanese)',
            fr: 'Tiếng Pháp (French)',
            zh: 'Tiếng Trung (Chinese)',
            ko: 'Tiếng Hàn (Korean)'
        };
        const targetLangName = languageNames[language] || 'Tiếng Việt (Vietnamese)';

        if (!content.trim()) {
            return NextResponse.json({ success: false, error: 'Missing content' }, { status: 400 });
        }

        const cwd = process.cwd();
        const srtContent = typeof body.srtContent === 'string' ? body.srtContent : '';
        const isSrtMode = srtContent.trim().length > 0;

        // ---------- STEP 1: Transcript (skip if SRT mode) ----------
        let transcript = '';
        let transcriptPath = '';
        if (!isSrtMode) {
            const transcriptTemplatePath = longForm ? 'transcript-long.md' : 'transcript.md';
            const transcriptTemplate = readFileSync(join(cwd, 'templates', transcriptTemplatePath), 'utf-8');
            let transcriptPrompt = transcriptTemplate.replace('{content}', content);
            transcriptPrompt += `\n\n--- \n\n## YÊU CẦU NGÔN NGỮ QUAN TRỌNG:\n- Kịch bản kịch thoại (transcript) đầu ra BẮT BUỘC phải viết bằng: ${targetLangName}.\n- Nếu nội dung đầu vào là ngôn ngữ khác, hãy thực hiện dịch và viết lại toàn bộ kịch bản sang ${targetLangName} một cách tự nhiên và trôi chảy nhất.`;

            transcript = await callWithRetry(transcriptPrompt, aiProvider, 0.2, 2, 'transcript');

            // Save transcript
            const outputsDir = join(cwd, 'outputs');
            await mkdir(outputsDir, { recursive: true });
            transcriptPath = join(outputsDir, 'transcript.md');
            await writeFileAsync(transcriptPath, transcript, 'utf-8');
        }

        // ---------- STEP 2: Duration + Prompt (1 combined call) ----------
        const rawCombinedTemplate = readFileSync(
            join(cwd, 'templates', isSrtMode ? 'duration_prompt_srt.md' : 'duration_prompt.md'),
            'utf-8'
        );

        // ---------- Build prompt style suffix (mirrors /api/prompt logic) ----------
        const rawPromptStyle = typeof body.promptStyle === 'string' ? body.promptStyle.trim() : '';
        const defaultSuffix = 'loose hand-drawn educational doodle illustration, clean white background, thick black wobbly outlines, simple flat muted colors';
        const rawSuffix = rawPromptStyle || defaultSuffix;
        // Normalize multi-line style blocks into a single comma-separated line
        const promptStyleSuffix = rawSuffix
            .replace(/^\s*[A-Za-zÀ-ỹ ]+:\s*$/gm, '')   // remove standalone header-only lines
            .replace(/^\s*[•\-*]+\s*/gm, '')             // strip bullet chars
            .replace(/^\s*[A-Za-zÀ-ỹ ]+:\s+/gm, '')     // strip "Header: " prefixes
            .replace(/\r?\n+/g, ', ')                    // newlines → comma-space
            .replace(/,\s*,+/g, ',')
            .replace(/^[,\s]+|[,\s]+$/g, '')
            .replace(/\s{2,}/g, ' ')
            .trim();

        // Language-specific rules
        let promptLangRule = '';
        if (language !== 'en') {
            promptLangRule = `- Toàn bộ mô tả và prompt hình ảnh BẮT BUỘC viết bằng: Tiếng Anh (English).\n- Nhãn chữ viết tay TRONG ảnh (nếu có) viết bằng: ${targetLangName}.`;
        }

        let combinedTemplate = rawCombinedTemplate
            .replace(/\{\{PROMPT_STYLE\}\}/g, promptStyleSuffix)
            .replace(/\{\{IN_IMAGE_LANGUAGE\}\}/g, targetLangName)
            .replace(/\{\{PROMPT_LANG_NAME\}\}/g, 'Tiếng Anh (English)')
            .replace(/\{\{PROMPT_LANG_RULE\}\}/g, promptLangRule)
            .replace(/\{\{PROMPT_LANG_DESC\}\}/g, '');

        // Language instruction footer
        const langFooter = `\n\n---\n\n## YÊU CẦU NGÔN NGỮ:\n- Prompt hình ảnh BẮT BUỘC viết bằng: Tiếng Anh (English).\n- Nhãn chữ viết tay trong ảnh (nếu có) viết bằng: ${targetLangName}.`;
        combinedTemplate += langFooter;

        // Long-form: inject additional scene count rules into template
        if (longForm && !isSrtMode) {
            const wpmByLanguage: Record<string, number> = {
                vi: 140, en: 150, ja: 330, zh: 260, fr: 145, ko: 130
            };
            const wpm = wpmByLanguage[language] || 140;
            const wordCount = transcript.split(/\s+/).filter(Boolean).length;
            const estimatedTotalSeconds = Math.round((wordCount / wpm) * 60);
            const estimatedTotalMinutes = (estimatedTotalSeconds / 60).toFixed(1);

            const longFormContext = `\n\n### Thông tin thời lượng (long-form)\n- Transcript có khoảng **${wordCount} từ**, tốc độ đọc ~${wpm} từ/phút.\n- Tổng thời lượng ước tính: **${estimatedTotalSeconds} giây** (~${estimatedTotalMinutes} phút).\n- Phân bổ thời gian các Scene sao cho tổng xấp xỉ ${estimatedTotalSeconds} giây.\n- KHÔNG tạo Scene ngắn hơn 3 giây hoặc dài hơn 7 giây.\n`;
            combinedTemplate = combinedTemplate.replace('## Bắt đầu', longFormContext + '\n## Bắt đầu');
        }

        let promptsText: string;

        if (isSrtMode) {
            // SRT mode: chunk by SRT_CHUNK_SIZE blocks
            const blocks = srtContent.split(/\r?\n\r?\n/).filter((b: string) => b.trim().length > 0);
            if (blocks.length <= SRT_CHUNK_SIZE) {
                // Single call
                const prompt = combinedTemplate.replace('{srtContent}', srtContent);
                promptsText = await callWithRetry(prompt, aiProvider, 0.2, 2, 'prompt');
            } else {
                promptsText = await processCombinedChunkedSrt(
                    blocks, combinedTemplate, aiProvider, srtContent
                );
            }
        } else {
            // Text mode: chunk by MAX_CHARS_SINGLE_CALL
            if (transcript.length <= MAX_CHARS_SINGLE_CALL) {
                // Single call — the happy path (most videos)
                const prompt = combinedTemplate.replace('{transcript}', transcript);
                promptsText = await callWithRetry(prompt, aiProvider, 0.2, 2, 'prompt');
            } else {
                promptsText = await processCombinedChunkedText(
                    transcript, combinedTemplate, aiProvider
                );
            }
        }

        const prompts = parsePrompts(promptsText);

        // Derive durations from prompts (no separate duration step needed)
        const derivedDurations = extractDurationsFromPrompts(prompts);

        // ---------- Save outputs ----------
        const outputsDir = join(cwd, 'outputs');
        await mkdir(outputsDir, { recursive: true });

        const promptsPath = join(outputsDir, 'prompt.md');
        await writeFileAsync(promptsPath, promptsText, 'utf-8');

        // Regenerate durationsText from derivedDurations for backward compatibility
        const durationsText = derivedDurations
            .map(d => `Scene ${d.sceneNumber}\n\n${d.sceneName}\n\n${d.duration}\n\n${d.timeRange}`)
            .join('\n\n');

        return NextResponse.json({
            success: true,
            provider: aiProvider,
            transcript,
            transcriptPath,
            durations: derivedDurations,
            durationsText,
            prompts,
            promptsText,
        });
    } catch (error) {
        console.error('Generate pipeline error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to generate pipeline',
            },
            { status: 500 }
        );
    }
}

/**
 * Derive a durations array from the parsed prompts.
 * Each scene's timeRange is taken from Image 1 start → last Image end.
 */
function extractDurationsFromPrompts(prompts: PromptEntry[]): Array<{
    sceneNumber: number;
    sceneName: string;
    duration: string;
    durationSeconds: number;
    timeRange: string;
    startMs: number;
    endMs: number;
    durationMs: number;
}> {
    return prompts.map(entry => {
        const images = entry.prompts;
        let startMs = 0;
        let endMs = 0;

        if (images.length > 0) {
            const firstRange = images[0].timeRange || '';
            const lastRange = images[images.length - 1].timeRange || '';

            const parseRange = (r: string) => {
                const sep = r.indexOf(' - ');
                if (sep === -1) return { start: 0, end: 0 };
                return {
                    start: parseSrtTimeToMs(r.slice(0, sep).trim()),
                    end: parseSrtTimeToMs(r.slice(sep + 3).trim()),
                };
            };

            startMs = parseRange(firstRange).start;
            endMs = parseRange(lastRange).end;
        }

        const durationMs = Math.max(0, endMs - startMs);
        const durationSeconds = parseFloat((durationMs / 1000).toFixed(3));
        const timeRange = startMs || endMs
            ? `${formatMsToSrtTime(startMs)} - ${formatMsToSrtTime(endMs)}`
            : '';

        // Use first image prompt beginning as scene name (first 60 chars)
        const sceneName = images.length > 0
            ? images[0].prompt.slice(0, 60).replace(/,\s*$/, '')
            : `Scene ${entry.sceneNumber}`;

        return {
            sceneNumber: entry.sceneNumber,
            sceneName,
            duration: `${Math.round(durationSeconds)} giây`,
            durationSeconds,
            timeRange,
            startMs,
            endMs,
            durationMs,
        };
    });
}

/**
 * Process combined Duration+Prompt in chunks for SRT mode.
 * Each chunk of SRT blocks is processed independently, then scene numbers are merged.
 */
async function processCombinedChunkedSrt(
    blocks: string[],
    template: string,
    provider: AIProvider,
    fullSrtContent: string,
): Promise<string> {
    const chunks: string[] = [];
    for (let i = 0; i < blocks.length; i += SRT_CHUNK_SIZE) {
        chunks.push(blocks.slice(i, i + SRT_CHUNK_SIZE).join('\n\n'));
    }

    const chunkPrompts = chunks.map((chunk, i) => {
        const prompt = template.replace('{srtContent}', chunk);
        return prompt.replace(
            '## Bắt đầu',
            `## Bắt đầu\n\nContext: This is chunk ${i + 1} of ${chunks.length}. Scene numbering starts from 1 for this chunk. Use exact SRT timestamps.`
        );
    });

    console.log(`Combined SRT: processing ${chunks.length} chunks (limit 2 concurrent)`);
    const results = await runWithConcurrencyLimit(
        chunkPrompts,
        2,
        async (prompt, i) => {
            console.log(`Combined SRT chunk ${i + 1}/${chunks.length} starting`);
            const res = await callWithRetry(prompt, provider, 0.2, 2, 'prompt');
            console.log(`Combined SRT chunk ${i + 1}/${chunks.length} done`);
            return res;
        }
    );

    // Merge results with renumbered scenes
    const allLines: string[] = [];
    let sceneOffset = 0;
    for (const result of results) {
        const parsed = parsePrompts(result);
        for (const entry of parsed) {
            const newSceneNum = entry.sceneNumber + sceneOffset;
            for (const img of entry.prompts) {
                allLines.push(
                    `Scene ${newSceneNum}:Image ${img.imageNumber} (${img.timeRange}): ${img.prompt}`
                );
            }
        }
        sceneOffset += parsed.length;
    }
    return allLines.join('\n');
}

/**
 * Process combined Duration+Prompt in chunks for text mode (long transcripts).
 * Each chunk of transcript is processed independently with time continuity.
 */
async function processCombinedChunkedText(
    transcript: string,
    template: string,
    provider: AIProvider,
): Promise<string> {
    // Split transcript into paragraph-based chunks
    const paragraphs = transcript.split(/\n\n+/).filter(p => p.trim().length > 0);
    const chunks: string[] = [];
    let currentChunk = '';
    for (const para of paragraphs) {
        if (currentChunk.length + para.length > MAX_CHARS_SINGLE_CALL && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = '';
        }
        currentChunk += para + '\n\n';
    }
    if (currentChunk.trim()) chunks.push(currentChunk.trim());

    const chunkPrompts = chunks.map((chunk, i) => {
        const prompt = template.replace('{transcript}', chunk);
        return prompt.replace(
            '## Bắt đầu',
            `## Bắt đầu\n\nContext: Chunk ${i + 1}/${chunks.length}. Scene numbering starts from 1. Timestamps start from 00:00:00,000 for this chunk.`
        );
    });

    console.log(`Combined Text: processing ${chunks.length} chunks (limit 2 concurrent)`);
    const results = await runWithConcurrencyLimit(
        chunkPrompts,
        2,
        async (prompt, i) => {
            console.log(`Combined Text chunk ${i + 1}/${chunks.length} starting`);
            const res = await callWithRetry(prompt, provider, 0.2, 2, 'prompt');
            console.log(`Combined Text chunk ${i + 1}/${chunks.length} done`);
            return res;
        }
    );

    // Merge: renumber scenes and offset timestamps
    const allLines: string[] = [];
    let sceneOffset = 0;
    let timeOffsetMs = 0;

    for (const result of results) {
        const parsed = parsePrompts(result);
        for (const entry of parsed) {
            const newSceneNum = entry.sceneNumber + sceneOffset;
            for (const img of entry.prompts) {
                // Offset timestamps
                const sep = (img.timeRange || '').indexOf(' - ');
                let newTimeRange = img.timeRange;
                if (sep !== -1 && timeOffsetMs > 0) {
                    const startMs = parseSrtTimeToMs(img.timeRange.slice(0, sep).trim()) + timeOffsetMs;
                    const endMs = parseSrtTimeToMs(img.timeRange.slice(sep + 3).trim()) + timeOffsetMs;
                    newTimeRange = `${formatMsToSrtTime(startMs)} - ${formatMsToSrtTime(endMs)}`;
                }
                allLines.push(`Scene ${newSceneNum}:Image ${img.imageNumber} (${newTimeRange}): ${img.prompt}`);
            }
        }

        // Calculate time offset for next chunk (end time of last image of last scene)
        if (parsed.length > 0) {
            const lastEntry = parsed[parsed.length - 1];
            if (lastEntry.prompts.length > 0) {
                const lastImg = lastEntry.prompts[lastEntry.prompts.length - 1];
                const sep = (lastImg.timeRange || '').indexOf(' - ');
                if (sep !== -1) {
                    timeOffsetMs = parseSrtTimeToMs(lastImg.timeRange.slice(sep + 3).trim()) + timeOffsetMs;
                }
            }
        }
        sceneOffset += parsed.length;
    }

    return allLines.join('\n');
}
