# 02 — Hiện trạng đào tạo theo mã nguồn

Ngày khảo sát: 2026-10-24. Baseline: `main`, `cbf78c337b8ff534a6d9b3ea5d63cf626cd44b17`; không reset các thay đổi có sẵn. Phạm vi: Student → Enrollment → EnrollmentClass → Class/Schedule/Teacher → ClassSession → Attendance → reconciliation → số buổi/care/report/dashboard/backup/export. Chỉ đọc mã và ghi tài liệu này; không chạy app, không đăng nhập, không truy vấn DB, không migration/cron/mạng/import thật/test tích hợp. **Không có reproduced evidence trong lượt này**; mọi kết luận là phân tích tĩnh.

## 1. Cách đọc, nguồn chứng cứ và quy tắc nghiệp vụ đã chốt

- **[XÁC NHẬN MÃ]**: hành vi xác định từ đường gọi đang nối API/UI và câu lệnh cụ thể. Không đồng nghĩa đã tái hiện trên DB.
- **[RỦI RO MÃ]**: cần dữ liệu/đồng thời/điều kiện vận hành để phát tác.
- **[CHƯA BIẾT]**: chưa xác minh runtime hoặc cần chốt nghiệp vụ.
- **[GIẢ THUYẾT]** / **[ĐỀ XUẤT]**: diễn giải hoặc hướng thiết kế cần chủ sở hữu nghiệp vụ duyệt; không phải hành vi hiện tại.
- Đường dẫn tương đối từ root repository; số dòng tại thời điểm khảo sát.
- `docs/khao-sat/05a-api-đào-tạo-và-nền-tảng.md`, `06-dac-ta-man-hinh-ui.md` chỉ là bản đồ, không thay chứng cứ code. Không lấy báo cáo AI_REVIEW cũ làm yêu cầu đã duyệt.
- Quy tắc đối chiếu `docs/product/business-rules.md:19-42,44-66` chỉ áp dụng khi code có trường tương ứng: X/ATTENDED và C tiêu thụ một buổi; A/B/D/E không; chỉ MATCHED/RESOLVED là final; external remaining là đối soát; Enrollment là gói, EnrollmentClass là lịch sử qua lớp, Attendance định danh EC + session; một ô N phải tách N session (`:28`). Không suy diễn màu ô, workbook gốc, historical window hay duration conversion từ code parser.
- **Quy tắc người dùng đã chốt, dùng làm chuẩn đối chiếu trong bản này:**
  1. 1-1 linh hoạt.
  2. Thời gian đăng ký import ban đầu của lớp 1-1 chỉ là tham chiếu, không phải điều kiện bắt buộc để GV ghi ca thực. Mốc đánh giá/chăm sóc chưa chốt cách tính.
  3. GV được tạo buổi thực dạy sau khi dạy, kể cả ngoài lịch hoặc không có planned session từ trước; create actual session + Attendance trong cùng command là hợp lệ.
  4. Hai buổi liên tiếp cùng ngày được phép.
  5. Nhóm: một ClassSession cố định, nhiều bản ghi Attendance theo học viên.
  6. Planned ≠ attended/absent.
  7. Trạng thái hoàn thành của attendance / review / feedback tách riêng.
  8. Thiếu ý kiến ≠ conflict.
  9. Contacted ≠ replied ≠ resolved.
  10. Admin phân xử; **việc MANAGE được ủy quyền phân xử CHƯA được xác nhận** (code hiện cho phép — xem §5.4).
- Không giả định ordinal chăm sóc = số buổi tiêu thụ, không giả định quy đổi duration, không giả định historical window.

## 2. Mô hình dữ liệu và ranh giới khái niệm

`backend/prisma/schema.prisma:157-255` tách `Student`/`Package`/`Enrollment`; `:292-409` tách `Class`/`ClassTeacher`/`EnrollmentClass`/`ClassSchedule`/`ClassSession`; `:440-488` tách `Attendance` với hai ý kiến + trạng thái chốt. Nền tảng này đúng hướng; không quay lại bảng rộng.

Invariant đang có và hệ quả theo rule mới:

- `Attendance` unique `(enrollment_class_id, class_session_id)` (`:486`): một học viên tối đa một record trên một session; một session có nhiều học viên. **Đúng với mô hình "nhóm = một ClassSession + nhiều Attendance"** (`:303-306,354-355,404`).
- `ClassSession`: `session_date` bắt buộc, `start_time`/`end_time`/`teacher_id` nullable, `class_schedule_id` nullable; unique là `(class_id, session_number)` và `(class_schedule_id, session_date)` (`:387-408`). **Không có unique `(class_id, session_date)` hay `(class_id, session_date, start_time)` cho session thủ công (schedule_id null)** → hai buổi liên tiếp cùng ngày được hỗ trợ ở tầng lưu trữ, phân biệt bằng `session_number`. Báo cáo này **không chọn** bất kỳ unique ngày/giờ nào; nếu sau này cần ràng buộc, phải có quyết định nghiệp vụ riêng.
- `ClassSchedule` có `valid_from/valid_to/active` nhưng **không có cờ FIXED/FLEXIBLE theo model**; `ClassSession.status` (SCHEDULED/COMPLETED/CANCELLED, `:381-385`) chỉ là trạng thái buổi. **Không có thực thể planned-session riêng**: `SCHEDULED` không đồng nghĩa đã học, có schedule không đồng nghĩa attended/absent (rule 6).
- `EnrollmentClass.status` PLANNED/ACTIVE/COMPLETED/TRANSFERRED/CANCELLED (`:334-358`) là quan hệ học viên–lớp, không phải kết quả điểm danh.
- `Attendance`: `teacher_status`/`cs_status` nullable, `status` bắt buộc (`:440-462`). Record luôn có `status` nên đọc riêng `status` dễ nhầm pending thành final — final chỉ khi `reconciliation_state` MATCHED/RESOLVED.
- **Khoảng trống schema so với bộ rule mới** [XÁC NHẬN MÃ]: không có planned/actual separation, không có `actual_teacher_id`/`submitted_by` tách bạch, không có `rescheduled_from`/`makeup_for`, không có completion flag riêng cho attendance-review và feedback, CareTask không có contacted/replied/resolved. Không lấp các khoảng trống này bằng suy diễn từ `created_at` hay enum sẵn có.

