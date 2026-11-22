const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createLoader } = require('./lib/compose-test-support.cjs');

async function main() {
    const buildDir = process.argv[2];
    if (!buildDir) throw new Error('Usage: npm run test:local-prompt-build -- path/to/built/project');
    const load = createLoader();
    const { formatMsToSrtTime } = load('core/time.ts');
    const { LocalPromptClient } = load('services/localPromptClient.ts');
    const scenes = Array.from({ length: 6 }, (_, i) => ({ id: i + 11,
        range: `${formatMsToSrtTime(i * 9000 + 251)} - ${formatMsToSrtTime((i + 1) * 9000 + 251)}` }));
    let calls = 0;
    const jobs = new Map();
    const fakeApi = http.createServer(async (req, res) => {
        res.setHeader('content-type', 'application/json');
        if (req.url === '/health') return res.end(JSON.stringify({ ok: true, activeJob: null }));
        if (req.method === 'GET' && jobs.has(req.url)) return res.end(JSON.stringify(jobs.get(req.url)));
        if (req.method === 'POST' && req.url === '/runs') {
            const chunks = []; for await (const chunk of req) chunks.push(chunk);
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            const match = /Generate ONLY these scene numbers: ([\d, ]+)\./.exec(body.prompt);
            const ids = match[1].split(',').map(Number);
            calls++;
            const fail = calls === 2;
            const result = ids.map(id => {
                const scene = scenes.find(s => s.id === id);
                return `Scene ${id}:Image 1 (${scene.range}): A thoughtful scientist watches a leafy green plant in a bright garden, warm morning light, soft shadows, clear central subject, wide composition, detailed background and empty lower area for subtitles, loose hand-drawn educational doodle illustration.`;
            }).join('\n');
            res.statusCode = 202;
            const id = `fake-${calls}`;
            jobs.set(`/runs/${id}`, { id, status: fail ? 'failed' : 'completed',
                result: fail ? null : result, error: fail ? 'Injected HTTP integration failure' : null });
            return res.end(JSON.stringify({ id, status: 'running' }));
        }
        res.statusCode = 404; res.end('{}');
    });
    await new Promise(resolve => fakeApi.listen(0, '127.0.0.1', resolve));
    const portProbe = http.createServer();
    await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve));
    const appPort = portProbe.address().port;
    await new Promise(resolve => portProbe.close(resolve));
    const appOrigin = `http://127.0.0.1:${appPort}`;
    let child; let exited;
    let diagnostics = ''; let spawnError;
    const originalFetch = global.fetch;
    try {
        child = spawn(process.execPath, [path.resolve('node_modules/next/dist/bin/next'), 'start',
            '--hostname', '127.0.0.1', '--port', String(appPort)], {
            cwd: path.resolve(buildDir), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, LOCAL_AI_BASE_URL: `http://127.0.0.1:${fakeApi.address().port}`,
                LOCAL_AI_TOKEN: '', LOCAL_PROMPT_BATCH_SIZE: '5', LOCAL_PROMPT_PROGRESSIVE: '1',
                LOCAL_PROMPT_COMPACT_TEMPLATE: '1', NEXT_TELEMETRY_DISABLED: '1' },
        });
        child.stdout.on('data', data => diagnostics = (diagnostics + data).slice(-3000));
        child.stderr.on('data', data => diagnostics = (diagnostics + data).slice(-3000));
        child.on('error', error => { spawnError = error; });
        exited = once(child, 'exit').catch(() => []);
        const deadline = Date.now() + 60_000;
        while (true) {
            if (spawnError) throw spawnError;
            if (child.exitCode !== null) throw new Error(`Next exited: ${diagnostics}`);
            try { if ((await originalFetch(appOrigin, { signal: AbortSignal.timeout(2000) })).ok) break; } catch { /* startup */ }
            if (Date.now() > deadline) throw new Error(`Next startup timeout: ${diagnostics}`);
            await new Promise(resolve => setTimeout(resolve, 250));
        }
        const body = { provider: 'local', promptLanguage: 'en', language: 'vi', transcript: '',
            durations: scenes.map(s => `Scene ${s.id}\n\nScientist observing a plant\n\n9s\n\n${s.range}`).join('\n\n') };
        global.fetch = (url, init) => originalFetch(new URL(url, appOrigin), init);
        const client = new LocalPromptClient(); client.observe('unchanged-source');
        let partial;
        await assert.rejects(client.generate(body, 'unchanged-source', {
            onPartial: value => partial = value,
        }), /Injected HTTP integration failure/);
        assert.equal(partial.length, 5);
        assert(client.incomplete);
        const result = await client.generate(body, 'unchanged-source', { onPartial: value => partial = value });
        assert.equal(result.length, 6);
        assert.equal(calls, 3, 'Resumed request must not regenerate the first five scenes');
        assert(!client.incomplete);
        const legacy = await originalFetch(`${appOrigin}/api/prompt`, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
        });
        assert.match(legacy.headers.get('content-type'), /application\/json/);
        const json = await legacy.json();
        assert.equal(json.success, true); assert.equal(json.prompts.length, 6);
        assert.equal(json.timeValidation.issueCount, 0);
        console.log('PASS: compiled Next HTTP stream, partial failure, cached resume, compact template and legacy JSON; no real AI calls');
    } finally {
        global.fetch = originalFetch;
        if (child && child.exitCode === null && !spawnError) { child.kill(); await exited; }
        fakeApi.closeAllConnections();
        await new Promise(resolve => fakeApi.close(resolve));
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
