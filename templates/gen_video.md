# 🎬 KẾ HOẠCH NÂNG CẤP VIDEO RENDER — ScriptVision

> **Nguyên tắc cốt lõi:** "Audio là master timeline" — mọi tính năng mới
> **KHÔNG ĐƯỢC** làm lệch tổng duration video so với audio.

---

## 📊 HIỆN TRẠNG & VẤN ĐỀ

### Pipeline hiện tại:
```
Ảnh tĩnh → ffmpeg -loop 1 -t duration → segment.mp4 → concat → + audio → final_video.mp4
```

### Cơ chế sync hiện tại (đã hoạt động tốt):
```
1. ffprobe đo audio thực → actualAudioDuration
2. Scale tất cả scene duration → tổng = actualAudioDuration  
3. Mỗi segment encode với -t adjustedDuration
4. Concat -c copy → merge audio → -shortest (safety net)
```

### Vấn đề: Video nhàm chán vì:
- Ảnh tĩnh không có chuyển động → cảm giác slideshow PowerPoint
- Cắt cứng giữa các scene → giật, không mượt
- Không có color grading → màu sắc không đồng nhất
- Chỉ có voice TTS → thiếu nhạc nền, âm thanh đơn điệu
- Subtitle dạng cơ bản → không nổi bật

---

## 🔒 PHÂN LOẠI TÍNH NĂNG THEO ĐỘ AN TOÀN SYNC

### ✅ AN TOÀN — Không ảnh hưởng duration (chỉ thay đổi pixel/frame)

| # | Tính năng | Lý do an toàn |
|---|-----------|---------------|
| 1 | Ken Burns (zoom/pan) | `zoompan` filter chạy trong `-t adjustedDuration` |
| 2 | Color Grading | `eq`/`colorbalance` chỉ đổi màu pixel |
| 3 | Text Overlay | `drawtext` chỉ vẽ text lên frame |
| 4 | Vignette / Film Grain | Filter visual, không đụng timeline |
| 5 | Progress Bar | `drawbox` overlay |
| 6 | Subtitle Styling | Chỉ đổi font/size/color |
| 7 | Background Music | Mix ở bước cuối, không đổi video duration |

### ⚠️ CẦN XỬ LÝ — Thay đổi duration, phải bù thời gian

| # | Tính năng | Rủi ro | Giải pháp |
|---|-----------|--------|-----------|
| 8 | Transitions (xfade) | Mỗi transition "ăn" 0.3-1s → tích lũy lệch rất lớn | Bù duration vào mỗi segment |
| 9 | Intro/Outro | Thêm thời gian ngoài audio coverage | Tách riêng, không nằm trong audio timeline |

---

## 🚀 CHI TIẾT TỪNG TÍNH NĂNG + GIẢI PHÁP

---

### 1. 🔄 KEN BURNS EFFECT (Zoom + Pan cho ảnh tĩnh)

**Ưu tiên: ⭐⭐⭐⭐⭐ | Độ khó: ⭐⭐ | Sync: ✅ AN TOÀN**

#### Tại sao quan trọng nhất:
Ảnh tĩnh hiển thị 3-10 giây mà không chuyển động = nhàm chán nhất.
Ken Burns biến ảnh tĩnh thành "sống" chỉ bằng zoom/pan nhẹ.

#### Các preset:

| Preset | Mô tả | Khi nào dùng |
|--------|--------|-------------|
| `zoom_in` | Phóng to dần (wide → close-up) | Nhấn mạnh chi tiết, mở đầu |
| `zoom_out` | Thu nhỏ dần (close-up → wide) | Reveal, kết thúc scene |
| `pan_left` | Dịch trái → phải | Cảnh rộng, landscape |
| `pan_right` | Dịch phải → trái | Cảnh rộng, đổi hướng |
| `pan_up` | Dịch dưới → trên | Cảnh dọc, building |
| `pan_down` | Dịch trên → xuống | Cảnh dọc, waterfall |
| `random` | Ngẫu nhiên 1 trong các preset trên | Đa dạng hóa |

#### Cách implement (thay đổi trong bước tạo segment):

```bash
# HIỆN TẠI (ảnh tĩnh, không chuyển động):
ffmpeg -y -loop 1 -i "image.png" -t 5 \
  -vf "scale=1920:1080:...,setsar=1,format=yuv420p" \
  -r 25 -vsync cfr -c:v libx264 -preset fast -crf 23 "segment.mp4"

# SAU KHI THÊM KEN BURNS (zoom_in):
ffmpeg -y -loop 1 -i "image.png" -t 5 \
  -vf "scale=8000:-1,zoompan=z='min(zoom+0.0015,1.5)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=125:s=1920x1080:fps=25,setsar=1,format=yuv420p" \
  -vsync cfr -c:v libx264 -preset fast -crf 23 "segment.mp4"

# zoom_out:
ffmpeg -y -loop 1 -i "image.png" -t 5 \
  -vf "scale=8000:-1,zoompan=z='if(lte(zoom,1.0),1.5,max(1.001,zoom-0.0015))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=125:s=1920x1080:fps=25,setsar=1,format=yuv420p" \
  -vsync cfr -c:v libx264 -preset fast -crf 23 "segment.mp4"

# pan_left (trái sang phải):
ffmpeg -y -loop 1 -i "image.png" -t 5 \
  -vf "scale=8000:-1,zoompan=z=1.3:x='(iw/zoom-iw/zoom*0.7)*(on/(25*5))':y='ih/2-(ih/zoom/2)':d=125:s=1920x1080:fps=25,setsar=1,format=yuv420p" \
  -vsync cfr -c:v libx264 -preset fast -crf 23 "segment.mp4"
```

