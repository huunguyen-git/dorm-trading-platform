# Đặc tả yêu cầu nghiệp vụ — Sàn trao đổi và thanh lý đồ dùng phòng trọ sinh viên

**Phiên bản:** 1.1 — **Ngày cập nhật:** 28/09/2026 — **Người quản lý:** trưởng nhóm.

Đây là tài liệu nghiệp vụ được duy trì trong suốt quá trình phát triển, thay thế PDF gốc làm nguồn tham chiếu làm việc. PDF vẫn là bằng chứng lịch sử. Tài liệu này không phải thiết kế cơ sở dữ liệu và không khẳng định các chức năng đã được lập trình.

## 1. Nguồn thông tin và cách đọc

| Mã nguồn | Nội dung và giá trị sử dụng |
| --- | --- |
| S1 | PDF `Nhóm 15_HỆ THỐNG SÀN TRAO ĐỔI VÀ THANH LÝ ĐỒ DÙNG PHÒNG TRỌ SINH VIÊN.pdf`, 5 trang. Yêu cầu ban đầu, còn một số mâu thuẫn. |
| S2 | Ảnh trao đổi: câu hỏi của Nguyễn Hữu Nguyên ngày 22/09/2026 và phản hồi của Phan Gia Đạt ngày 23/09/2026, do trưởng nhóm cung cấp là phản hồi khách hàng. Có 8 nội dung được đồng ý; tóm tắt tại mục 6. |
| S3 | Xác nhận tiếp theo của trưởng nhóm trong cuộc trò chuyện: đúng 30 điểm bị khóa vĩnh viễn nhưng được khiếu nại; mở khóa sau 14 ngày; MSSV là duy nhất trong phạm vi ĐHQG-HCM. Được ghi nhận vào v1.0 ngày 26/09/2026. |
| S4 | Các phương án do trợ lý đề xuất trong trao đổi và tài liệu này. **Chưa được duyệt**, được tập hợp riêng tại mục 7. |
| S5 | Các quyết định do trưởng nhóm xác nhận trong cuộc trao đổi ngày 27–28/09/2026, ghi nhận vào v1.1 ngày 28/09/2026. Gồm A01–A09, A13–A14, phần cho tặng của A17 và mô hình A02/A19; chỉ các nội dung ghi “Đã chốt” mới là quyết định. Đây là xác nhận của trưởng nhóm, không gán thành phản hồi trực tiếp của khách hàng. Trích yếu và phạm vi thay thế tại C11–C23. |

Quy định mới đã xác nhận chỉ thay thế phần tương ứng của quy định cũ. Những yêu cầu khác của S1 được giữ lại; không tự suy ra rằng bỏ một chức năng đồng nghĩa bỏ các chức năng liên quan. Xác nhận của trưởng nhóm được ghi riêng, không gán thành lời của khách hàng.

- **Hiện hành:** yêu cầu từ S1 còn hiệu lực hoặc thay đổi đã xác nhận qua S2/S3/S5.
- **Chưa chốt / chốt một phần:** cần quyết định bổ sung. Giải pháp đề xuất không phải yêu cầu đã được duyệt.
- **Đã loại bỏ:** giữ mã để truy vết nhưng không đưa vào phạm vi triển khai.

Mã FR-01–FR-18 và A01–A19 được giữ từ brief trước. Không đổi mã hoặc tái sử dụng mã đã loại bỏ. Các tài liệu cũ có thể dùng mã nguồn S1/S2/S3 với nghĩa khác; bảng nguồn trên chỉ áp dụng cho tài liệu này.

## 2. Mục tiêu và phạm vi

Giúp cộng đồng sinh viên tìm kiếm, bán, mua và cho tặng giáo trình, đồ gia dụng, nội thất và đồ dùng phòng trọ đã qua sử dụng; trao đổi trực tiếp, hẹn gặp và duy trì uy tín qua giao dịch.

Phạm vi địa lý/người học được mở rộng ra **ĐHQG-HCM**, không giới hạn tại UIT. Sinh viên đã tốt nghiệp tiếp tục sử dụng với trạng thái “Đã tốt nghiệp”. S1 còn nhắc đến học viên cao học, cán bộ và giảng viên; cách xác thực các nhóm này vẫn cần chốt tại A01/A13.

Luồng đã chốt gồm mua bán và cho tặng giá 0. Người nhận tặng tự quyết định nhận và chịu trách nhiệm về quyết định giao dịch; ứng dụng quản lý thông tin, giữ chỗ, xác nhận và phản ánh như giao dịch khác, không xét hoàn cảnh. **Đổi vật lấy vật vẫn chưa được duyệt**; phương án tư vấn được ghi riêng tại A17.

Giao nhận, kiểm tra hàng và thanh toán diễn ra ngoài hệ thống, bằng tiền mặt hoặc chuyển khoản cá nhân. Mã xác nhận trong ứng dụng ghi nhận việc người mua xác nhận giao dịch; không chứng minh ngân hàng đã thanh toán.

**Đã loại bỏ:** chức năng sự kiện “Ngày hội thanh lý dọn trọ”, lịch chiến dịch và ưu tiên trang chủ theo chiến dịch. **Combo thông thường vẫn thuộc mô tả sản phẩm**, vì yêu cầu combo còn xuất hiện độc lập trong S1.

Trưởng nhóm xác nhận sản phẩm bàn giao gồm ứng dụng hoạt động và tài liệu OOAD, thời gian khoảng hai tháng. Mốc nộp chính xác và tiêu chí chấm chưa chốt. Lựa chọn công nghệ nằm trong [ADR-001](../architecture/ADR-001-stack.md), không phải yêu cầu khách hàng trong tài liệu này.

## 3. Thuật ngữ và tác nhân

| Khái niệm | Ý nghĩa |
| --- | --- |
| User_ID | Mã nội bộ riêng để định danh tài khoản, làm khóa chính; không dùng MSSV làm khóa chính. |
| MSSV | Thông tin định danh sinh viên. Theo xác nhận của trưởng nhóm, duy nhất trong ĐHQG-HCM do có thành phần mã trường, khóa và số thứ tự. Biết MSSV không đồng nghĩa chứng minh được chủ sở hữu. |
| Trường | Trong ngữ cảnh hồ sơ: **trường đại học/cơ sở đào tạo**, không phải “trường dữ liệu”. Thông tin trường phục vụ hồ sơ và tìm kiếm; không cần ghép thêm mã trường chỉ để giải quyết trùng MSSV theo giả định đã xác nhận. |
| Đồ vật trong kho cá nhân | Một bản ghi đại diện một đồ vật thực tế của một người bán. Các tin cùng đồ vật tham chiếu cùng bản ghi; không phải danh mục sản phẩm chuẩn dùng chung cho mọi người bán. |
| Tin đăng | Một đề nghị bán hoặc cho tặng tham chiếu một đồ vật hoặc nhiều đồ vật tạo thành combo nguyên bộ. Một đồ vật được xuất hiện trong nhiều tin, nhưng không được giữ/bán đồng thời qua nhiều tin. |
| Giỏ hàng / yêu cầu đặt hàng | Thêm giỏ hoặc gửi yêu cầu chưa giữ hàng. Người bán chấp nhận yêu cầu mới tạo giữ chỗ. Không coi thao tác đặt hàng là bằng chứng đã thanh toán. |
| Giữ chỗ | Người mua yêu cầu và người bán chấp nhận dành món hàng cho người mua. Không tự hết hạn sau 24 giờ. |
| Giao dịch hoàn tất | Giao dịch kết thúc theo quy trình xác nhận nhận hàng, không chỉ vì người bán báo đã giao. |
| Uy tín | Điểm phản ánh lịch sử được hệ thống ghi nhận; không phải vai trò phân quyền. |
| Khóa vĩnh viễn | Không có thời điểm tự mở khóa; vẫn có quyền khiếu nại và có thể được xem xét lại quyết định. |

