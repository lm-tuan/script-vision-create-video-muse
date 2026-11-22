# ✅ [ĐÃ TRIỂN KHAI XONG] Phân tích & Cải tiến: Xử lý Khoảng Lặng (Silence Gap)

> **Ngày triển khai**: 2026-09-07
> **Trạng thái**: ✅ Hoàn thành — đã merge vào codebase

---

## 1. Bối cảnh & Dữ liệu Evidence

Dữ liệu từ `docs/evidence/1. なぜ社会は、誰も望んでいない方向へ進むのか`:

| Thông số | Giá trị |
|---|---|
| Tổng ảnh | 197 ảnh (từ 101 scenes) |
| Tổng subtitle entries (SRT) | 396 entries |
| Audio duration (mp3) | 1414.43s |
| SRT duration (timestamp cuối) | 1414.36s |
| Tổng thời lượng ảnh (sum scene durations) | 1409.07s |
| **Chênh lệch (Audio - Ảnh)** | **5.35s** |

## 2. Phân tích Nguyên nhân Gốc

### 2.1 Khoảng lặng giữa các Scene (Root Cause chính)

Script phân tích phát hiện **22 khoảng lặng (gaps)** giữa các scene liên tiếp, tổng cộng **5.165s**:

| Vị trí | Gap (s) | Vị trí | Gap (s) |
|---|---|---|---|
| Scene 4 → 5 | 0.238 | Scene 45 → 46 | 0.215 |
| Scene 8 → 9 | 0.265 | Scene 51 → 52 | 0.080 |
| Scene 10 → 11 | 0.172 | Scene 55 → 56 | 0.326 |
| Scene 13 → 14 | 0.280 | Scene 58 → 59 | 0.240 |
| Scene 17 → 18 | 0.150 | Scene 62 → 63 | 0.220 |
| Scene 20 → 21 | 0.223 | Scene 67 → 68 | 0.279 |
| Scene 25 → 26 | 0.299 | Scene 72 → 73 | 0.080 |
| Scene 28 → 29 | 0.230 | Scene 77 → 78 | 0.254 |
| Scene 34 → 35 | 0.309 | Scene 81 → 82 | 0.290 |
| Scene 37 → 38 | 0.273 | Scene 84 → 85 | 0.259 |
| Scene 88 → 89 | 0.240 | Scene 98 → 99 | 0.243 |

> Khoảng lặng trung bình: ~235ms/gap. Đây là **khoảng lặng tự nhiên** giữa các câu/đoạn phụ đề — hoàn toàn bình thường trong TTS.

### 2.2 Phân tích chi tiết

```
Sum of scene durations (ảnh):     1409.074s
Total scene gap time:                5.165s
Scene time + gaps:                1414.239s
SRT last timestamp end:           1414.360s
Audio actual duration (mp3):      1414.430s

→ Audio - (Scenes + Gaps) = 1414.43 - 1414.239 = 0.191s (trailing silence cuối audio)
→ Audio - SRT = 1414.43 - 1414.36 = 0.07s (audio buffer cuối)
```

### 2.3 Kết luận

> **5.35s lệch là 100% do khoảng lặng tự nhiên** — KHÔNG phải bug.
> - 5.165s từ 22 khoảng lặng giữa scenes (96.5%)
> - 0.191s từ trailing silence cuối audio (3.5%)

## 3. Đánh giá Cách Xử lý Hiện tại

| Module | Trạng thái | Ghi chú |
|---|---|---|
| TimelineBuilder | ✅ Đúng | Tự động kéo dài scene trước để lấp gap; Lock scene cuối vào audioDurationMs |
| TimelineValidator | ✅ Đúng | Kiểm tra contiguity, frame-level accuracy |
| Video.ts (Render) | ✅ Đúng | Frame-based rendering, `-shortest` flag |
| Pre-render Check (VideoComposer) | ⚠️ Đã cải tiến | Thông báo cũ gây hiểu nhầm → đã nâng cấp |

## 4. Các Cải tiến Đã Triển khai

### ✅ 4.1 — Nâng cấp Pre-render Sync Check (VideoComposer.tsx)

**File**: `components/pipeline/VideoComposer.tsx`

Cải tiến `handleSyncCheck`:
- Phân tích khoảng lặng chi tiết từ timeRange data
- Tính số gap, tổng gap time, gap trung bình, gap lớn nhất
- Phân loại: nếu gaps giải thích >80% diff → ✅ ok (thay vì ⚠️ warn)
- Hiển thị breakdown: % do khoảng lặng vs % do trailing audio

**Trước:**
```
⏱️ Chênh lệch: 5.35s — do khoảng lặng tự nhiên
📊 Audio dài hơn ảnh 5.35s → ✅ Đã xử lý tự động
```

**Sau:**
```
🔇 Khoảng lặng tự nhiên: 22 gaps, tổng 5.17s (TB: 235ms | Max: 326ms tại Scene 55 → 56)
⏱️ Chênh lệch nguyên liệu: 5.35s
   ├─ 🔇 Khoảng lặng tự nhiên (22 gaps): 5.17s (96%)
   ├─ 🎵 Audio buffer/trailing: 0.19s (4%)
   └─ ✅ Toàn bộ sẽ được bù tự động bởi TimelineBuilder
🎬 Sau khi dựng: Timeline sẽ contiguous — scene trước mỗi gap tự động kéo dài, scene cuối lock vào audio duration
→ Status: ✅ Chấp nhận được — lệch 5.35s, 100% do 22 khoảng lặng tự nhiên giữa câu phụ đề
```

---

### ✅ 4.2 — Thêm Silence Gap Analysis vào TimelineBuilder

**File**: `core/timeline/TimelineBuilder.ts`

- Track gaps > 10ms trong `buildFromSrt()` với `detectedGaps[]`
- Ghi nhận `afterSceneId`, `beforeSceneId`, `gapMs`, `absorbedBySceneId`
- Build `SilenceAnalysis` summary (totalGapMs, gapCount, averageGapMs, maxGapMs, maxGapLocation)
- Attach vào manifest trước khi return

---

### ✅ 4.3 — Thêm Types vào TimelineManifest

**File**: `core/timeline/TimelineManifest.ts`

```typescript
export interface SilenceGap {
    afterSceneId: number;
    beforeSceneId: number;
    gapMs: number;
    absorbedBySceneId: number;
}

export interface SilenceAnalysis {
    totalGapMs: number;
    gapCount: number;
    averageGapMs: number;
    maxGapMs: number;
    maxGapLocation: string;
    gaps: SilenceGap[];
}

// Thêm vào TimelineManifest:
silenceAnalysis?: SilenceAnalysis;
```

---

### ✅ 4.4 — Cải tiến thông báo (đã gộp vào 4.1)

Thông báo mới thông minh hơn, phân biệt rõ:
- Khoảng lặng tự nhiên (bình thường) vs chênh lệch thật sự (cần kiểm tra)
- Status tự động điều chỉnh dựa trên % gap giải thích diff

## 5. Verification

| Kiểm tra | Kết quả |
|---|---|
| TypeScript compilation (`tsc --noEmit`) | ✅ Zero errors |
| Backward compatibility | ✅ `silenceAnalysis` là optional field |
| TimelineValidator | ✅ Không bị ảnh hưởng |
| Video rendering pipeline | ✅ Không thay đổi logic render |
