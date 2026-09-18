# ClassSession + Attendance API

## ClassSession

Base: `/api/v1/classes/{classId}/sessions`

- `GET /api/v1/classes/{classId}/sessions`
- `POST /api/v1/classes/{classId}/sessions`
- `GET /api/v1/classes/{classId}/sessions/{sessionId}`
- `PATCH /api/v1/classes/{classId}/sessions/{sessionId}`
- `POST /api/v1/classes/{classId}/sessions/{sessionId}/cancel`

## Attendance

- `GET /api/v1/classes/{classId}/sessions/{sessionId}/attendance`
- `PUT /api/v1/classes/{classId}/sessions/{sessionId}/attendance/{enrollmentClassId}`
- `PUT /api/v1/classes/{classId}/sessions/{sessionId}/attendance` — bulk upsert theo contract cụ thể.

## Quy tắc

- Attendance = `EnrollmentClass + ClassSession`.
- Unique `(enrollment_class_id, class_session_id)`.
- Không duplicate session date/time trong Attendance.
- A/B/C/D/E chưa chốt business rule thì không tự suy đoán consume/completed/trigger.
- Source/role authorization theo `attendance_source` và docs phase 4.