Người mua/người bán là vai trò của thành viên trong từng giao dịch. Quản trị viên cấp cao quản lý hệ thống, danh mục và báo cáo; kiểm duyệt viên sinh viên duyệt tin, xử lý phản ánh và cảnh báo. Quyền quyết định các biện pháp đặc biệt phải được làm rõ tại A08; không tự suy ra mọi kiểm duyệt viên có toàn quyền.

## 4. Yêu cầu nghiệp vụ hiện hành

### FR-01 — Đăng ký và xác thực tài khoản

- Hồ sơ gồm họ tên, MSSV, địa chỉ trọ, số điện thoại, ngày tham gia, khóa học; S1 còn mô tả ngành học và cơ sở học chính.
- Dùng User_ID riêng; giữ MSSV làm thuộc tính định danh sinh viên. MSSV duy nhất trong phạm vi đã xác nhận.
- Email theo mẫu tên miền `*.edu.vn`, bao gồm tên miền con như `gm.uit.edu.vn`; xác minh quyền sở hữu email bằng OTP. Người đăng ký gửi thẻ sinh viên để admin đối chiếu thông tin và duyệt kích hoạt. Cần cả xác minh email và duyệt hồ sơ; đuôi email tự nó không chứng minh thuộc ĐHQG-HCM.
- MSSV có thể xuất hiện ở phần trước `@`, nhưng không mặc định mọi trường dùng cùng cấu trúc hoặc suy ra MSSV chỉ từ email. Không giả định có API/cổng kiểm tra của trường.
- **Nguồn:** S1 tr.1–2; S2 câu 1, 3; S3; S5/C11. **Còn mở:** ngoại lệ và nguồn kiểm tra tại A01/A13; thông số OTP đăng ký không mặc nhiên dùng thông số mã giao dịch A06.

### FR-02 — Thông tin học tập và tốt nghiệp

- Không khóa tài khoản chỉ vì hết niên khóa hoặc tốt nghiệp. Chuyển trạng thái sang “Đã tốt nghiệp”, vẫn được sử dụng.
- Giữ yêu cầu nhắc cập nhật thông tin học tập/cơ sở học hằng năm; cách xác minh và trường hợp không phản hồi chưa chốt.
- **Nguồn:** S1 tr.2, được S2 câu 2 thay đổi. **Còn mở:** A13.

### FR-03 — Vai trò và điểm khởi tạo

- Thành viên được tham gia mua/bán; quản trị viên cấp cao và kiểm duyệt viên có nhiệm vụ như mục 3.
- Tài khoản được kích hoạt có điểm uy tín ban đầu **100**.
- **Nguồn:** S1 tr.2. **Còn mở:** quyền chi tiết tại A08.

### FR-04 — Nội dung tin đăng

- Có danh mục, mô tả/tình trạng thực tế, giá, thông tin cho tặng, vị trí và **1–5 ảnh thực tế**; ảnh có thông tin định danh và nơi lưu.
- Tin cho tặng có giá **0**. Tài liệu học tập có thông tin tác giả, nhà xuất bản, mã môn học, giảng viên; mức bắt buộc từng thuộc tính cần xác nhận khi đặc tả biểu mẫu.
- Người bán quản lý kho cá nhân; mỗi bản ghi là một đồ vật thực tế. Tin lẻ tham chiếu một đồ vật; combo tham chiếu nhiều đồ vật và bán nguyên bộ. Không gộp đồ vật chỉ vì cùng tên sách; không cần danh mục sản phẩm chuẩn dùng chung, nhưng vẫn giữ danh mục phân loại FR-06.
- Một đồ vật có thể thuộc nhiều tin. Hệ thống dùng liên kết kho để đồng bộ khả năng đặt hàng: giữ đồ vật qua một tin thì các tin trùng không nhận giữ chỗ xung đột; bán xong thì các tin đó không còn đủ hàng. Không ghi các tin liên quan là giao dịch hoàn tất nếu chúng không có giao dịch thật.
- Người bán được sửa nội dung hoặc rút **tin chưa được giữ chỗ**; sửa phải qua kiểm duyệt trước khi công khai bản sửa. Điều kiện này xét chính tin bị sửa/rút, không mở rộng thành cấm sửa mọi tin có chung đồ vật. Lưu lịch sử và nội dung đã thỏa thuận của giao dịch khác.
- **Nguồn:** S1 tr.1–2; S5/C12,C21. **Còn mở:** cách hiển thị bản cũ khi chờ duyệt và giao dịch khi tin bị gỡ tại A14; mã môn liên trường tại A15.

### FR-05 — Kiểm duyệt và giới hạn tin

- Tin phải được duyệt trước khi công khai. Không chấp nhận hàng gây hại hoặc tài liệu đề thi mật/chưa được phép theo mô tả nguồn.
- Uy tín **<120: tối đa 5 tin; ≥120: tối đa 10 tin**. Tính tin đang mở và đang giữ chỗ; không tính nháp/chờ duyệt/ẩn/hết hạn/hoàn tất.
- Tụt điểm giữ các tin hiện có dù vượt hạn mức mới, nhưng không được công khai thêm khi chưa còn chỗ. Ví dụ 8 tin và điểm giảm còn 119: giữ 8 tin, phải giảm xuống 4 mới được công khai thêm 1 tin. Quy tắc này không miễn xử lý ẩn tin vi phạm hoặc hạn chế tài khoản.
- Khi duyệt/mở lại/khôi phục phải kiểm tra quyền, tình trạng duyệt và hạn mức. Trạng thái công khai của tin tách khỏi khả năng đặt do đồ vật bị giữ ở tin khác; mô hình chi tiết tại A14 vẫn cần hoàn thiện.
- **Nguồn:** S1 tr.2–3; S5/C13,C21. **Còn mở:** A14.

### FR-06 — Danh mục, tìm kiếm và vị trí

- Danh mục phân cấp; tìm theo từ khóa, mã môn, giá tối đa và bán kính.
- Có khu vực trường, ký túc xá và khu trọ lân cận; nguồn đề cập GPS và khoảng cách tới cổng trường. Bán kính 2 km/3 km là ví dụ, không phải giới hạn đã chốt.
- **Nguồn:** S1 tr.2–3; phạm vi mở rộng theo S2 câu 3. **Còn mở:** A11, A15.

### FR-07 — Nhắn tin và thương lượng

- Người mua/người bán nhắn tin trực tiếp trong ứng dụng. Người mua gửi đề nghị giá; người bán đồng ý hoặc từ chối.
- Nhắn tin, đồng ý giá, thêm giỏ hoặc gửi yêu cầu đặt hàng chưa giữ hàng. Người bán chấp nhận yêu cầu mới giữ; lưu giá đã thỏa thuận tại thời điểm chấp nhận.
- **Nguồn:** S1 tr.3; S5/C14.

### FR-08 — Giữ chỗ và hẹn giao nhận

