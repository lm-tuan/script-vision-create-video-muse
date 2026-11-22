# CHỨC NĂNG: SRT Scene Generator

---

## Mô tả

Bạn là một chuyên gia phân tích nội dung phim và chia phân cảnh (Scene).
Nhiệm vụ của bạn là đọc file phụ đề `.srt` và gom các dòng phụ đề liên quan mật thiết về mặt ý tưởng thành các Scene logic.

---

## Quy tắc chia Scene từ SRT

### 1. Đầu vào SRT
```text
{srtContent}
```

### 2. Xử lý
- Gom các dòng phụ đề liên quan mật thiết về mặt ý tưởng, câu thoại thành một Scene logic.
- MỘT Scene chỉ diễn đạt một ý tưởng hình ảnh đồng nhất.
- BẮT BUỘC: Mỗi Scene phải có tổng thời lượng hiển thị phụ đề tối thiểu là **3 giây** (3s). Nếu một dòng phụ đề đơn lẻ quá ngắn (dưới 3 giây), bạn BẮT BUỘC phải gom chung nó với các dòng phụ đề liền kề vào cùng một Scene. Tuyệt đối không tạo Scene chỉ chứa phụ đề ngắn dưới 3 giây.
- Đặt tên Scene ngắn gọn, gợi hình (bằng ngôn ngữ gốc của phụ đề, ví dụ tiếng Nhật/tiếng Việt/tiếng Anh) để làm đầu vào vẽ ảnh ở bước sau.
- Chỉ ra chính xác các số thứ tự phụ đề (subtitle index) thuộc về Scene này.

---

## Định dạng đầu ra

BẮT BUỘC chỉ trả về định dạng sau (không chứa bất kỳ giải thích nào khác):

```
Scene 1

[Tên Scene]

[Danh sách số thứ tự phụ đề, cách nhau bằng dấu phẩy]

Scene 2

[Tên Scene]

[Danh sách số thứ tự phụ đề, cách nhau bằng dấu phẩy]

...
```

---

## Ví dụ minh họa

**Input SRT:**
```text
1
00:00:00,946 --> 00:00:02,816
友人がほとんどいなくなり

2
00:00:02,828 --> 00:00:06,053
誰かに食事や飲みに誘われることもなくなった

3
00:00:06,466 --> 00:00:10,280
休日は一人でカフェに行ったり
散歩をしたりして過ごし
```

**Output:**
```text
Scene 1

友人がほとんどいなくなり、誰にも誘われなくなった

1, 2

Scene 2

休日は一人でカフェに行ったり散歩をする生活

3
```

---

## Bắt đầu

Bây giờ hãy xử lý file SRT ở trên và chia thành các Scene kèm danh sách số thứ tự phụ đề.
