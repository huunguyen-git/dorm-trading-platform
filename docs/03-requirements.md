# Yêu cầu của sàn giao dịch đồ dùng sinh viên

Nguồn của danh mục là sheet `P2_05_DacTaYeuCau` trong `Biểu mẫu OOAD_Nhóm 14 (1).xlsx`. Tiêu đề ngắn dùng để tra cứu. Số dòng dẫn về yêu cầu gốc.

**Quy tắc nghiệp vụ (BR)** nằm trong phát biểu, tiêu chí chấp nhận và ghi chú của FR/NFR. Khi viện dẫn, dùng mã gốc và nêu điều kiện cụ thể, ví dụ “FR-08 · tối đa một giữ hiệu lực trên mỗi đồ vật”. Sheet không cấp mã BR hoặc mã UC.

**Phạm vi và điểm còn mở.** FR-14 đã bị loại khỏi phạm vi. Một dòng có trạng thái “Đã duyệt” vẫn có thể chứa chi tiết cần xác nhận, như bán kính ở FR-06 hoặc SLA ở NFR-04.

## Tra theo tác vụ

Bảng sau là gợi ý đối chiếu với [roadmap](02-roadmap-todo.md). Chọn điều khoản theo hành vi thật sự bị tác động. Rà thêm các NFR theo dữ liệu, tính đồng thời và thao tác gửi lại.

| Tác vụ | UC để tra trong roadmap | Mã nên đọc trước |
|---|---|---|
| Tài khoản, hồ sơ, quyền | UC-01–08, UC-11–16, UC-39–40 tùy thao tác | FR-01–03, FR-12, NFR-01 |
| Kho, tin, tìm kiếm | UC-09–10, UC-17–20 | FR-04–06, FR-13, NFR-02 |
| Chat, giữ chỗ, hẹn giao | UC-21–26 | FR-07–08, NFR-01–02 |
| Bàn giao, hủy sau báo giao, tranh chấp | UC-27–29 | FR-08–09, NFR-01, NFR-03 |
| Đánh giá, khiếu nại, uy tín | UC-30–34 | FR-10, FR-12, NFR-01, NFR-03 |
| Báo cáo vi phạm, thống kê | UC-35–38 | FR-11–12, FR-15–18, NFR-01 |
| Hạ tầng, kiểm thử tải | Theo luồng được kiểm thử nếu có | NFR-01–04 tùy tác động |

## Yêu cầu chức năng (FR)

### FR-01 · Đăng ký và kích hoạt

Đăng ký bằng hồ sơ gồm họ tên, MSSV, email *.edu.vn được xác minh OTP; gửi thẻ sinh viên để admin đối chiếu và duyệt kích hoạt.

- **Tiêu chí chấp nhận** · Email OTP hợp lệ và admin duyệt hồ sơ là hai điều kiện riêng; tài khoản chỉ hoạt động sau khi đạt cả hai.
- **Ghi chú** · MSSV là thuộc tính, User_ID riêng; không suy ra MSSV từ email.
- **Nguồn** · SH-01, SH-02, SH-04, SH-05 · **Ưu tiên** · Bắt buộc · **Trạng thái** · Đã duyệt · **Dòng** · 5

### FR-02 · Tình trạng tốt nghiệp

Không khóa tài khoản chỉ vì tốt nghiệp; trạng thái học tập chuyển thành Đã tốt nghiệp và tài khoản tiếp tục sử dụng.

- **Tiêu chí chấp nhận** · Tốt nghiệp không vô hiệu tài khoản; nhắc cập nhật học tập hằng năm theo chính sách được xác nhận.
- **Nguồn** · SH-04, SH-06 · **Ưu tiên** · Bắt buộc · **Trạng thái** · Đã duyệt · **Dòng** · 6

### FR-03 · Điểm ban đầu và vai trò

Tài khoản kích hoạt có điểm uy tín ban đầu 100; thành viên có thể mua/bán; admin cấp cao và kiểm duyệt viên có nhiệm vụ phân biệt.

