const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const endpoint = process.argv[2] || 'http://127.0.0.1:3101/api/compose';
const project = path.join(__dirname, '..');
const source = path.join(project, 'public/outputs/workspace_1793015144604/temp_media_1.png');
const audio = path.join(project, 'public/outputs/speedpaint_variants/test_audio.mp3');

async function main() {
    assert(fs.existsSync(source) && fs.existsSync(audio), 'Smoke test media is missing');
    const workspaceId = `speedpaint_smoke_${Date.now()}`;
    const data = new FormData();
    data.append('workspaceId', workspaceId);
    data.append('scenes', JSON.stringify([{ sceneNumber: 1, durationSeconds: 3, sceneName: 'Speed paint test' }]));
    data.append('speedPaintStyles', JSON.stringify({ 1: 'contour' }));
    data.append('storyboardCues', '[]');
    data.append('language', 'en');
    data.append('transitionType', 'none');
    data.append('burnSubtitles', 'false');
    data.append('showProgressBar', 'false');
    data.append('audioLeadTime', '0');
    data.append('file_scene_1', new File([fs.readFileSync(source)], 'scene.png', { type: 'image/png' }));
    data.append('audioFile', new File([fs.readFileSync(audio)], 'voice.mp3', { type: 'audio/mpeg' }));
    data.append('srtFile', new File(['1\n00:00:00,000 --> 00:00:02,900\nSpeed paint test\n'], 'test.srt', { type: 'text/plain' }));
    const response = await fetch(endpoint, { method: 'POST', body: data });
    const result = await response.json();
    assert(response.ok && result.success, JSON.stringify(result));
    const output = path.join(project, 'public/outputs', workspaceId, 'final_video.mp4');
    assert(fs.existsSync(output));
    const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames',
        '-show_entries', 'stream=width,height,nb_read_frames', '-of', 'json', output], { encoding: 'utf8' });
    assert.equal(probe.status, 0, probe.stderr);
    const stream = JSON.parse(probe.stdout).streams[0];
    assert.equal(stream.width, 1920);
    assert.equal(stream.height, 1080);
    assert(Number(stream.nb_read_frames) >= 70);
    console.log(`${output}: ${stream.nb_read_frames} frames`);

    const longAudio = path.join(project, 'public/outputs/speedpaint_variants/test_audio_8.mp3');
    assert(fs.existsSync(longAudio), 'Eight-second smoke-test audio is missing');
    const smartWorkspaceId = `smart_director_smoke_${Date.now()}`;
    const smartData = new FormData();
    smartData.append('workspaceId', smartWorkspaceId);
    smartData.append('scenes', JSON.stringify([
        { sceneNumber: 1, durationSeconds: 5, sceneName: 'Long illustrated scene' },
        { sceneNumber: 2, durationSeconds: 3, sceneName: 'Short illustrated scene' },
    ]));
    smartData.append('speedPaintStyles', '{}');
    smartData.append('smartDirectorEnabled', 'true');
    smartData.append('speedPaintMinSeconds', '4');
    smartData.append('speedPaintGapScenes', '1');
    smartData.append('storyboardCues', '[]');
    smartData.append('language', 'en');
    smartData.append('transitionType', 'fade');
    smartData.append('transitionDuration', '0.5');
    smartData.append('burnSubtitles', 'false');
    smartData.append('showProgressBar', 'false');
    smartData.append('audioLeadTime', '0');
    for (const sceneNumber of [1, 2]) {
        smartData.append(`file_scene_${sceneNumber}`, new File([fs.readFileSync(source)],
            `scene_${sceneNumber}.png`, { type: 'image/png' }));
    }
    smartData.append('audioFile', new File([fs.readFileSync(longAudio)], 'voice.mp3', { type: 'audio/mpeg' }));
    smartData.append('srtFile', new File([
        '1\n00:00:00,000 --> 00:00:04,900\nLong scene\n\n2\n00:00:05,000 --> 00:00:07,900\nShort scene\n',
    ], 'test.srt', { type: 'text/plain' }));
    const smartResponse = await fetch(endpoint, { method: 'POST', body: smartData });
    const smartResult = await smartResponse.json();
    assert(smartResponse.ok && smartResult.success, JSON.stringify(smartResult));
    const smartDir = path.join(project, 'public/outputs', smartWorkspaceId);
    assert(fs.existsSync(path.join(smartDir, 'speedpaint_raw_1.mp4')), 'Long scene did not use Speed Paint');
    assert(!fs.existsSync(path.join(smartDir, 'speedpaint_raw_2.mp4')), 'Short scene unexpectedly used Speed Paint');
    const smartVideo = path.join(smartDir, 'final_video.mp4');
    const smartProbe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames',
        '-show_entries', 'stream=width,height,nb_read_frames', '-of', 'json', smartVideo], { encoding: 'utf8' });
    assert.equal(smartProbe.status, 0, smartProbe.stderr);
    const smartStream = JSON.parse(smartProbe.stdout).streams[0];
    assert.deepEqual([smartStream.width, smartStream.height], [1920, 1080]);
    assert(Number(smartStream.nb_read_frames) >= 190);
    console.log(`${smartVideo}: ${smartStream.nb_read_frames} frames, long Speed Paint + short Motion Director`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