## 3. 1-1 linh hoạt, nhóm cố định, hai buổi cùng ngày

- `Class.model_type` ∈ {1:1, 1:2, 1:n} (`backend/prisma/schema.prisma:281-285`). Parser lịch `backend/src/shared/schedule/schedule-pattern.ts:1-93` hỗ trợ pattern kiểu `246`, `35CN`, MANUAL_ONLY/LKCD, kiểm tra trùng ngày, normalize giờ.
- [XÁC NHẬN MÃ] **Không có invariant nàoràng buộc model_type với fixed/flexible**: auto-attendance chỉ xét pattern, không xét model (`backend/src/modules/auto-attendance/auto-attendance.service.ts:109-147`). Do đó 1:1 có pattern `246` vẫn auto, nhóm LKCD vẫn bỏ auto. Theo rule 1, 1-1 là linh hoạt — nhưng đó là **yêu cầu nghiệp vụ mới**, chưa được mã hóa; code hiện không cấm cũng không đảm bảo.
- Session thủ công qua `POST /classes/:classId/sessions` (`backend/src/modules/class-sessions/class-sessions.routes.ts:17-21`) cho phép ngày bất kỳ, giờ tùy chọn, tự cấp `session_number` max+1 trong transaction Serializable (`backend/src/modules/class-sessions/class-sessions.service.ts:26-53`; `backend/src/modules/class-sessions/class-sessions.repository.ts:28-47`). Hai create cùng ngày cho ra hai session khác nhau — **[XÁC NHẬN MÃ] không có chặn trùng ngày**.
- Đề xuất command "tạo buổi đã dạy" cho GV (rule 3) là hướng thiết kế [ĐỀ XUẤT], không phải mô tả hành vi đã có.

## 4. Đường tạo hồ sơ/lớp/lịch — các nguồn ghi khác nhau ngay lúc nhập

| Đường vào | Chứng cứ | Kết luận |
|---|---|---|
| UI `/students` create | `backend/src/modules/students/students.repository.ts:173-350` | Transaction tạo Student + Enrollment + Class theo tên; `class_model === '1:1'` → ONE_TO_ONE, còn lại ONE_TO_N; schedule tạo mới mỗi lần có pattern; teacher find/create + MAIN. Defaults total=30/external remaining=30 không gắn với số nhập. |
| UI `/students` update | `backend/src/modules/students/students.repository.ts:353-578` | Chọn Enrollment/EC/schedule/teacher assignment **đầu tiên**, sửa shared class/schedule/MAIN tại chỗ; đổi `class_model` chỉ sửa string enrollment, không đổi `Class.model_type`. Rủi ro một hồ sơ đổi lịch lớp chung. |
| Enrollment API / transfer | `backend/src/modules/enrollments/enrollments.service.ts:83-122`; `backend/src/modules/enrollments/enrollments.repository.ts:110-187` | Create không tự EC/class; transfer đóng EC ACTIVE cũ → EC mới sequence+1. Đường đúng ý tưởng lịch sử nhưng không đồng nhất với profile update/sync. |
| Class API / assign teacher | `backend/src/modules/classes/classes.service.ts:101-183` | Normalize model đúng; assign ưu tiên `Teacher.id` rồi `User.id` (`:164-181`) — không cùng namespace với session create (xem §5). |
| WORKBOOK import | `backend/src/modules/imports/imports.service.ts:1345-1726` | Lớp mới hard-code ONE_TO_ONE (`:1582-1609`); MAIN overwrite; **không tạo ClassSchedule**; không ghi attendance (`:1639-1640`). |
| Single STUDENT_ENROLLMENT import | `backend/src/modules/imports/imports.service.ts:1760-1999` | Mỗi dòng create enrollment mới + class mặc định ONE_TO_ONE; không idempotent theo gói; không schedule. |
| Approval queue | `backend/src/modules/imports/imports.service.ts:2508-2555` | Class mới ONE_TO_ONE; không hợp nhất mapper. |
| Google Sheet sync | `backend/src/modules/imports/sheet-sync.service.ts:664-1200`; parser `backend/src/modules/imports/sheet-sync.parser.ts:412-416` | Có mapper model riêng; **chỉ thêm schedule nếu lớp chưa có schedule bất kỳ** (`:1001-1015`); thêm MAIN nếu teacher khác, không kết thúc MAIN cũ; EC mới ACTIVE nếu chưa có; chỉ ghi snapshot total/prevYears/externalRemaining (`:932-946`), không sinh Attendance. Row không atomic (ghi tuần tự `:819-1126`, catch per row `:1131-1136`); hash skip chỉ giảm lặp, không phải CAS. |

## 5. Giáo viên: tạo actual session, lesson content/note, hai ý kiến, phân xử

### 5.1 UI teacher tạo buổi thực dạy — capability backend có, UI "Lịch dạy của tôi" chưa có

