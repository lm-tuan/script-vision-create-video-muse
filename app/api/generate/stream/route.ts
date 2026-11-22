import { NextResponse } from 'next/server';
import { AIProvider, callWithRetry, runWithConcurrencyLimit } from '@/services/ai';
import { readFileSync, writeFile } from 'fs';
import { mkdir, writeFile as writeFileAsync } from 'fs/promises';
import { join } from 'path';
import type { PromptEntry, SubPrompt } from '@/types';
import { parseSrtTimeToMs, formatMsToSrtTime, formatTimeRange } from '@/core/time';
import { parseSrtToMap, getSrtIndices, getSrtTotalDurationMs } from '@/core/srt/SrtParser';
import { parsePrompts } from '@/core/prompt/PromptParser';

const CHUNK_SIZE = 10; // Number of scenes per chunk for prompt generation
const MAX_CHARS_PER_TRANSCRIPT_CHUNK = 2000; // Max characters per transcript chunk for duration

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const content = typeof body.content === 'string' ? body.content : '';
        const aiProvider = 'local' as AIProvider;
        const longForm = Boolean(body.longForm);
        const language = typeof body.language === 'string' ? body.language : 'vi';
        const promptStyle = typeof body.promptStyle === 'string' ? body.promptStyle.trim() : '';
        const promptLanguage = typeof body.promptLanguage === 'string' ? body.promptLanguage : 'en';

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

        // Create a TransformStream for SSE
        const stream = new TransformStream();
        const writer = stream.writable.getWriter();
        const encoder = new TextEncoder();

        // Start processing in background
        (async () => {
            try {
                await writer.write(encoder.encode('data: {"step":"transcript","status":"start","progress":5}\n\n'));

                // ---------- STEP 1: Transcript ----------
                const transcriptTemplatePath = longForm ? 'transcript-long.md' : 'transcript.md';
                const transcriptTemplate = readFileSync(join(cwd, 'templates', transcriptTemplatePath), 'utf-8');
                const transcriptPrompt = transcriptTemplate.replace('{content}', content);

                await writer.write(encoder.encode('data: {"step":"transcript","status":"processing","progress":15}\n\n'));
                const transcript = await callWithRetry(transcriptPrompt, aiProvider, 0.2, 2, 'transcript');
                await writer.write(encoder.encode('data: {"step":"transcript","status":"complete","progress":25}\n\n'));

                // ---------- STEP 2: Duration (chunked if transcript is too long) ----------
                await writer.write(encoder.encode('data: {"step":"duration","status":"start","progress":30}\n\n'));
                const srtContent = typeof body.srtContent === 'string' ? body.srtContent : '';
                const isSrtMode = srtContent.trim().length > 0;
                const durationTemplatePath = isSrtMode ? 'duration_srt.md' : 'duration.md';
                const rawDurationTemplate = readFileSync(join(cwd, 'templates', durationTemplatePath), 'utf-8');

                let durationsText: string;
                if (isSrtMode || transcript.length > MAX_CHARS_PER_TRANSCRIPT_CHUNK) {
                    const durationTemplate = isSrtMode
                        ? rawDurationTemplate
                        : rawDurationTemplate.replace(/### 4\. Quy tắc BẮT BUỘC[\s\S]*?(?=---)/, '');

                    // SSE HEARTBEAT: Gửi comment ": keep-alive" định kỳ mỗi 15 giây để Cloudflare không ngắt kết nối khi đang đợi AI
                    const heartbeatInterval = setInterval(() => {
                        writer.write(encoder.encode(': keep-alive heartbeat\n\n')).catch(() => {});
                    }, 15000);

                    try {
                        durationsText = await processDurationChunked(
                            transcript,
                            durationTemplate,
                            aiProvider,
                            async (pct: number) => {
                                await writer.write(encoder.encode(
                                    `data: ${JSON.stringify({ step: 'duration', status: 'processing', progress: 30 + Math.round(pct * 0.3) })}\n\n`
                                ));
                            },
                            'duration',
                            longForm,
                            srtContent
                        );
                    } finally {
                        clearInterval(heartbeatInterval);
                    }
                } else {
                    const durationTemplate = longForm
                        ? rawDurationTemplate
                        : rawDurationTemplate.replace(/### 4\. Quy tắc BẮT BUỘC[\s\S]*?(?=---)/, '');
                    await writer.write(encoder.encode('data: {"step":"duration","status":"processing","progress":40}\n\n'));
                    const durationPrompt = durationTemplate.replace('{transcript}', transcript);
                    durationsText = (await callWithRetry(durationPrompt, aiProvider, 0.2, 2, 'duration')).replace(/\r\n/g, '\n');
                }

                let durations;
                if (isSrtMode) {
                    durations = parseDurationsFromSrt(durationsText, srtContent);
                } else {
                    durations = parseDurations(durationsText);
                }
                const normalizedDurations = normalizeSceneNumbers(durations);
                await writer.write(encoder.encode('data: {"step":"duration","status":"complete","progress":60}\n\n'));

                // ---------- STEP 3: Prompt (chunked by scene batches) ----------
                await writer.write(encoder.encode('data: {"step":"prompt","status":"start","progress":65}\n\n'));
                const rawPromptTemplate = readFileSync(join(cwd, 'templates', 'prompt.md'), 'utf-8');

                // Resolve the effective language for prompts
                // "auto" → use main app language; otherwise use selected promptLanguage
                const effectivePromptLang = promptLanguage === 'auto' ? language : promptLanguage;
                const effectivePromptLangName = languageNames[effectivePromptLang] || 'Tiếng Anh (English)';

                // Build language instruction lines
                let promptLangRule: string;
                let promptLangDesc: string;
                let promptLangSample: string;

                if (effectivePromptLang === 'en') {
                    promptLangRule = '- **Bắt buộc viết prompt bằng Tiếng Anh (English)** để các công cụ vẽ ảnh hiểu chính xác nhất.';
                    promptLangDesc = '- Mỗi prompt nên lồng ghép đầy đủ các đặc trưng phong cách trên vào nội dung mô tả (bằng Tiếng Anh).';
                    promptLangSample = 'tiếng Anh';
                } else {
                    promptLangRule = `- **Bắt buộc viết prompt bằng ${effectivePromptLangName}** theo lựa chọn của người dùng.`;
                    promptLangDesc = `- Mỗi prompt nên lồng ghép đầy đủ các đặc trưng phong cách trên vào nội dung mô tả (bằng ${effectivePromptLangName}).`;
                    promptLangSample = effectivePromptLangName;
                }

                // Substitute all template placeholders
                let customizedTemplate = rawPromptTemplate
                    .replace('{{IN_IMAGE_LANGUAGE}}', targetLangName)
                    .replace('{{PROMPT_LANG_RULE}}', promptLangRule)
                    .replace('{{PROMPT_LANG_DESC}}', promptLangDesc)
                    .replace(/\{\{PROMPT_LANG_NAME\}\}/g, promptLangSample);

                // Inject a strong language requirement block before "## Bắt đầu"
                if (effectivePromptLang !== 'en') {
                    customizedTemplate = customizedTemplate.replace(
                        '## Bắt đầu',
                        `## YÊU CẦU NGÔN NGỮ BẮT BUỘC:\n- Toàn bộ nội dung mô tả và Image prompt PHẢI viết bằng: **${effectivePromptLangName}**.\n- Nhãn chữ, chú thích hoặc tiêu đề xuất hiện TRONG ảnh (nếu có) PHẢI viết bằng: **${targetLangName}**.\n- TUYỆT ĐỐI không viết prompt bằng tiếng Anh nếu người dùng đã chọn ngôn ngữ khác.\n\n## Bắt đầu`
                    );
                } else if (language !== 'en') {
                    // Prompt in English, but content is in another language → clarify in-image language
                    customizedTemplate = customizedTemplate.replace(
                        '## Bắt đầu',
                        `## YÊU CẦU NGÔN NGỮ:\n- Toàn bộ nội dung mô tả và Image prompt BẮT BUỘC phải viết bằng: Tiếng Anh (English) để các công cụ tạo ảnh (Midjourney/Flux) hiểu chính xác.\n- Nhãn chữ, chú thích hoặc tiêu đề xuất hiện TRONG ảnh (nếu có) BẮT BUỘC phải viết bằng: ${targetLangName}.\n\n## Bắt đầu`
                    );
                }

                // Override style guideline if user provided a custom promptStyle
                if (promptStyle) {
                    const styleStartMarker = '- Phong cách vẽ bắt buộc (Style Guideline):';
                    const styleEndMarker = '- **Bắt buộc viết prompt bằng';
                    const styleStartIdx = customizedTemplate.indexOf(styleStartMarker);
                    const styleEndIdx = customizedTemplate.indexOf(styleEndMarker);
                    if (styleStartIdx !== -1 && styleEndIdx !== -1 && styleEndIdx > styleStartIdx) {
                        const beforeStyle = customizedTemplate.substring(0, styleStartIdx);
                        const afterStyle = customizedTemplate.substring(styleEndIdx);
                        customizedTemplate = `${beforeStyle}- Phong cách vẽ bắt buộc (Style Guideline - do người dùng tùy chỉnh):\n${promptStyle}\n${afterStyle}`;
                    }
                }

                let promptsText: string;
                // SSE HEARTBEAT: Gửi comment ": keep-alive" định kỳ mỗi 15 giây để Cloudflare không ngắt kết nối khi đang đợi AI
                const promptHeartbeat = setInterval(() => {
                    writer.write(encoder.encode(': keep-alive heartbeat\n\n')).catch(() => {});
                }, 15000);

                try {
                    if (normalizedDurations.length > CHUNK_SIZE) {
                        promptsText = await processPromptChunked(
                            normalizedDurations,
                            transcript,
                            customizedTemplate,
                            aiProvider,
                            async (pct: number) => {
                                await writer.write(encoder.encode(
                                    `data: ${JSON.stringify({ step: 'prompt', status: 'processing', progress: 65 + Math.round(pct * 0.3) })}\n\n`
                                ));
                            },
                            'prompt',
                            effectivePromptLangName
                        );
                    } else {
                        await writer.write(encoder.encode('data: {"step":"prompt","status":"processing","progress":75}\n\n'));
                        const durationsTextForPrompt = normalizedDurations
                            .map((d) => `Scene ${d.sceneNumber}\n\n${d.sceneName}\n\n${d.duration}\n\n${d.timeRange}`)
                            .join('\n\n');
                        let promptBody = customizedTemplate
                            .replace('{transcript}', transcript)
                            .replace('{durations}', durationsTextForPrompt);

                        // Append a strict final reminder about the language to bypass few-shot bias from English examples
                        promptBody += `\n\n---
⚠️ **LƯU Ý BẮT BUỘC CUỐI CÙNG (FINAL LANGUAGE DIRECTIVE):**
- Người dùng yêu cầu tạo toàn bộ nội dung prompt vẽ ảnh bằng: **${effectivePromptLangName}**.
- Mặc dù phần ví dụ ở trên hiển thị bằng tiếng Anh, bạn **BẮT BUỘC** phải dịch/viết toàn bộ nội dung mô tả của từng cảnh sang **${effectivePromptLangName}** ở định dạng đầu ra.
- TUYỆT ĐỐI không sử dụng Tiếng Anh (English) cho phần mô tả hình ảnh nếu ngôn ngữ được chọn không phải là tiếng Anh.
- Hãy bắt đầu tạo ngay bây giờ theo đúng ngôn ngữ được yêu cầu.`;

                        promptsText = await callWithRetry(promptBody, aiProvider, 0.2, 2, 'prompt');
                    }
                } finally {
                    clearInterval(promptHeartbeat);
                }

                const prompts = parsePrompts(promptsText);
                await writer.write(encoder.encode('data: {"step":"prompt","status":"complete","progress":90}\n\n'));

                // ---------- Save outputs ----------
                const outputsDir = join(cwd, 'outputs');
                await mkdir(outputsDir, { recursive: true });

                const transcriptPath = join(outputsDir, 'transcript.md');
                const durationsPath = join(outputsDir, 'duration.md');
                const promptsPath = join(outputsDir, 'prompt.md');

                await writeFileAsync(transcriptPath, transcript, 'utf-8');
                await writeFileAsync(durationsPath, durationsText, 'utf-8');
                await writeFileAsync(promptsPath, promptsText, 'utf-8');

                const result = {
                    success: true,
                    provider: aiProvider,
                    transcript,
                    transcriptPath,
                    durations: normalizedDurations,
                    durationsText,
                    prompts,
                    promptsText,
                    progress: 100
                };

                await writer.write(encoder.encode(`data: ${JSON.stringify(result)}\n\n`));
                await writer.close();
            } catch (error) {
                await writer.write(encoder.encode(`data: ${JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed' })}\n\n`));
                await writer.close();
            }
        })();

        return new Response(stream.readable, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
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
 * Process duration generation in chunks when transcript is too long.
 * Splits transcript into paragraphs, groups them into chunks, processes each chunk separately,
 * then concatenates results with adjusted scene numbers and time ranges.
 */
async function processDurationChunked(
    transcript: string,
    template: string,
    provider: AIProvider,
    onProgress?: (percent: number) => Promise<void>,
    step: 'duration' | 'prompt' = 'duration',
    longForm: boolean = false,
    srtContent: string = ''
): Promise<string> {
    const isSrtMode = srtContent.trim().length > 0;
    const chunks: string[] = [];

    if (isSrtMode) {
        const blocks = srtContent.split(/\r?\n\r?\n/).filter(b => b.trim().length > 0);
        const SRT_CHUNK_SIZE = 45; // Tăng từ 15 lên 45 để giảm số lượng chunks gọi AI song song, tránh timeout 524
        for (let i = 0; i < blocks.length; i += SRT_CHUNK_SIZE) {
            chunks.push(blocks.slice(i, i + SRT_CHUNK_SIZE).join('\n\n'));
        }
    } else {
        const paragraphs = transcript.split(/\n\n+/).filter(p => p.trim().length > 0);
        let currentChunk = '';
        let currentLength = 0;

        // Group paragraphs into chunks of ~4000 chars each
        for (const para of paragraphs) {
            if (currentLength + para.length > MAX_CHARS_PER_TRANSCRIPT_CHUNK && currentChunk.length > 0) {
                chunks.push(currentChunk.trim());
                currentChunk = '';
                currentLength = 0;
            }
            currentChunk += para + '\n\n';
            currentLength += para.length;
        }
        if (currentChunk.trim().length > 0) {
            chunks.push(currentChunk.trim());
        }
    }

    // Calculate target scenes per chunk for longForm
    const MIN_TOTAL_SCENES = 60;
    const MAX_TOTAL_SCENES = 150;
    const targetScenesPerChunk = longForm
        ? Math.max(15, Math.ceil(MIN_TOTAL_SCENES / chunks.length))
        : 0;

    // Prepare prompts for all chunks
    const chunkPrompts = chunks.map((chunk, i) => {
        let chunkPrompt = isSrtMode
            ? template.replace('{srtContent}', chunk)
            : template.replace('{transcript}', chunk);

        // For longForm with multiple chunks, inject chunk context
        if (!isSrtMode && longForm && chunks.length > 1) {
            const remainingChunks = chunks.length - i - 1;
            const minScenesThisChunk = targetScenesPerChunk;
            const maxScenesThisChunk = Math.max(minScenesThisChunk + 5, Math.ceil(MAX_TOTAL_SCENES / chunks.length) + 5);

            const chunkContext = `
### 5. Context for chunk ${i + 1}/${chunks.length}

- This is chunk ${i + 1} of ${chunks.length} total chunks.
- The FINAL video must be 10-15 minutes total across ALL chunks.
- For this chunk, generate ${minScenesThisChunk}-${maxScenesThisChunk} scenes.
- Each scene: 3-10 seconds.
- Total scenes across all chunks must reach 60-150 scenes.
- ${remainingChunks > 0 ? `There are ${remainingChunks} more chunks after this one.` : 'This is the LAST chunk.'}
- DO NOT generate fewer than ${minScenesThisChunk} scenes for this chunk.
`;
            chunkPrompt = chunkPrompt.replace('## Bắt đầu', chunkContext + '\n\n## Bắt đầu');
        } else {
            chunkPrompt = chunkPrompt.replace(
                '## Bắt đầu',
                `## Bắt đầu\n\nContext: This is chunk ${i + 1} of ${chunks.length}. ${isSrtMode ? 'Keep the absolute timestamps exactly as found in the SRT input.' : ''} Scene numbering should start from 1 for this chunk.`
            );
        }
        return chunkPrompt;
    });

    console.log(`Duration Stream: processing ${chunks.length} chunks in parallel (limit 2 sessions)`);
    let completedChunks = 0;
    const chunkResults = await runWithConcurrencyLimit(
        chunkPrompts,
        2,
        async (chunkPrompt, i) => {
            console.log(`Duration Stream: starting chunk ${i + 1}/${chunks.length}`);
            const res = await callWithRetry(chunkPrompt, provider, 0.2, 2, step);
            completedChunks++;
            if (onProgress) {
                await onProgress(completedChunks / chunks.length);
            }
            console.log(`Duration Stream: completed chunk ${i + 1}/${chunks.length}`);
            return res.replace(/\r\n/g, '\n');
        }
    );

    if (isSrtMode) {
        const allResults: string[] = [];
        let sceneOffset = 0;
        for (let i = 0; i < chunkResults.length; i++) {
            const result = chunkResults[i];
            const chunkAbsoluteIndices = getSrtIndices(chunks[i]);
            const scenes = parseDurationsFromSrt(result, srtContent, chunkAbsoluteIndices);
            
            const adjustedLines: string[] = [];
            for (const scene of scenes) {
                const adjustedNumber = scene.sceneNumber + sceneOffset;
                const indicesStr = scene.indices ? scene.indices.join(', ') : '';
                adjustedLines.push(
                    `Scene ${adjustedNumber}\n\n${scene.sceneName}\n\n${indicesStr}`
                );
            }
            allResults.push(adjustedLines.join('\n\n'));
            sceneOffset += scenes.length;
        }
        return allResults.join('\n\n');
    }

    const allResults: string[] = [];
    let sceneOffset = 0;
    let timeOffset = 0; // in seconds

    for (let i = 0; i < chunkResults.length; i++) {
        const result = chunkResults[i];
        const scenes = parseDurations(result);

        if (scenes.length === 0) {
            allResults.push(result);
        } else {
            const adjustedLines: string[] = [];
            for (const scene of scenes) {
                const adjustedNumber = scene.sceneNumber + sceneOffset;
                adjustedLines.push(
                    `Scene ${adjustedNumber}\n\n${scene.sceneName}\n\n${scene.duration}\n\n${scene.timeRange}`
                );
            }
            allResults.push(adjustedLines.join('\n\n'));

            if (scenes.length > 0) {
                const lastScene = scenes[scenes.length - 1];
                sceneOffset += scenes.length;
                timeOffset += lastScene.durationSeconds;
            }
        }
    }

    // Recalculate time ranges for the complete merged result
    const mergedScenes = allResults
        .join('\n\n')
        .split(/(?=Scene\s+\d+)/g)
        .filter(s => s.trim().length > 0);

    const finalLines: string[] = [];
    let cumulativeTime = 0;
    let sceneCounter = 1;

    for (const sceneBlock of mergedScenes) {
        const durationMatch = sceneBlock.match(/(\d+)\s*giây/);
        const seconds = durationMatch ? parseInt(durationMatch[1]) : 5;

        const startMin = Math.floor(cumulativeTime / 60);
        const startSec = cumulativeTime % 60;
        const endTime = cumulativeTime + seconds;
        const endMin = Math.floor(endTime / 60);
        const endSec = endTime % 60;

        const timeRange = `${String(startMin).padStart(2, '0')}:${String(startSec).padStart(2, '0')} - ${String(endMin).padStart(2, '0')}:${String(endSec).padStart(2, '0')}`;

        finalLines.push(
            `Scene ${sceneCounter}\n\n${(sceneBlock.match(/\n\n(.+?)\n\n/) || ['', ''])[1]}\n\n${seconds} giây\n\n${timeRange}`
        );

        cumulativeTime = endTime;
        sceneCounter++;
    }

    return finalLines.join('\n\n');
}

/**
 * Process prompt generation in batches of scenes.
 * Each batch generates prompts for a subset of scenes, then results are merged.
 */
async function processPromptChunked(
    durations: Array<{
        sceneNumber: number;
        sceneName: string;
        duration: string;
        durationSeconds: number;
        timeRange: string;
    }>,
    transcript: string,
    template: string,
    provider: AIProvider,
    onProgress?: (percent: number) => Promise<void>,
    step: 'duration' | 'prompt' = 'prompt',
    effectivePromptLangName?: string
): Promise<string> {
    const batchPrompts: string[] = [];
    const batchInfo: Array<{ start: number; end: number; len: number }> = [];
    const totalBatches = Math.ceil(durations.length / CHUNK_SIZE);

    for (let i = 0; i < durations.length; i += CHUNK_SIZE) {
        const batch = durations.slice(i, i + CHUNK_SIZE);
        const batchStartNumber = batch[0].sceneNumber;
        const batchEndNumber = batch[batch.length - 1].sceneNumber;

        const durationsTextForPrompt = batch
            .map((d) => `Scene ${d.sceneNumber}\n\n${d.sceneName}\n\n${d.duration}\n\n${d.timeRange}`)
            .join('\n\n');

        let batchPrompt = template
            .replace('{transcript}', transcript)
            .replace('{durations}', durationsTextForPrompt)
            .replace(
                '## Bắt đầu',
                `## Bắt đầu\n\nIMPORTANT: Generate prompts ONLY for scenes ${batchStartNumber} to ${batchEndNumber} (${batch.length} scenes). Do NOT generate prompts for any other scenes.`
            );

        if (effectivePromptLangName) {
            batchPrompt += `\n\n---
⚠️ **LƯU Ý BẮT BUỘC CUỐI CÙNG (FINAL LANGUAGE DIRECTIVE):**
- Người dùng yêu cầu tạo toàn bộ nội dung prompt vẽ ảnh bằng: **${effectivePromptLangName}**.
- Mặc dù phần ví dụ ở trên hiển thị bằng tiếng Anh, bạn **BẮT BUỘC** phải dịch/viết toàn bộ nội dung mô tả của từng cảnh sang **${effectivePromptLangName}** ở định dạng đầu ra.
- TUYỆT ĐỐI không sử dụng Tiếng Anh (English) cho phần mô tả hình ảnh nếu ngôn ngữ được chọn không phải là tiếng Anh.
- Hãy bắt đầu tạo ngay bây giờ theo đúng ngôn ngữ được yêu cầu.`;
        }

        batchPrompts.push(batchPrompt);
        batchInfo.push({ start: batchStartNumber, end: batchEndNumber, len: batch.length });
    }

    console.log(`Prompt Stream: processing ${batchPrompts.length} batches in parallel (limit 2 sessions)`);
    let completedBatches = 0;
    const results = await runWithConcurrencyLimit(
        batchPrompts,
        2,
        async (batchPrompt, idx) => {
            const info = batchInfo[idx];
            console.log(`Prompt Stream: starting batch ${idx + 1}/${batchPrompts.length} (scenes ${info.start}-${info.end})`);
            const res = await callWithRetry(batchPrompt, provider, 0.2, 2, step);
            completedBatches++;
            if (onProgress) {
                await onProgress(completedBatches / totalBatches);
            }
            console.log(`Prompt Stream: completed batch ${idx + 1}/${batchPrompts.length}`);
            return res;
        }
    );

    return results.join('\n\n');
}

function parseDurations(text: string): Array<{
    sceneNumber: number;
    sceneName: string;
    duration: string;
    durationSeconds: number;
    timeRange: string;
    startMs?: number;
    endMs?: number;
    durationMs?: number;
}> {
    const scenes: Array<{
        sceneNumber: number;
        sceneName: string;
        duration: string;
        durationSeconds: number;
        timeRange: string;
        startMs?: number;
        endMs?: number;
        durationMs?: number;
    }> = [];

    const cleanText = text.trim();
    const normalizedText = cleanText.replace(/\r\n/g, '\n');
    const blocks = normalizedText.split(/Scene\s+(\d+)/i);

    for (let i = 1; i < blocks.length; i += 2) {
        const sceneNum = parseInt(blocks[i]);
        const rest = blocks[i + 1] || "";
        
        let parts = rest.trim().split(/\n\n+/);
        if (parts.length < 2) {
            parts = rest.trim().split(/\n/).map(line => line.trim()).filter(line => line.length > 0);
        }

        if (parts.length >= 1) {
            const sceneName = parts[0].trim();
            const durationStr = parts[1] ? parts[1].trim() : "5 giây";
            const timeRange = parts[2] ? parts[2].trim() : "";

            let durationSeconds = 0;
            let startMs = 0;
            let endMs = 0;
            let durationMs = 0;

            if (timeRange.includes("-")) {
                const rangeParts = timeRange.split("-").map(t => t.trim());
                startMs = parseSrtTimeToMs(rangeParts[0]);
                endMs = parseSrtTimeToMs(rangeParts[1]);
                if (endMs > startMs) {
                    durationMs = endMs - startMs;
                    durationSeconds = parseFloat((durationMs / 1000).toFixed(3));
                }
            }

            if (durationSeconds <= 0) {
                const durationMatch = durationStr.match(/(\d+)/);
                durationSeconds = durationMatch ? parseInt(durationMatch[1]) : 5;
                durationMs = durationSeconds * 1000;
            }

            scenes.push({
                sceneNumber: sceneNum,
                sceneName,
                duration: `${Math.round(durationSeconds)} giây`,
                durationSeconds,
                timeRange,
                startMs,
                endMs,
                durationMs
            });
        }
    }

    return scenes;
}

function normalizeSceneNumbers(
    scenes: Array<{
        sceneNumber: number;
        sceneName: string;
        duration: string;
        durationSeconds: number;
        timeRange: string;
    }>
): Array<{
    sceneNumber: number;
    sceneName: string;
    duration: string;
    durationSeconds: number;
    timeRange: string;
}> {
    return scenes.map((scene, index) => ({
        ...scene,
        sceneNumber: index + 1,
    }));
}



function parseDurationsFromSrt(
    aiOutput: string, 
    srtText: string,
    chunkAbsoluteIndices?: number[]
): Array<{
    sceneNumber: number;
    sceneName: string;
    duration: string;
    durationSeconds: number;
    timeRange: string;
    startMs?: number;
    endMs?: number;
    durationMs?: number;
    indices?: number[];
}> {
    const subMap = parseSrtToMap(srtText);
    const sceneBlocks = aiOutput.replace(/\r\n/g, '\n').split(/(?=Scene\s+\d+)/g).filter(s => s.trim().length > 0);
    const result: Array<{
        sceneNumber: number;
        sceneName: string;
        duration: string;
        durationSeconds: number;
        timeRange: string;
        startMs: number;
        endMs: number;
        durationMs: number;
        indices?: number[];
    }> = [];
    
    let sceneIndex = 1;
    for (const block of sceneBlocks) {
        const lines = block.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length >= 2) {
            // Find the line that represents indices (searching from bottom up)
            let rawIndices: number[] = [];
            let foundIndicesLineIdx = -1;
            
            for (let j = lines.length - 1; j >= 1; j--) {
                const line = lines[j];
                const isDurationLine = /giây|second|duration|thời\s+lượng|time/i.test(line);
                const nums = (line.match(/\d+/g) || []).map(Number);
                if (nums.length > 0 && !isDurationLine) {
                    rawIndices = nums;
                    foundIndicesLineIdx = j;
                    break;
                }
            }
            
            if (rawIndices.length > 0 && foundIndicesLineIdx !== -1) {
                // Extract scene name (combine all lines between Scene header and indices line)
                const sceneName = lines.slice(1, foundIndicesLineIdx).join(" - ").trim() || lines[1];
                
                // Map indices to absolute indices if they are relative
                const indices = rawIndices.map(idx => {
                    if (chunkAbsoluteIndices && chunkAbsoluteIndices.length > 0) {
                        if (chunkAbsoluteIndices.includes(idx)) {
                            return idx;
                        }
                        if (idx >= 1 && idx <= chunkAbsoluteIndices.length) {
                            return chunkAbsoluteIndices[idx - 1];
                        }
                    }
                    return idx;
                });
                
                let minStartMs = Infinity;
                let maxEndMs = -Infinity;
                for (const idx of indices) {
                    const sub = subMap.get(idx);
                    if (sub) {
                        if (sub.startMs < minStartMs) minStartMs = sub.startMs;
                        if (sub.endMs > maxEndMs) maxEndMs = sub.endMs;
                    }
                }
                
                if (minStartMs !== Infinity && maxEndMs !== -Infinity) {
                    const durationMs = maxEndMs - minStartMs;
                    const durationSeconds = parseFloat((durationMs / 1000).toFixed(3));
                    const timeRangeStr = `${formatMsToSrtTime(minStartMs)} - ${formatMsToSrtTime(maxEndMs)}`;
                    
                    result.push({
                        sceneNumber: sceneIndex,
                        sceneName,
                        duration: `${Math.round(durationSeconds)} giây`,
                        durationSeconds,
                        timeRange: timeRangeStr,
                        startMs: minStartMs,
                        endMs: maxEndMs,
                        durationMs,
                        indices
                    });
                    sceneIndex++;
                }
            }
        }
    }
    
    return result;
}
