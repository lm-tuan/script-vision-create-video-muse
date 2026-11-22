# Kế hoạch tối ưu tốc độ tạo Prompts qua API local và đánh giá tác động

Ngày lập: 2026-11-05.

Trạng thái: đã triển khai cấu hình/log/validation và các chế độ compact/progressive dưới dạng opt-in. Batch mặc định vẫn 5, compact/progressive mặc định tắt. Đã có benchmark AI thật và kiểm thử; xem mục 8. Các mục 2–7 ghi lại baseline và kế hoạch ban đầu để đối chiếu.

## 1. Mục tiêu và phạm vi

- Giảm thời gian từ tab **Thời lượng → Tạo Prompts** khi chọn provider `local`.
- Giữ chất lượng mô tả, số ảnh theo nội dung, ngôn ngữ và độ chính xác timeline.
- Giảm công việc làm lại nếu một nhóm cảnh gặp lỗi.
- Đợt đầu chỉ thay đổi nhánh local của endpoint prompt; giữ hợp đồng JSON hiện có.
- Chưa thay model, reasoning, cơ chế CLI, giới hạn chạy đồng thời hoặc parser dùng chung.

Không cam kết phần trăm tăng tốc trước khi có số đo. Tăng số cảnh mỗi lượt có thể giảm chi phí lặp nhưng cũng làm tăng thời gian và rủi ro của từng lượt.

## 2. Baseline trước thay đổi đã xác minh

| Thành phần | Hành vi hiện tại | Ý nghĩa |
|---|---|---|
| `hooks/useScriptVisionState.ts`, `handleGeneratePrompt` | Nhánh local gửi toàn bộ durations qua một request `/api/prompt` | Một HTTP request không đồng nghĩa một lượt AI |
| `app/api/prompt/route.ts` | Chia thành nhóm 5 cảnh, gọi từng nhóm tuần tự | 60 cảnh tạo 12 lượt chạy |
| `services/localAi.ts` | Dùng hàng đợi Promise dùng chung trong module, kiểm tra health và polling mỗi 1.500 ms | Các lời gọi đi qua module được tuần tự hóa; polling có thêm độ trễ nhận kết quả |
| `tools/local-api/server.mjs` | Mỗi job khởi chạy `codex exec` mới; chỉ cho một job hoạt động | Có chi phí khởi tạo lặp; request cạnh tranh có thể nhận HTTP 409 |
| `templates/prompt.md` | Yêu cầu 1–3 ảnh/cảnh và 40–80 từ/ảnh, kèm phong cách và timestamp | Khối lượng đầu ra thay đổi đáng kể theo nội dung |
| Tùy chọn `sendTranscript` | Mặc định tắt; khi bật, nhánh local hiện đưa toàn bộ transcript vào từng nhóm backend | Có thể đọc lại ngữ cảnh dài nhiều lần |
| Kết quả từng nhóm | Giữ trong mảng backend, chỉ trả sau khi tất cả nhóm hoàn tất | Nhóm cuối lỗi khiến kết quả trước đó chưa được trả về UI |
| Retry local | `callWithRetry` chỉ thực hiện một lần với local | Chậm không phải do wrapper này tự retry nhiều lần |

`max_tokens` trong `services/ai.ts` thuộc nhánh API khác; nhánh local gọi `callLocalAI` trước khi tính giới hạn này. Không dùng việc chỉnh giá trị đó làm giải pháp tăng tốc local.

README hiện mô tả Prompts local không chia batch, khác với backend thực tế. Cần sửa tài liệu khi triển khai.

## 3. Đánh giá impact

**Kết luận: có phạm vi ảnh hưởng khi triển khai; chưa đủ cơ sở kết luận “không impact”.** Có thể giảm rủi ro bằng cách giới hạn thay đổi theo provider và triển khai theo từng giai đoạn.

