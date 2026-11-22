import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const mockMedia = Buffer.from('00000018667479706d7034326d6f636b', 'hex');
const maxBodyBytes = 256 * 1024;
const jobLifetimeMs = 60 * 60 * 1000;
const maxJobs = 500;

function json(response, status, body) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(body));
}

async function readBody(request) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
        size += chunk.length;
        if (size > maxBodyBytes) {
            request.resume();
            throw Object.assign(new Error('Request body is too large.'), { status: 413 });
        }
        chunks.push(chunk);
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
        throw Object.assign(new Error('Invalid JSON.'), { status: 400 });
    }
}

export function createMuseMockServer({ apiKey, upstream }) {
    if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error('A gateway API key is required.');
    const bearer = Buffer.from(`Bearer ${apiKey}`);
    const jobs = new Map();

    return createServer(async (request, response) => {
        const path = request.url?.split('?')[0];
        const { method } = request;
        const error = (status, message) => json(response, status, { error: { message } });
        const mode = upstream ? 'upstream' : 'mock';
        if (method === 'GET' && path === '/healthz') return json(response, 200, { ok: true, mode });
        if (method === 'GET' && path === '/readyz') return json(response, 200, { ready: true, driver: { ok: true, name: mode } });

        const auth = Buffer.from(request.headers.authorization ?? '');
        if (auth.length !== bearer.length || !timingSafeEqual(auth, bearer)) {
            return error(401, 'Invalid gateway API key.');
        }
        const now = Date.now();
        for (const [id, job] of jobs) {
            if (now - job.createdAt >= jobLifetimeMs) jobs.delete(id);
        }

        function view(job) {
            const completed = Date.now() >= job.createdAt + 250;
            const { port } = request.socket.address();
            return {
                id: job.id, object: 'video', model: 'muse-video',
                status: completed ? 'succeeded' : 'queued', progress: completed ? 100 : 0,
                created_at: Math.floor(job.createdAt / 1000), error: null, mock: true,
                result: completed ? {
                    url: `http://127.0.0.1:${port}/v1/media/${job.id}.mp4`,
                    mime: 'video/mp4', width: null, height: null,
                } : null,
            };
        }

        function upstreamView(job) {
            if (typeof job?.id !== 'string' || !/^[\w-]+$/.test(job.id)) throw new Error('Invalid upstream video job ID.');
            const { port } = request.socket.address();
            return {
                id: job.id, object: 'video', status: job.status, progress: job.progress,
                created_at: job.created_at, model: job.model, error: job.error ?? null,
                result: job.status === 'succeeded' && job.result?.url ? {
                    url: `http://127.0.0.1:${port}/v1/media/${job.id}.mp4`,
                    mime: 'video/mp4', width: job.result.width, height: job.result.height,
                } : null,
            };
        }

        if (method === 'GET' && path === '/v1/models') {
            return json(response, 200, { object: 'list', data: [{ id: 'muse-video', object: 'model' }] });
        }
        if (method === 'POST' && path === '/v1/videos') {
            try {
                const body = await readBody(request);
                const seconds = body?.duration ?? body?.seconds;
                if (typeof body?.prompt !== 'string' || !body.prompt.trim() ||
                    (body.model && body.model !== 'muse-video') ||
                    (seconds != null && (!Number.isInteger(seconds) || seconds < 1 || seconds > 60))) {
                    return error(400, 'Expected a prompt, model muse-video and optional duration of 1–60 seconds.');
                }
                if (upstream) {
                    const payload = { model: 'muse-video', prompt: body.prompt };
                    if (seconds != null) payload.duration = seconds;
                    if (typeof body.size === 'string') payload.size = body.size;
                    return json(response, 200, upstreamView(await upstream.createVideo(payload)));
                }
                if (jobs.size >= maxJobs) return error(429, 'Mock job limit reached.');
                const job = { id: randomUUID(), createdAt: Date.now() };
                jobs.set(job.id, job);
                return json(response, 200, view(job));
            } catch (cause) {
                return error(cause.status ?? 502, cause.status ? cause.message : 'Could not create video job.');
            }
        }
        const jobId = /^\/v1\/videos\/([\w-]+)$/.exec(path ?? '')?.[1];
        const mediaId = /^\/v1\/media\/([\w-]+)\.mp4$/.exec(path ?? '')?.[1];
        if (upstream && method === 'GET' && (jobId || mediaId)) {
            try {
                if (jobId) return json(response, 200, upstreamView(await upstream.getVideo(jobId)));
                const media = await upstream.downloadVideo(mediaId);
                response.writeHead(200, { 'Content-Type': 'video/mp4' });
                await pipeline(Readable.fromWeb(media.body), response);
                return;
            } catch (cause) {
                if (response.headersSent) return response.destroy();
                return error(cause.status ?? 502, cause.status ? cause.message : 'Could not retrieve upstream video.');
            }
        }
        if (method === 'GET' && jobId && jobs.has(jobId)) return json(response, 200, view(jobs.get(jobId)));
        if (method === 'GET' && mediaId && jobs.has(mediaId) && view(jobs.get(mediaId)).result) {
            response.writeHead(200, {
                'Content-Type': 'video/mp4', 'Content-Length': mockMedia.length, 'X-Muse-Mock': 'true',
            });
            return response.end(mockMedia);
        }
        return error(404, 'Not found.');
    });
}
