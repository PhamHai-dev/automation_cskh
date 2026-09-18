# Checklist chuẩn bị & trước khi code

Tài liệu này gom các việc cần chuẩn bị song song và các điều kiện cần kiểm tra trước khi triển khai production.

## A. Chuẩn bị dữ liệu/nghiệp vụ

- Danh sách user thực tế và role cần gán (`ADMIN/MANAGE/CS/TEACHER`); xác nhận trường hợp một user có nhiều role nếu có.
- Mapping CS → CSGroup; Manage → CSGroup; Teacher/Mã GV → TeacherProfile → ClassTeacher.
- Danh sách package, lớp, GV, CS.
- Xác nhận cột `ID` của Sheet 1/3 là ID của Enrollment/lượt đăng ký như thiết kế hiện tại; nếu thực tế là ID cố định của con người thì chuyển field đó sang Student.
- Chốt business rule cho từng Attendance status:
  - có trừ buổi không
  - có tính completed không
  - có trigger message không
- Xác nhận format Sheet `1.Chăm sóc` và `3.Chấm buổi`, đặc biệt cách phân tách nhiều `Tên lớp`, nhiều GV và lịch học trong một ô.
- Xác nhận `ClassSession`/session number lấy từ đâu ở hệ thống hiện tại.
- Chuẩn bị Zalo account test cho technical spike.
- Chấp nhận rủi ro của `zca-js` và chuẩn bị quy trình gửi tay dự phòng.
- Chốt policy khi student chưa phải contact/friend của ZaloAccount phụ trách.

---


## B. Checklist trước khi code/production

Các mục chưa chốt được theo dõi chi tiết trong `OPEN_QUESTIONS.md`. Không phải mọi mục đều block Phase 0; phase nào phụ thuộc câu hỏi nào được ghi ngay trong file phase.

- [ ] Chốt cột `ID` của Sheet 1/3 thuộc Student hay Enrollment; mặc định V3 đang đặt ở `Enrollment.external_id`.
- [ ] Chốt business rule Attendance A/B/C/D/E.
- [ ] Chốt format/session numbering cho learning system và Zoom.
- [ ] Chốt flow import + quyền sửa/khóa dữ liệu cũ.
- [ ] Chốt user đa role và rule hợp permission/data scope.
- [ ] Chốt màu/brand chính thức cho UI hoặc xác nhận dùng theme mặc định.
- [ ] Chốt precedence MessageRule.
- [ ] Chốt policy khi chưa friend/contact Zalo.
- [ ] Hoàn thành Zalo technical spike.
- [ ] Chốt retention/encryption cho Zalo session.
- [ ] Chốt backup MySQL/Redis trước production.
- [ ] Test login/refresh/logout/disable user/revoke session/reset password.
- [ ] Test authorization backend; không dựa vào ẩn/hiện UI.
- [ ] Test data scope trước production.
- [ ] Test import bằng file dữ liệu thật Sheet 1 + Sheet 3.
- [ ] Test responsive desktop/tablet/mobile cho các màn hình chính.
