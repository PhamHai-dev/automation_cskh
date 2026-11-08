/**
 * Script khởi tạo cấu trúc thư mục & các file Excel mẫu cho Backup / Import dữ liệu
 * Đường dẫn gốc: docs/data/import/
 *
 * Chạy lệnh:
 *   cd backend && npx ts-node src/scripts/generate-backup-templates.ts
 */

import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';

const ROOT_DIR = path.resolve(__dirname, '../../../docs/data/import');

/* ============================================================================
 * 1. DANH SÁCH CỘT CHUẨN CỦA TỪNG SHEET (ĐÃ ĐỐI CHIẾU & BỔ SUNG)
 * ============================================================================ */

/**
 * 1.1. KAIWA - Sheet `1.Chăm sóc` (60 cột chuẩn A..BH)
 * Dùng cho:
 *  - Admin Kaiwa (`admin/backup_admin_kaiwa.xlsx` -> Sheet `1.Chăm sóc`)
 *  - CSKH Kaiwa  (`cskh/backup_cskh_kaiwa_CVHT01.xlsx` -> Sheet `1.Chăm sóc`)
 */
export const KAIWA_PROFILE_HEADERS: string[] = [
  'ID', // 1 - A (Khóa chính)
  'Ngày nộp học phí', // 2 - B
  'Sale', // 3 - C
  'Trạng thái HV', // 4 - D (HV mới / HV combo / Tái tục)
  'Họ tên HV', // 5 - E
  'Giới tính', // 6 - F
  'SĐT', // 7 - G
  'Email', // 8 - H
  'Nội dung khoá', // 9 - I
  'Trạng thái thanh toán', // 10 - J
  'Gói học', // 11 - K
  'Khoá học', // 12 - L (GV Việt / GV Nhật / Mix)
  'Trình độ', // 13 - M
  'Tổng số buổi', // 14 - N
  'Mô hình lớp', // 15 - O (1-1 / 1-2 / 1-n)
  'Ghi chú sale', // 16 - P
  'DOB', // 17 - Q
  'Nghề nghiệp', // 18 - R
  'CVHT', // 19 - S
  'Số buổi còn lại', // 20 - T (Công thức)
  'Ngày bắt đầu học', // 21 - U
  'Trạng thái', // 22 - V (Đang học / Chờ lớp / Bảo lưu / Kết thúc)
  'Ngày kết thúc/Bảo lưu', // 23 - W
  'Giờ học (1)', // 24 - X
  'Lịch học (1)', // 25 - Y
  'Thời lượng buổi học (1)', // 26 - Z
  'Giờ học (2)', // 27 - AA
  'Lịch học (2)', // 28 - AB
  'Thời lượng buổi học (2)', // 29 - AC
  'Vòng lặp', // 30 - AD
  'Ngày học', // 31 - AE
  'Giáo viên', // 32 - AF
  'Mã GV', // 33 - AG
  'Tên lớp', // 34 - AH
  'Tổng số buổi đã học năm trước', // 35 - AI (Hỗ trợ lưu nhiều năm)
  'Tổng số buổi đã học trong năm', // 36 - AJ (Hỗ trợ lưu nhiều năm)
  'Báo cáo học tập', // 37 - AK (Link báo cáo học tập)
  'Thông tin trao đổi với HV', // 38 - AL
  'Lịch hẹn gọi', // 39 - AM
  'Điểm nóng', // 40 - AN
  'Nội dung chăm sóc sau buổi 1', // 41 - AO
  'Nội dung chăm sóc sau buổi 3', // 42 - AP
  'Nội dung chăm sóc sau buổi 10', // 43 - AQ
  'Nội dung chăm sóc sau buổi 15', // 44 - AR
  'Nội dung chăm sóc sau buổi 20', // 45 - AS
  'Nội dung chăm sóc sau buổi 25', // 46 - AT
  'Nội dung chăm sóc sau buổi 29', // 47 - AU
  'Nội dung chăm sóc sau buổi 30', // 48 - AV
  'Nội dung chăm sóc sau buổi 35', // 49 - AW
  'Nội dung chăm sóc sau buổi 45', // 50 - AX
  'Nội dung chăm sóc sau buổi 55', // 51 - AY
  'Nội dung chăm sóc sau buổi 59', // 52 - AZ
  'Nội dung chăm sóc sau buổi 60', // 53 - BA
  'Nội dung chăm sóc sau buổi 89', // 54 - BB
  'Nội dung chăm sóc sau buổi 90', // 55 - BC
  'Chăm sóc sau kết thúc', // 56 - BD
  'Ngày kết thúc (cột phụ)', // 57 - BE
  'Ngày bàn giao', // 58 - BF
  'Tháng nộp học phí', // 59 - BG
  'Ngày tạo tài khoản', // 60 - BH
];

export const KAIWA_PROFILE_TEST_ROWS: Array<Array<string | number>> = [
  [
    '427901798', '2026-01-10', 'Nguyễn Thu Trang', 'HV mới', 'Đỗ Phú Sĩ', 'Nam', '0987654321', 'dophusi@gmail.com',
    'Giao tiếp phản xạ N4', 'Đã hoàn thành', 'KW36', 'GV Việt + Nhật', 'N4', 36, '1-1', 'Học viên cần luyện phản xạ nhanh',
    '1998-05-14', 'Kỹ sư IT', 'CVHT01', 24, '2026-01-15', 'Đang học', '', '19:30', 'T2-T4-T6', 30,
    '', '', '', 'Tuần', 'T2, T4, T6', 'Trần Thị Mai', 'GV102', 'BS8_3002', 2, 10,
    'https://docs.google.com/spreadsheets/d/1example_kaiwa_report_1', 'HV mong muốn giao tiếp công sở', '2026-03-20', 'Không có',
    'B1: HV hào hứng, tốc độ nói vừa phải', 'B3: Đã quen cách học, phát âm tốt', 'B10: Tiến bộ rõ từ vựng bài 1-5',
    '', '', '', '', '', '', '', '', '', '', '', '', '', '', '2026-01-11', '01/2026', '2026-01-11',
  ],
  [
    '427901799', '2026-02-01', 'Lê Minh Tuấn', 'HV combo', 'Nguyễn Ngọc Ánh', 'Nữ', '0912345678', 'ngocanh.jp@gmail.com',
    'Kaiwa thương mại N3', 'Đã hoàn thành', 'KW60', 'GV Nhật', 'N3', 60, '1-2', 'Ưu tiên lịch tối sau 20h',
    '2000-11-22', 'Nhân viên XNK', 'CVHT01', 52, '2026-02-05', 'Đang học', '', '20:30', 'T3-T5-T7', 30,
    '', '', '', 'Tuần', 'T3, T5, T7', 'Takahashi Ken', 'GV205', 'KW_N3_202', 0, 8,
    'https://docs.google.com/spreadsheets/d/1example_kaiwa_report_2', 'HV chăm chỉ, chuẩn bị bài đầy đủ', '2026-03-25', 'Cần hỗ trợ thêm kính ngữ',
    'B1: GV khen phát âm tự nhiên', 'B3: Tương tác tốt với bạn cùng lớp', '',
    '', '', '', '', '', '', '', '', '', '', '', '', '', '', '2026-02-02', '02/2026', '2026-02-02',
  ],
];

