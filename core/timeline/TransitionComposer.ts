import { execFile as callbackExecFile } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';

const execFile = promisify(callbackExecFile);
const RANDOM_TRANSITIONS = ['fade', 'fadeblack', 'dissolve', 'wipeleft', 'slideright', 'smoothleft', 'circleopen', 'smoothright'];

export interface TransitionClip {
    fileName: string;
    frames: number;
}

/** Merge small groups so FFmpeg never opens an entire long video as one xfade graph. */
export async function composeTransitionsInBatches(
    workspaceDir: string,
    clips: TransitionClip[],
    transitionType: string,
    transitionFrames: number,
    maxInputs = 16,
    onProgress?: (completed: number, total: number) => void | Promise<void>
): Promise<string> {
    if (!clips.length) throw new Error('Không có cảnh để ghép chuyển cảnh.');
    if (clips.length === 1) return clips[0].fileName;
    const groupSize = Math.max(2, Math.min(16, Math.floor(maxInputs)));
    const overlapFrames = Math.max(1, Math.floor(transitionFrames));
    const overlapSeconds = overlapFrames / 25;
    let current = clips;
    let stage = 0;
    let remainingCount = clips.length;
    let totalGroups = 0;
    while (remainingCount > 1) {
        totalGroups += Math.floor(remainingCount / groupSize) + (remainingCount % groupSize > 1 ? 1 : 0);
        remainingCount = Math.ceil(remainingCount / groupSize);
    }
    let completedGroups = 0;

    while (current.length > 1) {
        const next: TransitionClip[] = [];
        for (let start = 0; start < current.length; start += groupSize) {
            const group = current.slice(start, start + groupSize);
            if (group.length === 1) {
                next.push(group[0]);
                continue;
            }
            const outputFile = current.length <= groupSize
                ? 'transitioned.mp4'
                : `transition_stage_${stage}_group_${next.length}.mp4`;
            const parts = group.map((_, index) => `[${index}:v]format=yuv420p,setsar=1[in${index}]`);
            let accumulatedFrames = group[0].frames;
            for (let index = 1; index < group.length; index++) {
                const previous = index === 1 ? '[in0]' : `[mix${index - 1}]`;
                const nextInput = `[in${index}]`;
                const output = index === group.length - 1 ? '[vout]' : `[mix${index}]`;
                const type = transitionType === 'random'
                    ? RANDOM_TRANSITIONS[Math.floor(Math.random() * RANDOM_TRANSITIONS.length)]
                    : transitionType;
                const offsetFrames = accumulatedFrames - overlapFrames;
                if (offsetFrames < 0) throw new Error('Cảnh ngắn hơn thời lượng chuyển cảnh.');
                parts.push(`${previous}${nextInput}xfade=transition=${type}:duration=${overlapSeconds.toFixed(3)}:offset=${(offsetFrames / 25).toFixed(3)}${output}`);
                accumulatedFrames = offsetFrames + group[index].frames;
            }
            const args = ['-y', '-hide_banner', '-loglevel', 'error', '-nostats', '-filter_complex_threads', '2'];
            for (const clip of group) args.push('-threads', '1', '-i', clip.fileName);
            args.push('-filter_complex', parts.join(';'), '-map', '[vout]', '-frames:v', String(accumulatedFrames),
                '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p', '-threads', '2', outputFile);
            try {
                await execFile('ffmpeg', args, { cwd: workspaceDir, maxBuffer: 1024 * 1024 });
            } catch (error) {
                const detail = error && typeof error === 'object' && 'stderr' in error
                    ? String(error.stderr).slice(-1000) : String(error);
                throw new Error(`Ghép chuyển cảnh nhóm ${next.length + 1}, lượt ${stage + 1} thất bại: ${detail}`);
            }
            const { stdout } = await execFile('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
                '-show_entries', 'stream=nb_frames', '-of', 'default=noprint_wrappers=1:nokey=1', outputFile],
            { cwd: workspaceDir });
            const actualFrames = Number(stdout.trim());
            if (Number.isFinite(actualFrames) && actualFrames !== accumulatedFrames) {
                throw new Error(`Ghép chuyển cảnh sai thời lượng: ${outputFile} có ${actualFrames}/${accumulatedFrames} frame.`);
            }
            next.push({ fileName: outputFile, frames: accumulatedFrames });
            completedGroups++;
            await onProgress?.(completedGroups, totalGroups);
        }
        current = next;
        stage++;
    }
    return current[0].fileName;
}
