# Đặc tả yêu cầu nghiệp vụ — Sàn trao đổi và thanh lý đồ dùng phòng trọ sinh viên

**Phiên bản:** 1.7 — **Ngày cập nhật:** 05/10/2026 — **Người quản lý:** trưởng nhóm.

Đây là tài liệu nghiệp vụ được duy trì trong suốt quá trình phát triển, thay thế PDF gốc làm nguồn tham chiếu làm việc. PDF vẫn là bằng chứng lịch sử. Tài liệu này không phải thiết kế cơ sở dữ liệu và không khẳng định các chức năng đã được lập trình.

## 1. Nguồn thông tin và cách đọc

| Mã nguồn | Nội dung và giá trị sử dụng |
| --- | --- |
| S1 | PDF `Nhóm 15_HỆ THỐNG SÀN TRAO ĐỔI VÀ THANH LÝ ĐỒ DÙNG PHÒNG TRỌ SINH VIÊN.pdf`, 5 trang. Yêu cầu ban đầu, còn một số mâu thuẫn. |
| S2 | Ảnh trao đổi: câu hỏi của Nguyễn Hữu Nguyên ngày 22/09/2026 và phản hồi của Phan Gia Đạt ngày 23/09/2026, do trưởng nhóm cung cấp là phản hồi khách hàng. Có 8 nội dung được đồng ý; tóm tắt tại mục 6. |
| S3 | Xác nhận tiếp theo của trưởng nhóm trong cuộc trò chuyện: đúng 30 điểm bị khóa vĩnh viễn nhưng được khiếu nại; mở khóa sau 14 ngày; MSSV là duy nhất trong phạm vi ĐHQG-HCM. Được ghi nhận vào v1.0 ngày 26/09/2026. |
| S4 | Các phương án do trợ lý đề xuất trong trao đổi và tài liệu này. **Chưa được duyệt**, được tập hợp riêng tại mục 7. |
| S5 | Các quyết định do trưởng nhóm xác nhận trong cuộc trao đổi ngày 27–28/09/2026, ghi nhận vào v1.1 ngày 28/09/2026. Gồm A01–A09, A13–A14, phần cho tặng của A17 và mô hình A02/A19; chỉ các nội dung ghi “Đã chốt” mới là quyết định. Đây là xác nhận của trưởng nhóm, không gán thành phản hồi trực tiếp của khách hàng. Trích yếu và phạm vi thay thế tại C11–C23. |
| S6 | Nhận xét khách hàng do người dùng cung cấp trong cuộc trao đổi này, ghi nhận ngày 05/10/2026: “Quy định ‘không xét hoàn cảnh’ là đúng, nhưng thiếu cơ chế chống tài khoản đầu cơ (thu gom hàng loạt đồ 0 đồng đem bán lại); cần giới hạn số lần nhận đồ cho tặng theo tuần.” Chưa cung cấp tên người nhận xét hoặc ngày gửi gốc; 05/10 là ngày ghi nhận, không phải ngày xác nhận gốc. Nguyên tắc hạn mức được bổ sung tại C24/FR-19; thông số và cơ chế áp dụng còn mở tại A20. |
| S7 | Nhận xét tại GL-10 và phần “Đề xuất” do người dùng cung cấp, ghi nhận ngày 05/10/2026. Nhận xét yêu cầu làm rõ mã sau 10 phút và xử lý nhập sai; phương án đề xuất ban đầu là vô hiệu hóa mã khi hết hạn hoặc đạt giới hạn sai, người bán gửi lại mã mới. Phương án này chưa được duyệt tại thời điểm ghi nhận; phần người bán cấp lại đã được thay bởi xác nhận S8 về người mua yêu cầu cấp lại. Giữ S7 để truy vết, không gộp thành quyết định S5. |
| S8 | Người dùng chốt trong cuộc trao đổi ngày 05/10/2026: “Hết hạn 10p / nhập sai 5 lần -> Vô hiệu hoá mã cũ -> Người mua có thể yêu cầu cấp mã mới.” Xác nhận được ghi riêng tại C25/FR-09/A06; không gán thành phản hồi trực tiếp của khách hàng. S8 chưa chốt thông số tần suất; phần đó được xác nhận tiếp tại S9. |
| S9 | Người dùng đồng ý mô tả luồng và bảng giới hạn trong cuộc trao đổi ngày 05/10/2026: 60 giây giữa hai lần cấp thành công; tối đa 3 lần cấp thành công và 10 lần nhập sai trong 15 phút gần nhất, tính theo người mua + giao dịch. Cấp lại không xóa bộ đếm sai chung; đạt giới hạn thì tạm chặn thao tác mã, không hủy giao dịch hoặc đổi mốc 24 giờ. Ghi riêng tại C26/FR-09/A06, không gán thành phản hồi trực tiếp của khách hàng. |
| S10 | Người dùng yêu cầu ghi nhận ngày 05/10/2026: “Sau 30 ngày đóng tin đăng; Nhắc nhở gia hạn trước 7 ngày”. Ghi riêng tại C27/FR-13/A10, không gán thành phản hồi trực tiếp của khách hàng. Chốt mốc đóng tin và khoảng nhắc trước hạn; chưa xác nhận mốc bắt đầu tính, thời lượng sau gia hạn hoặc xử lý tin đang có giao dịch. |
| S11 | Người dùng cung cấp danh sách 13 đề xuất trích từ tài liệu và thông báo khách hàng đã chấp thuận, ghi nhận 05/10/2026. Ghi riêng tại C28–C40; đây là xác nhận phê duyệt khách hàng do người dùng chuyển tiếp, chưa có biên bản, tên người duyệt hoặc ngày duyệt gốc. Chỉ các nội dung cụ thể trong danh sách trở thành đã chốt; yêu cầu duyệt riêng bảng phạt không đồng nghĩa duyệt các con số, và hoãn đổi đồ không đồng nghĩa đưa đổi đồ vào bản hiện tại. |

Quy định mới đã xác nhận chỉ thay thế phần tương ứng của quy định cũ. Những yêu cầu khác của S1 được giữ lại; không tự suy ra rằng bỏ một chức năng đồng nghĩa bỏ các chức năng liên quan. Xác nhận của trưởng nhóm được ghi riêng, không gán thành lời của khách hàng.

- **Hiện hành:** yêu cầu từ S1 còn hiệu lực hoặc thay đổi đã xác nhận qua S2/S3/S5/S6/S8/S9/S10/S11, trong đúng phạm vi được nêu.
- **Chưa chốt / chốt một phần:** cần quyết định bổ sung. Giải pháp đề xuất không phải yêu cầu đã được duyệt.
- **Đã loại bỏ:** giữ mã để truy vết nhưng không đưa vào phạm vi triển khai.

Mã FR-01–FR-18 và A01–A19 được giữ từ brief trước. Không đổi mã hoặc tái sử dụng mã đã loại bỏ. Các tài liệu cũ có thể dùng mã nguồn S1/S2/S3 với nghĩa khác; bảng nguồn trên chỉ áp dụng cho tài liệu này.

Phiên bản 1.2 bổ sung FR-19 và A20 cho hạn mức nhận đồ cho tặng theo tuần; không đổi nghĩa FR-18 là báo cáo cho tặng.

## 2. Mục tiêu và phạm vi

Giúp cộng đồng sinh viên tìm kiếm, bán, mua và cho tặng giáo trình, đồ gia dụng, nội thất và đồ dùng phòng trọ đã qua sử dụng; trao đổi trực tiếp, hẹn gặp và duy trì uy tín qua giao dịch.

Phạm vi địa lý/người học được mở rộng ra **ĐHQG-HCM**, không giới hạn tại UIT. Sinh viên đã tốt nghiệp tiếp tục sử dụng với trạng thái “Đã tốt nghiệp”. S1 còn nhắc đến học viên cao học, cán bộ và giảng viên; cách xác thực các nhóm này vẫn cần chốt tại A01/A13.

Luồng đã chốt gồm mua bán và cho tặng giá 0. Người nhận tặng tự quyết định nhận và chịu trách nhiệm về quyết định giao dịch; ứng dụng quản lý thông tin, giữ chỗ, xác nhận và phản ánh như giao dịch khác, không xét hoàn cảnh. **S11/C39 chốt hoãn đổi vật lấy vật sang bản mở rộng**; nguyên tắc có điều kiện cho bản mở rộng được ghi riêng tại A17, không triển khai trong bản hiện tại.

Theo nhận xét khách hàng S6, luồng cho tặng cần thêm **hạn mức số lần nhận theo tuần** để hạn chế thu gom đồ 0 đồng đem bán lại. Nguyên tắc không xét hoàn cảnh vẫn giữ; mức giới hạn, cách đếm và thời điểm kiểm tra chưa chốt tại FR-19/A20. Đây là hạn mức riêng cho nhận đồ cho tặng, không khôi phục hạn mức giữ chỗ chung của người mua.

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

Người mua/người bán là vai trò của thành viên trong từng giao dịch. Quản trị viên cấp cao quản lý hệ thống, danh mục và báo cáo; kiểm duyệt viên sinh viên duyệt tin, xác minh phản ánh và đề nghị xử lý. S11/C35 chốt quản trị viên cấp cao quyết định khóa vĩnh viễn/ngoại lệ; khi có thể, người xét khiếu nại khác người ra quyết định. Ma trận quyền chi tiết còn mở tại A08.

## 4. Yêu cầu nghiệp vụ hiện hành

### FR-01 — Đăng ký và xác thực tài khoản

- Hồ sơ gồm họ tên, MSSV, địa chỉ trọ, số điện thoại, ngày tham gia, khóa học; S1 còn mô tả ngành học và cơ sở học chính.
- Dùng User_ID riêng; giữ MSSV làm thuộc tính định danh sinh viên. MSSV duy nhất trong phạm vi đã xác nhận.
- Email theo mẫu tên miền `*.edu.vn`, bao gồm tên miền con như `gm.uit.edu.vn`; xác minh quyền sở hữu email bằng OTP. Người đăng ký gửi thẻ sinh viên để admin đối chiếu thông tin và duyệt kích hoạt. Cần cả xác minh email và duyệt hồ sơ; đuôi email tự nó không chứng minh thuộc ĐHQG-HCM.
- MSSV có thể xuất hiện ở phần trước `@`, nhưng không mặc định mọi trường dùng cùng cấu trúc hoặc suy ra MSSV chỉ từ email. Không giả định có API/cổng kiểm tra của trường.
- **Bổ sung S11/C28:** mỗi người một tài khoản; admin được xét giấy tờ thay thế cho trường hợp thiếu email/thẻ. Danh mục giấy tờ, nguồn được công nhận và đường xác minh khi thiếu email còn mở, không bỏ qua xác minh bằng một thao tác tự động.
- **OTP đăng ký đã chốt:** hiệu lực **5 phút**, tối đa **5 lần nhập sai**, gửi lại sau ít nhất **60 giây**. Đây là OTP đăng ký riêng, không dùng thời hạn 10 phút hay tự áp hạn mức 3/10 trong 15 phút của mã hoàn tất.
- **Nguồn:** S1 tr.1–2; S2 câu 1, 3; S3; S5/C11; S11/C28. **Còn mở:** danh mục/nguồn xác minh ngoại lệ và chống trùng người tại A01/A13; các thông số OTP chưa nêu trong S11.