/**
 * 1.2. KAIWA - Sheet `Báo cáo học tập Kaiwa` (61 cột phẳng hóa - Lưu được hàng nghìn HV)
 * Dùng cho:
 *  - Admin Kaiwa (`admin/backup_admin_kaiwa.xlsx` -> Sheet `Báo cáo học tập Kaiwa`)
 *  - File Báo cáo học tập Kaiwa (`bao_cao_hoc_tap/backup_bao_cao_hoc_tap_kaiwa.xlsx`)
 */
export const KAIWA_STUDY_REPORT_GROUPS: Array<{ title: string; span: number }> = [
  { title: 'THÔNG TIN HỌC VIÊN & LỚP HỌC', span: 10 },
  { title: 'ĐÁNH GIÁ BUỔI 1 (1時間目)', span: 3 },
  { title: 'ĐÁNH GIÁ BUỔI 3 (3時間目)', span: 3 },
  { title: 'BÁO CÁO CHẶNG BUỔI 1 - 10 (1〜10時間目)', span: 11 },
  { title: 'BÁO CÁO CHẶNG BUỔI 11 - 20 (11〜20時間目)', span: 11 },
  { title: 'BÁO CÁO CHẶNG BUỔI 21 - 30 (21〜30時間目)', span: 11 },
  { title: 'KIỂM TRA GIỮA KỲ (中間テスト)', span: 6 },
  { title: 'KIỂM TRA CUỐI KỲ (期末テスト)', span: 6 },
];

export const KAIWA_STUDY_REPORT_HEADERS: string[] = [
  // I. Thông tin chung (10 cột)
  'ID Học viên', // 1
  'Họ tên HV', // 2
  'Mã lớp', // 3
  'Gói học', // 4
  'Trình độ', // 5
  'Mã GV', // 6
  'Tên Giáo viên', // 7
  'CVHT phụ trách', // 8
  'Trạng thái học', // 9
  'Thông tin trao đổi chung với HV', // 10
  // II. Buổi 1 (3 cột)
  '[Buổi 1] Chuẩn bị bài trước khi lên lớp', // 11
  '[Buổi 1] Tương tác trong giờ học', // 12
  '[Buổi 1] Mức độ hiểu bài', // 13
  // III. Buổi 3 (3 cột)
  '[Buổi 3] Chuẩn bị bài trước khi lên lớp', // 14
  '[Buổi 3] Tương tác trong giờ học', // 15
  '[Buổi 3] Mức độ hiểu bài', // 16
  // IV. Chặng 1 - 10 (11 cột)
  '[Buổi 1-10] Khoảng thời gian (Từ ngày - Đến ngày)', // 17
  '[Buổi 1-10] Số buổi nghỉ có phép (A)', // 18
  '[Buổi 1-10] Số buổi nghỉ không phép (C)', // 19
  '[Buổi 1-10] Số buổi GV nghỉ (D)', // 20
  '[Buổi 1-10] Sự chuẩn bị bài', // 21
  '[Buổi 1-10] Tình hình làm BTVN', // 22
  '[Buổi 1-10] Mức độ tương tác', // 23
  '[Buổi 1-10] Mức độ hiểu bài', // 24
  '[Buổi 1-10] Điểm mạnh & Sự tiến bộ', // 25
  '[Buổi 1-10] Điểm yếu cần khắc phục', // 26
  '[Buổi 1-10] Nhận xét bổ sung của GV/CSKH', // 27
  // V. Chặng 11 - 20 (11 cột)
  '[Buổi 11-20] Khoảng thời gian (Từ ngày - Đến ngày)', // 28
  '[Buổi 11-20] Số buổi nghỉ có phép (A)', // 29
  '[Buổi 11-20] Số buổi nghỉ không phép (C)', // 30
  '[Buổi 11-20] Số buổi GV nghỉ (D)', // 31
  '[Buổi 11-20] Sự chuẩn bị bài', // 32
  '[Buổi 11-20] Tình hình làm BTVN', // 33
  '[Buổi 11-20] Mức độ tương tác', // 34
  '[Buổi 11-20] Mức độ hiểu bài', // 35
  '[Buổi 11-20] Điểm mạnh & Sự tiến bộ', // 36
  '[Buổi 11-20] Điểm yếu cần khắc phục', // 37
  '[Buổi 11-20] Nhận xét bổ sung của GV/CSKH', // 38
  // VI. Chặng 21 - 30 (11 cột)
  '[Buổi 21-30] Khoảng thời gian (Từ ngày - Đến ngày)', // 39
  '[Buổi 21-30] Số buổi nghỉ có phép (A)', // 40
  '[Buổi 21-30] Số buổi nghỉ không phép (C)', // 41
  '[Buổi 21-30] Số buổi GV nghỉ (D)', // 42
  '[Buổi 21-30] Sự chuẩn bị bài', // 43
  '[Buổi 21-30] Tình hình làm BTVN', // 44
  '[Buổi 21-30] Mức độ tương tác', // 45
  '[Buổi 21-30] Mức độ hiểu bài', // 46
  '[Buổi 21-30] Điểm mạnh & Sự tiến bộ', // 47
  '[Buổi 21-30] Điểm yếu cần khắc phục', // 48
  '[Buổi 21-30] Nhận xét bổ sung của GV/CSKH', // 49
  // VII. Kiểm tra Giữa kỳ (6 cột)
  '[Giữa kỳ] Từ vựng (語彙 /10)', // 50
  '[Giữa kỳ] Ngữ pháp (文法 /10)', // 51
  '[Giữa kỳ] Phát âm & Ngữ điệu (発音 /10)', // 52
  '[Giữa kỳ] Độ trôi chảy / Phản xạ (流暢さ /10)', // 53
  '[Giữa kỳ] Tổng điểm (/100)', // 54
  '[Giữa kỳ] Nhận xét đánh giá', // 55
  // VIII. Kiểm tra Cuối kỳ (6 cột)
  '[Cuối kỳ] Từ vựng (語彙 /10)', // 56
  '[Cuối kỳ] Ngữ pháp (文法 /10)', // 57
  '[Cuối kỳ] Phát âm & Ngữ điệu (発音 /10)', // 58
  '[Cuối kỳ] Độ trôi chảy / Phản xạ (流暢さ /10)', // 59
  '[Cuối kỳ] Tổng điểm (/100)', // 60
  '[Cuối kỳ] Nhận xét đánh giá', // 61
];

