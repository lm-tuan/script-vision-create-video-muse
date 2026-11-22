const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./lib/compose-test-support.cjs');

const core = createLoader();
const { formatMsToSrtTime } = core('core/time.ts');
const { localPromptBatchSize, splitLocalScenes, validateLocalBatch, generateLocalPrompts } = core('services/localPromptGeneration.ts');
const { LocalPromptClient } = core('services/localPromptClient.ts');

function fixture(count, durationMs = 9000) {
    return Array.from({ length: count }, (_, i) => ({
        sceneNumber: 11 + i * 2, sceneName: `Nhân vật quan sát khu vườn ${i + 1}`,
        duration: `${durationMs / 1000}s`, durationSeconds: durationMs / 1000,
        timeRange: `${formatMsToSrtTime(251 + i * durationMs)} - ${formatMsToSrtTime(251 + (i + 1) * durationMs)}`,
    }));
}
const durationsText = scenes => scenes.map(s => `Scene ${s.sceneNumber}\n\n${s.sceneName}\n\n${s.duration}\n\n${s.timeRange}`).join('\n\n');
const output = scenes => scenes.map(s => `Scene ${s.sceneNumber}:Image 1 (${s.timeRange}): A thoughtful person stands in a peaceful garden, watching sunlight fall across green leaves, with warm colors, gentle shadows, a clear central subject, detailed surroundings and ample space along the bottom for subtitles, rendered as a loose hand-drawn educational doodle illustration.`).join('\n');
const idsFromPrompt = prompt => /Generate ONLY these scene numbers: ([\d, ]+)\./.exec(prompt)[1].split(',').map(Number);
const select = (scenes, ids) => ids.map(id => scenes.find(s => s.sceneNumber === id));

function request(body) { return new Request('http://localhost/api/prompt', { method: 'POST', body: JSON.stringify(body) }); }
const bodyFor = scenes => ({ provider: 'local', durations: durationsText(scenes), transcript: '', language: 'vi', promptLanguage: 'en' });
function route(mock) { return createLoader({ '@/services/ai': { callWithRetry: mock } })('app/api/prompt/route.ts'); }

function withEnv(env, fn) {
    const original = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
    Object.entries(env).forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value);
    return Promise.resolve().then(fn).finally(() => {
        Object.entries(original).forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value);
    });
}

test('batch configuration: safe default and bounded integer values', () => {
    for (const value of ['', 'abc', '0', '-1', '1.5', '16', '999999999999999999', '1e1']) assert.equal(localPromptBatchSize(value), 5);
    for (const size of [1, 5, 10, 15]) assert.equal(localPromptBatchSize(` ${size} `), size);
    assert.throws(() => splitLocalScenes('no scenes'));
    assert.throws(() => splitLocalScenes(durationsText([...fixture(1), ...fixture(1)])));
});

test('1/5/6/10/11/60 scenes: expected calls, serial execution and preserved nonconsecutive IDs', async () => {
    for (const count of [1, 5, 6, 10, 11, 60]) for (const batchSize of [5, 10]) {
        const scenes = fixture(count);
        const calls = [];
        let active = 0;
        const result = await generateLocalPrompts({ durations: durationsText(scenes), batchSize,
            buildPrompt: batch => batch,
            callAI: async prompt => {
                assert.equal(active++, 0);
                const ids = idsFromPrompt(prompt);
                calls.push(ids);
                await Promise.resolve();
                active--;
                return output(select(scenes, ids));
            },
        });
        assert.equal(calls.length, Math.ceil(count / batchSize));
        assert.deepEqual(calls.flat(), scenes.map(s => s.sceneNumber));
        assert.equal(validateLocalBatch(result.raw, splitLocalScenes(durationsText(scenes))).length, count);
    }
});

test('reject missing, extra, empty, duplicate images, malformed fallback and invalid parent input', () => {
    const scenes = fixture(2);
    const blocks = splitLocalScenes(durationsText(scenes));
    for (const raw of [output(scenes.slice(0, 1)), output([...scenes, ...fixture(3).slice(2)]),
        output(scenes).replace(/: A thoughtful[^\n]+/, ': '),
        output(scenes) + '\n' + output(scenes.slice(0, 1)), 'unstructured text']) {
        assert.throws(() => validateLocalBatch(raw, blocks));
    }
    assert.throws(() => validateLocalBatch(output(scenes), blocks.map(b => b.replace(/00:00:00,251/, 'invalid'))));
});