### FR-02 — Thông tin học tập và tốt nghiệp

- Không khóa tài khoản chỉ vì hết niên khóa hoặc tốt nghiệp. Chuyển trạng thái sang “Đã tốt nghiệp”, vẫn được sử dụng.
- Giữ yêu cầu nhắc cập nhật thông tin học tập/cơ sở học hằng năm. Theo S11/C37, chưa cập nhật thì nhắc lại sau **7 ngày** từ nhắc ban đầu và đánh dấu **“Cần cập nhật”**, không tự khóa tài khoản.
- Người tốt nghiệp thiếu giấy tờ được admin xét giấy tờ thay thế từ nguồn được công nhận; danh mục và nguồn cụ thể còn mở tại A01/A13.
- **Nguồn:** S1 tr.2, được S2 câu 2 thay đổi; S11/C37. **Còn mở:** chi tiết nguồn xác minh và chu kỳ hồ sơ tại A13.

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
- **Bổ sung S11/C38:** tạm ẩn tin khi gửi bản sửa để kiểm duyệt; không sửa dữ liệu kho đang giữ/đã bán. Tin B chưa giữ vẫn được sửa/rút khi tin A giữ đồ vật chung, nhưng không được sửa bản ghi kho đang giữ hoặc thỏa thuận của A. Admin gỡ tin đang giữ phải xem xét giao dịch riêng, không tự hủy hoặc giải phóng đồ vật.
- **Nguồn:** S1 tr.1–2; S5/C12,C21; S11/C29,C38,C40. **Còn mở:** chi tiết hiển thị/lưu trữ và quyết định giao dịch khi tin bị gỡ tại A14; mã môn liên trường tại A15.

### FR-05 — Kiểm duyệt và giới hạn tin

- Tin phải được duyệt trước khi công khai. Không chấp nhận hàng gây hại hoặc tài liệu đề thi mật/chưa được phép theo mô tả nguồn.
- Uy tín **<120: tối đa 5 tin; ≥120: tối đa 10 tin**. Tính tin đang mở và đang giữ chỗ; không tính nháp/chờ duyệt/ẩn/hết hạn/hoàn tất.
- Tụt điểm giữ các tin hiện có dù vượt hạn mức mới, nhưng không được công khai thêm khi chưa còn chỗ. Ví dụ 8 tin và điểm giảm còn 119: giữ 8 tin, phải giảm xuống 4 mới được công khai thêm 1 tin. Quy tắc này không miễn xử lý ẩn tin vi phạm hoặc hạn chế tài khoản.
- Khi duyệt/mở lại/khôi phục phải kiểm tra quyền, tình trạng duyệt và hạn mức. Trạng thái công khai của tin tách khỏi khả năng đặt do đồ vật bị giữ ở tin khác. S11/C38 chốt tin thiếu hàng tạm thời vẫn tính hạn mức nếu còn công khai; tin thiếu hàng do đồ vật đã bán thì lưu trữ, không ghi thành giao dịch hoàn tất của tin liên quan.
- **Nguồn:** S1 tr.2–3; S5/C13,C21; S11/C30,C38. **Còn mở:** chi tiết A14.

### FR-06 — Danh mục, tìm kiếm và vị trí

- Danh mục phân cấp; tìm theo từ khóa, mã môn, giá tối đa và bán kính.
- Có khu vực trường, ký túc xá và khu trọ lân cận; nguồn đề cập GPS và khoảng cách tới cổng trường. Bán kính 2 km/3 km là ví dụ, không phải giới hạn đã chốt.
- **Nguồn:** S1 tr.2–3; phạm vi mở rộng theo S2 câu 3. **Còn mở:** A11, A15.

### FR-07 — Nhắn tin và thương lượng

- Người mua/người bán nhắn tin trực tiếp trong ứng dụng. Người mua gửi đề nghị giá; người bán đồng ý hoặc từ chối.
- Nhắn tin, đồng ý giá, thêm giỏ hoặc gửi yêu cầu đặt hàng chưa giữ hàng. Người bán chấp nhận yêu cầu mới giữ; lưu giá đã thỏa thuận tại thời điểm chấp nhận.
- **Nguồn:** S1 tr.3; S5/C14; S11/C31 xác nhận lại thời điểm giữ và giá thỏa thuận.

### FR-08 — Giữ chỗ và hẹn giao nhận

- Người mua yêu cầu giữ chỗ; người bán chấp nhận thì giữ toàn bộ đồ vật của tin. Mỗi tin tối đa một giữ chỗ còn hiệu lực; cùng đồ vật không được giữ/bán đồng thời qua các tin khác nhau.
- **Không có hạn mức chung về số giữ chỗ đồng thời của người mua**, thay giới hạn 3 món. Số giữ chỗ của người bán không vượt số tin, và có thể thấp hơn nếu các tin trùng đồ vật; đây không phải hạn mức người mua theo số tin họ đăng. Hạn mức nhận đồ cho tặng theo tuần là quy tắc riêng tại FR-19/A20; chưa chốt việc kiểm tra hoặc tính vào hạn mức ở bước giữ chỗ hay hoàn tất.
- **Bỏ tự hủy sau 24 giờ.** S11/C32 chốt nhắc **hai bên một lần sau 24 giờ từ lúc người bán chấp nhận**. Đây là nhắc giữ chỗ, khác mốc chuyển admin sau báo giao; không nhắc lặp hoặc tự hủy vì hết thời gian.
- Hai bên hẹn địa điểm/thời gian phù hợp; khuyến khích các điểm gặp an toàn như thư viện, căn tin, trạm xe buýt.
- Trước khi báo đã giao, mỗi bên được hủy; ghi người hủy/lý do và báo bên còn lại. Phản ánh hủy gây thiệt hại/không đến hẹn được lập báo cáo có bằng chứng để admin xét. Không có mốc “sát giờ” cố định hoặc tự phạt theo thời điểm hủy; mức phạt chưa chốt tại A08.
- Sau khi báo đã giao, người mua có thể yêu cầu hủy, cần hai bên xác nhận hoặc admin giải quyết. Theo S11/C33, **bên còn lại nhập mã hủy riêng để đồng ý** với yêu cầu hủy; không dùng mã hoàn tất để hủy. Không coi OTP là bằng chứng đã trả hàng/hoàn tiền. Chỉ giải phóng hàng khi hủy được xác nhận; mở lại tin phải đáp ứng điều kiện công khai.
- **Nguồn:** S1 tr.3–4; S2 câu 4; S5/C12,C14,C15; S11/C29,C31,C32,C33,C40. **Còn mở:** chi tiết tác vụ nhắc A05, hợp đồng mã hủy A06 và xử lý kiểm duyệt A14.

### FR-09 — Giao nhận và xác nhận hoàn tất

- Người mua kiểm tra hàng và trả tiền ngoài ứng dụng; người bán báo đã giao sau khi nhận thanh toán (cho tặng giá 0 không có bước trả tiền). Người bán phải gửi ảnh bàn giao khi báo đã giao; ảnh là bằng chứng hỗ trợ, không tự chứng minh đã nhận hàng hoặc thanh toán.
- Hệ thống gửi mã **6 chữ số** tới ứng dụng người mua; chỉ người mua của giao dịch được dùng mã để xác nhận hoàn tất. Mã có hạn **10 phút**, tối đa **5 lần nhập sai**, dùng một lần; cấp lại vô hiệu mã cũ và phải giới hạn tần suất cấp/thử. Hết hạn mã không hủy giữ chỗ.
- **Đã chốt bổ sung S8/C25:** khi hết 10 phút hoặc ngay sau lần nhập sai thứ 5, vô hiệu hóa mã cũ; chặn mọi lần sử dụng tiếp, kể cả nhập đúng. Không tự sinh mã mới. Người mua của giao dịch có thể yêu cầu hệ thống cấp mã mới; mã được gửi tới ứng dụng người mua, có hạn 10 phút từ lúc cấp và bộ đếm sai riêng của mã bắt đầu lại từ 0. Mã cũ không có hiệu lực trở lại. Vô hiệu hóa mã không khóa/hủy giao dịch hoặc khóa tài khoản.
- **Đã chốt giới hạn S9/C26:** giữa hai lần cấp thành công ít nhất 60 giây; tối đa 3 lần cấp thành công (gồm lần đầu và cấp lại) trong 15 phút gần nhất. Tối đa 10 lần nhập sai trong 15 phút gần nhất, cộng qua tất cả các mã của cùng người mua + giao dịch; cấp lại, đổi thiết bị hoặc đăng nhập lại không xóa bộ đếm chung. Đủ 3 lần cấp thì chặn cấp thêm nhưng vẫn cho dùng mã hiện tại nếu hợp lệ và chưa bị chặn bởi giới hạn sai. Đủ 10 lần sai thì tạm chặn cả cấp và kiểm tra mã. Các lượt cũ ra khỏi cửa sổ thì tính lại điều kiện; không tự cấp mã khi hết thời gian chờ. Luồng và bảng chi tiết tại A06.
- Sau **24 giờ từ khi người bán gửi đủ ảnh và báo đã giao**, nếu chưa xác nhận thì chuyển admin xem xét. Cấp lại mã không đổi mốc này. Không tự hoàn tất vì im lặng hoặc mở bán lại hàng đang chờ giải quyết.
- Admin có thể xác nhận hoàn tất khi đủ bằng chứng dù người mua không phản hồi, yêu cầu bổ sung hoặc giải quyết hủy/tranh chấp; lưu căn cứ, người quyết định và lịch sử. Hoàn tất bởi admin cũng mở thời hạn đánh giá như hoàn tất bởi người mua.
- **Bổ sung S11/C33:** admin phản hồi trong **3 ngày làm việc**; đây là hạn phản hồi, không phải cam kết giải quyết xong hoặc tự hoàn tất sau hạn. Ảnh bàn giao **không bắt buộc lộ mặt**, chỉ người có quyền được xem. Cách tính ngày làm việc/mốc bắt đầu và quyền xem cụ thể còn mở tại A06/A12.
- **Nguồn:** S1 tr.4; S5/C16; S7 nhận xét GL-10; S8/C25 chốt vô hiệu hóa và cấp lại; S9/C26 chốt tần suất cấp/thử; S11/C33. **Còn mở:** chi tiết bằng chứng, quyền xử lý admin và mã hủy tại A06/A08/A12. Các giới hạn mã hoàn tất không tự áp dụng cho OTP đăng ký hoặc mã hủy.

