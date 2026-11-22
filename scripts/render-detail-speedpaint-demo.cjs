const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const sharp = require('sharp');

// A guided demonstration for the illustration in scene 15. The polygons are
// authored for this image; arbitrary photos need object masks or segmentation.
const root = path.join(__dirname, '..');
const source = process.argv[2] || path.join(root, 'public/outputs/workspace_1793023629818/temp_media_15.png');
const outputDir = process.argv[3] || path.join(root, 'public/outputs/detail-speedpaint-demo');
if (!fs.existsSync(source)) throw new Error(`Missing source image: ${source}`);
fs.mkdirSync(outputDir, { recursive: true });

const W = 640, H = 360, FPS = 25, FRAMES = 150;
const penFile = path.join(root, 'public/assets/speedpaint/hand_pen.png');
const brushFile = path.join(root, 'public/assets/speedpaint/hand_brush.png');
const regions = [
    { name: 'face', box: [90, 45, 270, 230], polygon: '101,138 110,82 135,55 175,48 224,62 248,88 254,145 237,196 197,220 140,208 108,179' },
    { name: 'shirt', box: [74, 180, 294, 318], polygon: '109,193 148,179 210,188 253,202 279,255 264,308 209,317 135,304 86,298 77,257' },
    { name: 'can', box: [296, 170, 365, 314], polygon: '313,184 340,178 358,191 356,297 342,310 312,304 299,290 299,204' },
    { name: 'large_arrow', box: [366, 89, 510, 277], polygon: '373,273 391,258 441,191 449,143 435,139 442,117 481,88 502,138 506,156 486,156 468,197 426,244' },
    { name: 'flame', box: [465, 191, 532, 297], polygon: '473,280 467,257 477,221 488,236 495,190 516,218 528,251 520,283 497,294' },
    { name: 'small_arrow', box: [522, 184, 576, 297], polygon: '531,286 532,221 522,220 548,185 575,219 563,220 564,288' },
];
const modes = [
    { name: '01_net_but_tung_chi_tiet', kind: 'line', order: [0, 1, 2, 3, 4, 5], brush: false },
    { name: '02_xoan_tron_tung_chi_tiet', kind: 'spiral', order: [2, 0, 1, 4, 3, 5], brush: false },
    { name: '03_co_to_tung_chi_tiet', kind: 'diagonal', order: [3, 5, 4, 2, 0, 1], brush: true },
];
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function makePath(box, kind) {
    const [left, top, right, bottom] = box;
    const points = [];
    if (kind === 'spiral') {
        const cx = (left + right) / 2, cy = (top + bottom) / 2;
        const rx = (right - left) / 2 + 12, ry = (bottom - top) / 2 + 12;
        for (let i = 0; i <= 140; i++) {
            const t = i / 140, angle = 8 * Math.PI * t;
            points.push({ x: cx + rx * t * Math.cos(angle), y: cy + ry * t * Math.sin(angle) });
        }
    } else {
        const step = kind === 'diagonal' ? 20 : 12;
        for (let y = top - 12, row = 0; y < bottom + 12; y += step, row++) {
            const a = kind === 'diagonal' ? { x: left - 30, y: y - 22 } : { x: left - 20, y };
            const b = kind === 'diagonal' ? { x: right + 30, y: y + 22 } : { x: right + 20, y };
            points.push(...(row % 2 ? [b, a] : [a, b]));
        }
    }
    return points;
}

function partialPath(points, progress) {
    const place = clamp(progress, 0, 1) * (points.length - 1);
    const index = Math.min(points.length - 2, Math.floor(place));
    const fraction = place - index;
    return {
        points: [...points.slice(0, index + 1), {
            x: points[index].x + (points[index + 1].x - points[index].x) * fraction,
            y: points[index].y + (points[index + 1].y - points[index].y) * fraction,
        }],
        tip: {
            x: points[index].x + (points[index + 1].x - points[index].x) * fraction,
            y: points[index].y + (points[index + 1].y - points[index].y) * fraction,
        },
    };
}

