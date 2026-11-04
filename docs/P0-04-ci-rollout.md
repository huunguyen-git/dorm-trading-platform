# P0-04 — CI Rollout, Testing & Handoff Specification

## 1. Scope hiện tại (Phase 0 — Khởi tạo dự án)

Tại commit khởi điểm của Phase 0, kho lưu trữ tập trung vào tài liệu kiến trúc, đặc tả ca sử dụng (Use Case) và quy chuẩn vận hành của Nhóm 14. Chưa có mã nguồn ứng dụng (`backend/pom.xml`, `admin-web/package.json`, `mobile/package.json`).

Do đó, CI Pipeline được thiết kế tinh gọn, an toàn, chuẩn xác và không dư thừa mã nguồn giả định. CI hiện tại chịu trách nhiệm:
1. **Kiểm tra tính toàn vẹn kho lưu trữ (`repository` job):**
   - Kiểm tra lỗi khoảng trắng dư thừa (`git diff --check`) trên toàn bộ phạm vi commit của PR hoặc commit push.
   - Kiểm tra định dạng commit message theo quy chuẩn nhóm `type(scope): <mã task> <kết quả>` (`scripts/ci/check_commit_format.py`).
2. **Kiểm tra cú pháp và thực hành tốt GitHub Actions (`workflow-lint` job):**
   - Chạy `rhysd/actionlint:1.7.12` trong môi trường Docker cô lập (chế độ read-only volume).
3. **Cổng kiểm duyệt hợp nhất (`required` job):**
   - Đánh giá trạng thái thành công của toàn bộ các job bắt buộc thông qua ngữ cảnh `needs`.
   - Xuất bảng tóm tắt trực quan vào GitHub Actions Step Summary (`$GITHUB_STEP_SUMMARY`).
   - Đóng vai trò là status check duy nhất cần cấu hình trong GitHub Branch Protection Rule cho nhánh `main`.

---

## 2. Hướng dẫn chạy kiểm tra cục bộ (Local Verification)

Các thành viên có thể kiểm tra nhanh trước khi tạo commit hoặc mở PR:

```bash
# 1. Kiểm tra lỗi khoảng trắng trước khi commit
git diff --check

# 2. Kiểm tra định dạng commit gần nhất (hoặc dải commit)
python scripts/ci/check_commit_format.py -1
# Hoặc kiểm tra dải commit so với nhánh chính:
python scripts/ci/check_commit_format.py origin/main..HEAD
```

---

## 3. Ma trận kiểm thử & Kịch bản nghiệm thu (Test Matrix)

| Kịch bản kiểm thử | Hành vi kích hoạt | Kết quả mong đợi |
|---|---|---|
| **PR hợp lệ chuẩn mực** | Commit đúng format, YAML hợp lệ, diff sạch | Toàn bộ 3 jobs `repository`, `workflow-lint`, `required` đều xanh (`PASS`). Step Summary hiển thị bảng báo cáo thành công. |
| **Lỗi commit format** | Commit với thông điệp sai chuẩn (vd `update code`) | Job `repository` thất bại, chỉ rõ SHA vi phạm; job `required` thất bại. |
| **Lỗi khoảng trắng** | Thêm trailing whitespace vào dòng code mới | Lệnh `git diff --check` bắt lỗi, job `repository` thất bại. |
| **Lỗi cú pháp workflow** | Đặt sai thuộc tính trong `.github/workflows/ci.yml` | Job `workflow-lint` phát hiện lỗi cú pháp, chặn merge. |

---

## 4. Cấu hình Branch Protection (Dành cho Quản trị viên repo)

Sau khi merge PR khởi tạo CI vào nhánh mặc định (`main`):
1. Truy cập **Settings** > **Branches** > **Branch protection rules** (hoặc **Rulesets**).
2. Tạo rule bảo vệ nhánh `main`:
   - Bật **Require a pull request before merging**.
   - Bật **Require status checks to pass before merging**.
   - Tìm kiếm và tích chọn duy nhất check: `required` (hoặc `CI / required`).
3. Nhờ cơ chế `required` job tổng hợp, sau này khi thêm các job `backend`, `admin-web`, `mobile`, admin không cần cấu hình lại danh sách check của GitHub Settings.

---

## 5. Lộ trình tích hợp các module tiếp theo (Next Steps)

1. **P0-01 Backend (Spring Boot Modular Monolith):**
   - Xác nhận Maven Wrapper (`mvnw`), JDK 21 LTS.
   - Thêm job `backend` vào `.github/workflows/ci.yml` chạy `./mvnw clean verify` (kèm Spotless và Jacoco report).
   - Thêm `backend` vào danh sách `needs: [...]` của job `required`.
2. **P0-02 Admin Web (React + Vite) & Mobile (React Native + Expo):**
   - Xác nhận `package-lock.json`, Node 24 LTS.
   - Thêm job `admin-web` và `mobile` chạy `npm ci`, lint, typecheck và unit test.
   - Thêm vào danh sách `needs` của `required`.
3. **P0-03 Infrastructure & Integration Tests:**
   - Cấu hình Testcontainers chạy trên Docker runner cho integration tests PostgreSQL.
4. **P4 Deployment:**
   - Tách biệt workflow release/deploy sang file workflow riêng (`deploy.yml`), tuyệt đối không cấp quyền deploy/secrets sản xuất cho workflow PR.
