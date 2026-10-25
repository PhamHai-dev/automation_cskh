# 04 — Quan hệ dữ liệu

> [ĐKC] Nguồn chuẩn: `backend/prisma/schema.prisma` (toàn bộ 1–1697), khảo sát 2026-10-24. [SLCC] suy luận từ cấu trúc/mã; [CXM] chưa xác minh DB live. Không khởi động server, không build/test/migrate.

## Quy tắc đọc

- Trong bảng, **A → B** là bản ghi con A giữ FK tới bản ghi cha B; `N:1` nghĩa mỗi A có một B và B có thể có 0..N A.
- FK tùy chọn là `N:0..1`; riêng `Teacher.user_id @unique` tạo 0..1–0..1.
- [ĐKC] Không ghi `onDelete` trong schema: Prisma mặc định `Restrict` cho quan hệ required và `SetNull` cho optional; `onUpdate` mặc định `Cascade`. [CXM] DDL thực tế có thể khác nếu migration chưa áp dụng. Các bảng dưới ghi `R*`/`S*` cho default, `Cascade`/`SetNull` cho khai báo tường minh.
- `R*`: xóa cha bị chặn nếu còn con; `S*`/`SetNull`: FK con mất liên kết; `Cascade`: xóa con. Đây là tác động cấu trúc, không tự động đồng nghĩa API cho phép xóa.
- `active`, `archived_at`, `deleted_at`, thời hạn hoặc trạng thái nghiệp vụ không tự hủy FK.

## 1. Đào tạo và phân quyền

| A → B | Cardinality | FK / onDelete | Bắt buộc từ A? | Nơi thiết lập | Trạng thái/hiệu lực và ảnh hưởng |
|---|---|---|---|---|---|
| User → User (creator) | N:0..1 | created_by_id / S* | Không | schema:29 | Xóa creator để null; không xóa user được tạo |
| AuthSession → User | N:1 | user_id / R* | Có | schema:77 | expires_at/revoked_at riêng; xóa User bị chặn |
| PasswordResetToken → User | N:1 | user_id / R* | Có | schema:90 | expires_at/used_at riêng |
| LoginAudit → User | N:0..1 | user_id / S* | Không | schema:112 | Đăng nhập thất bại có thể không User |
| CSGroupMember → CSGroup | N:1 | cs_group_id / R* | Có | schema:134 | unique(group,user); group.active không cắt membership |
| CSGroupMember → User | N:1 | user_id / R* | Có | schema:135 | JSON roles không được FK kiểm tra |
| ManageAssignment → User | N:1 | manage_user_id / R* | Có | schema:146 | Không có constraint bắt buộc role MANAGE |
| ManageAssignment → CSGroup | N:1 | cs_group_id / R* | Có | schema:147 | unique(manage,group) |
| Teacher → User | 0..1:0..1 | user_id unique nullable / S* | **Không** | schema:271,275 | User độc lập Teacher; active ở hai model độc lập |
| Enrollment → Student | N:1 | student_id / R* | Có | schema:242 | Student không có soft-delete; enrollment giữ lịch sử |
| Enrollment → Package | N:0..1 | package_id / S* | Không | schema:243 | Xóa Package mất liên kết; total_sessions lưu độc lập |
| Enrollment → User (CS) | N:1 | cs_id / R* | Có | schema:244 | User.roles không bảo đảm là CS |
| Enrollment → Sale | N:0..1 | sale_id / S* | Không | schema:245 | sale_name là snapshot độc lập, có thể khác Sale.name |
| ClassTeacher → Class | N:1 | class_id / R* | Có | schema:328 | active + start_date/end_date; không unique class/teacher |
| ClassTeacher → Teacher | N:1 | teacher_id / R* | Có | schema:329 | Vai trò MAIN/ASSISTANT/SUBSTITUTE |
| EnrollmentClass → Enrollment | N:1 | enrollment_id / R* | Có | schema:353 | sequence_no + status giữ lịch sử chuyển lớp |
| EnrollmentClass → Class | N:1 | class_id / R* | Có | schema:354 | unique(enrollment,class,sequence); không ngăn hai class cùng ACTIVE |
| ClassSchedule → Class | N:1 | class_id / R* | Có | schema:373 | active/valid_from/valid_to; không tự cascade xóa session |
| ClassSession → Class | N:1 | class_id / R* | Có | schema:401 | unique class/session_number; status SCHEDULED/COMPLETED/CANCELLED |
| ClassSession → ClassSchedule | N:0..1 | class_schedule_id / S* | Không | schema:402 | unique schedule/date; NULL không chống trùng như required |
| ClassSession → User (creator) | N:1 | created_by_id / R* | Có | schema:403 | teacher_id là scalar **không FK/@relation**; create validate `User` role TEACHER (`class-sessions.service.ts:35-40`) |
| Attendance → EnrollmentClass | N:1 | enrollment_class_id / R* | Có | schema:477 | unique enrollment_class/session; deleted_at vẫn chiếm unique |
| Attendance → ClassSession | N:1 | class_session_id / R* | Có | schema:478 | Không composite FK bảo đảm session.class = enrollment_class.class |
| Attendance → User (creator) | N:1 | created_by_id / R* | Có | schema:479 | Nguồn MANUAL/IMPORT/AUTO riêng |
| Attendance → User (deleter) | N:0..1 | deleted_by_id / S* | Không | schema:480 | soft-delete deleted_at không cascade delivery |
| Attendance → User (teacher) | N:0..1 | teacher_user_id / S* | Không | schema:481 | Trỏ User, **không** Teacher |
| Attendance → User (CS) | N:0..1 | cs_user_id / S* | Không | schema:482 | Chưa submit có thể NULL |
| Attendance → User (resolver) | N:0..1 | resolved_by_id / S* | Không | schema:483 | RESOLVED không bị DB check bắt buộc resolved_by_id |

