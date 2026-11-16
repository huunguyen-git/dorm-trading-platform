# P0-06 · Bằng chứng kiểm tra local ngày 08/11/2026

Đây là kết quả kiểm tra của agent trên máy hiện tại, không phải xác nhận thay cho bất kỳ thành viên nào. Baseline bên dưới chạy trước khi triển khai; người dùng sau đó đã chấp thuận [quyết định P0-06](../decisions/P0-06-quy-uoc-va-ci.md). Các kiểm tra sau thay đổi CI được ghi riêng để phân biệt revision và phạm vi.

## Môi trường và bản chạy

- Windows, Temurin 21.0.13+9 được chọn riêng cho tiến trình Maven/backend; Java mặc định của máy là 24.0.2, chưa thay đổi cấu hình hệ thống.
- Node 24.13.1, npm 11.10.1, Docker Engine 29.8.0, Docker Compose 5.5.1.
- Clone mới từ nhánh `main` local đã đồng bộ origin; revision nguồn `37bf37c`. Không dùng node_modules hoặc target từ working tree chính.
- Thư mục tạm: `.local/P0-06/clone/`. Backend log, báo cáo Surefire và JSON kết quả thử gate nằm dưới `.local/P0-06/`; đây là dữ liệu local không commit.
- Docker Desktop ban đầu chưa chạy; đã khởi động để chạy Testcontainers và Compose. Các container có sẵn của dự án khác được giữ nguyên.

## Kết quả thực tế

| Phần | Phép kiểm tra | Kết quả |
|---|---|---|
| Backend | Maven Wrapper `clean verify` với Java 21 và Docker | BUILD SUCCESS; 7 test, 0 failure, 0 error, 0 skipped; sinh JAR và Surefire XML. |
| Web | `npm ci`, `npm run lint`, `npm test`, `npm run build` | Mã thoát 0; TypeScript đạt; 5/5 test Vitest; Vite build 39 module. |
| Mobile | `npm ci`, `npm run lint`, `npm test`, `npm run build` | Mã thoát 0; TypeScript đạt; 5/5 test Jest; export Android đạt, 811 module và 17 asset. Đây là bundle, chưa phải APK. |
| Workflow | Chạy đúng image actionlint 1.7.12 của CI trên repo mount read-only | Mã thoát 0, không có lỗi lint. |
| Gate hiện có | Trích nguyên script Python của `required` trong workflow, chạy toàn bộ success và lần lượt failure/cancelled/skipped cho mỗi job repository/workflow-lint/backend | 10/10 tình huống trả mã đúng: success = 0, chín tình huống còn lại = 1; mỗi lượt tạo summary có đủ ba job. Đây là thử logic local, chưa phải bằng chứng run lỗi trên GitHub. |
| Compose | `config --quiet`, `up -d` với override tạm | PostgreSQL, Maildev, MinIO khởi động trong project `p006-smoke`, container/network/volume riêng. Dùng cổng 15432, 11080/11025, 19000/19001 để tránh cổng của dự án khác. |
| Dịch vụ phụ trợ | HTTP GET Maildev `/healthz` và MinIO `/minio/health/live` | Cả hai HTTP 200 khi gọi trực tiếp; không chỉ dựa vào healthcheck Compose hiện có. |
| DB mới | Khởi động JAR với PostgreSQL riêng; đọc Flyway history | V1 và V2 success; schema public có 16 bảng gồm bảng lịch sử Flyway. |
| API runtime | GET `/api/v1/health` trên cổng 8082, cấp JWT_SECRET thử riêng cho tiến trình | HTTP 200; `status=UP`, `service=dorm-trading-backend`, `database=CONNECTED`. |
| Origin web | CORS preflight OPTIONS tới health, Origin `http://localhost:5173` | HTTP 200; `Access-Control-Allow-Origin=http://localhost:5173`. Đây là phép kiểm tra HTTP local, chưa phải lời gọi từ UI web. |
| UI web | Chạy Vite cổng 5173 từ clone mới và xem bằng trình duyệt | Trang “Dorm Trading · Admin” hiển thị form Đăng nhập với Email, Mật khẩu và nút Đăng nhập. Chưa thử đăng nhập nghiệp vụ. |
| Expo dev server | Thử khởi động bằng script start, API URL local, chế độ CI; thử lại sau khi người dùng chấp thuận tiếp tục | Cả hai lần công cụ duyệt tự động từ chối trước khi chạy, trả “blocked by policy”. Không có log Metro/Expo, chưa xác định lỗi ứng dụng; công cụ không nêu chi tiết hơn. Chưa xác nhận dev server khởi động. Export Android ở hàng trên đã chạy đạt độc lập. |
| Mobile runtime | Chạy UI và gọi API từ giả lập/thiết bị | Chưa có bằng chứng; chưa tìm thấy adb hoặc Android SDK tại các vị trí đã kiểm tra. Không suy ra từ export hoặc test mock. |

