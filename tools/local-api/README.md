# Codex CLI local API

## Terminal logs and model inspection

Run `npm run local-api:model` from the repository root or this directory to check
the resolved CLI model, provider and reasoning effort. This sends a small read-only
request and uses account quota. The `local` model in the application is a provider
label; the actual model is selected by Codex.

The API logs each run ID, prompt character count, elapsed time, CLI event/item types,
token usage when provided, stderr diagnostics, and final status. While a run is active,
a heartbeat appears every 15 seconds. Heartbeats indicate the process is still pending;
they do not prove the model is making progress. Prompt and result bodies are not logged.
CLI stderr diagnostics may contain information from the CLI.

By default this tool uses `gpt-6.1-terra` with reasoning effort `high`.
Optional server environment variables `CODEX_MODEL` and `CODEX_REASONING_EFFORT`
override them for both API runs and the model inspection command. Restart the server
after changing these variables. The request body still does not accept CLI arguments.

Tool này nằm trong repo ScriptVision tại `tools/local-api/`. Chạy `npm run local-api` từ thư mục gốc repo hoặc ngay trong thư mục này để khởi động.

HTTP API cục bộ chạy tác vụ qua `codex exec`. Không cần thư viện npm; cần Node.js 18+ và Codex CLI đã cài, đăng nhập (`codex login`) hoặc đặt `CODEX_API_KEY` cho tiến trình chạy server.

Xem [tài liệu API đầy đủ](docs/API.md) để biết cách dùng, request/response của từng endpoint và các mã lỗi.

Nếu tích hợp từ một ứng dụng hoặc agent khác, dùng [hợp đồng tích hợp cho tool](docs/TOOL_INTEGRATION.md).

Theo [OpenAI Docs về non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode), `codex exec --json` xuất sự kiện JSONL và hỗ trợ sandbox `read-only` / `workspace-write`.

## Chạy trên PowerShell

```powershell
node .\start.mjs
```

`start.mjs` tìm `codex.exe`, thêm thư mục chứa nó vào `PATH` của tiến trình server và đặt `CODEX_BIN`. Nếu cần chỉ định trực tiếp: `$env:CODEX_BIN = 'C:\duong-dan\codex.exe'` trước khi chạy `node .\start.mjs`.

Server chỉ nghe tại `127.0.0.1:3900` và chỉ cho phép một tác vụ đang chạy. Có thể đặt `PORT` trước khi chạy. Đặt `CODEX_API_TOKEN` để yêu cầu Bearer token cho mọi request. Đặt `CODEX_ALLOW_WRITES=1` nếu cần cho phép tác vụ sửa tệp trong thư mục làm việc.

Mỗi `prompt` nhận tối đa 200.000 đơn vị ký tự JavaScript, với toàn bộ JSON request tối đa 2 MiB. Có thể tăng bằng `CODEX_MAX_PROMPT_CHARS` và `CODEX_MAX_BODY_BYTES`; xem [tài liệu API](docs/API.md#cấu-hình-server).

## Gọi API

```powershell
$body = @{ prompt = 'Tóm tắt cấu trúc thư mục này' } | ConvertTo-Json
$run = Invoke-RestMethod -Uri http://127.0.0.1:3900/runs -Method Post -ContentType 'application/json' -Body $body
Invoke-RestMethod -Uri "http://127.0.0.1:3900/runs/$($run.id)"
```

`POST /runs` trả `202` cùng `id`. Dùng `GET /runs/{id}` để xem `status`, `result`, `threadId`, `events` và lỗi. `DELETE /runs/{id}` hủy tác vụ đang chạy. `GET /health` kiểm tra server. Nếu đã đặt token, thêm header `Authorization: Bearer <token>`.

Mặc định Codex chỉ đọc. Để cho phép sửa tệp:

```powershell
$env:CODEX_ALLOW_WRITES = '1'
node .\start.mjs
```

Sau đó gửi `{ "prompt": "...", "sandbox": "workspace-write" }`. Tác vụ luôn chạy tại thư mục này; API không nhận đường dẫn hoặc tham số CLI tùy ý. Trạng thái tác vụ chỉ lưu trong bộ nhớ và mất khi khởi động lại server.

## Kiểm tra

```powershell
node --test
```

Bộ test dùng Codex CLI giả, nên không cần đăng nhập hoặc gọi OpenAI API. Nó kiểm tra xác thực, dữ liệu đầu vào, quyền ghi, kết quả JSONL, tác vụ lỗi, giới hạn chạy đồng thời và hủy tác vụ.

/// cách chạy npm run local-api
