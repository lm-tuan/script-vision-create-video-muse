# PRD: AI Video Content Pipeline v1.0

## 1. Product Overview

### 1.1 Product Name
AI Video Content Pipeline

### 1.2 Version
v1.0

### 1.3 Description
Công cụ AI tự động chuyển đổi bài viết thành dữ liệu cần thiết để tạo video YouTube, bao gồm:
- Transcript đã chuẩn hóa
- Danh sách Scene với thời lượng
- Prompt hình ảnh cho từng Scene

## 2. Problem Statement

Người làm video YouTube hiện nay cần tốn nhiều thời gian để:
- Chuẩn hóa nội dung bài viết thành transcript cho TTS
- Phân tích và chia nội dung thành các Scene
- Tạo Prompt hình ảnh cho AI Image Generator

Công cụ này giải quyết vấn đề bằng cách tự động hóa toàn bộ quy trình.

## 3. Target Users

- YouTubers
- Content creators
- Video editors
- Digital marketers

## 4. Core Features

### 4.1 Module 1: Transcript Generator
**Input**: content.txt (bài viết gốc)
**Output**: transcript.txt (nội dung đã chuẩn hóa)

**Chức năng**:
- Chuẩn hóa dấu câu
- Loại bỏ khoảng trắng thừa
- Chia đoạn và câu hợp lý
- Tối ưu cho Text-to-Speech

### 4.2 Module 2: Scene Generator
**Input**: transcript.txt
**Output**: durations.txt

**Chức năng**:
- Phân tích transcript
- Chia thành các Scene (mỗi Scene một ý)
- Ước tính thời lượng từng Scene

### 4.3 Module 3: Prompt Generator
**Input**: transcript.txt + durations.txt
**Output**: final_prompt.txt

**Chức năng**:
- Sinh Prompt hình ảnh cho từng Scene
- Prompt bằng tiếng Anh, tối ưu cho AI Image Generator
- Đảm bảo phong cách nhất quán

## 5. User Interface

### 5.1 Tab Structure
- **Tab 1 - Content**: Input nội dung, upload file, generate transcript
- **Tab 2 - Transcript**: Preview, download, generate duration
- **Tab 3 - Duration**: Preview scenes, download, generate prompt
- **Tab 4 - Prompt**: Preview prompts, download final file

### 5.2 Features
- Upload file .txt
- Download output files
- Preview real-time
- Auto-advance tabs after generation
- Error handling với retry

## 6. Technical Architecture

### 6.1 Tech Stack
- **Frontend**: Next.js 15, React, TypeScript, TailwindCSS
- **Backend**: Next.js API Routes (Serverless)
- **AI**: Grok 4.5 API
- **UI**: Custom components (Radix UI style)

### 6.2 Pipeline Flow
```
content.txt → [Transcript Generator] → transcript.txt
transcript.txt → [Scene Generator] → durations.txt
transcript.txt + durations.txt → [Prompt Generator] → final_prompt.txt
```

### 6.3 API Design
- `POST /api/transcript` - Generate transcript
- `POST /api/duration` - Generate durations
- `POST /api/prompt` - Generate prompts

### 6.4 Template System
Tất cả AI prompts được lưu trong `templates/`:
- `transcript.md` - Template cho Transcript Generator
- `duration.md` - Template cho Scene Generator
- `prompt.md` - Template cho Prompt Generator

## 7. Output Contract

### 7.1 transcript.txt
```
[Transcribed and normalized text]
```

### 7.2 durations.txt
```
Scene 1

[Tên Scene]

[X] giây

[HH:MM] - [HH:MM]

Scene 2

...
```

### 7.3 final_prompt.txt
```
Prompt Scene 1

[Prompt tiếng Anh chi tiết]

Prompt Scene 2

[Prompt tiếng Anh chi tiết]

...
```

## 8. AI Configuration

### 8.1 Model
- Model: Grok 4.5
- Temperature: 0.2 (low để consistency)
- Reasoning: High
- Max Tokens: 4096

