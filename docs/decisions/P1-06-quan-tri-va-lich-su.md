# P1-06 · Quyền quản trị và bảo toàn lịch sử

**Trạng thái:** đã triển khai, kiểm chứng local 19/11/2026; chờ Nguyễn Hữu Nguyên review. Không coi đây là phê duyệt các mức phạt nghiệp vụ.

## Ngữ cảnh

[UC-39](../use-cases/UC-39.md) yêu cầu chỉ quản trị viên cấp cao bổ nhiệm/thu hồi kiểm duyệt viên, ghi người/thời gian và trả báo cáo dở về hàng chờ. [UC-40](../use-cases/UC-40.md) yêu cầu mức phạt có tên duy nhất, điểm nguyên dương, mô tả, trạng thái và lịch sử giá trị trước/sau; sửa/ngừng không thay đổi quyết định cũ. FR-03 phân biệt vai trò; FR-12 không cho nhóm tự đặt số điểm phạt; NFR-01 giới hạn quyền dữ liệu.

V1 có bảng vai trò theo khoảng hiệu lực và quyết định chỉ tham chiếu thang phạt, chưa có snapshot/audit, mô tả/version mức phạt hoặc assignee báo cáo. V2 nạp sáu mức mẫu nhưng không cấp vai trò quản trị. P1-01 đã kiểm tra phiên và quyền hiện hành từ DB.

## Quyết định và lý do

1. Giữ auth P1-01, đặt toàn bộ API quản trị tại `/api/v1/admin/senior/**`. Trên thao tác ghi, kiểm tra lại tài khoản/quyền cấp cao trong transaction và khóa các hàng liên quan. Web không thay thế kiểm quyền API. Không tạo tài khoản cấp cao mặc định hoặc API cấp quyền cấp cao.
2. Bổ nhiệm/thu hồi dùng khóa tài khoản theo thứ tự cố định; `assignmentId` xác định lượt bổ nhiệm mà người quản trị đã xem. Thu hồi vai trò, trả `DANG_XU_LY` về `CHO_XU_LY`, xóa assignee và audit cùng commit/rollback. Không sửa báo cáo đã xử lý.
3. Thang phạt dùng `version` và khóa hàng để không ghi đè bản sửa mới. Tên duy nhất theo `lower(btrim(ten))`; điểm/version kiểm tra kiểu JSON nguyên trước khi chuyển sang PostgreSQL, không chấp nhận Jackson ép số thập phân thành số nguyên. Tìm kiếm áp dụng tên và mô tả.
4. Quyết định chụp tên/điểm/mô tả mức phạt bằng trigger DB lúc insert. Khóa `FOR SHARE` trên mức phạt để đồng bộ với sửa/ngừng; mức đã ngừng không dùng cho quyết định mới. Reference và snapshot của quyết định đã lưu không được sửa. Cách này bảo vệ cả các caller P2-06 về sau, không chỉ service hiện tại.
5. `governance_audit` lưu actor ID/tên tại thời điểm thao tác, action, đối tượng, timestamp, JSON trước/sau. Không có API sửa/xóa audit và không ghi hash mật khẩu/token/ảnh thẻ. UI chỉ dịch trường enum; tên/mô tả tự do phải hiển thị nguyên văn và lookup không đi qua prototype.
6. V6 giữ khóa của sáu mức mẫu V2 để bảo toàn FK nhưng chuyển `NGUNG_SU_DUNG`; không nạp mức mới hoặc xem số mẫu là chính sách đã duyệt. Quản trị viên cấp cao tạo mức áp dụng của mình qua UC-40. Giữ nguyên V1–V5.

## Tác động và giới hạn

- V6 bổ sung `bao_caos.nguoi_xu_ly_id`, mô tả/version/ràng buộc mức phạt, audit và snapshot quyết định. P2-06 dùng các cột này thay vì suy ra điểm quyết định cũ từ thang phạt hiện tại.
- Khi nâng DB có quyết định cũ, chỉ backfill được từ giá trị mức phạt hiện có; giá trị lịch sử chưa từng lưu không thể khôi phục. Backfill trước khi ngừng seed. Test nâng V5→V6 dùng schema riêng và xóa schema sau test; chưa chạy lại sau rebase (cần JDK 21).
- Không xóa mức phạt hoặc kích hoạt lại mức đã ngừng: UC-40 không có hai thao tác đó. Không tự tính lại uy tín hoặc triển khai xử lý báo cáo Phase 2 trong task này.
- Chi tiết hợp đồng, kết quả 37 test backend/17 test web và smoke client/API thật nằm tại [spec P1-06](../specs/P1-06.md).

## Phương án không chọn

- Chỉ ẩn menu: không chặn caller trực tiếp và token cũ.
- Chỉ join quyết định với mức phạt hiện tại: mất giá trị lịch sử sau chỉnh sửa.
- Snapshot chỉ tại service P1-06: caller ghi quyết định ở module khác có thể bỏ qua hoặc dùng mức vừa ngừng.
- Sửa/xóa V2 hoặc xóa sáu seed: phá checksum migration/FK và làm sai lịch sử; cũng không phải phê duyệt nghiệp vụ.
