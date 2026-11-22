import React, { useState, useCallback, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Upload, Clock, Download, Play, Activity, ExternalLink, Sparkles, AlertCircle, CheckCircle2, RefreshCw, ShieldCheck, ShieldAlert, ShieldX, AudioLines } from "lucide-react";
import type { DurationEntry } from '@/types';
import type { StoryboardCue } from '@/core/storyboard/Storyboard';
import { StoryboardPanel } from './StoryboardPanel';

// Keep the storyboard feature available in code while hiding it from the composer UI.
const SHOW_STORYBOARD_PANEL = false;

function ClipPreview({ file }: { file: File }) {
    const [url, setUrl] = useState('');
    useEffect(() => {
        const previewUrl = URL.createObjectURL(file);
        setUrl(previewUrl);
        return () => URL.revokeObjectURL(previewUrl);
    }, [file]);
    return <video src={url || undefined} controls preload="metadata" className="w-full h-full object-cover" />;
}

interface VideoComposerProps {
    durations: DurationEntry[];
    finalPrompts: DurationEntry[];
    sceneFiles: Record<number, File>;
    storyboardCues: StoryboardCue[];
    setStoryboardCues: (cues: StoryboardCue[]) => void;
    language: string;
    generatedAudioUrl: string | null;
    setGeneratedAudioUrl: (val: string | null) => void;
    generatedSrtUrl: string | null;
    setGeneratedSrtUrl: (val: string | null) => void;
    localAudioFile: File | null;
    setLocalAudioFile: (val: File | null) => void;
    localSrtFile: File | null;
    setLocalSrtFile: (val: File | null) => void;
    burnSubtitles: boolean;
    setBurnSubtitles: (val: boolean) => void;
    audioLeadTime: number;
    setAudioLeadTime: (val: number) => void;
    useAdvancedRender: boolean;
    setUseAdvancedRender: (val: boolean) => void;
    transitionType: string;
    setTransitionType: (val: string) => void;
    transitionDuration: number;
    setTransitionDuration: (val: number) => void;
    colorPreset: string;
    setColorPreset: (val: string) => void;
    showSceneTitle: boolean;
    setShowSceneTitle: (val: boolean) => void;
    bgmFile: File | null;
    setBgmFile: (val: File | null) => void;
    bgmVolume: number;
    setBgmVolume: (val: number) => void;
    showIntro: boolean;
    setShowIntro: (val: boolean) => void;
    introTitle: string;
    setIntroTitle: (val: string) => void;
    introSubtitle: string;
    setIntroSubtitle: (val: string) => void;
    showOutro: boolean;
    setShowOutro: (val: boolean) => void;
    outroText: string;
    setOutroText: (val: string) => void;
    vignette: boolean;
    setVignette: (val: boolean) => void;
    filmGrain: boolean;
    setFilmGrain: (val: boolean) => void;
    subtitleStyle: string;
    setSubtitleStyle: (val: string) => void;
    showProgressBar: boolean;
    setShowProgressBar: (val: boolean) => void;
    composeLoading: boolean;
    composeProgress: number;
    composeStatus: string;
    composedVideoUrl: string | null;
    handleImportDurations: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleImportFinalPrompt: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleBatchAutoMap: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleUploadSceneFile: (sceneNumber: number, file: File) => void;
    handleComposeVideo: () => Promise<void>;
    handleDownloadAllZip: () => Promise<void>;
    getTimestampString: () => string;
}

interface GroupedScene {
    sceneNumber: number;
    sceneName: string;
    images: Array<{
        flatIndex: number;
        imageNumber: number;
        duration: string;
        durationSeconds: number;
        timeRange: string;
        sceneName: string;
    }>;
}

