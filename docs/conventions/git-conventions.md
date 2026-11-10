# Quy ước Git

Áp dụng cho toàn bộ monorepo (backend, mobile, admin-web, infra, docs). Trạng thái: khởi tạo Phase 0 (P0-05); P0-04 cấu hình CI bắt buộc theo quy ước này.

## 1. Trunk-based

- Một nhánh chính `main`, luôn ở trạng thái chạy được; được bảo vệ: không push trực tiếp, bắt buộc PR, CI xanh, ít nhất một người khác duyệt.
- Nhánh làm việc **ngắn hạn** (mục tiêu dưới 3 ngày), tạo từ `main` mới nhất, xóa sau khi merge. Không có nhánh cá nhân lâu dài hay nhánh `develop`.
- Tính năng lớn chia thành nhiều PR nhỏ, phần chưa dùng được ẩn sau cờ cấu hình thay vì để nhánh sống lâu.
- Merge bằng **squash**; tiêu đề PR trở thành thông điệp commit trên `main`, nên tiêu đề PR phải đúng chuẩn Conventional Commits.
- Cập nhật nhánh bằng `git rebase origin/main` trước khi mở hoặc khi PR bị xung đột; không merge ngược `main` vào nhánh.

## 2. Đặt tên nhánh

```text
<type>/<mã-task>-<slug-kebab>
feat/P1-03-personal-inventory
fix/P2-04-reservation-double-hold
docs/P0-05-architecture-adr
ci/P0-04-github-actions
```

`type` trùng với type của commit (mục 3). `mã-task` là mã trong kế hoạch dự án (`P0-05`) hoặc số issue GitHub (`42`).

## 3. Conventional Commits

Định dạng: `<type>(<scope>): <mã-task> <mô tả ngắn>` ở thì mệnh lệnh, tiếng Anh, không chấm cuối, tối đa 72 ký tự. Mã task nằm ngay trong tiêu đề theo AGENTS.md để truy vết khi squash.

| type | Dùng cho |
| --- | --- |
| `feat` | Thêm chức năng người dùng thấy được |
| `fix` | Sửa lỗi |
| `docs` | Chỉ tài liệu |
| `refactor` | Đổi cấu trúc mã, không đổi hành vi |
| `test` | Thêm/sửa kiểm thử |
| `build` | Hệ thống build, dependency (pom, package.json) |
| `ci` | Workflow GitHub Actions, scanner |
| `chore` | Việc lặt vặt không thuộc loại trên |
| `perf` | Cải thiện hiệu năng |

| scope | Phạm vi |
| --- | --- |
| `iam`, `catalog`, `chat`, `order`, `review`, `gov`, `notification`, `media`, `shared` | Module backend |
| `mobile` | Ứng dụng React Native |
| `admin-web` | Web quản trị |
| `infra` | Docker Compose, Terraform, Nginx |
| `api` | Hợp đồng OpenAPI |
| `docs` | Tài liệu chung |

Ví dụ:

```text
feat(order): P2-04 lock shared items when accepting a reservation
fix(mobile): P1-01 refresh token when app returns from background
docs(adr): P0-05 document JWT and RBAC role boundaries
ci(infra): P0-06 verify both clients in the required gate
```

Thay đổi phá vỡ tương thích (hợp đồng API, schema): thêm `!` sau scope và footer `BREAKING CHANGE:` mô tả cách chuyển đổi.

```text
feat(api)!: P2-01 rename listing status PUBLISHED to PUBLIC

BREAKING CHANGE: mobile and admin-web must map the new status value.
```

Thân commit (tùy chọn): giải thích *vì sao*, không lặp lại diff. Footer liên kết task: `Refs: P2-04` hoặc `Closes #42`.

## 4. Pull request

- Tiêu đề theo Conventional Commits; mô tả gồm: mục tiêu, UC/FR liên quan, cách đã kiểm tra (lệnh và kết quả thật), hạn chế còn lại, ảnh màn hình nếu có UI.
- Một PR một việc; không trộn refactor lớn với tính năng.
- Thay đổi hợp đồng API, schema, dependency hoặc CI phải gắn người sở hữu module bị ảnh hưởng làm reviewer.
- Người duyệt kiểm tra: đúng ranh giới package miền ([quyết định P0-06](../decisions/P0-06-quy-uoc-va-ci.md)), có kiểm thử cho trường hợp biên, không có secret, tài liệu/ADR đã cập nhật khi hành vi đổi.
- Tác giả tự merge sau khi đủ điều kiện; không merge PR của người khác trừ khi được nhờ.

## 5. Không được commit

Secret, `.env`, keystore, token, dữ liệu sinh viên thật (ảnh thẻ, tin nhắn), file build (`target/`, `node_modules/`, `dist/`), file IDE. `.gitignore` ở gốc đã liệt kê; thêm mục mới vào đó thay vì bỏ qua cục bộ.

## 6. Phát hành

Tag trên `main` theo SemVer: `v0.1.0` cho backend và web (cùng image), `mobile-v0.1.0` cho bản mobile (xem [quy trình phân phối](../architecture/mobile-build-and-distribution.md)). Ghi chú phát hành sinh từ tiêu đề commit theo type.

## 7. Lệnh mẫu

```bash
git switch main && git pull --ff-only
git switch -c feat/P1-03-personal-inventory
# ... làm việc, chạy kiểm tra ...
git add <file đã xem lại>
git commit -m "feat(catalog): P1-03 add personal inventory CRUD endpoints"
git fetch origin && git rebase origin/main
git push -u origin feat/P1-03-personal-inventory
# mở PR trên GitHub với tiêu đề trùng thông điệp commit
```