- Người mua yêu cầu giữ chỗ; người bán chấp nhận thì giữ toàn bộ đồ vật của tin. Mỗi tin tối đa một giữ chỗ còn hiệu lực; cùng đồ vật không được giữ/bán đồng thời qua các tin khác nhau.
- **Không giới hạn số giữ chỗ đồng thời của người mua**, thay giới hạn 3 món. Số giữ chỗ của người bán không vượt số tin, và có thể thấp hơn nếu các tin trùng đồ vật; đây không phải hạn mức người mua theo số tin họ đăng.
- **Bỏ tự hủy sau 24 giờ.** Người bán chủ động hủy giữ chỗ; hệ thống gửi nhắc kiểm tra giao dịch thay vì tự hủy. Chu kỳ nhắc chưa chốt.
- Hai bên hẹn địa điểm/thời gian phù hợp; khuyến khích các điểm gặp an toàn như thư viện, căn tin, trạm xe buýt.
- Trước khi báo đã giao, mỗi bên được hủy; ghi người hủy/lý do và báo bên còn lại. Phản ánh hủy gây thiệt hại/không đến hẹn được lập báo cáo có bằng chứng để admin xét. Không có mốc “sát giờ” cố định hoặc tự phạt theo thời điểm hủy; mức phạt chưa chốt tại A08.
- Sau khi báo đã giao, người mua có thể yêu cầu hủy, cần hai bên xác nhận hoặc admin giải quyết. Mã xác nhận hủy tách khỏi mã hoàn tất; không coi OTP là bằng chứng đã trả hàng/hoàn tiền. Chỉ giải phóng hàng khi hủy được xác nhận; mở lại tin phải đáp ứng điều kiện công khai.
- **Nguồn:** S1 tr.3–4; S2 câu 4; S5/C12,C14,C15. **Còn mở:** lịch nhắc A05, chi tiết hủy sau giao A06 và xử lý kiểm duyệt A14.

### FR-09 — Giao nhận và xác nhận hoàn tất

- Người mua kiểm tra hàng và trả tiền ngoài ứng dụng; người bán báo đã giao sau khi nhận thanh toán (cho tặng giá 0 không có bước trả tiền). Người bán phải gửi ảnh bàn giao khi báo đã giao; ảnh là bằng chứng hỗ trợ, không tự chứng minh đã nhận hàng hoặc thanh toán.
- Hệ thống gửi mã **6 chữ số** tới ứng dụng người mua; chỉ người mua của giao dịch được dùng mã để xác nhận hoàn tất. Mã có hạn **10 phút**, tối đa **5 lần nhập sai**, dùng một lần; cấp lại vô hiệu mã cũ và phải giới hạn tần suất cấp/thử. Hết hạn mã không hủy giữ chỗ.
- Sau **24 giờ từ khi người bán gửi đủ ảnh và báo đã giao**, nếu chưa xác nhận thì chuyển admin xem xét. Cấp lại mã không đổi mốc này. Không tự hoàn tất vì im lặng hoặc mở bán lại hàng đang chờ giải quyết.
- Admin có thể xác nhận hoàn tất khi đủ bằng chứng dù người mua không phản hồi, yêu cầu bổ sung hoặc giải quyết hủy/tranh chấp; lưu căn cứ, người quyết định và lịch sử. Hoàn tất bởi admin cũng mở thời hạn đánh giá như hoàn tất bởi người mua.
- **Nguồn:** S1 tr.4; S5/C16. **Còn mở:** chi tiết bằng chứng, quyền xử lý và mã hủy tại A06/A08/A12.

### FR-10 — Đánh giá và khiếu nại đánh giá

- **Chỉ người mua đánh giá người bán** từ 1–5 sao kèm nhận xét, mỗi giao dịch hoàn tất một đánh giá trong **15 ngày từ lúc hoàn tất**. Bỏ chiều người bán đánh giá người mua; người bán vẫn được báo cáo vi phạm theo FR-11.
- **5 sao: +2; 4 sao: 0; 3 sao: −1; 2 sao: −3; 1 sao: −5.** Mọi đánh giá 1–3 sao chỉ trừ sau khi admin xét lý do/bằng chứng và chấp thuận, không trừ ngay khi gửi.
- Hết 15 ngày không gửi đánh giá: cộng **+1 cho người bán một lần**, đóng quyền đánh giá. Đây không phải đánh giá sao tự sinh. Điểm đánh giá và điểm không đánh giá loại trừ nhau; đánh giá đang chờ xét hoặc bị bác vẫn là đã gửi, không nhận +1. Không đủ căn cứ thì không trừ.
- Cho phép khiếu nại đánh giá thấp sai sự thật/ác ý. Quản trị viên xác minh, gỡ đánh giá sai và khôi phục điểm uy tín tương ứng.
- **Nguồn:** S1 tr.4; S2 câu 6; S5/C17. **Còn mở:** thời hạn khiếu nại, quyền sửa và hiển thị đánh giá chờ xét/bị bác tại A07/A08.

### FR-11 — Báo cáo vi phạm và bằng chứng

- Báo cáo tin hoặc tài khoản: không đến hẹn, hàng sai mô tả, tài liệu cấm, hành vi lạm dụng và các trường hợp nguồn nêu.
- Có mã báo cáo, người báo cáo, người bị báo cáo, nội dung, liên hệ giao dịch khi phù hợp và bằng chứng để kiểm duyệt viên xem xét.
- **Bắt buộc có bằng chứng.** Ảnh, video, tin nhắn là các ví dụ được trao đổi; chưa chốt định dạng, dung lượng hoặc việc hỗ trợ tất cả ngay phiên bản đầu.
- Hủy có tranh chấp và không đến hẹn đều đi qua báo cáo để admin xem xét; gửi báo cáo tự nó không gây trừ điểm. Báo cáo trùng cùng hành vi được liên kết xử lý, không nhân số khoản phạt.
- Một sự việc được phép có **khoản điểm đánh giá và khoản xử phạt vi phạm riêng biệt**, mỗi khoản có căn cứ và chỉ áp dụng một lần; vẫn tính là một sự việc khi xem lịch sử tái phạm.
- **Nguồn:** S1 tr.4–5; S2 câu 7; S5/C15,C18,C23. **Còn mở:** bảng phạt và quyền tại A08; bằng chứng tại A12.

### FR-12 — Xử phạt, mở khóa và khiếu nại

| Điều kiện | Quy định hiện hành |
| --- | --- |
| Không đến hẹn hoặc hủy có phản ánh | Báo cáo kèm bằng chứng để admin xét; **bỏ mức −20 cố định của S1**, mức xử phạt chưa chốt. |
| 30 < điểm uy tín ≤ 50 | Cảnh báo và khóa tạm thời 14 ngày. |
| Điểm uy tín ≤ 30 | Khóa vĩnh viễn, có quyền khiếu nại. **Đúng 30 thuộc mức này.** |
| Hết thời hạn khóa tạm 14 ngày | Mở khóa và giữ điểm, không khóa lại chỉ do điểm cũ. Vi phạm mới được xác minh mới xét đợt tiếp theo theo cùng ngưỡng; không mở nếu có khóa vĩnh viễn còn hiệu lực. |
| Tái phạm | Tạm thời không có hình phạt tăng nặng riêng. Điều này không bãi bỏ tái khóa theo ngưỡng sau vi phạm mới. |
| Gian lận tài chính được xác định | S1 quy định cảnh báo và khóa vĩnh viễn gắn với MSSV; chưa có thay đổi loại bỏ căn cứ này. Quy trình xác định còn mở. |

Khi khóa tạm, được xử lý giao dịch **đã giữ chỗ trước khi bị khóa**: trao đổi, hẹn giao, gửi ảnh, xác nhận nhận/hủy theo quy trình, đánh giá khi đủ điều kiện và khiếu nại. Chặn đăng/giữ chỗ mới. Quyền khiếu nại phải tiếp cận được kể cả khi bị khóa; quyền cụ thể khi khóa vĩnh viễn vẫn cần hoàn thiện.