export function VideoComposer({
    durations,
    finalPrompts,
    sceneFiles,
    storyboardCues,
    setStoryboardCues,
    language,
    generatedAudioUrl,
    setGeneratedAudioUrl,
    generatedSrtUrl,
    setGeneratedSrtUrl,
    localAudioFile,
    setLocalAudioFile,
    localSrtFile,
    setLocalSrtFile,
    burnSubtitles,
    setBurnSubtitles,
    audioLeadTime,
    setAudioLeadTime,
    useAdvancedRender,
    setUseAdvancedRender,
    transitionType,
    setTransitionType,
    transitionDuration,
    setTransitionDuration,
    colorPreset,
    setColorPreset,
    showSceneTitle,
    setShowSceneTitle,
    bgmFile,
    setBgmFile,
    bgmVolume,
    setBgmVolume,
    showIntro,
    setShowIntro,
    introTitle,
    setIntroTitle,
    introSubtitle,
    setIntroSubtitle,
    showOutro,
    setShowOutro,
    outroText,
    setOutroText,
    vignette,
    setVignette,
    filmGrain,
    setFilmGrain,
    subtitleStyle,
    setSubtitleStyle,
    showProgressBar,
    setShowProgressBar,
    composeLoading,
    composeProgress,
    composeStatus,
    composedVideoUrl,
    handleImportDurations,
    handleImportFinalPrompt,
    handleBatchAutoMap,
    handleUploadSceneFile,
    handleComposeVideo,
    handleDownloadAllZip,
    getTimestampString
}: VideoComposerProps) {

    // ─── Sync Check State ───────────────────────────────────────────────────────
    const [syncChecking, setSyncChecking] = useState(false);
    const [syncResult, setSyncResult] = useState<{
        status: 'ok' | 'warn' | 'danger' | null;
        totalImageDuration: number;
        audioDuration: number | null;
        diff: number | null;
        diffPercent: number | null;
        message: string;
        details: string[];
    } | null>(null);

    /** Đọc thời lượng audio từ file upload (Web Audio API) */
    const getAudioFileDuration = useCallback((file: File): Promise<number> => {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const audio = new Audio();
            audio.preload = 'metadata';
            audio.onloadedmetadata = () => {
                URL.revokeObjectURL(url);
                resolve(audio.duration);
            };
            audio.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Không thể đọc metadata audio'));
            };
            audio.src = url;
        });
    }, []);

    /** Đọc thời lượng tối đa từ file SRT (timestamp cuối cùng) */
    const getSrtDuration = useCallback((file: File): Promise<number> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target?.result as string;
                if (!text) return reject(new Error('File SRT rỗng'));
                // Tìm tất cả timestamp dạng HH:MM:SS,mmm --> HH:MM:SS,mmm
                const timeRegex = /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/g;
                let lastEnd = 0;
                let m: RegExpExecArray | null;
                while ((m = timeRegex.exec(text)) !== null) {
                    const h = parseInt(m[5]), min = parseInt(m[6]), s = parseInt(m[7]), ms = parseInt(m[8]);
                    const endSec = h * 3600 + min * 60 + s + ms / 1000;
                    if (endSec > lastEnd) lastEnd = endSec;
                }
                resolve(lastEnd);
            };
            reader.onerror = () => reject(new Error('Không thể đọc file SRT'));
            reader.readAsText(file, 'utf-8');
        });
    }, []);

    const handleSyncCheck = useCallback(async () => {
        setSyncChecking(true);
        setSyncResult(null);
        const details: string[] = [];

        try {
            const listToCheck = finalPrompts.length > 0 ? finalPrompts : durations;
            const totalImageDuration = listToCheck.reduce((sum, d) => sum + (d.durationSeconds || 5), 0);
            details.push(`📽️ Tổng thời lượng ảnh: ${totalImageDuration.toFixed(2)}s (${listToCheck.length} ảnh)`);

            // --- Analyze scene-level silence gaps from timeRange data ---
            // Parse timeRange "HH:MM:SS,mmm - HH:MM:SS,mmm" into start/end seconds
            const parseSrtTimeSec = (t: string): number => {
                if (!t) return 0;
                const clean = t.trim().replace(',', '.');
                const parts = clean.split(':');
                if (parts.length !== 3) return 0;
                return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
            };

            // Group images by parent scene and find scene-level boundaries
            const sceneMap = new Map<number, { startSec: number; endSec: number }>();
            for (const item of listToCheck) {
                const parentId = item.parentSceneNumber || item.sceneNumber;
                const tr = item.timeRange || '';
                const sepIdx = tr.indexOf(' - ');
                if (sepIdx === -1) continue;
                const startSec = parseSrtTimeSec(tr.slice(0, sepIdx).trim());
                const endSec = parseSrtTimeSec(tr.slice(sepIdx + 3).trim());
                if (!sceneMap.has(parentId)) {
                    sceneMap.set(parentId, { startSec, endSec });
                } else {
                    const existing = sceneMap.get(parentId)!;
                    if (startSec < existing.startSec) existing.startSec = startSec;
                    if (endSec > existing.endSec) existing.endSec = endSec;
                }
            }

            // Compute gaps between consecutive scenes
            const sceneEntries = [...sceneMap.entries()].sort((a, b) => a[1].startSec - b[1].startSec);
            let totalGapSec = 0;
            let gapCount = 0;
            let maxGapSec = 0;
            let maxGapLocation = '';
            for (let i = 1; i < sceneEntries.length; i++) {
                const gap = sceneEntries[i][1].startSec - sceneEntries[i - 1][1].endSec;
                if (gap > 0.05) { // Gaps > 50ms
                    totalGapSec += gap;
                    gapCount++;
                    if (gap > maxGapSec) {
                        maxGapSec = gap;
                        maxGapLocation = `Scene ${sceneEntries[i - 1][0]} → ${sceneEntries[i][0]}`;
                    }
                }
            }

            if (gapCount > 0) {
                details.push(`🔇 Khoảng lặng tự nhiên: ${gapCount} gaps, tổng ${totalGapSec.toFixed(2)}s (TB: ${((totalGapSec / gapCount) * 1000).toFixed(0)}ms | Max: ${(maxGapSec * 1000).toFixed(0)}ms tại ${maxGapLocation})`);
            }

            let audioDuration: number | null = null;

            // Thử đọc từ file audio upload
            if (localAudioFile) {
                try {
                    audioDuration = await getAudioFileDuration(localAudioFile);
                    details.push(`🎵 Thời lượng audio (${localAudioFile.name}): ${audioDuration.toFixed(2)}s`);
                } catch {
                    details.push('⚠️ Không đọc được thời lượng từ file audio upload');
                }
            }

            // Thử đọc từ file SRT upload (kết quả phụ)
            if (localSrtFile) {
                try {
                    const srtDur = await getSrtDuration(localSrtFile);
                    details.push(`📄 Thời lượng SRT (${localSrtFile.name}): ${srtDur.toFixed(2)}s`);
                    if (audioDuration === null) audioDuration = srtDur;
                } catch {
                    details.push('⚠️ Không đọc được timestamp từ file SRT');
                }
            }

            if (audioDuration === null) {
                details.push('ℹ️ Không có file audio/SRT cục bộ — không thể đo chính xác thời lượng audio từ URL server');
            }

            let status: 'ok' | 'warn' | 'danger' | null = null;
            let diff: number | null = null;
            let diffPercent: number | null = null;
            let message = '';

            if (audioDuration !== null && audioDuration > 0) {
                diff = totalImageDuration - audioDuration;
                const absDiff = Math.abs(diff);
                diffPercent = (absDiff / audioDuration) * 100;

                // Determine how much of the diff is explained by natural silence gaps
                const unexplainedDiff = Math.max(0, absDiff - totalGapSec);
                const gapExplainsPercent = totalGapSec > 0 && absDiff > 0
                    ? Math.min(100, (totalGapSec / absDiff) * 100)
                    : 0;

                details.push(`⏱️ Chênh lệch nguyên liệu: ${absDiff.toFixed(2)}s`);

                if (gapCount > 0 && gapExplainsPercent > 80) {
                    // Silence gaps explain most of the difference — this is normal
                    details.push(`   ├─ 🔇 Khoảng lặng tự nhiên (${gapCount} gaps): ${totalGapSec.toFixed(2)}s (${gapExplainsPercent.toFixed(0)}%)`);
                    details.push(`   ├─ 🎵 Audio buffer/trailing: ${unexplainedDiff.toFixed(2)}s (${(100 - gapExplainsPercent).toFixed(0)}%)`);
                    details.push(`   └─ ✅ Toàn bộ sẽ được bù tự động bởi TimelineBuilder`);
                } else if (gapCount > 0) {
                    details.push(`   ├─ 🔇 Khoảng lặng tự nhiên: ${totalGapSec.toFixed(2)}s`);
                    details.push(`   └─ ⚠️ Phần chênh lệch ngoài khoảng lặng: ${unexplainedDiff.toFixed(2)}s`);
                }

                // Adjust status based on whether gap explains the diff
                if (gapExplainsPercent > 80 && diffPercent <= 3) {
                    status = 'ok';
                    message = `✅ Đồng bộ tốt — lệch ${absDiff.toFixed(2)}s do khoảng lặng tự nhiên (${gapCount} gaps)`;
                } else if (diffPercent <= 3) {
                    status = 'ok';
                    message = `✅ Đồng bộ tốt — lệch ${absDiff.toFixed(2)}s (${diffPercent.toFixed(1)}%)`;
                } else if (diffPercent <= 10) {
                    status = gapExplainsPercent > 80 ? 'ok' : 'warn';
                    if (gapExplainsPercent > 80) {
                        message = `✅ Chấp nhận được — lệch ${absDiff.toFixed(2)}s, 100% do ${gapCount} khoảng lặng tự nhiên giữa câu phụ đề`;
                    } else {
                        const dir = diff > 0 ? 'ảnh dài hơn audio' : 'audio dài hơn ảnh';
                        message = `⚠️ Lệch vừa phải — ${absDiff.toFixed(2)}s (${diffPercent.toFixed(1)}%) — ${dir}`;
                    }
                } else {
                    status = 'danger';
                    const dir = diff > 0 ? 'ảnh DÀI hơn audio' : 'audio DÀI hơn ảnh';
                    message = `❌ Lệch nhiều — ${absDiff.toFixed(2)}s (${diffPercent.toFixed(1)}%) — ${dir}`;
                }

                // Final summary
                if (diff > 0) {
                    details.push(`📊 Ảnh dài hơn audio ${diff.toFixed(2)}s → video sẽ có phần ảnh tĩnh cuối`);
                } else if (diff < 0) {
                    details.push(`📊 Audio dài hơn ảnh ${Math.abs(diff).toFixed(2)}s → ✅ Đã xử lý tự động: hệ thống scale ảnh & pad scene cuối để audio phát đầy đủ`);
                } else {
                    details.push('📊 Thời lượng khớp hoàn hảo!');
                }

                details.push('');
                details.push(`🎬 Sau khi dựng: Timeline sẽ contiguous — scene trước mỗi gap tự động kéo dài, scene cuối lock vào audio duration`);
            } else {
                status = null;
                message = 'ℹ️ Không thể so sánh — tải file audio/SRT lên để kiểm tra chính xác';
            }

            setSyncResult({ status, totalImageDuration, audioDuration, diff, diffPercent, message, details });
        } catch (err) {
            setSyncResult({
                status: 'danger',
                totalImageDuration: 0,
                audioDuration: null,
                diff: null,
                diffPercent: null,
                message: `❌ Lỗi kiểm tra: ${err instanceof Error ? err.message : String(err)}`,
                details: []
            });
        } finally {
            setSyncChecking(false);
        }
    }, [durations, finalPrompts, localAudioFile, localSrtFile, getAudioFileDuration, getSrtDuration]);

    const getGroupedScenes = (): GroupedScene[] => {
        const listToRender = finalPrompts.length > 0 ? finalPrompts : durations;
        if (!listToRender || listToRender.length === 0) return [];

        const groups: Record<number, GroupedScene> = {};
        
        listToRender.forEach((item) => {
            const isPrompt = finalPrompts.length > 0;
            const parentId = item.shotId ? item.sceneNumber : isPrompt ? (item.parentSceneNumber || 1) : item.sceneNumber;
            
            if (!groups[parentId]) {
                let cleanName = item.sceneName;
                if (isPrompt) {
                    const colonIdx = cleanName.indexOf(":");
                    if (colonIdx !== -1) {
                        cleanName = cleanName.substring(0, colonIdx).trim();
                    }
                    // Clean up the "- Ảnh X" or "- Image X" suffix so the header just says "Cảnh X"
                    cleanName = cleanName.replace(/\s*-\s*(?:Ảnh|Image)\s*\d+/i, "").trim();
                }
                
                groups[parentId] = {
                    sceneNumber: parentId,
                    sceneName: cleanName,
                    images: []
                };
            }
            
            groups[parentId].images.push({
                flatIndex: item.sceneNumber,
                imageNumber: item.imageNumber || 1,
                duration: item.duration,
                durationSeconds: item.durationSeconds || 5,
                timeRange: item.timeRange,
                sceneName: item.sceneName
            });
        });
        
        return Object.values(groups).sort((a, b) => a.sceneNumber - b.sceneNumber);
    };

    const groupedScenes = getGroupedScenes();
    const hasAudio = !!generatedAudioUrl || !!localAudioFile;
    const hasSrt = !!generatedSrtUrl || !!localSrtFile;
    const hasFinalPrompt = finalPrompts.length > 0;
    const hasDuration = durations.length > 0;

    const listToComposeForCheck = finalPrompts.length > 0 ? finalPrompts : durations;
    // Updated check: Scene is mapped if either local file is uploaded OR server url is generated
    const allImagesMapped = listToComposeForCheck.length > 0 && listToComposeForCheck.every(d => !!sceneFiles[d.sceneNumber]);
    const isComposeDisabled = !hasAudio || !hasSrt || !allImagesMapped || !hasFinalPrompt || !hasDuration;

    const totalScenes = listToComposeForCheck.length;
    const mappedCount = listToComposeForCheck.filter(d => !!sceneFiles[d.sceneNumber]).length;
    const mapPercent = totalScenes > 0 ? Math.round((mappedCount / totalScenes) * 100) : 0;

    return (
        <div className="space-y-4 outline-none focus:outline-none">
            {SHOW_STORYBOARD_PANEL && <StoryboardPanel shots={listToComposeForCheck} cues={storyboardCues} setCues={setStoryboardCues} language={language}
                localSrtFile={localSrtFile} generatedSrtUrl={generatedSrtUrl} sceneFiles={sceneFiles} imageGenUrls={{}} />}
            <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-white/5 pb-3 gap-3">
                <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-400 tracking-wide uppercase">Cấu hình ghép nối phân cảnh</span>
                    <span className="text-[11px] text-slate-500 mt-0.5">Tải lên ảnh (.png, .jpg) hoặc video (.mp4) tương ứng với từng cảnh</span>
                </div>
                <div className="flex items-center gap-2">
                    <label className="cursor-pointer">
                        <input
                            type="file"
                            accept=".txt"
                            onChange={handleImportDurations}
                            className="hidden"
                        />
                        <span className="inline-flex items-center gap-1.5 h-9 px-3 border border-white/10 hover:border-primary/40 bg-white/2 hover:bg-white/5 rounded-lg text-xs font-semibold text-slate-300 transition-all">
                            <Upload className="h-3.5 w-3.5 text-slate-400" />
                            Nạp file Cảnh (.txt)
                        </span>
                    </label>

                    <label className="cursor-pointer">
                        <input
                            type="file"
                            accept=".txt"
                            onChange={handleImportFinalPrompt}
                            className="hidden"
                        />
                        <span className="inline-flex items-center gap-1.5 h-9 px-3 border border-white/10 hover:border-primary/40 bg-white/2 hover:bg-white/5 rounded-lg text-xs font-semibold text-slate-300 transition-all">
                            <Upload className="h-3.5 w-3.5 text-slate-400" />
                            Nạp file Final Prompt (.txt)
                        </span>
                    </label>



                    <label className="cursor-pointer">
                        <input
                            type="file"
                            {...{ webkitdirectory: "", directory: "" } as any}
                            onChange={handleBatchAutoMap}
                            className="hidden"
                        />
                        <span className="inline-flex items-center gap-1.5 h-9 px-3 border border-dashed border-white/20 hover:border-primary/40 bg-white/2 hover:bg-white/5 rounded-lg text-xs font-semibold text-slate-300 transition-all">
                            <Upload className="h-3.5 w-3.5 text-slate-400" />
                            Chọn thư mục ảnh/video
                        </span>
                    </label>
                </div>
            </div>

            {/* Manual Audio/SRT inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-900/40 p-4 rounded-xl border border-white/5">
                {/* Audio Section */}
                <div className="flex flex-col gap-2">
                    <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Cấu hình Âm thanh (Audio)</span>
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500 font-medium">Tải lên file âm thanh vật lý (.mp3, .wav)</span>
                        <input
                            type="file"
                            accept="audio/*"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) setLocalAudioFile(file);
                            }}
                            className="file:mr-3 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-[10px] file:font-semibold file:bg-white/5 file:text-slate-300 hover:file:bg-white/10 text-[11px] text-slate-400 h-9 flex items-center bg-slate-950 border border-white/10 rounded-lg px-2"
                        />
                        {localAudioFile && (
                            <span className="text-[10px] text-emerald-400 font-medium mt-0.5">
                                ✓ Đã chọn: {localAudioFile.name}
                            </span>
                        )}
                    </div>
                </div>

                {/* SRT Section */}
                <div className="flex flex-col gap-2">
                    <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Cấu hình Phụ đề (SRT) & Font Tiếng Nhật</span>
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500 font-medium">Tải lên file SRT phụ đề vật lý (.srt)</span>
                        <input
                            type="file"
                            accept=".srt"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) setLocalSrtFile(file);
                            }}
                            className="file:mr-3 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-[10px] file:font-semibold file:bg-white/5 file:text-slate-300 hover:file:bg-white/10 text-[11px] text-slate-400 h-9 flex items-center bg-slate-950 border border-white/10 rounded-lg px-2"
                        />
                        {localSrtFile && (
                            <span className="text-[10px] text-emerald-400 font-medium mt-0.5">
                                ✓ Đã chọn: {localSrtFile.name}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                        <input
                            type="checkbox"
                            id="burn-subtitles"
                            checked={burnSubtitles}
                            onChange={(e) => setBurnSubtitles(e.target.checked)}
                            className="h-4 w-4 rounded border-white/20 bg-slate-950 text-primary focus:ring-primary/30 cursor-pointer"
                        />
                        <label htmlFor="burn-subtitles" className="text-[11px] text-slate-300 font-semibold select-none cursor-pointer">
                            Tích hợp (Hardcode) phụ đề vào video
                        </label>
                    </div>

                    {burnSubtitles && (
                        <div className="flex flex-col gap-1 mt-1">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Kiểu phụ đề</span>
                            <select
                                value={subtitleStyle}
                                onChange={(e) => setSubtitleStyle(e.target.value)}
                                className="h-9 rounded-lg border border-white/10 bg-slate-950 px-3 text-xs text-slate-200 focus:border-primary/40 outline-none w-full cursor-pointer"
                            >
                                <option value="japanese_modern">🇯🇵 Tiếng Nhật - Modern (Trắng Bold, Viền Đen, Font Yu Gothic)</option>
                                <option value="japanese_anime">🇯🇵 Tiếng Nhật - Anime Gold (Vàng Nổi Bật, Font Meiryo)</option>
                                <option value="japanese_box">🇯🇵 Tiếng Nhật - Chữ trắng viền đen, nền tối bán trong suốt</option>
                                <option value="japanese_cinematic">🇯🇵 Tiếng Nhật - Cinematic (Vàng Kim, Viền Đen Sẫm)</option>
                                <option value="japanese_center_big">🇯🇵 Tiếng Nhật - Chữ Lớn Chính Giữa Màn Hình</option>
                                <option value="korean_modern">🇰🇷 Tiếng Hàn - Chữ trắng viền đen, nền tối bán trong suốt</option>
                                <option value="modern">Tiếng Anh/Việt - Modern (Arial Bold)</option>
                                <option value="box">Tiếng Anh/Việt - Hộp Đen Mờ</option>
                                <option value="cinematic">Tiếng Anh/Việt - Cinematic</option>
                                <option value="centered_big">Tiếng Anh/Việt - Chữ Lớn Chính Giữa</option>
                                <option value="default">Mặc định (Chữ trắng viền đen, nền tối bán trong suốt)</option>
                            </select>
                        </div>
                    )}
                </div>
            </div>

            {/* J-cut options */}
            <div className="bg-slate-900/40 p-4 rounded-xl border border-white/5 flex flex-wrap gap-4 items-center">
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-slate-450 font-bold uppercase tracking-wider">Hiệu ứng J-Cut (Mặc định: 0.4 giây)</span>
                    <span className="text-[10px] text-slate-500">Audio dẫn trước Visual bao nhiêu giây khi chuyển cảnh</span>
                </div>
                <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1.5"
                    value={audioLeadTime}
                    onChange={(e) => setAudioLeadTime(parseFloat(e.target.value) || 0)}
                    className="h-9 w-24 rounded-lg border border-white/10 bg-slate-950 px-3 text-xs text-slate-200 focus:border-primary/40 outline-none font-mono"
                />
            </div>

            {/* Advanced Composer Options Toggle */}
            <div className="rounded-xl border border-white/5 bg-slate-950/40 p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Cấu hình dựng phim nâng cao (FFmpeg Filters)</span>
                        <span className="text-[10px] text-slate-500 mt-0.5">Chuyển cảnh, hiệu chỉnh màu, nhạc nền, intro và outro.</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="use-advanced-render"
                            checked={useAdvancedRender}
                            onChange={(e) => setUseAdvancedRender(e.target.checked)}
                            className="h-4 w-4 rounded border-white/10 bg-slate-900 text-primary focus:ring-primary/30 cursor-pointer"
                        />
                        <label htmlFor="use-advanced-render" className="text-xs text-slate-350 font-bold cursor-pointer select-none">
                            Kích hoạt
                        </label>
                    </div>
                </div>

                {useAdvancedRender && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-3 border-t border-white/5">
                        <div className="space-y-3">

                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1">
                                    <span className="text-[11px] text-slate-450 font-bold uppercase tracking-wide">Chuyển cảnh (Xfade)</span>
                                    <select
                                        value={transitionType}
                                        onChange={(e) => setTransitionType(e.target.value)}
                                        className="h-9 rounded-lg border border-white/10 bg-slate-950 px-3 text-xs text-slate-200 outline-none w-full"
                                    >
                                        <option value="none">Cắt thẳng (Không hiệu ứng)</option>
                                        <option value="fade">Hòa tan (Fade)</option>
                                        <option value="fadeblack">Mờ đen (Fade Black)</option>
                                        <option value="dissolve">Giải thể (Dissolve)</option>
                                        <option value="wipeleft">Lướt trái (Wipe Left)</option>
                                        <option value="slideright">Trượt phải (Slide Right)</option>
                                        <option value="smoothleft">Mượt trái (Smooth Left)</option>
                                        <option value="circleopen">Vòng tròn mở (Circle Open)</option>
                                        <option value="random">Ngẫu nhiên (Tự chọn chuyển cảnh)</option>
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <span className="text-[11px] text-slate-450 font-bold uppercase tracking-wide">Thời lượng hiệu ứng (s)</span>
                                    <input
                                        type="number"
                                        step="0.1"
                                        min="0.2"
                                        max="1.5"
                                        value={transitionDuration}
                                        onChange={(e) => setTransitionDuration(parseFloat(e.target.value) || 0.5)}
                                        className="h-9 rounded-lg border border-white/10 bg-slate-950 px-3 text-xs text-slate-200 outline-none font-mono"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1">
                                    <span className="text-[11px] text-slate-450 font-bold uppercase tracking-wide">Bộ lọc Màu (Lut preset)</span>
                                    <select
                                        value={colorPreset}
                                        onChange={(e) => setColorPreset(e.target.value)}
                                        className="h-9 rounded-lg border border-white/10 bg-slate-950 px-3 text-xs text-slate-200 outline-none w-full"
                                    >
                                        <option value="none">Mặc định (Không áp dụng)</option>
                                        <option value="cinematic_warm">Cinematic Warm (Ấm áp)</option>
                                        <option value="cinematic_cool">Cinematic Cool (Lạnh lùng)</option>
                                        <option value="high_contrast">High Contrast (Tương phản cao)</option>
                                        <option value="muted">Muted (Hoài cổ / Nhạt)</option>
                                        <option value="dark_moody">Dark Moody (U tối)</option>
                                        <option value="vibrant">Vibrant (Rực rỡ)</option>
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <span className="text-[11px] text-slate-450 font-bold uppercase tracking-wide">Kiểu chữ Phụ đề</span>
                                    <select
                                        value={subtitleStyle}
                                        onChange={(e) => setSubtitleStyle(e.target.value)}
                                        className="h-9 rounded-lg border border-white/10 bg-slate-950 px-3 text-xs text-slate-200 outline-none w-full cursor-pointer"
                                    >
                                        <option value="japanese_modern">🇯🇵 Tiếng Nhật - Modern (Trắng Bold, Viền Đen, Font Yu Gothic)</option>
                                        <option value="japanese_anime">🇯🇵 Tiếng Nhật - Anime Gold (Vàng Nổi Bật, Font Meiryo)</option>
                                        <option value="japanese_box">🇯🇵 Tiếng Nhật - Chữ trắng viền đen, nền tối bán trong suốt</option>
                                        <option value="japanese_cinematic">🇯🇵 Tiếng Nhật - Cinematic (Vàng Kim, Viền Đen Sẫm)</option>
                                        <option value="japanese_center_big">🇯🇵 Tiếng Nhật - Chữ Lớn Chính Giữa Màn Hình</option>
                                        <option value="korean_modern">🇰🇷 Tiếng Hàn - Chữ trắng viền đen, nền tối bán trong suốt</option>
                                        <option value="modern">Tiếng Anh/Việt - Modern (Arial Bold)</option>
                                        <option value="box">Tiếng Anh/Việt - Hộp Đen Mờ</option>
                                        <option value="cinematic">Tiếng Anh/Việt - Cinematic</option>
                                        <option value="centered_big">Tiếng Anh/Việt - Chữ Lớn Chính Giữa</option>
                                        <option value="default">Mặc định (Chữ trắng viền đen, nền tối bán trong suốt)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-4 pt-1">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={showSceneTitle}
                                        onChange={(e) => setShowSceneTitle(e.target.checked)}
                                        className="h-4 w-4 rounded border-white/10 bg-slate-950 text-primary"
                                    />
                                    <span className="text-xs text-slate-300">Hiển thị tiêu đề phân cảnh ở góc trên</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={vignette}
                                        onChange={(e) => setVignette(e.target.checked)}
                                        className="h-4 w-4 rounded border-white/10 bg-slate-950 text-primary"
                                    />
                                    <span className="text-xs text-slate-300">Hiệu ứng tối góc (Vignette)</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={filmGrain}
                                        onChange={(e) => setFilmGrain(e.target.checked)}
                                        className="h-4 w-4 rounded border-white/10 bg-slate-950 text-primary"
                                    />
                                    <span className="text-xs text-slate-300">Nhiễu hạt máy phim (Film Grain)</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={showProgressBar}
                                        onChange={(e) => setShowProgressBar(e.target.checked)}
                                        className="h-4 w-4 rounded border-white/10 bg-slate-950 text-primary"
                                    />
                                    <span className="text-xs text-slate-300">Hiển thị thanh tiến trình video ở đáy</span>
                                </label>
                            </div>
                        </div>

                        {/* Music and Intro/Outro config */}
                        <div className="space-y-4 border-l border-white/5 pl-5">
                            {/* BGM Config */}
                            <div className="space-y-2 bg-black/30 p-3 rounded-lg border border-white/5">
                                <span className="text-xs text-slate-300 font-bold uppercase tracking-wider block">Nhạc nền (Background Music)</span>
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-[10px] text-slate-500 font-medium">Chọn file âm thanh nhạc nền (.mp3, .wav)</span>
                                    <input
                                        type="file"
                                        accept="audio/*"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) setBgmFile(file);
                                        }}
                                        className="file:mr-2 file:py-0.5 file:px-2 file:rounded file:border-0 file:text-[9px] file:font-semibold file:bg-white/5 file:text-slate-300 text-[10px] text-slate-400 h-8 flex items-center bg-slate-950 border border-white/10 rounded"
                                    />
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-[10px] text-slate-500 font-medium shrink-0">Âm lượng nhạc nền: {Math.round(bgmVolume * 100)}%</span>
                                    <input
                                        type="range"
                                        min="0"
                                        max="0.50"
                                        step="0.01"
                                        value={bgmVolume}
                                        onChange={(e) => setBgmVolume(parseFloat(e.target.value))}
                                        className="w-full h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-primary"
                                    />
                                </div>
                            </div>

                            {/* Intro Config */}
                            <div className="space-y-2 bg-black/30 p-3 rounded-lg border border-white/5">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs text-slate-300 font-bold uppercase tracking-wider">Tiêu đề Mở đầu (Intro - 4 giây)</span>
                                    <input
                                        type="checkbox"
                                        checked={showIntro}
                                        onChange={(e) => setShowIntro(e.target.checked)}
                                        className="h-3.5 w-3.5 rounded border-white/20 bg-slate-950 text-primary"
                                    />
                                </div>
                                {showIntro && (
                                    <div className="grid grid-cols-2 gap-2">
                                        <input
                                            type="text"
                                            value={introTitle}
                                            onChange={(e) => setIntroTitle(e.target.value)}
                                            placeholder="Tiêu đề chính mở đầu"
                                            className="h-8 rounded border border-white/10 bg-slate-950 px-2 text-[11px] text-slate-200 outline-none w-full"
                                        />
                                        <input
                                            type="text"
                                            value={introSubtitle}
                                            onChange={(e) => setIntroSubtitle(e.target.value)}
                                            placeholder="Dòng phụ mở đầu (nếu có)"
                                            className="h-8 rounded border border-white/10 bg-slate-950 px-2 text-[11px] text-slate-200 outline-none w-full"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Outro Config */}
                            <div className="space-y-2 bg-black/30 p-3 rounded-lg border border-white/5">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs text-slate-300 font-bold uppercase tracking-wider">Màn hình Kết thúc (Outro - 5 giây)</span>
                                    <input
                                        type="checkbox"
                                        checked={showOutro}
                                        onChange={(e) => setShowOutro(e.target.checked)}
                                        className="h-3.5 w-3.5 rounded border-white/20 bg-slate-950 text-primary"
                                    />
                                </div>
                                {showOutro && (
                                    <input
                                        type="text"
                                        value={outroText}
                                        onChange={(e) => setOutroText(e.target.value)}
                                        placeholder="Chữ kết thúc (Ví dụ: Cảm ơn đã theo dõi!)"
                                        className="h-8 rounded border border-white/10 bg-slate-950 px-2 text-[11px] text-slate-200 outline-none w-full"
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Image mapping progress banner */}
            {totalScenes > 0 && (
                <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-2.5 shadow-md">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                            <span className="text-slate-400 font-bold uppercase tracking-wider">Tiến độ khớp ảnh:</span>
                            <span className="text-primary font-bold font-mono bg-primary/10 border border-primary/20 px-2 py-0.5 rounded">
                                {mappedCount} / {totalScenes} hình ảnh
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 font-semibold">
                            {mappedCount === totalScenes ? (
                                <span className="text-emerald-400 flex items-center gap-1">
                                    <CheckCircle2 className="h-4 w-4" />
                                    Tất cả hình ảnh đã được khớp thành công!
                                </span>
                            ) : (
                                <span className="text-amber-450 flex items-center gap-1">
                                    <AlertCircle className="h-4 w-4" />
                                    Còn thiếu {totalScenes - mappedCount} hình ảnh chưa gán
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="relative h-2 w-full bg-slate-950 rounded-full border border-white/5 overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-500 bg-gradient-to-r ${
                                mappedCount === totalScenes ? 'from-emerald-500 to-teal-400' : 'from-primary to-cyan-400'
                            }`}
                            style={{ width: `${mapPercent}%` }}
                        />
                    </div>
                    <p className="text-[10px] text-slate-500">
                        Ảnh không đúng tỷ lệ 16:9 sẽ được giữ nguyên chủ thể và lấp phần trống bằng nền mờ khi dựng video.
                    </p>
                </div>
            )}

            {/* List of scenes */}
            <div className="h-[360px] overflow-y-auto rounded-xl border border-white/10 bg-slate-950/60 p-4 space-y-3">
                {groupedScenes.length > 0 ? (
                    <div className="space-y-3">
                        {groupedScenes.map((group) => (
                            <div key={group.sceneNumber} className="bg-slate-900/40 p-4 rounded-xl border border-white/5 space-y-3 hover:border-white/10 transition-colors">
                                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold px-2 py-0.5 rounded uppercase">Nhóm Cảnh {group.sceneNumber}</span>
                                        <h4 className="text-xs font-bold text-slate-300 max-w-[400px] truncate" title={group.sceneName}>{group.sceneName.replace(/^Scene\s*\d+:\s*/i, '')}</h4>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                    {group.images.map((image) => {
                                        const isMapped = !!sceneFiles[image.flatIndex];
                                        const mediaFile = sceneFiles[image.flatIndex];
                                        
                                        return (
                                            <div 
                                                key={image.flatIndex} 
                                                className={`p-2.5 rounded-lg border flex flex-col gap-2 justify-between relative group transition-all duration-200 ${
                                                    isMapped 
                                                        ? 'bg-emerald-950/15 border-emerald-500/20 hover:border-emerald-500/40 shadow-sm shadow-emerald-500/5' 
                                                        : 'bg-black/30 border-white/5 hover:border-white/10 opacity-80 hover:opacity-100'
                                                }`}
                                            >
                                                {/* Mapping Status Badge */}
                                                <div className="absolute top-1.5 left-1.5 z-10 flex gap-1">
                                                    {mediaFile && (
                                                        <span className="bg-cyan-500/90 text-[8px] font-bold text-white px-1 py-0.2 rounded shadow">
                                                            Đã gán
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Image preview / Placeholder */}
                                                <div className={`w-full aspect-video bg-black/60 rounded border flex items-center justify-center overflow-hidden shrink-0 relative transition-colors ${
                                                    isMapped ? 'border-emerald-500/20' : 'border-white/10 border-dashed'
                                                }`}>
                                                    {mediaFile ? (
                                                        <ClipPreview file={mediaFile} />
                                                    ) : (
                                                        <span className="text-[10px] text-slate-600 font-mono">Chưa có ảnh</span>
                                                    )}
                                                </div>

                                                <div className="flex flex-col gap-1">
                                                    <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono">
                                                        <span>Ảnh {image.imageNumber} ({image.duration})</span>
                                                        <span>{image.timeRange}</span>
                                                    </div>
                                                    <p className="text-[11px] text-slate-450 leading-relaxed font-sans line-clamp-2" title={image.sceneName}>
                                                        {image.sceneName}
                                                    </p>
                                                </div>

                                                {/* File info or preview */}
                                                {isMapped && (
                                                    <div className="text-[10px] text-emerald-400 font-medium truncate bg-emerald-500/5 px-2 py-1 rounded border border-emerald-500/10 flex items-center justify-between">
                                                        <span className="truncate max-w-[120px]">{mediaFile?.name}</span>
                                                    </div>
                                                )}

                                                <div className="flex items-center gap-1.5 pt-1">
                                                    <label className="cursor-pointer flex-1">
                                                        <input
                                                            type="file"
                                                            accept=".mp4,video/mp4"
                                                            onChange={(e) => {
                                                                const file = e.target.files?.[0];
                                                                if (file) handleUploadSceneFile(image.flatIndex, file);
                                                            }}
                                                            className="hidden"
                                                        />
                                                        <span className="inline-flex items-center justify-center gap-1.5 h-7 w-full border border-white/10 hover:border-primary/40 bg-white/2 hover:bg-white/5 rounded text-[10px] font-semibold text-slate-300 transition-all select-none">
                                                            <Upload className="h-3 w-3 text-slate-400" />
                                                            {isMapped ? "Đổi tệp" : "Gán tệp"}
                                                        </span>
                                                    </label>

                                                    {/* External link preview if generated on server */}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8">
                        <Play className="h-10 w-10 text-slate-600 mb-2" />
                        <p className="text-sm text-slate-500">Chưa có phân cảnh nào để gán.</p>
                        <p className="text-xs text-slate-600 mt-1">Vui lòng nạp phân cảnh/thời lượng trước.</p>
                    </div>
                )}
            </div>

            {/* Rendering Progress Bar */}
            {composeLoading && (
                <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                            <Activity className="h-3.5 w-3.5 text-primary animate-pulse" />
                            {composeStatus || "Đang render video..."}
                        </span>
                        <span className="font-mono text-primary font-bold">{composeProgress}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-primary/80 to-primary transition-all duration-300 ease-out rounded-full"
                            style={{ width: `${composeProgress}%` }}
                        />
                    </div>
                </div>
            )}

            {/* ─── Sync Check Result Panel ──────────────────────────────────── */}
            {syncResult && (
                <div className={`rounded-xl border p-4 space-y-3 transition-all ${
                    syncResult.status === 'ok'
                        ? 'bg-emerald-950/25 border-emerald-500/30'
                        : syncResult.status === 'warn'
                        ? 'bg-amber-950/25 border-amber-500/30'
                        : syncResult.status === 'danger'
                        ? 'bg-red-950/25 border-red-500/30'
                        : 'bg-slate-900/40 border-white/10'
                }`}>
                    <div className="flex items-center gap-2">
                        {syncResult.status === 'ok' && <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />}
                        {syncResult.status === 'warn' && <ShieldAlert className="h-5 w-5 text-amber-400 shrink-0" />}
                        {syncResult.status === 'danger' && <ShieldX className="h-5 w-5 text-red-400 shrink-0" />}
                        {syncResult.status === null && <AudioLines className="h-5 w-5 text-slate-400 shrink-0" />}
                        <span className={`text-sm font-bold ${
                            syncResult.status === 'ok' ? 'text-emerald-300'
                            : syncResult.status === 'warn' ? 'text-amber-300'
                            : syncResult.status === 'danger' ? 'text-red-300'
                            : 'text-slate-300'
                        }`}>{syncResult.message}</span>
                    </div>

                    {/* Metrics bar */}
                    {syncResult.audioDuration !== null && (
                        <div className="grid grid-cols-4 gap-2">
                            <div className="bg-black/30 rounded-lg p-2.5 border border-white/5 text-center">
                                <span className="block text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">Ảnh</span>
                                <span className="text-base font-mono font-bold text-slate-200">{syncResult.totalImageDuration.toFixed(1)}s</span>
                            </div>
                            <div className="bg-black/30 rounded-lg p-2.5 border border-white/5 text-center">
                                <span className="block text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">Audio</span>
                                <span className="text-base font-mono font-bold text-slate-200">{syncResult.audioDuration.toFixed(1)}s</span>
                            </div>
                            <div className="bg-emerald-500/10 rounded-lg p-2.5 border border-emerald-500/20 text-center">
                                <span className="block text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">Lệch</span>
                                <span className="text-base font-mono font-bold text-emerald-300">0s</span>
                                <span className="block text-[9px] text-emerald-400/60 mt-0.5">auto-pad ✓</span>
                            </div>
                            <div className={`rounded-lg p-2.5 border text-center ${
                                syncResult.status === 'ok' ? 'bg-emerald-500/10 border-emerald-500/20'
                                : syncResult.status === 'warn' ? 'bg-amber-500/10 border-amber-500/20'
                                : 'bg-red-500/10 border-red-500/20'
                            }`}>
                                <span className="block text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">Khoảng lặng</span>
                                <span className={`text-base font-mono font-bold ${
                                    syncResult.status === 'ok' ? 'text-emerald-300'
                                    : syncResult.status === 'warn' ? 'text-amber-300'
                                    : 'text-red-300'
                                }`}>
                                    {syncResult.diff !== null ? `${Math.abs(syncResult.diff).toFixed(1)}s` : '—'}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Details list */}
                    <ul className="space-y-1">
                        {syncResult.details.map((d, i) => (
                            <li key={i} className="text-[11px] text-slate-400 font-mono leading-relaxed">{d}</li>
                        ))}
                    </ul>

                    {syncResult.status === 'danger' && (
                        <div className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 font-semibold">
                            💡 Gợi ý: Điều chỉnh thời lượng từng cảnh trong tab <strong>Lên kế hoạch thời lượng</strong> để khớp với audio.
                        </div>
                    )}
                </div>
            )}

            {/* Actions: Compose / Export ZIP */}
            <div className="flex flex-wrap gap-3 items-center pt-2">
                {/* Sync Check Button */}
                <Button
                    onClick={handleSyncCheck}
                    disabled={syncChecking || (!hasAudio && !localSrtFile) || listToComposeForCheck.length === 0}
                    variant="outline"
                    className={`border font-semibold px-4 rounded-xl h-11 flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] ${
                        syncResult?.status === 'ok'
                            ? 'border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-300'
                            : syncResult?.status === 'warn'
                            ? 'border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10 text-amber-300'
                            : syncResult?.status === 'danger'
                            ? 'border-red-500/40 bg-red-500/5 hover:bg-red-500/10 text-red-300'
                            : 'border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/10 text-cyan-300'
                    }`}
                    title={(!hasAudio && !localSrtFile) ? 'Cần tải audio hoặc SRT để kiểm tra' : 'Kiểm tra đồng bộ ảnh-audio'}
                >
                    {syncChecking
                        ? <RefreshCw className="h-4 w-4 animate-spin" />
                        : syncResult?.status === 'ok'
                        ? <ShieldCheck className="h-4 w-4" />
                        : syncResult?.status === 'warn'
                        ? <ShieldAlert className="h-4 w-4" />
                        : syncResult?.status === 'danger'
                        ? <ShieldX className="h-4 w-4" />
                        : <AudioLines className="h-4 w-4" />
                    }
                    {syncChecking ? 'Đang kiểm tra...' : 'Kiểm tra đồng bộ'}
                </Button>

                <Button
                    onClick={handleComposeVideo}
                    loading={composeLoading}
                    disabled={isComposeDisabled}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 rounded-xl h-11 flex items-center gap-2 shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                    <Play className="h-4 w-4" />
                    Dựng Video Thành phẩm
                </Button>

                {composedVideoUrl && (
                    <>
                        <Button
                            onClick={handleDownloadAllZip}
                            variant="outline"
                            className="border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-450 font-semibold px-4 rounded-xl h-11 transition-all flex items-center gap-1.5"
                        >
                            <Download className="h-4 w-4" />
                            Tải xuống toàn bộ (ZIP)
                        </Button>
                        <div className="flex items-center gap-3 bg-slate-900/65 p-2 rounded-xl border border-white/5 flex-1 min-w-[280px] h-11">
                            <span className="text-[10px] text-emerald-400 font-semibold whitespace-nowrap shrink-0 flex items-center gap-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                                Video Rendered:
                            </span>
                            <span className="text-xs text-slate-350 truncate flex-1 font-mono">{composedVideoUrl}</span>
                            <a
                                href={composedVideoUrl}
                                download={`video_${getTimestampString()}.mp4`}
                                className="h-7 px-3 inline-flex items-center gap-1 text-[10px] font-bold bg-white/5 hover:bg-white/10 border border-white/10 rounded text-slate-200 transition-colors"
                            >
                                <Download className="h-3 w-3" />
                                Tải video
                            </a>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
