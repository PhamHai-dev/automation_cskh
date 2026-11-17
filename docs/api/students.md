# Student API

Base: `/api/v1/students`

`Student` = một con người, không chứa class/teacher/CS cố định.

## Endpoints dự kiến

- `GET /api/v1/students` — list/search theo data scope.
- `POST /api/v1/students` — tạo Student.
- `GET /api/v1/students/{studentId}` — chi tiết.
- `PATCH /api/v1/students/{studentId}` — sửa thông tin cá nhân và Enrollment được chọn.

## Contract Gói học

- `package_code`: mã Gói học dùng chung; tương ứng Kaiwa `Gói học` hoặc JLPT `Gói SP`. Backend upsert `Package` và lưu `Enrollment.package_id`.
- `course_code`: JLPT `Mã khóa học`, lưu riêng tại `Enrollment.course_code`; không dùng thay `package_code`.
- Khi cập nhật, gửi `package_code: ""` để bỏ liên kết package và `course_code: ""` để xóa Mã khóa học.
- Response Enrollment trả `package` để hiển thị cột `Gói học` và `course_code` cho cột `Mã khóa học` JLPT.

## Query chung

- `page`, `pageSize`, `search`, `sortBy`, `sortOrder`.
- Filter domain chỉ thêm khi phase/spec chốt.

## Scope

Student list/detail phải được giới hạn qua Enrollment mà user có quyền xem, trừ ADMIN.
