# Đặc tả yêu cầu nghiệp vụ — Sàn trao đổi và thanh lý đồ dùng phòng trọ sinh viên

**Phiên bản:** 1.0 — **Ngày cập nhật:** 26/09/2026 — **Người quản lý:** trưởng nhóm.

Đây là tài liệu nghiệp vụ được duy trì trong suốt quá trình phát triển, thay thế PDF gốc làm nguồn tham chiếu làm việc. PDF vẫn là bằng chứng lịch sử. Tài liệu này không phải thiết kế cơ sở dữ liệu và không khẳng định các chức năng đã được lập trình.

## 1. Nguồn thông tin và cách đọc

| Mã nguồn | Nội dung và giá trị sử dụng |
| --- | --- |
| S1 | PDF `Nhóm 15_HỆ THỐNG SÀN TRAO ĐỔI VÀ THANH LÝ ĐỒ DÙNG PHÒNG TRỌ SINH VIÊN.pdf`, 5 trang. Yêu cầu ban đầu, còn một số mâu thuẫn. |
| S2 | Ảnh trao đổi: câu hỏi của Nguyễn Hữu Nguyên ngày 22/09/2026 và phản hồi của Phan Gia Đạt ngày 23/09/2026, do trưởng nhóm cung cấp là phản hồi khách hàng. Có 8 nội dung được đồng ý; tóm tắt tại mục 6. |
| S3 | Xác nhận tiếp theo của trưởng nhóm trong cuộc trò chuyện: đúng 30 điểm bị khóa vĩnh viễn nhưng được khiếu nại; mở khóa sau 14 ngày; MSSV là duy nhất trong phạm vi ĐHQG-HCM. Được ghi nhận vào phiên bản này ngày 26/09/2026. |
| S4 | Các phương án do trợ lý đề xuất trong trao đổi và tài liệu này. **Chưa được duyệt**, được tập hợp riêng tại mục 7. |

Quy định mới đã xác nhận chỉ thay thế phần tương ứng của quy định cũ. Những yêu cầu khác của S1 được giữ lại; không tự suy ra rằng bỏ một chức năng đồng nghĩa bỏ các chức năng liên quan. Xác nhận của trưởng nhóm được ghi riêng, không gán thành lời của khách hàng.

- **Hiện hành:** yêu cầu từ S1 còn hiệu lực hoặc thay đổi đã xác nhận qua S2/S3.
- **Chưa chốt / chốt một phần:** cần quyết định bổ sung. Giải pháp đề xuất không phải yêu cầu đã được duyệt.
- **Đã loại bỏ:** giữ mã để truy vết nhưng không đưa vào phạm vi triển khai.

Mã FR-01–FR-18 và A01–A19 được giữ từ brief trước. Không đổi mã hoặc tái sử dụng mã đã loại bỏ. Các tài liệu cũ có thể dùng mã nguồn S1/S2/S3 với nghĩa khác; bảng nguồn trên chỉ áp dụng cho tài liệu này.

## 2. Mục tiêu và phạm vi

Giúp cộng đồng sinh viên tìm kiếm, bán, mua và cho tặng giáo trình, đồ gia dụng, nội thất và đồ dùng phòng trọ đã qua sử dụng; trao đổi trực tiếp, hẹn gặp và duy trì uy tín qua giao dịch.

Phạm vi địa lý/người học được mở rộng ra **ĐHQG-HCM**, không giới hạn tại UIT. Sinh viên đã tốt nghiệp tiếp tục sử dụng với trạng thái “Đã tốt nghiệp”. S1 còn nhắc đến học viên cao học, cán bộ và giảng viên; cách xác thực các nhóm này vẫn cần chốt tại A01/A13.

Giao nhận, kiểm tra hàng và thanh toán diễn ra ngoài hệ thống, bằng tiền mặt hoặc chuyển khoản cá nhân. Mã xác nhận trong ứng dụng ghi nhận việc người mua xác nhận giao dịch; không chứng minh ngân hàng đã thanh toán.