| Thay đổi dự kiến | Luồng chịu ảnh hưởng | Mức rủi ro | Cách kiểm soát |
|---|---|---|---|
| Nhóm local từ 5 lên 10 cảnh | Tạo prompt thủ công, sửa đồng bộ và pipeline trong hook cùng gọi `/api/prompt` | Trung bình | Cấu hình riêng local; kiểm tra đủ cảnh và số ảnh; cho phép về 5 |
| Thêm log theo nhóm | Endpoint prompt và log server | Thấp | Log số lượng/kích thước/thời gian; không log nội dung transcript hoặc thông tin xác thực |
| Rút gọn template dùng chung | Cả local, provider khác tại `/api/prompt`; `/api/generate/stream` cũng đọc `templates/prompt.md` | Trung bình–cao | Ưu tiên template riêng local, không sửa trực tiếp template chung trong đợt đầu |
| Cắt transcript theo nhóm | Ngữ nghĩa cảnh, nhân vật, chủ thể và tính nhất quán giữa nhóm | Trung bình–cao | Ghép theo timestamp khi có ánh xạ; giữ ngữ cảnh chung; không có ánh xạ tin cậy thì giữ toàn văn |
| Đổi JSON sang streaming | Mọi caller đang dùng `response.json()` | Cao | Làm endpoint hoặc chế độ opt-in riêng; giữ endpoint JSON tương thích |
| Lưu kết quả và chạy tiếp | State UI, tạo mới, sửa đồng bộ, pipeline; ảnh đã sinh từ prompt cũ | Cao | Gắn phiên bản đầu vào, chống kết quả cũ ghi đè, chỉ thay cảnh mục tiêu |
| Chuyển timestamp/phong cách sang code | Parser, ngôn ngữ, phân bố ảnh, export và dựng video | Cao | Tách thành giai đoạn sau; giữ `PromptEntry`/`SubPrompt` và kiểm tra timeline |
| Chạy nhiều job local | Mọi bước AI văn bản dùng hàng đợi/server local | Cao | Chưa thực hiện; cần thiết kế lại cả hàng đợi và server |

### Những phụ thuộc cần giữ tương thích

- `generatePromptsForBatch` được gọi từ tạo prompt thủ công, kiểm tra/sửa đồng bộ và luồng tạo toàn bộ trong hook. Thay request/response phải rà lại cả ba.
- `core/prompt/PromptParser.ts` dùng chung ở `/api/prompt`, `/api/generate` và `/api/generate/stream`; không đổi định dạng đầu ra tùy tiện.
- Giữ cấu trúc `PromptEntry { sceneNumber, prompts }` và `SubPrompt { imageNumber, timeRange, prompt }` trong `types/index.ts`.
- Sinh ảnh, storyboard và dựng video có thể chịu ảnh hưởng gián tiếp nếu nội dung prompt, số ảnh, ID ảnh hoặc thời gian thay đổi.
- Không đổi số cảnh, thứ tự ảnh hay mốc thời gian để đạt tốc độ nhanh hơn.
- Độ dài prompt dưới 10 từ hiện chỉ được cảnh báo; validation hiện tại chưa chứng minh đầy đủ chất lượng hoặc phát hiện mọi trường hợp trùng ảnh/cảnh.
- `validateTimeRanges` kiểm tra khoảng ảnh bên trong cảnh; cần kiểm tra riêng điểm đầu/cuối so với cảnh cha, không chỉ dựa vào số issue bằng 0.

### Vấn đề sẵn có cần lưu ý khi thiết kế

Trong `/api/prompt`, biến `shouldAutoAppendSuffix` được tính theo ngôn ngữ nhưng chưa được dùng để chặn việc nối suffix. Do đó có nguy cơ nối phong cách gốc vào prompt ngôn ngữ khác. Đây là vấn đề có sẵn, không phải hậu quả của tăng batch; cần ghi nhận riêng để tránh quy lỗi cho tối ưu tốc độ hoặc mở rộng phạm vi sửa ngoài dự kiến.

## 4. Kế hoạch triển khai

### Giai đoạn A — Đo baseline

1. Chuẩn bị bộ dữ liệu cố định: ít cảnh, nhiều cảnh, cảnh nhiều hành động, phong cách dài, ngôn ngữ khác tiếng Anh.
2. Đo cấu hình hiện tại 5 cảnh/nhóm, tách trường hợp bật/tắt transcript.
3. Bổ sung log nếu thiếu: số thứ tự nhóm, scene IDs, số ký tự đầu vào, số ảnh đầu ra, thời gian và lỗi validation. Tận dụng token usage nếu CLI có trả; không suy ra token từ ký tự như số liệu chính xác.
4. Ghi tổng thời gian và thời gian từng lượt; tách thời gian hàng đợi nếu có tác vụ khác.
5. Đối chiếu nhiều lượt trong điều kiện tương đương, tối thiểu 3 lượt mỗi cấu hình nếu quota cho phép. Báo cả độ dao động và tỷ lệ lỗi.

Đầu ra: bảng baseline và dữ liệu để phân biệt chi phí lặp với thời gian sinh nội dung. Benchmark gọi AI chỉ thực hiện khi triển khai, không thuộc lần viết tài liệu này.

