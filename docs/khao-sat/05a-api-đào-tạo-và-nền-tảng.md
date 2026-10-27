# 05a — Khảo sát API đào tạo và nền tảng

Ngày khảo sát: 24/10/2026. Phạm vi: auth, users, students, teachers, packages, classes, class-sessions, attendance/reconciliation, auto-attendance, enrollments, preferences, dashboard.

## Phương pháp và ký hiệu

- [ĐKC]: đã kiểm chứng trực tiếp mã nguồn; không đồng nghĩa đã chạy kiểm thử hay gọi API.
- [SLCC]: suy luận có căn cứ từ các nhánh mã đã đọc; cần kiểm thử để xác nhận hành vi runtime.
- [CXM]: chưa xác minh, không coi là kết luận.
- Chỉ đọc nguồn/tài liệu, không khởi động server, không chạy migration, không truy vấn ghi hoặc tải dữ liệu nhạy cảm.
- Đường dẫn trích dẫn tương đối từ gốc repository; số dòng theo snapshot hiện tại.
- Mount thực tế: `backend/src/app.ts:72-88`: `/api/v1/auth`, `/api/v1/settings/users`, `/api/v1/packages`, `/api/v1/teachers`, `/api/v1/students`, `/api/v1/classes`, `/api/v1/enrollments`, `/api/v1/classes/:classId/sessions`, `/api/v1/classes/:classId/sessions/:sessionId/attendance`, `/api/v1/attendance-reconciliation`, `/api/v1/dashboard`, `/api/v1/settings/auto-attendance`, `/api/v1/me/preferences`.

<a id="section-1"></a>
## 1. Auth

[ĐKC] Guard nền: `backend/src/middlewares/auth.middleware.ts:22-51` xác minh Bearer JWT rồi đọc lại User/active/roles từ DB; `:54-66` dùng **OR** giữa các vai trò, không yêu cầu đủ mọi vai trò.

| METHOD /path đầy đủ | requireRoles / middleware | Data-scope | Validation Zod | Side-effects | Lỗi thường gặp |
|---|---|---|---|---|---|
| POST `/api/v1/auth/login` | Công khai; `auth.routes.ts:8` | User theo email chính xác, `auth.service.ts:7-23` | `auth.schema.ts:3-8`, email `.email()`, password min 1 | LoginAudit, last_login_at, AuthSession bcrypt hash, cookie HttpOnly 7 ngày (`auth.service.ts:25-53`; `auth.controller.ts:16-21`) | 401 cả sai schema/sai mật khẩu; 403 disabled (`auth.controller.ts:27-32`) |
| POST `/api/v1/auth/refresh` | Công khai, cookie; `auth.routes.ts:9` | Quét mọi session chưa revoke/chưa hết hạn, bcrypt tuần tự, xác minh active (`auth.service.ts:68-110`) | Không Zod | Cập nhật last_used_at/IP/UA; chỉ trả accessToken | 401 thiếu/sai cookie; lỗi xóa cookie (`auth.controller.ts:36-50`) |
| POST `/api/v1/auth/logout` | authenticate, không requireRoles; `auth.routes.ts:10` | Session đúng user JWT và refresh cookie (`auth.service.ts:115-129`) | Không | Revoke **một** session khớp + clear cookie | JWT hết hạn bị chặn trước logout; service lỗi 500 |
| GET `/api/v1/auth/me` | authenticate; `auth.routes.ts:11` | `req.user` đọc lại DB, không password (`auth.controller.ts:66-72`) | Không | Không ghi riêng ở controller | 401/403 auth |

### Quy tắc nghiệp vụ

- [ĐKC] Refresh **không rotation**, không gia hạn expires_at/cookie; thời hạn cố định từ login. Revoke refresh sessions không blacklist access JWT; disable User chặn ngay vì authenticate đọc DB mỗi request (`auth.service.ts:97-112`; middleware `:33-47`). [SLCC] Chi phí refresh tăng theo tổng session toàn hệ thống.
- [ĐKC] Login audit `SUCCESS/FAILED/DISABLED` chứa email_attempted, IP, UA; lỗi Zod trước service **không có LoginAudit** (`auth.controller.ts:10-14`; `auth.service.ts:132-142`). Không thấy route đọc audit trong auth.
- [ĐKC] Phát hiện email: `auth.schema.ts:5` không regex tự viết mà dùng Zod `.email()`. [SLCC] Domain `automation_cskh.local` chứa `_` bị bộ email chuẩn Zod từ chối ngay schema, dù tài khoản có thể tồn tại do seed/import; controller trả 401 gây nhầm với sai mật khẩu. [CXM] Không chạy parser/runtime trong khảo sát; cần kiểm thử đúng phiên bản Zod đã cài. Cùng giới hạn xuất hiện ở `users.schema.ts:6`, `teachers.schema.ts:8,19,27`, `students.schema.ts:10,64`.

<a id="section-2"></a>
## 2. Users

Các file ngắn dưới đây thuộc `backend/src/modules/users/`.

| METHOD /path đầy đủ | requireRoles cụ thể | Data-scope | Validation | Side-effects | Lỗi thường gặp |
|---|---|---|---|---|---|
| GET `/api/v1/settings/users` | ADMIN, MANAGE (`users.routes.ts:9`) | Toàn bộ users, **không lọc nhóm MANAGE** (`users.service.ts:103-131`) | Không schema query | GET có ghi: bổ sung code/staff_code CS thiếu (`:63-104`) | 500 controller list |
| POST `/api/v1/settings/users` | ADMIN (`users.routes.ts:12-14`) | Toàn hệ thống | `users.schema.ts:3-13` | bcrypt; created_by; sinh code CVHT | 400 schema/unique DB (`users.controller.ts:28-35`) |
| GET `/api/v1/settings/users/:id` | ADMIN (`users.routes.ts:12,15`) | ID bất kỳ, select không password (`users.service.ts:135-160`) | parseInt, không Zod params | Không | 404; ID lỗi có thể 500 |
| PATCH `/api/v1/settings/users/:id` | ADMIN (`users.routes.ts:12,16`) | ID bất kỳ | `users.schema.ts:15-23` | Đồng bộ code→staff_code khi CS | 400 schema/DB |
| POST `/api/v1/settings/users/:id/enable` | ADMIN (`users.routes.ts:12,17`) | ID bất kỳ | Không | active=true (`users.service.ts:298-303`) | 500 DB |
| POST `/api/v1/settings/users/:id/disable` | ADMIN (`users.routes.ts:12,18`) | Không tự disable (`users.controller.ts:59-65`) | Không | revoke mọi session rồi active=false (`users.service.ts:306-316`) | 400 tự disable; 500 DB |
| POST `/api/v1/settings/users/:id/revoke-sessions` | ADMIN (`users.routes.ts:12,19`) | user_id đích | Không | updateMany revoked_at (`users.service.ts:319-323`) | 500 DB; ID không tồn tại có thể vẫn thành công |

### Quy tắc nghiệp vụ

- [ĐKC] Role body là `z.array(z.string())`, **không enum whitelist**; create min một role, update cho phép mảng rỗng (`users.schema.ts:10,20`). Active true↔false qua action; không có guard bảo vệ admin cuối cùng trong controller đã đọc.
- [ĐKC] Normalize mã `CVHT[-_\s]*số` thành `CVHT01`; create mã trùng tự sinh mã tiếp theo thay vì 409; tên có hậu tố mã được tách. Update code CS có thể fallback chuỗi nhập; truyền staff_code riêng có thể khác code (`users.service.ts:8-14,163-215,256-272`). Revoke và disable không transaction chung (`:306-323`).