**Đã loại bỏ:** chức năng sự kiện “Ngày hội thanh lý dọn trọ”, lịch chiến dịch và ưu tiên trang chủ theo chiến dịch. **Combo thông thường vẫn thuộc mô tả sản phẩm**, vì yêu cầu combo còn xuất hiện độc lập trong S1.

Trưởng nhóm xác nhận sản phẩm bàn giao gồm ứng dụng hoạt động và tài liệu OOAD, thời gian khoảng hai tháng. Mốc nộp chính xác và tiêu chí chấm chưa chốt. Lựa chọn công nghệ nằm trong [ADR-001](../architecture/ADR-001-stack.md), không phải yêu cầu khách hàng trong tài liệu này.

## 3. Thuật ngữ và tác nhân

| Khái niệm | Ý nghĩa |
| --- | --- |
| User_ID | Mã nội bộ riêng để định danh tài khoản, làm khóa chính; không dùng MSSV làm khóa chính. |
| MSSV | Thông tin định danh sinh viên. Theo xác nhận của trưởng nhóm, duy nhất trong ĐHQG-HCM do có thành phần mã trường, khóa và số thứ tự. Biết MSSV không đồng nghĩa chứng minh được chủ sở hữu. |
| Trường | Trong ngữ cảnh hồ sơ: **trường đại học/cơ sở đào tạo**, không phải “trường dữ liệu”. Thông tin trường phục vụ hồ sơ và tìm kiếm; không cần ghép thêm mã trường chỉ để giải quyết trùng MSSV theo giả định đã xác nhận. |
| Tin đăng | Một đề nghị bán hoặc cho tặng do người bán đăng. Cùng một tên sách nhưng khác người bán là các tin riêng. Quan hệ với “mặt hàng”, số lượng và combo cần chốt tại A02/A19. |
| Giữ chỗ | Người mua yêu cầu và người bán chấp nhận dành món hàng cho người mua. Không tự hết hạn sau 24 giờ. |
| Giao dịch hoàn tất | Giao dịch kết thúc theo quy trình xác nhận nhận hàng, không chỉ vì người bán báo đã giao. |
| Uy tín | Điểm phản ánh lịch sử được hệ thống ghi nhận; không phải vai trò phân quyền. |
| Khóa vĩnh viễn | Không có thời điểm tự mở khóa; vẫn có quyền khiếu nại và có thể được xem xét lại quyết định. |

Người mua/người bán là vai trò của thành viên trong từng giao dịch. Quản trị viên cấp cao quản lý hệ thống, danh mục và báo cáo; kiểm duyệt viên sinh viên duyệt tin, xử lý phản ánh và cảnh báo. Quyền quyết định các biện pháp đặc biệt phải được làm rõ tại A08; không tự suy ra mọi kiểm duyệt viên có toàn quyền.

## 4. Yêu cầu nghiệp vụ hiện hành

### FR-01 — Đăng ký và xác thực tài khoản

- Hồ sơ gồm họ tên, MSSV, địa chỉ trọ, số điện thoại, ngày tham gia, khóa học; S1 còn mô tả ngành học và cơ sở học chính.
- Dùng User_ID riêng; giữ MSSV làm thuộc tính định danh sinh viên. MSSV duy nhất trong phạm vi đã xác nhận.
- S1 yêu cầu xác thực email trường và quản trị viên kích hoạt qua cổng kiểm tra nội bộ. Chưa có bằng chứng về API/cổng thực tế; `@domain.edu.vn` trong mô tả không phải danh sách tên miền được duyệt.
- **Nguồn:** S1 tr.1–2; S2 câu 1, 3; S3. **Còn mở:** A01, A13.

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
- Tin bán lẻ và combo cần phân biệt; không gộp các tin chỉ vì trùng tên sách.
- **Nguồn:** S1 tr.1–2. **Còn mở:** A02, A19, mã môn liên trường tại A15.

### FR-05 — Kiểm duyệt và giới hạn tin

