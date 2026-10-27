# 03 — Đối chiếu review và liên-phân-hệ

**Ngày rà soát:** 24/10/2026  
**Branch:** `main`  
**Commit đối chiếu:** `cbf78c337b8ff534a6d9b3ea5d63cf626cd44b17` (`docs: audit task backlog 2026-10-23 (technical + business findings, prioritized P0-P2)`)  
**Phạm vi thay đổi:** chỉ cập nhật file này; không sửa source, schema, migration, frontend, DB hay artifact khác.

> Đây là báo cáo đối chiếu tĩnh. Không chạy app, test, migration, query DB, API, browser, automation, connector, Sheet, Zalo/LINE hay runtime. Vì vậy mọi kết luận về dữ liệu thực tế, concurrency, delivery và hành vi production vẫn là **CXM/unknown** nếu không có chứng cứ runtime riêng.

---

## 1. Quy ước nguồn và cách đọc kết luận

Báo cáo dùng các nhãn sau để không trộn business rule với hành vi implementation:

- **[U] User-confirmed:** quy tắc nghiệp vụ người dùng xác nhận trong yêu cầu rà soát này. Đây là policy đầu vào mới, chưa có nghĩa code đã hỗ trợ.
- **[BC-CODE]:** quan sát trực tiếp từ source hiện tại tại commit nêu trên. Có line anchor để tái kiểm.
- **[OLD-REVIEW]:** claim của review/tài liệu trước. Chỉ giữ nếu code hiện tại củng cố; nếu không thì hạ mức hoặc ghi là historical claim.
- **[AGENT-CLAIM]:** nhận định của lượt khảo sát trước nhưng chưa đủ code anchor trong phạm vi này; không dùng làm sự thật.
- **[CXM]:** câu hỏi/chính sách/đề xuất cần chốt hoặc cần test; không được đọc thành bug đã xảy ra.
- **Storage / UI / Computation:** lần lượt cho biết code có trường/endpoint, có bề mặt hiển thị/thao tác, và có consumer/công thức dùng đúng semantics hay chưa. Có storage không đồng nghĩa có UI; có UI không đồng nghĩa computation đúng.

### 1.1. Nguồn code đã tái đọc

Các file chính đã đọc lại:

- `backend/src/modules/class-sessions/class-sessions.routes.ts:9-27`, `class-sessions.controller.ts:7-81`, `class-sessions.service.ts:14-85`, `class-sessions.repository.ts:5-97`, `class-sessions.schema.ts:4-38`.
- `backend/src/modules/attendance/attendance.routes.ts:9-26`, `attendance.controller.ts`, `attendance.service.ts:15-301`, `attendance.repository.ts:5-442`, `attendance.schema.ts`, `attendance.types.ts`.
- `backend/src/modules/attendance/reconciliation.routes.ts:14-116`, `reconciliation.controller.ts:27-158`, `reconciliation.service.ts:54-1034`, `attendance-import.service.ts:31-254`.
- `backend/prisma/schema.prisma:263-340,361-488,864-943` và các enum/model liên quan.
- `backend/src/modules/students/students.service.ts`, `students.repository.ts:353-572`, routes/controller; `enrollments/*`.
- `backend/src/modules/care/care.service.ts:23-291`, `care.repository.ts`; `dashboard/dashboard.service.ts`, `dashboard.repository.ts:80-143,179-223,398-437`.
- `backend/src/modules/auto-attendance/auto-attendance.service.ts:71-301`, `auto-attendance.repository.ts:176-275`.
- `backend/src/modules/imports/imports.routes.ts`, `imports.service.ts:1282-1342,` các lane `sheet-sync`/`sheet-backup`, `imports.repository.ts:397-449`.
- `backend/src/modules/automation/automation-trigger.service.ts`, `automation-worker.ts`, `broadcast.service.ts`, broadcast/socket liên quan.
- `frontend/src/features/classes/pages/ClassSessionsPage.tsx:44-160,166-365`, `classes/pages/AttendanceSheetPage.tsx:101-571`, `classes/components/AttendanceMatrix.tsx:590-647,930-977,1080-1229`, `attendance/pages/MyTeachingSessionsPage.tsx:29-177`, `attendance/pages/TeacherAttendanceTrackingPage.tsx:44-260`, `students/pages/StudentStudyReportPage.tsx`, `students/pages/StudentsPage.tsx`, `enrollments/pages/EnrollmentsPage.tsx`.

### 1.2. Phạm vi tài liệu nghiệp vụ/review

Knowledge map và project review cũ vẫn là nguồn business/review, không phải bằng chứng implementation. Chỉ tài liệu đích danh “Mẫu tin nhắn và quy trình tự động” bị loại; các sheet Kịch bản/onboarding/ca tối/JLPT/Kids vẫn được phân tích vận hành trong 01. Số workbook/sheet, công thức, SLA, Kids, offer, renewal, QC và chính sách liên hệ chỉ được nhắc như `[OLD-REVIEW]`/`[CXM]`, không tự nâng thành behavior hiện hành.

---

## 2. Kết luận điều hành sau khi áp dụng quy tắc mới

