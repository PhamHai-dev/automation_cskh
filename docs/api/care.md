# Care API

## CareLog

- `GET /api/v1/enrollments/{enrollmentId}/care-logs`
- `POST /api/v1/enrollments/{enrollmentId}/care-logs`
- `PATCH /api/v1/care-logs/{careLogId}` nếu spec cho phép sửa.

## CareTask

- `GET /api/v1/care-tasks`
- `POST /api/v1/care-tasks`
- `GET /api/v1/care-tasks/{taskId}`
- `PATCH /api/v1/care-tasks/{taskId}`
- `POST /api/v1/care-tasks/{taskId}/complete`
- `POST /api/v1/care-tasks/{taskId}/cancel`

CS own scope, Manage team scope, Admin all. Teacher không tự được xem note nội bộ của CS nếu docs không cho phép.
