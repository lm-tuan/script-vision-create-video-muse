const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const project = path.resolve(__dirname, '../..');

// Load the actual application modules without starting a development server.
function createLoader(mocks = {}) {
    const cache = new Map();
    function load(file) {
        const resolved = [file, `${file}.ts`, `${file}.tsx`].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
        if (!resolved) throw new Error(`Cannot load ${file}`);
        if (cache.has(resolved)) return cache.get(resolved).exports;
        const loaded = { exports: {} };
        cache.set(resolved, loaded);
        const code = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
                jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
        }).outputText;
        const localRequire = request => {
            if (Object.hasOwn(mocks, request)) return mocks[request];
            if (request.startsWith('@/')) return load(path.join(project, request.slice(2)));
            if (request.startsWith('.')) return load(path.resolve(path.dirname(resolved), request));
            return require(request);
        };
        new Function('exports', 'module', 'require', '__dirname', '__filename', code)(
            loaded.exports, loaded, localRequire, path.dirname(resolved), resolved);
        return loaded.exports;
    }
    return relative => load(path.resolve(project, relative));
}

// Exercise the real compose handler and capture its outgoing multipart request.
// Only React state/effects, logging and network delivery are replaced.
async function captureComposeRequest({ scenes, files, audioFile, srtFile, layers = {},
    smart = false, motion = false, advanced = false, transition = 'fade', styles = {},
    minSeconds = 8, gap = 3 }) {
    const values = [];
    let cursor = 0;
    const load = createLoader({
        react: {
            useState(initial) {
                const index = cursor++;
                if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial;
                return [values[index], next => { values[index] = typeof next === 'function' ? next(values[index]) : next; }];
            },
            useEffect() {},
        },
        '@/lib/logger': { logService: { addLog() {} } },
        '@/lib/utils': { downloadFile() {} },
    });
    const { useScriptVisionState } = load('hooks/useScriptVisionState.ts');
    const render = () => { cursor = 0; return useScriptVisionState(); };
    const state = render();
    state.setDurations(scenes);
    state.setFinalPrompts(scenes);
    state.setSceneFiles(files);
    state.setLocalAudioFile(audioFile);
    state.setLocalSrtFile(srtFile);
    state.setMotionLayers(layers);
    state.setSmartDirectorEnabled(smart);
    state.setMotionDirectorEnabled(motion);
    state.setUseAdvancedRender(advanced);
    state.setTransitionType(transition);
    state.setSpeedPaintStyles(styles);
    state.setSpeedPaintMinSeconds(minSeconds);
    state.setSpeedPaintGapScenes(gap);
    const originalFetch = global.fetch;
    let captured;
    global.fetch = async (url, init) => {
        if (url !== '/api/compose') throw new Error(`Unexpected request: ${url}`);
        captured = init.body;
        return { json: async () => ({ success: true, videoUrl: '/test/video.mp4' }) };
    };
    try {
        await render().handleComposeVideo();
        if (!captured) throw new Error(render().error || 'Compose request was not sent');
        return captured;
    } finally {
        global.fetch = originalFetch;
    }
}

module.exports = { project, createLoader, captureComposeRequest };