**Nguồn:** S1 tr.5; S2 câu 8; S3; S5/C18,C19,C23. **Còn mở:** A07–A09. Không tự đặt số điểm phạt cho báo cáo khi bảng phạt chưa được duyệt; ngưỡng khóa và điểm đánh giá đã chốt là các quy tắc riêng.

### FR-13 — Gia hạn và lưu trữ tin cũ

- S1 tr.5: quét hằng tuần các tin quá 30 ngày chưa có người mua hoặc không có tương tác mới; hỏi người bán gia hạn 15 ngày hoặc đóng tin. Không phản hồi trong 3 ngày thì lưu trữ.
- S1 tr.3 còn nói tin hết hạn sau 30 ngày nếu không gia hạn. Hai mô tả chưa thống nhất; không tự chọn một cách rồi coi là yêu cầu đã chốt.
- Bỏ thời hạn giữ chỗ tại FR-08 **không đồng nghĩa bỏ quy trình tin cũ** này.
- **Nguồn:** S1 tr.3,5. **Còn mở:** A10, A14.

### FR-14 — Sự kiện thanh lý: ĐÃ LOẠI BỎ

Không triển khai sự kiện thanh lý theo học kỳ và ưu tiên tin theo chiến dịch. Giữ mã này để hiểu tài liệu/lịch sử cũ. Combo thông thường vẫn được xét theo FR-04.

**Nguồn:** S2 câu 5 thay thế S1 tr.5. **A16 đã đóng do loại bỏ phạm vi.**

### FR-15 — Thống kê nhu cầu theo học kỳ

Thống kê mặt hàng/mã môn được tìm kiếm và trao đổi nhiều nhất theo học kỳ. **Nguồn:** S1 tr.5. **Còn mở:** A15.

### FR-16 — Báo cáo uy tín và tranh chấp

Báo cáo thành viên uy tín thấp/bị khóa; báo cáo tranh chấp hằng tháng gồm các bên, giao dịch và kết quả xử lý. S1 dùng “dưới 50” cho nhóm uy tín thấp, còn ngưỡng xử phạt mới bao gồm 50; cần chốt tên và bộ lọc báo cáo, không tự đổi một ngưỡng sang ngưỡng khác. Tài khoản 50 điểm bị khóa vẫn thuộc nhóm “bị khóa”.

**Nguồn:** S1 tr.5; ngưỡng xử phạt theo FR-12. **Còn mở:** A15.

### FR-17 — Báo cáo tin đăng và khu vực

Thống kê số tin theo danh mục và giao dịch thành công theo khu vực địa lý. **Nguồn:** S1 tr.5. **Còn mở:** A15.

### FR-18 — Báo cáo cho tặng

Thống kê các lần chuyển giao đồ dùng/giáo trình giá 0 đã hoàn tất. Kho cho biết các đồ vật của combo, nhưng chỉ tiêu đếm giao dịch hay đồ vật vẫn cần chốt tại A15. Không tính một lần bán thành nhiều giao dịch chỉ vì đồ vật có nhiều tin. **Nguồn:** S1 tr.5; S5/C12,C22. **Còn mở:** A15.

## 5. Dữ liệu và yêu cầu chất lượng

Các nhóm thông tin cần phân tích tiếp gồm hồ sơ/xác thực/thẻ sinh viên, vai trò, kho cá nhân/đồ vật/liên kết đồ vật–tin, tin/ảnh/danh mục/vị trí, hội thoại/đề nghị giá, giữ chỗ/lịch hẹn, ảnh giao nhận/mã xác nhận, đánh giá/biến động uy tín, báo cáo/bằng chứng/quyết định xử lý, hạn chế tài khoản, thông báo và thống kê. Đây là **khái niệm nghiệp vụ, chưa phải danh sách bảng hay thiết kế lớp cuối cùng**. Thẻ sinh viên và ảnh bàn giao là dữ liệu hạn chế truy cập; không dùng đường dẫn công khai của ảnh tin đăng.

S1 mong muốn hoạt động 24/7; chưa có SLA định lượng, tải đồng thời hoặc thời gian đáp ứng được khách hàng duyệt. Các mục tiêu kỹ thuật cần thống nhất tại A18. Độc quyền giữ chỗ trên tin và trên đồ vật dùng chung, cùng hạn mức công khai tin của người bán, phải đúng cả khi nhiều người thao tác đồng thời. Không có hạn mức giữ chỗ của người mua; không được hoàn tất hoặc tính điểm nhiều lần chỉ vì gửi lại yêu cầu.

Quyền truy cập hồ sơ, hội thoại, bằng chứng và thời gian lưu dữ liệu cần được cụ thể hóa trước khi dùng dữ liệu thật. Không biến tài liệu này thành nơi lưu MSSV, số điện thoại hoặc bằng chứng cá nhân thực tế.

## 6. Các thay đổi đã xác nhận so với PDF

| Mã | Thay đổi | Nguồn | Yêu cầu ảnh hưởng |
| --- | --- | --- | --- |
| C01 | User_ID riêng, MSSV giữ làm thông tin định danh | S2.1 | FR-01 |
| C02 | Tốt nghiệp không làm hết hiệu lực tài khoản | S2.2 | FR-02 |
| C03 | Mở rộng phạm vi ra ĐHQG-HCM | S2.3 | FR-01, FR-06 |
| C04 | Bỏ tự hết hạn giữ chỗ 24 giờ; người bán hủy, hệ thống nhắc | S2.4 | FR-08 |
| C05 | Bỏ sự kiện thanh lý | S2.5 | FR-14, A16 |
| C06 | Khiếu nại đánh giá sai, gỡ và hoàn điểm sau xác minh | S2.6 | FR-10 |
| C07 | Báo cáo vi phạm phải có bằng chứng | S2.7 | FR-11 |
| C08 | Ngưỡng khóa tạm bao gồm 50; đúng 30 khóa vĩnh viễn có khiếu nại | S2.8 và S3 giải quyết giao nhau tại 30 | FR-12 |
| C09 | Sau 14 ngày mở khóa tạm | S3 | FR-12 |
| C10 | MSSV duy nhất trong phạm vi ĐHQG-HCM | S3 | FR-01 |
| C11 | Email `*.edu.vn` + OTP và admin duyệt thẻ sinh viên; ngoại lệ giữ mở | S5, trưởng nhóm; ghi nhận 28/09/2026 | FR-01–02; A01/A13 |
| C12 | Kho cá nhân, một bản ghi/một đồ vật; nhiều tin được dùng chung đồ vật; combo nguyên bộ; tự đồng bộ khả năng đặt, không giữ/bán trùng | S5, trưởng nhóm; ghi nhận 28/09/2026 | FR-04,08,18; A02/A19 |
| C13 | <120: 5 tin; ≥120: 10 tin; tính mở + giữ chỗ; giữ tin vượt mức khi tụt điểm, chặn công khai thêm | S5, trưởng nhóm; ghi nhận 28/09/2026 | FR-05; A03; thay ngưỡng >120 của S1 |
| C14 | Thêm giỏ/gửi yêu cầu/đồng ý giá chưa giữ; người bán chấp nhận mới giữ | S5, trưởng nhóm; ghi nhận 28/09/2026 | FR-07–08; A04 |
| C15 | Bỏ giới hạn 3 món của người mua; hai bên được hủy trước báo giao; sau báo giao cần xác nhận hai bên hoặc admin; bỏ đề xuất mốc hủy sát giờ cố định | S5, trưởng nhóm; ghi nhận 28/09/2026 | FR-08,11; A05/A06 |
| C16 | Ảnh bàn giao bắt buộc; mã 6 số, 10 phút/5 lần sai; cấp lại vô hiệu mã cũ; 24 giờ chuyển admin, được quyết định hoàn tất theo bằng chứng | S5, trưởng nhóm; ghi nhận 28/09/2026 | FR-09; A06 |
| C17 | Chỉ người mua đánh giá người bán; 5/4/3/2/1 sao tương ứng +2/0/−1/−3/−5; 1–3 sao cần admin duyệt; 15 ngày không đánh giá +1, loại trừ điểm đánh giá | S5, trưởng nhóm; ghi nhận 28/09/2026 | FR-10; A07; thay chiều đánh giá người mua và điểm 2 sao của S1 |
| C18 | Điểm đánh giá và phạt báo cáo tách biệt; báo cáo phải xác minh, không phạt lặp báo cáo trùng; chưa chốt bảng phạt, chưa tăng nặng riêng vì tái phạm | S5, trưởng nhóm; ghi nhận 28/09/2026 | FR-10–12; A08 |
| C19 | Khóa tạm vẫn xử lý giao dịch đã giữ; hết 14 ngày không khóa lại theo điểm cũ; vi phạm mới xét cùng ngưỡng, gồm đúng 50 | S5, trưởng nhóm; ghi nhận 28/09/2026 | FR-08–12; A09; mở rộng quyền “chỉ xem” của S1 |
| C20 | Giữ phương pháp xác thực thường, ghi mở các ngoại lệ và cập nhật hằng năm | S5, trưởng nhóm; ghi nhận 28/09/2026 | FR-01–02; A13 |
| C21 | Tin chưa được giữ được sửa/rút; sửa phải kiểm duyệt; điều kiện xét chính tin đó, không cấm theo đồ vật bị giữ qua tin khác | S5, trưởng nhóm; ghi nhận 28/09/2026 | FR-04–05,08; A14 |
| C22 | Người nhận tặng tự quyết định, ứng dụng quản lý như giao dịch giá 0; không xét hoàn cảnh; đổi vật lấy vật chỉ mới yêu cầu đề xuất | S5, trưởng nhóm; ghi nhận 28/09/2026 | FR-04,18; A17 |
| C23 | Không đến hẹn chuyển sang báo cáo để admin xét; bỏ mức −20 cố định, mức phạt giữ mở | S5, trưởng nhóm; ghi nhận 28/09/2026 | FR-11–12; A08; thay S1 tr.5 |

