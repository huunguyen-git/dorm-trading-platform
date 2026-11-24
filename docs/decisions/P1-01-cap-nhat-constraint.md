# P1-01 · Cập nhật ràng buộc xác thực

Ngày 17/11/2026. Theo yêu cầu người dùng: mật khẩu tối thiểu 8 ký tự, hoàn thiện ràng buộc P1-01 trước; ảnh thẻ và đăng ký lại hồ sơ tiếp tục ghép P1-02.

## Lựa chọn, lý do và tác động

- Mật khẩu **8–128 Unicode code point sau NFC**, thay ngưỡng 15–128 của quyết định 13/11. Giữ khoảng trắng, blocklist/HIBP, Argon2id và không yêu cầu trộn loại ký tự. Đây là ngưỡng riêng của dự án do người dùng yêu cầu; không coi là đáp ứng ngưỡng NIST được trích trong tài liệu cũ. Backend và client dùng cùng ngưỡng; không buộc tài khoản cũ đổi mật khẩu.
- UC-07: đổi mật khẩu thu hồi **mọi phiên**, yêu cầu đăng nhập lại. Thay lựa chọn giữ phiên hiện tại trong quyết định 13/11 để khớp hậu điều kiện UC hiện có. API change trả **204** và xóa cookie refresh, không trả token mới. Hai client phải cập nhật cùng backend.
- UC-04: chỉ cấp OTP/grant và thực hiện reset nếu tài khoản còn tồn tại, email đã xác minh, không VO_HIEU_HOA. Kiểm lại ở từng bước để không dùng grant sau khi bị vô hiệu. BI_KHOA vẫn được khôi phục mật khẩu, không mở khóa nghiệp vụ.
- Giữ phản hồi chung cho yêu cầu reset không đủ điều kiện để không công khai email nào tồn tại; đây là ngoại lệ đã chọn so với thông báo phân biệt email ở UC-04. Không gửi OTP hoặc cấp grant cho tài khoản không đủ điều kiện. Outbox vẫn bất đồng bộ và retry; phản hồi nhận yêu cầu không khẳng định SMTP đã giao thư.
- UC-03: BI_KHOA/chờ duyệt được phiên hạn chế, không MEMBER/MODERATOR/SENIOR_ADMIN. Mobile quản lý hồ sơ/bảo mật, đọc tin công khai. Web chỉ cấp phiên cho người có phân công quản trị còn hiệu lực; khi bị hạn chế chỉ dùng màn bảo mật, mọi API quản trị bị 403. VO_HIEU_HOA không được đăng nhập/refresh/sử dụng phiên. Không tự mở khóa hoặc tính lại điểm; quyền khiếu nại/giao dịch dở dang thuộc P1-05 và các task nghiệp vụ.
- HTTP 429 trả `{code,message,retryAfter}` cùng header `Retry-After` (giây, làm tròn lên). Thời gian chờ là thời điểm hết tất cả cửa sổ đang chặn, gồm cooldown, hạn giờ/ngày, IP, sai OTP, backoff login và sai mật khẩu hiện tại. Client hiển thị thông báo có số giây từ server; không giả định mọi 429 chỉ chờ 60 giây.
- UC-08: logout gặp 401 cuối cùng vẫn xóa phiên client và hoàn tất điều hướng; lỗi mạng/5xx giữ khả năng thử lại thu hồi phiên. 401 security khi đổi mật khẩu cũng xóa trạng thái hết hạn; 401 sai mật khẩu hiện tại không tự refresh hoặc đăng xuất.
- DTO chứa mật khẩu, OTP, access/refresh/reset token có `toString` che thông tin, tránh lộ qua log DEBUG của Spring. Không thay JSON contract vì serializer vẫn dùng accessor.

## Cập nhật tích hợp P1-05 · 24/11/2026

PR#26 đã vào main, thay phần quyền hạn chế ngày17/11 ở trên: web từ chối BI_KHOA bằng403 ACCOUNT_RESTRICTED; mobile giữ phiên hạn chế nhưng cấm sửa hồ sơ/đổi mật khẩu. VO_HIEU_HOA trả401 khi đăng nhập. Giữ logic khóa/mở và migration V5 của P1-05. Chỉ lỗi refresh403 thông thường giữ credentials;403 có mã ACCOUNT_RESTRICTED xử lý theo chính sách thu hồi phiên của từng client. Quyết định này tránh làm lùi quyền đã triển khai trên main; change204 và reset thu hồi mọi phiên vẫn giữ nguyên.

## Ranh giới

Không sửa V1–V4, không thêm migration. Không triển khai lưu ảnh thẻ/đăng ký lại hồ sơ hay quyết định duyệt của P1-02. A08 và chính sách quyền nghiệp vụ hạn chế của P1-05 giữ trạng thái còn mở. Thời hạn OTP, refresh và các ngưỡng chống đoán khác giữ nguyên.

Theo dõi phép thử và giới hạn thực tế tại [spec P1-01](../specs/P1-01.md). Không dùng kết quả 13/11 để xác nhận bản sửa 17/11.


## Làm rõ sau review P2 · 18/11/2026

Không đổi chính sách đã chốt. Khi access token hết hạn, 401 ban đầu chưa chứng minh refresh/session đã hết hiệu lực. Chỉ refresh 401 mới dẫn tới xóa phiên local; offline, 503, 403 và lỗi request logout gửi lại phải truyền lên để người dùng thử lại. Nếu refresh đã xoay token trước khi logout lỗi mạng, giữ token mới cho lần thử sau.

Retry-After lấy thời gian lớn nhất của IP và email theo đúng thao tác dưới khóa IP → email. Yêu cầu bị email chặn vẫn tính vào quota IP nếu IP chưa bị chặn; nếu chính yêu cầu đó làm đầy quota IP thì cộng cửa sổ vừa đầy vào thời gian chờ. Request đã bị IP chặn không kéo dài cửa sổ IP. Làm tròn lên tới giây kể cả timestamp DB có phần lẻ dưới mili giây. Thời gian báo phản ánh trạng thái lúc request; yêu cầu mới từ cùng email/IP có thể phát sinh giới hạn mới.
