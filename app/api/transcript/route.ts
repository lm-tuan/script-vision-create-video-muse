import { NextResponse } from 'next/server';
import { AIProvider, callWithRetry } from '@/services/ai';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const content = typeof body.content === 'string' ? body.content : '';
        const aiProvider = 'local' as AIProvider;
        const language = typeof body.language === 'string' ? body.language : 'vi';
        const rewriteWithAi = !!body.rewriteWithAi;
        const longForm = !!body.longForm;
        const keepOrExpandDuration = !!body.keepOrExpandDuration;

        const languageNames: Record<string, string> = {
            vi: 'Tiếng Việt (Vietnamese)',
            en: 'Tiếng Anh (English)',
            ja: 'Tiếng Nhật (Japanese)',
            fr: 'Tiếng Pháp (French)',
            zh: 'Tiếng Trung (Chinese)',
            ko: 'Tiếng Hàn (Korean)'
        };
        const targetLangName = languageNames[language] || 'Tiếng Việt (Vietnamese)';

        let prompt = '';
        if (rewriteWithAi) {
            // Use language-specific rewrite template; fallback to vi.md for unsupported languages
            const REWRITE_LANGS = new Set(['vi', 'en', 'ja', 'zh', 'ko', 'fr']);
            const rewriteLang = REWRITE_LANGS.has(language) ? language : 'vi';
            const templatePath = join(process.cwd(), 'templates', 'transcript', 'rewrite', `${rewriteLang}.md`);
            const template = readFileSync(templatePath, 'utf-8');
            prompt = template.replace('{content}', content);

            if (longForm) {
                // Combined mode: Rewrite style + expand to 15-18 minutes
                const wpmByLanguage: Record<string, number> = {
                    vi: 140, en: 150, ja: 330, zh: 260, fr: 145, ko: 130
                };
                const wpm = wpmByLanguage[language] || 140;
                const minWords = 15 * wpm;  // Tối thiểu 15 phút
                const maxWords = 18 * wpm;  // Tối đa 18 phút
                const targetMinutes = 16;
                const unitName = (language === 'ja' || language === 'zh') ? 'ký tự' : 'từ';

                const lengthRequirement = `## Yêu cầu độ dài (BẮT BUỘC):
- Kịch bản đầu ra phải đủ để đọc trong **${targetMinutes} phút** (~${minWords}–${maxWords} ${unitName}).
- Nếu nội dung gốc quá ngắn, BẮT BUỘC mở rộng bằng cách: thêm giải thích chi tiết, ví dụ minh họa, so sánh, phân tích sâu, câu chuyện liên quan.
- Nội dung mở rộng PHẢI nhất quán với chủ đề gốc, không bịa đặt thông tin sai lệch.
- Cấu trúc bắt buộc: Hook mở bài hấp dẫn (30-60 giây) → Thân bài chi tiết 3-5 phần (có câu nối mượt mà) → Kết bài ấn tượng + CTA.
- Câu ngắn và câu dài xen kẽ để tạo nhịp điệu đa dạng, tự nhiên khi TTS đọc.`;

                prompt = prompt.replace('{lengthRequirement}', lengthRequirement);
            } else if (keepOrExpandDuration) {
                const wpmByLanguage: Record<string, number> = {
                    vi: 140, en: 150, ja: 330, zh: 260, fr: 145, ko: 130
                };
                const wpm = wpmByLanguage[language] || 140;
                const isCharBased = language === 'ja' || language === 'zh';
                const originalWordCount = isCharBased
                    ? content.replace(/\s+/g, '').length
                    : content.split(/\s+/).filter(Boolean).length;
                const estimatedMinutes = parseFloat((originalWordCount / wpm).toFixed(1));
                const unitName = isCharBased ? 'ký tự' : 'từ';

                const lengthRequirement = `## Yêu cầu giữ nguyên/mở rộng độ dài (BẮT BUỘC):
- Kịch bản gốc có khoảng **${originalWordCount} ${unitName}** (~${estimatedMinutes} phút đọc).
- Kịch bản viết lại mới BẮT BUỘC phải có độ dài bằng hoặc dài hơn kịch bản gốc (tối thiểu **${originalWordCount} ${unitName}** hoặc hơn).
- Hãy mở rộng các ý bằng cách cung cấp thêm giải thích chi tiết, ví dụ trực quan, so sánh hoặc câu chuyện minh họa để đảm bảo thời lượng đọc không bị ngắn đi so với bản gốc.`;

                prompt = prompt.replace('{lengthRequirement}', lengthRequirement);
            } else {
                // Rewrite only — no length target, remove placeholder
                prompt = prompt.replace('{lengthRequirement}', '');
            }
        } else {
            // Language-specific TTS templates: each language has its own optimized rules
            const LANG_SPECIFIC_TEMPLATES = new Set(['vi', 'en', 'ja', 'zh', 'ko', 'fr']);
            let templateFile: string;
            if (LANG_SPECIFIC_TEMPLATES.has(language)) {
                // Long-form for char-based languages (ja/zh) uses the language template (no word count expansion)
                const isCharBased = language === 'ja' || language === 'zh';
                if (longForm && !isCharBased) {
                    templateFile = 'long.md';
                } else {
                    templateFile = `${language}.md`;
                }
            } else {
                // Fallback for unsupported languages
                templateFile = longForm ? 'long.md' : 'default.md';
            }

            const templatePath = join(process.cwd(), 'templates', 'transcript', templateFile);
            const template = readFileSync(templatePath, 'utf-8');
            prompt = template.replace('{content}', content);

            // Inject word count targets for long-form mode (non char-based languages only)
            if (longForm && language !== 'ja' && language !== 'zh') {
                const wpmByLanguage: Record<string, number> = {
                    vi: 140, en: 150, ja: 330, zh: 260, fr: 145, ko: 130
                };
                const wpm = wpmByLanguage[language] || 140;
                const minWords = 15 * wpm;  // Min 15 minutes
                const maxWords = 18 * wpm;  // Max 18 minutes
                const targetMinutes = 16;

                prompt = prompt
                    .replace(/{minWordCount}/g, minWords.toString())
                    .replace(/{maxWordCount}/g, maxWords.toString())
                    .replace(/{targetMinutes}/g, targetMinutes.toString());
            }
        }

        // Append language enforcement: language-specific templates already write in the target language,
        // but this reminder ensures the AI doesn't drift when the input is in a different language.
        prompt += `\n\n---\n\n**LANGUAGE REQUIREMENT:** The output transcript MUST be written entirely in ${targetLangName}. If the input is in a different language, translate and rewrite everything into ${targetLangName} naturally and fluently.`;

        // Call AI API with step='transcript' for smart max_tokens
        const transcript = await callWithRetry(prompt, aiProvider, 0.2, 2, 'transcript');

        return NextResponse.json({
            success: true,
            transcript,
            provider: aiProvider,
            language,
        });
    } catch (error) {
        console.error('Transcript generation error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to generate transcript',
            },
            { status: 500 }
        );
    }
}
