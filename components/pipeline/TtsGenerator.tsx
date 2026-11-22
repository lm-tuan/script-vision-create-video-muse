import React from 'react';
import { Button } from "@/components/ui/button";
import { Volume2, Download, Trash2, Activity, Clock, RefreshCw, AlertTriangle } from "lucide-react";
import type { FavoriteVoice } from '@/types';

interface TtsGeneratorProps {
    transcript: string | null;
    ttsEngine: 'edge' | 'genmax' | 'beeknoee';
    setTtsEngine: (engine: 'edge' | 'genmax' | 'beeknoee') => void;
    ttsVoice: string;
    setTtsVoice: (voice: string) => void;
    genmaxApiKey: string;
    setGenmaxApiKey: (key: string) => void;
    genmaxProvider: 'capcut' | 'minimax' | 'elevenlabs';
    setGenmaxProvider: (prov: 'capcut' | 'minimax' | 'elevenlabs') => void;
    genmaxVoiceId: string;
    setGenmaxVoiceId: (id: string) => void;
    genmaxModelId: string;
    setGenmaxModelId: (id: string) => void;
    beeknoeeApiKey: string;
    setBeeknoeeApiKey: (key: string) => void;
    beeknoeeModel: string;
    setBeeknoeeModel: (model: string) => void;
    beeknoeeVoice: string;
    setBeeknoeeVoice: (voice: string) => void;
    favoriteVoices: FavoriteVoice[];
    newFavName: string;
    setNewFavName: (name: string) => void;
    generatedAudioUrl: string | null;
    ttsLoading: boolean;
    ttsProgress: number;
    ttsStatus: string;
    language: 'vi' | 'en' | 'ja' | 'fr' | 'zh' | 'ko';
    setLanguage: (lang: 'vi' | 'en' | 'ja' | 'fr' | 'zh' | 'ko') => void;
    addFavoriteVoice: () => void;
    deleteFavoriteVoice: (id: string) => void;
    handleGenerateTTS: () => Promise<void>;
    getTimestampString: () => string;
    loading: { transcript: boolean; duration: boolean; prompt: boolean };
    ttsError: string | null;
}

