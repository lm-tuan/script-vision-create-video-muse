# Kế hoạch đồng bộ clip MP4 với lời đọc

## Mục tiêu

Mỗi clip phải vừa khớp độ dài shot, vừa đưa hành động chính lên hình đúng lúc lời đọc nhắc đến. Timeline lấy từ MP3 và SRT đã duyệt. Giọng đọc có thể đến từ Genmax hoặc tệp có sẵn. Phân cảnh và viết prompt dùng API local.

Clip nguồn dự kiến khoảng 10 giây. Tool đo độ dài thật của từng MP4 trước khi dựng. Một clip dài 10 giây có thể được dùng cho một shot ngắn hơn với điểm vào và tốc độ do người dựng duyệt.

## Hiện trạng

Tab **Shot video** đã kiểm tra cặp MP3/SRT, tạo shot liên tục tối đa 10 giây và cho nghe từ đầu từng shot. Bước duyệt prompt diễn ra trước khi chuyển timeline sang **Dựng video**. Composer nhận MP4 theo mã shot và lấy đoạn từ đầu clip. Chế độ dùng timeline shot báo lỗi nếu clip thiếu thời lượng.

Phần cần bổ sung là mốc hành động trong shot, xem trước MP4 với audio, chọn điểm vào và tốc độ, rồi dùng đúng quyết định đó khi render. MVP dùng MP4 nhập tay.

## 1. Lập shot và viết prompt theo nhịp lời đọc

1. Giữ `startMs` và `endMs` làm mốc tuyệt đối của shot trên audio. Ưu tiên ranh giới câu và chỗ ngắt tự nhiên; mọi shot phải nối liền và phủ hết audio.
2. Thêm mô tả hành động chính và mốc mục tiêu tương đối trong shot. Ví dụ, shot từ 01:00 đến 01:07 có thể yêu cầu “đèn bật” vào khoảng giây 4 của shot. Mốc này có thể để trống với cảnh minh họa tĩnh hoặc cảnh tạo không khí.
3. SRT thường chỉ có mốc bắt đầu và kết thúc của cả câu. Khi không biết chính xác từ khóa được đọc lúc nào, đánh dấu mốc là ước lượng và cho người dùng chỉnh bằng cách nghe audio. AI local có thể đề xuất hành động chính và mốc theo nội dung. Backend giữ quyền kiểm tra mốc luôn nằm trong shot.
4. Prompt mô tả đầu shot, hành động chính và hình kết. Đưa hành động vào khoảng có thể dùng trong bản dựng và cho chủ thể giữ trạng thái thêm một nhịp sau hành động. Chỉ đạo thời điểm trong prompt là mục tiêu để mô hình sinh clip bám theo, cần kiểm tra lại trên MP4 thực tế.

## 2. Duyệt MP4 cùng audio trong Dựng video

- Gán MP4 theo mã shot, ví dụ `S1-C2.mp4`. Đọc thông tin luồng video và thời lượng thật.
- Cho xem trước đúng đoạn audio của shot cùng clip. Khi tua về đầu hoặc đổi điểm vào, cả audio lẫn video trở về trạng thái tương ứng. Có thể tua từng bên để xác định mốc hành động nguồn và mốc trong lời đọc.
- Hiển thị **thời lượng shot**, **thời lượng nguồn**, **điểm vào clip**, **điểm ra tính tự động**, **tốc độ**, và chênh lệch mốc hành động nếu có đủ hai mốc.
- Ưu tiên tìm đoạn dùng được ở tốc độ 1×. Nếu chưa khớp, cho người dựng thử tốc độ khác và đánh giá chuyển động trong bản xem trước. Khi clip thiếu phần trước hoặc sau hành động, cho thay hoặc tạo lại riêng shot đó.
- Có ba trạng thái vận hành là **Chưa duyệt**, **Đã duyệt** và **Cần thay clip**. Thay MP4, sửa timecode hoặc đổi điểm cắt/tốc độ sẽ yêu cầu duyệt lại shot liên quan.

### Quy tắc tính điểm cắt

