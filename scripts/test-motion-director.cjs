const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../core/motion/MotionDirector.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = { exports: {} };
new Function('exports', 'module', code)(loaded.exports, loaded);
const { resolveMotion, motionFilter } = loaded.exports;

const randomBefore = Math.random;
try {
    Math.random = () => 0;
    assert.equal(resolveMotion('portrait face', 1).mode, 'push_in');
    Math.random = () => 0.999;
    assert.equal(resolveMotion('portrait face', 1).mode, 'pan_down');
    for (const [previous, opposite] of [['push_in', 'pull_back'], ['pan_left', 'pan_right'], ['pan_up', 'pan_down']]) {
        for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
            Math.random = () => roll;
            assert.notEqual(resolveMotion('scene', 2, undefined, previous).mode, opposite);
        }
    }
    assert.equal(resolveMotion('portrait face', 1, { mode: 'auto' }).mode, 'push_in');
    assert.equal(resolveMotion('portrait face', 1, { mode: 'pan_left' }).mode, 'pan_left');
    assert.equal(resolveMotion('portrait face', 1, { mode: 'pull_back' }, 'push_in').mode, 'pull_back');
} finally {
    Math.random = randomBefore;
}
const gentle = { mode: 'push_in', intensity: 'subtle', focusX: 0.5, focusY: 0.5 };
assert.match(motionFilter(gentle, 50, 50, 25), /\+0\.0183\*on/);
assert.match(motionFilter(gentle, 100, 100, 100), /\+0\.0550\*on/);

const sourceImage = process.argv[2];
assert(sourceImage && fs.existsSync(sourceImage), 'Pass an existing image path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptvision-motion-'));
try {
    let baseVideo;
    for (const [label, title] of [['push', '인물 얼굴'], ['pan', '비교 자료']]) {
        const motion = resolveMotion(title, 1, { mode: 'auto' });
        const filter = `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,${motionFilter(motion, 30, 30)},format=yuv420p`;
        const output = path.join(temp, `${label}.mp4`);
        if (label === 'push') baseVideo = output;
        const ffmpeg = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-i', sourceImage,
            '-frames:v', '30', '-vf', filter, '-r', '25', '-c:v', 'libx264', '-preset', 'ultrafast', output], { encoding: 'utf8' });
        assert.equal(ffmpeg.status, 0, ffmpeg.stderr);
        const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames',
            '-show_entries', 'stream=width,height,nb_read_frames', '-of', 'json', output], { encoding: 'utf8' });
        assert.equal(probe.status, 0, probe.stderr);
        const stream = JSON.parse(probe.stdout).streams[0];
        assert.deepEqual([stream.width, stream.height, Number(stream.nb_read_frames)], [1920, 1080, 30]);
        const hashes = spawnSync('ffmpeg', ['-v', 'error', '-i', output, '-f', 'framemd5', '-'], { encoding: 'utf8' });
        assert.equal(hashes.status, 0, hashes.stderr);
        const frames = hashes.stdout.split(/\r?\n/).filter(line => line && !line.startsWith('#'));
        assert.notEqual(frames[0].split(',').at(-1), frames.at(-1).split(',').at(-1), `${label} did not visibly move`);
        console.log(`${label}: 30 frames, 1920x1080, ${motion.mode}`);
    }
    const layer = path.join(temp, 'layer.png');
    const makeLayer = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i',
        'color=c=red@0.6:s=160x160', '-vf', 'format=rgba', '-frames:v', '1', layer], { encoding: 'utf8' });
    assert.equal(makeLayer.status, 0, makeLayer.stderr);
    const layered = path.join(temp, 'layered.mp4');
    const graph = `[1:v]scale=650:650:force_original_aspect_ratio=decrease,format=rgba,fade=t=in:st=0:d=0.25:alpha=1[layer];` +
        `[0:v][layer]overlay=x='W*0.5-w/2+14*sin(t*1.1)':y='H*0.5-h/2+10*cos(t*0.8)':shortest=1,format=yuv420p[vout]`;
    const compose = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', baseVideo, '-loop', '1', '-i', layer,
        '-filter_complex', graph, '-map', '[vout]', '-frames:v', '30', '-r', '25', '-c:v', 'libx264',
        '-preset', 'ultrafast', layered], { encoding: 'utf8' });
    assert.equal(compose.status, 0, compose.stderr);
    const layeredProbe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames',
        '-show_entries', 'stream=nb_read_frames', '-of', 'default=nw=1:nk=1', layered], { encoding: 'utf8' });
    assert.equal(Number(layeredProbe.stdout.trim()), 30);
    console.log('layered: 30 frames, independent PNG overlay');

    const portraitImage = path.join(temp, 'portrait.png');
    const makePortrait = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', sourceImage,
        '-vf', 'scale=768:1024', '-frames:v', '1', portraitImage], { encoding: 'utf8' });
    assert.equal(makePortrait.status, 0, makePortrait.stderr);
    const portraitGraph = '[0:v]split=2[bg][fg];' +
        '[bg]scale=320:180:force_original_aspect_ratio=increase,crop=320:180,boxblur=20:2,scale=1920:1080,eq=brightness=-0.20:saturation=0.85[blurred];' +
        '[fg]scale=1920:1080:force_original_aspect_ratio=decrease[portrait];' +
        `[blurred][portrait]overlay=x=(W-w)/2:y=(H-h)/2:shortest=1,${motionFilter(resolveMotion('portrait face', 3, { mode: 'auto' }), 30, 1)},format=yuv420p[vout]`;
    const portraitVideo = path.join(temp, 'portrait.mp4');
    const renderPortrait = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-i', portraitImage,
        '-filter_complex', portraitGraph, '-map', '[vout]', '-frames:v', '30', '-r', '25',
        '-c:v', 'libx264', '-preset', 'ultrafast', portraitVideo], { encoding: 'utf8' });
    assert.equal(renderPortrait.status, 0, renderPortrait.stderr);
    const portraitProbe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames',
        '-show_entries', 'stream=nb_read_frames', '-of', 'default=nw=1:nk=1', portraitVideo], { encoding: 'utf8' });
    assert.equal(Number(portraitProbe.stdout.trim()), 30);
    console.log('portrait: 30 frames, backdrop and camera motion');
} finally {
    fs.rmSync(temp, { recursive: true, force: true });
}
