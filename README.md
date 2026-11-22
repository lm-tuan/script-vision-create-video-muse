# AI Video Content Pipeline

## Tạo giọng đọc và phụ đề bằng GenMax

Đặt `GENMAX_API_KEY` trong `.env.local` hoặc trong môi trường backend. Trong **Transcript**, để trống ô API key để dùng khóa backend, chọn nhà cung cấp và giọng đọc, rồi bấm **Tạo giọng đọc & SRT**. Mở **Shot video** và chọn **Dùng kết quả Genmax** để sử dụng MP3 và SRT vừa tạo.

## Tạo clip bằng MuseAI

Đặt `MUSE_BASE_URL` và `MUSE_API_KEY` trong `.env.local` của ScriptVision hoặc trong môi trường backend. Dùng URL gốc của gateway mà Next.js truy cập được, mặc định là `http://127.0.0.1:18610`. Lấy API key từ người vận hành gateway.

Trong **Shot video**, xác nhận cách chia cảnh và duyệt prompt. Chọn **Tạo clip MuseAI** cho từng shot hoặc **Tạo clip còn thiếu bằng MuseAI** để chạy tối đa 10 shot đồng thời. ScriptVision yêu cầu MuseAI tạo clip theo thời lượng mỗi shot, làm tròn lên giây. Nếu clip trả về dài hơn, mở **Xem và chọn đoạn dùng** để xem trước và chỉnh điểm bắt đầu. Chọn **Mở timeline trong Dựng video** để đưa clip và điểm bắt đầu đã chọn vào bản dựng.

Khi MuseAI xác nhận tác vụ thất bại, ScriptVision tự thử lại một lần với các lỗi có thể thử lại. Nếu lỗi xảy ra khi theo dõi hoặc tải MP4, **Tiếp tục MuseAI** dùng lại mã tác vụ.

Với gateway dùng trình duyệt, đặt `MUSE2API_BROWSER_MAX_TABS=10` trong môi trường gateway để chạy đủ 10 tác vụ khi có 10 tài khoản rảnh. Ảnh và video dùng chung các slot này.

Để thử bằng gateway mô phỏng, chạy `npm run muse-api` trên cổng riêng, chẳng hạn đặt `MUSE2API_PORT=18611` cho tiến trình mock. Cấu hình ScriptVision với URL và key của mock. `npm run test:muse-api` chạy bộ kiểm thử gateway mô phỏng.

## API local cho AI văn bản

Server API local nằm trong [`tools/local-api/`](tools/local-api/README.md). Mở một terminal tại thư mục gốc ScriptVision và chạy `npm run local-api`; giữ terminal này hoạt động khi dùng API local. Chạy ScriptVision trong terminal khác bằng `npm run dev`. Server API vẫn dùng `http://127.0.0.1:3900` và có thể kiểm tra bằng `npm run test:local-api`.

Theo mặc định Codex làm việc trong `tools/local-api/`. Nếu muốn Codex đọc một thư mục khác, đặt `CODEX_WORKDIR` trước khi khởi động server.

Transcript, phân cảnh/thời lượng, prompt và YouTube SEO gọi **API local (Codex CLI)** theo hợp đồng `GET /health`, `POST /runs`, `GET /runs/{id}`. Sinh ảnh và TTS dùng cấu hình riêng.

Mở **Shot video** rồi chọn kết quả Genmax hoặc nạp cặp MP3/SRT có sẵn. Chọn **Kiểm tra audio và SRT**, nghe thử rồi bấm **Tạo phân cảnh**. Kiểm tra các shot và xác nhận cách chia trước khi chọn **Tạo prompt còn thiếu**. Bản JSON tải về chứa mã shot, tên MP4 dự kiến, prompt, thời lượng yêu cầu khi sinh clip và thời lượng cắt theo lời đọc.

Thêm vào `.env.local` của ScriptVision (hoặc dùng giá trị URL mặc định):

```env
LOCAL_AI_BASE_URL=http://127.0.0.1:3900
LOCAL_AI_TOKEN=
```

Nếu server local đặt Bearer token, điền token vào `LOCAL_AI_TOKEN`; nếu không thì để trống. URL là địa chỉ nhìn từ **máy chạy Next.js**, không phải trình duyệt. Server local cần được khởi động trước. Các yêu cầu local được xếp hàng theo giới hạn một tác vụ của server và luôn dùng sandbox `read-only`. Khi local lỗi, ứng dụng báo lỗi thay vì tự gọi API Beeknoee.

