# Attendance API

Base: `/api/v1/classes/{classId}/sessions/{sessionId}/attendance`

`Attendance` = trạng thái điểm danh của 1 học viên (EnrollmentClass) trong 1 buổi học (ClassSession).

## Endpoints

- `GET /api/v1/classes/{classId}/sessions/{sessionId}/attendance`
- `POST /api/v1/classes/{classId}/sessions/{sessionId}/attendance`
- `POST /api/v1/classes/{classId}/sessions/{sessionId}/attendance/bulk`
- `PATCH /api/v1/classes/{classId}/sessions/{sessionId}/attendance/{attendanceId}`
- `DELETE /api/v1/classes/{classId}/sessions/{sessionId}/attendance/{attendanceId}` — chuyển về `Chưa điểm danh`
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
- `AUTO_SCHEDULE` scheduler tự điền theo `ClassSchedule`.

## Quy tắc

- Mỗi cặp `(enrollment_class_id, class_session_id)` chỉ có 1 attendance.
- Cross-class attendance bị chặn.
- Source/role theo `auth-rbac.md` + phase 4 plan.
- Lịch compact chấp nhận `2..7`, `CN` và canonical hóa theo thứ tự; `LKCD` hợp lệ nhưng chỉ điểm danh thủ công.
- Scheduler chạy sau `ClassSchedule.start_time + delay_minutes`, chỉ điền ô trống cho Enrollment `STUDYING` và EnrollmentClass `ACTIVE`.
- Thiếu giờ học thì không tự điểm danh; hệ thống tạo `SCHEDULE_DATA_ISSUE` cho CS phụ trách.
- Một `(class_schedule_id, session_date)` chỉ được xử lý một lần.
- `Chưa điểm danh` không phải status; thao tác reset sẽ soft-delete Attendance, hủy delivery đang chờ và giữ delivery đã gửi cùng audit log để truy vết.

## Automatic attendance settings

Base: `/api/v1/settings/auto-attendance` — chỉ role `ADMIN`.

- `GET /api/v1/settings/auto-attendance`: đọc thời gian chờ hiện tại.
- `PATCH /api/v1/settings/auto-attendance`: cập nhật `{ "delay_minutes": 15 }`.
- `delay_minutes` là số nguyên từ `0` đến `1440`; mặc định `15` phút.
- Thay đổi setting được lưu cùng `updated_by_id` và thời điểm cập nhật.

