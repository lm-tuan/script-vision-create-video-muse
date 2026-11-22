"use client";

import { useEffect, useRef, useState } from 'react';
import { formatMsToSrtTime, framesToMs, msToFrames } from '@/core/time';
import { checkShotTimeline, checkVideoShots, readShotSubtitles, requestedShotSeconds, type VideoShot, type VideoShotClip } from '@/core/video/VideoShots';

type MuseTask = {
    id: string;
    status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
    progress?: number;
    error?: { code?: string; message?: string };
};

const MUSE_CLIP_LABELS = {
    waiting: 'Chờ lượt',
    submitting: 'Đang gửi yêu cầu',
    queued: 'MuseAI đã xếp hàng',
    running: 'Đang tạo video',
    retrying: 'Đang chờ tự thử lại',
    downloading: 'Đang tải MP4',
    succeeded: 'Thành công',
    failed: 'Thất bại',
    cancelled: 'Đã hủy',
};

type MuseClip = {
    prompt: string;
    phase: keyof typeof MUSE_CLIP_LABELS;
    task?: MuseTask;
    attempt?: number;
    file?: File;
    sourceStartMs?: number;
    error?: string;
};

type PromptStatus = 'running' | 'failed';

const MUSE_ACTIVE_PHASES = new Set<MuseClip['phase']>([
    'submitting', 'queued', 'running', 'downloading', 'retrying',
]);
const MUSE_CONCURRENCY = 10;
const MUSE_MAX_ATTEMPTS = 2;
const MUSE_ERRORS_REQUIRING_ACTION = new Set([
    'invalid_request', 'invalid_api_key', 'not_implemented', 'upstream_quota_exhausted', 'no_account_available',
]);

function museTaskError(task: MuseTask) {
    const detail = task.error?.message || (task.status === 'cancelled' ? 'Tác vụ đã bị hủy.' : 'Tạo clip thất bại.');
    return task.error?.code ? `${task.error.code}: ${detail}` : detail;
}

function generationPercent(task?: MuseTask) {
    if (typeof task?.progress !== 'number' || !Number.isFinite(task.progress)) return undefined;
    return Math.max(0, Math.min(99, Math.round(task.progress)));
}

function museClipPhase(clip?: MuseClip) {
    if (clip?.file) return 'succeeded';
    return clip?.phase ?? (clip?.task?.status === 'succeeded' ? 'downloading' : clip?.task?.status);
}

async function requestMuseVideo(url: string, options?: RequestInit): Promise<Response> {
    const response = await fetch(url, { ...options, cache: 'no-store' });
    if (!response.ok) {
        const data = await response.json().catch(() => null);
        const message = data?.error || `API MuseAI trả HTTP ${response.status}.`;
        throw Object.assign(new Error(data?.code ? `${data.code}: ${message}` : message), { status: response.status });
    }
    return response;
}

function waitForMuse() {
    return new Promise(resolve => window.setTimeout(resolve, 4000));
}

async function pollMuseTask(url: string): Promise<MuseTask> {
    for (let attempt = 0; ; attempt++) {
        try {
            return await (await requestMuseVideo(url)).json();
        } catch (error) {
            const status = (error as { status?: number }).status;
            if (attempt >= 2 || (status && ![429, 502, 503, 504].includes(status))) throw error;
            await waitForMuse();
        }
    }
}

async function request<T>(body: object): Promise<T> {
    const response = await fetch('/api/video-shots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Lỗi kết nối API tạo shot.');
    return data;
}

function measureAudio(url: string): Promise<number> {
    return new Promise((resolve, reject) => {
        const audio = new Audio();
        const finish = (duration?: number) => {
            window.clearTimeout(timeout);
            audio.onloadedmetadata = null;
            audio.onerror = null;
            audio.removeAttribute('src');
            audio.load();
            if (duration && Number.isFinite(duration)) resolve(Math.round(duration * 1000));
            else reject(new Error('Không đọc được thời lượng MP3 Genmax.'));
        };
        const timeout = window.setTimeout(() => finish(), 15_000);
        audio.preload = 'metadata';
        audio.onloadedmetadata = () => finish(audio.duration);
        audio.onerror = () => finish();
        audio.src = url;
    });
}