<a id="section-3"></a>
## 3. Students

Các trích dẫn trong mục này thuộc `backend/src/modules/students/`.

| METHOD /path đầy đủ | requireRoles cụ thể | Data-scope | Validation | Side-effects | Lỗi thường gặp |
|---|---|---|---|---|---|
| GET `/api/v1/students` | ADMIN, MANAGE, CS (`students.routes.ts:11`) | CS: enrollment.cs_id=self; MANAGE: self + members ManageAssignment, giao với cs_id query; ADMIN toàn bộ/tùy cs_id; lọc cả student.some và enrollments include (`students.repository.ts:11-58`) | Query parse tay program_type/cs_id (`students.controller.ts:10-22`) | Không ghi tại nhánh list | Query sai thường bỏ qua/không kết quả |
| GET `/api/v1/students/:id` | ADMIN, MANAGE, CS (`students.routes.ts:12`) | **Không kiểm tra ownership**, include mọi enrollment (`students.service.ts:33-36`; repository `:115-158`) | parseInt | Không | 404 |
| POST `/api/v1/students` | ADMIN, MANAGE, CS (`students.routes.ts:15`) | CS mặc định=currentUser nhưng sale_name có thể resolve sang user khác; không assert scope (`students.repository.ts:193-223`) | `students.schema.ts:3-55` | Transaction Student+Enrollment+lớp/lịch/GV/EnrollmentClass; care-group auto-sync best effort (`students.service.ts:51-57`) | 409 phone/email trùng; 400 lịch/schema; DB unique/FK |
| PATCH hoặc PUT `/api/v1/students/:id` | ADMIN, MANAGE, CS (`students.routes.ts:16-17`) | **Không ownership**; sửa enrollment mới nhất của student, cs_id tùy body (`students.repository.ts:353-380,444-475`) | `students.schema.ts:57-109` | Có thể tạo package/GV, đổi lớp/lịch chung, care auto-sync (`students.repository.ts:381-396,478-572`; service `:76-81`) | 404; 409 phone/email; lỗi DB |

### Quy tắc nghiệp vụ

- [ĐKC] Schema nhận status `WAITING_CLASS/STUDYING/PAUSED/FINISHED/UPCOMING/NOT_STARTED/CANCELLED`; update gán thẳng, **không state machine** (`students.schema.ts:35,89`; repository `:425-426`). Create default STUDYING, KAIWA, 30 buổi; total_sessions=0 bị fallback 30; external_remaining độc lập (`repository:223-244`).
- [ĐKC] `sale_name` create match substring code/name/email trên **mọi User**, không xác minh role CS; unmatched giữ currentUser; body cs_id create không được dùng. Update sale_name chỉ lưu, cs_id mới dùng trực tiếp (`repository:193-215,380,398`). [SLCC] Khác biệt với nghiệp vụ sale_name “phải match code”: hiện không bắt buộc match, có nguy cơ nhận sai user khi tên ngắn.
- [ĐKC] `external_id` trim khi ghi, không precheck service như phone/email (`repository:180,361-363`); ràng buộc DB cần xem schema Prisma ở phụ lục. Create nhận `class_id/package_code` trong schema nhưng nhánh tạo chỉ dựa class_name/schedule_pattern và không resolve package_code (`repository:218-258`).
- [ĐKC] date_of_birth/paid_at/start_date/end_date/handed_over_at dùng `new Date(string)`, schema chỉ string, không kiểm date-only/đảo ngày (`repository:175,241-253,355,419-442`). [SLCC] Chuỗi có timezone có thể đổi ngày; khác helper date-only của reconciliation.
- [ĐKC] Lịch normalize pattern/time tại `students.service.ts:85-97`; thiếu giờ/duration lưu null để data-quality phát hiện (`repository:278-289`). Update tên/lịch/GV sửa **lớp dùng chung**, không chỉ học viên hiện tại (`repository:478-572`).

<a id="section-4"></a>
## 4. Teachers

Trích dẫn thuộc `backend/src/modules/teachers/`.

| METHOD /path đầy đủ | requireRoles cụ thể | Data-scope | Validation | Side-effects | Lỗi thường gặp |
|---|---|---|---|---|---|
| GET `/api/v1/teachers`, GET `/api/v1/teachers/:id` | ADMIN, MANAGE, CS, TEACHER (`teachers.routes.ts:11-12`) | Toàn danh mục, **GV không giới hạn hồ sơ mình** (`teachers.service.ts:13-22`; repository `:5-34`) | Không Zod params/query | Không | 404 get |
| POST `/api/v1/teachers` | ADMIN, MANAGE (`teachers.routes.ts:15`) | Không nhóm quản lý | `teachers.schema.ts:3-12` | Tạo mã tự động nếu thiếu (`teachers.repository.ts:51-64`) | 400 Zod, DB code unique |
| PATCH `/api/v1/teachers/:id` | ADMIN, MANAGE (`teachers.routes.ts:16`) | ID bất kỳ | `teachers.schema.ts:14-23` | Đổi teacher.active, **không đổi User.active** | 404; 400 Zod |
| POST `/api/v1/teachers/:id/account` | ADMIN, MANAGE (`teachers.routes.ts:17`) | ID teacher bất kỳ | `teachers.schema.ts:25-30` | bcrypt, transaction tạo User TEACHER + gắn user_id (`teachers.repository.ts:102-137`) | Đã có tài khoản/email trùng/teacher thiếu ném Error thường |

### Quy tắc nghiệp vụ

- [ĐKC] teacher_type VIETNAMESE/JAPANESE/OTHER; active boolean đổi tự do; không state machine (`teachers.schema.ts:9-10,20-21`). Provision không yêu cầu teacher.active và không cập nhật teacher.email (`repository:104-125`).
- [ĐKC] Password provision bỏ trống dùng **giá trị mặc định tĩnh (không chép credential)** (`teachers.service.ts:37-40`); không ép đổi mật khẩu ở auth đã đọc. Code sinh bằng tên ASCII hóa + random 0..999, chưa có retry unique (`repository:52-55`).

<a id="section-5"></a>
## 5. Packages

Trích dẫn thuộc `backend/src/modules/packages/`.

| METHOD /path đầy đủ | requireRoles cụ thể | Data-scope | Validation | Side-effects | Lỗi thường gặp |
|---|---|---|---|---|---|
| GET `/api/v1/packages`, GET `/api/v1/packages/:id` | ADMIN, MANAGE, CS (`packages.routes.ts:11-12`) | Toàn danh mục (`packages.service.ts:19-26`) | Không schema params/query | Không | 404 |
| POST `/api/v1/packages` | ADMIN, MANAGE (`packages.routes.ts:15`) | Toàn danh mục | `packages.schema.ts:3-11` | Ghi package | 409 code trùng (`packages.service.ts:29-32`) |
| PATCH `/api/v1/packages/:id` | ADMIN, MANAGE (`packages.routes.ts:16`) | ID bất kỳ | `packages.schema.ts:13-21` | Ghi package | 404/409 (`packages.service.ts:35-44`); 400 Zod |