- **Tiêu chí chấp nhận** · Điểm ban đầu = 100; vai trò mua/bán theo từng giao dịch, không đồng nhất với quyền hệ thống.
- **Ghi chú** · Quyền chi tiết A08 còn mở.
- **Nguồn** · SH-01, SH-02, SH-03, SH-04 · **Ưu tiên** · Bắt buộc · **Trạng thái** · Đã duyệt · **Dòng** · 7

### FR-04 · Kho cá nhân và tin lẻ/combo

Người bán quản lý đồ vật trong kho cá nhân và tạo tin lẻ/combo; tin có mô tả, tình trạng, giá/giá 0, vị trí và 1–5 ảnh thực tế.

- **Tiêu chí chấp nhận** · Tin lẻ tham chiếu một đồ vật; combo nhiều đồ vật bán nguyên bộ; một đồ vật có thể nằm trong nhiều tin nhưng không giữ/bán trùng.
- **Ghi chú** · Tài liệu giáo trình có thuộc tính chuyên biệt theo FR-04.
- **Nguồn** · SH-02 · **Ưu tiên** · Bắt buộc · **Trạng thái** · Đã duyệt · **Dòng** · 8

### FR-05 · Kiểm duyệt và hạn mức tin

Tin phải được kiểm duyệt trước công khai; giới hạn tin mở/giữ chỗ là tối đa 5 khi điểm <120 và 10 khi điểm ≥120.

- **Tiêu chí chấp nhận** · Tính tin mở và đang giữ; không tính nháp/chờ duyệt/ẩn/hết hạn/hoàn tất. Tụt điểm không gỡ tin hiện có nhưng chặn công khai thêm khi vượt hạn mức.
- **Ghi chú** · Tin bị ẩn do vi phạm vẫn xử lý theo chính sách.
- **Nguồn** · SH-02, SH-03 · **Ưu tiên** · Bắt buộc · **Trạng thái** · Đã duyệt · **Dòng** · 9

### FR-06 · Tìm kiếm và lọc tin

Hệ thống phân loại và cho tìm tin theo từ khóa, danh mục phân cấp, mã môn, giá tối đa và vị trí/bán kính.

- **Tiêu chí chấp nhận** · Người dùng lọc theo các tiêu chí được cung cấp; bán kính cụ thể chưa chốt.
- **Ghi chú** · Không coi ví dụ 2/3 km là giới hạn đã chốt.
- **Nguồn** · SH-01 · **Ưu tiên** · Bắt buộc · **Trạng thái** · Đã duyệt · **Dòng** · 10

### FR-07 · Thương lượng giá

Người mua và người bán nhắn tin trực tiếp, gửi đề nghị giá; thêm giỏ/gửi yêu cầu đặt hàng/chấp nhận giá tự nó chưa giữ hàng.

- **Tiêu chí chấp nhận** · Lưu trao đổi/giá thống nhất; chỉ hành động người bán chấp nhận yêu cầu mới khởi tạo giữ chỗ.
- **Nguồn** · SH-01, SH-02 · **Ưu tiên** · Bắt buộc · **Trạng thái** · Đã duyệt · **Dòng** · 11

### FR-08 · Giữ chỗ và hủy giữ chỗ

Khi người bán chấp nhận yêu cầu đặt hàng, hệ thống giữ tin và toàn bộ đồ vật liên quan; không cho giữ/bán cùng đồ vật qua tin khác.

- **Tiêu chí chấp nhận** · Tối đa một giữ hiệu lực/tin và một giữ hiệu lực/đồ vật; người mua không bị giới hạn số giữ; không tự hủy sau 24 giờ.
- **Ghi chú** · Trước báo giao hai bên được hủy; sau báo giao cần xác nhận hai bên hoặc admin.
- **Nguồn** · SH-01, SH-02 · **Ưu tiên** · Bắt buộc · **Trạng thái** · Đã duyệt · **Dòng** · 12

### FR-09 · Bàn giao và xác nhận hoàn tất

Người bán gửi đủ ảnh bàn giao và báo đã giao; người mua xác nhận hoàn tất bằng mã 6 chữ số trong ứng dụng.

