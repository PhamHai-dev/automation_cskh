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
- Với tài khoản thuần `TEACHER` (có `TEACHER`, không có `ADMIN`, `MANAGE`, `CS`), mọi Attendance trả về từ class/session/list/write và teacher tracking chỉ gồm trạng thái phía giáo viên (`teacher_status`), bài học, ghi chú giáo viên và `cs_note`; không trả `status`, `cs_status`, reconciliation/final/resolution. Tài khoản đa vai trò giữ contract đặc quyền hiện hành.
- Lịch sử điểm danh của giáo viên là chỉ đọc; thao tác tạo ca, chấm/sửa/xóa và hàng loạt chỉ thực hiện trong tab `Nhập điểm danh`.
- `Chưa điểm danh` không phải status; reset soft-delete Attendance, hủy delivery đang chờ và giữ delivery đã gửi cùng audit.
- Sửa Attendance final khiến hai nguồn khác nhau sẽ đưa về `CONFLICT`; không tự hoàn tác automation đã gửi.

## Attendance reconciliation

Base: `/api/v1/attendance-reconciliation`.

### Danh sách và bộ lọc backend

- `GET /teacher-sessions?startDate&endDate&teacherId&classId&search&modelType&completionState&page&pageSize`: TEACHER xem lớp của mình; ADMIN/MANAGE có thể chọn giáo viên. Search, lớp, mô hình, trạng thái hoàn thành và pagination được áp dụng backend trước khi trả dữ liệu. Trả `{ items, total, page, pageSize, totalPages }`, mỗi item là ClassSession kèm toàn bộ EnrollmentClass `ACTIVE`, kể cả chưa có Attendance. Attendance lồng nhau được role-shape theo quy tắc pure-teacher ở trên.
- `GET /pending?page&pageSize&classId&csId&teacherId&state&startDate&endDate&search&programType`: trả hàng chờ trong data scope; `state=PENDING_CS|PENDING_TEACHER`, `programType=KAIWA|JLPT` (`JNPT` chỉ là alias input cũ và được chuẩn hóa thành `JLPT`).
- `GET /conflicts`, `GET /stats` và `GET /history` nhận cùng các bộ lọc có ý nghĩa. Search bao phủ tên/mã/SĐT/email học viên, mã khóa học, tên/mã gói và tên/mã lớp.
- Scope và filter được gộp trong cùng Prisma predicate trước count, sort và pagination: ADMIN không giới hạn; CS thường chỉ thấy Enrollment có `cs_id` của mình; MANAGE thấy chính mình và thành viên các nhóm CS được giao; TEACHER chỉ thấy lớp được phân công trên luồng teacher tracking. Filter người dùng chỉ thu hẹp, không mở rộng scope.
- List, count, KPI và history dùng chung predicate theo scope; danh sách dùng stable sort theo ngày rồi ID.
- Mỗi hàng pending kèm `assigned_teachers` là danh sách giáo viên active được phân công cho lớp, gồm mã/tên/email; đây là giáo viên phụ trách, không phải tài khoản đã thao tác nhập điểm danh.
- `PENDING_CS` chỉ hợp lệ khi `teacher_status` đã có và `cs_status` chưa có; `PENDING_TEACHER` chỉ hợp lệ khi `cs_status` đã có và `teacher_status` chưa có. Bản ghi chưa có ý kiến từ cả hai bên không thuộc danh sách chờ.

### Ghi ý kiến và phân xử

- `POST /{attendanceId}/teacher-mark`: body `{ status, rawValue?, lessonTopic?, note? }`. TEACHER chỉ ghi lớp được phân công; quyền điểm danh hộ thuộc ADMIN, không thuộc MANAGE.
- `POST /{attendanceId}/cs-mark`: body `{ status, rawValue?, note? }`. CS chỉ ghi Enrollment được gán; MANAGE chỉ ghi trong phạm vi self + nhóm CS được giao; ADMIN không giới hạn.
- `POST /bulk-approve`: body `{ attendanceIds }`. Chỉ nhận row `PENDING_CS`; toàn bộ ID phải tồn tại và cùng nằm trong scope, nếu không trả `403/409` và không duyệt một phần.
- `POST /{attendanceId}/resolve-conflict`: body `{ finalStatus, resolutionNote }`; lý do không được rỗng và chỉ ADMIN có quyền phân xử.

### Import workbook điểm danh

