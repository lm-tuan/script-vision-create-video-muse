import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { setTimeout } from 'node:timers/promises';
import { createMuseMockServer } from './server.mjs';
import { createVideoUpstream } from './upstream.mjs';

test('loopback mock authenticates, submits a job and serves its marked result', async t => {
    const server = createMuseMockServer({ apiKey: 'test-key' }).listen(0, '127.0.0.1');
    t.after(() => new Promise(resolve => server.close(resolve)));
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const headers = { Authorization: 'Bearer test-key', 'Content-Type': 'application/json' };
    assert.equal((await (await fetch(base + '/healthz')).json()).mode, 'mock');
    assert.equal((await fetch(base + '/v1/videos')).status, 401);
    const create = body => fetch(base + '/v1/videos', { method: 'POST', headers, body: JSON.stringify(body) });
    assert.equal((await create({ prompt: 'Cup', duration: 0 })).status, 400);
    const created = await create({ prompt: 'A cup on a table', duration: 10 });
    assert.equal(created.status, 200);
    let job = await created.json();
    assert.equal(job.status, 'queued');
    for (let attempt = 0; attempt < 20 && job.status !== 'succeeded'; attempt++) {
        await setTimeout(50);
        job = await (await fetch(`${base}/v1/videos/${job.id}`, { headers })).json();
    }
    assert.equal(job.status, 'succeeded');
    assert.equal(job.mock, true);
    const media = await fetch(job.result.url, { headers });
    assert.equal(media.headers.get('x-muse-mock'), 'true');
    assert.equal(media.headers.get('content-type'), 'video/mp4');
    assert.ok((await media.arrayBuffer()).byteLength > 0);
});

test('configured upstream receives the job and streams its MP4 behind the gateway key', async t => {
    const provider = createServer(async (request, response) => {
        assert.equal(request.headers.authorization, 'Bearer provider-key');
        if (request.url === '/v1/videos') {
            const chunks = [];
            for await (const chunk of request) chunks.push(chunk);
            assert.equal(JSON.parse(Buffer.concat(chunks).toString()).duration, 10);
            return response.end(JSON.stringify({ id: 'video-1', status: 'queued' }));
        }
        if (request.url === '/v1/videos/video-1') {
            return response.end(JSON.stringify({ id: 'video-1', status: 'succeeded', result: { url: '/files/test.mp4' } }));
        }
        response.writeHead(200, { 'Content-Type': 'video/mp4' });
        response.end('sample media');
    }).listen(0, '127.0.0.1');
    await once(provider, 'listening');
    const upstream = createVideoUpstream(`http://127.0.0.1:${provider.address().port}`, 'provider-key');
    const gateway = createMuseMockServer({ apiKey: 'gateway-key', upstream }).listen(0, '127.0.0.1');
    t.after(async () => {
        await new Promise(resolve => gateway.close(resolve));
        await new Promise(resolve => provider.close(resolve));
    });
    await once(gateway, 'listening');
    const base = `http://127.0.0.1:${gateway.address().port}`;
    const headers = { Authorization: 'Bearer gateway-key', 'Content-Type': 'application/json' };
    const created = await fetch(base + '/v1/videos', { method: 'POST', headers, body: JSON.stringify({ prompt: 'Cup', duration: 10 }) });
    assert.equal((await created.json()).id, 'video-1');
    const status = await (await fetch(base + '/v1/videos/video-1', { headers })).json();
    assert.equal(status.result.url, base + '/v1/media/video-1.mp4');
    const media = await fetch(status.result.url, { headers });
    assert.equal(media.status, 200);
    assert.equal(await media.text(), 'sample media');
});
