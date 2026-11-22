import { TimelineManifest } from './TimelineManifest';
import { msToFrames } from '../time';

export interface ValidationResult {
    isValid: boolean;
    errorType?: string;
    message?: string;
    details?: any;
}

/**
 * Validator class to verify constraints on the Timeline Manifest.
 * Prevents desynchronization by strictly validating all segment boundaries.
 */
export class TimelineValidator {
    static validate(manifest: TimelineManifest): ValidationResult {
        const { audio, scenes } = manifest;
        const audioDurationMs = audio.durationMs;

        if (scenes.length === 0) {
            return {
                isValid: false,
                errorType: 'TIMELINE_ERROR',
                message: 'Timeline Manifest contains no scenes.'
            };
        }

        // Rule 9: First scene must start at 0
        if (scenes[0].startMs !== 0) {
            return {
                isValid: false,
                errorType: 'TIMELINE_ERROR',
                message: `First scene startMs must be 0. Actual: ${scenes[0].startMs}ms`
            };
        }
        if (scenes[0].startFrame !== undefined && scenes[0].startFrame !== 0) {
            return {
                isValid: false,
                errorType: 'TIMELINE_ERROR',
                message: `First scene startFrame must be 0. Actual: ${scenes[0].startFrame}`
            };
        }

        let expectedStartMs = 0;
        let expectedStartFrame = 0;

        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];

            // Rule 1: startMs >= 0
            if (scene.startMs < 0) {
                return {
                    isValid: false,
                    errorType: 'TIMELINE_ERROR',
                    message: `Scene ${scene.id} has negative startMs: ${scene.startMs}ms`
                };
            }
            if (scene.startFrame !== undefined && scene.startFrame < 0) {
                return {
                    isValid: false,
                    errorType: 'TIMELINE_ERROR',
                    message: `Scene ${scene.id} has negative startFrame: ${scene.startFrame}`
                };
            }

            // Rule 2: endMs > startMs
            if (scene.endMs <= scene.startMs) {
                return {
                    isValid: false,
                    errorType: 'TIMELINE_ERROR',
                    message: `Scene ${scene.id} has invalid boundaries. startMs: ${scene.startMs}ms, endMs: ${scene.endMs}ms`
                };
            }
            if (scene.startFrame !== undefined && scene.endFrame !== undefined && scene.endFrame <= scene.startFrame) {
                return {
                    isValid: false,
                    errorType: 'TIMELINE_ERROR',
                    message: `Scene ${scene.id} has invalid frame boundaries. startFrame: ${scene.startFrame}, endFrame: ${scene.endFrame}`
                };
            }

            // Rule 3: durationMs === endMs - startMs
            const diff = scene.endMs - scene.startMs;
            if (scene.durationMs !== diff) {
                return {
                    isValid: false,
                    errorType: 'TIMELINE_ERROR',
                    message: `Scene ${scene.id} durationMs mismatch. Stored: ${scene.durationMs}ms, Calculated: ${diff}ms`
                };
            }

            // Rule 4: Sequential scenes must be contiguous (no gaps or overlaps)
            if (scene.startMs !== expectedStartMs) {
                const diffMs = scene.startMs - expectedStartMs;
                const type = diffMs > 0 ? 'Gap' : 'Overlap';
                return {
                    isValid: false,
                    errorType: 'TIMELINE_ERROR',
                    message: `TIMELINE_ERROR\nScene ${scene.id}\nExpected start: ${expectedStartMs}ms\nActual start:   ${scene.startMs}ms\n${type}:            ${Math.abs(diffMs)}ms`
                };
            }
            if (scene.startFrame !== undefined && scene.startFrame !== expectedStartFrame) {
                const diffFrames = scene.startFrame - expectedStartFrame;
                const type = diffFrames > 0 ? 'Gap' : 'Overlap';
                return {
                    isValid: false,
                    errorType: 'TIMELINE_ERROR',
                    message: `TIMELINE_FRAME_ERROR\nScene ${scene.id}\nExpected start frame: ${expectedStartFrame}\nActual start frame:   ${scene.startFrame}\n${type}:            ${Math.abs(diffFrames)} frames`
                };
            }

