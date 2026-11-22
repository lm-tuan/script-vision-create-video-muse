export interface TransitionPlan {
    transitionFrames: number;
    transitionSeconds: number;
    renderFrames: number[];
}

/** Extend adjacent clips across each cut so xfade preserves the audio timeline. */
export function planTransitions(baseFrames: number[], requestedSeconds: number, fps = 25): TransitionPlan {
    if (baseFrames.length < 2) {
        return { transitionFrames: 0, transitionSeconds: 0, renderFrames: [...baseFrames] };
    }

    const shortestScene = Math.min(...baseFrames);
    const requestedFrames = Math.max(1, Math.round(requestedSeconds * fps));
    // Each side of a cut must have enough frames for the overlap.
    const transitionFrames = Math.min(requestedFrames, Math.max(1, 2 * shortestScene - 1));
    const beforeCut = Math.floor(transitionFrames / 2);
    const afterCut = transitionFrames - beforeCut;
    const renderFrames = baseFrames.map((frames, index) =>
        frames + (index > 0 ? beforeCut : 0) + (index < baseFrames.length - 1 ? afterCut : 0)
    );

    return { transitionFrames, transitionSeconds: transitionFrames / fps, renderFrames };
}
