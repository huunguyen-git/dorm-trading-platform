# Làm việc trong repo Nhóm 14

## Hướng dẫn đầu phiên

Trong tin nhắn đầu tiên gửi người dùng ở mỗi phiên làm việc mới của repo, agent hiển thị nguyên văn bốn bước dưới đây, rồi tiếp tục xử lý yêu cầu đã nhận. Chỉ hiển thị một lần mỗi phiên, trừ khi người dùng muốn xem lại.

1. **Giao việc.** Nêu mã task và kết quả bạn muốn kiểm tra. Ví dụ: “Làm P0-01 để hai ứng dụng dùng chung xác thực”.
2. **Kiểm tra phạm vi.** Trước khi sửa, xem agent định đổi file nào và sẽ kiểm tra kết quả bằng cách nào.
3. **Kiểm tra từng mốc.** Yêu cầu agent đưa mã commit, lệnh đã chạy, kết quả và phần còn thiếu.
4. **Nhận bàn giao.** Gõ `/wrap` để xem trạng thái trong roadmap và bước tiếp theo. Chỉ xác nhận hoàn thành sau khi đối chiếu kết quả với yêu cầu.

Mỗi lượt làm việc bắt đầu từ một mã task trong [roadmap](docs/02-roadmap-todo.md). Đọc [ngữ cảnh sản phẩm](docs/00-context.md) để xác định actor và UC, rồi đọc phần liên quan trong [kiến trúc](docs/01-architecture.md). Với việc chuẩn bị quy trình ngoài 30 task, ghi rõ đó là đầu ra hỗ trợ trong mục bàn giao.

## Nhận việc

1. Chạy `git status -sb` và `git log -3 --oneline`. Kiểm tra branch, file đang sửa và bản kế hoạch cục bộ. Bảo toàn thay đổi của thành viên khác. Dùng nhánh ngắn hạn dựa trên trunk của nhóm cho task mới.
2. Đọc dòng task, UC, hạn, người phụ trách và đầu ra đã bàn giao. Ghi mục tiêu, phạm vi file, phụ thuộc và phép kiểm tra vào spec hoặc kế hoạch hiện có. Với thay đổi nhiều tầng, dùng [mẫu spec](docs/specs/_template.md) tại `docs/specs/<task>.md`. Task hạ tầng dùng tiêu chí chạy lại được thay cho mã UC.
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

- Đối chiếu đủ đầu ra của task trên từng nền tảng, chạy các phép kiểm tra của [kiến trúc](docs/01-architecture.md) phù hợp với diff. Ghi tên test hoặc lệnh, kết quả thực tế, bước chưa chạy và lý do.
- Chuyển task sang **Chờ review** khi đã bàn giao. Đánh dấu **Hoàn thành** sau khi tiêu chí đạt và kết quả review được ghi nhận. Gắn PR, commit đã tồn tại hoặc đường dẫn spec chứa bằng chứng vào roadmap. Cập nhật kiến trúc khi đổi module, lệnh chuẩn, hợp đồng dùng chung hay cách triển khai.
- Khi nhận `/wrap`, `/done` hoặc `sync docs`, đối chiếu diff, đồng bộ tài liệu bị ảnh hưởng và bàn giao theo mẫu **task · trạng thái · bằng chứng · việc tiếp theo · người nhận**. Nếu dừng giữa task, ghi đúng bước còn thiếu. Tài liệu đã thay thế có thể lưu ở `docs/archive/` và trỏ tới bản hiện hành. Khi nhận việc, đọc bản hiện hành.