1. **[U — diễn giải đúng theo nguyên văn người dùng, lượt 24/10]:** "Giáo viên dạy xong chủ động vào hệ thống ghi nhận ca học thực tế cho học viên, **kể cả khi** khác lịch đăng ký hoặc chưa có session được tạo trước." Đây là yêu cầu **mở đường** (GV không bị chặn khi chưa có session từ trước — được phép tạo session + attendance trong cùng một hành động), **không phải** lệnh cấm tạo session trước nói chung: với **lớp nhóm có lịch cố định** (cũng được người dùng xác nhận ở cùng lượt), tạo session trước theo lịch là hợp lệ. Điều bị cấm tuyệt đối chỉ là: dùng **lịch dự kiến tự nó làm bằng chứng đã học/đã vắng** cho bất kỳ loại lớp nào. Code hiện tại chưa phân biệt hai chuyện này: mọi writer (class-session POST cho mọi role, auto, AttendanceMatrix tự tạo session khi chọn ô, import confirm tạo `COMPLETED`) đều tạo session mà không có cờ/luồng nào đánh dấu "đây mới là planned, chưa phải actual", nên không thể biết session nào được tạo hợp lệ theo loại lớp nào. Khoảng trống thật sự cần sửa là **thiếu phân loại planned-vs-actual trên chính dữ liệu**, không phải "writer tạo session trước là sai".**
2. **[U] Buổi import từ lịch đã có chỉ là planned, không phải actual.** Code hiện tại chỉ có `ClassSessionStatus = SCHEDULED/COMPLETED/CANCELLED` và không có cờ/nguồn/loại `planned` riêng. `class_schedule_id` giúp liên kết schedule nhưng không đủ chứng minh actual. Import/auto hiện vẫn tạo hoặc sử dụng `ClassSession` như một thực thể buổi, vì vậy semantics planned/actual đang thiếu.
3. **[U] Có thể có hai bản ghi thực tế trong cùng ngày; group 1 session–many attendance.** Schema hỗ trợ một session có nhiều attendance và unique theo `(enrollment_class_id, class_session_id)`, nhưng nhiều writer/reader hiện match theo ngày hoặc ngày+giờ không đồng nhất. Unique `(class_schedule_id, session_date)` chỉ áp dụng khi `class_schedule_id` khác null; không phải khóa “mọi buổi cùng ngày”.
4. **[U] Completion phải tách ít nhất các chiều:** attendance completion, CVHT/CS check, Admin arbitration; teacher milestone evaluation; và CVHT feedback `contacted/responded/resolved`. Schema hiện chỉ có reconciliation state cho attendance, cùng `CareLog.outcome/content` và `CareTask.status`; chưa có các state độc lập nêu trên. Không được gọi `MATCHED`, `RESOLVED`, `CareTask.DONE` là một trạng thái “hoàn thành nghiệp vụ” chung.
5. **[U] Missing side không phải conflict.** Code hiện đã phân biệt: thiếu teacher → `PENDING_TEACHER`, thiếu CS → `PENDING_CS`; chỉ hai opinion khác nhau mới `CONFLICT`. Tuy nhiên default `Attendance.reconciliation_state = PENDING_CS`, các create path khác nhau và một số reader dùng `status` mà không xét state vẫn có nguy cơ hiển thị sai.
6. **[U] Admin là bên arbitration duy nhất; MANAGE delegation chưa được xác nhận.** Code hiện coi `ADMIN` **hoặc `MANAGE`** là privileged trong `AttendanceService`, `ReconciliationService`, routes và care/dashboard scope. `resolveConflict` gọi `assertCSScope`, mà `isPrivileged` cho MANAGE đi qua; route cũng cho CS/MANAGE/ADMIN. Vì vậy code hiện **không chứng minh** policy “chỉ Admin”; MANAGE delegation phải được ghi là **CXM/đang lệch policy**, không tự kết luận đã được ủy quyền.
7. Code có nền lưu hai opinion, audit, pending queues, conflict resolution, auto idempotency và UI theo dõi teacher; nhưng **chưa có model/state/computation hoàn chỉnh** cho actual-vs-planned, teacher milestone, CVHT feedback lifecycle hoặc arbitration authority đúng theo `[U]`.

---

## 3. Ma trận user-confirmed rules × code hiện tại

