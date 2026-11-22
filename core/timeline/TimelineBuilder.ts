import { TimelineManifest, TimelineScene, TimelinePrompt, TimelineImage, SilenceGap, SilenceAnalysis } from './TimelineManifest';
import { parseSrt, SrtSubtitle } from '../srt/SrtParser';
import { msToFrames, framesToMs } from '../time';

export interface RawSceneInput {
    id: number;
    sceneName: string;
    durationMs?: number; // estimated or parsed duration
    startMs?: number;    // parsed start time (from SRT or layout)
    endMs?: number;      // parsed end time (from SRT or layout)
    srtIds?: number[];  // mapped subtitle indices (if in SRT mode)
}

/**
 * Compiles a TimelineManifest ensuring exact integer milliseconds, contiguity, and audio duration locking.
 */
export class TimelineBuilder {
    /**
     * Builds a manifest when using SRT input.
     * The SRT subtitle timestamps define the ground-truth timing boundaries.
     */
    static buildFromSrt(
        projectId: string,
        audioPath: string,
        audioDurationMs: number,
        srtText: string,
        sceneInputs: RawSceneInput[],
        audioLeadTime: number = 0
    ): TimelineManifest {
        const subtitles = parseSrt(srtText);
        const subMap = new Map<number, SrtSubtitle>();
        for (const sub of subtitles) {
            mapSubtitleAbsoluteIndex(sub, subMap);
        }

        const scenes: TimelineScene[] = [];
        let currentMs = 0;
        const leadTimeMs = Math.round(audioLeadTime * 1000);
        const detectedGaps: SilenceGap[] = [];

        for (let i = 0; i < sceneInputs.length; i++) {
            const input = sceneInputs[i];
            const isLast = i === sceneInputs.length - 1;
            const srtIds = input.srtIds || [];

            // Find min start and max end from mapped subtitles
            let minStartMs = Infinity;
            let maxEndMs = -Infinity;

            // Prioritize startMs/endMs directly passed in raw input (pre-computed by client)
            if (input.startMs !== undefined && input.endMs !== undefined) {
                minStartMs = input.startMs;
                maxEndMs = input.endMs;
            } else {
                for (const id of srtIds) {
                    const sub = subMap.get(id);
                    if (sub) {
                        if (sub.startMs < minStartMs) minStartMs = sub.startMs;
                        if (sub.endMs > maxEndMs) maxEndMs = sub.endMs;
                    }
                }
            }

            // Fallback timing if no subtitles were mapped or found
            if (minStartMs === Infinity || maxEndMs === -Infinity) {
                minStartMs = currentMs;
                maxEndMs = currentMs + (input.durationMs || 5000);
            }

            // Slide startMs by audioLeadTime (delay visual cut to next scene)
            // But keep it within logical bounds (do not start before currentMs)
            const targetStartMs = minStartMs + (isLast ? 0 : leadTimeMs);
            let startMs = Math.max(currentMs, targetStartMs);
            if (i === 0) {
                startMs = 0;
            }

            if (i > 0 && startMs > currentMs) {
                const gapMs = startMs - currentMs;
                const prevScene = scenes[i - 1];

                // Record the silence gap before absorbing it
                if (gapMs > 10) { // Only track gaps > 10ms
                    detectedGaps.push({
                        afterSceneId: prevScene.id,
                        beforeSceneId: input.id,
                        gapMs: Math.round(gapMs),
                        absorbedBySceneId: prevScene.id
                    });
                }

                prevScene.endMs = startMs;
                prevScene.durationMs = prevScene.endMs - prevScene.startMs;
                if (prevScene.prompts.length > 0) {
                    const lastP = prevScene.prompts[prevScene.prompts.length - 1];
                    lastP.endMs = startMs;
                    lastP.durationMs = lastP.endMs - lastP.startMs;
                }
                if (prevScene.images.length > 0) {
                    prevScene.images[prevScene.images.length - 1].endMs = startMs;
                }
            }

            let endMs = Math.max(startMs + 1, maxEndMs);

            if (isLast && audioDurationMs > 0) {
                // Audio duration lock for the final scene
                endMs = audioDurationMs;
            }

            const durationMs = endMs - startMs;
            currentMs = endMs;

            // Initially, each scene gets a single prompt and single image spanning its entire duration
            const prompts: TimelinePrompt[] = [{
                id: `${input.id}-1`,
                startMs,
                endMs,
                durationMs,
                text: input.sceneName
            }];

            const images: TimelineImage[] = [{
                id: `img_${input.id}`,
                path: '',
                startMs,
                endMs
            }];

            scenes.push({
                id: input.id,
                startMs,
                endMs,
                durationMs,
                transcript: input.sceneName,
                srtIds,
                prompts,
                images
            });
        }

        // Lock the chronologically last scene (by endMs) to the audio duration.
        // NOTE: We intentionally avoid sorting the array here to preserve the gap-absorption
        // relationships established during the loop (prevScene = scenes[i-1]).
        if (scenes.length > 0 && audioDurationMs > 0) {
            // Find the scene with the highest endMs — that is the true "last" scene in time.
            const lastScene = scenes.reduce((max, s) => s.endMs > max.endMs ? s : max, scenes[0]);
            if (lastScene.endMs !== audioDurationMs) {
                // Clamp: if the timeline overshoots audio, trim; if it undershoots, extend
                lastScene.endMs = audioDurationMs;
                lastScene.durationMs = lastScene.endMs - lastScene.startMs;
                if (lastScene.prompts.length === 1) {
                    lastScene.prompts[0].endMs = audioDurationMs;
                    lastScene.prompts[0].durationMs = lastScene.prompts[0].endMs - lastScene.prompts[0].startMs;
                }
                if (lastScene.images.length === 1) {
                    lastScene.images[0].endMs = audioDurationMs;
                }
            }
        }

        // Build silence analysis summary
        const totalGapMs = detectedGaps.reduce((sum, g) => sum + g.gapMs, 0);
        const maxGap = detectedGaps.length > 0
            ? detectedGaps.reduce((max, g) => g.gapMs > max.gapMs ? g : max, detectedGaps[0])
            : null;

        const silenceAnalysis: SilenceAnalysis = {
            totalGapMs,
            gapCount: detectedGaps.length,
            averageGapMs: detectedGaps.length > 0 ? Math.round(totalGapMs / detectedGaps.length) : 0,
            maxGapMs: maxGap ? maxGap.gapMs : 0,
            maxGapLocation: maxGap ? `Scene ${maxGap.afterSceneId} → ${maxGap.beforeSceneId}` : '',
            gaps: detectedGaps
        };

        const manifest: TimelineManifest = {
            projectId,
            audio: {
                path: audioPath,
                durationMs: audioDurationMs || currentMs
            },
            scenes,
            silenceAnalysis
        };
        return quantizeTimeline(manifest);
    }

