# P1-01 · Chính sách OTP, mật khẩu và phiên

Ngày: **13/11/2026** · Trạng thái: **Đã duyệt bởi người dùng** qua yêu cầu “Duyệt toàn bộ”. Đã triển khai; kết quả kiểm chứng và giới hạn tại spec P1-01.

## Phạm vi và căn cứ

P1-01 → UC-01/03/04/07/08, Người dùng và phiên web quản trị → FR-01, FR-03, NFR-01. Người dùng đã chốt đăng xuất từng phiên và quyền tài khoản chờ duyệt, sau đó duyệt toàn bộ đề xuất OTP/mật khẩu. Các ngưỡng dưới đây là quyết định riêng của dự án, không lấy từ OTP bàn giao FR-09 và không khẳng định là ngưỡng nội bộ của sàn thương mại điện tử.

Tham khảo đã đối chiếu ngày 13/11/2026:

- [Amazon: reset mật khẩu](https://www.aboutamazon.com/news/retail/reset-amazon-prime-login): xác minh yêu cầu bằng OTP email/điện thoại.
- [eBay: reset và đổi mật khẩu](https://www.ebay.com/help/account/changing-password/reset-password?id=4197): quên mật khẩu xác minh email/SMS; đổi khi biết mật khẩu yêu cầu mật khẩu hiện tại.
- [eBay: xác minh thao tác nhạy cảm](https://www.ebay.com/help/account/protecting-account/multifactor-authentication?id=5475): có xác minh bổ sung khi thay thông tin nhạy cảm.
- [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html): tối thiểu 15 ký tự khi mật khẩu là yếu tố duy nhất; không bắt trộn loại ký tự hoặc đổi định kỳ. OTP đăng ký/reset không làm đăng nhập thông thường thành MFA.
- [OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html): phản hồi nhất quán, mã dùng một lần, hết hạn, hạn chế tần suất; sau reset đăng nhập lại và xử lý phiên cũ.

## Quyết định

### OTP đăng ký và đặt lại mật khẩu

| Yếu tố | Chính sách đã duyệt |
|---|---|
| Kênh, định dạng | Email sinh viên đăng ký; 6 chữ số ngẫu nhiên bằng bộ sinh mật mã; cho phép dán mã |
| Hiệu lực | 5 phút |
| Nhập sai | Tối đa 5 lần/mã; lần sai thứ 5 vô hiệu mã |
| Gửi lại | Chờ 60 giây; mã mới thay thế mã cũ |
| Giới hạn gửi | 5 lần/giờ, 10 lần/ngày/email; tính cả gửi đầu và gửi lại |
| Giới hạn xác minh sai | 10 lần/giờ/email; gửi lại không xóa bộ đếm |
| Phạm vi và tiêu thụ | Tách mục đích đăng ký/reset; mã dùng một lần, tiêu thụ nguyên tử khi có yêu cầu đồng thời |
| Sau xác minh OTP reset | Cấp quyền chỉ đặt lại mật khẩu, dùng một lần, hiệu lực 5 phút; không cấp phiên đăng nhập |
| Phản hồi yêu cầu quên mật khẩu | “Nếu email có tài khoản phù hợp, chúng tôi sẽ gửi mã xác minh.” |
| Vượt giới hạn | Tạm dừng thao tác gửi/xác minh, không chuyển tài khoản sang trạng thái khóa giao dịch |

Có thêm giới hạn theo IP, rộng hơn giới hạn email để phù hợp mạng ký túc xá dùng chung. Ngưỡng IP cụ thể chưa được đề xuất/duyệt; cần chọn khi triển khai và ghi rõ. Các giới hạn phải cấu hình được. Không trả mã trong API hoặc log; không lưu OTP dạng rõ. Lỗi gửi email phải có trạng thái/retry rõ ràng, không báo gửi thành công giả.

### Mật khẩu và chống đoán

| Yếu tố | Chính sách đã duyệt |
|---|---|
| Độ dài | 15–128 ký tự |
| Ký tự | Cho phép khoảng trắng và Unicode; không bắt buộc hoa/thường/số/ký tự đặc biệt |
| Mật khẩu yếu | Chặn mật khẩu phổ biến, đã lộ và giá trị dễ đoán gắn với tài khoản |
| Trải nghiệm | Cho phép dán, trình quản lý mật khẩu và hiện/ẩn mật khẩu |
| Đổi định kỳ | Không bắt đổi theo lịch; yêu cầu đổi khi có dấu hiệu bị lộ |
| Tái sử dụng | Mật khẩu mới khác hiện tại; chưa lưu lịch sử nhiều mật khẩu |
| Đăng nhập sai | Sau 5 lần liên tiếp, tăng thời gian chờ; chặn thử tối đa 15 phút, không khóa vĩnh viễn |

Lưu mật khẩu bằng hàm băm chuyên dụng, không dạng rõ hoặc mã hóa có thể giải ngược. Thuật toán/tham số băm, nguồn danh sách mật khẩu yếu và lịch tăng thời gian chờ cụ thể là chi tiết triển khai còn phải ghi nhận; chưa có giá trị được duyệt riêng.

### Phiên và thay đổi mật khẩu

| Thao tác | Xác minh và hiệu lực |
|---|---|
| Đăng xuất | Thu hồi phiên hiện tại và refresh family tương ứng, xóa token client; các phiên khác tiếp tục sử dụng |
| Đổi mật khẩu khi đã đăng nhập | Kiểm tra mật khẩu hiện tại; giữ phiên hiện tại bằng token mới, thu hồi các phiên khác |
| Quên/reset mật khẩu | OTP email → quyền reset → mật khẩu mới; thu hồi tất cả phiên, yêu cầu đăng nhập lại, không tự đăng nhập |
| Thông báo | Sau đổi/reset thành công gửi email thông báo, không gửi mật khẩu |
| Hiệu lực thu hồi | Request tiếp theo dùng phiên/token đã thu hồi bị từ chối; không chờ access token hết hạn 15 phút |

Giữ nền ADR-003: access 15 phút, refresh 30 ngày xoay vòng; mobile SecureStore, web access trong bộ nhớ và refresh cookie HttpOnly/Secure/SameSite=Strict. Bổ sung kiểm tra trạng thái phiên hoặc phiên bản bảo mật ở backend. Cần định danh phiên để logout không dựa trên userId đơn thuần; đổi/reset cập nhật mật khẩu và thu hồi phiên nhất quán. Cách kiểm tra/cache phải bảo đảm hiệu lực đã nêu.

### Tài khoản chờ duyệt và phạm vi

- Được tự quản lý hồ sơ và lướt/xem mặt hàng công khai; chưa được đăng bán, nhắn tin, giữ chỗ hoặc giao dịch. Xem mặt hàng không cấp quyền đọc dữ liệu riêng của người bán.
- Chỉ tài khoản đạt cả xác minh email và duyệt hồ sơ mới có quyền giao dịch theo FR-01. Quyền hạn chế khi chờ duyệt phải kiểm tại API, không chỉ ẩn nút.
- Đổi email đăng nhập là luồng xác minh riêng, không cập nhật trực tiếp như họ tên/ngành học. Chưa chốt chi tiết hai địa chỉ email và hiệu lực phiên khi đổi email.
- MFA/passkey là bước tiếp nối, ưu tiên quản trị, chưa nằm trong P1-01.

## Thay thế, lý do và tác động

Thay phần ADR-003 về logout thu hồi mọi refresh token, đổi mật khẩu không giữ phiên hiện tại, access bị thu hồi vẫn tồn tại tới hết hạn và người chờ duyệt chỉ được dùng đăng ký/OTP/thẻ. Các phần khác giữ nguyên trừ khi có quyết định tiếp theo. Khóa/xóa tài khoản vẫn cần phối hợp UC và P1-05/P3-01; không suy ra mọi chi tiết nghiệp vụ từ quyết định này.

Lý do: đăng xuất từng phiên không gián đoạn thiết bị khác; thay mật khẩu loại bỏ phiên có thể bị chiếm dụng; OTP có giới hạn tránh thử mã và gửi email hàng loạt; người chờ duyệt vẫn khám phá sàn; mật khẩu dài tránh gánh nặng quy tắc trộn ký tự.

Tác động: thêm dữ liệu phiên/refresh family, OTP và bộ đếm; kiểm tra thu hồi trên request; bổ sung UI đếm ngược/gửi lại, lỗi giới hạn, quản lý phiên và màn chờ duyệt. Không tái sử dụng bảng OTP giao dịch, không sửa V1/V2. Xung đột tên quyền ADMIN/SENIOR_ADMIN, DTO/URL, cookie path và quyền chi tiết A08 vẫn cần thống nhất khi triển khai; không coi phê duyệt chính sách là bằng chứng code đã hoàn thành.

## Kiểm chứng cần thực hiện

Test biên thời gian và lượt thử OTP; gửi lại không reset bộ đếm; mã dùng sai mục đích; hai request dùng một mã chỉ một thành công. Thử mật khẩu dài 14/15/128/129 ký tự, khoảng trắng/Unicode và blocklist. Đăng nhập hai thiết bị: logout một giữ thiết bị kia; đổi mật khẩu giữ phiên hiện tại và chặn phiên kia; reset chặn cả hai ở request tiếp theo. Thử cả API trực tiếp cho quyền chờ duyệt và trường hợp sửa email qua API hồ sơ.

Xem [spec P1-01](../specs/P1-01.md). Bằng chứng thực tế nằm tại bảng tiêu chí nghiệm thu của spec; không suy phê duyệt chính sách thành tất cả tiêu chí đã đạt.


## Lựa chọn triển khai · 13/11/2026

- Argon2id (salt 16 byte, hash 32 byte, 19 MiB, 2 lượt, parallelism 1) qua Spring Security/Bouncy Castle 1.86. Căn cứ: [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [Bouncy Castle release](https://www.bouncycastle.org/resources/new-release-bouncy-castle-java-1-86/).
- HIBP [range API](https://haveibeenpwned.com/API/v3#PwnedPasswords): chỉ gửi 5 ký tự đầu SHA-1 qua HTTPS, padding và timeout; trả 503 nếu không kiểm tra được. Không dùng SHA-1 để lưu mật khẩu. Chuẩn hóa NFC, đếm code point; cho phép khoảng trắng. Integration test tắt truy vấn mạng, runtime mặc định bật.
- IP thêm 100 yêu cầu auth công khai/giờ; cửa sổ trượt email 1h/24h; không tin forwarded header chưa cấu hình. Đăng nhập sai từ lần5 tăng chờ 30/60/120/240/480/900 giây, không khóa nghiệp vụ. Các giới hạn OTP/IP có property cấu hình.
- Vai trò canonical MEMBER/MODERATOR/SENIOR_ADMIN; ADMIN cũ được thay thế. Web `/admin/**` cho moderator/senior, `/admin/senior/**` chỉ senior. Vai trò quản trị không cấp cho phiên mobile. Phải dùng prefix đúng khi các task tiếp theo thêm API; quyền chi tiết A08 vẫn mở.
- JWT có issuer dorm-trading, sub=userId, sid, generation, roles, client, jti, iat/exp. Kiểm DB ở mỗi request để thu hồi ngay và áp quyền mới. Session hết hạn tuyệt đối sau30 ngày, refresh không gia hạn vô tận. Logout theo sid; change tăng generation của phiên hiện tại và cấp token mới; reset thu hồi tất cả.
- Web cookie giữ path `/api/v1/auth/refresh`; logout dùng Bearer để xác định sid và xóa cookie cùng path. Origin allowlist, CORS credentials và expose WWW-Authenticate. Client chỉ retry khi challenge Bearer, không tự lặp lỗi mật khẩu nghiệp vụ. Web Locks giảm refresh cạnh tranh giữa tab ở trình duyệt hỗ trợ.
- V3/V4 mới, không sửa V1/V2. Không tự backfill email_verified/profile_approved=true cho dữ liệu cũ. Tài khoản mới điểm0, chuyển100 đúng một lần thuộc giao dịch kích hoạt của P1-02.
- OTP/challenge/refresh/reset grant lưu HMAC-SHA256; SMTP OTP dùng outbox mã hóa AES-GCM (khóa dẫn xuất HMAC theo domain riêng từ JWT_SECRET, nonce ngẫu nhiên12 byte, AAD=challengeId). Worker retry3 giây khi chưa gửi trong hạn mã; payload được xóa sau gửi. Response chỉ nói sẽ gửi nếu phù hợp; không chờ SMTP để tránh phân biệt email tồn tại qua thời gian mạng. Đổi/reset tạo thông báo outbox, retry30 giây; không rollback mật khẩu vì lỗi gửi thông báo.
- Cấu hình khóa khác sau restart làm mất khả năng gửi payload OTP cũ và xác minh token cũ; vận hành phải giữ khóa riêng ổn định qua restart. Rotation khóa cần kế hoạch riêng, không tự thay mỗi lần deploy.
- Bổ sung GET /listings chỉ đọc CONG_KHAI để thực hiện quyền xem khi chờ duyệt. Search/publish đầy đủ thuộc Phase2. Hồ sơ trong P1-01 chỉ đổi họ tên; email bị từ chối, chưa thêm luồng đổi email khi thiếu UC chi tiết.