| Quy tắc mới | Storage/schema | API/service | UI | Computation/reader | Kết luận |
|---|---|---|---|---|---|
| 1-1 actual session do GV tạo sau khi dạy | `ClassSession` có `teacher_id`, `created_by_id`, ngày/giờ; không có `actual`/`planned`/`taught_at` | POST session cho ADMIN/MANAGE/CS/TEACHER; `createSession` chỉ kiểm class và user role teacher (`class-sessions.routes.ts:17-21`, service `:26-54`) | `ClassSessionsPage.tsx:83-105,277-365` cho tạo buổi mọi flow; AttendanceMatrix tự tạo session (`:1089-1094,1139-1145`) | Auto/import cũng tạo session (`auto-attendance.service.ts:239-265`; `attendance-import.service.ts:156-189`) | **Chưa phân biệt planned/actual trên dữ liệu**; với lớp nhóm, tạo session trước theo lịch vẫn hợp lệ — chỉ thiếu cách nói "session này là planned, chưa có bằng chứng đã dạy" |
| Import schedule chỉ là planned | `ClassSchedule` tồn tại; session có optional `class_schedule_id`, status chỉ SCHEDULED/COMPLETED/CANCELLED (`schema.prisma:361-410`) | Auto dùng schedule để tạo session; import confirm tạo session `COMPLETED`; không có planned-only writer | UI hiển thị session status như “đã lên lịch/đã hoàn thành” (`ClassSessionsPage.tsx:17-25`) | Dashboard/attendance đọc session/attendance, không phân biệt plan và actual | **Thiếu semantics [U]** |
| GV không bị chặn khi chưa có session trước (1-1); vẫn phải gắn attendance với một session cụ thể | DB unique attendance theo enrollment+session (`schema.prisma:440-488`) — invariant "attendance phải có session" đã đúng và nên giữ | Manual mark yêu cầu session tồn tại trước, nhưng MyTeachingSessionsPage không cho GV tự tạo (báo "liên hệ CSKH" `:137-142`) trong khi AttendanceMatrix/`ClassSessionsPage` (role CS/MANAGE/ADMIN) đã tạo được session trước khi mark | Matrix nút chọn ô tạo session rồi mới mark (`AttendanceMatrix.tsx:1089-1101`) — hành vi đúng cho CS/Admin, chưa có ở màn GV | Không phân biệt session này là planned (hợp lệ với lớp nhóm) hay actual (do GV ghi) | **Invariant "attendance cần session" nên giữ; khoảng trống thật là UI GV chưa nối được create→mark, và thiếu nhãn planned/actual trên session** |
| Hai actual cùng ngày hợp lệ | Không có unique class+date; unique schedule+date chỉ khi có cùng `class_schedule_id` | Import match ngày/giờ; CSKH có fallback date-only; auto match schedule/date | Matrix nhóm session theo class/date rồi giữ nhiều session (`:596-614`) | Một số backup/import lane map một record/ngày; cần kiểm toàn bộ consumer | **Storage có khả năng; computation chưa thống nhất** |
| Một session nhiều attendance | `Attendance` unique `(enrollment_class_id,class_session_id)`; session–attendance relation | bulk mark lặp từng enrollment trong cùng session (`attendance.repository.ts:161-279`) | matrix map concrete session, không map attendance chỉ theo date (`:616-647`) | `findBySession` chỉ filter `class_session_id`; classId bị bỏ qua (`attendance.repository.ts:5-23`) | **Nền đúng; scope GET cần khóa cặp class/session** |
| Planned ≠ actual | Không có field/enum riêng | Không có service chuyển planned → actual theo event “dạy xong” | UI chỉ có status session | Readers count status/attendance, không có predicate actual | **Chưa có** |
| Attendance completion riêng | `teacher_status`, `cs_status`, `status`, timestamps | manual/reconciliation derive state; admin ghi status + RESOLVED | Matrix/teacher pages hiển thị side/state | trigger chạy MATCHED/RESOLVED; dashboard nhiều nơi chỉ đếm `status` | **Có một phần, không phải completion tổng** |
| CVHT check riêng | `cs_status`, `cs_submitted_at`, `cs_user_id` có thể đại diện opinion; không có `cs_check_state` | `markByCS`, bulk approve; `PENDING_CS` | reconciliation UI/API có pending CS | Missing side và CS approval được dùng như state reconciliation | **Có dữ liệu opinion; chưa có lifecycle “check complete” độc lập** |
| Admin arbitration riêng, chỉ Admin | `resolved_by_id`, `resolved_at`, `resolution_note` | `resolveConflict` và ADMIN side; nhưng `MANAGE` privileged, route cho MANAGE/CS (`reconciliation.routes.ts:88-113`, service `:305-337`) | reconciliation page có resolve surface theo route | RESOLVED kích downstream; không lưu authority policy riêng | **Storage có; authority sai/chưa chốt** |
| Teacher milestone evaluation | `lesson_topic`, `teacher_note`; `CareMilestoneConfig.session_number` | teacher mark/history; không có evaluation record/state | Teacher tracking history/pending (`TeacherAttendanceTrackingPage.tsx:167-182,235-256`) | dashboard milestone đếm attendance bất kỳ, không lọc state/deleted (`dashboard.repository.ts:398-437`) | **Không có milestone evaluation đúng nghĩa** |
| CVHT feedback contacted/responded/resolved | `CareLog.created_at/content/outcome`; `CareTask.status`; không có contacted/responded/resolved fields | create/update care log/task; `updateEnrollmentCare` có thể auto-create task (`care.service.ts:224-291`) | có care/task surfaces nhưng chưa phải state contract | Dashboard buckets `NO_RESPONSE`, `NOT_ENTERED`, outcome từ content/outcome (`dashboard.service.ts:20-29,200-276`) | **Có proxy/analytics, chưa có lifecycle state** |
| Missing side != conflict | enum states và `deriveState` (`reconciliation.service.ts:59-63`) | pending query còn kiểm nullability (`:82-103`); mark/import đều derive | teacher tracking chỉ lấy `PENDING_TEACHER`; pending queues tách count | một số readers chỉ `status`/count, có thể coi provisional như final | **Quy tắc đã có ở reconciliation, chưa xuyên mọi reader** |

---