### Quy tắc nghiệp vụ

- [ĐKC] default_total_sessions nếu nhập phải integer >0, code min 1 nhưng không trim trong schema; active đổi tự do. Không delete/không tự truyền số buổi mới sang enrollment hiện hữu trong service (`packages.schema.ts:3-21`; `packages.service.ts:29-44`). Không thấy socket/queue/audit/care-sync riêng trong các lớp đã đọc.

<a id="section-6"></a>
## 6. Classes

Trích dẫn thuộc `backend/src/modules/classes/`.

| METHOD /path đầy đủ | requireRoles cụ thể | Data-scope | Validation | Side-effects | Lỗi thường gặp |
|---|---|---|---|---|---|
| GET `/api/v1/classes` | ADMIN, MANAGE, CS, TEACHER (`classes.routes.ts:12`) | `getAccessibleClassIds`; staff A/M/CS **toàn bộ**, GV lớp được phân công (`classes.service.ts:68-81`; `classes.scope.ts:11-65`) | Không | GET có migrate code cũ CLS_/id… sang class_0001 (`service:71-79`) | 401/403 |
| GET `/api/v1/classes/:id` | A/M/CS/TEACHER + requireClassAccess (`classes.routes.ts:13`) | Assert lại trong service (`classes.service.ts:84-98`) | parseInt, middleware check NaN (`classes.scope.ts:103-107`) | Có ghi chuẩn hóa code | 403 scope, 404 |
| POST `/api/v1/classes` | ADMIN, MANAGE (`classes.routes.ts:16`) | Không nhóm MANAGE | `classes.schema.ts:3-13` | Sinh/định dạng mã lớp (`service:101-129`) | 400 schema/DB unique |
| PATCH `/api/v1/classes/:id` | ADMIN, MANAGE (`classes.routes.ts:17`) | ID bất kỳ | `classes.schema.ts:15-24` | Ghi active/model/source | 404, 400 |
| POST `/api/v1/classes/:id/teachers` | ADMIN, MANAGE (`classes.routes.ts:20`) | ID bất kỳ | `classes.schema.ts:26-33` | Tạo assignment; resolve Teacher.id rồi user_id fallback (`service:160-182`) | 404 lớp/GV |

### Quy tắc nghiệp vụ

- [ĐKC] Model API `1:1/1:2/1:n` hoặc enum ONE_TO_* → lưu enum, trả nhãn ngắn; attendance_source LEARNING_SYSTEM/ZOOM; active true↔false trực tiếp, **không class_status enum trong API này** (`classes.schema.ts:8-22`; service `:23-34,132-157`).
- [ĐKC] GV truy cập hợp của assignment ClassTeacher active và **mọi ClassSession** có teacher_id = Teacher.id hoặc User.id; không lọc khoảng start/end_date, session.status hay class.active (`classes.scope.ts:19-60`). [SLCC] Một buổi dạy cũ có thể mở quyền cả lớp kể cả tạo/xóa buổi khác; ID fallback hai namespace có nguy cơ trùng số.
- [ĐKC] Người có TEACHER+CS/MANAGE/ADMIN được broad access do staff branch ưu tiên (`classes.scope.ts:12-17`). Assignment dates chỉ string (`classes.schema.ts:30-31`), không validate thứ tự.

<a id="section-7"></a>
## 7. Class-sessions

Trích dẫn thuộc `backend/src/modules/class-sessions/`.

| METHOD /path đầy đủ | requireRoles cụ thể | Data-scope | Validation | Side-effects | Lỗi thường gặp |
|---|---|---|---|---|---|
| GET `/api/v1/classes/:classId/sessions` | A/M/CS/TEACHER + requireClassAccess (`class-sessions.routes.ts:12`) | Lớp được phép; repository class_id (`repository:6-11`) | Không dùng listClassSessionsSchema (`controller:8-15`) | Không | 403 scope |
| GET `/api/v1/classes/:classId/sessions/:sessionId` | Cùng guard (`routes:15`) | Đồng thời id và class_id (`repository:14-20`) | parseInt | Không | Error thường “ClassSession not found” |
| POST `/api/v1/classes/:classId/sessions` | Cùng guard (`routes:18`) | Lớp được phép, **không yêu cầu GV là teacher của buổi mới** | `class-sessions.schema.ts:4-13` | Transaction Serializable cấp session_number, retry tối đa 3 (`service:26-53`; repository `:28-47`) | 409 số trùng; 404 lớp; 400 teacher |
| PATCH `/api/v1/classes/:classId/sessions/:sessionId` | Cùng guard (`routes:21`) | id+class_id (`repository:50-64`) | `schema:15-24` | Ghi trạng thái/giờ/GV | Trùng số ném Error thường (`service:59-63`) |
| POST `/api/v1/classes/:classId/sessions/:sessionId/cancel` | Cùng guard (`routes:24`) | Lớp | Không parse cancel schema (`controller:59-64`) | status=CANCELLED | 409 đã hủy (`service:69-72`) |
| DELETE `/api/v1/classes/:classId/sessions/:sessionId` | Cùng guard (`routes:27`) | Lớp | Query `confirm === 'true'` (`controller:75`) | **Hard delete** attendance, buổi; AuditLog before_data (`repository:74-94`) | 409 nếu có attendance chưa confirm (`service:75-83`) |

### Quy tắc nghiệp vụ

- [ĐKC] Create default SCHEDULED, status nhận native enum; PATCH gán thẳng không hạn chế cạnh chuyển; cancel chỉ cấm đã CANCELLED (`schema:11,22`; repository `:43,60,67-71`). Enum cụ thể dẫn Prisma ở phụ lục.
- [ĐKC] teacher_id create kiểm **User có role TEACHER**, không Teacher.id như assignment lớp (`service:35-39`); update không kiểm lại teacher role (`service:56-66`). [SLCC] Hai luồng ID không nhất quán cần test khi User.id ≠ Teacher.id.
- [ĐKC] session_date chỉ string/min1 rồi new Date; start/end_time tự do, chưa validate HH:mm hoặc end>start (`schema:7-10,18-21`; repository `:39-42,56-59`). List không pagination thực dù schema có page/pageSize.
- [ĐKC] Count cần confirm chỉ attendance chưa soft-delete, nhưng hard delete xóa tất cả kể cả soft-deleted (`repository:81-83`). Không thấy care recalculation/socket sau xóa buổi trong repository.

<a id="section-8"></a>
## 8. Attendance (điểm danh trong buổi)

Trích dẫn thuộc `backend/src/modules/attendance/`. A/M = ADMIN/MANAGE. Base mỗi dòng được viết đầy đủ để không nhầm với reconciliation.

