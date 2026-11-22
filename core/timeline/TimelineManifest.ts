export interface TimelineImage {
    id: string;      // e.g. "img_1" or "img_1_2"
    path: string;    // image file path or URL
    startMs: number;
    endMs: number;
    startFrame?: number;
    endFrame?: number;
}

export interface TimelinePrompt {
    id: string;      // e.g. "1-1", "1-2"
    startMs: number;
    endMs: number;
    durationMs: number;
    text: string;
}

export interface TimelineScene {
    id: number;
    startMs: number;
    endMs: number;
    durationMs: number;
    startFrame?: number;
    endFrame?: number;
    transcript: string;
    srtIds: number[];
    prompts: TimelinePrompt[];
    images: TimelineImage[];
}

export interface SilenceGap {
    afterSceneId: number;
    beforeSceneId: number;
    gapMs: number;
    /** The scene whose endMs was extended to absorb this gap */
    absorbedBySceneId: number;
}

export interface SilenceAnalysis {
    totalGapMs: number;
    gapCount: number;
    averageGapMs: number;
    maxGapMs: number;
    maxGapLocation: string;
    gaps: SilenceGap[];
}

export interface TimelineManifest {
    projectId: string;
    audio: {
        path: string;
        durationMs: number;
    };
    scenes: TimelineScene[];
    silenceAnalysis?: SilenceAnalysis;
}
