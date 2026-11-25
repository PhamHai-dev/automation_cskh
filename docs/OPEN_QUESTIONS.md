# Open Questions

AI không được tự quyết các mục `WAITING_USER` nếu quyết định ảnh hưởng implementation.

| ID | Trạng thái | Chủ đề | Câu hỏi / quyết định cần chốt | Phase bị ảnh hưởng |
| --- | --- | --- | --- | --- |
| Q-001 | RESOLVED | External ID | Cột `ID` Sheet 1/3 là ID cố định, bất biến của `Student`; dùng xuyên các Enrollment. | 1, 5 |
| Q-002 | RESOLVED | Attendance rule | Cập nhật 2026-10-10: chỉ Attendance `MATCHED/RESOLVED` mới có hiệu lực; `ATTENDED` và C trừ đúng 1 buổi, A/B/D/E không trừ. Mỗi Attendance là một ClassSession, không dùng `session_count`. | 4, 8 |
| Q-003 | RESOLVED | Session identity | Điểm danh theo `EnrollmentClass + ClassSession`; số dương trong Excel chỉ biểu thị `ATTENDED` cho đúng một buổi. | 4, 5, 8 |
| Q-004 | RESOLVED | Attendance correction | Cập nhật 2026-10-10: cho phép sửa final trong scope, bắt buộc audit. Nếu hai nguồn lệch thì về `CONFLICT`; hủy delivery còn chờ, không hoàn tác delivery đã gửi. | 4, 5, 8 |
| Q-005 | RESOLVED | Multi-role | Endpoint hỗ trợ nhiều role dùng union data scope; quyền ghi vẫn kiểm tra role phù hợp với hành động. | 2 |
| Q-006 | RESOLVED | UI brand | Primary `#2563EB`, accent `#14B8A6`; chỉ dùng qua semantic token tập trung. | 0, frontend |
| Q-007 | RESOLVED | Zalo relation | Không có relation hợp lệ thì không gửi; tạo delivery `skipped` có lý do, cảnh báo CS và không tự retry đến khi relation được xác nhận. | 7, 8 |
| Q-008 | RESOLVED | MessageRule precedence | Rule riêng Enrollment override rule mặc định Package khi cùng session number; chỉ tạo một delivery. Không có rule Enrollment thì dùng Package. | 8 |
| Q-009 | RESOLVED | Đồng nhất Sale & CSKH | Sale và nhân viên CSKH là cùng một vai trò (`CS`); cột Sale trong Sheet 1 ánh xạ vào tài khoản đăng nhập (email) do Admin tạo. | 2, 3, frontend |
| Q-010 | RESOLVED | Ma trận Điểm danh Lịch Ngày | Bỏ số thứ tự buổi, hiển thị Thứ + Ngày thực tế, mặc định Tháng hiện tại, lọc Tuần/Tháng/Năm, bỏ cột chỉ số chuyên cần ĐH/BT, cố định 11 cột thông tin bên trái. | 4, frontend |
| Q-011 | RESOLVED | Đối soát import Attendance | Cập nhật 2026-10-10: cả hai workbook đều preview rồi commit; chỉ match ClassSession có sẵn theo mã HV + lớp trong scope + ngày + giờ; không tự tạo/đoán dữ liệu. | 4, 5, frontend |
| Q-012 | RESOLVED | Bảng Học viên Sheet 1 | Chuẩn hóa 28 cột theo cấu trúc Sheet 1, highlight badge đỏ cảnh báo nợ buổi âm, tự động lọc học viên theo Sale phụ trách nếu role là `CS`. | 3, frontend |
| Q-013 | RESOLVED | Nhập/Xuất Excel Tất cả Vai trò | Mở quyền import cho ADMIN, MANAGE, CS, TEACHER theo endpoint phù hợp. Attendance import luôn preview/commit, chỉ ghi ClassSession đã tồn tại trong scope; dòng không match hoặc ngoài scope được báo lỗi và bỏ qua. | 4, 5, frontend |
| Q-015 | RESOLVED | Chuẩn hóa Gói học | Chốt 2026-11-17: Kaiwa Gói học và JLPT Gói SP cùng lưu qua `Enrollment.package_id -> Package`; JLPT Mã khóa học tách riêng tại `Enrollment.course_code`; migrate dữ liệu cũ nhưng chưa chạy trên DB hiện tại. | 3, 5, frontend |
| Q-016 | RESOLVED | Nhật ký học tập JLPT | Chốt 2026-11-23: tái sử dụng Attendance, thêm 4 tiêu chí JLPT riêng, template Buổi/KT động, NKHT import/sync/normalization/export theo rule chi tiết bên dưới. | 4, 5, JLPT enhancement |
| Q-017 | RESOLVED | Backfill Class JLPT legacy | Dùng singleton template; course code chỉ xét EnrollmentClass ACTIVE; level chỉ tự đề xuất khi class code và mọi active course code cùng chỉ về một N2–N5, ngoại lệ xử lý thủ công. | JLPT rollout |

