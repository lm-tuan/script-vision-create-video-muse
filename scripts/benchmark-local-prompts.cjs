const fs = require('node:fs');
const path = require('node:path');
const { createLoader } = require('./lib/compose-test-support.cjs');

async function main() {
    const args = process.argv.slice(2);
    if (!args.includes('--live')) {
        console.log('Live benchmark uses local AI quota. Run: npm run benchmark:local-prompts -- --live');
        console.log('Options: --repetitions 3 --compact --transcript --fixture path/to/request.json');
        return;
    }
    require('@next/env').loadEnvConfig(process.cwd());
    const value = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
    const repetitions = Number(value('--repetitions') || 3);
    if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 10) throw new Error('repetitions must be 1–10');
    const load = createLoader();
    const { formatMsToSrtTime } = load('core/time.ts');
    const descriptions = [
        'Một nhà nghiên cứu đứng quan sát cây non bên cửa sổ phòng thí nghiệm.',
        'Nhà nghiên cứu tưới cây, sau đó ghi nhận lá cây bắt đầu dựng lên.',
        'Cận cảnh chiếc lá xanh dưới ánh sáng dịu, có những giọt nước nhỏ.',
        'Nhà nghiên cứu mang chậu cây ra vườn, đặt xuống đất, rồi lùi lại quan sát.',
        'Toàn cảnh khu vườn yên tĩnh vào buổi sáng, cây cối xanh tươi.',
        'Nhà nghiên cứu mỉm cười bên chậu cây và đưa tay che nắng cho lá.',
    ];
    const durations = descriptions.map((description, index) =>
        `Scene ${index + 11}\n\n${description}\n\n9s\n\n${formatMsToSrtTime(index * 9000 + 251)} - ${formatMsToSrtTime((index + 1) * 9000 + 251)}`
    ).join('\n\n');
    const body = value('--fixture') ? JSON.parse(fs.readFileSync(path.resolve(value('--fixture')), 'utf8')) : {
        durations, language: 'vi', promptLanguage: 'en', promptStyle: '',
        transcript: args.includes('--transcript') ? descriptions.join('\n\n') : '',
    };
    if (typeof body.durations !== 'string' || !body.durations.trim()) throw new Error('Fixture must contain durations text');
    body.provider = 'local'; body.stream = false; delete body.resumeKey;
    const base = (process.env.LOCAL_AI_BASE_URL || 'http://127.0.0.1:3900').replace(/\/+$/, '');
    const healthResponse = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000), headers:
        process.env.LOCAL_AI_TOKEN ? { Authorization: `Bearer ${process.env.LOCAL_AI_TOKEN}` } : {} });
    if (!healthResponse.ok) throw new Error(`Local health HTTP ${healthResponse.status}`);
    const health = await healthResponse.json();
    if (!health.ok || health.activeJob) throw new Error('Local API unavailable or busy; benchmark did not start');
    const { POST } = load('app/api/prompt/route.ts');
    const variants = [{ batch: 5, compact: false }, { batch: 10, compact: false }];
    if (args.includes('--compact')) variants.push({ batch: 10, compact: true });
    const report = { recordedAt: new Date().toISOString(), mode: 'live-local-ai',
        sceneCount: load('services/localPromptGeneration.ts').splitLocalScenes(body.durations).length,
        transcriptChars: typeof body.transcript === 'string' ? body.transcript.length : 0,
        promptLanguage: body.promptLanguage || 'en', trials: [],
        limitation: 'Small fixture; structural checks do not establish semantic quality. Review images/content separately before rollout.' };
    const outputPath = path.resolve('docs/local-prompt-benchmark-results.json');
    const save = () => fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
    for (let repetition = 1; repetition <= repetitions; repetition++) {
        // Alternate order to reduce the effect of startup/network conditions.
        const order = repetition % 2 ? variants : [...variants].reverse();
        for (const variant of order) {
            process.env.LOCAL_PROMPT_BATCH_SIZE = String(variant.batch);
            process.env.LOCAL_PROMPT_COMPACT_TEMPLATE = variant.compact ? '1' : '0';
            console.log(`Trial ${repetition}/${repetitions}: batch=${variant.batch} compact=${variant.compact}`);
            const started = Date.now();
            const response = await POST(new Request('http://localhost/api/prompt', { method: 'POST', body: JSON.stringify(body) }));
            const result = await response.json();
            const trial = { repetition, batchSize: variant.batch, compact: variant.compact,
                elapsedMs: Date.now() - started, success: result.success === true,
                scenes: result.prompts?.length || 0,
                images: result.prompts?.reduce((sum, scene) => sum + scene.prompts.length, 0) || 0,
                timeIssues: result.timeValidation?.issueCount ?? null,
                metrics: result.localMetrics || null,
                ...(result.success ? {} : { error: result.error }),
            };
            report.trials.push(trial); save();
            console.log(JSON.stringify(trial));
            if (!trial.success) throw new Error('Benchmark stopped after a failed trial; report saved. No automatic retry.');
        }
    }
    console.log(`Saved ${path.relative(process.cwd(), outputPath)}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
