// Runs the real client request -> compose API -> FFmpeg pipeline on generated media.
// Example: node scripts/benchmark-smart-director.cjs --scenes 153
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify, format } = require('node:util');
const sharp = require('sharp');
const { project, createLoader, captureComposeRequest } = require('./lib/compose-test-support.cjs');
const run = promisify(execFile);

function bytesIn(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).reduce((total, entry) => {
        const file = path.join(directory, entry.name);
        return total + (entry.isDirectory() ? bytesIn(file) : fs.statSync(file).size);
    }, 0);
}

async function processes() {
    if (process.platform !== 'win32') return [{ Id: process.pid, WorkingSet64: process.memoryUsage().rss }];
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command',
        "Get-Process | Where-Object { $_.ProcessName -in @('node','ffmpeg','ffprobe','cmd') } | Select-Object Id,WorkingSet64 | ConvertTo-Json -Compress"],
    { windowsHide: true });
    const parsed = JSON.parse(stdout || '[]');
    return Array.isArray(parsed) ? parsed : [parsed];
}

async function startMemorySampling() {
    const baseline = new Set((await processes()).map(item => item.Id));
    baseline.delete(process.pid);
    let peakBytes = 0;
    let samples = 0;
    let error = null;
    let pending = null;
    const sample = async () => {
        try {
            const current = await processes();
            const bytes = current.filter(item => !baseline.has(item.Id)).reduce((sum, item) => sum + item.WorkingSet64, 0);
            peakBytes = Math.max(peakBytes, bytes);
            samples++;
        } catch (cause) { error = String(cause); }
    };
    await sample();
    const timer = setInterval(() => {
        if (!pending) pending = sample().finally(() => { pending = null; });
    }, 2000);
    return async () => {
        clearInterval(timer);
        if (pending) await pending;
        return { sampledPeakWorkingSetMiB: Math.round(peakBytes / 1024 / 1024), samples, error,
            scope: process.platform === 'win32'
                ? 'Coordinator plus newly started node/ffmpeg/ffprobe/cmd processes; 2-second samples. Run without other renders starting concurrently. Existing processes excluded; brief peaks may be missed.'
                : 'Coordinator Node process only; child processes excluded.' };
    };
}

function timestamp(seconds) {
    const milliseconds = Math.round(seconds * 1000);
    return `${String(Math.floor(milliseconds / 3600000)).padStart(2, '0')}:${String(Math.floor(milliseconds / 60000) % 60).padStart(2, '0')}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, '0')},${String(milliseconds % 1000).padStart(3, '0')}`;
}

