import { copyFile, mkdir, writeFile } from 'fs/promises';
import { join, basename, isAbsolute } from 'path';
import { exec as cbExec, execFile as cbExecFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { TimelineValidator } from '@/core/timeline/TimelineValidator';
// Force reload of TimelineBuilder TS file
import { TimelineBuilder } from '@/core/timeline/TimelineBuilder';
import { planTransitions } from '@/core/timeline/TransitionPlan';
import { composeTransitionsInBatches } from '@/core/timeline/TransitionComposer';
import { parseSrt } from '@/core/srt/SrtParser';
import { buildAssSubtitles } from '@/core/srt/AssWriter';
import { fitGraphicText, graphicCardWidth, graphicFontSize, graphicTextLimit, resolveGraphicTemplate, type StoryboardCue } from '@/core/storyboard/Storyboard';
import { motionFilter, resolveMotion, type MotionOverride, type ResolvedMotion } from '@/core/motion/MotionDirector';
import { planSpeedPaintStyles, type SpeedPaintSelection } from '@/core/speedpaint/SpeedPaintPlan';

const exec = promisify(cbExec);
const execFile = promisify(cbExecFile);

export interface SceneAsset {
    sceneNumber: number;
    durationSeconds: number;
    sceneName: string;
    file?: File | null;
    url?: string | null;
    startMs?: number;
    endMs?: number;
    durationMs?: number;
    sourceStartMs?: number;
    parentSceneNumber?: number;
    motionLayer?: File | null;
}

export interface VideoComposeOptions {
    workspaceId?: string;
    useShotTimeline?: boolean;
    audioUrl?: string;
    srtUrl?: string;
    burnSubtitles?: boolean;
    transitionType?: string;
    transitionDuration?: number;
    showIntro?: boolean;
    introTitle?: string;
    introSubtitle?: string;
    showOutro?: boolean;
    outroText?: string;
    kenBurns?: string;
    colorPreset?: string;
    showSceneTitle?: boolean;
    vignette?: boolean;
    filmGrain?: boolean;
    subtitleStyle?: string;
    showProgressBar?: boolean;
    bgmVolume?: number;
    audioLeadTime?: number;
    scenes: SceneAsset[];
    storyboardCues?: StoryboardCue[];
    motionDirectorEnabled?: boolean;
    motionPlans?: MotionOverride[];
    speedPaintStyles?: Record<number, SpeedPaintSelection>;
    smartDirectorEnabled?: boolean;
    speedPaintMinSeconds?: number;
    speedPaintGapScenes?: number;
    language?: string;
    audioFile?: File | null;
    srtFile?: File | null;
    bgmFile?: File | null;
}

export interface VideoComposeResult {
    success: boolean;
    videoUrl?: string;
    workspaceId?: string;
    error?: string;
}

// Escaped fonts for FFmpeg drawtext compatibility across OSes - using relative paths to prevent OS-specific path and drive letter colon parsing issues in FFmpeg filters
const fontNormalPath = '../../fonts/Arial.ttf';
const fontBoldPath = '../../fonts/Arial-Bold.ttf';
const hasHangul = (text: string): boolean => /[\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uAC00-\uD7A3\uD7B0-\uD7FF]/u.test(text);

function koreanFontPath(bold: boolean): string | null {
    const candidates = bold
        ? ['C:/Windows/Fonts/malgunbd.ttf', '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', '/usr/share/fonts/truetype/noto/NotoSansKR-Bold.ttf']
        : ['C:/Windows/Fonts/malgun.ttf', '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', '/usr/share/fonts/truetype/noto/NotoSansKR-Regular.ttf'];
    const found = candidates.find(path => existsSync(path));
    // FFmpeg filter graphs require escaping the drive-letter colon.
    return found ? found.replace(':', '\\:') : null;
}

const DEFAULT_SUBTITLE_BOX = 'FontSize=13.3,Bold=1,Alignment=2,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H60000000,BorderStyle=4,Outline=1.15,Shadow=2.8,MarginV=24';

const SUBTITLE_STYLES: Record<string, string> = {
    default: `FontName=Arial,${DEFAULT_SUBTITLE_BOX}`,
    modern: `FontName=Arial,FontSize=13,Bold=1,Alignment=2,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1.5,Shadow=0,MarginV=10`,
    korean_modern: `FontName=Malgun Gothic,${DEFAULT_SUBTITLE_BOX}`,
    box: `FontName=Arial,FontSize=12.8,Bold=1,Alignment=2,PrimaryColour=&H00FFFFFF,BackColour=&H80000000,BorderStyle=4,Outline=0.6,Shadow=2,MarginV=10`,
    cinematic: `FontName=Arial,FontSize=14,Bold=1,Alignment=2,PrimaryColour=&H00FFFFFF,OutlineColour=&H00203040,BorderStyle=1,Outline=1.5,Shadow=1,ShadowColour=&H40000000,MarginV=12`,
    centered_big: `FontName=Arial,FontSize=36,Bold=1,PrimaryColour=&H0000FFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Alignment=5,MarginV=0`,
    // Phụ đề tiếng Nhật đẹp (Sử dụng hệ chữ Yu Gothic / Meiryo / MS Gothic tương thích tốt Windows & FFmpeg libass)
    japanese_modern: `FontName=Yu Gothic,FontSize=13,Bold=1,Alignment=2,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1.5,Shadow=0,MarginV=10`,
    japanese_anime: `FontName=Meiryo,FontSize=14,Bold=1,Alignment=2,PrimaryColour=&H0000D7FF,OutlineColour=&H00000000,BorderStyle=1,Outline=1.5,Shadow=1,MarginV=10`,
    japanese_box: `FontName=Yu Gothic,${DEFAULT_SUBTITLE_BOX}`,
    japanese_cinematic: `FontName=MS Gothic,FontSize=14,Bold=1,Alignment=2,PrimaryColour=&H00A7EAFF,OutlineColour=&H00302010,BorderStyle=1,Outline=1.5,Shadow=1,MarginV=12`,
    japanese_center_big: `FontName=Meiryo,FontSize=32,Bold=1,PrimaryColour=&H0000FFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Alignment=5,MarginV=0`
};

async function runCommand(cmd: string, cwd: string) {
    console.log(`Executing command in ${cwd}: ${cmd}`);
    try {
        const { stdout, stderr } = await exec(cmd, { cwd });
        return { stdout, stderr };
    } catch (error) {
        console.error(`Command failed: ${cmd}`, error);
        throw error;
    }
}

async function getActualAudioDuration(audioPath: string): Promise<number> {
    try {
        const { stdout } = await exec(
            `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
        );
        const dur = parseFloat(stdout.trim());
        return isNaN(dur) ? 0 : dur;
    } catch {
        return 0;
    }
}

async function getMediaDimensions(mediaPath: string, cwd: string): Promise<{ width: number; height: number } | null> {
    try {
        const { stdout } = await execFile('ffprobe', [
            '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
            '-of', 'csv=p=0', mediaPath
        ], { cwd });
        const [width, height] = stdout.trim().split(',').map(Number);
        return width > 0 && height > 0 ? { width, height } : null;
    } catch {
        return null;
    }
}

function getColorGradeFilter(preset: string): string {
    const presets: Record<string, string> = {
        cinematic_warm: 'eq=brightness=0.03:saturation=1.2,colorbalance=rs=0.1:gs=0.05:bs=-0.1',
        cinematic_cool: 'eq=saturation=0.9,colorbalance=rs=-0.1:gs=0:bs=0.15',
        high_contrast: 'eq=contrast=1.3:brightness=0.02:saturation=1.1',
        muted: 'eq=saturation=0.7:brightness=0.05',
        dark_moody: 'eq=brightness=-0.05:contrast=1.2:saturation=0.8',
        vibrant: 'eq=saturation=1.4:contrast=1.1:brightness=0.02',
    };
    return presets[preset] || '';
}

async function applyTransitions(
    workspaceDir: string,
    scenes: SceneAsset[],
    renderDurations: Record<number, number>,
    transitionType: string,
    transitionDuration: number,
    segmentNames: Record<number, string>,
    onProgress?: (completed: number, total: number) => Promise<void>
): Promise<string> {
    return composeTransitionsInBatches(
        workspaceDir,
        scenes.map(scene => ({ fileName: segmentNames[scene.sceneNumber],
            frames: Math.round(renderDurations[scene.sceneNumber] * 25) })),
        transitionType,
        Math.round(transitionDuration * 25),
        16,
        onProgress
    );
}

export async function composeVideo(options: VideoComposeOptions): Promise<VideoComposeResult> {
    const {
        workspaceId = `workspace_${Date.now()}`,
        useShotTimeline = false,
        audioUrl = '',
        srtUrl = '',
        burnSubtitles = true,
        transitionType = 'fade',
        transitionDuration = 0.5,
        showIntro = false,
        introTitle = '',
        introSubtitle = '',
        showOutro = false,
        outroText = '',
        kenBurns = 'random',
        colorPreset = 'none',
        showSceneTitle = false,
        vignette = false,
        filmGrain = false,
        subtitleStyle = 'default',
        showProgressBar = true,
        bgmVolume = 0.10,
        audioLeadTime = 0.4,
        scenes,
        storyboardCues = [],
        motionDirectorEnabled = false,
        motionPlans = [],
        speedPaintStyles = {},
        smartDirectorEnabled = false,
        speedPaintMinSeconds = 8,
        speedPaintGapScenes = 3,
        language = 'ja',
        audioFile = null,
        srtFile = null,
        bgmFile = null
    } = options;

    const workspaceDir = join(process.cwd(), 'public', 'outputs', workspaceId);

    const updateStatus = async (progress: number, statusText: string) => {
        const statusPath = join(workspaceDir, 'status.json');
        try {
            await writeFile(statusPath, JSON.stringify({ progress, status: statusText }), 'utf8');
        } catch (e) {
            console.error("Failed to write status:", e);
        }
    };

    // Create workspace directory
    await mkdir(workspaceDir, { recursive: true });
    await updateStatus(2, "Khởi tạo thư mục làm việc...");

    if (!scenes || scenes.length === 0) {
        return { success: false, error: 'No scenes provided' };
    }

    // Save debug info locally in workspace folder to avoid concurrency overwrites
    try {
        const scenesJson = JSON.stringify(scenes.map(s => ({
            sceneNumber: s.sceneNumber,
            durationSeconds: s.durationSeconds,
            sceneName: s.sceneName
        })), null, 2);
        await writeFile(join(workspaceDir, 'scenes_debug.json'), scenesJson, 'utf8');
    } catch (e) {
        console.error("Failed to write scenes_debug.json", e);
    }

    console.log(`Video Composer Service: Processing ${scenes.length} scenes in workspace ${workspaceId}`);

    // Resolve Audio File Path
    let audioFilePath = '';
    if (audioFile && audioFile.size > 0) {
        const audioFileName = `uploaded_audio.${audioFile.name.split('.').pop() || 'mp3'}`;
        const destPath = join(workspaceDir, audioFileName);
        const buffer = Buffer.from(await audioFile.arrayBuffer());
        await writeFile(destPath, buffer);
        audioFilePath = destPath;
    } else if (audioUrl) {
        const audioFileName = basename(audioUrl);
        const potentialPath = join(process.cwd(), 'public', 'outputs', audioFileName);
        if (existsSync(potentialPath)) {
            audioFilePath = potentialPath;
        }
    }

    // Resolve SRT File Path
    let srtFilePath = '';
    let relativeSrtName = '';
    if (srtFile && srtFile.size > 0) {
        const srtFileName = 'uploaded_subtitles.srt';
        const destPath = join(workspaceDir, srtFileName);
        const srtContent = Buffer.from(await srtFile.arrayBuffer()).toString('utf8');
        await writeFile(destPath, srtContent, 'utf8');
        srtFilePath = destPath;
        relativeSrtName = srtFileName;
    } else if (srtUrl) {
        const srtFileName = basename(srtUrl);
        const potentialPath = join(process.cwd(), 'public', 'outputs', srtFileName);
        if (existsSync(potentialPath)) {
            srtFilePath = potentialPath;
            const srtDestPath = join(workspaceDir, srtFileName);
            const srtContent = await require('fs').promises.readFile(srtFilePath, 'utf8');
            await writeFile(srtDestPath, srtContent, 'utf8');
            relativeSrtName = srtFileName;
        }
    }

    // Check if FFmpeg is installed
    try {
        await exec('ffmpeg -version');
    } catch (e) {
        return {
            success: false,
            error: 'FFmpeg is not installed or not in system PATH. Please install FFmpeg to use Video Composer.'
        };
    }

    // Copy audio to workspace for probe
    let audioLocalName = '';
    let audioLocalPath = '';
    if (audioFilePath) {
        audioLocalName = `audio.${audioFilePath.split('.').pop()}`;
        audioLocalPath = join(workspaceDir, audioLocalName);
        const audioBuffer = await require('fs').promises.readFile(audioFilePath);
        await writeFile(audioLocalPath, audioBuffer);
    }

    // Copy BGM to workspace if provided
    let bgmLocalName = '';
    let bgmLocalPath = '';
    if (bgmFile && bgmFile.size > 0) {
        bgmLocalName = `bgm.${bgmFile.name.split('.').pop() || 'mp3'}`;
        bgmLocalPath = join(workspaceDir, bgmLocalName);
        const bgmBuffer = Buffer.from(await bgmFile.arrayBuffer());
        await writeFile(bgmLocalPath, bgmBuffer);
        console.log(`Video Composer Service: Uploaded BGM to ${bgmLocalPath}`);
    }

    // Measure audio duration in milliseconds
    let actualAudioDurationMs = 0;
    let actualAudioDuration = 0;
    if (audioLocalPath) {
        await updateStatus(4, "Đang đo thời lượng audio thực tế (ffprobe)...");
        actualAudioDuration = await getActualAudioDuration(audioLocalPath);
        actualAudioDurationMs = Math.round(actualAudioDuration * 1000);
    }

    // Read the SRT content if srtFilePath is present to parse it into millisecond mapping
    let srtText = '';
    if (srtFilePath && existsSync(srtFilePath)) {
        srtText = await require('fs').promises.readFile(srtFilePath, 'utf8');
    }

    // Infer the render font from the actual text as well as the UI language. A project can
    // contain Korean narration even when the language selector was left on its old value.
    const hasKoreanContent = language === 'ko' || hasHangul(srtText) ||
        scenes.some(scene => hasHangul(scene.sceneName)) ||
        storyboardCues.some(cue => hasHangul(cue.text)) ||
        hasHangul(`${introTitle} ${introSubtitle} ${outroText}`);
    const koreanBold = hasKoreanContent ? koreanFontPath(true) : null;
    const koreanNormal = hasKoreanContent ? koreanFontPath(false) : null;
    if (hasKoreanContent && (!koreanBold || !koreanNormal)) {
        return { success: false, error: 'Không tìm thấy font tiếng Hàn (Malgun Gothic hoặc Noto Sans KR) trên máy dựng video.' };
    }
    const textFontBold = koreanBold || fontBoldPath;
    const textFontNormal = koreanNormal || fontNormalPath;

    // Compile Timeline Manifest as Single Source of Truth
    //
    // SRT-based sync fix: when SRT is available, use actual subtitle timestamps
    // (not AI-estimated startMs/endMs) to determine image display timing.
    // We bucket-map each image → subtitle indices using AI range as a rough guide,
    // then let TimelineBuilder read the real SRT timestamps for precise boundaries.
    const parsedSubs = srtText ? parseSrt(srtText) : [];
    const hasSrtSubs = parsedSubs.length > 0;

    // Pre-sort subtitles by startMs for bucket assignment
    const sortedSubs = hasSrtSubs ? [...parsedSubs].sort((a, b) => a.startMs - b.startMs) : [];

    // Track which subtitle indices have been assigned to avoid duplicates
    const assignedSubIds = new Set<number>();

    // First pass: assign subtitles to scenes that have AI-estimated time ranges
    const sceneSubMap = new Map<number, number[]>();
    if (hasSrtSubs) {
        for (const s of scenes) {
            const hasMs = typeof s.startMs === 'number' && typeof s.endMs === 'number';
            if (!hasMs) continue;
            const sceneStart = s.startMs!;
            const sceneEnd = s.endMs!;
            // Use midpoint of each subtitle to decide which scene it belongs to
            const matched = sortedSubs
                .filter(sub => {
                    const subMid = (sub.startMs + sub.endMs) / 2;
                    return subMid >= sceneStart && subMid < sceneEnd;
                })
                .map(sub => sub.index);
            if (matched.length > 0) {
                sceneSubMap.set(s.sceneNumber, matched);
                matched.forEach(id => assignedSubIds.add(id));
            }
        }

        // Second pass: distribute any unassigned subtitles to the nearest scene
        const unassigned = sortedSubs.filter(sub => !assignedSubIds.has(sub.index));
        for (const sub of unassigned) {
            const subMid = (sub.startMs + sub.endMs) / 2;
            let bestScene: number | null = null;
            let bestDist = Infinity;
            for (const s of scenes) {
                const hasMs = typeof s.startMs === 'number' && typeof s.endMs === 'number';
                const sMid = hasMs
                    ? (s.startMs! + s.endMs!) / 2
                    : (s.sceneNumber - 0.5) * (s.durationSeconds || 5) * 1000;
                const dist = Math.abs(subMid - sMid);
                if (dist < bestDist) { bestDist = dist; bestScene = s.sceneNumber; }
            }
            if (bestScene !== null) {
                if (!sceneSubMap.has(bestScene)) sceneSubMap.set(bestScene, []);
                sceneSubMap.get(bestScene)!.push(sub.index);
            }
        }
    }

    const rawSceneInputs = scenes.map(s => {
        const hasMs = typeof s.startMs === 'number' && typeof s.endMs === 'number';

        let srtIds: number[] = [];
        if (hasSrtSubs) {
            // Use SRT-based bucket mapping for accurate sync
            srtIds = sceneSubMap.get(s.sceneNumber) || [];
        } else if (s.parentSceneNumber !== undefined) {
            // Fallback: legacy 1:1 index mapping (no SRT available)
            srtIds.push(s.sceneNumber);
        }

        return {
            id: s.sceneNumber,
            sceneName: s.sceneName,
            durationMs: hasMs ? (s.endMs! - s.startMs!) : Math.round((s.durationSeconds || 5) * 1000),
            // KEY FIX: when SRT is available, do NOT pass AI-estimated startMs/endMs.
            // TimelineBuilder.buildFromSrt will use actual SRT timestamps via srtIds instead.
            startMs: hasSrtSubs && !useShotTimeline ? undefined : s.startMs,
            endMs: hasSrtSubs && !useShotTimeline ? undefined : s.endMs,
            srtIds
        };
    });

    let timelineManifest;
    if (useShotTimeline && (rawSceneInputs.some((scene, index) =>
        scene.startMs !== (index ? rawSceneInputs[index - 1].endMs : 0) ||
        !Number.isSafeInteger(scene.endMs) || scene.durationMs <= 0 || scene.durationMs > 10_000) ||
        Math.abs((rawSceneInputs.at(-1)?.endMs ?? 0) - actualAudioDurationMs) > 100)) {
        throw new Error('Timeline shot không khớp với audio hoặc có shot dài quá 10 giây.');
    }
    if (srtText && !useShotTimeline) {
        timelineManifest = TimelineBuilder.buildFromSrt(
            workspaceId,
            audioLocalName,
            actualAudioDurationMs,
            srtText,
            rawSceneInputs,
            audioLeadTime
        );
    } else {
        timelineManifest = TimelineBuilder.buildFromEstimates(
            workspaceId,
            audioLocalName,
            actualAudioDurationMs,
            rawSceneInputs,
            useShotTimeline ? 0 : audioLeadTime
        );
    }

    // Run Timeline Validation before rendering
    const validation = TimelineValidator.validate(timelineManifest);
    if (!validation.isValid) {
        console.error("Timeline Validation Failed:", validation.message);
        throw new Error(validation.message || "TIMELINE_ERROR");
    }

    // Image existence validation
    for (const scene of scenes) {
        const hasFile = scene.file && scene.file.size > 0;
        let hasUrlFile = false;
        if (scene.url) {
            const cleanUrl = scene.url.replace(/^\//, '');
            const localSourcePath = join(process.cwd(), 'public', cleanUrl);
            if (existsSync(localSourcePath)) {
                hasUrlFile = true;
            }
        }
        if (!hasFile && !hasUrlFile) {
            const origName = scene.file ? scene.file.name : (scene.url ? basename(scene.url) : '');
            const ext = origName ? (origName.split('.').pop() || 'png') : 'png';
            const expectedFilename = origName || `${String(scene.sceneNumber).padStart(3, '0')}.${ext}`;
            return {
                success: false,
                error: `MISSING_IMAGE: ${expectedFilename}`,
                workspaceId
            };
        }
    }

    // Map sceneNumber -> adjustedDuration & adjustedFrames (converting back to seconds at the boundary adapter)
    const adjustedFrames: Record<number, number> = {};
    for (const scene of scenes) {
        const manifestScene = timelineManifest.scenes.find(ms => ms.id === scene.sceneNumber);
        if (manifestScene && manifestScene.startFrame !== undefined && manifestScene.endFrame !== undefined) {
            const frames = manifestScene.endFrame - manifestScene.startFrame;
            adjustedFrames[scene.sceneNumber] = frames;
        } else {
            const dur = scene.durationSeconds || 5;
            const frames = Math.max(1, Math.round(dur * 25));
            adjustedFrames[scene.sceneNumber] = frames;
        }
    }

    const useTransitions = !useShotTimeline && transitionType !== 'none' && scenes.length > 1;
    const transitionPlan = useTransitions
        ? planTransitions(scenes.map(scene => adjustedFrames[scene.sceneNumber]), transitionDuration)
        : null;
    const renderFrames = transitionPlan?.renderFrames ?? scenes.map(scene => adjustedFrames[scene.sceneNumber]);
    const renderDurations: Record<number, number> = {};
    scenes.forEach((scene, index) => {
        renderDurations[scene.sceneNumber] = renderFrames[index] / 25;
    });
    const plannedSpeedPaint = planSpeedPaintStyles(
        scenes.map(scene => ({
            sceneNumber: scene.sceneNumber,
            durationSeconds: adjustedFrames[scene.sceneNumber] / 25,
            isVideo: /\.(mp4|mov|avi|mkv|webm)(?:$|\?)/i.test(scene.file?.name || scene.url || ''),
        })),
        speedPaintStyles,
        { enabled: smartDirectorEnabled, minDurationSeconds: speedPaintMinSeconds, minGapScenes: speedPaintGapScenes }
    );

    const concatListLines: string[] = [];
    const segmentNames: Record<number, string> = {};
    let previousMotionMode: ResolvedMotion['mode'] | null = null;

    // Process each scene segment
    for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const progressVal = Math.round(5 + (i / scenes.length) * 82);
        await updateStatus(progressVal, `Đang xử lý phân đoạn ${i + 1}/${scenes.length} (${scene.sceneName.substring(0, 30)}...)`);

        const frames = renderFrames[i];
        const segmentVideoName = `segment_${scene.sceneNumber}.mp4`;
        const filterParts: string[] = [];
        const motion: ResolvedMotion | null = (motionDirectorEnabled || smartDirectorEnabled)
            ? resolveMotion(scene.sceneName, scene.sceneNumber, motionPlans.find(plan => plan.sceneNumber === scene.sceneNumber), previousMotionMode)
            : null;

        let resolvedMediaPath = '';

        if (scene.file && scene.file.size > 0) {
            // Scene file uploaded via frontend
            const fileBuffer = Buffer.from(await scene.file.arrayBuffer());
            const fileExt = scene.file.name.split('.').pop()?.toLowerCase() || '';
            const tempMediaName = `temp_media_${scene.sceneNumber}.${fileExt}`;
            const tempMediaPath = join(workspaceDir, tempMediaName);
            await writeFile(tempMediaPath, fileBuffer);
            resolvedMediaPath = tempMediaName;
        } else if (scene.url) {
            // Local asset referencing (server already holds this image)
            const cleanUrl = scene.url.replace(/^\//, '');
            const localSourcePath = join(process.cwd(), 'public', cleanUrl);
            if (existsSync(localSourcePath)) {
                const fileExt = basename(scene.url).split('.').pop()?.toLowerCase() || '';
                const tempMediaName = `temp_media_${scene.sceneNumber}.${fileExt}`;
                const tempMediaPath = join(workspaceDir, tempMediaName);
                await require('fs').promises.copyFile(localSourcePath, tempMediaPath);
                resolvedMediaPath = tempMediaName;
            }
        }

        if (resolvedMediaPath) {
            const fileExt = resolvedMediaPath.split('.').pop()?.toLowerCase() || '';
            const isVideo = ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(fileExt);

            if (isVideo) {
                const sourceStartMs = useShotTimeline && Number.isSafeInteger(scene.sourceStartMs) ? scene.sourceStartMs ?? 0 : 0;
                const inputOptions = useShotTimeline
                    ? sourceStartMs > 0 ? `-ss ${(sourceStartMs / 1000).toFixed(3)} ` : ''
                    : '-stream_loop -1 ';
                previousMotionMode = null;
                const videoDimensions = await getMediaDimensions(resolvedMediaPath, workspaceDir);
                const needsBackdrop = !!videoDimensions &&
                    Math.abs(videoDimensions.width / videoDimensions.height - 16 / 9) > 0.1;
                if (!needsBackdrop) {
                    filterParts.push('scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080');
                }
                const colorFilter = getColorGradeFilter(colorPreset);
                if (colorFilter) filterParts.push(colorFilter);

                if (showSceneTitle && scene.sceneName) {
                    const titleFileName = `scene_${scene.sceneNumber}_title.txt`;
                    await writeFile(join(workspaceDir, titleFileName), scene.sceneName.trim(), 'utf8');
                    filterParts.push(`drawtext=fontfile='${textFontBold}':textfile=${titleFileName}:fontsize=42:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.08:enable='between(t,0.3,2.5)':alpha='if(lt(t,0.8),(t-0.3)/0.5,if(gt(t,2.0),(2.5-t)/0.5,1))'`);
                }

                if (vignette) filterParts.push(`vignette=PI/5`);
                if (filmGrain) filterParts.push(`noise=c0s=4:c0f=t+u`);

                filterParts.push(`fps=25,setsar=1,format=yuv420p`);

                if (needsBackdrop) {
                    const videoGraph = [
                        '[0:v]split=2[bg][fg]',
                        '[bg]scale=320:180:force_original_aspect_ratio=increase,crop=320:180,boxblur=20:2,scale=1920:1080,eq=brightness=-0.20:saturation=0.85[blurred]',
                        '[fg]scale=1920:1080:force_original_aspect_ratio=decrease[main]',
                        `[blurred][main]overlay=x=(W-w)/2:y=(H-h)/2:shortest=1,${filterParts.join(',')}[vout]`
                    ].join(';');
                    const filterScriptName = `video_filter_${scene.sceneNumber}.txt`;
                    await writeFile(join(workspaceDir, filterScriptName), videoGraph, 'utf8');
                    const cmd = `ffmpeg -y ${inputOptions}-i "${resolvedMediaPath}" -filter_complex_script "${filterScriptName}" -map "[vout]" -frames:v ${frames} -vsync cfr -c:v libx264 -preset fast -crf 23 -an "${segmentVideoName}"`;
                    await runCommand(cmd, workspaceDir);
                } else {
                    const cmd = `ffmpeg -y ${inputOptions}-i "${resolvedMediaPath}" -frames:v ${frames} -vf "${filterParts.join(',')}" -vsync cfr -c:v libx264 -preset fast -crf 23 -an "${segmentVideoName}"`;
                    await runCommand(cmd, workspaceDir);
                }
                if (useShotTimeline) {
                    const { stdout } = await execFile('ffprobe', [
                        '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=nb_frames',
                        '-of', 'default=noprint_wrappers=1:nokey=1', segmentVideoName,
                    ], { cwd: workspaceDir });
                    if (Number(stdout.trim()) !== frames) {
                        if (sourceStartMs > 0) {
                            throw new Error(`Clip ${scene.sceneName} không đủ ${frames / 25} giây từ điểm cắt ${sourceStartMs / 1000} giây. Hãy chọn điểm bắt đầu sớm hơn.`);
                        }
                        throw new Error(`Clip ${scene.sceneName} quá ngắn hoặc không đọc được. Cần đủ ${frames / 25} giây.`);
                    }
                }
            } else {
                const speedPaintStyle = plannedSpeedPaint[scene.sceneNumber];
                previousMotionMode = speedPaintStyle ? null : motion?.mode ?? null;
                const dimensions = await getMediaDimensions(resolvedMediaPath, workspaceDir);
                if (speedPaintStyle) {
                    const rawSegmentName = `speedpaint_raw_${scene.sceneNumber}.mp4`;
                    const scriptPath = join(process.cwd(), 'scripts', 'render-speedpaint.cjs');
                    const sourcePath = join(workspaceDir, resolvedMediaPath);
                    const penPath = join(process.cwd(), 'public', 'assets', 'speedpaint', 'hand_pen.png');
                    const brushPath = join(process.cwd(), 'public', 'assets', 'speedpaint', 'hand_brush.png');
                    await execFile(process.execPath, [scriptPath, sourcePath, penPath, brushPath,
                        join(workspaceDir, rawSegmentName), speedPaintStyle, String(frames)],
                    { cwd: workspaceDir, maxBuffer: 1024 * 1024 });
                    const colorFilter = getColorGradeFilter(colorPreset);
                    if (colorFilter) filterParts.push(colorFilter);
                    if (showSceneTitle && scene.sceneName) {
                        const titleFileName = `scene_${scene.sceneNumber}_title.txt`;
                        await writeFile(join(workspaceDir, titleFileName), scene.sceneName.trim(), 'utf8');
                        filterParts.push(`drawtext=fontfile='${textFontBold}':textfile=${titleFileName}:fontsize=42:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.08:enable='between(t,0.3,2.5)'`);
                    }
                    if (vignette) filterParts.push('vignette=PI/5');
                    if (filmGrain) filterParts.push('noise=c0s=4:c0f=t+u');
                    if (filterParts.length) {
                        filterParts.push('setsar=1,format=yuv420p');
                        await runCommand(`ffmpeg -y -i "${rawSegmentName}" -vf "${filterParts.join(',')}" -frames:v ${frames} -c:v libx264 -preset fast -crf 23 -an "${segmentVideoName}"`, workspaceDir);
                    } else {
                        await copyFile(join(workspaceDir, rawSegmentName), join(workspaceDir, segmentVideoName));
                    }
                } else if (dimensions && Math.abs(dimensions.width / dimensions.height - 16 / 9) > 0.1) {
                    // Keep artwork intact while filling a mismatched landscape canvas with a quiet backdrop.
                    const portraitFilters: string[] = [];
                    if (motion) {
                        const plannedFilter = motionFilter(motion, frames, 1, adjustedFrames[scene.sceneNumber]);
                        if (plannedFilter) portraitFilters.push(plannedFilter);
                    } else if (kenBurns !== 'none') {
                        const presets = ['zoom_in', 'zoom_out', 'pan_left', 'pan_right'];
                        const motion = kenBurns === 'random'
                            ? presets[Math.floor(Math.random() * presets.length)]
                            : kenBurns;
                        const zoomSpeed = (0.04 / frames).toFixed(6);
                        const centeredX = "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'";
                        if (motion === 'zoom_in') {
                            portraitFilters.push(`zoompan=z='min(zoom+${zoomSpeed},1.04)':${centeredX}:d=1:s=1920x1080:fps=25`);
                        } else if (motion === 'zoom_out') {
                            portraitFilters.push(`zoompan=z='if(eq(on,0),1.04,max(1.001,zoom-${zoomSpeed}))':${centeredX}:d=1:s=1920x1080:fps=25`);
                        } else if (motion === 'pan_left') {
                            portraitFilters.push(`zoompan=z=1.04:x='(iw-iw/zoom)*(1-on/${frames})':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=25`);
                        } else if (motion === 'pan_right') {
                            portraitFilters.push(`zoompan=z=1.04:x='(iw-iw/zoom)*(on/${frames})':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=25`);
                        }
                    }
                    const colorFilter = getColorGradeFilter(colorPreset);
                    if (colorFilter) portraitFilters.push(colorFilter);
                    if (showSceneTitle && scene.sceneName) {
                        const titleFileName = `scene_${scene.sceneNumber}_title.txt`;
                        await writeFile(join(workspaceDir, titleFileName), scene.sceneName.trim(), 'utf8');
                        portraitFilters.push(`drawtext=fontfile='${textFontBold}':textfile=${titleFileName}:fontsize=42:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.08:enable='between(t,0.3,2.5)':alpha='if(lt(t,0.8),(t-0.3)/0.5,if(gt(t,2.0),(2.5-t)/0.5,1))'`);
                    }
                    if (vignette) portraitFilters.push('vignette=PI/5');
                    if (filmGrain) portraitFilters.push('noise=c0s=4:c0f=t+u');
                    portraitFilters.push('setsar=1,format=yuv420p');

                    const portraitGraph = [
                        '[0:v]split=2[bg][fg]',
                        '[bg]scale=320:180:force_original_aspect_ratio=increase,crop=320:180,boxblur=20:2,scale=1920:1080,eq=brightness=-0.20:saturation=0.85[blurred]',
                        '[fg]scale=1920:1080:force_original_aspect_ratio=decrease[portrait]',
                        `[blurred][portrait]overlay=x=(W-w)/2:y=(H-h)/2:shortest=1,${portraitFilters.join(',')}[vout]`
                    ].join(';');
                    const filterScriptName = `portrait_filter_${scene.sceneNumber}.txt`;
                    await writeFile(join(workspaceDir, filterScriptName), portraitGraph, 'utf8');
                    const cmd = `ffmpeg -y -loop 1 -i "${resolvedMediaPath}" -filter_complex_script "${filterScriptName}" -map "[vout]" -frames:v ${frames} -r 25 -vsync cfr -c:v libx264 -preset fast -crf 23 "${segmentVideoName}"`;
                    await runCommand(cmd, workspaceDir);
                } else if (motion) {
                    filterParts.push(`scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080`);
                    const plannedFilter = motionFilter(motion, frames, frames, adjustedFrames[scene.sceneNumber]);
                    if (plannedFilter) filterParts.push(plannedFilter);
                    const colorFilter = getColorGradeFilter(colorPreset);
                    if (colorFilter) filterParts.push(colorFilter);
                    if (showSceneTitle && scene.sceneName) {
                        const titleFileName = `scene_${scene.sceneNumber}_title.txt`;
                        await writeFile(join(workspaceDir, titleFileName), scene.sceneName.trim(), 'utf8');
                        filterParts.push(`drawtext=fontfile='${textFontBold}':textfile=${titleFileName}:fontsize=42:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.08:enable='between(t,0.3,2.5)'`);
                    }
                    if (vignette) filterParts.push('vignette=PI/5');
                    if (filmGrain) filterParts.push('noise=c0s=4:c0f=t+u');
                    filterParts.push('setsar=1,format=yuv420p');
                    const cmd = `ffmpeg -y -loop 1 -i "${resolvedMediaPath}" -frames:v ${frames} -vf "${filterParts.join(',')}" -r 25 -vsync cfr -c:v libx264 -preset fast -crf 23 "${segmentVideoName}"`;
                    await runCommand(cmd, workspaceDir);
                } else if (kenBurns !== 'none') {
                    const totalFrames = frames;
                    const zoomSpeed = 0.5 / totalFrames;
                    
                    let actualPreset = kenBurns;
                    if (actualPreset === 'random') {
                        const presets = ['zoom_in', 'zoom_out', 'pan_left', 'pan_right', 'pan_up', 'pan_down'];
                        actualPreset = presets[Math.floor(Math.random() * presets.length)];
                    }
                    
                    filterParts.push(`scale='if(gt(iw*9,ih*16),-2,3840)':'if(gt(iw*9,ih*16),2160,-2)',crop=3840:2160`);
                    if (actualPreset === 'zoom_in') {
                        filterParts.push(`zoompan=z='min(zoom+${zoomSpeed.toFixed(5)},1.5)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=1920x1080:fps=25`);
                    } else if (actualPreset === 'zoom_out') {
                        filterParts.push(`zoompan=z='if(lte(zoom,1.0),1.5,max(1.001,zoom-${zoomSpeed.toFixed(5)}))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=1920x1080:fps=25`);
                    } else if (actualPreset === 'pan_left') {
                        filterParts.push(`zoompan=z=1.3:x='(iw/zoom-iw/zoom*0.7)*(on/${totalFrames})':y='ih/2-(iw/zoom/2)':d=${totalFrames}:s=1920x1080:fps=25`);
                    } else if (actualPreset === 'pan_right') {
                        filterParts.push(`zoompan=z=1.3:x='(iw/zoom-iw/zoom*0.7)*(1-on/${totalFrames})':y='ih/2-(iw/zoom/2)':d=${totalFrames}:s=1920x1080:fps=25`);
                    } else if (actualPreset === 'pan_up') {
                        filterParts.push(`zoompan=z=1.3:x='iw/2-(iw/zoom/2)':y='(ih/zoom-ih/zoom*0.7)*(1-on/${totalFrames})':d=${totalFrames}:s=1920x1080:fps=25`);
                    } else if (actualPreset === 'pan_down') {
                        filterParts.push(`zoompan=z=1.3:x='iw/2-(iw/zoom/2)':y='(ih/zoom-ih/zoom*0.7)*(on/${totalFrames})':d=${totalFrames}:s=1920x1080:fps=25`);
                    }
                    const colorFilter = getColorGradeFilter(colorPreset);
                    if (colorFilter) filterParts.push(colorFilter);

                    if (showSceneTitle && scene.sceneName) {
                        const titleFileName = `scene_${scene.sceneNumber}_title.txt`;
                        await writeFile(join(workspaceDir, titleFileName), scene.sceneName.trim(), 'utf8');
                        filterParts.push(`drawtext=fontfile='${textFontBold}':textfile=${titleFileName}:fontsize=42:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.08:enable='between(t,0.3,2.5)':alpha='if(lt(t,0.8),(t-0.3)/0.5,if(gt(t,2.0),(2.5-t)/0.5,1))'`);
                    }

                    if (vignette) filterParts.push(`vignette=PI/5`);
                    if (filmGrain) filterParts.push(`noise=c0s=4:c0f=t+u`);
                    filterParts.push(`setsar=1,format=yuv420p`);

                    const cmd = `ffmpeg -y -loop 1 -i "${resolvedMediaPath}" -frames:v ${frames} -vf "${filterParts.join(',')}" -r 25 -vsync cfr -c:v libx264 -preset fast -crf 23 "${segmentVideoName}"`;
                    await runCommand(cmd, workspaceDir);
                } else {
                    // Near-16:9 images (for example 1376x768) otherwise get thin black padding.
                    filterParts.push(`scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080`);
                    const colorFilter = getColorGradeFilter(colorPreset);
                    if (colorFilter) filterParts.push(colorFilter);

                    if (showSceneTitle && scene.sceneName) {
                        const titleFileName = `scene_${scene.sceneNumber}_title.txt`;
                        await writeFile(join(workspaceDir, titleFileName), scene.sceneName.trim(), 'utf8');
                        filterParts.push(`drawtext=fontfile='${textFontBold}':textfile=${titleFileName}:fontsize=42:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.08:enable='between(t,0.3,2.5)':alpha='if(lt(t,0.8),(t-0.3)/0.5,if(gt(t,2.0),(2.5-t)/0.5,1))'`);
                    }

                    if (vignette) filterParts.push(`vignette=PI/5`);
                    if (filmGrain) filterParts.push(`noise=c0s=4:c0f=t+u`);
                    filterParts.push(`setsar=1,format=yuv420p`);

                    const cmd = `ffmpeg -y -loop 1 -i "${resolvedMediaPath}" -frames:v ${frames} -vf "${filterParts.join(',')}" -r 25 -vsync cfr -c:v libx264 -preset fast -crf 23 "${segmentVideoName}"`;
                    await runCommand(cmd, workspaceDir);
                }
            }
        } else {
            previousMotionMode = null;
            // Fallback: Black segment
            if (showSceneTitle && scene.sceneName) {
                const titleFileName = `scene_${scene.sceneNumber}_title.txt`;
                await writeFile(join(workspaceDir, titleFileName), scene.sceneName.trim(), 'utf8');
                filterParts.push(`drawtext=fontfile='${textFontBold}':textfile=${titleFileName}:fontsize=42:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.08:enable='between(t,0.3,2.5)':alpha='if(lt(t,0.8),(t-0.3)/0.5,if(gt(t,2.0),(2.5-t)/0.5,1))'`);
            }
            filterParts.push(`setsar=1,format=yuv420p`);

            const cmd = `ffmpeg -y -f lavfi -i color=c=black:s=1920x1080:r=25 -frames:v ${frames} -vf "${filterParts.join(',')}" -vsync cfr -pix_fmt yuv420p -c:v libx264 -preset fast -crf 23 "${segmentVideoName}"`;
            await runCommand(cmd, workspaceDir);
        }

        let composedSegmentName = segmentVideoName;
        if ((motionDirectorEnabled || smartDirectorEnabled) && scene.motionLayer && scene.motionLayer.size > 0) {
            if (!/\.png$/i.test(scene.motionLayer.name) || scene.motionLayer.size > 20 * 1024 * 1024) {
                throw new Error(`Lớp chuyển động cảnh ${scene.sceneNumber} phải là PNG trong suốt, tối đa 20 MB.`);
            }
            const layerName = `motion_layer_${scene.sceneNumber}.png`;
            const layerVideoName = `layered_segment_${scene.sceneNumber}.mp4`;
            await writeFile(join(workspaceDir, layerName), Buffer.from(await scene.motionLayer.arrayBuffer()));
            const layerMotion = motion ?? resolveMotion(scene.sceneName, scene.sceneNumber,
                motionPlans.find(plan => plan.sceneNumber === scene.sceneNumber));
            const x = layerMotion.focusX.toFixed(4);
            const y = layerMotion.focusY.toFixed(4);
            const layerGraph = `[1:v]scale=650:650:force_original_aspect_ratio=decrease,format=rgba,fade=t=in:st=0:d=0.25:alpha=1[layer];` +
                `[0:v][layer]overlay=x='W*${x}-w/2+14*sin(t*1.1)':y='H*${y}-h/2+10*cos(t*0.8)':shortest=1,format=yuv420p[vout]`;
            const layerGraphName = `motion_layer_filter_${scene.sceneNumber}.txt`;
            await writeFile(join(workspaceDir, layerGraphName), layerGraph, 'utf8');
            await runCommand(`ffmpeg -y -i "${segmentVideoName}" -loop 1 -i "${layerName}" -filter_complex_script "${layerGraphName}" -map "[vout]" -frames:v ${frames} -r 25 -c:v libx264 -preset fast -crf 23 -an "${layerVideoName}"`, workspaceDir);
            composedSegmentName = layerVideoName;
        }
        const graphicCues = storyboardCues.filter(c => c.sceneNumber === scene.sceneNumber &&
            ['keyword', 'stat', 'steps'].includes(c.kind) && typeof c.text === 'string' && c.text.trim() &&
            Number.isFinite(c.at) && Number.isFinite(c.length));
        if (graphicCues.length) {
            const segmentDuration = frames / 25;
            const graphicFilters: string[] = [];
            const stepCues = graphicCues.filter(c => c.kind === 'steps');
            for (let cueIndex = 0; cueIndex < Math.min(graphicCues.length, 6); cueIndex++) {
                const cue = graphicCues[cueIndex];
                const template = resolveGraphicTemplate(cue, cueIndex);
                const start = Math.max(0, Math.min(0.92, cue.at)) * segmentDuration;
                const end = Math.min(segmentDuration, start + Math.max(0.08, Math.min(0.8, cue.length)) * segmentDuration);
                const startStr = start.toFixed(3);
                const endStr = end.toFixed(3);
                const textFile = `graphic_${scene.sceneNumber}_${cueIndex}.txt`;
                const stepIndex = stepCues.indexOf(cue);
                const text = cue.kind === 'steps' ? `${stepIndex + 1}/${stepCues.length} → ${cue.text}` : cue.text;
                const displayText = fitGraphicText(text, graphicTextLimit(template, cue.kind));
                await writeFile(join(workspaceDir, textFile), displayText, 'utf8');

                const top = template === 'lower' ? 770 : showSceneTitle ? 310 : 112;
                const left = 112;
                const fontSize = graphicFontSize(template, cue.kind);
                const width = graphicCardWidth(displayText, template, fontSize);
                const boxHeight = cue.kind === 'keyword' ? 102 : 136;
                const accent = template === 'card' ? '0xF59E0B' : template === 'lower' ? '0xA78BFA' : '0x22D3EE';
                if (template !== 'outline') {
                    const background = template === 'card' ? '0x0F172A@0.84' : template === 'lower' ? '0x201638@0.78' : 'black@0.68';
                    graphicFilters.push(`drawbox=x=${left}:y=${top}:w=${width}:h=${boxHeight}:color=${background}:t=fill:enable='between(t,${startStr},${endStr})'`);
                    graphicFilters.push(`drawbox=x=${left}:y=${top}:w=7:h=${boxHeight}:color=${accent}@0.95:t=fill:enable='between(t,${startStr},${endStr})'`);
                }
                const textX = template === 'outline'
                    ? `'max(120,w-text_w-112)'`
                    : `'${left + 28}+max(0,(${startStr}+0.28-t)*130)'`;
                const textY = top + (cue.kind === 'stat' ? 23 : template === 'outline' ? 12 : 27);
                graphicFilters.push(`drawtext=fontfile='${textFontBold}':textfile=${textFile}:expansion=none:fontsize=${fontSize}:fontcolor=white:x=${textX}:y=${textY}:borderw=${template === 'outline' ? 4 : 1}:bordercolor=black:enable='between(t,${startStr},${endStr})':alpha='min(min(1,max(0,(t-${startStr})/0.22)),max(0,(${endStr}-t)/0.22))'`);
                const percent = cue.kind === 'stat' ? cue.text.match(/(\d+(?:[.,]\d+)?)\s*[%％]/) : null;
                if (percent || cue.kind === 'steps') {
                    const fraction = percent ? Math.max(0, Math.min(1, Number(percent[1].replace(',', '.')) / 100)) : (stepIndex + 1) / stepCues.length;
                    const barLeft = template === 'outline' ? 1400 : left;
                    const barWidth = template === 'outline' ? 400 : width;
                    const barTop = top + (template === 'outline' ? 88 : boxHeight - 9);
                    graphicFilters.push(`drawbox=x=${barLeft}:y=${barTop}:w=${barWidth}:h=7:color=white@0.3:t=fill:enable='between(t,${startStr},${endStr})'`);
                    graphicFilters.push(`drawbox=x=${barLeft}:y=${barTop}:w=${Math.max(2, Math.round(barWidth * fraction))}:h=7:color=${accent}@0.95:t=fill:enable='between(t,${startStr},${endStr})'`);
                } else if (template === 'outline') {
                    graphicFilters.push(`drawbox=x=1640:y=${top + 84}:w=160:h=5:color=${accent}@0.95:t=fill:enable='between(t,${startStr},${endStr})'`);
                }
            }
            const filterName = `graphic_filter_${scene.sceneNumber}.txt`;
            await writeFile(join(workspaceDir, filterName), graphicFilters.join(','), 'utf8');
            const graphicSegmentName = `segment_graphic_${scene.sceneNumber}.mp4`;
            await runCommand(`ffmpeg -y -i "${composedSegmentName}" -filter_script:v "${filterName}" -frames:v ${frames} -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -an "${graphicSegmentName}"`, workspaceDir);
            composedSegmentName = graphicSegmentName;
        }
        segmentNames[scene.sceneNumber] = composedSegmentName;
        concatListLines.push(`file '${composedSegmentName}'`);
    }

    // Concat video segments (with or without transitions)
    let concatenatedName: string;
    if (useTransitions) {
        await updateStatus(88, `Đang áp dụng hiệu ứng chuyển cảnh (${transitionType})...`);
        concatenatedName = await applyTransitions(
            workspaceDir,
            scenes,
            renderDurations,
            transitionType,
            transitionPlan!.transitionSeconds,
            segmentNames,
            async (completed, total) => updateStatus(
                88 + Math.round(6 * completed / total),
                `Đang ghép chuyển cảnh theo nhóm ${completed}/${total}...`
            )
        );
    } else {
        const filelistPath = join(workspaceDir, 'filelist.txt');
        await writeFile(filelistPath, concatListLines.join('\n'), 'utf8');

        await updateStatus(90, "Đang ghép nối các phân đoạn video...");
        concatenatedName = 'concatenated.mp4';
        const concatCmd = `ffmpeg -y -f concat -safe 0 -i filelist.txt -c copy "${concatenatedName}"`;
        await runCommand(concatCmd, workspaceDir);
    }

    // Merge audio, BGM and burn subtitles
    await updateStatus(95, "Đang lồng ghép âm thanh và phụ đề vào video...");
    const finalVideoName = 'final_video.mp4';
    const hasSubtitles = !!(relativeSrtName && burnSubtitles);
    const hasBgm = !!(bgmLocalPath && bgmLocalName);
    const totalDurationSeconds = timelineManifest.audio.durationMs / 1000;
    const voiceDuration = audioLocalPath ? (await getActualAudioDuration(audioLocalPath) || totalDurationSeconds) : totalDurationSeconds;
    const requestedSubStyle = SUBTITLE_STYLES[subtitleStyle] || SUBTITLE_STYLES.default;
    const usesDefaultSubStyle = requestedSubStyle === SUBTITLE_STYLES.default;
    let subStyle = requestedSubStyle;
    if (hasHangul(srtText) || (usesDefaultSubStyle && language === 'ko')) {
        subStyle = requestedSubStyle.replace(/^FontName=[^,]+/, 'FontName=Malgun Gothic');
    } else if (usesDefaultSubStyle && (language === 'ja' || /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(srtText))) {
        subStyle = requestedSubStyle.replace(/^FontName=[^,]+/, 'FontName=Yu Gothic');
    }

    const finalVfParts: string[] = [];
    if (hasSubtitles) {
        const assFileName = 'burn_subtitles.ass';
        await writeFile(join(workspaceDir, assFileName), buildAssSubtitles(srtText, subStyle), 'utf8');
        finalVfParts.push(`subtitles=${assFileName}`);
    }
    if (showProgressBar) {
        finalVfParts.push(`drawbox=x=0:y=ih-6:w='iw*t/${voiceDuration.toFixed(2)}':h=6:color=0xFFD700@0.85:t=fill`);
    }
    const finalVf = finalVfParts.join(',');

    let mergeCmd = '';

    if (hasBgm) {
        const bgmFilter = audioLocalPath
            ? `[1:a]volume=1.0[voice];[2:a]volume=${bgmVolume},afade=t=in:st=0:d=3,afade=t=out:st=${Math.max(0, voiceDuration - 3).toFixed(2)}:d=3[bgm];[voice][bgm]amix=inputs=2:duration=first:dropout_transition=3[aout]`
            : `[1:a]volume=${bgmVolume},afade=t=in:st=0:d=3,afade=t=out:st=${Math.max(0, voiceDuration - 3).toFixed(2)}:d=3[aout]`;

        const audioInputs = audioLocalPath
            ? `-i "${audioLocalName}" -i "${bgmLocalName}"`
            : `-i "${bgmLocalName}"`;

        if (finalVf) {
            // Audio is master: video was padded to cover full audio. Use -shortest so output ends when audio ends.
            mergeCmd = `ffmpeg -y -i "${concatenatedName}" ${audioInputs} -filter_complex "[0:v]${finalVf}[vout];${bgmFilter}" -map "[vout]" -map "[aout]" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest "${finalVideoName}"`;
        } else {
            mergeCmd = `ffmpeg -y -i "${concatenatedName}" ${audioInputs} -filter_complex "${bgmFilter}" -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 192k -shortest "${finalVideoName}"`;
        }
    } else {
        if (audioLocalPath) {
            // Audio is master: do NOT use -t to truncate. Let video run its full length.
            // The video was already padded to be >= audio duration, so audio won't be cut.
            if (finalVf) {
                mergeCmd = `ffmpeg -y -i "${concatenatedName}" -i "${audioLocalName}" -vf "${finalVf}" -map 0:v -map 1:a -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k -shortest "${finalVideoName}"`;
            } else {
                mergeCmd = `ffmpeg -y -i "${concatenatedName}" -i "${audioLocalName}" -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 128k -shortest "${finalVideoName}"`;
            }
        } else {
            if (finalVf) {
                mergeCmd = `ffmpeg -y -i "${concatenatedName}" -vf "${finalVf}" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -an "${finalVideoName}"`;
            } else {
                mergeCmd = `ffmpeg -y -i "${concatenatedName}" -c copy "${finalVideoName}"`;
            }
        }
    }

    await runCommand(mergeCmd, workspaceDir);

    // Apply Intro/Outro overlay
    let outputVideoName = finalVideoName;

    if (showIntro || showOutro) {
        await updateStatus(97, "Đang tạo intro/outro...");
        const finalConcatLines: string[] = [];

        if (showIntro && introTitle.trim()) {
            await writeFile(join(workspaceDir, 'intro_title.txt'), introTitle.trim(), 'utf8');
            let introVf = `drawtext=fontfile='${textFontBold}':textfile=intro_title.txt:fontsize=52:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2`;

            if (introSubtitle.trim()) {
                await writeFile(join(workspaceDir, 'intro_subtitle.txt'), introSubtitle.trim(), 'utf8');
                introVf += `,drawtext=fontfile='${textFontNormal}':textfile=intro_subtitle.txt:fontsize=24:fontcolor=0xaaaaaa:x=(w-text_w)/2:y=h*0.65`;
            }

            introVf += `,fade=t=in:st=0:d=1.5,fade=t=out:st=3:d=1`;

            const introCmd = `ffmpeg -y -f lavfi -i "color=c=0x1a1a2e:s=1920x1080:r=25:d=4" -f lavfi -i "anullsrc=r=44100:cl=stereo" -vf "${introVf}" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k -shortest "intro.mp4"`;
            await runCommand(introCmd, workspaceDir);
            finalConcatLines.push("file 'intro.mp4'");
        }

        finalConcatLines.push(`file '${finalVideoName}'`);

        if (showOutro && outroText.trim()) {
            await writeFile(join(workspaceDir, 'outro_text.txt'), outroText.trim(), 'utf8');
            const outroVf = `drawtext=fontfile='${textFontBold}':textfile=outro_text.txt:fontsize=48:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2,fade=t=in:st=0:d=1,fade=t=out:st=4:d=1`;

            const outroCmd = `ffmpeg -y -f lavfi -i "color=c=0x1a1a2e:s=1920x1080:r=25:d=5" -f lavfi -i "anullsrc=r=44100:cl=stereo" -vf "${outroVf}" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k -shortest "outro.mp4"`;
            await runCommand(outroCmd, workspaceDir);
            finalConcatLines.push("file 'outro.mp4'");
        }

        if (finalConcatLines.length > 1) {
            outputVideoName = 'complete_video.mp4';
            const finalListPath = join(workspaceDir, 'filelist_final.txt');
            await writeFile(finalListPath, finalConcatLines.join('\n'), 'utf8');

            const finalConcatCmd = `ffmpeg -y -f concat -safe 0 -i filelist_final.txt -c copy "${outputVideoName}"`;
            await runCommand(finalConcatCmd, workspaceDir);
        }
    }

    await updateStatus(99, "Đang kiểm tra đồng bộ video hậu kỳ (final validation)...");
    
    // Calculate expected duration
    const introDuration = showIntro && introTitle.trim() ? 4 : 0;
    const outroDuration = showOutro && outroText.trim() ? 5 : 0;
    const expectedDuration = (audioLocalPath ? actualAudioDuration : totalDurationSeconds)
        + introDuration + outroDuration;

    const finalVideoPath = join(workspaceDir, outputVideoName);
    const actualVideoDur = await getActualAudioDuration(finalVideoPath);
    
    // Read final video frame count via ffprobe
    let actualFrames = 0;
    try {
        const { stdout } = await exec(
            `ffprobe -v error -select_streams v:0 -show_entries stream=nb_frames -of default=noprint_wrappers=1:nokey=1 "${finalVideoPath}"`
        );
        actualFrames = parseInt(stdout.trim(), 10);
    } catch (e) {
        console.warn("Failed to read final video frame count", e);
    }

    const diff = Math.abs(actualVideoDur - expectedDuration);
    const tolerance = 0.1; // 100ms tolerance
    
    const reportPath = join(workspaceDir, 'timeline_report.json');
    const reportData = {
        status: diff <= tolerance ? "SUCCESS" : "FAILED",
        audio_duration_ms: Math.round(actualAudioDuration * 1000),
        expected_video_duration_ms: Math.round(expectedDuration * 1000),
        video_duration_ms: Math.round(actualVideoDur * 1000),
        transition_duration_ms: transitionPlan ? Math.round(transitionPlan.transitionSeconds * 1000) : 0,
        intro_duration_ms: introDuration * 1000,
        outro_duration_ms: outroDuration * 1000,
        fps: 25,
        frame_count: actualFrames,
        image_count: scenes.length,
        scene_count: scenes.length,
        sync_validated: diff <= tolerance,
        errors: diff <= tolerance ? [] : [{
            type: "FINAL_SYNC_ERROR",
            message: `Video duration ${actualVideoDur.toFixed(3)}s differs from expected ${expectedDuration.toFixed(3)}s by ${diff.toFixed(3)}s`
        }]
    };
    await writeFile(reportPath, JSON.stringify(reportData, null, 2), 'utf8');

    if (diff > tolerance) {
        console.error("FINAL_SYNC_ERROR:", reportData.errors[0].message);
        return {
            success: false,
            error: `FINAL_SYNC_ERROR: ${reportData.errors[0].message}`,
            workspaceId
        };
    }

    await updateStatus(100, "Hoàn tất dựng video!");
    const videoUrl = `/outputs/${workspaceId}/${outputVideoName}`;
    console.log(`Video Composer Service: Generated final video at ${videoUrl}`);

    return {
        success: true,
        videoUrl,
        workspaceId
    };
}
