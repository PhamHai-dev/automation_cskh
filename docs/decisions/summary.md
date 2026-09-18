> 📄 Phần của bộ tài liệu spec — xem `../README.md` để biết thứ tự đọc và bối cảnh tổng thể.

## 8. Quyết định đã chốt

1. **Scope dữ liệu:** tập trung Sheet `1.Chăm sóc` và `3.Chấm buổi`; không thiết kế module tái tục/bàn giao ca trong MVP này.
2. **Student:** một con người; chỉ chứa thông tin cá nhân.
3. **Enrollment:** một gói/lần đăng ký học; tương ứng gần nhất với một dòng nghiệp vụ ở Sheet 1.
4. **EnrollmentClass:** lưu hành trình một Enrollment đi qua một hoặc nhiều Class. Đang học chuyển lớp, hoặc học xong level rồi đi tiếp lớp khác trong cùng gói đều tạo record EnrollmentClass mới.
5. **Gói mới:** nếu học viên mua một gói/khóa mới độc lập thì tạo Enrollment mới.
6. **Giáo viên:** `User(role=TEACHER)` + `TeacherProfile`; quan hệ dạy lớp qua `ClassTeacher`, không gắn teacher trực tiếp lên Student.
7. **Điểm danh:** `ClassSession` = buổi học; `Attendance` gắn với `EnrollmentClass`, không gắn thẳng Enrollment.
8. **Lịch học:** chuẩn hóa bằng `ClassSchedule`, không giới hạn 2 bộ lịch như Excel.
9. **Số buổi:** source of truth là Attendance + business rule; các số tổng trong Excel chỉ để import/đối soát.
10. **Chăm sóc:** các mốc chăm sóc Sheet 1 lưu thành `CareLog`; `Lịch hẹn gọi/Điểm nóng` dùng `CareTask`.
11. **Zalo:** automation vẫn trigger từ Attendance hợp lệ; MessageDelivery + OutboxEvent dùng để chống gửi trùng/mất job.
12. **Auth/RBAC:** MySQL 8.x; `User.roles` là JSON array; không dùng `UserRole`; chỉ Admin tạo tài khoản trong Settings.

13. **Backend code organization:** dùng Modular Monolith theo feature/domain; mỗi module theo `Route → Controller → Service → Repository → Prisma`. Không dùng layer-first toàn project làm cấu trúc chính.
14. **Frontend code organization:** dùng feature-first; component nền tảng dùng chung đặt trong `components/ui`, component product dùng chung đặt trong `components/common`.
15. **UI consistency:** màu, spacing, radius, typography, table, button, card, modal và responsive phải đi qua design system/token/component chung; không style ad-hoc theo từng page.
16. **Asset organization:** ảnh public đặt trong `frontend/public/images`, ảnh import trong React đặt ở `frontend/src/assets`; không lưu ảnh rải rác trong page.
17. **Kỷ luật triển khai:** AI làm một phase tại một thời điểm; sau mỗi phase phải test, cập nhật phase/STATUS/CHANGELOG/OPEN_QUESTIONS và dừng chờ user xác nhận.
18. **External student ID:** cột `ID` từ Sheet 1/3 là external ID cố định của `Student`, dùng xuyên nhiều Enrollment.
19. **Attendance A–E:** A (nghỉ có phép), B (bảo lưu), C (nghỉ sai quy định), D (GV xin nghỉ), E (lỗi kỹ thuật) đều trừ buổi; không tính completed và không trigger message.
20. **Session numbering:** `session_number` liên tục theo Enrollment và không reset khi chuyển lớp.
21. **Import correction:** Admin sửa mọi dữ liệu import; Manage sửa trong scope; CS không sửa trực tiếp; MVP không khóa ngày/kỳ và mọi thay đổi phải audit.
22. **Multi-role:** endpoint phù hợp dùng union data scope của các role; quyền ghi vẫn kiểm tra role thực hiện action.
23. **UI brand:** primary `#2563EB`, accent `#14B8A6`, chỉ dùng qua semantic token tập trung.
24. **Zalo relation:** không có relation hợp lệ thì delivery `skipped`, có lý do/cảnh báo CS và không tự retry.
25. **Message rule precedence:** rule riêng Enrollment override default Package khi cùng session number; chỉ tạo một delivery.