test('timeline: exact parent coverage, 1–3 images, contiguous milliseconds, short-scene exception', () => {
    const one = fixture(1)[0];
    const blocks = splitLocalScenes(durationsText([one]));
    const lines = [0, 1, 2].map(i => `Scene 11:Image ${i + 1} (${formatMsToSrtTime(251 + 3000 * i)} - ${formatMsToSrtTime(251 + 3000 * (i + 1))}): A person watching a garden.`);
    assert.equal(validateLocalBatch(lines.join('\n'), blocks)[0].prompts.length, 3);
    for (const bad of [lines.join('\n').replace('00:00:03,251', '00:00:03,252'),
        output([one]).replace('00:00:00,251', '00:00:01,251'),
        output([one]).replace('00:00:09,251', '00:00:08,251'),
        output([one]).replace('00:00:09,251', '00:00:99,251'),
        output([one]).replace('00:00:00,251', '00:00'),
        lines.join('\n').replace('Image 2', 'Image 1')]) assert.throws(() => validateLocalBatch(bad, blocks));
    const short = fixture(1, 2000);
    assert.equal(validateLocalBatch(output(short), splitLocalScenes(durationsText(short))).length, 1);
});

test('resume: retain validated groups, generate only unfinished groups, isolate input/template/policy', async () => {
    const scenes = fixture(6);
    const events = [];
    const base = { durations: durationsText(scenes), batchSize: 5, progressive: true,
        buildPrompt: batch => `context/style/language v1\n${batch}`, onEvent: e => events.push(e) };
    await assert.rejects(generateLocalPrompts({ ...base, callAI: async prompt => {
        const ids = idsFromPrompt(prompt);
        if (ids.length === 1) throw new Error('injected failure');
        return output(select(scenes, ids));
    } }), /injected failure/);
    const resumeKey = events[0].resumeKey;
    assert.equal(events.find(e => e.type === 'batch').completedScenes, 5);
    for (const change of [{ batchSize: 10 }, { buildPrompt: batch => `changed template\n${batch}` },
        { durations: durationsText(fixture(7)) }]) {
        await assert.rejects(generateLocalPrompts({ ...base, ...change, resumeKey, callAI: async () => { throw new Error('must not call'); } }), /dữ liệu\/cấu hình đã đổi/);
    }
    const generated = [];
    await generateLocalPrompts({ ...base, resumeKey, callAI: async prompt => {
        const ids = idsFromPrompt(prompt); generated.push(ids); return output(select(scenes, ids));
    } });
    assert.deepEqual(generated, [[21]]);
    assert(events.some(e => e.type === 'batch' && e.cached));
    // Final-frame loss can also recover a fully finished session without calling AI again.
    await generateLocalPrompts({ ...base, resumeKey, callAI: async () => { throw new Error('must not call'); } });
});

test('disconnect: finish current group and stop before next group', async () => {
    const scenes = fixture(6); let stop = false; let calls = 0;
    await assert.rejects(generateLocalPrompts({ durations: durationsText(scenes), batchSize: 5,
        buildPrompt: batch => batch, stopped: () => stop,
        callAI: async prompt => { calls++; stop = true; return output(select(scenes, idsFromPrompt(prompt))); },
    }), /kết nối đã đóng/);
    assert.equal(calls, 1);
});

test('input validation happens before AI; active and expired resume sessions are rejected', async () => {
    let calls = 0;
    await assert.rejects(generateLocalPrompts({ durations: 'Scene 1\n\nNo timestamp',
        buildPrompt: batch => batch, callAI: async () => { calls++; return ''; },
    }), /mốc thời gian/);
    assert.equal(calls, 0);
    const scenes = fixture(1);
    let resumeKey; let resolve;
    const base = { durations: durationsText(scenes), progressive: true, buildPrompt: batch => batch,
        onEvent: event => { if (event.type === 'started') resumeKey = event.resumeKey; } };
    const pending = generateLocalPrompts({ ...base, callAI: () => new Promise(r => resolve = r) });
    await assert.rejects(generateLocalPrompts({ ...base, resumeKey, callAI: async () => '' }), /đang chạy/);
    resolve(output(scenes)); await pending;
    const realNow = Date.now;
    try {
        const future = realNow() + 31 * 60_000;
        Date.now = () => future;
        await assert.rejects(generateLocalPrompts({ ...base, resumeKey, callAI: async () => '' }), /hết hạn/);
    } finally { Date.now = realNow; }
});

