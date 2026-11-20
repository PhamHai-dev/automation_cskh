# Enrollment API

Base: `/api/v1/enrollments`

`Enrollment` = một lần/gói đăng ký học của Student.

## Endpoints dự kiến

- `GET /api/v1/enrollments`
- `POST /api/v1/enrollments`
- `GET /api/v1/enrollments/{enrollmentId}`
- `PATCH /api/v1/enrollments/{enrollmentId}`
- `POST /api/v1/enrollments/{enrollmentId}/reassign-cs`
- `GET /api/v1/enrollments/{enrollmentId}/classes`
- `POST /api/v1/enrollments/{enrollmentId}/classes`
- `PATCH /api/v1/enrollments/{enrollmentId}/classes/{enrollmentClassId}`

## Lọc danh sách ghi danh

`GET /api/v1/enrollments` lọc trong data scope hiện tại trước phân trang.

Nhóm query chính:

- nhận dạng: `search`, `class_name`, `teacher_name`, `teacher_code`;
- chương trình: `program_type`, `course_category`, `course_level`;
- nghiệp vụ: `cs_id`, `sale`, `status`, `package_name`, `model_filter`;
- lịch học: `schedule_pattern`, `start_time`;
- ngày: `start_date_*`, `end_date_*`;
- tiến độ: `total_sessions_*`, `attended_sessions_*`, `remaining_sessions_*`;
- phân trang: `page`, `pageSize` (tối đa 200).

Mỗi điều kiện số/ngày dùng một toán tử `EXACT` hoặc `RANGE`; một khoảng được tính là một điều kiện lọc.

Quy tắc chương trình:

- `JLPT` là giá trị chuẩn; `JNPT` chỉ được nhận như alias đầu vào cũ.
- `course_level` chỉ áp dụng cho Kaiwa.
- JLPT lọc theo `course_code`, gói, lớp và các trường metadata JLPT có contract riêng; không tạo level giả.
- `course_content` Kaiwa và học phí JLPT là hai trường độc lập.

Contract chi tiết nằm tại `docs/api/openapi.yaml`.

## Quy tắc

- Không dùng `Enrollment.class_id` đơn để thay `EnrollmentClass`.
- Reassign CS phải enforce team scope đối với MANAGE.
- Class history không được ghi đè/xóa âm thầm.
