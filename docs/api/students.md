# Student API

Base: `/api/v1/students`

`Student` = một con người, không chứa class/teacher/CS cố định.

## Endpoints dự kiến

- `GET /api/v1/students` — list/search theo data scope; không trả học viên đã lưu trữ.
- `POST /api/v1/students` — tạo Student.
- `GET /api/v1/students/{studentId}` — chi tiết; học viên đã lưu trữ được xem như không tồn tại trên giao diện.
- `PATCH /api/v1/students/{studentId}` — sửa thông tin cá nhân và Enrollment được chọn.
- `DELETE /api/v1/students/{studentId}` — chỉ `ADMIN`; xóa mềm toàn bộ hồ sơ khỏi giao diện bằng `Student.deleted_at/deleted_by_id`, giữ nguyên Student và mọi Enrollment/lớp/điểm danh/chăm sóc/liên kết trong DB; thành công trả `204`.

## Contract Gói học

- `package_code`: mã Gói học dùng chung; tương ứng Kaiwa `Gói học` hoặc JLPT `Gói SP`. Backend upsert `Package` và lưu `Enrollment.package_id`.
- `course_code`: JLPT `Mã khóa học`, lưu riêng tại `Enrollment.course_code`; không dùng thay `package_code`.
- Khi cập nhật, gửi `package_code: ""` để bỏ liên kết package và `course_code: ""` để xóa Mã khóa học.
- Response Enrollment trả `package` để hiển thị cột `Gói học` và `course_code` cho cột `Mã khóa học` JLPT.

## Query danh sách

`GET /api/v1/students` áp dụng search/filter trong backend, sau data scope và trước phân trang.

- chung: `page`, `pageSize`, `search`, `program_type`, `status`, `gender`;
- phân công: `cs_id`, `cvht`, `sale`;
- khóa học: `package_name`, `course_code`, `model`, `payment`;
- lớp/GV: `class_name`, `class_code`, `teacher_name`, `teacher_code`, `has_class`, `has_teacher`;
- lịch: `schedule_pattern`, `start_time`;
- ngày: `start_date_*`, `end_date_*` với toán tử `EXACT` hoặc `RANGE`;
- tiến độ: `total_sessions_*`, `remaining_sessions_*`;
- hồ sơ: `birth_year_min`, `birth_year_max`, `occupation`.

Mọi field/operator được allowlist. Điều kiện người dùng chỉ thu hẹp cây Prisma `AND` chứa data scope; không được dùng Sale, tên hoặc email làm quyền truy cập.

## Scope

- `ADMIN`: toàn bộ Student đang hoạt động.
- `MANAGE`: enrollment của chính mình hoặc CS trong nhóm được gán.
- `CS`: enrollment mình sở hữu hoặc được cấp quyền xem qua `cs_viewers`.
- `TEACHER`: không gọi Student list; chỉ xem detail/report của học viên thuộc lớp được phân công qua endpoint tương ứng.
- Tổng số, facets và filter options phải dùng cùng scope với rows.

Xóa mềm học viên chỉ dành cho `ADMIN`. UI chỉ hiển thị icon xóa cho Admin và phải xác nhận trước khi gọi API. Học viên đã xóa mềm không xuất hiện trong list/detail/báo cáo học viên; dữ liệu gốc và toàn bộ quan hệ vẫn được giữ để audit, không cascade delete.
