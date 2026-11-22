const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');

const project = path.resolve(__dirname, '..');
const outputRoot = path.join(project, 'public', 'outputs');
const workspace = path.resolve(process.argv[2] || '');
if (!workspace.startsWith(outputRoot + path.sep) || !fs.existsSync(path.join(workspace, 'scenes_debug.json'))) {
    throw new Error('Pass a compose workspace inside public/outputs with scenes_debug.json');
}

const source = fs.readFileSync(path.join(project, 'core/timeline/TransitionComposer.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = { exports: {} };
new Function('exports', 'module', 'require', code)(loaded.exports, loaded, require);
const { composeTransitionsInBatches } = loaded.exports;

async function main() {
    const recovery = path.join(workspace, 'recovery');
    fs.mkdirSync(recovery, { recursive: true });
    const scenes = JSON.parse(fs.readFileSync(path.join(workspace, 'scenes_debug.json'), 'utf8'));
    const graph = fs.readFileSync(path.join(workspace, 'xfade_filter.txt'), 'utf8');
    const transitions = [...graph.matchAll(/xfade=transition=([a-z]+):duration=([0-9.]+)/g)];
    assert.equal(transitions.length, scenes.length - 1, 'Transition graph does not match scene count');
    const type = transitions[0][1];
    assert(transitions.every(match => match[1] === type), 'Mixed original transition types need manual review');
    const transitionFrames = Math.round(Number(transitions[0][2]) * 25);
    const clips = scenes.map(scene => {
        const fileName = path.join(workspace, `segment_${scene.sceneNumber}.mp4`);
        assert(fs.existsSync(fileName), `Missing ${fileName}`);
        const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
            '-show_entries', 'stream=nb_frames', '-of', 'default=noprint_wrappers=1:nokey=1', fileName],
        { encoding: 'utf8' });
        assert.equal(probe.status, 0, probe.stderr);
        const frames = Number(probe.stdout.trim());
        assert(Number.isInteger(frames) && frames > 0);
        return { fileName, frames };
    });
    console.log(`Recovering ${clips.length} scenes with ${type} transitions (${transitionFrames} frames each)`);
    const transitionedName = await composeTransitionsInBatches(recovery, clips, type, transitionFrames, 16,
        (completed, total) => console.log(`Transition group ${completed}/${total} complete`));
    const videoPath = path.join(recovery, transitionedName);
    const audioPath = path.join(workspace, 'audio.mp3');
    const subtitlePath = path.join(workspace, 'uploaded_subtitles.srt');
    const finalPath = path.join(recovery, 'recovered_final_video.mp4');
    const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', videoPath];
    if (fs.existsSync(audioPath)) args.push('-i', audioPath);
    if (fs.existsSync(subtitlePath)) args.push('-i', subtitlePath);
    args.push('-map', '0:v:0');
    if (fs.existsSync(audioPath)) args.push('-map', '1:a:0');
    if (fs.existsSync(subtitlePath)) args.push('-map', `${fs.existsSync(audioPath) ? 2 : 1}:s:0`);
    args.push('-c:v', 'copy');
    if (fs.existsSync(audioPath)) args.push('-c:a', 'aac', '-b:a', '128k');
    if (fs.existsSync(subtitlePath)) args.push('-c:s', 'mov_text');
    args.push('-movflags', '+faststart', '-shortest', finalPath);
    const merge = spawnSync('ffmpeg', args, { encoding: 'utf8' });
    assert.equal(merge.status, 0, merge.stderr);
    console.log(`Recovered video: ${finalPath}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