test('real POST: legacy JSON, compact opt-in, literal input, local languages and local-only routing', async () => {
    const scenes = fixture(6);
    await withEnv({ LOCAL_PROMPT_BATCH_SIZE: '10', LOCAL_PROMPT_PROGRESSIVE: undefined, LOCAL_PROMPT_COMPACT_TEMPLATE: undefined }, async () => {
        const inputs = [];
        const endpoint = route(async (prompt, provider) => {
            inputs.push({ prompt, provider });
            return output(select(scenes, idsFromPrompt(prompt)));
        });
        const response = await endpoint.POST(request({ ...bodyFor(scenes), stream: true, transcript: 'Literal $& $` $\' context' }));
        assert.match(response.headers.get('content-type'), /application\/json/);
        const data = await response.json();
        assert.equal(data.success, true);
        assert.equal(data.localMetrics.batches, 1);
        assert.equal(data.localMetrics.template, 'prompt.md');
        assert(inputs[0].prompt.includes('Literal $& $` $\' context'));
        for (const lang of ['vi', 'ja', 'zh']) {
            const raw = output(scenes).replaceAll(/A thoughtful[^\n]+/g, '穏やかな庭で人物が木々を観察する。');
            const translated = route(async () => raw);
            const result = await (await translated.POST(request({ ...bodyFor(scenes), promptLanguage: lang }))).json();
            assert.equal(result.success, true);
            assert.equal(result.prompts[0].prompts[0].prompt, '穏やかな庭で人物が木々を観察する。');
        }
        const other = await (await endpoint.POST(request({ ...bodyFor(scenes), provider: 'grok' }))).json();
        assert.equal(other.success, true);
        assert.equal(other.localMetrics.batches, 1);
        assert.equal(inputs.at(-1).provider, 'local');
        const short = fixture(1, 2000);
        const shortResult = await (await route(async () => output(short)).POST(request(bodyFor(short)))).json();
        assert.equal(shortResult.success, true);
        assert.equal(shortResult.timeValidation.issueCount, 0);
        const originalLength = inputs[0].prompt.length;
        await withEnv({ LOCAL_PROMPT_COMPACT_TEMPLATE: '1' }, async () => {
            const compact = await (await endpoint.POST(request(bodyFor(scenes)))).json();
            assert.equal(compact.localMetrics.template, 'prompt_local.md');
            assert(inputs.at(-1).prompt.length < originalLength);
            assert.match(inputs.at(-1).prompt, /40–80/);
        });
    });
});

test('real POST progressive: batch frames before failure, resume and final schema compatibility', async () => {
    const scenes = fixture(6); let fail = true; let calls = 0;
    await withEnv({ LOCAL_PROMPT_BATCH_SIZE: '5', LOCAL_PROMPT_PROGRESSIVE: '1' }, async () => {
        const endpoint = route(async prompt => {
            calls++; const ids = idsFromPrompt(prompt);
            if (fail && ids.length === 1) throw new Error('injected failure');
            return output(select(scenes, ids));
        });
        const events = async body => (await (await endpoint.POST(request({ ...body, stream: true }))).text()).trim().split('\n').map(JSON.parse);
        const first = await events(bodyFor(scenes));
        assert.equal(first[0].type, 'started');
        assert.equal(first[1].type, 'batch');
        assert.equal(first.at(-1).type, 'error');
        fail = false;
        const resumed = await events({ ...bodyFor(scenes), resumeKey: first[0].resumeKey });
        assert.equal(calls, 3);
        assert.equal(resumed[1].cached, true);
        assert.equal(resumed.at(-1).type, 'completed');
        assert.equal(resumed.at(-1).prompts.length, 6);
        assert.deepEqual(Object.keys(resumed.at(-1).prompts[0]).sort(), ['prompts', 'sceneNumber']);
    });
});

