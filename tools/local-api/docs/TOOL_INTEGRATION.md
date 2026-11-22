# Hợp đồng tích hợp cho tool khác

File này dành cho client, agent hoặc tool muốn gọi HTTP API của dự án này. Có thể đưa nguyên file làm ngữ cảnh cho tool tích hợp. API chạy Codex CLI **trên máy đang chạy server**, không chạy trong môi trường của client.

## Thông tin kết nối

| Mục | Giá trị |
| --- | --- |
| Base URL mặc định | `http://127.0.0.1:3900` |
| Giao thức | HTTP, JSON UTF-8 |
| Xác thực | Header `Authorization: Bearer <CODEX_API_TOKEN>` nếu server đã đặt token |
| Content-Type khi POST | `application/json` |
| Số tác vụ đang chạy tối đa | 1 |
| Thời gian chạy tối đa mỗi tác vụ | 10 phút |

`127.0.0.1` chỉ truy cập được từ **cùng máy** với server. Tool chạy trên máy khác hoặc dịch vụ cloud không thể gọi URL này trực tiếp. Client không gửi `CODEX_API_KEY` trong request; khóa đó, nếu cần, được cấu hình cho tiến trình server/Codex CLI.

Trên Windows, người vận hành nên khởi động server bằng `node .\start.mjs` tại thư mục dự án. Script này thêm thư mục chứa `codex.exe` vào `PATH` của tiến trình server và đặt `CODEX_BIN`. Client chỉ gọi HTTP, không cần tìm `codex.exe`.

## Quy trình client cần thực hiện

1. Gọi `GET /health` để xác nhận server đang hoạt động.
2. Gọi `POST /runs` với `prompt` và tùy chọn `sandbox`. Lưu `id` từ response `202`.
3. Gọi `GET /runs/{id}` mỗi 1–2 giây khi `status` là `running`.
4. Nếu `status` là `completed`, đọc `result`. Nếu là `failed`, `timed_out` hoặc `cancelled`, đọc `error` và `stderr`.
5. Chỉ gọi `DELETE /runs/{id}` khi muốn hủy chính tác vụ đó.

Không coi response `202` là kết quả cuối. Một tác vụ có thể hoàn thành hoặc lỗi ngay sau khi `POST` trả về.

## Endpoint

### `GET /health`

Response `200`:

```json
{
  "ok": true,
  "workdir": "E:\\IMAGE\\YOUTUBE\\TOOL\\ScriptVision\\tools\\local-api",
  "activeJob": null
}
```

`activeJob` là ID tác vụ đang chạy hoặc `null`.

### `POST /runs`

Request JSON:

```json
{
  "prompt": "Kiểm tra cấu trúc dự án và tóm tắt kết quả",
  "sandbox": "read-only"
}
```

| Trường | Bắt buộc | Quy tắc |
| --- | --- | --- |
| `prompt` | Có | String không rỗng; tối đa 200.000 đơn vị ký tự JavaScript theo mặc định. |
| `sandbox` | Không | `read-only` (mặc định) hoặc `workspace-write`. |

Toàn bộ JSON request tối đa 2 MiB theo mặc định. Server có thể đổi hai giới hạn bằng `CODEX_MAX_PROMPT_CHARS` và `CODEX_MAX_BODY_BYTES`. `workspace-write` chỉ dùng được khi server khởi động với `CODEX_ALLOW_WRITES=1`; không có tham số request để tự bật quyền này.

Response `202` là đối tượng tác vụ, thường có `status: "running"`:

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

### `GET /runs/{id}`