### FR-10 — Đánh giá và khiếu nại đánh giá

- **Chỉ người mua đánh giá người bán** từ 1–5 sao kèm nhận xét, mỗi giao dịch hoàn tất một đánh giá trong **15 ngày từ lúc hoàn tất**. Bỏ chiều người bán đánh giá người mua; người bán vẫn được báo cáo vi phạm theo FR-11.
- **5 sao: +2; 4 sao: 0; 3 sao: −1; 2 sao: −3; 1 sao: −5.** Mọi đánh giá 1–3 sao chỉ trừ sau khi admin xét lý do/bằng chứng và chấp thuận, không trừ ngay khi gửi.
- Hết 15 ngày không gửi đánh giá: cộng **+1 cho người bán một lần**, đóng quyền đánh giá. Đây không phải đánh giá sao tự sinh. Điểm đánh giá và điểm không đánh giá loại trừ nhau; đánh giá đang chờ xét hoặc bị bác vẫn là đã gửi, không nhận +1. Không đủ căn cứ thì không trừ.
- Cho phép khiếu nại đánh giá thấp sai sự thật/ác ý. Quản trị viên xác minh, gỡ đánh giá sai và khôi phục điểm uy tín tương ứng.
- **Bổ sung S11/C34:** được sửa trong hạn 15 ngày từ hoàn tất khi chưa có quyết định duyệt; bản sửa phải xét lại. Chỉ công khai đánh giá được chấp nhận. Khiếu nại trong ứng dụng trong **7 ngày**; mốc bắt đầu tính và phạm vi quyền khiếu nại cần làm rõ tại A07/A08.
- **Nguồn:** S1 tr.4; S2 câu 6; S5/C17; S11/C34. **Còn mở:** mốc tính khiếu nại, xử lý bản sửa/điểm và thẩm quyền chi tiết tại A07/A08.

### FR-11 — Báo cáo vi phạm và bằng chứng

- Báo cáo tin hoặc tài khoản: không đến hẹn, hàng sai mô tả, tài liệu cấm, hành vi lạm dụng và các trường hợp nguồn nêu.
- Có mã báo cáo, người báo cáo, người bị báo cáo, nội dung, liên hệ giao dịch khi phù hợp và bằng chứng để kiểm duyệt viên xem xét.
- **Bắt buộc có bằng chứng.** Ảnh, video, tin nhắn là các ví dụ được trao đổi; chưa chốt định dạng, dung lượng hoặc việc hỗ trợ tất cả ngay phiên bản đầu.
- Hủy có tranh chấp và không đến hẹn đều đi qua báo cáo để admin xem xét; gửi báo cáo tự nó không gây trừ điểm. Báo cáo trùng cùng hành vi được liên kết xử lý, không nhân số khoản phạt.
- Một sự việc được phép có **khoản điểm đánh giá và khoản xử phạt vi phạm riêng biệt**, mỗi khoản có căn cứ và chỉ áp dụng một lần; vẫn tính là một sự việc khi xem lịch sử tái phạm.
- **Bổ sung S11/C35:** bảng hành vi–mức phạt phải được duyệt riêng; kiểm duyệt viên xác minh/đề nghị, quản trị viên cấp cao quyết định khóa vĩnh viễn/ngoại lệ. Người khác xét khiếu nại khi có thể. Chưa có bảng con số được cung cấp/duyệt trong xác nhận này.
- **Nguồn:** S1 tr.4–5; S2 câu 7; S5/C15,C18,C23; S11/C35. **Còn mở:** bảng phạt cụ thể và quyền chi tiết tại A08; bằng chứng tại A12.

### FR-12 — Xử phạt, mở khóa và khiếu nại

| Điều kiện | Quy định hiện hành |
| --- | --- |
| Không đến hẹn hoặc hủy có phản ánh | Báo cáo kèm bằng chứng để admin xét; **bỏ mức −20 cố định của S1**, mức xử phạt chưa chốt. |
| 30 < điểm uy tín ≤ 50 | Cảnh báo và khóa tạm thời 14 ngày. |
| Điểm uy tín ≤ 30 | Khóa vĩnh viễn, có quyền khiếu nại. **Đúng 30 thuộc mức này.** |
| Hết thời hạn khóa tạm 14 ngày | Mở khóa và giữ điểm, không khóa lại chỉ do điểm cũ. Vi phạm mới được xác minh mới xét đợt tiếp theo theo cùng ngưỡng; không mở nếu có khóa vĩnh viễn còn hiệu lực. |
| Tái phạm | Tạm thời không có hình phạt tăng nặng riêng. Điều này không bãi bỏ tái khóa theo ngưỡng sau vi phạm mới. |
| Gian lận tài chính được xác định | S1 quy định cảnh báo và khóa vĩnh viễn gắn với MSSV; chưa có thay đổi loại bỏ căn cứ này. Quy trình xác định còn mở. |

Khi khóa tạm, được xử lý giao dịch **đã giữ chỗ trước khi bị khóa**: trao đổi, hẹn giao, gửi ảnh, xác nhận nhận/hủy theo quy trình, đánh giá khi đủ điều kiện và khiếu nại. Chặn đăng/giữ chỗ mới. Theo S11/C36, khóa vĩnh viễn vẫn được xem lịch sử/khiếu nại; admin hỗ trợ giao dịch dở, không tự mở toàn bộ quyền giao dịch. Cùng sự việc xét khóa một lần; vi phạm mới trong đợt khóa lấy mốc kết thúc muộn hơn giữa đợt hiện có và đợt mới. Khóa vĩnh viễn còn hiệu lực luôn ưu tiên.

**Nguồn:** S1 tr.5; S2 câu 8; S3; S5/C18,C19,C23; S11/C35,C36. **Còn mở:** chi tiết A07–A09. Không tự đặt số điểm phạt cho báo cáo khi bảng phạt chưa được duyệt; ngưỡng khóa và điểm đánh giá đã chốt là các quy tắc riêng.

### FR-13 — Gia hạn và lưu trữ tin cũ

- **Đã chốt S10/C27:** thời hạn tin đăng là **30 ngày**; hệ thống nhắc người bán gia hạn **trước hạn đóng tin 7 ngày**. Đến hạn mà chưa gia hạn thì đóng tin. Không tự động gia hạn thay người bán.
- Với chu kỳ ban đầu 30 ngày, mốc nhắc tương ứng ngày thứ **23**, tính theo cùng mốc bắt đầu với hạn đóng tin. Mốc bắt đầu tính 30 ngày và quy tắc sau gia hạn còn mở tại A10; chưa tự chọn thời điểm tạo nháp hay duyệt/công khai tin làm mốc.
- **Quy định cũ bị thay thế trong phạm vi thời điểm nhắc/đóng:** S1 tr.5 nêu quét hằng tuần sau 30 ngày rồi hỏi gia hạn và chờ thêm 3 ngày; không dùng quy trình này để trì hoãn hạn đóng 30 ngày đã chốt. Mô tả gia hạn thêm 15 ngày của S1 chưa được S10 xác nhận lại, cần làm rõ tại A10.
- Bỏ thời hạn giữ chỗ tại FR-08 **không đồng nghĩa bỏ quy trình tin cũ** này.
- **Nguồn:** S1 tr.3,5; S10/C27. **Còn mở:** A10, A14. Đóng tin không phải quyết định tự hủy giữ chỗ, giải phóng hàng hoặc hoàn tất giao dịch; xử lý tin đang giữ/chờ xác nhận/tranh chấp cần chốt riêng.

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

### FR-19 — Hạn mức nhận đồ cho tặng theo tuần

- Khách hàng yêu cầu giới hạn số lần một tài khoản nhận đồ cho tặng theo tuần nhằm hạn chế thu gom hàng loạt đồ 0 đồng đem bán lại. Giữ nguyên quy định **không xét hoàn cảnh**; không yêu cầu chứng minh hoàn cảnh để được nhận tặng.
- Đây là hạn mức riêng của luồng cho tặng, tách khỏi hạn mức công khai tin của người bán và quy tắc không có hạn mức giữ chỗ chung của người mua tại FR-08. Chưa đủ thông tin để xác định hạn mức tác động ở bước yêu cầu, chấp nhận giữ chỗ hay hoàn tất nhận hàng.
- **Cần chốt trước khi triển khai:** số lần tối đa; tuần lịch hay cửa sổ 7 ngày và múi giờ; một lần tính theo giao dịch hay đồ vật trong combo; trạng thái/thời điểm được tính; cách xử lý hủy, tranh chấp và chuyển tuần; thời điểm kiểm tra, xử lý yêu cầu đồng thời và phản hồi khi hết hạn mức; có ngoại lệ hay không và ai có quyền quyết định.
- Nhận xét chưa phê duyệt lệnh cấm bán lại trong mọi trường hợp, cách tự động kết luận đầu cơ hoặc điểm phạt/khóa tài khoản. Những biện pháp đó cần quyết định riêng, giữ ranh giới báo cáo có bằng chứng và chính sách xử phạt còn mở tại FR-11–12/A08.
- **Nguồn:** S6/C24, ghi nhận 05/10/2026. **Trạng thái:** nguyên tắc đã được khách hàng yêu cầu; chi tiết áp dụng chưa chốt tại A20. Tiêu chí chấp nhận định lượng phải bổ sung sau khi các chi tiết này được xác nhận.

## 5. Dữ liệu và yêu cầu chất lượng

Các nhóm thông tin cần phân tích tiếp gồm hồ sơ/xác thực/thẻ sinh viên, vai trò, kho cá nhân/đồ vật/liên kết đồ vật–tin, tin/ảnh/danh mục/vị trí, hội thoại/đề nghị giá, giữ chỗ/lịch hẹn, ảnh giao nhận/mã xác nhận, đánh giá/biến động uy tín, báo cáo/bằng chứng/quyết định xử lý, hạn chế tài khoản, thông báo và thống kê. Đây là **khái niệm nghiệp vụ, chưa phải danh sách bảng hay thiết kế lớp cuối cùng**. Thẻ sinh viên và ảnh bàn giao là dữ liệu hạn chế truy cập; không dùng đường dẫn công khai của ảnh tin đăng.

