const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');

const project = path.join(__dirname, '..');
const planSource = fs.readFileSync(path.join(project, 'core/speedpaint/SpeedPaintPlan.ts'), 'utf8');
const planCode = ts.transpileModule(planSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const planModule = { exports: {} };
new Function('exports', 'module', planCode)(planModule.exports, planModule);
const { chooseSpeedPaintStyle, planSpeedPaintStyles } = planModule.exports;
assert.equal(chooseSpeedPaintStyle('auto', null, 0), 'sketch_color');
assert.equal(chooseSpeedPaintStyle('auto', 'sketch_color', 0), 'contour');
assert.equal(chooseSpeedPaintStyle('auto', 'contour', 1), 'brush_fill');
assert.equal(chooseSpeedPaintStyle('brush_fill', 'brush_fill', 0), 'brush_fill');
assert.equal(chooseSpeedPaintStyle('off', null, 0), null);
const sampleScenes = [8.5, 12, 3, 9, 11, 4].map((durationSeconds, index) => ({
    sceneNumber: index + 1, durationSeconds,
}));
assert.deepEqual(planSpeedPaintStyles(sampleScenes, {}, {
    enabled: true, minDurationSeconds: 8, minGapScenes: 2,
}), { 1: 'sketch_color', 4: 'contour' });
assert.deepEqual(planSpeedPaintStyles(sampleScenes, { 2: 'brush_fill', 4: 'off' }, {
    enabled: true, minDurationSeconds: 8, minGapScenes: 2,
}), { 1: 'sketch_color', 2: 'brush_fill', 5: 'contour' });
assert.deepEqual(planSpeedPaintStyles([{ sceneNumber: 1, durationSeconds: 10, isVideo: true }], {}, {
    enabled: true, minDurationSeconds: 8, minGapScenes: 0,
}), {});

const source = process.argv[2];
assert(source && fs.existsSync(source), 'Pass an existing image path');
const pen = path.join(project, 'public/assets/speedpaint/hand_pen.png');
const brush = path.join(project, 'public/assets/speedpaint/hand_brush.png');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptvision-speedpaint-'));
try {
    const midHashes = new Set();
    for (const style of ['sketch_color', 'contour', 'brush_fill']) {
        const output = path.join(temp, `${style}.mp4`);
        const render = spawnSync(process.execPath, [path.join(project, 'scripts/render-speedpaint.cjs'),
            source, pen, brush, output, style, '50'], { encoding: 'utf8' });
        assert.equal(render.status, 0, render.stderr);
        const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames',
            '-show_entries', 'stream=width,height,nb_read_frames', '-of', 'json', output], { encoding: 'utf8' });
        assert.equal(probe.status, 0, probe.stderr);
        const stream = JSON.parse(probe.stdout).streams[0];
        assert.deepEqual([stream.width, stream.height, Number(stream.nb_read_frames)], [1920, 1080, 50]);
        const hashes = spawnSync('ffmpeg', ['-v', 'error', '-i', output, '-f', 'framemd5', '-'], { encoding: 'utf8' });
        assert.equal(hashes.status, 0, hashes.stderr);
        const frames = hashes.stdout.split(/\r?\n/).filter(line => line && !line.startsWith('#'));
        assert.notEqual(frames[0].split(',').at(-1), frames.at(-1).split(',').at(-1));
        midHashes.add(frames[10].split(',').at(-1));
        console.log(`${style}: 50 frames, 1920x1080`);
    }
    assert.equal(midHashes.size, 3, 'The three styles should produce distinct visuals');
} finally {
    fs.rmSync(temp, { recursive: true, force: true });
}