- Tin phải được duyệt trước khi công khai. Không chấp nhận hàng gây hại hoặc tài liệu đề thi mật/chưa được phép theo mô tả nguồn.
- Thành viên thông thường có tối đa **5 tin hiển thị đồng thời**. Người có uy tín **trên 120** được đăng nhiều hơn; con số cụ thể chưa chốt.
- Nguồn đề cập các trạng thái chờ duyệt, đang mở, giữ chỗ/đang thương lượng, hoàn tất, ẩn/hết hạn. Đây chưa phải sơ đồ trạng thái cuối cùng; thương lượng có khóa hàng hay không còn mở.
- **Nguồn:** S1 tr.2–3. **Còn mở:** A03, A04, A14.

### FR-06 — Danh mục, tìm kiếm và vị trí

- Danh mục phân cấp; tìm theo từ khóa, mã môn, giá tối đa và bán kính.
- Có khu vực trường, ký túc xá và khu trọ lân cận; nguồn đề cập GPS và khoảng cách tới cổng trường. Bán kính 2 km/3 km là ví dụ, không phải giới hạn đã chốt.
- **Nguồn:** S1 tr.2–3; phạm vi mở rộng theo S2 câu 3. **Còn mở:** A11, A15.

### FR-07 — Nhắn tin và thương lượng

- Người mua/người bán nhắn tin trực tiếp trong ứng dụng. Người mua gửi đề nghị giá; người bán đồng ý hoặc từ chối.
- Việc đồng ý giá có đồng thời giữ hàng hay không chưa được xác nhận.
- **Nguồn:** S1 tr.3. **Còn mở:** A04.

### FR-08 — Giữ chỗ và hẹn giao nhận

- Người mua yêu cầu giữ chỗ; người bán chấp nhận thì món hàng được giữ, không để người khác đồng thời giữ cùng món.
- Mỗi người mua được giữ tối đa **3 món cùng lúc**; cách đếm yêu cầu đang chờ cần chốt.
- **Bỏ tự hủy sau 24 giờ.** Người bán chủ động hủy giữ chỗ; hệ thống gửi nhắc kiểm tra giao dịch thay vì tự hủy. Chu kỳ nhắc chưa chốt.
- Hai bên hẹn địa điểm/thời gian phù hợp; khuyến khích các điểm gặp an toàn như thư viện, căn tin, trạm xe buýt.
- **Nguồn:** S1 tr.3–4, được S2 câu 4 thay đổi. **Còn mở:** A05, A06, A09, A14.

### FR-09 — Giao nhận và xác nhận hoàn tất

- Người mua kiểm tra hàng và trả tiền ngoài ứng dụng. Người bán đánh dấu đã giao sau khi nhận thanh toán.
- Hệ thống gửi mã **6 chữ số** tới ứng dụng của người mua; người mua nhập mã để đóng giao dịch.
- Nguồn chưa quy định thời hạn mã, số lần thử hoặc cách xử lý người mua không xác nhận. Không có phê duyệt cho việc tự hoàn tất vì im lặng.
- **Nguồn:** S1 tr.4. **Còn mở:** A06.

### FR-10 — Đánh giá và khiếu nại đánh giá

- Sau hoàn tất, người mua đánh giá người bán từ 1–5 sao kèm nhận xét. **5 sao: +2 điểm**; **1 hoặc 2 sao có lý do chính đáng: −5 điểm**.
- Người bán đánh giá người mua về đúng hẹn và thái độ. Chưa có công thức điểm cho chiều đánh giá này hoặc cho 3–4 sao.
- Cho phép khiếu nại đánh giá thấp sai sự thật/ác ý. Quản trị viên xác minh, gỡ đánh giá sai và khôi phục điểm uy tín tương ứng.
- **Nguồn:** S1 tr.4; S2 câu 6. **Còn mở:** A07, A08.

### FR-11 — Báo cáo vi phạm và bằng chứng

- Báo cáo tin hoặc tài khoản: không đến hẹn, hàng sai mô tả, tài liệu cấm, hành vi lạm dụng và các trường hợp nguồn nêu.
- Có mã báo cáo, người báo cáo, người bị báo cáo, nội dung, liên hệ giao dịch khi phù hợp và bằng chứng để kiểm duyệt viên xem xét.
- **Bắt buộc có bằng chứng.** Ảnh, video, tin nhắn là các ví dụ được trao đổi; chưa chốt định dạng, dung lượng hoặc việc hỗ trợ tất cả ngay phiên bản đầu.
- **Nguồn:** S1 tr.4–5; S2 câu 7. **Còn mở:** A08, A12.