S1 mong muốn hoạt động 24/7; chưa có SLA định lượng, tải đồng thời hoặc thời gian đáp ứng được khách hàng duyệt. Các mục tiêu kỹ thuật cần thống nhất tại A18. Độc quyền giữ chỗ trên tin và trên đồ vật dùng chung, cùng hạn mức công khai tin của người bán, phải đúng cả khi nhiều người thao tác đồng thời. Không có hạn mức giữ chỗ chung của người mua; hạn mức nhận đồ cho tặng theo tuần tại FR-19 cần chốt A20 trước khi thiết kế kiểm soát đồng thời. Không được hoàn tất, tính điểm hoặc tính lặp một lần nhận thuộc hạn mức chỉ vì gửi lại yêu cầu. Dữ liệu phục vụ đếm hạn mức phải được xác định theo đơn vị, trạng thái và kỳ tính đã duyệt; không tự dùng chỉ tiêu báo cáo FR-18 làm cách đếm hạn mức.

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
| C24 | Giữ không xét hoàn cảnh, bổ sung yêu cầu hạn mức số lần nhận đồ cho tặng theo tuần để hạn chế thu gom đồ 0 đồng đem bán lại; số lần và cơ chế áp dụng chưa chốt | S6, nhận xét khách hàng do người dùng cung cấp; ghi nhận 05/10/2026 | FR-19; làm rõ phạm vi FR-08; A17/A20; phối hợp A15/FR-18 về cách đếm |
| C25 | Hết 10 phút hoặc sai đủ 5 lần thì vô hiệu hóa mã cũ, không tự sinh mã; người mua yêu cầu hệ thống cấp mã mới. Giữ người mua là bên nhận/dùng mã, hàng đang giữ và mốc 24 giờ; tần suất chưa chốt tại thời điểm C25, sau đó chốt tại C26 | S8, người dùng xác nhận trong cuộc trao đổi 05/10/2026; thay phương án người bán cấp lại tại S7 | FR-09; A06; GL-10 |
| C26 | Chốt khoảng chờ cấp mã 60 giây, tối đa 3 lần cấp thành công/15 phút và 10 lần nhập sai/15 phút theo người mua + giao dịch. Bộ đếm chung không đặt lại khi cấp mã mới; phân biệt chặn cấp với chặn cấp/kiểm tra, không khóa/hủy giao dịch | S9, người dùng đồng ý mô tả luồng và bảng giới hạn trong cuộc trao đổi 05/10/2026 | FR-09; A06; GL-10; bổ sung C25 |
| C27 | Tin đăng đóng sau 30 ngày nếu chưa gia hạn; nhắc người bán gia hạn trước hạn 7 ngày. Thay thời điểm nhắc/đóng của quy trình cũ hỏi sau 30 ngày và chờ thêm 3 ngày; các chi tiết gia hạn/giao dịch dở còn mở | S10, người dùng yêu cầu ghi nhận trong cuộc trao đổi 05/10/2026 | FR-13; A10; phối hợp A14 |
| C28 | OTP email và admin duyệt thẻ; xét giấy tờ thay thế cho ngoại lệ, mỗi người một tài khoản. OTP đăng ký: 5 phút, tối đa 5 lần sai, gửi lại sau 60 giây | S11, phê duyệt khách hàng do người dùng chuyển tiếp; ghi nhận 05/10/2026 | FR-01; A01/A13; bổ sung C11/C20 |
| C29 | Tin dùng chung bản ghi kho, chặn giữ/bán xung đột giữa các tin; combo bán nguyên bộ | S11, cùng nguồn C28 | FR-04,08; A02/A19; xác nhận lại C12 |
| C30 | <120 điểm: 5 tin, ≥120: 10 tin mở/đang giữ; tụt điểm giữ tin hiện có nhưng chặn công khai thêm khi vượt mức | S11, cùng nguồn C28 | FR-05; A03; xác nhận lại C13 |
| C31 | Chỉ giữ khi người bán chấp nhận yêu cầu đặt hàng, lưu giá thỏa thuận lúc đó | S11, cùng nguồn C28 | FR-07–08; A04; xác nhận lại C14 |
| C32 | Không tự hủy giữ chỗ; nhắc hai bên một lần sau 24 giờ từ lúc chấp nhận | S11, cùng nguồn C28 | FR-08; A05; bổ sung C15 |
| C33 | Cấp lại mã hoàn tất cách nhau 60 giây, tối đa 3 lần/15 phút; bên còn lại nhập mã hủy riêng để đồng ý; admin phản hồi trong 3 ngày làm việc; ảnh bàn giao không bắt buộc lộ mặt, chỉ người có quyền xem | S11, cùng nguồn C28 | FR-08–09; A06/A12; giữ nguyên C25/C26 và giới hạn 10 lần sai/15 phút |
| C34 | Sửa đánh giá trong hạn 15 ngày khi chưa có quyết định duyệt, bản sửa xét lại; chỉ công khai đánh giá được chấp nhận; khiếu nại trong ứng dụng trong 7 ngày | S11, cùng nguồn C28 | FR-10; A07; bổ sung C17/C18 |
| C35 | Duyệt riêng bảng hành vi–mức phạt; kiểm duyệt viên xác minh/đề nghị, quản trị viên cấp cao quyết định khóa vĩnh viễn/ngoại lệ; người khác xét khiếu nại khi có thể | S11, cùng nguồn C28 | FR-03,11–12; A08; không duyệt số điểm phạt cụ thể |
| C36 | Khóa vĩnh viễn được xem lịch sử/khiếu nại, admin hỗ trợ giao dịch dở; cùng sự việc xét khóa một lần, vi phạm mới trong đợt khóa dùng mốc kết thúc muộn hơn | S11, cùng nguồn C28 | FR-12; A09; bổ sung C19 |
| C37 | Admin xét giấy tờ thay thế từ nguồn được công nhận; nhắc lại cập nhật hồ sơ sau 7 ngày, đánh dấu “Cần cập nhật”, không tự khóa | S11, cùng nguồn C28 | FR-01–02; A13; bổ sung C20 |
| C38 | Tạm ẩn khi gửi bản sửa; thiếu hàng tạm thời còn công khai vẫn tính hạn mức, thiếu do đã bán thì lưu trữ; không sửa kho đang giữ/đã bán; admin gỡ tin đang giữ xem xét giao dịch riêng | S11, cùng nguồn C28 | FR-04–05,08; A14; bổ sung C21, không cấm sửa tin B chỉ vì A giữ đồ vật chung |
| C39 | Hoãn đổi đồ sang bản mở rộng; nếu triển khai giữ đồng thời đồ hai bên, chỉ hoàn tất khi đủ hai xác nhận hoặc admin quyết định | S11, cùng nguồn C28 | Phạm vi; A17; không phê duyệt triển khai đổi đồ trong bản hiện tại |
| C40 | Một bản ghi kho là một đồ vật; bán lẻ hoặc combo nguyên bộ; chấp nhận combo giữ đủ tất cả món hoặc thất bại toàn bộ | S11, cùng nguồn C28 | FR-04,08; A02/A19; xác nhận lại C12 |

Các xác nhận S5 được lưu bằng trích yếu trao đổi trên, không có biên bản khách hàng độc lập được cung cấp. C01–C10 giữ nguyên để truy vết; các đề xuất S4 chỉ trở thành hiện hành ở đúng phạm vi được S5 xác nhận. Không suy diễn “đồng ý” thành một con số/thời hạn chưa từng được nêu.

## 7. Sổ quyết định, vấn đề còn mở và phương án khuyến nghị

Mỗi mục tách **Đã chốt**, **Còn mở** và **Đề xuất chưa duyệt**. Không còn xem toàn bộ mục 7 là đề xuất: các quyết định S5 đã cập nhật vào FR và mục 6. Yêu cầu tư vấn về đổi vật lấy vật hoặc tham khảo nền tảng khác không đồng nghĩa duyệt triển khai. Không hỏi lại những nội dung đã xác nhận; nội dung chủ động hoãn vẫn được giữ mở.

**Đợt phê duyệt S11, ghi nhận 05/10/2026:** C28–C40 chuyển đúng các đề xuất được người dùng báo là khách hàng chấp thuận thành quy định hiện hành. A02/A03/A04/A19 được xác nhận lại; A01/A05–A09/A12–A14 được bổ sung trong phạm vi từng C. A17 chốt hoãn bản hiện tại và nguyên tắc có điều kiện cho bản mở rộng. Các nhãn “chốt một phần” còn giữ vì chi tiết chưa có trong danh sách vẫn cần quyết định; không có nghĩa mở lại nội dung đã duyệt. Phụ trách M1: danh tính/hạn chế; M2: tin/kho; M3: giữ/hủy; M4: giao nhận/đánh giá; M5: kiểm duyệt/bằng chứng; trưởng nhóm phối hợp khách hàng chốt phần thiếu.

Ưu tiên **P0:** chốt trước khi cố định mô hình/quy trình phụ thuộc; **P1:** chốt trước khi triển khai chức năng liên quan; **P2:** trước nghiệm thu. Người phụ trách dưới đây là vai trò đề nghị: trưởng nhóm tổng hợp; người phụ trách nghiệp vụ làm rõ; khách hàng xác nhận chính sách. Không cần dừng công việc độc lập đang đủ yêu cầu.

### A01 — Đối tượng và cách chứng minh danh tính · Chốt một phần · P0

- **Đã chốt:** phạm vi ĐHQG-HCM, User_ID riêng, MSSV duy nhất. Email `*.edu.vn` được xác minh bằng OTP, kết hợp thẻ sinh viên và admin duyệt kích hoạt. Không suy ra MSSV từ cấu trúc email không được xác minh. OTP và duyệt thẻ là hai điều kiện khác nhau.
- **Đã chốt S11/C28:** mỗi người một tài khoản; admin xét giấy tờ thay thế cho ngoại lệ thiếu email/thẻ. OTP đăng ký có hạn 5 phút, tối đa 5 lần sai, gửi lại sau ít nhất 60 giây; không nhập chung với mã giao dịch.
- **Còn mở:** danh mục giấy tờ/nguồn được công nhận, luồng xác minh khi thiếu email, cách đối chiếu nhiều định danh với một người, quy trình phát hiện/hợp nhất tài khoản trùng; độ dài OTP, giới hạn cộng dồn, vòng đời cấp lại và cách chuyển phát chưa nêu. Không tự loại nhóm S1 hoặc suy ra email bất kỳ được tự kích hoạt.
- **Khuyến nghị kỹ thuật:** lưu MSSV dạng chuỗi, kiểm tra tên miền email đúng ranh giới (không nhận `edu.vn.example.com`), giữ ảnh thẻ ở vùng hạn chế truy cập. Không coi OTP là chứng minh thẻ thuộc người đăng ký.
- **Xác nhận:** S5/C11,C20; bổ sung S11/C28 do người dùng chuyển tiếp phê duyệt khách hàng, ghi nhận 05/10/2026. **Liên quan:** FR-01–02, A13.

