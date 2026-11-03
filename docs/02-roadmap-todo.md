# Roadmap và bàn giao theo task

Mốc ban đầu lấy từ workbook Nhóm 14. Ngày trong bảng là hạn kế hoạch năm 2026. Workbook ghi P0-01 đang thực hiện, 29 task còn lại chưa thực hiện. Dấu — ở cột phụ trách là ô chưa được phân công trong nguồn. Khi làm tiếp, cập nhật trạng thái trong repo và gắn bằng chứng ở đúng dòng task.

Dùng các trạng thái **Chưa thực hiện → Đang thực hiện → Chờ review → Hoàn thành**. Nếu bị chặn, ghi phụ thuộc, người cần xử lý và điều kiện để tiếp tục. Ở cột bàn giao, ghi kết quả đã kiểm chứng và liên kết tài liệu liên quan để người nhận có thể xem hoặc thử.

## PHASE 0 Khởi tạo nền tảng · 24/10/2026 – 31/10/2026

Nghiệm thu Phase 0 bằng một bản clone chạy được hai client với API chung, PR mẫu qua CI và kết quả chạy trên máy 5 thành viên.

| Task | Hạng mục và UC | Phụ trách | Hạn | Trạng thái | Bàn giao |
|---|---|---|---|---|---|
| P0-01 | Khởi tạo Monorepo & Khung Backend | Nguyễn Hữu Nguyên | 28/10 | Đang thực hiện | — |
| P0-02 | Khởi tạo Mobile, Web quản trị & UI Kit | Nguyễn Bảo Việt | 28/10 | Chưa thực hiện | — |
| P0-03 | Cấu hình Docker, DB & Testcontainers | Nguyễn Quốc Nguyên | 29/10 | Chưa thực hiện | — |
| P0-04 | Thiết lập CI Pipeline & Code Quality | Lê Vũ Hoàng Nguyên | 30/10 | Chưa thực hiện | — |
| P0-05 | Tài liệu Kiến trúc & Quy chuẩn Git | Tô Thành Nguyên | 31/10 | Chưa thực hiện | — |
| P0-06 | Thống nhất Quy ước & Chạy thử Pipeline | Tất cả | 31/10 | Chưa thực hiện | — |

## PHASE 1 Định danh & kho cá nhân · 01/11/2026 – 14/11/2026

Nghiệm thu bằng tài khoản đăng ký từ mobile được duyệt trên web, đăng nhập và quản lý kho. Thử thêm một thao tác web bằng tài khoản thiếu quyền.

| Task | Hạng mục và UC | Phụ trách | Hạn | Trạng thái | Bàn giao |
|---|---|---|---|---|---|
| P1-01 | Đăng ký, OTP, Đăng nhập & Mật khẩu (UC-01, 03, 04, 07, 08) | — | 08/11 | Chưa thực hiện | — |
| P1-02 | Hồ sơ cá nhân & Duyệt kích hoạt (UC-02, 05, 06) | — | 14/11 | Chưa thực hiện | — |
| P1-03 | Quản lý Kho hàng cá nhân (UC-09) | — | 12/11 | Chưa thực hiện | — |
| P1-04 | Tra cứu & Sửa hồ sơ Người dùng (UC-11, UC-12) | — | 12/11 | Chưa thực hiện | — |
| P1-05 | Khóa / Mở khóa Tài khoản & Điểm uy tín nền (UC-13, UC-14) | — | 14/11 | Chưa thực hiện | — |
| P1-06 | Quản lý Kiểm duyệt viên & Thang phạt (UC-39, UC-40) | — | 14/11 | Chưa thực hiện | — |

## PHASE 2 Sàn giao dịch & giữ chỗ · 15/11/2026 – 28/11/2026

Nghiệm thu từ đồ vật trong kho tới tin đăng, thương lượng, giữ chỗ và hẹn giao. Hai lượt chấp nhận cạnh tranh phải giữ một đồ vật tối đa một lần.

| Task | Hạng mục và UC | Phụ trách | Hạn | Trạng thái | Bàn giao |
|---|---|---|---|---|---|
| P2-01 | Đăng tin, Sửa tin & Rút/Xóa tin (UC-10, UC-17, UC-18) | — | 24/11 | Chưa thực hiện | — |
| P2-02 | Tìm kiếm, Khám phá & Xem chi tiết tin (UC-19, UC-20) | — | 22/11 | Chưa thực hiện | — |
| P2-03 | Nhắn tin & Thương lượng giá (UC-21) | — | 28/11 | Chưa thực hiện | — |
| P2-04 | Yêu cầu, Chấp nhận & Hủy giữ chỗ (UC-22, UC-23, UC-24) | — | 28/11 | Chưa thực hiện | — |
| P2-05 | Hẹn lịch giao dịch & Báo bắt đầu giao (UC-25, UC-26) | — | 28/11 | Chưa thực hiện | — |
| P2-06 | Báo cáo Người dùng & Báo cáo Tin đăng (UC-35, UC-36) | — | 28/11 | Chưa thực hiện | — |

