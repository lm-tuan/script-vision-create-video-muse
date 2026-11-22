export function createVideoUpstream(baseUrl, apiKey) {
    const base = new URL(baseUrl);
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname);
    if ((base.protocol !== 'https:' && !(local && base.protocol === 'http:')) ||
        base.username || base.password || base.search || base.hash) {
        throw new Error('Use an HTTPS video API URL or a loopback HTTP URL.');
    }
    if (!apiKey?.trim()) throw new Error('MUSE_VIDEO_UPSTREAM_API_KEY is required.');
    const prefix = base.pathname.replace(/\/$/, '');
    const apiUrl = path => new URL(`${prefix}${path}`, base.origin);
    async function send(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: { ...options.headers, Authorization: `Bearer ${apiKey}` },
            redirect: 'error',
            signal: AbortSignal.timeout(60_000),
        });
        if (!response.ok) {
            await response.body?.cancel();
            throw Object.assign(new Error(`Video API returned HTTP ${response.status}.`), {
                status: [400, 404, 429].includes(response.status) ? response.status : 502,
            });
        }
        return response;
    }
    async function getVideo(id) {
        return (await send(apiUrl(`/v1/videos/${encodeURIComponent(id)}`))).json();
    }
    return {
        async createVideo(body) {
            return (await send(apiUrl('/v1/videos'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })).json();
        },
        getVideo,
        async downloadVideo(id) {
            const job = await getVideo(id);
            if (job.status !== 'succeeded' || typeof job.result?.url !== 'string') {
                throw Object.assign(new Error('Video is not available.'), { status: 404 });
            }
            const mediaUrl = new URL(job.result.url, base.origin);
            if (mediaUrl.origin !== base.origin || mediaUrl.username || mediaUrl.password) {
                throw new Error('The video API must serve media from its own origin.');
            }
            const response = await send(mediaUrl);
            if (!/^video\/mp4(?:$|;)/i.test(response.headers.get('content-type') ?? '')) {
                await response.body?.cancel();
                throw new Error('The video API did not return MP4 media.');
            }
            return response;
        },
    };
}