export const KAIWA_STUDY_REPORT_TEST_ROWS: Array<Array<string | number>> = [
  [
    '427901798', 'Đỗ Phú Sĩ', 'BS8_3002', 'KW36', 'N4', 'GV102', 'Trần Thị Mai', 'CVHT01', 'Đang học',
    'Học viên đặt mục tiêu phỏng vấn công ty Nhật vào tháng 6/2026',
    'Chuẩn bị từ vựng tốt (8/10)', 'Tích cực đặt câu hỏi', 'Hiểu 85% nội dung bài 1',
    'Đã xem trước ngữ pháp', 'Phản xạ nhanh hơn buổi 1', 'Nắm chắc cấu trúc câu ngắn',
    '15/01/2026 - 12/02/2026', 1, 0, 0, 'Tốt', 'Hoàn thành 9/10 bài', 'Sôi nổi, chủ động', '85%',
    'Nhớ từ vựng nhanh, phát âm rõ chữ', 'Hay ngập ngừng khi chia thể nguyên dạng', 'Khuyến khích nghe shadowing 15p/ngày',
    '14/02/2026 - 15/03/2026', 0, 0, 1, 'Rất tốt', 'Hoàn thành 10/10 bài', 'Tự nhiên hơn', '90%',
    'Đã ghép được câu phức, dùng được kính ngữ cơ bản', 'Trợ từ ni/de đôi lúc còn nhầm', 'Tiếp tục duy trì phong độ',
    '', '', '', '', '', '', '', '', '', '', '',
    '8.5/10', '8.0/10', '8.0/10', '8.5/10', '83/100', 'Đạt yêu cầu đầu ra giữa kỳ, phản xạ tốt',
    '', '', '', '', '', '',
  ],
  [
    '427901799', 'Nguyễn Ngọc Ánh', 'KW_N3_202', 'KW60', 'N3', 'GV205', 'Takahashi Ken', 'CVHT01', 'Đang học',
    'Học viên cần cải thiện kỹ năng đàm phán với khách hàng Nhật',
    'Đọc kỹ tài liệu trước giờ học', 'Còn hơi rụt rè khi nói câu dài', 'Hiểu bài tốt (80%)',
    'Chuẩn bị đầy đủ bài tập', 'Đã tự tin mở lời với GV bản xứ', 'Hiểu 90% tốc độ nói tự nhiên',
    '05/02/2026 - 05/03/2026', 0, 1, 0, 'Khá', 'Hoàn thành 8/10 bài', 'Tốt', '85%',
    'Ngữ điệu tự nhiên, vốn từ thương mại phong phú', 'Đôi khi quên mẫu khiêm nhường ngữ', 'Cần ôn lại bài 4-6 trước khi thi giữa kỳ',
    '', '', '', '', '', '', '', '', '', '', '',
    '', '', '', '', '', '', '', '', '', '', '',
    '9.0/10', '8.5/10', '9.0/10', '8.5/10', '88/100', 'Phát âm rất tốt, giao tiếp tự tin',
    '', '', '', '', '', '',
  ],
];

/**
 * 1.3. JLPT - Sheet `Data JLPT_Inhouse` (52 cột chuẩn A..AZ)
 * Dùng cho:
 *  - Admin JLPT (`admin/backup_admin_jlpt.xlsx` -> Sheet `Data JLPT_Inhouse`)
 *  - CSKH JLPT  (`cskh/backup_cskh_jlpt_CVHT01.xlsx` -> Sheet `Data JLPT_Inhouse`)
 */
export const JLPT_PROFILE_HEADERS: string[] = [
  'ID', // 1 - A (Khóa chính)
  'Sale', // 2 - B
  'Tình trạng', // 3 - C (Active / Deactive / HV Mới)
  'Ngày nộp học phí', // 4 - D
  'Họ tên HV', // 5 - E
  'Giới tính', // 6 - F
  'SĐT', // 7 - G
  'Email', // 8 - H
  'Mã gói', // 9 - I (Mô hình lớp)
  'Gói SP', // 10 - J (Level N5/N4/N3/N2)
  'Học phí thực nộp', // 11 - K
  'Trạng thái thanh toán', // 12 - L
  'Ghi chú', // 13 - M
  'Ngày khai giảng dự kiến', // 14 - N
  'Tình trạng kích hoạt', // 15 - O
  'CVHT', // 16 - P
  'Mã khóa học', // 17 - Q
  'Ngày bắt đầu học', // 18 - R
  'Trạng thái', // 19 - S (Đang học / Chờ lớp / Bảo lưu / Kết thúc)
  'Giờ học', // 20 - T
  'Buổi học', // 21 - U (T2-4-6 / T3-5-7)
  'Giáo viên', // 22 - V
  'Mã lớp', // 23 - W
  'Tên lớp', // 24 - X
  'Tóm tắt chung thông tin trao đổi', // 25 - Y
  'Lịch hẹn tái chăm (để lọc)', // 26 - Z
  'Điểm hài lòng của học viên (buổi 18)', // 27 - AA
  'Điểm thi thật', // 28 - AB
  'Tình trạng thi thật', // 29 - AC
  'Điểm nóng', // 30 - AD
  'Nội dung chăm sóc sau buổi 1', // 31 - AE
  'Nội dung chăm sóc sau buổi 15', // 32 - AF
  'Nội dung chăm sóc sau buổi 25', // 33 - AG
  'Nội dung chăm sóc sau buổi 30', // 34 - AH
  'Nội dung chăm sóc sau buổi 35', // 35 - AI
  'Nội dung chăm sóc cuối khóa', // 36 - AJ
  'Chăm sóc sau khi khóa học kết thúc', // 37 - AK
  'Kiểm tra lần 1', // 38 - AL
  'Kiểm tra lần 2', // 39 - AM
  'Kiểm tra lần 3', // 40 - AN
  'Kiểm tra lần 4', // 41 - AO
  'Kiểm tra lần 5', // 42 - AP
  'Kiểm tra lần 6', // 43 - AQ
  'Kiểm tra lần 7', // 44 - AR
  'HT đặc biệt lần 1', // 45 - AS
  'HT đặc biệt lần 2', // 46 - AT
  'HT đặc biệt lần 3', // 47 - AU
  'Tái tục', // 48 - AV
  'Mã lớp gần nhất', // 49 - AW
  'Tháng nộp học phí', // 50 - AX
  'Tình trạng đăng ký thi', // 51 - AY
  'Tình trạng thi', // 52 - AZ
];

export const JLPT_PROFILE_TEST_ROWS: Array<Array<string | number>> = [
  [
    '510200301', 'Phạm Hoàng Nam', 'Active', '2026-01-05', 'Lê Hoàng Long', 'Nam', '0978112233', 'hoanglong.jlpt@gmail.com',
    '1-n', 'N3', 6800000, 'Hoàn thành', 'Đăng ký combo N3 mục tiêu kỳ thi T7/2026', '2026-01-12', 'Active', 'CVHT01',
    'JLPT_N3', '2026-01-12', 'Đang học', '19:30', 'T2-T4-T6', 'GV505', 'N3A110005', 'N3A110005',
    'HV học đều, đặt mục tiêu 120/180 điểm JLPT N3', '2026-03-18', '9.5/10', '', 'Chưa thi', 'Không có',
    'B1: HV theo kịp tốc độ giảng của GV505', 'B15: Điểm KT định kỳ tốt, cần tăng tốc phần Đọc hiểu',
    '', '', '', '', '', '85', '82', '88', '', '', '', '',
    'Kèm 1-1 ngữ pháp bài 12', '', '', 'Tiềm năng lên N2', 'N3A110005', '01/2026', 'Đã đăng ký T7/2026', 'Chưa thi',
  ],
  [
    '510200302', 'Vũ Thị Lan', 'Active', '2026-01-08', 'Trần Minh Châu', 'Nữ', '0934556677', 'minhchau.tran@gmail.com',
    '1-n', 'N4', 5200000, 'Hoàn thành', 'Học viên du học kỳ tháng 10', '2026-01-15', 'Active', 'CVHT01',
    'JLPT_N4', '2026-01-15', 'Đang học', '20:00', 'T3-T5-T7', 'GV505', 'N4VIP16001', 'N4VIP16001',
    'HV đôi khi bận làm thêm tối T5, đã nhắc làm BTVN đầy đủ', '2026-03-22', '9.0/10', '', 'Chưa thi', 'Vắng 2 buổi tuần trước',
    'B1: Hào hứng, ghi chép bài cẩn thận', 'B15: Đã nhắc nhở hoàn thành BTVN đầy đủ',
    '', '', '', '', '', '76', '70', '', '', '', '', '',
    'Gửi video record buổi nghỉ', '', '', 'Đang tư vấn lên N3', 'N4VIP16001', '01/2026', 'Đã đăng ký T7/2026', 'Chưa thi',
  ],
];

