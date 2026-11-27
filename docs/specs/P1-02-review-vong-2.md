# P1-02 · Đánh giá review vòng 2 PR #25 và kế hoạch sửa

Căn cứ: `.temp/feedback_current_pr_round_2.md` (8 mục bắt buộc + 4 mục Medium + danh sách test).
Trạng thái task: **Chờ review**. Nhánh đã merge `upstream/main` (`0d8ec30`), không còn conflict.

## 1. Kết quả đánh giá từng mục

| # | Mức | Kết luận | Bằng chứng |
|---|-----|----------|-----------|
| 1 | Blocker | **Đã xong phần conflict**, còn thiếu đồng bộ client | 8 file conflict đã resolve ở `0d8ec30`; `mobile/App.test.tsx` cập nhật, mobile 50/50, admin-web 51/51, `tsc` sạch. Còn: `upload()`/`attachment()` mobile và `attachment()` admin-web chưa theo hợp đồng PR #32 |
| 2 | Critical | **Đúng** | `ProfileService.changeEmail()` trả `401 INVALID_CREDENTIALS` không kèm `WWW-Authenticate` (`ProfileService.java:305`); mobile `api()` chỉ miễn trừ `path === '/auth/password/change'` (`mobile/src/api/client.ts:246`) → sai mật khẩu 1 lần là `tokenStore.clear()` |
| 3 | Critical | **Đúng** | `ProfileScreen.tsx:126` `Cài đặt tài khoản` bị `disabled={busy \|\| readOnly}`; `readOnly` gồm `sessionUser?.accountStatus === 'BI_KHOA'` (dòng 92). `Đăng xuất thiết bị này` chỉ còn ở `SettingsScreen.tsx:77` → `BI_KHOA` không có đường đăng xuất. Đây là hồi quy P1-05 (hợp đồng UC-03 §3.2: mobile cho `BI_KHOA` đăng nhập với quyền hạn chế) |
| 4 | High | **Đúng** | `ProfileService.pick()` dòng 109 `value != null ? value : string(row, column)`; `optional()` trả `null` khi chuỗi rỗng (dòng 395-401) → `ho_so_cap_nhat` lưu `NULL`, `view()` lấp lại giá trị cũ từ `thanh_viens` |
| 5 | High | **Đúng** | `approve()` (dòng 264-273) tự `diem_uy_tin = case when diem_khoi_tao then diem_uy_tin else 100 end` + `diem_khoi_tao=true`, không gọi `ReputationLedgerService.initializeActivationScore(UUID, UUID)` (tồn tại, `ReputationLedgerService.java:177`, idempotency key `ACTIVATION:<id>`) → `lich_su_diem_uy_tin` trống |
| 6 | High | **Đúng** | `pending()` (dòng 230-240), `pendingOrThrow()` (dòng 371), `approve()`/`reject()` không lọc `trang_thai_tai_khoan = 'VO_HIEU_HOA'`. Partial index `V9` cũng không có vị từ này |
| 7 | High | **Đúng** | `ProfileScreen.load()` dòng 39 `useSession.setState({ user: ... })` — thiếu `restriction: resolveUserRestriction(fresh)` và `restrictionDismissed: false`; `RestrictedAccountNotice` đọc `sessionRestriction` trước nên banner kẹt |
| 8 | Medium | **Đúng** | `ProfileDetailPage.tsx:56` `if (status === 409)` gộp mọi 409 thành "Hồ sơ đã được người khác xử lý". `approve()` còn trả `409 STUDENT_ID_IN_USE` và `409 EMAIL_NOT_VERIFIED` |
| M1 | Medium | **Đúng** | `changeEmail()` không có đếm `PASSWORD_WRONG`; `AuthService.changePassword()` dùng `limitWait(email,"PASSWORD_WRONG",3600,5)` (`AuthService.java:375`). `429` tại `ProfileService.java:315` không truyền `retryAfter` nên `AuthErrors` không đặt header `Retry-After` |
| M2 | Medium | **Đúng** | `uploadCard()` xoá object cũ ở `afterCommit` ngay sau upload (dòng 196-200), trước khi kiểm duyệt → bị từ chối là mất ảnh hợp lệ cũ |
| M3 | Medium | **Đúng (nhẹ)** | `S3CardStorage.put()` đọc/ghi `volatile boolean bucketReady` không `synchronized` (dòng 36-40) → đua `makeBucket` (idempotent ở MinIO nên chỉ tốn call, không hỏng dữ liệu) |
| M4 | Medium | **Đúng** | `AuthErrors` bắt `HttpMessageNotReadableException`, `MethodArgumentTypeMismatchException`, `MissingServletRequestParameterException`; thiếu `MaxUploadSizeExceededException` (file > 6MB) và `MissingServletRequestPartException` (multipart thiếu part) → trả 500 thay vì `{code, message}` |

Không có mục nào sai; mục 1 chỉ còn phần client contract.

## 2. Kế hoạch sửa (thứ tự thực hiện)

**Đợt A — hồi quy chặn dùng (làm trước, 1 commit)**

1. **Mục 2** · `mobile/src/api/client.ts:246`: đổi điều kiện miễn trừ thành tập `['/auth/password/change', '/profile/email']` hoặc gọn hơn là chỉ xoá phiên khi `hasBearerChallenge(response)`. Test: `mobile/src/api/client.test.ts` thêm ca `api('/profile/email', {method:'PATCH'})` trả 401 không header → token còn nguyên.
2. **Mục 3** · `mobile/src/screens/ProfileScreen.tsx:126`: bỏ `readOnly` khỏi `disabled` của `Cài đặt tài khoản` (chỉ giữ `busy`), vì `SettingsScreen` đã tự chặn đổi email/mật khẩu bằng `readOnly` (dòng 73, 76). Test: `mobile/App.test.tsx` thêm ca `BI_KHOA` vẫn mở được Cài đặt và `Đăng xuất thiết bị này` enabled.
3. **Mục 7** · `ProfileScreen.load()`: `const fresh = await api<User>('/auth/me'); useSession.setState({ user: fresh, restriction: resolveUserRestriction(fresh), restrictionDismissed: false })`. Test: mở khoá rồi bấm **Tải lại hồ sơ** → banner biến mất; và ngược lại.