- `frontend/src/features/classes/pages/ClassSessionsPage.tsx:83-140,276-367` (đường `/classes/:classId/sessions`) có nút "Thêm buổi học mới": ngày bắt buộc, giờ tùy chọn, mặc định SCHEDULED; không nhập teacher trong form create.
- `frontend/src/features/attendance/pages/MyTeachingSessionsPage.tsx:96-115` chỉ **tải session đã tồn tại** qua `/attendance-reconciliation/teacher-sessions`, giới hạn theo lớp có `ClassTeacher.active` (`backend/src/modules/attendance/reconciliation.service.ts:975-1030`; route `backend/src/modules/attendance/reconciliation.routes.ts:14-19` roles ADMIN/MANAGE/TEACHER). Khi mở modal điểm danh, nếu chưa có attendance record thì từ chối với "Buổi học chưa có hồ sơ điểm danh ban đầu. Vui lòng liên hệ CSKH" (`:137-141`). **Không có nút tạo session trong UI này.**
- [XÁC NHẬN MÃ] **Khoảng trống UI, không phải thiếu năng lực backend**: backend cho TEACHER tạo session (`backend/src/modules/class-sessions/class-sessions.routes.ts:17-21`) và AttendanceMatrix tự tạo session khi mark ngày chưa có (`frontend/src/features/classes/components/AttendanceMatrix.tsx:1089-1101,1137-1158`); lưu lesson topic/note khi chưa tồn tại record còn tự gọi mark với `status: 'ATTENDED'` theo phía đang chọn (`frontend/src/features/classes/components/AttendanceMatrix.tsx:1159-1165`) — nội dung bài giảng có thể **implicit tạo attendance "đã học"**, cần tách khỏi rule "planned ≠ attended" (rule 6) và completion phân trục (rule 7). GV còn có thể tạo session qua trang ClassSessions với class scope rồi mark Attendance qua API/matrix; không bắt CS/Admin tạo hộ. Các capability này và import lịch sử không thay cho flow chuyên biệt tại MyTeachingSessions — **không có một flow "GV tự khai báo buổi đã dạy"** trong UI teacher.
- Teacher-scoped `getTeacherSessions` không lọc theo `ClassSession.teacher_id`, không xét `ClassTeacher.start_date/end_date`, chỉ include EC ACTIVE (`backend/src/modules/attendance/reconciliation.service.ts:995-1030`) — "lớp thuộc scope", không phải sổ dạy thực tế.

### 5.2 Namespace danh tính GV bị trộn [XÁC NHẬN MÃ]

- `ClassSession.teacher_id` là `Int?` **không relation/FK** (`backend/prisma/schema.prisma:394`). Session create validate đó là `User.id` có role TEACHER (`backend/src/modules/class-sessions/class-sessions.service.ts:35-39`); update session **không validate** (`:56-67`). Class assign ưu tiên `Teacher.id` (`backend/src/modules/classes/classes.service.ts:164-181`). `backend/src/modules/classes/classes.scope.ts:17-62` đối chiếu cả `Teacher.id` lẫn `User.id` lẫn match theo email. Hai ID bảng tình cờ trùng có thể cấp scope nhầm; đường update session có thể lưu ID không theo chuẩn nào.
- Attendance ghi `teacher_user_id` = **actor nộp** (`backend/src/modules/attendance/reconciliation.service.ts:238`), admin hỗ trợ ghi `teacher_user` là `actor.id` dù validate `data.teacherId` (`:214-245`). Không có trường "GV thực dạy"; không dùng `teacher_user_id` làm actual teacher.
- Scope đọc/điểm danh chỉ xét `active`, không xét khoảng ngày hiệu lực của phân công (`backend/src/modules/classes/classes.scope.ts:35-62`; `backend/src/modules/attendance/attendance.service.ts:41-49`; `backend/src/modules/attendance/reconciliation.service.ts:65-73,128-139`). Phân công tương lai hoặc hết hạn vẫn còn quyền. **Yêu cầu acceptance (user đã xác nhận): quyền và attribution phải theo phân công tại ngày dạy thực tế**; code hiện mới kiểm `active`, chưa kiểm khoảng hiệu lực theo ngày — đây là gap so với yêu cầu đã duyệt ở mức phân tích tĩnh, khác loại với lỗi trộn namespace ID ở gạch đầu dòng trên.
- Nút upload legacy: `frontend/src/features/attendance/pages/MyTeachingSessionsPage.tsx:161-176` → `frontend/src/features/attendance/api/reconciliation.api.ts:110-121` → `/upload-teacher-excel`; route còn khai báo (`backend/src/modules/attendance/reconciliation.routes.ts:35-41`) nhưng controller trả **410** (`backend/src/modules/attendance/reconciliation.controller.ts:145-147`, "dùng /import-excel/preview rồi /confirm"). Handler legacy còn gọi endpoint 410, nhưng không thấy nút gọi setIsUploadModalOpen(true); action header hiện chuyển sang /imports?tab=attendance (frontend/src/features/attendance/pages/MyTeachingSessionsPage.tsx:185-193). Không kết luận thao tác upload hiện thấy được chắc chắn lỗi; luồng panel mới (`AttendanceExcelImportPanel` → `frontend/src/features/attendance/api/reconciliation.api.ts:144-162` → routes `:21-33`) là đường đang chạy.

### 5.3 Lesson content/note và ngày dạy vs thời điểm nộp

- Ngày dạy thực tế = `ClassSession.session_date` (`backend/prisma/schema.prisma:391`), do người tạo session nhập; automation xếp thứ tự theo chính field này (`backend/src/modules/automation/automation-trigger.service.ts:107-111,256-268`), **không theo submitted timestamp**.
- Ý kiến GV: `teacher_status`, `lesson_topic`, `teacher_note`, `teacher_raw_value`, `teacher_submitted_at = new Date()` lúc mark, `teacher_user_id` = actor (`backend/src/modules/attendance/reconciliation.service.ts:232-246`; schema `:445-451`). UI nhập topic/note tại `frontend/src/features/attendance/pages/MyTeachingSessionsPage.tsx:47-55,479-503`, gửi `markByTeacher` (`:144-149`).
- Ý kiến CS: `cs_status`, `cs_note`, `cs_submitted_at = new Date()`, `cs_user_id` (`backend/src/modules/attendance/reconciliation.service.ts:275-287`). Import cũng ghi submitted time lúc commit (`backend/src/modules/attendance/attendance-import.service.ts:195-198`).
- **Actual teaching date ≠ submitted timestamp**: nếu GV dạy tối thứ Ba nhưng khai báo hôm sau, `session_date` là thứ Ba (do tạo session nhập), `teacher_submitted_at` là hôm sau; audit `created_at` là lần thứ ba (`backend/src/modules/attendance/reconciliation.service.ts:541-568`). Report/automation phải dùng `session_date`; không được lấy `created_at`/`teacher_submitted_at` thay. [XÁC NHẬN MÃ] code hiện phân biệt đúng ba loại thời gian này ở tầng lưu; rủi ro nằm ở UI đọc/hiển thị (matrix hiển thị `updated_at` optimistic `frontend/src/features/classes/components/AttendanceMatrix.tsx:930-939`).
- [CHƯA BIẾT] chưa xác minh UI nào cho phép sửa `session_date` lệch ngày dạy có bị đối soát lại không; session update đổi ngày làm attendance "di chuyển ngày" theo (`backend/src/modules/class-sessions/class-sessions.repository.ts:50-65`, không chạy lifecycle attendance).