Các xác nhận S5 được lưu bằng trích yếu trao đổi trên, không có biên bản khách hàng độc lập được cung cấp. C01–C10 giữ nguyên để truy vết; các đề xuất S4 chỉ trở thành hiện hành ở đúng phạm vi được S5 xác nhận. Không suy diễn “đồng ý” thành một con số/thời hạn chưa từng được nêu.

## 7. Sổ quyết định, vấn đề còn mở và phương án khuyến nghị

Mỗi mục tách **Đã chốt**, **Còn mở** và **Đề xuất chưa duyệt**. Không còn xem toàn bộ mục 7 là đề xuất: các quyết định S5 đã cập nhật vào FR và mục 6. Yêu cầu tư vấn về đổi vật lấy vật hoặc tham khảo nền tảng khác không đồng nghĩa duyệt triển khai. Không hỏi lại những nội dung đã xác nhận; nội dung chủ động hoãn vẫn được giữ mở.

Ưu tiên **P0:** chốt trước khi cố định mô hình/quy trình phụ thuộc; **P1:** chốt trước khi triển khai chức năng liên quan; **P2:** trước nghiệm thu. Người phụ trách dưới đây là vai trò đề nghị: trưởng nhóm tổng hợp; người phụ trách nghiệp vụ làm rõ; khách hàng xác nhận chính sách. Không cần dừng công việc độc lập đang đủ yêu cầu.

### A01 — Đối tượng và cách chứng minh danh tính · Chốt một phần · P0

- **Đã chốt:** phạm vi ĐHQG-HCM, User_ID riêng, MSSV duy nhất. Email `*.edu.vn` được xác minh bằng OTP, kết hợp thẻ sinh viên và admin duyệt kích hoạt. Không suy ra MSSV từ cấu trúc email không được xác minh. OTP và duyệt thẻ là hai điều kiện khác nhau.
- **Còn mở, được chủ động hoãn:** người không có MSSV/thẻ, người tốt nghiệp mất email/thẻ, một người có nhiều định danh; nguồn admin đối chiếu; thông số OTP đăng ký. Không tự loại các nhóm đã nêu trong S1.
- **Khuyến nghị kỹ thuật:** lưu MSSV dạng chuỗi, kiểm tra tên miền email đúng ranh giới (không nhận `edu.vn.example.com`), giữ ảnh thẻ ở vùng hạn chế truy cập. Không coi OTP là chứng minh thẻ thuộc người đăng ký.
- **Xác nhận:** trưởng nhóm, S5/C11,C20, ghi nhận 28/09/2026. **Liên quan:** FR-01–02, A13.

### A02 — Mặt hàng, tin đăng và combo · Đã chốt · P0

- **Đã chốt:** mỗi người bán có kho cá nhân; một bản ghi tương ứng một đồ vật thực tế. Tin tham chiếu một hoặc nhiều đồ vật; combo bán nguyên bộ. Không cần danh mục sản phẩm chuẩn dùng chung, vẫn có danh mục phân loại.
- Một đồ vật được xuất hiện trong nhiều tin. Khi giữ/bán qua một tin, hệ thống tự chặn đặt các tin cùng đồ vật; không cần người bán tự cập nhật những liên kết hệ thống đã biết. Chỉ tin có giao dịch thật được ghi hoàn tất. Ví dụ bán riêng bàn làm combo bàn + ghế không còn đủ hàng; ghế chưa bán.
- Mỗi tin một giữ chỗ có hiệu lực, mỗi đồ vật một giữ chỗ có hiệu lực trên toàn bộ tin liên quan. Hệ thống không tự nhận biết hai bản ghi do người bán tạo trùng là cùng vật ngoài đời.
- **Xác nhận:** trưởng nhóm, S5/C12, ghi nhận 28/09/2026. **Liên quan:** FR-04,08,18; A19; [mô hình nghiệp vụ](../uml/marketplace-lifecycle.md).

### A03 — Hạn mức tin đăng · Đã chốt · P0

- **Đã chốt:** <120 điểm tối đa 5; ≥120 tối đa 10. Tính tin đang mở và đang giữ chỗ; không tính nháp/chờ duyệt/ẩn/hết hạn/hoàn tất. Tụt điểm giữ tin hiện có dù vượt mức nhưng chặn công khai thêm đến khi còn chỗ.
- Kiểm tra khi duyệt, mở lại, khôi phục và khi nhiều thao tác đồng thời. Giữ tin do tụt hạn mức không ngăn ẩn tin vi phạm hoặc áp dụng hạn chế tài khoản. Việc phân loại tin không đủ hàng do liên kết kho thuộc mô hình trạng thái cần hoàn thiện tại A14.
- **Xác nhận:** trưởng nhóm, S5/C13, ghi nhận 28/09/2026. **Liên quan:** FR-05, A14.

### A04 — Thương lượng có giữ hàng không? · Đã chốt · P0

- **Đã chốt:** thêm giỏ → gửi yêu cầu đặt hàng → người bán chấp nhận → giữ hàng. Nhắn tin/chấp nhận giá chưa giữ. Lưu giá đã đồng ý khi chấp nhận giữ chỗ; giao diện dùng “Đặt hàng”, không ngụ ý app đã xác minh thanh toán ngoài hệ thống.
- **Xác nhận:** trưởng nhóm, S5/C14, ghi nhận 28/09/2026. **Liên quan:** FR-07–08.