function ClipRange({ file, shot, startMs, onChange }: {
    file: File;
    shot: VideoShot;
    startMs: number;
    onChange: (startMs: number) => void;
}) {
    const [open, setOpen] = useState(false);
    const [url, setUrl] = useState('');
    const [durationMs, setDurationMs] = useState<number>();
    const player = useRef<HTMLVideoElement>(null);
    const previewEnd = useRef<number | null>(null);
    const editMs = framesToMs(Math.max(1, msToFrames(shot.endMs) - msToFrames(shot.startMs)));
    const frameMs = framesToMs(1);
    const maxStartMs = Math.max(0, Math.floor(((durationMs ?? 0) - editMs) / frameMs) * frameMs);

    useEffect(() => {
        if (!open) return;
        const previewUrl = URL.createObjectURL(file);
        setUrl(previewUrl);
        return () => URL.revokeObjectURL(previewUrl);
    }, [file, open]);

    return (
        <details onToggle={event => {
            setOpen(event.currentTarget.open);
            previewEnd.current = null;
        }} className="space-y-2 text-sm">
            <summary className="cursor-pointer text-sky-300">
                Xem và chọn đoạn dùng{startMs > 0 && ` · từ ${(startMs / 1000).toFixed(2)} giây`}
            </summary>
            {open && <>
                <video ref={player} src={url || undefined} controls preload="metadata" muted
                    className="aspect-video w-full max-w-md rounded-lg bg-black"
                    onLoadedMetadata={event => {
                        const video = event.currentTarget;
                        if (Number.isFinite(video.duration)) setDurationMs(Math.round(video.duration * 1000));
                        video.currentTime = startMs / 1000;
                    }}
                    onTimeUpdate={event => {
                        if (previewEnd.current !== null && event.currentTarget.currentTime >= previewEnd.current) {
                            event.currentTarget.pause();
                            previewEnd.current = null;
                        }
                    }} />
                {durationMs !== undefined && durationMs < editMs && (
                    <p className="text-rose-300">Clip ngắn hơn thời lượng shot {(editMs / 1000).toFixed(2)} giây.</p>
                )}
                {maxStartMs > 0 && <label className="block max-w-md">
                    Bắt đầu đoạn dùng từ {(startMs / 1000).toFixed(2)} giây
                    <input type="range" min={0} max={maxStartMs} step={frameMs} value={startMs}
                        className="block w-full accent-sky-400"
                        onChange={event => {
                            const next = event.currentTarget.valueAsNumber;
                            previewEnd.current = null;
                            const video = player.current;
                            if (video) {
                                video.pause();
                                video.currentTime = next / 1000;
                            }
                            onChange(next);
                        }} />
                </label>}
                {durationMs !== undefined && durationMs >= editMs && (
                    <button type="button" className="rounded-lg bg-slate-800 px-3 py-2"
                        onClick={() => {
                            const video = player.current;
                            if (!video) return;
                            video.currentTime = startMs / 1000;
                            previewEnd.current = (startMs + editMs) / 1000;
                            void video.play().catch(() => { previewEnd.current = null; });
                        }}>Xem đoạn {(startMs / 1000).toFixed(2)}–{((startMs + editMs) / 1000).toFixed(2)} giây</button>
                )}
            </>}
        </details>
    );
}

