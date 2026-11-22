# Ghi chú lỗi đồng bộ ảnh và audio

## Đã xử lý

1. **Chuyển cảnh làm ngắn video.** `xfade` chồng các clip lên nhau nên mỗi ranh giới trước đây làm mất `transitionDuration` khỏi tổng thời lượng. Với 20 cảnh và chuyển cảnh 0,5 giây, video ngắn hơn audio khoảng 9,5 giây; `-shortest` có thể cắt phần cuối lời đọc. Giờ mỗi clip được kéo dài theo số frame cần cho phần chồng, đặt chuyển cảnh quanh mốc ranh giới và giữ nguyên tổng thời lượng timeline.
2. **Kiểm tra cuối che giấu lỗi chuyển cảnh.** Trước đây thời lượng kỳ vọng cũng bị trừ phần chồng, nên video ngắn vẫn có thể được đánh dấu thành công. Giờ thời lượng kỳ vọng lấy từ audio thật; báo cáo ghi riêng thời lượng audio, video, chuyển cảnh, intro và outro.
3. **Intro/outro khiến render báo lệch giả.** Bước kiểm tra trước đây không cộng 4 giây intro và 5 giây outro. Giờ chỉ cộng các clip thực sự được tạo.
4. **Chuyển cảnh lỗi rồi tự nối clip có thể làm lệch mốc ảnh.** Các clip đã được kéo dài để chồng lên nhau; nối thẳng chúng sẽ làm tổng video dài hơn. Giờ render trả lỗi rõ ràng để không xuất video sai nhịp.

## Cần theo dõi khi kiểm tra bằng dữ liệu thật

- Mốc chuyển cảnh lấy từ timeline đã lượng tử hóa ở 25 fps. SRT gốc có thể khác mốc frame tối đa khoảng 20 ms.
- Video đầu vào là clip động sẽ phát thêm vài frame ở mép chuyển cảnh; cần xem bằng mắt nếu clip có điểm cắt nội dung quan trọng.
- Kiểm tra cuối hiện so sánh thời lượng toàn video. Cần kiểm tra thêm mốc của các câu cụ thể nếu SRT hoặc dữ liệu chia cảnh từ AI không khớp nội dung giọng đọc.

## Cải thiện hình ảnh cho các lần render tiếp theo

- Ảnh không đúng tỷ lệ 16:9 được giữ nguyên và đặt trên nền mờ lấy từ chính ảnh, thay cho hai dải đen. Không cắt mất chủ thể của ảnh dọc. Nếu bật Ken Burns, chuyển động nhẹ cũng áp dụng cho khung này.
- Phụ đề ở đáy nhỏ hơn, dùng viền chữ để đọc rõ trên ảnh sáng; không tự thêm dải nền tối che ngang khung hình. Kiểu phụ đề dạng hộp vẫn chỉ xuất hiện khi người dùng chọn riêng.
- Từ bản render sau `workspace_1793009482843`, phụ đề ở đáy được hạ xuống bằng cách giảm `MarginV` từ 18 xuống 10 (kiểu cinematic từ 20 xuống 12); vẫn chừa một khoảng nhỏ với mép dưới.
- Ảnh nguồn gần 16:9 như 1376×768 nay được phóng phủ kín rồi cắt phần thừa rất nhỏ ở hai bên; cách cũ thu vừa khung và thêm khoảng 4 px đen ở mép trên/dưới video 1920×1080.
- Video nguồn gần 16:9 cũng phủ kín khung; video có tỷ lệ khác nhiều dùng nền mờ lấy từ chính video để không có dải đen mà vẫn giữ trọn nội dung chính.
- Prompt tạo ảnh cảnh yêu cầu bố cục ngang 16:9, không sinh chữ trên ảnh và giữ đúng đặc điểm nhân vật được nêu trong lời đọc. Đây là hướng dẫn cho AI; ảnh đã tạo hoặc ảnh người dùng tải lên không tự thay đổi.
- Video `workspace_1793001727740` đã render trước khi có các thay đổi này. Muốn thấy kết quả mới cần render lại; ảnh nguồn có chữ AI méo vẫn cần tạo lại nếu muốn sửa triệt để.