Với API local, mục **Thời lượng** gửi toàn bộ transcript hoặc SRT trong một tác vụ. Mục **Prompts** nhận toàn bộ cảnh trong một HTTP request nhưng backend chia thành nhóm, mặc định **5 cảnh/lượt**, rồi gọi local tuần tự. Không gọi thêm để dịch phong cách hoặc tự retry/fallback sang provider khác. Kết quả local thiếu cảnh, trùng ảnh hoặc sai timeline sẽ báo lỗi, không tự cắt bớt ảnh để báo thành công.

### Cấu hình tối ưu prompt local

Đặt trong `.env.local` của **Next.js**, sau đó khởi động lại Next.js (không chỉ restart server CLI):

```env
LOCAL_PROMPT_BATCH_SIZE=5
LOCAL_PROMPT_COMPACT_TEMPLATE=0
LOCAL_PROMPT_PROGRESSIVE=0
```

- `LOCAL_PROMPT_BATCH_SIZE`: số nguyên 1–15; thiếu/sai giá trị thì dùng 5. Có thể thử 10 để giảm số lượt gọi, nhưng chỉ tăng sau khi đo trên dữ liệu thực tế.
- `LOCAL_PROMPT_COMPACT_TEMPLATE=1`: dùng `templates/prompt_local.md` riêng cho local. Giữ 40–80 từ/ảnh và 1–3 ảnh theo nội dung; template chung của provider khác không đổi. Chưa cắt transcript khi thiếu ánh xạ đáng tin cậy.
- `LOCAL_PROMPT_PROGRESSIVE=1`: UI nhận prompt/tiến độ sau mỗi nhóm. Nếu lỗi, giữ phần đã hoàn thành; bấm **Tạo Prompts** với cùng dữ liệu để tiếp tục. Nút **Kiểm tra đồng bộ** có thể tạo riêng cảnh còn thiếu. Sau pipeline lỗi ở bước prompt, dùng tab Thời lượng để tiếp tục, không cần chạy lại transcript/duration.

Progressive là chế độ opt-in qua `stream: true`; caller cũ tiếp tục nhận JSON. Resume dùng khóa phiên và kiểm tra dấu vân tay đầu vào/template/batch/endpoint; không tự dùng lại kết quả khác ngôn ngữ/phong cách. Bộ nhớ phục hồi nằm trong tiến trình Next.js, tối đa 8 phiên, 2 triệu ký tự kết quả/phiên, hết hạn sau 30 phút không hoạt động; phiên hoàn tất có thể bị thu hồi sớm khi đầy. Reload trình duyệt mất khóa tiếp tục; restart/hot reload hoặc đổi worker có thể mất bộ nhớ server. Khi đó tạo mới. Tác vụ hiện tại có thể chạy hết nhóm nếu mất kết nối; các nhóm tiếp theo được dừng khi server nhận biết ngắt kết nối.

Prompt chưa hoàn tất chưa được sửa/sinh ảnh/áp dụng qua UI Prompts. Khi áp dụng kết quả progressive hoàn tất, ánh xạ ảnh/layer cũ có prompt hoặc timeline thay đổi sẽ bị bỏ để tránh dùng nhầm ảnh; file gốc không bị xóa.

Kiểm tra và benchmark:

```bash
npm run test:local-prompts
npm run benchmark:local-prompts -- --live --compact
```

Sau khi build thành công, `npm run test:local-prompt-build -- .` chạy smoke test HTTP trên Next production với API AI giả lập, gồm polling, lỗi giữa chừng, resume và JSON cũ; không dùng quota AI.

Benchmark `--live` dùng quota AI local, mặc định 3 lượt/cấu hình trên bộ 6 cảnh; có thể dùng `--fixture path/to/request.json` để thử dữ liệu thực tế và `--transcript` cho bộ mẫu có ngữ cảnh. Báo cáo lưu tại `docs/local-prompt-benchmark-results.json` (ghi đè lần trước). Log chỉ chứa ID, kích thước, thời gian, số ảnh và kết quả kiểm tra; token usage nếu có vẫn xem ở terminal CLI server.

