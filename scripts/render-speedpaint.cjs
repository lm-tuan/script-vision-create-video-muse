const fs = require('node:fs');
const { spawn } = require('node:child_process');
const sharp = require('sharp');

const [sourcePath, penPath, brushPath, outputPath, style, frameCount] = process.argv.slice(2);
const totalFrames = Number(frameCount);
if (![sourcePath, penPath, brushPath].every(p => p && fs.existsSync(p)) || !outputPath ||
    !['sketch_color', 'contour', 'brush_fill'].includes(style) ||
    !Number.isInteger(totalFrames) || totalFrames < 1 || totalFrames > 25 * 3600) {
    throw new Error('Usage: node render-speedpaint.cjs <image> <pen.png> <brush.png> <output.mp4> <style> <frames>');
}

const width = 1280;
const height = 720;
const fps = 25;
const white = { create: { width, height, channels: 4, background: '#fff' } };
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function rowPaths(rows, diagonal = false) {
    return rows.map((y, index) => {
        const start = index % 2 ? width + 80 : -80;
        const end = index % 2 ? -80 : width + 80;
        return diagonal
            ? [{ x: start, y: y - 50 }, { x: end, y: y + 50 }]
            : [{ x: start, y }, { x: end, y }];
    });
}

function contourPaths(ink) {
    const paths = [];
    for (let lane = 0; lane < 9; lane++) {
        const baseY = Math.round((lane + 0.5) * height / 9);
        const points = [];
        let lastY = baseY;
        for (let x = 8; x < width; x += 18) {
            let bestY = lastY;
            let best = -Infinity;
            for (let y = Math.max(2, baseY - 38); y < Math.min(height - 2, baseY + 38); y += 3) {
                const darkness = 255 - ink[y * width + x];
                const score = darkness - Math.abs(y - lastY) * 0.28 - Math.abs(y - baseY) * 0.08;
                if (score > best) { best = score; bestY = y; }
            }
            lastY = Math.round(lastY * 0.45 + bestY * 0.55);
            points.push({ x, y: lastY });
        }
        if (lane % 2) points.reverse();
        paths.push(points);
    }
    return paths;
}

function pathProgress(paths, progress) {
    const position = clamp(progress, 0, 0.999999) * paths.length;
    const pathIndex = Math.floor(position);
    const fraction = position - pathIndex;
    const points = paths[pathIndex];
    const pointIndex = Math.min(points.length - 2, Math.floor(fraction * (points.length - 1)));
    const local = fraction * (points.length - 1) - pointIndex;
    return {
        pathIndex,
        pointIndex,
        cursor: {
            x: Math.round(points[pointIndex].x + (points[pointIndex + 1].x - points[pointIndex].x) * local),
            y: Math.round(points[pointIndex].y + (points[pointIndex + 1].y - points[pointIndex].y) * local),
        },
    };
}

function strokeMask(paths, progress, strokeWidth) {
    const { pathIndex, pointIndex, cursor } = pathProgress(paths, progress);
    const strokes = [];
    for (let index = 0; index <= pathIndex; index++) {
        const points = index < pathIndex ? paths[index] : [...paths[index].slice(0, pointIndex + 1), cursor];
        if (points.length < 2) continue;
        strokes.push(`<polyline points="${points.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="white" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${strokes.join('')}</svg>`);
}

async function fadedHand(file, handWidth) {
    const raw = await sharp(file).resize({ width: handWidth }).png().toBuffer();
    const info = await sharp(raw).metadata();
    const maskX = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}"><defs><linearGradient id="g"><stop offset="63%" stop-color="white"/><stop offset="100%" stop-color="white" stop-opacity="0"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
    const maskY = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="72%" stop-color="white"/><stop offset="100%" stop-color="white" stop-opacity="0"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
    const image = await sharp(raw).ensureAlpha().composite([
        { input: maskX, blend: 'dest-in' }, { input: maskY, blend: 'dest-in' },
    ]).png().toBuffer();
    return { image, width: info.width, height: info.height,
        tipX: Math.round(info.width * 0.135), tipY: Math.round(info.height * (file === brushPath ? 0.06 : 0.11)) };
}

