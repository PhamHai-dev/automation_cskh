# Open Questions

AI không được tự quyết các mục `WAITING_USER` nếu quyết định ảnh hưởng implementation.

| ID | Trạng thái | Chủ đề | Câu hỏi / quyết định cần chốt | Phase bị ảnh hưởng |
| --- | --- | --- | --- | --- |
| Q-001 | WAITING_USER | External ID | Cột `ID` Sheet 1/3 là ID cố định của Student hay ID của Enrollment? V3 đang tạm đặt `Enrollment.external_id`. | 1, 5 |
| Q-002 | WAITING_USER | Attendance rule | Với A/B/C/D/E: status nào trừ buổi, tính completed và trigger message? | 4, 8 |
| Q-003 | WAITING_USER | Session numbering | `session_number` được xác định theo lớp, enrollment hay nguồn import khi chuyển lớp? | 4, 5, 8 |
| Q-004 | WAITING_USER | Import correction | Sau import, role nào được sửa dữ liệu cũ và có cần khóa theo ngày/kỳ không? | 5 |
| Q-005 | WAITING_USER | Multi-role | Khi user có nhiều role, endpoint nào hợp scope theo union và endpoint nào dùng role context cụ thể? | 2 |
| Q-006 | WAITING_USER | UI brand | Màu chủ đạo/brand color chính thức của product là gì? | 0, frontend |
| Q-007 | WAITING_USER | Zalo relation | Khi học viên chưa friend/contact với Zalo CS thì skip, cảnh báo hay cho phép gửi theo cấu hình? | 7, 8 |
| Q-008 | WAITING_USER | MessageRule precedence | Rule riêng Enrollment và rule mặc định Package ưu tiên/override thế nào khi cùng session number? | 8 |

## Cách đóng câu hỏi

Khi người dùng xác nhận:

1. đổi trạng thái thành `RESOLVED`;
2. ghi câu trả lời ngắn trong bảng hoặc mục chi tiết;
3. cập nhật `decisions/summary.md`/ADR nếu đó là decision lâu dài;
4. cập nhật phase/spec bị ảnh hưởng.
