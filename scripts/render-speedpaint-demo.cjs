const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const sharp = require('sharp');

const [sourcePath, handPath, outputPath] = process.argv.slice(2);
if (!sourcePath || !handPath || !outputPath || !fs.existsSync(sourcePath) || !fs.existsSync(handPath)) {
    throw new Error('Usage: node scripts/render-speedpaint-demo.cjs <image> <transparent-hand.png> <output.mp4>');
}

const width = 960;
const height = 540;
const fps = 25;
const sketchSeconds = 3.1;
const colorSeconds = 3.1;
const holdSeconds = 1.3;
const totalFrames = Math.round((sketchSeconds + colorSeconds + holdSeconds) * fps);
const rows = [38, 115, 192, 269, 346, 423, 500];

function brushMask(progress, strokeWidth) {
    const completed = Math.min(rows.length, Math.max(0, progress) * rows.length);
    const whole = Math.floor(completed);
    const part = completed - whole;
    const lines = [];
    for (let row = 0; row < rows.length; row++) {
        const fraction = row < whole ? 1 : row === whole ? part : 0;
        if (fraction <= 0) continue;
        const start = row % 2 === 0 ? -45 : width + 45;
        const end = row % 2 === 0 ? width + 45 : -45;
        const current = start + (end - start) * fraction;
        lines.push(`<line x1="${start}" y1="${rows[row]}" x2="${current}" y2="${rows[row]}" stroke="white" stroke-width="${strokeWidth}" stroke-linecap="round"/>`);
    }
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${lines.join('')}</svg>`);
}

function nibPosition(progress) {
    const cursor = Math.min(rows.length - 0.00001, Math.max(0, progress) * rows.length);
    const row = Math.floor(cursor);
    const fraction = cursor - row;
    const from = row % 2 === 0 ? -45 : width + 45;
    const to = row % 2 === 0 ? width + 45 : -45;
    return { x: Math.round(from + (to - from) * fraction), y: rows[row] };
}

async function main() {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const original = await sharp(sourcePath).resize(width, height, { fit: 'cover' }).png().toBuffer();
    const grayscale = await sharp(original).greyscale().raw().toBuffer();
    const blurred = await sharp(original).greyscale().blur(2.4).raw().toBuffer();
    const ink = Buffer.alloc(width * height);
    for (let i = 0; i < ink.length; i++) {
        const edge = Math.max(0, blurred[i] - grayscale[i] - 1);
        ink[i] = Math.max(0, 255 - edge * 8);
    }
    const sketch = await sharp(ink, { raw: { width, height, channels: 1 } }).png().toBuffer();
    const rawHand = await sharp(handPath).resize({ width: 310 }).png().toBuffer();
    const rawHandInfo = await sharp(rawHand).metadata();
    const fadeX = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${rawHandInfo.width}" height="${rawHandInfo.height}"><defs><linearGradient id="g"><stop offset="62%" stop-color="white"/><stop offset="100%" stop-color="white" stop-opacity="0"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
    const fadeY = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${rawHandInfo.width}" height="${rawHandInfo.height}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="70%" stop-color="white"/><stop offset="100%" stop-color="white" stop-opacity="0"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
    const hand = await sharp(rawHand).ensureAlpha().composite([{ input: fadeX, blend: 'dest-in' }, { input: fadeY, blend: 'dest-in' }]).png().toBuffer();
    const handInfo = await sharp(hand).metadata();
    const handWidth = handInfo.width;
    const handHeight = handInfo.height;
    const tipX = Math.round(handWidth * 0.135);
    const tipY = Math.round(handHeight * 0.11);
    const white = { create: { width, height, channels: 4, background: '#fff' } };

    const ffmpeg = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pixel_format', 'rgba',
        '-video_size', `${width}x${height}`, '-framerate', String(fps), '-i', 'pipe:0',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart', outputPath], { stdio: ['pipe', 'inherit', 'inherit'] });
    const exitPromise = new Promise((resolve, reject) => {
        ffmpeg.once('error', reject);
        ffmpeg.once('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
    });

    for (let frame = 0; frame < totalFrames; frame++) {
        const time = frame / fps;
        const sketchProgress = Math.min(1, time / sketchSeconds);
        const colorProgress = Math.min(1, Math.max(0, (time - sketchSeconds) / colorSeconds));
        let canvas;
        if (sketchProgress < 1) {
            const maskedSketch = await sharp(sketch).ensureAlpha().composite([{ input: brushMask(sketchProgress, 102), blend: 'dest-in' }]).png().toBuffer();
            canvas = await sharp(white).composite([{ input: maskedSketch }]).png().toBuffer();
        } else if (colorProgress < 1) {
            const maskedColor = await sharp(original).ensureAlpha().composite([{ input: brushMask(colorProgress, 112), blend: 'dest-in' }]).png().toBuffer();
            canvas = await sharp(sketch).ensureAlpha().composite([{ input: maskedColor }]).png().toBuffer();
        } else {
            canvas = original;
        }

        if (time < sketchSeconds + colorSeconds) {
            const progress = time < sketchSeconds ? sketchProgress : colorProgress;
            const nib = nibPosition(progress);
            const left = nib.x - tipX;
            const top = nib.y - tipY;
            const cropLeft = Math.max(0, -left);
            const cropTop = Math.max(0, -top);
            const cropWidth = Math.min(handWidth - cropLeft, width - Math.max(0, left));
            const cropHeight = Math.min(handHeight - cropTop, height - Math.max(0, top));
            if (cropWidth > 0 && cropHeight > 0) {
                const visibleHand = await sharp(hand).extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight }).png().toBuffer();
                canvas = await sharp(canvas).composite([{ input: visibleHand, left: Math.max(0, left), top: Math.max(0, top) }]).png().toBuffer();
            }
        }
        if ([25, 75, 110, totalFrames - 1].includes(frame)) {
            await fs.promises.writeFile(path.join(path.dirname(outputPath), `preview_${String(frame).padStart(3, '0')}.png`), canvas);
        }
        const raw = await sharp(canvas).ensureAlpha().raw().toBuffer();
        if (!ffmpeg.stdin.write(raw)) await new Promise(resolve => ffmpeg.stdin.once('drain', resolve));
        if (frame % 25 === 0) process.stdout.write(`render ${frame}/${totalFrames}\n`);
    }
    ffmpeg.stdin.end();
    await exitPromise;
    console.log(outputPath);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
