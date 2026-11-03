# Sàn giao dịch đồ dùng sinh viên · Nhóm 14

Sinh viên dùng app để đưa đồ từ kho cá nhân lên sàn, thương lượng, giữ chỗ và hẹn bàn giao trực tiếp. Web quản trị phục vụ hai vai trò nội bộ. Cả hai ứng dụng dùng chung danh tính, dữ liệu và quy tắc chuyển trạng thái tại backend.

| Actor trong đặc tả | Kênh chính | Quyền cần phân biệt khi nghiệm thu |
|---|---|---|
| Người dùng | Mobile | Quản lý hồ sơ, kho và tin của mình. Trong một giao dịch, người bán chấp nhận giữ chỗ và báo giao, người mua xác nhận hoàn tất và đánh giá. |
| Kiểm duyệt viên | Web quản trị | Duyệt hồ sơ, quản lý người dùng, xử lý tranh chấp, báo cáo và khiếu nại. |
| Quản trị viên cấp cao | Web quản trị | Xem thống kê, bổ nhiệm hoặc thu hồi vai trò kiểm duyệt viên, quản lý thang phạt. |

## Tra cứu yêu cầu

- **Phạm vi, phân công và hạn** lấy từ các sheet Phase 0–4 trong `Ke_Hoach_Du_An_Nhom14.xlsx`. Mỗi mã Pn-nn là một đầu ra để nhóm bàn giao. Sheet Seminar là kế hoạch thuyết trình riêng.
- **Hành vi và ngoại lệ** lấy từ *Mô hình Use case – Nhóm 14 (1)*, bản 3.0 ngày 21/10/2026. UC-1 trong Word và UC-01 trong workbook cùng chỉ một ca sử dụng. Khi viết spec, đọc cả luồng thay thế và hậu điều kiện của UC tương ứng.
- **Lựa chọn công nghệ** lấy từ bảng stack nhóm cung cấp. Những phiên bản còn mở được ghi trong [kiến trúc](01-architecture.md). Nếu hai nguồn mâu thuẫn, ghi rõ hai đoạn liên quan trong spec và giao người phụ trách task xác nhận trước khi triển khai phần phụ thuộc.

## Các mốc nghiệp vụ dễ nhầm

| Ca sử dụng | Điều cần chứng minh |
|---|---|
| UC-01 → UC-02 | Xác minh email và quyết định duyệt hồ sơ là hai bước riêng. Kiểm tra quyền truy cập khi tài khoản còn chờ duyệt. |
| UC-22 → UC-23 | Hai người có thể cùng yêu cầu. Khi chấp nhận, giữ tin và tất cả đồ vật thành phần trong cùng giao dịch dữ liệu. Thử hai yêu cầu đồng thời cho các tin có chung đồ vật. |
| UC-24 → UC-29 | UC-26 bắt đầu giao. UC-27 ghi nhận đã giao kèm ảnh rồi người mua nhập mã hoàn tất. Trước khi báo đã giao dùng UC-24 để hủy giữ chỗ. Sau mốc đó dùng UC-28. UC-29 xử lý quá hạn hoặc tranh chấp. |
| UC-30 → UC-34 | Gắn đánh giá với giao dịch đã hoàn tất. Tách quyền người mua viết đánh giá, người bán khiếu nại và kiểm duyệt viên ra quyết định. Kiểm tra tác động lên lịch sử điểm. |
| UC-35 → UC-40 | Sinh viên gửi báo cáo trên mobile. Web phân biệt quyền xử lý báo cáo, quyền xem thống kê và quyền quản lý thang phạt. |
