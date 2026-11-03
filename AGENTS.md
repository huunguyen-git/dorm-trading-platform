# Làm việc trong repo Nhóm 14

## Hướng dẫn đầu phiên

Trong tin nhắn đầu tiên gửi người dùng ở mỗi phiên làm việc mới của repo, agent hiển thị nguyên văn bốn bước dưới đây, rồi tiếp tục xử lý yêu cầu đã nhận. Chỉ hiển thị một lần mỗi phiên, trừ khi người dùng muốn xem lại.

1. **Nêu điều bạn muốn làm được.** Ví dụ “Là người bán, tôi muốn hủy giữ chỗ trước khi báo đã giao.”
2. **Chốt thế nào là đạt.** Agent nêu một ví dụ về kết quả mong đợi. Bạn có thể sửa nếu agent hiểu sai.
3. **Xem kết quả.** Agent tự kiểm tra, chỉ bạn cách xem hoặc thử kết quả và nói rõ phần chưa kiểm chứng.
4. **Nhận bàn giao.** Agent cập nhật tài liệu liên quan, gửi đường dẫn và nêu việc còn lại. Bạn có thể gõ `/wrap` để nhận bàn giao giữa chừng.

Agent tự đối chiếu yêu cầu với mã task trong [roadmap](docs/02-roadmap-todo.md). Đọc [ngữ cảnh sản phẩm](docs/00-context.md) để xác định actor và UC, rồi đọc phần liên quan trong [kiến trúc](docs/01-architecture.md). Với việc chuẩn bị quy trình ngoài 30 task, ghi rõ đó là đầu ra hỗ trợ trong mục bàn giao.

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
- Trước mỗi lần bàn giao, cập nhật trạng thái và kết quả vào roadmap. Đối chiếu thay đổi thực tế với từng tài liệu liên quan: sửa ngữ cảnh và đặc tả khi đổi nghiệp vụ, sửa kiến trúc và hướng dẫn sử dụng khi đổi cách hệ thống hoạt động, ghi quyết định kỹ thuật cùng lý do khi có lựa chọn mới. Kiểm tra các liên kết và ví dụ còn đúng.
- Chuyển task sang **Chờ review** khi đã bàn giao. Đánh dấu **Hoàn thành** sau khi tiêu chí đạt, tài liệu liên quan đã đồng bộ và kết quả review được ghi nhận.
- Khi kết thúc hoặc nhận `/wrap`, `/done`, `sync docs`, trả lời ngắn theo mẫu **kết quả · cách xem/thử · tài liệu đã cập nhật · việc còn lại**. Nêu rõ phần chưa kiểm chứng. Mã commit và lệnh đã chạy dành cho người cần tra cứu kỹ thuật, chỉ đưa vào tin nhắn khi được hỏi.
