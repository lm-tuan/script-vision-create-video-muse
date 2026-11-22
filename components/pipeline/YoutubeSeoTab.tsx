import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { 
    Youtube, 
    Copy, 
    Check, 
    Image as ImageIcon, 
    Download, 
    ExternalLink, 
    Sparkles, 
    Loader2, 
    Globe,
    Tag,
    Upload
} from "lucide-react";
import { logService } from '@/lib/logger';
import { DurationEntry } from '@/types';

interface YoutubeSeoTabProps {
    seoLanguage: 'vi' | 'en' | 'ja' | 'fr' | 'zh' | 'ko';
    setSeoLanguage: (val: 'vi' | 'en' | 'ja' | 'fr' | 'zh' | 'ko') => void;
    seoData: {
        titles: string[];
        description: string;
        tags: string[];
        thumbnailPrompt: string;
    } | null;
    seoLoading: boolean;
    thumbnailPrompt: string;
    setThumbnailPrompt: (val: string) => void;
    handleGenerateSeo: (customSourceText?: string) => Promise<void>;
    transcript: string | null;
    content: string;
    durations: DurationEntry[] | null;
}

export function YoutubeSeoTab({
    seoLanguage,
    setSeoLanguage,
    seoData,
    seoLoading,
    thumbnailPrompt,
    setThumbnailPrompt,
    handleGenerateSeo,
    transcript,
    content,
    durations
}: YoutubeSeoTabProps) {
    const [copiedTitleIndex, setCopiedTitleIndex] = useState<number | null>(null);
    const [copiedDesc, setCopiedDesc] = useState(false);
    const [copiedTags, setCopiedTags] = useState(false);

    const [seoInputText, setSeoInputText] = useState('');
    const [hasManuallyEdited, setHasManuallyEdited] = useState(false);
    const [prevSource, setPrevSource] = useState(transcript || content);

    useEffect(() => {
        const currentSource = transcript || content;
        // If the source changes (e.g. loaded a new project), reset the input text
        if (currentSource !== prevSource) {
            setPrevSource(currentSource);
            setSeoInputText(currentSource || '');
            setHasManuallyEdited(false);
        } else if (!hasManuallyEdited && currentSource && !seoInputText) {
            // Initial load if seoInputText is empty
            setSeoInputText(currentSource);
        }
    }, [transcript, content, prevSource, hasManuallyEdited, seoInputText]);

    const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setHasManuallyEdited(true);
        setSeoInputText(e.target.value);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            setSeoInputText(text);
            setHasManuallyEdited(true);
        };
        reader.readAsText(file);
        
        // Reset input value so the same file can be uploaded again if needed
        e.target.value = '';
    };

    const hasSourceContent = !!seoInputText.trim();

    const copyToClipboard = (text: string, type: 'title' | 'desc' | 'tags', index?: number) => {
        navigator.clipboard.writeText(text);
        if (type === 'title' && typeof index === 'number') {
            setCopiedTitleIndex(index);
            setTimeout(() => setCopiedTitleIndex(null), 2000);
            logService.addLog(`[YouTube SEO] Đã copy tiêu đề số ${index + 1}`);
        } else if (type === 'desc') {
            setCopiedDesc(true);
            setTimeout(() => setCopiedDesc(false), 2000);
            logService.addLog("[YouTube SEO] Đã copy mô tả video");
        } else if (type === 'tags') {
            setCopiedTags(true);
            setTimeout(() => setCopiedTags(false), 2000);
            logService.addLog("[YouTube SEO] Đã copy danh sách thẻ tag");
        }
    };

    return (
        <div className="space-y-6 outline-none focus:outline-none">
            {/* Header Configuration Panel */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-white/10 bg-slate-900/40 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">
                        <Youtube className="h-5 w-5" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-200">YouTube Metadata & Thumbnail</h3>
                        <p className="text-xs text-slate-400">Tạo tiêu đề, mô tả, từ khóa tối ưu SEO và thiết kế ảnh bìa video.</p>
                    </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                    <div className="flex items-center gap-1.5 bg-slate-950/60 border border-white/10 rounded-lg px-3 py-1.5">
                        <Globe className="h-3.5 w-3.5 text-slate-400" />
                        <select
                            value={seoLanguage}
                            onChange={(e) => setSeoLanguage(e.target.value as any)}
                            className="bg-transparent text-xs text-slate-200 outline-none cursor-pointer font-medium"
                        >
                            <option value="vi">Tiếng Việt</option>
                            <option value="en">Tiếng Anh (English)</option>
                            <option value="ja">Tiếng Nhật (Japanese)</option>
                            <option value="fr">Tiếng Pháp (French)</option>
                            <option value="zh">Tiếng Trung (Chinese)</option>
                            <option value="ko">Tiếng Hàn (Korean)</option>
                        </select>
                    </div>

                    <Button
                        onClick={() => handleGenerateSeo(seoInputText)}
                        disabled={!hasSourceContent || seoLoading}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4 rounded-lg h-9 text-xs flex items-center gap-1.5 shrink-0"
                    >
                        {seoLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Sparkles className="h-3.5 w-3.5" />
                        )}
                        Tạo SEO & Prompt
                    </Button>
                </div>
            </div>

            {/* Source Content Configuration Panel */}
            <div className="p-4 rounded-xl border border-white/10 bg-slate-900/40 backdrop-blur-md space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-300 tracking-wider uppercase flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5 text-primary" />
                            Nguồn nội dung tạo SEO & Thumbnail
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <input 
                            type="file" 
                            accept=".txt"
                            className="hidden" 
                            id="transcript-upload"
                            onChange={handleFileUpload}
                        />
                        <label 
                            htmlFor="transcript-upload"
                            className="flex items-center gap-1.5 bg-slate-950/80 hover:bg-slate-800 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-200 cursor-pointer font-medium transition-colors"
                        >
                            <Upload className="h-3.5 w-3.5" />
                            Tải lên Transcript
                        </label>
                    </div>
                </div>
                <Textarea
                    value={seoInputText}
                    onChange={handleTextareaChange}
                    placeholder="Văn bản nguồn để tạo SEO và thumbnail prompt..."
                    className="h-[100px] bg-slate-950/60 border-white/10 rounded-xl p-3.5 text-slate-300 text-xs font-sans leading-relaxed resize-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 outline-none"
                />
                <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>Hệ thống sẽ dựa vào đoạn văn bản này để viết tiêu đề, mô tả, thẻ tags và đề xuất prompt ảnh thumbnail.</span>
                    <span>Độ dài: {seoInputText.length} ký tự ({seoInputText.split(/\s+/).filter(Boolean).length} từ)</span>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* COLUMN 1: SEO METADATA */}
                <div className="space-y-5">
                    {/* Titles Section */}
                    <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-400 tracking-wider uppercase flex items-center gap-1.5">
                                <Youtube className="h-3.5 w-3.5 text-red-500" />
                                Gợi ý tiêu đề CTR (Tối đa 5 lựa chọn)
                            </span>
                        </div>

                        <div className="space-y-2">
                            {seoData && seoData.titles.length > 0 ? (
                                seoData.titles.map((title, idx) => (
                                    <div 
                                        key={idx}
                                        className="flex items-center justify-between gap-3 p-3 rounded-lg border border-white/5 bg-slate-950/40 hover:bg-slate-950/80 transition-colors"
                                    >
                                        <div className="flex items-start gap-2.5">
                                            <span className="text-xs font-mono font-bold text-slate-500 mt-0.5">{idx + 1}.</span>
                                            <span className="text-xs md:text-sm text-slate-200 font-medium leading-relaxed">{title}</span>
                                        </div>
                                        <button
                                            onClick={() => copyToClipboard(title, 'title', idx)}
                                            className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors shrink-0"
                                            title="Copy tiêu đề này"
                                        >
                                            {copiedTitleIndex === idx ? (
                                                <Check className="h-3.5 w-3.5 text-emerald-400" />
                                            ) : (
                                                <Copy className="h-3.5 w-3.5" />
                                            )}
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <div className="p-8 border border-dashed border-white/10 rounded-xl text-center text-slate-500 text-xs">
                                    Chưa có dữ liệu tiêu đề. Nhấp "Tạo SEO & Prompt" để bắt đầu.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Description Section */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-400 tracking-wider uppercase">
                                Mô tả Video chuẩn SEO
                            </span>
                            {seoData && (
                                <button
                                    onClick={() => copyToClipboard(seoData.description, 'desc')}
                                    className="text-xs text-primary hover:underline flex items-center gap-1 font-semibold"
                                >
                                    {copiedDesc ? (
                                        <>
                                            <Check className="h-3 w-3 text-emerald-400" />
                                            Đã copy!
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="h-3 w-3" />
                                            Sao chép mô tả
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                        <Textarea
                            value={seoData?.description || ""}
                            placeholder="Mô tả chi tiết chứa từ khóa SEO sẽ hiển thị ở đây..."
                            className="h-[180px] bg-slate-950/60 border-white/10 rounded-xl p-3.5 text-slate-300 text-xs font-sans leading-relaxed resize-none"
                            readOnly
                        />
                    </div>

                    {/* Tags Section */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-400 tracking-wider uppercase flex items-center gap-1.5">
                                <Tag className="h-3.5 w-3.5 text-slate-400" />
                                Thẻ tag tìm kiếm
                            </span>
                            {seoData && seoData.tags.length > 0 && (
                                <button
                                    onClick={() => copyToClipboard(seoData.tags.join(', '), 'tags')}
                                    className="text-xs text-primary hover:underline flex items-center gap-1 font-semibold"
                                >
                                    {copiedTags ? (
                                        <>
                                            <Check className="h-3 w-3 text-emerald-400" />
                                            Đã copy!
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="h-3 w-3" />
                                            Sao chép tất cả tag
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                        <div className="p-3 bg-slate-950/40 border border-white/10 rounded-xl min-h-[70px]">
                            {seoData && seoData.tags.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                    {seoData.tags.map((tag, idx) => (
                                        <span 
                                            key={idx}
                                            className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-white/5 font-medium"
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <span className="text-xs text-slate-500 italic block p-2">Không có thẻ tag nào được tạo.</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* COLUMN 2: THUMBNAIL DESIGNER */}
                <div className="space-y-5">
                    {/* Prompt Box */}
                    <div className="space-y-2.5">
                        <span className="text-xs font-bold text-slate-400 tracking-wider uppercase flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5 text-primary" />
                            Prompt mô tả vẽ ảnh Thumbnail (1280x720)
                        </span>
                        <div className="relative">
                            <Textarea
                                value={thumbnailPrompt}
                                onChange={(e) => setThumbnailPrompt(e.target.value)}
                                placeholder="Nhập hoặc chỉnh sửa mô tả hình ảnh bằng tiếng Anh để vẽ..."
                                className="h-[100px] bg-slate-950/60 border-white/10 rounded-xl p-3.5 text-slate-350 text-xs font-mono leading-relaxed"
                            />
                        </div>

                    </div>

                </div>

            </div>
        </div>
    );
}
