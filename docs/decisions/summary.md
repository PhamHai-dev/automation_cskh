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
19. **Attendance final và tiêu thụ buổi (cập nhật 2026-10-10):** Giáo viên và CSKH nhập độc lập; chỉ `MATCHED/RESOLVED` mới được tính buổi và kích hoạt automation. Mỗi Attendance là một buổi; chỉ `ATTENDED` và `ABSENT_UNAPPROVED_C` trừ một buổi, A/B/D/E không trừ.
20. **Session identity:** Điểm danh bám theo `EnrollmentClass + ClassSession`; không dùng `session_count` để biểu diễn nhiều buổi trong một Attendance.
21. **Import correction (cập nhật 2026-10-10):** Cả giáo viên và CSKH đều import qua preview/commit. Được sửa dữ liệu final trong scope nhưng phải audit; nếu hai ý kiến lệch nhau thì quay lại `CONFLICT`, hủy delivery còn chờ và không hoàn tác delivery đã gửi.
22. **Multi-role:** endpoint phù hợp dùng union data scope của các role; quyền ghi vẫn kiểm tra role thực hiện action.
23. **UI brand:** primary `#2563EB`, accent `#14B8A6`, chỉ dùng qua semantic token tập trung.
24. **Zalo relation:** không có relation hợp lệ thì delivery `skipped`, có lý do/cảnh báo CS và không tự retry.
25. **Message rule precedence:** rule riêng Enrollment override default Package khi cùng session number; chỉ tạo một delivery.
26. **Đồng nhất Sale và CSKH:** Sale và nhân viên CSKH là cùng một vai trò (`CS`). Cột `Sale` trong Sheet 1 ánh xạ trực tiếp đến tài khoản đăng nhập (Email) mà Admin tạo trong hệ thống.
27. **Ma trận Điểm danh theo Lịch Ngày:** Bỏ số thứ tự buổi, hiển thị Thứ và Ngày theo lịch thực tế; mặc định xem theo Tháng hiện tại, hỗ trợ lọc theo Tuần/Tháng/Năm. Cố định 11 cột thông tin học viên & lớp học bên trái, loại bỏ cột "Chỉ số chuyên cần ĐH % và BT %".
28. **Tab Quản lý Ghi danh theo Sale:** Tab Quản lý ghi danh (`/enrollments`) được tổ chức dạng Ma trận điểm danh theo ngày, tự động lọc học viên theo tài khoản Sale của người đang đăng nhập (với vai trò `CS`), hoặc cung cấp bộ chọn Sale cho `ADMIN`/`MANAGE`.
29. **Danh sách Học viên chuẩn Sheet 1:** Tab Danh sách học viên (`/students`) hiển thị đầy đủ 28 cột của Sheet `1.Chăm sóc`, highlight badge đỏ cho số buổi nợ âm, tự động lọc theo Sale phụ trách.
30. **Cơ chế đối soát workbook (cập nhật 2026-10-10):** Preview phân loại mới/không đổi/ghi đè/lỗi/ngoài scope; commit phần hợp lệ sau xác nhận. Chỉ match ClassSession đã tồn tại theo mã học viên + lớp trong scope + ngày + giờ; không tự tạo hoặc đoán học viên/lớp/buổi.
31. **Bộ tài khoản kiểm thử chuẩn hóa:** Tạo sẵn 5 tài khoản test với mật khẩu chung `123456`: `admin@gmail.com` (ADMIN), `cskh1@gmail.com` (CS), `cskh2@gmail.com` (CS), `cskh3@gmail.com` (CS), `teacher@gmail.com` (TEACHER) và phân bổ dữ liệu học viên cho các Sale.
32. **Mở rộng Nhập & Xuất Excel cho tất cả các vai trò & Tách biệt Sale với CSKH:**
    - **Tách biệt Sale và CSKH (Cập nhật Quyết định 26):** Cột `Sale` trong Sheet 1 không phải là tài khoản CSKH (`cs_id`), mà là trường dữ liệu nhân viên kinh doanh độc lập. Hệ thống bổ sung bảng `Sale` (`sales`) liên kết với `Enrollment.sale_id`. Cột `Sale` trong Excel tự động tạo mới / liên kết bản ghi `Sale`.
    - **Gán CSKH khi import:**
      - **CSKH (`CS` role) upload:** Học viên mới tự động gán vào tài khoản CS đó (`cs_id = actor.id`). Học viên cũ đã thuộc CS này (`enrollment.cs_id === actor.id`) được ghi đè cập nhật bình thường. Học viên cũ đang thuộc CS khác (`enrollment.cs_id !== actor.id`) không được ghi đè trực tiếp mà được gắn nhãn `REQUEST_TRANSFER`, tự động tạo yêu cầu chuyển CS trong hàng đợi phê duyệt để Admin/Manage duyệt.
      - **Quản trị viên / Quản lý (`ADMIN`, `MANAGE`) upload:** Giao diện có bộ chọn tài khoản CSKH phụ trách; cả học viên mới và học viên cũ được gán cho CSKH được chọn.
    - **Data Scope vai trò:** Cả 4 vai trò (`ADMIN`, `MANAGE`, `CS`, `TEACHER`) đều có quyền sử dụng tính năng Nhập/Xuất Excel; `TEACHER` chỉ import điểm danh Sheet 3 cho các lớp mình phụ trách giảng dạy (`ClassTeacher`).
    - **Sheet 1 (`1.Chăm sóc`):** Kiểm tra theo cặp `(ID, Gói học)`; nếu đã có thì ghi đè (ô trống trên Excel xóa trắng trong DB để đồng bộ tuyệt đối; giữ nguyên lịch sử chăm sóc CareLog/CareTask); nếu chưa có thì thêm mới trực tiếp vào Database.
    - **Sheet 3 (`3.Chấm buổi`):** Kiểm tra theo cặp `(ID, Gói học)`; nếu đã có thì ghi đè điểm danh theo ngày (ô ngày trống trên Excel giữ nguyên điểm danh cũ); nếu chưa có thì bỏ qua dòng đó và ghi cảnh báo lỗi.
    - **Định dạng file:** Tối ưu cho file có cả 2 sheet, đồng thời hỗ trợ linh hoạt nếu file chỉ có riêng Sheet 1 hoặc riêng Sheet 3.
33. **Nâng cấp giao diện điểm danh (cập nhật 2026-10-10):**
    - Trạng thái `ATTENDED` hiển thị ký hiệu `1`, nhưng mỗi Attendance luôn là đúng một buổi và không cho nhập `2`, `3`.
    - Thay đổi từng học viên lưu ngay; thao tác nhiều học viên hoặc cả lớp bắt buộc xác nhận.
    - Mọi số dương trong Excel chỉ được chuẩn hóa thành `ATTENDED`; không lưu giá trị số.
34. **Đối soát hai nguồn (2026-10-10):** CSKH phụ trách được phân xử trong scope; ADMIN/MANAGE được phân xử mọi trường hợp. Phân xử bắt buộc có lý do. Dữ liệu pending/conflict không được tác động số buổi hoặc automation.
