# Tài liệu API Codex CLI

API này chạy **cục bộ** trên `127.0.0.1`. Mỗi yêu cầu `POST /runs` khởi động một tiến trình `codex exec`; kết quả được lấy qua `GET /runs/{id}`. Base URL mặc định:

```text
http://127.0.0.1:3900
```

## Bắt đầu nhanh trên PowerShell

Yêu cầu: Node.js 18 trở lên, Codex CLI có thể chạy bằng lệnh `codex`, và đã đăng nhập bằng `codex login` hoặc có `CODEX_API_KEY` trong môi trường của tiến trình server. Không cần chạy `npm install`.

Mở PowerShell tại thư mục dự án và khởi động server:

```powershell
$env:CODEX_API_TOKEN = 'doi-thanh-token-rieng-cua-ban'
node .\start.mjs
```

`start.mjs` thêm thư mục chứa `codex.exe` vào `PATH` của tiến trình server. Nếu không tự tìm được Codex, đặt `$env:CODEX_BIN = 'C:\duong-dan\codex.exe'` rồi chạy `node .\start.mjs`.

Giữ cửa sổ này mở. Trong một cửa sổ PowerShell khác, gửi tác vụ và đọc kết quả:

```powershell
$base = 'http://127.0.0.1:3900'
$headers = @{ Authorization = 'Bearer doi-thanh-token-rieng-cua-ban' }
$body = @{ prompt = 'Tóm tắt các tệp trong thư mục này' } | ConvertTo-Json

$run = Invoke-RestMethod -Uri "$base/runs" -Method Post -Headers $headers -ContentType 'application/json' -Body $body
$run.id

do {
    Start-Sleep -Seconds 1
    $job = Invoke-RestMethod -Uri "$base/runs/$($run.id)" -Headers $headers
} while ($job.status -eq 'running')

$job.status
$job.result
$job.error
```

`CODEX_API_TOKEN` là token của **API cục bộ này**, khác với `CODEX_API_KEY` dùng để Codex xác thực với OpenAI. Nếu không đặt `CODEX_API_TOKEN`, API không yêu cầu header `Authorization`.

## Xác thực và định dạng chung

Khi đã đặt `CODEX_API_TOKEN`, mọi endpoint yêu cầu:

```http
Authorization: Bearer <CODEX_API_TOKEN>
```

Request body của `POST /runs` là JSON với `Content-Type: application/json`. Response đều là JSON; lỗi có dạng `{ "error": "..." }`. Dữ liệu tác vụ chỉ được lưu trong bộ nhớ của server.

## `GET /health`

Kiểm tra server và xem tác vụ đang chạy.

```powershell
Invoke-RestMethod -Uri "$base/health" -Headers $headers
```

Response `200`:

```json
{
  "ok": true,
  "workdir": "E:\\IMAGE\\YOUTUBE\\TOOL\\ScriptVision\\tools\\local-api",
  "activeJob": null
}
```

`activeJob` là ID tác vụ đang chạy, hoặc `null`.

## `POST /runs`

Khởi động một tác vụ Codex. Server chỉ cho phép **một tác vụ đang chạy** tại một thời điểm.

| Trường | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `prompt` | string | Có | Nội dung tác vụ; không được rỗng, tối đa 200.000 đơn vị ký tự JavaScript theo mặc định. Có thể đổi bằng `CODEX_MAX_PROMPT_CHARS`. |
| `sandbox` | string | Không | `read-only` (mặc định) hoặc `workspace-write`. |

Ví dụ chỉ đọc:

```json
{
  "prompt": "Giải thích cấu trúc dự án"
}
```

Ví dụ cho phép Codex sửa tệp:

```powershell
# Đặt biến này trước khi khởi động server.
$env:CODEX_ALLOW_WRITES = '1'
node .\start.mjs
```

```json
{
  "prompt": "Thêm một mục hướng dẫn vào README.md",
  "sandbox": "workspace-write"
}
```

Response `202` trả đối tượng tác vụ ngay, không chờ Codex hoàn thành:

```json
{
  "id": "a8c4e9a5-cd5d-4a72-9c44-215df4e3aa2e",
  "status": "running",
  "sandbox": "read-only",
  "threadId": null,
  "result": null,
  "error": null,
  "events": [],
  "stderr": "",
  "startedAt": "2026-11-04T12:00:00.000Z",
  "finishedAt": null
}
```

Trạng thái có thể thay đổi rất nhanh sau khi response được tạo. Hãy dùng `GET /runs/{id}` để lấy trạng thái mới nhất.

## `GET /runs/{id}`

Lấy trạng thái và kết quả của tác vụ.

