# Làm việc trong repo Nhóm 14

## Hướng dẫn đầu phiên

Trong tin nhắn đầu tiên gửi người dùng ở mỗi phiên làm việc mới của repo, agent hiển thị nguyên văn bốn bước dưới đây, rồi tiếp tục xử lý yêu cầu đã nhận. Chỉ hiển thị một lần mỗi phiên, trừ khi người dùng muốn xem lại.

1. **Nêu điều bạn muốn làm được.** Ví dụ “Là người bán, tôi muốn hủy giữ chỗ trước khi báo đã giao.”
2. **Chốt thế nào là đạt.** Agent nêu một ví dụ về kết quả mong đợi. Bạn có thể sửa nếu agent hiểu sai.
3. **Xem kết quả.** Agent tự kiểm tra, chỉ bạn cách xem hoặc thử kết quả và nói rõ phần chưa kiểm chứng.
4. **Kiểm tra file bàn giao.** Mở file theo đường dẫn agent gửi (gõ `/wrap` nếu cần bàn giao giữa chừng).
   - **Mọi task:** Mở `docs/02-roadmap-todo.md`, tìm đúng task, xem trạng thái, kết quả và việc còn lại. Mở thử các file đầu ra đã hẹn ở bước 2.
   - **Task thay đổi nhiều tầng** (ví dụ cả app và API): Mở `docs/specs/<task>.md`, xem UC, mã yêu cầu, tiêu chí đạt và kết quả thử. Đối chiếu mã với `docs/03-requirements.md`.
   - **Khi đổi nghiệp vụ hoặc kiến trúc:** Xem quy tắc, vai trò mới trong `docs/00-context.md`; xem module, kết nối hoặc cách chạy mới trong `docs/01-architecture.md`, tùy phần thay đổi.
   - **Khi có quyết định kỹ thuật mới:** Kiểm tra có `docs/decisions/<task>-<chu-de>.md` ghi lựa chọn, lý do và tác động.

Agent tự đối chiếu yêu cầu với mã task trong [roadmap](docs/02-roadmap-todo.md). Đọc [ngữ cảnh sản phẩm](docs/00-context.md) để xác định actor và UC, rồi đọc phần liên quan trong [kiến trúc](docs/01-architecture.md). Với việc chuẩn bị quy trình ngoài 30 task, ghi rõ đó là đầu ra hỗ trợ trong mục bàn giao.

## Nhận việc

**Xác định căn cứ cho từng task trước khi sửa:**

- Lấy mã UC từ đúng dòng task trong roadmap. Đối chiếu actor, thao tác và thời điểm chuyển trạng thái với đặc tả UC. Với task hạ tầng hoặc tài liệu, ghi mục tiêu và UC bị tác động nếu có.
- Tra [danh mục yêu cầu](docs/03-requirements.md) theo tác vụ. Đọc nguyên mục FR, các điều kiện nghiệp vụ trong đó và NFR liên quan, kể cả khi NFR áp dụng cho nhiều UC. Ghi vào spec hoặc kế hoạch đang dùng chuỗi **task → UC/actor → mã yêu cầu và điều khoản → tình huống nghiệm thu**. Ví dụ P2-04 → UC-23, người bán chấp nhận → FR-08 và NFR-02 → hai lượt chấp nhận đồng thời qua hai tin có chung đồ vật chỉ tạo được một lượt giữ hiệu lực trên đồ vật đó.
- Nếu thiếu liên kết trực tiếp, ghi “chưa xác định” và căn cứ còn thiếu. Nếu task không tác động UC hoặc yêu cầu nào, ghi “không áp dụng” cùng lý do. Khi nguồn xung đột hoặc tiêu chí còn mở, ghi câu hỏi cho người phụ trách. Giữ nguyên trạng thái và ngưỡng của nguồn.

1. Chạy `git status -sb` và `git log -3 --oneline`. Kiểm tra branch, file đang sửa và bản kế hoạch cục bộ. Bảo toàn thay đổi của thành viên khác. Dùng nhánh ngắn hạn dựa trên trunk của nhóm cho task mới.
2. Đọc dòng task, UC, hạn, người phụ trách và đầu ra đã bàn giao. Khi nêu tiêu chí đạt, chỉ rõ file đầu ra người dùng sẽ nhận nếu có. Ghi mục tiêu, phạm vi file, phụ thuộc và phép kiểm tra vào spec hoặc kế hoạch hiện có. Với thay đổi nhiều tầng, dùng [mẫu spec](docs/specs/_template.md) tại `docs/specs/<task>.md`. Task hạ tầng dùng tiêu chí chạy lại được thay cho mã UC.
3. Đánh dấu **Đang thực hiện** khi bắt đầu. Nếu thiếu quyết định làm thay đổi hợp đồng hoặc hành vi người dùng, ghi câu hỏi và người giải quyết. Tiếp tục phần độc lập. Khi chọn phiên bản hoặc đổi ranh giới module, lưu lý do, tác động và phương án đã cân nhắc trong `docs/decisions/<task>-<chu-de>.md`.

