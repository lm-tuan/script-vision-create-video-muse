import { Communicate } from 'edge-tts-universal';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

export interface TTSOptions {
    transcript: string;
    voice?: string;
    ttsEngine?: string;
    targetLanguage?: string;
    ttsTaskId?: string;
    genmaxApiKey?: string;
    genmaxProvider?: string;
    genmaxVoiceId?: string;
    genmaxModelId?: string;
    beeknoeeApiKey?: string;
    beeknoeeModel?: string;
    beeknoeeVoice?: string;
    refAudioFile?: File | null;
    refText?: string;
    refLanguage?: string;
    apiUrl?: string;
}

export interface TTSResult {
    success: boolean;
    audioUrl?: string;
    srtUrl?: string;
    srt?: string;
    error?: string;
}

async function getAudioDurationWithFFprobe(buffer: Buffer): Promise<number> {
    const tempFileName = join(process.cwd(), 'public', 'outputs', `temp_dur_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.mp3`);
    try {
        await writeFile(tempFileName, buffer);
        const { stdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tempFileName}"`);
        const duration = parseFloat(stdout.trim());
        return isNaN(duration) ? 0 : duration;
    } catch (e) {
        console.error("FFprobe duration extraction failed:", e);
        return 0;
    } finally {
        try {
            await unlink(tempFileName);
        } catch (e) {}
    }
}