### Giai đoạn B — Cho phép điều chỉnh số cảnh mỗi nhóm

File chính: `app/api/prompt/route.ts`.

1. Thêm biến cấu hình phía Next.js, tên đề xuất `LOCAL_PROMPT_BATCH_SIZE`.
2. Đọc số nguyên dương, giới hạn phạm vi hợp lý; giá trị sai phải fallback an toàn về 5.
3. Giữ mặc định 5 trong lần đưa cấu hình vào; dùng giá trị 10 để benchmark. Chỉ đổi mặc định sau khi đạt tiêu chí.
4. Giữ xử lý tuần tự, hợp đồng JSON, scene IDs và timestamp hiện tại.
5. Kiểm tra kết quả mỗi nhóm: thiếu/thừa cảnh, prompt rỗng, trùng image IDs, thời gian không hợp lệ.
6. Chưa tự chia lại nhóm hoặc retry khi lỗi; mọi chính sách mới phải rõ ràng để tránh tăng thời gian và quota ngoài dự kiến.

Đầu ra: cấu hình 5/10 có thể so sánh và rollback. Batch theo số ảnh/token dự kiến là bước tiếp theo nếu dữ liệu cho thấy số cảnh chưa phản ánh đúng tải.

### Giai đoạn C — Tối ưu đầu vào riêng local

1. Tạo template local riêng nếu cần rút gọn; giữ template dùng chung cho provider khác và các endpoint khác.
2. Giữ yêu cầu 40–80 từ/ảnh, 1–3 ảnh theo nội dung, ngôn ngữ và quy tắc timeline để so sánh công bằng.
3. Rút gọn chỉ dẫn/ví dụ lặp nhưng giữ hợp đồng đầu ra parser đang hỗ trợ.
4. Request hiện tại chỉ có transcript và durations, chưa có ánh xạ SRT cho từng đoạn. Nếu dùng SRT để cắt ngữ cảnh, phải thiết kế dữ liệu bổ sung và cập nhật caller trước.
5. Không cắt bằng tỷ lệ số cảnh như một ánh xạ chính xác; khi không đủ dữ liệu, giữ transcript hiện tại.
6. Giữ ngữ cảnh chung cần thiết về nhân vật, chủ thể, bối cảnh; kiểm tra tính nhất quán qua ranh giới nhóm.

Đầu ra: so sánh chất lượng/tốc độ với giai đoạn B. Chưa chuyển timestamp hoặc dịch/ghép phong cách hoàn toàn sang code.

### Giai đoạn D — Tiến độ thật và tiếp tục khi lỗi

Thực hiện sau khi B/C ổn định; đây là thay đổi kiến trúc riêng.

1. Chọn endpoint job hoặc streaming opt-in; giữ `/api/prompt` JSON cho caller cũ.
2. Trả/lưu kết quả nhóm đã validation; trạng thái phải phân biệt chạy, hoàn tất một phần, lỗi và hoàn tất đầy đủ.
3. Dùng ID tác vụ và dấu vân tay dữ liệu gồm durations, transcript thực gửi, ngôn ngữ, phong cách, provider và phiên bản template/cấu hình liên quan.
4. Khi đầu vào đổi, không tự dùng kết quả cũ. Chặn response của tác vụ cũ ghi đè state mới.
5. Chạy tiếp chỉ gửi cảnh thiếu/lỗi; merge theo scene ID, giữ các cảnh hoàn thành và xử lý ảnh liên quan nếu prompt bị thay.
6. Quy định rõ lưu trong bộ nhớ hay bền vững; bộ nhớ không bảo đảm khôi phục sau restart/reload.
7. Cập nhật đầy đủ tạo thủ công, sửa đồng bộ và pipeline trong hook nếu chuyển sang giao thức mới.

Đầu ra: người dùng thấy tiến độ và không phải tạo lại cảnh đã thành công. Cải thiện thời gian nhận kết quả đầu tiên và thời gian khôi phục; không mặc định coi là giảm thời gian AI tổng.

### Giai đoạn E — Tài liệu và rollout

- Cập nhật `README.md`, `INSTALL.md`: mô tả đúng batch backend, cấu hình phía Next.js và cách rollback.
- Phân biệt cấu hình ứng dụng với cấu hình server local; không đặt biến batch vào server CLI rồi kỳ vọng Next.js tự đọc.
- Ghi số liệu đo, cấu hình đã chọn và hạn chế còn lại vào tài liệu này.
- Chưa triển khai song song hoặc đổi model trong phạm vi đề xuất ban đầu.