### 5.4 Thiếu ý kiến ≠ conflict; Admin phân xử; MANAGE trong code

- `deriveState` (`backend/src/modules/attendance/reconciliation.service.ts:59-63`): thiếu teacher → PENDING_TEACHER; thiếu CS → PENDING_CS; **cả hai có và bằng nhau → MATCHED; cả hai có và khác → CONFLICT**. [XÁC NHẬN MÃ] Thiếu một ý kiến **không bao giờ** cho ra CONFLICT — khớp rule 8.
- Pending queue kiểm tra cả state lẫn opinion, không tin state default (`backend/src/modules/attendance/reconciliation.service.ts:82-103`) — record auto-hai-ý-kiến-null không lọt hàng chờ hợp lệ.
- Resolve: route `POST /:id/resolve-conflict` roles **['ADMIN','MANAGE','CS']** (`backend/src/modules/attendance/reconciliation.routes.ts:88-93`); service chỉ chặn khi state ≠ CONFLICT (`:305-313`), rồi `assertCSScope` cho qua mọi ADMIN/MANAGE (`:75-78`). `bulk-approve` cũng mở cho ADMIN/MANAGE/CS (`routes:95-100`). **[XÁC NHẬN MÃ] MANAGE hiện phân xử được.** Rule mới: Admin arbitrates; **MANAGE delegation chưa được xác nhận** → đây là mismatch code-vs-rule, không phải bằng chứng MANAGE đã được ủy quyền. [ĐỀ XUẤT] chốt policy rồi mới siết route/service; ghi rõ ai được phân xử hộ CS nào.
- Attendance API phía matrix: ADMIN/MANAGE chỉ được sửa cột ADMIN/chốt, cấm sửa cột TEACHER/CS (`backend/src/modules/attendance/attendance.service.ts:18-39`). Đây là operation khác với arbitration reconciliation; không gộp hai khái niệm.
- CS phụ trách hiện cũng có thể resolve qua `assertCSScope`; đây là lệch so với quy tắc Admin phân xử đã xác nhận, không phải quyền được coi là đã duyệt.

### 5.5 Trạng thái hoàn thành attendance / review / feedback tách riêng

Code hiện có ba tín hiệu độc lập nhưng **chưa có completion flag riêng cho từng trục**:

1. `ClassSession.status` SCHEDULED/COMPLETED/CANCELLED — trạng thái buổi (rule 6: planned ≠ attended).
2. `Attendance.reconciliation_state` + hai opinions — đã nộp/đã đối soát/conflict/final. Teacher writer thường ghi status và submitted_at cùng lúc; schema không ràng buộc hai field tương đương, không dùng một field làm bằng chứng review completion.
3. `CareLog`/`CareTask` — feedback và work status.

[XÁC NHẬN MÃ] schema không có field nào biểu diễn "attendance đã được review xong" hay "feedback đã hoàn tất" tách khỏi reconciliation_state/CareTask.status. [ĐỀ XUẤT] read model giữ ≥3 trục; không đánh dấu buổi "hoàn thành" chỉ vì session COMPLETED hoặc một opinion đã nộp; không đánh dấu feedback xong chỉ vì CareTask DONE (xem §9, rule 9).

## 6. Import attendance: N session, ngày, và vai trò giờ

- `backend/src/modules/attendance/attendance.utils.ts:25-51`: X/ĐÃ HỌC + A/B/C/D/E = 1 session; số nguyên dương N → ATTENDED với `sessionCount = N`; `ID-topic` → 1 session + lessonTopic + studentExternalId.
- `AttendanceImportService.preview` (`backend/src/modules/attendance/attendance-import.service.ts:32-139`): sheet CSKH ("chấm buổi/điểm danh") hoặc GV ("スケジュール/schedule/lịch dạy"); remap năm (`backend/src/modules/attendance/attendance.utils.ts:78-83`, leap-day → null → INVALID); match đúng một EC ACTIVE của enrollment không FINISHED/CANCELLED, optionally theo model class và class reference (`:85-111`); **yêu cầu start_time & end_time, thiếu → INVALID** (`:82-84`).
- Plan N slot liên tiếp: `start + i*duration` (`:113-118`, `durationMinutes` từ start/end `:240`); match class+date+start+end; CSKH có fallback session date-only unique (`:119-127`); không có session → plan CREATE_SESSION (`:129`). [XÁC NHẬN MÃ] "import chỉ match session có trước" **không còn đúng** với importer này.
- Commit theo item trong transaction: tìm/tạo session COMPLETED cấp number max+1 (`:156-190`), upsert **một phía**, derive state từ phía kia (`:191-237`), audit per item. [XÁC NHẬN MÃ] commit **không gọi `handleAttendanceEvent`/`cancelPendingDeliveries`** (đối chiếu `backend/src/modules/attendance/attendance.service.ts:58-68`, `backend/src/modules/attendance/reconciliation.service.ts:192-202`) — MATCHED qua file không kích hoạt automation, file sửa final→CONFLICT không hủy delivery chờ tại writer này. `updateData` không clear `deleted_at` (`:198-206`).
- **So với rule 2 (giờ chỉ là tham chiếu, không bắt buộc):** code hiện **mandatory hóa giờ** (`:82-84`) và dùng giờ làm khóa match cho file GV; fallback date-only chỉ dành cho CSKH. Cần đọc đúng range của rule: **không nâng yêu cầu thành "mọi session/import phải là actual do teacher tạo"** — import giờ kế hoạch (file lịch GV) là tham chiếu lập kế hoạch, khác import attendance lịch sử thật (file chấm buổi CSKH); prior session không bắt buộc, và **create actual session + Attendance cùng một command là hợp lệ** (import hiện tại đã làm đúng hướng này: CREATE_SESSION + upsert attendance trong cùng transaction commit `:156-237`). [ĐỀ XUẤT] bỏ mandatory giờ ở preview, coi giờ là disambiguator; nếu nhiều session cùng ngày không giờ → yêu cầu chọn session, không tự chọn.
- [RỦI RO MÃ] quy đổi slot `start + i*duration` và qua nửa đêm là hành vi parser, **không phải** quy tắc nghiệp vụ đã duyệt; không giả định duration conversion. Race max(number)+1: manual/auto có Serializable+retry (`backend/src/modules/class-sessions/class-sessions.service.ts:42-53`, `backend/src/modules/auto-attendance/auto-attendance.repository.ts:176-224`), import không.
- Legacy còn code nhưng API đã chặn: `uploadTeacherExcel` service (`backend/src/modules/attendance/reconciliation.service.ts:759-970`) controller trả 410 (`backend/src/modules/attendance/reconciliation.controller.ts:145-147`) — không phải active write path. Generic ATTENDANCE import **vẫn còn nối** (`backend/src/modules/imports/imports.routes.ts:49-53` → `backend/src/modules/imports/imports.service.ts:2000-2148`): match class+ngày không giờ (`backend/src/modules/imports/imports.repository.ts:397-425`), một ô N chỉ upsert 1 record (`backend/src/modules/imports/imports.service.ts:2096-2124`), "findActiveEnrollmentClass" không filter ACTIVE (`backend/src/modules/imports/imports.repository.ts:380-394`), repo luôn ghi `status` kể cả conflict (`:474-479`), không per-record scope check (`backend/src/modules/imports/imports.service.ts:2042-2124`, route mở 4 role). Đây là đường alternate cần quyết định gỡ/về domain service.

