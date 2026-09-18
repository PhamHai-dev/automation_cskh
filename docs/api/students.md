# Student API

Base: `/api/v1/students`

`Student` = một con người, không chứa class/teacher/CS cố định.

## Endpoints dự kiến

- `GET /api/v1/students` — list/search theo data scope.
- `POST /api/v1/students` — tạo Student.
- `GET /api/v1/students/{studentId}` — chi tiết.
- `PATCH /api/v1/students/{studentId}` — sửa thông tin cá nhân.

## Query chung

- `page`, `pageSize`, `search`, `sortBy`, `sortOrder`.
- Filter domain chỉ thêm khi phase/spec chốt.

## Scope

Student list/detail phải được giới hạn qua Enrollment mà user có quyền xem, trừ ADMIN.
