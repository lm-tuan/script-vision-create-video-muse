import { parseSrt } from '../srt/SrtParser';

export const MAX_SHOT_MS = 10_000;

export interface VideoShot {
    shotId: string;
    sceneNumber: number;
    startMs: number;
    endMs: number;
    direction: string;
    dialogue: string;
}

export interface VideoShotClip {
    file: File;
    sourceStartMs: number;
}

export function requestedShotSeconds({ startMs, endMs }: Pick<VideoShot, 'startMs' | 'endMs'>): number {
    return Math.max(1, Math.ceil((endMs - startMs) / 1000));
}

export function checkShotTimeline(shots: VideoShot[], audioMs: number): string[] {
    const issues: string[] = [];
    if (!shots.length) return ['Chưa có shot để kiểm tra.'];
    const ids = new Set<string>();
    let previousEnd = 0;
    for (const shot of shots) {
        if (!/^S\d+-C\d+$/.test(shot.shotId) || ids.has(shot.shotId)) {
            issues.push(`Mã shot không hợp lệ hoặc bị trùng (${shot.shotId}).`);
        }
        ids.add(shot.shotId);
        if (shot.startMs !== previousEnd) issues.push(`Timeline bị hở hoặc chồng nhau tại ${shot.shotId}.`);
        const duration = shot.endMs - shot.startMs;
        if (!Number.isSafeInteger(shot.startMs) || !Number.isSafeInteger(shot.endMs) || duration <= 0 || duration > MAX_SHOT_MS) {
            issues.push(`${shot.shotId} phải có thời lượng lớn hơn 0 và tối đa 10 giây.`);
        }
        previousEnd = shot.endMs;
    }
    if (previousEnd !== audioMs) issues.push('Timeline chưa khớp với thời lượng audio.');
    return issues;
}

export function checkVideoShots(shots: VideoShot[], prompts: Record<string, string>, audioMs: number): string[] {
    return [
        ...checkShotTimeline(shots, audioMs),
        ...shots.filter(shot => !prompts[shot.shotId]?.trim()).map(shot => `${shot.shotId} chưa có prompt.`),
    ];
}

export function readShotSubtitles(srt: string, audioMs: number) {
    if (!Number.isSafeInteger(audioMs) || audioMs <= 0) throw new Error('Thời lượng audio không hợp lệ.');
    const normalized = srt.trim().replace(/\r\n/g, '\n').replace(/\n[ \t]+\n/g, '\n\n');
    const blocks = normalized.split(/\n{2,}/);
    const subtitles = parseSrt(normalized);
    const timestamp = '\\d{2}:[0-5]\\d:[0-5]\\d[,.]\\d{3}';
    const cueHeader = new RegExp(`^\\d+[ \\t]*\\n[ \\t]*${timestamp}[ \\t]+-->[ \\t]+${timestamp}[ \\t]*\\n`);
    if (!subtitles.length || subtitles.length !== blocks.length || blocks.some(block => !cueHeader.test(block)) ||
        new Set(subtitles.map(cue => cue.index)).size !== subtitles.length ||
        subtitles.some((cue, i) => cue.index < 1 || cue.endMs <= cue.startMs ||
            cue.startMs >= audioMs || cue.endMs > audioMs + 100 ||
            (i > 0 && cue.startMs < subtitles[i - 1].startMs))) {
        throw new Error('SRT thiếu, sai thứ tự hoặc không khớp với audio đang dùng.');
    }
    return subtitles;
}

export function planVideoShots(subtitles: ReturnType<typeof readShotSubtitles>, groups: unknown, audioMs: number): VideoShot[] {
    if (!Array.isArray(groups) || !groups.length) throw new Error('API local chưa trả nhóm phân cảnh.');
    let covered = 0;
    const scenes = groups.map(group => {
        const direction = typeof group?.direction === 'string' ? group.direction.trim() : '';
        const indices: unknown = group?.indices;
        if (!direction || !Array.isArray(indices) || !indices.length ||
            !indices.every((index, offset) => index === subtitles[covered + offset]?.index)) {
            throw new Error('API local trả phân cảnh thiếu, trùng hoặc sai thứ tự phụ đề.');
        }
        const first = subtitles[covered];
        const cues = subtitles.slice(covered, covered + indices.length);
        covered += indices.length;
        return { direction, first, cues };
    });
    if (covered !== subtitles.length) throw new Error('API local chưa phân cảnh hết phụ đề.');

    const shots: VideoShot[] = [];
    let startMs = 0;
    scenes.forEach(({ direction, cues }, index) => {
        const sceneEnd = scenes[index + 1]?.first.startMs ?? audioMs;
        const boundaries = cues.slice(1).map(cue => cue.startMs);
        let number = 0;
        while (startMs < sceneEnd) {
            const limit = Math.min(sceneEnd, startMs + MAX_SHOT_MS);
            const preferred = limit < sceneEnd
                ? boundaries.filter(time => time >= startMs + 7000 && time <= limit).pop()
                : undefined;
            const endMs = preferred ?? limit;
            shots.push({
                shotId: `S${index + 1}-C${++number}`,
                sceneNumber: index + 1,
                startMs,
                endMs,
                direction,
                dialogue: subtitles.filter(cue => cue.endMs > startMs && cue.startMs < endMs)
                    .map(cue => cue.text).join('\n'),
            });
            startMs = endMs;
        }
        if (!number) throw new Error('Hai cảnh dùng chung mốc bắt đầu. Hãy nhóm lại phụ đề.');
    });
    return shots;
}