function eventResponse(events, fragment = true) {
    const bytes = new TextEncoder().encode(events.map(event => JSON.stringify(event)).join('\n'));
    return new Response(new ReadableStream({ start(controller) {
        if (fragment) for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
        else controller.enqueue(bytes);
        controller.close();
    } }), { headers: { 'Content-Type': 'application/x-ndjson' } });
}
const frames = prompts => [
    { type: 'started', jobId: 'job', resumeKey: 'resume', totalScenes: prompts.length },
    { type: 'batch', jobId: 'job', prompts, completedScenes: prompts.length, totalScenes: prompts.length },
];

test('client: fragmented UTF-8 frames, resume key, partial retention and clearing after success/reload', async () => {
    const saved = global.fetch;
    const client = new LocalPromptClient(); client.observe('context');
    const prompts = [{ sceneNumber: 11, prompts: [{ imageNumber: 1, timeRange: '', prompt: '庭で観察する人物' }] }];
    const requests = []; let attempt = 0; let partial;
    global.fetch = async (_, init) => {
        requests.push(JSON.parse(init.body));
        return eventResponse([...frames(prompts), ++attempt === 1
            ? { type: 'error', error: 'injected failure' }
            : { type: 'completed', success: true, prompts }]);
    };
    try {
        const options = { onPartial: value => partial = value };
        await assert.rejects(client.generate({ provider: 'local' }, 'context', options), /injected failure/);
        assert.deepEqual(partial, prompts); assert(client.incomplete);
        assert.deepEqual(await client.generate({ provider: 'local' }, 'context', options), prompts);
        assert.equal(requests[1].resumeKey, 'resume'); assert(!client.incomplete);
        await client.generate({ provider: 'local' }, 'context', options);
        assert.equal(requests[2].resumeKey, undefined);
        const fresh = new LocalPromptClient(); fresh.observe('context');
        await fresh.generate({ provider: 'local' }, 'context', options);
        assert.equal(requests[3].resumeKey, undefined);
    } finally { global.fetch = saved; }
});

test('client: changed input blocks stale writes; pipeline can transition once to its generated source', async () => {
    const saved = global.fetch;
    const client = new LocalPromptClient(); client.observe('old');
    let resolve;
    global.fetch = () => new Promise(r => resolve = r);
    try {
        let callbacks = 0;
        const pending = client.generate({}, 'old', { onPartial: () => callbacks++ });
        client.observe('edited');
        resolve(eventResponse([...frames([]), { type: 'completed', prompts: [] }]));
        await assert.rejects(pending, /dữ liệu đã đổi/);
        assert.equal(callbacks, 0);
        global.fetch = async () => { client.observe('generated'); return eventResponse([...frames([]), { type: 'completed', prompts: [] }]); };
        assert.deepEqual(await client.generate({}, 'generated', { onPartial() {} }), []);
    } finally { global.fetch = saved; }
});

test('client: truncated streams and mismatched job IDs are errors, JSON fallback stays compatible', async () => {
    const saved = global.fetch;
    const client = new LocalPromptClient(); client.observe('context');
    try {
        global.fetch = async () => eventResponse(frames([]));
        await assert.rejects(client.generate({}, 'context', { onPartial() {} }), /kết nối kết thúc/);
        global.fetch = async () => eventResponse([frames([])[0], { ...frames([])[1], jobId: 'other' }]);
        await assert.rejects(client.generate({}, 'context', { onPartial() {} }), /sai ID/);
        global.fetch = async () => Response.json({ success: true, prompts: [] });
        assert.deepEqual(await client.generate({}, 'context', { onPartial() {} }), []);
    } finally { global.fetch = saved; }
});

// Hook harness runs actual handlers. Only effects, logging and HTTP delivery are replaced.
function hookHarness() {
    const values = []; let cursor = 0;
    const load = createLoader({ react: {
        useState(initial) {
            const index = cursor++;
            if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial;
            return [values[index], next => { values[index] = typeof next === 'function' ? next(values[index]) : next; }];
        }, useEffect() {},
    }, '@/lib/logger': { logService: { addLog() {}, clearLogs() {} } }, '@/lib/utils': { downloadFile() {} } });
    const { useScriptVisionState } = load('hooks/useScriptVisionState.ts');
    return () => { cursor = 0; return useScriptVisionState(); };
}