function maskSvg(mode, active, progress) {
    const done = mode.order.slice(0, active).map(index => `<polygon points="${regions[index].polygon}" fill="white"/>`).join('');
    const region = regions[mode.order[active]];
    const points = makePath(region.box, mode.kind);
    const part = partialPath(points, progress);
    const stroke = mode.kind === 'diagonal' ? 45 : mode.kind === 'spiral' ? 36 : 28;
    const pathPoints = part.points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><clipPath id="region"><polygon points="${region.polygon}"/></clipPath></defs>${done}<polyline points="${pathPoints}" fill="none" stroke="white" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" clip-path="url(#region)"/></svg>`;
    return { mask: Buffer.from(svg), tip: part.tip };
}

async function loadHand(file, targetWidth) {
    const image = await sharp(file).resize({ width: targetWidth }).png().toBuffer();
    const info = await sharp(image).metadata();
    return { image, width: info.width, height: info.height,
        tipX: Math.round(info.width * 0.135), tipY: Math.round(info.height * (file === brushFile ? 0.06 : 0.11)) };
}

async function drawHand(canvas, hand, tip) {
    const x = Math.round(tip.x - hand.tipX), y = Math.round(tip.y - hand.tipY);
    const left = Math.max(0, x), top = Math.max(0, y);
    const sourceLeft = Math.max(0, -x), sourceTop = Math.max(0, -y);
    const width = Math.min(hand.width - sourceLeft, W - left);
    const height = Math.min(hand.height - sourceTop, H - top);
    if (width <= 0 || height <= 0) return canvas;
    const visible = await sharp(hand.image).extract({ left: sourceLeft, top: sourceTop, width, height }).png().toBuffer();
    return sharp(canvas).composite([{ input: visible, left, top }]).png().toBuffer();
}

async function renderMode(mode, original, sketch, hand) {
    const output = path.join(outputDir, `${mode.name}.mp4`);
    const child = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'rawvideo', '-pixel_format', 'rgba',
        '-video_size', `${W}x${H}`, '-framerate', String(FPS), '-i', 'pipe:0',
        '-vf', 'scale=1280:720:flags=lanczos', '-frames:v', String(FRAMES),
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', output],
    { stdio: ['pipe', 'ignore', 'inherit'] });
    const exit = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
    });
    const drawingFrames = FRAMES - 25;
    for (let frame = 0; frame < FRAMES; frame++) {
        let canvas = original;
        if (frame < drawingFrames) {
            const position = frame / drawingFrames * mode.order.length;
            const active = Math.min(mode.order.length - 1, Math.floor(position));
            const progress = position - active;
            const { mask, tip } = maskSvg(mode, active, progress);
            const colored = await sharp(original).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
            canvas = await sharp(sketch).composite([{ input: colored }]).png().toBuffer();
            canvas = await drawHand(canvas, hand, tip);
        }
        if (frame === 62) await fs.promises.writeFile(path.join(outputDir, `${mode.name}.png`), canvas);
        const raw = await sharp(canvas).ensureAlpha().raw().toBuffer();
        if (!child.stdin.write(raw)) await new Promise(resolve => child.stdin.once('drain', resolve));
    }
    child.stdin.end();
    await exit;
    console.log(output);
}

async function main() {
    const original = await sharp(source).resize(W, H, { fit: 'cover' }).png().toBuffer();
    const light = await sharp(original).greyscale().linear(0.12, 215).png().toBuffer();
    const pen = await loadHand(penFile, 210);
    const brush = await loadHand(brushFile, 205);
    for (const mode of modes) await renderMode(mode, original, light, mode.brush ? brush : pen);
    const tiles = await Promise.all(modes.map(mode => sharp(path.join(outputDir, `${mode.name}.png`))
        .resize(640, 360).png().toBuffer()));
    await sharp({ create: { width: 1920, height: 360, channels: 4, background: '#ffffff' } })
        .composite(tiles.map((input, index) => ({ input, left: index * 640, top: 0 })))
        .png().toFile(path.join(outputDir, 'comparison.png'));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