    /**
     * Builds a manifest based on estimated durations (transcript mode).
     * Scene durations are proportionally scaled to fit the actual audio duration.
     */
    static buildFromEstimates(
        projectId: string,
        audioPath: string,
        audioDurationMs: number,
        sceneInputs: RawSceneInput[],
        audioLeadTime: number = 0
    ): TimelineManifest {
        const totalEstimatedMs = sceneInputs.reduce((sum, s) => sum + (s.durationMs || 5000), 0);
        
        // Scale ratio to fit audio duration
        const scale = (audioDurationMs > 0 && totalEstimatedMs > 0)
            ? audioDurationMs / totalEstimatedMs
            : 1.0;

        const scenes: TimelineScene[] = [];
        let currentMs = 0;
        const leadTimeMs = Math.round(audioLeadTime * 1000);

        for (let i = 0; i < sceneInputs.length; i++) {
            const input = sceneInputs[i];
            const isLast = i === sceneInputs.length - 1;
            const estimatedMs = input.durationMs || 5000;

            const baseStartMs = currentMs;
            let durationMs = Math.round(estimatedMs * scale);
            if (durationMs <= 0) durationMs = 1000; // minimum duration fallback

            // Apply lead time (delay visual cut to next scene)
            let startMs = baseStartMs;
            if (i > 0 && !isLast) {
                startMs = Math.max(baseStartMs, baseStartMs + leadTimeMs);
                
                // Adjust previous scene
                const prevScene = scenes[i - 1];
                prevScene.endMs = startMs;
                prevScene.durationMs = prevScene.endMs - prevScene.startMs;
                if (prevScene.prompts.length > 0) {
                    const lastP = prevScene.prompts[prevScene.prompts.length - 1];
                    lastP.endMs = startMs;
                    lastP.durationMs = lastP.endMs - lastP.startMs;
                }
                if (prevScene.images.length > 0) {
                    prevScene.images[prevScene.images.length - 1].endMs = startMs;
                }
            }

            let endMs = startMs + durationMs;

            if (isLast && audioDurationMs > 0) {
                endMs = audioDurationMs;
                durationMs = endMs - startMs;
            }

            currentMs = endMs;

            const prompts: TimelinePrompt[] = [{
                id: `${input.id}-1`,
                startMs,
                endMs,
                durationMs,
                text: input.sceneName
            }];

            const images: TimelineImage[] = [{
                id: `img_${input.id}`,
                path: '',
                startMs,
                endMs
            }];

            scenes.push({
                id: input.id,
                startMs,
                endMs,
                durationMs,
                transcript: input.sceneName,
                srtIds: [],
                prompts,
                images
            });
        }

        // Lock the chronologically last scene (by endMs) to the audio duration.
        if (scenes.length > 0 && audioDurationMs > 0) {
            const lastScene = scenes.reduce((max, s) => s.endMs > max.endMs ? s : max, scenes[0]);
            if (lastScene.endMs !== audioDurationMs) {
                lastScene.endMs = audioDurationMs;
                lastScene.durationMs = lastScene.endMs - lastScene.startMs;
                if (lastScene.prompts.length === 1) {
                    lastScene.prompts[0].endMs = audioDurationMs;
                    lastScene.prompts[0].durationMs = lastScene.prompts[0].endMs - lastScene.prompts[0].startMs;
                }
                if (lastScene.images.length === 1) {
                    lastScene.images[0].endMs = audioDurationMs;
                }
            }
        }

        const manifest: TimelineManifest = {
            projectId,
            audio: {
                path: audioPath,
                durationMs: audioDurationMs || currentMs
            },
            scenes
        };
        return quantizeTimeline(manifest);
    }
}

