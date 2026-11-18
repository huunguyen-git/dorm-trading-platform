# P1-04, P1-05 · Sổ cái điểm uy tín nền, trạng thái hạn chế và đồng bộ hồ sơ người dùng

Ngày: **18/11/2026** · Trạng thái: **Đã triển khai trên nhánh `feat/P1-04-user-management-and-restriction`, chờ review nghiệm thu**.

## Bối cảnh và căn cứ

Hai tác vụ `P1-04` ([UC-11](../use-cases/UC-11.md), [UC-12](../use-cases/UC-12.md)) và `P1-05` ([UC-13](../use-cases/UC-13.md), [UC-14](../use-cases/UC-14.md), nối [UC-03](../use-cases/UC-03.md) mục 3.2/3.3) mở rộng nền xác thực `P1-01` để Kiểm duyệt viên quản lý hồ sơ sinh viên, ra quyết định khóa/mở khóa thủ công, đồng thời thiết lập dịch vụ điểm uy tín nền và cơ chế tự động hạn chế tài khoản cho các phase tiếp theo.

Căn cứ yêu cầu và đặc tả đã đối chiếu:
- [FR-01](../03-requirements.md#fr-01--đăng-ký-và-kích-hoạt), [FR-02](../03-requirements.md#fr-02--tình-trạng-tốt-nghiệp): tốt nghiệp (`DA_TOT_NGHIEP`) không làm khóa hay vô hiệu hóa tài khoản.
- [FR-03](../03-requirements.md#fr-03--điểm-ban-đầu-và-vai-trò): điểm uy tín khởi tạo bằng `100` khi kích hoạt; vai trò mua/bán tính theo từng giao dịch, tách biệt với quyền hệ thống (`MEMBER`, `MODERATOR`, `SENIOR_ADMIN`).
- [FR-12](../03-requirements.md#fr-12--khóa-tài-khoản-theo-điểm): `30 < điểm ≤ 50` khóa tạm thời `14` ngày; `điểm ≤ 30` (gồm đúng `30`) khóa vĩnh viễn có quyền khiếu nại; hết `14` ngày mở lại và giữ nguyên điểm cũ, không khóa lại theo điểm cũ cho đến khi phát sinh vi phạm mới; không tự đặt số điểm phạt ngoài `thang_phats`.
- [NFR-01](../03-requirements.md#nfr-01--quyền-truy-cập-dữ-liệu): giới hạn quyền xem/cập nhật dữ liệu định danh và ảnh thẻ sinh viên; không lộ mật khẩu/hash.
- [NFR-03](../03-requirements.md#nfr-03--gửi-lại-yêu-cầu-và-tính-điểm-một-lần): thao tác gửi lại không được cộng hoặc trừ điểm nhiều lần cho cùng một sự kiện nghiệp vụ.
- [UC-03](../use-cases/UC-03.md) mục 3.2 & 3.3, [UC-12](../use-cases/UC-12.md) mục 3.3, [UC-13](../use-cases/UC-13.md) mục 3.3, [UC-14](../use-cases/UC-14.md) mục 3.3: phân biệt hành vi đăng nhập của tài khoản đang bị khóa (`BI_KHOA`) với tài khoản đã bị xóa/vô hiệu hóa (`VO_HIEU_HOA`), đồng thời chống ghi đè khi nhiều Kiểm duyệt viên thao tác đồng thời.

## Quyết định kỹ thuật

### 1. Sổ cái điểm uy tín bất biến (`lich_su_diem_uy_tin`) và chống tính điểm lặp (`NFR-03`)
- Tạo bảng `lich_su_diem_uy_tin` trong migration `V5` đóng vai trò sổ cái chỉ-ghi-thêm (*append-only ledger*), lưu `loai_bien_dong` (`KHOI_TAO_KICH_HOAT`, `XU_PHAT_THANG_PHAT`, `DIEU_CHINH_KIEM_DUYET`, `DANH_GIA_GIAO_DICH`, `KHIEU_NAI_HOAN_DIEM`), `diem_thay_doi`, `diem_truoc`, `diem_sau`, `nguon_tham_chieu`, `ma_tham_chieu` và cột `idempotency_key VARCHAR(150) NOT NULL UNIQUE`.
- Cưỡng chế toàn vẹn số học ngay tại PostgreSQL bằng `CHECK (diem_sau >= 0 AND diem_truoc + diem_thay_doi = diem_sau)` và `CHECK (diem_uy_tin >= 0)` trên `thanh_viens` (khi điểm trừ vượt số điểm còn lại, điểm sau dừng ở biên `0` và `diem_thay_doi = 0 - diem_truoc`).
- Mọi hàm biến động điểm trong `ReputationLedgerService` đều khóa bản ghi người dùng bằng `SELECT * FROM thanh_viens WHERE user_id = ? FOR UPDATE` trước khi tra `idempotency_key`:
  - Khởi tạo kích hoạt dùng khóa cố định `ACTIVATION:<userId>`: lần gọi đầu tiên đặt điểm `100` và ghi sổ cái; các lần gọi lặp lại trả về bản ghi gốc với `idempotentReplay = true` mà **không** ghi đè điểm hiện hành của người dùng.
  - Xử phạt vi phạm qua `applyPenaltyScale` bắt buộc tra mã phạt đang có `trang_thai = 'DANG_DUNG'` trong bảng `thang_phats` (`400 INVALID_PENALTY_CODE` nếu không tồn tại hoặc đã ngừng dùng). Nếu cùng `idempotency_key` bị gửi lại cho cùng người dùng, trả về bản ghi cũ; nếu gắn nhầm người dùng khác, từ chối bằng `409 IDEMPOTENCY_CONFLICT`.

### 2. Ngưỡng tự khóa và cơ chế mở lại sau 14 ngày không khóa lặp theo điểm cũ (`FR-12`)
- Bổ sung các cột trạng thái hạn chế trên `thanh_viens` tại `V5`: `loai_han_che` (`KHOA_TAM_THOI` | `KHOA_VINH_VIEN` | `NULL`), `ly_do_han_che`, `cho_phep_khieu_nai`, `diem_da_khoa_tam`.
- Chỉ xét ngưỡng tự khóa trong `ReputationLedgerService.recordScoreChange` khi phát sinh sự kiện trừ điểm (`requestedDelta < 0`):
  - `scoreAfter <= 30` (bao gồm đúng `30`): chuyển `trang_thai_tai_khoan = 'BI_KHOA'`, `loai_han_che = 'KHOA_VINH_VIEN'`, `khoa_den_ngay = NULL`, `cho_phep_khieu_nai = TRUE`, thu hồi phiên `admin-web` và ghi `THRESHOLD_LOCK_PERMANENT`.
  - `30 < scoreAfter <= 50` (khi tài khoản chưa bị khóa vĩnh viễn): chuyển `trang_thai_tai_khoan = 'BI_KHOA'`, `loai_han_che = 'KHOA_TAM_THOI'`, `khoa_den_ngay = now() + 14 ngày`, `cho_phep_khieu_nai = FALSE`, `diem_da_khoa_tam = scoreAfter`, thu hồi phiên `admin-web` và ghi `THRESHOLD_LOCK_TEMPORARY`.
- Áp dụng đối chiếu lười (*lazy reconciliation*) qua `reconcileExpiredTemporaryLock(userId)` dùng `Clock` tiêm qua Spring và khóa `FOR UPDATE` tại mọi điểm đọc/xác thực (`login`, `refresh`, `me`, `findActiveRestriction`, `listUsers`, `getUserDetail`, `updateUserIdentity`, `lockAccount`, `recordScoreChange`):
  - Khi `loai_han_che = 'KHOA_TAM_THOI'` và `khoa_den_ngay <= now()`, hệ thống tự động khôi phục `HOAT_DONG` (nếu đã đủ `email_verified` và `profile_approved`) hoặc `CHO_KICH_HOAT`, xóa `loai_han_che`/`khoa_den_ngay`/`ly_do_han_che`, **giữ nguyên `diem_uy_tin` hiện tại**, lưu mốc `diem_da_khoa_tam = currentScore` và ghi vết `UNLOCK_EXPIRED_TEMP`.
  - Các lần đọc tiếp theo hoặc cộng điểm hoàn khiếu nại (ví dụ `45 → 47`) không kích hoạt khóa lại; chỉ khi có sự kiện vi phạm mới (`requestedDelta < 0`, ví dụ `47 → 42` hoặc `42 → 27`) hệ thống mới xét lại ngưỡng theo đúng `FR-12`.

### 3. Ánh xạ `UC-03` (3.2 & 3.3) giữa `VO_HIEU_HOA` và `BI_KHOA` trên Mobile / Admin-Web
- **Tài khoản đã xóa / vô hiệu hóa (`VO_HIEU_HOA` — `UC-03` mục 3.3)**:
  - Từ chối bằng `401 INVALID_CREDENTIALS` trên cả `POST /auth/login`, `POST /auth/refresh` và kiểm tra Bearer token; không gửi OTP mới và không tiết lộ tài khoản từng tồn tại.
- **Tài khoản đang bị khóa (`BI_KHOA` — `UC-03` mục 3.2)**:
  - **Trên `mobile`**: cho phép `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me` và `POST /auth/logout` thành công với phiên giới hạn (`user.roles = []`) kèm đối tượng `user.restriction` (`accountStatus`, `lockType`, `reason`, `lockedUntil`, `appealable`, `reputationScore`). Người dùng xem được thông báo `RestrictedAccountNotice` (lý do, thời điểm mở khóa dự kiến, điểm uy tín, hướng dẫn quyền khiếu nại khi `appealable = true`), lướt tin công khai, làm mới trạng thái hồ sơ hoặc đăng xuất. Mọi thao tác sửa hồ sơ (`PATCH /auth/profile`), đổi mật khẩu (`POST /auth/password/change`) và mọi API yêu cầu `ROLE_MEMBER` bị chặn tại backend bằng `403 ACCOUNT_RESTRICTED` kèm payload `restriction`; nếu bị khóa giữa phiên, `mobile` giữ phiên giới hạn, đồng bộ `roles = []` và hiển thị ngay `RestrictedAccountNotice`.
  - **Trên `admin-web`**: tài khoản nội bộ bị khóa không được phép vận hành công cụ quản trị. Khi khóa tài khoản, backend thu hồi tức thời các phiên `auth_session` có `client = 'admin-web'` và trả `403 ACCOUNT_RESTRICTED` trên `login`, `refresh` và Bearer filter; client `admin-web` xóa ngay access token trong bộ nhớ và phát sự kiện `session-expired` khi nhận `403 ACCOUNT_RESTRICTED` trên request bảo vệ.

### 4. Khóa lạc quan `expectedVersion` và vết kiểm duyệt `nhat_ky_kiem_duyet` (`UC-12`, `UC-13`, `UC-14`)
- Các endpoint `PATCH /api/v1/admin/users/{userId}`, `POST /lock` và `POST /unlock` nhận `expectedVersion` đối chiếu với `thanh_viens.version` dưới khóa hàng `FOR UPDATE`, tăng `version = version + 1` sau mỗi lần ghi thành công.
- Nếu bản ghi vừa bị Kiểm duyệt viên khác cập nhật hoặc tự mở khóa hết hạn làm đổi `version`, API trả `409 STATE_CONFLICT`; nếu tài khoản đã chuyển sang `VO_HIEU_HOA`, API trả `409 ACCOUNT_DELETED`; nếu mở khóa tài khoản không còn ở trạng thái `BI_KHOA`, API trả `409 ACCOUNT_NOT_LOCKED`. Trên mọi phản hồi `409`, `admin-web` tự động tải lại chi tiết tài khoản mới nhất theo đúng ngoại lệ của `UC-12`, `UC-13`, `UC-14`.
- Bảng `nhat_ky_kiem_duyet` lưu tập trung toàn bộ 7 loại hành động (`UPDATE_IDENTITY`, `LOCK_TEMPORARY`, `LOCK_PERMANENT`, `UNLOCK_MANUAL`, `UNLOCK_EXPIRED_TEMP`, `THRESHOLD_LOCK_TEMPORARY`, `THRESHOLD_LOCK_PERMANENT`) kèm cột `details JSONB` để truy vết đầy đủ trước/sau.

## Các phương án đã cân nhắc

| Vấn đề | Phương án chọn | Phương án thay thế & lý do không chọn |
|---|---|---|
| Mở khóa tạm thời sau 14 ngày | Đối chiếu lười (*lazy reconciliation*) dưới khóa `FOR UPDATE` dùng `Clock` tại các điểm đọc và xác thực | Cron job chạy nền đơn thuần: phụ thuộc chu kỳ quét nên sinh viên đăng nhập đúng giây hết hạn vẫn có thể bị chặn trễ, và khó kiểm thử tất định nếu không gọi đối chiếu trực tiếp. (Có thể bổ sung batch job dọn định kỳ ở Phase 4 mà không đổi logic miền.) |
| Phiên `mobile` khi tài khoản `BI_KHOA` | Cấp phiên giới hạn (`roles = []`, đính kèm `user.restriction`) và chặn mọi thao tác ghi/`ROLE_MEMBER` bằng `403 ACCOUNT_RESTRICTED` | Thu hồi cứng toàn bộ phiên `mobile` và chặn `login` bằng `403`: trái với luồng thay thế 3.2 của [UC-03](../use-cases/UC-03.md) (*“vẫn cho phép đăng nhập, hiển thị thông báo trạng thái tài khoản hiện tại và giới hạn các chức năng thao tác”*). |
| Chống ghi đè đồng thời giữa Kiểm duyệt viên | Khóa hàng `SELECT ... FOR UPDATE` kết hợp đối chiếu `expectedVersion` từ giao diện | Chỉ dùng `FOR UPDATE` không có `expectedVersion`: tuần tự hóa được câu lệnh SQL nhưng Kiểm duyệt viên thứ hai vẫn ghi đè mù lên quyết định vừa lưu của Kiểm duyệt viên thứ nhất. |
| Đánh số migration | Tạo mới `V5__user_management_and_reputation_ledger.sql` kế tiếp `V3`/`V4` của `P1-01` | Sửa `V1`/`V2`: vi phạm quy ước bất biến migration đã merge tại [quyết định P0-06](P0-06-quy-uoc-va-ci.md). |

## Tác động lên các task tiếp theo

- **`P1-02` (Hồ sơ & Duyệt kích hoạt)**: khi Kiểm duyệt viên chấp thuận kích hoạt lần đầu ([UC-02](../use-cases/UC-02.md)), gọi `ReputationLedgerService.initializeActivationScore(userId, moderatorId)` trong cùng transaction duyệt hồ sơ; dùng chung quy chuẩn đường dẫn ảnh thẻ (`studentCardFront`, `studentCardBack`).
- **`P1-06` (Quản lý Kiểm duyệt viên & Thang phạt)**: quản lý bảng `thang_phats` (`DANG_DUNG` / ngừng sử dụng) mà `ReputationLedgerService.applyPenaltyScale` đang đọc trực tiếp; có thể tái sử dụng API tra cứu người dùng khi tìm ứng viên bổ nhiệm Kiểm duyệt viên.
- **`Phase 2` & `Phase 3`**: mọi endpoint giao dịch dưới `/api/v1/**` tự động kế thừa cơ chế chặn `ROLE_MEMBER` và phản hồi `403 ACCOUNT_RESTRICTED`; `P3-04`/`P3-05`/`P3-06` gọi `recordScoreChange` / `applyPenaltyScale` kèm `idempotency_key` gắn mã giao dịch/quyết định để cộng trừ điểm đánh giá, xử phạt báo cáo và hoàn điểm khiếu nại.