#### Tại sao AN TOÀN:
```
- Duration vẫn giữ nguyên -t adjustedDuration
- zoompan chỉ thay đổi cách crop/hiển thị frame, KHÔNG đổi số frame
- d (total frames) = duration × fps → khớp chính xác
- Output vẫn là 1920x1080, 25fps, CFR → concat vẫn hoạt động
```

#### Lưu ý kỹ thuật:
- **Phải scale ảnh lên 4x-5x trước** (scale=8000:-1) để zoom không bị pixelated
- `d` = duration_seconds × fps. Ví dụ: 5s × 25fps = 125
- Tốc độ zoom (0.0015) phải điều chỉnh theo duration để luôn smooth
- **RAM tăng ~200-300MB** do ảnh scale lớn → OK cho hầu hết máy
- Render time tăng ~20-30% so với ảnh tĩnh

#### Code TypeScript để chọn filter:
```typescript
function getKenBurnsFilter(
  preset: 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right' | 'pan_up' | 'pan_down' | 'random',
  durationSec: number,
  fps: number = 25
): string {
  const totalFrames = Math.round(durationSec * fps);
  const zoomSpeed = 0.5 / totalFrames; // zoom 50% trong toàn bộ duration

  if (preset === 'random') {
    const presets = ['zoom_in', 'zoom_out', 'pan_left', 'pan_right'] as const;
    preset = presets[Math.floor(Math.random() * presets.length)];
  }

  const base = `scale=8000:-1,zoompan=`;
  switch (preset) {
    case 'zoom_in':
      return `${base}z='min(zoom+${zoomSpeed},1.5)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=1920x1080:fps=${fps}`;
    case 'zoom_out':
      return `${base}z='if(lte(zoom,1.0),1.5,max(1.001,zoom-${zoomSpeed}))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=1920x1080:fps=${fps}`;
    case 'pan_left':
      return `${base}z=1.3:x='(iw/zoom-iw/zoom*0.7)*(on/${totalFrames})':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=1920x1080:fps=${fps}`;
    case 'pan_right':
      return `${base}z=1.3:x='(iw/zoom-iw/zoom*0.7)*(1-on/${totalFrames})':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=1920x1080:fps=${fps}`;
    case 'pan_up':
      return `${base}z=1.3:x='iw/2-(iw/zoom/2)':y='(ih/zoom-ih/zoom*0.7)*(1-on/${totalFrames})':d=${totalFrames}:s=1920x1080:fps=${fps}`;
    case 'pan_down':
      return `${base}z=1.3:x='iw/2-(iw/zoom/2)':y='(ih/zoom-ih/zoom*0.7)*(on/${totalFrames})':d=${totalFrames}:s=1920x1080:fps=${fps}`;
  }
}
```

---

### 2. 🎭 TRANSITIONS (Chuyển cảnh mượt)

**Ưu tiên: ⭐⭐⭐⭐⭐ | Độ khó: ⭐⭐⭐ | Sync: ⚠️ CẦN BÙ THỜI GIAN**

#### Vấn đề sync chi tiết:

```
KHÔNG CÓ TRANSITION:
  Segment A (5s) + Segment B (4s) = tổng 9s ✅ khớp audio

CÓ TRANSITION (xfade 0.5s):
  Segment A (5s) + Segment B (4s) - overlap 0.5s = tổng 8.5s ❌ thiếu 0.5s

VỚI 85 SEGMENTS VÀ TRANSITION 0.5s:
  84 transitions × 0.5s = 42 giây bị mất ❌❌❌ LỆCH NẶNG
```

#### GIẢI PHÁP: Bù thời gian trước khi tạo segment

```typescript
// === BƯỚC BÙ THỜI GIAN CHO TRANSITIONS ===

const transitionDuration = 0.5; // giây mỗi transition
const numTransitions = scenes.length - 1; // N-1 transitions cho N segments
const totalTransitionTime = numTransitions * transitionDuration;

// Tổng video SAU transition = sum(segments) - totalTransitionTime
// Muốn tổng video = actualAudioDuration
// → sum(segments) = actualAudioDuration + totalTransitionTime

const compensatedTotal = actualAudioDuration + totalTransitionTime;
const durationScale = compensatedTotal / totalEstimated;

