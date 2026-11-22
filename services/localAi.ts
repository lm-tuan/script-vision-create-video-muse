type LocalRun = {
    id?: string;
    status?: 'running' | 'completed' | 'failed' | 'cancelled' | 'timed_out';
    result?: string | null;
    error?: string | null;
    stderr?: string;
};

// The local server accepts only one active run. Share this queue across API routes.
let pending: Promise<void> = Promise.resolve();

async function readResponse(response: Response): Promise<LocalRun> {
    const data = await response.json().catch(() => ({})) as LocalRun;
    if (!response.ok) throw new Error(`API local HTTP ${response.status}: ${data.error || response.statusText}`);
    return data;
}

async function runLocal(prompt: string): Promise<string> {
    const baseUrl = (process.env.LOCAL_AI_BASE_URL || 'http://127.0.0.1:3900').replace(/\/+$/, '');
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('LOCAL_AI_BASE_URL must use HTTP or HTTPS');
    const token = process.env.LOCAL_AI_TOKEN;
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const request = (path: string, init?: RequestInit) => fetch(new URL(path, url), {
        cache: 'no-store',
        ...init,
        headers: { ...headers, ...init?.headers },
        signal: AbortSignal.timeout(30_000),
    });

    const health = await readResponse(await request('/health'));
    if ((health as LocalRun & { ok?: boolean }).ok !== true) throw new Error('API local health check failed');

    const started = await readResponse(await request('/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, sandbox: 'read-only' }),
    }));
    if (!started.id) throw new Error('API local did not return a run ID');

    const deadline = Date.now() + 11 * 60_000;
    let run = started;
    while (true) {
        if (run.status === 'completed') {
            if (typeof run.result !== 'string' || !run.result.trim()) throw new Error('API local returned an empty result');
            return run.result;
        }
        if (run.status !== 'running') {
            throw new Error(`API local ${run.status || 'unknown'}: ${run.error || run.stderr || 'No error details'}`);
        }
        if (Date.now() >= deadline) throw new Error(`API local polling timed out (run ${started.id})`);
        await new Promise(resolve => setTimeout(resolve, 1500));
        run = await readResponse(await request(`/runs/${encodeURIComponent(started.id)}`));
    }
}

export function callLocalAI(prompt: string): Promise<string> {
    const queuedAt = Date.now();
    const result = pending.then(() => {
        console.log(`[local-ai] queueWaitMs=${Date.now() - queuedAt} inputChars=${prompt.length}`);
        return runLocal(prompt);
    });
    pending = result.then(() => undefined, () => undefined);
    return result;
}