### A02 — Mặt hàng, tin đăng và combo · Đã chốt · P0

- **Đã chốt:** mỗi người bán có kho cá nhân; một bản ghi tương ứng một đồ vật thực tế. Tin tham chiếu một hoặc nhiều đồ vật; combo bán nguyên bộ. Không cần danh mục sản phẩm chuẩn dùng chung, vẫn có danh mục phân loại.
- Một đồ vật được xuất hiện trong nhiều tin. Khi giữ/bán qua một tin, hệ thống tự chặn đặt các tin cùng đồ vật; không cần người bán tự cập nhật những liên kết hệ thống đã biết. Chỉ tin có giao dịch thật được ghi hoàn tất. Ví dụ bán riêng bàn làm combo bàn + ghế không còn đủ hàng; ghế chưa bán.
- Mỗi tin một giữ chỗ có hiệu lực, mỗi đồ vật một giữ chỗ có hiệu lực trên toàn bộ tin liên quan. Hệ thống không tự nhận biết hai bản ghi do người bán tạo trùng là cùng vật ngoài đời.
- **Xác nhận:** S5/C12, ghi nhận 28/09/2026; S11/C29,C40 xác nhận lại, ghi nhận 05/10/2026. **Liên quan:** FR-04,08,18; A19; [mô hình nghiệp vụ](../uml/marketplace-lifecycle.md).

### A03 — Hạn mức tin đăng · Đã chốt · P0

- **Đã chốt:** <120 điểm tối đa 5; ≥120 tối đa 10. Tính tin đang mở và đang giữ chỗ; không tính nháp/chờ duyệt/ẩn/hết hạn/hoàn tất. Tụt điểm giữ tin hiện có dù vượt mức nhưng chặn công khai thêm đến khi còn chỗ.
- Kiểm tra khi duyệt, mở lại, khôi phục và khi nhiều thao tác đồng thời. Giữ tin do tụt hạn mức không ngăn ẩn tin vi phạm hoặc áp dụng hạn chế tài khoản. Việc phân loại tin không đủ hàng do liên kết kho thuộc mô hình trạng thái cần hoàn thiện tại A14.
- **Xác nhận:** S5/C13, ghi nhận 28/09/2026; S11/C30 xác nhận lại, ghi nhận 05/10/2026. **Liên quan:** FR-05, A14.

### A04 — Thương lượng có giữ hàng không? · Đã chốt · P0

- **Đã chốt:** thêm giỏ → gửi yêu cầu đặt hàng → người bán chấp nhận → giữ hàng. Nhắn tin/chấp nhận giá chưa giữ. Lưu giá đã đồng ý khi chấp nhận giữ chỗ; giao diện dùng “Đặt hàng”, không ngụ ý app đã xác minh thanh toán ngoài hệ thống.
- **Xác nhận:** S5/C14, ghi nhận 28/09/2026; S11/C31 xác nhận lại, ghi nhận 05/10/2026. **Liên quan:** FR-07–08.

### A05 — Hủy và nhắc giữ chỗ · Chốt một phần · P0

- **Đã chốt:** không có hạn mức giữ chỗ chung của người mua; không tự hủy sau 24 giờ. Người bán chỉ có thể giữ tối đa một người mua/tin, còn bị ràng buộc bởi đồ vật dùng chung. Không cần người mua đăng tin mới được giữ hàng. S6/C24 bổ sung hạn mức riêng cho số lần nhận cho tặng theo tuần tại FR-19/A20; chưa quyết định áp dụng ở bước giữ chỗ, không tự khôi phục giới hạn 3 món.
- Trước khi báo giao, hai bên được hủy, lưu người hủy/lý do và thông báo. Hủy có phản ánh được báo cáo để admin xét bằng chứng; **không dùng mốc 2 giờ hoặc tự phạt hủy sát giờ**. Không đến hẹn cũng được báo cáo, không tự áp dụng −20.
- Sau khi báo giao, yêu cầu hủy cần xác nhận hai bên hoặc admin giải quyết; mã hủy tách khỏi mã hoàn tất. Hàng chỉ giải phóng sau quyết định hủy; tin mở lại phải còn đủ điều kiện công khai.
- **Đã chốt S11/C32:** nhắc cả hai bên một lần sau 24 giờ từ lúc chấp nhận, không nhắc lặp hoặc tự hủy. Mốc này độc lập với +24 giờ từ ảnh/báo giao để chuyển admin tại A06. Không gửi nhắc cho giữ chỗ đã kết thúc; kênh và cách xử lý khi đã chuyển bước giao nhận cần đặc tả thêm.
- **Còn mở:** chi tiết chuyển phát/tác vụ nhắc, hợp đồng mã hủy sau giao tại A06 và mức phạt A08. M3/M5 review chống gửi lặp khi tác vụ chạy lại; chưa có scheduler thực thi.
- **Xác nhận:** S5/C15,C23; bổ sung S11/C32,C33, ghi nhận 05/10/2026. **Liên quan:** FR-08,11; A06/A14.

### A06 — Không xác nhận nhận hàng và mã xác nhận · Chốt một phần · P0

- **Đã chốt:** người bán gửi ảnh bàn giao và báo đã giao; người mua dùng mã 6 số trong ứng dụng xác nhận hoàn tất. Mã 10 phút, tối đa 5 lần sai, dùng một lần, cấp lại vô hiệu mã cũ; phải giới hạn tần suất cấp/thử. Mã hết hạn không hủy giữ chỗ.
- **Làm rõ giới hạn hiện hành:** khi hết hạn hoặc đã sai 5 lần, không chấp nhận mã đó nữa; “quá 5 lần” không có nghĩa cho phép thử sai lần thứ 6. Không có quyết định khóa giao dịch/tài khoản chỉ vì mã không còn dùng được. Giao dịch vẫn chờ xác nhận hoặc admin theo mốc 24 giờ đã chốt; hàng không tự giải phóng.
- **Đã chốt bổ sung S8/C25:** hết 10 phút hoặc ngay sau lần sai thứ 5 thì vô hiệu hóa mã cũ, không tự sinh mã. Người mua của giao dịch có thể yêu cầu **hệ thống** cấp lại và gửi mã mới tới ứng dụng của mình; người bán không phải bên yêu cầu cấp lại hoặc dùng mã hoàn tất thay người mua. Mã mới có hạn 10 phút từ lúc cấp, bộ đếm sai riêng bắt đầu từ 0; mã cũ không thể dùng lại. Cấp lại không đổi mốc chuyển admin sau 24 giờ và chịu các giới hạn đã chốt S9/C26 bên dưới. Xác nhận này thay phương án người bán yêu cầu cấp lại tại S7.
- **Đã chốt S9/C26:** các giới hạn tính theo cặp người mua + giao dịch, dùng cửa sổ 15 phút liên tiếp theo thời điểm hành động; không đặt lại khi đổi thiết bị, đăng nhập lại hoặc cấp mã mới. Bộ đếm sai riêng của mã và bộ đếm sai chung là hai bộ đếm khác nhau. 10 lần sai không có nghĩa đã cấp 10 mã; thời gian chờ không tính từ lúc mã hết hạn.
- **Phụ thuộc kỹ thuật:** M4 cùng M3/M1 cần triển khai kiểm tra mã và giới hạn nguyên tử theo cùng người mua + giao dịch để yêu cầu đồng thời không vượt số lần cấp/thử. Bảng `completion_challenges` có thời hạn, bộ đếm sai từng mã và dấu vô hiệu/đã dùng, nhưng chưa có dịch vụ kiểm tra hoặc dữ liệu thời điểm từng lần sai để tính cửa sổ trượt. Cần thiết kế lưu sự kiện/bộ đếm phù hợp, không suy ra tổng lần sai trong 15 phút chỉ từ tổng `failed_attempts` của các mã. Kiểm tra hiệu lực phải đúng ngay cả khi tác vụ nền chưa ghi dấu vô hiệu; cấp lại không làm hai mã đồng thời có hiệu lực. Schema/DTO hiện có không chứng minh giới hạn đã được thực thi.
- Sau 24 giờ từ khi gửi đủ ảnh và báo giao, chưa xác nhận thì chuyển admin; cấp lại mã không đổi mốc. Admin được xác nhận hoàn tất theo bằng chứng dù người mua im lặng, yêu cầu bổ sung hoặc giải quyết hủy/tranh chấp. Không tự hoàn tất hoặc mở lại hàng chỉ vì hết giờ.
- **Đã chốt về hủy:** trước báo giao được hủy trực tiếp; sau báo giao phải có xác nhận hai bên hoặc quyết định admin. Mã hủy xác nhận một hành động riêng, không dùng chéo với mã hoàn tất và không chứng minh hoàn tiền/trả hàng.
- **Đã chốt S11/C33:** bên còn lại nhập mã hủy riêng để đồng ý yêu cầu hủy sau giao; admin phản hồi trong 3 ngày làm việc. Ảnh bàn giao không bắt buộc lộ mặt, chỉ người có quyền được xem. Cấp lại mã hoàn tất cách nhau 60 giây, tối đa 3 lần/15 phút đã có tại S9/C26; S11 không bỏ giới hạn tổng 10 lần sai/15 phút.
- **Còn mở:** ai được khởi tạo hủy sau giao ngoài người mua đã có tại FR-08, cách cấp/chuyển mã hủy, độ dài/thời hạn/số lần sai/giới hạn tần suất của mã hủy; mốc bắt đầu và lịch tính 3 ngày làm việc, quy trình quá hạn và thời hạn giải quyết cuối cùng; tiêu chuẩn ảnh, ma trận người xem và lưu/xóa. Hạn phản hồi không phải tự giải quyết xong; OTP không chứng minh đã trả hàng/hoàn tiền. Giới hạn mã hoàn tất không tự áp dụng cho OTP đăng ký hoặc mã hủy. M4/M3/M5 cùng M1 review hợp đồng mới; chưa có API/DTO/schema mã hủy.
- **Xác nhận:** S5/C15,C16; S8/C25; S9/C26; bổ sung S11/C33, ghi nhận 05/10/2026. **Liên quan:** FR-09, A08/A12.

Trạng thái mã theo **quy tắc đã chốt S8/C25 và S9/C26** (nhãn nghiệp vụ để phân tích, chưa phải enum API/schema):

| Trạng thái | Điều kiện | Có được dùng để hoàn tất? |
| --- | --- | --- |
| Có hiệu lực | Chưa đủ 10 phút, chưa sai 5 lần, chưa dùng hoặc bị thay thế | Có, chỉ người mua của giao dịch, mã phải đúng và không đang bị chặn bởi giới hạn 10 lần sai/15 phút |
| Hết hạn — vô hiệu | Đã đủ 10 phút kể từ lúc cấp | Không; không tự sinh mã mới |
| Vô hiệu do nhập sai | Đã nhập sai 5 lần | Không; chặn lần dùng tiếp kể cả nhập đúng |
| Vô hiệu do cấp lại | Mã mới được hệ thống cấp theo yêu cầu hợp lệ | Không; mã cũ không có hiệu lực trở lại |
| Đã sử dụng | Đã dùng để hoàn tất thành công | Không; gửi lại không hoàn tất hoặc tính điểm thêm |

