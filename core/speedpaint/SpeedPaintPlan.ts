export type SpeedPaintStyle = 'sketch_color' | 'contour' | 'brush_fill';
export type SpeedPaintSelection = 'off' | 'auto' | SpeedPaintStyle;

export const SPEED_PAINT_STYLES: SpeedPaintStyle[] = ['sketch_color', 'contour', 'brush_fill'];

export interface VisualScene {
    sceneNumber: number;
    durationSeconds: number;
    isVideo?: boolean;
}

export interface SmartVisualOptions {
    enabled: boolean;
    minDurationSeconds: number;
    minGapScenes: number;
}

export function chooseSpeedPaintStyle(
    selection: SpeedPaintSelection | undefined,
    previous: SpeedPaintStyle | null,
    autoIndex: number
): SpeedPaintStyle | null {
    if (!selection || selection === 'off') return null;
    if (selection !== 'auto') return SPEED_PAINT_STYLES.includes(selection) ? selection : null;
    for (let offset = 0; offset < SPEED_PAINT_STYLES.length; offset++) {
        const style = SPEED_PAINT_STYLES[(autoIndex + offset) % SPEED_PAINT_STYLES.length];
        if (style !== previous) return style;
    }
    return SPEED_PAINT_STYLES[0];
}

export function planSpeedPaintStyles(
    scenes: VisualScene[],
    manual: Record<number, SpeedPaintSelection>,
    options: SmartVisualOptions
): Record<number, SpeedPaintStyle> {
    const result: Record<number, SpeedPaintStyle> = {};
    let previousStyle: SpeedPaintStyle | null = null;
    let previousIndex = -Infinity;
    let autoIndex = 0;
    const threshold = Number.isFinite(options.minDurationSeconds) ? Math.max(2, options.minDurationSeconds) : 8;
    const gap = Number.isFinite(options.minGapScenes) ? Math.max(0, Math.floor(options.minGapScenes)) : 3;
    scenes.forEach((scene, index) => {
        if (scene.isVideo) return;
        const override = manual[scene.sceneNumber];
        const selection: SpeedPaintSelection | undefined = override !== undefined
            ? override
            : options.enabled && scene.durationSeconds >= threshold && index - previousIndex > gap
                ? 'auto' : undefined;
        const style = chooseSpeedPaintStyle(selection, previousStyle, autoIndex);
        if (!style) return;
        result[scene.sceneNumber] = style;
        previousStyle = style;
        previousIndex = index;
        if (selection === 'auto') autoIndex++;
    });
    return result;
}
