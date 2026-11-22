export interface TranscriptResponse {
    transcript: string;
    success: boolean;
    error?: string;
}

export interface DurationEntry {
    sceneNumber: number;
    shotId?: string;
    sceneName: string;
    duration: string;
    durationSeconds: number;
    timeRange: string;
    parentSceneNumber?: number;
    imageNumber?: number;
    imagePrompt?: string;
    isAddedBySync?: boolean;
    startMs?: number;
    endMs?: number;
    durationMs?: number;
}

export interface DurationResponse {
    durations: DurationEntry[];
    success: boolean;
    error?: string;
}

export interface SubPrompt {
    imageNumber: number;
    timeRange: string;
    prompt: string;
}

export interface PromptEntry {
    sceneNumber: number;
    prompts: SubPrompt[];
}

export interface PromptResponse {
    prompts: PromptEntry[];
    success: boolean;
    error?: string;
}

export interface AppState {
    content: string;
    transcript: string | null;
    durations: DurationEntry[] | null;
    prompts: PromptEntry[] | null;
    loading: {
        transcript: boolean;
        duration: boolean;
        prompt: boolean;
    };
    error: string | null;
}

export interface FavoriteVoice {
    id: string;
    name: string;
    provider: 'capcut' | 'minimax' | 'elevenlabs';
    voiceId: string;
    modelId: string;
}