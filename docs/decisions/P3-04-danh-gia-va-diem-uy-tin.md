# P3-04 · Thiết kế đánh giá giao dịch, bằng chứng riêng tư và đồng bộ điểm uy tín

Ngày: **28/11/2026** · Trạng thái: **Đã triển khai và kiểm chứng độc lập trên nhánh `huunguyen-git/feat/p3` (Chờ review)**.

## Bối cảnh và căn cứ

Tác vụ `P3-04` triển khai bộ ba Use Case [UC-30](../use-cases/UC-30.md) (Đánh giá giao dịch), [UC-31](../use-cases/UC-31.md) (Chỉnh sửa đánh giá giao dịch) và [UC-32](../use-cases/UC-32.md) (Xóa đánh giá giao dịch) trong module `review` (`com.dormtrading.review`), xây trên nền định danh (`P1-01`), sổ cái điểm uy tín & ngưỡng khóa (`P1-05`, migration `V5`), hạ tầng làm sạch ảnh media (`P2-01`, `MediaImageSanitizer`) và giao dịch/thông báo (`P2-04`/`P2-05`, migration `V13`). Chi tiết hợp đồng và kết quả kiểm chứng xem tại [spec P3-04](../specs/P3-04.md).

Các yêu cầu cốt lõi bắt buộc:
- [FR-10](../03-requirements.md#fr-10--đánh-giá-và-tính-điểm): chỉ người mua đánh giá người bán sau giao dịch `HOAN_TAT`; tối đa một đánh giá hiệu lực trên mỗi giao dịch trong hạn `15` ngày; thang điểm `5/4/3/2/1` sao tương ứng `+2/0/−1/−3/−5`; đánh giá `1–3` sao phải chờ kiểm duyệt trước khi công khai và trừ điểm; hết `15` ngày không gửi đánh giá thì cộng `+1` đúng một lần và không đồng thời với điểm đánh giá.
- [FR-12](../03-requirements.md#fr-12--khóa-tài-khoản-theo-điểm): ngưỡng khóa `30 < điểm ≤ 50` (khóa tạm `14` ngày) và `điểm ≤ 30` (khóa vĩnh viễn có quyền khiếu nại); hết khóa tạm mở lại và giữ điểm, chỉ vi phạm mới mới xét lại ngưỡng.
- [NFR-01](../03-requirements.md#nfr-01--quyền-truy-cập-dữ-liệu): bằng chứng đánh giá phải có nơi lưu và cơ chế phân quyền truy cập riêng biệt trước khi dùng dữ liệu thật; danh sách đánh giá công khai không rò rỉ bằng chứng riêng tư hay PII.
- [NFR-03](../03-requirements.md#nfr-03--gửi-lại-yêu-cầu-và-tính-điểm-một-lần): gửi lại yêu cầu hoặc thao tác đồng thời không tạo hai đánh giá hiệu lực, không cộng/đảo điểm hai lần và không cộng đồng thời `+1` với đánh giá sao.
- Khả năng nối tiếp cho `P3-05` ([UC-33](../use-cases/UC-33.md), [UC-34](../use-cases/UC-34.md)): giữ lịch sử phiên bản để khiếu nại gắn đúng phiên bản, giữ vị trí hàng đợi chờ xét khi sửa đánh giá `CHO_XET`, và khóa sửa/xóa theo trạng thái khiếu nại/quyết định kiểm duyệt.

## Quyết định kỹ thuật

### 1. Tiến hóa lược đồ `V14__reviews_and_reputation_hooks.sql` (sạch `V1 → V14` và nâng cấp `V13 → V14`)
- **Thay thế `UNIQUE (ma_giao_dich)` vô điều kiện của `V1` bằng partial unique index**:
  - Bảng `danh_gias` ở `V1` khai báo `ma_giao_dich UUID NOT NULL UNIQUE`, khiến một giao dịch sau khi xóa mềm đánh giá (`trang_thai = 'DA_XOA'`) không thể tạo đánh giá mới trong hạn `15` ngày như [UC-32](../use-cases/UC-32.md) yêu cầu.
  - Migration `V14` dò động và gỡ ràng buộc `UNIQUE` trên `danh_gias(ma_giao_dich)` (an toàn cho tên ràng buộc mặc định PostgreSQL cả ở cài mới lẫn nâng cấp từ `V13`), sau đó tạo partial unique index `uq_danh_gias_active_order ON danh_gias(ma_giao_dich) WHERE trang_thai <> 'DA_XOA'`.
  - Cách này vừa giữ nguyên toàn bộ bản ghi `DA_XOA` để truy vết (`UC-32`), vừa cưỡng chế ở tầng CSDL tối đa một đánh giá hiệu lực trên mỗi giao dịch (`NFR-03`) kể cả khi có hai request đồng thời.
- **Lịch sử phiên bản (`danh_gia_phien_bans`)**:
  - Mỗi lần tạo (`version_no = 1`) và chỉnh sửa (`version_no = k + 1`) ghi một dòng bất biến vào `danh_gia_phien_bans` với `UNIQUE(ma_danh_gia, version_no)`, lưu `so_sao`, `nhan_xet`, `evidence_ids`, `evidence_snapshot (JSONB)`, `trang_thai`, `score_delta_applied`, `apply_ledger_entry_id`, `reverse_ledger_entry_id`, `reversed_at`.
  - Khi chỉnh sửa cùng delta điểm (ví dụ `5★ → 5★` chỉ sửa nhận xét), bản ghi phiên bản mới kế thừa `apply_ledger_entry_id` của phiên bản trước để vết kiểm toán của từng phiên bản tự khép kín cho `P3-05`. Migration `V14` cũng backfill phiên bản `1` cho các bản ghi `danh_gias` đã có từ trước khi nâng cấp `V13 → V14`.
- **Tách riêng bảng và kho lưu trữ bằng chứng (`danh_gia_bang_chungs`)**:
  - Tách hoàn toàn khỏi bảng `media_files` công khai của `P2-01` và lưu tại thư mục gốc riêng `./data/review-evidence` (độc lập với `./data/uploads` của `MediaOrphanCleanupScheduler`, giữ mô hình tách kho như ảnh thẻ sinh viên `V8`).
  - Ràng buộc `content_type` (`image/jpeg`, `image/png`, `image/webp`), `size_bytes` (`1..5MB`), `sha256`, tái sử dụng `MediaImageSanitizer` để kiểm magic-byte và gỡ sạch EXIF/GPS/XMP/metadata; từ chối UUID trùng trong `evidenceIds` (`400 INVALID_INPUT`); khi chỉnh sửa gỡ bằng chứng, đánh dấu `active = FALSE` mà vẫn giữ tệp và bản ghi để bảo toàn ảnh chụp kiểm toán trong `danh_gia_phien_bans`.
- **Mốc thời gian phục vụ hàng đợi, khiếu nại và lũy đẳng**:
  - `queue_entered_at`: giữ nguyên khi sửa đánh giá `CHO_XET → CHO_XET` để không làm mất vị trí trong hàng đợi kiểm duyệt (`idx_danh_gias_moderation_queue`, [UC-31](../use-cases/UC-31.md) Alt 2); đặt `NULL` khi rời `CHO_XET` hoặc bị xóa mềm.
  - `thoi_diem_cong_khai`: làm mới `thoi_diem_cong_khai = now()` trên **mọi** lần tạo hoặc chỉnh sửa cho ra trạng thái `CHAP_NHAN` (`4–5★ → 4–5★`, `CHO_XET → 4–5★`, hoặc khi Kiểm duyệt viên duyệt `1–3` sao ở `P3-05`), và đặt `NULL` khi chuyển sang `CHO_XET`/`DA_XOA` — tránh việc Người mua chỉnh sửa đánh giá ở ngày thứ 10 làm Người bán mất cửa sổ khiếu nại `7` ngày của [UC-33](../use-cases/UC-33.md).
  - Chỉ mục lũy đẳng `idx_danh_gias_order_idemp` giới hạn phạm vi `WHERE trang_thai <> 'DA_XOA' AND create_idempotency_key IS NOT NULL` (và dịch vụ chỉ replay `200` khi `currentVersionNo == 1`), để xóa mềm và gửi đánh giá mới không bao giờ va chạm khóa cũ.

### 2. Tính điểm nguyên tử, đảo điểm an toàn với `FR-12` và khóa lũy đẳng tất định (`NFR-03`)
- Mọi thay đổi điểm từ `P3-04` đều ghi qua `ReputationLedgerService` vào sổ cái bất biến `lich_su_diem_uy_tin` (`V5`) trong cùng transaction dữ liệu với thao tác đánh giá, dùng khóa lũy đẳng tất định:
  - Áp dụng điểm đánh giá: `REVIEW_APPLY:<reviewId>:v<versionNo>` (áp dụng `+2` cho `5` sao; `4` sao có delta `0` và `1–3` sao ở `CHO_XET` có delta `0` nên chưa ghi bút toán trừ điểm).
  - Đảo điểm khi sửa hoặc xóa: `REVIEW_REVERSE:<reviewId>:v<versionNo>`.
  - Thưởng không đánh giá sau `15` ngày: `ORDER_NO_REVIEW_BONUS:<orderId>`.
- **Tối ưu sửa cùng delta (`newDelta == previousDelta`)**: khi người mua sửa nhận xét hoặc bằng chứng nhưng giữ nguyên tác động điểm (ví dụ `5★ → 5★` hoặc `4★ → 4★`), hệ thống chuyển tiếp `appliedScoreDelta` và `apply_ledger_entry_id` sang phiên bản mới mà không phát sinh cặp bút toán `-2 / +2` giả trên sổ cái và tránh lỗi kẹp biên `0` (`CHECK (diem_sau >= 0)`).
- **Tương tác đảo điểm với ngưỡng tự khóa `FR-12` (`recordReviewReversal`)**:
  - `ReputationLedgerService` bổ sung `recordReviewReversal(...)` gọi nội bộ `recordScoreChangeInternal(..., evaluateThresholdLock = false, incrementVersion = true)`.
  - Lý do: theo [FR-12](../03-requirements.md#fr-12--khóa-tài-khoản-theo-điểm), tài khoản đã hết khóa tạm `14` ngày và giữ điểm cũ (`≤ 50`) **không** bị khóa lại cho tới khi phát sinh *vi phạm mới*. Việc người mua sửa `5★ → 4★` hoặc xóa đánh giá `5★` chỉ là hoàn tác khoản thưởng `+2` trước đó, **không phải** vi phạm mới của người bán, nên không được kích hoạt tự khóa tạm/vĩnh viễn ngoài ý muốn.
  - Ngược lại, mọi khoản phạt thực sự (`applyPenaltyScale` và `recordScoreChange` dùng khi Kiểm duyệt viên duyệt đánh giá `1–3` sao `−1/−3/−5` ở `P3-05` [UC-34](../use-cases/UC-34.md)) vẫn giữ nguyên `evaluateThresholdLock = true`.

### 3. Quy tắc cộng `+1` sau 15 ngày và loại trừ lẫn nhau với đánh giá (`FR-10`, `NFR-03`)
- Cột `giao_dichs.da_cong_diem_khong_danh_gia` và `thoi_diem_cong_diem_khong_danh_gia` theo dõi trạng thái thưởng `+1` theo từng giao dịch kèm chỉ mục `idx_giao_dichs_no_review_bonus_due`.
- **Toán học cửa sổ `15` ngày (`ReviewPolicy`)**: `withinReviewWindow` đúng khi `now < completedAt + 15d`; `daysRemaining` tính bằng hàm trần (`ceil`) có xét cả `remaining.getNano() > 0` để luôn trả `1..15` khi còn trong hạn (kể cả biên dưới `1` giây như `deadline.minusMillis(500)` hoặc `deadline.minusNanos(1)`) và `0` khi hết hạn.
- **Thứ tự khóa toàn cục chống deadlock với `OrderService`/`ListingService`/`ReputationLedgerService`**:
  `(1) thanh_viens (UUID tăng dần; người bán FOR UPDATE, người mua FOR KEY SHARE) → (2) tin_dangs → (3) giao_dichs (FOR NO KEY UPDATE) → (4) danh_gias (FOR NO KEY UPDATE) → (5) do_vats`.
- `ReviewBonusService.processDueNoReviewBonuses()` (được `NoReviewBonusScheduler` gọi định kỳ và tắt lịch tự động trong profile test để kiểm thử tất định theo `Clock`) xử lý từng giao dịch quá hạn `15` ngày trong transaction `REQUIRES_NEW`, khóa `thanh_viens(seller) FOR UPDATE → giao_dichs(order) FOR NO KEY UPDATE`, kiểm tra lại `da_cong_diem_khong_danh_gia = FALSE` và `NOT EXISTS (SELECT 1 FROM danh_gias WHERE ma_giao_dich = ? AND trang_thai <> 'DA_XOA')`:
  - Đánh giá ở trạng thái `CHO_XET`, `CHAP_NHAN`, `BI_BAC`, `DA_GO` đều chặn `+1` (khớp giả định [UC-30](../use-cases/UC-30.md) và [UC-34](../use-cases/UC-34.md): đánh giá chờ xét hoặc bị bác vẫn tính là đã gửi).
  - Đánh giá đã bị người mua xóa mềm (`DA_XOA`) đưa giao dịch về trạng thái chưa đánh giá, nên nếu đã quá `15` ngày và không có đánh giá mới, người bán được cộng `+1` đúng một lần (`UC-32`).
  - Ở chiều ngược lại, `POST /api/v1/orders/{orderId}/review` và `POST /api/v1/orders/{orderId}/review/evidence` cũng lấy cùng thứ tự khóa và kiểm tra cả mốc `15` ngày lẫn `da_cong_diem_khong_danh_gia = FALSE` (trả `409 NO_REVIEW_BONUS_ALREADY_APPLIED`), bảo đảm `+1` và tạo đánh giá loại trừ lẫn nhau tuyệt đối dưới tải đồng thời.

### 4. Bảo mật bằng chứng riêng tư (`NFR-01`), ẩn đánh giá chưa duyệt và đánh giá công khai
- Bằng chứng đánh giá chỉ được tải xuống qua endpoint xác thực `GET /api/v1/reviews/evidence/{evidenceId}` với `Cache-Control: no-store, private`, `X-Content-Type-Options: nosniff`, `Vary: Authorization`.
- Quyền đọc bằng chứng giới hạn chặt tại lớp service (kiểm vai trò `ROLE_MODERATOR`/`ROLE_SENIOR_ADMIN` trực tiếp từ Spring Security `Authentication` authorities để tôn trọng scope token):
  - Người mua gửi đánh giá, `MODERATOR` và `SENIOR_ADMIN` được truy cập tệp nháp lẫn tệp đã gắn đánh giá/lịch sử.
  - **Người bán bị đánh giá chỉ được tải xuống khi đánh giá ở trạng thái `CHAP_NHAN` hoặc `DA_GO` VÀ `(e.active = TRUE OR bằng chứng từng gắn với một phiên bản CHAP_NHAN/DA_GO trong danh_gia_phien_bans)`** — chặn hoàn toàn (`403 FORBIDDEN`) với `CHO_XET`, `BI_BAC`, `DA_XOA`, nháp chưa gắn đánh giá, cũng như tệp bằng chứng cũ chỉ từng gắn ở phiên bản `CHO_XET` trước khi người mua sửa lên `CHAP_NHAN`.
  - Mọi thành viên khác nhận `403 FORBIDDEN`, khách chưa đăng nhập nhận `401`.
- Quy tắc ẩn đánh giá chưa duyệt (`CHO_XET`/`BI_BAC`) với Người bán được áp dụng đồng nhất trên mọi bề mặt: `GET /api/v1/orders/{orderId}/review` (lọc `versions` chỉ giữ `CHAP_NHAN`/`DA_GO`), `OrderDetailDto.reviewSummary`, `OrderSummaryDto.reviewStatus` và thông báo (`REVIEW_UPDATED` khi hạ từ `4–5★ → 1–3★` dùng nội dung trung tính không lộ sao/nhận xét mới; xóa đánh giá đang `CHO_XET` bỏ qua thông báo `REVIEW_DELETED` cho Người bán).
- API công khai `GET /api/v1/sellers/{sellerId}/reviews` (`permitAll()`) chỉ trả các bản ghi `CHAP_NHAN`, ẩn người bán `CHO_KICH_HOAT` và `VO_HIEU_HOA` (`404 SELLER_NOT_FOUND`), giữ `seller.averageRating` (`null` khi `0`), `seller.reviewCount` và `starDistribution` tính trên **toàn bộ** đánh giá `CHAP_NHAN` trong khi lọc `items`/`totalElements`/`totalPages` theo `rating`, chỉ trả thông tin hiển thị tối thiểu (Zero-PII) và tuyệt đối không chứa trường `evidence` hay URL bằng chứng.
- Trên `mobile`: `buildReviewEvidenceImageSource` chỉ gắn header `Authorization: Bearer` cho đúng đường dẫn chuẩn `/api/v1/reviews/evidence/{uuid}` cùng `origin` (không rò token sang host/cổng/đường dẫn khác); store `useReviews` bảo vệ cô lập dữ liệu phiên qua `sessionEpoch` khi đăng xuất hoặc đổi tài khoản; `OrdersScreen` chặn hiển thị CTA đánh giá cho đơn `HOAN_TAT` đã quá `15` ngày bằng `isOrderWithinReviewWindow(order.completedAt)`.

### 5. Khóa tương thích tiến cho `P3-05` (`UC-33`, `UC-34`), thứ tự kiểm quyền `UC-32` và ranh giới 15 ngày
- **Khóa sửa/xóa theo khiếu nại và quyết định kiểm duyệt**:
  - Đánh giá bị khóa chỉnh sửa ([UC-31](../use-cases/UC-31.md)) và xóa ([UC-32](../use-cases/UC-32.md)) khi: đã có quyết định xét duyệt (`thoi_diem_xet IS NOT NULL`, `nguoi_xet_id IS NOT NULL`, `trang_thai IN ('BI_BAC', 'DA_GO')`, hoặc tồn tại bản ghi `quyet_dinhs` liên kết qua `khieu_nais` → `409 REVIEW_MODERATED` / `409 REVIEW_COMPLAINT_LOCKED`), hoặc có bản ghi `khieu_nais` với `trang_thai IN ('CHO_XU_LY', 'DA_XU_LY')` (`409 REVIEW_COMPLAINT_LOCKED`).
  - Riêng khiếu nại đã rút (`khieu_nais.trang_thai = 'DA_RUT'`) và chưa có quyết định `quyet_dinhs` **không** khóa sửa/xóa, đúng theo luồng rút khiếu nại của [UC-33](../use-cases/UC-33.md) (*“mở lại quyền chỉnh sửa/xóa cho Người mua”*).
- **Kiểm tra quyền sở hữu trước lũy đẳng xóa mềm (`UC-32`)**: `DELETE /api/v1/reviews/{reviewId}` luôn xác minh đúng `buyerId` trước khi kiểm tra bản ghi đã `DA_XOA` để trả `200 idempotentReplay = true`, ngăn bên thứ ba dò trạng thái xóa.
- **Ranh giới cửa sổ `15` ngày giữa `UC-31` và `UC-32`**:
  - [UC-31](../use-cases/UC-31.md) bắt buộc còn trong `15` ngày tính từ `thoi_diem_hoan_tat` (chỉnh sửa không gia hạn cửa sổ mới).
  - [UC-32](../use-cases/UC-32.md) **không** đặt tiền điều kiện còn trong `15` ngày: Người mua vẫn có thể xóa mềm đánh giá chưa có quyết định xét duyệt và chưa có khiếu nại sau mốc `15` ngày (`withinReviewWindow = false, canEdit = false, lockReason = REVIEW_WINDOW_EXPIRED, canDelete = true`); hậu điều kiện của `UC-32` nêu rõ nếu còn hạn `15` ngày thì được đánh giá lại, còn nếu đã hết hạn mà không có đánh giá thì giao dịch đủ điều kiện áp dụng `+1` một lần cho Người bán.
- **Khóa lạc quan `expectedVersion`**: `PUT /api/v1/reviews/{reviewId}` bắt buộc `expectedVersion` (và `DELETE` hỗ trợ tùy chọn `expectedVersion`) đối chiếu với `danh_gias.version` dưới khóa hàng `FOR NO KEY UPDATE`, tránh ghi đè đồng thời giữa các thao tác của Người mua và thao tác khiếu nại/kiểm duyệt ở `P3-05`.

## Các phương án đã cân nhắc

| Vấn đề | Phương án chọn | Phương án thay thế & lý do không chọn |
|---|---|---|
| Cho phép đánh giá lại sau khi xóa mềm (`UC-32`) | Gỡ `UNIQUE (ma_giao_dich)` của `V1`, thay bằng partial unique index `WHERE trang_thai <> 'DA_XOA'` | Xóa cứng (`DELETE`) bản ghi cũ hoặc ghi đè trực tiếp trên dòng `DA_XOA`: xóa cứng mất vết kiểm toán/sổ cái trái [UC-32](../use-cases/UC-32.md); tái sử dụng dòng cũ làm lẫn lịch sử phiên bản giữa hai lần đánh giá độc lập. |
| Lưu bằng chứng đánh giá (`NFR-01`) | Bảng `danh_gia_bang_chungs` + thư mục `./data/review-evidence` + endpoint xác thực riêng kèm kiểm tra lịch sử phiên bản với Người bán | Lưu chung `media_files` của tin đăng (`P2-01`): `media_files` phục vụ ảnh công khai có cache public `300s` và chịu tác động của `MediaOrphanCleanupScheduler`, dễ gây rò rỉ hoặc xóa nhầm bằng chứng kiểm toán. |
| Đảo điểm `+2` khi sửa/xóa đánh giá `5★` | Thêm `recordReviewReversal(..., evaluateThresholdLock = false)` | Dùng trực tiếp `recordScoreChange` có xét tự khóa `FR-12`: làm người bán đang ở mức `≤ 50` (sau khi đã hết khóa tạm `14` ngày) bị khóa oan dù không có vi phạm mới, trái [FR-12](../03-requirements.md#fr-12--khóa-tài-khoản-theo-điểm). |
| Sửa nhận xét nhưng giữ nguyên số sao có cùng delta (ví dụ `5★ → 5★`) | Chuyển tiếp `appliedScoreDelta` và `apply_ledger_entry_id` sang phiên bản mới, không ghi cặp `-2/+2` | Luôn đảo rồi cộng lại mỗi lần sửa: tạo nhiễu sổ cái `lich_su_diem_uy_tin` và có nguy cơ sai lệch nếu điểm người bán chạm biên kẹp `0`. |
| Phản ánh `+1` sau `15` ngày | Scheduler nền `NoReviewBonusScheduler` + `ReviewBonusService` khóa `FOR UPDATE`/`FOR NO KEY UPDATE` + `REQUIRES_NEW` (tắt cron trong test, gọi trực tiếp với `Clock`) | Chỉ tính lười khi đọc hồ sơ người bán: không tạo kịp bản ghi sổ cái và thông báo `ORDER_NO_REVIEW_BONUS` cho người bán không mở lại đơn cũ. |

## Tác động lên các task tiếp theo

- **`P3-02` (Hoàn tất giao dịch OTP — `UC-27`) & `P3-03` (Quá hạn/tranh chấp — `UC-29`)**: khi chuyển `giao_dichs.trang_thai = 'HOAN_TAT'`, bắt buộc thiết lập `thoi_diem_hoan_tat = now()` (không để `NULL`) để kích hoạt cửa sổ đánh giá `15` ngày và tác vụ thưởng `+1` của `P3-04`.
- **`P3-05` (Khiếu nại & Kiểm duyệt đánh giá — `UC-33`, `UC-34`)**:
  - Đọc hàng đợi chờ xét `1–3` sao trực tiếp theo `idx_danh_gias_moderation_queue (queue_entered_at ASC, ma_danh_gia ASC) WHERE trang_thai = 'CHO_XET'`.
  - Gắn khiếu nại `UC-33` với phiên bản cụ thể từ `danh_gia_phien_bans` và dùng `danh_gias.thoi_diem_cong_khai` làm mốc tính hạn `7` ngày; kiểm tra `danh_gias.version` để từ chối nếu người mua vừa sửa/xóa.
  - Khi Kiểm duyệt viên duyệt `1–3` sao (`UC-34`): cập nhật `trang_thai = 'CHAP_NHAN'` (hoặc `'BI_BAC'`), `thoi_diem_xet = now()`, `nguoi_xet_id`, `thoi_diem_cong_khai` (nếu chấp nhận), và gọi `ReputationLedgerService.recordScoreChange` (giữ `evaluateThresholdLock = true`) với khóa `REVIEW_APPLY:<reviewId>:v<ver>` để trừ `−1/−3/−5` và tự xét ngưỡng `FR-12`.
  - Khi chấp nhận khiếu nại (`DA_GO`): dùng `recordReviewReversal` với khóa `REVIEW_REVERSE:<reviewId>:v<ver>` và rà soát hoàn tác hạn chế phát sinh theo hậu điều kiện `UC-34`.
  - Truy cập bằng chứng đánh giá trực tiếp qua `GET /api/v1/reviews/evidence/{evidenceId}` (đã mở quyền cho `MODERATOR` và `SENIOR_ADMIN`).
- **`P4-02`, `P4-03`, `P4-04`**: kiểm thử E2E xuyên luồng hoàn tất đơn → đánh giá → sửa/xóa → công khai trên thiết bị/emulator thật (`P4-02`), kiểm thử chịu tải & đột biến cho tranh chấp gửi đúp / thưởng `+1` (`P4-03`), và kiểm tra thâm nhập ACL bằng chứng riêng tư (`P4-04`).