### 8.2 Prompt Strategy
- Mỗi module chỉ gọi AI một lần
- Không trộn nhiều nhiệm vụ trong một AI call
- Retry mechanism với exponential backoff

## 9. Design Principles

### 9.1 Modularity
- Mỗi module độc lập
- Chỉ nhận input đúng quy định
- Chỉ tạo output đúng format

### 9.2 Maintainability
- AI prompts dạng file (không hard-code)
- Dễ thay đổi AI model
- Dễ debug và mở rộng

### 9.3 Performance
- Giảm token usage
- Giảm chi phí API
- Fast response time

## 10. Future Roadmap

### v1.1 - Audio Generator
- Text-to-Speech integration
- Audio file generation

### v1.2 - Subtitle Generator
- SRT/VTT format
- Time-synced subtitles

### v1.3 - Thumbnail Generator
- AI thumbnail generation
- Multiple styles

### v2.0 - Full Automatic Video Pipeline
- Auto video composition
- Background music
- Transitions và effects

## 11. Success Metrics

### 11.1 Performance
- Transcript generation: < 10s
- Duration generation: < 15s
- Prompt generation: < 10s

### 11.2 Quality
- Transcript accuracy: > 95%
- Scene segmentation: Logical và meaningful
- Prompt quality: Detailed, actionable, consistent style

### 11.3 Usability
- User có thể hoàn thành full pipeline trong < 2 phút
- Zero manual intervention required

## 12. Constraints

### 12.1 Technical Constraints
- Temperature phải = 0.2 để đảm bảo consistency
- Không sử dụng JSON output (v1.0)
- Mỗi module chỉ gọi AI một lần

### 12.2 Business Constraints
- Output format không được thay đổi
- Không được thêm/giảm Scene
- Prompt phải bằng tiếng Anh

### 12.3 Security Constraints
- API Key phải được bảo vệ
- Không expose API key ra frontend
- Input validation required

## 13. Risks & Mitigations

### 13.1 Risk: API Key Exposure
**Mitigation**: 
- Lưu API key trong .env.local
- Không gọi API trực tiếp từ frontend
- Sử dụng API Routes như proxy

### 13.2 Risk: AI Output Inconsistency
**Mitigation**:
- Temperature = 0.2 (low)
- Chi tiết prompt templates
- Clear rules và examples

### 13.3 Risk: High API Costs
**Mitigation**:
- Modular pipeline (tối ưu token usage)
- Caching mechanism (future)
- Retry với backoff

## 14. Development Rules

1. Mỗi module phải hoạt động độc lập
2. Chỉ nhận đúng input được quy định
3. Chỉ tạo đúng output được quy định
4. Không đọc dữ liệu module khác ngoài input
5. Không thay đổi Output Contract
6. AI Prompt phải nằm trong templates/
7. API Key trong .env, không hard-code
8. Error handling với retry và logging

## 15. Appendix

### 15.1 File Structure
```
project/
├── app/
│   ├── api/
│   │   ├── transcript/route.ts
│   │   ├── duration/route.ts
│   │   └── prompt/route.ts
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ui/
│   │   ├── button.tsx
│   │   └── textarea.tsx
│   └── Tabs.tsx
├── lib/
│   └── utils.ts
├── services/
│   └── ai.ts
├── templates/
│   ├── transcript.md
│   ├── duration.md
│   └── prompt.md
├── types/
│   └── index.ts
├── outputs/
├── docs/
│   └── PRD.md
├── .env.local.example
├── .gitignore
├── INSTALL.md
├── next.config.js
├── package.json
├── postcss.config.js
├── tailwind.config.ts
├── tsconfig.json
└── README.md
```

### 15.2 Dependencies
- next: ^15.0.0
- react: ^18.2.0
- @radix-ui/*: ^1.1.0
- openai: ^4.20.0
- tailwindcss: ^3.4.0
- typescript: ^5.3.0

---

**Document Version**: 1.0
**Last Updated**: 2024
**Author**: Development Team