// Giờ mỗi segment sẽ dài hơn 1 chút
// Sau khi xfade "ăn" thời gian → tổng = actualAudioDuration ✅

for (const scene of scenes) {
    adjustedDurations[scene.sceneNumber] = parseFloat(
        ((scene.durationSeconds || 5) * durationScale).toFixed(3)
    );
}
```

#### Ví dụ cụ thể:
```
Audio thực: 300 giây
AI estimate: 290 giây (10 scenes)
Transition: 0.5s × 9 = 4.5 giây

KHÔNG BÙ: scale = 300/290 = 1.0345
  → Tổng segments = 300s → Sau xfade = 300 - 4.5 = 295.5s ❌

CÓ BÙ: scale = (300 + 4.5)/290 = 1.0500
  → Tổng segments = 304.5s → Sau xfade = 304.5 - 4.5 = 300s ✅
```

#### Các transition type đề xuất:

| Type | Mô tả | `xfade` param | Duration đề xuất |
|------|--------|---------------|-------------------|
| `fade` | Mờ dần A → hiện dần B | `transition=fade` | 0.5s |
| `fadeblack` | A → đen → B | `transition=fadeblack` | 0.5s |
| `dissolve` | Hòa trộn pixel A+B | `transition=dissolve` | 0.5s |
| `wipeleft` | B quét từ phải sang trái | `transition=wipeleft` | 0.5s |
| `slideright` | B trượt vào từ phải | `transition=slideright` | 0.5s |
| `circleopen` | Mở vòng tròn từ tâm | `transition=circleopen` | 0.5s |
| `smoothleft` | Trượt mượt sang trái | `transition=smoothleft` | 0.5s |

#### Cách implement xfade chain cho nhiều segments:

**Giải pháp đã triển khai (Single-pass filter_complex_script):**
Thay vì ghép tuần tự từng cặp (rất chậm và tạo nhiều file tạm), hoặc dùng command line dài (dễ bị tràn giới hạn 8191 ký tự trên Windows), chúng ta xuất bộ filter complex ra tệp tạm `xfade_filter.txt` rồi gọi FFmpeg qua tham số `-filter_complex_script`.

```typescript
const TRANSITION_TYPES = ['fade', 'fadeblack', 'dissolve', 'wipeleft', 'slideright', 'smoothleft', 'circleopen', 'smoothright'];

async function applyTransitions(
    workspaceDir: string,
    scenes: Array<{ sceneNumber: number; durationSeconds: number }>,
    adjustedDurations: Record<number, number>,
    transitionType: string,
    transitionDuration: number
): Promise<string> {
    if (scenes.length <= 1) {
        return `segment_${scenes[0].sceneNumber}.mp4`;
    }

    const outputFile = 'transitioned.mp4';

    // Xây dựng danh sách input: -i segment_1.mp4 -i segment_2.mp4 ...
    const inputArgs = scenes
        .map(s => `-i "segment_${s.sceneNumber}.mp4"`)
        .join(' ');

    // Tạo chuỗi filter xfade liên hoàn (xfade chain)
    const filterParts: string[] = [];
    let cumulativeDuration = adjustedDurations[scenes[0].sceneNumber];

    for (let i = 1; i < scenes.length; i++) {
        const prevLabel = i === 1 ? '[0:v]' : `[v${i - 1}]`;
        const nextLabel = `[${i}:v]`;
        const outLabel = i === scenes.length - 1 ? '[vout]' : `[v${i}]`;

        // Hỗ trợ chọn ngẫu nhiên transition nếu truyền vào 'random'
        const actualTransType = transitionType === 'random'
            ? TRANSITION_TYPES[Math.floor(Math.random() * TRANSITION_TYPES.length)]
            : transitionType;

        // Điểm bắt đầu hiệu ứng chuyển cảnh
        const offset = Math.max(0, cumulativeDuration - transitionDuration);

        filterParts.push(
            `${prevLabel}${nextLabel}xfade=transition=${actualTransType}:duration=${transitionDuration}:offset=${offset.toFixed(3)}${outLabel}`
        );

        // Sau khi overlap, thời lượng tích lũy mới = offset + thời lượng segment tiếp theo
        cumulativeDuration = offset + adjustedDurations[scenes[i].sceneNumber];
    }

    const filterComplex = filterParts.join(';');

    // Ghi filter complex vào file để tránh lỗi giới hạn độ dài command line trên Windows
    const filterScriptPath = join(workspaceDir, 'xfade_filter.txt');
    await writeFile(filterScriptPath, filterComplex, 'utf8');

    console.log(`Transitions: Applying ${scenes.length - 1} xfade transitions (expected output: ${cumulativeDuration.toFixed(3)}s)`);

    const cmd = `ffmpeg -y ${inputArgs} -filter_complex_script "xfade_filter.txt" -map "[vout]" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -r 25 -vsync cfr "${outputFile}"`;

    await runCommand(cmd, workspaceDir);
    return outputFile;
}
```

#### Chiến lược chọn transition theo context:

```typescript
function pickTransition(
  currentScene: Scene,
  nextScene: Scene
): { type: string; duration: number } {
  // Cùng parentSceneNumber → cùng scene gốc → transition nhẹ
  if (currentScene.parentSceneNumber === nextScene.parentSceneNumber) {
    return { type: 'dissolve', duration: 0.3 };
  }
  // Scene đầu tiên → fade from black
  if (currentScene.sceneNumber === 1) {
    return { type: 'fadeblack', duration: 0.8 };
  }
  // Khác scene → transition rõ hơn
  return { type: 'fade', duration: 0.5 };
}
```

---

### 3. 🎨 COLOR GRADING

**Ưu tiên: ⭐⭐⭐⭐ | Độ khó: ⭐ | Sync: ✅ AN TOÀN**

#### Tại sao AN TOÀN:
```
eq/colorbalance chỉ thay đổi giá trị pixel (brightness, saturation, hue)
→ Không thêm/bớt frame → Duration giữ nguyên 100%
```

#### Các preset:

| Preset | FFmpeg Filter | Phù hợp |
|--------|---------------|---------|
| `cinematic_warm` | `eq=brightness=0.03:saturation=1.2,colorbalance=rs=0.1:gs=0.05:bs=-0.1` | Giáo dục, lifestyle |
| `cinematic_cool` | `eq=saturation=0.9,colorbalance=rs=-0.1:gs=0:bs=0.15` | Khoa học, y tế |
| `high_contrast` | `eq=contrast=1.3:brightness=0.02:saturation=1.1` | Drama, story |
| `muted` | `eq=saturation=0.7:brightness=0.05` | Calm, meditation |
| `dark_moody` | `eq=brightness=-0.05:contrast=1.2:saturation=0.8` | Horror, mystery |
| `vibrant` | `eq=saturation=1.4:contrast=1.1:brightness=0.02` | Trẻ em, vui nhộn |
| `none` | (không thêm filter) | Giữ nguyên |

#### Cách thêm vào filter chain hiện tại:

```bash
# HIỆN TẠI:
-vf "scale=1920:1080:...,setsar=1,format=yuv420p"