| METHOD /path đầy đủ | requireRoles cụ thể | Data-scope | Validation | Side-effects | Lỗi thường gặp |
|---|---|---|---|---|---|
| GET `/api/v1/classes/:classId/sessions/:sessionId/attendance` | A/M/CS/TEACHER + requireClassAccess (`attendance.routes.ts:12`) | Chỉ kiểm lớp URL; **repository chỉ lọc sessionId, bỏ classId**, trả cả record và cs_note (`attendance.repository.ts:6-22`) | Không dùng list schema | Không | [SLCC] Ghép classId được phép với sessionId lớp khác có thể đọc chéo lớp |
| POST `/api/v1/classes/:classId/sessions/:sessionId/attendance` | Cùng guard (`attendance.routes.ts:15`) | Session thuộc lớp, EC thuộc lớp; GV phải ClassTeacher active + Teacher active/user_id; CS đúng enrollment.cs_id; A/M bypass (`attendance.service.ts:41-55,204-211`) | `attendance.schema.ts:6-15` | Upsert phía; AuditLog; automation; thông báo admin | 403 scope/side; 404 EC/session; 409 khác lớp |
| POST `/api/v1/classes/:classId/sessions/:sessionId/attendance/bulk` | Cùng guard (`routes:18`) | Precheck từng EC và session (`service:235-244`) | `attendance.schema.ts:17-28`, items min1, không max | Transaction bulk; BULK_UPSERT audit; automation từng record | Cả request bị chặn khi một EC sai |
| PATCH `/api/v1/classes/:classId/sessions/:sessionId/attendance/:attendanceId` | Cùng guard (`routes:21`) | Kiểm record thuộc class/session + write scope (`service:261-278`) | `attendance.schema.ts:30-38` | Audit; downstream; admin notifications nếu đổi status | 403/404/409 |
| DELETE `/api/v1/classes/:classId/sessions/:sessionId/attendance/:attendanceId` | Cùng guard (`routes:24`) | Kiểm record class/session + side scope (`service:282-290`) | Side xử lý trong controller/service; không schema reset riêng | RESET_SIDE audit, cancel MessageDelivery SCHEDULED/QUEUED (`repository:340-430`) | 403/404/409 |

### Quy tắc nghiệp vụ

- [ĐKC] Status: ATTENDED; ABSENT_APPROVED_A (nghỉ phép), LEAVE_B (bảo lưu), ABSENT_UNAPPROVED_C (nghỉ không phép), TEACHER_ABSENT_D, TECH_ERROR_E (`attendance.utils.ts:11-21,97-103`). Cho đổi bất kỳ status hợp lệ, không hạn chế theo trạng thái trước hay buổi CANCELLED trong service đã đọc.
- [ĐKC] Phía GV chỉ đổi teacher_status/lesson_topic/teacher_note; CS đổi cs_status; **cs_note không chặn theo side**, GV/A/M vẫn có thể gửi cs_note (`attendance.service.ts:222-224,245-249,268-272`; repository `:119-121,329-331`). A/M chỉ ADMIN side, cấm giả TEACHER/CS; user đa role GV+CS phải chọn side (`service:18-38`).
- [ĐKC] TEACHER-only → PENDING_CS; CS-only → PENDING_TEACHER; đủ hai phía giống → MATCHED và status chốt bằng ý kiến; khác → CONFLICT, giữ status chốt cũ khi update; admin mark → RESOLVED (`repository:73-107,288-317`). Không khóa sau RESOLVED: ý kiến mới có thể mở lại đối soát. Upsert mark và PATCH có khác biệt: PATCH xóa resolution metadata khi sửa ý kiến, upsert mark không xóa tương tự (`repository:92-98,124-144,315-317`).
- [ĐKC] Reset một phía xóa opinion/user/time/raw/note phía đó; nếu còn phía kia → pending, không còn → soft delete; admin reset có opinions thì derive lại, không có thì soft delete (`repository:340-430`). Upsert khôi phục deleted_at=null (`:96-97`).
- [ĐKC] MATCHED/RESOLVED gọi handleAttendanceEvent; CONFLICT cancelPendingDeliveries, best effort (`service:58-67`); admin mark tạo AuditLog UserNotification cho CS/GV có ý kiến khác, **không socket emit trực tiếp** (`service:70-197`). Audit attendance thường best effort (`:294-299`).
- [SLCC] Privacy teacher-tracking không bảo vệ toàn bộ teacher flow: GET attendance thường trả cs_note; listSession GET cũng include attendance + enrollment (`class-sessions.repository.ts:14-20`). Cần kiểm thử phân quyền/hợp đồng trả dữ liệu, không suy diễn từ comment “privacy-safe”.

<a id="section-9"></a>
## 9. Attendance reconciliation và Excel

Các file `reconciliation.*`, `attendance-import.service.ts` trong `backend/src/modules/attendance/`.

| METHOD /path đầy đủ | requireRoles cụ thể | Data-scope | Validation Zod | Side-effects | Lỗi thường gặp |
|---|---|---|---|---|---|
| GET `/api/v1/attendance-reconciliation/teacher-sessions` | A/M/TEACHER (`reconciliation.routes.ts:15-18`) | User→Teacher active→ClassTeacher active; lấy **mọi session của lớp**, không chỉ session.teacher_id (`service:975-1028`) | TeacherSessionsQuerySchema (`schema:69-76`) | Không | 400 A/M thiếu teacherId; 403 GV có teacherId kể cả self; 404 teacher profile |
| POST `/api/v1/attendance-reconciliation/import-excel/preview` | A/M/CS/TEACHER (`routes:22-26`) | A/M toàn bộ; CSKH cần CS và đúng cs_id; TEACHER cần assignment active (`attendance-import.service.ts:112,241-250`) | AttendanceImportPreviewSchema (`schema:78-81`), multipart file tối đa 25MiB (`routes:7-9`) | Preview không commit | Thiếu file 400; không sheet/ngày hợp lệ Error |
| POST `/api/v1/attendance-reconciliation/import-excel/confirm` | A/M/CS/TEACHER (`routes:28-32`) | Re-parse file và re-preview scope trên server (`controller:134-140`) | AttendanceImportConfirmSchema (`schema:83-90`), actions APPLY/KEEP_DATABASE/SKIP | Transaction từng item: tạo session/attendance hoặc update + AuditLog (`attendance-import.service.ts:141-237`) | Thiếu file; actions JSON sai; lỗi DB có thể đã commit item trước |
| POST `/api/v1/attendance-reconciliation/upload-teacher-excel` | A/M/TEACHER (`routes:36-40`) | Không tới legacy service | Multer file vẫn chạy trước controller | Không ghi | **410 Gone** (`controller:145-146`) |
| GET `/api/v1/attendance-reconciliation/conflicts` | A/M/CS (`routes:44-47`) | CS self; A/M toàn bộ (không ManageAssignment); `service:106-160,383-388` | ReconciliationQuerySchema (`schema:38-52`) | Không | 400 query; auth |
| GET `/api/v1/attendance-reconciliation/pending` | A/M/CS (`routes:68-71`) | Cùng scope; pending kiểm cả opinion null/not-null (`service:87-102,434-443`) | Cùng query schema | Không | 400 |
| GET `/api/v1/attendance-reconciliation/stats` | A/M/CS (`routes:75-78`) | Cùng scope (`service:515-526`) | Cùng query schema | Không | 400 |
| GET `/api/v1/attendance-reconciliation/history` | A/M/CS (`routes:82-85`) | Attendance IDs trong scope rồi AuditLog (`service:541-569`) | HistoryQuerySchema (`schema:54-67`) | Không | 400 |
| GET `/api/v1/attendance-reconciliation/teacher-tracking/pending` | A/M/TEACHER (`routes:51-54`) | Assignment active/user_id; A/M phải chọn teacherId (`service:128-139,177-180,634-678`) | ReconciliationQuerySchema | Select contract không cs_status/cs_note | 400 thiếu context; 403 chọn GV khác |
| GET `/api/v1/attendance-reconciliation/teacher-tracking/count` | A/M/TEACHER (`routes:56-59`) | Như pending (`service:681-684`) | ReconciliationQuerySchema | Không | 400/403 |
| GET `/api/v1/attendance-reconciliation/teacher-tracking/history` | A/M/TEACHER (`routes:61-64`) | Attendance scope + action TEACHER_STATUS_CHANGED (`service:687-704`) | HistoryQuerySchema | Contract lịch sử GV riêng | 400/403 |
| POST `/api/v1/attendance-reconciliation/:id/teacher-mark` | A/M/TEACHER (`routes:103-106`) | GV assignment active; A/M phải teacherId User có assignment (`service:204-229`) | TeacherMarkSchema (`schema:10-16`); positive ID (`controller:19-24`) | Opinion, source, resolution reset, audit transaction, automation | 403 scope; 400 cần GV hỗ trợ; 404 |
| POST `/api/v1/attendance-reconciliation/:id/cs-mark` | A/M/CS (`routes:110-113`) | CS self; A/M bypass (`service:267-286`) | CSMarkSchema (`schema:18-22`) | CS opinion + audit + downstream | 403/404 |
| POST `/api/v1/attendance-reconciliation/:id/resolve-conflict` | A/M/CS (`routes:89-92`) | CS self; A/M bypass (`service:305-314`) | ResolveConflictSchema (`schema:24-27`), lý do 1..1000 | RESOLVED + audit; hủy pending delivery rồi downstream (`service:316-335`) | 409 không CONFLICT; 403/404 |
| POST `/api/v1/attendance-reconciliation/bulk-approve` | A/M/CS (`routes:96-99`) | Từng record CS self hoặc A/M (`service:339-350`) | BulkApprovePendingSchema (`schema:29-34`): 1..100 ID không trùng | Copy teacher→CS+status MATCHED, audit transaction, downstream (`service:354-377`) | 409 không PENDING_CS/có teacher; 404 thiếu record |

