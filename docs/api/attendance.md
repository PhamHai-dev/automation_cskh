# Attendance API

Base: `/api/v1/classes/{classId}/sessions/{sessionId}/attendance`

`Attendance` = trạng thái điểm danh của 1 học viên (EnrollmentClass) trong 1 buổi học (ClassSession).

## Endpoints

- `GET /api/v1/classes/{classId}/sessions/{sessionId}/attendance`
- `POST /api/v1/classes/{classId}/sessions/{sessionId}/attendance`
- `POST /api/v1/classes/{classId}/sessions/{sessionId}/attendance/bulk`
- `PATCH /api/v1/classes/{classId}/sessions/{sessionId}/attendance/{attendanceId}`
- `GET /api/v1/classes/{classId}/sessions/{sessionId}/attendance/summary`

## Status

| Code | Ý nghĩa | Trừ buổi? |
| --- | --- | --- |
| `ATTENDED` | Có mặt | Không |
| `ABSENT_APPROVED_A` | Nghỉ có phép | Có |
| `LEAVE_B` | Bảo lưu | Có |
| `ABSENT_UNAPPROVED_C` | Nghỉ sai quy định | Có |
| `TEACHER_ABSENT_D` | GV xin nghỉ | Có |
| `TECH_ERROR_E` | Lỗi kỹ thuật | Có |

## Source

- `MANUAL` nhập tay.
- `EXCEL_IMPORT` nhập từ Excel.
- `TEACHER_UPLOAD` GV upload.

## Quy tắc

- Mỗi cặp `(enrollment_class_id, class_session_id)` chỉ có 1 attendance.
- Cross-class attendance bị chặn.
- Source/role theo `auth-rbac.md` + phase 4 plan.