test('hook: manual generation and repair retain partial prompts; apply is blocked until completion', async () => {
    const saved = global.fetch;
    const render = hookHarness(); const scenes = fixture(6);
    let state = render(); state.setDurations(scenes);
    const parsed = validateLocalBatch(output(scenes), splitLocalScenes(durationsText(scenes)));
    let fail = true;
    global.fetch = async (_, init) => {
        const body = JSON.parse(init.body);
        const selected = parsed.filter(scene => body.durations.includes(`Scene ${scene.sceneNumber}\n`));
        return eventResponse([...frames(fail ? selected.slice(0, 5) : selected), fail
            ? { type: 'error', error: 'injected failure' }
            : { type: 'completed', prompts: selected }]);
    };
    try {
        await render().handleGeneratePrompt();
        state = render(); assert.equal(state.prompts.length, 5); assert.equal(state.loading.prompt, false);
        state.handleApplyPromptsToImageGen(); assert.equal(render().finalPrompts.length, 0);
        assert.match(render().error, /chưa hoàn tất/);
        fail = false;
        await render().handleCheckAndFixPrompts(true);
        state = render(); assert.equal(state.prompts.length, 6);
        state.handleApplyPromptsToImageGen();
        state = render(); assert.equal(state.finalPrompts.length, 6);
        assert.equal(state.finalPrompts[0].parentSceneNumber, scenes[0].sceneNumber);
        assert.equal(state.finalPrompts[0].durationMs, 9000);
        const old = state.finalPrompts;
        state.handleUploadSceneFile(1, new File(['clip'], 'old.mp4'));
        state.handleUploadSceneFile(2, new File(['clip'], 'keep.mp4'));
        state.setPrompts(parsed.map((scene, i) => i ? scene : { ...scene, prompts: scene.prompts.map(image => ({ ...image, prompt: 'Changed visual description.' })) }));
        render().handleApplyPromptsToImageGen();
        assert.equal(render().sceneFiles[1], undefined);
        assert.equal(render().sceneFiles[2].name, 'keep.mp4');
        assert.deepEqual(render().finalPrompts.map(p => p.durationMs), old.map(p => p.durationMs));
    } finally { global.fetch = saved; }
});

test('hook: a shot timeline preserves imported audio and subtitles, maps MP4 and rejects images', async () => {
    const render = hookHarness();
    const shot = (shotId, startMs, endMs) => ({ shotId, startMs, endMs, sceneNumber: 1, direction: 'Show the box', dialogue: '' });
    const audioFile = new File(['audio'], 'existing.mp3', { type: 'audio/mpeg' });
    render().handleApplyVideoShots([shot('S1-C1', 0, 9000), shot('S1-C2', 9000, 14000)], {
        audioFile, srt: 'Imported subtitles',
    });
    const state = render();
    assert.equal(state.activeTab, 'compose');
    assert.equal(state.localAudioFile, audioFile);
    assert.equal(await state.localSrtFile.text(), 'Imported subtitles');
    assert.deepEqual(state.finalPrompts.map(shot => shot.durationMs), [9000, 5000]);
    state.handleBatchAutoMap({ target: { files: [
        new File(['clip'], 's1-c2.MP4'), new File(['image'], 'S1-C1.png'),
    ] } });
    assert.equal(render().sceneFiles[2].name, 's1-c2.MP4');
    assert.equal(render().sceneFiles[1], undefined);
    render().handleUploadSceneFile(1, new File(['image'], 'S1-C1.png'));
    assert.match(render().error, /MP4/);
});

test('hook: full local pipeline accepts source transition and preserves the legacy prompt contract', async () => {
    const saved = global.fetch; const render = hookHarness(); const scenes = fixture(2);
    const prompts = validateLocalBatch(output(scenes), splitLocalScenes(durationsText(scenes)));
    const state = render(); state.setContent('Source content');
    global.fetch = async (url, init) => {
        if (url === '/api/transcript') return Response.json({ success: true, transcript: 'Generated transcript' });
        if (url === '/api/duration') return Response.json({ success: true, durations: scenes });
        if (url === '/api/prompt') {
            assert.equal(JSON.parse(init.body).provider, 'local');
            render(); // Emulate React rendering generated transcript/durations while awaiting HTTP.
            return eventResponse([...frames(prompts), { type: 'completed', prompts }]);
        }
        throw new Error(`Unexpected ${url}`);
    };
    try {
        await render().handleGenerateAll();
        assert.equal(render().error, null);
        assert.deepEqual(render().prompts, prompts);
        assert.equal(render().progress, 100);
        assert.equal(render().loading.prompt, false);
    } finally { global.fetch = saved; }
});