Nguồn bổ sung: S8/C25, người dùng xác nhận 05/10/2026; S7 giữ làm lịch sử phương án đã được thay thế. Không áp dụng bảng này cho OTP đăng ký hoặc mã hủy khi chưa có quyết định riêng.

**Luồng cấp và kiểm tra mã đã chốt S9/C26:**

1. Sau khi người bán gửi đủ ảnh bàn giao và báo đã giao, hệ thống cấp mã 6 chữ số cho người mua; mã có hạn 10 phút và dùng một lần. Lần cấp đầu tiên cũng được tính vào hạn mức cấp.
2. Người mua nhập mã: mã hợp lệ và đúng thì hoàn tất một lần; mã sai thì tăng bộ đếm sai riêng và bộ đếm sai chung. Hết 10 phút hoặc sai lần thứ 5 thì vô hiệu mã cũ, không tự sinh mã mới.
3. Người mua yêu cầu cấp lại; hệ thống kiểm tra khoảng chờ, số lần cấp và tổng lần sai trước khi cấp. Mã mới có hạn 10 phút và bộ đếm riêng từ 0, nhưng không xóa bộ đếm sai chung.
4. Đủ 3 lần cấp trong 15 phút thì tạm chặn cấp thêm, không làm mã hiện tại mất hiệu lực. Đủ 10 lần sai trong 15 phút thì tạm chặn cả cấp và kiểm tra mã của giao dịch đó. Yêu cầu bị chặn không được coi là lần cấp thành công hoặc lần kiểm tra sai mới.
5. Khi có yêu cầu mới, tính lại cửa sổ: các lượt đã đủ 15 phút ra khỏi bộ đếm; nếu mọi điều kiện đều đạt thì người mua được tiếp tục thao tác. Bộ đếm giảm dần, không đặt toàn bộ về 0 hoặc chờ cố định 15 phút từ lúc bị chặn. Không tự cấp mã khi thời gian chờ kết thúc.

| Nội dung | Giới hạn đã chốt | Cách tính |
| --- | --- | --- |
| Hiệu lực từng mã | 10 phút | Từ thời điểm cấp thành công; đủ 10 phút thì hết hiệu lực |
| Nhập sai trên từng mã | Tối đa 5 lần | Sai lần thứ 5 thì vô hiệu mã, chặn mọi lần dùng tiếp |
| Khoảng cách giữa hai lần cấp | Ít nhất 60 giây | Từ lần cấp thành công gần nhất; đủ 60 giây thì đạt điều kiện này |
| Tổng số lần cấp | Tối đa 3 lần trong 15 phút | Gồm lần đầu và cấp lại; đếm các lần cấp thành công trong 15 phút gần nhất |
| Tổng số lần nhập sai | Tối đa 10 lần trong 15 phút | Cộng qua tất cả các mã của cùng người mua + giao dịch; đếm theo thời điểm nhập sai, không theo lúc mã hết hạn |

Tại thời điểm kiểm tra `t`, cửa sổ là `(t − 15 phút, t]`: lượt đã đủ 15 phút không còn được tính. Ví dụ lần sai đầu lúc 08:01, đủ 10 lần sai lúc 08:05: bị chặn từ 08:05; lúc 08:16, lần sai 08:01 ra khỏi cửa sổ. Khi tổng còn dưới 10 và các điều kiện khác đạt, người mua có thể yêu cầu mã/thử lại; không được mặc định có lại 10 lượt mới.

Các giới hạn chỉ tạm chặn thao tác mã; không hủy giao dịch, không giải phóng hàng, không khóa tài khoản và không đổi mốc 24 giờ chuyển admin. **Nguồn:** S9/C26, người dùng đồng ý ngày 05/10/2026.

### A07 — Điểm đánh giá và khôi phục · Chốt một phần · P0

- **Đã chốt:** chỉ người mua đánh giá người bán sau hoàn tất, một đánh giá/giao dịch, trong 15 ngày. 5/4/3/2/1 sao lần lượt +2/0/−1/−3/−5; 1–3 sao cần admin xét lý do/bằng chứng trước khi trừ. Không đủ căn cứ thì không trừ.
- Hết 15 ngày không gửi đánh giá thì người bán +1 một lần và đóng quyền đánh giá; không tạo sao giả. Đánh giá chờ xét/bị bác không thuộc “không đánh giá”, không nhận +1. Không cộng cả điểm đánh giá và +1 cho cùng giao dịch.
- Gỡ đánh giá sai thì đảo đúng tác động điểm của đánh giá đó; xem lại hạn chế do tác động sai gây ra, giữ căn cứ xử phạt độc lập còn hiệu lực. Không tính lại điểm mỗi lần gửi lại yêu cầu.
- **Đã chốt S11/C34:** được sửa trong hạn 15 ngày tính từ hoàn tất khi chưa có quyết định duyệt; bản sửa phải xét lại, không tạo thêm đánh giá/giao dịch. Chỉ công khai đánh giá được chấp nhận; bản chờ xét/bị bác không công khai. Khiếu nại qua ứng dụng trong 7 ngày.
- **Còn mở:** mốc bắt đầu tính 7 ngày và các bên có quyền khiếu nại; “quyết định duyệt” áp dụng thế nào với đánh giá 4–5 sao và bản bị bác, quy tắc điểm/hiển thị trong khi sửa và phiên bản được khiếu nại; thời hạn admin phản hồi khiếu nại có thuộc phạm vi 3 ngày làm việc của A06 không. Không tự mở thêm một cửa sổ 15 ngày khi sửa. M4/M5/M1 thiết kế lịch sử phiên bản/điểm; endpoint sửa và khiếu nại chưa có.
- **Xác nhận:** S5/C17,C18; bổ sung S11/C34, ghi nhận 05/10/2026. **Liên quan:** FR-10,12.

### A08 — Xử lý vi phạm, tái phạm và khiếu nại · Chốt một phần · P0

- **Đã chốt:** cùng sự việc có thể bị trừ riêng do đánh giá đã duyệt và do báo cáo vi phạm đã xác minh. Báo cáo trùng cùng hành vi không nhân khoản phạt; hai tác động điểm không biến thành hai lần tái phạm. Mỗi khoản có căn cứ, lịch sử và hoàn riêng khi quyết định tương ứng bị đảo.
- Hủy có phản ánh/không đến hẹn được admin xét qua báo cáo. **Mức −20 cũ không còn áp dụng.** Bảng phạt điểm cho các hành vi tạm chưa quyết định; không lấy số minh họa hoặc số từ nền tảng khác làm mức phạt. Điểm đánh giá FR-10 và ngưỡng khóa FR-12 đã chốt vẫn giữ.
- Tạm thời không có hình phạt tăng nặng riêng vì tái phạm; A09 vẫn cho xét tái khóa sau vi phạm mới. Hành vi khác/đặc biệt nghiêm trọng chuyển admin/đội quản lý xem xét, không cho kiểm duyệt viên tùy ý chọn điểm phạt.
- **Đã chốt S11/C35:** duyệt riêng bảng hành vi–mức phạt; kiểm duyệt viên xác minh/đề nghị, quản trị viên cấp cao quyết định khóa vĩnh viễn/ngoại lệ; người khác xét khiếu nại khi có thể. Nếu không thể tách người xét, cần ghi nhận tình huống, không giả định tự động đủ tính độc lập.
- **Còn mở:** bảng hành vi/mức phạt cụ thể, khung ngoại lệ, quyền quyết định phạt thường/khóa tạm, định nghĩa lý do chính đáng/gian lận và tiêu chí bằng chứng; thủ tục khiếu nại xử phạt. Hạn 7 ngày/kênh ứng dụng tại C34 gắn với đánh giá, chưa tự mở rộng cho mọi quyết định khóa. Phân biệt xác minh báo cáo với quyết định điểm phạt chưa có quy tắc.
- **Đề xuất chưa duyệt:** các nhóm hành vi và nguồn tham khảo tại [ghi chú xử phạt](moderation-policy-notes.md); chưa có bảng mức phạt được duyệt.
- **Xác nhận:** S5/C18,C23; bổ sung S11/C35, ghi nhận 05/10/2026. **Liên quan:** FR-10–12.

### A09 — Sau 14 ngày và nghĩa vụ khi bị khóa · Chốt một phần · P0

- **Đã chốt:** 30 < điểm ≤50 khóa 14 ngày, ≤30 khóa vĩnh viễn có khiếu nại. Hết khóa tạm mở và giữ điểm; không khóa lại theo điểm cũ. Vi phạm mới đã xác minh được xét theo cùng ngưỡng (bao gồm đúng 50); khóa vĩnh viễn còn hiệu lực luôn ưu tiên.
- Khóa tạm được thao tác trên giao dịch đã giữ trước khi khóa theo FR-12; chặn đăng/giữ chỗ mới. Không áp dụng phạt tăng nặng riêng vì tái phạm, nhưng vẫn có thể tái khóa theo ngưỡng.
- **Đã chốt S11/C36:** khóa vĩnh viễn vẫn được xem lịch sử/khiếu nại; admin hỗ trợ giao dịch dở. Cùng sự việc xét khóa một lần. Vi phạm mới trong đợt khóa dùng mốc kết thúc muộn hơn giữa đợt hiện có và đợt mới; không cộng nối các khoảng khóa, khóa vĩnh viễn còn hiệu lực luôn ưu tiên.
- **Còn mở:** quyền hỗ trợ/hoàn tất/hủy cụ thể của admin đối với từng giao dịch, quyền truy cập khác của tài khoản khóa vĩnh viễn, cách xác định cùng sự việc và phối hợp hai tác động điểm trước một quyết định khóa. M1/M5 review lịch sử sự việc/quyết định và kiểm tra đồng thời; chưa có bảng/dịch vụ hạn chế thực thi.
- **Xác nhận:** S5/C19; bổ sung S11/C36, ghi nhận 05/10/2026. **Liên quan:** FR-08–12, A08.

### A10 — Tin cũ và gia hạn · Chốt một phần · P1

