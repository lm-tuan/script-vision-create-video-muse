import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createMuseMockServer } from './server.mjs';
import { createVideoUpstream } from './upstream.mjs';

const directory = new URL('../../.muse-mock/', import.meta.url);
const keyFile = new URL('api_key', directory);
const port = Number(process.env.MUSE2API_PORT || 18610);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid MUSE2API_PORT.');
let apiKey = process.env.MUSE2API_API_KEY?.trim();
if (!apiKey) {
    await mkdir(directory, { recursive: true });
    try {
        await writeFile(keyFile, randomBytes(32).toString('hex') + '\n', { flag: 'wx', mode: 0o600 });
    } catch (error) {
        if (error.code !== 'EEXIST') throw error;
    }
    apiKey = (await readFile(keyFile, 'utf8')).trim();
    console.log(`Gateway API key file ${fileURLToPath(keyFile)}`);
}

const upstreamUrl = process.env.MUSE_VIDEO_UPSTREAM_URL?.trim();
const upstream = upstreamUrl && createVideoUpstream(upstreamUrl, process.env.MUSE_VIDEO_UPSTREAM_API_KEY);
const server = createMuseMockServer({ apiKey, upstream });
server.on('error', error => {
    console.error(error.code === 'EADDRINUSE'
        ? `Cổng ${port} đang được dùng. Kiểm tra gateway tại http://127.0.0.1:${port}/healthz hoặc đặt MUSE2API_PORT sang cổng khác.`
        : error.message);
    process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log(`Video gateway (${upstream ? 'upstream' : 'mock'}) listening on http://127.0.0.1:${port}`));