- `POST /import-excel/preview` nhận `multipart/form-data` gồm `file`, `source` (`CSKH|TEACHER`) và `targetYear` bắt buộc. Endpoint chỉ phân tích, không ghi dữ liệu.
- `POST /import-excel/confirm` nhận lại chính workbook cùng `source`, `targetYear` và `actions` (JSON map `{ itemId: APPLY|KEEP_DATABASE|SKIP }`). Server tự preview lại trước khi commit, không tin payload preview từ client.
- CSKH đọc `Giờ học (1)` và `Tên lớp`; mỗi session kéo dài 30 phút. GV match theo mã HV + model `1-1|1-2|1-n` + ngày + khung giờ. Các match không duy nhất là `INVALID`.
- `X`, `1`, mã `A/B/C/D/E` và `MãHV-Tên bài` biểu diễn một ClassSession; số nguyên dương `N` biểu diễn `N` ClassSession liên tiếp. `0`, âm, thập phân hoặc mã lạ là lỗi preview.
- Preview phân loại `CREATE`, `UNCHANGED`, `CONFLICT`, `INVALID`, `OUT_OF_SCOPE`; chỉ conflict chọn `APPLY` mới ghi đè phía nguồn tương ứng. Attendance-only không tạo Student, Enrollment, Class hay EnrollmentClass.
- Import CSKH chỉ ghi `cs_status`; import GV chỉ ghi `teacher_status`, sau đó dùng reconciliation hiện có. Hệ thống re-check session trong transaction, ghi AuditLog và upload lại dữ liệu đã phản ánh sẽ thành `UNCHANGED`.
- Endpoint cũ `POST /upload-teacher-excel` trả `410 Gone`; clients phải chuyển sang preview → confirm.

Các endpoint write trả `400` khi request sai, `403` khi ngoài scope, `404` khi không tìm thấy trong scope, `409` khi invariant/state không hợp lệ. Response theo envelope `{ data, meta }`.

## JLPT learning records

Base: `/api/v1/classes/{classId}/sessions/{sessionId}/jlpt-records`.

- `GET /` trả EnrollmentClass `ACTIVE`, cùng `TRANSFERRED` có Attendance chưa xóa trong đúng `sessionId`; kèm Student, Attendance allow-list theo role và `JlptLearningRecord` nullable. PATCH/bulk áp dụng cùng điều kiện này, không đổi trạng thái xếp lớp và không tự tạo Attendance. Giữ class/CS scope và phân công giáo viên hiệu lực tại ngày ca.
- `PATCH /{enrollmentClassId}` autosave đúng một field; body `{ field, value }` với:
  - `preparation_rating`: `A|B|C|null`;
  - `attitude_rating`: `A|B|C|null`;
  - `homework_completed`: `boolean|null`;
  - `test_correct_answers`: integer `>=0|null`.
- `POST /bulk` chỉ dùng cho thao tác chủ động có confirm; body `{ enrollment_class_ids, field, value }` và transaction all-or-nothing.

Quy tắc:

- Chỉ Class `program_type=JLPT` và session thuộc Class mới được dùng endpoint; sai invariant trả `409`.
- Bốn trường đều nullable. Attendance/chuyên cần và ghi chú không duplicate vào record này.
- TEACHER chỉ đọc/ghi Class được phân công active. ADMIN/MANAGE đọc/ghi trong scope. CS chỉ đọc trong scope.
- Tài khoản thuần TEACHER chỉ nhận Attendance projection phía giáo viên theo privacy rule hiện có.
- Web khóa bốn tiêu chí khi `teacher_status` đang là trạng thái vắng, nhưng backend không xóa dữ liệu đã có; import/sync có thể lưu dữ liệu nguồn dù đang vắng.
- PATCH trả record sau lưu và `updated_at` để UI hiển thị Đang lưu/Đã lưu/Lỗi theo từng ô. Mỗi request chỉ thay một field; lỗi không ảnh hưởng ô khác.
- Mọi create/update/clear ghi actor và AuditLog. Không kích hoạt Attendance automation vì learning record không phải Attendance final.

## Automatic attendance settings

Base: `/api/v1/settings/auto-attendance` — chỉ role `ADMIN`.

- `GET /api/v1/settings/auto-attendance`: đọc cấu hình hiện tại `{ enabled, delay_minutes, updated_at, updated_by_id }`.
- `PATCH /api/v1/settings/auto-attendance`: cập nhật `{ "delay_minutes": 15, "enabled": true }` (trường `enabled` là boolean, tùy chọn).
- `delay_minutes` là số nguyên từ `0` đến `1440`; mặc định `15` phút.
- `enabled` bật/tắt chu kỳ điểm danh tự động ngầm (cron 1 phút/lần). Khi `enabled=false`, cron bỏ qua chu kỳ và không ghi điểm danh; nút "Quét kiểm tra ngay" (`POST /run`) của admin vẫn chạy bình thường để chủ động kiểm tra.
- Mặc định: `enabled=true`.
- Thay đổi setting được lưu cùng `updated_by_id` và thời điểm cập nhật.

