# Sàn giao dịch đồ dùng sinh viên · Nhóm 14

Sinh viên dùng app để đưa đồ từ kho cá nhân lên sàn, thương lượng, giữ chỗ và hẹn bàn giao trực tiếp. Web quản trị phục vụ hai vai trò nội bộ. Cả hai ứng dụng dùng chung danh tính, dữ liệu và quy tắc chuyển trạng thái tại backend.

| Actor trong đặc tả | Kênh chính | Quyền cần phân biệt khi nghiệm thu |
|---|---|---|
| Người dùng | Mobile | Quản lý hồ sơ, kho và tin của mình. Trong một giao dịch, người bán chấp nhận giữ chỗ và báo giao, người mua xác nhận hoàn tất và đánh giá. |
| Kiểm duyệt viên | Web quản trị | Duyệt hồ sơ, quản lý người dùng, xử lý tranh chấp, báo cáo và khiếu nại. |
| Quản trị viên cấp cao | Web quản trị | Xem thống kê, bổ nhiệm hoặc thu hồi vai trò kiểm duyệt viên, quản lý thang phạt. |

## Tra cứu yêu cầu

- **FR, NFR và điều kiện nghiệp vụ** tra trong [danh mục yêu cầu](03-requirements.md). Mỗi mục giữ đầy đủ thông tin nguồn, độ ưu tiên, trạng thái và tiêu chí chấp nhận.
- **Phạm vi, phân công và hạn** được quản lý tập trung tại [roadmap](02-roadmap-todo.md). Mỗi mã Pn-nn là một đầu ra để nhóm bàn giao.
- **Hành vi và ngoại lệ** tra cứu trực tiếp tại [danh mục Use Case](04-use-cases.md) và thư mục [đặc tả Use Case](use-cases/README.md) (từ [UC-01](use-cases/UC-01.md) đến [UC-40](use-cases/UC-40.md)). Khi viết spec, đọc cả luồng thay thế và hậu điều kiện của UC tương ứng.
- **Lựa chọn công nghệ** và kiến trúc hệ thống được ghi trong [kiến trúc](01-architecture.md). Khi triển khai, ghi rõ quyết định kỹ thuật và đối chiếu trong spec của task.

## Các mốc nghiệp vụ dễ nhầm

| Ca sử dụng | Điều cần chứng minh |
|---|---|
| [UC-01](use-cases/UC-01.md) → [UC-02](use-cases/UC-02.md) | Xác minh email và quyết định duyệt hồ sơ là hai bước riêng. Tài khoản chờ duyệt được tự quản lý hồ sơ và xem mặt hàng công khai; chưa được đăng bán, nhắn tin, giữ chỗ hoặc giao dịch theo quyết định P1-01 ngày 13/11. |
| [UC-22](use-cases/UC-22.md) → [UC-23](use-cases/UC-23.md) | Hai người có thể cùng yêu cầu. Khi chấp nhận, giữ tin và tất cả đồ vật thành phần trong cùng giao dịch dữ liệu. Thử hai yêu cầu đồng thời cho các tin có chung đồ vật. |
| [UC-24](use-cases/UC-24.md) → [UC-29](use-cases/UC-29.md) | [UC-26](use-cases/UC-26.md) bắt đầu giao. [UC-27](use-cases/UC-27.md) ghi nhận đã giao kèm ảnh rồi người mua nhập mã hoàn tất. Trước khi báo đã giao dùng [UC-24](use-cases/UC-24.md) để hủy giữ chỗ. Sau mốc đó dùng [UC-28](use-cases/UC-28.md). [UC-29](use-cases/UC-29.md) xử lý quá hạn hoặc tranh chấp. |
| [UC-30](use-cases/UC-30.md) → [UC-34](use-cases/UC-34.md) | Gắn đánh giá với giao dịch đã hoàn tất. Tách quyền người mua viết đánh giá, người bán khiếu nại và kiểm duyệt viên ra quyết định. Kiểm tra tác động lên lịch sử điểm. |
| [UC-35](use-cases/UC-35.md) → [UC-40](use-cases/UC-40.md) | Sinh viên gửi báo cáo trên mobile. Web phân biệt quyền xử lý báo cáo, quyền xem thống kê và quyền quản lý thang phạt. |
