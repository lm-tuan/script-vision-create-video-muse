import type { PromptEntry } from '@/types';

type Run = { context: string; stale: boolean; transitioned: boolean; controller: AbortController };

/** Per mounted UI, memory only. No automatic reuse after reload or successful generation. */
export class LocalPromptClient {
    private context = '';
    private active?: Run;
    private recovery?: { body: string; context: string; resumeKey: string };
    incomplete = false;
    progressive = false;

    dispose() {
        if (this.active) {
            this.active.stale = true;
            this.active.controller.abort();
        }
    }

    observe(context: string) {
        if (context === this.context) return;
        if (this.active) {
            if (!this.active.transitioned && context === this.active.context) this.active.transitioned = true;
            else {
                this.active.stale = true;
                this.active.controller.abort();
            }
        }
        this.context = context;
        if (this.recovery && this.recovery.context !== context && !this.active) this.recovery = undefined;
    }

    async generate(body: Record<string, unknown>, context: string, options: {
        onPartial: (prompts: PromptEntry[], completed: number, total: number) => void;
        onStart?: (resuming: boolean) => void;
    }): Promise<PromptEntry[]> {
        if (this.active) throw new Error('API local: đang có tác vụ tạo prompt trong giao diện này.');
        const run: Run = { context, stale: false, transitioned: context === this.context, controller: new AbortController() };
        this.active = run;
        const key = JSON.stringify(body);
        const recovery = this.recovery?.body === key && this.recovery.context === context ? this.recovery : undefined;
        this.recovery = recovery;
        const ensureCurrent = () => {
            if (run.stale) throw new Error('API local: dữ liệu đã đổi trong lúc tạo. Kết quả cũ không được áp dụng; hãy tạo lại.');
        };
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        let finished = false;
        try {
            options.onStart?.(Boolean(recovery));
            const response = await fetch('/api/prompt', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...body, stream: true, ...(recovery ? { resumeKey: recovery.resumeKey } : {}) }),
                signal: run.controller.signal,
            });
            ensureCurrent();
            if (!response.headers.get('content-type')?.includes('application/x-ndjson')) {
                const data = await response.json();
                ensureCurrent();
                if (!data.success) throw new Error(data.error || 'API local: không thể tạo prompt.');
                this.recovery = undefined;
                this.incomplete = false;
                this.progressive = false;
                return data.prompts || [];
            }
            if (!response.body) throw new Error('API local: không có luồng kết quả.');
            reader = response.body.getReader();
            const decoder = new TextDecoder();
            let pending = '';
            let result: PromptEntry[] | undefined;
            const partial = new Map<number, PromptEntry>();
            let jobId: string | undefined;
            const consume = (line: string) => {
                if (!line.trim()) return;
                ensureCurrent();
                const event = JSON.parse(line);
                if (event.type === 'started') {
                    this.progressive = true;
                    jobId = event.jobId;
                    this.recovery = { body: key, context, resumeKey: event.resumeKey };
                } else if (event.type === 'batch') {
                    if (!jobId || event.jobId !== jobId) throw new Error('API local: sai ID tác vụ.');
                    for (const scene of event.prompts as PromptEntry[]) partial.set(scene.sceneNumber, scene);
                    this.incomplete = true;
                    options.onPartial([...partial.values()].sort((a, b) => a.sceneNumber - b.sceneNumber), event.completedScenes, event.totalScenes);
                } else if (event.type === 'error') {
                    if (/phiên tiếp tục/.test(event.error)) this.recovery = undefined;
                    throw new Error(event.error || 'API local: tạo prompt thất bại.');
                } else if (event.type === 'completed') {
                    result = event.prompts;
                    this.recovery = undefined;
                    this.incomplete = false;
                    finished = true;
                } else throw new Error('API local: sự kiện không hợp lệ.');
            };
            while (true) {
                const chunk = await reader.read();
                ensureCurrent();
                pending += decoder.decode(chunk.value, { stream: !chunk.done });
                const lines = pending.split('\n');
                pending = lines.pop() || '';
                for (const line of lines) consume(line);
                if (chunk.done) break;
            }
            if (pending.trim()) consume(pending);
            if (!finished || !result) throw new Error('API local: kết nối kết thúc trước khi hoàn tất. Bấm Tạo Prompts để tiếp tục.');
            return result;
        } catch (error) {
            if (run.stale) this.recovery = undefined;
            ensureCurrent();
            throw error;
        } finally {
            if (!finished) await reader?.cancel().catch(() => undefined);
            reader?.releaseLock();
            this.active = undefined;
        }
    }
}