## 7. Ma trận số buổi còn lại — các nguồn tính không tương đương

**[XÁC NHẬN MÃ] Không có domain calculator chung.** Tách biệt lexical: **attended** (số buổi có final ATTENDED), **consumed** (ATTENDED + C final theo business-rules), **ordinal chăm sóc** (vị trí mốc), **remaining** (entitlement còn lại), **external remaining** (snapshot đối soát), **legacy opening balance** (`attended_previous_years`). Không đồng nhất chúng, không giả định ordinal care = consumed.

### 7.1 AttendanceMatrix (frontend)

`frontend/src/features/classes/components/AttendanceMatrix.tsx:666-776`: đếm theo `selectedSide` (ADMIN→`status`, TEACHER→`teacher_status`, CS→`cs_status`, `:737-743`) — đổi side đổi số. **Bug ngày-collapse**: `processedDates: Set<string>` theo `ec + dStr` (`:700,734-735`) bỏ qua attendance thứ hai cùng ngày → hai buổi cùng ngày chỉ đếm 1 dù schema và import hỗ trợ (rule 4). C đếm vào `totalAbsentC` nhưng không vào consumed/remaining. `:2301-2307` remaining = `total - prevYears - totalAttended` (không gate final, không C, thiếu session cùng ngày thứ hai). Ô quick-final hiển thị "—" khi hai opinion null trước nhánh RESOLVED admin (`:1516-1531`; admin-create `backend/src/modules/attendance/attendance.repository.ts:124-130`).

### 7.2 StudentsPage / EnrollmentsPage

- `frontend/src/features/students/pages/StudentsPage.tsx:1034-1091`: đếm ATTENDED theo **năm hiện tại** trên EC đầu của enrollment đầu; `attended_previous_years` ưu tiên field, fallback suy từ `total - external - attendedThisYear` (`:1062-1068`) hoặc history; remaining hai nhánh (`:1075-1081`). Không C, không gate final, không xuyên EC. Detail view `:2074-2107` in **trực tiếp** `external_remaining_sessions` — cùng trang hai số khác bản chất.
- `frontend/src/features/enrollments/pages/EnrollmentsPage.tsx:178-199,368-398`: gom attendance xuyên các EC của một enrollment nhưng remaining vẫn `total - prevYears - attendedCurrent`, không final gate, không C; filter "còn lại" phụ thuộc công thức này → một gói chuyển lớp có thể xuất hiện lệch theo dòng.
- Default create form `total_sessions: 30`, `external_remaining_sessions: 30` (`frontend/src/features/students/pages/StudentsPage.tsx:244-249,600-605`) — 30 không phải hằng nghiệp vụ đã duyệt; chỉ ghi nhận mặc định UI.

### 7.3 Dashboard backend

`backend/src/modules/dashboard/dashboard.repository.ts`: `getAttendanceStats` (`:79-144`) groupBy `status` **không filter reconciliation_state** (đếm cả pending/`status` default), `totalSessions` đếm mọi session không cùng filter; `countNearCompletion` (`:356-382`) đếm **mọi attendance record** (mọi status, mọi state, include deleted? — không filter deleted_at ở query này) so với total ≤10 → "gần hết gói" over-count; `getMilestoneCoverage` (`:401-438`) `attended = mọi attendance.length`, reached theo mốc care — **đây là chỉ dấu ordinal-attendances, không phải consumed**; trend/`buildAttendanceWhere` (`:481-513,722-743`) có `deleted_at: null` nhưng không final gate. Phân loại care response (`backend/src/modules/dashboard/dashboard.repository.ts:183-224` → `backend/src/modules/dashboard/dashboard.service.ts:230-259`): thiếu log = NOT_ENTERED; `NO_RESPONSE` chỉ gắn khi outcome lưu là NO_RESPONSE hoặc content ghi đúng nhãn "Chưa phản hồi"; **log có nhưng cả content lẫn outcome trống vẫn bị tính NOT_ENTERED**. Dashboard phân biệt được "chưa nhập" vs "không phản hồi" ở mức nhãn, nhưng **không có trạng thái replied/resolved** cho contacted (rule 9) — CareLog chỉ có outcome/mốc một lần ghi.

### 7.4 Automation ordinal