## 4. Session: actual, planned, import và 1-1

### 4.1. Manual class-session lane

`class-sessions.repository.ts:28-47` tạo `ClassSession` trong transaction, tự cấp `session_number`, ghi ngày/giờ/teacher/status/creator. `class-sessions.service.ts:26-54` kiểm class tồn tại và nếu có `teacher_id` thì kiểm `User.roles` chứa `TEACHER`; không kiểm Teacher assignment, không kiểm thời điểm sau buổi dạy, không kiểm rằng giáo viên là người tạo, và không có cờ actual. `class-sessions.routes.ts:17-27` cho ADMIN/MANAGE/CS/TEACHER create/update/cancel/delete sau class-access.

**Đối chiếu [U]:** endpoint hiện là generic session CRUD, không phải “teacher creates actual session after teaching”. `teacher_id` không đủ làm `created_by_id` hoặc bằng chứng người đã dạy. `updateSession` (`service.ts:56-67`, repository `:50-65`) cũng không lặp kiểm role/assignment của teacher mới. Đây là gap implementation có code anchor, không phải suy đoán runtime.

### 4.2. Schedule/auto lane

`auto-attendance.service.ts:71-127` đọc active schedule, parse pattern và bỏ `MANUAL_ONLY`; `:149-176` thiếu `start_time` thì tạo execution và `SCHEDULE_DATA_ISSUE`; `:198-223` claim execution theo `(class_schedule_id, session_date)`; `:236-279` gọi `findOrCreateClassSession`, tạo attendance `ATTENDED`/`AUTO_SCHEDULE` cho enrollment đủ điều kiện rồi gọi `handleAttendanceEvent`.

`auto-attendance.repository.ts:176-224` tìm/tạo session theo `(class_id,class_schedule_id,session_date)`, tự cấp số và không gán `start_time/end_time`; `:226-251` tạo attendance trực tiếp, không opinion teacher/CS. Đây là dữ liệu **provisional theo thực tế `[U]`**, nhưng schema chỉ để `reconciliation_state` default `PENDING_CS`; không có `planned` flag hay actual verification.

**Hiệu đính:** auto execution có unique/idempotency lane riêng (`auto-attendance.repository.ts:123-159,204-223`) và task thiếu giờ có `idempotency_key` (`:254-275`). Điều đó không biến auto attendance thành buổi thực tế đã dạy, cũng không chứng minh downstream đã gửi thành công; trigger được gọi nhưng bất đồng bộ và gate có thể bỏ qua.

### 4.3. Import attendance/schedule lane

`attendance-import.service.ts:79-139` match enrollment active, class/date/time; source CSKH có fallback session date-only (`:119-127`), teacher strict time. Nếu chưa có session, preview đặt `CREATE_SESSION`; nếu có session nhưng thiếu attendance đặt `CREATE_ATTENDANCE`; mismatch là `UPDATE_ATTENDANCE`/`CONFLICT`.

Commit `attendance-import.service.ts:156-189` có thể tạo session với `status: 'COMPLETED'`, rồi `:191-232` tạo/cập nhật attendance, derive `PENDING_CS/PENDING_TEACHER/MATCHED/CONFLICT`, audit. Vì vậy import đang có khả năng **sản sinh actual-looking session**, không đủ để chứng minh đã thực học nếu nguồn chỉ là lịch dự kiến. Import lịch sử có chứng cứ thực học là trường hợp khác: được tạo session và opinion sau preview/scope, ở chế độ NO_SEND; không cấm chỉ vì đó là historical input.

Lane cũ `reconciliation.service.ts:759-970` cũng có logic teacher Excel: tìm session theo class/date/time (`:870-880`), upsert teacher side (`:909-941`) và trigger khi matched/conflict (`:946-953`), nhưng controller hiện trả 410 cho endpoint legacy (`reconciliation.controller.ts:145-147`). Không dùng dead/legacy function để mô tả endpoint đang chạy.

Lane `imports.service.ts:1282-1342` (`applyAttendance`) chỉ tìm session đã có; không tạo session và không gọi common trigger. Vì vậy claim cũ không được dùng hàm legacy đã trả 410 để chứng minh importer hiện hành có trigger. Kết luận đã kiểm là các writer import đang reachable chưa dùng chung lifecycle; historical mode phải NO_SEND, không tự tạo delivery cho mọi MATCHED.

### 4.4. UI tạo session ngầm

`ClassSessionsPage.tsx:83-105` default form mới có ngày hiện tại, giờ `19:00-20:30`, status `SCHEDULED`; đây là UI tạo session trực tiếp. `AttendanceMatrix.tsx:1089-1101` và `:1139-1165` tạo session nếu ô chưa có rồi mark/update attendance. Bulk lane `:961-973` cũng tạo session nếu thiếu.

Các defaults này không chứng minh business data giả đã xảy ra (không runtime), nhưng về static contract chúng cho phép tạo session **trước khi có actual teaching evidence**, và giờ default có thể là dữ liệu nhìn như thật. Cần đổi UX/endpoint theo `[U]`, hoặc hiển thị rõ planned/draft và chặn attendance cho draft.

---

## 5. Attendance grouping và hai bản ghi cùng ngày

### 5.1. Khóa dữ liệu hiện tại

