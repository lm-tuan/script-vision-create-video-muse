import { NextResponse } from 'next/server';
import { AIProvider, callWithRetry, runWithConcurrencyLimit } from '@/services/ai';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSrtTimeToMs, formatMsToSrtTime, formatTimeRange } from '@/core/time';
import { parseSrtToMap, getSrtIndices, getSrtTotalDurationMs } from '@/core/srt/SrtParser';

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const transcript = typeof body.transcript === 'string' ? body.transcript : '';
        const srtContent = typeof body.srtContent === 'string' ? body.srtContent : '';
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

        const isSrtMode = srtContent.trim().length > 0;

        if (!transcript.trim() && !isSrtMode) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Missing transcript or srtContent',
                },
                { status: 400 }
            );
        }

        let chunks: string[] = [];
        if (aiProvider === 'local') {
            chunks = [isSrtMode ? srtContent : transcript];
        } else if (isSrtMode) {
            const blocks = srtContent.split(/\r?\n\r?\n/).filter((b: string) => b.trim().length > 0);
            const SRT_CHUNK_SIZE = 15;
            for (let i = 0; i < blocks.length; i += SRT_CHUNK_SIZE) {
                chunks.push(blocks.slice(i, i + SRT_CHUNK_SIZE).join('\n\n'));
            }
            console.log(`Duration (SRT Mode): processing ${chunks.length} chunks from ${blocks.length} subtitle blocks`);
        } else {
            const isCharBased = language === 'ja' || language === 'zh';
            if (isCharBased) {
                const CHUNK_SIZE = 1000;
                const cleanText = transcript.replace(/\r?\n/g, ' ');
                for (let i = 0; i < cleanText.length; i += CHUNK_SIZE) {
                    chunks.push(cleanText.slice(i, i + CHUNK_SIZE));
                }
                console.log(`Duration: processing ${chunks.length} chunks from ${cleanText.length} characters, longForm=${longForm}`);
            } else {
                const CHUNK_SIZE = 500;
                const words = transcript.split(/\s+/);
                for (let i = 0; i < words.length; i += CHUNK_SIZE) {
                    chunks.push(words.slice(i, i + CHUNK_SIZE).join(' '));
                }
                console.log(`Duration: processing ${chunks.length} chunks from ${words.length} words, longForm=${longForm}`);
            }
        }

        const wpmByLanguage: Record<string, number> = {
            vi: 140,  // Tiếng Việt TTS
            en: 150,  // English TTS
            ja: 330,  // Japanese — CPM (Characters Per Minute)
            zh: 260,  // Chinese — CPM (Characters Per Minute)
            fr: 145,  // French
            ko: 130   // Korean
        };
        const wpm = wpmByLanguage[language] || 140;

        const templateFileName = isSrtMode ? 'duration_srt.md' : 'duration.md';
        const templatePath = join(process.cwd(), 'templates', templateFileName);
        const rawTemplate = readFileSync(templatePath, 'utf-8');

        // Build template based on longForm and chunking
        // If there are multiple chunks, we remove the "90 scenes / 15 mins" absolute rule from the template
        // because we will instruct the model to generate a smaller, proportional number of scenes per chunk.
        let template = rawTemplate;
        if (!isSrtMode) {
            if (longForm) {
                // ALWAYS keep the 15-20 min mandatory rules for longForm — whether single or multi-chunk
                template = rawTemplate;
            } else {
                // shortForm: replace mandatory rules with relaxed rules
                const replacement = `### 4. Quy tắc cho video ngắn\n\n- Mỗi ý quan trọng = 1 Scene\n- Không cần chia quá nhỏ: Scene 5–8 giây là phù hợp\n- Tổng thời lượng nên khớp gần với thời lượng đọc thực của transcript\n- Không có yêu cầu số lượng Scene tối thiểu\n\n`;
                template = rawTemplate.replace(/### 4\. Quy tắc BẮT BUỘC[\s\S]*?(?=---)/, replacement);
            }
        }

        let allDurations: Array<{
            sceneNumber: number;
            sceneName: string;
            duration: string;
            durationSeconds: number;
            timeRange: string;
            startMs?: number;
            endMs?: number;
            durationMs?: number;
        }> = [];

        // Calculate target scenes per chunk for longForm
        // Target: 90-180 scenes total for 15-20 min
        const MIN_TOTAL_SCENES = 90;
        const MAX_TOTAL_SCENES = 180;
        const targetScenesPerChunk = longForm
            ? Math.max(15, Math.ceil(MIN_TOTAL_SCENES / chunks.length))
            : 0;

        // Prepare prompts for all chunks
        const chunkPrompts = chunks.map((chunk, i) => {
            let chunkPrompt = isSrtMode
                ? template.replace('{srtContent}', chunk)
                : template.replace('{transcript}', chunk);

            if (!isSrtMode) {
                const isCharBased = language === 'ja' || language === 'zh';
                const chunkWordCount = isCharBased
                    ? chunk.replace(/\s+/g, '').length
                    : chunk.split(/\s+/).filter(Boolean).length;
                const chunkEstimatedSeconds = Math.round((chunkWordCount / wpm) * 60);
                const chunkEstimatedMinutes = parseFloat((chunkEstimatedSeconds / 60).toFixed(1));

                chunkPrompt = chunkPrompt
                    .replace(/{wordCount}/g, chunkWordCount.toString())
                    .replace(/{wpm}/g, wpm.toString())
                    .replace(/{estimatedTotalSeconds}/g, chunkEstimatedSeconds.toString())
                    .replace(/{estimatedTotalMinutes}/g, chunkEstimatedMinutes.toString());
            }

            // For longForm with multiple chunks, inject chunk context
            if (!isSrtMode && longForm && chunks.length > 1) {
                const remainingChunks = chunks.length - i - 1;
                const minScenesThisChunk = targetScenesPerChunk;
                const maxScenesThisChunk = Math.max(minScenesThisChunk + 5, Math.ceil(MAX_TOTAL_SCENES / chunks.length) + 5);

                const chunkContext = `
### 5. Context for chunk ${i + 1}/${chunks.length}

- This is chunk ${i + 1} of ${chunks.length} total chunks.
- The FINAL video must be 15-20 minutes total across ALL chunks.
- For this chunk, generate ${minScenesThisChunk}-${maxScenesThisChunk} scenes.
- Each scene: 3-10 seconds.
- Total scenes across all chunks must reach 90-180 scenes.
- ${remainingChunks > 0 ? `There are ${remainingChunks} more chunks after this one.` : 'This is the LAST chunk.'}
- DO NOT generate fewer than ${minScenesThisChunk} scenes for this chunk.
`;
                chunkPrompt = chunkPrompt.replace('## Bắt đầu', chunkContext + '\n\n## Bắt đầu');
            } else if (isSrtMode && aiProvider !== 'local') {
                // IMPORTANT: remind AI to use ABSOLUTE subtitle indices as they appear in the chunk (not local/relative)
                chunkPrompt = chunkPrompt.replace(
                    '## Bắt đầu',
                    `## Bắt đầu\n\nIMPORTANT: This is chunk ${i + 1} of ${chunks.length} from the full SRT file. The subtitle indices in this chunk are ABSOLUTE numbers (e.g. ${i * 15 + 1} to ${(i + 1) * 15}). You MUST output the exact original subtitle index numbers as they appear in the input (do NOT restart from 1). Scene numbering in your output starts from 1 for this chunk only.`
                );
            }

            // Append language rule - SRT mode and transcript mode have different requirements
            let langInstruction: string;
            if (isSrtMode) {
                // SRT mode: AI returns subtitle indices, not duration strings — no "giây" needed
                langInstruction = `\n\n---\n\n## YÊU CẦU NGÔN NGỮ:\n- Tên phân cảnh (Scene Name) BẮT BUỘC phải đặt bằng: ${targetLangName}.\n- Danh sách số thứ tự phụ đề (subtitle indices) phải là các số nguyên đúng như trong file SRT gốc, cách nhau bằng dấu phẩy. KHÔNG thay đổi hoặc đánh lại số thứ tự.`;
            } else {
                langInstruction = `\n\n--- \n\n## YÊU CẦU NGÔN NGỮ:\n- Tên phân cảnh (Scene Name) và mô tả phân cảnh BẮT BUỘC phải đặt bằng: ${targetLangName}.\n- Lưu ý cực kỳ quan trọng: Trong phần thời lượng, phải viết từ khóa bằng tiếng Việt là "giây" (ví dụ: "5 giây" hoặc "3 giây") để hệ thống phân tích cú pháp chuẩn xác. Tuyệt đối không dịch chữ "giây" sang ngôn ngữ khác.`;
            }
            chunkPrompt += langInstruction;

            return chunkPrompt;
        });

        console.log(aiProvider === 'local'
            ? 'Duration: processing full input in one local run'
            : `Duration: processing ${chunks.length} chunks in parallel (limit 2 sessions)`);
        const chunkDurationsTexts = await runWithConcurrencyLimit(
            chunkPrompts,
            2,
            async (chunkPrompt, i) => {
                console.log(`Duration: starting chunk ${i + 1}/${chunks.length}`);
                const res = await callWithRetry(chunkPrompt, aiProvider, 0.2, 2, 'duration');
                console.log(`Duration: completed chunk ${i + 1}/${chunks.length}`);
                return res.replace(/\r\n/g, '\n');
            }
        );

        // Process results sequentially to preserve order
        if (isSrtMode) {
            chunkDurationsTexts.forEach((chunkDurationsText, i) => {
                const chunkAbsoluteIndices = getSrtIndices(chunks[i]);
                const chunkDurations = parseDurationsFromSrt(chunkDurationsText, srtContent, chunkAbsoluteIndices);
                console.log(`Duration (SRT): chunk ${i + 1} produced ${chunkDurations.length} scenes`);
                allDurations.push(...chunkDurations);
            });
            // Re-number scenes sequentially
            allDurations.forEach((d, idx) => {
                d.sceneNumber = idx + 1;
            });

            // Stretch the final scene to cover the end of the SRT file if there's any gap
            const srtTotalDurationMs = getSrtTotalDurationMs(srtContent);
            if (allDurations.length > 0 && srtTotalDurationMs > 0) {
                const lastScene = allDurations[allDurations.length - 1];
                if (lastScene.endMs !== undefined && lastScene.endMs < srtTotalDurationMs) {
                    console.log(`Duration (SRT): Stretching last scene endMs from ${lastScene.endMs}ms to SRT end ${srtTotalDurationMs}ms`);
                    lastScene.endMs = srtTotalDurationMs;
                    lastScene.durationMs = lastScene.endMs - (lastScene.startMs || 0);
                    lastScene.durationSeconds = parseFloat((lastScene.durationMs / 1000).toFixed(3));
                    lastScene.duration = `${Math.round(lastScene.durationSeconds)} giây`;
                    lastScene.timeRange = `${formatMsToSrtTime(lastScene.startMs || 0)} - ${formatMsToSrtTime(lastScene.endMs)}`;
                }
            }
        } else {
            chunkDurationsTexts.forEach((chunkDurationsText, i) => {
                const chunkDurations = parseDurations(chunkDurationsText);
                console.log(`Duration: chunk ${i + 1} produced ${chunkDurations.length} scenes`);
                const offset = allDurations.length;
                chunkDurations.forEach((d, idx) => {
                    allDurations.push({
                        ...d,
                        sceneNumber: offset + idx + 1,
                    });
                });
            });
        }

        if (aiProvider === 'local' && allDurations.length === 0) {
            throw new Error('API local không trả về phân cảnh thời lượng hợp lệ.');
        }

        // For longForm, validate total duration
        // Skip expansion if SRT is available — calibration will handle alignment
        const hasSrt = srtContent.trim().length > 0;
        if (longForm && !hasSrt) {
            let totalSeconds = allDurations.reduce((sum, d) => sum + d.durationSeconds, 0);
            let totalMinutes = totalSeconds / 60;
            console.log(`Duration: total ${allDurations.length} scenes, ${totalMinutes.toFixed(1)} minutes (no SRT, longForm)`);

            // Step 1: Proportional scaling if under target (15 min)
            if (totalMinutes < 15) {
                console.warn(`Duration: only ${totalMinutes.toFixed(1)} min, below 15 min target. Applying proportional expansion...`);
                allDurations = expandDurations(allDurations, 900); // 900 seconds = 15 min
                totalSeconds = allDurations.reduce((sum, d) => sum + d.durationSeconds, 0);
                totalMinutes = totalSeconds / 60;
                console.log(`Duration: after expansion: ${allDurations.length} scenes, ${totalMinutes.toFixed(1)} minutes`);
            }

            // Step 2: Validation loop — if still short, call AI for supplemental scenes
            if (aiProvider !== 'local' && totalMinutes < 14.5 && allDurations.length < 90) {
                console.warn(`Duration: still only ${totalMinutes.toFixed(1)} min with ${allDurations.length} scenes. Calling AI for supplemental scenes...`);
                try {
                    const supplementPrompt = `You previously generated ${allDurations.length} scenes totaling ${totalSeconds} seconds (${totalMinutes.toFixed(1)} minutes) from a transcript. The target is 15-20 minutes (900-1200 seconds).

The current scenes are:
${allDurations.map(d => `Scene ${d.sceneNumber}: ${d.sceneName} (${d.durationSeconds}s)`).join('\n')}

Please generate ${Math.max(20, Math.ceil((900 - totalSeconds) / 5))} ADDITIONAL scenes to fill the gap. Each scene should be 3-8 seconds. Focus on:
- Expanding existing ideas with more visual detail
- Adding transition moments between major topics
- Breaking down complex scenes into smaller sub-scenes

Output format (start numbering from ${allDurations.length + 1}):
Scene ${allDurations.length + 1}

[Scene Name]

[X] giây

[MM:SS] - [MM:SS]`;

                    const supplementText = await callWithRetry(supplementPrompt, aiProvider, 0.3, 2, 'duration');
                    const supplementScenes = parseDurations(supplementText.replace(/\r\n/g, '\n'));
                    if (supplementScenes.length > 0) {
                        const offset = allDurations.length;
                        supplementScenes.forEach((d, idx) => {
                            allDurations.push({
                                ...d,
                                sceneNumber: offset + idx + 1,
                            });
                        });
                        console.log(`Duration: added ${supplementScenes.length} supplemental scenes. New total: ${allDurations.length} scenes`);
                        // Re-apply proportional expansion with new scenes
                        const newTotal = allDurations.reduce((sum, d) => sum + d.durationSeconds, 0);
                        if (newTotal < 900) {
                            allDurations = expandDurations(allDurations, 900);
                        }
                    }
                } catch (suppErr) {
                    console.warn('Duration: supplemental scene generation failed (non-fatal):', suppErr);
                    // Fall through — use what we have
                }
            }
        } else if (longForm && hasSrt) {
            const totalSeconds = allDurations.reduce((sum, d) => sum + d.durationSeconds, 0);
            console.log(`Duration: total ${allDurations.length} scenes, ${(totalSeconds/60).toFixed(1)} minutes (SRT present — skip expand, will calibrate)`);
        }

        // ── SRT Calibration (transcript mode only) ────────────────────────────────────
        // If transcript mode was used but SRT is also provided, proportionally
        // rescale AI-estimated durations to match the ACTUAL SRT total duration.
        if (!isSrtMode && hasSrt && allDurations.length > 0) {
            try {
                const srtActualDurationMs = getSrtTotalDurationMs(srtContent);
                if (srtActualDurationMs > 0) {
                    const aiTotalMs = allDurations.reduce((sum, d) => sum + (d.durationMs || Math.round(d.durationSeconds * 1000)), 0);
                    const scale = srtActualDurationMs / (aiTotalMs || 1);
                    console.log(`Duration: SRT calibration — AI=${aiTotalMs}ms SRT=${srtActualDurationMs}ms scale=${scale.toFixed(3)}`);

                    let cursorMs = 0;
                    allDurations = allDurations.map((d, idx) => {
                        const isLast = idx === allDurations.length - 1;
                        const currentDurMs = d.durationMs || Math.round(d.durationSeconds * 1000);
                        let newDurMs: number;
                        if (isLast) {
                            newDurMs = Math.max(1000, srtActualDurationMs - cursorMs);
                        } else {
                            newDurMs = Math.max(1000, Math.round(currentDurMs * scale));
                        }
                        const startMs = cursorMs;
                        const endMs = cursorMs + newDurMs;
                        cursorMs = endMs;
                        return {
                            ...d,
                            durationMs: newDurMs,
                            durationSeconds: parseFloat((newDurMs / 1000).toFixed(3)),
                            duration: `${Math.round(newDurMs / 1000)} giây`,
                            timeRange: `${formatMsToSrtTime(startMs)} - ${formatMsToSrtTime(endMs)}`,
                            startMs,
                            endMs
                        };
                    });
                    console.log(`Duration: SRT calibration done — ${allDurations.length} scenes, total=${cursorMs}ms (SRT=${srtActualDurationMs}ms)`);
                }
            } catch (calibErr) {
                console.warn('Duration: SRT calibration failed (non-fatal):', calibErr);
            }
        }

        // Merge short scenes under 3 seconds to prevent rapid image changes
        console.log(`Duration: total scenes before merging short ones: ${allDurations.length}`);
        allDurations = mergeShortScenes(allDurations, 3000);
        console.log(`Duration: total scenes after merging short ones: ${allDurations.length}`);

        return NextResponse.json({
            success: true,
            durations: allDurations,
            raw: '',
            provider: aiProvider,
        });
    } catch (error) {
        console.error('Duration pipeline error:', error);
        const message = error instanceof Error ? error.message : 'Failed to generate durations';

        return NextResponse.json(
            {
                success: false,
                error: message,
            },
            { status: 500 }
        );
    }
}


