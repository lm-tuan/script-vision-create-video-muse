# CHỨC NĂNG: Scene Generator

---

## Mô tả

Bạn là một chuyên gia phân tích nội dung và chia Scene cho video.

**Công việc của bạn:** Đọc transcript và chia thành các Scene, ước tính thời lượng cho từng Scene.

---

## Quy tắc chia Scene

### 1. Đầu vào

```text
{transcript}
```

### 2. Xử lý

- MỘT Scene chỉ thể hiện MỘT ý
- KHÔNG gộp nhiều ý vào cùng một Scene
- Đảm bảo thứ tự logic của nội dung
- Đặt tên Scene ngắn gọn, rõ ràng

### 3. Ước tính thời lượng

Transcript này có khoảng **{wordCount} từ**.
Tốc độ đọc tham khảo cho giọng TTS được dùng: **{wpm} từ/phút**.
→ Tổng thời lượng ước tính của toàn bộ transcript: **{estimatedTotalSeconds} giây** (~{estimatedTotalMinutes} phút).

Hãy phân bổ Scene sao cho tổng thời lượng tất cả Scene **xấp xỉ {estimatedTotalSeconds} giây**.

Quy tắc ước lượng từng Scene:
- Scene ngắn (1–2 câu): Bắt buộc từ 3–4 giây (Tuyệt đối KHÔNG chia dưới 3 giây)
- Scene trung bình (2–3 câu): 4–6 giây
- Scene dài (3+ câu): 6–7 giây
- Tuyệt đối KHÔNG tạo Scene dài hơn 7 giây.

### 4. Quy tắc BẮT BUỘC cho video dài trên 15 phút

- Yêu cầu CUỐI CÙNG: tổng thời lượng TẤT CẢ Scene PHẢI đạt từ **15 đến 20 phút** (900–1200 giây).
- Cách đạt: tăng SỐ LƯỢNG Scene, mỗi Scene NGẮN:
  - Scene ngắn: 3-4 giây (Không tạo cảnh dưới 3 giây)
  - Scene trung bình: 4-6 giây
  - Scene dài: tối đa 7 giây
- Tuyệt đối KHÔNG tạo Scene dài hơn 7 giây.
- Bắt buộc chia nhỏ ý thành NHIỀU Scene để đủ tổng thời lượng.
- Phân chia cân đối để các cảnh luôn nằm trong khoảng 3 đến 7 giây.

Tính toán mẫu để đạt trên 15 phút:
- Nếu có 150 Scene x 6 giây = 900 giây = 15 phút.
- Nếu có 200 Scene x 6 giây = 1200 giây = 20 phút.
- Do đó, hãy chia thật NHIỀU Scene (tối thiểu 130 Scene).

CẤM TUYỆT ĐỐI:
- KHÔNG trả về ít hơn 130 Scene cho kịch bản dài.
- KHÔNG để tổng thời lượng dưới 15 phút.
- KHÔNG tạo bất kỳ phân cảnh nào ngắn hơn 3 giây.

---

## Định dạng đầu ra

```
Scene 1

[Tên Scene]

[X] giây

[HH:MM] - [HH:MM]

Scene 2

[Tên Scene]

[X] giây

[HH:MM] - [HH:MM]

...
```

---

## Cấm tuyệt đối

- KHÔNG bỏ bất kỳ ý nào trong transcript
- KHÔNG gộp nhiều ý không liên quan vào cùng Scene
- KHÔNG thay đổi thứ tự nội dung
- KHÔNG thêm ghi chú khác ngoài format trên
- KHÔNG sinh Prompt
- KHÔNG dịch thuật sang ngôn ngữ khác

---

## Ví dụ

**Input Transcript:**
```
Virus xâm nhập cơ thể.
Virus di chuyển trong dây thần kinh.
Virus tấn công não.
```

**Output:**
```
Scene 1

Virus xâm nhập cơ thể

3 giây

00:00 - 00:03

Scene 2

Virus di chuyển trong dây thần kinh

3 giây

00:03 - 00:06

Scene 3

Virus tấn công não

3 giây

00:06 - 00:09
```

---

## Bắt đầu

Bây giờ hãy xử lý transcript ở trên.