`backend/src/modules/automation/automation-trigger.service.ts`: gate final tốt — chỉ chạy khi MATCHED/RESOLVED (`:90-97`). `resolveEnrollmentSessionNumber` (`:256-269`) = **count(attendance status=ATTENDED, final, `session_date < session_date của record đang xử lý`) + 1**. Hai hệ quả xác định từ code: (a) **mọi record cùng ngày với record trigger nhận cùng một ordinal** — không phân biệt được hai buổi liên tiếp cùng ngày; (b) công thức chỉ đếm ATTENDED trong quá khứ, còn record trigger là C/D/E vẫn đẩy workflow step theo ordinal "số buổi" đó. **Căn cứ mốc ordinal nào là đúng (đếm theo session đã final, theo ngày, hay theo `session_number`) chưa được nghiệp vụ chốt** — do đó (a)(b) được ghi là *ordinal semantics chưa chốt + hệ quả code*, **không tuyên bố "thiếu C là sai ordinal"**; cần workbook/owner chốt trước khi sửa công thức. Remaining render `max(0, total - sessionNumber)` (`:167`) clamp, mất nợ âm. [XÁC NHẬN MÃ — P1 về thiếu contract; mức lỗi nghiệp vụ chờ chốt]

### 7.5 Backup / broadcast / export / sync

- `backend/src/modules/imports/sheet-backup.service.ts:812-858`: `attendanceByDate: Map<dateStr, att>` — **một bản ghi/ngày** (cùng loại day-collapse như matrix); count theo `att.status` mọi reconciliation_state; `totalAttendedAndC = attended + C` (đúng phần C tiêu thụ nhưng **không final-gate**: pending/conflict cũng vào tổng); `remaining = max(0, total - consumed)` khi có web attendance, ngược lại fallback external/prevYears, clamp ≥0 (mất nợ âm). Milestone fallback 27→29, 40→45 (`:867-873`) — mapping display, không phải quy tắc nghiệp vụ.
- `backend/src/modules/automation/broadcast.service.ts:154-165`: placeholder `remaining_sessions` ưu tiên `external_remaining_sessions` rồi total — gửi **snapshot đối soát** như số dư; lệch matrix/backup/automation.
- Export students đơn giản `backend/src/modules/imports/imports.service.ts:2303-2318`: enrollment đầu, external remaining nguyên giá trị — cần dán nhãn đối soát.
- `backend/src/modules/imports/sheet-sync.service.ts:932-946` + parser (`backend/src/modules/imports/sheet-sync.parser.ts:653,858`): snapshot import; ranh giới "sync không sinh Attendance" đúng; downstream vi phạm ranh giới ở broadcast.

**Ví dụ logic (không phải test DB):** gói total=10, hai buổi ATTENDED final cùng một ngày + một C final → consumed=3, remaining=7; matrix/dashboard/automation/broadcast hiện cho ra các giá trị khác nhau cho cùng dữ liệu đó (matrix đếm ngày → attended 1→consumed khác; automation ordinal trùng ngày; dashboard tính mọi record; broadcast in snapshot). Pending không được đổi 7; A/B/D/E không được +consumed (rule business-rules.md:19-42).

## 8. Auto-attendance: lịch định kỳ không phải sự thật "đã học"

Cron mỗi phút (`backend/src/modules/auto-attendance/auto-attendance-scheduler.ts:7-47`), delay default 15 sau **start** (`backend/src/modules/auto-attendance/auto-attendance.types.ts:1-4`; `service.ts:149-195`). Các lệch [XÁC NHẬN MÃ] so với rule:

1. `findActiveSchedules` chỉ lọc `schedule.active` (`repository.ts:100-120`), service không xét `Class.active`, `valid_from/valid_to`, EC period (chỉ Enrollment STUDYING + ngày `:129-147`) → có thể auto ngoài hạn.
2. `findOrCreateClassSession` match `(class, schedule_id, date)`, **không reuse** manual/import session cùng class/date/giờ nếu schedule_id null; session auto không copy start/end/teacher, mặc định **SCHEDULED** (`:176-215`) → buổi thực tế nhập trước + auto sau có thể thành hai session cho cùng một ca. Hai ca thật chủ đích là hợp lệ; hai representation của cùng ca do writer khác nhau là nguy cơ trùng, không được hợp thức hóa bằng rule hai ca/ngày.
3. `createAttendance` ghi `status: ATTENDED, source AUTO_SCHEDULE`, **không hai opinion** (`:236-251`); `handleAttendanceEvent` chạy nhưng tự gate final (`backend/src/modules/automation/automation-trigger.service.ts:90-97`) → không automation; pending queue yêu cầu opinion (`backend/src/modules/attendance/reconciliation.service.ts:82-103`) → record auto rơi khỏi mọi hàng chờ nhưng **có `status` như đã chốt**. Auto chỉ là nguồn nghi vấn, không được suy "đã học" từ nó; và theo rule 6/7, auto-fill một trạng thái duy nhất cho cả lớp chưa chắc đúng nếu thực tế có người nghỉ.
4. Auto bỏ qua **bất kỳ** attendance nondeleted đang có, không điền phía CS còn trống khi teacher đã nhập (`service.ts:249-254`) — "fill empty" hiện là empty-record check, không phải empty-side check.
5. [RỦI RO MÃ] soft-deleted attendance vẫn giữ unique `(EC, session)` (`backend/prisma/schema.prisma:486`, `repository.ts:226-232` lọc `deleted_at: null`) → create có thể P2002 → FAILED; cron default không retry (`service.ts:75-78,198-201`); chỉ tính "hôm nay" (`:95-99`) — downtime/delay quá nửa đêm **mất lượt, không catch-up**; PROCESSING do crash không có reclaim timeout. Không suy lịch sử: không có backfill theo ngày.

## 9. Care: milestone, feedback, task — contacted ≠ replied ≠ resolved