export function VideoShotsPanel({ audioUrl, srt, onApply }: {
    audioUrl: string | null;
    srt: string;
    onApply: (shots: VideoShot[], input: { audioFile: File | null; srt: string; clips: Record<string, VideoShotClip> }) => void;
}) {
    const [shots, setShots] = useState<VideoShot[]>([]);
    const [prompts, setPrompts] = useState<Record<string, string>>({});
    const [promptStatuses, setPromptStatuses] = useState<Partial<Record<string, PromptStatus>>>({});
    const [museClips, setMuseClips] = useState<Record<string, MuseClip>>({});
    const [visualGuide, setVisualGuide] = useState('');
    const [promptGuide, setPromptGuide] = useState('');
    const [mode, setMode] = useState<'genmax' | 'files'>('genmax');
    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [srtFile, setSrtFile] = useState<File | null>(null);
    const [fileUrl, setFileUrl] = useState<{ file: File; url: string } | null>(null);
    const [prepared, setPrepared] = useState<{
        url: string; srt: string; audioFile: File | null; srtFile: File | null; audioMs: number; lastSubtitleMs: number;
    } | null>(null);
    const [source, setSource] = useState<typeof prepared>(null);
    const [timelineApproved, setTimelineApproved] = useState(false);
    const [review, setReview] = useState<{ source: typeof source; prompts: typeof prompts; guide: string; issues: string[] } | null>(null);
    const [approved, setApproved] = useState(false);
    const audioPlayer = useRef<HTMLAudioElement>(null);
    const museBatchActive = useRef(false);
    const [progress, setProgress] = useState('');
    const [error, setError] = useState('');
    useEffect(() => {
        if (!audioFile) return;
        const url = URL.createObjectURL(audioFile);
        setFileUrl({ file: audioFile, url });
        return () => URL.revokeObjectURL(url);
    }, [audioFile]);
    const inputUrl = mode === 'genmax' ? audioUrl : fileUrl?.file === audioFile ? fileUrl?.url : null;
    const preparedCurrent = !!prepared && prepared.url === inputUrl && (mode === 'genmax'
        ? prepared.audioFile === null && prepared.srt === srt
        : prepared.audioFile === audioFile && prepared.srtFile === srtFile);
    const current = preparedCurrent && source === prepared;
    const currentPrompts = promptGuide === visualGuide ? prompts : {};
    const ready = current && shots.length > 0 && shots.every(shot => currentPrompts[shot.shotId]?.trim());
    const reviewCurrent = current && review?.source === source && review?.prompts === prompts && review?.guide === visualGuide;
    const canExport = timelineApproved && reviewCurrent && review.issues.length === 0 && approved && ready;
    const button = 'rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-100 disabled:opacity-50';
    const museClipFor = (shotId: string) => {
        const clip = museClips[shotId];
        return clip?.prompt === currentPrompts[shotId]?.trim() ? clip : undefined;
    };
    const missingClips = shots.filter(shot => !museClipFor(shot.shotId)?.file);
    const museCounts = { succeeded: 0, failed: 0, active: 0, waiting: 0, progress: 0 };
    for (const { shotId } of shots) {
        const clip = museClipFor(shotId);
        const phase = museClipPhase(clip);
        if (phase && MUSE_ACTIVE_PHASES.has(phase)) {
            museCounts.active++;
            if (phase === 'downloading') museCounts.progress += 99;
            if (phase === 'running') museCounts.progress += generationPercent(clip?.task) ?? 0;
            continue;
        }
        switch (phase) {
            case 'succeeded':
                museCounts.succeeded++;
                museCounts.progress += 100;
                break;
            case 'failed':
            case 'cancelled':
                museCounts.failed++;
                museCounts.progress += 100;
                break;
            default:
                museCounts.waiting++;
        }
    }
    const musePercent = shots.length ? Math.floor(museCounts.progress / shots.length) : 0;

    function resetSource() {
        setPrepared(null);
        setError('');
    }

    async function prepareSource() {
        if (!inputUrl) return;
        setProgress('Đang kiểm tra audio và SRT…');
        setError('');
        try {
            const subtitles = mode === 'files' ? await srtFile?.text() ?? '' : srt;
            const audioMs = await measureAudio(inputUrl);
            const cues = readShotSubtitles(subtitles, audioMs);
            setPrepared({
                url: inputUrl, srt: subtitles, audioMs,
                audioFile: mode === 'files' ? audioFile : null,
                srtFile: mode === 'files' ? srtFile : null,
                lastSubtitleMs: cues.reduce((last, cue) => Math.max(last, cue.endMs), 0),
            });
        } catch (error) {
            setPrepared(null);
            setError(error instanceof Error ? error.message : String(error));
        } finally {
            setProgress('');
        }
    }

    async function plan() {
        if (!preparedCurrent || !prepared) return;
        setProgress('Đang phân cảnh qua API local…');
        setError('');
        setTimelineApproved(false);
        setReview(null);
        try {
            const result = await request<{ shots: VideoShot[] }>({ action: 'plan', srt: prepared.srt, audioMs: prepared.audioMs });
            const issues = checkShotTimeline(result.shots, prepared.audioMs);
            if (issues.length) throw new Error(issues.join(' '));
            setSource(prepared);
            setShots(result.shots);
            setPrompts({});
            setPromptStatuses({});
            setMuseClips({});
        } catch (error) {
            setError(error instanceof Error ? error.message : String(error));
        } finally {
            setProgress('');
        }
    }

    function updatePromptStatuses(shotIds: string[], status?: PromptStatus) {
        setPromptStatuses(previous => ({ ...previous, ...Object.fromEntries(shotIds.map(id => [id, status])) }));
    }

    async function generate(target: VideoShot[]) {
        if (progress || !target.length) return;
        const shotIds = target.map(shot => shot.shotId);
        updatePromptStatuses(shotIds, 'running');
        setError('');
        setProgress(`Đang tạo prompt cho ${shotIds.length} phân cảnh trong 1 yêu cầu…`);
        if (promptGuide !== visualGuide) setPrompts({});
        setPromptGuide(visualGuide);
        try {
            const result = await request<{ prompts: Record<string, string> }>({
                action: 'prompts', shots: target, visualGuide,
            });
            setPrompts(previous => ({ ...previous, ...result.prompts }));
            updatePromptStatuses(shotIds);
        } catch (error) {
            updatePromptStatuses(shotIds, 'failed');
            setError(error instanceof Error ? error.message : String(error));
        } finally {
            setProgress('');
        }
    }

    async function generateMuseClips(target: VideoShot[]) {
        if (!canExport || progress || museBatchActive.current || !target.length) return;
        museBatchActive.current = true;
        setError('');
        setProgress('Đang tạo clip MuseAI…');
        const api = '/api/muse-videos';
        let nextIndex = 0;
        const workerCount = Math.min(target.length, MUSE_CONCURRENCY);
        const waiting = Object.fromEntries(target.map(({ shotId }): [string, MuseClip] => {
            const clip = museClipFor(shotId);
            return [shotId, { prompt: currentPrompts[shotId].trim(), task: clip?.task, attempt: clip?.attempt, phase: 'waiting' }];
        }));
        setMuseClips(previous => ({ ...previous, ...waiting }));

        async function generateClip(shot: VideoShot) {
            const { shotId } = shot;
            const previous = waiting[shotId];
            const { prompt } = previous;
            let task = previous.task;
            if (task?.status === 'failed' || task?.status === 'cancelled') task = undefined;
            let attempt = task ? previous.attempt ?? 1 : 1;
            const update = (phase: MuseClip['phase'], file?: File, error?: string) => {
                const clip = { prompt, phase, task, attempt, file, error };
                setMuseClips(previous => ({ ...previous, [shotId]: clip }));
            };
            const taskUrl = (id: string) => `${api}?id=${encodeURIComponent(id)}`;
            try {
                let startedAt = Date.now();
                while (true) {
                    if (!task) {
                        update('submitting');
                        task = await (await requestMuseVideo(api, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ prompt, duration: requestedShotSeconds(shot) }),
                        })).json() as MuseTask;
                        startedAt = Date.now();
                    }
                    if (task.status === 'succeeded') break;
                    if (task.status === 'failed' && attempt < MUSE_MAX_ATTEMPTS &&
                        !MUSE_ERRORS_REQUIRING_ACTION.has(task.error?.code ?? '')) {
                        update('retrying', undefined, museTaskError(task));
                        await waitForMuse();
                        attempt++;
                        task = undefined;
                        continue;
                    }
                    if (task.status === 'failed' || task.status === 'cancelled') {
                        throw new Error(museTaskError(task));
                    }
                    update(task.status);
                    if (Date.now() - startedAt >= 15 * 60_000) {
                        throw new Error('Đã chờ 15 phút. Bấm tiếp tục để theo dõi cùng tác vụ.');
                    }
                    await waitForMuse();
                    task = await pollMuseTask(taskUrl(task.id));
                }
                update('downloading');
                const media = await (await requestMuseVideo(`${taskUrl(task.id)}&download=1`)).blob();
                if (!media.size) throw new Error('MuseAI trả về tệp MP4 rỗng.');
                const file = new File([media], `${shotId}.mp4`, { type: 'video/mp4' });
                update('succeeded', file);
            } catch (error) {
                const status = (error as { status?: number }).status;
                if (status === 404) task = undefined;
                const hint = !task && (!status || status === 502 || status === 504)
                    ? ' Chưa nhận được mã tác vụ. Kiểm tra gateway trước khi gửi lại.'
                    : '';
                update(task?.status === 'cancelled' ? 'cancelled' : 'failed', undefined,
                    `${error instanceof Error ? error.message : String(error)}${hint}`);
            }
        }

        async function worker() {
            while (nextIndex < target.length) {
                const shot = target[nextIndex++];
                await generateClip(shot);
            }
        }

        try {
            await Promise.all(Array.from({ length: workerCount }, () => worker()));
        } finally {
            museBatchActive.current = false;
            setProgress('');
        }
    }

    function download() {
        const data = shots.map(shot => ({
            ...shot,
            clipFile: `${shot.shotId}.mp4`,
            sourceDurationMs: requestedShotSeconds(shot) * 1000,
            sourceStartMs: museClipFor(shot.shotId)?.sourceStartMs ?? 0,
            editDurationMs: shot.endMs - shot.startMs,
            prompt: currentPrompts[shot.shotId],
        }));
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'video-shots.json';
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function reviewShots() {
        if (!current || !source) return;
        setReview({ source, prompts, guide: visualGuide, issues: checkVideoShots(shots, currentPrompts, source.audioMs) });
        setApproved(false);
    }

    return (
        <section className="space-y-4">
            <h2 className="text-lg font-semibold">Shot video</h2>
            <fieldset className="space-y-3 rounded-xl border border-white/10 p-3 text-sm" disabled={!!progress}>
                <legend className="px-1 font-semibold">Chuẩn bị audio và SRT</legend>
                <label className="mr-4 inline-flex items-center gap-2">
                    <input type="radio" name="shot-source" checked={mode === 'genmax'} onChange={() => { setMode('genmax'); resetSource(); }} />
                    Dùng kết quả Genmax
                </label>
                <label className="inline-flex items-center gap-2">
                    <input type="radio" name="shot-source" checked={mode === 'files'} onChange={() => { setMode('files'); resetSource(); }} />
                    Dùng MP3 và SRT có sẵn
                </label>
                {mode === 'files' && <div className="grid gap-2 sm:grid-cols-2">
                    <label className="space-y-1">MP3
                        <input className="block w-full" type="file" accept=".mp3,audio/mpeg" onChange={event => {
                            const file = event.target.files?.[0] ?? null;
                            setAudioFile(null);
                            resetSource();
                            if (file && !/\.mp3$/i.test(file.name)) setError('Chọn tệp audio MP3.');
                            else setAudioFile(file);
                        }} />
                    </label>
                    <label className="space-y-1">SRT
                        <input className="block w-full" type="file" accept=".srt" onChange={event => {
                            const file = event.target.files?.[0] ?? null;
                            setSrtFile(null);
                            resetSource();
                            if (file && !/\.srt$/i.test(file.name)) setError('Chọn tệp phụ đề SRT.');
                            else setSrtFile(file);
                        }} />
                    </label>
                </div>}
                {mode === 'genmax' && (!audioUrl || !srt.trim()) && <p>Tạo audio Genmax hoặc chọn cặp MP3 và SRT có sẵn.</p>}
                <button className={button} disabled={!inputUrl || (mode === 'genmax' ? !srt.trim() : !srtFile)}
                    onClick={prepareSource}>Kiểm tra audio và SRT</button>
                {preparedCurrent && <p role="status">Audio {formatMsToSrtTime(prepared.audioMs)} · Mốc cuối SRT {formatMsToSrtTime(prepared.lastSubtitleMs)}</p>}
            </fieldset>
            <label className="block text-sm">
                Nhân vật, bối cảnh, phong cách và tỷ lệ khung hình dùng chung
                <textarea className="mt-1 w-full rounded-lg bg-slate-900 p-2" rows={3}
                    maxLength={4000} value={visualGuide} disabled={!!progress} onChange={event => {
                        setVisualGuide(event.target.value);
                        setPromptStatuses({});
                        setReview(null);
                        setApproved(false);
                    }} />
            </label>
            <div className="flex flex-wrap gap-2">
                <button className={button} disabled={!preparedCurrent || !!progress} onClick={plan}>Tạo phân cảnh</button>
                <button className={button} disabled={!current || !timelineApproved || ready || !!progress}
                    onClick={() => generate(shots.filter(shot => !currentPrompts[shot.shotId]?.trim()))}>Tạo prompt còn thiếu</button>
                <button className={button} disabled={!current || !!progress} onClick={reviewShots}>Kiểm tra shot và prompt</button>
                <button className={button} disabled={!canExport || !!progress || missingClips.length === 0}
                    onClick={() => generateMuseClips(missingClips)}>Tạo clip còn thiếu bằng MuseAI</button>
                <button className={button} disabled={!canExport || !!progress} onClick={() => {
                    if (!canExport || !source) return;
                    const clips: Record<string, VideoShotClip> = {};
                    for (const { shotId } of shots) {
                        const clip = museClipFor(shotId);
                        if (clip?.file) clips[shotId] = { file: clip.file, sourceStartMs: clip.sourceStartMs ?? 0 };
                    }
                    onApply(shots, { audioFile: source.audioFile, srt: source.srt, clips });
                }}>Mở timeline trong Dựng video</button>
                <button className={button} disabled={!canExport || !!progress} onClick={download}>Tải timeline và prompt JSON</button>
            </div>
            {current && (museBatchActive.current || museCounts.waiting < shots.length) && (
                <section aria-label="Tiến trình MuseAI" className="space-y-2 rounded-xl border border-white/10 bg-slate-900/60 p-3 text-sm">
                    <div className="flex items-center justify-between font-semibold">
                        <span>Tiến trình xử lý clip MuseAI</span>
                        <span className="tabular-nums">{musePercent}%</span>
                    </div>
                    <progress aria-label="Tiến trình xử lý toàn bộ shot" max={100} value={musePercent}
                        className="block h-2 w-full accent-sky-400" />
                    <p className="flex flex-wrap gap-x-4 gap-y-1" role="status">
                        <span className="text-emerald-300">{museCounts.succeeded}/{shots.length} có MP4</span>
                        <span className="text-rose-300">{museCounts.failed} lỗi hoặc đã hủy</span>
                        <span className="text-sky-300">{museCounts.active} đang xử lý</span>
                        <span className="text-slate-300">{museCounts.waiting} chờ hoặc chưa tạo</span>
                    </p>
                </section>
            )}
            {progress && !museBatchActive.current && <p role="status" className="text-sm">{progress}</p>}
            {error && <p role="alert" className="whitespace-pre-line text-sm text-red-300">{error}</p>}
            {source && !current && <p className="text-sm">Audio hoặc SRT đã đổi. Hãy lập lại shot.</p>}
            {preparedCurrent && <audio ref={audioPlayer} src={prepared.url} controls preload="metadata" aria-label="Nghe thử audio" />}
            {current && <div className="space-y-2 rounded-xl border border-white/10 p-3 text-sm">
                <p className="text-emerald-300">{shots.length} shot liên tục, mỗi shot tối đa 10 giây và phủ hết audio.</p>
                <label className="flex items-start gap-2">
                    <input type="checkbox" checked={timelineApproved} disabled={!!progress} onChange={event => {
                        setTimelineApproved(event.target.checked);
                        setReview(null);
                        setApproved(false);
                    }} />
                    Tôi đã nghe đối chiếu lời đọc và xác nhận cách chia cảnh.
                </label>
            </div>}
            {reviewCurrent && (
                <div className="space-y-2 rounded-xl border border-white/10 p-3 text-sm" aria-live="polite">
                    {review.issues.length > 0 ? (
                        <ul className="list-disc space-y-1 pl-5 text-red-300">
                            {review.issues.map((issue, index) => <li key={index}>{issue}</li>)}
                        </ul>
                    ) : (
                        <>
                            <p className="text-emerald-300">{shots.length} shot phủ hết audio và có đủ prompt.</p>
                            <label className="flex items-start gap-2">
                                <input type="checkbox" checked={approved} disabled={!!progress} onChange={event => setApproved(event.target.checked)} />
                                Tôi đã đối chiếu prompt với lời đọc và kiểm tra sự nhất quán của nhân vật, bối cảnh.
                            </label>
                        </>
                    )}
                </div>
            )}
            {current && shots.map(shot => {
                const clip = museClipFor(shot.shotId);
                const task = clip?.task;
                const phase = museClipPhase(clip);
                const museActive = !!phase && MUSE_ACTIVE_PHASES.has(phase);
                const promptStatus = promptStatuses[shot.shotId];
                const promptActive = promptStatus === 'running';
                const hasPrompt = !!currentPrompts[shot.shotId]?.trim();
                const active = promptActive || museActive;
                const hasError = phase === 'failed' || phase === 'cancelled';
                const errorDetail = clip?.error ?? (hasError ? task?.error?.message : undefined);
                const canResume = task && ['queued', 'running', 'succeeded'].includes(task.status);
                const action = canResume ? 'Tiếp tục MuseAI' : hasError ? 'Thử lại MuseAI' : 'Tạo clip MuseAI';
                const label = phase === 'failed' && canResume
                    ? task.status === 'succeeded' ? 'Lỗi tải MP4' : 'Lỗi theo dõi tác vụ'
                    : phase ? MUSE_CLIP_LABELS[phase] : 'Chưa tạo';
                const percent = phase === 'succeeded' ? 100 : phase === 'running' ? generationPercent(task) : undefined;
                const statusColor = phase === 'succeeded' ? 'text-emerald-300' : hasError ? 'text-rose-300' : phase === 'retrying' ? 'text-amber-300'
                    : museActive ? 'text-sky-300' : 'text-slate-300';
                return (
                    <article key={shot.shotId} aria-busy={active || undefined}
                        className={`space-y-2 rounded-xl border p-3 ${active ? 'border-sky-400/60 bg-sky-950/40 ring-1 ring-sky-400/20' : 'border-white/10'}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="flex items-center gap-2 text-sm font-semibold">
                                {active && <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-sky-400 motion-safe:animate-pulse" />}
                                {shot.shotId} · {formatMsToSrtTime(shot.startMs)} – {formatMsToSrtTime(shot.endMs)}
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                <button className={button} onClick={() => {
                                    const audio = audioPlayer.current;
                                    if (!audio || audio.readyState === 0) return;
                                    audio.currentTime = shot.startMs / 1000;
                                    void audio.play().catch(() => setError('Không phát được giọng đọc.'));
                                }}>Nghe từ shot này</button>
                                <button className={button} disabled={!timelineApproved || !!progress} onClick={() => generate([shot])}>Tạo lại prompt</button>
                                {!clip?.file && <button className={button} disabled={!canExport || !!progress}
                                    onClick={() => generateMuseClips([shot])}>{action}</button>}
                            </div>
                        </div>
                        <p className="text-sm text-slate-300">{shot.direction}</p>
                        <p className="whitespace-pre-line text-sm text-slate-400">{shot.dialogue}</p>
                        <p className={`text-sm font-semibold ${promptActive ? 'text-sky-300' : promptStatus === 'failed' ? 'text-rose-300' : hasPrompt ? 'text-emerald-300' : 'text-slate-300'}`}>
                            Prompt · {promptActive ? 'Đang tạo' : promptStatus === 'failed' ? 'Tạo thất bại' : hasPrompt ? 'Sẵn sàng' : 'Chưa có'}
                        </p>
                        {(phase || (hasPrompt && !promptActive)) && <div className="space-y-1 text-sm">
                            <p className={statusColor}>
                                <span className="font-semibold">MuseAI · {label}</span>
                                {clip?.attempt && (phase === 'retrying' || clip.attempt > 1)
                                    ? <span> · Lần {phase === 'retrying' ? clip.attempt + 1 : clip.attempt}/{MUSE_MAX_ATTEMPTS}</span>
                                    : null}
                                {percent !== undefined && <span className="tabular-nums"> · {percent}%</span>}
                                {clip?.file && <span> · {clip.file.name}</span>}
                                {task && <span className="text-xs text-slate-400"> · {task.id}</span>}
                            </p>
                            {(phase === 'running' || phase === 'downloading') && (
                                <progress aria-label={`Tiến trình MuseAI của ${shot.shotId}`} max={100} value={percent}
                                    className="block h-1.5 w-full accent-sky-400" />
                            )}
                            {errorDetail && <p className={phase === 'retrying' ? 'text-amber-300' : 'text-rose-300'}>{errorDetail}</p>}
                        </div>}
                        {clip?.file && (
                            <ClipRange key={task?.id} file={clip.file} shot={shot} startMs={clip.sourceStartMs ?? 0}
                                onChange={sourceStartMs => setMuseClips(previous => ({
                                    ...previous, [shot.shotId]: { ...clip, sourceStartMs },
                                }))} />
                        )}
                        <textarea aria-label={`Prompt ${shot.shotId}`} className="w-full rounded-lg bg-slate-900 p-2 text-sm"
                            rows={3} value={currentPrompts[shot.shotId] || ''} disabled={!timelineApproved || !!progress}
                            onChange={event => {
                                const value = event.target.value;
                                updatePromptStatuses([shot.shotId]);
                                setPromptGuide(visualGuide);
                                setPrompts(previous => ({ ...(promptGuide === visualGuide ? previous : {}), [shot.shotId]: value }));
                            }} />
                    </article>
                );
            })}
        </section>
    );
}