## 5. Kiểm thử cần thực hiện khi có code

| Nhóm kiểm tra | Trường hợp | Kỳ vọng |
|---|---|---|
| Chia nhóm local | 1, 5, 6, 10, 11 và 60 cảnh; ID không liên tiếp | Đúng số lượt và scene IDs, không thêm/bỏ/đánh lại số |
| Cấu hình | Không đặt, giá trị 5/10, chữ, 0, âm, quá lớn | Fallback/giới hạn đúng quy định |
| Validation | Thiếu/thừa cảnh, prompt rỗng, trùng Image, đầu ra bị cắt | Không báo hoàn tất đầy đủ cho dữ liệu lỗi |
| Timeline | 1–3 ảnh, mili-giây, cảnh sát giới hạn 3 giây, cảnh ngắn hơn 3 giây | Không vượt cảnh cha, không tạo khoảng âm; quy định rõ trường hợp không thể đạt tối thiểu |
| Ngữ cảnh | Bật/tắt transcript; có/không ánh xạ SRT; nhân vật xuất hiện nhiều nhóm | Không mất hành động/chủ thể hoặc thay nhân vật |
| Ngôn ngữ/phong cách | Anh, Việt và ít nhất một ngôn ngữ không tách từ bằng khoảng trắng; custom style | Đúng ngôn ngữ/phong cách; không dựa riêng vào đếm từ |
| Caller | Thủ công, kiểm tra đồng bộ, pipeline trong hook | Response tương thích, state/loading/error đúng |
| Hồi quy | Provider khác và `/api/generate/stream` | Giữ hành vi khi chỉ bật tối ưu local |
| Downstream | Sinh ảnh, export prompt, storyboard và dựng video mẫu | ID, thứ tự ảnh và timeline tương thích |
| Khôi phục (D) | Nhóm cuối lỗi, đổi đầu vào khi đang chạy, reload/restart | Giữ đúng kết quả hợp lệ theo cam kết lưu trữ; không ghi đè dữ liệu mới |

Thêm test tập trung cho chia nhóm/validation và mock AI để kiểm tra hợp đồng, không gọi AI thật trong test tự động. Chạy `npm run lint`, `npx tsc --noEmit`, `npm run build` khi triển khai; ghi nhận lỗi baseline nếu có. Chạy `npm run test:local-api` nếu thay adapter/server; bộ test server này không thay thế kiểm thử endpoint prompt. Chỉ chạy thêm kiểm thử downstream tương ứng phạm vi thực tế.

## 6. Tiêu chí chấp nhận và rollback

- Chỉ chọn batch 10 khi số đo lặp cho thấy giảm thời gian và không làm tăng tỷ lệ thiếu cảnh, lỗi định dạng/timeline hoặc giảm chất lượng rõ rệt.
- Không tuyên bố tối ưu thành công nếu nhanh hơn do bỏ cảnh, giảm ảnh hoặc giảm chất lượng mô tả.
- Giai đoạn B/C giữ JSON response và kiểu dữ liệu downstream.
- Rollback B bằng cấu hình về 5; rollback C bằng template/context cũ; thiết kế D cần công tắc dùng lại luồng JSON trước rollout.
- Với thay đổi mới thất bại, giữ nguyên kết quả đã hợp lệ theo chính sách D, không tự gọi provider khác hoặc lặp vô hạn.

## 7. Khuyến nghị quyết định

Triển khai A và B trước, sau đó C nếu số liệu cho thấy đầu vào lặp đáng kể. D thực hiện riêng vì phạm vi tác động lớn hơn. Việc tính timestamp/phong cách bằng code và chạy nhiều job để giai đoạn sau, cần đánh giá thiết kế riêng.

Kết luận rà soát hiện tại: chưa phát hiện yêu cầu phải thay cấu trúc dữ liệu downstream cho A/B; template chung, cắt ngữ cảnh và giao thức streaming là các điểm có nguy cơ hồi quy rõ ràng. Đây là nhận định tĩnh, không phải xác nhận an toàn sau kiểm thử.

## 8. Kết quả triển khai và đánh giá sau thay đổi

### Phạm vi đã làm