## 2. Kết nối (Zalo / LINE)

| A → B | Cardinality | FK / onDelete | Bắt buộc? | Nơi thiết lập | Trạng thái/hiệu lực & ảnh hưởng |
|---|---|---|---|---|---|
| ZaloAccount → User (CS) | N:1 | cs_id / R* | Có | schema:530 | status ZaloAccountStatus; archived_at mềm, không cắt FK |
| ZaloAccount → User (archiver) | N:0..1 | archived_by_id / S* | Không | schema:531 | — |
| ZaloContactRelation → Student | N:1 | student_id / R* | Có | `student-care-group-matcher.service.ts:610` | unique(student,account) |
| ZaloContactRelation → ZaloAccount | N:1 | zalo_account_id / R* | Có | schema:595 | relation_status/target_type |
| ZaloContactRelation → ZaloGroup | N:0..1 | zalo_group_id / SetNull | Không | schema:596 | group rời đi → NULL, không xóa quan hệ SV |
| ZaloGroup → ZaloAccount | N:1 | zalo_account_id / R* | Có | schema:622 | xóa nick bị chặn khi còn group |
| ZaloGroupMember → ZaloGroup | N:1 | group_id / R* | Có | schema:640 | unique(group,uid) |
| Friend → ZaloAccount | N:1 | zalo_account_id / R* | Có | schema:1230 | unique(account,zalo_uid_in_nick); contact_id KHÔNG có relation |
| Contact → Student | N:0..1 | student_id / S* | Không | schema:1257 | danh tính Zalo hợp nhất |
| ContactAccess → Contact | N:1 | zalo_uid→Contact.zalo_uid / R* | Có | schema:1277 | FK theo chuỗi UID, không theo id |
| ContactAccess → ZaloAccount | N:1 | zalo_account_id / R* | Có | schema:1276 | is_friend mềm |
| Conversation → ZaloAccount | N:1 | zalo_account_id / R* | Có | schema:1332 | unique(account,thread); deleted_at mềm |
| Message → Conversation | N:1 | conversation_id / R* | Có | schema:1373 | unique(conv,zalo_msg_id) |
| ZaloAccountAccess → ZaloAccount/User | N:1 / N:1 | R* | Có | schema:1392-1393 | unique(account,user); permission String |
| ZaloLabel/GroupScan/GroupMember/ZaloAccountStatusLog → ZaloAccount | N:1 | R* | Có | schema:1416,1444,1470,1300 | — |
| SdkLimit → ZaloAccount | N:0..1 | zalo_account_id nullable | Không | schema:565 | NULL = global default; unique(account,category) |
| LineAccount → User (CS) | N:1 | cs_id / R* | Có | schema:1529 | LineAccountStatus |
| LineAccount → User (archiver) | N:0..1 | archived_by_id / S* | Không | schema:1530 | — |
| LineContactRelation → Student | N:1 | student_id / R* | Có | `student-care-group-matcher.service.ts:680` | unique(student,account) |
| LineContactRelation → LineAccount | N:1 | line_account_id / R* | Có | schema:1561 | reuse enum ZaloContactRelationStatus [ĐKC] |
| LineContactRelation → LineGroup | N:0..1 | line_group_id / SetNull | Không | schema:1562 | link_code @unique |
| LineGroup → LineAccount | N:1 | line_account_id / R* | Có | schema:1584 | — |
| LineGroupMember → LineGroup | N:1 | group_id / **Cascade** | Có | schema:1603 | xóa group xóa thành viên |
| LineFriend → LineAccount | N:1 | line_account_id / **Cascade** | Có | schema:1631 | Friend(Zalo) là R* → bất đối xứng |
| LineConversation → LineAccount | N:1 | line_account_id / **Cascade** | Có | schema:1659 | Conversation(Zalo) là R* |
| LineMessage → LineConversation | N:1 | conversation_id / **Cascade** | Có | schema:1692 | Message(Zalo) là R* |

