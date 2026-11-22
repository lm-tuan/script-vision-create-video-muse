import { parseSrt, type SrtSubtitle } from '@/core/srt/SrtParser';
import { parseTimeRangeToMs } from '@/core/time';
import type { DurationEntry } from '@/types';

export type GraphicKind = 'keyword' | 'stat' | 'steps';
export type StoryboardDensity = 'selective' | 'balanced' | 'full';
export type GraphicTemplate = 'auto' | 'banner' | 'card' | 'outline' | 'lower';
export type ResolvedGraphicTemplate = Exclude<GraphicTemplate, 'auto'>;

const TEMPLATE_SEQUENCE: ResolvedGraphicTemplate[] = ['banner', 'card', 'outline', 'lower'];

export function resolveGraphicTemplate(cue: Pick<StoryboardCue, 'sceneNumber' | 'template'>, cueIndex: number): ResolvedGraphicTemplate {
    if (cue.template && cue.template !== 'auto' && TEMPLATE_SEQUENCE.includes(cue.template)) return cue.template;
    return TEMPLATE_SEQUENCE[(Math.max(0, cue.sceneNumber - 1) + cueIndex) % TEMPLATE_SEQUENCE.length];
}

export function graphicTextLimit(template: ResolvedGraphicTemplate, kind: GraphicKind = 'keyword'): number {
    const base = { banner: 18, card: 15, outline: 20, lower: 18 }[template];
    return kind === 'stat' ? Math.min(base, 12) : base;
}

export function graphicFontSize(template: ResolvedGraphicTemplate, kind: GraphicKind): number {
    return kind === 'stat' ? (template === 'card' ? 48 : 54) : template === 'card' ? 34 : template === 'outline' ? 40 : 36;
}

/** Approximate the FFmpeg text width so card backgrounds follow short phrases. */
export function graphicCardWidth(text: string, template: ResolvedGraphicTemplate, fontSize: number): number {
    const cap = template === 'card' ? 700 : 920;
    const glyphWidth = Array.from(text).reduce((total, char) => {
        if (/\s/u.test(char)) return total + fontSize * 0.32;
        if (/[\u1100-\u11FF\u3130-\u318F\u2E80-\u9FFF\uAC00-\uD7A3]/u.test(char)) return total + fontSize;
        return total + fontSize * 0.64;
    }, 0);
    return Math.max(220, Math.min(cap, Math.ceil(glyphWidth * 1.12 + 64)));
}

// Include counters and large-number units commonly used in Korean narration.
const STAT_PATTERN = /\d[\d.,]*\s*(?:%|％|원|명|개|년|개월|일|시간|초|분|배|억|만|천|세|살|km|kg|mL|GB|円|¥|\$|€|万|億|千|年|歳|秒|分|人|倍|percent|million|billion)/i;
const STEP_PATTERN = /(?:→|⇒|->|먼저|우선|그다음|그 다음|다음으로|마지막으로|첫째|둘째|셋째|첫 번째|두 번째|세 번째|\d+\s*단계|まず|次に|最後に|第一|第二|第三|bước\s*\d|step\s*\d|first|second|finally)/i;

export interface StoryboardCue {
    id: string;
    sceneNumber: number;
    kind: GraphicKind;
    template?: GraphicTemplate;
    text: string;
    // Position within the shot. Fractions survive the SRT-based timeline rebuild.
    at: number;
    length: number;
}

/** Keep the graphic inside its fixed video safe area, including Hangul's wider glyphs. */
export function fitGraphicText(text: string, maxCharacters?: number): string {
    const clean = text.replace(/\s+/g, ' ').trim();
    const naturalLimit = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7A3]/u.test(clean) ? 26 : 44;
    const limit = maxCharacters ? Math.min(naturalLimit, maxCharacters) : naturalLimit;
    const characters = Array.from(clean);
    if (characters.length <= limit) return clean;
    const prefix = characters.slice(0, limit).join('').replace(/\s+\S*$/, '').trimEnd();
    return `${prefix || characters.slice(0, limit).join('')}…`;
}