            // Rule 5 & 6: Prompts must be contiguous and cover the scene duration exactly
            if (scene.prompts && scene.prompts.length > 0) {
                let expectedPromptStartMs = scene.startMs;
                for (let j = 0; j < scene.prompts.length; j++) {
                    const prompt = scene.prompts[j];
                    if (prompt.startMs !== expectedPromptStartMs) {
                        const diffMs = prompt.startMs - expectedPromptStartMs;
                        const type = diffMs > 0 ? 'Gap' : 'Overlap';
                        return {
                            isValid: false,
                            errorType: 'TIMELINE_ERROR',
                            message: `Prompt ${prompt.id} in Scene ${scene.id} has timeline mismatch.\nExpected start: ${expectedPromptStartMs}ms\nActual start:   ${prompt.startMs}ms\n${type}:            ${Math.abs(diffMs)}ms`
                        };
                    }
                    if (prompt.endMs <= prompt.startMs) {
                        return {
                            isValid: false,
                            errorType: 'TIMELINE_ERROR',
                            message: `Prompt ${prompt.id} in Scene ${scene.id} has invalid boundaries: startMs=${prompt.startMs}ms, endMs=${prompt.endMs}ms`
                        };
                    }
                    if (prompt.durationMs !== prompt.endMs - prompt.startMs) {
                        return {
                            isValid: false,
                            errorType: 'TIMELINE_ERROR',
                            message: `Prompt ${prompt.id} in Scene ${scene.id} durationMs mismatch: Stored=${prompt.durationMs}ms, Expected=${prompt.endMs - prompt.startMs}ms`
                        };
                    }
                    expectedPromptStartMs = prompt.endMs;
                }
                if (expectedPromptStartMs !== scene.endMs) {
                    return {
                        isValid: false,
                        errorType: 'TIMELINE_ERROR',
                        message: `Prompts in Scene ${scene.id} do not cover the full scene duration. Expected end: ${scene.endMs}ms, Actual: ${expectedPromptStartMs}ms`
                    };
                }
            }

            // Rule 7 & 8: Images must be contiguous and cover the scene duration exactly
            if (scene.images && scene.images.length > 0) {
                let expectedImageStartMs = scene.startMs;
                let expectedImageStartFrame = scene.startFrame;
                for (let j = 0; j < scene.images.length; j++) {
                    const img = scene.images[j];
                    if (img.startMs !== expectedImageStartMs) {
                        const diffMs = img.startMs - expectedImageStartMs;
                        const type = diffMs > 0 ? 'Gap' : 'Overlap';
                        return {
                            isValid: false,
                            errorType: 'TIMELINE_ERROR',
                            message: `Image ${img.id} in Scene ${scene.id} has timeline mismatch.\nExpected start: ${expectedImageStartMs}ms\nActual start:   ${img.startMs}ms\n${type}:            ${Math.abs(diffMs)}ms`
                        };
                    }
                    if (img.startFrame !== undefined && expectedImageStartFrame !== undefined && img.startFrame !== expectedImageStartFrame) {
                        const diffFrames = img.startFrame - expectedImageStartFrame;
                        const type = diffFrames > 0 ? 'Gap' : 'Overlap';
                        return {
                            isValid: false,
                            errorType: 'TIMELINE_ERROR',
                            message: `Image ${img.id} in Scene ${scene.id} has frame timeline mismatch.\nExpected start frame: ${expectedImageStartFrame}\nActual start frame:   ${img.startFrame}\n${type}:            ${Math.abs(diffFrames)} frames`
                        };
                    }
                    if (img.endMs <= img.startMs) {
                        return {
                            isValid: false,
                            errorType: 'TIMELINE_ERROR',
                            message: `Image ${img.id} in Scene ${scene.id} has invalid boundaries: startMs=${img.startMs}ms, endMs=${img.endMs}ms`
                        };
                    }
                    if (img.startFrame !== undefined && img.endFrame !== undefined && img.endFrame <= img.startFrame) {
                        return {
                            isValid: false,
                            errorType: 'TIMELINE_ERROR',
                            message: `Image ${img.id} in Scene ${scene.id} has invalid frame boundaries: startFrame=${img.startFrame}, endFrame=${img.endFrame}`
                        };
                    }
                    expectedImageStartMs = img.endMs;
                    if (img.endFrame !== undefined) {
                        expectedImageStartFrame = img.endFrame;
                    }
                }
                if (expectedImageStartMs !== scene.endMs) {
                    return {
                        isValid: false,
                        errorType: 'TIMELINE_ERROR',
                        message: `Images in Scene ${scene.id} do not cover the full scene duration. Expected end: ${scene.endMs}ms, Actual: ${expectedImageStartMs}ms`
                    };
                }
                if (expectedImageStartFrame !== undefined && scene.endFrame !== undefined && expectedImageStartFrame !== scene.endFrame) {
                    return {
                        isValid: false,
                        errorType: 'TIMELINE_ERROR',
                        message: `Images in Scene ${scene.id} do not cover the full scene frame duration. Expected end frame: ${scene.endFrame}, Actual: ${expectedImageStartFrame}`
                    };
                }
            }