export function TtsGenerator({
    transcript,
    ttsEngine,
    setTtsEngine,
    ttsVoice,
    setTtsVoice,
    genmaxApiKey,
    setGenmaxApiKey,
    genmaxProvider,
    setGenmaxProvider,
    genmaxVoiceId,
    setGenmaxVoiceId,
    genmaxModelId,
    setGenmaxModelId,
    beeknoeeApiKey,
    setBeeknoeeApiKey,
    beeknoeeModel,
    setBeeknoeeModel,
    beeknoeeVoice,
    setBeeknoeeVoice,
    favoriteVoices,
    newFavName,
    setNewFavName,
    generatedAudioUrl,
    ttsLoading,
    ttsProgress,
    ttsStatus,
    language,
    setLanguage,
    addFavoriteVoice,
    deleteFavoriteVoice,
    handleGenerateTTS,
    getTimestampString,
    loading,
    ttsError
}: TtsGeneratorProps) {
    return (
        <div className="space-y-6 outline-none focus:outline-none">
            {/* Language switcher */}
            <div className="flex items-center gap-3 bg-slate-900/40 p-4 rounded-xl border border-white/5">
                <span className="text-xs font-semibold text-slate-350">Ngôn ngữ chính kịch bản:</span>
                <div className="flex gap-1.5 flex-wrap">
                    {(['vi', 'en', 'ja', 'fr', 'zh', 'ko'] as const).map((lang) => (
                        <button
                            key={lang}
                            type="button"
                            onClick={() => setLanguage(lang)}
                            className={`px-3 py-1 rounded text-xs font-semibold uppercase tracking-wider transition-colors border ${
                                language === lang
                                    ? "bg-primary/20 border-primary text-primary-foreground"
                                    : "bg-slate-950 border-white/5 text-slate-400 hover:text-slate-200"
                            }`}
                        >
                            {lang === 'vi' ? 'Tiếng Việt 🇻🇳' : lang === 'en' ? 'English 🇺🇸' : lang === 'ja' ? 'Japanese 🇯🇵' : lang === 'fr' ? 'French 🇫🇷' : lang === 'zh' ? 'Chinese 🇨🇳' : 'Korean 🇰🇷'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-slate-950/40 p-5 space-y-4">
                <div className="flex items-center border-b border-white/5 pb-3">
                    <div className="flex items-center gap-2 text-slate-200">
                        <Volume2 className="h-5 w-5 text-primary" />
                        <h3 className="text-sm font-bold">Giọng đọc và phụ đề GenMax</h3>
                    </div>
                </div>

                <div className="space-y-4 bg-slate-900/40 p-4 rounded-lg border border-white/5">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* API Key */}
                            <div className="flex flex-col gap-1.5 md:col-span-3">
                                <span className="text-xs text-slate-400 font-semibold">GenMax API Key (tùy chọn)</span>
                                <input
                                    type="password"
                                    value={genmaxApiKey}
                                    onChange={(e) => setGenmaxApiKey(e.target.value)}
                                    placeholder="Để trống để dùng khóa của backend"
                                    className="h-10 rounded-lg border border-white/10 bg-slate-950 px-3 text-xs text-slate-200 focus:border-primary/40 focus:ring-1 focus:ring-primary/20 outline-none w-full"
                                />
                            </div>

                            {/* Nhà cung cấp (Provider) */}
                            <div className="flex flex-col gap-1.5">
                                <span className="text-xs text-slate-400 font-semibold">Nhà cung cấp (Provider)</span>
                                <select
                                    value={genmaxProvider}
                                    onChange={(e) => {
                                        const prov = e.target.value as 'minimax' | 'elevenlabs' | 'capcut';
                                        setGenmaxProvider(prov);
                                        // Update to default settings for each provider to ease UX
                                        if (prov === 'minimax') {
                                            setGenmaxVoiceId("b84e88bc-fb97-419d-bc23-14ebbd5377f0");
                                            setGenmaxModelId("speech-2.8-turbo");
                                        } else if (prov === 'elevenlabs') {
                                            setGenmaxVoiceId("jB1Cifc2UQbq1gR3wnb0");
                                            setGenmaxModelId("eleven_turbo_v2_5");
                                        } else {
                                            setGenmaxVoiceId("");
                                            setGenmaxModelId("");
                                        }
                                    }}
                                    className="h-10 rounded-lg border border-white/10 bg-slate-950 px-3 text-xs text-slate-200 focus:border-primary/40 focus:ring-1 focus:ring-primary/20 outline-none w-full font-sans"
                                >
                                    <option value="minimax">MiniMax (Premium)</option>
                                    <option value="elevenlabs">ElevenLabs (Premium)</option>
                                    <option value="capcut">CapCut</option>
                                </select>
                            </div>

                            {/* Giọng đọc gợi ý */}
                            <div className="flex flex-col gap-1.5">
                                <span className="text-xs text-slate-400 font-semibold">Giọng gợi ý (Presets)</span>
                                <select
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === 'minimax_vi') {
                                            setGenmaxProvider('minimax');
                                            setGenmaxVoiceId('b84e88bc-fb97-419d-bc23-14ebbd5377f0');
                                            setGenmaxModelId('speech-2.8-turbo');
                                        } else if (val === 'minimax_vi_nghi_luc') {
                                            setGenmaxProvider('minimax');
                                            setGenmaxVoiceId('4ef2cf86-58fd-4379-9177-8072a5fba1da');
                                            setGenmaxModelId('speech-2.8-turbo');
                                        } else if (val === 'minimax_ja') {
                                            setGenmaxProvider('minimax');
                                            setGenmaxVoiceId('Japanese_DominantMan');
                                            setGenmaxModelId('speech-2.8-turbo');
                                        } else if (val === 'minimax_en') {
                                            setGenmaxProvider('minimax');
                                            setGenmaxVoiceId('567b865c-4ceb-4647-9a01-2f9d24191400');
                                            setGenmaxModelId('speech-2.8-turbo');
                                        } else if (val === 'minimax_ja_loyal') {
                                            setGenmaxProvider('minimax');
                                            setGenmaxVoiceId('Japanese_LoyalKnight');
                                            setGenmaxModelId('speech-2.8-turbo');
                                        } else if (val === 'eleven_vi') {
                                            setGenmaxProvider('elevenlabs');
                                            setGenmaxVoiceId('f5q6kePPoQAjCPYG6moa');
                                            setGenmaxModelId('eleven_turbo_v2_5');
                                        } else if (val === 'eleven_bin') {
                                            setGenmaxProvider('elevenlabs');
                                            setGenmaxVoiceId('jB1Cifc2UQbq1gR3wnb0');
                                            setGenmaxModelId('eleven_turbo_v2_5');
                                        }
                                    }}
                                    value={
                                        genmaxProvider === 'minimax' && genmaxVoiceId === 'b84e88bc-fb97-419d-bc23-14ebbd5377f0'
                                            ? 'minimax_vi'
                                            : genmaxProvider === 'minimax' && genmaxVoiceId === '4ef2cf86-58fd-4379-9177-8072a5fba1da'
                                            ? 'minimax_vi_nghi_luc'
                                            : genmaxProvider === 'minimax' && genmaxVoiceId === 'Japanese_DominantMan'
                                            ? 'minimax_ja'
                                            : genmaxProvider === 'minimax' && genmaxVoiceId === '567b865c-4ceb-4647-9a01-2f9d24191400'
                                            ? 'minimax_en'
                                            : genmaxProvider === 'minimax' && genmaxVoiceId === 'Japanese_LoyalKnight'
                                            ? 'minimax_ja_loyal'
                                            : genmaxProvider === 'elevenlabs' && genmaxVoiceId === 'f5q6kePPoQAjCPYG6moa'
                                            ? 'eleven_vi'
                                            : genmaxProvider === 'elevenlabs' && genmaxVoiceId === 'jB1Cifc2UQbq1gR3wnb0'
                                            ? 'eleven_bin'
                                            : ''
                                    }
                                    className="h-10 rounded-lg border border-white/10 bg-slate-950 px-3 text-xs text-slate-200 focus:border-primary/40 focus:ring-1 focus:ring-primary/20 outline-none w-full font-sans"
                                >
                                    <option value="">-- Tự chọn (Custom) --</option>
                                    <option value="minimax_vi">MiniMax - Mặc định (Tiếng Việt)</option>
                                    <option value="minimax_vi_nghi_luc">MiniMax - Việt Nam Nghị Lực 🇻🇳</option>
                                    <option value="minimax_ja">MiniMax - Japanese_DominantMan (Tiếng Nhật)</option>
                                    <option value="minimax_en">MiniMax - English 🇺🇸 (567b865c...)</option>
                                    <option value="minimax_ja_loyal">MiniMax - Giọng JP (08/09/2026) 🇯🇵</option>
                                    <option value="eleven_vi">ElevenLabs - Tiếng Việt (f5q6kePPoQAjCPYG6moa)</option>
                                    <option value="eleven_bin">ElevenLabs - Kore · Measured &amp; Serious 🇰🇷 (Tiếng Hàn · 27/09/2026)</option>
                                </select>
                            </div>

                            {/* Voice ID */}
                            <div className="flex flex-col gap-1.5">
                                <span className="text-xs text-slate-400 font-semibold">Mã giọng đọc (Voice ID)</span>
                                <input
                                    type="text"
                                    value={genmaxVoiceId}
                                    onChange={(e) => setGenmaxVoiceId(e.target.value)}
                                    placeholder="Ví dụ: b84e88bc-fb97-419d-bc23-14ebbd5377f0"
                                    className="h-10 rounded-lg border border-white/10 bg-slate-950 px-3 text-xs text-slate-200 focus:border-primary/40 focus:ring-1 focus:ring-primary/20 outline-none w-full"
                                />
                            </div>

                            {/* Model ID */}
                            <div className="flex flex-col gap-1.5 md:col-span-3">
                                <span className="text-xs text-slate-400 font-semibold">Mã mô hình (Model ID)</span>
                                <input
                                    type="text"
                                    value={genmaxModelId}
                                    onChange={(e) => setGenmaxModelId(e.target.value)}
                                    placeholder="Ví dụ: speech-2.8-turbo hoặc eleven_turbo_v2_5"
                                    className="h-10 rounded-lg border border-white/10 bg-slate-950 px-3 text-xs text-slate-200 focus:border-primary/40 focus:ring-1 focus:ring-primary/20 outline-none w-full"
                                />
                            </div>
                        </div>

                        {/* Favorite Voices Manager inside MiniMax */}
                        <div className="border-t border-white/5 pt-4 space-y-3">
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Quản lý Giọng đọc yêu thích</span>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={newFavName}
                                    onChange={(e) => setNewFavName(e.target.value)}
                                    placeholder="Tên gợi nhớ (Ví dụ: Giọng đọc chính của tôi)"
                                    className="h-9 rounded-lg border border-white/10 bg-slate-950 px-3 text-xs text-slate-200 focus:border-primary/40 focus:ring-1 focus:ring-primary/20 outline-none flex-1"
                                />
                                <Button
                                    onClick={addFavoriteVoice}
                                    variant="outline"
                                    className="h-9 px-3 text-xs border-white/10 hover:bg-white/5"
                                >
                                    Lưu yêu thích
                                </Button>
                            </div>

                            {favoriteVoices.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                                    {favoriteVoices.map((v) => (
                                        <div key={v.id} className="flex items-center justify-between bg-slate-950/60 p-2.5 rounded-lg border border-white/5">
                                            <div
                                                onClick={() => {
                                                    setGenmaxProvider(v.provider);
                                                    setGenmaxVoiceId(v.voiceId);
                                                    setGenmaxModelId(v.modelId);
                                                }}
                                                className="flex flex-col cursor-pointer flex-1 text-left"
                                            >
                                                <span className="text-xs font-bold text-slate-300 hover:text-primary transition-colors">{v.name}</span>
                                                <span className="text-[10px] text-slate-500 font-mono truncate max-w-[200px]">{v.voiceId}</span>
                                            </div>
                                            <Button
                                                onClick={() => deleteFavoriteVoice(v.id)}
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0 text-slate-500 hover:text-red-400"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <span className="text-[11px] text-slate-600 italic block">Chưa có giọng đọc yêu thích nào được lưu.</span>
                            )}
                        </div>

                        <div className="flex items-center gap-3 border-t border-white/5 pt-4">
                            <Button
                                onClick={handleGenerateTTS}
                                loading={ttsLoading}
                                disabled={!transcript || ttsLoading}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground h-10 px-5 rounded-lg text-xs font-bold transition-all shadow-md shadow-primary/10 shrink-0"
                            >
                                {ttsLoading ? "Đang sinh âm thanh..." : "Tạo giọng đọc & SRT"}
                            </Button>

                            {generatedAudioUrl && (
                                <div className="flex items-center gap-3 bg-slate-950 p-1.5 rounded-lg border border-white/5 flex-1 min-w-[280px]">
                                    <audio src={generatedAudioUrl} controls className="h-8 w-full accent-primary" />
                                    <a
                                        href={generatedAudioUrl}
                                        download={`audio_${getTimestampString()}.mp3`}
                                        className="h-8 px-3 inline-flex items-center gap-1 text-[11px] font-bold bg-white/5 hover:bg-white/10 border border-white/10 rounded text-slate-200 transition-colors"
                                    >
                                        <Download className="h-3 w-3" />
                                        MP3
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>

                {/* Real-time TTS Progress Bar */}

                {ttsLoading && (
                    <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-2 mt-2">
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                                <Activity className="h-3.5 w-3.5 text-primary animate-pulse" />
                                {ttsStatus || "Đang xử lý..."}
                            </span>
                            <span className="font-mono text-primary font-bold">{ttsProgress}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-primary/80 to-primary transition-all duration-300 ease-out rounded-full"
                                style={{ width: `${ttsProgress}%` }}
                            />
                        </div>
                    </div>
                )}
                {/* TTS Error Banner + Retry Button */}
                {!ttsLoading && ttsError && (
                    <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 space-y-3 animate-in fade-in slide-in-from-top-1 duration-300">
                        <div className="flex items-start gap-2.5">
                            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-rose-300 mb-0.5">Lỗi sinh giọng đọc</p>
                                <p className="text-[11px] text-rose-400/80 leading-relaxed break-words font-mono">{ttsError}</p>
                            </div>
                        </div>
                        <Button
                            onClick={handleGenerateTTS}
                            disabled={!transcript}
                            className="w-full h-10 gap-2 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 hover:border-rose-400 text-rose-200 hover:text-white text-xs font-bold rounded-lg transition-all"
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Thử lại
                        </Button>
                    </div>
                )}
            </div>


        </div>
    );
}
