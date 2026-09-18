# Open Questions

AI không được tự quyết các mục `WAITING_USER` nếu quyết định ảnh hưởng implementation.

| ID | Trạng thái | Chủ đề | Câu hỏi / quyết định cần chốt | Phase bị ảnh hưởng |
| --- | --- | --- | --- | --- |
| Q-001 | RESOLVED | External ID | Cột `ID` Sheet 1/3 là ID cố định, bất biến của `Student`; dùng xuyên các Enrollment. | 1, 5 |
| Q-002 | RESOLVED | Attendance rule | A/B/C/D/E đều trừ buổi; không tính completed, không trigger message. A: nghỉ có phép; B: bảo lưu; C: nghỉ sai quy định; D: GV xin nghỉ; E: lỗi kỹ thuật. | 4, 8 |
| Q-003 | RESOLVED | Session numbering | `session_number` theo `Enrollment`, tăng liên tục trong hành trình học và không reset khi chuyển lớp. | 4, 5, 8 |
| Q-004 | RESOLVED | Import correction | Admin sửa mọi dữ liệu import; Manage sửa trong scope nhóm; CS không sửa trực tiếp. MVP không khóa ngày/kỳ; mọi sửa đổi phải audit. | 5 |
| Q-005 | RESOLVED | Multi-role | Endpoint hỗ trợ nhiều role dùng union data scope; quyền ghi vẫn kiểm tra role phù hợp với hành động. | 2 |
| Q-006 | RESOLVED | UI brand | Primary `#2563EB`, accent `#14B8A6`; chỉ dùng qua semantic token tập trung. | 0, frontend |
| Q-007 | RESOLVED | Zalo relation | Không có relation hợp lệ thì không gửi; tạo delivery `skipped` có lý do, cảnh báo CS và không tự retry đến khi relation được xác nhận. | 7, 8 |
| Q-008 | RESOLVED | MessageRule precedence | Rule riêng Enrollment override rule mặc định Package khi cùng session number; chỉ tạo một delivery. Không có rule Enrollment thì dùng Package. | 8 |

## Cách đóng câu hỏi

Khi người dùng xác nhận:

1. đổi trạng thái thành `RESOLVED`;
2. ghi câu trả lời ngắn trong bảng hoặc mục chi tiết;
3. cập nhật `decisions/summary.md`/ADR nếu đó là decision lâu dài;
4. cập nhật phase/spec bị ảnh hưởng.