### Quy tắc nghiệp vụ

- [ĐKC] **Lỗi Zod reconciliation thực trả 500, không phải 400**: các controller `.parse` rồi `next(err)` không đổi status (`reconciliation.controller.ts:28-41,84-122,125-142`), middleware chung lấy `err.status || 500`, không map ZodError (`backend/src/middlewares/error.middleware.ts:20-25`). Các ghi chú “400 query/schema” trong bảng là lỗi đầu vào dự kiến về nghiệp vụ; runtime tĩnh theo code là 500 nếu Zod ném, còn AppError(400) như thiếu file/ID sai vẫn 400. Multer quá 25MiB cũng không được map riêng tại middleware này [SLCC].
- [ĐKC] `deriveState`: thiếu GV→PENDING_TEACHER; có GV thiếu CS→PENDING_CS; bằng→MATCHED; khác→CONFLICT (`reconciliation.service.ts:59-62`). Resolve chỉ CONFLICT→RESOLVED; mark lại bất kỳ trạng thái sẽ xóa resolved metadata và derive lại (`:232-245,275-286,311-322`). Bulk approve chỉ PENDING_CS có teacher_status; không phải approve pending teacher.
- [ĐKC] TeacherId ở reconciliation là **User.id**, không Teacher.id; A/M hỗ trợ teacher-mark vẫn ghi teacher_user_id=actor A/M, không teacherId được hỗ trợ (`service:215-238`). Khác attendance thường nơi A/M không được sửa cột teacher.
- [ĐKC] Query pageSize/limit tối đa100; YYYY-MM-DD regex + start≤end nhưng không kiểm lịch thật (`schema:36-76`). Filter attendance theo session_date UTC từ 00:00 tới 23:59; history còn lọc created_at audit, nghĩa là cùng khoảng ngày áp lên **hai mốc** (`service:119-124,546-565`). Teacher-sessions endDate chỉ UTC midnight (`:1003-1004`).
- [ĐKC] Excel A/B/C/D/E/X/“ĐÃ HỌC” và integer N>0, N là N buổi; mã HV-prefix + nội dung có thể là một buổi ATTENDED (`attendance.utils.ts:25-50`). remapDateYear chống 29/2→năm không nhuận; normalizeDateOnly đưa về UTC midnight (`:78-94`). Confirm dựng Date target UTC midnight (`attendance-import.service.ts:163,174`); CSKH có fallback khớp session date-only không giờ (`:118-129`).
- [ĐKC] Import có audit nhưng commit không gọi handleAttendanceEvent trong nhánh đã đọc (`attendance-import.service.ts:141-237`), khác manual reconciliation. [SLCC] Import MATCHED có thể chưa kích hoạt gửi chăm sóc ngay qua cùng downstream như mark.
- [ĐKC] `buildScopeWhere` không thêm deleted_at=null; mark reconciliation dùng findUnique không loại soft-deleted (`service:106-160,205-212,268-272`), khác attendance thường. [SLCC] Record đã reset có thể xuất hiện trong stats/history hoặc được sửa qua reconciliation.

<a id="section-10"></a>
## 10. Auto-attendance (điểm danh tự động)

Trích dẫn thuộc `backend/src/modules/auto-attendance/`. Mount `/api/v1/settings/auto-attendance` (`app.ts:87`).

| METHOD /path đầy đủ | requireRoles cụ thể | Data-scope | Validation | Side-effects | Lỗi thường gặp |
|---|---|---|---|---|---|
| GET `/api/v1/settings/auto-attendance` | ADMIN (`auto-attendance.routes.ts:8`) | Toàn cục (settings hệ thống) (`controller:9-12`) | Không | Không | 403 |
| PATCH `/api/v1/settings/auto-attendance` | ADMIN (`routes:8,10`) | Toàn cục | `auto-attendance.schema.ts:3-8`: delay 0..1440 int, enabled optional | Upsert setting + updated_by (`service:53-69`) | ZodError bắt trong controller, message cố định; **lỗi khác rơi xuống và hàm không gửi response cho nhánh còn lại** (`controller:14-30`) [SLCC] |
| POST `/api/v1/settings/auto-attendance/run` | ADMIN (`routes:8,11`) | Toàn cục | Không body (`controller:32-36`) | Chạy `processAutoAttendance(now, retryFailed=true, ignoreEnabled=true)` | 500 khi service ném; cycle dài chặn request |

### Quy tắc nghiệp vụ