### A05 — Hủy và nhắc giữ chỗ · Chốt một phần · P0

- **Đã chốt:** không giới hạn số giữ chỗ của người mua; không tự hủy sau 24 giờ. Người bán chỉ có thể giữ tối đa một người mua/tin, còn bị ràng buộc bởi đồ vật dùng chung. Không cần người mua đăng tin mới được giữ hàng.
- Trước khi báo giao, hai bên được hủy, lưu người hủy/lý do và thông báo. Hủy có phản ánh được báo cáo để admin xét bằng chứng; **không dùng mốc 2 giờ hoặc tự phạt hủy sát giờ**. Không đến hẹn cũng được báo cáo, không tự áp dụng −20.
- Sau khi báo giao, yêu cầu hủy cần xác nhận hai bên hoặc admin giải quyết; mã hủy tách khỏi mã hoàn tất. Hàng chỉ giải phóng sau quyết định hủy; tin mở lại phải còn đủ điều kiện công khai.
- **Còn mở:** lịch nhắc giữ chỗ, chi tiết xác nhận hủy sau giao tại A06 và mức phạt A08. Nhắc một lần sau 24 giờ từ khi chấp nhận là đề xuất cũ chưa duyệt; không nhầm với mốc chuyển admin sau báo giao đã chốt tại A06.
- **Xác nhận:** trưởng nhóm, S5/C15,C23, ghi nhận 28/09/2026. **Liên quan:** FR-08,11; A06/A14.

### A06 — Không xác nhận nhận hàng và mã xác nhận · Chốt một phần · P0

- **Đã chốt:** người bán gửi ảnh bàn giao và báo đã giao; người mua dùng mã 6 số trong ứng dụng xác nhận hoàn tất. Mã 10 phút, tối đa 5 lần sai, dùng một lần, cấp lại vô hiệu mã cũ; phải giới hạn tần suất cấp/thử. Mã hết hạn không hủy giữ chỗ.
- Sau 24 giờ từ khi gửi đủ ảnh và báo giao, chưa xác nhận thì chuyển admin; cấp lại mã không đổi mốc. Admin được xác nhận hoàn tất theo bằng chứng dù người mua im lặng, yêu cầu bổ sung hoặc giải quyết hủy/tranh chấp. Không tự hoàn tất hoặc mở lại hàng chỉ vì hết giờ.
- **Đã chốt về hủy:** trước báo giao được hủy trực tiếp; sau báo giao phải có xác nhận hai bên hoặc quyết định admin. Mã hủy xác nhận một hành động riêng, không dùng chéo với mã hoàn tất và không chứng minh hoàn tiền/trả hàng.
- **Còn mở:** số lần cấp/thử theo cửa sổ thời gian; ai nhận/nhập mã hủy trong quy trình hai bên; thời hạn xử lý admin; tiêu chuẩn, quyền xem/lưu ảnh giao hàng. Ảnh bắt buộc nhưng chưa có quyết định bắt buộc lộ mặt người nhận. Thông số mã giao dịch không tự áp dụng cho OTP đăng ký.
- **Xác nhận:** trưởng nhóm, S5/C15,C16, ghi nhận 28/09/2026. **Liên quan:** FR-09, A08/A12.

### A07 — Điểm đánh giá và khôi phục · Chốt một phần · P0

- **Đã chốt:** chỉ người mua đánh giá người bán sau hoàn tất, một đánh giá/giao dịch, trong 15 ngày. 5/4/3/2/1 sao lần lượt +2/0/−1/−3/−5; 1–3 sao cần admin xét lý do/bằng chứng trước khi trừ. Không đủ căn cứ thì không trừ.
- Hết 15 ngày không gửi đánh giá thì người bán +1 một lần và đóng quyền đánh giá; không tạo sao giả. Đánh giá chờ xét/bị bác không thuộc “không đánh giá”, không nhận +1. Không cộng cả điểm đánh giá và +1 cho cùng giao dịch.
- Gỡ đánh giá sai thì đảo đúng tác động điểm của đánh giá đó; xem lại hạn chế do tác động sai gây ra, giữ căn cứ xử phạt độc lập còn hiệu lực. Không tính lại điểm mỗi lần gửi lại yêu cầu.
- **Còn mở:** thời hạn/kênh khiếu nại chi tiết, quyền sửa đánh giá trong hạn, hiển thị đánh giá chờ xét/bị bác và thời gian admin xử lý. “Đồng ý” quy trình không tự xác định các thời hạn này.
- **Xác nhận:** trưởng nhóm, S5/C17,C18, ghi nhận 28/09/2026. **Liên quan:** FR-10,12.

### A08 — Xử lý vi phạm, tái phạm và khiếu nại · Chốt một phần · P0

- **Đã chốt:** cùng sự việc có thể bị trừ riêng do đánh giá đã duyệt và do báo cáo vi phạm đã xác minh. Báo cáo trùng cùng hành vi không nhân khoản phạt; hai tác động điểm không biến thành hai lần tái phạm. Mỗi khoản có căn cứ, lịch sử và hoàn riêng khi quyết định tương ứng bị đảo.
- Hủy có phản ánh/không đến hẹn được admin xét qua báo cáo. **Mức −20 cũ không còn áp dụng.** Bảng phạt điểm cho các hành vi tạm chưa quyết định; không lấy số minh họa hoặc số từ nền tảng khác làm mức phạt. Điểm đánh giá FR-10 và ngưỡng khóa FR-12 đã chốt vẫn giữ.
- Tạm thời không có hình phạt tăng nặng riêng vì tái phạm; A09 vẫn cho xét tái khóa sau vi phạm mới. Hành vi khác/đặc biệt nghiêm trọng được chuyển admin/đội quản lý xem xét, nhưng phạm vi quyền và khung quyết định còn mở; không mặc định mọi kiểm duyệt viên được tùy ý trừ điểm/khóa vĩnh viễn.
- **Còn mở, chủ động hoãn:** bảng hành vi/mức phạt; khung cho trường hợp ngoài bảng, thẩm quyền từng cấp, định nghĩa lý do chính đáng/gian lận; thời hạn/kênh khiếu nại và thời gian xử lý. Cần phân biệt quyết định xác minh báo cáo với quyết định điểm phạt chưa có quy tắc.
- **Đề xuất chưa duyệt:** các nhóm hành vi và nguồn tham khảo tại [ghi chú xử phạt](moderation-policy-notes.md). Kiểm duyệt viên đề nghị, quản trị viên cấp cao xét khóa vĩnh viễn/ngoại lệ; người xét khiếu nại khác người ra quyết định khi có thể.
- **Xác nhận:** trưởng nhóm, S5/C18,C23, ghi nhận 28/09/2026. **Liên quan:** FR-10–12.

### A09 — Sau 14 ngày và nghĩa vụ khi bị khóa · Chốt một phần · P0

- **Đã chốt:** 30 < điểm ≤50 khóa 14 ngày, ≤30 khóa vĩnh viễn có khiếu nại. Hết khóa tạm mở và giữ điểm; không khóa lại theo điểm cũ. Vi phạm mới đã xác minh được xét theo cùng ngưỡng (bao gồm đúng 50); khóa vĩnh viễn còn hiệu lực luôn ưu tiên.
- Khóa tạm được thao tác trên giao dịch đã giữ trước khi khóa theo FR-12; chặn đăng/giữ chỗ mới. Không áp dụng phạt tăng nặng riêng vì tái phạm, nhưng vẫn có thể tái khóa theo ngưỡng.
- **Còn mở:** quyền chi tiết khi khóa vĩnh viễn và hỗ trợ giao dịch dở; cách xử lý nhiều quyết định đến trong một đợt khóa đang hoạt động; thời điểm phối hợp hai tác động điểm của cùng sự việc. Không tự kéo dài/nhân đợt khóa cho cùng căn cứ khi chưa có quy tắc.
- **Xác nhận:** trưởng nhóm, S5/C19, ghi nhận 28/09/2026. **Liên quan:** FR-08–12, A08.