### FR-12 — Xử phạt, mở khóa và khiếu nại

| Điều kiện | Quy định hiện hành |
| --- | --- |
| Lần đầu không đến hẹn, không có lý do chính đáng | Trừ 20 điểm theo S1. Chưa có thang xử lý tái phạm được duyệt. |
| 30 < điểm uy tín ≤ 50 | Cảnh báo và khóa tạm thời 14 ngày. |
| Điểm uy tín ≤ 30 | Khóa vĩnh viễn, có quyền khiếu nại. **Đúng 30 thuộc mức này.** |
| Hết thời hạn khóa tạm 14 ngày | Mở khóa theo xác nhận của trưởng nhóm. Cách tránh bị khóa lặp lại vì điểm chưa tăng cần chốt tại A09. |
| Gian lận tài chính được xác định | S1 quy định cảnh báo và khóa vĩnh viễn gắn với MSSV; chưa có thay đổi loại bỏ căn cứ này. Quy trình xác định còn mở. |

S1 quy định khóa tạm chỉ được xem, không đăng/giữ chỗ. Đề xuất cho phép xử lý nghĩa vụ giao dịch cũ nằm tại A09 và **chưa được duyệt**. Quyền khiếu nại phải tiếp cận được kể cả khi bị khóa; hình thức thực hiện chưa chốt.

**Nguồn:** S1 tr.5; S2 câu 8; S3. **Còn mở:** A07–A09.

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

Thống kê các lần chuyển giao đồ dùng/giáo trình giá 0 đã hoàn tất. Cách đếm món trong combo chưa chốt. **Nguồn:** S1 tr.5. **Còn mở:** A15, A19.

## 5. Dữ liệu và yêu cầu chất lượng

Các nhóm thông tin cần phân tích tiếp gồm hồ sơ/xác thực, vai trò, tin/ảnh/danh mục/vị trí, hội thoại/đề nghị giá, giữ chỗ/lịch hẹn, giao nhận/mã xác nhận, đánh giá/biến động uy tín, báo cáo/bằng chứng/quyết định xử lý, hạn chế tài khoản, thông báo và thống kê. Đây là **khái niệm nghiệp vụ, chưa phải danh sách bảng hay thiết kế lớp cuối cùng**.

S1 mong muốn hoạt động 24/7; chưa có SLA định lượng, tải đồng thời hoặc thời gian đáp ứng được khách hàng duyệt. Các mục tiêu kỹ thuật cần thống nhất tại A18. Yêu cầu giữ độc quyền hàng và giới hạn giữ chỗ phải đúng cả khi nhiều người thao tác đồng thời; không được hoàn tất hoặc tính điểm nhiều lần chỉ vì gửi lại yêu cầu.

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

## 7. Vấn đề chưa giải quyết và phương án khuyến nghị

**Toàn bộ phương án trong mục này chưa được duyệt**, kể cả những phương án đã nêu trong cuộc trò chuyện. “Đề xuất giải pháp” là yêu cầu tư vấn, không phải đồng ý với giải pháp. Các nội dung đã xác nhận được ghi rõ để không hỏi lại.

Ưu tiên **P0:** chốt trước khi cố định mô hình/quy trình phụ thuộc; **P1:** chốt trước khi triển khai chức năng liên quan; **P2:** trước nghiệm thu. Người phụ trách dưới đây là vai trò đề nghị: trưởng nhóm tổng hợp; người phụ trách nghiệp vụ làm rõ; khách hàng xác nhận chính sách. Không cần dừng công việc độc lập đang đủ yêu cầu.

### A01 — Đối tượng và cách chứng minh danh tính · Chốt một phần · P0