`npm ci` báo audit cho lockfile hiện tại: web 5 vấn đề (3 moderate, 2 critical), mobile 26 (8 low, 16 moderate, 2 high). Chưa chạy audit fix hoặc nâng dependency; cần chủ client đối chiếu các PR Dependabot đang mở. Các số này là kết quả CLI tại lượt cài, chưa đánh giá phạm vi ảnh hưởng tới runtime.

## Cấu hình GitHub đọc lại

Đã đọc qua GitHub API trong ngày 08/11/2026:

- [Ruleset Trunk-based-and-conventional-commits](https://github.com/huunguyen-git/dorm-trading-platform/rules/23882149) đang **active**, áp dụng nhánh mặc định, không có bypass actor.
- Đang chặn xóa/force-push; yêu cầu PR, một lượt approve, giải quyết hội thoại review và chỉ squash merge theo rule PR.
- Chưa có rule `required_status_checks`, vì vậy chưa thể kết luận job `required` đang bắt buộc trước merge.
- API branch protection kiểu cũ trả “Branch not protected”; không dùng kết quả đó để kết luận repo hoàn toàn không được bảo vệ vì ruleset mới đang active.
- Chưa sửa cấu hình repo, chưa mở PR P0-06 hoặc tạo run thử lỗi trên GitHub.

## Phần còn lại

Đã chốt lựa chọn, triển khai tài liệu/CI, chạy PR mẫu đạt/lỗi và xác nhận check main như phần dưới. Còn xác nhận trên 5 máy, UI/API từ môi trường client và một người khác review/approve PR. Dòng thành viên trong [spec P0-06](P0-06.md) vẫn giữ chưa xác nhận. Dịch vụ smoke local và tiến trình backend/web do agent tạo đã được dừng sau lượt baseline, không xóa volume hoặc dữ liệu dự án khác.

## Sau triển khai CI và cấu hình repo

- Actionlint 1.7.12 đạt với workflow mới. Trích nguyên script gate mới và danh sách `needs`, thử all-success cùng failure/cancelled/skipped cho từng job trong năm job: **16/16** lượt đạt, có summary. JSON local tại `.local/P0-06/expanded-gate-results.json`.
- [PR nháp #17](https://github.com/huunguyen-git/dorm-trading-platform/pull/17) dùng làm PR mẫu. [Run ca lỗi](https://github.com/huunguyen-git/dorm-trading-platform/actions/runs/42490012592), revision `9241913`, có một test web cố ý sai: **admin-web=failure**, **required=failure**; repository/workflow-lint/backend/mobile đều success. Log gate ghi `Required checks failed: {'admin-web': 'failure'}`. Test thử được xóa trong commit phục hồi, không thuộc đầu ra cuối.
- Run đầu bị lượt push ca lỗi hủy theo concurrency; gate của run bị hủy cũng không xanh. Không dùng run bị hủy làm bằng chứng baseline đạt trên GitHub.
- Đã cập nhật rồi đọc lại [ruleset main](https://github.com/huunguyen-git/dorm-trading-platform/rules/23882149): active, check `required` gắn app GitHub Actions 15368, bật strict/up-to-date; giữ toàn bộ rule PR/approve/squash/chống xóa/force-push và không thêm bypass. API rule áp dụng thực tế cho main trả đúng cấu hình này.
- [Run phục hồi 42490190801](https://github.com/huunguyen-git/dorm-trading-platform/actions/runs/42490190801), revision `b080e053b73036a33fccf9c6a71cae81b2da8647`: **6/6 job success**. [Job required/Step Summary](https://github.com/huunguyen-git/dorm-trading-platform/actions/runs/42490190801/job/128760841890) gom đủ năm job thành phần. Web và mobile thực hiện đủ lint/test/build hoặc export trên Node 24.
- [Surefire artifact của run phục hồi](https://github.com/huunguyen-git/dorm-trading-platform/actions/runs/42490190801/artifacts/13621465854) còn hiệu lực lúc kiểm tra; đã tải về `.local/P0-06/ci-42490190801/` và cộng thuộc tính XML: **7 tests, 0 failures, 0 errors, 0 skipped**. Không commit XML có metadata máy chạy; dùng artifact CI làm bằng chứng gốc.
- Các cảnh báo Actions còn tồn tại từ workflow nền: setup-java v4 deprecated và action cũ chuyển runtime Node 20 sang 24. Không làm run thất bại; chưa nâng các action nền ngoài phạm vi đã chốt. Các PR Dependabot vẫn để chủ CI xử lý.
- Kết quả tự rà `ooad-review` ghi tại [spec](P0-06.md#rà-trước-bàn-giao-theo-ooad-review--08112026); chưa thay approve của thành viên khác. Chưa merge PR. Run trên HEAD sau các commit chỉ cập nhật tài liệu cần được kiểm tra riêng trước bàn giao.