async function putHand(canvas, hand, point) {
    const left = point.x - hand.tipX;
    const top = point.y - hand.tipY;
    const cropLeft = Math.max(0, -left);
    const cropTop = Math.max(0, -top);
    const cropWidth = Math.min(hand.width - cropLeft, width - Math.max(0, left));
    const cropHeight = Math.min(hand.height - cropTop, height - Math.max(0, top));
    if (cropWidth <= 0 || cropHeight <= 0) return canvas;
    const visible = await sharp(hand.image).extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight }).png().toBuffer();
    return sharp(canvas).composite([{ input: visible, left: Math.max(0, left), top: Math.max(0, top) }]).png().toBuffer();
}

async function render() {
    const original = await sharp(sourcePath).resize(width, height, { fit: 'contain', background: '#fff' }).flatten({ background: '#fff' }).png().toBuffer();
    const gray = await sharp(original).greyscale().raw().toBuffer();
    const blur = await sharp(original).greyscale().blur(2.8).raw().toBuffer();
    const ink = Buffer.alloc(width * height);
    for (let i = 0; i < ink.length; i++) ink[i] = Math.max(0, 255 - Math.max(0, blur[i] - gray[i] - 1) * 8);
    const sketch = await sharp(ink, { raw: { width, height, channels: 1 } }).png().toBuffer();
    const lightSketch = await sharp(sketch).linear(0.28, 184).png().toBuffer();
    const rows = rowPaths(Array.from({ length: 9 }, (_, i) => 38 + i * 81));
    const contours = contourPaths(ink);
    const brushRows = rowPaths(Array.from({ length: 8 }, (_, i) => 33 + i * 95), true);
    const paths = style === 'contour' ? contours : style === 'brush_fill' ? brushRows : rows;
    const hand = await fadedHand(style === 'brush_fill' ? brushPath : penPath, style === 'brush_fill' ? 395 : 410);
    const holdFrames = Math.min(Math.round(fps * 0.8), Math.max(1, Math.round(totalFrames * 0.2)));
    const drawFrames = Math.min(fps * 5, Math.max(1, totalFrames - holdFrames));
    const sketchFrames = style === 'brush_fill' ? 0 : Math.max(1, Math.round(drawFrames * 0.48));
    const colorFrames = Math.max(1, drawFrames - sketchFrames);

    const ffmpeg = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pixel_format', 'rgba',
        '-video_size', `${width}x${height}`, '-framerate', String(fps), '-i', 'pipe:0',
        '-vf', 'scale=1920:1080:flags=lanczos', '-frames:v', String(totalFrames),
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p', outputPath],
    { stdio: ['pipe', 'inherit', 'inherit'] });
    const finished = new Promise((resolve, reject) => {
        ffmpeg.once('error', reject);
        ffmpeg.once('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
    });

    for (let frame = 0; frame < totalFrames; frame++) {
        let canvas = original;
        let position = null;
        if (frame < sketchFrames) {
            const progress = frame / sketchFrames;
            const revealed = await sharp(sketch).ensureAlpha().composite([
                { input: strokeMask(paths, progress, style === 'contour' ? 65 : 132), blend: 'dest-in' },
            ]).png().toBuffer();
            canvas = await sharp(style === 'contour' ? lightSketch : white).composite([{ input: revealed }]).png().toBuffer();
            position = pathProgress(paths, progress).cursor;
        } else if (frame < drawFrames) {
            const progress = (frame - sketchFrames) / colorFrames;
            const mask = strokeMask(paths, progress, style === 'brush_fill' ? 185 : style === 'contour' ? 125 : 145);
            const revealed = await sharp(original).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
            const underlay = style === 'brush_fill' ? lightSketch : sketch;
            canvas = await sharp(underlay).ensureAlpha().composite([{ input: revealed }]).png().toBuffer();
            position = pathProgress(paths, progress).cursor;
        }
        if (position) canvas = await putHand(canvas, hand, position);
        const raw = await sharp(canvas).ensureAlpha().raw().toBuffer();
        if (!ffmpeg.stdin.write(raw)) await new Promise(resolve => ffmpeg.stdin.once('drain', resolve));
    }
    ffmpeg.stdin.end();
    await finished;
}

render().catch(error => { console.error(error); process.exitCode = 1; });
