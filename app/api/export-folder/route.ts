import { NextResponse } from 'next/server';
import { mkdir, writeFile } from 'fs/promises';
import { join, isAbsolute } from 'path';

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const {
            transcript,
            srtContent,
            durations,
            prompts,
            finalPromptText,
            customFolderPath,
            videoUrl
        } = body;

        if (!customFolderPath || typeof customFolderPath !== 'string' || !customFolderPath.trim()) {
            return NextResponse.json({ success: false, error: 'Thư mục lưu trữ không hợp lệ' }, { status: 400 });
        }

        const targetDir = isAbsolute(customFolderPath.trim())
            ? customFolderPath.trim()
            : join(process.cwd(), customFolderPath.trim());

        await mkdir(targetDir, { recursive: true });

        const savedFiles: string[] = [];

        // Save transcript
        if (transcript && typeof transcript === 'string' && transcript.trim()) {
            const transcriptPath = join(targetDir, 'transcript.txt');
            await writeFile(transcriptPath, transcript, 'utf-8');
            savedFiles.push('transcript.txt');
        }

        // Save SRT subtitles
        if (srtContent && typeof srtContent === 'string' && srtContent.trim()) {
            const srtPath = join(targetDir, 'subtitles.srt');
            await writeFile(srtPath, srtContent, 'utf-8');
            savedFiles.push('subtitles.srt');
        }

        // Save Durations
        if (Array.isArray(durations) && durations.length > 0) {
            const durationText = durations
                .map((d: any) => `Scene ${d.sceneNumber}\n\n${d.sceneName}\n\n${d.duration || ''}\n\n${d.timeRange || ''}`)
                .join('\n\n');
            const durationsPath = join(targetDir, 'durations.txt');
            await writeFile(durationsPath, durationText, 'utf-8');
            savedFiles.push('durations.txt');
        }

        // Save Prompts
        if (Array.isArray(prompts) && prompts.length > 0) {
            const lines: string[] = [];
            prompts.forEach((p: any) => {
                if (Array.isArray(p.prompts)) {
                    p.prompts.forEach((sp: any) => {
                        const timeStr = sp.timeRange ? ` (${sp.timeRange})` : '';
                        lines.push(`Scene ${p.sceneNumber}:Image ${sp.imageNumber}${timeStr}: ${sp.prompt}`);
                    });
                }
            });
            if (lines.length > 0) {
                const promptsPath = join(targetDir, 'prompts.txt');
                await writeFile(promptsPath, lines.join('\n\n'), 'utf-8');
                savedFiles.push('prompts.txt');
            }
        }

        // Save Final Prompt Text
        if (finalPromptText && typeof finalPromptText === 'string' && finalPromptText.trim()) {
            const finalPromptPath = join(targetDir, 'final_prompt.txt');
            await writeFile(finalPromptPath, finalPromptText, 'utf-8');
            savedFiles.push('final_prompt.txt');
        }

        // Copy final video file if available
        if (videoUrl && typeof videoUrl === 'string' && videoUrl.trim()) {
            const cleanUrl = videoUrl.replace(/^\//, '');
            const resolvedVideoPath = join(process.cwd(), 'public', cleanUrl);
            const { existsSync } = require('fs');
            if (existsSync(resolvedVideoPath)) {
                const videoFileName = resolvedVideoPath.split(/[\\/]/).pop() || 'final_video.mp4';
                const destVideoPath = join(targetDir, videoFileName);
                await require('fs').promises.copyFile(resolvedVideoPath, destVideoPath);
                savedFiles.push(videoFileName);
            }
        }

        return NextResponse.json({
            success: true,
            targetDir,
            savedFiles
        });
    } catch (error) {
        console.error('Export folder error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Lỗi khi ghi file vào thư mục'
        }, { status: 500 });
    }
}