## Q-014 — Điều hướng Đồng bộ dữ liệu / Sao lưu dữ liệu

- Trạng thái: `RESOLVED`.
- Chốt ngày 2026-11-10 qua phỏng vấn UI và yêu cầu triển khai trực tiếp.
- Sidebar/submenu là điều hướng chính; bỏ thanh tab ngang trùng lặp trong nội dung trang Đồng bộ.
- Hướng thiết kế ưu tiên laptop 13–14 inch: header xanh nhạt, bốn KPI pastel có icon, nhóm dữ liệu dạng thanh chọn có số lượng.
- Màu nhận diện luồng chỉ dùng ở icon, badge và filter; không dùng viền dọc màu hoặc tô toàn bộ dòng.
- Bảng phẳng hiển thị trực tiếp các cột Kết nối/Nơi lưu, Phạm vi, Tự động, Kết quả và Thao tác; không có dropdown chi tiết theo hàng.
- Cột Tự động chỉ hiển thị công tắc; lịch chạy nằm trong tooltip. Cấu hình, lịch sử, tải Excel và xóa đặt trong menu phụ theo điều kiện/quyền hiện có.
- Tìm kiếm/chương trình/trạng thái luôn hiện; bộ lọc phụ thu gọn. Form một trang có nhóm nâng cao và footer lưu/hủy; lịch sử gom số liệu thành tóm tắt.
- Áp dụng cả Đồng bộ và Sao lưu; không đổi API, dữ liệu, phạm vi tác vụ hay quy trình xem trước/xác nhận.

## Q-016 — Nhật ký học tập JLPT và workbook NKHT

- Trạng thái: `RESOLVED`.
- Chốt ngày 2026-11-23 sau khi đối chiếu sheet `NKHT N4` trong `giao_vien_JLPT.xlsx`.
- Web tiếp tục dùng các Attendance status chuẩn; `O`, `X`, `0.5X` chỉ là ký hiệu tương thích import/sync/export. `0.5X` map `ATTENDED` và không xuất lại.
- Sáu dòng NKHT được lưu bằng Attendance cho Chuyên cần, `Attendance.teacher_note` cho Ghi chú và `JlptLearningRecord` cho Chuẩn bị, Thái độ, BTVN, số câu đúng.
- Buổi kiểm tra không hardcode: toàn bộ Class JLPT N2–N5 dùng một template toàn cục; template chỉ áp metadata loại/tên lên ClassSession cùng `session_number`, không tự tạo/xóa/đổi lịch.
- Chỉ ADMIN import NKHT và cấu hình/chạy Google Sheet sync. ADMIN/MANAGE/CS được export trong scope; TEACHER không export. Đây là ngoại lệ hẹp của luồng NKHT, không thay quyền import/export Sheet 1/Sheet 3 ở Q-013.
- Import thủ công bắt buộc preview, xử lý hết X có ghi chú và conflict trước confirm; ô trống giữ DB. Sync tự động coi Sheet là nguồn tuyệt đối; ô trống xóa trường tương ứng nhưng Attendance vẫn chỉ cập nhật phía giáo viên rồi reconciliation.
- X có ghi chú tự do và header lệch tạo hàng chờ chuẩn hóa. ADMIN giải quyết toàn bộ; MANAGE chỉ trong data scope.
- Export dùng đúng một sheet cho mỗi level. Mọi lớp dùng cùng template nên không có kiểm tra tương thích template; marker `[STATUS:...]` chỉ tồn tại trong file để round-trip, không lưu/hiển thị trên web.
- Migration hiện tại chỉ được viết và kiểm tra tĩnh/test DB clone; không chạy trên DB đang dùng do lịch sử migration chưa đồng nhất.

