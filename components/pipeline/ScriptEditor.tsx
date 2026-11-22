import React from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Play, Upload } from "lucide-react";

interface ScriptEditorProps {
    content: string;
    setContent: (val: string) => void;
    rewriteWithAi: boolean;
    setRewriteWithAi: (val: boolean) => void;
    keepOrExpandDuration: boolean;
    setKeepOrExpandDuration: (val: boolean) => void;
    loading: { transcript: boolean; duration: boolean; prompt: boolean };
    handleGenerateTranscript: () => Promise<void>;
    handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    language: 'vi' | 'en' | 'ja' | 'fr' | 'zh' | 'ko';
    setLanguage: (lang: 'vi' | 'en' | 'ja' | 'fr' | 'zh' | 'ko') => void;
}

export function ScriptEditor({
    content,
    setContent,
    rewriteWithAi,
    setRewriteWithAi,
    keepOrExpandDuration,
    setKeepOrExpandDuration,
    loading,
    handleGenerateTranscript,
    handleFileUpload,
    language,
    setLanguage
}: ScriptEditorProps) {
    const isProcessing = loading.transcript || loading.duration || loading.prompt;

    return (
        <div className="space-y-4 outline-none focus:outline-none">
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

            <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-slate-400 tracking-wider uppercase">Nội dung bài viết gốc</span>
                <span className="text-xs text-slate-500 font-mono">{content.length} ký tự</span>
            </div>
            <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Nhập hoặc dán bài viết/kịch bản của bạn ở đây..."
                className="h-[380px] bg-slate-950/60 border-white/10 focus:border-primary/40 focus:ring-1 focus:ring-primary/30 rounded-xl resize-none p-4 text-slate-200 placeholder:text-slate-600 leading-relaxed font-sans text-sm outline-none"
            />
            <div className="flex flex-col gap-2.5 px-1 py-1">
                <div className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        id="rewriteWithAi"
                        checked={rewriteWithAi}
                        onChange={(e) => setRewriteWithAi(e.target.checked)}
                        className="h-4 w-4 rounded border-white/10 bg-slate-950 text-primary focus:ring-primary/30 cursor-pointer"
                    />
                    <label htmlFor="rewriteWithAi" className="text-xs text-slate-300 font-semibold cursor-pointer select-none hover:text-slate-200 transition-colors">
                        Viết lại kịch bản bằng AI (YouTube Narrator Rewriter)
                    </label>
                </div>
                {rewriteWithAi && (
                    <div className="flex items-center gap-2 ml-6">
                        <input
                            type="checkbox"
                            id="keepOrExpandDuration"
                            checked={keepOrExpandDuration}
                            onChange={(e) => setKeepOrExpandDuration(e.target.checked)}
                            className="h-4 w-4 rounded border-white/10 bg-slate-950 text-primary focus:ring-primary/30 cursor-pointer"
                        />
                        <label htmlFor="keepOrExpandDuration" className="text-xs text-slate-450 font-semibold cursor-pointer select-none hover:text-slate-300 transition-colors">
                            Giữ nguyên hoặc mở rộng thời lượng kịch bản gốc (Độ dài tối thiểu bằng kịch bản nhập vào)
                        </label>
                    </div>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button
                    onClick={handleGenerateTranscript}
                    loading={loading.transcript}
                    disabled={!content.trim() || loading.duration || loading.prompt}
                    variant="outline"
                    className="border-white/10 hover:bg-white/5 text-slate-300 font-semibold px-4 rounded-xl h-11 transition-all"
                >
                    Chỉ tạo Transcript
                </Button>

                <label className="cursor-pointer ml-auto">
                    <input
                        type="file"
                        accept=".txt"
                        onChange={handleFileUpload}
                        className="hidden"
                    />
                    <span className="inline-flex items-center gap-1.5 h-11 px-4 border border-dashed border-white/20 hover:border-primary/40 bg-white/2 hover:bg-white/5 rounded-xl text-xs font-semibold text-slate-300 transition-all">
                        <Upload className="h-3.5 w-3.5 text-slate-400" />
                        Tải file văn bản (.txt)
                    </span>
                </label>
            </div>
        </div>
    );
}