```powershell
$job = Invoke-RestMethod -Uri "$base/runs/$($run.id)" -Headers $headers
$job | ConvertTo-Json -Depth 20
```

| Trường | Ý nghĩa |
| --- | --- |
| `id` | ID tác vụ do server tạo. |
| `status` | `running`, `completed`, `failed`, `cancelled` hoặc `timed_out`. |
| `sandbox` | Quyền đã cấp cho Codex. |
| `threadId` | ID thread từ Codex, có thể là `null`. API hiện không có endpoint tiếp tục thread. |
| `result` | Nội dung tin nhắn cuối của Codex, có thể là `null`. |
| `error` | Mô tả lỗi nếu có, ngược lại là `null`. |
| `events` | Tối đa 100 sự kiện JSONL mới nhất từ Codex. |
| `stderr` | Tối đa 4.000 ký tự cuối từ stderr của Codex. |
| `startedAt`, `finishedAt` | Thời điểm ISO 8601; `finishedAt` là `null` khi còn chạy. |

`result` có giá trị khi Codex phát sự kiện `item.completed` loại `agent_message`. Khi `status` là `failed`, xem cả `error` và `stderr` để chẩn đoán.

## `DELETE /runs/{id}`

Hủy tác vụ đang chạy. Nếu tác vụ đã kết thúc, endpoint vẫn trả trạng thái hiện tại.

```powershell
Invoke-RestMethod -Uri "$base/runs/$($run.id)" -Method Delete -Headers $headers
```

Response `200` là đối tượng tác vụ. Tác vụ được hủy có `status: "cancelled"` và `error: "Cancelled by client"`.

## Mã HTTP

| Mã | Khi nào xảy ra |
| --- | --- |
| `200` | Đọc health, đọc tác vụ hoặc hủy tác vụ thành công. |
| `202` | Đã nhận tác vụ mới. |
| `400` | JSON không hợp lệ, body vượt 2 MiB theo mặc định, `prompt` không hợp lệ hoặc `sandbox` không hợp lệ. |
| `401` | Thiếu hoặc sai Bearer token khi server có `CODEX_API_TOKEN`. |
| `403` | Yêu cầu `workspace-write` khi chưa đặt `CODEX_ALLOW_WRITES=1`. |
| `404` | Endpoint hoặc ID tác vụ không tồn tại. |
| `409` | Đã có một tác vụ khác đang chạy. |

## Cấu hình server

Đặt biến môi trường **trước khi chạy** `node .\start.mjs`:

| Biến | Mặc định | Công dụng |
| --- | --- | --- |
| `PORT` | `3900` | Cổng HTTP; host luôn là `127.0.0.1`. |
| `CODEX_API_TOKEN` | Không có | Bật xác thực Bearer cho API cục bộ. |
| `CODEX_ALLOW_WRITES` | Không có | Đặt `1` để cho phép request dùng `workspace-write`. |
| `CODEX_MAX_PROMPT_CHARS` | `200000` | Số đơn vị ký tự JavaScript tối đa của `prompt`; emoji thường tính là 2. |
| `CODEX_MAX_BODY_BYTES` | `2097152` (2 MiB) | Số byte UTF-8 tối đa của toàn bộ JSON request. |
| `CODEX_WORKDIR` | Thư mục khởi chạy server | Thư mục Codex làm việc. |
| `CODEX_BIN` | `codex` | Đường dẫn tới chương trình Codex CLI nếu không có trong `PATH`. |
| `CODEX_HOME` | Codex tự xác định; trên Windows server ưu tiên `%USERPROFILE%\.codex` | Thư mục cấu hình/xác thực của Codex. |
| `CODEX_API_KEY` | Không có | Khóa API cho Codex CLI nếu không dùng `codex login`. |

Mỗi tác vụ có giới hạn chạy 10 phút. Server giữ tối đa 100 tác vụ gần nhất trong bộ nhớ; khởi động lại sẽ xóa toàn bộ lịch sử. API chỉ nghe trên máy cục bộ và chưa có chức năng stream sự kiện trực tiếp; dùng `GET /runs/{id}` để thăm dò trạng thái.

Nếu cần gửi prompt lớn hơn mặc định, tăng **cả hai** giới hạn trước khi khởi động server. Ví dụ:

```powershell
$env:CODEX_MAX_PROMPT_CHARS = '500000'
$env:CODEX_MAX_BODY_BYTES = '4194304'
node .\start.mjs
```

Giới hạn của API này chỉ quyết định request có được nhận hay không; Codex hoặc mô hình vẫn có thể từ chối nội dung quá dài so với giới hạn ngữ cảnh của chúng.
