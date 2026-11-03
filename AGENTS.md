# Làm việc trong repo Nhóm 14

## Hướng dẫn đầu phiên

Ở tin nhắn đầu của mỗi phiên, hiển thị bốn bước sau một lần rồi tiếp tục yêu cầu.

1. **Giao việc.** Nêu kết quả bạn muốn thấy.
2. **Chốt đầu ra.** Agent nêu ví dụ đạt yêu cầu và file sẽ bàn giao.
3. **Xem kết quả.** Agent tự kiểm tra, chỉ cách thử và nêu phần còn thiếu.
4. **Nhận bàn giao.** Mở `docs/02-roadmap-todo.md` xem trạng thái. Với việc nhiều tầng, mở `docs/specs/<task>.md` xem kết quả thử. Gõ `/wrap` để nhận bàn giao giữa chừng.

## Nhận việc

- Khi triển khai, xem `git status -sb`, `git log -3 --oneline`. Giữ thay đổi của thành viên khác. Task mới dùng nhánh ngắn hạn từ trunk.
- Tìm theo mã hoặc tên việc trong [roadmap](docs/02-roadmap-todo.md) bằng `rg -n`. Đọc dòng task và ghi chú bàn giao khớp mã. Việc hỗ trợ ngoài 30 task ghi ở mục **Bàn giao hiện tại**. Câu hỏi chỉ cần tra cứu thì dừng ở phần đủ để trả lời.
- Với nghiệp vụ, lấy UC từ task. Tìm actor/luồng trong [ngữ cảnh](docs/00-context.md) và đặc tả UC liên quan. Dùng bảng **Tra theo tác vụ** của [danh mục yêu cầu](docs/03-requirements.md), rồi đọc trọn **từng mục** FR/NFR liên quan, kể cả ghi chú và trạng thái. Với hạ tầng, tra mốc và phép kiểm tra tương ứng trong [kiến trúc](docs/01-architecture.md). Chỉ mở rộng sang mục khác khi có phụ thuộc hoặc thiếu căn cứ.
- Ghi **task → UC/actor hoặc mục tiêu hạ tầng → điều khoản → tình huống đạt** vào kế hoạch hiện có. Với thay đổi nhiều tầng, tạo hoặc cập nhật `docs/specs/<task>.md` theo [mẫu](docs/specs/_template.md). Ghi lý do nếu không áp dụng, ghi câu hỏi nếu thiếu hoặc mâu thuẫn. Giữ ngưỡng và trạng thái của nguồn.

## Thực hiện và bàn giao

- Đánh dấu **Đang thực hiện** khi bắt đầu. Nếu chia việc, ghi vùng sửa của từng người trong spec và chọn một đầu mối cho API, migration và roadmap. Người phụ trách task nhận kết quả review.
- Mỗi commit là một đầu ra kiểm chứng được, kèm test của hành vi. Dùng `type(scope): <mã task> <kết quả>`. Stage đúng phần việc, xem diff đã stage và chạy `git diff --cached --check`. PR ghi task/UC, các mốc và cách tái hiện.
- Kiểm tra luồng chính và ngoại lệ theo điều khoản đã chọn. Khi bàn giao hoặc nhận `/wrap`, `/done`, `sync docs`, cập nhật roadmap và spec bằng kết quả thực tế. Sửa ngữ cảnh, yêu cầu, kiến trúc hoặc hướng dẫn dùng nếu phần tương ứng thay đổi. Quyết định kỹ thuật mới ghi lựa chọn, lý do và tác động tại `docs/decisions/<task>-<chu-de>.md`.
- Gửi **kết quả · cách thử · link file tạo mới/cập nhật và mục cần xem · việc còn lại**. Chỉ đưa mã commit và lệnh khi được hỏi. Bàn giao đủ thì chuyển **Chờ review**. Đánh dấu **Hoàn thành** sau khi tiêu chí đạt, tài liệu đã đồng bộ và có kết quả review.