/**
 * 1.4. JLPT - Sheet `Chuyên cần HV` (24 cột chuẩn = 22 cột A..V + bổ sung ID HV & Mã GV để đồng bộ 2 chiều)
 * Dùng cho:
 *  - Admin JLPT (`admin/backup_admin_jlpt.xlsx` -> Sheet `Chuyên cần HV`)
 *  - File Báo cáo học tập JLPT (`bao_cao_hoc_tap/backup_bao_cao_hoc_tap_jlpt.xlsx` -> Sheet `Chuyên cần HV`)
 */
export const JLPT_CHUYEN_CAN_HEADERS: string[] = [
  'Mã lớp', // 1 - A
  'Họ và tên', // 2 - B
  'Số buổi tham gia', // 3 - C
  'Tổng số buổi đã điểm danh', // 4 - D
  'Tỷ lệ tham gia', // 5 - E
  'Điểm KT trung bình', // 6 - F
  'Số buổi đã làm bài', // 7 - G
  'Chuỗi vắng liên tiếp tối đa', // 8 - H
  'Cảnh báo vắng (≥2 buổi)', // 9 - I
  'Chuỗi không làm bài liên tiếp tối đa', // 10 - J
  'Cảnh báo không làm bài (≥2 buổi)', // 11 - K
  'Thông tin trao đổi với HV', // 12 - L
  'Trạng Thái', // 13 - M
  'CVHT', // 14 - N
  'Khoá', // 15 - O (N5 / N4 / N3 / N2 / N4-LuyenDe / N3-LuyenDe)
  'KT gần nhất (đã qua)', // 16 - P
  'Buổi KT gần nhất', // 17 - Q
  'Cách đây (buổi)', // 18 - R
  'KT tiếp theo', // 19 - S
  'Buổi KT tiếp theo', // 20 - T
  'Còn (buổi)', // 21 - U
  'Cảnh báo lịch KT', // 22 - V
  'ID Học viên', // 23 - W (Bổ sung để định danh chính xác khi backup/sync)
  'Mã GV', // 24 - X (Bổ sung để lọc theo Giáo viên)
];

export const JLPT_CHUYEN_CAN_TEST_ROWS: Array<Array<string | number>> = [
  [
    'N3A110005', 'Lê Hoàng Long', 16, 17, '94%', 85.0, 16, 1, 'Bình thường', 0, 'Bình thường',
    'HV chăm chỉ, điểm KT3 đạt 88/100', 'Đang học', 'CVHT01', 'N3-LuyenDe',
    'KT4 - Luyện đề thực chiến 2', 16, 1, 'KT5 - Luyện đề thực chiến 3', 17, 0,
    '🔔 Sắp kiểm tra KT5 (hôm nay)', '510200301', 'GV505',
  ],
  [
    'N4VIP16001', 'Trần Minh Châu', 11, 15, '73%', 73.0, 10, 2, '⚠ Vắng liên tiếp 2 buổi', 2, '⚠ Không làm BTVN 2 buổi',
    'Đã gọi điện nhắc HV làm bù BTVN bài 13-14', 'Đang học', 'CVHT01', 'N4',
    'KT3 - N4 Đề ôn tập 2', 14, 1, 'KT4 - N4 Đề ôn tập 3', 20, 5,
    '❗ Cần đôn đốc chuyên cần & BTVN', '510200302', 'GV505',
  ],
];

/**
 * 1.5. JLPT - Sheet phụ `Nhật ký nhận xét buổi học` (Lưu nhận xét chi tiết từng buổi của GV JLPT)
 */
export const JLPT_DAILY_REPORT_HEADERS: string[] = [
  'ID Học viên',
  'Họ tên HV',
  'Mã lớp',
  'Khoá học',
  'Mã GV',
  'CVHT',
  'Buổi số',
  'Ngày học',
  'Chuyên cần (O/X)',
  'Tình hình làm BTVN',
  'Điểm bài kiểm tra (nếu có)',
  'Nhận xét chi tiết buổi học của Giáo viên',
];

export const JLPT_DAILY_REPORT_TEST_ROWS: Array<Array<string | number>> = [
  [
    '510200301', 'Lê Hoàng Long', 'N3A110005', 'N3', 'GV505', 'CVHT01', 15, '2026-03-10', 'O', 'Đã làm đủ (9/10)', 88,
    'Kính gửi PH/HV, buổi học ngày 10/03:\n- Nội dung: Ngữ pháp N3 bài 15 + Đọc hiểu đoạn ngắn\n- Ưu điểm: Nhớ từ vựng tốt, phát biểu tích cực\n- Nhược điểm: Cần đọc kỹ câu hỏi phần Dokkai.',
  ],
  [
    '510200302', 'Trần Minh Châu', 'N4VIP16001', 'N4', 'GV505', 'CVHT01', 14, '2026-03-12', 'O', 'Chưa hoàn thành hết', 70,
    'Kính gửi PH/HV, buổi học ngày 12/03:\n- Nội dung: Ôn tập ngữ pháp bài 28-30 & KT3\n- Ưu điểm: Nắm được ý nghĩa mẫu câu\n- Nhược điểm: Chưa làm BTVN phần nghe, cần hoàn thành bù trước thứ 3.',
  ],
];

/**
 * 1.6. ADMIN - Sheet `Tổng hợp Đối soát` & `Thống kê Lệch & Chờ duyệt`
 * Dùng cho: `admin/backup_admin_doi_soat.xlsx`
 */