- **Tiêu chí chấp nhận** · Mã hết hạn sau 10 phút, tối đa 5 lần sai, dùng một lần; cấp lại vô hiệu mã cũ; sau 24 giờ chưa xác nhận chuyển admin; không tự hoàn tất/mở hàng.
- **Ghi chú** · Mã không chứng minh thanh toán; mã hết hạn không hủy giữ chỗ.
- **Nguồn** · SH-01, SH-02, SH-04 · **Ưu tiên** · Bắt buộc · **Trạng thái** · Đã duyệt · **Dòng** · 13

### FR-10 · Đánh giá và tính điểm

Chỉ người mua đánh giá người bán sau giao dịch hoàn tất; một đánh giá/giao dịch trong 15 ngày; admin duyệt đánh giá 1–3 sao trước khi áp dụng trừ điểm.

- **Tiêu chí chấp nhận** · 5/4/3/2/1 sao: +2/0/−1/−3/−5; đánh giá 1–3 sao chỉ trừ sau duyệt; hết 15 ngày không gửi thì +1 một lần, không đồng thời cộng điểm đánh giá.
- **Nguồn** · SH-01, SH-02, SH-04 · **Ưu tiên** · Bắt buộc · **Trạng thái** · Đã duyệt · **Dòng** · 14

### FR-11 · Báo cáo vi phạm

Thành viên có thể báo cáo tin/tài khoản/hành vi vi phạm; báo cáo phải kèm bằng chứng và thông tin liên quan.

- **Tiêu chí chấp nhận** · Báo cáo thiếu bằng chứng không đạt yêu cầu; gửi báo cáo không tự trừ điểm; báo cáo trùng cùng hành vi không nhân phạt.
- **Nguồn** · SH-01, SH-02, SH-03 · **Ưu tiên** · Bắt buộc · **Trạng thái** · Đã duyệt · **Dòng** · 15

### FR-12 · Khóa tài khoản theo điểm

Hệ thống áp dụng trạng thái hạn chế theo điểm: 30 < điểm ≤50 khóa tạm 14 ngày; điểm ≤30 khóa vĩnh viễn có quyền khiếu nại.

- **Tiêu chí chấp nhận** · Đúng 30 thuộc khóa vĩnh viễn; hết 14 ngày mở lại và giữ điểm, không khóa lại theo điểm cũ; vi phạm mới xét lại theo ngưỡng.
- **Ghi chú** · Không tự đặt mức phạt cho hành vi.
- **Nguồn** · SH-01, SH-02, SH-04 · **Ưu tiên** · Bắt buộc · **Trạng thái** · Đã duyệt · **Dòng** · 16

### FR-13 · Gia hạn và đóng tin cũ

Hệ thống nhắc người bán gia hạn hoặc đóng tin cũ và lưu trữ theo quy tắc thời hạn được xác nhận.

- **Tiêu chí chấp nhận** · Sau 30 ngày đóng tin đăng; Nhắc nhở gia hạn trước 7 ngày
- **Nguồn** · SH-02, SH-04 · **Ưu tiên** · Nên có · **Trạng thái** · Đã duyệt · **Dòng** · 17

### FR-14 · Chiến dịch thanh lý (đã loại khỏi phạm vi)

Không triển khai sự kiện thanh lý theo học kỳ hoặc ưu tiên tin theo chiến dịch.

- **Tiêu chí chấp nhận** · Không có chức năng chiến dịch/sự kiện thanh lý trong phạm vi hiện hành.
- **Ghi chú** · Không áp dụng - Đã loại khỏi phạm vi
- **Nguồn** · SH-04, SH-05 · **Ưu tiên** · Chưa thực hiện · **Trạng thái** · Đã thay đổi · **Dòng** · 18

### FR-15 · Thống kê theo học kỳ

Hệ thống thống kê mặt hàng/mã môn được tìm kiếm và trao đổi nhiều nhất theo học kỳ.

- **Tiêu chí chấp nhận** · Báo cáo theo học kỳ; chỉ tiêu/định nghĩa và dữ liệu tính cần được xác nhận.
- **Nguồn** · SH-04 · **Ưu tiên** · Nên có · **Trạng thái** · Đã duyệt · **Dòng** · 19