function expandDurations(
    scenes: Array<{
        sceneNumber: number;
        sceneName: string;
        duration: string;
        durationSeconds: number;
        timeRange: string;
        startMs?: number;
        endMs?: number;
        durationMs?: number;
    }>,
    minTotalSeconds: number
): Array<{
    sceneNumber: number;
    sceneName: string;
    duration: string;
    durationSeconds: number;
    timeRange: string;
    startMs?: number;
    endMs?: number;
    durationMs?: number;
}> {
    const minTotalMs = minTotalSeconds * 1000;
    const MAX_SCENE_DURATION_MS = 10000;
    const currentTotalMs = scenes.reduce((sum, s) => sum + (s.durationMs || Math.round(s.durationSeconds * 1000)), 0);

    if (currentTotalMs >= minTotalMs) {
        return scenes; // Already sufficient
    }

    const scale = minTotalMs / (currentTotalMs || 1);
    console.log(`expandDurations: scale=${scale.toFixed(2)}, current=${currentTotalMs}ms, target=${minTotalMs}ms`);

    // Phase 1: Proportional scaling with cap
    let expanded = scenes.map((scene, idx) => {
        const currentDurMs = scene.durationMs || Math.round(scene.durationSeconds * 1000);
        let newDurationMs = Math.round(currentDurMs * scale);
        newDurationMs = Math.max(3000, Math.min(newDurationMs, MAX_SCENE_DURATION_MS));
        return {
            ...scene,
            sceneNumber: idx + 1,
            durationMs: newDurationMs,
            durationSeconds: parseFloat((newDurationMs / 1000).toFixed(3)),
            duration: `${Math.round(newDurationMs / 1000)} giây`,
        };
    });

    // Phase 2: If still short due to capping, distribute remaining evenly
    let newTotalMs = expanded.reduce((sum, s) => sum + s.durationMs, 0);
    let iterations = 0;
    while (newTotalMs < minTotalMs && iterations < 5) {
        const deficitMs = minTotalMs - newTotalMs;
        const upgradeable = expanded.filter(s => s.durationMs < MAX_SCENE_DURATION_MS);
        if (upgradeable.length === 0) break;

        const addPerSceneMs = Math.max(1, Math.ceil(deficitMs / upgradeable.length));
        for (const scene of upgradeable) {
            if (newTotalMs >= minTotalMs) break;
            const canAddMs = Math.min(addPerSceneMs, MAX_SCENE_DURATION_MS - scene.durationMs);
            if (canAddMs > 0) {
                scene.durationMs += canAddMs;
                scene.durationSeconds = parseFloat((scene.durationMs / 1000).toFixed(3));
                scene.duration = `${Math.round(scene.durationMs / 1000)} giây`;
                newTotalMs += canAddMs;
            }
        }
        iterations++;
    }

    // Phase 3: Recalculate time ranges with precise format
    let cumulativeTimeMs = 0;
    for (const scene of expanded) {
        const startMs = cumulativeTimeMs;
        const endMs = cumulativeTimeMs + scene.durationMs;
        scene.startMs = startMs;
        scene.endMs = endMs;
        scene.timeRange = `${formatMsToSrtTime(startMs)} - ${formatMsToSrtTime(endMs)}`;
        cumulativeTimeMs = endMs;
    }

    console.log(`expandDurations: final ${expanded.length} scenes, ${cumulativeTimeMs}ms (${(cumulativeTimeMs/60000).toFixed(1)} min)`);
    return expanded;
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
    }> = [];
    
    let sceneIndex = 1;
    for (const block of sceneBlocks) {
        const lines = block.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length >= 2) {
            let rawIndices: number[] = [];
            let foundIndicesLineIdx = -1;
            
            // The indices line must consist ONLY of numbers separated by commas/spaces.
            // This strict pattern prevents false-positive matches on Japanese scene names
            // that contain embedded numbers (e.g. "150人の知人", "80%の幸福度", "2024年").
            const indicesLinePattern = /^\d+(?:[\s,、，]+\d+)*\s*$/;

            for (let j = lines.length - 1; j >= 1; j--) {
                const line = lines[j];
                if (indicesLinePattern.test(line)) {
                    const nums = (line.match(/\d+/g) || []).map(Number);
                    if (nums.length > 0) {
                        rawIndices = nums;
                        foundIndicesLineIdx = j;
                        break;
                    }
                }
            }
            
            if (rawIndices.length > 0 && foundIndicesLineIdx !== -1) {
                const sceneName = lines.slice(1, foundIndicesLineIdx).join(" - ").trim() || lines[1];
                
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
                        durationMs
                    });
                    sceneIndex++;
                }
            }
        }
    }
    
    // Fill silence gaps between adjacent scenes (capped at 3 seconds / 3000ms)
    for (let i = 0; i < result.length - 1; i++) {
        const curr = result[i];
        const next = result[i + 1];
        
        const gap = next.startMs - curr.endMs;
        const fill = Math.min(gap, 3000); // Cap silence fill at 3000ms
        if (fill > 100) {
            curr.endMs += fill;
            curr.durationMs = curr.endMs - curr.startMs;
            curr.durationSeconds = parseFloat((curr.durationMs / 1000).toFixed(3));
            curr.duration = `${Math.round(curr.durationSeconds)} giây`;
            curr.timeRange = `${formatMsToSrtTime(curr.startMs)} - ${formatMsToSrtTime(curr.endMs)}`;
        }
    }
    
    return result;
}

