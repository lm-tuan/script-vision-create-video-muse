# Hướng dẫn cài đặt và chạy AI Video Content Pipeline

## Yêu cầu

- Node.js 18+ 
- npm hoặc yarn
- Grok API Key (từ platform.grok.com)
- **Lưu ý quan trọng khi dùng custom proxy**: endpoint phải hỗ trợ timeout >120s cho video dài 10-15 phút.

## Các bước cài đặt

### 1. Clone hoặc copy project

```bash
# Nếu clone từ git
git clone <repository-url>
cd ScriptVision

# Hoặc nếu đã copy files vào thư mục
cd e:\IMAGE\YOUTUBE\TOOL\ScriptVision
```

### 2. Cài đặt dependencies

```bash
npm install
```

Hoặc nếu dùng yarn:

```bash
yarn install
```

### 3. Cấu hình Environment Variables

Tạo file `.env.local` từ file `.env.local.example`:

```bash
# Windows
copy .env.local.example .env.local

# Mac/Linux
cp .env.local.example .env.local
```

Mở file `.env.local` và thêm Grok API Key của bạn:

```env
GROK_API_KEY=your_actual_api_key_here
GROK_MODEL=grok-4.5
```

Nếu bạn dùng proxy/custom endpoint (Anthropic-compatible):

```env
GROK_API_BASE_URL=https://api.grok.com/v1
```

Ví dụ dùng endpoint custom Anthropic-compatible:

```env
GROK_API_KEY=your_proxy_api_key_here
GROK_API_BASE_URL=https://api.vietapi.tech
GROK_MODEL=grok-4.5
```

### 4. Chạy Development Server

```bash
npm run dev
```

Hoặc:

```bash
yarn dev
```

