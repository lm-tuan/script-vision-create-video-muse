import { NextResponse } from 'next/server';
// Force reload of composeVideo
import { composeVideo, SceneAsset } from '@/services/video';
import type { StoryboardCue } from '@/core/storyboard/Storyboard';

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const workspaceId = formData.get('workspaceId') as string || `workspace_${Date.now()}`;
        
        const audioUrl = formData.get('audioUrl') as string || '';
        const srtUrl = formData.get('srtUrl') as string || '';
        const burnSubtitles = formData.get('burnSubtitles') !== 'false';
        
        const transitionType = formData.get('transitionType') === null ? 'fade' : (formData.get('transitionType') as string);
        const transitionDuration = Math.min(1.5, Math.max(0.2, parseFloat(formData.get('transitionDuration') as string) || 0.5));
        
        const showIntro = formData.get('showIntro') === 'true';
        const introTitle = (formData.get('introTitle') as string) || '';
        const introSubtitle = (formData.get('introSubtitle') as string) || '';
        const showOutro = formData.get('showOutro') === 'true';
        const outroText = (formData.get('outroText') as string) || '';
        
        const kenBurns = formData.get('kenBurns') === null ? 'random' : (formData.get('kenBurns') as string);
        const colorPreset = (formData.get('colorPreset') as string) || 'none';
        const showSceneTitle = formData.get('showSceneTitle') === 'true';
        const vignette = formData.get('vignette') === 'true';
        const filmGrain = formData.get('filmGrain') === 'true';
        const subtitleStyle = (formData.get('subtitleStyle') as string | null) ?? undefined;
        const showProgressBar = formData.get('showProgressBar') === null ? true : formData.get('showProgressBar') === 'true';
        const bgmVolume = Math.min(1.0, Math.max(0.0, parseFloat(formData.get('bgmVolume') as string) || 0.10));
        const audioLeadTime = Math.min(1.5, Math.max(0, parseFloat(formData.get('audioLeadTime') as string) || 0));
        
        const scenesJson = formData.get('scenes') as string || '[]';
        const storyboardCues = JSON.parse((formData.get('storyboardCues') as string) || '[]') as StoryboardCue[];
        const language = (formData.get('language') as string) || 'ja';
        const scenesRaw = JSON.parse(scenesJson) as Array<{
            sceneNumber: number;
            durationSeconds: number;
            sceneName: string;
            startMs?: number;
            endMs?: number;
            durationMs?: number;
            sourceStartMs?: number;
            parentSceneNumber?: number;
        }>;

        if (scenesRaw.length === 0) {
            return NextResponse.json({ success: false, error: 'No scenes provided' }, { status: 400 });
        }
        if (scenesRaw.some(scene => !Number.isSafeInteger(scene.sceneNumber) || scene.sceneNumber < 1) ||
            new Set(scenesRaw.map(scene => scene.sceneNumber)).size !== scenesRaw.length) {
            return NextResponse.json({ success: false, error: 'Mã phân đoạn không hợp lệ.' }, { status: 400 });
        }
        if (scenesRaw.some(({ sourceStartMs }) => sourceStartMs !== undefined &&
            (!Number.isSafeInteger(sourceStartMs) || sourceStartMs < 0))) {
            return NextResponse.json({ success: false, error: 'Điểm bắt đầu trong clip không hợp lệ.' }, { status: 400 });
        }

        // Map files and urls to scenes
        const scenes: SceneAsset[] = scenesRaw.map(scene => ({
            sceneNumber: scene.sceneNumber,
            durationSeconds: scene.durationSeconds,
            sceneName: scene.sceneName,
            startMs: scene.startMs,
            endMs: scene.endMs,
            durationMs: scene.durationMs,
            sourceStartMs: scene.sourceStartMs,
            parentSceneNumber: scene.parentSceneNumber,
            file: formData.get(`file_scene_${scene.sceneNumber}`) as File | null
        }));

        if (scenes.some(scene => !scene.file?.size || !/\.mp4$/i.test(scene.file.name))) {
            return NextResponse.json({ success: false, error: 'Mỗi shot cần một tệp MP4.' }, { status: 400 });
        }

        const result = await composeVideo({
            workspaceId,
            useShotTimeline: formData.get('useShotTimeline') === 'true',
            audioUrl,
            srtUrl,
            burnSubtitles,
            transitionType,
            transitionDuration,
            showIntro,
            introTitle,
            introSubtitle,
            showOutro,
            outroText,
            kenBurns,
            colorPreset,
            showSceneTitle,
            vignette,
            filmGrain,
            subtitleStyle,
            showProgressBar,
            bgmVolume,
            audioLeadTime,
            scenes,
            storyboardCues,
            language,
            audioFile: formData.get('audioFile') as File | null,
            srtFile: formData.get('srtFile') as File | null,
            bgmFile: formData.get('bgmFile') as File | null
        });

        if (result.success) {
            return NextResponse.json(result);
        } else {
            return NextResponse.json({ success: false, error: result.error || 'Failed to compose video' }, { status: 400 });
        }
    } catch (error) {
        console.error('Video compose API error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to compose video'
        }, { status: 500 });
    }
}