# THÊM COLOR GRADING (chèn TRƯỚC format=yuv420p):
-vf "scale=1920:1080:...,setsar=1,eq=brightness=0.03:saturation=1.2,colorbalance=rs=0.1:gs=0.05:bs=-0.1,format=yuv420p"

# KẾT HỢP VỚI KEN BURNS:
-vf "scale=8000:-1,zoompan=...,setsar=1,eq=brightness=0.03:saturation=1.2,format=yuv420p"
```

#### Code TypeScript:
```typescript
function getColorGradeFilter(preset: string): string {
  const presets: Record<string, string> = {
    cinematic_warm: 'eq=brightness=0.03:saturation=1.2,colorbalance=rs=0.1:gs=0.05:bs=-0.1',
    cinematic_cool: 'eq=saturation=0.9,colorbalance=rs=-0.1:gs=0:bs=0.15',
    high_contrast: 'eq=contrast=1.3:brightness=0.02:saturation=1.1',
    muted: 'eq=saturation=0.7:brightness=0.05',
    dark_moody: 'eq=brightness=-0.05:contrast=1.2:saturation=0.8',
    vibrant: 'eq=saturation=1.4:contrast=1.1:brightness=0.02',
  };
  return presets[preset] || '';
}
```

---

### 4. 📝 TEXT OVERLAY (Scene Title + Keywords)

**Ưu tiên: ⭐⭐⭐⭐ | Độ khó: ⭐⭐ | Sync: ✅ AN TOÀN**

#### Tại sao AN TOÀN:
```
drawtext chỉ vẽ text lên frame đã có → không thêm/bớt frame
enable='between(t,0.5,2.5)' chỉ kiểm soát khi nào text hiện → không đổi duration
```

#### Các loại text overlay:

**A. Scene Title (hiện 2 giây đầu mỗi scene)**
```bash
-vf "...,drawtext=fontfile='C\\:/Windows/Fonts/arialbd.ttf':text='Virus xâm nhập cơ thể':
  fontsize=42:fontcolor=white:borderw=3:bordercolor=black:
  x=(w-text_w)/2:y=h*0.08:
  enable='between(t,0.3,2.5)':
  alpha='if(lt(t,0.8),(t-0.3)/0.5,if(gt(t,2.0),(2.5-t)/0.5,1))'"
```

**B. Keyword highlight box**
```bash
-vf "...,drawbox=x=(w-400)/2:y=h*0.85:w=400:h=55:color=0xFFD700@0.75:t=fill:
  enable='between(t,1,3.5)',
  drawtext=text='100%% tử vong':fontsize=32:fontcolor=black:
  fontfile='C\\:/Windows/Fonts/arialbd.ttf':
  x=(w-text_w)/2:y=h*0.86+5:enable='between(t,1,3.5)'"
