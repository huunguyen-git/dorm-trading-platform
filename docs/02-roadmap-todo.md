# Roadmap và bàn giao theo task

Mốc ban đầu lấy từ kế hoạch dự án Nhóm 14. Ngày trong bảng là hạn kế hoạch năm 2026. Task P0-01 đến P0-06 đã hoàn thành; các task Phase 1–4 được theo dõi chi tiết bên dưới. Dấu — ở cột phụ trách là ô chưa được phân công. Phân công Phase 1 bên dưới được cập nhật ngày 08/11/2026 theo yêu cầu chia việc của nhóm. Khi làm tiếp, cập nhật trạng thái trong repo và gắn bằng chứng ở đúng dòng task.

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
| P1-01 | Đăng ký, OTP, Đăng nhập & Mật khẩu ([UC-01](use-cases/UC-01.md), [UC-03](use-cases/UC-03.md), [UC-04](use-cases/UC-04.md), [UC-07](use-cases/UC-07.md), [UC-08](use-cases/UC-08.md)) | Nguyễn Hữu Nguyên | 08/11 | Chờ review | [Sửa theo review 26/11](specs/P1-01.md#sửa-theo-review-pr-32--26112026) trên [PR #32](https://github.com/huunguyen-git/dorm-trading-platform/pull/32) sau rebase `main` (#27 P1-03). Backend 78/78, web 45/45, mobile 47/47 và build/export đạt; live API/SMTP 24/11 và native 22/11 chưa chạy lại sau lượt sửa 26/11. Chờ CI `required` xanh và hoangnguyen1007 duyệt; tồn đọng UI lỗi giao OTP, native đầy đủ và ghép P1-02 giữ trong spec. |
| P1-02 | Hồ sơ cá nhân & Duyệt kích hoạt ([UC-02](use-cases/UC-02.md), [UC-05](use-cases/UC-05.md), [UC-06](use-cases/UC-06.md)) | Nguyễn Bảo Việt | 14/11 | Chưa thực hiện | Hồ sơ mobile, duyệt kích hoạt trên web và API tương ứng; ghép với P1-01. |
| P1-03 | Quản lý Kho hàng cá nhân ([UC-09](use-cases/UC-09.md)) | Nguyễn Quốc Nguyên | 12/11 | Chờ review | [Spec P1-03](specs/P1-03.md) · Scope: API backend + mobile client. Nhánh: `feat/p1-03-inventory-management`. Backend 68/68 (25/25 inventory), Mobile 36/36 (20/20 inventory), TypeScript 0 lỗi. |
| P1-04 | Tra cứu & Sửa hồ sơ Người dùng ([UC-11](use-cases/UC-11.md), [UC-12](use-cases/UC-12.md)) | Lê Vũ Hoàng Nguyên | 12/11 | Chờ review | [Spec và kết quả 18/11](specs/P1-04.md) · Backend 40/40, web 33/33, mobile 16/16 và build đạt; tra cứu đa tiêu chí, xem/sửa ảnh thẻ, khóa lạc quan và vết kiểm duyệt đạt. Chờ Nguyễn Hữu Nguyên review độc lập và ghép P1-02. |
| P1-05 | Khóa / Mở khóa Tài khoản & Điểm uy tín nền ([UC-13](use-cases/UC-13.md), [UC-14](use-cases/UC-14.md)) | Lê Vũ Hoàng Nguyên | 14/11 | Chờ review | [Spec và kết quả 18/11](specs/P1-05.md) · [Quyết định kỹ thuật](decisions/P1-04-P1-05-quan-ly-nguoi-dung-va-diem-nen.md); migration V5, sổ cái điểm idempotent, khóa/mở 2 bước, ngưỡng FR-12 và phiên giới hạn mobile đạt (backend 40/40, web 33/33, mobile 16/16). Chờ Nguyễn Hữu Nguyên review độc lập. |
| P1-06 | Quản lý Kiểm duyệt viên & Thang phạt ([UC-39](use-cases/UC-39.md), [UC-40](use-cases/UC-40.md)) | Tô Thành Nguyên | 14/11 | Chờ review | [API, migration và bằng chứng kiểm chứng](specs/P1-06.md): web 17/17, lint/build đạt trên các sửa review gần nhất; backend migration test cần JDK 21, chưa chạy lại sau rebase. CI bắt buộc cần xanh trên commit cuối. |

### Phân công Phase 1 · 08/11/2026

Mỗi người phụ trách chịu trách nhiệm cả API, giao diện tương ứng, test và spec của task. Đây là phân công công việc; chưa có triển khai mới trong phiên chia việc nên các task Phase 1 vẫn **Chưa thực hiện**. Giữ nguyên hạn kế hoạch; P1-01 đến hạn ngày 08/11 và cần được ưu tiên chốt hợp đồng để các task khác ghép vào.

| Task → UC / actor | Điều khoản cần đọc | Vùng triển khai dự kiến và đầu ra | Tình huống cần chứng minh khi nghiệm thu |
|---|---|---|---|
| P1-01 → [UC-01](use-cases/UC-01.md), [UC-03](use-cases/UC-03.md), [UC-04](use-cases/UC-04.md), [UC-07](use-cases/UC-07.md), [UC-08](use-cases/UC-08.md) · Người dùng | FR-01, FR-03, NFR-01; ADR P0-01 | Nguyễn Hữu Nguyên: package `iam.auth`, cấu hình security/JWT, luồng đăng ký/OTP/đăng nhập/mật khẩu trên mobile và nối phiên web. Chốt DTO, lỗi và ánh xạ quyền cho cả hai client; nhận sửa khóa fallback P0-03. | Email đúng miền được xác minh OTP; xác minh email và duyệt hồ sơ là hai điều kiện riêng. Đăng nhập/token hoạt động qua client và API thật; token sai/hết hạn bị từ chối, vai trò thiếu quyền nhận 403. Không tự đặt ngưỡng OTP đăng ký/reset từ quy tắc OTP bàn giao [UC-27](use-cases/UC-27.md). |
| P1-02 → [UC-02](use-cases/UC-02.md), [UC-05](use-cases/UC-05.md), [UC-06](use-cases/UC-06.md) · Người dùng / Kiểm duyệt viên | FR-01–03, NFR-01 | Nguyễn Bảo Việt: package `iam.profile`, hồ sơ mobile, trang duyệt kích hoạt trên web, lưu/đọc ảnh thẻ có kiểm quyền. Dùng hợp đồng phiên của P1-01. | Đủ xác minh email và duyệt hồ sơ mới hoạt động; ảnh thẻ chỉ người có quyền đọc. Kích hoạt khởi tạo điểm 100 một lần; tốt nghiệp không tự khóa tài khoản. |
| P1-03 → [UC-09](use-cases/UC-09.md) · Người dùng | FR-04, NFR-01; NFR-02 cho thao tác chạm đồ vật đang giữ | Nguyễn Quốc Nguyên: package `catalog.inventory`, API, màn kho mobile, migration và integration test PostgreSQL. Phối hợp Hữu Nguyên về chủ sở hữu từ token. | Quản lý kho của mình; tài khoản khác không đọc/sửa tài nguyên riêng. Giữ một định danh cho mỗi đồ vật vật lý; đối chiếu giới hạn sửa/xóa theo trạng thái với [UC-09](use-cases/UC-09.md) trước triển khai. Tin đăng và giữ chỗ đầy đủ thuộc Phase 2. |
| P1-04 → [UC-11](use-cases/UC-11.md), [UC-12](use-cases/UC-12.md) · Kiểm duyệt viên | FR-03, NFR-01; đặc tả [UC-11](use-cases/UC-11.md)/[UC-12](use-cases/UC-12.md) | Lê Vũ Hoàng Nguyên: package `iam.management`, API tra cứu/sửa và trang người dùng trên web. Dùng DTO hồ sơ thống nhất với P1-02. | Kiểm duyệt viên tra cứu/sửa theo UC; thành viên gọi cùng API bị từ chối. Không lộ mật khẩu/hash hay dữ liệu định danh ngoài quyền. Kiểm tra tìm không thấy và đầu vào không hợp lệ. |
| P1-05 → [UC-13](use-cases/UC-13.md), [UC-14](use-cases/UC-14.md) · Kiểm duyệt viên | FR-02, FR-03, FR-12, NFR-01 | Lê Vũ Hoàng Nguyên: package `iam.restriction`, chuyển trạng thái khóa/mở, điểm nền và thao tác web nối P1-04. Phối hợp Hữu Nguyên để trạng thái tài khoản được áp dụng khi truy cập API. | `30 < điểm ≤ 50`: khóa tạm 14 ngày; `điểm ≤ 30`: khóa vĩnh viễn có quyền khiếu nại. Hết khóa tạm giữ điểm, không khóa lại theo điểm cũ; tốt nghiệp không tự khóa. Không triển khai tính điểm đánh giá Phase 3 trong task này. |
| P1-06 → [UC-39](use-cases/UC-39.md), [UC-40](use-cases/UC-40.md) · Quản trị viên cấp cao | FR-03, FR-12, NFR-01; đặc tả [UC-39](use-cases/UC-39.md)/[UC-40](use-cases/UC-40.md) | Tô Thành Nguyên: package `gov` và phần gán quyền phối hợp `iam`, API và trang web quản lý kiểm duyệt viên/thang phạt. Xác nhận mô tả seed với Quốc Nguyên. | Chỉ quản trị viên cấp cao được bổ nhiệm/thu hồi kiểm duyệt viên và quản lý thang phạt; thử cùng API bằng kiểm duyệt viên/thành viên. Quyền chi tiết A08 còn mở: đối chiếu UC và chốt trước khi thêm quyền. Không tự đặt mức phạt nghiệp vụ từ dữ liệu mẫu. |

Phối hợp và thứ tự ghép:

- **API và danh tính dùng chung:** Nguyễn Hữu Nguyên là đầu mối `SecurityConfig`, JWT, DTO phiên và mô hình tài khoản dùng chung. Các chủ task tự viết API của mình, thống nhất hợp đồng trước khi ghép; `seller` trong scaffold không phải quyền hệ thống cuối cùng.
- **Migration:** Nguyễn Quốc Nguyên điều phối số phiên bản và thay đổi schema cho toàn Phase 1. Mỗi task nêu yêu cầu bảng/cột/ràng buộc trước khi thêm migration; dùng migration mới, không sửa V1/V2 đã merge. Rà riêng nhu cầu OTP đăng ký/reset vì bảng OTP hiện tại gắn giao dịch bàn giao.
- **Client:** Nguyễn Bảo Việt điều phối UI Kit, điều hướng và lớp API dùng chung. Hữu Nguyên sửa vùng auth; Bảo Việt sửa vùng hồ sơ/duyệt; Quốc Nguyên sửa vùng kho; Hoàng Nguyên sửa vùng người dùng/khóa; Thành Nguyên sửa vùng kiểm duyệt viên/thang phạt. Thay đổi file chung phải thống nhất với đầu mối, không ghi đè phần task khác.
- **CI:** Phần tiếp nối P0-04 được triển khai cùng P0-06 theo chấp thuận của người dùng: [PR #17](https://github.com/huunguyen-git/dorm-trading-platform/pull/17) thêm hai client trên Node 24 vào `required`. Ruleset main đã bật check `required` của GitHub Actions; PR đã có commit merge trong lịch sử local; xem chốt Phase 0 ngày 13/11. Lê Vũ Hoàng Nguyên tiếp tục giữ đầu mối CI.
- **Thứ tự:** chốt hợp đồng P1-01 trước; P1-02/03/04/06 có thể dựng phần riêng với dữ liệu giả theo hợp đồng. Ghép P1-02 với đăng ký và kích hoạt; Hoàng Nguyên hoàn thành P1-04 trước khi ghép P1-05. Cuối phase thử mobile đăng ký → xác minh → web duyệt → đăng nhập → kho, cùng một ca bị từ chối quyền trên web/API.
- **Review và trạng thái:** Quốc Nguyên review P1-01; Hữu Nguyên review P1-02 đến P1-06. Khi bắt đầu, từng chủ task chuyển **Đang thực hiện**, tạo `docs/specs/P1-xx.md` theo mẫu và đọc [đặc tả Use Case](use-cases/README.md) trong repo. Mỗi PR chỉ sửa vùng task; Hữu Nguyên điều phối cập nhật roadmap. Chỉ chuyển **Chờ review** khi có bằng chứng client/API thật cho luồng đã triển khai.

## PHASE 2 Sàn giao dịch & giữ chỗ · 15/11/2026 – 28/11/2026

Nghiệm thu từ đồ vật trong kho tới tin đăng, thương lượng, giữ chỗ và hẹn giao. Hai lượt chấp nhận cạnh tranh phải giữ một đồ vật tối đa một lần.

| Task | Hạng mục và UC | Phụ trách | Hạn | Trạng thái | Bàn giao |
|---|---|---|---|---|---|
| P2-01 | Đăng tin, Sửa tin & Rút/Xóa tin ([UC-10](use-cases/UC-10.md), [UC-17](use-cases/UC-17.md), [UC-18](use-cases/UC-18.md)) | — | 24/11 | Chưa thực hiện | — |
| P2-02 | Tìm kiếm, Khám phá & Xem chi tiết tin ([UC-19](use-cases/UC-19.md), [UC-20](use-cases/UC-20.md)) | — | 22/11 | Chưa thực hiện | — |
| P2-03 | Nhắn tin & Thương lượng giá ([UC-21](use-cases/UC-21.md)) | — | 28/11 | Chưa thực hiện | — |
| P2-04 | Yêu cầu, Chấp nhận & Hủy giữ chỗ ([UC-22](use-cases/UC-22.md), [UC-23](use-cases/UC-23.md), [UC-24](use-cases/UC-24.md)) | — | 28/11 | Chưa thực hiện | — |
| P2-05 | Hẹn lịch giao dịch & Báo bắt đầu giao ([UC-25](use-cases/UC-25.md), [UC-26](use-cases/UC-26.md)) | — | 28/11 | Chưa thực hiện | — |
| P2-06 | Báo cáo Người dùng & Báo cáo Tin đăng ([UC-35](use-cases/UC-35.md), [UC-36](use-cases/UC-36.md)) | — | 28/11 | Chưa thực hiện | — |

## PHASE 3 Bàn giao & đánh giá · 29/11/2026 – 12/12/2026

Nghiệm thu từ báo giao qua xác nhận hoặc tranh chấp tới đánh giá, khiếu nại và điểm uy tín. Kiểm tra quyền riêng cho trang thống kê.

| Task | Hạng mục và UC | Phụ trách | Hạn | Trạng thái | Bàn giao |
|---|---|---|---|---|---|
| P3-01 | Xóa Tài khoản Cá nhân & Người dùng ([UC-15](use-cases/UC-15.md), [UC-16](use-cases/UC-16.md)) | — | 06/12 | Chưa thực hiện | — |
| P3-02 | Hoàn tất giao dịch & Yêu cầu hủy sau báo giao ([UC-27](use-cases/UC-27.md), [UC-28](use-cases/UC-28.md)) | — | 08/12 | Chưa thực hiện | — |
| P3-03 | Xử lý Giao dịch Quá hạn / Tranh chấp ([UC-29](use-cases/UC-29.md)) | — | 08/12 | Chưa thực hiện | — |
| P3-04 | Đánh giá, Sửa & Xóa Đánh giá ([UC-30](use-cases/UC-30.md), [UC-31](use-cases/UC-31.md), [UC-32](use-cases/UC-32.md)) | — | 10/12 | Chưa thực hiện | — |
| P3-05 | Khiếu nại & Kiểm duyệt Đánh giá ([UC-33](use-cases/UC-33.md), [UC-34](use-cases/UC-34.md)) | — | 12/12 | Chưa thực hiện | — |
| P3-06 | Kiểm duyệt Báo cáo & Xem Thống kê ([UC-37](use-cases/UC-37.md), [UC-38](use-cases/UC-38.md)) | — | 12/12 | Chưa thực hiện | — |

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

- **CD (GitHub Actions → Docker Hub → Local Compose Demo) · 26/11**: Nhánh `feat/cd-docker-hub-demo` (tách từ `origin/main` `0fdf862`, phục vụ demo CD và làm nền cho phần triển khai `P4-01`). Đã bổ sung multi-stage `backend/Dockerfile` (`eclipse-temurin:21-jdk-alpine` → `21-jre-alpine`, user non-root `app`, `/app/data/uploads`), `admin-web/Dockerfile` + `admin-web/nginx.conf` (`node:24-alpine` với `VITE_API_URL=/api/v1` → `nginx:1.27-alpine`, reverse-proxy `/api/` dùng `resolver 127.0.0.11`, SPA fallback), workflow [`.github/workflows/cd.yml`](../.github/workflows/cd.yml) (chạy sau khi `CI` xanh trên `main` hoặc `workflow_dispatch`, pin SHA toàn bộ action, `permissions: contents: read`, cache Buildx `type=gha`, push `:latest` & `:sha-<7>`, xuất `$GITHUB_STEP_SUMMARY`) và gói chạy độc lập [`infra/demo/`](../infra/demo/README.md) (`docker-compose.demo.yml` 5 dịch vụ + tùy chọn `--profile auto-cd` Watchtower, `.env.demo.example`, `init-db.sql`, hướng dẫn 5 bước). Kiểm chứng thực tế: build local 2 image đạt (`backend` 422MB, `admin-web` 74MB, đã kiểm bundle chứa `/api/v1`), chạy bản sao độc lập `infra/demo/` ngoài repo lên đủ 5/5 container `healthy`, `GET /api/v1/health` trả `200` (`UP`/`CONNECTED`), đăng ký & quên mật khẩu gửi OTP thật tới Maildev, login qua Nginx nhận `Set-Cookie: dorm_refresh; Secure; HttpOnly; SameSite=Strict` và `/auth/refresh` trả `200`, Origin lạ bị chặn `403`, rollback `IMAGE_TAG=sha-test001` & tái tạo riêng `backend` trả `200` không lỗi `502`, `rhysd/actionlint:1.7.12` và `git diff --check` đều `exit 0`. Còn lại: cấu hình 2 GitHub Secrets (`DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`), chạy thử CD thật trên GitHub Actions và kiểm tra bấm F5 trực tiếp trên trình duyệt tại máy demo có cổng `8080` trống (trên máy kiểm chứng cổng `8080`/`9000` đang bị tiến trình hệ thống chiếm nên đã thử qua `18080`/`19000`, và Chrome remote debugging chưa bật).

- **P1-01 · sửa review 26/11**: chuyển về **Chờ review** theo `AGENTS.md` và review `CHANGES_REQUESTED` trên [PR #32](https://github.com/huunguyen-git/dorm-trading-platform/pull/32); xem [chi tiết sửa và bằng chứng](specs/P1-01.md#sửa-theo-review-pr-32--26112026). Đã rebase lên `main` (`0217c0d` · P1-03 #27, giữ `ApiError.code`), xử lý toàn bộ mục inline của `hoangnguyen1007` và 4 bổ sung của `huunguyen-git`: backend 78/78 (Java 24 + Testcontainers), web 45/45, mobile 47/47 và build/export đạt. Chờ CI `required` xanh trên commit mới và `hoangnguyen1007` approve. Các ghi chú P1-01 bên dưới là lịch sử.

- **P1-01 · chốt 25/11**: chuyển **Hoàn thành** theo chỉ định người dùng; [chi tiết và tồn đọng](specs/P1-01.md#chốt-trạng-thái-theo-chỉ-định--25112026). PR #32 đang mở, đã yêu cầu **hoangnguyen1007** (Lê Vũ Hoàng Nguyên) review thay cho phân công Quốc Nguyên trước đây. Chưa có approval, chưa merge; không chuyển các phép kiểm còn thiếu thành đạt. Các trạng thái P1-01 theo ngày bên dưới là lịch sử.

- **P1-01 · PR24/11**: [PR#32](https://github.com/huunguyen-git/dorm-trading-platform/pull/32) · [Chuỗi commit và bàn giao](specs/P1-01.md#chia-commit-và-tạo-pr--24112026): backend → web → mobile → kiểm thử → tài liệu → liên kết bàn giao. Đã rebase main#26; backend53/53, web43/43, mobile22/22, build và live web/mobile API/SMTP đạt. Native22/11 chưa chạy lại. PR không xung đột, cần1 approval và CI required; chưa merge. Phạm vi PR chờ review, toàn task giữ **Đang thực hiện** do còn UI báo lỗi giao OTP, native đầy đủ và ghép P1-02. Các mục “chưa commit/push”22/11 dưới đây là lịch sử.

- **P1-01 · bắt đầu phiên mới**: đọc [bàn giao22/11](specs/P1-01.md#bắt-đầu-phiên-mới--22112026) trước khi sửa. Ghi rõ working tree chưa commit, file mới chưa theo dõi, dịch vụ thử đã dừng, nguyên nhân OTP đã sửa/chưa làm và thứ tự tiếp tục. Ưu tiên phản hồi lỗi giao OTP trên UI với ràng buộc chống dò email; sau đó bổ sung native auth. Giữ **Đang thực hiện**; lượt rà này chỉ cập nhật tài liệu, không chạy lại test.

- **P1-01 · tiếp tục 22/11**: [Kết quả và tự rà](specs/P1-01.md#tiếp-tục-kiểm-chứng--22112026) bổ sung live trên bản hiện tại; sửa lỗi form đổi mật khẩu còn mở sau login lại. Bộ chạy mới quản lý API/Vite/Metro, kiểm reset SMTP, logout lỗi/khôi phục, quyền hạn chế và Android SecureStore qua force-stop. Backend34/34, web17/17, mobile13/13, mobile live1/1; build đạt. Hướng dẫn tại [checklist](specs/P1-01-gui-checklist.md#chạy-lại-bộ-live--22112026). Giữ **Đang thực hiện** vì còn ngoại lệ giao OTP/UI, phần ghép hồ sơ, native auth đầy đủ và Quốc Nguyên nghiệm thu. Các ghi chú “chưa chạy live” bên dưới là lịch sử.

- **P1-01 · kiểm tra lại 18/11**: [Review sau sửa](specs/P1-01.md#kiểm-tra-lại-sau-chỉnh-sửa--18112026) đóng hai phát hiện P2; không phát hiện lỗi mới trong phần sửa. Chạy lại backend 34/34 (Java24, JAR đạt), web16/16, mobile13/13. Giữ **Đang thực hiện** vì còn live UI/API/SMTP, thiết bị và phần nghiệm thu đã ghi; Quốc Nguyên xác nhận nghiệm thu.
- **P1-01 · sửa P2 ngày 18/11**: [Kết quả sửa và kiểm chứng](specs/P1-01.md#sửa-hai-lỗi-p2-sau-review--18112026): hai lỗi review 17/11 đã sửa, có test hồi quy web/mobile và backend. Backend Java21 34/34, web16/16, mobile13/13 cùng build đạt. Review sau sửa xem ghi chú ngay trên. Không commit/push; ghi chú review 17/11 dưới đây là lịch sử trước sửa.

- **P1-01 · 17/11**: [Ràng buộc xác thực](specs/P1-01.md#cập-nhật-constraint--17112026) đã cập nhật trên `codex/p1-01-update`; giữ Đang thực hiện do chưa chạy live UI bản mới. Ảnh thẻ/đăng ký lại hồ sơ tiếp tục ghép P1-02 theo lựa chọn người dùng. Các ghi chú Chờ review 13/11 bên dưới là lịch sử.
- **P1-01 · review 17/11**: [Kết quả review](specs/P1-01.md#review-theo-yêu-cầu--17112026): chưa nghiệm thu; hai lỗi P2 về logout nuốt lỗi refresh mạng/5xx và Retry-After chưa gộp giới hạn IP/email. Backend 29/29, web 11/11, mobile 8/8 đạt; đã tái hiện lỗi logout web ở cả offline/503. Hữu Nguyên nhận sửa và bổ sung live UI; giữ **Đang thực hiện**, chờ Quốc Nguyên xác nhận sau sửa.

- [x] **Tra cứu yêu cầu theo task** · [Danh mục FR/NFR](03-requirements.md) giữ cả tiêu chí chấp nhận và quy tắc nghiệp vụ. Khi nhận việc, đối chiếu UC ở dòng task với [đặc tả Use Case](use-cases/README.md) rồi ghi điều khoản áp dụng vào [tiêu chí nghiệm thu](specs/_template.md#tiêu-chí-nghiệm-thu).
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
- **P1-04, P1-05 → P1-02, P1-06, Phase 2–3**: [Spec P1-04](specs/P1-04.md), [Spec P1-05](specs/P1-05.md) và [quyết định kỹ thuật](decisions/P1-04-P1-05-quan-ly-nguoi-dung-va-diem-nen.md) đã bàn giao ngày 18/11, **Chờ review** (Nguyễn Hữu Nguyên). Migration `V5` bổ sung sổ cái `lich_su_diem_uy_tin` (có `idempotency_key`) và `nhat_ky_kiem_duyet`. `P1-02` gọi `ReputationLedgerService.initializeActivationScore(userId, actorId)` khi duyệt kích hoạt lần đầu để khởi tạo điểm `100` đúng một lần và dùng chung quy chuẩn `studentCardFront`/`studentCardBack`; `P1-06` và `P3-06` gọi `ReputationLedgerService.applyPenaltyScale(...)` theo `thang_phats` đang dùng; Phase 2–3 kế thừa cơ chế chặn `ROLE_MEMBER` (`403 ACCOUNT_RESTRICTED`) và gọi `recordScoreChange(...)` khi nối điểm đánh giá giao dịch (`FR-10`) và hoàn điểm khiếu nại.
- **P1-06 → P2-06**: [Bàn giao quản trị và lịch sử](specs/P1-06.md), Chờ review. V6 thêm assignee báo cáo, audit, version mức phạt và snapshot quyết định. Thu hồi kiểm duyệt viên trả báo cáo dở về hàng chờ. Sáu seed V2 được giữ khóa nhưng ngừng dùng, không coi là chính sách duyệt; không seed admin. P2-06 chỉ chọn mức DANG_DUNG, DB chụp và bảo vệ giá trị quyết định. Đã smoke web/API thật, kiểm tra quyền, đồng thời, rollback, lịch sử, phân trang và viewport hẹp; chờ CI GitHub xanh trên commit sau rebase.