            expectedStartMs = scene.endMs;
            if (scene.endFrame !== undefined) {
                expectedStartFrame = scene.endFrame;
            }
        }

        // Rule 10, 11 & 12: Last scene end must approximately match the audio duration
        // Allow ±1000ms tolerance to account for accumulated frame quantization rounding drift
        // across many scenes (each scene can drift up to 1 frame = 40ms @ 25fps)
        const finalScene = scenes[scenes.length - 1];
        const AUDIO_TOLERANCE_MS = 1000;
        if (audioDurationMs > 0 && Math.abs(finalScene.endMs - audioDurationMs) > AUDIO_TOLERANCE_MS) {
            const diffMs = finalScene.endMs - audioDurationMs;
            const message = diffMs > 0
                ? `Timeline exceeds audio duration. Timeline end: ${finalScene.endMs}ms, Audio: ${audioDurationMs}ms (Excess: ${diffMs}ms)`
                : `Timeline is shorter than audio duration. Timeline end: ${finalScene.endMs}ms, Audio: ${audioDurationMs}ms (Gap: ${Math.abs(diffMs)}ms)`;
            return {
                isValid: false,
                errorType: 'TIMELINE_ERROR',
                message
            };
        }
        if (audioDurationMs > 0 && finalScene.endFrame !== undefined) {
            const expectedTotalFrames = msToFrames(audioDurationMs, 25);
            const FRAME_TOLERANCE = Math.ceil(AUDIO_TOLERANCE_MS / (1000 / 25)); // ~13 frames for 500ms@25fps
            if (Math.abs(finalScene.endFrame - expectedTotalFrames) > FRAME_TOLERANCE) {
                const diffFrames = finalScene.endFrame - expectedTotalFrames;
                const message = diffFrames > 0
                    ? `Timeline exceeds audio frames. Timeline end: ${finalScene.endFrame} frames, Audio: ${expectedTotalFrames} frames (Excess: ${diffFrames} frames)`
                    : `Timeline is shorter than audio frames. Timeline end: ${finalScene.endFrame} frames, Audio: ${expectedTotalFrames} frames (Gap: ${Math.abs(diffFrames)} frames)`;
                return {
                    isValid: false,
                    errorType: 'TIMELINE_ERROR',
                    message
                };
            }
        }

        return { isValid: true };
    }
}