`schema.prisma:440-488` có một row Attendance cho mỗi `(enrollment_class_id,class_session_id)`. `ClassSession` có `@@unique([class_id,session_number])` và `@@unique([class_schedule_id,session_date])` (`:406-408`). Do `class_schedule_id` nullable, unique này không phải khóa “mỗi class một session mỗi ngày”; các session manual không set `class_schedule_id` vẫn có thể có nhiều row cùng ngày. Đây phù hợp khả năng `[U]` hai actual cùng ngày.

`attendance.repository.ts:161-279` bulk mark dùng cùng `classSessionId` cho nhiều `enrollment_class_id`, tức mô hình group one-session-many-attendance đã được implement. `AttendanceMatrix.tsx:596-614` nhóm session theo class/date nhưng giữ array nhiều session; `:616-647` map attendance theo concrete session ID, không gộp hai buổi cùng ngày. Đây là điểm tốt cần giữ.

### 5.2. Các điểm chưa đồng nhất

- `AttendanceRepository.findBySession(classId, sessionId)` nhận `classId` nhưng query chỉ `class_session_id` và `deleted_at:null` (`attendance.repository.ts:5-23`). Service `listBySession` chỉ chuyển tiếp (`attendance.service.ts:200-202`). Route có `requireClassAccess`, nhưng chưa assert session thuộc class URL trong repository/service. Đây là **[BC-CODE] scope defect**, cần fixture cross-class để xác nhận HTTP response, chưa gọi là leak runtime.
- Import CSKH có fallback date-only; teacher dùng date+time (`attendance-import.service.ts:119-127`). Hai record cùng ngày có thể được match khác nhau tùy source.
- `imports.repository.findOrCreateClassSession` tìm class/date không xét giờ (`imports.repository.ts:397-425`), trong khi attendance import strict hơn. Không được dùng một “occurrence identity” chung khi mô tả toàn hệ thống.
- Sheet backup có lane map theo ngày và các fallback/offset; nếu consumer chỉ giữ một record/ngày thì có thể mất hai buổi, nhưng đây là hậu quả **conditional** cần đọc exact mapping và test fixture, không tuyên bố production mất dữ liệu.

### 5.3. Attendance status không phải completion chung

Enum `AttendanceStatus` (`schema.prisma:416-423`) chỉ là kết quả attendance: ATTENDED, A/B/C/D/E. `ReconciliationState` (`:425-431`) chỉ mô tả thiếu ý kiến, match, conflict, resolved. `status` có thể được set lúc create dù state còn pending (`attendance.repository.ts:100-107`), nên status-only reader không được xem là final.

Manual writer `attendance.service.ts:204-232` và repository `:73-145` derive side; `runDownstream` chỉ trigger MATCHED/RESOLVED hoặc cancel conflict (`:58-68`). Update/reset có semantics riêng (`attendance.repository.ts:281-432`). Import/auto/direct writers không hoàn toàn đi qua service này. Vì vậy công thức “đã học/hoàn thành” phải chọn một predicate explicit, ví dụ `teacher_status` đã gửi, `cs_status` đã kiểm, `MATCHED`, `RESOLVED`, và có/không tính `deleted_at` hoặc session `CANCELLED`. Không được lấy `status` đơn độc làm completion evidence.

---

## 6. Reconciliation: missing side, conflict và authority

### 6.1. Quy tắc missing side đã được code hỗ trợ một phần

`ReconciliationService.deriveState` (`reconciliation.service.ts:59-63`) có truth table rõ:

| Teacher opinion | CS opinion | State |
|---|---|---|
| null | null | `PENDING_TEACHER` theo code hiện tại |
| có | null | `PENDING_CS` |
| null | có | `PENDING_TEACHER` |
| cùng giá trị | cùng giá trị | `MATCHED` |
| khác giá trị | khác giá trị | `CONFLICT` |

Lưu ý hai null không phải một “conflict”; code chọn `PENDING_TEACHER` do nhánh `!teacherStatus`. `pendingStateWhere` (`:82-103`) còn kiểm cả state lẫn nullability để loại stale row. `getPending`/`getStats` (`:434-526`) tách pending CS, pending teacher và conflict. Đây là **[BC-CODE] phù hợp [U] missing side != conflict** ở reconciliation lane.

Tuy nhiên `AttendanceRepository.mark` (`attendance.repository.ts:73-107`) và `bulkMark` (`:191-225`) có create path đặt `status` ngay cả khi state pending; schema default cũng là `PENDING_CS`. Các reader như dashboard, backup, export và một số UI dùng `status` hoặc chỉ đếm row. Do đó state truth table chưa xuyên toàn hệ thống.

### 6.2. Admin arbitration chưa được code giới hạn cho Admin

`resolveConflict` (`reconciliation.service.ts:305-337`) yêu cầu state `CONFLICT`, nhận `finalStatus` + `resolutionNote`, ghi `RESOLVED`, `resolved_by_id/at`, audit và downstream. Đây là storage/process cho arbitration.

Nhưng:

- `isPrivileged` (`:54-57`) trả true cho `ADMIN` **và `MANAGE`**.
- `assertCSScope` (`:75-80`) cho privileged đi qua, nên MANAGE có thể resolve trong service.
- Route `POST /:id/resolve-conflict` yêu cầu `ADMIN/MANAGE/CS` (`reconciliation.routes.ts:88-93`), không riêng ADMIN.
- `bulkApprovePending` (`:339-377`) cũng cho `MANAGE` qua privileged scope; đây là approval pending, không nên tự gọi arbitration nhưng cần policy phân biệt.
- `AttendanceService.resolveSide` (`attendance.service.ts:18-38`) coi ADMIN/MANAGE là privileged và chỉ cho sửa cột ADMIN; `notifyOnAdminMark` cũng ghi nhãn “Admin/Quản lý”.

Kết luận: **[U] Admin-only arbitration chưa được hỗ trợ**. `MANAGE` delegation là **CXM/unconfirmed**, không được mô tả là quyền đã duyệt. Admin phân xử đã được xác nhận: cần gate riêng cho arbitration và test âm CS/TEACHER; MANAGE chỉ được cấp nếu có quyết định ủy quyền rõ. Audit không thay authorization. Không tự sửa code trong báo cáo này.

### 6.3. Teacher tracking là workflow pending, không phải milestone

`getTeacherTrackingPending` (`reconciliation.service.ts:634-679`) chỉ query `PENDING_TEACHER`; count (`:681-685`) cùng predicate. History (`:687-754`) dựa audit `ATTENDANCE_TEACHER_STATUS_CHANGED`. Frontend `TeacherAttendanceTrackingPage.tsx:167-182,235-256` hiển thị pending/history và form teacher mark; nó không có milestone evaluation, điểm chất lượng, rubric, hoặc completion state riêng.

`MyTeachingSessionsPage.tsx:121-159` cũng chỉ mark status/lesson topic/note trên attendance; nếu chưa có attendance thì báo “liên hệ CSKH”, không tạo actual session. Đây là UI phù hợp một phần với `[U]` teacher xác nhận sau khi dạy, nhưng backend vẫn có các writer khác tạo trước.

### 6.4. CVHT feedback hiện là proxy, không phải ba-state lifecycle

Schema `CareLog` (`schema.prisma:875-890`) có enrollment, CS, `after_session_number`, outcome, content, creator/time; `CareTask` (`:914-933`) có assignee/type/title/note/due/priority/status. Không có:

- `contacted_at/by` hoặc trạng thái đã liên hệ;
- `responded_at/by` và response source;
- `resolved_at/by`/resolution reason;
- liên kết bắt buộc giữa feedback và một actual session/milestone;
- state machine bảo đảm `contacted → responded → resolved`.

`CareService.createCareLog` (`care.service.ts:70-86`) append log; `saveSessionCareLog` (`:224-240`) upsert theo enrollment + after_session_number thông qua repository; `updateEnrollmentCare` (`:244-291`) có thể tạo CALLBACK/HOT_ISSUE task mỗi lần callback/hot note có nội dung. `CareTask.status` DONE/CANCELLED chỉ là task status, không phải resolved feedback.

Dashboard lại quy đổi outcome/content thành bucket, trong đó có `NO_RESPONSE` (`dashboard.service.ts:20-29,200-276`). Đây là computation analytics/proxy, không chứng minh lifecycle storage. `CareMilestoneConfig` chỉ unique `session_number` (`schema.prisma:936-943`), thiếu product/version/basis/enrollment dimension. Các claim cũ “milestone đã hoàn chỉnh” phải hạ thành **nền storage + computation chưa đúng [U]**.

---

## 7. Cross-module findings theo yêu cầu rà soát

### 7.1. Student/enrollment/report

`students.repository.ts:353-443` update Student và nhiều field Enrollment trong cùng transaction; `:444-475` chọn enrollment `student_id` mới nhất theo `id desc`, rồi phần tiếp theo có thể cập nhật class/schedule/teacher dùng chung. `StudentStudyReportPage.tsx` đọc `enrollments?.[0]` và lưu `program_metadata.study_report` qua Student update. Đây là **[BC-CODE] context mismatch**: UI không truyền enrollment identity rõ ràng trong đoạn đã đọc, còn backend chọn enrollment khác bằng latest ID. Không suy ra runtime corruption, nhưng blast radius tĩnh là có.

`enrollments` có `EnrollmentClass` với status/sequence/transfer; `schema.prisma:342-359` giữ lần tham gia lớp riêng. Quy tắc actual session phải khóa theo `EnrollmentClass` cụ thể, không lấy Student hoặc enrollment “mới nhất” làm thay thế.

### 7.2. Dashboard và công thức

`dashboard.repository.ts:80-143` attendance stats lọc theo CS/class/package/date nhưng `sessionCount` chỉ lọc class nếu có, không dùng cùng date/package/scope; `attendance.count/groupBy` cũng không mặc định `deleted_at:null` trong đoạn này. `dashboard.service.ts:88-99` rate là `attendedCount / totalAttendances`, không phải chia `totalSessions`; hai chỉ số cần giữ tách biệt.

`dashboard.repository.ts:398-437` milestone coverage tính số attendance trong mọi EnrollmentClass, không lọc deleted, status, reconciliation hoặc actual/planned. Vì vậy không dùng làm teacher milestone evaluation hay số buổi đã học theo `[U]`.