### A10 — Tin cũ và gia hạn · Chưa chốt · P1

- **Còn thiếu:** chọn cách xử lý mâu thuẫn 30 ngày; “tương tác mới” là gì; gia hạn 15 ngày tính từ đâu; áp dụng cho tin đang giữ chỗ không?
- **Khuyến nghị:** dùng quy trình tr.5: kiểm tra hằng tuần, gửi một yêu cầu gia hạn cho tin đang mở đã quá 30 ngày; sau 3 ngày không trả lời mới lưu trữ. Gia hạn thêm 15 ngày từ lúc người bán xác nhận, rồi tiếp tục chu kỳ kiểm tra sau mốc mới. Đề nghị chỉ tính tin nhắn/yêu cầu mua thực tế là tương tác, không tính lượt xem đơn thuần; cần khách hàng chốt điều kiện “không có người mua hoặc không có tương tác”. Loại tin đang giữ chỗ/chờ xác nhận/tranh chấp khỏi lưu trữ tự động.
- **Chốt bởi:** phụ trách tin đăng/tác vụ nền + khách hàng. **Liên quan:** FR-13.

### A11 — Tâm bán kính và khu vực · Chưa chốt · P1

- **Khuyến nghị:** người tìm chọn tâm là vị trí hiện tại hoặc điểm trên bản đồ; ranh giới bán kính được tính bao gồm điểm đúng bằng bán kính. Phân loại khoảng cách tới cổng trường là thông tin riêng. Cho lọc khu vực khi không cấp GPS; không bắt buộc công khai địa chỉ phòng trọ chính xác.
- **Cần chốt:** tâm mặc định, danh sách trường/cổng/khu vực, độ chính xác vị trí được hiển thị.
- **Chốt bởi:** phụ trách tìm kiếm + khách hàng. **Liên quan:** FR-06.

### A12 — Bằng chứng và đối tượng báo cáo · Chốt một phần · P1

- **Đã rõ:** bằng chứng bắt buộc.
- **Khuyến nghị:** báo cáo có thể nhắm tới tin hoặc tài khoản, liên hệ giao dịch là tùy trường hợp; báo cáo tin cấm chưa có người mua không bắt buộc có giao dịch. Phiên bản đầu hỗ trợ ảnh và tham chiếu tin nhắn trong hệ thống; đề nghị tối đa 5 ảnh, 5 MB/ảnh, chưa đưa video vào phiên bản đầu nếu khách hàng đồng ý. Không yêu cầu ảnh có GPS. Báo cáo không đến hẹn cần bằng chứng lịch hẹn/trao đổi.
- **Cần chốt:** định dạng/dung lượng, video, người xem, che dữ liệu riêng tư và thời gian lưu/xóa bằng chứng.
- **Chốt bởi:** phụ trách kiểm duyệt + khách hàng. **Liên quan:** FR-11.

### A13 — Cổng xác thực và cập nhật hằng năm · Chốt một phần · P0

- **Đã chốt:** tốt nghiệp vẫn dùng ứng dụng; giữ nhắc cập nhật hằng năm. Phương pháp hiện tại là OTP email và admin duyệt thẻ sinh viên, không giả định có API trường.
- **Còn mở, chủ động hoãn:** nguồn kiểm tra admin, người tốt nghiệp mất email/thẻ, người không có thẻ sinh viên và xử lý hồ sơ không cập nhật. Không tự khóa do tốt nghiệp hoặc tự loại nhóm người dùng chưa có cách xác minh.
- **Xác nhận:** trưởng nhóm, S5/C11,C20, ghi nhận 28/09/2026. **Liên quan:** FR-01–02, A01.

### A14 — Sửa, ẩn và mở lại tin · Chốt một phần · P0

- **Đã chốt:** người bán được sửa nội dung/rút tin khi **chính tin đó chưa được giữ chỗ**; mọi bản sửa nội dung phải được kiểm duyệt trước khi công khai. Không cấm sửa/rút tin B chỉ vì đồ vật của B đang được giữ qua tin A.
- Quyền sửa tin B không tạo quyền thay đổi điều kiện giao dịch A hoặc làm đồ vật đang giữ thành còn hàng. Lưu bản nội dung, tập đồ vật và giá đã thỏa thuận cho A; sửa tin và sửa dữ liệu kho dùng chung là các thao tác khác nhau. Giữ độc quyền đồ vật theo A02/A19.
- Khi hủy giữ chỗ, không tự công khai tin bị gỡ do kiểm duyệt/hạn chế tài khoản; mở lại phải kiểm tra duyệt, quyền và hạn mức. Rút tin không xóa lịch sử giao dịch.
- **Còn mở:** có giữ bản công khai cũ trong khi bản sửa chờ duyệt không; phân loại/hiển thị tin không đủ hàng do tin khác giữ/bán để đếm hạn mức; quyền sửa dữ liệu đồ vật dùng chung; xử lý giao dịch khi admin gỡ chính tin đang giữ, lý do từ chối và lưu trữ sau hoàn tất. Không suy ra quyền sửa/rút tin đã hoàn tất từ điều kiện “chưa được giữ”.
- **Xác nhận:** trưởng nhóm, S5/C21, ghi nhận 28/09/2026. **Liên quan:** FR-04–05,08,13.

### A15 — Định nghĩa báo cáo và học kỳ · Chưa chốt · P1

- **Khuyến nghị:** cấu hình ngày bắt đầu/kết thúc từng học kỳ; dùng múi giờ Việt Nam cho kỳ báo cáo, lưu thời điểm thống nhất ở tầng kỹ thuật. Phân biệt mã môn theo trường để tránh gộp các môn khác nhau; chỉ gộp khi có ánh xạ được duyệt. Ghi nhãn rõ “số giao dịch hoàn tất”, không gọi là số món nếu chưa biết số lượng trong combo.
- **Cần chốt:** đếm lượt tìm kiếm hay người tìm; loại dữ liệu thử; thời điểm tính giao dịch; khu vực tại thời điểm giao dịch hay hiện tại; ngưỡng báo cáo uy tín thấp <50 hay ≤50. Đề nghị lưu thông tin lịch sử phục vụ báo cáo thay vì để chỉnh hồ sơ làm đổi báo cáo cũ.
- **Chốt bởi:** phụ trách báo cáo + khách hàng. **Liên quan:** FR-15–18.

### A16 — Sự kiện thanh lý · ĐÃ ĐÓNG

Khách hàng đồng ý bỏ tại S2 câu 5. Không cần chốt cơ chế chiến dịch hoặc ưu tiên trang chủ. Muốn đưa trở lại phải tạo yêu cầu thay đổi mới; combo thông thường không bị loại theo quyết định này.

### A17 — Đổi đồ và điều kiện nhận tặng · Chốt một phần · P0