```

**C. Chapter marker (giữa màn hình, chuyển phần lớn)**
```bash
-vf "...,drawtext=text='PHẦN 2\\: TRIỆU CHỨNG':fontsize=56:fontcolor=white:
  fontfile='C\\:/Windows/Fonts/arialbd.ttf':
  borderw=4:bordercolor=black:
  x=(w-text_w)/2:y=(h-text_h)/2:
  enable='between(t,0,2)':
  alpha='if(lt(t,0.5),t/0.5,if(gt(t,1.5),(2-t)/0.5,1))'"
```

#### Lưu ý Windows font path:
```typescript
// Windows: phải escape backslash + colon
const fontPath = "C\\\\:/Windows/Fonts/arialbd.ttf";
// Hoặc dùng forward slash:
const fontPath = "C\\:/Windows/Fonts/arialbd.ttf";
```

#### Nguồn text:
- `sceneName` → trích tiêu đề tiếng Việt làm scene title
- AI có thể sinh keyword list kèm theo timestamp

---

### 5. 🎵 BACKGROUND MUSIC

**Ưu tiên: ⭐⭐⭐⭐ | Độ khó: ⭐⭐ | Sync: ✅ AN TOÀN**

#### Tại sao AN TOÀN:
```
BGM được mix ở bước CUỐI CÙNG (Final merge)
→ Chỉ thêm audio track, KHÔNG ảnh hưởng video timeline
→ -shortest vẫn cắt theo audio ngắn hơn
```

#### Cách implement (thay đổi bước Final merge):

```bash
# HIỆN TẠI (chỉ TTS audio):
ffmpeg -y -i "concatenated.mp4" -i "audio.mp3" \
  -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 128k -shortest "final_video.mp4"

# SAU KHI THÊM BGM:
ffmpeg -y -i "concatenated.mp4" -i "audio.mp3" -i "bgm.mp3" \
  -filter_complex "
    [1:a]volume=1.0[voice];
    [2:a]volume=0.10,afade=t=in:st=0:d=3,afade=t=out:st=AUDIO_DUR_MINUS_3:d=3[bgm];
    [voice][bgm]amix=inputs=2:duration=first:dropout_transition=3[aout]
  " \
  -map 0:v:0 -map "[aout]" \
  -c:v copy -c:a aac -b:a 192k -shortest "final_video.mp4"
```

#### Giải thích params:
| Param | Giá trị | Ý nghĩa |
|-------|---------|---------|
| `volume=0.10` | 10% volume gốc | BGM rất nhỏ, không lấn voice |
| `afade=t=in:d=3` | Fade in 3 giây | BGM tăng dần đầu video |
| `afade=t=out:d=3` | Fade out 3 giây cuối | BGM giảm dần cuối video |
| `amix=duration=first` | Theo audio 1 (voice) | BGM tự cắt khi voice hết |
| `dropout_transition=3` | 3 giây | Smooth khi 1 source hết |

#### Tổ chức thư mục BGM:
```
public/assets/bgm/
  ├── educational_calm.mp3
  ├── suspense_dark.mp3
  ├── happy_upbeat.mp3
  ├── cinematic_epic.mp3
  ├── medical_serious.mp3
  └── nature_ambient.mp3
