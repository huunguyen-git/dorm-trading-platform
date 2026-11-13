# Roadmap và bàn giao theo task

Mốc ban đầu lấy từ workbook Nhóm 14. Ngày trong bảng là hạn kế hoạch năm 2026. Workbook ghi P0-01 đang thực hiện, 29 task còn lại chưa thực hiện. Dấu — ở cột phụ trách là ô chưa được phân công. Phân công Phase 1 bên dưới được cập nhật ngày 08/11/2026 theo yêu cầu chia việc của nhóm, không phải phân công từ workbook. Khi làm tiếp, cập nhật trạng thái trong repo và gắn bằng chứng ở đúng dòng task.

Dùng các trạng thái **Chưa thực hiện → Đang thực hiện → Chờ review → Hoàn thành**. Nếu bị chặn, ghi phụ thuộc, người cần xử lý và điều kiện để tiếp tục. Ở cột bàn giao, ghi kết quả đã kiểm chứng và liên kết tài liệu liên quan để người nhận có thể xem hoặc thử.

## PHASE 0 Khởi tạo nền tảng · 24/10/2026 – 31/10/2026

Nghiệm thu Phase 0 bằng một bản clone chạy được hai client với API chung, PR mẫu qua CI và kết quả chạy trên máy 5 thành viên.