export async function generateTTS(options: TTSOptions): Promise<TTSResult> {
    const {
        transcript,
        voice = "vi-VN-HoaiMyNeural",
        ttsEngine = "edge",
        targetLanguage = "vi",
        ttsTaskId = "",
        genmaxApiKey = "",
        genmaxProvider = "",
        genmaxVoiceId = "",
        genmaxModelId = "",
        beeknoeeApiKey = "",
        beeknoeeModel = "openai/gpt-4o-mini-tts",
        beeknoeeVoice = "alloy",
        refAudioFile = null,
        refText = "",
        refLanguage = "vi",
        apiUrl = "http://127.0.0.1:9880"
    } = options;

    const ttsWarnings: string[] = [];
    let tempRefAudioPath = "";

    const updateTtsStatus = async (progress: number, statusText: string) => {
        if (!ttsTaskId) return;
        const statusPath = join(process.cwd(), 'public', 'outputs', `tts_status_${ttsTaskId}.json`);
        try {
            await writeFile(statusPath, JSON.stringify({ progress, status: statusText, warnings: ttsWarnings }), 'utf8');
        } catch (e) {
            console.error("Failed to write tts status:", e);
        }
    };

    if (!transcript.trim()) {
        return { success: false, error: 'Missing transcript' };
    }

    // Ensure outputs directory exists
    const publicOutputsDir = join(process.cwd(), 'public', 'outputs');
    await mkdir(publicOutputsDir, { recursive: true });

    // GenMax single-request processing with native SRT generation
    if (ttsEngine === "genmax") {
        await updateTtsStatus(5, "Khởi tạo yêu cầu giọng đọc GenMax...");
        const resolvedApiKey = genmaxApiKey.trim() || process.env.GENMAX_API_KEY?.trim();
        if (!resolvedApiKey) {
            throw new Error("Missing GenMax API Key. Please configure GENMAX_API_KEY in .env.local or enter it on the UI.");
        }

        const bodyPayload: any = {
            text: transcript,
            provider: genmaxProvider,
            language_code: targetLanguage === "vi" ? (genmaxProvider === "minimax" ? "Vietnamese" : "vi") : targetLanguage,
            export_transcript: true,
            voice_settings: genmaxProvider === "elevenlabs" ? {
                stability: 0.5,
                similarity_boost: 0.75,
                speed: 1.0
            } : genmaxProvider === "minimax" ? {
                speed: 1.0,
                pitch: 0,
                vol: 1.0
            } : {
                speed: 1.0,
                pitch: 0
            }
        };

        if (genmaxModelId) {
            bodyPayload.model_id = genmaxModelId;
        } else if (genmaxProvider === "minimax") {
            bodyPayload.model_id = "speech-2.8-turbo";
        } else if (genmaxProvider === "elevenlabs") {
            bodyPayload.model_id = "eleven_turbo_v2_5";
        }

        const postUrl = `https://api.genmax.io/v1/text-to-speech/${encodeURIComponent(genmaxVoiceId)}`;
        console.log(`GenMax Single Request: Sending transcript (${transcript.length} chars) to ${postUrl}`);
        const postRes = await fetch(postUrl, {
            method: 'POST',
            headers: {
                'xi-api-key': resolvedApiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(bodyPayload)
        });
        
        if (!postRes.ok) {
            const failure = await postRes.json().catch(() => null);
            if (failure?.error === 'provider_under_maintenance') {
                const providers: Record<string, string> = { minimax: 'MiniMax', elevenlabs: 'ElevenLabs', capcut: 'CapCut' };
                const provider = Object.hasOwn(providers, genmaxProvider) ? providers[genmaxProvider] : 'nhà cung cấp giọng đọc';
                throw new Error(`GenMax báo ${provider} đang bảo trì (HTTP ${postRes.status}). Hãy chọn nhà cung cấp khác hoặc thử lại sau.`);
            }
            const detail = typeof failure?.message === 'string'
                ? ` ${failure.message.replaceAll(resolvedApiKey, '[đã ẩn]').slice(0, 300)}`
                : '';
            throw new Error(`GenMax trả HTTP ${postRes.status}.${detail}`);
        }
        
        const postData = await postRes.json();
        const taskId = postData.id;
        if (!taskId) {
            throw new Error(`GenMax did not return a task ID: ${JSON.stringify(postData)}`);
        }
        
        await updateTtsStatus(15, "Đang chờ GenMax xử lý âm thanh & phụ đề...");
        let audioUrl = null;
        let srtUrl = null;
        const pollUrl = `https://api.genmax.io/v1/history/${taskId}`;
        const maxPollAttempts = 120; // up to 600 seconds (10 minutes)
        
        for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            const currentPct = Math.round(15 + (attempt / maxPollAttempts) * 70);
            await updateTtsStatus(currentPct, `Đang xử lý (Lần thử ${attempt + 1}/${maxPollAttempts})...`);
            
            const pollRes = await fetch(pollUrl, {
                method: 'GET',
                headers: {
                    'xi-api-key': resolvedApiKey
                }
            });
            if (!pollRes.ok) continue;
            const pollData = await pollRes.json();
            if (pollData.status === 'done' || pollData.status === 'completed') {
                audioUrl = pollData.result?.audio_url;
                srtUrl = pollData.result?.srt_url || 
                         pollData.result?.srt || 
                         pollData.result?.transcript_url ||
                         pollData.srt_url ||
                         pollData.srt;
                break;
            } else if (pollData.status === 'failed') {
                throw new Error(`GenMax task failed: ${pollData.error || 'unknown error'}`);
            }
        }
        
        if (!audioUrl) {
            throw new Error(`GenMax task timed out.`);
        }
        
        await updateTtsStatus(90, "Đang tải dữ liệu từ GenMax...");
        const audioRes = await fetch(audioUrl);
        if (!audioRes.ok) {
            throw new Error(`Failed to download Genmax audio: HTTP ${audioRes.status}`);
        }
        const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
        
        let srtText = "";
        if (srtUrl) {
            console.log(`GenMax downloading SRT from: ${srtUrl}`);
            const srtRes = await fetch(srtUrl);
            if (srtRes.ok) {
                srtText = await srtRes.text();
            } else {
                console.warn(`Failed to download SRT from ${srtUrl}, status: ${srtRes.status}`);
            }
        }
        
        const audioFileName = `audio_${Date.now()}.mp3`;
        const srtFileName = `audio_${Date.now()}.srt`;

        const audioPath = join(publicOutputsDir, audioFileName);
        const srtPath = join(publicOutputsDir, srtFileName);

        await writeFile(audioPath, audioBuffer);
        await writeFile(srtPath, srtText, 'utf-8');

        console.log(`TTS API (GenMax): Successfully created ${audioFileName} and srt.`);
        await updateTtsStatus(100, "Hoàn tất sinh giọng đọc GenMax!");

        return {
            success: true,
            audioUrl: `/outputs/${audioFileName}`,
            srtUrl: `/outputs/${srtFileName}`,
            srt: srtText
        };
    }

    // Sanitize text for TTS: remove non-speakable characters that cause glitches
    const sanitizeForTTS = (text: string): string => {
        let cleaned = text;
        // Remove em dashes and horizontal bars (――, —, ─, ―)
        cleaned = cleaned.replace(/[―─—]+/g, ' ');
        // Normalize excessive dots (.... → ...)
        cleaned = cleaned.replace(/\.{4,}/g, '...');
        // Remove other non-speakable symbols that can confuse TTS
        cleaned = cleaned.replace(/[※★☆◆◇■□▲△▼▽●○◎♦♠♣♥♡►◄«»‹›〈〉《》【】〔〕｛｝〝〞]/g, '');
        // Clean up multiple spaces and trim
        cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
        return cleaned;
    };

    // Split transcript into lines
    const lines = transcript
        .split(/\r?\n/)
        .map((line: string) => sanitizeForTTS(line.trim()))
        .filter((line: string) => {
            if (line.length === 0) return false;
            return /[\p{L}\p{N}]/u.test(line);
        });

    if (lines.length === 0) {
        return { success: false, error: 'Transcript has no readable lines' };
    }

    // Save reference audio file if GPT-SoVITS is selected
    if (ttsEngine === "gpt-sovits" && refAudioFile) {
        const buffer = Buffer.from(await refAudioFile.arrayBuffer());
        const tempFileName = `ref_${Date.now()}.wav`;
        const filePath = join(publicOutputsDir, tempFileName);
        await writeFile(filePath, buffer);
        tempRefAudioPath = filePath;
        console.log(`TTS Service: Saved temporary reference audio to: ${tempRefAudioPath}`);
    }

    console.log(`TTS Service: Processing ${lines.length} lines with engine ${ttsEngine} (voice: ${voice})`);

    let combinedBuffers: Buffer[] = [];
    let currentTime = 0;
    let srtLines: string[] = [];

    // Helper to synthesize a single line and track the duration
    const getAudioAndDuration = async (text: string, voiceName: string) => {
        if (ttsEngine === "gpt-sovits") {
            if (!tempRefAudioPath) {
                throw new Error("Missing reference audio file for GPT-SoVITS cloning.");
            }

            const queryParams = new URLSearchParams({
                text: text,
                text_lang: targetLanguage.toLowerCase(),
                ref_audio_path: tempRefAudioPath,
                prompt_text: refText,
                prompt_lang: refLanguage.toLowerCase(),
                media_type: "wav",
                streaming_mode: "false"
            });

            const targetUrl = `${apiUrl}/tts?${queryParams.toString()}`;
            console.log(`TTS Service calling local GPT-SoVITS: ${targetUrl}`);

            const res = await fetch(targetUrl);
            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`GPT-SoVITS server error: ${errText}`);
            }

            const arrayBuffer = await res.arrayBuffer();
            const audioBuffer = Buffer.from(arrayBuffer);
            let duration = (audioBuffer.length - 44) / 64000;
            if (duration <= 0 || isNaN(duration)) {
                duration = text.length * 0.15 + 1.2;
            }

            return {
                buffer: audioBuffer,
                duration: duration
            };
        } else if (ttsEngine === "beeknoee") {
            const resolvedApiKey = beeknoeeApiKey || process.env.BEEKNOEE_API_KEY || "";
            if (!resolvedApiKey) {
                throw new Error("Missing Beeknoee API Key. Please configure BEEKNOEE_API_KEY in .env.local or enter it on the UI.");
            }

            const response = await fetch("https://platform.beeknoee.com/api/v1/audio/speech", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${resolvedApiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: beeknoeeModel || "openai/gpt-4o-mini-tts",
                    input: text,
                    voice: beeknoeeVoice || "alloy"
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Beeknoee API failed: ${response.status} - ${errText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = Buffer.from(arrayBuffer);

            let duration = await getAudioDurationWithFFprobe(audioBuffer);
            if (duration <= 0 || isNaN(duration)) {
                duration = text.length * 0.15 + 1.2;
            }

            return {
                buffer: audioBuffer,
                duration: duration
            };
        } else {
            // Edge TTS (Default)
            const communicate = new Communicate(text, { voice: voiceName, connectionTimeout: 10000 });
            let audioBuffers: Buffer[] = [];
            let lastWordEnd = 0;

            for await (const chunk of communicate.stream()) {
                if (chunk.type === 'audio' && chunk.data) {
                    audioBuffers.push(Buffer.from(chunk.data as Uint8Array));
                } else if (chunk.type === 'WordBoundary' && chunk.offset !== undefined && chunk.duration !== undefined) {
                    const endTick = chunk.offset + chunk.duration;
                    const endSeconds = endTick / 10000000;
                    if (endSeconds > lastWordEnd) {
                        lastWordEnd = endSeconds;
                    }
                }
            }

            if (audioBuffers.length === 0) {
                throw new Error("No audio was received for this chunk.");
            }

            const concatenated = Buffer.concat(audioBuffers);
            const estimatedDuration = concatenated.length / 6000;

            let duration = lastWordEnd;
            if (duration <= 0 || Math.abs(duration - estimatedDuration) > 1.8) {
                duration = estimatedDuration;
            }

            return {
                buffer: concatenated,
                duration: duration
            };
        }
    };

    // Process line-by-line
    let srtIndex = 1;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 400));
        }
        
        await updateTtsStatus(Math.round((i / lines.length) * 100), `Đang sinh giọng câu ${i + 1}/${lines.length}...`);
        
        let result = null;
        let attempts = 0;
        let success = false;
        
        while (attempts < 3 && !success) {
            try {
                result = await getAudioAndDuration(line, voice);
                success = true;
            } catch (err) {
                attempts++;
                const errMsg = `Thử lại lần ${attempts} thất bại câu ${i+1}: ${err instanceof Error ? err.message : String(err)}`;
                console.warn(`TTS Attempt ${attempts} failed for line "${line}". Error: ${err instanceof Error ? err.message : String(err)}`);
                ttsWarnings.push(errMsg);
                await updateTtsStatus(Math.round((i / lines.length) * 100), `Đang sinh giọng câu ${i + 1}/${lines.length}...`);
                if (attempts < 3) {
                    await new Promise(resolve => setTimeout(resolve, 1200));
                }
            }
        }

        if (!success || !result) {
            const skipMsg = `⚠️ BỎ QUA câu ${i+1} sau 3 lần thử lại thất bại: "${line.substring(0, 30)}..."`;
            console.warn(`TTS Warning: skipping line "${line}" after 3 failed attempts.`);
            ttsWarnings.push(skipMsg);
            await updateTtsStatus(Math.round((i / lines.length) * 100), `Đang sinh giọng câu ${i + 1}/${lines.length}...`);
            continue;
        }

        try {
            const { buffer, duration } = result;
            combinedBuffers.push(buffer);

            const startTime = currentTime;
            const endTime = currentTime + duration;

            const formatTime = (seconds: number) => {
                const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
                const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
                const s = Math.floor(seconds % 60).toString().padStart(2, '0');
                const ms = Math.floor((seconds % 1) * 1000).toString().padStart(3, '0');
                return `${h}:${m}:${s},${ms}`;
            };

            srtLines.push(`${srtIndex}`);
            srtLines.push(`${formatTime(startTime)} --> ${formatTime(endTime)}`);
            srtLines.push(line);
            srtLines.push('');

            srtIndex++;
            currentTime = endTime;
        } catch (err) {
            console.warn(`TTS Warning: error writing SRT for line "${line}":`, err);
        }
    }

    // Clean up ref audio path
    if (tempRefAudioPath) {
        try {
            await unlink(tempRefAudioPath);
        } catch (e) {}
    }

    const audioFileName = `audio_${Date.now()}.mp3`;
    const srtFileName = `audio_${Date.now()}.srt`;

    const audioPath = join(publicOutputsDir, audioFileName);
    const srtPath = join(publicOutputsDir, srtFileName);

    await writeFile(audioPath, Buffer.concat(combinedBuffers));
    const srtText = srtLines.join('\n');
    await writeFile(srtPath, srtText, 'utf-8');

    console.log(`TTS Service: Successfully created ${audioFileName} and srt.`);
    await updateTtsStatus(100, "Hoàn tất sinh giọng đọc!");

    return {
        success: true,
        audioUrl: `/outputs/${audioFileName}`,
        srtUrl: `/outputs/${srtFileName}`,
        srt: srtText
    };
}