**Đợt B — nghiệp vụ backend (1 commit)**

4. **Mục 4** · `pick()` → `return pending != null ? string(pending, column) : string(row, column);` (vì `ho_so_cap_nhat` luôn là snapshot đủ 6 cột). Kiểm `view()` cho cả `GET /profile/me` và `GET /admin/profiles/{id}`.
5. **Mục 5** · `approve()`: bỏ `diem_uy_tin=case ...` khỏi `UPDATE`, gọi `reputationLedger.initializeActivationScore(userId, moderator)` sau khi set `profile_approved=diem_khoi_tao=true` (idempotent nên duyệt lại bản cập nhật không cộng điểm lần hai). Cần inject `ReputationLedgerService` (kiểm vòng phụ thuộc bean).
6. **Mục 6** · thêm `and v.trang_thai_tai_khoan <> 'VO_HIEU_HOA'` vào `pending()`; `pendingOrThrow()` trả `409 ACCOUNT_DELETED` khi `VO_HIEU_HOA`; migration **V10** thay partial index `idx_thanh_viens_cho_duyet` thêm vị từ `trang_thai_tai_khoan <> 'VO_HIEU_HOA'`.

**Đợt C — Medium + admin-web (1 commit)**

7. **Mục 8** · `ProfileDetailPage.decide()`: `if (status === 409 && cause.code === 'PROFILE_ALREADY_HANDLED') setStale(...)` else `setReasonError/ setError((cause as Error).message)`. Test: `409 STUDENT_ID_IN_USE` hiện đúng thông báo MSSV.
8. **M1** · `changeEmail()`: đếm `PASSWORD_WRONG` theo `limitWait(email,"PASSWORD_WRONG",3600,5)` + `event(email,"PASSWORD_WRONG")` khi sai, và truyền `retryAfter` cho `429 RATE_LIMITED` (chờ `resendSeconds`).
9. **M2** · `uploadCard()`: giữ ảnh cũ tới khi hồ sơ được duyệt — chỉ xoá object cũ trong `approve()` (sau khi ảnh mới đã thành ảnh chính thức) hoặc chuyển object cũ vào `afterCommit` của lần duyệt. Chọn cách rẻ nhất: ghi `previous` vào bảng tạm/`object_key_cho_duyet` rồi `approve()` xoá. **Cần chốt với reviewer** vì đụng V8.
10. **M3** · `S3CardStorage.put()`: `synchronized (this)` quanh khối `bucketReady` (hoặc `private final Object bucketLock`).
11. **M4** · `AuthErrors`: thêm `MaxUploadSizeExceededException` → `413 PAYLOAD_TOO_LARGE`, `MissingServletRequestPartException` → `400 INVALID_INPUT`.
12. **Mục 1 phần còn lại** · `mobile/src/api/client.ts` `upload()`/`attachment()` và `admin-web/src/api/client.ts` `attachment()`: dùng `ApiError(status, message, code)`, `hasBearerChallenge` cho 401, xử lý `403 ACCOUNT_RESTRICTED` và reset `restriction`.

## 3. Test cần thêm

- `ProfileActivationTest`: xoá trắng `school/campus/major/cohort` → `GET /profile/me` và `GET /admin/profiles/{id}` trả `null` trước khi duyệt; `POST /profile/email/verify` khi `BI_KHOA`; `VO_HIEU_HOA` không nằm trong `/admin/profiles/pending` và bị chặn duyệt (`409 ACCOUNT_DELETED`); sau `approve()` có đúng 1 bản ghi `KHOI_TAO_KICH_HOAT` trong `lich_su_diem_uy_tin`.
- `mobile/App.test.tsx` + `mobile/src/api/client.test.ts`: sai mật khẩu đổi email không đăng xuất; `BI_KHOA` đăng xuất được; **Tải lại hồ sơ** xoá banner `restriction`.
- `admin-web/src/profiles/ProfileDetailPage.test.tsx`: `409 STUDENT_ID_IN_USE` hiện thông báo trùng MSSV.

## 4. Quyết định đã chốt và kết quả

- **M2** chốt hướng **tách bảng** (`the_sinh_viens_cho_duyet`, V10) thay vì thêm cột vào V8: ảnh chờ duyệt không đụng ảnh đang dùng, `approve()` thăng cấp rồi mới xoá object cũ sau commit, `reject()` xoá ảnh chờ.
- **Mục 2** chốt **bỏ danh sách miễn trừ theo đường dẫn**, chỉ xoá phiên khi `401` có `WWW-Authenticate: Bearer`; làm đúng như vậy ở cả `api()`, `upload()`, `attachment()` của hai client.
- **Mục 5** không phát sinh vòng phụ thuộc bean: `ReputationLedgerService` chỉ dùng `AuthFailure`, `AuthService` đã inject sẵn nên `ProfileService → ReputationLedgerService` là DAG hợp lệ; không cần `ApplicationEventPublisher`.
- **Kiểm chứng:** backend 111/111 (P1-02 17 test), mobile 52/52 + `tsc` sạch, admin-web 61/61 + `tsc` sạch. Testcontainers chạy được trong phiên này nên không cần chờ CI để xác nhận.