function mergeShortScenes(
    scenes: Array<{
        sceneNumber: number;
        sceneName: string;
        duration: string;
        durationSeconds: number;
        timeRange: string;
        startMs?: number;
        endMs?: number;
        durationMs?: number;
    }>,
    minDurationMs: number = 3000
) {
    if (scenes.length <= 1) return scenes;

    const merged: typeof scenes = [];

    for (const scene of scenes) {
        const durMs = scene.durationMs || Math.round(scene.durationSeconds * 1000);
        
        if (merged.length === 0) {
            merged.push({
                ...scene,
                durationMs: durMs,
                durationSeconds: parseFloat((durMs / 1000).toFixed(3))
            });
        } else {
            const prev = merged[merged.length - 1];
            const prevDurMs = prev.durationMs || Math.round(prev.durationSeconds * 1000);

            if (prevDurMs < minDurationMs) {
                // Merge current into previous
                prev.sceneName = `${prev.sceneName} + ${scene.sceneName}`;
                const newDurMs = prevDurMs + durMs;
                prev.durationMs = newDurMs;
                prev.durationSeconds = parseFloat((newDurMs / 1000).toFixed(3));
                prev.duration = `${Math.round(prev.durationSeconds)} giây`;
                if (prev.startMs !== undefined && scene.endMs !== undefined) {
                    prev.endMs = scene.endMs;
                    prev.timeRange = `${formatMsToSrtTime(prev.startMs)} - ${formatMsToSrtTime(prev.endMs)}`;
                } else {
                    prev.timeRange = '';
                }
            } else if (durMs < minDurationMs) {
                // Merge current into previous
                prev.sceneName = `${prev.sceneName} + ${scene.sceneName}`;
                const newDurMs = prevDurMs + durMs;
                prev.durationMs = newDurMs;
                prev.durationSeconds = parseFloat((newDurMs / 1000).toFixed(3));
                prev.duration = `${Math.round(prev.durationSeconds)} giây`;
                if (prev.startMs !== undefined && scene.endMs !== undefined) {
                    prev.endMs = scene.endMs;
                    prev.timeRange = `${formatMsToSrtTime(prev.startMs)} - ${formatMsToSrtTime(prev.endMs)}`;
                } else {
                    prev.timeRange = '';
                }
            } else {
                merged.push({
                    ...scene,
                    durationMs: durMs,
                    durationSeconds: parseFloat((durMs / 1000).toFixed(3))
                });
            }
        }
    }

    if (merged.length > 1) {
        const last = merged[merged.length - 1];
        const lastDurMs = last.durationMs || Math.round(last.durationSeconds * 1000);
        if (lastDurMs < minDurationMs) {
            const lastScene = merged.pop()!;
            const prev = merged[merged.length - 1];
            const prevDurMs = prev.durationMs || Math.round(prev.durationSeconds * 1000);
            
            prev.sceneName = `${prev.sceneName} + ${lastScene.sceneName}`;
            const newDurMs = prevDurMs + lastDurMs;
            prev.durationMs = newDurMs;
            prev.durationSeconds = parseFloat((newDurMs / 1000).toFixed(3));
            prev.duration = `${Math.round(prev.durationSeconds)} giây`;
            if (prev.startMs !== undefined && lastScene.endMs !== undefined) {
                prev.endMs = lastScene.endMs;
                prev.timeRange = `${formatMsToSrtTime(prev.startMs)} - ${formatMsToSrtTime(prev.endMs)}`;
            } else {
                prev.timeRange = '';
            }
        }
    }

    merged.forEach((d, idx) => {
        d.sceneNumber = idx + 1;
    });

    return merged;
}
