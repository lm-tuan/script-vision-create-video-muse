const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../core/timeline/TransitionComposer.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = { exports: {} };
new Function('exports', 'module', 'require', code)(loaded.exports, loaded, require);
const { composeTransitionsInBatches } = loaded.exports;

async function main() {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptvision-transitions-'));
    try {
        const sample = path.join(temp, 'scene.mp4');
        const make = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi',
            '-i', 'color=c=blue:s=320x180:r=25', '-frames:v', '30',
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p', sample], { encoding: 'utf8' });
        assert.equal(make.status, 0, make.stderr);
        const count = 17;
        const overlap = 5;
        const clips = Array.from({ length: count }, () => ({ fileName: 'scene.mp4', frames: 30 }));
        const output = await composeTransitionsInBatches(temp, clips, 'fade', overlap, 4);
        const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height,nb_frames', '-of', 'json', output],
        { cwd: temp, encoding: 'utf8' });
        assert.equal(probe.status, 0, probe.stderr);
        const stream = JSON.parse(probe.stdout).streams[0];
        assert.deepEqual([stream.width, stream.height, Number(stream.nb_frames)],
            [320, 180, count * 30 - (count - 1) * overlap]);
        assert(fs.existsSync(path.join(temp, 'transition_stage_1_group_0.mp4')),
            'Expected multiple transition stages');
        console.log(`${count} scenes merged in batches: ${stream.nb_frames} frames`);

        const realWorkspace = process.argv[2];
        if (realWorkspace) {
            const realClips = [];
            for (let index = 1; index <= 5; index++) {
                const fileName = path.resolve(realWorkspace, `segment_${index}.mp4`);
                assert(fs.existsSync(fileName), `Missing ${fileName}`);
                const metadata = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
                    '-show_entries', 'stream=nb_frames', '-of', 'default=noprint_wrappers=1:nokey=1', fileName],
                { encoding: 'utf8' });
                assert.equal(metadata.status, 0, metadata.stderr);
                realClips.push({ fileName, frames: Number(metadata.stdout.trim()) });
            }
            const realOutput = await composeTransitionsInBatches(temp, realClips, 'fade', 13, 4);
            const realProbe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
                '-show_entries', 'stream=width,height,nb_frames', '-of', 'json', realOutput],
            { cwd: temp, encoding: 'utf8' });
            assert.equal(realProbe.status, 0, realProbe.stderr);
            const realStream = JSON.parse(realProbe.stdout).streams[0];
            const expected = realClips.reduce((sum, clip) => sum + clip.frames, 0) - 13 * (realClips.length - 1);
            assert.deepEqual([realStream.width, realStream.height, Number(realStream.nb_frames)], [1920, 1080, expected]);
            console.log(`Real scene segments merged: ${realStream.nb_frames} frames`);
        }
    } finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
