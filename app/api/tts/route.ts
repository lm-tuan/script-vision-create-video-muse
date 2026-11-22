import { NextResponse } from 'next/server';
import { generateTTS } from '@/services/tts';

export async function POST(request: Request) {
    try {
        const contentType = request.headers.get("content-type") || "";
        let options: any = {};

        if (contentType.includes("multipart/form-data")) {
            const formData = await request.formData();
            options = {
                transcript: formData.get("transcript") as string || "",
                voice: formData.get("voice") as string || undefined,
                ttsEngine: formData.get("ttsEngine") as string || undefined,
                refAudioFile: formData.get("refAudio") as File | null,
                refText: formData.get("refText") as string || "",
                refLanguage: formData.get("refLanguage") as string || "vi",
                targetLanguage: formData.get("targetLanguage") as string || "vi",
                apiUrl: formData.get("apiUrl") as string || undefined,
                ttsTaskId: formData.get("ttsTaskId") as string || "",
                genmaxApiKey: formData.get("genmaxApiKey") as string || "",
                genmaxProvider: formData.get("genmaxProvider") as string || "",
                genmaxVoiceId: formData.get("genmaxVoiceId") as string || "",
                genmaxModelId: formData.get("genmaxModelId") as string || "",
                beeknoeeApiKey: formData.get("beeknoeeApiKey") as string || "",
                beeknoeeModel: formData.get("beeknoeeModel") as string || "",
                beeknoeeVoice: formData.get("beeknoeeVoice") as string || ""
            };
        } else {
            const body = await request.json().catch(() => ({}));
            options = {
                transcript: body.transcript || "",
                voice: body.voice || undefined,
                ttsEngine: body.ttsEngine || undefined,
                refText: body.refText || "",
                refLanguage: body.refLanguage || "vi",
                targetLanguage: body.targetLanguage || "vi",
                apiUrl: body.apiUrl || undefined,
                ttsTaskId: body.ttsTaskId || "",
                genmaxApiKey: body.genmaxApiKey || "",
                genmaxProvider: body.genmaxProvider || "",
                genmaxVoiceId: body.genmaxVoiceId || "",
                genmaxModelId: body.genmaxModelId || "",
                beeknoeeApiKey: body.beeknoeeApiKey || "",
                beeknoeeModel: body.beeknoeeModel || "",
                beeknoeeVoice: body.beeknoeeVoice || ""
            };
        }

        const result = await generateTTS(options);
        
        if (result.success) {
            return NextResponse.json(result);
        } else {
            return NextResponse.json({ success: false, error: result.error || "Không thể tạo giọng đọc" }, { status: 400 });
        }
    } catch (error) {
        console.error('TTS API error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to generate speech'
        }, { status: 500 });
    }
}