export const RECONCILIATION_HEADERS: string[] = [
  'Mã buổi học (Session ID)', // 1
  'Năm học', // 2 (Hỗ trợ lọc nhiều năm)
  'Tháng', // 3
  'Ngày học', // 4
  'Ca học (Giờ)', // 5
  'Chương trình', // 6 (KAIWA / JLPT)
  'Mô hình lớp', // 7 (1-1 / 1-2 / 1-n)
  'Mã lớp', // 8
  'Tên lớp', // 9
  'Buổi thứ', // 10
  'ID Học viên', // 11
  'Họ tên HV', // 12
  'Gói học', // 13
  'Mã GV', // 14
  'Tên Giáo viên', // 15
  'Mã CVHT', // 16
  'Tên CVHT', // 17
  'Trạng thái GV chấm', // 18 (1 / A / B / C / D / E)
  'Giá trị gốc GV (Bài học)', // 19
  'Ghi chú của GV', // 20
  'Thời điểm GV chấm', // 21
  'Trạng thái CSKH chấm', // 22 (1 / A / B / C / D / E)
  'Giá trị gốc CSKH', // 23
  'Ghi chú của CSKH', // 24
  'Thời điểm CSKH chấm', // 25
  'Trạng thái Đối soát', // 26 (MATCHED / CONFLICT / PENDING_CS / PENDING_TEACHER / RESOLVED)
  'Kết quả Chốt cuối cùng', // 27 (ATTENDED / ABSENT_APPROVED_A / ...)
  'Mã điểm danh Chốt', // 28 (1 / A / B / C / D / E)
  'Có tính trừ buổi học?', // 29 (Có / Không)
  'Người phân xử (Admin)', // 30
  'Thời điểm phân xử', // 31
  'Ghi chú phân xử lệch', // 32
];

export const RECONCILIATION_MATCHED_TEST_ROWS: Array<Array<string | number>> = [
  [
    'SS-2026-1001', 2026, 3, '2026-03-10', '19:30 - 20:00', 'KAIWA', '1-1', 'BS8_3002', 'BS8_3002', 12,
    '427901798', 'Đỗ Phú Sĩ', 'KW36', 'GV102', 'Trần Thị Mai', 'CVHT01', 'Nguyễn Thị Hạnh',
    'ATTENDED (Có mặt)', '427901798-Bài 12', 'HV phát âm tốt', '2026-03-10 20:05',
    'ATTENDED (Có mặt)', '1', 'Đã xác nhận qua Zoom', '2026-03-10 20:30',
    'MATCHED (Khớp)', 'ATTENDED (Có mặt)', '1', 'Có (-1 buổi)', '', '', '',
  ],
  [
    'SS-2026-1002', 2026, 3, '2026-03-12', '19:30 - 21:00', 'JLPT', '1-n', 'N3A110005', 'N3A110005', 15,
    '510200301', 'Lê Hoàng Long', 'JLPT_N3', 'GV505', 'Sato Yumi', 'CVHT01', 'Nguyễn Thị Hạnh',
    'ATTENDED (Có mặt)', 'N3A110005-Bài 15', 'Làm bài KT đạt 88đ', '2026-03-12 21:10',
    'ABSENT_APPROVED_A (Nghỉ phép A)', 'A', 'CSKH ghi nhầm sang bạn cùng tên', '2026-03-12 21:20',
    'RESOLVED (Đã phân xử)', 'ATTENDED (Có mặt)', '1', 'Có (-1 buổi)', 'Admin Hệ thống', '2026-03-13 09:00',
    'Đã kiểm tra record lớp học, học viên có mặt đầy đủ -> Chốt theo Giáo viên (1)',
  ],
];

export const RECONCILIATION_CONFLICT_TEST_ROWS: Array<Array<string | number>> = [
  [
    'SS-2026-1045', 2026, 3, '2026-03-14', '20:30 - 21:00', 'KAIWA', '1-2', 'KW_N3_202', 'KW_N3_202', 8,
    '427901799', 'Nguyễn Ngọc Ánh', 'KW60', 'GV205', 'Takahashi Ken', 'CVHT01', 'Nguyễn Thị Hạnh',
    'ABSENT_UNAPPROVED_C (Nghỉ sai QĐ C)', '427901799-C', 'HV báo nghỉ sát giờ học 15 phút', '2026-03-14 21:02',
    'ABSENT_APPROVED_A (Nghỉ phép A)', 'A', 'HV nhắn Zalo xin nghỉ từ sáng nhưng CSKH báo muộn', '2026-03-14 21:15',
    'CONFLICT (Đang lệch)', 'Chờ phân xử', '?', 'Chờ chốt', '', '', 'Cần Admin xác minh thời điểm HV nhắn tin xin nghỉ trên Zalo',
  ],
  [
    'SS-2026-1046', 2026, 3, '2026-03-15', '20:00 - 21:30', 'JLPT', '1-n', 'N4VIP16001', 'N4VIP16001', 15,
    '510200302', 'Trần Minh Châu', 'JLPT_N4', 'GV505', 'Sato Yumi', 'CVHT01', 'Nguyễn Thị Hạnh',
    'ATTENDED (Có mặt)', 'N4VIP16001-Bài 15', 'HV vào muộn 10p', '2026-03-15 21:35',
    'Chưa chấm', '', '', '',
    'PENDING_CS (Chờ CSKH chấm)', 'Chờ đối soát', '?', 'Chờ chốt', '', '', 'Chờ CVHT01 đối chiếu điểm danh cuối ngày',
  ],
];

/* ============================================================================
 * 2. HELPER DỰNG SHEET ĐIỂM DANH THEO NĂM (CÓ CỘT CỐ ĐỊNH + BLOCK THÁNG + NGÀY)
 * ============================================================================ */

const KAIWA_ATTENDANCE_FIXED_HEADERS: string[] = [
  'ID', // 1
  'Họ tên HV', // 2
  'Gói học', // 3
  'Nội dung khoá', // 4
  'Tổng số buổi', // 5
  'Khoá học', // 6
  'Email', // 7
  'Mô hình', // 8
  'Số buổi còn lại', // 9
  'Ngày bắt đầu học', // 10
  'Trạng thái', // 11
  'Ngày kết thúc/Bảo lưu', // 12
  'Giờ học (1)', // 13
  'Lịch học (1)', // 14
  'Thời lượng buổi học (1)', // 15
  'Giờ học (2)', // 16
  'Lịch học (2)', // 17
  'Thời lượng buổi học (2)', // 18
  'Vòng lặp', // 19
  'Ngày học', // 20
  'Giáo viên', // 21
  'Mã GV', // 22
  'Tên lớp', // 23
  'Tổng số buổi đã học (tất cả các năm)', // 24 (Cộng dồn nhiều năm)
  'Tổng số buổi đã học (trong năm)', // 25
  'Tổng số buổi HV nghỉ có phép (A)', // 26
  'Tổng số buổi HV nghỉ không phép (C)', // 27
  'Tổng số buổi GV nghỉ (D)', // 28
];

const JLPT_ATTENDANCE_FIXED_HEADERS: string[] = [
  'Mã lớp', // 1 - A
  'ID học viên', // 2 - B
  'Tên học viên', // 3 - C
  'Trạng thái', // 4 - D
  'Giờ học', // 5 - E
  'Ghi chú lớp (Cột phụ F)', // 6 - F
  'CVHT', // 7 - G
  'Lịch học', // 8 - H
  'Thời lượng buổi học', // 9 - I
  'Mã GV', // 10 - J
  'Tổng số buổi', // 11 - K
  'Số buổi đã học', // 12 - L
];

const TEACHER_ATTENDANCE_FIXED_HEADERS: string[] = [
  'Mô hình lớp', // 1 - A
  'Mã học viên/Mã lớp', // 2 - B
  'Họ tên học viên', // 3 - C
  'Tổng số buổi', // 4 - D
  'Số buổi còn lại', // 5 - E
  'Thời gian', // 6 - F
];