- **Đã chốt S10/C27:** đóng tin sau 30 ngày nếu chưa gia hạn; nhắc gia hạn trước hạn 7 ngày, tức ngày thứ 23 của chu kỳ ban đầu. Không tiếp tục áp dụng đề xuất cũ hỏi sau 30 ngày rồi đợi thêm 3 ngày. Không tự suy ra tương tác mới làm đặt lại thời hạn.
- **Còn mở:** mốc bắt đầu tính 30 ngày (tạo tin, duyệt hay công khai); thời lượng mỗi lần gia hạn và tính từ hạn cũ hay lúc xác nhận; thời gian/điều kiện được gia hạn, gia hạn sau khi đóng, hạn mức công khai và kiểm duyệt khi mở lại; múi giờ/mốc biên; kênh và số lần nhắc; trạng thái đóng/lưu trữ, quyền xem lịch sử; áp dụng cho tin đang giữ chỗ/chờ xác nhận/tranh chấp và vai trò của điều kiện “không có người mua hoặc không có tương tác” trong S1. Con số gia hạn 15 ngày cũ chưa được S10 xác nhận lại.
- **Khuyến nghị chưa duyệt:** tính chu kỳ đầu từ lúc công khai được duyệt, gửi một nhắc ở hạn trừ 7 ngày; thiết kế tác vụ có chống gửi/đóng lặp. Tạm loại tin đang có giao dịch khỏi đóng tự động cho đến khi chốt cách xử lý, giữ nguyên giữ chỗ và lịch sử. Đây là phương án để M2/M5 review, không phải ngoại lệ đã được khách hàng duyệt.
- **Phụ thuộc triển khai:** API/DTO/schema hiện chưa có hợp đồng gia hạn, thời hạn tin hoặc tác vụ nhắc/đóng; không suy ra `created_at` chính là mốc được duyệt. M2 chủ trì, M5 phối hợp tác vụ/thông báo, M3/M4 review ranh giới giao dịch và M1 review dữ liệu dùng chung. Có thể phân tích và thiết kế theo hai mốc đã chốt; việc bật tác vụ phải đợi các chi tiết liên quan được quyết định.
- **Xác nhận:** người dùng, S10/C27, ghi nhận 05/10/2026. **Chốt phần còn mở bởi:** phụ trách tin đăng/tác vụ nền + trưởng nhóm/khách hàng. **Liên quan:** FR-13, A14.

### A11 — Tâm bán kính và khu vực · Chưa chốt · P1

- **Khuyến nghị:** người tìm chọn tâm là vị trí hiện tại hoặc điểm trên bản đồ; ranh giới bán kính được tính bao gồm điểm đúng bằng bán kính. Phân loại khoảng cách tới cổng trường là thông tin riêng. Cho lọc khu vực khi không cấp GPS; không bắt buộc công khai địa chỉ phòng trọ chính xác.
- **Cần chốt:** tâm mặc định, danh sách trường/cổng/khu vực, độ chính xác vị trí được hiển thị.
- **Chốt bởi:** phụ trách tìm kiếm + khách hàng. **Liên quan:** FR-06.

### A12 — Bằng chứng và đối tượng báo cáo · Chốt một phần · P1

- **Đã rõ:** bằng chứng bắt buộc.
- **Khuyến nghị:** báo cáo có thể nhắm tới tin hoặc tài khoản, liên hệ giao dịch là tùy trường hợp; báo cáo tin cấm chưa có người mua không bắt buộc có giao dịch. Phiên bản đầu hỗ trợ ảnh và tham chiếu tin nhắn trong hệ thống; đề nghị tối đa 5 ảnh, 5 MB/ảnh, chưa đưa video vào phiên bản đầu nếu khách hàng đồng ý. Không yêu cầu ảnh có GPS. Báo cáo không đến hẹn cần bằng chứng lịch hẹn/trao đổi.
- **Đã chốt S11/C33:** ảnh bàn giao không bắt buộc lộ mặt; bằng chứng chỉ người có quyền được xem, không công khai qua URL tĩnh hoặc suy ra có quyền từ việc biết mã ảnh.
- **Cần chốt:** định dạng/dung lượng, video, ma trận người xem theo loại bằng chứng/hồ sơ/giao dịch, che dữ liệu riêng tư và thời gian lưu/xóa. S11/C35 không cung cấp tiêu chí chấp nhận bằng chứng cụ thể.
- **Chốt bởi:** phụ trách kiểm duyệt + khách hàng. **Liên quan:** FR-11.

### A13 — Cổng xác thực và cập nhật hằng năm · Chốt một phần · P0

- **Đã chốt:** tốt nghiệp vẫn dùng ứng dụng; giữ nhắc cập nhật hằng năm. Phương pháp hiện tại là OTP email và admin duyệt thẻ sinh viên, không giả định có API trường.
- **Đã chốt S11/C28,C37:** admin xét giấy tờ thay thế từ nguồn được công nhận cho người thiếu email/thẻ hoặc người tốt nghiệp thiếu giấy tờ; mỗi người một tài khoản. Hồ sơ chưa cập nhật sau nhắc hằng năm thì nhắc lại sau 7 ngày và đánh dấu “Cần cập nhật”, không tự khóa.
- **Còn mở:** danh mục giấy tờ/nguồn được công nhận, đường xác minh khi mất email, mốc chu kỳ hằng năm, bước gắn/xóa trạng thái “Cần cập nhật” và xử lý định danh trùng. Không tự chọn API trường hoặc tự loại nhóm chưa có cách xác minh. M1/M5 review hợp đồng hồ sơ và tác vụ; DTO hiện chưa có trạng thái cập nhật này.
- **Xác nhận:** S5/C11,C20; bổ sung S11/C28,C37, ghi nhận 05/10/2026. **Liên quan:** FR-01–02, A01.

### A14 — Sửa, ẩn và mở lại tin · Chốt một phần · P0

- **Đã chốt:** người bán được sửa nội dung/rút tin khi **chính tin đó chưa được giữ chỗ**; mọi bản sửa nội dung phải được kiểm duyệt trước khi công khai. Không cấm sửa/rút tin B chỉ vì đồ vật của B đang được giữ qua tin A.
- Quyền sửa tin B không tạo quyền thay đổi điều kiện giao dịch A hoặc làm đồ vật đang giữ thành còn hàng. Lưu bản nội dung, tập đồ vật và giá đã thỏa thuận cho A; sửa tin và sửa dữ liệu kho dùng chung là các thao tác khác nhau. Giữ độc quyền đồ vật theo A02/A19.
- Khi hủy giữ chỗ, không tự công khai tin bị gỡ do kiểm duyệt/hạn chế tài khoản; mở lại phải kiểm tra duyệt, quyền và hạn mức. Rút tin không xóa lịch sử giao dịch.
- **Đã chốt S11/C38:** tạm ẩn khi gửi bản sửa để duyệt; tin thiếu hàng tạm thời vẫn tính hạn mức nếu còn công khai; thiếu hàng do đã bán thì lưu trữ. Không sửa dữ liệu kho đang giữ/đã bán. Admin gỡ chính tin đang giữ phải xem xét giao dịch riêng, không tự hủy hoặc giải phóng hàng. Không biến lưu trữ tin liên quan thành giao dịch hoàn tất giả.
- **Còn mở:** bước ẩn chính xác khi gửi bản sửa (khác tạo nháp sửa), cách xem bản cũ của chủ tin/bên giao dịch, lý do từ chối và xử lý sau bản sửa bị bác; bảo toàn lịch sử và cách lưu trữ tin đã có giao dịch thật; quy trình quyết định giao dịch khi admin gỡ tin đang giữ, ranh giới với hết hạn FR-13/A10. Không suy ra quyền sửa/rút tin đã hoàn tất từ điều kiện “chưa được giữ”. M2/M3/M4/M5 cùng M1 review cập nhật công khai và độc quyền kho trong cùng giao dịch dữ liệu.
- **Xác nhận:** S5/C21; bổ sung S11/C38, ghi nhận 05/10/2026. **Liên quan:** FR-04–05,08,13.

### A15 — Định nghĩa báo cáo và học kỳ · Chưa chốt · P1

- **Khuyến nghị:** cấu hình ngày bắt đầu/kết thúc từng học kỳ; dùng múi giờ Việt Nam cho kỳ báo cáo, lưu thời điểm thống nhất ở tầng kỹ thuật. Phân biệt mã môn theo trường để tránh gộp các môn khác nhau; chỉ gộp khi có ánh xạ được duyệt. Ghi nhãn rõ “số giao dịch hoàn tất”, không gọi là số món nếu chưa biết số lượng trong combo.
- **Cần chốt:** đếm lượt tìm kiếm hay người tìm; loại dữ liệu thử; thời điểm tính giao dịch; khu vực tại thời điểm giao dịch hay hiện tại; ngưỡng báo cáo uy tín thấp <50 hay ≤50. Đề nghị lưu thông tin lịch sử phục vụ báo cáo thay vì để chỉnh hồ sơ làm đổi báo cáo cũ.
- **Chốt bởi:** phụ trách báo cáo + khách hàng. **Liên quan:** FR-15–18.

### A16 — Sự kiện thanh lý · ĐÃ ĐÓNG

Khách hàng đồng ý bỏ tại S2 câu 5. Không cần chốt cơ chế chiến dịch hoặc ưu tiên trang chủ. Muốn đưa trở lại phải tạo yêu cầu thay đổi mới; combo thông thường không bị loại theo quyết định này.

### A17 — Đổi đồ và điều kiện nhận tặng · Chốt một phần · P0

- **Đã chốt:** người nhận tặng tự quyết định nhận và chịu trách nhiệm về quyết định giao dịch; ứng dụng quản lý như giao dịch giá 0, không xét hoàn cảnh. Quyền báo cáo/khiếu nại và nghĩa vụ mô tả trung thực vẫn giữ.
- **Bổ sung S6/C24:** khách hàng giữ nguyên không xét hoàn cảnh và yêu cầu hạn mức nhận đồ cho tặng theo tuần để hạn chế thu gom đồ 0 đồng đem bán lại. Chi tiết tại FR-19/A20; không suy ra một mức giới hạn, lệnh cấm bán lại hoặc hình phạt chưa được xác nhận.
- **Đã chốt S11/C39 về phạm vi:** hoãn đổi vật lấy vật sang bản mở rộng, không đưa vào bản hiện tại. Không còn để mở câu hỏi có triển khai đổi đồ trong bản hiện tại hay không.
- **Nguyên tắc có điều kiện đã được chấp thuận cho bản mở rộng:** nếu triển khai thì giữ đồng thời đồ vật của hai bên và chỉ hoàn tất khi đủ hai xác nhận hoặc admin quyết định. Không dùng hai giao dịch cho tặng độc lập. Việc phê duyệt nguyên tắc này không duyệt toàn bộ chi tiết tại [phương án đổi đồ](barter-proposal.md), không tạo endpoint/schema hoặc FR triển khai cho bản hiện tại.
- **Còn mở cho bản mở rộng:** thời điểm đưa vào kế hoạch, chi tiết giữ/hủy/giao nhận, giới hạn mã và tác động điểm/báo cáo. **Cho tặng:** hạn mức FR-19/A20 vẫn còn mở về thông số.
- **Xác nhận:** phần cho tặng S5/C22; hạn mức S6/C24; hoãn đổi đồ/nguyên tắc mở rộng S11/C39, ghi nhận 05/10/2026. **Liên quan:** FR-04,08–12,18.

