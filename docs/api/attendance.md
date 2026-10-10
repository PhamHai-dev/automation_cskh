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

| Code | Ý nghĩa | Trừ buổi khi final? |
| --- | --- | --- |
| `ATTENDED` | Có mặt | Có, 1 buổi |
| `ABSENT_APPROVED_A` | Nghỉ có phép | Không |
| `LEAVE_B` | Bảo lưu | Không |
| `ABSENT_UNAPPROVED_C` | Nghỉ sai quy định | Có, 1 buổi |
| `TEACHER_ABSENT_D` | GV xin nghỉ | Không |
| `TECH_ERROR_E` | Lỗi kỹ thuật | Không |

## Source

- `MANUAL` nhập tay.
- `EXCEL_IMPORT` nhập từ Excel.
- `TEACHER_UPLOAD` GV upload.
- `AUTO_SCHEDULE` scheduler tự điền theo `ClassSchedule`.

## Quy tắc

- Mỗi cặp `(enrollment_class_id, class_session_id)` chỉ có 1 Attendance và đại diện đúng một buổi; API không nhận `sessionCount`.
- Giáo viên và CSKH nhập độc lập. Thiếu một nguồn là `PENDING_*`, giống nhau là `MATCHED`, khác nhau là `CONFLICT`, phân xử thủ công là `RESOLVED`.
- Chỉ `MATCHED/RESOLVED` được tính số buổi và kích hoạt automation. Khi đang pending/conflict, `status` không được coi là kết quả chính thức.
- Cross-class attendance bị chặn và mọi write enforce role + data scope ở service.
- `TEACHER` chỉ xem/ghi lớp có `ClassTeacher(active=true)`; `CS` chỉ ghi Enrollment có `cs_id` của mình. `ADMIN/MANAGE` được hỗ trợ thao tác theo giáo viên; actor và người được hỗ trợ phải được audit.
- `Chưa điểm danh` không phải status; reset soft-delete Attendance, hủy delivery đang chờ và giữ delivery đã gửi cùng audit.
- Sửa Attendance final khiến hai nguồn khác nhau sẽ đưa về `CONFLICT`; không tự hoàn tác automation đã gửi.

## Attendance reconciliation

Base: `/api/v1/attendance-reconciliation`.

### Danh sách

- `GET /teacher-sessions?startDate&endDate&teacherId`: TEACHER xem lớp của mình; ADMIN/MANAGE có thể chọn giáo viên. Trả ClassSession và toàn bộ EnrollmentClass `ACTIVE`, kể cả chưa có Attendance.
- `GET /pending?page&pageSize&classId&csId&teacherId&startDate&endDate&search`: CS/MANAGE/ADMIN; trả `PENDING_CS` và `PENDING_TEACHER` trong data scope.
- `GET /conflicts?...`: CS/MANAGE/ADMIN; trả `CONFLICT` trong data scope.

### Ghi ý kiến và phân xử

- `POST /{attendanceId}/teacher-mark`: body `{ status, rawValue?, lessonTopic?, note? }`. TEACHER chỉ ghi lớp được phân công; ADMIN/MANAGE có thể thao tác hỗ trợ.
- `POST /{attendanceId}/cs-mark`: body `{ status, rawValue?, note? }`. CS chỉ ghi Enrollment được gán; ADMIN/MANAGE theo quyền hỗ trợ.
- `POST /bulk-approve`: body `{ attendanceIds }`. Chỉ nhận row `PENDING_CS`; toàn bộ ID phải tồn tại và cùng nằm trong scope, nếu không trả `403/409` và không duyệt một phần.
- `POST /{attendanceId}/resolve-conflict`: body `{ finalStatus, resolutionNote }`; lý do không được rỗng. CS phụ trách được phân xử trong scope, ADMIN/MANAGE được phân xử mọi trường hợp.

### Import workbook điểm danh

- `POST /teacher-workbook/preview` và `POST /cs-workbook/preview`: nhận `.xlsx`, parse nhưng không ghi Attendance/ClassSession.
- Preview trả `previewId`, thời hạn, thống kê `new/unchanged/overwrite/error/outOfScope`, và từng ô gồm sheet/address/row/date/time/student/class/rawValue/oldStatus/newStatus/category/message.
- `POST /teacher-workbook/{previewId}/commit` và `POST /cs-workbook/{previewId}/commit`: body `{ confirmOverwrite: true }`; chỉ commit dữ liệu hợp lệ đã preview và thuộc scope actor.
- Match bắt buộc duy nhất theo mã học viên + lớp trong scope + ngày + giờ vào ClassSession có sẵn. Không tự tạo Student, Enrollment, EnrollmentClass hay ClassSession; ô trống giữ nguyên dữ liệu cũ.
- Mọi số dương trong ô ngày chuẩn hóa thành `ATTENDED`; không lưu trị số hay nhân số buổi. Import lặp lại cùng dữ liệu là idempotent.

Các endpoint write trả `400` khi request sai, `403` khi ngoài scope, `404` khi không tìm thấy trong scope, `409` khi invariant/state không hợp lệ. Response theo envelope `{ data, meta }`.

## Automatic attendance settings

Base: `/api/v1/settings/auto-attendance` — chỉ role `ADMIN`.

- `GET /api/v1/settings/auto-attendance`: đọc cấu hình hiện tại `{ enabled, delay_minutes, updated_at, updated_by_id }`.
- `PATCH /api/v1/settings/auto-attendance`: cập nhật `{ "delay_minutes": 15, "enabled": true }` (trường `enabled` là boolean, tùy chọn).
- `delay_minutes` là số nguyên từ `0` đến `1440`; mặc định `15` phút.
- `enabled` bật/tắt chu kỳ điểm danh tự động ngầm (cron 1 phút/lần). Khi `enabled=false`, cron bỏ qua chu kỳ và không ghi điểm danh; nút "Quét kiểm tra ngay" (`POST /run`) của admin vẫn chạy bình thường để chủ động kiểm tra.
- Mặc định: `enabled=true`.
- Thay đổi setting được lưu cùng `updated_by_id` và thời điểm cập nhật.