const MONTH_SUMMARY_HEADERS_CS: string[] = [
  'Số buổi đã học',
  'Số buổi xin nghỉ có phép\nA',
  'Số buổi bảo lưu\nB',
  'Số buổi nghỉ sai quy định\nC',
  'Số buổi GV xin nghỉ\nD',
  'Số buổi lỗi kĩ thuật \nE',
];

const MONTH_SUMMARY_HEADERS_TEACHER: string[] = [
  'Số giờ hoàn thành\n完了時間数',
  ...MONTH_SUMMARY_HEADERS_CS,
];

/**
 * Tạo worksheet Điểm danh chuẩn (hỗ trợ CSKH Kaiwa 28 cột, JLPT/Chốt 12 cột, Giáo viên 6 cột)
 * Để file mẫu nhẹ và dễ đọc nhưng vẫn parse chuẩn 100% qua `detectJlptMonthBlocks`,
 * khởi tạo 3 tháng tiêu biểu của năm `year` (Tháng 1, Tháng 2, Tháng 3) với đầy đủ các ngày thực tế.
 */
function buildAttendanceSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  layout: 'KAIWA_CS' | 'JLPT_OR_FINAL' | 'TEACHER',
  year: number,
  programForData: 'KAIWA' | 'JLPT',
  monthsToGenerate: number[] = [1, 2, 3]
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: 'frozen', xSplit: layout === 'TEACHER' ? 3 : 3, ySplit: 2 }],
  });

  const fixedHeaders =
    layout === 'KAIWA_CS'
      ? KAIWA_ATTENDANCE_FIXED_HEADERS
      : layout === 'TEACHER'
        ? TEACHER_ATTENDANCE_FIXED_HEADERS
        : JLPT_ATTENDANCE_FIXED_HEADERS;

  const summaryHeaders =
    layout === 'TEACHER' ? MONTH_SUMMARY_HEADERS_TEACHER : MONTH_SUMMARY_HEADERS_CS;

  const row1 = ws.getRow(1);
  const row2 = ws.getRow(2);

  // Ghi vùng cột cố định
  row1.getCell(1).value = `NĂM ${year}`;
  fixedHeaders.forEach((h, idx) => {
    const col = idx + 1;
    row2.getCell(col).value = h;
    ws.getColumn(col).width = Math.max(14, Math.min(26, h.length + 4));
  });

  let cursorCol = fixedHeaders.length + 1;

  // Map lưu vị trí cột của một vài ngày trong Tháng 1, 2, 3 để điền data_test
  const sampleDateCols: Record<string, number> = {};
  const monthSummaryColMap: Record<number, { startCol: number }> = {};

  for (const m of monthsToGenerate) {
    const blockStartCol = cursorCol;
    monthSummaryColMap[m] = { startCol: blockStartCol };
    row1.getCell(blockStartCol).value = `THÁNG ${m}/${year}`;

    // 6 (hoặc 7) cột tổng kết đầu tháng
    for (const sh of summaryHeaders) {
      row2.getCell(cursorCol).value = sh;
      ws.getColumn(cursorCol).width = 14;
      cursorCol++;
    }

    // Các cột ngày trong tháng
    const daysInMonth = new Date(year, m, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const cell = row2.getCell(cursorCol);
      cell.value = new Date(year, m - 1, d);
      cell.numFmt = 'dd/mm/yyyy';
      ws.getColumn(cursorCol).width = 11;

      const key = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      sampleDateCols[key] = cursorCol;
      cursorCol++;
    }
  }

  // Style cho dòng 1 & 2
  row1.height = 22;
  row2.height = 32;
  row1.font = { bold: true, color: { argb: 'FF1E3A8A' } };
  row2.font = { bold: true, size: 10 };
  row2.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  // Điền 2 dòng data_test (Row 3 & Row 4)
  const r3 = ws.getRow(3);
  const r4 = ws.getRow(4);

  if (layout === 'KAIWA_CS') {
    const row3Fixed = [
      '427901798', 'Đỗ Phú Sĩ', 'KW36', 'Giao tiếp phản xạ N4', 36, 'GV Việt + Nhật',
      'dophusi@gmail.com', '1-1', 24, '2026-01-15', 'Đang học', '',
      '19:30', 'T2-T4-T6', 30, '', '', '', 'Tuần', 'T2, T4, T6',
      'Trần Thị Mai', 'GV102', 'BS8_3002', 12, 10, 1, 0, 0,
    ];
    const row4Fixed = [
      '427901799', 'Nguyễn Ngọc Ánh', 'KW60', 'Kaiwa thương mại N3', 60, 'GV Nhật',
      'ngocanh.jp@gmail.com', '1-2', 52, '2026-02-05', 'Đang học', '',
      '20:30', 'T3-T5-T7', 30, '', '', '', 'Tuần', 'T3, T5, T7',
      'Takahashi Ken', 'GV205', 'KW_N3_202', 8, 8, 0, 1, 0,
    ];
    row3Fixed.forEach((v, i) => { r3.getCell(i + 1).value = v; });
    row4Fixed.forEach((v, i) => { r4.getCell(i + 1).value = v; });
  } else if (layout === 'JLPT_OR_FINAL') {
    if (programForData === 'KAIWA') {
      const row3Fixed = [
        'BS8_3002', '427901798', 'Đỗ Phú Sĩ', 'Đang học', '19:30', '',
        'CVHT01', 'T2-T4-T6', 30, 'GV102', 36, 12,
      ];
      const row4Fixed = [
        'KW_N3_202', '427901799', 'Nguyễn Ngọc Ánh', 'Đang học', '20:30', '',
        'CVHT01', 'T3-T5-T7', 30, 'GV205', 60, 8,
      ];
      row3Fixed.forEach((v, i) => { r3.getCell(i + 1).value = v; });
      row4Fixed.forEach((v, i) => { r4.getCell(i + 1).value = v; });
    } else {
      const row3Fixed = [
        'N3A110005', '510200301', 'Lê Hoàng Long', 'Đang học', '19:30', '',
        'CVHT01', 'T2-T4-T6', 90, 'GV505', 48, 16,
      ];
      const row4Fixed = [
        'N4VIP16001', '510200302', 'Trần Minh Châu', 'Đang học', '20:00', '',
        'CVHT01', 'T3-T5-T7', 90, 'GV505', 38, 11,
      ];
      row3Fixed.forEach((v, i) => { r3.getCell(i + 1).value = v; });
      row4Fixed.forEach((v, i) => { r4.getCell(i + 1).value = v; });
    }
  } else {
    // TEACHER (`2026 スケジュール`)
    const row3Fixed = ['1-1', '427901798', 'Đỗ Phú Sĩ', 36, 24, '19:30 - 20:00'];
    const row4Fixed = ['1-n', 'N3A110005', 'Lê Hoàng Long (Lớp N3A110005)', 48, 32, '19:30 - 21:00'];
    row3Fixed.forEach((v, i) => { r3.getCell(i + 1).value = v; });
    row4Fixed.forEach((v, i) => { r4.getCell(i + 1).value = v; });
  }

  // Ghi điểm danh mẫu vào các ngày trong Tháng 1, 2, 3
  const m1Start = monthSummaryColMap[1]?.startCol;
  if (m1Start) {
    if (layout === 'TEACHER') {
      // completedHours, attended, A, B, C, D, E
      [1.5, 3, 1, 0, 0, 0, 0].forEach((v, i) => { r3.getCell(m1Start + i).value = v; });
      [4.5, 3, 0, 0, 1, 0, 0].forEach((v, i) => { r4.getCell(m1Start + i).value = v; });
    } else {
      // attended, A, B, C, D, E
      [3, 1, 0, 0, 0, 0].forEach((v, i) => { r3.getCell(m1Start + i).value = v; });
      [2, 0, 0, 1, 0, 0].forEach((v, i) => { r4.getCell(m1Start + i).value = v; });
    }
  }

  const d1 = sampleDateCols[`${year}-01-15`];
  const d2 = sampleDateCols[`${year}-01-17`];
  const d3 = sampleDateCols[`${year}-01-20`];
  const d4 = sampleDateCols[`${year}-01-22`];

  if (layout === 'TEACHER') {
    if (d1) r3.getCell(d1).value = '427901798-Bài 1';
    if (d2) r3.getCell(d2).value = '427901798-Bài 2';
    if (d3) r3.getCell(d3).value = '427901798-A';
    if (d4) r3.getCell(d4).value = '427901798-Bài 3';

    if (d1) r4.getCell(d1).value = 'N3A110005-Bài 1';
    if (d2) r4.getCell(d2).value = 'N3A110005-Bài 2';
    if (d3) r4.getCell(d3).value = 'N3A110005-C';
    if (d4) r4.getCell(d4).value = 'N3A110005-Bài 3';
  } else {
    if (d1) r3.getCell(d1).value = '1';
    if (d2) r3.getCell(d2).value = '1';
    if (d3) r3.getCell(d3).value = 'A';
    if (d4) r3.getCell(d4).value = '1';

    if (d1) r4.getCell(d1).value = '1';
    if (d2) r4.getCell(d2).value = 'C';
    if (d4) r4.getCell(d4).value = '1';
  }

  return ws;
}