- **Đã rõ:** phạm vi ĐHQG-HCM, User_ID riêng, MSSV duy nhất; không cần đặt lại câu hỏi MSSV có trùng giữa các trường không.
- **Còn thiếu:** tên miền email hợp lệ; học viên/cán bộ/giảng viên không có MSSV; người tốt nghiệp mất email trường; quy tắc một người/một tài khoản.
- **Khuyến nghị:** lưu MSSV dạng chuỗi để giữ số 0 đầu, ràng buộc duy nhất cho tài khoản sinh viên; lưu trường đại học riêng phục vụ hồ sơ. Email dùng danh sách tên miền được xác minh. Ngoại lệ cần quản trị viên duyệt bằng bằng chứng phù hợp; chưa mở đăng ký đại trà cho nhóm chưa có cách xác thực. Không xem việc nhập đúng MSSV là đủ xác minh; ngăn đăng ký lại bằng MSSV bị cấm theo quyết định còn hiệu lực.
- **Chốt bởi:** phụ trách tài khoản + trưởng nhóm/khách hàng. **Liên quan:** FR-01–02, A13.

### A02 — Mặt hàng, tin đăng và combo · Chưa chốt · P0

- **Còn thiếu:** một đồ vật có thể đồng thời xuất hiện trong tin lẻ và combo không; có cần danh mục sản phẩm dùng chung không?
- **Khuyến nghị:** phiên bản đầu coi mỗi tin là một đề nghị bán/cho tặng không chia nhỏ; combo có mô tả các món. Không cho cùng đồ vật tham gia nhiều tin đang bán. Không tạo danh mục sản phẩm chuẩn chỉ vì trùng tên sách; thiết kế tồn kho chia sẻ chỉ khi khách hàng cần bán tách/gộp.
- **Chốt bởi:** phụ trách tin đăng + khách hàng. **Liên quan:** FR-04, A19.

### A03 — Hạn mức tin đăng · Chưa chốt · P0

- **Còn thiếu:** người trên 120 điểm được bao nhiêu tin; trạng thái nào tính; điểm giảm thì xử lý tin cũ ra sao?
- **Khuyến nghị:** ≤120 điểm tối đa 5; >120 tối đa **10**. Tính tin đang mở và đang giữ chỗ; không tính nháp/chờ duyệt/ẩn/hết hạn/hoàn tất. Khi tụt điểm, giữ tin đang hoạt động nhưng chặn xuất bản thêm đến khi dưới hạn mức. Kiểm tra đồng thời khi duyệt, mở lại hoặc khôi phục; xử lý việc giải phóng giữ chỗ mà không tự vượt hạn mức.
- **Chốt bởi:** phụ trách tin đăng + khách hàng. **Liên quan:** FR-05, A14. Con số 10 chỉ là đề xuất.

### A04 — Thương lượng có giữ hàng không? · Chưa chốt · P0

- **Khuyến nghị:** nhắn tin hoặc chấp nhận giá chưa giữ hàng. Chỉ chấp nhận yêu cầu giữ chỗ mới khóa món; lưu giá hai bên đã đồng ý tại thời điểm giữ chỗ. Giao diện nói rõ khác biệt để tránh người mua hiểu nhầm.
- **Chốt bởi:** phụ trách thương lượng/giữ chỗ + khách hàng. **Liên quan:** FR-07–08.

### A05 — Hủy và nhắc giữ chỗ · Chốt một phần · P0

- **Đã rõ:** không tự hủy sau 24 giờ, người bán có quyền hủy, tối đa 3 món được giữ đồng thời.
- **Còn thiếu:** người mua có quyền hủy không; yêu cầu chờ có tính hạn mức không; nhắc lúc nào; xử lý người dùng mất liên lạc.
- **Khuyến nghị:** chỉ giữ chỗ đã chấp nhận mới tính hạn mức. Trước khi người bán báo đã giao, mỗi bên có thể hủy; ghi người hủy/lý do và báo bên còn lại. Nhắc một lần sau 24 giờ kể từ chấp nhận, không hủy. Người còn lại có thể hủy hoặc yêu cầu hỗ trợ nếu mất liên lạc. Sau khi báo đã giao, dùng xử lý tranh chấp thay vì hủy trực tiếp. Không tự trừ điểm chỉ vì hủy; muốn xử phạt phải xác minh vi phạm. Giải phóng hạn mức khi hủy, chỉ mở lại tin nếu còn đủ điều kiện công khai.
- **Chốt bởi:** phụ trách giữ chỗ + khách hàng. **Liên quan:** FR-08, A06, A14.