// Maps subtitle indices safely. Handles both absolute values and indices.
function mapSubtitleAbsoluteIndex(sub: SrtSubtitle, subMap: Map<number, SrtSubtitle>) {
    subMap.set(sub.index, sub);
}

/**
 * Post-processes the TimelineManifest, quantizing all boundaries to a 25 FPS integer frame grid.
 * Ensures zero gaps or overlaps at the frame level and locks final durations.
 */
function quantizeTimeline(manifest: TimelineManifest, fps: number = 25): TimelineManifest {
    let expectedFrame = 0;
    const scenes = manifest.scenes;

    // Pre-quantize the audio duration so it's consistent with frame boundaries
    const audioFrames = manifest.audio.durationMs > 0
        ? msToFrames(manifest.audio.durationMs, fps)
        : 0;
    if (audioFrames > 0) {
        manifest.audio.durationMs = framesToMs(audioFrames, fps);
    }

    for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const isLast = i === scenes.length - 1;

        const startFrame = expectedFrame;
        // For the last scene, always lock to the pre-quantized audio frame count
        let targetEndFrame = (isLast && audioFrames > 0)
            ? audioFrames
            : msToFrames(scene.endMs, fps);

        const endFrame = Math.max(startFrame + 1, targetEndFrame);
        expectedFrame = endFrame;

        // Assign frames to scene
        scene.startFrame = startFrame;
        scene.endFrame = endFrame;

        // Align milliseconds to exact frame boundaries to prevent drift
        scene.startMs = framesToMs(startFrame, fps);
        scene.endMs = framesToMs(endFrame, fps);
        scene.durationMs = scene.endMs - scene.startMs;

        // Quantize prompts inside the scene (if any)
        if (scene.prompts && scene.prompts.length > 0) {
            let promptStartFrame = startFrame;
            const totalPromptWeightMs = scene.prompts.reduce((sum, p) => sum + p.durationMs, 0);
            
            for (let j = 0; j < scene.prompts.length; j++) {
                const prompt = scene.prompts[j];
                const isLastPrompt = j === scene.prompts.length - 1;
                
                const pStartFrame = promptStartFrame;
                let pEndFrame: number;

                if (isLastPrompt) {
                    pEndFrame = endFrame;
                } else {
                    const weightRatio = totalPromptWeightMs > 0 ? (prompt.durationMs / totalPromptWeightMs) : (1 / scene.prompts.length);
                    const promptFrames = Math.max(1, Math.round((endFrame - startFrame) * weightRatio));
                    pEndFrame = Math.min(endFrame - (scene.prompts.length - j - 1), pStartFrame + promptFrames);
                }

                prompt.startMs = framesToMs(pStartFrame, fps);
                prompt.endMs = framesToMs(pEndFrame, fps);
                prompt.durationMs = prompt.endMs - prompt.startMs;
                promptStartFrame = pEndFrame;
            }
        }

        // Quantize images inside the scene (there is typically 1 image per scene in raw inputs)
        if (scene.images && scene.images.length > 0) {
            let imgStartFrame = startFrame;
            const sceneOriginalMs = scene.images.reduce((sum, img) => sum + (img.endMs - img.startMs), 0);

            for (let j = 0; j < scene.images.length; j++) {
                const img = scene.images[j];
                const isLastImg = j === scene.images.length - 1;
                
                const iStartFrame = imgStartFrame;
                let iEndFrame: number;

                if (isLastImg) {
                    iEndFrame = endFrame;
                } else {
                    const originalDurMs = img.endMs - img.startMs;
                    const weightRatio = sceneOriginalMs > 0 ? (originalDurMs / sceneOriginalMs) : (1 / scene.images.length);
                    const imgFrames = Math.max(1, Math.round((endFrame - startFrame) * weightRatio));
                    iEndFrame = Math.min(endFrame - (scene.images.length - j - 1), iStartFrame + imgFrames);
                }

                img.startFrame = iStartFrame;
                img.endFrame = iEndFrame;
                img.startMs = framesToMs(iStartFrame, fps);
                img.endMs = framesToMs(iEndFrame, fps);
                
                imgStartFrame = iEndFrame;
            }
        }
    }

    // audio.durationMs was already pre-quantized at the top of this function; no-op here
    // (kept for clarity — the value is already frame-aligned)

    return manifest;
}