Care response date filter có end-of-day (`dashboard.repository.ts:189-197`), trong khi attendance date filter dùng raw `lte` (`:105-112`). Đây là khác biệt date contract có line anchor; timezone/runtime chưa kiểm.

### 7.3. Auto attendance

Auto có điều kiện schedule pattern, active/studying enrollment/date range và execution idempotency (`auto-attendance.service.ts:109-147,198-233`; repository `:123-159`). Nó tạo row provisional `ATTENDED` với system actor inactive (`auto-attendance.repository.ts:9-27,236-251`) rồi gọi trigger (`auto-attendance.service.ts:274-279`). Đây là nền kỹ thuật, không phải bằng chứng `[U]` cho actual teaching. Nếu `[U]` được áp dụng nghiêm, auto phải tạo planned/provisional record hoặc issue/task, không được tự tạo actual session/attendance trước khi có xác nhận phù hợp.

### 7.4. Imports, Sheet sync, Sheet backup

Imports routes cho upload/preview/validate/confirm với các role (`backend/src/modules/imports/imports.routes.ts:45-53`); Sheet sync config/run chỉ ADMIN/MANAGE (`:25-30`), sheet backup có CS đọc/run cá nhân và ADMIN/MANAGE rộng (`:32-36`). Route presence không chứng minh UI mount, authority theo field hoặc round-trip an toàn.

`sheet-sync` có row/hash/sync key và fallback mapping; `sheet-backup` xuất dữ liệu attendance/care. `sheet-backup.service.ts:812-858` đếm attendance non-deleted theo `status`, tính `ATTENDED + C`, và khi có web attendance không trừ `attended_previous_years`; `:824-827` còn map một attendance theo ngày vào `attendanceByDate`. Điều này không phù hợp để khẳng định actual completion nếu có nhiều session/ngày hoặc pending/conflict. Đây là consumer computation cần policy predicate, không phải lỗi dữ liệu runtime đã chứng minh.

### 7.5. Automation/broadcast/socket

`attendance.service.ts:58-68` và `reconciliation.service.ts:192-201` chỉ trigger matched/resolved, cancel delivery khi conflict. Các writer direct/import không cùng gọi chung pipeline. `broadcast.service.ts` có `isPollingScheduled` process-local (grep anchor quanh `:105,1213-1244`); đây là guard trong một process, không phải distributed claim. Chưa chạy nhiều process, socket hay connector nên mọi duplicate-send/public-room claim là **CXM**.

---

## 8. Hiệu đính các claim cũ quan trọng

| Claim cũ | Phán quyết sau code verification |
|---|---|
| “Import attendance hoàn toàn không trigger” | **Hạ/sửa:** `applyAttendance` direct lane không trigger (`imports.service.ts:1282-1342`), nhưng legacy teacher upload có trigger (`reconciliation.service.ts:946-953`), auto/manual/reconciliation cũng có lane khác. Nói đúng là writer/downstream không thống nhất; legacy endpoint hiện trả 410. |
| “Có unique class/date cho mọi session” | **Sai nếu hiểu toàn cục:** chỉ `@@unique([class_schedule_id,session_date])`; manual session không set schedule, và unique `(class_id,session_number)` mới là khóa chung (`schema.prisma:406-408`). |
| “Auto attendance là actual đã học” | **Quá mức:** code tạo `AUTO_SCHEDULE` + `ATTENDED` và state default pending, nhưng không có teacher/CS opinion; phải gọi provisional theo `[U]`. |
| “MATCHED/RESOLVED là completed nghiệp vụ” | **Sai phạm vi:** đó là reconciliation state; không bao gồm teacher milestone hoặc CVHT feedback lifecycle. |
| “Care milestone đã chống lặp/đếm đúng” | **Chỉ một phần:** `CareLog` upsert lane có reuse, nhưng append log là hành động khác; `CareTask` callback/hot issue không có idempotency key trong `updateEnrollmentCare`; dashboard milestone đếm mọi attendance. |
| “MANAGE được quyền resolve vì route hiện có” | **Không được nâng thành policy:** đây chỉ là BC-CODE hiện tại; `[U]` nói Admin-only, MANAGE delegation unconfirmed. |
| “Hai buổi cùng ngày bị hệ thống gộp” | **Không kết luận chung:** schema/matrix hỗ trợ nhiều session; một số import/backup consumer match/map theo ngày nên cần từng lane/test fixture. |
| “Teacher tracking là milestone tracking” | **Sai:** đây là pending teacher reconciliation + audit history; chưa có milestone evaluation. |
| “Có feedback contacted/responded/resolved” | **Chưa có storage rõ:** CareLog/Task/outcome là proxy; dashboard bucket không thay state machine. |

Các claim review cũ khác về ownership student, sale/CVHT, Teacher.id/User.id, dashboard scope/date, export scope, approval CAS và socket vẫn là các điểm cần giữ trong backlog nếu line anchor cũ còn đúng; chúng không được tự mở rộng thành kết luận về các rule `[U]` mới.

---

## 9. Đề xuất/CXM để đóng rule, không phải behavior đã có

### 9.1. Contract tối thiểu cần chốt