### A18 — Tiêu chí bàn giao và chất lượng · Chốt một phần · P2

- **Đã rõ:** khoảng hai tháng; có ứng dụng và OOAD; trưởng nhóm cho phép lựa chọn công nghệ, đã ghi ADR.
- **Cần chốt:** ngày nộp, mẫu biểu/rubric, bộ sơ đồ bắt buộc, dữ liệu demo, môi trường chạy, mục tiêu tải/đáp ứng và yêu cầu sao lưu.
- **Khuyến nghị:** chốt checklist nghiệm thu cùng giảng viên ngay tuần đầu; mỗi FR hiện hành có use case/tiêu chí chấp nhận và kiểm thử phù hợp. Ưu tiên luồng đăng ký → duyệt tin → giữ chỗ → giao nhận → đánh giá, sau đó kiểm duyệt/tranh chấp và báo cáo. Không tự cam kết SLA 24/7 chỉ vì nguồn có mong muốn này.
- **Chốt bởi:** trưởng nhóm + giảng viên/khách hàng.

### A19 — Số lượng và bán tách · Đã chốt · P0

- **Đã chốt:** một bản ghi kho cho một đồ vật thực tế; tin bán một đồ vật hoặc combo nguyên bộ, tối đa một giao dịch hoàn tất. Không có đặt mua một phần số lượng của một bản ghi kho hoặc tách một phần combo trong cùng giao dịch.
- Có thể đăng lẻ các đồ vật đồng thời với combo bằng liên kết chung theo A02. Chấp nhận combo phải giữ được toàn bộ đồ vật hoặc thất bại toàn bộ; không giữ dở một phần. Khi một vật đã bán ở tin lẻ, combo không tự ghi hoàn tất.
- **Xác nhận:** S5/C12, ghi nhận 28/09/2026; S11/C29,C40 xác nhận lại, ghi nhận 05/10/2026. **Liên quan:** FR-04,08,18; A02/A15.

### A20 — Hạn mức nhận cho tặng và chống thu gom · Chốt một phần · P0

- **Đã được khách hàng yêu cầu:** giữ không xét hoàn cảnh; giới hạn số lần nhận đồ cho tặng theo tuần nhằm hạn chế tài khoản thu gom hàng loạt đồ 0 đồng đem bán lại. Đây là hạn mức nhận cho tặng, không phải hạn mức giữ chỗ chung hoặc hạn mức tin của người bán.
- **Còn mở:** mức tối đa; tuần lịch hay 7 ngày liên tiếp, mốc bắt đầu và múi giờ; đơn vị giao dịch/đồ vật và combo; trạng thái/thời điểm ghi nhận; hủy/tranh chấp có hoàn lại lượt không; giao dịch qua ranh giới tuần; bước kiểm tra và hành vi khi hết hạn mức; ngoại lệ/thẩm quyền. Cách kiểm soát nhận qua nhiều tài khoản, tiêu chí xác minh đầu cơ và chế tài bổ sung chưa được nhận xét này phê duyệt.
- **Tác động:** luồng yêu cầu, chấp nhận và hoàn tất cho tặng cần được rà soát sau khi chốt cách tính. Nếu chỉ đếm khi hoàn tất thì nhiều giữ chỗ cho tặng đang chờ có thể dẫn đến vượt hạn mức; nếu tính trước thì phải xác định cách giải phóng lượt khi hủy. Chưa chọn phương án nào làm yêu cầu hiện hành. Chỉ tiêu thống kê tại A15/FR-18 không tự quyết định đơn vị hạn mức.
- **Có thể tiếp tục:** ghi nhận yêu cầu, phân tích các phương án và phát triển phần mua bán/độc quyền đồ vật đã đủ quyết định. **Phải chờ:** cố định cách đếm, thuật toán kiểm tra và tiêu chí chấp nhận hạn mức cho tặng. Không tự áp số lần minh họa, khóa/phạt hoặc hủy các giao dịch đang giữ để lấp khoảng trống chính sách.
- **Phối hợp:** M3 giữ chỗ + M4 giao nhận chủ trì phân tích; M1 rà soát tài khoản/kiểm soát đồng thời, M5 rà soát báo cáo và ranh giới xử lý. Trưởng nhóm tổng hợp, khách hàng xác nhận thông số và chính sách; đây là phân công theo vai trò, chưa gán cá nhân mới.
- **Nguồn:** S6/C24, ghi nhận 05/10/2026; chưa có ngày nhận xét gốc hoặc danh tính người nhận xét. **Liên quan:** FR-19; FR-08–09,11–12,18; A05/A08/A15/A17/A19.

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
| 1.2 | 05/10/2026 | Ghi nhận xét khách hàng S6/C24; thêm FR-19/A20 về hạn mức nhận đồ cho tặng theo tuần để hạn chế thu gom. Giữ không xét hoàn cảnh và không có hạn mức giữ chỗ chung; số lần, kỳ tính, đơn vị đếm và cơ chế áp dụng còn mở. Bổ sung cảnh báo phụ thuộc vào hợp đồng API và mô hình phân tích; chưa triển khai hạn mức. |
| 1.3 | 05/10/2026 | Ghi nhận GL-10/S7; làm rõ không chấp nhận mã hết hạn hoặc sai đủ 5 lần, không suy ra khóa giao dịch. Ghi riêng đề xuất vô hiệu hóa, không tự sinh mã và người bán yêu cầu hệ thống gửi mã mới cho người mua; quyền cấp lại và phương án trạng thái chưa được xác nhận. Đánh dấu khác biệt với API dự kiến; chưa thay quyền hoặc triển khai. |
| 1.4 | 05/10/2026 | Ghi S8/C25: chốt vô hiệu mã hết 10 phút hoặc sai đủ 5 lần, người mua yêu cầu cấp mã mới và không tự sinh mã. Thay phương án người bán cấp lại của S7; cập nhật FR-09/A06, API và mô hình mã. Giữ mở thông số tần suất cấp/thử; chưa triển khai backend. |
| 1.5 | 05/10/2026 | Ghi S9/C26: chốt 60 giây giữa hai lần cấp, tối đa 3 lần cấp và 10 lần sai trong cửa sổ 15 phút theo người mua + giao dịch. Bổ sung luồng/bảng giới hạn, phân biệt hai bộ đếm và hai loại tạm chặn; đồng bộ API/schema/UML, giữ mở các chi tiết khác của A06. Chưa triển khai backend. |
| 1.6 | 05/10/2026 | Ghi S10/C27: đóng tin sau 30 ngày nếu chưa gia hạn, nhắc trước hạn 7 ngày; cập nhật FR-13/A10 và thay thời điểm của quy trình cũ hỏi sau 30 ngày/chờ thêm 3 ngày. Giữ mở mốc bắt đầu, chu kỳ gia hạn, xử lý tin có giao dịch và chi tiết nhắc/đóng. Đồng bộ tài liệu bàn giao/UML/kế hoạch; chưa triển khai backend. |
| 1.7 | 05/10/2026 | Đối chiếu 13 đề xuất được khách hàng chấp thuận do người dùng chuyển tiếp; ghi S11/C28–C40. Xác nhận lại kho/combo/hạn mức/thời điểm giữ; bổ sung OTP đăng ký, nhắc giữ chỗ, mã hủy, phản hồi admin, bảo vệ ảnh, sửa/khiếu nại đánh giá, thẩm quyền và khóa chồng, cập nhật hồ sơ, trạng thái tin. Chốt hoãn đổi đồ sang bản mở rộng. Giữ riêng các chi tiết chưa duyệt và bảng mức phạt; đồng bộ tài liệu/hợp đồng phân tích, chưa triển khai backend. |

## 9. Tài liệu liên quan và bàn giao ngữ cảnh

- Đưa tài liệu này cho thành viên/AI khi tiếp tục phân tích nghiệp vụ; đọc thêm [AGENTS.md](../../AGENTS.md) để biết quy tắc làm việc và [README](../../README.md) để biết trạng thái chạy thực tế.
- [ADR công nghệ](../architecture/ADR-001-stack.md) quản lý lựa chọn kỹ thuật; tài liệu này quản lý yêu cầu nghiệp vụ.
- [Kế hoạch phát triển](../planning/development-plan.md), [bảng giao việc](../onboarding/team-kickoff.md) và [mô hình nghiệp vụ](../uml/marketplace-lifecycle.md) đồng bộ v1.1. [Hợp đồng backend khởi tạo](../api/README.md) bổ sung OpenAPI dự kiến, DTO và schema dùng chung; chỉ endpoint nền tảng đang chạy. Các kiểm soát kỹ thuật không phê duyệt nội dung còn mở ở mục 7.
- Bổ sung v1.2/FR-19 được đánh dấu là phụ thuộc A20 trong hợp đồng API và mô hình phân tích. Các kế hoạch/thiết kế nền v1.1 không phải bằng chứng hạn mức nhận cho tặng đã được triển khai; cần M1/M3/M4/M5 review và đồng bộ luồng, dữ liệu, kiểm thử sau khi chốt A20.
- [Ghi chú xử phạt](moderation-policy-notes.md) chứa tham khảo nền tảng và nhóm hành vi đề xuất, không chứa bảng điểm phạt đã duyệt; thẩm quyền tổng quát được bổ sung theo S11/C35. [Phương án đổi đồ](barter-proposal.md) ghi rõ phần nguyên tắc mở rộng có điều kiện đã chấp thuận và phần chi tiết còn đề xuất theo A17/C39.
- [Brief cũ](brief.md) chỉ còn là đường dẫn chuyển tiếp để các liên kết cũ không hỏng.

Ở thời điểm cập nhật v1.7, backend vẫn mới có nền tảng, hợp đồng DTO và schema dùng chung; endpoint nghiệp vụ, OTP đăng ký/ngoại lệ, giới hạn mã, hủy sau giao bằng mã, sửa/khiếu nại đánh giá, quyền khóa, cập nhật hồ sơ, hạn mức nhận cho tặng và tác vụ gia hạn/nhắc/đóng tin chưa được triển khai. Mô hình minh họa không phải schema cuối cùng. Các A chốt một phần/chưa chốt vẫn là phụ thuộc cần xử lý trước chức năng tương ứng; phê duyệt chính sách không đồng nghĩa có dịch vụ thực thi.
