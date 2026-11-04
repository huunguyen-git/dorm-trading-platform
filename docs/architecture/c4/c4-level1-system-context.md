# C4 mức 1 – Ngữ cảnh hệ thống

Hệ thống nhìn như một hộp đen, cùng các tác nhân và hệ thống ngoài. Nguồn tác nhân: danh sách Actor trong mô hình use case (UC-01..UC-40).

```mermaid
C4Context
    title Sàn giao dịch đồ dùng sinh viên – Ngữ cảnh hệ thống

    Person(applicant, "Người đăng ký", "Sinh viên ĐHQG-HCM chưa có tài khoản kích hoạt")
    Person(member, "Thành viên", "Đã kích hoạt; là người mua hoặc người bán theo từng giao dịch")
    Person(moderator, "Kiểm duyệt viên", "Duyệt kích hoạt, duyệt tin, xử lý báo cáo, khiếu nại, tranh chấp")
    Person(admin, "Quản trị viên cấp cao", "Quản lý kiểm duyệt viên, thang phạt, thống kê")

    System(platform, "Sàn giao dịch đồ dùng sinh viên", "Mobile cho thành viên, web quản trị cho kiểm duyệt, một Backend API dùng chung")

    System_Ext(smtp, "Dịch vụ email (SMTP)", "Gửi OTP đăng ký, đổi email, khôi phục mật khẩu")
    System_Ext(storage, "Object storage", "Lưu ảnh tin đăng, ảnh thẻ, ảnh bàn giao, bằng chứng")

    Rel(applicant, platform, "Đăng ký, xác minh OTP, nộp ảnh thẻ", "Mobile")
    Rel(member, platform, "Kho cá nhân, đăng tin, tìm kiếm, chat, giữ chỗ, bàn giao, đánh giá, báo cáo", "Mobile")
    Rel(moderator, platform, "Kiểm duyệt tài khoản, tin, báo cáo, khiếu nại, tranh chấp", "Web quản trị")
    Rel(admin, platform, "Quản lý kiểm duyệt viên, thang phạt, xem thống kê", "Web quản trị")
    Rel(platform, smtp, "Gửi email OTP", "SMTP")
    Rel(platform, storage, "Lưu và đọc file", "S3 API / volume")

    UpdateLayoutConfig($c4ShapeInRow="2", $c4BoundaryInRow="1")
```

Ghi chú:

- Người mua và người bán không phải hai loại tài khoản; cùng một Thành viên đóng vai trò khác nhau theo từng giao dịch.
- Scheduler (nhắc giữ chỗ, quá hạn 24h, +1 sau 15 ngày, nhắc gia hạn tin) nằm bên trong hệ thống, thể hiện ở mức container.
- Không tích hợp SSO của trường và không có cổng thanh toán; thanh toán diễn ra trực tiếp ngoài ứng dụng.