Rollback các tối ưu tùy chọn: đặt batch về `5`, compact/progressive về `0`, restart Next.js. Việc này giữ validation local chặt hơn; muốn khôi phục cả cách xử lý lỗi timeline cũ cần hoàn nguyên thay đổi code. Chi tiết phạm vi ảnh hưởng và kết quả đo: [kế hoạch tối ưu](docs/local-prompt-optimization-plan.md).
Version: 1.0

---

# 1. Project Overview

## Mục tiêu

Xây dựng một công cụ AI giúp tự động chuyển một bài viết thành các dữ liệu cần thiết để tạo video YouTube.

Tool sẽ hoạt động theo dạng Pipeline.

Người dùng chỉ cần cung cấp một bài viết (Content).

Hệ thống sẽ lần lượt:

1. Chuẩn hóa nội dung thành Transcript
2. Phân tích Transcript và chia thành các Scene
3. Sinh Prompt hình ảnh cho từng Scene

---

# 2. Workflow

```
                content.txt
                     │
                     ▼
        Transcript Generator
                     │
                     ▼
              transcript.txt
                     │
                     ▼
          Scene Generator
                     │
                     ▼
              durations.txt
                     │
                     ▼
         Prompt Generator
                     │
                     ▼
            final_prompt.txt
```

Đây là workflow cố định của toàn bộ hệ thống.

---

# 3. Technology Stack

## Frontend

- Next.js 15
- React
- TypeScript
- TailwindCSS
- shadcn/ui

## Backend

- Next.js API Routes

## AI

- Grok 4.5 API

## Output

Text Files (.txt)

---

# 4. Folder Structure

```
project/

│
├── app/
├── components/
├── services/
├── lib/
├── types/
│
├── templates/
│     transcript.md
│     duration.md
│     prompt.md
│
├── outputs/
│     transcript.txt
│     durations.txt
│     final_prompt.txt
│
└── docs/
      PRD.md
```

---

# 5. Input

Người dùng chỉ cần nhập:

```
content.txt
```

Ví dụ:

- bài viết sức khỏe
- bài viết lịch sử
- bài viết khoa học
- bài viết giáo dục

Không giới hạn ngôn ngữ.

Ví dụ:

- English
- Japanese
- French
- Vietnamese

---

# 6. Output Files

Sau khi hoàn thành toàn bộ Pipeline, hệ thống bắt buộc sinh đúng **03 file**.

```
outputs/

transcript.txt

durations.txt

final_prompt.txt
```

Đây là Output Contract của hệ thống.

Không được thay đổi format.

---

# 7. Module 1

## Transcript Generator

Input

```
content.txt
```

Output

```
transcript.txt
```

---

## Nhiệm vụ

Module này chỉ được phép:

- Chuẩn hóa văn bản
- Loại bỏ ký tự dư thừa
- Chuẩn hóa dấu câu
- Chia đoạn hợp lý
- Chia câu hợp lý
- Giữ nguyên nội dung
- Không tự ý thêm thông tin
- Không rút gọn nội dung
- Tối ưu cho Text-To-Speech

---

## Không được

- Chia Scene
- Sinh Prompt
- Phân tích hình ảnh
- Thêm ghi chú

---

## Template

```
templates/transcript.md
```

---

# 8. transcript.txt

Định dạng phải giống file mẫu.

Ví dụ

```
Bonjour à tous.

Aujourd'hui nous allons parler de...

...

...
```

Đây là đầu vào duy nhất của Module 2.

---

# 9. Module 2

## Scene Generator

Input

```
transcript.txt
```

Output

```
durations.txt
```

---

## Nhiệm vụ

Đọc transcript.

Phân tích nội dung.

Chia thành các Scene.

Ước tính thời lượng từng Scene.

---

## Quy tắc chia Scene

Một Scene chỉ thể hiện một ý.

Ví dụ

```
Virus xâm nhập cơ thể.
```

↓

Một Scene

```
Virus di chuyển trong dây thần kinh.
```

↓

Một Scene

```
Virus tấn công não.
```

↓

Một Scene

Không được gộp nhiều ý trong cùng một Scene.

---

## Duration

Duration chỉ là thời lượng ước tính.

Ví dụ

```
Scene 1

3 giây

00:00 - 00:03

Scene 2

2 giây

00:03 - 00:05

Scene 3

5 giây

00:05 - 00:10
```

Định dạng phải giống file durations.txt.