## 3. Chăm sóc / Broadcast / Delivery

| A → B | Cardinality | FK / onDelete | Bắt buộc? | Nơi thiết lập | Ghi chú |
|---|---|---|---|---|---|
| CareTask → Enrollment | N:1 | enrollment_id / R* | Có | schema:929 | type/priority/status |
| CareTask → User (assignee) | N:1 | assigned_to_id / R* | Có | schema:930 | idempotency_key @unique |
| CareLog → Enrollment | N:1 | enrollment_id / R* | Có | `sheet-sync.service.ts:1079` | outcome CareLogOutcome |
| CareLog → User (CS) | N:1 | cs_id / R* | Có | schema:887 | created_by_id không có FK [ĐKC] |
| AutomationWorkflow → User (owner CS) | N:1 | owner_cs_id / R* | Có | schema:672 | — |
| AutomationStep → AutomationWorkflow | N:1 | workflow_id / **Cascade** | Có | schema:694 | unique(workflow,session,trigger) |
| AutomationEnrollment → Workflow/Enrollment | N:1 | cả hai **Cascade** | Có | schema:709-710 | — |
| MessageDelivery → Enrollment | N:1 | enrollment_id / R* | Có | `automation-repository.ts:262` | — |
| MessageDelivery → Attendance | N:1 | attendance_id / R* | Có | schema:752 | unique(attendance,step) |
| MessageDelivery → AutomationStep | N:1 | automation_step_id / R* | Có | schema:753 | — |
| MessageDelivery → Zalo/Line account+group | N:0..1 | nullable, mặc định SetNull | Không | schema:754-757 | kênh chọn 1 trong nhiều nullable |
| BroadcastCampaign → User (creator) | — | created_by_id **không @relation** | — | schema:804 | cột Int nhưng không FK [ĐKC] |
| BroadcastRecipient → BroadcastCampaign | N:1 | campaign_id / **Cascade** | Có | schema:836 | target_* soft ref, không FK [ĐKC] |

## 4. Nhập liệu / Sheet sync

| A → B | Cardinality | FK / onDelete | Nơi thiết lập | Ghi chú |
|---|---|---|---|---|
| ImportBatch → User (uploader) | N:1 | uploaded_by_id / R* | schema:1101 | status ImportBatchStatus |
| ImportRow → ImportBatch | N:1 | import_batch_id / R* | schema:1125 | entity_type/entity_id polymorphic |
| ImportCreateRequest → ImportBatch | N:1 | import_batch_id / R* | schema:1185 | unique(batch,external_id,package_code) |
| ImportCreateRequest → User (requester/reviewer/assignee) | N:1/N:0..1/N:0..1 | R*/S*/S* | schema:1186-1188 | version + status |
| GoogleSheetRowState → GoogleSheetSyncConfig | N:1 | config_id / **Cascade** | `sheet-sync.service.ts:1105` | unique(config,sync_key); student/enrollment KHÔNG FK [ĐKC] |
| GoogleSheetSyncConfig → User (default CS) | — | default_cs_id **không @relation** | schema:1047 | Int nullable nhưng không FK [ĐKC] |
| CsSheetBackupConfig → User (CS) | 1:1 | cs_user_id @unique / **Cascade** | schema:1030; `sheet-backup.service.ts:213` | — |
| AutoAttendanceExecution → ClassSchedule | N:1 | class_schedule_id / R* | schema:966 | unique(schedule,session_date) |
| OutboxEvent | — | aggregate_id polymorphic (không FK) | schema:853 | transactional outbox |