- `backend/src/modules/care/care.service.ts:68-86` tạo CareLog với `after_session_number` **do người nhập** và `outcome` ∈ 8 giá trị (`backend/prisma/schema.prisma:864-873`); `saveSessionCareLog` tìm rồi update/create theo `(enrollment, mốc)` (`backend/src/modules/care/care.service.ts:224-240`; `backend/src/modules/care/care.repository.ts:255-296`, create default outcome POSITIVE khi thiếu). [XÁC NHẬN MÃ] mốc do người gõ, **không được đồng nhất** với ordinal automation (§7.4) — hai trường mang nhãn "buổi N" nhưng chưa có contract xác nhận cùng căn cứ; cần chốt semantics trước khi dùng milestone làm ngưỡng.
- Milestone config toàn cục theo `session_number` unique (`backend/prisma/schema.prisma:936-944`); `addMilestone` chỉ chặn ≤ 0 (`backend/src/modules/care/care.service.ts:215-220`). Mặc định UI 1/3/10/15 (`frontend/src/features/students/pages/StudentsPage.tsx:203`). Không có cơ chế per-package — [CHƯA BIẾT] gói ≠ 30 cần milestone riêng không.
- **Không có thực thể contacted/replied/resolved**: CareLog chỉ outcome một lần ghi; CareTask chỉ `PENDING/DONE/CANCELLED` (`backend/prisma/schema.prisma:908-913`; `backend/src/modules/care/care.service.ts:194-207`). Task DONE = việc xong, **không phải** HV đã reply hay issue đã resolved; callback/hot_issue note tự tạo task mỗi lần lưu, không dedup theo note (`backend/src/modules/care/care.service.ts:259-289` — create, không upsert) → task trùng lặp [RỦI RO MÃ]. Không giả định "contacted" từ delivery: `MessageDelivery` là kênh gửi (`schema` automation), không liên kết CareLog. [ĐỀ XUẤT] nếu rule 9 cần enforcement, phải có trạng thái loop feedback (đã liên hệ → đã nhận phản hồi → đã xử lý) — chưa tồn tại trong schema, chưa phải bug MVP tự gán.
- `frontend/src/features/students/pages/StudentStudyReportPage.tsx:120-163`: report là JSON nhập tay trong `program_metadata.study_report` của enrollment đầu, stage 1–10/11–20/21–30, giữa/cuối kỳ; các trường nghỉ là string; save qua `studentsApi.update` ghi metadata + URL (`backend/src/modules/students/students.repository.ts:378-379,444-475`). **Không phải report engine derive từ final ledger**; số nghỉ không validate với C/A/D; các mốc 1/3 hard-code theo cấu trúc form.

## 10. Tổng hợp phát hiện ưu tiên

### A. Xác nhận từ mã (không có reproduced evidence lượt này)

1. **P1 — Không có contract số buổi chung**: 6+ công thức khác nhau (matrix/side + day-collapse §7.1; students §7.2; enrollments §7.2; dashboard mọi-record §7.3; automation date-before+1 §7.4; backup day-collapse + mọi-state §7.5; broadcast snapshot §7.5). Cùng dữ liệu, nhiều số.
2. **P1 — Automation thiếu contract ordinal**: code cho hai session cùng ngày cùng ordinal (`backend/src/modules/automation/automation-trigger.service.ts:256-269`); đếm ATTENDED trước ngày rồi +1 cho event hiện tại. Chưa chốt cơ sở mốc; không gọi thiếu C là sai ordinal và không ép dùng class session_number làm ordinal Enrollment.
3. **P1 — Day-collapse ở read model**: `frontend/src/features/classes/components/AttendanceMatrix.tsx:700,734-735`, `backend/src/modules/imports/sheet-backup.service.ts:814-827` — trái rule "hai buổi cùng ngày".
4. **P2 — Import bắt buộc giờ** (`backend/src/modules/attendance/attendance-import.service.ts:82-84`) trái rule 2; session tự tạo COMPLETED không gắn GV thực dạy, không downstream lifecycle (§6).
5. **P2 — MANAGE phân xử trong code** (`backend/src/modules/attendance/reconciliation.routes.ts:88-93` + `backend/src/modules/attendance/reconciliation.service.ts:75-78,305-323`) trong khi delegation MANAGE **chưa được xác nhận** (§5.4).
6. **P2 — Auto-fill single-status không opinion, rơi khỏi mọi queue nhưng `status` như final** (§8.3); không reuse session manual cùng ngày → pair duplicate (§8.2).
7. **P2 — MyTeachingSessions thiếu flow tạo actual session + opinion**; trang ClassSessions/API/matrix có capability tạo riêng hoặc tạo khi mark. Handler upload cũ gọi 410 nhưng action header hiện mở import mới, không coi handler không reachable là lỗi thao tác đang hiển thị (§5.1–5.2).
8. **P3 — Danh tính GV trộn** `User.id` vs `Teacher.id` vs scope dual (§5.2); `teacher_user_id` là người nộp, không phải GV thực dạy.
9. **P3 — Profile create/update hard-code model hoặc sửa shared class/schedule/teacher**; WORKBOOK ONE_TO_ONE; sync chỉ thêm schedule khi chưa có (§3–4).
10. **P3 — CareTask DONE ≠ replied ≠ resolved; milestone do người nhập và ordinal automation chưa có contract xác nhận tương đương** (§9).

### B. Rủi ro code chưa tuyên bố incident

- Race max(session_number)+1 ở import vs Serializable ở manual/auto; soft-delete unique collision P2002; PROCESSING treo không reclaim; không catch-up sau downtime (§6, §8).
- Sync row non-atomic + full-payload overwrite có thể chèn đè manual edit; hash unchanged ≠ DB equivalent (§4).
- Resolve/mark đọc existing trước transaction, không version/CAS (`backend/src/modules/attendance/reconciliation.service.ts:204-335`); reconciliation findUnique/update không lọc `deleted_at` (`:205,268,306,340` vs `backend/src/modules/attendance/attendance.repository.ts:25-33`).
- Generic ATTENDANCE import không per-record authorization, match date-only, một ô N=1 record (§6 cuối).
- `attendance-import` update không clear `deleted_at` — sửa record từng soft-delete có thể vô hình ở màn lọc deleted_at dù audit "updated" (§6).

### C. Chưa biết / cần hỏi (không tự chốt)