| Task | Hạng mục và UC | Phụ trách | Hạn | Trạng thái | Bàn giao |
|---|---|---|---|---|---|
| P0-01 | Khởi tạo Monorepo & Khung Backend | Nguyễn Hữu Nguyên | 28/10 | Hoàn thành | [Kết quả P0-01](specs/P0-01.md#tiêu-chí-nghiệm-thu) · Windows và Ubuntu build đạt, 4 test HTTP đạt ở mỗi môi trường. |
| P0-02 | Khởi tạo Mobile, Web quản trị & UI Kit | Nguyễn Bảo Việt | 28/10 | Hoàn thành | [PR #4 đã merge](https://github.com/huunguyen-git/dorm-trading-platform/pull/4) · [Chốt phạm vi khởi tạo 08/11](specs/P0-02.md#chốt-phạm-vi-08112026): hai client build đạt, mỗi client 5/5 test; tích hợp API thật thuộc Phase 1. |
| P0-03 | Cấu hình Docker, DB & Testcontainers | Nguyễn Quốc Nguyên | 29/10 | Hoàn thành | Chốt hoàn thành nền tảng ngày 08/11 theo quyết định của người dùng. 7/7 test Java 21, DB mới và nâng V1 → V2 đạt; [tồn đọng được chuyển tiếp](specs/P0-03.md#tồn-đọng-chuyển-tiếp-08112026). |
| P0-04 | Thiết lập CI Pipeline & Code Quality | Lê Vũ Hoàng Nguyên | 30/10 | Hoàn thành | [Chốt phạm vi CI 08/11](specs/P0-04.md#chốt-phạm-vi-08112026): workflow, actionlint, backend và logic required đạt. Bật bảo vệ main và mở rộng CI client là việc tiếp nối. |
| P0-05 | Tài liệu Kiến trúc & Quy chuẩn Git | Tô Thành Nguyên | 31/10 | Hoàn thành | [Chốt Phase 0 ngày 13/11](#chốt-phase-0--13112026) · ADR, C4 và hướng dẫn phân phối mobile đã có trong repo. |
| P0-06 | Thống nhất Quy ước & Chạy thử Pipeline | Tất cả | 31/10 | Hoàn thành | [PR #17](https://github.com/huunguyen-git/dorm-trading-platform/pull/17) · CI phục hồi 6/6 job, ca lỗi client kéo gate lỗi, check main đã bật. [Spec và kết quả tự rà](specs/P0-06.md) · Đóng theo chỉ định ngày 13/11; phần bằng chứng còn thiếu được giữ tại mục chốt Phase 0. |

## PHASE 1 Định danh & kho cá nhân · 01/11/2026 – 14/11/2026

Nghiệm thu bằng tài khoản đăng ký từ mobile được duyệt trên web, đăng nhập và quản lý kho. Thử thêm một thao tác web bằng tài khoản thiếu quyền.

| Task | Hạng mục và UC | Phụ trách | Hạn | Trạng thái | Bàn giao |
|---|---|---|---|---|---|
| P1-01 | Đăng ký, OTP, Đăng nhập & Mật khẩu (UC-01, 03, 04, 07, 08) | Nguyễn Hữu Nguyên | 08/11 | Chờ review | [Triển khai và bằng chứng 13/11](specs/P1-01.md#kết-quả-kiểm-chứng-cuối--13112026) · Backend24/24, web8/8, mobile6/6 và build đạt; SMTP thật bản cuối đạt. [GUI và checklist](specs/P1-01-gui-checklist.md) đã bổ sung; browser fixture desktop/mobile đạt. Còn review độc lập, thiết bị và chạy lại live UI sau outbox. |
| P1-02 | Hồ sơ cá nhân & Duyệt kích hoạt (UC-02, 05, 06) | Nguyễn Bảo Việt | 14/11 | Chưa thực hiện | Hồ sơ mobile, duyệt kích hoạt trên web và API tương ứng; ghép với P1-01. |
| P1-03 | Quản lý Kho hàng cá nhân (UC-09) | Nguyễn Quốc Nguyên | 12/11 | Chưa thực hiện | API và màn kho cá nhân; đầu mối migration và tồn đọng hạ tầng P0-03. |
| P1-04 | Tra cứu & Sửa hồ sơ Người dùng (UC-11, UC-12) | Lê Vũ Hoàng Nguyên | 12/11 | Chưa thực hiện | API và trang web quản lý hồ sơ người dùng; làm trước P1-05. |
| P1-05 | Khóa / Mở khóa Tài khoản & Điểm uy tín nền (UC-13, UC-14) | Lê Vũ Hoàng Nguyên | 14/11 | Chưa thực hiện | Tiếp nối màn quản lý người dùng P1-04; phối hợp P1-01/P1-02 về trạng thái tài khoản và điểm khởi tạo. |
| P1-06 | Quản lý Kiểm duyệt viên & Thang phạt (UC-39, UC-40) | Tô Thành Nguyên | 14/11 | Chưa thực hiện | API và trang web dành cho quản trị viên cấp cao; chốt ranh giới quyền với P1-01. |

### Phân công Phase 1 · 08/11/2026

Mỗi người phụ trách chịu trách nhiệm cả API, giao diện tương ứng, test và spec của task. Đây là phân công công việc; chưa có triển khai mới trong phiên chia việc nên các task Phase 1 vẫn **Chưa thực hiện**. Giữ nguyên hạn kế hoạch; P1-01 đến hạn ngày 08/11 và cần được ưu tiên chốt hợp đồng để các task khác ghép vào.

| Task → UC / actor | Điều khoản cần đọc | Vùng triển khai dự kiến và đầu ra | Tình huống cần chứng minh khi nghiệm thu |
|---|---|---|---|
| P1-01 → UC-01, 03, 04, 07, 08 · Người dùng | FR-01, FR-03, NFR-01; ADR P0-01 | Nguyễn Hữu Nguyên: package `iam.auth`, cấu hình security/JWT, luồng đăng ký/OTP/đăng nhập/mật khẩu trên mobile và nối phiên web. Chốt DTO, lỗi và ánh xạ quyền cho cả hai client; nhận sửa khóa fallback P0-03. | Email đúng miền được xác minh OTP; xác minh email và duyệt hồ sơ là hai điều kiện riêng. Đăng nhập/token hoạt động qua client và API thật; token sai/hết hạn bị từ chối, vai trò thiếu quyền nhận 403. Không tự đặt ngưỡng OTP đăng ký/reset từ quy tắc OTP bàn giao UC-27. |
| P1-02 → UC-02, 05, 06 · Người dùng / Kiểm duyệt viên | FR-01–03, NFR-01 | Nguyễn Bảo Việt: package `iam.profile`, hồ sơ mobile, trang duyệt kích hoạt trên web, lưu/đọc ảnh thẻ có kiểm quyền. Dùng hợp đồng phiên của P1-01. | Đủ xác minh email và duyệt hồ sơ mới hoạt động; ảnh thẻ chỉ người có quyền đọc. Kích hoạt khởi tạo điểm 100 một lần; tốt nghiệp không tự khóa tài khoản. |
| P1-03 → UC-09 · Người dùng | FR-04, NFR-01; NFR-02 cho thao tác chạm đồ vật đang giữ | Nguyễn Quốc Nguyên: package `catalog.inventory`, API, màn kho mobile, migration và integration test PostgreSQL. Phối hợp Hữu Nguyên về chủ sở hữu từ token. | Quản lý kho của mình; tài khoản khác không đọc/sửa tài nguyên riêng. Giữ một định danh cho mỗi đồ vật vật lý; đối chiếu giới hạn sửa/xóa theo trạng thái với UC-09 trước triển khai. Tin đăng và giữ chỗ đầy đủ thuộc Phase 2. |
| P1-04 → UC-11, UC-12 · Kiểm duyệt viên | FR-03, NFR-01; đặc tả UC-11/12 | Lê Vũ Hoàng Nguyên: package `iam.management`, API tra cứu/sửa và trang người dùng trên web. Dùng DTO hồ sơ thống nhất với P1-02. | Kiểm duyệt viên tra cứu/sửa theo UC; thành viên gọi cùng API bị từ chối. Không lộ mật khẩu/hash hay dữ liệu định danh ngoài quyền. Kiểm tra tìm không thấy và đầu vào không hợp lệ. |
| P1-05 → UC-13, UC-14 · Kiểm duyệt viên | FR-02, FR-03, FR-12, NFR-01 | Lê Vũ Hoàng Nguyên: package `iam.restriction`, chuyển trạng thái khóa/mở, điểm nền và thao tác web nối P1-04. Phối hợp Hữu Nguyên để trạng thái tài khoản được áp dụng khi truy cập API. | `30 < điểm ≤ 50`: khóa tạm 14 ngày; `điểm ≤ 30`: khóa vĩnh viễn có quyền khiếu nại. Hết khóa tạm giữ điểm, không khóa lại theo điểm cũ; tốt nghiệp không tự khóa. Không triển khai tính điểm đánh giá Phase 3 trong task này. |
| P1-06 → UC-39, UC-40 · Quản trị viên cấp cao | FR-03, FR-12, NFR-01; đặc tả UC-39/40 | Tô Thành Nguyên: package `gov` và phần gán quyền phối hợp `iam`, API và trang web quản lý kiểm duyệt viên/thang phạt. Xác nhận mô tả seed với Quốc Nguyên. | Chỉ quản trị viên cấp cao được bổ nhiệm/thu hồi kiểm duyệt viên và quản lý thang phạt; thử cùng API bằng kiểm duyệt viên/thành viên. Quyền chi tiết A08 còn mở: đối chiếu UC và chốt trước khi thêm quyền. Không tự đặt mức phạt nghiệp vụ từ dữ liệu mẫu. |

Phối hợp và thứ tự ghép:

- **API và danh tính dùng chung:** Nguyễn Hữu Nguyên là đầu mối `SecurityConfig`, JWT, DTO phiên và mô hình tài khoản dùng chung. Các chủ task tự viết API của mình, thống nhất hợp đồng trước khi ghép; `seller` trong scaffold không phải quyền hệ thống cuối cùng.
- **Migration:** Nguyễn Quốc Nguyên điều phối số phiên bản và thay đổi schema cho toàn Phase 1. Mỗi task nêu yêu cầu bảng/cột/ràng buộc trước khi thêm migration; dùng migration mới, không sửa V1/V2 đã merge. Rà riêng nhu cầu OTP đăng ký/reset vì bảng OTP hiện tại gắn giao dịch bàn giao.
- **Client:** Nguyễn Bảo Việt điều phối UI Kit, điều hướng và lớp API dùng chung. Hữu Nguyên sửa vùng auth; Bảo Việt sửa vùng hồ sơ/duyệt; Quốc Nguyên sửa vùng kho; Hoàng Nguyên sửa vùng người dùng/khóa; Thành Nguyên sửa vùng kiểm duyệt viên/thang phạt. Thay đổi file chung phải thống nhất với đầu mối, không ghi đè phần task khác.
- **CI:** Phần tiếp nối P0-04 được triển khai cùng P0-06 theo chấp thuận của người dùng: [PR #17](https://github.com/huunguyen-git/dorm-trading-platform/pull/17) thêm hai client trên Node 24 vào `required`. Ruleset main đã bật check `required` của GitHub Actions; PR đã có commit merge trong lịch sử local; xem chốt Phase 0 ngày 13/11. Lê Vũ Hoàng Nguyên tiếp tục giữ đầu mối CI.
- **Thứ tự:** chốt hợp đồng P1-01 trước; P1-02/03/04/06 có thể dựng phần riêng với dữ liệu giả theo hợp đồng. Ghép P1-02 với đăng ký và kích hoạt; Hoàng Nguyên hoàn thành P1-04 trước khi ghép P1-05. Cuối phase thử mobile đăng ký → xác minh → web duyệt → đăng nhập → kho, cùng một ca bị từ chối quyền trên web/API.
- **Review và trạng thái:** Quốc Nguyên review P1-01; Hữu Nguyên review P1-02 đến P1-06. Khi bắt đầu, từng chủ task chuyển **Đang thực hiện**, tạo `docs/specs/P1-xx.md` theo mẫu và đọc đặc tả UC gốc (chưa có trong repo). Mỗi PR chỉ sửa vùng task; Hữu Nguyên điều phối cập nhật roadmap. Chỉ chuyển **Chờ review** khi có bằng chứng client/API thật cho luồng đã triển khai.

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
- [x] **Quy trình agent** · [Hướng dẫn cho người dùng](huong-dan-thuc-hien-task.md) có câu mẫu gọi skill ở bước 4 và danh sách file cần kiểm tra ở bước 5. [Hướng dẫn đầu phiên](../AGENTS.md#hướng-dẫn-đầu-phiên) giữ bản ngắn.

- **P0-01 → P0-02, P0-03, P0-04, P1-01** · Xem [hướng dẫn tích hợp theo task](specs/P0-01.md#hướng-dẫn-tích-hợp) để khởi tạo hai client, ghép phần DB vào backend, cấu hình CI và triển khai cấp token.
- **P0-02 → Phase 1** · [PR #4 đã merge](https://github.com/huunguyen-git/dorm-trading-platform/pull/4), task **Hoàn thành** trong phạm vi khởi tạo. Nhận hai client, UI Kit, lockfile và 5 test mỗi app; P1-01/P1-02 tiếp tục tích hợp xác thực/hồ sơ với API thật. Xem [chốt phạm vi](specs/P0-02.md#chốt-phạm-vi-08112026).
- **P0-02 → P0-04** · Giao phiên bản Expo SDK, lockfile và các lệnh kiểm tra của hai client cho người viết CI. P0-03 bàn giao phiên bản PostgreSQL và cách khởi động dịch vụ phụ trợ cho bộ integration test.
- **P0-03 → Phase 1** · Task **Hoàn thành** theo quyết định ngày 08/11. [Handoff tồn đọng](specs/P0-03.md#tồn-đọng-chuyển-tiếp-08112026) ghi rõ khóa JWT cố định, healthcheck báo thành công giả, thiếu CHECK trạng thái và mô tả seed chưa khớp. P1-01 đã bỏ khóa JWT fallback; Quốc Nguyên nhận hạ tầng/schema và phối hợp Thành Nguyên về seed. Việc chốt task không đồng nghĩa các vấn đề đã được sửa.
- **P0-04 → P0-06** · Task **Hoàn thành** trong phạm vi CI nền. Phần tiếp nối được triển khai tại [PR #17](https://github.com/huunguyen-git/dorm-trading-platform/pull/17): thêm job client Node 24; ruleset main đã yêu cầu `required` của GitHub Actions. Kết quả chạy và phần chưa đạt nằm tại [spec P0-06](specs/P0-06.md); commit merge PR #17 đã có trong lịch sử local; phần thiếu bằng chứng xem mục chốt Phase 0.
- P0-05 đã có ADR, C4, quy ước Git và hướng dẫn phân phối mobile trong `docs/architecture/` và `docs/conventions/`; đóng theo chỉ định ngày 13/11. Mâu thuẫn hợp đồng xác thực được đưa vào mốc 1 của P1-01.

### Chốt Phase 0 · 13/11/2026

Theo yêu cầu người dùng, **P0-01 đến P0-06 đều Hoàn thành**. Đây là quyết định cập nhật trạng thái; không thay các kết quả thử còn thiếu thành Đạt. Các spec ngày 08/11 giữ bằng chứng lịch sử; mục này và ghi chú bổ sung trong spec là trạng thái mới nhất.

- P0-01: giữ bằng chứng build/test đã có; phiên này không bổ sung lượt review độc lập.
- P0-02/03/04: giữ phạm vi đã chốt và tồn đọng chuyển tiếp. P1-01 đã bỏ khóa JWT fallback; Quốc Nguyên giữ đầu mối healthcheck/schema và phối hợp Thành Nguyên về seed.
- P0-05: hiện có [ADR](architecture/adr/README.md), [C4](architecture/c4/c4-level1-system-context.md), [quy ước Git](conventions/git-conventions.md), [phân phối mobile](architecture/mobile-build-and-distribution.md). P1-01 xử lý xung đột ADR-003 với security/client hiện tại; chưa có kết quả chạy phân phối mobile mới trong phiên này.
- P0-06: lịch sử local có commit merge PR #17. Giữ nguyên bằng chứng CI đã ghi; không xác minh lại trạng thái GitHub trong phiên này. Xác nhận 5 máy, UI mobile/kết nối API từ môi trường client và review độc lập vẫn chưa được bổ sung. Toàn nhóm tiếp tục thu xác nhận theo [checklist](conventions/P0-06-checklist.md); phần tích hợp auth thật chuyển P1-01/P1-02, E2E toàn hệ thống thuộc P4-02.
- **P1-01 → P1-02/03/05/06**: [API, migration và kết quả](specs/P1-01.md) đã bàn giao, Chờ review. Dùng MEMBER/MODERATOR/SENIOR_ADMIN; JWT không fallback; phiên thu hồi tức thời. P1-02 nhận email_verified/profile_approved và kích hoạt điểm100 một lần; P1-03 nhận userId; P1-05 tiếp nối quyền khóa; P1-06 dùng prefix quản trị đúng quyền. Bằng chứng live UI trước outbox và giới hạn chạy lại được ghi rõ trong spec.
