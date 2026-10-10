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

## Cách đóng câu hỏi

Khi người dùng xác nhận:

1. đổi trạng thái thành `RESOLVED`;
2. ghi câu trả lời ngắn trong bảng hoặc mục chi tiết;
3. cập nhật `decisions/summary.md`/ADR nếu đó là decision lâu dài;
4. cập nhật phase/spec bị ảnh hưởng.