## Phân việc và bàn giao

Một agent có thể đảm nhiệm lần lượt các vai trò dưới đây. Khi nhóm làm song song, người điều phối ghi rõ ai có quyền sửa từng vùng trên spec. Người phụ trách task trong workbook vẫn là đầu mối nghiệm thu.

| Vai trò | Phần việc | Bàn giao cho bước sau |
|---|---|---|
| Điều phối / phân tích | Chốt UC, actor, điều kiện đầu/cuối, ngữ nghĩa lỗi và ví dụ request/response. Phân vùng sửa backend, mobile, web hoặc infra. | Spec có tiêu chí đạt và danh sách phụ thuộc. Chỉ một đầu mối sửa hợp đồng API, roadmap hoặc cấp số migration ở cùng thời điểm. |
| Thực hiện | Viết phần được giao cùng test. Backend kiểm tra quyền và quyền sở hữu dữ liệu. Client dùng hợp đồng đã thống nhất, xử lý trạng thái thành công và lỗi. | Mã task, commit, phạm vi file, lệnh chạy và kết quả. Mọi thay đổi hợp đồng quay lại đầu mối để đồng bộ các client. |
| Review / tích hợp | Đọc diff theo UC. Thử actor sai, chuyển trạng thái sai và trường hợp đồng thời khi có liên quan. Với thay đổi xuyên tầng, thử một luồng qua client và API thật. | Ghi kết quả so với từng tiêu chí, lỗi còn mở và người nhận việc tiếp theo. |

## Chia commit theo tiến độ thực tế

Một commit bàn giao một kết quả có thể kiểm tra và hoàn tác riêng. Dùng `type(scope): <mã task> <kết quả>`. Giữ test trực tiếp của hành vi trong cùng commit với code. Nếu thay đổi nhỏ và có thể nghiệm thu trong một lần, dùng một commit.

Ví dụ dưới đây là thứ tự **dự kiến** cho P2-04. Chỉ tạo commit tương ứng khi đầu ra đã có.

| Mốc | Ví dụ commit | Điều kiện trước khi commit |
|---|---|---|
| Chốt hành vi | `docs(order): P2-04 define reservation transitions` | Spec nối UC-22/23/24 với actor, trạng thái và phản hồi khi đồ vật đã được giữ. |
| Bàn giao API | `feat(order): P2-04 accept reservations atomically` | Có API và test chứng minh hai yêu cầu cạnh tranh không cùng giữ được một đồ vật. Tách thêm commit cho gửi/hủy khi các thao tác có thể nghiệm thu riêng. |
| Bàn giao client | `feat(mobile): P2-04 handle reservation conflicts` | Mobile dùng đúng hợp đồng và có test cho trường hợp tin vừa được người khác giữ. |
| Nghiệm thu task | `test(order): P2-04 verify reservation flow` | Có kịch bản tích hợp mới và kết quả chạy. Nếu test đã nằm đủ trong các commit trên, ghi kết quả và cập nhật roadmap trong commit cuối. |

Trước mỗi commit, stage đúng file hoặc hunk của task, xem `git diff --cached` và chạy `git diff --cached --check`. Ghi lỗi còn chặn khi kiểm tra thất bại. Khi tạo PR, nêu mã task/UC, các commit theo mốc, lệnh đã chạy và cách người review tái hiện.

## Hoàn thành và chuyển phiên

- Đối chiếu kết quả với từng điều khoản FR/NFR và UC đã chọn. Chạy các phép kiểm tra của [kiến trúc](docs/01-architecture.md) phù hợp với thay đổi. Ghi kết quả thực tế, phần chưa kiểm chứng và lý do.
- Trước mỗi lần bàn giao, cập nhật dòng task trong roadmap (hoặc mục “Bàn giao hiện tại” cho việc hỗ trợ ngoài 30 task). Đối chiếu với danh sách ở bước 4 và sửa cả hướng dẫn sử dụng nếu thao tác đã đổi. Gửi đường dẫn thật cho từng file đầu ra và tài liệu liên quan, ghi **tạo mới** hoặc **cập nhật** và chỉ rõ mục người dùng cần xem. Nếu còn thiếu file đã hẹn, ghi vào việc còn lại.
- Chuyển task sang **Chờ review** khi đã bàn giao. Đánh dấu **Hoàn thành** sau khi tiêu chí đạt, tài liệu liên quan đã đồng bộ và kết quả review được ghi nhận.
- Khi kết thúc hoặc nhận `/wrap`, `/done`, `sync docs`, trả lời ngắn theo mẫu **kết quả · cách xem/thử · tài liệu đã cập nhật · việc còn lại**. Nêu rõ phần chưa kiểm chứng. Mã commit và lệnh đã chạy dành cho người cần tra cứu kỹ thuật, chỉ đưa vào tin nhắn khi được hỏi.
