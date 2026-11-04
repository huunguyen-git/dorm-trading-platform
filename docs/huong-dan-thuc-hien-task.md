# Giao việc và nghiệm thu một task cùng agent

### 1. Giao việc
Chọn một việc trong [roadmap](02-roadmap-todo.md) hoặc mô tả kết quả bạn muốn thấy. Ví dụ:

> Thực hiện P2-04. Mình muốn người bán có thể chấp nhận yêu cầu giữ chỗ trên app.

### 2. Chốt đầu ra
Đọc ví dụ agent đưa ra về **thế nào là đạt** và **file nào sẽ được bàn giao**. Với P2-04, nếu hai tin có chung một đồ vật, chỉ một lượt giữ được có hiệu lực. Chỉnh lại ngay nếu agent hiểu sai.

### 3. Xem hoặc thử kết quả
Mở đầu ra theo đường dẫn agent gửi và thử hành vi đã thống nhất. Với thay đổi qua cả app và API, xem agent đã thử luồng trên app hay mới kiểm tra riêng API.

### 4. Gọi skill để rà trước khi nghiệm thu
Khi đã có kết quả để kiểm tra, dùng `$ooad-review` cho task liên quan nhiều tầng, phân quyền, xử lý đồng thời hoặc chuyển trạng thái. Với chỉnh sửa tài liệu đơn giản, có thể chuyển thẳng sang bàn giao.

> $ooad-review Rà P2-04 trước khi bàn giao. Đối chiếu từng UC và yêu cầu liên quan với kết quả đã thử. Chỉ rõ tiêu chí nào còn thiếu bằng chứng.

Nếu còn thiếu bằng chứng, yêu cầu agent kiểm tra bổ sung hoặc ghi rõ phần còn mở trong đặc tả. Sau khi sửa, rà lại tiêu chí đó.

### 5. Nhận bàn giao
Gửi “Bàn giao tiến độ hiện tại” hoặc gửi `/wrap` như một tin nhắn thường. Đây là cách viết tắt trong repo. Có thể dùng cả khi dừng giữa chừng.

| Mở file nào | Xem nội dung gì |
|---|---|
| [Roadmap](02-roadmap-todo.md) và các file đầu ra đã hẹn | Đúng dòng task, trạng thái, kết quả và việc còn lại. Mở thử đầu ra bằng đường dẫn agent gửi. |
| `docs/specs/<mã-task>.md` với task nhiều tầng | Mục **Tiêu chí nghiệm thu** ghi UC, điều khoản FR/NFR, kết quả thực tế và phần chưa kiểm chứng sau review. |
| Tài liệu bị ảnh hưởng | Nếu đổi nghiệp vụ, kiểm tra [ngữ cảnh](00-context.md) và [yêu cầu](03-requirements.md). Nếu đổi cách hệ thống hoạt động, kiểm tra [kiến trúc](01-architecture.md). Nếu có quyết định kỹ thuật mới, mở bản ghi tương ứng trong `docs/decisions/`. |

Task đủ đầu ra chuyển sang **Chờ review**. Chỉ ghi **Hoàn thành** khi tiêu chí đã đạt, tài liệu đã đồng bộ và kết quả review đã được ghi nhận.
