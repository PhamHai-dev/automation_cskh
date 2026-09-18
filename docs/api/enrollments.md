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

## Quy tắc

- Không dùng `Enrollment.class_id` đơn để thay `EnrollmentClass`.
- Reassign CS phải enforce team scope đối với MANAGE.
- Class history không được ghi đè/xóa âm thầm.
