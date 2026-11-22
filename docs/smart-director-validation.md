**Kiểm tra Phối hợp Speed Paint + Motion Director — 27/10/2026**

Lỗi gửi lớp PNG đã được sửa: khi bật Motion Director riêng hoặc bật phối hợp tự động, yêu cầu dựng đều gửi lớp PNG của những cảnh còn trong dự án. Khi tắt cả hai chế độ, các lớp này không được gửi.

Bộ đếm trên giao diện có nhãn “Dự kiến” và giải thích rằng số cảnh có thể thay đổi sau khi căn theo lời đọc/SRT. Quy tắc chọn cảnh vẫn được tính lại trên timeline thực tế khi dựng. Video nguồn không được tính vào hai nhóm ảnh.

Phần phối hợp giải thích rằng chế độ dựng thường dùng fade khoảng 0,5 giây giữa các cảnh; timeline có thể giảm khoảng fade với cảnh quá ngắn. Khi dùng dựng nâng cao, lựa chọn chuyển cảnh của người dùng được giữ nguyên.

Kiểm tra hồi quy chạy qua chính hàm gửi yêu cầu của giao diện, thay thế React state/effect và việc gửi mạng để đọc FormData. Các trường hợp đã kiểm tra gồm bật/tắt từng chế độ, lớp PNG của cảnh bị xóa, giữ lựa chọn chuyển cảnh nâng cao, đếm 153 cảnh, loại video nguồn, chỉnh tay và ngưỡng thời lượng. Giao diện được kiểm tra bằng HTML render từ component React; đây không phải kiểm tra trực quan trong trình duyệt.

```powershell
npm.cmd run test:smart-director
npm.cmd run benchmark:smart-director
npm.cmd run benchmark:smart-director -- --scenes 153
```

Benchmark mặc định tự tạo 3 cảnh và gửi FormData của giao diện qua compose API rồi chạy FFmpeg thật. Cảnh đầu được ghi 7,5 giây trên giao diện nhưng dài 8 giây theo SRT: lượt kiểm tra đã xác nhận số dự kiến là 0 Speed Paint, còn kết quả dựng là 1 Speed Paint và 2 Motion Director. PNG ở cảnh 2 được dựng khi cờ Motion Director riêng vẫn tắt. Video đầu ra đạt 1920×1080, 25 fps, đúng 350 khung hình/14 giây và vượt kiểm tra đồng bộ. Lượt này mất 17,6 giây, RAM lấy mẫu cao nhất 882 MiB, thư mục dựng khoảng 11 MiB.

Mỗi lượt tạo một thư mục riêng `public/outputs/smart-director-check-*`, giữ lại video, `render.log`, `timeline_report.json` và `benchmark.json` để đối chiếu. File benchmark ghi thời gian, RAM lấy mẫu, dung lượng thư mục, số cảnh dựng thực tế và số khung hình đã kiểm tra.

Trên Windows, RAM được lấy mẫu mỗi 2 giây, gồm tiến trình điều phối và các tiến trình Node/FFmpeg/ffprobe/cmd mới xuất hiện; tiến trình tồn tại trước lượt chạy được loại ra. Không khởi chạy một lượt dựng khác đồng thời khi đo. Phép đo có thể bỏ lỡ đỉnh RAM rất ngắn và không bao gồm bộ nhớ của máy chủ Next đang chạy sẵn. Trên hệ điều hành khác, chỉ đo RSS của tiến trình Node điều phối. Dung lượng là toàn bộ thư mục của lượt thử, gồm tài nguyên đầu vào, file trung gian và video cuối.

Dữ liệu thử là ảnh đồ họa tổng hợp lặp lại và âm thanh im lặng. Kết quả giúp kiểm tra luồng dựng và quy mô số cảnh, không đại diện cho mọi dự án có ảnh phức tạp, phụ đề đốt vào video, nhiều PNG hoặc hiệu ứng nâng cao. Chưa có phép đo trước/sau để tuyên bố tăng tốc.