- A/B: tách xử lý local vào `services/localPromptGeneration.ts`; cấu hình batch 1–15, fallback 5; log theo job/nhóm, số ký tự, thời gian, số ảnh, cảnh và cảnh báo prompt ngắn. Adapter ghi riêng thời gian chờ hàng đợi.
- Validation local kiểm tra đầu vào trước khi gọi AI, đủ/đúng scene IDs, không trùng hoặc sai thứ tự Image, tối đa 3 ảnh, timestamp SRT hợp lệ, khớp đầu/cuối cảnh cha, liên tục và tối thiểu 3 giây/ảnh. Cảnh cha dưới 3 giây chấp nhận đúng một ảnh phủ toàn cảnh.
- C: thêm `templates/prompt_local.md`, chỉ dùng khi `LOCAL_PROMPT_COMPACT_TEMPLATE=1`. Giữ template chung cho provider khác và `/api/generate/stream`. Giữ đầy đủ transcript vì request chưa có ánh xạ tin cậy để cắt theo timestamp. Chưa chuyển timestamp/phong cách sang code.
- D: `LOCAL_PROMPT_PROGRESSIVE=1` và request `stream:true` bật NDJSON trên endpoint hiện tại. Caller không opt-in vẫn nhận JSON. UI local hỗ trợ cả hai loại response, hiển thị kết quả/tiến độ từng nhóm, giữ phần hợp lệ khi lỗi, và gửi khóa tiếp tục khi bấm tạo lại cùng dữ liệu.
- Khóa phiên ngẫu nhiên được gắn với SHA-256 của prompt đã render (gồm transcript, ngôn ngữ/phong cách và template), batch size, phiên bản logic và endpoint local. Sai đầu vào/cấu hình hoặc hết phiên thì báo tạo mới, không reuse ngầm.
- Phiên chỉ lưu trong bộ nhớ tiến trình Next.js, tối đa 8 phiên và 2 triệu ký tự đầu ra/phiên; hết hạn sau 30 phút không hoạt động. Phiên hoàn tất có thể bị thu hồi khi đầy. Khóa client chỉ tồn tại trong lần mount UI; không hỗ trợ phục hồi qua reload, restart/hot reload hoặc nhiều worker.
- Tạo thủ công, sửa đồng bộ và pipeline trong hook đều đi qua client tương thích JSON/NDJSON. Nếu pipeline lỗi bước prompt, có thể tiếp tục từ tab Thời lượng mà không tạo lại transcript/duration.
- Chặn phản hồi cũ khi đầu vào đổi; chặn sửa/sinh ảnh/áp dụng prompt đang tạo hoặc chưa hoàn tất. Khi áp dụng progressive hoàn tất, bỏ ánh xạ ảnh/layer không còn khớp prompt/timeline và bản video đã dựng không còn hợp lệ; không xóa file gốc.
- E: cập nhật README, INSTALL, `.env.local.example`, lệnh test và benchmark. Không sửa `.env.local` đang dùng của người dùng.

### Benchmark AI thật

Lệnh: `npm run benchmark:local-prompts -- --live --compact`.

Bộ mẫu: 6 cảnh tiếng Việt có cảnh tĩnh và nhiều hành động, mỗi cảnh 9 giây, prompt đầu ra tiếng Anh, không gửi transcript; 3 lượt cho mỗi cấu hình, đổi thứ tự thử giữa các lượt. Đây là baseline so sánh batch 5/10 trên code mới, không phải số đo phiên bản cũ trước khi triển khai.

| Cấu hình | Trung bình | Thấp nhất–cao nhất | Thành công | Số ảnh |
|---|---:|---:|---:|---:|
| Batch 5, template gốc | 41,523 giây | 37,901–44,017 giây | 3/3 | 10/lượt |
| Batch 10, template gốc | 40,469 giây | 33,382–44,039 giây | 3/3 | 10–11/lượt |
| Batch 10, template compact | 36,944 giây | 33,420–39,337 giây | 3/3 | 10/lượt |

Cả 9 lượt trả đủ 6 cảnh và không có issue timeline theo validation. Trong bộ mẫu, batch 10 riêng giảm trung bình khoảng 2,5%; kết hợp compact khoảng 11,0% so với batch 5. Độ dao động đáng kể và số ảnh có biến thiên; chưa chứng minh tốc độ/chất lượng trên video dài hoặc mọi ngôn ngữ. Không suy ra “nhanh gấp đôi” từ việc giảm số lượt CLI. Giữ mặc định 5 và các tối ưu tùy chọn tắt cho đến khi thử thêm dữ liệu đại diện và đánh giá nội dung/ảnh thực tế.

