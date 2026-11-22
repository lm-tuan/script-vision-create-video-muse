import { NextResponse } from 'next/server';
import { AIProvider, callWithRetry } from '@/services/ai';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const transcript = typeof body.transcript === 'string' ? body.transcript : '';
        const content = typeof body.content === 'string' ? body.content : '';
        const customSourceText = typeof body.sourceText === 'string' ? body.sourceText : '';
        const aiProvider = 'local' as AIProvider;
        const language = typeof body.language === 'string' ? body.language : 'vi';

        // Choose customSourceText if provided, otherwise transcript if available, otherwise fallback to raw content
        const sourceText = customSourceText.trim() || transcript.trim() || content.trim();

        if (!sourceText) {
            return NextResponse.json({ success: false, error: 'Không tìm thấy nội dung kịch bản hoặc văn bản gốc' }, { status: 400 });
        }

        const languageNames: Record<string, string> = {
            vi: 'Tiếng Việt (Vietnamese)',
            en: 'Tiếng Anh (English)',
            ja: 'Tiếng Nhật (Japanese)',
            fr: 'Tiếng Pháp (French)',
            zh: 'Tiếng Trung (Chinese)',
            ko: 'Tiếng Hàn (Korean)'
        };
        const targetLangName = languageNames[language] || 'Tiếng Việt (Vietnamese)';

        // Load the template
        const templatePath = join(process.cwd(), 'templates', 'youtube-seo.md');
        const template = readFileSync(templatePath, 'utf-8');
        
        let prompt = template.replace('{content}', sourceText);
        prompt += `\n\n--- \n\n## YÊU CẦU NGÔN NGỮ QUAN TRỌNG:\n- Các phần tiêu đề (<titles>), mô tả (<description>) và danh sách thẻ tag (<tags>) đầu ra BẮT BUỘC phải viết bằng: ${targetLangName}.\n- Phần mô tả prompt vẽ ảnh (<thumbnail_prompt>) BẮT BUỘC viết bằng Tiếng Anh (English).`;

        console.log(`[YouTube SEO API] Calling AI with provider=${aiProvider}, lang=${language}`);
        
        // Call AI API (use 0.7 temperature for more creative/CTR titles)
        const aiResponse = await callWithRetry(prompt, aiProvider, 0.7, 2, 'transcript');

        // Helper to extract XML tags
        const extractTag = (text: string, tag: string): string => {
            const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\/${tag}>`, 'i');
            const match = text.match(regex);
            return match ? match[1].trim() : '';
        };

        // Parse outputs
        const titlesRaw = extractTag(aiResponse, 'titles');
        const titles = titlesRaw
            .split('\n')
            .map(line => line.replace(/^\d+[\.\s-–]+/, '').trim())
            .filter(line => line.length > 0);

        const description = extractTag(aiResponse, 'description');

        const tagsRaw = extractTag(aiResponse, 'tags');
        const cleanTags = tagsRaw.replace(/[\[\]]/g, '');
        const tags = cleanTags
            .split(',')
            .map(t => t.trim())
            .filter(t => t.length > 0);

        const thumbnailPrompt = extractTag(aiResponse, 'thumbnail_prompt');

        // Fallback checks
        if (titles.length === 0 && !description && !thumbnailPrompt) {
            console.warn('[YouTube SEO API] Failed to parse tags, using fallback parsing');
            // If XML extraction fails completely, parse as markdown fallback
            return NextResponse.json({
                success: true,
                titles: ['Gợi ý tiêu đề video 1', 'Gợi ý tiêu đề video 2', 'Gợi ý tiêu đề video 3'],
                description: aiResponse,
                tags: ['youtube', 'seo', 'scriptvision'],
                thumbnailPrompt: 'A beautiful high resolution YouTube thumbnail design'
            });
        }

        return NextResponse.json({
            success: true,
            titles: titles.slice(0, 5),
            description,
            tags,
            thumbnailPrompt,
            provider: aiProvider,
            language
        });

    } catch (error) {
        console.error('YouTube SEO generation API error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to generate YouTube SEO metadata',
            },
            { status: 500 }
        );
    }
}