- Snapshot DB: duplicate active EC/schedule, session null-giờ, ID collision — chưa đọc DB.
- Workbook: quy tắc giờ tham chiếu thực tế, historical window, duration conversion, màu ô/công thức nguồn — chờ agent workbook; không suy từ parser.
- `attended_previous_years`: chưa có cutoff/baseline để chống cộng trùng Attendance lịch sử; migration opening balance cần bằng chứng riêng, không tự tạo event từ "đã học N" (business-rules.md `:44-66`).
- Admin phân xử đã chốt; chỉ ủy quyền MANAGE chưa chốt. Quyền sửa attendance lịch sử và khóa kỳ (`business-rules.md:74-94` còn mở).
- Worker dispatch có re-check final/deleted/cancelled ngay trước gửi không — agent automation phụ trách; báo cáo này chỉ kết luận writer import thiếu call.

## 11. Hướng hợp nhất (đề xuất, chưa được phê duyệt triển khai)

1. Giữ tách Student/Enrollment/EC/Class/Session/Attendance, unique EC+session, hai opinions + final + audit. Nhóm = một session nhiều attendance (đúng rule 5, đã có).
2. Một **session identity contract** dùng session id ổn định; thứ tự ca và basis milestone là contract riêng chưa chốt, không tự chọn session_number của lớp làm mốc cá nhân; cho phép hai session cùng ngày; giờ là tham chiếu khi thiếu không chặn ghi (rule 2–4).
3. Một **command pipeline** theo loại nguồn: import lịch kế hoạch chỉ tạo/tham chiếu kế hoạch; báo cáo thực dạy hoặc import attendance lịch sử có thể tạo actual session + Attendance cùng command, không cần prior session và không bắt mọi nguồn do GV tạo. Validate phân công tại ngày dạy → ghi side opinion → derive state → audit → downstream idempotent. Auto hiện chưa ghi opinion; ý nghĩa auto như một phía là đề xuất, không phải sự đồng thuận hai phía.
4. Một **read model** tách attended/consumed/remaining/ordinal/external snapshot/opening balance; mọi UI/export/message dùng chung; bỏ day-collapse; final-gate thống nhất.
5. **Arbitration policy** về Admin (rule 10); MANAGE chỉ khi được xác nhận bằng văn bản; per-record authorization cho mọi writer kể cả generic import.
6. Danh tính GV một namespace; kiểm tra planned assignment tại ngày dạy (yêu cầu acceptance đã xác nhận) / actual teacher of session / người nộp.
7. Trục completion tách ba: attendance / review / feedback; nếu rule 9 cần contacted→replied→resolved, thiết kế state machine riêng, không suy từ CareTask DONE.
8. Không mở rộng payroll/renewal engine ngoài scope; nhu cầu nhắc gần hết gói chờ workbook xác nhận.

## 12. Độ bao phủ và giới hạn kiểm chứng

Đã đọc lại trực tiếp (không dựa báo cáo cũ): `backend/prisma/schema.prisma` (core learning + attendance + care), `backend/src/modules/students/students.repository.ts`, `enrollments.service/repository`, `classes.service/scope`, `class-sessions.*` (routes/schema/service/repository/controller), `attendance.service/controller` (head), `reconciliation.service/controller/routes` (toàn bộ), `backend/src/modules/attendance/attendance-import.service.ts` (toàn bộ), `backend/src/modules/attendance/attendance.utils.ts`, `auto-attendance.service/repository` (đoạn tính), `backend/src/modules/automation/automation-trigger.service.ts:80-299`, `dashboard.service/repository` (toàn bộ), `care.service/repository` (toàn bộ), `backend/src/modules/imports/sheet-backup.service.ts:780-910`, `sheet-sync.service/parser` (anchor), `imports.service` (anchor + 410 check), frontend: `frontend/src/features/classes/pages/ClassSessionsPage.tsx`, `frontend/src/features/attendance/pages/MyTeachingSessionsPage.tsx` (toàn bộ), `frontend/src/features/attendance/api/reconciliation.api.ts` (toàn bộ), `frontend/src/features/classes/components/AttendanceMatrix.tsx` (stats/bulk/cells), `frontend/src/features/students/pages/StudentsPage.tsx`/`frontend/src/features/enrollments/pages/EnrollmentsPage.tsx` (đoạn tính), `frontend/src/features/students/pages/StudentStudyReportPage.tsx`, `care.components/CareLogTimeline`, `dashboard.components`, `backend/src/modules/classes/classes.scope.ts`.

**Đã kiểm tra và loại bỏ kết luận cũ sai:** (a) route `/upload-teacher-excel` vẫn còn khai báo trong `backend/src/modules/attendance/reconciliation.routes.ts:35-41` (bản cũ ghi routes `:88-113` chỉ có mark/resolve) — 410 là ở controller, không phải route bị gỡ; (b) import preview **có** tạo session CREATE_SESSION, phủ nhận tài liệu "chỉ match session sẵn".

**Attribution đánh giá/care:** report JSON hiện không có author/reviewer/submitted-at theo từng giai đoạn (`frontend/src/features/students/pages/StudentStudyReportPage.tsx:10-50,147-163`); không suy người nhập report là GV. CareLog có `created_by_id` và `cs_id` riêng (`backend/prisma/schema.prisma:875-891`), nhưng upsert cập nhật content/outcome không lưu last-editor riêng (`backend/src/modules/care/care.repository.ts:263-290`). Người phụ trách enrollment, người tạo log và người sửa/đánh giá không tự đồng nhất.

**Không làm:** không chạy test/app/job/DB/mạng/automation; không giải nén ZIP workbook; không sửa source/schema/config; không commit. Phân tích tĩnh, không tuyên bố suite pass, không có reproduced evidence trong lượt này.

**Ranh giới import:** thời gian lịch đăng ký không bắt buộc để GV nhập ca thực; chưa suy thành mọi workbook thiếu giờ đều có thể tự match. Nếu nhiều ca/ngày mà không đủ định danh, preview cần người chọn ca/khai báo ca mới, không chọn dòng đầu. Historical attendance có bằng chứng được tạo session+opinion trong NO_SEND; endpoint teacher-upload trả 410 không là live writer.
