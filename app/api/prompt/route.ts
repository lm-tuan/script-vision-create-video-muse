import { NextResponse } from 'next/server';
import { AIProvider, callWithRetry } from '@/services/ai';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parsePrompts, validatePromptOutput, validateTimeRanges, autoFixTimeRanges } from '@/core/prompt/PromptParser';
import { generateLocalPrompts, type LocalPromptEvent } from '@/services/localPromptGeneration';

// In-memory cache for translated style suffixes across batches
const styleTranslationCache = new Map<string, string>();

export async function POST(request: Request) {
    const body = await request.json().catch(() => ({}));
    if (body?.provider === 'local' && body.stream === true && process.env.LOCAL_PROMPT_PROGRESSIVE === '1') {
        let stopped = request.signal.aborted;
        let cancelled = false;
        const stop = () => { stopped = true; };
        request.signal.addEventListener('abort', stop, { once: true });
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
            async start(controller) {
                const emit = (event: unknown) => {
                    if (!stopped) controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
                };
                try {
                    const response = await generatePromptResponse(body, emit, () => stopped);
                    const result = await response.json();
                    emit(result.success ? { type: 'completed', ...result } : { type: 'error', error: result.error });
                } catch {
                    emit({ type: 'error', error: 'API local: không thể hoàn tất luồng kết quả.' });
                } finally {
                    request.signal.removeEventListener('abort', stop);
                    if (!cancelled) controller.close();
                }
            },
            cancel() { stopped = true; cancelled = true; request.signal.removeEventListener('abort', stop); },
        });
        return new Response(stream, { headers: {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
            'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no',
        } });
    }
    return generatePromptResponse(body);
}

