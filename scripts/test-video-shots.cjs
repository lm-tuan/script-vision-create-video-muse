const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./lib/compose-test-support.cjs');

const srt = [
    '1\n00:00:00,500 --> 00:00:08,500\nOpen the box.',
    '3\n00:00:09,000 --> 00:00:22,000\nInspect the contents.',
].join('\n\n');
const groups = [{ indices: [1, 3], direction: 'Show the box and its contents.' }];
const { checkVideoShots, planVideoShots, readShotSubtitles, requestedShotSeconds } = createLoader()('core/video/VideoShots.ts');

test('review checks timeline coverage, duration limits, unique IDs and nonempty prompts', () => {
    const shots = planVideoShots(readShotSubtitles(srt, 24000), groups, 24000);
    const prompts = Object.fromEntries(shots.map(shot => [shot.shotId, 'A close-up of the box.']));
    assert.deepEqual(checkVideoShots(shots, prompts, 24000), []);
    const shortened = [{ ...shots[0], endMs: 7500 }, ...shots.slice(1)];
    assert.match(checkVideoShots(shortened, prompts, 24000).join(' '), /bị hở/);
    const issues = checkVideoShots([shots[0], { ...shots[1], shotId: shots[0].shotId, endMs: 20000 }], {}, 24000).join(' ');
    assert.match(issues, /bị trùng/);
    assert.match(issues, /tối đa 10 giây/);
    assert.match(issues, /chưa có prompt/);
    assert.match(issues, /chưa khớp với thời lượng audio/);
});

test('video shots cover the audio, favor subtitle boundaries, and split a long cue', () => {
    const shots = planVideoShots(readShotSubtitles(srt, 24000), groups, 24000);
    assert.deepEqual(shots.map(({ shotId, startMs, endMs }) => [shotId, startMs, endMs]), [
        ['S1-C1', 0, 9000], ['S1-C2', 9000, 19000], ['S1-C3', 19000, 24000],
    ]);
    assert.equal(shots[2].dialogue, 'Inspect the contents.');
});

test('rejects missing or mismatched SRT and incomplete or reordered groups', () => {
    assert.throws(() => readShotSubtitles('', 24000), /SRT/);
    assert.throws(() => readShotSubtitles(srt, 15000), /SRT/);
    const cues = readShotSubtitles(srt, 24000);
    assert.throws(() => planVideoShots(cues, [{ indices: [1], direction: 'Box' }], 24000), /chưa/);
    assert.throws(() => planVideoShots(cues, [{ indices: [3, 1], direction: 'Box' }], 24000), /thứ tự/);
});

test('route calls local AI for both steps and rejects duplicate prompt IDs', async () => {
    const replies = [
        JSON.stringify(groups),
        JSON.stringify([{ shotId: 'S1-C1', prompt: 'A slow push in.' }]),
        JSON.stringify([{ shotId: 'S1-C1', prompt: 'One.' }, { shotId: 'S1-C1', prompt: 'Two.' }]),
    ];
    const route = createLoader({
        '@/services/localAi': { callLocalAI: async () => replies.shift() },
    })('app/api/video-shots/route.ts');
    const post = body => route.POST(new Request('http://localhost/api/video-shots', {
        method: 'POST', body: JSON.stringify({ ...body, provider: 'gemini' }),
    }));
    const plan = await post({ action: 'plan', audioMs: 24000, srt });
    assert.equal(plan.status, 200);
    const { shots } = await plan.json();
    const success = await post({ action: 'prompts', shots: shots.slice(0, 1) });
    assert.deepEqual(await success.json(), { prompts: { 'S1-C1': 'A slow push in.' } });
    const failure = await post({ action: 'prompts', shots: shots.slice(0, 2) });
    assert.equal(failure.status, 422);
    assert.match((await failure.json()).error, /trùng/);
});

test('Muse receives a whole-second duration that covers each shot', () => {
    assert.equal(requestedShotSeconds({ startMs: 0, endMs: 3000 }), 3);
    assert.equal(requestedShotSeconds({ startMs: 3000, endMs: 6170 }), 4);
    assert.equal(requestedShotSeconds({ startMs: 0, endMs: 500 }), 1);
    assert.equal(requestedShotSeconds({ startMs: 0, endMs: 10000 }), 10);
});

test('composer API forwards shot timing and the selected clip start while rejecting invalid inputs', async () => {
    let received;
    const route = createLoader({
        '@/services/video': { composeVideo: async options => {
            received = options;
            return { success: true };
        } },
    })('app/api/compose/route.ts');
    const post = (file, sourceStartMs = 2200) => {
        const body = new FormData();
        body.set('useShotTimeline', 'true');
        body.set('scenes', JSON.stringify([{ sceneNumber: 1, startMs: 0, endMs: 4500, sourceStartMs }]));
        body.set('file_scene_1', file);
        return route.POST(new Request('http://localhost/api/compose', { method: 'POST', body }));
    };
    assert.equal((await post(new File(['image'], 'shot.png'))).status, 400);
    assert.equal((await post(new File(['clip'], 'S1-C1.mp4'), -40)).status, 400);
    assert.equal(received, undefined);
    assert.equal((await post(new File(['clip'], 'S1-C1.mp4'))).status, 200);
    assert.equal(received.useShotTimeline, true);
    assert.equal(received.scenes[0].endMs, 4500);
    assert.equal(received.scenes[0].sourceStartMs, 2200);
});

test('all 94 video prompts use a single local AI call', async () => {
    const shots = Array.from({ length: 94 }, (_, index) => ({
        shotId: `S1-C${index + 1}`, sceneNumber: 1, startMs: index * 8000,
        endMs: (index + 1) * 8000, dialogue: 'Narration text', direction: 'Show the subject',
    }));
    let calls = 0;
    const route = createLoader({
        '@/services/localAi': { callLocalAI: async prompt => {
            calls++;
            const input = JSON.parse(prompt.split('Input data: ')[1]);
            assert.equal(input.shots.length, 94);
            return JSON.stringify(input.shots.map(({ shotId }) => ({ shotId, prompt: 'A continuous close-up.' })));
        } },
    })('app/api/video-shots/route.ts');
    const response = await route.POST(new Request('http://localhost/api/video-shots', {
        method: 'POST', body: JSON.stringify({ action: 'prompts', shots }),
    }));
    assert.equal(response.status, 200);
    assert.equal(Object.keys((await response.json()).prompts).length, 94);
    assert.equal(calls, 1);
});