### A06 — Không xác nhận nhận hàng và mã xác nhận · Chưa chốt · P0

- **Khuyến nghị:** sau người bán báo giao, chuyển sang chờ người mua xác nhận; nhắc sau 24 giờ và giữ nguyên trạng thái nếu im lặng, không tự hoàn tất. Hai bên được mở tranh chấp; người có thẩm quyền giải quyết dựa vào bằng chứng, ghi quyết định và lịch sử. Hàng chưa được tự mở bán lại trong lúc này.
- Mã 6 chữ số đề nghị có hạn **10 phút**, tối đa **5 lần thử sai** mỗi mã; gửi lại làm vô hiệu mã cũ, bổ sung giới hạn tần suất gửi/thử để không lách bằng cấp mã liên tục. Mã dùng một lần. Hết hạn mã không làm hết hạn giữ chỗ hay hủy giao dịch.
- **Cần duyệt:** thời hạn/số lần thử, cách cấp lại, quyền quản trị viên xác nhận hoặc hủy trong tranh chấp và bằng chứng cần có. Mã trong cùng ứng dụng chỉ là thao tác xác nhận của người mua.
- **Chốt bởi:** phụ trách giao dịch/kiểm duyệt + khách hàng. **Liên quan:** FR-09, A08.

### A07 — Điểm đánh giá và khôi phục · Chốt một phần · P0

- **Đã rõ:** 5 sao +2; 1–2 sao có lý do chính đáng −5; được khiếu nại đánh giá sai và hoàn điểm sau xác minh.
- **Khuyến nghị:** 3–4 sao không đổi điểm; đánh giá người mua chưa tác động điểm. Chỉ người tham gia giao dịch hoàn tất được đánh giá, mỗi người một đánh giá/giao dịch. Với 1–2 sao phải nêu lý do và chỉ trừ 5 sau khi kiểm duyệt viên xác minh. Khi gỡ đánh giá sai, đảo đúng tác động điểm đã ghi, không cộng một khoản bù tùy ý; xem xét lại lệnh khóa gây ra bởi đánh giá đó, giữ các lệnh khóa độc lập còn hiệu lực.
- **Còn thiếu:** thời hạn đánh giá/khiếu nại, có sửa đánh giá không, quyền duyệt và thời gian xử lý. Cần tránh cộng/trừ lặp khi xử lý lại cùng sự kiện.
- **Chốt bởi:** phụ trách đánh giá/tài khoản/kiểm duyệt + khách hàng. **Liên quan:** FR-10, FR-12.

### A08 — Xử lý vi phạm, tái phạm và khiếu nại · Chưa chốt · P0

- **Còn thiếu:** thang tái phạm, thế nào là lý do chính đáng/gian lận, quyền của từng cấp quản trị, thời hạn và kênh khiếu nại; một sự việc vừa bị đánh giá thấp vừa bị báo cáo có bị phạt hai lần không?
- **Khuyến nghị:** một sự việc đã xác minh chỉ nhận một hình phạt cho cùng hành vi; liên kết báo cáo trùng để xử lý chung. Ghi bằng chứng, người quyết định, lý do, điểm trước/sau và thời hạn. Không tự đặt thang tăng hình phạt khi chưa được duyệt. Kiểm duyệt viên đề nghị, quản trị viên cấp cao duyệt khóa vĩnh viễn và khiếu nại; khi có thể, người xét khiếu nại khác người ra quyết định ban đầu. Cung cấp màn hình/kênh khiếu nại cho tài khoản bị khóa.
- **Chốt bởi:** phụ trách kiểm duyệt + khách hàng. **Liên quan:** FR-10–12.

### A09 — Sau 14 ngày và nghĩa vụ khi bị khóa · Chốt một phần · P0