Response `200` có cùng cấu trúc đối tượng tác vụ. Các trường chính:

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `id` | string | UUID của tác vụ. |
| `status` | string | `running`, `completed`, `failed`, `cancelled` hoặc `timed_out`. |
| `result` | string/null | Tin nhắn agent cuối cùng; đọc khi hoàn thành. |
| `error` | string/null | Lý do lỗi hoặc hủy tác vụ. |
| `stderr` | string | Tối đa 4.000 ký tự cuối của stderr Codex CLI. |
| `events` | array | Tối đa 100 sự kiện JSONL mới nhất. |
| `threadId` | string/null | ID thread Codex; API này chưa hỗ trợ tiếp tục thread. |
| `startedAt` | string | Thời điểm bắt đầu dạng ISO 8601. |
| `finishedAt` | string/null | Thời điểm kết thúc dạng ISO 8601. |

Chỉ `status: "completed"` biểu thị thành công. `result` có thể xuất hiện trước khi tiến trình kết thúc, vì vậy client vẫn phải chờ trạng thái cuối.

### `DELETE /runs/{id}`

Hủy tác vụ đang chạy. Response `200` trả đối tượng tác vụ với `status: "cancelled"`. Nếu tác vụ đã kết thúc, server trả trạng thái hiện có.

## Lỗi HTTP và cách xử lý

Lỗi có body JSON dạng `{ "error": "mô tả" }`, ngoại trừ lỗi `409` còn có `activeJob`.

| Mã | Ý nghĩa | Client nên làm gì |
| --- | --- | --- |
| `400` | JSON, `prompt`, `sandbox` hoặc kích thước body không hợp lệ. | Sửa request; không lặp lại nguyên request. |
| `401` | Thiếu/sai Bearer token. | Kiểm tra token cấu hình cho API cục bộ. |
| `403` | Yêu cầu `workspace-write` nhưng server chưa cho phép. | Dùng `read-only` hoặc để người vận hành bật quyền ghi trên server. |
| `404` | Endpoint hoặc ID tác vụ không tồn tại. | Kiểm tra URL/ID; ID cũ có thể mất sau khi server khởi động lại. |
| `409` | Một tác vụ khác đang chạy. | Đợi tác vụ hiện tại kết thúc rồi gửi lại; không tự động hủy tác vụ khác. |

Response `202` chỉ có nghĩa là tác vụ đã được nhận. Lỗi Codex sau đó xuất hiện trong `GET /runs/{id}` với `status: "failed"` hoặc `timed_out`, không phải mã HTTP lỗi của `POST`.

## Ví dụ HTTP hoàn chỉnh

Nếu server có token, thêm `Authorization` như dưới đây. Nếu server không đặt token, bỏ header đó.

```http
POST /runs HTTP/1.1
Host: 127.0.0.1:3900
Authorization: Bearer YOUR_LOCAL_API_TOKEN
Content-Type: application/json

{"prompt":"Reply with exactly OK.","sandbox":"read-only"}
```

Sau khi nhận `id`, thăm dò:

```http
GET /runs/a8c4e9a5-cd5d-4a72-9c44-215df4e3aa2e HTTP/1.1
Host: 127.0.0.1:3900
Authorization: Bearer YOUR_LOCAL_API_TOKEN
```

Ví dụ kết quả cuối:

```json
{
  "id": "a8c4e9a5-cd5d-4a72-9c44-215df4e3aa2e",
  "status": "completed",
  "sandbox": "read-only",
  "threadId": "019a2d00-0000-7000-8000-000000000001",
  "result": "OK",
  "error": null,
  "events": [
    { "type": "thread.started", "thread_id": "019a2d00-0000-7000-8000-000000000001" },
    { "type": "item.completed", "item": { "type": "agent_message", "text": "OK" } },
    { "type": "turn.completed" }
  ],
  "stderr": "",
  "startedAt": "2026-11-04T12:00:00.000Z",
  "finishedAt": "2026-11-04T12:00:04.000Z"
}
```

`events` và `stderr` trong ví dụ chỉ minh họa; nội dung thực tế phụ thuộc vào Codex CLI. Server lưu tối đa 100 tác vụ gần nhất trong bộ nhớ và mất toàn bộ lịch sử khi khởi động lại.