- [ĐKC] Cycle thủ công luôn chạy **bất kể cờ enabled** (`controller:32-34`, comment; `service:82-91`); chỉ cron ngầm tôn trọng cờ. Idempotency theo (class_schedule_id, session_date) — đã có execution và không phải FAILED thì bỏ (`service:198-208`).
- [ĐKC] Điều kiện tự điểm danh: parse schedule_pattern hợp lệ, không MANUAL_ONLY (LKCD), `isDateInSchedule(now)`; enrollment STUDYING + EnrollmentClass ACTIVE + trong khoảng start_date→end_date (`service:109-147`). Chỉ điền ô **trống** (`service:251-254`). Thiếu giờ học→tạo execution SKIPPED + task SCHEDULE_DATA_ISSUE cho CS (`service:149-176`).
- [ĐKC] scheduledRunAt = giờ start_time local (`now.getFullYear/getMonth/getDate`, `setHours` local) + delay (`service:95-99,188-196`); sessionDate dựng theo **UTC** của ngày local (`service:98`). [SLCC] Hai mốc timezone khác nhau; host UTC+7 có thể lệch ngày vào khung nửa đêm, ảnh hưởng idempotency key/issue title (`service:99,164`).
- [ĐKC] Attendance tạo bởi auto đi qua `repository.createAttendance`, chỉ ghi `status/source/created_by_id`, **không ghi opinion teacher/cs, không deriveState**; reconciliation_state mặc định DB `PENDING_CS` (`auto-attendance.repository.ts` createAttendance; `backend/prisma/schema.prisma:461` `reconciliation_state ReconciliationState @default(PENDING_CS)`). Mỗi attendance created có gọi `handleAttendanceEvent` best effort (`auto-attendance.service.ts:275-279`) nhưng trigger chỉ fire khi MATCHED/RESOLVED (`automation/automation-trigger.service.ts:90-97`), nên **attendance auto thường chưa kích hoạt chăm sóc cho tới khi GV/CS nhập ý kiến hoặc admin chốt**.
- [ĐKC] Session do auto tạo qua `findOrCreateClassSession` (unique `[class_schedule_id, session_date]` + Serializable retry) — session auto mang `class_schedule_id`, khác session manual (`class-sessions.repository.ts:28-47` không set field này) [SLCC] nên import/đối soát sau có thể không khớp session cùng ngày/giờ do unique này.
- [ĐKC] `ensureSystemActor` upsert user `auto-attendance@system.invalid` (active=false, roles [], hash sentinel) và verify lại trước khi dùng (`auto-attendance.repository.ts:10-31`) — không thể login nên không có refresh/login audit.
- [ĐKC] Không có socket emit/queue ở module; tự chạy theo đồng hồ, không phụ thuộc Redis (scheduler `auto-attendance-scheduler.ts` được app cron gọi riêng — [CXM] chưa kiểm chứng trong tài liệu này).

<a id="section-11"></a>
## 11. Enrollments

Trích dẫn thuộc `backend/src/modules/enrollments/`.

| METHOD /path đầy đủ | requireRoles cụ thể | Data-scope | Validation | Side-effects | Lỗi thường gặp |
|---|---|---|---|---|---|
| GET `/api/v1/enrollments` | A/M/CS (`enrollments.routes.ts:11`) | ADMIN toàn bộ; MANAGE = self + members ManageAssignment (cs_id IN), giao csId query; CS = cs_id=self **OR** sale_name/cs.name/cs.email bằng `sale` (`service:20-55`; `repository:49-101`) | Query parse tay sale/program_type/cs_id (`controller:10-24`) | Không ghi | 400 query |
| GET `/api/v1/enrollments/:id` | A/M/CS (`routes:12`) | ADMIN bypass; MANAGE đối chiếu cs_id trong scope; CS chỉ cs_id=self (`service:58-81`) | parseInt | Không | 404/403 |
| POST `/api/v1/enrollments` | A/M/CS (`routes:13`) | CS chỉ tạo cho chính mình; A/M không giới hạn cs_id; **không giao ManageAssignment** (`service:83-92`) | `enrollments.schema.ts:3-13` | Không | 403/404 student/400 schema/DB |
| PATCH hoặc PUT `/api/v1/enrollments/:id` | A/M/CS (`routes:14-15`) | Qua getEnrollmentById, nhưng **không kiểm cs_id mới** (`service:94-97`) | `enrollments.schema.ts:15-26` (không có cs_id) | Không | 404/403 |
| POST `/api/v1/enrollments/:id/assign` | ADMIN, MANAGE (`routes:18`) | Kiểm scope cũ (`service:99-111`) | `enrollments.schema.ts:28-32` | Đổi cs_id | 403/400 CS không role/404 |
| POST `/api/v1/enrollments/:id/transfer-class` | A/M/CS (`routes:19`) | Kiểm scope enrollment (`service:114-122`) | `enrollments.schema.ts:34-40` | Transaction: EC cũ TRANSFERRED + EC mới sequence_no+1 ACTIVE (`repository:145-186`) | 404 lớp/403/DB |

### Quy tắc nghiệp vụ

- [ĐKC] List scope CS dùng `OR` cs_id/sale; nghĩa là một CS thấy cả enrollment họ **bán** dù không phụ trách — khác GET `:id` vốn chỉ `cs_id !== userId` (`service:52-55,76-78`). [SLCC] Cùng record có thể hiện diện trong list nhưng bị 403 khi mở chi tiết (kiểu scope không nhất quán).
- [ĐKC] Trạng thái enrollment: cùng bảng 7 giá trị như students (`WAITING_CLASS/STUDYING/PAUSED/FINISHED/UPCOMING/NOT_STARTED/CANCELLED`); `updateEnrollmentSchema` gán thẳng, không state machine, không kiểm FINISHED/CANCELLED không cho chuyển (`schema:24`; `repository:123-136`). `EnrollmentClass.status` ACTIVE↔TRANSFERRED chuyển trong `transferClass`, mặc nhiên không guard trạng thái nguồn ngoài tìm bản ghi ACTIVE (`repository:150-165`).
- [ĐKC] `total_sessions` create phải int >0 (`schema:9`), `updateEnrollment` schema không có `sale_name`/`student_source_status` (khác `students.schema.ts`). `createEnrollmentSchema` không có `package_code` nhưng có `package_id` (`schema:7`), repository `...data` có thể truyền trường chưa được validate (kể cả `external_id`) vào `enrollment.create` [SLCC].
- [ĐKC] start_date/end_date và `transferClass.start_date` dùng `new Date(string)`; không có ngày → `transferClass` default `new Date()` (`repository:146`), tức chuyển lớp bắt đầu ngay. Không kiểm end≥start (`service`/`repository`).

<a id="section-12"></a>
## 12. Preferences

Trích dẫn thuộc `backend/src/modules/preferences/`. Mount `/api/v1/me/preferences` (`app.ts:88`).

| METHOD /path đầy đủ | requireRoles cụ thể | Data-scope | Validation | Side-effects | Lỗi thường gặp |
|---|---|---|---|---|---|
| GET `/api/v1/me/preferences/:scope` | authenticate, **không requireRoles** (`preferences.routes.ts:9`) | Chỉ user hiện tại (`userId` từ JWT, `service:11-23`) | `preferenceParamsSchema` enum 5 scope (`schema:14-16`), **safeParse tại controller:14-17**, service assertScope thêm lần nữa | Không ghi | 400 scope sai (`service:39-45`) |
| PUT `/api/v1/me/preferences/:scope` | authenticate (`routes:10`) | Chỉ user hiện tại (`service:29-37`) | `preferenceBodySchema`: value record<string,boolean> max 80 (`schema:18-24`), safeParse tại `preferences.controller.ts:32-40` | Upsert row (unique user+scope, `schema.prisma:996`) | 400 scope/body |

### Quy tắc nghiệp vụ

- [ĐKC] Scope whitelist: `enrollments.quick/enrollments.detailed/enrollments.stats/students.tab1/students.tab2`; **không có delete/reset**. “Chỉ lưu delta so với mặc định” là **quy ước client**, server không enforce (`service:26-28`).
- [ĐKC] Không side-effect socket/queue/care-sync/audit; giá trị map boolean, không validate key cột (`schema:18-24`). [SLCC] Một client có thể gửi key tùy ý tới 80 phần tử mà không lỗi.

