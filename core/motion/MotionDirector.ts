export type MotionMode = 'random' | 'auto' | 'hold' | 'push_in' | 'pull_back' | 'pan_left' | 'pan_right' | 'pan_up' | 'pan_down';
export type MotionIntensity = 'subtle' | 'normal' | 'strong';

export interface MotionOverride {
    sceneNumber: number;
    mode: MotionMode;
    intensity: MotionIntensity;
    focusX: number;
    focusY: number;
}

export interface ResolvedMotion {
    mode: Exclude<MotionMode, 'auto' | 'random'>;
    intensity: MotionIntensity;
    focusX: number;
    focusY: number;
}

const modes: MotionMode[] = ['random', 'auto', 'hold', 'push_in', 'pull_back', 'pan_left', 'pan_right', 'pan_up', 'pan_down'];
const randomModes: ResolvedMotion['mode'][] = ['push_in', 'pull_back', 'pan_left', 'pan_right', 'pan_up', 'pan_down'];
const oppositeModes: Partial<Record<ResolvedMotion['mode'], ResolvedMotion['mode']>> = {
    push_in: 'pull_back', pull_back: 'push_in',
    pan_left: 'pan_right', pan_right: 'pan_left',
    pan_up: 'pan_down', pan_down: 'pan_up',
};
const intensities: MotionIntensity[] = ['subtle', 'normal', 'strong'];
const clamp = (value: number, fallback: number) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

export function suggestMotion(text: string, sceneNumber: number): ResolvedMotion['mode'] {
    const source = text.toLowerCase();
    if (/(compare|comparison|versus|before.and.after|side.by.side|비교|대비|전후|対比|比較|so sánh|đối chiếu|比较)/iu.test(source)) return 'pan_right';
    if (/(timeline|process|step|journey|flow|단계|과정|흐름|手順|流れ|quy trình|bước|流程|步骤)/iu.test(source)) return 'pan_right';
    if (/(portrait|person|face|human|emotion|interview|인물|얼굴|감정|人物|顔|người|khuôn mặt|人物|面部)/iu.test(source)) return 'push_in';
    if (/(landscape|city|street|world|wide shot|establish|풍경|도시|전경|風景|都市|phong cảnh|toàn cảnh|风景|城市)/iu.test(source)) return 'pull_back';
    if (/(chart|graph|data|number|detail|diagram|표|그래프|수치|상세|図表|数字|biểu đồ|số liệu|图表|数字)/iu.test(source)) return 'push_in';
    return (['push_in', 'pan_right', 'pull_back', 'pan_left'] as const)[Math.abs(sceneNumber) % 4];
}

export function resolveMotion(
    text: string,
    sceneNumber: number,
    override?: Partial<MotionOverride>,
    previousMode?: ResolvedMotion['mode'] | null
): ResolvedMotion {
    const requestedMode = modes.includes(override?.mode as MotionMode) ? override!.mode! : 'random';
    const randomCandidates = randomModes.filter(mode => mode !== (previousMode ? oppositeModes[previousMode] : null));
    return {
        mode: requestedMode === 'random'
            ? randomCandidates[Math.floor(Math.random() * randomCandidates.length)]
            : requestedMode === 'auto' ? suggestMotion(text, sceneNumber) : requestedMode,
        intensity: intensities.includes(override?.intensity as MotionIntensity) ? override!.intensity! : 'subtle',
        focusX: clamp(Number(override?.focusX), 0.5),
        focusY: clamp(Number(override?.focusY), 0.5),
    };
}

// zoompan runs once for a still image, or once per frame for a composited portrait canvas.
export function motionFilter(motion: ResolvedMotion, frames: number, framesPerInput: number, baseFrames = frames): string | null {
    if (motion.mode === 'hold') return null;
    const durationFactor = Math.min(1, Math.max(0.2, baseFrames / 75));
    const amount = { subtle: 0.055, normal: 0.09, strong: 0.14 }[motion.intensity] * durationFactor;
    const n = Math.max(1, frames - 1);
    const centerX = motion.focusX.toFixed(4);
    const centerY = motion.focusY.toFixed(4);
    let zoomStart = 1 + amount;
    let zoomDelta = 0;
    let xStart = Number(centerX);
    let yStart = Number(centerY);
    let xDelta = 0;
    let yDelta = 0;
    if (motion.mode === 'push_in') { zoomStart = 1.001; zoomDelta = amount; }
    if (motion.mode === 'pull_back') { zoomStart = 1 + amount; zoomDelta = -amount + 0.001; }
    if (motion.mode === 'pan_left') { xStart = 1; xDelta = -1; }
    if (motion.mode === 'pan_right') { xStart = 0; xDelta = 1; }
    if (motion.mode === 'pan_up') { yStart = 1; yDelta = -1; }
    if (motion.mode === 'pan_down') { yStart = 0; yDelta = 1; }
    return `zoompan=z='${zoomStart.toFixed(4)}+${zoomDelta.toFixed(4)}*on/${n}':x='(iw-iw/zoom)*(${xStart.toFixed(4)}+${xDelta.toFixed(4)}*on/${n})':y='(ih-ih/zoom)*(${yStart.toFixed(4)}+${yDelta.toFixed(4)}*on/${n})':d=${framesPerInput}:s=1920x1080:fps=25`;
}