```

#### Code TypeScript:
```typescript
function buildBgmFilter(bgmPath: string, voiceDuration: number, bgmVolume: number = 0.10): string {
  const fadeOutStart = Math.max(0, voiceDuration - 3);
  return `[1:a]volume=1.0[voice];` +
    `[2:a]volume=${bgmVolume},afade=t=in:st=0:d=3,afade=t=out:st=${fadeOutStart}:d=3[bgm];` +
    `[voice][bgm]amix=inputs=2:duration=first:dropout_transition=3[aout]`;
}
```

---

### 6. 🖼️ INTRO & OUTRO

**Ưu tiên: ⭐⭐⭐ | Độ khó: ⭐⭐ | Sync: ⚠️ CẦN XỬ LÝ**

#### Vấn đề sync:
```
Intro (4s) + Main video (300s) + Outro (5s) = 309s
Audio TTS chỉ cover 300s phần main
→ Intro/Outro KHÔNG CÓ voice → phải xử lý riêng
```

#### GIẢI PHÁP: Tách pipeline thành 3 phần

```
BƯỚC 1: Render main video (300s) sync với audio như bình thường ✅
BƯỚC 2: Tạo intro segment riêng (4s, silent hoặc nhạc intro)
BƯỚC 3: Tạo outro segment riêng (5s, silent hoặc nhạc outro)
BƯỚC 4: Concat: intro + main_with_audio + outro
```

**Giải pháp đã triển khai (Tạo intro/outro kèm âm thanh tĩnh và textfile để tránh lỗi escape trên Windows):**

Chúng ta xuất tiêu đề/nội dung intro/outro ra các tệp văn bản `.txt` riêng biệt (ví dụ: `intro_title.txt`) và gọi tham số `textfile=` trong filter `drawtext` của FFmpeg. Điều này giúp giải quyết triệt để lỗi phân tích cú pháp ký tự tiếng Việt đặc biệt trên Windows Command Prompt / PowerShell. Đồng thời, âm thanh tĩnh `anullsrc` được trộn trực tiếp cùng luồng video trong một câu lệnh duy nhất để tạo file `.mp4` có sẵn audio track, tránh lỗi concat về sau.

```typescript
// Trong API POST route:
if (showIntro || showOutro) {
    await updateStatus(97, "Đang tạo intro/outro...");
    const finalConcatLines: string[] = [];

    // 1. Khởi tạo Intro (4 giây)
    if (showIntro && introTitle.trim()) {
        // Ghi tiêu đề vào file để tránh lỗi escaping tiếng Việt trên Windows
        await writeFile(join(workspaceDir, 'intro_title.txt'), introTitle.trim(), 'utf8');

        let introVf = `drawtext=fontfile=C\\:/Windows/Fonts/arialbd.ttf:textfile=intro_title.txt:fontsize=52:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2`;

        if (introSubtitle.trim()) {
            await writeFile(join(workspaceDir, 'intro_subtitle.txt'), introSubtitle.trim(), 'utf8');
            introVf += `,drawtext=fontfile=C\\:/Windows/Fonts/arial.ttf:textfile=intro_subtitle.txt:fontsize=24:fontcolor=0xaaaaaa:x=(w-text_w)/2:y=h*0.65`;
        }

        // Hiệu ứng fade in 1.5s ở đầu, fade out 1s ở cuối video intro
        introVf += `,fade=t=in:st=0:d=1.5,fade=t=out:st=3:d=1`;

        // Tạo video intro kèm âm thanh tĩnh (silent audio track) trực tiếp bằng -shortest
        const introCmd = `ffmpeg -y -f lavfi -i "color=c=0x1a1a2e:s=1920x1080:r=25:d=4" -f lavfi -i "anullsrc=r=44100:cl=stereo" -vf "${introVf}" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k -shortest "intro.mp4"`;
        await runCommand(introCmd, workspaceDir);
        finalConcatLines.push("file 'intro.mp4'");
    }

    // Nối Video chính (đã qua xử lý sync audio hoàn chỉnh)
    finalConcatLines.push(`file '${finalVideoName}'`);

    // 2. Khởi tạo Outro (5 giây)
    if (showOutro && outroText.trim()) {
        await writeFile(join(workspaceDir, 'outro_text.txt'), outroText.trim(), 'utf8');

        const outroVf = `drawtext=fontfile=C\\:/Windows/Fonts/arialbd.ttf:textfile=outro_text.txt:fontsize=48:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2,fade=t=in:st=0:d=1,fade=t=out:st=4:d=1`;

        const outroCmd = `ffmpeg -y -f lavfi -i "color=c=0x1a1a2e:s=1920x1080:r=25:d=5" -f lavfi -i "anullsrc=r=44100:cl=stereo" -vf "${outroVf}" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k -shortest "outro.mp4"`;
        await runCommand(outroCmd, workspaceDir);
        finalConcatLines.push("file 'outro.mp4'");
    }

    // 3. Concat tất cả intro + main + outro bằng demuxer (-c copy) không re-encode
    if (finalConcatLines.length > 1) {
        outputVideoName = 'complete_video.mp4';
        const finalListPath = join(workspaceDir, 'filelist_final.txt');
        await writeFile(finalListPath, finalConcatLines.join('\n'), 'utf8');

        const finalConcatCmd = `ffmpeg -y -f concat -safe 0 -i filelist_final.txt -c copy "${outputVideoName}"`;
        await runCommand(finalConcatCmd, workspaceDir);
    }
}
```

#### Tại sao giải pháp này AN TOÀN:
```
1. Main video sync audio như bình thường (không đổi gì)
2. Intro/Outro là segment RIÊNG BIỆT, nằm NGOÀI audio timeline
3. Concat -c copy chỉ nối file, không re-encode → không drift
4. Kết quả: [intro:yên lặng/nhạc] + [main:voice+bgm] + [outro:yên lặng/nhạc]
```

---

### 7. 📊 PROGRESS BAR

**Ưu tiên: ⭐⭐⭐ | Độ khó: ⭐ | Sync: ✅ AN TOÀN**

#### Tại sao AN TOÀN:
```
drawbox với enable/width dựa trên t (time) → chỉ vẽ overlay
→ Không thay đổi frame count hay duration
```

#### Implement:

```bash
# Thanh progress vàng ở dưới cùng (6px height)
-vf "...,drawbox=x=0:y=ih-6:w='iw*t/TOTAL_DUR':h=6:color=0xFFD700@0.85:t=fill"

