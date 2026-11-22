import { NextResponse } from 'next/server';

const taskIdPattern = /^[a-zA-Z0-9_-]{1,128}$/;
const taskStatuses = ['queued', 'running', 'succeeded', 'failed', 'cancelled'];

type MuseError = { code?: string; message?: string };
type MuseTask = {
    id: string;
    status: string;
    progress?: number;
    result?: { url?: string };
    error?: MuseError;
};

class MuseRequestError extends Error {
    constructor(message: string, readonly status: number, readonly code?: string) {
        super(message);
    }
}

function museConfig() {
    const key = process.env.MUSE_API_KEY?.trim();
    if (!key) throw new MuseRequestError('Chưa cấu hình MUSE_API_KEY cho backend.', 500);
    const base = process.env.MUSE_BASE_URL?.trim() || 'http://127.0.0.1:18610';
    const url = URL.canParse(base) ? new URL(base) : null;
    if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw new MuseRequestError('MUSE_BASE_URL phải là URL HTTP(S) của gateway.', 500);
    }
    return { key, url: url.href.replace(/\/+$/, '').replace(/\/v1$/, '') };
}

async function requestMuse(path: string, signal: AbortSignal, payload?: object): Promise<MuseTask> {
    const { key, url } = museConfig();
    const headers = new Headers({ Authorization: `Bearer ${key}` });
    if (payload) headers.set('Content-Type', 'application/json');
    const response = await fetch(`${url}/v1/videos${path}`, {
        method: payload ? 'POST' : 'GET',
        headers,
        body: payload ? JSON.stringify(payload) : undefined,
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        throw new MuseRequestError(data?.error?.message || `MuseAI trả HTTP ${response.status}.`,
            response.status, data?.error?.code);
    }
    if (typeof data?.id !== 'string' || !taskIdPattern.test(data.id) ||
        (path && path !== `/${data.id}`) || !taskStatuses.includes(data.status)) {
        throw new MuseRequestError('MuseAI trả về tác vụ video sai định dạng.', 502);
    }
    return data;
}

function taskResponse(task: MuseTask) {
    const { id, status, progress, error } = task;
    return NextResponse.json({ id, status, progress, error }, { headers: { 'Cache-Control': 'no-store' } });
}

function errorResponse(error: unknown) {
    if (error instanceof MuseRequestError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof Error && error.name === 'TimeoutError') {
        return NextResponse.json({ error: 'Hết thời gian chờ MuseAI.' }, { status: 504 });
    }
    return NextResponse.json({ error: 'Không kết nối được với MuseAI.' }, { status: 502 });
}

export async function POST(request: Request) {
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
        return NextResponse.json({ error: 'Yêu cầu tạo clip phải gửi JSON.' }, { status: 415 });
    }
    const body = await request.json().catch(() => null);
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    const duration = body?.duration;
    if (!prompt || !Number.isInteger(duration) || duration < 1 || duration > 60) {
        return NextResponse.json({ error: 'Cần prompt và thời lượng nguyên từ 1 đến 60 giây.' }, { status: 400 });
    }
    try {
        const task = await requestMuse('', request.signal, { model: 'muse-video', prompt, duration });
        return taskResponse(task);
    } catch (error) {
        return errorResponse(error);
    }
}

export async function GET(request: Request) {
    const params = new URL(request.url).searchParams;
    const id = params.get('id');
    if (!id || !taskIdPattern.test(id)) {
        return NextResponse.json({ error: 'Mã tác vụ MuseAI không hợp lệ.' }, { status: 400 });
    }
    try {
        const task = await requestMuse(`/${id}`, request.signal);
        if (params.get('download') !== '1') return taskResponse(task);

        if (task.status !== 'succeeded' || !task.result?.url) {
            throw new MuseRequestError('Tác vụ MuseAI chưa có video để tải.', 409);
        }
        const mediaUrl = new URL(task.result.url, `${museConfig().url}/`);
        if (!['http:', 'https:'].includes(mediaUrl.protocol) || mediaUrl.username || mediaUrl.password) {
            throw new MuseRequestError('MuseAI trả về URL video không hợp lệ.', 502);
        }
        const media = await fetch(mediaUrl, {
            cache: 'no-store',
            redirect: 'error',
            signal: AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]),
        });
        const mime = media.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
        if (!media.ok || !media.body || mime !== 'video/mp4') {
            await media.body?.cancel();
            throw new MuseRequestError(`Không tải được MP4 từ MuseAI (HTTP ${media.status}).`, 502);
        }
        return new Response(media.body, { headers: { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store' } });
    } catch (error) {
        return errorResponse(error);
    }
}
