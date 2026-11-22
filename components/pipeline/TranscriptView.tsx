import React, { useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Clock, Type, AlignLeft, Timer } from "lucide-react";

interface TranscriptViewProps {
    transcript: string | null;
    setTranscript: (val: string | null) => void;
    srtContent: string;
    setSrtContent: (val: string) => void;
    handleSrtUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    loading: { transcript: boolean; duration: boolean; prompt: boolean };
    language: 'vi' | 'en' | 'ja' | 'fr' | 'zh' | 'ko';
}

const CPM_OR_WPM_BY_LANGUAGE: Record<string, number> = {
    vi: 140,
    en: 150,
    ja: 330,
    fr: 145,
    zh: 260,
    ko: 130,
};

export function TranscriptView({
    transcript,
    setTranscript,
    srtContent,
    setSrtContent,
    handleSrtUpload,
    loading,
    language,
}: TranscriptViewProps) {
    const stats = useMemo(() => {
        const text = transcript || "";
        const charCount = text.length;
        const isCharBased = language === 'ja' || language === 'zh';
        const cleanText = text.replace(/\s+/g, '');
        const countValue = isCharBased
            ? cleanText.length
            : (text.trim() ? text.trim().split(/\s+/).length : 0);
        
        const rate = CPM_OR_WPM_BY_LANGUAGE[language] || 140;
        const estimatedSeconds = countValue > 0 ? Math.round((countValue / rate) * 60) : 0;
        const estimatedMinutes = (estimatedSeconds / 60).toFixed(1);
        const rateUnit = isCharBased ? 'cpm' : 'wpm';
        const countUnit = isCharBased ? 'chữ' : 'từ';
        return { charCount, countValue, rate, estimatedSeconds, estimatedMinutes, rateUnit, countUnit };
    }, [transcript, language]);

    return (
        <div className="space-y-6 outline-none focus:outline-none">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-400 tracking-wide uppercase">Kịch bản thoại gốc</span>
                        <span className="text-xs text-slate-500 font-mono">Tự động chuẩn hóa</span>
                    </div>
                    <Textarea
                        value={transcript || ""}
                        onChange={(e) => setTranscript(e.target.value)}
                        placeholder="Kịch bản thoại sau khi tối ưu hóa sẽ xuất hiện ở đây hoặc bạn có thể tự nhập/dán kịch bản vào..."
                        className="h-[300px] bg-slate-950/60 border-white/10 rounded-xl p-4 text-slate-300 text-sm font-sans leading-relaxed focus:border-primary/40 focus:ring-1 focus:ring-primary/20 outline-none"
                    />
                    {/* ─── Stats Bar ─────────────────────────────────────── */}
                    {transcript && transcript.trim().length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-400 bg-white/5 border border-white/5 px-2 py-0.5 rounded">
                                <Type className="h-3 w-3 text-slate-500" />
                                {stats.charCount.toLocaleString()} ký tự
                            </span>
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-400 bg-white/5 border border-white/5 px-2 py-0.5 rounded">
                                <AlignLeft className="h-3 w-3 text-slate-500" />
                                {stats.countValue.toLocaleString()} {stats.countUnit}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded">
                                <Timer className="h-3 w-3 text-cyan-500" />
                                ~{stats.estimatedMinutes} phút
                                <span className="text-[9px] text-slate-500 ml-0.5">({stats.estimatedSeconds}s · {stats.rate}{stats.rateUnit})</span>
                            </span>
                        </div>
                    )}
                </div>
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-400 tracking-wide uppercase">File phụ đề .SRT (Tùy chọn)</span>
                        <label className="cursor-pointer text-xs text-primary hover:text-primary-foreground font-semibold flex items-center gap-1 transition-colors">
                            <Upload className="h-3 w-3" />
                            Tải lên file .srt
                            <input
                                type="file"
                                accept=".srt"
                                onChange={handleSrtUpload}
                                className="hidden"
                            />
                        </label>
                    </div>
                    <Textarea
                        value={srtContent}
                        onChange={(e) => setSrtContent(e.target.value)}
                        placeholder="Nội dung phụ đề SRT để tính toán cảnh khớp với giọng nói..."
                        className="h-[300px] bg-slate-950/40 border-white/10 rounded-xl p-4 text-slate-400 text-xs font-mono leading-normal"
                    />
                </div>
            </div>

            <div className="flex gap-3 pt-2">
            </div>
        </div>
    );
}