## 5. Sơ đồ tổng quan (chỉ cạnh có @relation tường minh)

```mermaid
erDiagram
  USER ||--o{ ENROLLMENT : "cs_id"
  USER ||--o{ CARETASK : "assigned_to"
  USER ||--o{ CARELOG : "cs_id"
  USER ||--o{ ZALOACCOUNT : "cs_id"
  USER ||--o{ LINEACCOUNT : "cs_id"
  USER |o--o| TEACHER : "user_id (optional 1-1)"
  USER ||--o{ CSGROUPMEMBER : "user"
  CSGROUP ||--o{ CSGROUPMEMBER : "members"
  CSGROUP ||--o{ MANAGEASSIGNMENT : "assignments"
  USER ||--o{ MANAGEASSIGNMENT : "manage_user"

  STUDENT ||--o{ ENROLLMENT : "student_id"
  PACKAGE |o--o{ ENROLLMENT : "package_id"
  SALE |o--o{ ENROLLMENT : "sale_id"
  ENROLLMENT ||--o{ ENROLLMENTCLASS : "enrollment"
  CLASS ||--o{ ENROLLMENTCLASS : "class"
  CLASS ||--o{ CLASSSESSION : "class"
  CLASS ||--o{ CLASSSCHEDULE : "class"
  CLASSSCHEDULE |o--o{ CLASSSESSION : "class_schedule_id"
  CLASSSCHEDULE ||--o{ AUTOATTENDANCEEXECUTION : "schedule"
  TEACHER ||--o{ CLASSTEACHER : "teacher"
  CLASS ||--o{ CLASSTEACHER : "class"
  ENROLLMENTCLASS ||--o{ ATTENDANCE : "enr_class"
  CLASSSESSION ||--o{ ATTENDANCE : "session"

  ATTENDANCE ||--o{ MESSAGEDELIVERY : "attendance"
  AUTOMATIONWORKFLOW ||--o{ AUTOMATIONSTEP : "workflow Cascade"
  AUTOMATIONWORKFLOW ||--o{ AUTOMATIONENROLLMENT : "workflow Cascade"
  ENROLLMENT ||--o{ AUTOMATIONENROLLMENT : "enrollment Cascade"
  AUTOMATIONSTEP ||--o{ MESSAGEDELIVERY : "step"
  ZALOACCOUNT |o--o{ MESSAGEDELIVERY : "account"
  ZALOGROUP |o--o{ MESSAGEDELIVERY : "group"
  LINEACCOUNT |o--o{ MESSAGEDELIVERY : "account"
  LINEGROUP |o--o{ MESSAGEDELIVERY : "group"
  BROADCASTCAMPAIGN ||--o{ BROADCASTRECIPIENT : "campaign Cascade"

  ZALOGROUP |o--o{ ZALOCONTACTRELATION : "group SetNull"
  ZALOACCOUNT ||--o{ ZALOCONTACTRELATION : "account"
  STUDENT ||--o{ ZALOCONTACTRELATION : "student"
  ZALOACCOUNT ||--o{ ZALOGROUP : "account"
  ZALOGROUP ||--o{ ZALOGROUPMEMBER : "group"
  ZALOACCOUNT ||--o{ FRIEND : "account"
  ZALOACCOUNT ||--o{ CONVERSATION : "account"
  CONVERSATION ||--o{ MESSAGE : "conversation"
  STUDENT |o--o{ CONTACT : "student_id"
  CONTACT ||--o{ CONTACTACCESS : "zalo_uid"
  ZALOACCOUNT ||--o{ CONTACTACCESS : "account"

  LINEACCOUNT ||--o{ LINECONTACTRELATION : "account"
  STUDENT ||--o{ LINECONTACTRELATION : "student"
  LINEGROUP |o--o{ LINECONTACTRELATION : "group SetNull"
  LINEACCOUNT ||--o{ LINEGROUP : "account"
  LINEGROUP ||--o{ LINEGROUPMEMBER : "group Cascade"
  LINEACCOUNT ||--o{ LINEFRIEND : "account Cascade"
  LINEACCOUNT ||--o{ LINECONVERSATION : "account Cascade"
  LINECONVERSATION ||--o{ LINEMESSAGE : "conversation Cascade"

  USER ||--o{ IMPORTBATCH : "uploader"
  IMPORTBATCH ||--o{ IMPORTROW : "batch"
  IMPORTBATCH ||--o{ IMPORTCREATEREQUEST : "batch"
  GOOGLESHEETSYNCCONFIG ||--o{ GOOGLESHEETROWSTATE : "config Cascade"
  USER ||--|| CSSHEETBACKUPCONFIG : "cs_user Cascade 1-1"
```