async function generatePromptResponse(
    body: Record<string, unknown>,
    onEvent?: (event: LocalPromptEvent) => void,
    stopped?: () => boolean,
) {
    try {
        body = body && typeof body === 'object' ? body : {};
        const transcript = typeof body.transcript === 'string' ? body.transcript : '';
        const durations: string = typeof body.durations === 'string' ? body.durations : '';
        const aiProvider = 'local' as AIProvider;
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

        if (!durations) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Missing durations',
                },
                { status: 400 }
            );
        }

        // Read prompt template
        const templateName = aiProvider === 'local' && process.env.LOCAL_PROMPT_COMPACT_TEMPLATE === '1'
            ? 'prompt_local.md' : 'prompt.md';
        const templatePath = join(process.cwd(), 'templates', templateName);
        const template = readFileSync(templatePath, 'utf-8');

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
        let customizedTemplate = template
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
        // Normalize to a SINGLE LINE: collapse all newlines into one continuous prompt string.
        const defaultSuffix = 'loose hand-drawn educational doodle illustration, clean white background, thick black wobbly outlines, simple flat muted colors';
        const rawSuffix = promptStyle ? promptStyle.trim() : defaultSuffix;
        // Collapse multi-line style blocks into a single continuous line.
        // FIX: Only remove standalone header lines ("Color:\n") — preserve lines that contain
        //      both header AND content ("Color: warm golden tones").
        const suffix = rawSuffix
            .replace(/^\s*[A-Za-zÀ-ỹ ]+:\s*$/gm, '')       // remove ONLY standalone "Section:" header lines (no content after colon)
            .replace(/^\s*[•\-*]+\s*/gm, '')                // strip bullet characters
            .replace(/^\s*[A-Za-zÀ-ỹ ]+:\s+/gm, '')         // strip header prefixes like "Color: " but keep the content after
            .replace(/\r?\n+/g, ', ')                        // newlines → comma-space
            .replace(/,\s*,+/g, ',')                         // collapse consecutive commas
            .replace(/^[,\s]+|[,\s]+$/g, '')                 // trim edges
            .replace(/\s{2,}/g, ' ')                         // collapse multiple spaces
            .trim();

        // Dynamic prefix and translation instructions for style suffix based on selected prompt language
        let translatedSuffix = suffix;
        if (effectivePromptLang !== 'en' && aiProvider !== 'local') {
            const cacheKey = `${effectivePromptLang}:${suffix}`;
            if (styleTranslationCache.has(cacheKey)) {
                translatedSuffix = styleTranslationCache.get(cacheKey)!;
                console.log(`[Cache Hit] Using cached pre-translated style suffix (${effectivePromptLangName}): ${translatedSuffix}`);
            } else {
                console.log(`Pre-translating style suffix to ${effectivePromptLangName}...`);
                const translationPrompt = `Bạn là một chuyên gia dịch thuật và tối ưu prompt vẽ ảnh. 
Hãy dịch chính xác cụm từ mô tả phong cách vẽ sau đây sang ${effectivePromptLangName}. 
Chỉ trả về bản dịch duy nhất, không thêm giải thích, không thêm dấu ngoặc kép hay bất kỳ ký tự nào khác.

Cụm từ cần dịch:
"${suffix}"`;
                try {
                    const translationResult = await callWithRetry(translationPrompt, aiProvider, 0.1, 2, 'prompt');
                    if (translationResult && translationResult.trim().length > 0) {
                        translatedSuffix = translationResult.trim().replace(/^["']|["']$/g, '');
                        styleTranslationCache.set(cacheKey, translatedSuffix);
                        console.log(`Pre-translated suffix (cached): ${translatedSuffix}`);
                    }
                } catch (err) {
                    console.warn('Failed to pre-translate style suffix, falling back to original suffix:', err);
                }
            }
        }
        customizedTemplate = customizedTemplate.replace('{{PROMPT_STYLE}}', translatedSuffix);

        // Replace placeholders with actual data
        const renderLocalPrompt = (batch: string) => customizedTemplate
            .replace('{transcript}', () => transcript)
            .replace('{durations}', () => batch);
        let prompt = aiProvider === 'local' ? renderLocalPrompt(durations) : customizedTemplate
            .replace('{transcript}', transcript)
            .replace('{durations}', durations);

        // Append a strict final reminder about the language to bypass few-shot bias from English examples
        const languageDirective = `\n\n---
⚠️ **LƯU Ý BẮT BUỘC CUỐI CÙNG (FINAL LANGUAGE DIRECTIVE):**
- Người dùng yêu cầu tạo toàn bộ nội dung prompt vẽ ảnh bằng: **${effectivePromptLangName}**.
- Mặc dù phần ví dụ ở trên hiển thị bằng tiếng Anh, bạn **BẮT BUỘC** phải dịch/viết toàn bộ nội dung mô tả của từng cảnh sang **${effectivePromptLangName}** ở định dạng đầu ra.
- TUYỆT ĐỐI không sử dụng Tiếng Anh (English) cho phần mô tả hình ảnh nếu ngôn ngữ được chọn không phải là tiếng Anh.
- Hãy bắt đầu tạo ngay bây giờ theo đúng ngôn ngữ được yêu cầu.`;
        prompt += languageDirective;

        // Generate prompts for the selected scenes.
        console.log('Calling AI for prompt generation...');
        let promptsText: string;
        let localMetrics;
        if (aiProvider === 'local') {
            const generated = await generateLocalPrompts({
                durations,
                buildPrompt: batch => renderLocalPrompt(batch) + languageDirective,
                callAI: batchPrompt => callWithRetry(batchPrompt, aiProvider, 0.2, 2, 'prompt'),
                progressive: Boolean(onEvent),
                resumeKey: typeof body.resumeKey === 'string' ? body.resumeKey : undefined,
                onEvent: event => onEvent?.(event.type === 'batch' ? {
                    ...event, prompts: appendLocalStyle(event.prompts, effectivePromptLang, translatedSuffix),
                } : event),
                stopped,
            });
            promptsText = generated.raw;
            localMetrics = { batchSize: generated.batchSize, batches: generated.batches, elapsedMs: generated.elapsedMs, template: templateName };
        } else {
            promptsText = await callWithRetry(prompt, aiProvider, 0.2, 2, 'prompt');
        }

        // Parse prompts using shared parser
        const prompts = parsePrompts(promptsText);

        // ── Time-Range Validation & Auto-Fix ──────────────────────────────────
        // Build a lookup: sceneNumber -> timeRange string (from the durations input)
        const sceneTimeRangeMap = new Map<number, string>();
        const durationLines = durations.split(/\n/);
        let lastSceneNum = -1;
        let waitingForTimeRange = false;
        for (const rawLine of durationLines) {
            const sceneLine = rawLine.match(/Scene\s+(\d+)/i);
            if (sceneLine) {
                lastSceneNum = parseInt(sceneLine[1]);
                waitingForTimeRange = true;
                continue;
            }
            // The timeRange line contains " - " with colon-separated timestamps
            if (waitingForTimeRange && lastSceneNum >= 0 && rawLine.includes(':') && rawLine.includes('-')) {
                sceneTimeRangeMap.set(lastSceneNum, rawLine.trim());
                waitingForTimeRange = false;
            }
        }

        const timeIssuesBefore = aiProvider === 'local' ? [] : validateTimeRanges(prompts);
        if (timeIssuesBefore.length > 0) {
            console.warn(`[Prompt Validation] ${timeIssuesBefore.length} time-range issue(s) detected — attempting auto-fix...`);
            timeIssuesBefore.forEach(issue => console.warn(`  [${issue.type.toUpperCase()}] ${issue.detail}`));

            const fixedScenes = new Set<number>();
            for (const issue of timeIssuesBefore) {
                if (fixedScenes.has(issue.sceneNumber)) continue; // already fixed this scene
                const entry = prompts.find(p => p.sceneNumber === issue.sceneNumber);
                const parentRange = sceneTimeRangeMap.get(issue.sceneNumber);
                if (entry && parentRange) {
                    const fixed = autoFixTimeRanges(entry, parentRange);
                    if (fixed) {
                        fixedScenes.add(issue.sceneNumber);
                        console.log(`  [AUTO-FIX] Scene ${issue.sceneNumber}: rebalanced ${entry.prompts.length} image(s) from parent range "${parentRange}"`);
                    }
                }
            }

            const timeIssuesAfter = validateTimeRanges(prompts);
            const resolved = timeIssuesBefore.length - timeIssuesAfter.length;
            console.log(`[Prompt Validation] Auto-fix result: ${resolved}/${timeIssuesBefore.length} issues resolved. Remaining: ${timeIssuesAfter.length}`);
            if (timeIssuesAfter.length > 0) {
                timeIssuesAfter.forEach(issue => console.warn(`  [UNRESOLVED] ${issue.detail}`));
            }
        } else {
            console.log('[Prompt Validation] All time-ranges are valid. No fix needed.');
        }

        // Validate output: detect missing or empty prompts
        const expectedScenes = parseDurationSceneNumbers(durations);
        if (expectedScenes.length > 0) {
            const validation = validatePromptOutput(prompts, expectedScenes);
            if (validation.missingScenes.length > 0) {
                console.warn(`[Prompt Validation] Missing scenes: ${validation.missingScenes.join(', ')}`);
            }
            if (validation.emptyPromptScenes.length > 0) {
                console.warn(`[Prompt Validation] Empty prompt scenes: ${validation.emptyPromptScenes.join(', ')}`);
            }
            if (validation.shortPromptScenes.length > 0) {
                console.warn(`[Prompt Validation] Short prompt (<10 words) scenes: ${validation.shortPromptScenes.join(', ')}`);
            }
        }

        // Ensure the prompt style suffix is present.
        // ONLY auto-append for English prompts — for other languages, the template
        // already instructs the AI to translate and embed the style (prompt.md line 38).
        // Appending English suffix onto non-English prompts creates broken mixed-language output.
        const shouldAutoAppendSuffix = effectivePromptLang === 'en';

        const promptsWithSuffix = aiProvider === 'local'
            ? appendLocalStyle(prompts, effectivePromptLang, translatedSuffix)
            : prompts.map(p => ({
            ...p,
            prompts: p.prompts.map(sp => {
                const cleanedPrompt = sp.prompt.trim();

                // Dynamic keyword matching check using the target language's suffix
                const activeSuffix = translatedSuffix;
                const styleKeywords = activeSuffix.toLowerCase().split(/[、,，]/).map((k: string) => k.trim()).filter((k: string) => k.length > 2);
                const matchCount = styleKeywords.filter((keyword: string) => cleanedPrompt.toLowerCase().includes(keyword)).length;
                const alreadyHasStyle = styleKeywords.length > 0 && (matchCount / styleKeywords.length) >= 0.35;

                return {
                    ...sp,
                    prompt: alreadyHasStyle ? cleanedPrompt : `${cleanedPrompt} ${activeSuffix}`
                };
            })
        }));

        return NextResponse.json({
            success: true,
            prompts: promptsWithSuffix,
            raw: promptsText,
            provider: aiProvider,
            ...(localMetrics ? { localMetrics } : {}),
            timeValidation: {
                issueCount: validateTimeRanges(promptsWithSuffix)
                    .filter(issue => aiProvider !== 'local' || issue.type !== 'too_short').length,
            },
        });
    } catch (error) {
        console.error('Prompt generation error:', error);
        const message = error instanceof Error ? error.message : 'Failed to generate prompts';

        return NextResponse.json(
            {
                success: false,
                error: message,
            },
            { status: 500 }
        );
    }
}

function appendLocalStyle(prompts: import('@/types').PromptEntry[], language: string, suffix: string) {
    return prompts.map(scene => ({ ...scene, prompts: scene.prompts.map(image => {
        const prompt = image.prompt.trim();
        const keywords = suffix.toLowerCase().split(/[、,，]/).map(word => word.trim()).filter(word => word.length > 2);
        const present = keywords.length > 0 && keywords.filter(word => prompt.toLowerCase().includes(word)).length / keywords.length >= 0.35;
        // Local non-English output already translates/embeds the style in its single AI run.
        return { ...image, prompt: language !== 'en' || present ? prompt : `${prompt} ${suffix}` };
    }) }));
}

/**
 * Extract expected scene numbers from the durations text input.
 * Used for output validation.
 */
function parseDurationSceneNumbers(durationsText: string): number[] {
    const sceneNumbers: number[] = [];
    const matches = durationsText.matchAll(/^[ \t]*Scene[ \t]+(\d+)\b/gim);
    for (const match of matches) {
        const num = parseInt(match[1]);
        if (!sceneNumbers.includes(num)) {
            sceneNumbers.push(num);
        }
    }
    return sceneNumbers;
}