<a id="section-13"></a>
## 13. Dashboard

Trích dẫn thuộc `backend/src/modules/dashboard/`.

| METHOD /path đầy đủ | requireRoles cụ thể | Data-scope | Validation Zod | Side-effects | Lỗi thường gặp |
|---|---|---|---|---|---|
| GET `/api/v1/dashboard/summary` | A/M/CS (`dashboard.routes.ts:10-14`) | `getAccessibleCSIds`: ADMIN null; MANAGE self+ManageAssignment members; CS [self]; khác 403 (`service:39-67`) | **Không Zod**, parseInt tay (`controller:12-21`) | Không | 403/500 repository |
| GET `/api/v1/dashboard/attendance` | A/M/CS (`routes:16-20`) | Cùng scope | Không Zod | Không | 403 |
| GET `/api/v1/dashboard/care-pivot` | A/M/CS (`routes:22-26`) | Cùng scope | Không Zod | Không | 403 |
| GET `/api/v1/dashboard/tasks-overview` | A/M/CS (`routes:28-32`) | Cùng scope, `cs_id` filter chỉ trong scope (`controller:56-61`; `service:140-142`) | Không Zod | Không | 403 |
| GET `/api/v1/dashboard/overview` | A/M/CS (`routes:35-39`) | Cùng scope (`service:161-171`) | Không | Không | 403 |
| GET `/api/v1/dashboard/care` | A/M/CS (`routes:41-45`) | Cùng scope (`service:273-277`) | Không | Không | 403 |
| GET `/api/v1/dashboard/attendance-tab` | A/M/CS (`routes:47-51`) | Cùng scope (`service:296-301`) | Không | Không | 403 |
| GET `/api/v1/dashboard/performance` | A/M/CS (`routes:53-57`) | Cùng scope; **leaderboard chỉ A/M**, CS thấy null (`service:316-327`) | Không | Không | 403 |

### Quy tắc nghiệp vụ

- [ĐKC] Dashboard dùng scope theo **cs_id enrollment**, không phải theo lớp; GV **không được gọi bất kỳ route dashboard nào** (requireRoles không có TEACHER; `dashboard.routes.ts`). MANAGE không có ManageAssignment vẫn xem dữ liệu của chính họ vì `csIds.add(userId)` (`service:54-59`).
- [ĐKC] `filter.cs_id` đi vào repository; `getTasksOverview` giới hạn csIdFilter trong accessibleCSIds — nhưng các filter package_id/class_id/date/status được truyền thẳng không Zod nên chuỗi không hợp lệ rơi vào `parseInt` NaN (repository có thể bỏ filter) [SLCC] (`controller:12-21`, `service:140-171`).
- [ĐKC] Chỉ có KPI read; status breakdown dựa trên `Enrollment.status` không kiểm enum trước khi hiển thị phần trăm (`service:70-86`); attendance rate dùng `breakdown.ATTENDED/total` (`service:88-99`), tức **không tính LEAVE_B** vào numerator — không suy ra từ nguồn khác.

<a id="section-14"></a>
## 14. Đối chiếu `docs/api/*.md` với route thật — tài liệu lệch code

[ĐKC] Đối chiếu trực tiếp các tài liệu tương ứng với `app.ts` và `*.routes.ts`.

| Tài liệu | Lệch code đã xác minh |
|---|---|
| `docs/api/auth.md:9-12,18-20` | Ghi refresh **Rotate refresh token** nhưng `auth.service.ts:68-112` không rotation, chỉ cập nhật last_used_at; ghi “403 disabled nếu policy chọn” còn code login 403 disabled nhưng refresh catch luôn 401 (`auth.controller.ts:47-50`). Login schema email Zod chưa được tài liệu nói rõ. |
| `docs/api/users.md:9-16,20-21` | Tài liệu nói GET role ADMIN nhưng code cho ADMIN **hoặc MANAGE** (`users.routes.ts:8-9`); tài liệu có reset-password nhưng không có route thật; roles “chỉ nhận 4 enum” nhưng schema `z.string()` không whitelist (`users.schema.ts:10,20`); code create collision code tự sinh, không đảm bảo email duplicate qua service. |
| `docs/api/students.md:7-17` | Tài liệu nói query page/search/sort và detail phải giới hạn enrollment trừ ADMIN; code list chỉ program_type/cs_id, detail không scope (mọi role CS/MANAGE có thể lấy ID bất kỳ) (`students.controller.ts:10-23,30-34`; repository `:115-158`). Code có PUT ngoài tài liệu (`students.routes.ts:16-17`). |
| `docs/api/teachers.md:7-11` | Tài liệu chỉ có PATCH `/{teacherId}/profile`; code thật có POST create, PATCH `/:id`, POST `/:id/account`; không có `/profile` (`teachers.routes.ts:11-17`). Tài liệu nói Teacher là User role TEACHER nhưng code cho Teacher entity trước, provision account sau (`teachers.repository.ts:51-75,102-137`). |
| `docs/api/packages.md:7-10` | Các endpoint CRUD khớp; code mở rộng role view CS (`packages.routes.ts:11-12`) và create/update A/M (`:15-16`). Tài liệu không nêu duplicate code 409. |
| `docs/api/classes.md:7-15,31-35` | Có các schedule routes và PATCH teacher assignment trong tài liệu nhưng **không có routes thật**; ngược lại code có cancel/delete session, tài liệu không liệt kê DELETE (`classes.routes.ts:19-21`; `class-sessions.routes.ts:23-27`). Quy tắc source “LEARNING_SYSTEM do CS, ZOOM do Teacher upload” không được route guard enforce; TEACHER được create/update/cancel/delete session nếu có class access (`class-sessions.routes.ts:17-27`). |
| `docs/api/enrollments.md:9-16,20-22` | Tài liệu dùng `/reassign-cs`, classes CRUD lồng; code dùng `/:id/assign`, `/:id/transfer-class`, không có routes classes lồng (`enrollments.routes.ts:10-19`). Tài liệu yêu cầu MANAGE team scope khi reassign, code `reassignCS` chỉ role A/M và `getEnrollmentById` scope cũ; không kiểm newCs thuộc ManageAssignment (`enrollments.service.ts:99-111`). |
| `docs/api/attendance.md:9-15,36-42` | Tài liệu có `/summary` nhưng code không có; tài liệu nói reset soft-delete, code reset có thể soft-delete hoặc giữ record sống khi còn opinion (`attendance.repository.ts:361-381,400-422`). Tài liệu nói TEACHER/CS và A/M audit actor+supported; reconciliation A/M teacher-mark ghi actor vào teacher_user, không người được hỗ trợ (`reconciliation.service.ts:214-245`). Tài liệu nói source rule khá chặt nhưng route/attendance service không enforce source theo role. Tài liệu import nói chỉ conflict APPLY ghi đè, trong code mặc định action có thể `CREATE_ATTENDANCE` cũng APPLY (`attendance-import.service.ts:136-155`). |
| `docs/api/dashboard.md` phần Scope | Tài liệu nói TEACHER xem lớp phân công, nhưng `dashboard.routes.ts:10-57` chỉ A/M/CS; `dashboard.service.ts:62-67` TEACHER bị 403. Đây là lệch quyền nghiêm trọng [ĐKC]. Tài liệu cũ chỉ liệt kê 4 endpoint; code thêm `/overview`, `/care`, `/attendance-tab`, `/performance` (`dashboard.routes.ts:34-57`). |
| Không có tài liệu tương ứng | `auto-attendance`, `preferences`, reconciliation route chi tiết không có file riêng; nội dung attendance.md phần reconciliation/auto-attendance có mô tả nhưng còn các lệch nêu trên. |