Dữ liệu gốc: [local-prompt-benchmark-results.json](local-prompt-benchmark-results.json). Script chỉ lưu số đo/cấu trúc, không lưu nội dung prompt/transcript. Có thể dùng fixture request JSON riêng để đo trên dữ liệu khác; lần chạy sau sẽ ghi đè báo cáo.

### Impact đã xác định

| Hạng mục | Kết quả/giới hạn |
|---|---|
| Provider khác | Nhánh local và template mới được cô lập; hợp đồng provider khác được kiểm tra bằng mock. Chưa gọi dịch vụ provider khác thật |
| API JSON cũ | Giữ trường `success`, `prompts`, `raw`, `provider`, `timeValidation`; local có thêm `localMetrics` |
| Parser và kiểu downstream | Giữ nguyên parser chung và `PromptEntry`/`SubPrompt`; kiểm tra áp dụng sang dữ liệu ảnh trong hook |
| Timeline local | Thay đổi có chủ đích: kết quả sai bị từ chối ngay theo nhóm, thay vì có thể tự sửa/chặt bớt ảnh rồi trả thành công như trước. Có thể tăng số lỗi được báo nếu model trả timestamp sai |
| Ngôn ngữ local | Sửa riêng local: không nối suffix gốc khác ngôn ngữ vào prompt đã dịch. Hành vi nối suffix của provider khác chưa thay đổi |
| Chế độ progressive | Tắt mặc định; mất kết nối có thể phải chờ job/nhóm hiện tại hoàn tất trước khi resume. Server dừng các nhóm tiếp theo khi biết kết nối đã đóng |
| File/ảnh cũ | Không xóa file. Khi áp dụng kết quả progressive, ánh xạ ảnh/layer đã lỗi thời bị bỏ có chủ đích; phải gán/sinh lại các ảnh đó |
| Cấu hình server CLI | Không đổi model, reasoning, sandbox, giới hạn đồng thời hay cơ chế `codex exec` |
| UI/render thực tế | Chưa chạy kiểm thử tương tác trình duyệt hay dựng video thật từ ảnh AI mới; kiểm thử hook/compose và build không thay thế các bước này |

### Kiểm tra

- `npm run test:local-prompts`: 15/15 qua; kiểm thử cấu hình, 1/5/6/10/11/60 cảnh, IDs không liên tiếp, timeline/ảnh trùng, phiên đang chạy/hết hạn, resume sau lỗi, đổi đầu vào/template/batch, ngắt kết nối, NDJSON chia byte UTF-8, JSON fallback, UI chặn dữ liệu chưa hoàn tất, các caller trong hook và áp dụng dữ liệu ảnh.
- `npm run test:local-api`: 8/8 qua; kiểm tra hợp đồng server, lỗi CLI, giới hạn request, quyền ghi, xác thực và hủy/chạy đồng thời.
- `npm run test:local-prompt-build -- <thư mục bản sao đã build>`: qua trên Next production qua HTTP thật; dùng server AI giả lập, kiểm tra cả polling adapter, stream nhận 5 cảnh trước lỗi nhóm cuối, resume chỉ gọi lại 1 cảnh và response JSON tương thích. Script tự đóng server khi chạy thành công, không dùng quota AI.
- `npx tsc --noEmit`: qua.
- `npm run test:smart-director`: qua; bao gồm request compose thực với mạng giả lập, giữ cấu hình transition và upload layer.
- `npm run lint` chưa có cấu hình nên yêu cầu thiết lập tương tác từ baseline. Đã chạy ESLint với cấu hình Next core-web-vitals tạm cho file thay đổi: không có lỗi; một cảnh báo dependency `useEffect` có sẵn trong hook, ngoài phạm vi sửa.
- Build thư mục gốc gặp `.next/trace` EPERM. Build bản sao source cùng ổ D đã compile, typecheck và sinh đủ 18 trang thành công. Bản sao khác ổ C thất bại do đường dẫn webpack Windows nên không dùng làm kết luận về source.

Kết luận: các kiểm thử đã chạy chưa phát hiện hồi quy ở hợp đồng/caller và dữ liệu ảnh/timeline được kiểm tra. Có các thay đổi hành vi local có chủ đích như trên; không khẳng định “không impact” tuyệt đối hoặc chất lượng hình ảnh tương đương khi chưa review ảnh thực tế. Rollback cấu hình tắt compact/progressive và đưa batch về 5; validation và sửa suffix local vẫn là thay đổi code, không bị tắt bằng các công tắc đó.
