import { useState, useEffect } from 'react';
import type { DurationEntry, PromptEntry, FavoriteVoice } from '@/types';
import type { StoryboardCue } from '@/core/storyboard/Storyboard';
import type { MotionOverride } from '@/core/motion/MotionDirector';
import { logService } from '@/lib/logger';
import { downloadFile } from '@/lib/utils';
import { LocalPromptClient } from '@/services/localPromptClient';
import type { VideoShot, VideoShotClip } from '@/core/video/VideoShots';
import { formatTimeRange } from '@/core/time';

const parseTimeStrToSeconds = (tStr: string): number => {
    const cleanStr = tStr.trim().replace(',', '.');
    const parts = cleanStr.split(":").map(Number);
    if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return parseFloat(cleanStr) || 0;
};

export function useScriptVisionState() {
    // Left Column tabs state
    const [content, setContent] = useState("");
    const [transcript, setTranscript] = useState<string | null>(null);
    const [durations, setDurations] = useState<DurationEntry[]>([]);
    const [prompts, setPrompts] = useState<PromptEntry[] | null>(null);
    const [loading, setLoading] = useState({
        transcript: false,
        duration: false,
        prompt: false,
    });
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState("content");
    const provider = 'local' as string;
    const [longForm, setLongForm] = useState(false);
    const [promptStyle, setPromptStyle] = useState("");
    const [promptLanguage, setPromptLanguage] = useState<'en' | 'vi' | 'ja' | 'ko' | 'zh' | 'fr' | 'auto'>('ja');
    const [sendTranscript, setSendTranscript] = useState<boolean>(false);
    const [rewriteWithAi, setRewriteWithAi] = useState(false);
    const [keepOrExpandDuration, setKeepOrExpandDuration] = useState(false);
    const [status, setStatus] = useState("");
    const [progress, setProgress] = useState(0);
    const [srtContent, setSrtContent] = useState("");
    const [ttsVoice, setTtsVoice] = useState("ja-JP-NanamiNeural");
    const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
    const [ttsLoading, setTtsLoading] = useState(false);
    const [ttsProgress, setTtsProgress] = useState(0);
    const [ttsStatus, setTtsStatus] = useState("");
    const [ttsError, setTtsError] = useState<string | null>(null);
    const [language, setLanguage] = useState<'vi' | 'en' | 'ja' | 'fr' | 'zh' | 'ko'>('ja');
    const [localPromptClient] = useState(() => new LocalPromptClient());
    const localPromptContext = (sourceTranscript = transcript, sourceDurations = durations) => JSON.stringify({
        transcript: sourceTranscript, durations: sourceDurations, provider, language, promptStyle,
        promptLanguage, sendTranscript, srtContent,
    });
    localPromptClient.observe(localPromptContext());
    useEffect(() => () => localPromptClient.dispose(), [localPromptClient]);

    // Genmax / MiniMax TTS states
    const [ttsEngine, setTtsEngine] = useState<'edge' | 'genmax' | 'beeknoee'>('genmax');
    const [genmaxApiKey, setGenmaxApiKey] = useState("");
    const [genmaxProvider, setGenmaxProvider] = useState<'capcut' | 'minimax' | 'elevenlabs'>('minimax');
    const [genmaxVoiceId, setGenmaxVoiceId] = useState("Japanese_DominantMan");
    const [genmaxModelId, setGenmaxModelId] = useState("speech-2.8-turbo");

    // Beeknoee TTS states
    const [beeknoeeApiKey, setBeeknoeeApiKey] = useState("");
    const [beeknoeeModel, setBeeknoeeModel] = useState("openai/gpt-4o-mini-tts");
    const [beeknoeeVoice, setBeeknoeeVoice] = useState("alloy");
    const [favoriteVoices, setFavoriteVoices] = useState<FavoriteVoice[]>([]);
    const [newFavName, setNewFavName] = useState("");

    // Composer states
    const [generatedSrtUrl, setGeneratedSrtUrl] = useState<string | null>(null);
    const [sceneFiles, setSceneFiles] = useState<Record<number, File>>({});
    const [shotClipOffsets, setShotClipOffsets] = useState<Record<number, VideoShotClip>>({});
    const [storyboardCues, setStoryboardCues] = useState<StoryboardCue[]>([]);
    const [motionDirectorEnabled, setMotionDirectorEnabled] = useState(false);
    const [motionPlans, setMotionPlans] = useState<MotionOverride[]>([]);
    const [motionLayers, setMotionLayers] = useState<Record<number, File>>({});
    const [composeLoading, setComposeLoading] = useState(false);
    const [composedVideoUrl, setComposedVideoUrl] = useState<string | null>(null);
    const [localAudioFile, setLocalAudioFile] = useState<File | null>(null);
    const [localSrtFile, setLocalSrtFile] = useState<File | null>(null);
    const [finalPromptText, setFinalPromptText] = useState("");
    const [finalPrompts, setFinalPrompts] = useState<DurationEntry[]>([]);
    const [burnSubtitles, setBurnSubtitles] = useState(true);
    const [composeProgress, setComposeProgress] = useState(0);
    const [composeStatus, setComposeStatus] = useState("");
    const [audioLeadTime, setAudioLeadTime] = useState<number>(0.4); // J-cut: audio dẫn trước visual

    // Advanced Composer options
    const [useAdvancedRender, setUseAdvancedRender] = useState<boolean>(false);
    const [transitionType, setTransitionType] = useState<string>('fade');
    const [transitionDuration, setTransitionDuration] = useState<number>(0.5);
    const [colorPreset, setColorPreset] = useState<string>('none');
    const [showSceneTitle, setShowSceneTitle] = useState<boolean>(false);
    const [bgmFile, setBgmFile] = useState<File | null>(null);
    const [bgmVolume, setBgmVolume] = useState<number>(0.10);
    const [showIntro, setShowIntro] = useState<boolean>(false);
    const [introTitle, setIntroTitle] = useState<string>("");
    const [introSubtitle, setIntroSubtitle] = useState<string>("");
    const [showOutro, setShowOutro] = useState<boolean>(false);
    const [outroText, setOutroText] = useState<string>("");
    const [vignette, setVignette] = useState<boolean>(false);
    const [filmGrain, setFilmGrain] = useState<boolean>(false);
    const [subtitleStyle, setSubtitleStyle] = useState<string>('default');
    const [showProgressBar, setShowProgressBar] = useState<boolean>(true);

    // Storage & Image Generation states
    const [masterStorageFolder, setMasterStorageFolder] = useState("outputs");
    const [projectName, setProjectName] = useState("");
    const [isFolderPicking, setIsFolderPicking] = useState(false);
    const [autoSaveStatus, setAutoSaveStatus] = useState<string | null>(null);

    // YouTube SEO & Thumbnail states
    const [seoLanguage, setSeoLanguage] = useState<'vi' | 'en' | 'ja' | 'fr' | 'zh' | 'ko'>('ja');
    const [seoData, setSeoData] = useState<{ titles: string[]; description: string; tags: string[]; thumbnailPrompt: string } | null>(null);
    const [seoLoading, setSeoLoading] = useState(false);
    const [thumbnailPrompt, setThumbnailPrompt] = useState("");

    // Sync SEO language with application language
    useEffect(() => {
        setSeoLanguage(language);
        // Sync prompt language to follow main language automatically
        setPromptLanguage(language);
    }, [language]);

    // Initial localStorage sync
    useEffect(() => {
        try {
            const saved = localStorage.getItem("sv_favorite_voices");
            if (saved) setFavoriteVoices(JSON.parse(saved));
            const savedFolder = localStorage.getItem("sv_master_storage_folder") || localStorage.getItem("sv_image_gen_folder");
            if (savedFolder) setMasterStorageFolder(savedFolder);

            // Load Beeknoee parameters
            const savedBeeknoeeApiKey = localStorage.getItem("sv_beeknoee_api_key");
            if (savedBeeknoeeApiKey) setBeeknoeeApiKey(savedBeeknoeeApiKey);
            const savedBeeknoeeModel = localStorage.getItem("sv_beeknoee_model");
            if (savedBeeknoeeModel) setBeeknoeeModel(savedBeeknoeeModel);
            const savedBeeknoeeVoice = localStorage.getItem("sv_beeknoee_voice");
            if (savedBeeknoeeVoice) setBeeknoeeVoice(savedBeeknoeeVoice);
        } catch (e) {
            console.error("Failed to load settings from localStorage:", e);
        }
    }, []);

    // Sync default voice on language change
    useEffect(() => {
        const voiceMap: Record<string, string> = {
            vi: "vi-VN-HoaiMyNeural",
            en: "en-US-AriaNeural",
            ja: "ja-JP-NanamiNeural",
            fr: "fr-FR-DeniseNeural",
            zh: "zh-CN-XiaoxiaoNeural",
            ko: "ko-KR-SunHiNeural"
        };
        if (voiceMap[language]) {
            setTtsVoice(voiceMap[language]);
            logService.addLog(`[System] Đã đổi ngôn ngữ chính và giọng đọc mặc định sang: ${voiceMap[language]}`);
        }
    }, [language]);

    // Tự động đồng bộ hóa lại finalPrompts khi danh sách durations thay đổi
    useEffect(() => {
        if (durations && durations.length > 0 && finalPrompts && finalPrompts.length > 0) {
            const aligned = recalculateSceneTimes(finalPrompts);
            const totalDurAligned = aligned.reduce((sum, d) => sum + (d.durationSeconds || 0), 0);
            const totalDurCurrent = finalPrompts.reduce((sum, d) => sum + (d.durationSeconds || 0), 0);
            if (totalDurAligned !== totalDurCurrent || aligned.length !== finalPrompts.length) {
                setFinalPrompts(aligned);
                logService.addLog("[System] Tự động cập nhật thời lượng ảnh chi tiết theo phân cảnh gốc mới.");
            }
        }
    }, [durations]);

    // Helpers
    const getTimestampString = (): string => {
        const d = new Date();
        return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
    };

    const saveMasterStorageFolder = (folder: string) => {
        setMasterStorageFolder(folder);
        try {
            localStorage.setItem("sv_master_storage_folder", folder);
        } catch (e) {}
    };





    const saveBeeknoeeApiKey = (key: string) => {
        setBeeknoeeApiKey(key);
        try {
            localStorage.setItem("sv_beeknoee_api_key", key);
        } catch (e) {}
    };

    const saveBeeknoeeModel = (modelName: string) => {
        setBeeknoeeModel(modelName);
        try {
            localStorage.setItem("sv_beeknoee_model", modelName);
        } catch (e) {}
    };

    const saveBeeknoeeVoice = (voiceName: string) => {
        setBeeknoeeVoice(voiceName);
        try {
            localStorage.setItem("sv_beeknoee_voice", voiceName);
        } catch (e) {}
    };

    const addFavoriteVoice = () => {
        const name = newFavName.trim() || `Giọng ${genmaxProvider} (${genmaxVoiceId.substring(0, 10)})`;
        const newVoice: FavoriteVoice = {
            id: `fav_${Date.now()}`,
            name,
            provider: genmaxProvider,
            voiceId: genmaxVoiceId,
            modelId: genmaxModelId
        };
        const updated = [...favoriteVoices, newVoice];
        setFavoriteVoices(updated);
        localStorage.setItem("sv_favorite_voices", JSON.stringify(updated));
        setNewFavName("");
        logService.addLog(`[System] Đã lưu giọng đọc "${name}" vào danh sách yêu thích.`);
    };

    const deleteFavoriteVoice = (id: string) => {
        const updated = favoriteVoices.filter(v => v.id !== id);
        setFavoriteVoices(updated);
        localStorage.setItem("sv_favorite_voices", JSON.stringify(updated));
        logService.addLog(`[System] Đã xóa giọng đọc khỏi danh sách yêu thích.`);
    };

    // Text File Downloads
    const downloadTranscript = () => {
        if (!transcript) return;
        downloadFile(transcript, `transcript_${getTimestampString()}.txt`);
        logService.addLog("[System] Đã tải xuống file kịch bản.");
    };

    const downloadSrt = () => {
        if (!srtContent) return;
        downloadFile(srtContent, `subtitles_${getTimestampString()}.srt`);
        logService.addLog("[System] Đã tải xuống file phụ đề .srt.");
    };

    const downloadDurations = () => {
        if (durations.length === 0) return;
        const text = durations.map(d => `Scene ${d.sceneNumber}\n\n${d.sceneName}\n\n${d.duration}\n\n${d.timeRange}`).join("\n\n");
        downloadFile(text, `durations_${getTimestampString()}.txt`);
        logService.addLog("[System] Đã tải xuống file phân cảnh.");
    };

    const downloadPrompts = () => {
        if (!prompts) return;
        const lines: string[] = [];
        prompts.forEach((p) => {
            if (Array.isArray(p.prompts)) {
                p.prompts.forEach((sp) => {
                    const timeStr = sp.timeRange ? ` (${sp.timeRange})` : '';
                    lines.push(`Scene ${p.sceneNumber}:Image ${sp.imageNumber}${timeStr}: ${sp.prompt}`);
                });
            }
        });
        downloadFile(lines.join('\n\n'), `prompts_${getTimestampString()}.txt`);
        logService.addLog("[System] Đã tải xuống file prompts.");
    };

    // File Parsers
    const parseDurationFile = (text: string): DurationEntry[] => {
        const parseTimeStrToSeconds = (tStr: string): number => {
            const cleanStr = tStr.trim().replace(',', '.');
            const parts = cleanStr.split(":").map(Number);
            if (parts.length === 2) {
                return parts[0] * 60 + parts[1];
            } else if (parts.length === 3) {
                return parts[0] * 3600 + parts[1] * 60 + parts[2];
            }
            return parseFloat(cleanStr) || 0;
        };

        let list: DurationEntry[] = [];
        const cleanText = text.trim();
        const blocks = cleanText.split(/Scene\s+(\d+)/i);
        for (let i = 1; i < blocks.length; i += 2) {
            const sceneNum = parseInt(blocks[i]);
            const rest = blocks[i + 1] || "";
            let parts = rest.trim().split(/\r?\n\r?\n/);
            if (parts.length < 2) {
                parts = rest.trim().split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
            }
            if (parts.length >= 1) {
                const sceneName = parts[0].trim();
                const durationStr = parts[1] ? parts[1].trim() : "5 giây";
                const timeRange = parts[2] ? parts[2].trim() : "";
                
                let durationSeconds = 0;
                if (timeRange.includes("-")) {
                    const rangeParts = timeRange.split("-").map(t => t.trim());
                    const start = parseTimeStrToSeconds(rangeParts[0]);
                    const end = parseTimeStrToSeconds(rangeParts[1]);
                    if (end > start) {
                        durationSeconds = parseFloat((end - start).toFixed(3));
                    }
                }
                
                if (durationSeconds <= 0) {
                    durationSeconds = parseFloat(durationStr) || 5;
                }

                list.push({
                    sceneNumber: sceneNum,
                    sceneName,
                    duration: `${durationSeconds} giây`,
                    durationSeconds,
                    timeRange
                });
            }
        }
        return list;
    };

    const parseFinalPrompt = (text: string): DurationEntry[] => {
        let list: DurationEntry[] = [];
        const cleanText = text.trim();
        if (cleanText.includes("Prompt Scene") || /Image\s+\d+/i.test(cleanText)) {
            const lines = cleanText.split("\n");
            let currentSceneNum = 1;
            let imageCounter = 1;

            for (let line of lines) {
                line = line.trim();
                if (!line) continue;

                const normalizedLine = line.replace(/[\u2013\u2014~]/g, "-").trim();
                const patternAMatch = normalizedLine.match(/^(?:[-*+\d\.\s]+)?Scene\s+(\d+)\s*[:,-]?\s*Image\s+(\d+)\s*\(([^)]+)\)\s*[:,-]?\s*(.*)$/i);
                if (patternAMatch) {
                    const sceneNum = parseInt(patternAMatch[1]);
                    const imageNum = parseInt(patternAMatch[2]);
                    const timeRangeStr = patternAMatch[3].trim();
                    const description = patternAMatch[4].trim();

                    let durationSeconds = 5;
                    if (timeRangeStr.includes("-")) {
                        const times = timeRangeStr.split("-").map(t => t.trim());
                        const parseTimeStr = (tStr: string): number => {
                            const cleanStr = tStr.trim().replace(',', '.');
                            const parts = cleanStr.split(":").map(Number);
                            if (parts.length === 2) {
                                return parts[0] * 60 + parts[1];
                            } else if (parts.length === 3) {
                                return parts[0] * 3600 + parts[1] * 60 + parts[2];
                            }
                            return parseFloat(cleanStr) || 0;
                        };
                        const start = parseTimeStr(times[0]);
                        const end = parseTimeStr(times[1]);
                        if (end > start) {
                            durationSeconds = parseFloat((end - start).toFixed(3));
                        }
                    } else {
                        durationSeconds = parseFloat(timeRangeStr) || 5;
                    }

                    list.push({
                        sceneNumber: imageCounter++,
                        sceneName: `Cảnh ${sceneNum} - Ảnh ${imageNum}: ${description}`,
                        duration: `${durationSeconds}s`,
                        durationSeconds,
                        timeRange: timeRangeStr,
                        parentSceneNumber: sceneNum,
                        imageNumber: imageNum,
                        imagePrompt: description
                    });
                    continue;
                }

                const sceneMatch = normalizedLine.match(/Prompt\s+Scene\s+(\d+)/i);
                if (sceneMatch) {
                    currentSceneNum = parseInt(sceneMatch[1]);
                    continue;
                }

                const patternBMatch = normalizedLine.match(/^(?:[-*+\d\.\s]+)?Image\s+(\d+)\s*\(([^)]+)\)\s*[:,-]?\s*(.*)$/i);
                if (patternBMatch) {
                    const imageNum = parseInt(patternBMatch[1]);
                    const timeRangeStr = patternBMatch[2].trim();
                    const description = patternBMatch[3].trim();

                    let durationSeconds = 5;
                    if (timeRangeStr.includes("-")) {
                        const times = timeRangeStr.split("-").map(t => t.trim());
                        const parseTimeStr = (tStr: string): number => {
                            const cleanStr = tStr.trim().replace(',', '.');
                            const parts = cleanStr.split(":").map(Number);
                            if (parts.length === 2) {
                                return parts[0] * 60 + parts[1];
                            } else if (parts.length === 3) {
                                return parts[0] * 3600 + parts[1] * 60 + parts[2];
                            }
                            return parseFloat(cleanStr) || 0;
                        };
                        const start = parseTimeStr(times[0]);
                        const end = parseTimeStr(times[1]);
                        if (end > start) {
                            durationSeconds = parseFloat((end - start).toFixed(3));
                        }
                    } else {
                        durationSeconds = parseFloat(timeRangeStr) || 5;
                    }

                    list.push({
                        sceneNumber: imageCounter++,
                        sceneName: `Cảnh ${currentSceneNum} - Ảnh ${imageNum}: ${description}`,
                        duration: `${durationSeconds}s`,
                        durationSeconds,
                        timeRange: timeRangeStr,
                        parentSceneNumber: currentSceneNum,
                        imageNumber: imageNum,
                        imagePrompt: description
                    });
                }
            }
        } else {
            const blocks = cleanText.split(/Scene\s+(\d+)/i);
            for (let i = 1; i < blocks.length; i += 2) {
                const sceneNum = parseInt(blocks[i]);
                const rest = blocks[i + 1] || "";
                const parts = rest.trim().split(/\r?\n\r?\n/);
                if (parts.length >= 1) {
                    const sceneName = parts[0].trim();
                    const durationStr = parts[1] ? parts[1].trim() : "5s";
                    const durationSeconds = parseFloat(durationStr) || 5;
                    const timeRange = parts[2] ? parts[2].trim() : "";
                    list.push({
                        sceneNumber: sceneNum,
                        sceneName,
                        duration: durationStr,
                        durationSeconds,
                        timeRange,
                        imagePrompt: sceneName
                    });
                }
            }
        }
        return list;
    };

    const recalculateSceneTimes = (list: DurationEntry[]): DurationEntry[] => {
        const parseTimeStrToMs = (tStr: string, parentStartMs?: number, parentEndMs?: number): number => {
            const cleanStr = tStr.trim().replace(',', '.');
            const parts = cleanStr.split(":");
            let hours = 0, minutes = 0, secondsStr = '0';
            if (parts.length === 3) {
                hours = Number(parts[0]) || 0;
                minutes = Number(parts[1]) || 0;
                secondsStr = parts[2] || '0';
            } else if (parts.length === 2) {
                minutes = Number(parts[0]) || 0;
                secondsStr = parts[1] || '0';
            } else {
                secondsStr = parts[0] || '0';
            }
            const secParts = secondsStr.split('.');
            const seconds = Number(secParts[0]) || 0;
            const ms = Number((secParts[1] || '0').padEnd(3, '0').substring(0, 3)) || 0;
            const parsedMs = hours * 3600000 + minutes * 60000 + seconds * 1000 + ms;

            if (parentStartMs !== undefined && parentEndMs !== undefined) {
                if (parsedMs >= parentStartMs - 5000 && parsedMs <= parentEndMs + 5000) {
                    return parsedMs;
                }
                const parentStartMin = Math.floor(parentStartMs / 60000);
                const parentStartHour = Math.floor(parentStartMs / 3600000);
                
                const altMsA = parentStartHour * 3600000 + parentStartMin * 60000 + seconds * 1000 + ms;
                if (altMsA >= parentStartMs - 5000 && altMsA <= parentEndMs + 5000) {
                    return altMsA;
                }
                const altMsB = parentStartHour * 3600000 + (parentStartMin + 1) * 60000 + seconds * 1000 + ms;
                if (altMsB >= parentStartMs - 5000 && altMsB <= parentEndMs + 5000) {
                    return altMsB;
                }
                if (parts.length === 2) {
                    const altMsC = parentStartHour * 3600000 + parentStartMin * 60000 + minutes * 1000 + ms;
                    if (altMsC >= parentStartMs - 5000 && altMsC <= parentEndMs + 5000) {
                        return altMsC;
                    }
                    const altMsD = parentStartHour * 3600000 + (parentStartMin + 1) * 60000 + minutes * 1000 + ms;
                    if (altMsD >= parentStartMs - 5000 && altMsD <= parentEndMs + 5000) {
                        return altMsD;
                    }
                }
            }
            return parsedMs;
        };

        const formatTime = (secs: number) => {
            const h = Math.floor(secs / 3600);
            const m = Math.floor((secs % 3600) / 60);
            const s = Math.floor(secs % 60);
            const ms = Math.round((secs % 1) * 1000);
            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
        };

        const isFinalPrompt = list.length > 0 && list.some(item => item.parentSceneNumber !== undefined);

        if (isFinalPrompt) {
            if (!durations || durations.length === 0) {
                let currentMs = 0;
                return list.map((item) => {
                    const durMs = typeof item.durationMs === 'number' ? item.durationMs : Math.round((item.durationSeconds || 5) * 1000);
                    const startMs = currentMs;
                    const endMs = currentMs + durMs;
                    currentMs = endMs;
                    
                    const startSec = startMs / 1000;
                    const endSec = endMs / 1000;
                    return {
                        ...item,
                        durationMs: durMs,
                        durationSeconds: parseFloat((durMs / 1000).toFixed(3)),
                        startMs,
                        endMs,
                        timeRange: `${formatTime(startSec)}-${formatTime(endSec)}`
                    };
                });
            }

            const newFinalPrompts: DurationEntry[] = [];
            let imageCounter = 1;

            for (const scene of durations) {
                const subPrompts = list.filter(item => item.parentSceneNumber === scene.sceneNumber);
                if (subPrompts.length === 0) {
                    const sceneStartMs = typeof scene.startMs === 'number' ? scene.startMs : (scene.timeRange && scene.timeRange.includes('-') ? parseTimeStrToMs(scene.timeRange.split('-')[0]) : (scene.sceneNumber - 1) * 5000);
                    const durationMs = typeof scene.durationMs === 'number' ? scene.durationMs : Math.round((scene.durationSeconds || 5) * 1000);
                    const endMs = sceneStartMs + durationMs;

                    newFinalPrompts.push({
                        sceneNumber: imageCounter++,
                        sceneName: `Cảnh ${scene.sceneNumber} - Ảnh 1: ${scene.sceneName.slice(0, 80)}`,
                        duration: `${(durationMs / 1000).toFixed(1)}s`,
                        durationSeconds: parseFloat((durationMs / 1000).toFixed(3)),
                        durationMs,
                        startMs: sceneStartMs,
                        endMs,
                        timeRange: `${formatTime(sceneStartMs / 1000)}-${formatTime(endMs / 1000)}`,
                        parentSceneNumber: scene.sceneNumber,
                        imageNumber: 1,
                        imagePrompt: scene.sceneName
                    });
                    continue;
                }

                const parentStartMs = typeof scene.startMs === 'number' ? scene.startMs : (scene.timeRange && scene.timeRange.includes('-') ? parseTimeStrToMs(scene.timeRange.split('-')[0]) : (scene.sceneNumber - 1) * 5000);
                const parentDurationMs = typeof scene.durationMs === 'number' ? scene.durationMs : Math.round((scene.durationSeconds || 5) * 1000);
                const parentEndMs = parentStartMs + parentDurationMs;

                const subPromptsWithWeights = subPrompts.map(item => {
                    let weightMs = typeof item.durationMs === 'number' ? item.durationMs : Math.round((item.durationSeconds || 5) * 1000);
                    if (item.timeRange && item.timeRange.includes('-')) {
                        const times = item.timeRange.split('-').map(t => t.trim());
                        const start = parseTimeStrToMs(times[0], parentStartMs, parentEndMs);
                        const end = parseTimeStrToMs(times[1], parentStartMs, parentEndMs);
                        if (end > start) weightMs = end - start;
                    }
                    return { item, weightMs };
                });

                const totalWeightMs = subPromptsWithWeights.reduce((sum, entry) => sum + entry.weightMs, 0);

                let currentStartMs = parentStartMs;
                subPromptsWithWeights.forEach((entry, idx) => {
                    const isLast = idx === subPromptsWithWeights.length - 1;
                    let itemDurationMs = 5000;

                    if (totalWeightMs > 0) {
                        itemDurationMs = Math.round(parentDurationMs * (entry.weightMs / totalWeightMs));
                    } else {
                        itemDurationMs = Math.round(parentDurationMs / subPromptsWithWeights.length);
                    }

                    let itemEndMs;
                    if (isLast) {
                        itemEndMs = parentEndMs;
                        itemDurationMs = itemEndMs - currentStartMs;
                    } else {
                        itemEndMs = currentStartMs + itemDurationMs;
                    }

                    const startSec = currentStartMs / 1000;
                    const endSec = itemEndMs / 1000;

                    newFinalPrompts.push({
                        ...entry.item,
                        sceneNumber: imageCounter++,
                        duration: `${(itemDurationMs / 1000).toFixed(1)}s`,
                        durationSeconds: parseFloat((itemDurationMs / 1000).toFixed(3)),
                        durationMs: itemDurationMs,
                        startMs: currentStartMs,
                        endMs: itemEndMs,
                        timeRange: `${formatTime(startSec)}-${formatTime(endSec)}`
                    });

                    currentStartMs = itemEndMs;
                });
            }

            return newFinalPrompts;
        } else {
            let currentMs = 0;
            return list.map((item) => {
                const durMs = typeof item.durationMs === 'number' ? item.durationMs : Math.round((item.durationSeconds || 5) * 1000);
                const startMs = currentMs;
                const endMs = currentMs + durMs;
                currentMs = endMs;
                
                const startSec = startMs / 1000;
                const endSec = endMs / 1000;
                return {
                    ...item,
                    durationMs: durMs,
                    durationSeconds: parseFloat((durMs / 1000).toFixed(3)),
                    startMs,
                    endMs,
                    timeRange: `${formatTime(startSec)}-${formatTime(endSec)}`
                };
            });
        }
    };

    // Actions
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const text = event.target?.result as string;
                setContent(text);
                logService.addLog(`Đã tải lên tệp văn bản nguồn: ${file.name}`);
            };
            reader.readAsText(file);
        }
    };

    const handleSrtUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const text = event.target?.result as string;
                setSrtContent(text);
                logService.addLog("Đã tải lên file SRT thành công.");
            };
            reader.readAsText(file);
        }
    };

    const handleImportDurations = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const text = event.target?.result as string;
                const list = parseDurationFile(text);

                if (list.length > 0) {
                    setDurations(list);
                    logService.addLog(`[Composer] Đã nạp thành công ${list.length} phân cảnh thời lượng (Durations) từ file.`);
                } else {
                    const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
                    const fallbackList = lines.map((line, idx) => ({
                        sceneNumber: idx + 1,
                        sceneName: line,
                        duration: "5s",
                        durationSeconds: 5,
                        timeRange: ""
                    }));
                    setDurations(recalculateSceneTimes(fallbackList));
                    logService.addLog(`[Composer] Đã nạp ${fallbackList.length} phân cảnh dòng-bởi-dòng từ file.`);
                }
            } catch (err) {
                logService.addLog(`[Composer] Lỗi đọc file phân cảnh (Durations): ${err instanceof Error ? err.message : String(err)}`);
            }
        };
        reader.readAsText(file);
    };

    const handleImportFinalPrompt = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const text = event.target?.result as string;
                const list = parseFinalPrompt(text);

                if (list.length > 0) {
                    setFinalPrompts(recalculateSceneTimes(list));
                    logService.addLog(`[Composer] Đã nạp thành công ${list.length} phân cảnh ảnh chi tiết từ file Final Prompt.`);
                } else {
                    logService.addLog("[Composer] Không tìm thấy dữ liệu phân cảnh ảnh hợp lệ trong file Final Prompt.");
                }
            } catch (err) {
                logService.addLog(`[Composer] Lỗi đọc file Final Prompt: ${err instanceof Error ? err.message : String(err)}`);
            }
        };
        reader.readAsText(file);
    };

    const handleApplyFinalPromptText = () => {
        if (!finalPromptText.trim()) {
            logService.addLog("[Composer] Vui lòng nhập nội dung Final Prompt trước.");
            return;
        }
        try {
            const list = parseFinalPrompt(finalPromptText);
            if (list.length > 0) {
                setFinalPrompts(recalculateSceneTimes(list));
                logService.addLog(`[Composer] Đã áp dụng kịch bản prompt chi tiết gồm ${list.length} phân cảnh.`);
            } else {
                logService.addLog("[Composer] Không tìm thấy kịch bản phân cảnh hợp lệ.");
            }
        } catch (e) {
            logService.addLog(`[Composer] Lỗi phân tích: ${e instanceof Error ? e.message : String(e)}`);
        }
    };

    const handleUpdateDurationsRaw = (text: string): boolean => {
        try {
            const list = parseDurationFile(text);
            if (list.length > 0) {
                setDurations(recalculateSceneTimes(list));
                logService.addLog(`[Composer] Đã cập nhật thủ công ${list.length} phân cảnh thời lượng.`);
                return true;
            } else {
                logService.addLog("[Composer] Không tìm thấy dữ liệu phân cảnh hợp lệ.");
                return false;
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            logService.addLog(`[Composer] Lỗi cập nhật phân cảnh: ${msg}`);
            return false;
        }
    };

    const handleUpdatePrompt = (sceneNumber: number, imageNumber: number, newPrompt: string) => {
        if (!prompts) return;
        const updated = prompts.map(entry => {
            if (entry.sceneNumber === sceneNumber) {
                return {
                    ...entry,
                    prompts: entry.prompts.map(sub => {
                        if (sub.imageNumber === imageNumber) {
                            return { ...sub, prompt: newPrompt };
                        }
                        return sub;
                    })
                };
            }
            return entry;
        });
        setPrompts(updated);
        logService.addLog(`[System] Đã sửa prompt Cảnh ${sceneNumber} - Ảnh ${imageNumber} thủ công.`);
    };

    const handleBatchAutoMap = (e: React.ChangeEvent<HTMLInputElement>) => {
        const filesList = e.target.files;
        if (!filesList || filesList.length === 0) return;

        // Sort files numerically by name to ensure order (e.g. file_2.png before file_10.png)
        const sortedFiles = Array.from(filesList).filter(file => /\.mp4$/i.test(file.name)).sort((a, b) => 
            a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
        );

        const listToCheck = finalPrompts.length > 0 ? finalPrompts : durations;
        if (listToCheck.length === 0) {
            logService.addLog("[Composer] Cảnh báo: Vui lòng nạp phân cảnh/thời lượng trước khi gán tệp tự động.");
            return;
        }

        if (listToCheck.some(shot => shot.shotId)) {
            const filesByName = new Map(sortedFiles.map(file => [file.name.toLowerCase(), file]));
            const mapped = Object.fromEntries(listToCheck.flatMap(shot => {
                const file = filesByName.get(`${shot.shotId}.mp4`.toLowerCase());
                return file ? [[shot.sceneNumber, file]] : [];
            }));
            setSceneFiles(previous => ({ ...previous, ...mapped }));
            logService.addLog(`[Composer] ?? gh?p ${Object.keys(mapped).length} MP4 theo m? shot.`);
            return;
        }

        // Check for missing sequence numbers in uploaded files if they are numbered
        const uploadedIndices: number[] = [];
        for (const file of sortedFiles) {
            const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
            let cleanName = nameWithoutExt
                .replace(/\b\d{8}[_-]\d{6}\b/g, "")
                .replace(/\b\d{8}\b/g, "")
                .replace(/\b\d{6}\b/g, "")
                .replace(/\d{5,}/g, "");
            
            const allDigits = cleanName.match(/\d+/g);
            if (allDigits && allDigits.length > 0) {
                const num = parseInt(allDigits[allDigits.length - 1]);
                if (!isNaN(num) && num > 0) {
                    uploadedIndices.push(num);
                }
            }
        }

        if (uploadedIndices.length > 0) {
            uploadedIndices.sort((a, b) => a - b);
            const minIdx = uploadedIndices[0];
            const maxIdx = uploadedIndices[uploadedIndices.length - 1];
            
            const missingInSequence: number[] = [];
            for (let idx = minIdx; idx <= maxIdx; idx++) {
                if (!uploadedIndices.includes(idx)) {
                    missingInSequence.push(idx);
                }
            }
            
            if (missingInSequence.length > 0) {
                const missingNames = missingInSequence.map(idx => `${String(idx).padStart(3, '0')}.png`).join(", ");
                logService.addLog(`[Composer] ERROR: Phát hiện thiếu các file ảnh trong chuỗi thứ tự: ${missingNames}`);
                alert(`LỖI: Phát hiện thiếu các file ảnh trong chuỗi thứ tự: ${missingNames}\nVui lòng bổ sung đầy đủ trước khi gán.`);
                return;
            }
        }

        const newFiles = { ...sceneFiles };
        let count = 0;
        const unmappedFiles: File[] = [];

        for (const file of sortedFiles) {
            const name = file.name.toLowerCase();
            if (name.startsWith('.')) continue;

            const nameWithoutExt = name.replace(/\.[^/.]+$/, "");

            // Strip any timestamp patterns or sequence of 5+ consecutive digits (which are almost certainly dates/times)
            let cleanName = nameWithoutExt
                .replace(/\b\d{8}[_-]\d{6}\b/g, "") // YYYYMMDD_HHMMSS
                .replace(/\b\d{8}\b/g, "")          // YYYYMMDD
                .replace(/\b\d{6}\b/g, "")          // HHMMSS
                .replace(/\d{5,}/g, "");            // Any 5+ consecutive digits

            let matchedSceneNum = -1;

            // 1. Match scene and image numbers (e.g., scene 1 image 2, scene_1_2, cảnh 1 ảnh 2)
            const sceneImgMatch = cleanName.match(/(?:scene|s|cảnh)?\s*(\d+)\s*(?:image|img|i|ảnh|image_|img_|_|-)\s*(\d+)/i);
            if (sceneImgMatch) {
                const sNum = parseInt(sceneImgMatch[1]);
                const iNum = parseInt(sceneImgMatch[2]);
                const target = listToCheck.find(d => d.parentSceneNumber === sNum && d.imageNumber === iNum);
                if (target) {
                    matchedSceneNum = target.sceneNumber;
                }
            }

            // 2. Match scene number only (e.g., scene 1, cảnh 1)
            if (matchedSceneNum === -1) {
                const sceneOnlyMatch = cleanName.match(/(?:scene|s|cảnh|scene_)\s*(\d+)/i);
                if (sceneOnlyMatch) {
                    const sNum = parseInt(sceneOnlyMatch[1]);
                    const target = listToCheck.find(d => d.parentSceneNumber === sNum || d.sceneNumber === sNum);
                    if (target) {
                        matchedSceneNum = target.sceneNumber;
                    }
                }
            }

            // 3. Fallback to any matching digits left in the clean name (checking from right to left)
            if (matchedSceneNum === -1) {
                const allDigits = cleanName.match(/\d+/g);
                if (allDigits && allDigits.length > 0) {
                    for (let j = allDigits.length - 1; j >= 0; j--) {
                        const parsedNum = parseInt(allDigits[j]);
                        if (listToCheck.some(d => d.sceneNumber === parsedNum)) {
                            matchedSceneNum = parsedNum;
                            break;
                        }
                    }
                }
            }

            if (matchedSceneNum !== -1) {
                newFiles[matchedSceneNum] = file;
                count++;
            } else {
                unmappedFiles.push(file);
            }
        }

        // 4. Sequential fallback mapping:
        // If we still have unmapped files, and the count of all uploaded files equals listToCheck.length,
        // or if we have exactly the same number of unmapped files as empty/unassigned scene slots,
        // we can map them sequentially!
        const emptySlots = listToCheck.filter(d => !newFiles[d.sceneNumber]);
        if (unmappedFiles.length > 0) {
            if (sortedFiles.length === listToCheck.length) {
                // If total files equals total scenes, map everything 1-to-1 in sorted order
                logService.addLog("[Composer] Số lượng tệp tải lên bằng số lượng phân cảnh. Thực hiện tự động khớp theo thứ tự danh sách...");
                for (let i = 0; i < listToCheck.length; i++) {
                    newFiles[listToCheck[i].sceneNumber] = sortedFiles[i];
                }
                count = listToCheck.length;
                unmappedFiles.length = 0;
            } else if (unmappedFiles.length === emptySlots.length) {
                // If number of unmapped files matches number of empty slots, map them sequentially
                logService.addLog("[Composer] Số lượng tệp không khớp bằng số ô còn trống. Thực hiện khớp các ô trống theo thứ tự...");
                for (let i = 0; i < emptySlots.length; i++) {
                    newFiles[emptySlots[i].sceneNumber] = unmappedFiles[i];
                    count++;
                }
                unmappedFiles.length = 0;
            }
        }

        // Print logs for remaining unmapped files
        for (const file of unmappedFiles) {
            logService.addLog(`[Composer] Tệp ${file.name} không khớp với bất kỳ phân cảnh nào.`);
        }

        setSceneFiles(newFiles);
        logService.addLog(`[Composer] Tự động khớp thành công ${count}/${listToCheck.length} file hình ảnh/video.`);
    };

    // APIs
    const handleGenerateTranscript = async () => {
        if (!content.trim()) {
            setError("Vui lòng nhập nội dung");
            return;
        }

        setLoading((prev) => ({ ...prev, transcript: true }));
        setError(null);
        setStatus("Đang tạo transcript...");

        try {
            logService.addLog(`[API] POST /api/transcript | contentLen=${content.length} provider=${provider}`);
            const t0 = Date.now();
            const response = await fetch("/api/transcript", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content, provider, model: provider, language, rewriteWithAi, longForm, keepOrExpandDuration }),
            });

            const data = await response.json();
            const ms = Date.now() - t0;
            if (data.success) {
                logService.addLog(`[API] /api/transcript OK ${ms}ms | transcriptLen=${data.transcript?.length || 0}`);
                setTranscript(data.transcript);
                setActiveTab("transcript");
                setStatus("Hoàn tất transcript.");
            } else {
                logService.addLog(`[API] /api/transcript FAILED ${ms}ms | error=${data.error}`);
                setError(data.error || "Không thể tạo transcript");
                setStatus("");
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Có lỗi xảy ra";
            logService.addLog(`[API] /api/transcript ERROR ${message}`);
            setError(message);
            setStatus("");
        } finally {
            setLoading((prev) => ({ ...prev, transcript: false }));
        }
    };

    const handleGenerateDuration = async () => {
        if (!transcript && !srtContent) {
            setError("Chưa có transcript hoặc phụ đề SRT");
            return;
        }

        setLoading((prev) => ({ ...prev, duration: true }));
        setError(null);
        setStatus("Đang tạo duration...");
        setProgress(5);

        // Simulate progress slowly up to 90%
        const startTime = Date.now();
        const estimatedMs = 30000; // estimated 30s
        const progressInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const nextProgress = Math.min(90, 5 + Math.round((elapsed / estimatedMs) * 85));
            setProgress(nextProgress);
        }, 500);

        try {
            logService.addLog(`[API] POST /api/duration | transcriptLen=${transcript?.length || 0} provider=${provider}`);
            const t0 = Date.now();
            const response = await fetch("/api/duration", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ transcript: transcript || "", srtContent, provider, model: provider, longForm, language }),
            });

            const data = await response.json();
            const ms = Date.now() - t0;
            if (data.success) {
                logService.addLog(`[API] /api/duration OK ${ms}ms | scenes=${data.durations?.length || 0}`);
                setDurations(data.durations);
                setActiveTab("duration");
                
                // AUTO-FIX: Tự động chạy kiểm tra đồng bộ ngầm để bổ sung phân cảnh bị thiếu
                await handleCheckAndFixDurations(true, data.durations);
                
                setStatus("Hoàn tất duration.");
                setProgress(100);
            } else {
                logService.addLog(`[API] /api/duration FAILED ${ms}ms | error=${data.error}`);
                setError(data.error || "Không thể tạo durations");
                setStatus("");
                setProgress(0);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Có lỗi xảy ra";
            logService.addLog(`[API] /api/duration ERROR ${message}`);
            setError(message);
            setStatus("");
            setProgress(0);
        } finally {
            clearInterval(progressInterval);
            setLoading((prev) => ({ ...prev, duration: false }));
        }
    };

    const generatePromptsForBatch = async (batch: DurationEntry[], transcriptText: string, prov: string, styleOverride?: string, promptLang?: 'en' | 'vi' | 'ja' | 'ko' | 'zh' | 'fr' | 'auto', source?: { transcript: string; durations: DurationEntry[] }): Promise<PromptEntry[]> => {
        const sceneIds = batch.map(d => d.sceneNumber).join(',');
        const resolvedPromptLang = promptLang === 'auto' ? language : (promptLang || 'en');
        logService.addLog(`[API] POST /api/prompt | scenes=[${sceneIds}]${styleOverride ? ' | customStyle=yes' : ''} | promptLang=${resolvedPromptLang}`);
        const batchStart = Date.now();
        const durationsText = batch
            .map(d => `Scene ${d.sceneNumber}\n\n${d.sceneName}\n\n${d.duration}\n\n${d.timeRange}`)
            .join("\n\n");

        if (prov === 'local') {
            const targets = new Set(batch.map(scene => scene.sceneNumber));
            const validScenes = new Set((source?.durations || durations).map(scene => scene.sceneNumber));
            const result = await localPromptClient.generate({
                transcript: transcriptText, durations: durationsText, provider: prov, model: prov,
                language, promptStyle: styleOverride || '', promptLanguage: resolvedPromptLang,
            }, source ? localPromptContext(source.transcript, source.durations) : localPromptContext(), {
                onStart: resuming => {
                    if (resuming) setStatus('Đang tiếp tục các cảnh chưa hoàn tất bằng API local...');
                },
                onPartial: (partial, completed, total) => {
                    setPrompts(previous => [...(previous || []).filter(scene => validScenes.has(scene.sceneNumber) && !targets.has(scene.sceneNumber)), ...partial]
                        .sort((a, b) => a.sceneNumber - b.sceneNumber));
                    setProgress(Math.round(5 + completed / total * 90));
                    setStatus(`API local: đã hoàn tất ${completed}/${total} cảnh. Nếu lỗi, bấm Tạo Prompts để tiếp tục.`);
                },
            });
            logService.addLog(`[API] /api/prompt local OK ${Date.now() - batchStart}ms | scenes=[${sceneIds}] count=${result.length}`);
            return result;
        }

        const response = await fetch("/api/prompt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transcript: transcriptText, durations: durationsText, provider: prov, model: prov, language, promptStyle: styleOverride || "", promptLanguage: resolvedPromptLang }),
        });

        const data = await response.json();
        const batchMs = Date.now() - batchStart;
        if (!data.success) {
            logService.addLog(`[API] /api/prompt FAILED ${batchMs}ms | scenes=[${sceneIds}] error=${data.error}`);
            throw new Error(data.error || "Không thể tạo prompts");
        }
        logService.addLog(`[API] /api/prompt OK ${batchMs}ms | scenes=[${sceneIds}] count=${(data.prompts || []).length}`);
        return data.prompts || [];
    };

    const handleGeneratePrompt = async () => {
        if (!durations || durations.length === 0) {
            setError("Chưa có đủ dữ liệu");
            return;
        }

        setLoading((prev) => ({ ...prev, prompt: true }));
        setError(null);
        setStatus("Đang tạo prompt...");
        setProgress(5);

        try {
            if (provider === 'local') {
                setStatus('Đang tạo toàn bộ prompts bằng API local...');
                const allPrompts = await generatePromptsForBatch(
                    durations,
                    sendTranscript ? (transcript || '') : '',
                    provider,
                    promptStyle.trim() || undefined,
                    promptLanguage
                );
                if (allPrompts.length === 0) throw new Error('API local không trả về prompt hợp lệ.');
                setPrompts(allPrompts);
                setActiveTab('prompt');
                const returnedScenes = new Set(allPrompts.filter(p => p.prompts?.some(sp => sp.prompt?.trim())).map(p => p.sceneNumber));
                const missingScenes = durations.filter(d => !returnedScenes.has(d.sceneNumber)).map(d => d.sceneNumber);
                if (missingScenes.length > 0) {
                    setError(`API local thiếu prompt cho cảnh: ${missingScenes.join(', ')}.`);
                    logService.addLog(`[API local] Thiếu prompt cho cảnh: ${missingScenes.join(', ')}`);
                }
                setProgress(100);
                setStatus(missingScenes.length > 0 ? 'API local đã trả kết quả nhưng còn thiếu một số cảnh.' : 'Hoàn tất prompts bằng API local.');
                return;
            }
            const BATCH_SIZE = 10;
            const BATCH_RETRY = 2; // retry per-batch before giving up
            const batches: DurationEntry[][] = [];
            for (let i = 0; i < durations.length; i += BATCH_SIZE) {
                batches.push(durations.slice(i, i + BATCH_SIZE));
            }

            const totalBatches = batches.length;
            let completedBatches = 0;

            // Pre-split transcript into paragraphs for relevant-chunk extraction
            const transcriptParagraphs = (transcript || "").split(/\n\n+/).filter(p => p.trim().length > 0);

            /**
             * Extract the most relevant transcript chunk for a batch of scenes.
             * Instead of sending the full transcript (which wastes tokens for long videos),
             * we estimate the position of each batch in the overall timeline and extract
             * only the corresponding paragraphs.
             */
            const getRelevantTranscriptChunk = (batch: DurationEntry[]): string => {
                if (!sendTranscript || !transcript || transcript.length === 0) return "";
                // For short transcripts, just send the whole thing
                if (transcript.length <= 2000 || transcriptParagraphs.length <= 3) return transcript;

                const totalScenes = durations.length;
                const batchStartIdx = durations.indexOf(batch[0]);
                const batchEndIdx = durations.indexOf(batch[batch.length - 1]);

                // Map batch position to transcript proportion
                const startFraction = Math.max(0, (batchStartIdx - 1) / totalScenes);
                const endFraction = Math.min(1, (batchEndIdx + 2) / totalScenes);

                const totalParas = transcriptParagraphs.length;
                const paraStart = Math.max(0, Math.floor(startFraction * totalParas));
                const paraEnd = Math.min(totalParas, Math.ceil(endFraction * totalParas));

                const chunk = transcriptParagraphs.slice(paraStart, paraEnd).join("\n\n");
                return chunk || transcript; // fallback to full if chunk is empty
            };

            const runConcurrency = async <T, R>(
                items: T[],
                limit: number,
                fn: (item: T, index: number) => Promise<R>
            ): Promise<R[]> => {
                const results: R[] = new Array(items.length);
                let index = 0;
                const execute = async () => {
                    while (index < items.length) {
                        const currentIndex = index++;
                        results[currentIndex] = await fn(items[currentIndex], currentIndex);
                    }
                };
                const workers = Array.from({ length: Math.min(limit, items.length) }, execute);
                await Promise.all(workers);
                return results;
            };

            const failedBatches: Array<{ index: number; error: string }> = [];

            const results = await runConcurrency(batches, 2, async (batch, batchIndex) => {
                const batchNum = batchIndex + 1;
                const relevantTranscript = getRelevantTranscriptChunk(batch);

                // Per-batch retry loop
                for (let attempt = 1; attempt <= BATCH_RETRY; attempt++) {
                    try {
                        logService.addLog(`Batch ${batchNum}/${totalBatches}${attempt > 1 ? ` (retry #${attempt})` : ''}...`);

                        // Smooth progress: show incremental update when starting batch
                        const startPct = Math.round(5 + ((batchIndex / totalBatches) * 90));
                        setProgress(startPct);
                        setStatus(`Đang tạo prompt batch ${batchNum}/${totalBatches}...`);

                        const batchPrompts = await generatePromptsForBatch(
                            batch,
                            relevantTranscript,
                            provider,
                            promptStyle.trim() || undefined,
                            promptLanguage
                        );

                        completedBatches++;
                        // Smooth progress: completion update
                        const completePct = Math.round(5 + ((completedBatches / totalBatches) * 90));
                        setProgress(completePct);
                        setStatus(`Hoàn tất batch ${completedBatches}/${totalBatches}`);
                        logService.addLog(`Hoàn tất batch ${batchNum}/${totalBatches}`);
                        return batchPrompts;
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : String(err);
                        logService.addLog(`[Retry] Batch ${batchNum} lần ${attempt} thất bại: ${msg.slice(0, 100)}`);

                        if (attempt === BATCH_RETRY) {
                            // All retries exhausted — record failure but don't throw (allow other batches to continue)
                            failedBatches.push({ index: batchIndex, error: msg.slice(0, 100) });
                            completedBatches++;
                            logService.addLog(`[Error] Batch ${batchNum} bỏ qua sau ${BATCH_RETRY} lần thử.`);
                            return [] as PromptEntry[];
                        }
                        // Wait before retry
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                }
                return [] as PromptEntry[]; // unreachable but satisfies TS
            });

            const allPrompts = results.flat();
            setPrompts(allPrompts);
            setActiveTab("prompt");
            
            // AUTO-FIX: Tự động chạy kiểm tra đồng bộ ngầm để bổ sung prompt thiếu/rỗng hoặc lệch timeline
            await handleCheckAndFixPrompts(true, allPrompts, durations);
            
            setProgress(100);

            if (failedBatches.length > 0) {
                const failedScenes = failedBatches.map(fb => {
                    const batch = batches[fb.index];
                    return batch.map(d => d.sceneNumber).join(',');
                }).join('; ');
                setStatus(`Hoàn tất prompt (${failedBatches.length} batch lỗi: cảnh ${failedScenes}). Đang tự động tạo lại.`);
                logService.addLog(`⚠️ ${failedBatches.length} batch thất bại. Cảnh bị ảnh hưởng: ${failedScenes}`);
            } else {
                setStatus("Hoàn tất prompt.");
                logService.addLog("Hoàn tất tất cả prompt.");
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Có lỗi xảy ra";
            setError(message);
            setStatus("");
            setProgress(0);
            logService.addLog("Lỗi prompt: " + message);
        } finally {
            setLoading((prev) => ({ ...prev, prompt: false }));
        }
    };

    const handleCheckAndFixPrompts = async (
        silent: boolean = false,
        overridePrompts?: PromptEntry[],
        overrideDurations?: DurationEntry[]
    ) => {
        const activeDurations = overrideDurations || durations;
        const activePrompts = overridePrompts || prompts;

        if (!activeDurations || activeDurations.length === 0) {
            logService.addLog("[System] Không có dữ liệu phân cảnh (durations) để đối chiếu.");
            return;
        }

        logService.addLog("[System] Bắt đầu kiểm tra đồng bộ prompts với phân cảnh...");
        const missingOrEmpty: DurationEntry[] = [];
        const desyncedScenes: DurationEntry[] = [];

        activeDurations.forEach(d => {
            const promptEntry = activePrompts?.find(p => p.sceneNumber === d.sceneNumber);
            if (!promptEntry || !promptEntry.prompts || promptEntry.prompts.length === 0) {
                missingOrEmpty.push(d);
            } else {
                const hasEmptyPrompt = promptEntry.prompts.some(sp => !sp.prompt || !sp.prompt.trim());
                if (hasEmptyPrompt) {
                    missingOrEmpty.push(d);
                } else {
                    // TO TỐI ƯU: Kiểm tra sự lệch pha về mặt mốc thời gian (Time bounds)
                    // Nếu thời lượng lệch quá 1.5 giây, hoặc cảnh cũ/mới bị lệch bounds, coi như lệch đồng bộ.
                    const firstSub = promptEntry.prompts[0];
                    const lastSub = promptEntry.prompts[promptEntry.prompts.length - 1];
                    if (firstSub.timeRange && lastSub.timeRange) {
                        const getRangeBound = (rangeStr: string, isEnd = false): number => {
                            const pts = rangeStr.split('-').map(t => t.trim());
                            return parseTimeStrToSeconds(isEnd && pts[1] ? pts[1] : pts[0]);
                        };
                        const firstStart = getRangeBound(firstSub.timeRange, false);
                        const lastEnd = getRangeBound(lastSub.timeRange, true);

                        const dRange = d.timeRange.split('-').map(t => t.trim());
                        const dStart = parseTimeStrToSeconds(dRange[0]);
                        const dEnd = parseTimeStrToSeconds(dRange[1]);

                        const timeDiff = Math.abs((lastEnd - firstStart) - (dEnd - dStart));
                        if (timeDiff > 1.5) {
                            desyncedScenes.push(d);
                        }
                    }
                }
            }
        });

        const allTargetScenes = [...missingOrEmpty, ...desyncedScenes];

        if (allTargetScenes.length === 0) {
            logService.addLog("[System] ✓ Đồng bộ hoàn hảo! Tất cả các phân cảnh đều có prompt hợp lệ.");
            if (!silent) alert("✓ Đồng bộ hoàn hảo! Tất cả các phân cảnh đều có prompt hợp lệ.");
            return;
        }

        if (!silent) {
            let message = `Phát hiện:\n`;
            if (missingOrEmpty.length > 0) {
                message += `- ${missingOrEmpty.length} cảnh thiếu/rỗng prompt (Cảnh: ${missingOrEmpty.map(d => d.sceneNumber).join(', ')})\n`;
            }
            if (desyncedScenes.length > 0) {
                message += `- ${desyncedScenes.length} cảnh bị lệch thời lượng timeline (Cảnh: ${desyncedScenes.map(d => d.sceneNumber).join(', ')})\n`;
            }
            message += `\nBạn có muốn tự động tạo lại các prompt cho ${allTargetScenes.length} cảnh này không?`;

            const confirmFix = window.confirm(message);
            if (!confirmFix) {
                return;
            }
        } else {
            logService.addLog(`[Auto-Fix] Tự động sửa ${allTargetScenes.length} prompt bị thiếu/lệch...`);
        }

        setLoading(prev => ({ ...prev, prompt: true }));
        setStatus(`Đang tạo lại prompt cho ${allTargetScenes.length} cảnh bị thiếu/lệch...`);

        try {
            const BATCH_SIZE = provider === 'local' ? allTargetScenes.length : 10;
            const batches: DurationEntry[][] = [];
            for (let i = 0; i < allTargetScenes.length; i += BATCH_SIZE) {
                batches.push(allTargetScenes.slice(i, i + BATCH_SIZE));
            }

            const totalBatches = batches.length;
            let completedBatches = 0;
            let mergedPrompts = activePrompts ? [...activePrompts] : [];

            const runConcurrency = async <T, R>(
                items: T[],
                limit: number,
                fn: (item: T, index: number) => Promise<R>
            ): Promise<R[]> => {
                const results: R[] = new Array(items.length);
                let index = 0;
                const execute = async () => {
                    while (index < items.length) {
                        const currentIndex = index++;
                        results[currentIndex] = await fn(items[currentIndex], currentIndex);
                    }
                };
                const workers = Array.from({ length: Math.min(limit, items.length) }, execute);
                await Promise.all(workers);
                return results;
            };

            const results = await runConcurrency(batches, 2, async (batch, batchIndex) => {
                const batchNum = batchIndex + 1;
                logService.addLog(`Đang sửa batch ${batchNum}/${totalBatches} cho các cảnh [${batch.map(d => d.sceneNumber).join(', ')}]...`);
                const batchPrompts = await generatePromptsForBatch(
                    batch,
                    sendTranscript ? (transcript || "") : "",
                    provider,
                    promptStyle.trim() || undefined,
                    promptLanguage
                );
                completedBatches++;
                setStatus(`Đang sửa prompt batch ${completedBatches}/${totalBatches}...`);
                logService.addLog(`Hoàn tất sửa batch ${batchNum}/${totalBatches}`);
                return batchPrompts;
            });

            for (const batchPrompts of results) {
                for (const newEntry of batchPrompts) {
                    mergedPrompts = mergedPrompts.filter(p => p.sceneNumber !== newEntry.sceneNumber);
                    mergedPrompts.push(newEntry);
                }
            }

            mergedPrompts.sort((a, b) => a.sceneNumber - b.sceneNumber);
            setPrompts(mergedPrompts);
            setStatus("Đồng bộ và sửa lỗi prompt hoàn tất!");
            logService.addLog("[System] ✓ Đã tự động tạo lại và đồng bộ các prompt bị thiếu/lỗi thành công.");
        } catch (err) {
            const message = err instanceof Error ? err.message : "Có lỗi xảy ra";
            setError(message);
            setStatus("");
            logService.addLog("[System] Lỗi khi sửa prompts: " + message);
        } finally {
            setLoading(prev => ({ ...prev, prompt: false }));
        }
    };

    const applyContiguousBounds = (list: DurationEntry[]): DurationEntry[] => {
        const parseTimeStrToMs = (tStr: string): number => {
            const cleanStr = tStr.trim().replace(',', '.');
            const parts = cleanStr.split(":");
            let hours = 0, minutes = 0, secondsStr = '0';
            if (parts.length === 3) {
                hours = Number(parts[0]) || 0;
                minutes = Number(parts[1]) || 0;
                secondsStr = parts[2] || '0';
            } else if (parts.length === 2) {
                minutes = Number(parts[0]) || 0;
                secondsStr = parts[1] || '0';
            } else {
                secondsStr = parts[0] || '0';
            }
            const secParts = secondsStr.split('.');
            const seconds = Number(secParts[0]) || 0;
            const ms = Number((secParts[1] || '0').padEnd(3, '0').substring(0, 3)) || 0;
            return hours * 3600000 + minutes * 60000 + seconds * 1000 + ms;
        };

        const formatTimeFromMs = (ms: number): string => {
            const h = Math.floor(ms / 3600000);
            const m = Math.floor((ms % 3600000) / 60000);
            const s = Math.floor((ms % 60000) / 1000);
            const mil = ms % 1000;
            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${mil.toString().padStart(3, '0')}`;
        };

        const calibratedList: DurationEntry[] = [];
        let currentStartMs = 0;

        for (let i = 0; i < list.length; i++) {
            const item = list[i];
            if (!item.timeRange || !item.timeRange.includes('-')) {
                // If no time range, estimate based on duration or default 5s
                const durMs = Math.round((item.durationSeconds || 5) * 1000);
                const endMs = currentStartMs + durMs;
                calibratedList.push({
                    ...item,
                    startMs: currentStartMs,
                    endMs,
                    durationMs: durMs,
                    durationSeconds: durMs / 1000,
                    duration: `${Math.round(durMs / 1000)} giây`,
                    timeRange: `${formatTimeFromMs(currentStartMs)} - ${formatTimeFromMs(endMs)}`
                });
                currentStartMs = endMs;
                continue;
            }

            const parts = item.timeRange.split('-').map(t => t.trim());
            const origStartMs = typeof item.startMs === 'number' ? item.startMs : parseTimeStrToMs(parts[0]);
            const origEndMs = typeof item.endMs === 'number' ? item.endMs : parseTimeStrToMs(parts[1]);

            // Ensure startMs is contiguous with the previous scene's endMs
            const startMs = currentStartMs;

            // Determine target endMs
            let endMs = origEndMs;
            if (i < list.length - 1) {
                const nextItem = list[i + 1];
                const nextParts = nextItem.timeRange ? nextItem.timeRange.split('-').map(t => t.trim()) : [];
                const nextStartMs = nextItem.startMs !== undefined 
                    ? nextItem.startMs 
                    : (nextParts[0] ? parseTimeStrToMs(nextParts[0]) : origEndMs);

                // Align end to next scene's start
                endMs = nextStartMs;
            }

            // CRITICAL SANITY CHECK: Avoid negative/zero durations
            // If endMs <= startMs (due to AI output errors or overlap), force a minimum duration of 1.5 seconds (1500ms)
            if (endMs <= startMs) {
                endMs = startMs + 1500;
            }

            const durationMs = endMs - startMs;
            const durationSecs = parseFloat((durationMs / 1000).toFixed(3));

            calibratedList.push({
                ...item,
                startMs,
                endMs,
                durationMs,
                durationSeconds: durationSecs,
                duration: `${Math.round(durationSecs)} giây`,
                timeRange: `${formatTimeFromMs(startMs)} - ${formatTimeFromMs(endMs)}`
            });

            currentStartMs = endMs;
        }

        return calibratedList;
    };

    const handleCheckAndFixDurations = async (silent: boolean = false, overrideDurations?: DurationEntry[]) => {
        const activeDurations = overrideDurations || durations;
        if (!activeDurations || activeDurations.length === 0) {
            logService.addLog("[System] Không có dữ liệu phân cảnh (durations) để đối chiếu.");
            return;
        }

        logService.addLog("[System] Bắt đầu kiểm tra đồng bộ phân cảnh (durations)...");

        // 1. Check for empty names or invalid durations
        const invalidScenes = activeDurations.filter(d => !d.sceneName || !d.sceneName.trim() || d.durationSeconds <= 0);
        if (invalidScenes.length > 0) {
            logService.addLog(`[System] Phát hiện ${invalidScenes.length} cảnh lỗi (không có tên hoặc thời lượng <= 0).`);
        }

        // 2. SRT Mode gap check (if srtContent is present)
        if (srtContent && srtContent.trim().length > 0) {
            const blocks = srtContent.split(/\r?\n\r?\n/).filter(b => b.trim().length > 0);
            const srtSubs: Array<{ index: number; startTime: number; endTime: number; text: string; rawBlock: string }> = [];
            const srtTimeRegex = /(\d{2}):(\d{2}):(\d{2})[,.]([\d]{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.]([\d]{3})/;
            
            blocks.forEach(block => {
                const lines = block.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
                if (lines.length >= 3) {
                    const index = parseInt(lines[0]);
                    const timeRange = lines[1];
                    const text = lines.slice(2).join(" ");
                    const m = srtTimeRegex.exec(timeRange);
                    if (m && !isNaN(index)) {
                        const startTime = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) + parseInt(m[4]) / 1000;
                        const endTime = parseInt(m[5]) * 3600 + parseInt(m[6]) * 60 + parseInt(m[7]) + parseInt(m[8]) / 1000;
                        srtSubs.push({ index, startTime, endTime, text, rawBlock: block });
                    }
                }
            });

            const unmappedSubs = srtSubs.filter(sub => {
                const isMapped = activeDurations.some(d => {
                    if (!d.timeRange || !d.timeRange.includes('-')) return false;
                    const parts = d.timeRange.split('-').map(t => t.trim());
                    const start = parseTimeStrToSeconds(parts[0]);
                    const end = parseTimeStrToSeconds(parts[1]);
                    const overlapStart = Math.max(sub.startTime, start);
                    const overlapEnd = Math.min(sub.endTime, end);
                    const overlapDuration = overlapEnd - overlapStart;
                    const subDuration = sub.endTime - sub.startTime;
                    return overlapDuration > subDuration * 0.5;
                });
                return !isMapped;
            });

            if (unmappedSubs.length === 0 && invalidScenes.length === 0) {
                logService.addLog("[System] ✓ Đồng bộ hoàn hảo! Không phát hiện phụ đề nào bị bỏ sót.");
                if (!silent) alert("✓ Đồng bộ hoàn hảo! Không phát hiện phụ đề nào bị bỏ sót.");
                return;
            }

            if (unmappedSubs.length > 0) {
                logService.addLog(`[System] Phát hiện ${unmappedSubs.length} phụ đề chưa được phân cảnh: ${unmappedSubs.map(s => s.index).join(', ')}`);
                
                if (!silent) {
                    const confirmFix = window.confirm(`Phát hiện ${unmappedSubs.length} đoạn phụ đề chưa được phân cảnh (mất đồng bộ).\nBạn có muốn tự động tạo lại phân cảnh cho các đoạn này không?`);
                    if (!confirmFix) return;
                } else {
                    logService.addLog(`[Auto-Fix] Tự động tạo phân cảnh bổ sung cho ${unmappedSubs.length} phụ đề bị thiếu...`);
                }

                setLoading(prev => ({ ...prev, duration: true }));
                setStatus(`Đang sửa phân cảnh cho ${unmappedSubs.length} phụ đề...`);

                try {
                    const missingSrtText = unmappedSubs.map(s => s.rawBlock).join("\n\n");
                    
                    const response = await fetch("/api/duration", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            // TO TỐI ƯU: Gửi toàn bộ transcript nếu khả dụng để AI hiểu đầy đủ ngữ cảnh
                            transcript: transcript || "",
                            srtContent: missingSrtText,
                            provider,
                            model: provider,
                            longForm,
                            language
                        }),
                    });

                    const data = await response.json();
                    if (data.success && data.durations && data.durations.length > 0) {
                        let combined = [...activeDurations];
                        const newScenes: DurationEntry[] = data.durations;
                        
                        newScenes.forEach(ns => {
                            const nsRange = ns.timeRange.split('-').map(t => t.trim());
                            const nsStart = parseTimeStrToSeconds(nsRange[0]);
                            const nsEnd = parseTimeStrToSeconds(nsRange[1]);
                            
                            // TO TỐI ƯU: Không lọc thô bạo (filter) để xóa hẳn các cảnh bị đè
                            // Thay vào đó, co giãn thời lượng (shrink/resize) các cảnh cũ bị chồng chéo
                            combined = combined.map(d => {
                                if (!d.timeRange || !d.timeRange.includes('-')) return d;
                                const parts = d.timeRange.split('-').map(t => t.trim());
                                let start = parseTimeStrToSeconds(parts[0]);
                                let end = parseTimeStrToSeconds(parts[1]);

                                // Nếu cảnh cũ nằm đè lên đầu cảnh mới
                                if (start < nsStart && end > nsStart) {
                                    end = nsStart;
                                }
                                // Nếu cảnh cũ nằm đè lên đuôi cảnh mới
                                if (start < nsEnd && end > nsEnd) {
                                    start = nsEnd;
                                }
                                // Nếu cảnh cũ nằm trọn vẹn bên trong cảnh mới -> lúc này mới xóa
                                if (start >= nsStart && end <= nsEnd) {
                                    return null;
                                }

                                const formatTime = (secs: number) => {
                                    const h = Math.floor(secs / 3600);
                                    const m = Math.floor((secs % 3600) / 60);
                                    const s = Math.floor(secs % 60);
                                    const ms = Math.round((secs % 1) * 1000);
                                    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
                                };

                                const nextDur = parseFloat((end - start).toFixed(3));
                                if (nextDur <= 0.1) return null; // Quá ngắn thì bỏ

                                return {
                                    ...d,
                                    duration: `${Math.round(nextDur)} giây`,
                                    durationSeconds: nextDur,
                                    timeRange: `${formatTime(start)} - ${formatTime(end)}`
                                };
                            }).filter((d): d is DurationEntry => d !== null);

                            combined.push({ ...ns, isAddedBySync: true });
                        });

                        combined.sort((a, b) => {
                            const aStart = parseTimeStrToSeconds(a.timeRange.split('-')[0]);
                            const bStart = parseTimeStrToSeconds(b.timeRange.split('-')[0]);
                            return aStart - bStart;
                        });

                        const renumbered = combined.map((d, idx) => ({
                            ...d,
                            sceneNumber: idx + 1
                        }));

                        const calibrated = applyContiguousBounds(renumbered);
                        setDurations(calibrated);
                        setStatus("Đồng bộ phân cảnh hoàn tất!");
                        logService.addLog("[System] ✓ Đã tự động bổ sung và đồng bộ các phân cảnh bị thiếu thành công.");
                    } else {
                        throw new Error(data.error || "Không thể tạo bổ sung phân cảnh");
                    }
                } catch (err) {
                    const message = err instanceof Error ? err.message : "Có lỗi xảy ra";
                    setError(message);
                    setStatus("");
                    logService.addLog("[System] Lỗi khi đồng bộ phân cảnh: " + message);
                } finally {
                    setLoading(prev => ({ ...prev, duration: false }));
                }
            }
        } else {
            let hasGaps = false;
            for (let i = 0; i < durations.length - 1; i++) {
                const currRange = durations[i].timeRange.split('-').map(t => t.trim());
                const nextRange = durations[i+1].timeRange.split('-').map(t => t.trim());
                const currEnd = parseTimeStrToSeconds(currRange[1]);
                const nextStart = parseTimeStrToSeconds(nextRange[0]);
                if (Math.abs(nextStart - currEnd) > 1.0) {
                    hasGaps = true;
                    break;
                }
            }

            if (!hasGaps && invalidScenes.length === 0) {
                logService.addLog("[System] ✓ Đồng bộ hoàn hảo! Các phân cảnh không có khoảng trống.");
                alert("✓ Đồng bộ hoàn hảo! Các phân cảnh không có khoảng trống.");
                return;
            }

            logService.addLog("[System] Phát hiện khoảng trống hoặc phân cảnh bị lệch thời gian.");
            const confirmFix = window.confirm("Phát hiện các phân cảnh bị lệch thời gian hoặc có khoảng trống. Bạn có muốn tự động sửa lại cho liền mạch không?");
            if (!confirmFix) return;

            const fixed = recalculateSceneTimes(durations);
            setDurations(fixed);
            logService.addLog("[System] ✓ Đã tự động điều chỉnh các phân cảnh liền mạch.");
        }
    };

    const handleAutoFillMissingSubs = () => {
        if (!srtContent || srtContent.trim().length === 0 || !durations || durations.length === 0) return;
        
        const parseTimeStrToSeconds = (tStr: string): number => {
            const cleanStr = tStr.trim().replace(',', '.');
            const parts = cleanStr.split(":").map(Number);
            if (parts.length === 2) {
                return parts[0] * 60 + parts[1];
            } else if (parts.length === 3) {
                return parts[0] * 3600 + parts[1] * 60 + parts[2];
            }
            return parseFloat(cleanStr) || 0;
        };

        const blocks = srtContent.split(/\r?\n\r?\n/).filter(b => b.trim().length > 0);
        const srtSubs: Array<{ index: number; startTime: number; endTime: number; text: string; timeRange: string }> = [];
        const srtTimeRegex = /(\d{2}):(\d{2}):(\d{2})[,.]([\d]{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.]([\d]{3})/;
        
        blocks.forEach(block => {
            const lines = block.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
            if (lines.length >= 3) {
                const index = parseInt(lines[0]);
                const timeRange = lines[1];
                const text = lines.slice(2).join(" ");
                const m = srtTimeRegex.exec(timeRange);
                if (m && !isNaN(index)) {
                    const startTime = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) + parseInt(m[4]) / 1000;
                    const endTime = parseInt(m[5]) * 3600 + parseInt(m[6]) * 60 + parseInt(m[7]) + parseInt(m[8]) / 1000;
                    srtSubs.push({ index, startTime, endTime, text, timeRange });
                }
            }
        });

        const unmappedSubs = srtSubs.filter(sub => {
            const isMapped = durations.some(d => {
                if (!d.timeRange || !d.timeRange.includes('-')) return false;
                const parts = d.timeRange.split('-').map(t => t.trim());
                const start = parseTimeStrToSeconds(parts[0]);
                const end = parseTimeStrToSeconds(parts[1]);
                const overlapStart = Math.max(sub.startTime, start);
                const overlapEnd = Math.min(sub.endTime, end);
                const overlapDuration = overlapEnd - overlapStart;
                const subDuration = sub.endTime - sub.startTime;
                return overlapDuration > subDuration * 0.5;
            });
            return !isMapped;
        });

        if (unmappedSubs.length === 0) {
            alert("Không tìm thấy phụ đề nào bị thiếu!");
            return;
        }

        const formatTime = (secs: number) => {
            const h = Math.floor(secs / 3600);
            const m = Math.floor((secs % 3600) / 60);
            const s = Math.floor(secs % 60);
            const ms = Math.round((secs % 1) * 1000);
            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
        };

        let combined = [...durations];

        unmappedSubs.forEach(sub => {
            const durationSecs = parseFloat((sub.endTime - sub.startTime).toFixed(3));
            const formattedTimeRange = `${formatTime(sub.startTime)}-${formatTime(sub.endTime)}`;
            
            const newScene: DurationEntry = {
                sceneNumber: 0,
                sceneName: sub.text,
                duration: `${Math.round(durationSecs)} giây`,
                durationSeconds: durationSecs,
                timeRange: formattedTimeRange,
                isAddedBySync: true
            };
            combined.push(newScene);
        });

        combined.sort((a, b) => {
            const aStart = parseTimeStrToSeconds(a.timeRange.split('-')[0]);
            const bStart = parseTimeStrToSeconds(b.timeRange.split('-')[0]);
            return aStart - bStart;
        });

        const renumbered = combined.map((d, idx) => ({
            ...d,
            sceneNumber: idx + 1
        }));

        const calibrated = applyContiguousBounds(renumbered);
        setDurations(calibrated);
        logService.addLog(`[System] ✓ Đã tự động điền nhanh ${unmappedSubs.length} phụ đề thiếu thành công.`);
        alert(`✓ Đã tự động điền nhanh ${unmappedSubs.length} phụ đề thiếu thành công!`);
    };





    const handleGenerateTTS = async () => {
        if (!transcript) {
            setError("Chưa có transcript");
            return;
        }

        setTtsLoading(true);
        setTtsError(null);
        setError(null);
        setTtsProgress(0);
        setTtsStatus("Đang khởi tạo...");
        setStatus("Đang sinh giọng đọc & file phụ đề SRT...");
        logService.addLog(`[TTS] Bắt đầu tổng hợp | Engine: ${ttsEngine}`);

        const ttsTaskId = `tts_${Date.now()}`;
        let printedWarningsCount = 0;

        const intervalId = setInterval(async () => {
            try {
                const res = await fetch(`/outputs/tts_status_${ttsTaskId}.json?t=${Date.now()}`);
                if (res.ok) {
                    const sData = await res.json();
                    if (typeof sData.progress === 'number') setTtsProgress(sData.progress);
                    if (sData.status) { setTtsStatus(sData.status); setStatus(sData.status); }
                    if (sData.warnings && Array.isArray(sData.warnings)) {
                        while (printedWarningsCount < sData.warnings.length) {
                            logService.addLog(`[TTS] ${sData.warnings[printedWarningsCount++]}`);
                        }
                    }
                }
            } catch (e) { }
        }, 2000);

        try {
            let body: object;
            if (ttsEngine === "genmax") {
                body = { transcript, ttsEngine: "genmax", targetLanguage: language, ttsTaskId, genmaxApiKey, genmaxProvider, genmaxVoiceId, genmaxModelId };
            } else if (ttsEngine === "beeknoee") {
                body = { transcript, ttsEngine: "beeknoee", targetLanguage: language, ttsTaskId, beeknoeeApiKey, beeknoeeModel, beeknoeeVoice };
            } else {
                body = { transcript, voice: ttsVoice, ttsEngine: "edge", targetLanguage: language, ttsTaskId };
            }

            setTtsStatus("Đang xử lý...");
            const response = await fetch("/api/tts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            clearInterval(intervalId);
            const data = await response.json();

            if (data.success) {
                setTtsProgress(100);
                setTtsStatus("Hoàn tất!");
                setTtsError(null);
                logService.addLog(`[TTS] OK | srtLen=${data.srt?.length || 0}`);
                setSrtContent(data.srt);
                setGeneratedAudioUrl(data.audioUrl);
                setGeneratedSrtUrl(data.srtUrl);
                setStatus("Sinh giọng đọc & SRT thành công!");
            } else {
                const errMsg = data.error || "Không thể tạo giọng đọc";
                logService.addLog(`[TTS] FAILED | error=${errMsg}`);
                setTtsError(errMsg);
                setTtsStatus("Thất bại — nhấn Thử lại để thực hiện lại");
                setStatus("");
                setTtsProgress(0);
            }
        } catch (err) {
            clearInterval(intervalId);
            const message = err instanceof Error ? err.message : "Lỗi kết nối";
            logService.addLog(`[TTS] ERROR | ${message}`);
            setTtsError(message);
            setTtsStatus("Timeout / lỗi kết nối — nhấn Thử lại");
            setStatus("");
            setTtsProgress(0);
        } finally {
            setTtsLoading(false);
        }
    };

    const handleGenerateAll = async () => {
        if (!content.trim()) {
            setError("Vui lòng nhập nội dung");
            return;
        }

        setError(null);
        setProgress(0);
        logService.clearLogs();

        let transInterval: any = null;
        let durInterval: any = null;

        try {
            setLoading((prev) => ({ ...prev, transcript: true, duration: false, prompt: false }));
            setStatus("Đang tạo transcript...");
            setProgress(5);
            logService.addLog("Bắt đầu tạo transcript...");

            // Simulate progress from 5% to 30%
            const transStart = Date.now();
            transInterval = setInterval(() => {
                const elapsed = Date.now() - transStart;
                setProgress(Math.min(30, 5 + Math.round((elapsed / 15000) * 25)));
            }, 500);

            logService.addLog(`[API] POST /api/transcript | contentLen=${content.length} provider=${provider}`);
            const transcriptStart = Date.now();
            const transcriptRes = await fetch("/api/transcript", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content, provider, language, rewriteWithAi, longForm, keepOrExpandDuration }),
            });

            const transcriptData = await transcriptRes.json();
            const transcriptMs = Date.now() - transcriptStart;
            if (transInterval) clearInterval(transInterval);

            if (!transcriptData.success) {
                logService.addLog(`[API] /api/transcript FAILED ${transcriptMs}ms | error=${transcriptData.error}`);
                throw new Error(transcriptData.error || "Không thể tạo transcript");
            }
            logService.addLog(`[API] /api/transcript OK ${transcriptMs}ms | transcriptLen=${transcriptData.transcript?.length || 0}`);

            setTranscript(transcriptData.transcript);
            setStatus("Hoàn tất transcript.");
            setProgress(33);
            logService.addLog("Hoàn tất transcript.");

            setLoading((prev) => ({ ...prev, transcript: false, duration: true, prompt: false }));
            logService.addLog("Bắt đầu tạo duration...");
            setStatus("Đang tạo duration...");
            setProgress(35);

            // Simulate progress from 35% to 65%
            const durStart = Date.now();
            durInterval = setInterval(() => {
                const elapsed = Date.now() - durStart;
                setProgress(Math.min(65, 35 + Math.round((elapsed / 25000) * 30)));
            }, 500);

            logService.addLog(`[API] POST /api/duration | transcriptLen=${transcriptData.transcript?.length || 0} provider=${provider}`);
            const durationStart = Date.now();
            const durationRes = await fetch("/api/duration", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ transcript: transcriptData.transcript, srtContent, provider, longForm, language }),
            });

            const durationData = await durationRes.json();
            const durationMs = Date.now() - durationStart;
            if (durInterval) clearInterval(durInterval);

            if (!durationData.success) {
                logService.addLog(`[API] /api/duration FAILED ${durationMs}ms | error=${durationData.error}`);
                throw new Error(durationData.error || "Không thể tạo durations");
            }
            logService.addLog(`[API] /api/duration OK ${durationMs}ms | scenes=${durationData.durations?.length || 0}`);

            setDurations(durationData.durations);
            setStatus("Hoàn tất duration.");
            setProgress(66);
            logService.addLog("Hoàn tất duration.");

            setLoading((prev) => ({ ...prev, transcript: false, duration: false, prompt: true }));
            logService.addLog(provider === 'local' ? 'Bắt đầu tạo toàn bộ prompts bằng API local...' : 'Bắt đầu tạo prompt (batched)...');
            let allPrompts: PromptEntry[] = [];
            const BATCH_SIZE = 2;
            const sceneList = durationData.durations || [];
            let missingLocalScenes = 0;

            if (provider === 'local') {
                setStatus('Đang tạo toàn bộ prompts bằng API local...');
                allPrompts = await generatePromptsForBatch(
                    sceneList,
                    sendTranscript ? (transcriptData.transcript || '') : '',
                    provider,
                    promptStyle.trim() || undefined,
                    promptLanguage,
                    { transcript: transcriptData.transcript, durations: sceneList }
                );
                if (allPrompts.length === 0) throw new Error('API local không trả về prompt hợp lệ.');
                const returnedScenes = new Set(allPrompts.filter(p => p.prompts?.some(sp => sp.prompt?.trim())).map(p => p.sceneNumber));
                const missingScenes = sceneList.filter((d: DurationEntry) => !returnedScenes.has(d.sceneNumber)).map((d: DurationEntry) => d.sceneNumber);
                missingLocalScenes = missingScenes.length;
                if (missingScenes.length > 0) {
                    setError(`API local thiếu prompt cho cảnh: ${missingScenes.join(', ')}.`);
                    logService.addLog(`[API local] Thiếu prompt cho cảnh: ${missingScenes.join(', ')}`);
                }
            } else {
                for (let i = 0; i < sceneList.length; i += BATCH_SIZE) {
                    const batch = sceneList.slice(i, i + BATCH_SIZE);
                    const batchIndex = Math.floor(i / BATCH_SIZE) + 1;
                    const totalBatches = Math.ceil(sceneList.length / BATCH_SIZE);
                    setStatus(`Đang tạo prompt batch ${batchIndex}/${totalBatches}...`);
                    logService.addLog(`Batch prompt ${batchIndex}/${totalBatches}...`);

                    const batchPrompts = await generatePromptsForBatch(batch, sendTranscript ? (transcriptData.transcript || "") : "", provider, promptStyle.trim() || undefined, promptLanguage);
                    allPrompts.push(...batchPrompts);
                    logService.addLog(`Hoàn tất batch ${batchIndex}/${totalBatches}`);

                    const currentProgress = Math.round(66 + (batchIndex / totalBatches) * 34);
                    setProgress(currentProgress);
                }
            }

            setPrompts(allPrompts);
            setActiveTab("prompt");
            setStatus(missingLocalScenes > 0 ? 'API local đã trả kết quả nhưng còn thiếu một số cảnh.' : "Hoàn tất prompt.");
            setProgress(100);
            logService.addLog("Hoàn tất tất cả prompt.");
        } catch (err) {
            if (transInterval) clearInterval(transInterval);
            if (durInterval) clearInterval(durInterval);
            const message = err instanceof Error ? err.message : "Có lỗi xảy ra";
            setError(message);
            setStatus("");
            setProgress(0);
            logService.addLog("Lỗi: " + message);
        } finally {
            setLoading((prev) => ({ ...prev, transcript: false, duration: false, prompt: false }));
        }
    };




    const handleUploadSceneFile = (sceneNumber: number, file: File) => {
        if (!/\.mp4$/i.test(file.name)) {
            setError("Ch? nh?n clip MP4.");
            return;
        }
        setSceneFiles((prev) => ({ ...prev, [sceneNumber]: file }));
        logService.addLog(`[Composer] Đã gán file ${file.name} cho Scene ${sceneNumber}`);
    };

    const handleApplyVideoShots = (shots: VideoShot[], input: { audioFile: File | null; srt: string; clips: Record<string, VideoShotClip> }) => {
        const timeline = shots.map((shot, index): DurationEntry => ({
            sceneNumber: index + 1,
            shotId: shot.shotId,
            sceneName: shot.shotId,
            startMs: shot.startMs,
            endMs: shot.endMs,
            durationMs: shot.endMs - shot.startMs,
            durationSeconds: (shot.endMs - shot.startMs) / 1000,
            duration: `${(shot.endMs - shot.startMs) / 1000}s`,
            timeRange: formatTimeRange(shot.startMs, shot.endMs),
        }));
        setDurations(timeline);
        setFinalPrompts(timeline);
        const files: Record<number, File> = {};
        const offsets: Record<number, VideoShotClip> = {};
        for (const entry of timeline) {
            const clip = entry.shotId ? input.clips[entry.shotId] : undefined;
            if (!clip) continue;
            files[entry.sceneNumber] = clip.file;
            if (clip.sourceStartMs > 0) offsets[entry.sceneNumber] = clip;
        }
        setSceneFiles(files);
        setShotClipOffsets(offsets);
        setLocalAudioFile(input.audioFile);
        setLocalSrtFile(new File([input.srt], "video-shots.srt", { type: "text/plain" }));
        setComposedVideoUrl(null);
        setActiveTab("compose");
    };

    const handleComposeVideo = async () => {
        const listToCompose = finalPrompts.length > 0 ? finalPrompts : durations;
        if (durations.length === 0) {
            setError("Lỗi: Thiếu file Cảnh/Thời lượng (durations.txt). Vui lòng nạp file Cảnh trước.");
            logService.addLog("[Composer] Lỗi: Không thể dựng video khi thiếu dữ liệu phân cảnh thời lượng gốc.");
            return;
        }
        if (finalPrompts.length === 0) {
            setError("Lỗi: Thiếu dữ liệu mô tả phân cảnh ảnh chi tiết (final_prompt.txt). Vui lòng nạp file Final Prompt trước.");
            logService.addLog("[Composer] Lỗi: Không thể dựng video khi thiếu dữ liệu mô tả phân cảnh ảnh chi tiết.");
            return;
        }
        const hasAudio = !!generatedAudioUrl || !!localAudioFile;
        if (!hasAudio) {
            setError("Lỗi: Thiếu file Âm thanh (Audio). Vui lòng cấu hình giọng đọc TTS hoặc tải lên file âm thanh.");
            logService.addLog("[Composer] Lỗi: Không thể dựng video khi thiếu Âm thanh.");
            return;
        }
        const hasSrt = !!generatedSrtUrl || !!localSrtFile;
        if (!hasSrt) {
            setError("Lỗi: Thiếu file Phụ đề (SRT). Vui lòng cấu hình giọng đọc TTS để sinh phụ đề hoặc tải lên file SRT.");
            logService.addLog("[Composer] Lỗi: Không thể dựng video khi thiếu Phụ đề SRT.");
            return;
        }
        
        // Validation updated to support Local Asset Referencing (either local scene file or server generated image url)
        const listToComposeForCheck = finalPrompts.length > 0 ? finalPrompts : durations;
        const allImagesMapped = listToComposeForCheck.length > 0 && listToComposeForCheck.every(d => !!sceneFiles[d.sceneNumber]);
        if (!allImagesMapped) {
            const unmappedCount = listToCompose.filter(d => !sceneFiles[d.sceneNumber]).length;
            setError(`Lỗi: Còn ${unmappedCount} ảnh/video chưa được gán. Bạn bắt buộc phải gán đầy đủ tệp cho từng ảnh.`);
            logService.addLog(`[Composer] Lỗi: Còn ${unmappedCount} ảnh/video chưa gán tệp phương tiện.`);
            return;
        }

        setComposeLoading(true);
        setError(null);
        setComposeProgress(0);
        setComposeStatus("Đang kết nối...");
        setStatus("Đang chuẩn bị dựng video...");
        logService.addLog("[Composer] Bắt đầu quá trình ghép nối video...");

        const workspaceId = `workspace_${Date.now()}`;

        const intervalId = setInterval(async () => {
            try {
                const statusRes = await fetch(`/outputs/${workspaceId}/status.json?t=${Date.now()}`);
                if (statusRes.ok) {
                    const statusData = await statusRes.json();
                    if (typeof statusData.progress === 'number') {
                        setComposeProgress(statusData.progress);
                    }
                    if (statusData.status) {
                        setComposeStatus(statusData.status);
                        setStatus(statusData.status);
                    }
                }
            } catch (e) { }
        }, 2000);

        try {
            const formData = new FormData();
            formData.append("workspaceId", workspaceId);
            formData.append("audioUrl", generatedAudioUrl || "");
            formData.append("srtUrl", generatedSrtUrl || "");
            if (localAudioFile) {
                formData.append("audioFile", localAudioFile);
            }
            if (localSrtFile) {
                formData.append("srtFile", localSrtFile);
            }

            const scenesList = listToCompose.map(d => {
                const clip = shotClipOffsets[d.sceneNumber];
                return {
                    sceneNumber: d.sceneNumber,
                    durationSeconds: d.durationSeconds || 5,
                    sceneName: d.sceneName,
                    timeRange: d.timeRange,
                    parentSceneNumber: d.parentSceneNumber,
                    startMs: d.startMs,
                    endMs: d.endMs,
                    sourceStartMs: d.shotId && clip?.file === sceneFiles[d.sceneNumber] ? clip?.sourceStartMs : undefined,
                };
            });
            formData.append("scenes", JSON.stringify(scenesList));
            const useShotTimeline = listToCompose.every(shot => shot.shotId);
            if (useShotTimeline) formData.append("useShotTimeline", "true");
            formData.append("storyboardCues", JSON.stringify(storyboardCues));
            formData.append("language", language);
            formData.append("burnSubtitles", burnSubtitles ? "true" : "false");
            formData.append("audioLeadTime", String(audioLeadTime));

            formData.append("transitionType", useAdvancedRender ? transitionType : "none");
            formData.append("transitionDuration", useAdvancedRender ? String(transitionDuration) : "0");
            formData.append("colorPreset", useAdvancedRender ? colorPreset : "none");
            formData.append("showSceneTitle", useAdvancedRender ? (showSceneTitle ? "true" : "false") : "false");
            formData.append("vignette", useAdvancedRender ? (vignette ? "true" : "false") : "false");
            formData.append("filmGrain", useAdvancedRender ? (filmGrain ? "true" : "false") : "false");
            formData.append("subtitleStyle", subtitleStyle);
            formData.append("showProgressBar", useAdvancedRender ? (showProgressBar ? "true" : "false") : "false");
            formData.append("bgmVolume", useAdvancedRender ? String(bgmVolume) : "0");

            formData.append("showIntro", useAdvancedRender ? (showIntro ? "true" : "false") : "false");
            formData.append("introTitle", useAdvancedRender ? introTitle : "");
            formData.append("introSubtitle", useAdvancedRender ? introSubtitle : "");
            formData.append("showOutro", useAdvancedRender ? (showOutro ? "true" : "false") : "false");
            formData.append("outroText", useAdvancedRender ? outroText : "");

            if (useAdvancedRender && bgmFile) {
                formData.append("bgmFile", bgmFile);
            }

            // Local Asset Referencing integration
            listToCompose.forEach((scene) => {
                const file = sceneFiles[scene.sceneNumber];
                if (file) {
                    formData.append(`file_scene_${scene.sceneNumber}`, file);
                }
            });

            logService.addLog("[Composer] Đang gửi tài nguyên lên server và gọi FFmpeg rendering...");
            const res = await fetch("/api/compose", {
                method: "POST",
                body: formData
            });

            clearInterval(intervalId);
            const data = await res.json();
            if (data.success) {
                setComposedVideoUrl(data.videoUrl);
                setComposeProgress(100);
                setComposeStatus("Hoàn tất dựng video!");
                setStatus("Dựng video hoàn tất thành công!");
                logService.addLog(`[Composer] OK | Video URL: ${data.videoUrl}`);
                setActiveTab("compose");

                // Auto copy to custom masterStorageFolder after successful render
                if (masterStorageFolder && masterStorageFolder !== "outputs") {
                    await handleExportProjectFolderSilent(data.videoUrl);
                }
            } else {
                setError(data.error || "Có lỗi xảy ra khi dựng video");
                setStatus("");
                setComposeProgress(0);
                logService.addLog(`[Composer] FAILED | error: ${data.error}`);
            }
        } catch (err) {
            clearInterval(intervalId);
            const message = err instanceof Error ? err.message : "Có lỗi xảy ra";
            setError(message);
            setStatus("");
            setComposeProgress(0);
            logService.addLog(`[Composer] ERROR: ${message}`);
        } finally {
            setComposeLoading(false);
        }
    };

    const handleExportProjectFolderSilent = async (renderedVideoUrl: string) => {
        try {
            const bodyPayload = {
                transcript: transcript || "",
                srtContent: srtContent || "",
                durations: durations || [],
                prompts: prompts || [],
                finalPromptText: finalPromptText || "",
                customFolderPath: masterStorageFolder,
                videoUrl: renderedVideoUrl
            };

            const res = await fetch("/api/export-folder", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bodyPayload)
            });
            const data = await res.json();
            if (data.success) {
                logService.addLog(`[System] Tự động sao chép thành phẩm sang thư mục dự án: ${data.targetDir}`);
            }
        } catch (e) {}
    };

    const handleExportProjectFolder = async () => {
        if (!masterStorageFolder.trim()) {
            setError("Vui lòng nhập đường dẫn thư mục lưu trữ");
            return;
        }

        setIsFolderPicking(true);
        setAutoSaveStatus("Đang lưu...");
        logService.addLog(`[System] Đang ghi file tài nguyên dự án sang: ${masterStorageFolder}`);

        try {
            const bodyPayload = {
                transcript: transcript || "",
                srtContent: srtContent || "",
                durations: durations || [],
                prompts: prompts || [],
                finalPromptText: finalPromptText || "",
                customFolderPath: masterStorageFolder,
                videoUrl: composedVideoUrl
            };

            const res = await fetch("/api/export-folder", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bodyPayload)
            });

            const data = await res.json();
            if (data.success) {
                setAutoSaveStatus("Lưu thành công!");
                logService.addLog(`[System] Hoàn tất ghi tài nguyên dự án sang thư mục: ${data.targetDir}`);
                logService.addLog(`[System] Các tệp đã ghi: ${data.savedFiles.join(', ')}`);
            } else {
                setAutoSaveStatus("Lỗi ghi file");
                logService.addLog(`[System] Lỗi xuất thư mục: ${data.error}`);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setAutoSaveStatus("Lỗi");
            logService.addLog(`[System] Lỗi xuất thư mục: ${message}`);
        } finally {
            setIsFolderPicking(false);
            setTimeout(() => setAutoSaveStatus(null), 3000);
        }
    };

    const handleOpenTargetFolder = async () => {
        if (!masterStorageFolder.trim()) return;
        try {
            logService.addLog(`[System] Yêu cầu mở thư mục: ${masterStorageFolder}`);
            const res = await fetch("/api/open-folder", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ folderPath: masterStorageFolder })
            });
            const data = await res.json();
            if (data.success) {
                logService.addLog(`[System] Đã mở thư mục lưu trữ thành công.`);
            } else {
                logService.addLog(`[System] Lỗi mở thư mục: ${data.error}`);
            }
        } catch (err) {
            logService.addLog(`[System] Lỗi hệ thống khi mở thư mục: ${err instanceof Error ? err.message : String(err)}`);
        }
    };

    const handleSelectFolder = async () => {
        setIsFolderPicking(true);
        try {
            const queryParam = masterStorageFolder ? `?currentPath=${encodeURIComponent(masterStorageFolder)}` : '';
            const res = await fetch(`/api/select-folder${queryParam}`);
            const data = await res.json();
            if (data.success && data.path) {
                saveMasterStorageFolder(data.path);
                logService.addLog(`[Storage] Đã chọn thư mục lưu trữ: ${data.path}`);
            } else if (!data.cancelled) {
                logService.addLog(`[Storage] Không thể chọn thư mục: ${data.error || 'Lỗi không xác định'}`);
            }
        } catch (e) {
            logService.addLog(`[Storage] Lỗi khi mở hộp thoại chọn thư mục: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setIsFolderPicking(false);
        }
    };

    const handleGenerateSeo = async (customSourceText?: string) => {
        setSeoLoading(true);
        setError(null);
        logService.addLog(`[YouTube SEO] Bắt đầu tạo nội dung SEO với ngôn ngữ: ${seoLanguage}`);

        try {
            const res = await fetch("/api/youtube-seo", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    transcript: transcript || "",
                    content: content || "",
                    sourceText: customSourceText || "",
                    language: seoLanguage,
                    provider: provider
                }),
            });

            const data = await res.json();
            if (data.success) {
                setSeoData({
                    titles: data.titles,
                    description: data.description,
                    tags: data.tags,
                    thumbnailPrompt: data.thumbnailPrompt
                });
                setThumbnailPrompt(data.thumbnailPrompt);
                logService.addLog("[YouTube SEO] Tạo nội dung SEO và prompt thumbnail thành công!");
            } else {
                throw new Error(data.error || "Lỗi tạo nội dung SEO");
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logService.addLog(`[YouTube SEO] THẤT BẠI: ${msg}`);
            setError(msg);
        } finally {
            setSeoLoading(false);
        }
    };


    const handleDownloadAllZip = async () => {
        try {
            logService.addLog("[System] Khởi tạo đóng gói dự án thành ZIP...");
            const res = await fetch("/api/download-all", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    transcript,
                    durations,
                    srtContent,
                    prompts,
                    videoUrl: composedVideoUrl,
                    audioUrl: generatedAudioUrl
                })
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || "Lỗi nén tệp ZIP");
            }

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const safeName = projectName.trim()
                ? projectName.trim()
                    .replace(/[\\/:*?"<>|]/g, '_')   // xoá ký tự không hợp lệ trên Windows
                    .replace(/\s+/g, '_')             // khoảng trắng → gạch dưới
                    .replace(/_+/g, '_')              // gộp nhiều _ liên tiếp
                    .replace(/^_|_$/g, '')            // xoá _ đầu/cuối
                : `project_export_${getTimestampString()}`;
            a.download = `${safeName}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            logService.addLog("[System] Đã tải về file ZIP dự án thành công.");
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logService.addLog(`[System] Lỗi tải file ZIP: ${msg}`);
            setError(`Không thể tải ZIP dự án: ${msg}`);
        }
    };

    /**
     * Convert AI-generated prompts (PromptEntry[]) to DurationEntry[] format
     * and apply them to finalPrompts so ImageGenTab can use them directly.
     */
    const handleApplyPromptsToImageGen = () => {
        if (loading.prompt || (provider === 'local' && localPromptClient.incomplete)) {
            setError('Prompt chưa hoàn tất. Hãy tạo/tiếp tục đủ cảnh trước khi áp dụng sang Tạo Ảnh API.');
            return;
        }
        if (!prompts || prompts.length === 0) {
            logService.addLog('[System] Chưa có prompts AI nào để áp dụng. Vui lòng tạo prompts trước.');
            return;
        }
        if (!durations || durations.length === 0) {
            logService.addLog('[System] Chưa có dữ liệu phân cảnh thời lượng (durations) để đối chiếu.');
            return;
        }

        const newFinalPrompts: DurationEntry[] = [];
        let imageCounter = 1;

        const parseTimeStrToMs = (tStr: string, parentStartMs?: number, parentEndMs?: number): number => {
            const cleanStr = tStr.trim().replace(',', '.');
            const parts = cleanStr.split(":");
            let hours = 0, minutes = 0, secondsStr = '0';
            if (parts.length === 3) {
                hours = Number(parts[0]) || 0;
                minutes = Number(parts[1]) || 0;
                secondsStr = parts[2] || '0';
            } else if (parts.length === 2) {
                minutes = Number(parts[0]) || 0;
                secondsStr = parts[1] || '0';
            } else {
                secondsStr = parts[0] || '0';
            }
            const secParts = secondsStr.split('.');
            const seconds = Number(secParts[0]) || 0;
            const ms = Number((secParts[1] || '0').padEnd(3, '0').substring(0, 3)) || 0;
            const parsedMs = hours * 3600000 + minutes * 60000 + seconds * 1000 + ms;

            if (parentStartMs !== undefined && parentEndMs !== undefined) {
                if (parsedMs >= parentStartMs - 5000 && parsedMs <= parentEndMs + 5000) {
                    return parsedMs;
                }
                const parentStartMin = Math.floor(parentStartMs / 60000);
                const parentStartHour = Math.floor(parentStartMs / 3600000);
                
                const altMsA = parentStartHour * 3600000 + parentStartMin * 60000 + seconds * 1000 + ms;
                if (altMsA >= parentStartMs - 5000 && altMsA <= parentEndMs + 5000) {
                    return altMsA;
                }
                const altMsB = parentStartHour * 3600000 + (parentStartMin + 1) * 60000 + seconds * 1000 + ms;
                if (altMsB >= parentStartMs - 5000 && altMsB <= parentEndMs + 5000) {
                    return altMsB;
                }
                if (parts.length === 2) {
                    const altMsC = parentStartHour * 3600000 + parentStartMin * 60000 + minutes * 1000 + ms;
                    if (altMsC >= parentStartMs - 5000 && altMsC <= parentEndMs + 5000) {
                        return altMsC;
                    }
                    const altMsD = parentStartHour * 3600000 + (parentStartMin + 1) * 60000 + minutes * 1000 + ms;
                    if (altMsD >= parentStartMs - 5000 && altMsD <= parentEndMs + 5000) {
                        return altMsD;
                    }
                }
            }
            return parsedMs;
        };

        const formatTime = (secs: number) => {
            const h = Math.floor(secs / 3600);
            const m = Math.floor((secs % 3600) / 60);
            const s = Math.floor(secs % 60);
            const ms = Math.round((secs % 1) * 1000);
            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
        };

        for (const scene of durations) {
            const entry = prompts.find(p => p.sceneNumber === scene.sceneNumber);
            
            if (!entry || !entry.prompts || entry.prompts.length === 0) {
                const sceneStartMs = typeof scene.startMs === 'number' ? scene.startMs : (scene.timeRange && scene.timeRange.includes('-') ? parseTimeStrToMs(scene.timeRange.split('-')[0]) : (scene.sceneNumber - 1) * 5000);
                const durationMs = typeof scene.durationMs === 'number' ? scene.durationMs : Math.round((scene.durationSeconds || 5) * 1000);
                const endMs = sceneStartMs + durationMs;

                newFinalPrompts.push({
                    sceneNumber: imageCounter++,
                    sceneName: `Cảnh ${scene.sceneNumber} - Ảnh 1: ${scene.sceneName.slice(0, 80)}`,
                    duration: `${(durationMs / 1000).toFixed(1)}s`,
                    durationSeconds: parseFloat((durationMs / 1000).toFixed(3)),
                    durationMs,
                    startMs: sceneStartMs,
                    endMs,
                    timeRange: `${formatTime(sceneStartMs / 1000)}-${formatTime(endMs / 1000)}`,
                    parentSceneNumber: scene.sceneNumber,
                    imageNumber: 1,
                    imagePrompt: scene.sceneName
                });
                continue;
            }

            const parentStartMs = typeof scene.startMs === 'number' ? scene.startMs : (scene.timeRange && scene.timeRange.includes('-') ? parseTimeStrToMs(scene.timeRange.split('-')[0]) : (scene.sceneNumber - 1) * 5000);
            const parentDurationMs = typeof scene.durationMs === 'number' ? scene.durationMs : Math.round((scene.durationSeconds || 5) * 1000);
            const parentEndMs = parentStartMs + parentDurationMs;

            const subPromptsWithWeights = entry.prompts.map(sub => {
                let weightMs = 5000;
                if (sub.timeRange && sub.timeRange.includes('-')) {
                    const times = sub.timeRange.split('-').map(t => t.trim());
                    const start = parseTimeStrToMs(times[0], parentStartMs, parentEndMs);
                    const end = parseTimeStrToMs(times[1], parentStartMs, parentEndMs);
                    if (end > start) weightMs = end - start;
                }
                return { sub, weightMs };
            });

            const totalWeightMs = subPromptsWithWeights.reduce((sum, item) => sum + item.weightMs, 0);

            let currentStartMs = parentStartMs;
            subPromptsWithWeights.forEach((item, idx) => {
                const isLast = idx === subPromptsWithWeights.length - 1;
                let itemDurationMs = 5000;

                if (totalWeightMs > 0) {
                    itemDurationMs = Math.round(parentDurationMs * (item.weightMs / totalWeightMs));
                } else {
                    itemDurationMs = Math.round(parentDurationMs / subPromptsWithWeights.length);
                }

                let itemEndMs;
                if (isLast) {
                    itemEndMs = parentEndMs;
                    itemDurationMs = itemEndMs - currentStartMs;
                } else {
                    itemEndMs = currentStartMs + itemDurationMs;
                }

                newFinalPrompts.push({
                    sceneNumber: imageCounter++,
                    sceneName: `Cảnh ${scene.sceneNumber} - Ảnh ${item.sub.imageNumber}: ${item.sub.prompt.slice(0, 80)}`,
                    duration: `${(itemDurationMs / 1000).toFixed(1)}s`,
                    durationSeconds: parseFloat((itemDurationMs / 1000).toFixed(3)),
                    durationMs: itemDurationMs,
                    startMs: currentStartMs,
                    endMs: itemEndMs,
                    timeRange: `${formatTime(currentStartMs / 1000)}-${formatTime(itemEndMs / 1000)}`,
                    parentSceneNumber: scene.sceneNumber,
                    imageNumber: item.sub.imageNumber,
                    imagePrompt: item.sub.prompt
                });

                currentStartMs = itemEndMs;
            });
        }

        if (newFinalPrompts.length > 0) {
            if (provider === 'local' && localPromptClient.progressive) {
                const changed = new Set(finalPrompts.filter(old => {
                    const next = newFinalPrompts.find(item => item.sceneNumber === old.sceneNumber);
                    return !next || next.imagePrompt !== old.imagePrompt || next.timeRange !== old.timeRange ||
                        next.parentSceneNumber !== old.parentSceneNumber || next.imageNumber !== old.imageNumber;
                }).map(item => item.sceneNumber));
                for (const id of Object.keys({ ...sceneFiles, ...motionLayers })) {
                    if (!finalPrompts.some(item => item.sceneNumber === Number(id))) changed.add(Number(id));
                }
                const keep = <T,>(entries: Record<number, T>) => Object.fromEntries(
                    Object.entries(entries).filter(([id]) => !changed.has(Number(id)))
                );
                setSceneFiles(keep);
                setMotionLayers(keep);
                if (changed.size) {
                    setComposedVideoUrl(null);
                    setMotionPlans([]);
                    logService.addLog(`[API local] Đã bỏ ánh xạ ảnh/layer cũ của ${changed.size} ảnh có prompt hoặc timeline thay đổi.`);
                }
            }
            setFinalPrompts(newFinalPrompts);
            setActiveTab('compose');
            logService.addLog(`[System] Đã áp dụng và đồng bộ hóa thành công ${newFinalPrompts.length} ảnh/prompts theo thời lượng thực tế của Audio/SRT.`);
        } else {
            logService.addLog('[System] Không tìm thấy sub-prompt nào hợp lệ.');
        }
    };

    return {
        content, setContent,
        transcript, setTranscript,
        durations, setDurations,
        prompts, setPrompts,
        localPromptIncomplete: provider === 'local' && localPromptClient.incomplete,
        loading, setLoading,
        error, setError,
        activeTab, setActiveTab,
        provider,
        longForm, setLongForm,
        promptStyle, setPromptStyle,
        promptLanguage, setPromptLanguage,
        sendTranscript, setSendTranscript,
        rewriteWithAi, setRewriteWithAi,
        keepOrExpandDuration, setKeepOrExpandDuration,
        status, setStatus,
        progress, setProgress,
        srtContent, setSrtContent,
        ttsVoice, setTtsVoice,
        generatedAudioUrl, setGeneratedAudioUrl,
        ttsLoading, setTtsLoading,
        ttsProgress, setTtsProgress,
        ttsStatus, setTtsStatus,
        ttsError, setTtsError,
        language, setLanguage,
        ttsEngine, setTtsEngine,
        genmaxApiKey, setGenmaxApiKey,
        genmaxProvider, setGenmaxProvider,
        genmaxVoiceId, setGenmaxVoiceId,
        genmaxModelId, setGenmaxModelId,
        beeknoeeApiKey, saveBeeknoeeApiKey,
        beeknoeeModel, saveBeeknoeeModel,
        beeknoeeVoice, saveBeeknoeeVoice,
        favoriteVoices, setFavoriteVoices,
        newFavName, setNewFavName,
        generatedSrtUrl, setGeneratedSrtUrl,
        sceneFiles, setSceneFiles,
        storyboardCues, setStoryboardCues,
        motionDirectorEnabled, setMotionDirectorEnabled,
        motionPlans, setMotionPlans,
        motionLayers, setMotionLayers,
        composeLoading, setComposeLoading,
        composedVideoUrl, setComposedVideoUrl,
        localAudioFile, setLocalAudioFile,
        localSrtFile, setLocalSrtFile,
        finalPromptText, setFinalPromptText,
        finalPrompts, setFinalPrompts,
        burnSubtitles, setBurnSubtitles,
        composeProgress, setComposeProgress,
        composeStatus, setComposeStatus,
        audioLeadTime, setAudioLeadTime,
        useAdvancedRender, setUseAdvancedRender,
        transitionType, setTransitionType,
        transitionDuration, setTransitionDuration,
        colorPreset, setColorPreset,
        showSceneTitle, setShowSceneTitle,
        bgmFile, setBgmFile,
        bgmVolume, setBgmVolume,
        showIntro, setShowIntro,
        introTitle, setIntroTitle,
        introSubtitle, setIntroSubtitle,
        showOutro, setShowOutro,
        outroText, setOutroText,
        vignette, setVignette,
        filmGrain, setFilmGrain,
        subtitleStyle, setSubtitleStyle,
        showProgressBar, setShowProgressBar,
        masterStorageFolder, setMasterStorageFolder,
        projectName, setProjectName,
        isFolderPicking, setIsFolderPicking,
        autoSaveStatus, setAutoSaveStatus,

        // SEO & Thumbnail states
        seoLanguage, setSeoLanguage,
        seoData, setSeoData,
        seoLoading,
        thumbnailPrompt, setThumbnailPrompt,

        // Handlers
        getTimestampString,
        saveMasterStorageFolder,
        addFavoriteVoice,
        deleteFavoriteVoice,
        downloadTranscript,
        downloadSrt,
        downloadDurations,
        downloadPrompts,
        handleFileUpload,
        handleSrtUpload,
        handleImportDurations,
        handleImportFinalPrompt,
        handleApplyFinalPromptText,
        handleUpdateDurationsRaw,
        handleUpdatePrompt,
        handleBatchAutoMap,
        handleGenerateTranscript,
        handleGenerateDuration,
        handleCheckAndFixDurations,
        handleAutoFillMissingSubs,
        handleGeneratePrompt,
        handleCheckAndFixPrompts,
        handleGenerateTTS,
        handleGenerateAll,
        handleUploadSceneFile,
        handleComposeVideo,
        handleApplyVideoShots,
        handleExportProjectFolder,
        handleOpenTargetFolder,
        handleSelectFolder,
        handleDownloadAllZip,
        handleGenerateSeo,
        handleApplyPromptsToImageGen,
    };
}
