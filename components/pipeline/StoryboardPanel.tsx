import React, { useState } from 'react';
import type { DurationEntry } from '@/types';
import { fitGraphicText, generateStoryboard, graphicCardWidth, graphicFontSize, graphicTextLimit, resolveGraphicTemplate, type GraphicKind, type GraphicTemplate, type StoryboardCue, type StoryboardDensity } from '@/core/storyboard/Storyboard';

interface Props {
    shots: DurationEntry[];
    cues: StoryboardCue[];
    setCues: (cues: StoryboardCue[]) => void;
    language: string;
    localSrtFile: File | null;
    generatedSrtUrl: string | null;
    sceneFiles: Record<number, File>;
    imageGenUrls: Record<number, string>;
}

const labelsVi: Record<GraphicKind, string> = { keyword: 'Từ khóa', stat: 'Số liệu', steps: 'Quy trình' };
const labelsKo: Record<GraphicKind, string> = { keyword: '키워드', stat: '수치', steps: '단계' };
const templateLabels: Record<GraphicTemplate, string> = {
    auto: 'Tự động luân phiên', banner: 'Dải tiêu đề', card: 'Thẻ góc', outline: 'Chữ nổi', lower: 'Thẻ phía dưới'
};

export function StoryboardPanel({ shots, cues, setCues, language, localSrtFile, generatedSrtUrl, sceneFiles, imageGenUrls }: Props) {
    const labels = language === 'ko' ? labelsKo : labelsVi;
    const [selected, setSelected] = useState<number | null>(null);
    const [position, setPosition] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [density, setDensity] = useState<StoryboardDensity>('selective');
    const shot = shots.find(s => s.sceneNumber === selected) || shots[0];
    const shotCues = cues.filter(c => c.sceneNumber === shot?.sceneNumber);
    const active = shotCues.find(c => position >= c.at && position < c.at + c.length);
    const activeTemplate = active ? resolveGraphicTemplate(active, shotCues.indexOf(active)) : null;
    const activeText = active && activeTemplate ? fitGraphicText(active.kind === 'steps'
        ? `${shotCues.filter(c => c.kind === 'steps').indexOf(active) + 1}/${shotCues.filter(c => c.kind === 'steps').length} → ${active.text}`
        : active.text, graphicTextLimit(activeTemplate, active.kind)) : '';
    const activeWidth = active && activeTemplate && activeTemplate !== 'outline'
        ? `${graphicCardWidth(activeText, activeTemplate, graphicFontSize(activeTemplate, active.kind)) / 1920 * 100}%`
        : undefined;
    const previewClasses = activeTemplate === 'card'
        ? 'top-[9%] left-[6%] border-l-4 border-amber-400 bg-slate-900/85 rounded-lg px-2 py-1 shadow-xl'
        : activeTemplate === 'outline'
        ? 'top-[10%] right-[6%] max-w-[55%] text-right px-2 py-1'
        : activeTemplate === 'lower'
        ? 'bottom-[17%] left-[6%] border-l-4 border-violet-400 bg-violet-950/80 rounded-lg px-2 py-1 shadow-xl'
        : 'top-[12%] left-[6%] border-l-4 border-cyan-400 bg-black/75 rounded-lg px-2 py-1 shadow-xl';
    const file = shot && sceneFiles[shot.sceneNumber];
    const [previewUrl, setPreviewUrl] = useState('');
    React.useEffect(() => {
        if (!file) { setPreviewUrl(''); return; }
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);
    const mediaUrl = previewUrl || (shot && imageGenUrls[shot.sceneNumber]) || '';
    const isVideo = !!file && (file.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name));
    const update = (id: string, changes: Partial<StoryboardCue>) => setCues(cues.map(c => c.id === id ? { ...c, ...changes } : c));

    const generate = async () => {
        setBusy(true);
        setError('');
        try {
            let srt = '';
            if (localSrtFile) srt = await localSrtFile.text();
            else if (generatedSrtUrl) {
                const response = await fetch(generatedSrtUrl);
                if (!response.ok) throw new Error('Không đọc được SRT đã tạo');
                srt = await response.text();
            }
            if (!srt) throw new Error('Hãy tải SRT hoặc tạo giọng đọc trước');
            const generated = generateStoryboard(shots, srt, density);
            if (!generated.length) throw new Error('SRT không có lời đọc hợp lệ');
            setCues(generated);
            setSelected(generated[0].sceneNumber);
            setPosition(generated[0].at);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Không tạo được storyboard');
        } finally { setBusy(false); }
    };

    return <section className="rounded-xl border border-cyan-500/20 bg-slate-900/50 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="text-sm font-bold text-cyan-200">Storyboard theo lời đọc</h3>
                <p className="text-xs text-slate-400">Tạo nhịp hình từ SRT, chỉnh chữ, thời điểm và chọn một trong bốn mẫu hiển thị.</p></div>
            <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-slate-400">Mật độ
                    <select aria-label="Mật độ Storyboard" value={density} onChange={e => setDensity(e.target.value as StoryboardDensity)} className="ml-2 rounded-lg bg-slate-800 px-2 py-2 text-xs text-white">
                        <option value="selective">Tiết chế</option>
                        <option value="balanced">Vừa phải</option>
                        <option value="full">Đầy đủ</option>
                    </select>
                </label>
                <button type="button" onClick={generate} disabled={busy || !shots.length} className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                    {busy ? 'Đang tạo...' : cues.length ? 'Tạo lại từ SRT' : 'Tạo storyboard từ SRT'}
                </button>
            </div>
        </div>
        {error && <p className="text-xs text-red-300">{error}</p>}
        {!!shots.length && <div className="flex gap-2 overflow-x-auto pb-1">
            {shots.map((item, index) => <button type="button" key={item.sceneNumber} onClick={() => { setSelected(item.sceneNumber); setPosition(cues.find(c => c.sceneNumber === item.sceneNumber)?.at ?? 0); }}
                className={`shrink-0 rounded-md border px-3 py-1.5 text-xs ${item.sceneNumber === shot?.sceneNumber ? 'border-cyan-400 text-cyan-200 bg-cyan-500/10' : 'border-white/10 text-slate-400'}`}>
                Cảnh {index + 1} · {cues.filter(c => c.sceneNumber === item.sceneNumber).length} nhịp
            </button>)}
        </div>}
        {shot && <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
                <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
                    {mediaUrl && (isVideo ? <video src={mediaUrl} className="h-full w-full object-cover" muted autoPlay loop playsInline /> : <img src={mediaUrl} alt="Xem trước cảnh" className="h-full w-full object-cover" />)}
                    {active && <div className={`absolute ${previewClasses}`} style={activeWidth ? { width: activeWidth } : undefined}>
                        <span className="text-sm font-bold text-white break-words" style={activeTemplate === 'outline' ? { textShadow: '0 2px 4px #000, 0 0 8px #000' } : undefined}>{activeText}</span>
                        {(active.kind === 'steps' || /\d+(?:[.,]\d+)?\s*[%％]/.test(active.text)) && <div className="mt-1 h-1 w-full rounded bg-white/30"><div className="h-full rounded bg-cyan-400" style={{ width: active.kind === 'steps' ? `${100 * (shotCues.filter(c => c.kind === 'steps').indexOf(active) + 1) / shotCues.filter(c => c.kind === 'steps').length}%` : `${Math.min(100, Number(active.text.match(/(\d+(?:[.,]\d+)?)\s*[%％]/)?.[1].replace(',', '.') || 0))}%` }} /></div>}
                    </div>}
                </div>
                <input type="range" min="0" max="100" value={Math.round(position * 100)} onChange={e => setPosition(Number(e.target.value) / 100)} className="w-full accent-cyan-400" aria-label="Xem nhịp cảnh" />
                <p className="text-xs text-slate-500">{shot.timeRange} · {Math.round(position * 100)}% thời lượng cảnh{activeTemplate ? ` · ${templateLabels[activeTemplate]}` : ''}</p>
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {shotCues.map(cue => <div key={cue.id} className="rounded-lg border border-white/10 bg-black/20 p-2 space-y-2">
                    <div className="flex gap-2">
                        <select aria-label="Kiểu đồ họa" value={cue.kind} onChange={e => update(cue.id, { kind: e.target.value as GraphicKind })} className="rounded bg-slate-800 px-2 py-1 text-xs text-white">
                            {Object.entries(labels).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
                        </select>
                        <input aria-label="Nội dung đồ họa" value={cue.text} maxLength={90} onChange={e => update(cue.id, { text: e.target.value })} className="min-w-0 flex-1 rounded bg-slate-800 px-2 py-1 text-xs text-white" />
                        <button type="button" onClick={() => setCues(cues.filter(c => c.id !== cue.id))} className="text-xs text-red-300" aria-label="Xóa nhịp">Xóa</button>
                    </div>
                    <label className="flex items-center gap-2 text-[11px] text-slate-400">Mẫu hiển thị
                        <select aria-label="Mẫu Storyboard" value={cue.template || 'auto'} onChange={e => update(cue.id, { template: e.target.value as GraphicTemplate })} className="min-w-0 flex-1 rounded bg-slate-800 px-2 py-1 text-xs text-white">
                            {Object.entries(templateLabels).map(([template, label]) => <option key={template} value={template}>{label}</option>)}
                        </select>
                    </label>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                        <label>Bắt đầu {Math.round(cue.at * 100)}%<input type="range" min="0" max="92" value={Math.round(cue.at * 100)} onChange={e => update(cue.id, { at: Number(e.target.value) / 100 })} className="w-full accent-cyan-400" /></label>
                        <label>Hiển thị {Math.round(cue.length * 100)}%<input type="range" min="8" max="80" value={Math.round(cue.length * 100)} onChange={e => update(cue.id, { length: Number(e.target.value) / 100 })} className="w-full accent-cyan-400" /></label>
                    </div>
                </div>)}
                <button type="button" onClick={() => setCues([...cues, { id: `${shot.sceneNumber}-${Date.now()}`, sceneNumber: shot.sceneNumber, kind: 'keyword', template: 'auto', text: language === 'ko' ? '키워드' : 'Từ khóa', at: position, length: 0.3 }])}
                    className="rounded border border-dashed border-cyan-400/40 px-3 py-2 text-xs text-cyan-200">+ Thêm nhịp tại vị trí này</button>
            </div>
        </div>}
    </section>;
}
