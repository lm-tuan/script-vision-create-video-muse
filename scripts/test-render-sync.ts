import { composeVideo, SceneAsset } from '../services/video';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

const exec = promisify(execCb);

function assert(condition: boolean, message: string) {
    if (!condition) {
        console.error(`❌ FAIL: ${message}`);
        process.exit(1);
    } else {
        console.log(`✅ PASS: ${message}`);
    }
}

async function setupTestEnvironment() {
    const tempDir = join(process.cwd(), 'public', 'outputs', 'test_sync_workspace');
    if (!existsSync(tempDir)) {
        mkdirSync(tempDir, { recursive: true });
    }

    // Generate a 4-second silence audio file
    const audioPath = join(tempDir, 'silence.mp3');
    console.log("Generating 4-second silence audio...");
    await exec(`ffmpeg -y -f lavfi -i "anullsrc=r=44100:cl=stereo" -t 4 "${audioPath}"`);

    // Generate a 1-pixel solid mock image
    const img1Path = join(tempDir, 'mock1.png');
    const img2Path = join(tempDir, 'mock2.png');
    console.log("Generating mock image files...");
    await exec(`ffmpeg -y -f lavfi -i "color=c=blue:s=320x240" -vframes 1 "${img1Path}"`);
    await exec(`ffmpeg -y -f lavfi -i "color=c=red:s=320x240" -vframes 1 "${img2Path}"`);

    return { tempDir, audioPath, img1Path, img2Path };
}

async function runRenderSyncTests() {
    console.log("=== START VIDEO SYNC ENGINE INTEGRATION TESTS ===\n");
    const { tempDir, audioPath, img1Path, img2Path } = await setupTestEnvironment();

    // ────────────────────────────────────────────────────────────────────────
    // Test 1: Image Existence Check (Missing Image)
    // ────────────────────────────────────────────────────────────────────────
    console.log("Test 1: Pre-render missing image detection");
    const scenes1: SceneAsset[] = [
        {
            sceneNumber: 1,
            sceneName: "Scene 1",
            durationSeconds: 2,
            url: "/outputs/test_sync_workspace/missing_file.png" // This file doesn't exist
        }
    ];

    const result1 = await composeVideo({
        scenes: scenes1,
        workspaceId: "test_sync_workspace",
        audioUrl: "/outputs/test_sync_workspace/silence.mp3",
        transitionType: "none",
        burnSubtitles: false
    });

    assert(result1.success === false, "Missing image compose must fail");
    assert(Boolean(result1.error?.includes("MISSING_IMAGE")), `Fail error must be MISSING_IMAGE, got: ${result1.error}`);
    console.log(`- Detected error: ${result1.error}`);

    // ────────────────────────────────────────────────────────────────────────
    // Test 2: Successful End-to-End Render and Final Sync Validation
    // ────────────────────────────────────────────────────────────────────────
    console.log("\nTest 2: Successful render and final frame-level validation");
    const scenes2: SceneAsset[] = [
        {
            sceneNumber: 1,
            sceneName: "First scene",
            durationSeconds: 2,
            url: "/outputs/test_sync_workspace/mock1.png"
        },
        {
            sceneNumber: 2,
            sceneName: "Second scene",
            durationSeconds: 2,
            url: "/outputs/test_sync_workspace/mock2.png"
        }
    ];

    const result2 = await composeVideo({
        scenes: scenes2,
        workspaceId: "test_sync_workspace",
        audioUrl: "/outputs/test_sync_workspace/silence.mp3",
        transitionType: "none",
        burnSubtitles: false
    });

    assert(result2.success === true, "Composer execution must be successful");
    
    // Verify timeline_report.json exists and contains status SUCCESS
    const reportPath = join(tempDir, 'timeline_report.json');
    assert(existsSync(reportPath), "timeline_report.json must be generated");
    
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    assert(report.status === "SUCCESS", "Report status must be SUCCESS");
    assert(report.sync_validated === true, "Report must indicate sync is validated");
    assert(report.frame_count === 100, `Expected exactly 100 frames (4s at 25 fps), got: ${report.frame_count}`);
    
    console.log("\nGenerated Report Details:", JSON.stringify(report, null, 2));
    console.log("\n=== ALL INTEGRATION TESTS PASSED SUCCESSFULLY ===");
}

runRenderSyncTests().catch(err => {
    console.error("Test execution failed:", err);
    process.exit(1);
});