## PHASE 3 Bàn giao & đánh giá · 29/11/2026 – 12/12/2026

Nghiệm thu từ báo giao qua xác nhận hoặc tranh chấp tới đánh giá, khiếu nại và điểm uy tín. Kiểm tra quyền riêng cho trang thống kê.

| Task | Hạng mục và UC | Phụ trách | Hạn | Trạng thái | Bàn giao |
|---|---|---|---|---|---|
| P3-01 | Xóa Tài khoản Cá nhân & Người dùng (UC-15, UC-16) | — | 06/12 | Chưa thực hiện | — |
| P3-02 | Hoàn tất giao dịch & Yêu cầu hủy sau báo giao (UC-27, UC-28) | — | 08/12 | Chưa thực hiện | — |
| P3-03 | Xử lý Giao dịch Quá hạn / Tranh chấp (UC-29) | — | 08/12 | Chưa thực hiện | — |
| P3-04 | Đánh giá, Sửa & Xóa Đánh giá (UC-30, UC-31, UC-32) | — | 10/12 | Chưa thực hiện | — |
| P3-05 | Khiếu nại & Kiểm duyệt Đánh giá (UC-33, UC-34) | — | 12/12 | Chưa thực hiện | — |
| P3-06 | Kiểm duyệt Báo cáo & Xem Thống kê (UC-37, UC-38) | — | 12/12 | Chưa thực hiện | — |

## PHASE 4 Kiểm thử & triển khai · 13/12/2026 – 19/12/2026

Nghiệm thu bằng bản cài trên thiết bị thật, web/API triển khai được, báo cáo E2E, tải, bảo mật và kịch bản demo theo vai trò.

| Task | Hạng mục và UC | Phụ trách | Hạn | Trạng thái | Bàn giao |
|---|---|---|---|---|---|
| P4-01 | Triển khai API/Web quản trị & Đóng gói Mobile | — | 17/12 | Chưa thực hiện | — |
| P4-02 | Kiểm thử E2E Mobile & Web quản trị | — | 17/12 | Chưa thực hiện | — |
| P4-03 | Kiểm thử Chịu tải & Đột biến (k6 & PIT) | — | 17/12 | Chưa thực hiện | — |
| P4-04 | Kiểm tra Bảo mật API, Web & Mobile | — | 18/12 | Chưa thực hiện | — |
| P4-05 | Hoàn thiện Tài liệu & Kịch bản Demo | — | 19/12 | Chưa thực hiện | — |
| P4-06 | Tổng duyệt & Bảo vệ Đồ án | — | 19/12 | Chưa thực hiện | — |

## Bàn giao hiện tại

- [x] **Tra cứu yêu cầu theo task** · [Danh mục FR/NFR](03-requirements.md) giữ cả tiêu chí chấp nhận và quy tắc nghiệp vụ của sheet P2_05. Khi nhận việc, đối chiếu UC ở dòng task với danh mục rồi ghi điều khoản áp dụng vào [tiêu chí nghiệm thu](specs/_template.md#tiêu-chí-nghiệm-thu).
- [x] **Quy trình agent** · [Hướng dẫn đầu phiên](../AGENTS.md#hướng-dẫn-đầu-phiên) có bốn bước. Agent tra đúng dòng task và điều khoản liên quan. Khi bàn giao, [mẫu bàn giao](specs/_template.md#bàn-giao) ghi rõ file tạo mới/cập nhật, mục cần xem và phần còn thiếu.
- **Khi nào dùng skill** · Giao việc thường ngày bằng “Thực hiện P0-01”. Trước khi nghiệm thu thay đổi nhiều tầng hoặc có rủi ro về quyền, giữ chỗ hay tính điểm, dùng ví dụ: `$ooad-review Rà P2-04 trước bàn giao, chỉ ra tiêu chí còn thiếu bằng chứng.` Muốn nhận tóm tắt tiến độ giữa chừng, gõ `/wrap`. [Hướng dẫn review cho agent](../.agents/skills/ooad-review/SKILL.md)

- **P0-01** · Theo sheet `Phase 0 - Khoi tao`, dòng 12, bước tiếp theo là dựng monorepo gồm `backend/`, `mobile/`, `admin-web/`, `infra/` và `docs/`. Backend Modular Monolith dùng JWT để xác thực và phân quyền theo vai trò (RBAC) cho cả mobile và web quản trị.
- **P0-02 → P0-04** · Giao phiên bản Expo SDK, lockfile và các lệnh kiểm tra của hai client cho người viết CI. P0-03 bàn giao phiên bản PostgreSQL và cách khởi động dịch vụ phụ trợ cho bộ integration test.
- Khi đóng task, cập nhật dòng tương ứng và chuyển mục bàn giao sang task phụ thuộc. Phần tài liệu quy trình chỉ đóng góp một phần cho P0-05. P0-05 còn yêu cầu ADR, C4 và quy trình phân phối bản mobile.