Mở browser và truy cập: [http://localhost:3000](http://localhost:3000)

## Xử lý lỗi 524 - Cloudflare Timeout

**Nguyên nhân:** Endpoint Cloudflare của bạn có giới hạn 120 giây (`Proxy Read Timeout`). Khi tạo video dài 10-15 phút, AI cần thời gian dài hơn để sinh kịch bản và chia scenes, dẫn đến timeout.

**Cách khắc phục:**

1. **Tăng timeout ở Cloudflare** (nếu bạn là chủ sở hữu proxy):
   - vào dashboard Cloudflare
   - cài đặt `Proxy Read Timeout` lên 300s hoặc tắt giới hạn

2. **Giảm độ dài nội dung input**:
   - nhập ngắn hơn sẽ giảm thời gian xử lý

3. **Dùng Grok trực tiếp** thay vì proxy:
   ```env
   GROK_API_KEY=your_direct_grok_key
   GROK_API_BASE_URL=https://api.grok.com/v1
   ```

4. **Chạy pipeline từng bước** thay vì "Tạo toàn bộ" để tránh một request quá dài:
   - Tạo Transcript
   - Đợi hoàn thành
   - Tạo Duration
   - Đợi hoàn thành
   - Tạo Prompt

## Cách sử dụng

### Tab 1: Content
1. Nhập nội dung bài viết vào textarea
2. Hoặc upload file `.txt` bằng nút "Upload File"
3. Click "Tạo Transcript" để chuyển đổi nội dung thành transcript

### Tab 2: Transcript
- Xem transcript đã được chuẩn hóa
- Click "Download" để tải file `transcript.txt`
- Click "Tạo Duration" để phân tích và chia thành các Scene

### Tab 3: Duration
- Xem danh sách các Scene với thời lượng
- Click "Download" để tải file `durations.txt`
- Click "Tạo Prompt" để sinh Prompt cho từng Scene

### Tab 4: Prompt
- Xem các Prompt đã được sinh
- Click "Download final_prompt.txt" để tải file hoàn chỉnh

## Cấu trúc Project

```
ScriptVision/
├── app/
│   ├── api/
│   │   ├── transcript/
│   │   │   └── route.ts      # API: Generate transcript
│   │   ├── duration/
│   │   │   └── route.ts      # API: Generate durations
│   │   └── prompt/
│   │       └── route.ts      # API: Generate prompts
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx              # Main UI
├── components/
│   ├── ui/
│   │   ├── button.tsx
│   │   └── textarea.tsx
│   └── Tabs.tsx
├── lib/
│   └── utils.ts
├── services/
│   └── ai.ts                 # Grok/Anthropic API service
├── templates/
│   ├── transcript.md         # AI prompt template for transcript
│   ├── transcript-long.md    # AI prompt template for long-form
│   ├── duration.md           # AI prompt template for duration
│   └── prompt.md             # AI prompt template for prompts
├── types/
│   └── index.ts
├── outputs/                  # Generated files will be saved here
├── .env.local.example
├── .gitignore
├── next.config.js
├── package.json
├── postcss.config.js
├── tailwind.config.ts
└── tsconfig.json
```

## Troubleshooting

### Lỗi "Cannot find module 'next'"
```bash
npm install
```

### Lỗi TypeScript
Đảm bảo bạn đã cài đặt đủ dependencies:
```bash
npm install --save-dev typescript @types/node @types/react @types/react-dom
```

### Lỗi API Key
Kiểm tra file `.env.local` đã được tạo và có chứa `GROK_API_KEY` hợp lệ.

### Lỗi build
```bash
# Xóa cache và rebuild
rm -rf .next
npm run build
```

### Lỗi 524 - Cloudflare Timeout
- Tăng `Proxy Read Timeout` trên Cloudflare lên 300s
- Hoặc dùng Grok trực tiếp không qua proxy
- Hoặc chia nhỏ nội dung input

## Output Files

Sau khi hoàn thành pipeline, 3 files sẽ được tạo:

1. `transcript.txt` - Nội dung đã chuẩn hóa
2. `durations.txt` - Danh sách Scene với thời lượng
3. `final_prompt.txt` - Prompt cho AI Image Generator

## Tech Stack

- **Frontend**: Next.js 15, React, TypeScript, TailwindCSS
- **Backend**: Next.js API Routes
- **AI**: Grok 4.5 API / Anthropic API
- **UI Components**: Custom Radix UI-style components

## Development Rules

- Mỗi module chỉ làm một nhiệm vụ
- Tất cả AI prompts được lưu trong `templates/`
- API Key không được hard-code
- Output format phải tuân thủ contract

## Tối ưu bước Thời lượng → Tạo Prompts với API local

Thêm các biến sau vào `.env.local` của Next.js và khởi động lại Next.js:

```env
LOCAL_PROMPT_BATCH_SIZE=5
LOCAL_PROMPT_COMPACT_TEMPLATE=0
LOCAL_PROMPT_PROGRESSIVE=0
```

Batch nhận số nguyên 1–15, sai/không đặt dùng 5. Để thử giảm số lượt gọi, đặt batch 10. Compact `1` bật template local rút gọn; progressive `1` hiển thị từng nhóm và giữ kết quả để tiếp tục sau lỗi. Hai chế độ mặc định tắt để rollout có kiểm soát. Các biến này không thuộc server CLI trong `tools/local-api`.

Khi progressive lỗi, giữ nguyên dữ liệu rồi bấm **Tạo Prompts** để tiếp tục; không cần chạy lại toàn bộ pipeline. Resume chỉ lưu trong bộ nhớ, không bảo đảm qua reload trình duyệt/restart server hoặc nhiều worker. Đổi đầu vào hoặc cấu hình có thể yêu cầu tạo mới. Prompt chưa hoàn tất chưa được áp dụng sang bước tạo ảnh. Khi áp dụng bản mới, ánh xạ ảnh/layer cũ không còn khớp sẽ bị bỏ; file gốc được giữ.

Rollback: batch `5`, compact/progressive `0`, restart Next.js. Validation local vẫn giữ kiểm tra chặt số cảnh, ảnh và timestamp; cảnh ngắn hơn 3 giây được dùng một ảnh phủ toàn cảnh. Không tự retry hoặc fallback API khác.

Chạy `npm run test:local-prompts` để kiểm tra hợp đồng và lỗi giữa chừng. `npm run benchmark:local-prompts -- --live --compact` đo 3 lượt/cấu hình bằng AI thật, dùng quota tài khoản và ghi đè báo cáo benchmark. Xem [README](README.md#cấu-hình-tối-ưu-prompt-local) và [đánh giá impact](docs/local-prompt-optimization-plan.md).

## Support

Nếu có vấn đề, vui lòng kiểm tra:
1. Node.js version >= 18
2. Grok API key hợp lệ và có đủ quota
3. Tất cả dependencies đã được cài đặt
4. File `.env.local` đúng định dạng
5. Proxy endpoint không bị timeout (lỗi 524)

## Roadmap

- v1.1: Audio Generator
- v1.2: Subtitle Generator  
- v1.3: Thumbnail Generator
- v2.0: Full Automatic Video Pipeline
