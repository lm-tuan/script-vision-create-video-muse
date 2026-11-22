import { NextResponse } from 'next/server';
import { mkdir, writeFile, readFile, unlink, rm } from 'fs/promises';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const { transcript, durations, srtContent, prompts, videoUrl, audioUrl } = body;

        // Create a unique temporary directory inside outputs
        const tempDirName = `export_${Date.now()}`;
        const tempDir = join(process.cwd(), 'public', 'outputs', tempDirName);
        await mkdir(tempDir, { recursive: true });

        // Write transcript
        if (transcript && typeof transcript === 'string' && transcript.trim()) {
            await writeFile(join(tempDir, 'transcript.txt'), transcript, 'utf8');
        }

        // Write durations
        if (Array.isArray(durations) && durations.length > 0) {
            const durationText = durations
                .map((d: any) => `Scene ${d.sceneNumber}\n\n${d.sceneName}\n\n${d.duration || ''} giây\n\n${d.timeRange || ''}`)
                .join('\n\n');
            await writeFile(join(tempDir, 'durations.txt'), durationText, 'utf8');
        }

        // Write subtitles SRT
        if (srtContent && typeof srtContent === 'string' && srtContent.trim()) {
            await writeFile(join(tempDir, 'subtitles.srt'), srtContent, 'utf8');
        }

        // Write prompts
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
                await writeFile(join(tempDir, 'prompts.txt'), lines.join('\n\n'), 'utf8');
            }
        }

        // Copy audio from outputs if available (server-generated URL like /outputs/audio_xxx.mp3)
        if (audioUrl && typeof audioUrl === 'string') {
            const cleanAudioUrl = audioUrl.replace(/^\//, '');
            const resolvedAudioPath = join(process.cwd(), 'public', cleanAudioUrl);
            if (existsSync(resolvedAudioPath)) {
                // Preserve original extension (.mp3, .wav, etc.)
                const ext = resolvedAudioPath.match(/\.[a-z0-9]+$/i)?.[0] || '.mp3';
                await require('fs').promises.copyFile(resolvedAudioPath, join(tempDir, `audio${ext}`));
            }
        }

        // Copy final video from outputs if available
        if (videoUrl) {
            const cleanUrl = videoUrl.replace(/^\//, '');
            const resolvedVideoPath = join(process.cwd(), 'public', cleanUrl);
            const destVideoPath = join(tempDir, 'final_video.mp4');
            if (existsSync(resolvedVideoPath)) {
                await require('fs').promises.copyFile(resolvedVideoPath, destVideoPath);
            }
        }

        const zipFilePath = join(process.cwd(), 'public', 'outputs', `${tempDirName}.zip`);

        // Compress the directory using PowerShell Compress-Archive (native to Windows)
        // Check if Windows platform, otherwise fallback to zip/tar on unix or warning
        if (process.platform === 'win32') {
            const cmd = `powershell -Command "Compress-Archive -Path '${tempDir}\\*' -DestinationPath '${zipFilePath}' -Force"`;
            await execAsync(cmd);
        } else {
            // Linux/macOS fallback
            const cmd = `zip -r "${zipFilePath}" "${tempDir}"/*`;
            await execAsync(cmd);
        }

        // Read the zip file into buffer
        if (!existsSync(zipFilePath)) {
            throw new Error("Failed to create ZIP archive.");
        }
        const zipBuffer = await readFile(zipFilePath);

        // Clean up tempDir and zipFilePath
        try {
            await rm(tempDir, { recursive: true, force: true });
            await unlink(zipFilePath);
        } catch (cleanupError) {
            console.error("Cleanup failed:", cleanupError);
        }

        // Return the ZIP download stream
        return new Response(zipBuffer, {
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="project_export_${Date.now()}.zip"`,
            }
        });
    } catch (error) {
        console.error("Export all ZIP error:", error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}