/**
 * Helper dựng một sheet bảng chuẩn (Header ở headerRow + 2 dòng data_test ngay dưới)
 */
function buildStandardTableSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  headers: string[],
  testRows: Array<Array<string | number>>,
  options?: {
    headerRow?: number;
    bannerTitle?: string;
    groupHeaders?: Array<{ title: string; span: number }>;
  }
): ExcelJS.Worksheet {
  const headerRowNum = options?.headerRow ?? 2;
  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: 'frozen', xSplit: 2, ySplit: headerRowNum }],
  });

  if (options?.groupHeaders && headerRowNum >= 2) {
    const groupRow = ws.getRow(headerRowNum - 1);
    let colCursor = 1;
    for (const g of options.groupHeaders) {
      groupRow.getCell(colCursor).value = g.title;
      if (g.span > 1) {
        ws.mergeCells(headerRowNum - 1, colCursor, headerRowNum - 1, colCursor + g.span - 1);
      }
      colCursor += g.span;
    }
    groupRow.height = 24;
    groupRow.font = { bold: true, size: 10, color: { argb: 'FF0F172A' } };
    groupRow.alignment = { vertical: 'middle', horizontal: 'center' };
  } else if (options?.bannerTitle && headerRowNum >= 2) {
    const bannerRow = ws.getRow(1);
    bannerRow.getCell(1).value = options.bannerTitle;
    bannerRow.height = 24;
    bannerRow.font = { bold: true, size: 11, color: { argb: 'FF1E3A8A' } };
  }

  const hRow = ws.getRow(headerRowNum);
  headers.forEach((h, idx) => {
    const col = idx + 1;
    const cell = hRow.getCell(col);
    cell.value = h;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' },
    };
    ws.getColumn(col).width = Math.max(14, Math.min(34, h.length + 5));
  });
  hRow.height = 30;
  hRow.font = { bold: true, size: 10, color: { argb: 'FF0F172A' } };
  hRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  testRows.forEach((rowValues, rIdx) => {
    const dataRow = ws.getRow(headerRowNum + 1 + rIdx);
    rowValues.forEach((val, cIdx) => {
      dataRow.getCell(cIdx + 1).value = val;
    });
    dataRow.height = 22;
  });

  return ws;
}

/* ============================================================================
 * 3. HÀM CHÍNH TẠO TOÀN BỘ THƯ MỤC & FILE TRONG `docs/data/import/`
 * ============================================================================ */