### FR-16 · Báo cáo thành viên và tranh chấp

Quản trị viên xem báo cáo thành viên uy tín thấp/bị khóa và báo cáo tranh chấp hằng tháng.

- **Tiêu chí chấp nhận** · Báo cáo có thông tin bên, giao dịch và kết quả xử lý; ngưỡng/nhãn uy tín thấp cần chốt.
- **Ghi chú** · Không tự thay ngưỡng báo cáo bằng ngưỡng xử phạt.
- **Nguồn** · SH-04 · **Ưu tiên** · Nên có · **Trạng thái** · Đã duyệt · **Dòng** · 20

### FR-17 · Thống kê theo danh mục và địa lý

Hệ thống thống kê số tin theo danh mục và giao dịch thành công theo khu vực địa lý.

- **Tiêu chí chấp nhận** · Tổng hợp theo danh mục/khu vực; định nghĩa địa lý và giao dịch hợp lệ cần được xác nhận.
- **Nguồn** · SH-04 · **Ưu tiên** · Nên có · **Trạng thái** · Đã duyệt · **Dòng** · 21

### FR-18 · Thống kê giao dịch giá 0

Hệ thống thống kê các lần chuyển giao đồ dùng/giáo trình giá 0 đã hoàn tất.

- **Tiêu chí chấp nhận** · Chỉ tính giao dịch hoàn tất giá 0; cần chốt đếm số giao dịch hay số đồ vật.
- **Ghi chú** · Không nhân số giao dịch do nhiều đồ vật/tin.
- **Nguồn** · SH-04, SH-05 · **Ưu tiên** · Nên có · **Trạng thái** · Đã duyệt · **Dòng** · 22

## Yêu cầu phi chức năng (NFR)

### NFR-01 · Quyền truy cập dữ liệu

Dữ liệu định danh, thẻ sinh viên, hội thoại và bằng chứng giao dịch phải được giới hạn quyền truy cập phù hợp.

- **Tiêu chí chấp nhận** · Phân quyền truy cập và nơi lưu ảnh thẻ/bằng chứng phải được xác định trước khi dùng dữ liệu thật.
- **Ghi chú** · Không có SLA định lượng được duyệt.
- **Nguồn** · SH-01, SH-02, SH-04, SH-05 · **Ưu tiên** · Bắt buộc · **Trạng thái** · Đã duyệt · **Dòng** · 23

### NFR-02 · Giữ chỗ và hạn mức khi có thao tác đồng thời

Các thao tác giữ chỗ/công khai tin phải bảo đảm không vượt quyền giữ cùng đồ vật hoặc hạn mức khi nhiều thao tác đồng thời.

- **Tiêu chí chấp nhận** · Hai yêu cầu đồng thời không tạo hai giữ chỗ cho cùng đồ vật hoặc vượt hạn mức công khai.
- **Nguồn** · SH-01, SH-02, SH-04 · **Ưu tiên** · Bắt buộc · **Trạng thái** · Đã duyệt · **Dòng** · 24

### NFR-03 · Gửi lại yêu cầu và tính điểm một lần

Thao tác lặp lại hoặc gửi lại yêu cầu không được hoàn tất giao dịch hay tính điểm nhiều lần.

- **Tiêu chí chấp nhận** · Mã hoàn tất chỉ dùng một lần; mỗi giao dịch chỉ ghi nhận một đánh giá/tác động tương ứng.
- **Nguồn** · SH-01, SH-02, SH-04 · **Ưu tiên** · Bắt buộc · **Trạng thái** · Đã duyệt · **Dòng** · 25

### NFR-04 · Tính sẵn sàng và mục tiêu tải

Ứng dụng hướng tới hoạt động 24/7; mục tiêu tải, thời gian đáp ứng và SLA cần được thống nhất trước nghiệm thu.

- **Tiêu chí chấp nhận** · Không gán số người dùng đồng thời hoặc thời gian phản hồi khi chưa được phê duyệt.
- **Nguồn** · SH-01, SH-02, SH-04 · **Ưu tiên** · Nên có · **Trạng thái** · Đã duyệt · **Dòng** · 26