- `D` là độ dài cần dùng trên timeline, `I` là điểm vào nguồn và `r` là tốc độ phát, với `1× = 1`.
- Điểm ra nguồn là `O = I + D × r`. Điều kiện hợp lệ là `0 ≤ I < O ≤ thời lượng nguồn`.
- Hành động ở mốc nguồn `A` sẽ xuất hiện tại `(A − I) / r` tính từ đầu shot. Nếu muốn hành động xuất hiện tại mốc `T`, điểm vào đề xuất là `I = A − T × r`.
- Ví dụ, shot dài 7 giây, lời đọc nhắc đến hành động ở giây 4, clip dài 10 giây và hành động diễn ra ở giây 6. Lấy đoạn **2–9 giây** ở tốc độ **1×** sẽ khớp cả độ dài và thời điểm.
- Nếu hành động diễn ra ở giây 8, giữ tốc độ 1× sẽ cần đoạn **4–11 giây**, vượt nguồn. Tăng tốc toàn bộ 10 giây xuống 7 giây vẫn làm hành động xuất hiện ở giây 5,6. Đánh dấu clip cần chỉnh hoặc thay nếu bản xem trước không đạt.

## 3. Lưu quyết định dựng và render

| Dữ liệu | Ý nghĩa |
| --- | --- |
| `shotId`, `startMs`, `endMs` | Mã shot và vị trí trong timeline lời đọc |
| `action`, `targetActionMs` | Hành động chính và mốc trong shot, nếu có |
| `sourceDurationMs`, `sourceInMs`, `speed` | Thời lượng MP4 thật, điểm vào và tốc độ đã chọn |
| `sourceActionMs` | Mốc hành động trong MP4, nếu đã đánh dấu |

- Giữ điểm ra là giá trị tính từ điểm vào, tốc độ và độ dài shot để tránh hai mốc mâu thuẫn. Khi lưu hoặc khôi phục dự án, gắn quyết định dựng với đúng tệp nguồn và phiên bản timeline.
- Phía server dùng FFprobe kiểm tra nguồn khi render. FFmpeg cắt đoạn nguồn, đổi tốc độ hình nếu có, chuẩn hóa đầu ra theo FPS của bộ dựng hiện tại và ghép với MP3 cùng SRT đã chọn. Clip sinh có thể kèm âm thanh, bản dựng mặc định dùng giọng đọc làm âm thanh chính.
- Tính số frame của từng shot từ các mốc tích lũy của timeline ở **25 fps**. Kiểm tra số frame xuất ra trước khi ghép để sai số làm tròn không dồn qua nhiều shot. Nếu một clip không cấp đủ frame theo quyết định đã duyệt, báo đúng mã shot cho người dựng.
- MVP dùng cắt thẳng để giữ nhịp đã duyệt. Hiệu ứng chồng cảnh có thể được đánh giá riêng sau khi luồng đồng bộ hoạt động ổn định.

## Thứ tự triển khai và nghiệm thu

| Giai đoạn | Kết quả cần kiểm tra |
| --- | --- |
| **1. Timeline và prompt** | Shot phủ hết một đoạn audio thử, có cả shot dưới 10 giây và cảnh có mốc hành động ước lượng. Người dùng nghe và chỉnh mốc trước khi tạo prompt. |
| **2. Duyệt clip** | Gán ba MP4 theo tên. Xem cùng lời đọc. Kiểm tra trường hợp cắt từ đầu, cắt từ giữa ở 1× và trường hợp phải thay clip. |
| **3. Render** | Kiểm thử một mẫu 20–30 giây có hành động rõ, SRT và clip lệch nhịp có chủ đích. So sánh bản xem trước với file xuất, kiểm tra đủ frame và thời điểm hành động. |
| **4. Thử video dài** | Chạy với dự án khoảng 12 phút, 94 shot. Sửa một clip ở giữa, duyệt lại shot đó và render. Kiểm tra đầu, giữa, cuối video để phát hiện lệch tích lũy. |

Giai đoạn đầu ưu tiên người dựng đánh dấu và xác nhận bằng mắt, tai. Khi đã có dữ liệu từ các clip thật, có thể thử gợi ý điểm vào hoặc nhận diện hành động tự động và so với mốc người dựng đã duyệt.