export async function generateAllBackupTemplates(baseDir = ROOT_DIR): Promise<string[]> {
  const dirs = [
    path.join(baseDir, 'admin'),
    path.join(baseDir, 'cskh'),
    path.join(baseDir, 'giao_vien'),
    path.join(baseDir, 'bao_cao_hoc_tap'),
  ];
  for (const d of dirs) {
    fs.mkdirSync(d, { recursive: true });
  }

  const createdFiles: string[] = [];

  // ---------------------------------------------------------------------------
  // NHÓM 1: ADMIN (3 Files)
  // ---------------------------------------------------------------------------

  // 1.1. Admin Kaiwa: 1 sheet data HV + 1 sheet Báo cáo học tập Kaiwa + Điểm danh chốt theo năm (2025, 2026)
  {
    const wb = new ExcelJS.Workbook();
    buildStandardTableSheet(wb, '1.Chăm sóc', KAIWA_PROFILE_HEADERS, KAIWA_PROFILE_TEST_ROWS, {
      headerRow: 3,
      bannerTitle: 'SỔ TỔNG HỌC VIÊN KAIWA TOÀN TRUNG TÂM (ADMIN)',
    });
    buildStandardTableSheet(
      wb,
      'Báo cáo học tập Kaiwa',
      KAIWA_STUDY_REPORT_HEADERS,
      KAIWA_STUDY_REPORT_TEST_ROWS,
      {
        headerRow: 2,
        groupHeaders: KAIWA_STUDY_REPORT_GROUPS,
      }
    );
    buildAttendanceSheet(wb, 'Điểm danh chốt 2026', 'JLPT_OR_FINAL', 2026, 'KAIWA');
    buildAttendanceSheet(wb, 'Điểm danh chốt 2025', 'JLPT_OR_FINAL', 2025, 'KAIWA');

    const filePath = path.join(baseDir, 'admin', 'backup_admin_kaiwa.xlsx');
    await wb.xlsx.writeFile(filePath);
    createdFiles.push(filePath);
  }

  // 1.2. Admin JLPT: 1 sheet Data JLPT_Inhouse + 1 sheet Chuyên cần HV + Điểm danh chốt theo năm (2025, 2026)
  {
    const wb = new ExcelJS.Workbook();
    buildStandardTableSheet(wb, 'Data JLPT_Inhouse', JLPT_PROFILE_HEADERS, JLPT_PROFILE_TEST_ROWS, {
      headerRow: 2,
      bannerTitle: 'SỔ TỔNG HỌC VIÊN JLPT TOÀN TRUNG TÂM (ADMIN)',
    });
    buildStandardTableSheet(wb, 'Chuyên cần HV', JLPT_CHUYEN_CAN_HEADERS, JLPT_CHUYEN_CAN_TEST_ROWS, {
      headerRow: 2,
      bannerTitle: 'BÁO CÁO HỌC TẬP & CHUYÊN CẦN HỌC VIÊN JLPT (CHUẨN A -> X)',
    });
    buildAttendanceSheet(wb, 'Điểm danh chốt 2026', 'JLPT_OR_FINAL', 2026, 'JLPT');
    buildAttendanceSheet(wb, 'Điểm danh chốt 2025', 'JLPT_OR_FINAL', 2025, 'JLPT');

    const filePath = path.join(baseDir, 'admin', 'backup_admin_jlpt.xlsx');
    await wb.xlsx.writeFile(filePath);
    createdFiles.push(filePath);
  }

  // 1.3. Admin Đối soát: Tổng hợp Đối soát + Thống kê Lệch & Chờ duyệt
  {
    const wb = new ExcelJS.Workbook();
    buildStandardTableSheet(
      wb,
      'Tổng hợp Đối soát',
      RECONCILIATION_HEADERS,
      RECONCILIATION_MATCHED_TEST_ROWS,
      {
        headerRow: 2,
        bannerTitle: 'SỔ ĐỐI SOÁT ĐIỂM DANH TỔNG HỢP (CSKH vs GIÁO VIÊN)',
      }
    );
    buildStandardTableSheet(
      wb,
      'Thống kê Lệch & Chờ duyệt',
      RECONCILIATION_HEADERS,
      RECONCILIATION_CONFLICT_TEST_ROWS,
      {
        headerRow: 2,
        bannerTitle: 'DANH SÁCH BUỔI HỌC ĐANG LỆCH (CONFLICT) HOẶC CHỜ CHẤM (PENDING)',
      }
    );

    const filePath = path.join(baseDir, 'admin', 'backup_admin_doi_soat.xlsx');
    await wb.xlsx.writeFile(filePath);
    createdFiles.push(filePath);
  }

  // ---------------------------------------------------------------------------
  // NHÓM 2: CSKH (File 1A Kaiwa & File 1B JLPT)
  // ---------------------------------------------------------------------------

  // 2A. Sổ CSKH Kaiwa (`backup_cskh_kaiwa_CVHT01.xlsx`)
  {
    const wb = new ExcelJS.Workbook();
    buildStandardTableSheet(wb, '1.Chăm sóc', KAIWA_PROFILE_HEADERS, KAIWA_PROFILE_TEST_ROWS, {
      headerRow: 3,
      bannerTitle: 'SỔ CHĂM SÓC HỌC VIÊN KAIWA — CVHT01',
    });
    buildAttendanceSheet(wb, '3.Chấm buổi', 'KAIWA_CS', 2026, 'KAIWA');
    buildAttendanceSheet(wb, 'Điểm danh chốt', 'JLPT_OR_FINAL', 2026, 'KAIWA');

    const filePath = path.join(baseDir, 'cskh', 'backup_cskh_kaiwa_CVHT01.xlsx');
    await wb.xlsx.writeFile(filePath);
    createdFiles.push(filePath);
  }

  // 2B. Sổ CSKH JLPT (`backup_cskh_jlpt_CVHT01.xlsx`)
  {
    const wb = new ExcelJS.Workbook();
    buildStandardTableSheet(wb, 'Data JLPT_Inhouse', JLPT_PROFILE_HEADERS, JLPT_PROFILE_TEST_ROWS, {
      headerRow: 2,
      bannerTitle: 'SỔ CHĂM SÓC HỌC VIÊN JLPT — CVHT01',
    });
    buildAttendanceSheet(wb, 'Chấm buổi', 'JLPT_OR_FINAL', 2026, 'JLPT');
    buildAttendanceSheet(wb, 'Điểm danh chốt', 'JLPT_OR_FINAL', 2026, 'JLPT');

    const filePath = path.join(baseDir, 'cskh', 'backup_cskh_jlpt_CVHT01.xlsx');
    await wb.xlsx.writeFile(filePath);
    createdFiles.push(filePath);
  }

  // ---------------------------------------------------------------------------
  // NHÓM 3: GIÁO VIÊN (`diem_danh_gv_GV505.xlsx` - giữ nguyên cấu trúc `2026 スケジュール`)
  // ---------------------------------------------------------------------------
  {
    const wb = new ExcelJS.Workbook();
    buildAttendanceSheet(wb, '2026 スケジュール', 'TEACHER', 2026, 'JLPT');

    const filePath = path.join(baseDir, 'giao_vien', 'diem_danh_gv_GV505.xlsx');
    await wb.xlsx.writeFile(filePath);
    createdFiles.push(filePath);
  }

  // ---------------------------------------------------------------------------
  // NHÓM 4: BÁO CÁO HỌC TẬP HỌC VIÊN (Study Report Kaiwa & JLPT)
  // ---------------------------------------------------------------------------

  // 4A. Báo cáo học tập Kaiwa (`backup_bao_cao_hoc_tap_kaiwa.xlsx`)
  {
    const wb = new ExcelJS.Workbook();
    buildStandardTableSheet(
      wb,
      'Báo cáo học tập Kaiwa',
      KAIWA_STUDY_REPORT_HEADERS,
      KAIWA_STUDY_REPORT_TEST_ROWS,
      {
        headerRow: 2,
        groupHeaders: KAIWA_STUDY_REPORT_GROUPS,
      }
    );

    const filePath = path.join(baseDir, 'bao_cao_hoc_tap', 'backup_bao_cao_hoc_tap_kaiwa.xlsx');
    await wb.xlsx.writeFile(filePath);
    createdFiles.push(filePath);
  }

  // 4B. Báo cáo học tập JLPT (`backup_bao_cao_hoc_tap_jlpt.xlsx`)
  {
    const wb = new ExcelJS.Workbook();
    buildStandardTableSheet(wb, 'Chuyên cần HV', JLPT_CHUYEN_CAN_HEADERS, JLPT_CHUYEN_CAN_TEST_ROWS, {
      headerRow: 2,
      bannerTitle: 'BÁO CÁO CHUYÊN CẦN HỌC VIÊN JLPT (24 CỘT CHUẨN)',
    });
    buildStandardTableSheet(
      wb,
      'Nhật ký nhận xét buổi học',
      JLPT_DAILY_REPORT_HEADERS,
      JLPT_DAILY_REPORT_TEST_ROWS,
      {
        headerRow: 2,
        bannerTitle: 'NHẬT KÝ NHẬN XÉT BUỔI HỌC JLPT THEO NGÀY',
      }
    );

    const filePath = path.join(baseDir, 'bao_cao_hoc_tap', 'backup_bao_cao_hoc_tap_jlpt.xlsx');
    await wb.xlsx.writeFile(filePath);
    createdFiles.push(filePath);
  }

  return createdFiles;
}

if (require.main === module) {
  generateAllBackupTemplates()
    .then((files) => {
      console.log(`Đã tạo thành công ${files.length} file Excel mẫu tại: ${ROOT_DIR}`);
      files.forEach((f) => console.log('  ✔', path.relative(process.cwd(), f)));
    })
    .catch((err) => {
      console.error('Lỗi khi tạo file mẫu:', err);
      process.exit(1);
    });
}