1. **Actual session identity:** actual session do ai tạo, evidence nào cho “đã dạy”, có bắt buộc `teacher_id` là assigned `Teacher.user_id`, có cho Admin tạo thay, và khi nào status chuyển COMPLETED.
2. **Planned record:** schedule import có tạo `PlannedSession`/draft không; planned có được hiển thị trong calendar nhưng không được tạo Attendance hay trigger không.
3. **Occurrence key:** `(class_id, actual_date, start_time, end_time, teacher/shift)` hay key khác; cho phép hai buổi cùng ngày; xử lý không có giờ.
4. **Completion dimensions:** tên/state transition độc lập cho attendance teacher, CS check, Admin arbitration; trạng thái nào phát delivery và trạng thái nào chỉ lưu.
5. **Teacher milestone:** milestone thuộc enrollment/product/version hay lớp; teacher đánh giá gì; có cần rubric/score/evidence và audit không.
6. **CVHT feedback:** define `contacted`, `responded`, `resolved`, actor/time/note; feedback gắn enrollment, actual session, milestone hay care task; `NO_RESPONSE` là outcome hay state.
7. **Authority:** Admin-only arbitration; MANAGE delegation nếu có phải là explicit policy, scope, audit và test, không suy ra từ role privileged hiện tại.

### 9.2. Cổng kiểm chứng đề xuất (chưa thực thi)

- 1-1: import thời gian đăng ký chỉ là planned; GV được tạo ca thực và Attendance cùng một command khi chưa có session trước. Attendance vẫn liên kết session cụ thể; không đòi session dự kiến tồn tại từ trước.
- 1-n: một session có N enrollment attendance; hai session cùng ngày không gộp; cross-class URL không đọc được.
- Missing side: teacher-only → PENDING_CS; CS-only → PENDING_TEACHER; hai null không conflict; khác opinion → CONFLICT.
- Authority: CS không resolve; MANAGE bị từ chối nếu policy Admin-only; Admin resolve có audit; bulk approve không bị nhầm arbitration.
- Completion: pending/matched/resolved/deleted/cancelled được đếm riêng; dashboard/backup/trigger dùng cùng predicate đã chốt.
- Teacher milestone: evaluation độc lập attendance reconciliation.
- CVHT: contacted/responded/resolved transitions và NO_RESPONSE không lẫn NOT_ENTERED.
- Import/auto/manual/sheet backup: cùng occurrence identity hoặc ghi rõ lane-specific mapping; retry/concurrency test bằng fixture giả.

Không chạy các fixture này trong lượt này theo yêu cầu “không tests/runtime/DB/network/automation”.

---

## 10. Coverage, limits và kết luận bàn giao

### Covered tĩnh

- Session CRUD, role gate, class scope, session numbering, status và writer tạo session.
- Schema identity/unique/relation của ClassSession, Attendance, EnrollmentClass, CareLog, CareTask, CareMilestoneConfig.
- Manual/bulk attendance, teacher/CS/admin side, derive pending/matched/conflict/resolved, reset và downstream gate.
- Attendance import preview/commit, legacy teacher upload, auto-attendance execution/session/attendance, direct import apply.
- Teacher pages, attendance matrix concrete-session mapping, class session page, student report/enrollment context.
- Care service/repository anchors, dashboard attendance/milestone/care-response computations, sheet backup predicate, import/sync/backup route scope.

### Not covered/không thể kết luận

- Không có runtime observation, DB rows, test output, HTTP response, browser clickthrough, connector response, Sheet/Zalo/LINE delivery, socket authorization thực tế hoặc multi-process race.
- Không chứng minh record production nào đã bị tạo sai, gửi trùng, lộ cross-owner, mất attendance hay resolve sai.
- Không đọc sâu mọi module/consumer ngoài các lane nêu trên; không khẳng định toàn repo không có model khác cho feedback/milestone nếu chưa được nêu trong code đã đọc.
- Không suy ra timezone đúng/sai chỉ từ `Date` construction; cần contract và fixture.
- Không thay đổi source/schema/DB, không tạo migration và không chạy automation.

### Kết luận cuối

Nền hiện tại đã lưu được một số thành phần cần thiết: session và attendance relation, one-session-many-attendance, hai opinion teacher/CS, reconciliation state, audit, pending/conflict queues, teacher tracking UI, care logs/tasks, auto execution guard và import provenance. Tuy nhiên các rule người dùng xác nhận mới **chưa được hỗ trợ xuyên hệ thống**. Gap lớn nhất là code đang cho phép schedule/auto/UI/import tạo session và attendance theo planned/date trước khi có actual teaching, trong khi `[U]` yêu cầu actual 1-1 do giáo viên tạo sau khi dạy; tiếp theo là thiếu state độc lập cho completion dimensions, teacher milestone evaluation và CVHT feedback lifecycle; cuối cùng là arbitration hiện mở cho MANAGE/CS theo code dù policy mới yêu cầu Admin-only và MANAGE delegation chưa xác nhận.

Bản báo cáo này chỉ là kết quả đối chiếu tĩnh tại `main` commit `cbf78c337b8ff534a6d9b3ea5d63cf626cd44b17`; cần một lượt chốt policy/contract trước khi sửa code, sau đó mới viết fixture âm/dương và kiểm runtime ở môi trường được duyệt.