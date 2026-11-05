---
name: ooad-review
description: Rà soát bằng chứng nghiệm thu một task OOAD của Nhóm 14 trước bàn giao, khi thay đổi trải qua nhiều tầng hoặc liên quan quyền, đồng thời, chuyển trạng thái. Dùng khi người dùng muốn review độ phủ yêu cầu hoặc tìm tiêu chí còn thiếu.
---

# Rà soát bằng chứng theo task

Bắt đầu từ dòng task trong `docs/02-roadmap-todo.md` và bản spec của task nếu có. Lấy phạm vi thay đổi từ diff hoặc các file bàn giao. Nếu được yêu cầu review, báo phát hiện trước khi thay đổi file hay trạng thái task.

1. Chọn **một hành vi quan sát được** cho mỗi điều khoản bị tác động. Đọc đúng mục trong `docs/03-requirements.md` tới heading kế tiếp. Đối chiếu actor và thời điểm trong UC. Bảng tra UC chỉ gợi ý mã cần đọc. Giữ nguyên ranh giới giữa điều khoản đã duyệt, ngưỡng chưa chốt và tính năng đã loại.
2. Đối chiếu bằng chứng với rủi ro cụ thể. Với phân quyền, kiểm tra cùng thao tác bằng vai trò được phép và vai trò thiếu quyền. Với giữ chỗ, thử hai yêu cầu qua hai tin có chung đồ vật. Với thao tác gửi lại, xem hậu điều kiện sau lần thứ hai. Chọn trường hợp phù hợp với task.
3. Với thay đổi qua app/web và API, phân biệt kết quả test riêng từng tầng với kết quả đã thử qua client và API thật. Nếu môi trường chưa sẵn sàng, ghi điều còn thiếu để thử lại. Với task hạ tầng, dùng tiêu chí vận hành và chỉ dẫn UC nếu có hành vi nghiệp vụ thực sự bị tác động.
4. Nêu chỗ thiếu bằng bộ ba **điều khoản · kết quả quan sát · phần còn phải chứng minh**. Gắn đường dẫn tới test, spec hoặc đầu ra tương ứng. Nếu chưa có bằng chứng cho một tiêu chí, giữ tiêu chí đó ở trạng thái chưa kiểm chứng.