# Thanh progress gradient (từ đỏ → xanh)
-vf "...,drawbox=x=0:y=ih-6:w='iw*t/TOTAL_DUR':h=6:color=0x00FF00@0.85:t=fill"
```

> **Lưu ý:** Progress bar chỉ chính xác khi áp dụng ở bước **Final merge** (biết TOTAL_DUR).
> Nếu áp dụng per-segment, mỗi segment sẽ có progress bar riêng (0-100% trong segment đó).
> → Nên áp dụng ở bước cuối với TOTAL_DUR = actualAudioDuration.

---

### 8. 🔤 SUBTITLE STYLING NÂNG CẤP

**Ưu tiên: ⭐⭐⭐ | Độ khó: ⭐ | Sync: ✅ AN TOÀN**

#### Tại sao AN TOÀN:
```
force_style chỉ thay đổi hiển thị text (font, size, color, position)
→ Timestamp trong SRT vẫn giữ nguyên → sync không đổi
```

#### Các style đề xuất:

```bash
# HIỆN TẠI:
force_style='FontSize=16,Alignment=2,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2'

# STYLE 1: Modern White (viền đen dày, dễ đọc)
force_style='FontName=Arial,FontSize=22,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=1,ShadowColour=&H80000000,MarginV=35,Spacing=1'

# STYLE 2: Box Background (nền đen mờ)
force_style='FontName=Arial,FontSize=20,Bold=1,PrimaryColour=&H00FFFFFF,BackColour=&H80000000,BorderStyle=4,Outline=0,Shadow=0,MarginV=30,Spacing=1'

# STYLE 3: Cinematic (viền vàng nhạt)
force_style='FontName=Arial,FontSize=24,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00203040,BorderStyle=1,Outline=2,Shadow=2,ShadowColour=&H40000000,MarginV=40'

# STYLE 4: Centered Big (cho short-form, tiktok)
force_style='FontName=Arial,FontSize=36,Bold=1,PrimaryColour=&H0000FFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Alignment=5,MarginV=0'
```

---

### 9. 🌟 VISUAL EFFECTS (Vignette + Film Grain)

**Ưu tiên: ⭐⭐ | Độ khó: ⭐ | Sync: ✅ AN TOÀN**

#### Tại sao AN TOÀN:
```
vignette và noise chỉ thay đổi giá trị pixel → không ảnh hưởng duration
```

#### Implement:

```bash
# Vignette (tối góc, tạo chiều sâu cinematic)
-vf "...,vignette=PI/5"

# Film grain nhẹ (texture cinematic, subtle)
-vf "...,noise=c0s=5:c0f=t+u"

# Kết hợp cả hai:
-vf "...,vignette=PI/5,noise=c0s=4:c0f=t+u"
```

| Effect | Filter | Mức độ | Render time tăng |
|--------|--------|--------|-----------------|
| Vignette nhẹ | `vignette=PI/4` | Subtle | +2% |
| Vignette mạnh | `vignette=PI/6` | Rõ rệt | +2% |
| Film grain nhẹ | `noise=c0s=4:c0f=t+u` | Subtle | +5% |
| Film grain mạnh | `noise=c0s=10:c0f=t+u` | Rõ rệt | +5% |

---

### 10. 🖥️ PICTURE-IN-PICTURE / SPLIT SCREEN

**Ưu tiên: ⭐⭐ | Độ khó: ⭐⭐⭐ | Sync: ✅ AN TOÀN**

#### Tại sao AN TOÀN:
```
overlay/hstack chỉ kết hợp 2 video stream thành 1 → duration = shortest input
Khi cả 2 input cùng duration → output giữ nguyên duration
```

#### Implement:
```bash
# PiP góc phải dưới
ffmpeg -y -i "main.mp4" -i "pip_image.png" \
  -filter_complex "[1:v]scale=320:180[pip];[0:v][pip]overlay=W-w-20:H-h-20" \
  -c:v libx264 -preset fast -crf 23 "output.mp4"

# Split screen (so sánh trái/phải)
ffmpeg -y -i "left.mp4" -i "right.mp4" \
  -filter_complex "[0:v]scale=960:1080[left];[1:v]scale=960:1080[right];[left][right]hstack" \
  -c:v libx264 -preset fast -crf 23 "output.mp4"
