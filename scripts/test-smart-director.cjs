const assert = require('node:assert/strict');
const { createLoader } = require('./lib/compose-test-support.cjs');

async function main() {
    const load = createLoader();
    const { planSpeedPaintStyles } = load('core/speedpaint/SpeedPaintPlan.ts');
    const shots = Array.from({ length: 153 }, (_, index) => ({ sceneNumber: index + 1,
        sceneName: `Scene ${index + 1}`, durationSeconds: index % 12 === 0 ? 8 : 3 }));
    const options = { enabled: true, minDurationSeconds: 8, minGapScenes: 3 };
    assert.equal(Object.keys(planSpeedPaintStyles(shots, {}, options)).length, 13);
    assert.deepEqual(planSpeedPaintStyles([
        { sceneNumber: 1, durationSeconds: 7.99 },
        { sceneNumber: 2, durationSeconds: 8 },
        { sceneNumber: 3, durationSeconds: 8.01 },
    ], {}, { ...options, minGapScenes: 0 }), { 2: 'sketch_color', 3: 'contour' });
    console.log('PASS: Speed Paint planner counts and duration thresholds');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