export function classifyGraphic(text: string): GraphicKind {
    if (STAT_PATTERN.test(text)) return 'stat';
    if (STEP_PATTERN.test(text)) return 'steps';
    return 'keyword';
}

export function cueText(text: string, kind: GraphicKind): string {
    const clean = text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (kind === 'stat') {
        const match = clean.match(STAT_PATTERN);
        if (match) return match[0].trim();
    }
    return fitGraphicText(clean);
}

export function generateStoryboard(shots: DurationEntry[], srtText: string, density: StoryboardDensity = 'selective'): StoryboardCue[] {
    const subtitles = parseSrt(srtText).sort((a, b) => a.startMs - b.startMs);
    if (!subtitles.length || !shots.length) return [];
    const candidates: Array<{ cue: StoryboardCue; startMs: number }> = [];
    // Assign each subtitle to one shot, matching the composer's midpoint rule.
    const assignments = new Map<number, SrtSubtitle[]>();
    const ranges = shots.map((shot, index) => {
        const range = shot.startMs !== undefined && shot.endMs !== undefined
            ? { startMs: shot.startMs, endMs: shot.endMs }
            : parseTimeRangeToMs(shot.timeRange);
        return { ...range, shot, index };
    });
    for (const sub of subtitles) {
        const midpoint = (sub.startMs + sub.endMs) / 2;
        const match = ranges.find(r => midpoint >= r.startMs && midpoint < r.endMs)
            || ranges.reduce((best, r) => Math.abs(midpoint - (r.startMs + r.endMs) / 2) < Math.abs(midpoint - (best.startMs + best.endMs) / 2) ? r : best, ranges[0]);
        assignments.set(match.shot.sceneNumber, [...(assignments.get(match.shot.sceneNumber) || []), sub]);
    }
    for (const range of ranges) {
        const assigned = assignments.get(range.shot.sceneNumber) || [];
        // Keep graphics readable; adjacent subtitle beats are merged into at most three cues.
        const selected = density === 'full'
            ? assigned.length <= 3 ? assigned : [assigned[0], assigned[Math.floor(assigned.length / 2)], assigned[assigned.length - 1]]
            : [...assigned].sort((a, b) => {
                const priority = (sub: SrtSubtitle) => ({ stat: 3, steps: 2, keyword: 1 })[classifyGraphic(sub.text)];
                return priority(b) - priority(a) || a.startMs - b.startMs;
            }).slice(0, 1);
        const duration = Math.max(1, range.endMs - range.startMs);
        selected.forEach((sub, index) => {
            const kind = classifyGraphic(sub.text);
            const at = Math.max(0, Math.min(0.92, (sub.startMs - range.startMs) / duration));
            const nextAt = index + 1 < selected.length ? Math.max(at, (selected[index + 1].startMs - range.startMs) / duration) : 1;
            candidates.push({ startMs: sub.startMs, cue: {
                id: `${range.shot.sceneNumber}-${sub.index}`,
                sceneNumber: range.shot.sceneNumber,
                kind,
                template: 'auto',
                text: cueText(sub.text, kind),
                at: Math.round(at * 1000) / 1000,
                length: Math.max(0.08, Math.min(0.6, nextAt - at, 1 - at))
            } });
        });
    }
    if (density === 'full') return candidates.map(candidate => candidate.cue);
    let lastStartMs = -Infinity;
    return candidates.sort((a, b) => a.startMs - b.startMs).filter(candidate => {
        const minimumGap = density === 'selective'
            ? candidate.cue.kind === 'keyword' ? 18000 : 9000
            : candidate.cue.kind === 'keyword' ? 9000 : 5000;
        if (candidate.startMs - lastStartMs < minimumGap) return false;
        lastStartMs = candidate.startMs;
        return true;
    }).map(candidate => candidate.cue);
}