```

> **Lưu ý:** Tính năng này nâng cao, cần UI cho user chỉ định scene nào dùng PiP.
> Ưu tiên thấp, implement sau các tính năng core.

---

## 🛠️ PIPELINE MỚI SAU NÂNG CẤP

```
[Input: scenes + images + audio + SRT + renderOptions]
         │
         ▼
 [1. Parse renderOptions]
         │
         ▼
 [2. ffprobe audio → actualAudioDuration]
         │
         ▼
 [3. Tính durationScale]
    ├─ Nếu CÓ transition: scale = (actualAudio + totalTransitionTime) / totalEstimated
    └─ Nếu KHÔNG transition: scale = actualAudio / totalEstimated (giữ nguyên)
         │
         ▼
 [4. Per-scene encode (song song hoặc tuần tự)]
    ├─ Ken Burns filter (nếu bật)        ← ✅ AN TOÀN
    ├─ Color Grading filter (nếu bật)    ← ✅ AN TOÀN
    ├─ Text Overlay filter (nếu bật)     ← ✅ AN TOÀN
    ├─ Vignette/Grain filter (nếu bật)   ← ✅ AN TOÀN
    └─ Duration: -t adjustedDuration (đã bù transition nếu cần)
         │
         ▼  segment_1.mp4 … segment_N.mp4
 [5. Nhánh theo transition option]
    ├─ CÓ transition → xfade chain → transitioned.mp4 (duration = actualAudio ✅)
    └─ KHÔNG transition → concat -c copy → concatenated.mp4 (giữ nguyên)
         │
         ▼
 [6. Final merge: video + TTS audio (+ BGM nếu có) + subtitles]
    ├─ Subtitle style nâng cấp (nếu bật)  ← ✅ AN TOÀN
    ├─ BGM mixing (nếu có)                ← ✅ AN TOÀN
    ├─ Progress bar (nếu bật)             ← ✅ AN TOÀN
    └─ -shortest (safety net)
         │
         ▼  final_video.mp4 (sync audio ✅)
 [7. Intro/Outro (nếu bật)]
    ├─ Tạo intro segment (silent audio)
    ├─ Tạo outro segment (silent audio)
    └─ Concat: intro + final_video + outro → complete_video.mp4
         │
         ▼
 [✅ Output: complete_video.mp4 — chuyên nghiệp, KHÔNG LỆCH SYNC]
```

---

## 📋 INTERFACE RENDER OPTIONS

```typescript
interface VideoRenderOptions {
  // Ken Burns — ✅ AN TOÀN
  kenBurns: 'none' | 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right' | 'random';

  // Transitions — ⚠️ CẦN BÙ DURATION
  transition: 'none' | 'fade' | 'fadeblack' | 'dissolve' | 'wipeleft' | 'slideright' | 'random';
  transitionDuration: number; // 0.3 - 1.0 giây (mặc định 0.5)

  // Color Grading — ✅ AN TOÀN
  colorPreset: 'none' | 'cinematic_warm' | 'cinematic_cool' | 'high_contrast' | 'muted' | 'dark_moody' | 'vibrant';

  // Text Overlay — ✅ AN TOÀN
  showSceneTitle: boolean;   // Hiện tiêu đề scene

  // Background Music — ✅ AN TOÀN
  bgmPath: string | null;    // Đường dẫn file nhạc nền
  bgmVolume: number;         // 0.05 - 0.20 (mặc định 0.10)

  // Intro/Outro — ⚠️ TÁCH RIÊNG
  showIntro: boolean;
  introTitle: string;
  introSubtitle: string;
  showOutro: boolean;
  outroText: string;

  // Visual Effects — ✅ AN TOÀN
  vignette: boolean;
  filmGrain: boolean;

  // Subtitle Style — ✅ AN TOÀN
  subtitleStyle: 'default' | 'modern' | 'box' | 'cinematic' | 'centered_big';

  // Progress Bar — ✅ AN TOÀN
  showProgressBar: boolean;

  // Quality
  quality: 'fast' | 'balanced' | 'high'; // preset: ultrafast / fast / slow
}
```

---

## 📅 LỘ TRÌNH IMPLEMENT

### Phase 1 — Core (Impact lớn nhất, an toàn nhất)
- [x] Ken Burns Effect ← ✅ AN TOÀN, hiệu quả nhất
- [x] Color Grading presets ← ✅ AN TOÀN, dễ nhất
- [x] Subtitle styling nâng cấp ← ✅ AN TOÀN, thay 1 dòng

### Phase 2 — Enhancement
- [x] Background Music mixing ← ✅ AN TOÀN
- [x] Text Overlay (scene title) ← ✅ AN TOÀN
- [x] Vignette + Film grain ← ✅ AN TOÀN

### Phase 3 — Advanced (cần cẩn thận hơn)
- [x] Transitions (xfade) ← ⚠️ Cần bù duration
- [x] Intro/Outro ← ⚠️ Tách pipeline
- [x] Progress bar ← ✅ AN TOÀN

---

## 🔑 TÓM TẮT ĐẢM BẢO SYNC

| Tính năng | Sync | Giải pháp |
|-----------|------|-----------|
| Ken Burns | ✅ | Không cần xử lý |
| Color Grading | ✅ | Không cần xử lý |
| Text Overlay | ✅ | Không cần xử lý |
| Subtitle Style | ✅ | Không cần xử lý |
| BGM | ✅ | `amix=duration=first` + `-shortest` |
| Vignette/Grain | ✅ | Không cần xử lý |
| Progress Bar | ✅ | Không cần xử lý |
| **Transitions** | ⚠️ | **scale = (audio + totalTransitionTime) / estimated** |
| **Intro/Outro** | ⚠️ | **Tách riêng, concat SAU khi main đã sync** |

> **Kết luận:** 7/9 tính năng hoàn toàn an toàn. 2 tính năng còn lại có giải pháp rõ ràng
> để đảm bảo video KHÔNG BAO GIỜ bị lệch audio.