async function main() {
    const countIndex = process.argv.indexOf('--scenes');
    const count = countIndex < 0 ? 3 : Number(process.argv[countIndex + 1]);
    assert(Number.isInteger(count) && count >= 3 && count <= 153, '--scenes must be between 3 and 153');
    const outputs = path.join(project, 'public/outputs');
    fs.mkdirSync(outputs, { recursive: true });
    const directory = fs.mkdtempSync(path.join(outputs, 'smart-director-check-'));
    const workspaceId = path.basename(directory);
    const image = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><defs><linearGradient id="g"><stop stop-color="#173151"/><stop offset="1" stop-color="#efb56a"/></linearGradient><pattern id="p" width="90" height="90" patternUnits="userSpaceOnUse"><circle cx="45" cy="45" r="25" fill="none" stroke="#ffffff" stroke-width="3"/></pattern></defs><rect width="1600" height="900" fill="url(#g)"/><rect width="1600" height="900" fill="url(#p)"/><circle cx="800" cy="450" r="220" fill="#214469"/><path d="M700 550V350L950 450Z" fill="white"/></svg>')).png().toBuffer();
    const layer = await sharp({ create: { width: 100, height: 100, channels: 4, background: '#ff0044' } }).png().toBuffer();
    fs.writeFileSync(path.join(directory, 'fixture.png'), image);
    let seconds = 0;
    const subtitles = [];
    const scenes = Array.from({ length: count }, (_, index) => {
        const duration = index % 12 === 0 ? 8 : 3;
        const start = seconds;
        seconds += duration;
        subtitles.push(`${index + 1}\n${timestamp(start)} --> ${timestamp(seconds)}\nScene ${index + 1}\n`);
        return { sceneNumber: index + 1, sceneName: `Scene ${index + 1}`,
            // The small integration run deliberately crosses the 8-second threshold after SRT alignment.
            durationSeconds: count === 3 && index === 0 ? 7.5 : duration,
            startMs: start * 1000, endMs: seconds * 1000 };
    });
    const audioPath = path.join(directory, 'fixture.wav');
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono',
        '-t', String(seconds), '-c:a', 'pcm_s16le', audioPath], { windowsHide: true });
    const data = await captureComposeRequest({ scenes,
        files: Object.fromEntries(scenes.map(scene => [scene.sceneNumber, new File([image], 'scene.png', { type: 'image/png' })])),
        audioFile: new File([fs.readFileSync(audioPath)], 'voice.wav', { type: 'audio/wav' }),
        srtFile: new File([subtitles.join('\n')], 'voice.srt'),
        layers: { 2: new File([layer], 'overlay.png', { type: 'image/png' }) }, smart: true });
    data.set('workspaceId', workspaceId);
    data.set('burnSubtitles', 'false');
    data.set('showProgressBar', 'false');
    data.set('audioLeadTime', '0');
    assert.equal(data.get('motionDirectorEnabled'), 'false');
    assert(data.has('motion_layer_2'), 'Automatic mode must upload the PNG');

    const load = createLoader();
    const { POST } = load('app/api/compose/route.ts');
    const { planSpeedPaintStyles } = load('core/speedpaint/SpeedPaintPlan.ts');
    const previewCount = Object.keys(planSpeedPaintStyles(scenes, {}, {
        enabled: true, minDurationSeconds: 8, minGapScenes: 3,
    })).length;
    const stopMemory = await startMemorySampling();
    const started = performance.now();
    const originalLog = console.log;
    const logPath = path.join(directory, 'render.log');
    console.log = (...args) => fs.appendFileSync(logPath, `${format(...args)}\n`);
    let lastProgress = -1;
    const progress = setInterval(() => {
        try {
            const status = JSON.parse(fs.readFileSync(path.join(directory, 'status.json'), 'utf8'));
            if (status.progress >= lastProgress + 10 || status.progress >= 88 && status.progress !== lastProgress) {
                originalLog(`${status.progress}% ${status.status}`);
                lastProgress = status.progress;
            }
        } catch { /* Status may be between writes. */ }
    }, 2000);
    originalLog(`Rendering ${count} scenes (${seconds}s), preview ${previewCount} Speed Paint; ${directory}`);
    let memory;
    let response;
    try {
        response = await POST(new Request('http://localhost/api/compose', { method: 'POST', body: data }));
    } finally {
        console.log = originalLog;
        clearInterval(progress);
        memory = await stopMemory();
    }
    const elapsedSeconds = Math.round((performance.now() - started) / 100) / 10;
    const result = await response.json();
    const report = { sceneCount: count, previewSpeedPaintCount: previewCount,
        expectedVideoSeconds: seconds, elapsedSeconds, memory, workspaceBytes: bytesIn(directory), result };
    fs.writeFileSync(path.join(directory, 'benchmark.json'), JSON.stringify(report, null, 2));
    assert(response.ok && result.success, JSON.stringify(result));
    const actualSpeedPaint = fs.readdirSync(directory).filter(file => /^speedpaint_raw_\d+\.mp4$/.test(file)).length;
    assert.equal(actualSpeedPaint, Math.ceil(count / 12));
    assert(fs.existsSync(path.join(directory, 'layered_segment_2.mp4')), 'PNG overlay did not render in automatic mode');
    const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames',
        '-show_entries', 'stream=width,height,nb_read_frames', '-of', 'json', path.join(directory, 'final_video.mp4')]);
    const stream = JSON.parse(stdout).streams[0];
    assert.deepEqual([stream.width, stream.height, Number(stream.nb_read_frames)], [1920, 1080, seconds * 25]);
    const timeline = JSON.parse(fs.readFileSync(path.join(directory, 'timeline_report.json'), 'utf8'));
    assert.equal(timeline.sync_validated, true);
    Object.assign(report, { actualSpeedPaintCount: actualSpeedPaint, actualMotionDirectorCount: count - actualSpeedPaint,
        validatedFrames: Number(stream.nb_read_frames), syncValidated: true });
    fs.writeFileSync(path.join(directory, 'benchmark.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
