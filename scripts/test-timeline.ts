import { TimelineBuilder } from '../core/timeline/TimelineBuilder';
import { TimelineValidator } from '../core/timeline/TimelineValidator';
import { SegmentSplitter } from '../core/timeline/SegmentSplitter';
import { parseSrtTimeToMs, formatMsToSrtTime } from '../core/time';

function assert(condition: boolean, message: string) {
    if (!condition) {
        console.error(`❌ FAIL: ${message}`);
        process.exit(1);
    } else {
        console.log(`✅ PASS: ${message}`);
    }
}

async function runTests() {
    console.log("=== START TIMELINE SYSTEM TESTS ===\n");

    // ────────────────────────────────────────────────────────────────────────
    // Test Case 1: Time parsing & formatting utilities
    // ────────────────────────────────────────────────────────────────────────
    console.log("Test Case 1: Time parsing and formatting");
    assert(parseSrtTimeToMs("00:00:12,726") === 12726, "parseSrtTimeToMs('00:00:12,726')");
    assert(parseSrtTimeToMs("00:00:15,720") === 15720, "parseSrtTimeToMs('00:00:15,720')");
    assert(formatMsToSrtTime(12726) === "00:00:12,726", "formatMsToSrtTime(12726)");
    assert(formatMsToSrtTime(15720) === "00:00:15,720", "formatMsToSrtTime(15720)");
    
    // ────────────────────────────────────────────────────────────────────────
    // Test Case 2: Segment splitting
    // ────────────────────────────────────────────────────────────────────────
    console.log("\nTest Case 2: Segment splitting");
    const splits = SegmentSplitter.splitRange(10000, 22000, 3); // range of 12000ms divided into 3 segments
    assert(splits.length === 3, "splits length");
    assert(splits[0].startMs === 10000 && splits[0].endMs === 14000 && splits[0].durationMs === 4000, "Split 1 details");
    assert(splits[1].startMs === 14000 && splits[1].endMs === 18000 && splits[1].durationMs === 4000, "Split 2 details");
    assert(splits[2].startMs === 18000 && splits[2].endMs === 22000 && splits[2].durationMs === 4000, "Split 3 details");

    // ────────────────────────────────────────────────────────────────────────
    // Test Case 3: Build Timeline from Estimates
    // ────────────────────────────────────────────────────────────────────────
    console.log("\nTest Case 3: Build Timeline from Estimates");
    const estimates = [
        { id: 1, sceneName: "Scene 1", durationMs: 5000, srtIds: [] },
        { id: 2, sceneName: "Scene 2", durationMs: 7000, srtIds: [] },
        { id: 3, sceneName: "Scene 3", durationMs: 8000, srtIds: [] },
    ];
    const manifestFromEst = TimelineBuilder.buildFromEstimates("test_proj", "audio.mp3", 20000, estimates);
    
    // Validation
    const validationEst = TimelineValidator.validate(manifestFromEst);
    assert(validationEst.isValid, "Manifest built from estimates is valid");
    assert(manifestFromEst.scenes[0].startMs === 0, "First scene starts at 0ms");
    assert(manifestFromEst.scenes[2].endMs === 20000, "Last scene ends exactly at audio duration (20000ms)");
    assert(manifestFromEst.scenes[1].startMs === manifestFromEst.scenes[0].endMs, "Scene 1 contiguity");
    assert(manifestFromEst.scenes[2].startMs === manifestFromEst.scenes[1].endMs, "Scene 2 contiguity");

    // ────────────────────────────────────────────────────────────────────────
    // Test Case 4: Build Timeline from SRT (with alignment)
    // ────────────────────────────────────────────────────────────────────────
    console.log("\nTest Case 4: Build Timeline from SRT");
    const srtText = `
1
00:00:00,518 --> 00:00:04,500
Subtitle line 1

2
00:00:04,500 --> 00:00:09,000
Subtitle line 2

3
00:00:09,000 --> 00:00:15,500
Subtitle line 3
    `.trim();

    const rawSceneInputs = [
        { id: 1, sceneName: "Scene A", durationMs: 4500, srtIds: [1] },
        { id: 2, sceneName: "Scene B", durationMs: 4500, srtIds: [2] },
        { id: 3, sceneName: "Scene C", durationMs: 6500, srtIds: [3] },
    ];

    const manifestFromSrt = TimelineBuilder.buildFromSrt("test_proj", "voice.mp3", 16000, srtText, rawSceneInputs);
    
    const validationSrt = TimelineValidator.validate(manifestFromSrt);
    if (!validationSrt.isValid) {
        console.error("validationSrt failed:", validationSrt.message);
    }
    assert(validationSrt.isValid, "Manifest built from SRT is valid");
    assert(manifestFromSrt.scenes[0].startMs === 0, "SRT scene A startMs is 0");
    assert(manifestFromSrt.scenes[2].endMs === 16000, "SRT scene C ends at master audio duration (16000ms)");
    assert(manifestFromSrt.scenes[1].startMs === 4520, "SRT scene B starts at 4520ms (quantized to 25 FPS)");
    assert(manifestFromSrt.scenes[1].endMs === 9000, "SRT scene B ends at 9000ms");

    // ────────────────────────────────────────────────────────────────────────
    // Test Case 5: Timeline Validator error detections
    // ────────────────────────────────────────────────────────────────────────
    console.log("\nTest Case 5: Timeline Validator error detections");
    
    // Gaps detection
    const invalidManifestGap = {
        projectId: "test",
        audio: { path: "a.mp3", durationMs: 10000 },
        scenes: [
            { id: 1, startMs: 0, endMs: 4000, durationMs: 4000, transcript: "", srtIds: [], prompts: [], images: [] },
            { id: 2, startMs: 5000, endMs: 10000, durationMs: 5000, transcript: "", srtIds: [], prompts: [], images: [] } // Gap of 1000ms
        ]
    };
    const valGap = TimelineValidator.validate(invalidManifestGap);
    assert(!valGap.isValid && (valGap.message || "").includes("Gap"), "Validator detects gap successfully");
 
    // Overlaps detection
    const invalidManifestOverlap = {
        projectId: "test",
        audio: { path: "a.mp3", durationMs: 10000 },
        scenes: [
            { id: 1, startMs: 0, endMs: 6000, durationMs: 6000, transcript: "", srtIds: [], prompts: [], images: [] },
            { id: 2, startMs: 5000, endMs: 10000, durationMs: 5000, transcript: "", srtIds: [], prompts: [], images: [] } // Overlap of 1000ms
        ]
    };
    const valOverlap = TimelineValidator.validate(invalidManifestOverlap);
    assert(!valOverlap.isValid && (valOverlap.message || "").includes("Overlap"), "Validator detects overlap successfully");
 
    // Desync detection
    const invalidManifestDesync = {
        projectId: "test",
        audio: { path: "a.mp3", durationMs: 12000 },
        scenes: [
            { id: 1, startMs: 0, endMs: 5000, durationMs: 5000, transcript: "", srtIds: [], prompts: [], images: [] },
            { id: 2, startMs: 5000, endMs: 10000, durationMs: 5000, transcript: "", srtIds: [], prompts: [], images: [] } // Total 10000ms vs audio 12000ms
        ]
    };
    const valDesync = TimelineValidator.validate(invalidManifestDesync);
    assert(!valDesync.isValid && (valDesync.message || "").includes("duration"), "Validator detects audio length desync successfully");

    console.log("\n=== ALL TESTS PASSED SUCCESSFULLY ===");
}

runTests().catch(err => {
    console.error("Test execution error:", err);
    process.exit(1);
});
