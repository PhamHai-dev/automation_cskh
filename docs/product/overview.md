# PLAN CHI TIẾT V3: Hệ thống quản lý học viên cho CS

## 0. Tóm tắt mục tiêu

Web app nội bộ dành cho **CS**, **Giáo viên**, **Manage** và **Admin** để:

1. Quản lý danh sách học viên (HV), các lần đăng ký/học khóa (`Enrollment`) và phân công CS phụ trách.
2. Quản lý lớp, buổi học và điểm danh (nhập tay hoặc import Excel tùy nguồn dữ liệu).
3. Với mỗi enrollment, cấu hình **kịch bản nhắn tin Zalo tự động** theo số buổi học đã hoàn thành (buổi 1 gửi gì, buổi 3 gửi gì...).
4. Xem **dashboard thống kê** tổng hợp học viên/chăm sóc theo CS, GV, lớp, nhóm CS và khoảng thời gian.
5. **Giáo viên** upload/nhập dữ liệu buổi học và điểm danh của lớp Zoom; dữ liệu này đổ vào hồ sơ enrollment và có thể kích hoạt automation Zalo.
6. Có log import, audit thay đổi và cơ chế chống gửi trùng/mất job để đủ an toàn cho production.

Yêu cầu: web thật, có database, deploy được (không phải demo).

**Phạm vi dữ liệu tham chiếu cho bản V3:** tập trung vào **Sheet `1.Chăm sóc` và Sheet `3.Chấm buổi`** của file vận hành hiện tại. Các sheet tái tục, bàn giao ca, nhật ký ca tối... không nằm trong scope database/MVP này.

---