---

## Không được

- Sinh Prompt
- Đọc content.txt

Chỉ được đọc

```
transcript.txt
```

---

## Template

```
templates/duration.md
```

---

# 10. durations.txt

File này là đầu vào của Prompt Generator.

Không được thay đổi format.

---

# 11. Module 3

## Prompt Generator

Input

```
transcript.txt

durations.txt
```

Output

```
final_prompt.txt
```

---

## Nhiệm vụ

Đọc:

- transcript
- duration

Sau đó sinh Prompt cho từng Scene.

---

## Quy tắc

Một Scene

↓

Một Prompt

Không được:

- bỏ Scene
- thêm Scene
- thay đổi thứ tự Scene

---

## Prompt

Prompt phải:

- đúng template
- cùng phong cách
- cùng cấu trúc
- cùng chất lượng

---

## Template

```
templates/prompt.md
```

---

# 12. final_prompt.txt

Định dạng phải giống file mẫu.

Ví dụ

```
Prompt Scene 1

...

Prompt Scene 2

...

Prompt Scene 3

...
```

Không thêm ghi chú.

Không thêm giải thích.

---

# 13. Output Contract

Ba file sau là Output Contract của toàn bộ hệ thống.

```
transcript.txt

durations.txt

final_prompt.txt
```

Tất cả Module phải tuân thủ.

Không được tự ý thay đổi.

Nếu thay đổi format phải cập nhật toàn bộ Pipeline.

---

# 14. API Design

## Generate Transcript

```
POST

/api/transcript
```

Input

```
content
```

Output

```
transcript.txt
```

---

## Generate Duration

```
POST

/api/duration
```

Input

```
transcript.txt
```

Output

```
durations.txt
```

---

## Generate Prompt

```
POST

/api/prompt
```

Input

```
transcript.txt

durations.txt
```

Output

```
final_prompt.txt
```

---

# 15. Prompt Templates

Tất cả Prompt AI phải được lưu thành file.

```
templates/

transcript.md

duration.md

prompt.md
```

Không được Hard-code Prompt trong source code.

Điều này giúp dễ nâng cấp và thay đổi AI Model trong tương lai.

---

# 16. User Interface

## Tab 1

Content

- TextArea
- Upload File
- Generate Transcript

---

## Tab 2

Transcript

- Preview
- Download
- Generate Duration

---

## Tab 3

Duration

- Preview
- Download
- Generate Prompt

---

## Tab 4

Prompt

- Preview
- Download final_prompt.txt

---

# 17. AI Configuration

Model

```
Grok 4.5
```

Output

```
Text
```

Temperature

```
0.2
```

Reasoning

```
High
```

Không sử dụng JSON ở phiên bản đầu tiên.

---

# 18. Design Principles

Mỗi Module chỉ làm một nhiệm vụ.

```
Content

↓

Transcript

↓

Scene

↓

Prompt
```

Không trộn nhiều nhiệm vụ trong cùng một AI Call.

Điều này giúp:

- giảm Token
- giảm chi phí
- dễ Debug
- dễ mở rộng
- dễ thay đổi AI Model

---

# 19. Future Roadmap

Phiên bản hiện tại chỉ gồm:

- Transcript Generator
- Scene Generator
- Prompt Generator

Các phiên bản tiếp theo có thể bổ sung:

- Audio Generator
- Subtitle Generator
- Thumbnail Generator
- YouTube Title Generator
- Description Generator
- Tags Generator
- Video Prompt Generator
- Timeline Generator
- Video Composer

Mà không cần thay đổi kiến trúc hiện tại.

---

# 20. Version

Current

```
v1.0
```

Roadmap

```
v1.1
Audio

v1.2
Subtitle

v1.3
Thumbnail

v2.0
Full Automatic Video Pipeline
```

---

# 21. Development Rules

- Mỗi module phải hoạt động độc lập.
- Chỉ nhận đúng input được quy định.
- Chỉ tạo đúng output được quy định.
- Không được đọc dữ liệu của module khác ngoài input được chỉ định.
- Không thay đổi Output Contract.
- Mọi AI Prompt phải nằm trong thư mục `templates/`.
- API Key phải được lưu trong biến môi trường (`.env`) và không bao giờ gọi trực tiếp từ frontend.
- Mọi lỗi API phải được xử lý với retry và logging.