<a id="section-15"></a>
## 15. Luồng TEACHER được đối chiếu trong code (runtime chưa xác minh)

[ĐKC-CODE] Các route dưới đây khai báo cho JWT role TEACHER theo route/service; **không gọi với token thật hoặc tự tạo token trong khảo sát này**. MANAGE/TEACHER runtime vẫn bị chặn/chưa xác minh. Danh sách không phải kết quả test tích hợp.

- **Xem danh mục:** GET teachers; GET classes (chỉ lớp active assignment hoặc session assignment); GET class detail có `requireClassAccess`; GET sessions của lớp; GET attendance của session. `classes.scope.ts:11-65` là scope trung tâm. [SLCC] `ClassSession` assignment theo buổi có thể mở toàn lớp cho GV, không yêu cầu classTeacher active.
- **Tác nghiệp lớp:** POST/PATCH/cancel/DELETE session đều cho TEACHER khi class access (`class-sessions.routes.ts:17-27`); POST/PATCH/bulk attendance đều cho TEACHER khi class access, nhưng service write yêu cầu ClassTeacher active/user_id (`attendance.service.ts:41-49`). Như vậy teacher-session access (có assignment ở một session) và teacher-attendance write (ClassTeacher active) **không đồng nhất**.
- **Reconciliation:** GET teacher-sessions (self; A/M chọn giáo viên), GET teacher-tracking pending/count/history; POST `/:id/teacher-mark`; POST upload-teacher-excel đã ngừng 410; import preview/confirm source TEACHER (`reconciliation.routes.ts:15-40,51-64,103-106`; controller `:145-146`). `teacher-tracking` scope assignment active và query teacherId tự chọn bị chặn với GV (`reconciliation.service.ts:128-139,177-180`).
- **Không được gọi:** users, students, packages, enrollments, dashboard, auto-attendance, classes create/update/assign teacher, reconciliation CS/pending/conflicts/stats/history/resolve/bulk-approve. Không có route `my-sessions`; tên tương đương thật là `/attendance-reconciliation/teacher-sessions`. [ĐKC]
- **Data leakage cần xử lý/test:** teachers list toàn bộ; attendance list có thể bỏ classId khi repository lọc; class-session detail trả attendance + enrollment; teacher-tracking select contract thì không có CS opinion fields nhưng GET attendance thường có. [SLCC]

<a id="section-16"></a>
## 16. Ma trận vai trò × chức năng (chỉ nhóm module này)

Ký hiệu: `x` = đã kiểm chứng route guard; `(d)` = data-scope đã kiểm chứng trong service/repository; `?` = chưa xác minh/không có route tương ứng. ADMIN/MANAGE viết riêng khi quyền khác nhau.

| Chức năng | ADMIN | MANAGE | CS | TEACHER |
|---|---:|---:|---:|---:|
| Auth login/refresh | x | x | x | x |
| Auth logout/me | x | x | x | x |
| Users list | x(d) | x(d) | ? | ? |
| Users CRUD/enable/disable/revoke | x(d) | ? | ? | ? |
| Students list | x(d) | x(d) | x(d) | ? |
| Students detail | x(d) | x(d) | x(d) | ? |
| Students create/update | x(d) | x(d) | x(d) | ? |
| Teachers list/detail | x(d) | x(d) | x(d) | x(d) |
| Teachers create/update/account | x(d) | x(d) | ? | ? |
| Packages list/detail | x(d) | x(d) | x(d) | ? |
| Packages create/update | x(d) | x(d) | ? | ? |
| Classes list | x(d) | x(d) | x(d) | x(d) |
| Class detail | x(d) | x(d) | x(d) | x(d) |
| Class create/update/assign | x(d) | x(d) | ? | ? |
| Class sessions read | x(d) | x(d) | x(d) | x(d) |
| Class sessions create/update/cancel/delete | x(d) | x(d) | x(d) | x(d) |
| Attendance list | x(d) | x(d) | x(d) | x(d) |
| Attendance mark/update/reset | x(d) | x(d) | x(d) | x(d) |
| Reconciliation teacher sessions | x(d) | x(d) | ? | x(d) |
| Reconciliation teacher tracking | x(d) | x(d) | ? | x(d) |
| Reconciliation teacher mark/import | x(d) | x(d) | ? | x(d) |
| Reconciliation CS mark | x(d) | x(d) | x(d) | ? |
| Reconciliation pending/conflicts/stats/history | x(d) | x(d) | x(d) | ? |
| Resolve conflict/bulk approve | x(d) | x(d) | x(d) | ? |
| Auto-attendance settings/run | x(d) | ? | ? | ? |
| Own preferences | x(d) | x(d) | x(d) | x(d) |
| Dashboard read | x(d) | x(d) | x(d) | ? |

### Còn lại / khuyến nghị xác minh

- [ĐKC] Enrollment summary scope giao cs_id khi trong accessibleCSIds, ngoài scope sẽ fallback toàn allowed IDs chứ không trả rỗng (`dashboard.repository.ts:17-28`). **Attendance stats** chỉ lọc theo accessibleCSIds/class/package/date, không dùng filter.cs_id; `total_sessions` đếm ClassSession chỉ theo class_id, không CS scope/date/package (`dashboard.repository.ts:80-123`). [SLCC] CS có thể nhận tổng số buổi toàn hệ thống nếu không class_id, dù total_attendances được scope; KPI không cùng mẫu số. Attendance stats không loại deleted_at, không yêu cầu MATCHED/RESOLVED (`repository:80-123`), nên count có thể chứa pending/conflict/soft-deleted.
- [ĐKC] Dashboard date_from/date_to dùng `new Date` trực tiếp: summary lọc created_at enrollment, attendance lọc session_date; date_to=YYYY-MM-DD kết thúc midnight, không cuối ngày (`repository:33-36,105-111`). Khác reconciliation lọc 23:59:59.999Z.
- [CXM] Chưa đọc hết các nhánh repository dashboard mới để xác minh mọi filter và SQL; không chạy truy vấn thật.
- [CXM] Chưa kiểm thử phiên bản Zod thực tế, timezone máy chủ, Prisma DB unique của enrollment.external_id (schema hiện chỉ thấy `external_id String?` **không có `@unique`** ở `backend/prisma/schema.prisma:205-208`; `external_sync_key` mới có `@unique` ở `:208`; Student.external_id có `@unique` tại `:159`).
- [CXM] Chưa xác minh app bootstrap scheduler/socket; các kết luận side-effect chỉ là call graph tĩnh trong file đã đọc.

## Nguồn tài liệu lệch chính

`docs/api/auth.md`, `users.md`, `students.md`, `teachers.md`, `packages.md`, `classes.md`, `enrollments.md`, `attendance.md`, `dashboard.md`; mount thật tại `backend/src/app.ts:72-88`.