- **Đã rõ:** 30 < điểm ≤ 50 khóa 14 ngày rồi mở; ≤30 khóa vĩnh viễn có khiếu nại.
- **Khuyến nghị:** mở khi hết hạn, giữ nguyên điểm; không khóa lại chỉ vì điểm vẫn trong khoảng 31–50. Chỉ một sự kiện vi phạm mới được xác minh và làm giảm điểm mới được xét đợt khóa tiếp theo. Ví dụ đang 45 điểm, hết 14 ngày vẫn 45 và được mở; một vi phạm mới khiến còn 40 có thể tạo đợt khóa mới. Không chạy tác vụ mỗi ngày để khóa lại cùng căn cứ. Nếu có căn cứ khóa vĩnh viễn còn hiệu lực, hết đợt khóa tạm không mở tài khoản.
- Đề nghị khi khóa tạm: cho xem lịch sử, trao đổi và xác nhận nghĩa vụ cũ, khiếu nại; chặn tin/giữ chỗ mới. Khi khóa vĩnh viễn: chỉ cho truy cập thông báo, lịch sử cần thiết và khiếu nại. **Đây là mở rộng so với “chỉ xem” trong S1, cần duyệt.** Giao dịch đang dở cần quản trị viên hỗ trợ theo A06.
- **Chốt bởi:** phụ trách tài khoản/kiểm duyệt + khách hàng. **Liên quan:** FR-08–12.

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

- **Đã rõ:** tốt nghiệp vẫn dùng được ứng dụng.
- **Khuyến nghị:** nếu không có tích hợp được trường cung cấp, quản trị viên xác thực thủ công; không giả định có API trường. Nhắc cập nhật hồ sơ hằng năm, không tự khóa do tốt nghiệp. Người mất email trường dùng quy trình xác minh ngoại lệ và cập nhật địa chỉ liên hệ đã xác thực.
- **Cần chốt:** ai cung cấp nguồn kiểm tra, bằng chứng được chấp nhận và xử lý hồ sơ không cập nhật.
- **Chốt bởi:** phụ trách tài khoản + trưởng nhóm/khách hàng. **Liên quan:** FR-01–02, A01.

### A14 — Sửa, ẩn và mở lại tin · Chưa chốt · P0

- **Khuyến nghị:** sửa nội dung quan trọng phải duyệt lại; giữ bản mô tả và giá đã thỏa thuận cho giao dịch đang diễn ra. Tin bị ẩn do kiểm duyệt hoặc chủ tài khoản bị hạn chế không tự công khai lại khi hủy giữ chỗ. Tin đang giữ chỗ không được sửa điều kiện đã thỏa thuận mà bỏ qua người mua. Khi mở lại phải kiểm tra quyền, tình trạng duyệt và hạn mức.
- **Cần chốt:** thuộc tính nào là sửa quan trọng, quyền rút tin, lý do từ chối, xử lý giao dịch khi tin bị gỡ.
- **Chốt bởi:** phụ trách tin đăng/kiểm duyệt/giữ chỗ + khách hàng. **Liên quan:** FR-04–05, FR-08, FR-13.

### A15 — Định nghĩa báo cáo và học kỳ · Chưa chốt · P1

- **Khuyến nghị:** cấu hình ngày bắt đầu/kết thúc từng học kỳ; dùng múi giờ Việt Nam cho kỳ báo cáo, lưu thời điểm thống nhất ở tầng kỹ thuật. Phân biệt mã môn theo trường để tránh gộp các môn khác nhau; chỉ gộp khi có ánh xạ được duyệt. Ghi nhãn rõ “số giao dịch hoàn tất”, không gọi là số món nếu chưa biết số lượng trong combo.
- **Cần chốt:** đếm lượt tìm kiếm hay người tìm; loại dữ liệu thử; thời điểm tính giao dịch; khu vực tại thời điểm giao dịch hay hiện tại; ngưỡng báo cáo uy tín thấp <50 hay ≤50. Đề nghị lưu thông tin lịch sử phục vụ báo cáo thay vì để chỉnh hồ sơ làm đổi báo cáo cũ.
- **Chốt bởi:** phụ trách báo cáo + khách hàng. **Liên quan:** FR-15–18.

