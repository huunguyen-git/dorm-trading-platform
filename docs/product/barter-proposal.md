# Phương án quản lý đổi vật lấy vật

Ngày: 28/09/2026. Liên quan: [A17](client-requirements.md). **Trạng thái: ĐỀ XUẤT CHƯA DUYỆT.** Trưởng nhóm yêu cầu tư vấn cách quản lý; chưa có quyết định bổ sung đổi đồ vào phạm vi, chưa tạo FR/UC triển khai hoặc thay đổi API/schema.

## Phương án đề nghị

Dùng **một thỏa thuận đổi có hai phần giao nhận**. Ví dụ An đưa bàn cho Bình và nhận ghế của Bình. Hai người đều có nghĩa vụ giao và quyền xác nhận nhận hàng; không mô hình hóa thành hai lần cho tặng độc lập.

Đề xuất giới hạn phiên bản đầu nếu được duyệt: hai thành viên, mỗi bên chọn một tin đại diện một đồ vật hoặc combo nguyên bộ của mình; không bù tiền, không đổi nhiều bên, không giao một phần combo. Nội dung và tập đồ vật của hai bên được chụp lại khi chấp nhận. Các giới hạn này chưa là yêu cầu hiện hành.

## Luồng dự kiến

1. Một bên gửi đề nghị, chỉ rõ tin mình muốn nhận và tin/đồ vật mình đưa đổi. Đề nghị chưa giữ hàng. Tin và nội dung đề nghị phải đáp ứng điều kiện kiểm duyệt được chốt sau này.
2. Bên còn lại chấp nhận đúng phiên bản đề nghị. Hệ thống kiểm tra hai bên, hai tin và toàn bộ đồ vật; giữ cả hai tập trong cùng thao tác nguyên tử hoặc từ chối toàn bộ. Một món đang giữ/bán ở luồng mua bán khác làm đề nghị thất bại.
3. Hai bên thống nhất lịch gặp; mỗi bên ghi nhận ảnh phần hàng mình giao. Mỗi người chỉ xác nhận đã nhận phần hàng từ người kia bằng mã gắn đúng người nhận/phần giao nhận.
4. Khi cả hai phần đã được xác nhận, hoàn tất thỏa thuận một lần, ghi nhận các đồ vật đã chuyển giao và chặn đặt qua mọi tin liên quan. Không tự đưa đồ vật nhận được vào kho để bán lại; việc đó cần nghiệp vụ riêng nếu muốn hỗ trợ.
5. Đề xuất dùng mốc 24 giờ cho từng phần đã báo giao mà chưa xác nhận để chuyển admin xem xét. Một phần được xác nhận không làm cả thỏa thuận tự hoàn tất. Không hoàn tất vì một bên im lặng.
6. Trước khi có phần nào báo giao, đề xuất cho mỗi bên hủy và giải phóng cả hai tập đồ vật. Khi đã có phần báo giao, dùng yêu cầu hủy/tranh chấp và admin hoặc xác nhận hai bên; không tự giải phóng hàng có thể đang ở bên nhận. Trước khi hủy sau bàn giao phải ghi nhận kết quả xử lý việc trả lại hàng, không chỉ đóng bản ghi.

## Vì sao không dùng hai giao dịch cho tặng?

Hai giao dịch độc lập có thể khiến An giao bàn và giao dịch đó hoàn tất, trong khi Bình hủy phần giao ghế. Ngoài việc khó giải quyết tranh chấp, hệ thống còn có thể cộng điểm hoặc đếm hai lần cho tặng sai bản chất. Một thỏa thuận chung thể hiện rõ hai nghĩa vụ phụ thuộc nhau.

## Cần quyết định trước khi triển khai

| Chủ đề | Nội dung cần duyệt |
| --- | --- |
| Phạm vi | Có hỗ trợ đổi đồ trong phiên bản nộp không; tin đổi riêng hay cho phép đề nghị đổi trên tin bán hiện có; kiểm duyệt đề nghị ra sao? |
| Xác nhận và tranh chấp | Có nhận các bước/mốc dự kiến trên không; admin cần bằng chứng nào khi chỉ một bên đã giao; quyền quyết định trả hàng/hủy/hoàn tất? |
| Uy tín | Có đánh giá hai chiều không; ai được cộng điểm không đánh giá; làm sao tránh tăng điểm gấp đôi? Không tự áp dụng FR-10 hiện chỉ có người mua đánh giá người bán. |
| Báo cáo | Đếm là một lần đổi, không phải hai lần bán/cho tặng; thống kê đồ vật mỗi chiều thế nào? |
| Công sức | M2: loại tin và tập đồ vật; M3: giữ cả hai phía; M4: hai xác nhận; M5: tranh chấp; M1: quyền và sổ điểm. Cần ước lượng lại trước khi thêm vào kế hoạch. |

Khuyến nghị cho nhóm năm người: hoàn thiện bán và cho tặng đã chốt; lưu phương án đổi đồ làm lựa chọn mở rộng để duyệt riêng. Việc ghi nhận đề xuất này không khẳng định các sàn khác cho phép hoặc cấm đổi vật lấy vật.