## Q-017 — Chính sách backfill Class JLPT legacy

- Trạng thái: `RESOLVED`.
- Chốt ngày 2026-11-23.
- Audit ban đầu chỉ đọc ghi nhận 1.399 lớp gồm 1.071 Kaiwa và 328 JLPT; không có lớp mixed/unknown. 321 lớp JLPT có `Class.level` legacy và 56 lớp có nhiều course code lịch sử.
- Template không phụ thuộc level/course code: toàn bộ JLPT N2–N5 dùng một singleton template `GLOBAL`; Class không có `jlpt_template_id`.
- Khi chuẩn hóa course code, chỉ xét EnrollmentClass JLPT đang `ACTIVE`; bỏ qua course code lịch sử. Một mã duy nhất được chọn; không có hoặc có nhiều mã ACTIVE thì chuyển ADMIN xử lý thủ công.
- Level dùng để chọn sheet export. Chỉ tự đề xuất N2–N5 khi class code và mọi course code ACTIVE đều chứa đúng một level và cùng kết quả; Combo, thiếu hoặc xung đột chuyển ADMIN xử lý.
- Script chỉ tạo báo cáo dry-run và `proposedLevel`; không ghi DB. ADMIN phải duyệt báo cáo trước bất kỳ backfill nào.

## Cách đóng câu hỏi

### Q-016 — Trùng nhóm chăm sóc JLPT

- `RESOLVED` ngày 2026-11-20: người dùng chọn “Báo trùng, chọn thủ công”. Nhiều nhóm cùng CVHT + mã học viên + chương trình không được tự chọn theo hậu tố hoặc nhóm đầu tiên. Người dùng làm rõ: hậu tố JLPT là nội dung tự do, không tương đồng với bất kỳ trường dữ liệu học viên nào; `VIPN4N5`, `N54Video` đều hợp lệ. So khớp phần lõi CSKH + mã + tên học viên; dùng tên đã biết để xác định điểm bắt đầu hậu tố. ADMIN/MANAGE cấu hình mẫu tên; danh sách ghi chú chỉ là ví dụ tùy chọn, không giới hạn nhận diện. GROUP lưu riêng KAIWA/JLPT.

Khi người dùng xác nhận:

1. đổi trạng thái thành `RESOLVED`;
2. ghi câu trả lời ngắn trong bảng hoặc mục chi tiết;
3. cập nhật `decisions/summary.md`/ADR nếu đó là decision lâu dài;
4. cập nhật phase/spec bị ảnh hưởng.

## Attendance dropdown — RESOLVED (2026-11-25)

User xác nhận: bấm + chỉ mở dropdown rồi chọn trạng thái; gỡ ca chỉ theo học viên/phía đang thao tác, giữ phía khác và học viên khác. Phản hồi tiếp theo đổi nhãn Xóa thành `-`, thu gọn, thêm màu và bỏ icon. Không có câu hỏi chờ xác nhận cho UI này.