- **Đã chốt:** người nhận tặng tự quyết định nhận và chịu trách nhiệm về quyết định giao dịch; ứng dụng quản lý như giao dịch giá 0, không xét hoàn cảnh. Quyền báo cáo/khiếu nại và nghĩa vụ mô tả trung thực vẫn giữ.
- **Còn mở:** có đưa đổi vật lấy vật vào phạm vi không. Trưởng nhóm yêu cầu đề xuất phương pháp quản lý, **chưa duyệt triển khai**; không suy ra rằng mọi sàn khác đều cấm đổi đồ.
- **Đề xuất chưa duyệt:** một thỏa thuận đổi gồm hai bên và hai tập đồ vật; chấp nhận thì giữ nguyên tử cả hai tập, chụp nội dung thỏa thuận; mỗi bên xác nhận nhận phần của mình, chỉ hoàn tất khi đủ hai xác nhận hoặc admin ra quyết định. Không dùng hai giao dịch cho tặng độc lập vì một bên có thể nhận mà bên kia chưa giao. Chi tiết, giới hạn và tác động điểm/báo cáo tại [phương án đổi đồ](barter-proposal.md).
- **Khuyến nghị phạm vi:** tiếp tục làm luồng bán/cho tặng đã chốt, giữ đổi đồ là lựa chọn mở rộng chưa duyệt để nhóm năm người đánh giá khối lượng.
- **Xác nhận phần cho tặng:** trưởng nhóm, S5/C22, ghi nhận 28/09/2026. **Liên quan:** FR-04,08–12,18.

### A18 — Tiêu chí bàn giao và chất lượng · Chốt một phần · P2

- **Đã rõ:** khoảng hai tháng; có ứng dụng và OOAD; trưởng nhóm cho phép lựa chọn công nghệ, đã ghi ADR.
- **Cần chốt:** ngày nộp, mẫu biểu/rubric, bộ sơ đồ bắt buộc, dữ liệu demo, môi trường chạy, mục tiêu tải/đáp ứng và yêu cầu sao lưu.
- **Khuyến nghị:** chốt checklist nghiệm thu cùng giảng viên ngay tuần đầu; mỗi FR hiện hành có use case/tiêu chí chấp nhận và kiểm thử phù hợp. Ưu tiên luồng đăng ký → duyệt tin → giữ chỗ → giao nhận → đánh giá, sau đó kiểm duyệt/tranh chấp và báo cáo. Không tự cam kết SLA 24/7 chỉ vì nguồn có mong muốn này.
- **Chốt bởi:** trưởng nhóm + giảng viên/khách hàng.

### A19 — Số lượng và bán tách · Đã chốt · P0

- **Đã chốt:** một bản ghi kho cho một đồ vật thực tế; tin bán một đồ vật hoặc combo nguyên bộ, tối đa một giao dịch hoàn tất. Không có đặt mua một phần số lượng của một bản ghi kho hoặc tách một phần combo trong cùng giao dịch.
- Có thể đăng lẻ các đồ vật đồng thời với combo bằng liên kết chung theo A02. Chấp nhận combo phải giữ được toàn bộ đồ vật hoặc thất bại toàn bộ; không giữ dở một phần. Khi một vật đã bán ở tin lẻ, combo không tự ghi hoàn tất.
- **Xác nhận:** trưởng nhóm, S5/C12, ghi nhận 28/09/2026. **Liên quan:** FR-04,08,18; A02/A15.

## 8. Quy trình duy trì tài liệu

1. Khi xuất hiện vấn đề mới, thêm mã A tiếp theo, mô tả thiếu gì, FR bị ảnh hưởng, phương án đề nghị và người cần quyết định. Không biến giả định của AI thành yêu cầu hiện hành.
2. Khi có quyết định, ghi người xác nhận, vai trò, ngày, nội dung và bằng chứng (liên kết issue/biên bản hoặc trích yếu trao đổi không chứa dữ liệu nhạy cảm). Phân biệt quyết định nghiệp vụ với lựa chọn kỹ thuật của nhóm.
3. Cập nhật FR tương ứng và bảng thay đổi mục 6; chuyển A sang “Đã chốt” hoặc “Chốt một phần”, giữ lịch sử nội dung cũ qua Git. Không xóa/tái sử dụng mã.
4. Cập nhật use case, tiêu chí chấp nhận, UML, hợp đồng API, kế hoạch và kiểm thử liên quan trong cùng đợt thay đổi. Nếu cần sửa mô hình dữ liệu đã triển khai, dùng migration mới theo quy ước repository.
5. Tạo PR để một thành viên khác kiểm tra tính nhất quán và nguồn quyết định. Việc có code hoặc PR được merge không tự chứng minh chính sách đã được khách hàng duyệt.
6. Tăng phiên bản/ngày và thêm một dòng lịch sử. Trước mỗi mốc demo, rà lại toàn bộ A chưa chốt và kiểm tra luồng liên quan không bị triển khai theo giả định ngầm.

Mẫu ghi nhận quyết định:

```text
Mã quyết định: Cxx
Vấn đề: Axx; yêu cầu: FR-xx
Nội dung được duyệt:
Người xác nhận / vai trò:
Ngày xác nhận / nguồn bằng chứng:
Quy định cũ bị thay thế:
Use case / UML / API / dữ liệu / kiểm thử / nhiệm vụ cần cập nhật:
```

| Phiên bản | Ngày | Nội dung |
| --- | --- | --- |
| 1.0 | 26/09/2026 | Hợp nhất PDF, 8 phản hồi khách hàng và xác nhận tiếp theo của trưởng nhóm; tách các khuyến nghị chưa duyệt; thay thế brief làm nguồn nghiệp vụ chính. |
| 1.1 | 28/09/2026 | Ghi S5/C11–C23: kho cá nhân và nhiều tin dùng chung đồ vật; bỏ hạn mức giữ của người mua; chốt hạn mức tin, xác thực, giao nhận/admin, điểm đánh giá, quyền khóa tạm và sửa tin; bỏ −20 cố định; giữ mở bảng phạt, ngoại lệ, chi tiết còn thiếu và đổi đồ. Đồng bộ kế hoạch, ADR, hướng dẫn nhóm và mô hình nghiệp vụ. |

## 9. Tài liệu liên quan và bàn giao ngữ cảnh

- Đưa tài liệu này cho thành viên/AI khi tiếp tục phân tích nghiệp vụ; đọc thêm [AGENTS.md](../../AGENTS.md) để biết quy tắc làm việc và [README](../../README.md) để biết trạng thái chạy thực tế.
- [ADR công nghệ](../architecture/ADR-001-stack.md) quản lý lựa chọn kỹ thuật; tài liệu này quản lý yêu cầu nghiệp vụ.
- [Kế hoạch phát triển](../planning/development-plan.md), [bảng giao việc](../onboarding/team-kickoff.md) và [mô hình nghiệp vụ](../uml/marketplace-lifecycle.md) đồng bộ v1.1. [Hợp đồng backend khởi tạo](../api/README.md) bổ sung OpenAPI dự kiến, DTO và schema dùng chung; chỉ endpoint nền tảng đang chạy. Các kiểm soát kỹ thuật không phê duyệt nội dung còn mở ở mục 7.
- [Ghi chú xử phạt](moderation-policy-notes.md) chứa tham khảo nền tảng và nhóm hành vi đề xuất, không chứa bảng điểm phạt đã duyệt. [Phương án đổi đồ](barter-proposal.md) chỉ là tư vấn theo A17.
- [Brief cũ](brief.md) chỉ còn là đường dẫn chuyển tiếp để các liên kết cũ không hỏng.

Ở thời điểm cập nhật v1.1, backend vẫn mới có nền tảng và dữ liệu danh mục; nghiệp vụ trên chưa được triển khai. Mô hình minh họa không phải schema cuối cùng. Các A chốt một phần/chưa chốt vẫn là phụ thuộc cần xử lý trước chức năng tương ứng.