### A16 — Sự kiện thanh lý · ĐÃ ĐÓNG

Khách hàng đồng ý bỏ tại S2 câu 5. Không cần chốt cơ chế chiến dịch hoặc ưu tiên trang chủ. Muốn đưa trở lại phải tạo yêu cầu thay đổi mới; combo thông thường không bị loại theo quyết định này.

### A17 — Đổi đồ và điều kiện nhận tặng · Chưa chốt · P0

- **Còn thiếu:** “trao đổi” có nghĩa đổi vật lấy vật không; người nhận tặng có phải chứng minh hoàn cảnh khó khăn không?
- **Khuyến nghị:** phiên bản đầu gồm mua bán và cho tặng giá 0; không có quy trình đổi vật hoặc xét hoàn cảnh. Khách hàng cần xác nhận phạm vi này; không suy ra chỉ từ tên đề tài.
- **Chốt bởi:** trưởng nhóm + khách hàng. **Liên quan:** FR-04, FR-18.

### A18 — Tiêu chí bàn giao và chất lượng · Chốt một phần · P2

- **Đã rõ:** khoảng hai tháng; có ứng dụng và OOAD; trưởng nhóm cho phép lựa chọn công nghệ, đã ghi ADR.
- **Cần chốt:** ngày nộp, mẫu biểu/rubric, bộ sơ đồ bắt buộc, dữ liệu demo, môi trường chạy, mục tiêu tải/đáp ứng và yêu cầu sao lưu.
- **Khuyến nghị:** chốt checklist nghiệm thu cùng giảng viên ngay tuần đầu; mỗi FR hiện hành có use case/tiêu chí chấp nhận và kiểm thử phù hợp. Ưu tiên luồng đăng ký → duyệt tin → giữ chỗ → giao nhận → đánh giá, sau đó kiểm duyệt/tranh chấp và báo cáo. Không tự cam kết SLA 24/7 chỉ vì nguồn có mong muốn này.
- **Chốt bởi:** trưởng nhóm + giảng viên/khách hàng.

### A19 — Số lượng và bán tách · Chưa chốt · P0

- **Khuyến nghị:** một tin tương ứng một món hoặc một combo không chia nhỏ, tối đa một giao dịch hoàn tất. Muốn bán từng món/số lượng nhiều phải đặc tả tồn kho, giữ chỗ theo số lượng và báo cáo trước khi thiết kế bảng.
- **Chốt bởi:** phụ trách tin đăng/giữ chỗ + khách hàng. **Liên quan:** FR-04, FR-08, FR-18, A02.

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

## 9. Tài liệu liên quan và bàn giao ngữ cảnh

- Đưa tài liệu này cho thành viên/AI khi tiếp tục phân tích nghiệp vụ; đọc thêm [AGENTS.md](../../AGENTS.md) để biết quy tắc làm việc và [README](../../README.md) để biết trạng thái chạy thực tế.
- [ADR công nghệ](../architecture/ADR-001-stack.md) quản lý lựa chọn kỹ thuật; tài liệu này quản lý yêu cầu nghiệp vụ.
- [Kế hoạch phát triển](../planning/development-plan.md) và [bảng giao việc](../onboarding/team-kickoff.md) đã được đồng bộ với việc bỏ FR-14/A16, không tự hết hạn giữ chỗ và ngưỡng khóa hiện hành. Các kiểm soát kỹ thuật trong kế hoạch/ADR không phê duyệt các phương án nghiệp vụ còn mở ở mục 7.
- [Brief cũ](brief.md) chỉ còn là đường dẫn chuyển tiếp để các liên kết cũ không hỏng.

Ở thời điểm lập v1.0, backend mới có nền tảng và dữ liệu danh mục; mô hình dữ liệu nghiệp vụ đầy đủ chưa được định nghĩa/triển khai. Tài liệu này không thay cho việc chốt các A ưu tiên P0 và phân tích OOAD trước khi xây dựng schema.
