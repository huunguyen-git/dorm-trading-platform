-- ==============================================================================
-- Flyway Migration V2: Dữ liệu mẫu ban đầu (Danh mục & Thang phạt)
-- ==============================================================================

-- 1. Khởi tạo Danh mục Đồ dùng phòng trọ sinh viên ĐHQG-HCM
INSERT INTO danh_mucs (ma_danh_muc, ten, danh_muc_cha_id, mo_ta, hien_thi) VALUES
('GIAO_TRINH', 'Giáo trình & Sách học tập', NULL, 'Giáo trình đại cương, chuyên ngành các trường ĐHQG-HCM', TRUE),
('GT_CNTT', 'Giáo trình CNTT / Phần mềm', 'GIAO_TRINH', 'Sách giải thuật, mạng máy tính, kiến trúc máy tính UIT/BK', TRUE),
('GT_KINH_TE', 'Giáo trình Kinh tế / Luật', 'GIAO_TRINH', 'Sách kinh tế vi mô, vĩ mô, luật UEL', TRUE),
('DO_GIA_DUNG', 'Đồ gia dụng phòng trọ', NULL, 'Nồi cơm điện, ấm đun siêu tốc, giá kệ bát đĩa', TRUE),
('THIET_BI_DIEN', 'Thiết bị điện & Đèn quạt', NULL, 'Quạt đứng, quạt tích điện KTX, đèn bàn học', TRUE),
('NOI_THAT_TRO', 'Bàn ghế & Nội thất phòng trọ', NULL, 'Bàn học gấp, ghế xoay, sào treo đồ, nệm', TRUE),
('DO_CHO_TANG', 'Góc cho tặng (0 đồng)', NULL, 'Đồ dùng, giáo trình cho tặng miễn phí giữa các bạn sinh viên', TRUE)
ON CONFLICT (ma_danh_muc) DO NOTHING;

-- 2. Khởi tạo Thang phạt trừ điểm uy tín (Theo quy chuẩn môn học OOAD)
INSERT INTO thang_phats (ma_thang_phat, ten, diem_tru, trang_thai) VALUES
('TP_BO_HEN_LAN_1', 'Bỏ hẹn giao nhận không báo trước lần đầu', 5, 'DANG_DUNG'),
('TP_BO_HEN_TAI_PHAM', 'Tái phạm bỏ hẹn giao nhận không báo trước', 15, 'DANG_DUNG'),
('TP_HANG_KHONG_DUNG_MO_TA', 'Hàng hóa thực tế không đúng mô tả trên tin', 10, 'DANG_DUNG'),
('TP_GIA_MAO_THONG_TIN', 'Giả mạo thẻ sinh viên hoặc thông tin định danh', 50, 'DANG_DUNG'),
('TP_NGON_TU_XUC_PHAM', 'Sử dụng ngôn từ quấy rối, xúc phạm trong tin nhắn', 20, 'DANG_DUNG'),
('TP_KHONG_BAN_GIAO', 'Báo đã giao nhưng thực tế không bàn giao đồ', 30, 'DANG_DUNG')
ON CONFLICT (ma_thang_phat) DO NOTHING;