Lưu ý [ĐKC]: các cạnh `BroadcastCampaign→User`, `GoogleSheetSyncConfig→User(default_cs)`, `ClassSession→teacher_id`, `BroadcastRecipient.target_*`, `GoogleSheetRowState.student/enrollment`, `CareLog.created_by_id`, `Friend.contact_id` KHÔNG có @relation nên không nằm trong sơ đồ dù có cột FK ngầm/soft reference.

## 6. Phát hiện quan hệ mồ côi / lệch

- **[ĐKC-CODE] Cột FK nhưng không có @relation (quan hệ mồ côi về schema)**: `ClassSession.teacher_id` (schema:394 — có validate ở create service); `BroadcastCampaign.created_by_id` (schema:804); `GoogleSheetSyncConfig.default_cs_id` (schema:1047); `BroadcastRecipient.{student_id, zalo_account_id, zalo_group_id, line_account_id, line_group_id}` (schema:820-824); `GoogleSheetRowState.{student_id, enrollment_id}` (schema:1069-1070); `CareLog.created_by_id` (schema:882, chính schema ghi chú "should be technically mapped" ở :888); `Friend.contact_id` (schema:1206); `Message.replied_by_user_id`/`LineMessage.replied_by_user_id` (schema:1368,1687); `ImportRow.entity_type/entity_id`; `OutboxEvent.aggregate_id`. Không có JOIN/restraint DB cho các cột này.
- **[ĐKC] Bất đối xứng onDelete giữa Zalo và LINE**: `LineFriend`/`LineConversation`/`LineGroupMember`/`LineMessage` khai báo **Cascade**, trong khi phía Zalo (`Friend`, `Conversation`, `ZaloGroupMember`) dùng mặc định **Restrict**. Cùng thao tác "xóa tài khoản/group" cho kết quả khác nhau giữa hai nền tảng — dễ để lại dữ liệu mồ côi hoặc chặn xóa bất ngờ.
- **[ĐKC] FK theo chuỗi UID thay vì id**: `ContactAccess.zalo_uid → Contact.zalo_uid` (schema:1277) — fragile nếu UID đổi; `onUpdate` không khai báo tường minh nên relying vào default Prisma Cascade [CXM].
- **[ĐKC] Enum reuse lệch danh pháp**: `LineContactRelation.relation_status` dùng enum `ZaloContactRelationStatus` (tên phía Zalo) — không lệch dữ liệu nhưng lệch tên.
- **[CXM] String miền mở (không enum)** dễ lệch giá trị so với DB live: `program_type`, `class_model`, `payment_status`, `student_source_status`, `matched_by`, `target_type`, `channel_mode`, `schedule_type`, `permission`, `friendship_status`, `relationship_kind`, `sent_via`, `status`(ZaloAccountStatusLog), `last_status`, `state`(GroupScan), `disconnect_reason`. Cần SELECT DISTINCT live để đối chiếu (chưa chạy vì ràng buộc RAM/qui trình).
- **[ĐKC-CODE] Teacher ↔ User ↔ ZaloAccount**: `Teacher.user_id Int? @unique` cho phép hồ sơ GV không có tài khoản. `ZaloAccount.cs_id` trỏ User, không trỏ Teacher. `ClassTeacher.teacher_id` mang Teacher.id; `ClassSession.teacher_id` là scalar không FK nhưng create service **có** `prisma.user.findUnique` + kiểm role TEACHER (`class-sessions.service.ts:35-40`). Update không kiểm lại (`:56-66`). Reader `classes.scope.ts:47-60` dò cả Teacher.id và User.id. Đây là bất nhất namespace cần test, không phải không validation và không chứng minh sai phân công chỉ từ ID trùng trong snapshot.
