# 03 — Từ điển dữ liệu

> Bản đã ẩn dữ liệu tài khoản/cá nhân (che by placeholder) — nguồn gốc xem NUOI-NGUON.md

> Phạm vi: Prisma schema `backend/prisma/schema.prisma` (đọc toàn bộ, 2026-10-24). Nhãn: **[ĐKC]** đã đối chiếu schema; **[SLCC]** suy luận/đối chiếu nơi sử dụng trong mã; **[CXM]** chưa xác minh (đặc biệt DB live hoặc giá trị runtime). FK không khai báo `onDelete` được ghi là mặc định Prisma/DB (chưa xác minh hành vi DB).

## Quy ước cột

- **Kiểu** giữ kiểu Prisma và native annotation (`@db.Date`, `@db.Text`, ...).
- **Null/default** ghi nullable và giá trị mặc định.
- **Unique/index** ghi `@id`, `@unique`, `@@unique`, `@@index`.
- **Enum** ghi enum và ý nghĩa nghiệp vụ theo tên/comment schema; String/Json có miền giá trị comment thì vẫn [CXM] ở DB.
- **FK** ghi `field -> Model.field`; `—` là không có FK.

## 1. Auth & phân quyền

### User — `users` (schema:14–63)

| Trường | Kiểu | Null/default | Unique/index | Enum + ý nghĩa | FK | Nghiệp vụ |
|---|---|---|---|---|---|---|
| id | Int | NO / autoincrement | PK | — | — | — |
| code | String | YES / — | unique | — | — | [SLCC] mã CVHT cũ/hiển thị; `backend/src` cần đối chiếu |
| name | String | YES / — | — | — | — | — |
| email | String | NO / — | unique | — | — | [SLCC] đăng nhập |
| phone | String | YES / — | — | — | — | — |
| staff_code | String | YES / — | unique | — | — | [SLCC] mã nhân sự hợp nhất CVHT |
| password_hash | String | NO / — | — | — | — | [SLCC] xác thực |
| roles | Json | NO / — | — | JSON ví dụ `CS`, `MANAGE`, `TEACHER` | — | [SLCC] phân quyền |
| active | Boolean | NO / true | — | — | — | [SLCC] khóa người dùng |
| last_login_at | DateTime | YES / — | — | — | — | — |
| created_by_id | Int | YES / — | — | — | -> User.id (tự tham chiếu) | [SLCC] audit tạo user |
| created_at | DateTime | NO / now() | — | — | — | — |
| updated_at | DateTime | NO / @updatedAt | — | — | — | — |

### AuthSession — `auth_sessions` (65–80)

| Trường | Kiểu | Null/default | Unique/index | Enum + ý nghĩa | FK |
|---|---|---|---|---|---|
| id | Int | NO / autoincrement | PK | — | — |
| user_id | Int | NO / — | — | — | -> User.id |
| refresh_token_hash | String | NO / — | — | — | — |
| device_name | String | YES / — | — | — | — |
| ip_address | String | YES / — | — | — | — |
| user_agent | String | YES / — | — | — | — |
| expires_at | DateTime | NO / — | — | — | — |
| revoked_at | DateTime | YES / — | — | — | — |
| last_used_at | DateTime | YES / — | — | — | — |
| created_at | DateTime | NO / now() | — | — | — |

### PasswordResetToken — `password_reset_tokens` (82–92)

| Trường | Kiểu | Null/default | Unique/index | Enum + ý nghĩa | FK |
|---|---|---|---|---|---|
| id | Int | NO / autoincrement | PK | — | — |
| user_id | Int | NO / — | — | — | -> User.id |
| token_hash | String | NO / — | — | — | — |
| expires_at | DateTime | NO / — | — | — | — |
| used_at | DateTime | YES / — | — | — | — |
| created_at | DateTime | NO / now() | — | — | — |

### LoginAudit — `login_audits` (102–115)

| Trường | Kiểu | Null/default | Unique/index | Enum + ý nghĩa | FK |
|---|---|---|---|---|---|
| id | Int | NO / autoincrement | PK | — | — |
| user_id | Int | YES / — | — | — | -> User.id |
| email_attempted | String | NO / — | — | — | — |
| status | LoginStatus | NO / — | — | `SUCCESS`, `FAILED`, `LOCKED`, `DISABLED` | — |
| reason | String | YES / — | — | — | — |
| ip_address | String | YES / — | — | — | — |
| user_agent | String | YES / — | — | — | — |
| created_at | DateTime | NO / now() | — | — | — |

### CSGroup — `cs_groups` (117–127)

| Trường | Kiểu | Null/default | Unique/index | Enum + ý nghĩa | FK |
|---|---|---|---|---|---|
| id | Int | NO / autoincrement | PK | — | — |
| group_name | String | NO / — | — | — | — |
| active | Boolean | NO / true | — | — | — |
| created_at | DateTime | NO / now() | — | — | — |

### CSGroupMember — `cs_group_members` (129–138)

| Trường | Kiểu | Null/default | Unique/index | Enum + ý nghĩa | FK |
|---|---|---|---|---|---|
| id | Int | NO / autoincrement | PK | — | — |
| cs_group_id | Int | NO / — | `@@unique(cs_group_id,user_id)` | — | -> CSGroup.id |
| user_id | Int | NO / — | `@@unique(cs_group_id,user_id)` | — | -> User.id |

### ManageAssignment — `manage_assignments` (141–151)

| Trường | Kiểu | Null/default | Unique/index | Enum + ý nghĩa | FK |
|---|---|---|---|---|---|
| id | Int | NO / autoincrement | PK | — | — |
| manage_user_id | Int | NO / — | `@@unique(manage_user_id,cs_group_id)` | — | -> User.id |
| cs_group_id | Int | NO / — | `@@unique(manage_user_id,cs_group_id)` | — | -> CSGroup.id |

## 2. Học viên và đào tạo

### Student — `students` (157–178)

| Trường | Kiểu | Null/default | Unique/index | Enum + ý nghĩa | FK | Nghiệp vụ |
|---|---|---|---|---|---|---|
| id | Int | NO / autoincrement | PK | — | — | — |
| external_id | String | YES / — | unique | — | — | [SLCC] khóa ghép đồng bộ/import |
| full_name | String | NO / — | — | — | — | [SLCC] hồ sơ học viên |
| gender | String | YES / — | — | — | — | — |
| phone | String | YES / — | — | — | — | [SLCC] match liên hệ |
| email | String | YES / — | — | — | — | [SLCC] match/import |
| date_of_birth | DateTime | YES / — | — | — | — | — |
| occupation | String | YES / — | — | — | — | — |
| zalo_uid | String | YES / — | — | — | — | [SLCC] định danh Zalo legacy; không FK |
| line_uid | String | YES / — | — | — | — | [SLCC] định danh LINE legacy; không FK |
| note | String | YES / — | — | — | — | [SLCC] ghi chú CS |
| created_at | DateTime | NO / now() | — | — | — | — |
| updated_at | DateTime | NO / @updatedAt | — | — | — | — |

### Package — `packages` (180–192)

| Trường | Kiểu | Null/default | Unique/index | Enum + ý nghĩa | FK |
|---|---|---|---|---|---|
| id | Int | NO / autoincrement | PK | — | — |
| code | String | NO / — | unique | — | — |
| name | String | YES / — | — | — | — |
| default_total_sessions | Int | YES / — | — | — | — |
| description | String | YES / — | — | — | — |
| active | Boolean | NO / true | — | — | — |
| created_at | DateTime | NO / now() | — | — | — |
| updated_at | DateTime | NO / @updatedAt | — | — | — |

### Enrollment — `enrollments` (205–255)

| Trường | Kiểu | Null/default | Unique/index | Enum + ý nghĩa | FK | Nghiệp vụ |
|---|---|---|---|---|---|---|
| id | Int | NO / autoincrement | PK | — | — | — |
| external_id | String | YES / — | — | — | — | [SLCC] mã hệ thống ngoài |
| external_sync_key | String | YES / — | unique | — | — | [SLCC] idempotency sync |
| program_type | String | NO / KAIWA | index cùng cs_id | `JLPT`/`KAIWA` theo comment [CXM] | — | [SLCC] phân luồng chương trình |
| program_metadata | Json | YES / — | — | — | — |
| student_id | Int | NO / — | — | — | -> Student.id |
| package_id | Int | YES / — | — | — | -> Package.id |
| cs_id | Int | NO / — | index cùng program_type | — | -> User.id |
| paid_at | DateTime | YES / — | — | — | — |
| sale_id | Int | YES / — | — | — | -> Sale.id |
| sale_name | String | YES / — | — | — | — |
| student_source_status | String | YES / — | — | — | — |
| course_content | String | YES / — | — | — | — |
| payment_status | String | YES / — | — | — | — |
| course_teacher_type | String | YES / — | — | — | — |
| level | String | YES / — | — | — | — |
| total_sessions | Int | NO / — | — | — | — |
| class_model | String | YES / — | — | — | — |
| sales_note | String | YES / — | — | — | — |
| study_report_url | String | YES / — | — | — | — |
| exchange_info | String | YES / — | — | — | — |
| callback_note | String | YES / — | — | — | — |
| hot_issue_note | String | YES / — | — | — | — |
| post_course_care | String | YES / — | — | — | — |
| start_date | DateTime | YES / — | — | — | — |
| end_date | DateTime | YES / — | — | — | — |
| status | EnrollmentStatus | NO / NOT_STARTED | — | `WAITING_CLASS`, `STUDYING`, `PAUSED`, `FINISHED`, `UPCOMING`, `NOT_STARTED`, `CANCELLED` | — |
| auto_message_enabled | Boolean | NO / true | — | — | [SLCC] bật/tắt automation |
| attended_previous_years | Int | YES / 0 | — | — | — |
| external_remaining_sessions | Int | YES / — | — | — | — |
| external_synced_at | DateTime | YES / — | — | — | — |
| handed_over_at | DateTime | YES / — | — | — | — |
| account_created_at | DateTime | YES / — | — | — | — |
| created_at | DateTime | NO / now() | — | — | — |
| updated_at | DateTime | NO / @updatedAt | — | — | — |

### Teacher — `teachers` (263–278)

| Trường | Kiểu | Null/default | Unique/index | Enum + ý nghĩa | FK |
|---|---|---|---|---|---|
| id | Int | NO / autoincrement | PK | — | — |
| code | String | NO / — | unique | — | — |
| name | String | NO / — | — | — | — |
| phone | String | YES / — | — | — | — |
| email | String | YES / — | — | — | — |
| teacher_type | TeacherType | YES / OTHER | — | `VIETNAMESE`, `JAPANESE`, `OTHER` | — |
| active | Boolean | NO / true | — | — | — |
| user_id | Int | YES / — | unique | — | -> User.id |
| created_at | DateTime | NO / now() | — | — | — |
| updated_at | DateTime | NO / @updatedAt | — | — | — |

**Phân biệt danh tính [ĐKC]:** `User` là tài khoản đăng nhập/phân quyền; `Teacher` là hồ sơ giáo viên. `Teacher.user_id` nullable + unique nên linkage User–Teacher là **0..1 : 0..1**, không bắt buộc. `ZaloAccount` là tài khoản kết nối của một User/CS (`cs_id` bắt buộc), không phải Teacher và không có FK tới Teacher.

### Class — `classes` (292–309)

| Trường | Kiểu | Null/default | Unique/index | Enum + ý nghĩa | FK |
|---|---|---|---|---|---|
| id | Int | NO / autoincrement | PK | — | — |
| class_code | String | YES / — | — | — | — |
| class_name | String | NO / — | — | — | — |
| level | String | YES / — | — | — | — |
| model_type | ClassModelType | NO / — | — | `ONE_TO_ONE`(1:1), `ONE_TO_TWO`(1:2), `ONE_TO_N`(1:n) | — |
| attendance_source | AttendanceSourceType | NO / — | — | `LEARNING_SYSTEM`, `ZOOM` | — |
| active | Boolean | NO / true | — | — | — |
| created_at | DateTime | NO / now() | — | — | — |
| updated_at | DateTime | NO / @updatedAt | — | — | — |

### ClassTeacher — `class_teachers` (317–331)

| Trường | Kiểu | Null/default | Unique/index | Enum + ý nghĩa | FK |
|---|---|---|---|---|---|
| id | Int | NO / autoincrement | PK | — | — |
| class_id | Int | NO / — | — | — | -> Class.id |
| teacher_id | Int | NO / — | — | — | -> Teacher.id |
| role | ClassTeacherRole | NO / — | — | `MAIN`, `ASSISTANT`, `SUBSTITUTE` | — |
| start_date | DateTime | YES / — | — | — | — |
| end_date | DateTime | YES / — | — | — | — |
| active | Boolean | NO / true | — | — | — |
| created_at | DateTime | NO / now() | — | — | — |
| updated_at | DateTime | NO / @updatedAt | — | — | — |

### EnrollmentClass — `enrollment_classes` (342–359)

| Trường | Kiểu | Null/default | Unique/index | Enum + ý nghĩa | FK |
|---|---|---|---|---|---|
| id | Int | NO / autoincrement | PK | — | — |
| enrollment_id | Int | NO / — | unique cùng class, sequence | — | -> Enrollment.id |
| class_id | Int | NO / — | unique cùng enrollment, sequence | — | -> Class.id |
| sequence_no | Int | NO / — | `@@unique(enrollment_id,class_id,sequence_no)` | thứ tự chuyển lớp | — |
| start_date | DateTime | YES / — | — | — | — |
| end_date | DateTime | YES / — | — | — | — |
| status | EnrollmentClassStatus | NO / PLANNED | — | `PLANNED`, `ACTIVE`, `COMPLETED`, `TRANSFERRED`, `CANCELLED` | — |
| created_at | DateTime | NO / now() | — | — | — |
| updated_at | DateTime | NO / @updatedAt | — | — | — |

### ClassSchedule — `class_schedules` (361–379)

| Trường | Kiểu | Null/default | Unique/index | Enum + ý nghĩa | FK |
|---|---|---|---|---|---|
| id | Int | NO / autoincrement | PK | — | — |
| class_id | Int | NO / — | index active/date | — | -> Class.id |
| schedule_pattern | String | NO / — | — | mẫu lịch; parser runtime [CXM] | — |
| start_time | String | YES / — | — | `HH:mm` comment [CXM] | — |
| duration_minutes | Int | YES / — | — | — | — |
| valid_from | DateTime | YES / — | index | — | — |
| valid_to | DateTime | YES / — | index | — | — |
| active | Boolean | NO / true | index | — | — |
| created_at | DateTime | NO / now() | — | — | — |
| updated_at | DateTime | NO / @updatedAt | — | — | — |

### ClassSession — `class_sessions` (387–409)

| Trường | Kiểu | Null/default | Unique/index | Enum + ý nghĩa | FK |
|---|---|---|---|---|---|
| id | Int | NO / autoincrement | PK | — | — |
| class_id | Int | NO / — | unique class+session_number | — | -> Class.id |
| session_number | Int | NO / — | `@@unique(class_id,session_number)` | — | — |
| session_date | DateTime | NO / — | unique schedule+date, index date/status | — | — |
| start_time | String | YES / — | — | — | — |
| end_time | String | YES / — | — | — | — |
| teacher_id | Int | YES / — | — | teacher id **không khai báo FK** [ĐKC] | — |
| status | ClassSessionStatus | NO / SCHEDULED | index | `SCHEDULED`, `COMPLETED`, `CANCELLED` | — |
| created_by_id | Int | NO / — | — | — | -> User.id |
| created_at | DateTime | NO / now() | — | — | — |
| updated_at | DateTime | NO / @updatedAt | — | — | — |
| class_schedule_id | Int | YES / — | unique schedule+date | — | -> ClassSchedule.id |

## 3. Điểm danh

### Attendance — `attendances` (440–488)

| Trường | Kiểu | Null/default | Unique/index | Enum + ý nghĩa | FK | Nghiệp vụ |
|---|---|---|---|---|---|---|
| id | Int | NO / autoincrement | PK | — | — | — |
| enrollment_class_id | Int | NO / — | unique cùng session | — | -> EnrollmentClass.id |
| class_session_id | Int | NO / — | unique cùng enrollment_class | — | -> ClassSession.id |
| teacher_status | AttendanceStatus | YES / — | — | trạng thái GV | — |
| teacher_raw_value | String | YES / — | — | giá trị gốc GV | — |
| lesson_topic | String | YES / — | — | — | — |
| teacher_note | String | YES / — | — | — | — |
| teacher_submitted_at | DateTime | YES / — | — | — | — |
| teacher_user_id | Int | YES / — | — | — | -> User.id |
| cs_status | AttendanceStatus | YES / — | — | trạng thái CS | — |
| cs_raw_value | String | YES / — | — | — | — |
| cs_note | String | YES / — | — | — | — |
| cs_submitted_at | DateTime | YES / — | — | — | — |
| cs_user_id | Int | YES / — | — | — | -> User.id |
| reconciliation_state | ReconciliationState | NO / PENDING_CS | — | `PENDING_CS`, `PENDING_TEACHER`, `MATCHED`, `CONFLICT`, `RESOLVED` | — |
| status | AttendanceStatus | NO / — | — | `ATTENDED`, `ABSENT_APPROVED_A`, `LEAVE_B`, `ABSENT_UNAPPROVED_C`, `TEACHER_ABSENT_D`, `TECH_ERROR_E` | — |
| resolved_by_id | Int | YES / — | — | — | -> User.id |
| resolved_at | DateTime | YES / — | — | — | — |
| resolution_note | String | YES / — | — | — | — |
| source | AttendanceSource | NO / — | — | `MANUAL`, `EXCEL_IMPORT`, `TEACHER_UPLOAD`, `AUTO_SCHEDULE` | — |
| created_by_id | Int | NO / — | — | — | -> User.id |
| deleted_at | DateTime | YES / — | — | — | — |
| deleted_by_id | Int | YES / — | — | — | -> User.id |
| created_at | DateTime | NO / now() | — | — | — |
| updated_at | DateTime | NO / @updatedAt | — | — | — |

## 4. Automation, chăm sóc, broadcast

### ZaloAccount — `zalo_accounts` (505–549)

| Trường | Kiểu | Null/default | Unique/index | Enum + ý nghĩa | FK |
|---|---|---|---|---|---|
| id | Int | NO / autoincrement | PK | — | — |
| cs_id | Int | NO / — | index | — | -> User.id |
| zalo_uid | String | YES / — | unique | — | — |
| display_name | String | YES / — | — | — | — |
| zalo_phone | String | YES / — | — | — | — |
| status | ZaloAccountStatus | NO / QR_PENDING | index | `QR_PENDING`, `CONNECTING`, `ACTIVE`, `NOT_LOGGED_IN`, `EXPIRED`, `BANNED`, `DISABLED` | — |
| encrypted_session_data | String | YES / — | — | nhạy cảm | — |
| qr_code | String | YES / — | — | tạm thời QR | — |
| last_connected_at | DateTime | YES / — | — | — | — |
| last_login_at | DateTime | YES / — | — | — | — |
| last_active_at | DateTime | YES / — | — | — | — |
| proxy_url | String | YES / — | — | — | — |
| archived_by_id | Int | YES / — | — | — | -> User.id |
| archived_at | DateTime | YES / — | — | — | — |
| disconnect_reason | String | YES / — | — | — | — |
| disconnected_at | DateTime | YES / — | — | — | — |
| qr_pending_at | DateTime | YES / — | — | — | — |
| session_epoch | Int | YES / — | — | — | — |
| last_sync_error | String | YES / — | — | — | — |
| last_sync_at | DateTime | YES / — | — | — | — |
| avatar_url | String | YES / — | — | — | — |
| created_at | DateTime | NO / now() | — | — | — |
| updated_at | DateTime | NO / @updatedAt | — | — | — |

### SdkLimit — `sdk_limits` (555–569)

| Trường | Kiểu | Null/default | Null/default | Unique/index | FK |
|---|---|---|---|---|---|
| id | Int | NO / autoincrement | — | — | — |
| zalo_account_id | Int | YES / global default | `@@unique(zalo_account_id,category)`, index | — | -> ZaloAccount.id |
| category | String | NO / — | — | message/reaction/chat_action [CXM] | — |
| daily_limit | Int | NO / 200 | — | — | — |
| burst_limit | Int | NO / 20 | — | — | — |
| burst_window_ms | Int | NO / 30000 | — | — | — |
| created_at | DateTime | NO / now() | — | — | — |
| updated_at | DateTime | NO / @updatedAt | — | — | — |

### ZaloContactRelation — `zalo_contact_relations` (579–604)

| Trường | Kiểu | Null/default | Unique/index | Enum + ý nghĩa | FK |
|---|---|---|---|---|---|
| id | Int | NO / autoincrement | PK | — | — |
| student_id | Int | NO / — | unique student+account | — | -> Student.id |
| zalo_account_id | Int | NO / — | unique student+account | — | -> ZaloAccount.id |
| relation_status | ZaloContactRelationStatus | NO / UNKNOWN | — | `FRIEND`,`STRANGER`,`UNKNOWN`,`BLOCKED` | — |
| target_type | String | NO / USER | — | USER/GROUP [CXM] | — |
| zalo_group_id | Int | YES / — | index | — | -> ZaloGroup.id (SetNull) |
| matched_by | String | YES / — | — | AUTO_GROUP_NAME/AUTO_PHONE/MANUAL [CXM] | — |
| display_name | String | YES / — | — | — | — |
| avatar_url | String | YES / — | — | — | — |
| friend_zalo_uid | String | YES / — | index | — | — |
| last_checked_at | DateTime | YES / — | — | — | — |
| created_at | DateTime | NO / now() | — | — | — |
| updated_at | DateTime | NO / @updatedAt | — | — | — |


### ZaloGroup — `zalo_groups`

[ĐKC] `backend/prisma/schema.prisma:610`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| zalo_group_id | String | Không | — | unique | — | — | — |
| name | String | Có | — | — | — | — | — |
| avatar_url | String | Có | — | — | — | — | — |
| member_count | Int | Có | — | — | — | — | — |
| owner_zalo_uid | String | Có | — | — | — | — | — |
| zalo_account_id | Int | Không | — | @@index([zalo_account_id]) | — | ZaloAccount.id | — |
| last_synced_at | DateTime | Có | — | — | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |
| updated_at | DateTime | Không | Prisma @updatedAt | — | — | — | — |

### ZaloGroupMember — `zalo_group_members`

[ĐKC] `backend/prisma/schema.prisma:631`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| group_id | Int | Không | — | @@unique([group_id, zalo_uid]); @@index([group_id]) | — | ZaloGroup.id | — |
| zalo_uid | String | Không | — | @@unique([group_id, zalo_uid]) | — | — | — |
| display_name | String | Có | — | — | — | — | — |
| avatar_url | String | Có | — | — | — | — | — |
| joined_at | DateTime | Có | — | — | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |

### AutomationWorkflow — `automation_workflows`

[ĐKC] `backend/prisma/schema.prisma:663`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| name | String | Không | — | — | — | — | — |
| description | String @db.Text | Có | — | — | — | — | — |
| owner_cs_id | Int | Không | — | @@index([owner_cs_id]) | — | User.id | — |
| active | Boolean | Không | true | — | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |
| updated_at | DateTime | Không | Prisma @updatedAt | — | — | — | — |

### AutomationStep — `automation_steps`

[ĐKC] `backend/prisma/schema.prisma:680`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| workflow_id | Int | Không | — | @@unique([workflow_id, session_number, trigger_event]); @@index([workflow_id]) | — | AutomationWorkflow.id / Cascade | — |
| session_number | Int | Không | — | @@unique([workflow_id, session_number, trigger_event]) | — | — | — |
| trigger_event | AutomationTriggerEvent | Không | — | @@unique([workflow_id, session_number, trigger_event]) | ATTENDED ; ABSENT_APPROVED_A ; LEAVE_B ; ABSENT_UNAPPROVED_C ; TEACHER_ABSENT_D ; TECH_ERROR_E | — | — |
| delay_minutes | Int | Không | — | — | — | — | — |
| channel | AutomationChannel | Không | — | — | ZALO_PERSONAL ; ZALO_GROUP ; LINE_PERSONAL ; LINE_GROUP | — | — |
| target_group_id | Int | Có | — | — | — | — | — |
| message_content | String @db.Text | Không | — | — | — | — | — |
| message_variables | Json | Không | — | — | — | — | — |
| active | Boolean | Không | true | — | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |
| updated_at | DateTime | Không | Prisma @updatedAt | — | — | — | — |

### AutomationEnrollment — `automation_enrollments`

[ĐKC] `backend/prisma/schema.prisma:702`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| workflow_id | Int | Không | — | @@unique([workflow_id, enrollment_id]) | — | AutomationWorkflow.id / Cascade | — |
| enrollment_id | Int | Không | — | @@unique([workflow_id, enrollment_id]) | — | Enrollment.id / Cascade | — |
| added_by | Int | Không | — | — | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |

### MessageDelivery — `message_deliveries`

[ĐKC] `backend/prisma/schema.prisma:730`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| enrollment_id | Int | Không | — | — | — | Enrollment.id | — |
| attendance_id | Int | Không | — | @@unique([attendance_id, automation_step_id]) | — | Attendance.id | — |
| automation_step_id | Int | Không | — | @@unique([attendance_id, automation_step_id]) | — | AutomationStep.id | — |
| zalo_account_id | Int | Có | — | — | — | ZaloAccount.id | — |
| zalo_group_id | Int | Có | — | — | — | ZaloGroup.id | — |
| line_account_id | Int | Có | — | @@index([line_account_id]) | — | LineAccount.id | — |
| line_group_id | Int | Có | — | @@index([line_group_id]) | — | LineGroup.id | — |
| scheduled_at | DateTime | Không | — | — | — | — | — |
| sent_at | DateTime | Có | — | — | — | — | — |
| status | MessageDeliveryStatus | Không | SCHEDULED | — | SCHEDULED ; QUEUED ; SENDING ; SENT ; FAILED ; CANCELLED ; SKIPPED_NOT_FRIEND ; SKIPPED_GROUP_INACTIVE ; SKIPPED_ACCOUNT_INACTIVE ; SKIPPED_SESSION_EXPIRED ; SKIPPED_DISABLED | — | — |
| rendered_content | String @db.Text | Không | — | — | — | — | — |
| variables_snapshot | Json | Không | — | — | — | — | — |
| retry_count | Int | Không | 0 | — | — | — | — |
| provider_message_id | String | Có | — | — | — | — | — |
| error_message | String @db.Text | Có | — | — | — | — | — |
| queue_job_id | String | Có | — | — | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |
| updated_at | DateTime | Không | Prisma @updatedAt | — | — | — | — |

### BroadcastCampaign — `broadcast_campaigns`

[ĐKC] `backend/prisma/schema.prisma:787`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| name | String | Không | — | — | — | — | — |
| description | String @db.Text | Có | — | — | — | — | — |
| message_content | String @db.Text | Không | — | — | — | — | — |
| message_metadata | Json | Có | — | — | comment schema [CXM runtime]: { urgency, attachments: [...], links: [...], rawHtmlOrMarkup?: string } | — | — |
| channel_mode | String | Không | "AUTO" | — | comment schema [CXM runtime]: "AUTO"  /  "ZALO_ONLY"  /  "LINE_ONLY"  /  "BOTH" | — | — |
| schedule_type | String | Không | "IMMEDIATE" | — | comment schema [CXM runtime]: "IMMEDIATE"  /  "SCHEDULED" | — | — |
| scheduled_at | DateTime | Có | — | @@index([status, scheduled_at]) | — | — | — |
| started_at | DateTime | Có | — | — | — | — | — |
| completed_at | DateTime | Có | — | — | — | — | — |
| status | BroadcastCampaignStatus | Không | DRAFT | @@index([status, scheduled_at]) | DRAFT ; SCHEDULED ; SENDING ; COMPLETED ; PARTIAL_FAILED ; FAILED ; CANCELLED | — | — |
| total_recipients | Int | Không | 0 | — | — | — | — |
| sent_count | Int | Không | 0 | — | — | — | — |
| failed_count | Int | Không | 0 | — | — | — | — |
| skipped_count | Int | Không | 0 | — | — | — | — |
| queue_job_id | String | Có | — | — | — | — | — |
| created_by_id | Int | Không | — | @@index([created_by_id]) | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |
| updated_at | DateTime | Không | Prisma @updatedAt | — | — | — | — |

### BroadcastRecipient — `broadcast_recipients`

[ĐKC] `backend/prisma/schema.prisma:815`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| campaign_id | Int | Không | — | @@index([campaign_id, status]) | — | BroadcastCampaign.id / Cascade | — |
| target_type | BroadcastTargetType | Không | — | — | STUDENT ; ZALO_GROUP ; LINE_GROUP ; ZALO_USER ; LINE_USER | — | — |
| platform | String | Không | — | — | comment schema [CXM runtime]: "ZALO"  /  "LINE" | — | — |
| student_id | Int | Có | — | @@index([student_id]) | — | — | — |
| zalo_account_id | Int | Có | — | — | — | — | — |
| zalo_group_id | Int | Có | — | — | — | — | — |
| line_account_id | Int | Có | — | — | — | — | — |
| line_group_id | Int | Có | — | — | — | — | — |
| external_target_id | String | Có | — | — | comment schema [CXM runtime]: Zalo UID / Group ID or LINE userId / groupId | — | — |
| target_display_name | String | Có | — | — | — | — | — |
| rendered_content | String @db.Text | Không | — | — | — | — | — |
| rendered_metadata | Json | Có | — | — | comment schema [CXM runtime]: compiled { styles, urgency, attachments, links } for this recipient | — | — |
| status | MessageDeliveryStatus | Không | SCHEDULED | @@index([campaign_id, status]) | SCHEDULED ; QUEUED ; SENDING ; SENT ; FAILED ; CANCELLED ; SKIPPED_NOT_FRIEND ; SKIPPED_GROUP_INACTIVE ; SKIPPED_ACCOUNT_INACTIVE ; SKIPPED_SESSION_EXPIRED ; SKIPPED_DISABLED | — | — |
| sent_at | DateTime | Có | — | — | — | — | — |
| provider_message_id | String | Có | — | — | — | — | — |
| error_message | String @db.Text | Có | — | — | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |
| updated_at | DateTime | Không | Prisma @updatedAt | — | — | — | — |

### OutboxEvent — `outbox_events`

[ĐKC] `backend/prisma/schema.prisma:849`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| event_type | String | Không | — | — | — | — | — |
| aggregate_type | String | Không | — | — | — | — | — |
| aggregate_id | String | Không | — | — | — | — | — |
| payload | Json | Không | — | — | — | — | — |
| status | OutboxEventStatus | Không | PENDING | — | PENDING ; PUBLISHED ; FAILED | — | — |
| retry_count | Int | Không | 0 | — | — | — | — |
| published_at | DateTime | Có | — | — | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |
| updated_at | DateTime | Không | Prisma @updatedAt | — | — | — | — |

### CareLog — `care_logs`

[ĐKC] `backend/prisma/schema.prisma:875`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| enrollment_id | Int | Không | — | — | — | Enrollment.id | — |
| cs_id | Int | Không | — | — | — | User.id | — |
| after_session_number | Int | Có | — | — | — | — | — |
| outcome | CareLogOutcome | Có | — | — | POSITIVE ; NEED_SUPPORT_SYSTEM ; TEMP_PAUSE ; NEED_CURRICULUM_SUPPORT ; NEED_STUDENT_WEAKNESS_FIX ; NEED_TEACHER_SUPPORT ; NEGATIVE_WANTS_TO_STOP ; NO_RESPONSE | — | — |
| content | String @db.Text | Có | — | — | — | — | — |
| created_by_id | Int | Không | — | — | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |
| updated_at | DateTime | Không | Prisma @updatedAt | — | — | — | — |

### CareTask — `care_tasks`

[ĐKC] `backend/prisma/schema.prisma:914`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| enrollment_id | Int | Không | — | — | — | Enrollment.id | — |
| assigned_to_id | Int | Không | — | @@index([status, assigned_to_id]) | — | User.id | — |
| type | CareTaskType | Không | — | — | CALLBACK ; HOT_ISSUE ; FOLLOW_UP ; AUTO_ATTENDANCE ; SCHEDULE_DATA_ISSUE | — | — |
| title | String | Có | — | — | — | — | — |
| note | String @db.Text | Có | — | — | — | — | — |
| due_at | DateTime | Có | — | — | — | — | — |
| priority | CareTaskPriority | Không | NORMAL | — | LOW ; NORMAL ; HIGH ; URGENT | — | — |
| status | CareTaskStatus | Không | PENDING | @@index([status, assigned_to_id]) | PENDING ; DONE ; CANCELLED | — | — |
| completed_at | DateTime | Có | — | — | — | — | — |
| idempotency_key | String | Có | — | unique | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |
| updated_at | DateTime | Không | Prisma @updatedAt | — | — | — | — |

### CareMilestoneConfig — `care_milestone_configs`

[ĐKC] `backend/prisma/schema.prisma:936`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| session_number | Int | Không | — | unique | — | — | — |
| display_order | Int | Không | 0 | — | — | — | — |
| created_by_id | Int | Có | — | — | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |

### AutoAttendanceExecution — `auto_attendance_executions`

[ĐKC] `backend/prisma/schema.prisma:953`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| class_schedule_id | Int | Không | — | @@unique([class_schedule_id, session_date]) | — | ClassSchedule.id | — |
| session_date | DateTime @db.Date | Không | — | @@unique([class_schedule_id, session_date]) | — | — | — |
| scheduled_run_at | DateTime | Không | — | @@index([status, scheduled_run_at]) | — | — | — |
| status | AutoAttendanceExecutionStatus | Không | PROCESSING | @@index([status, scheduled_run_at]) | PROCESSING ; COMPLETED ; FAILED ; SKIPPED | — | — |
| attendance_count | Int | Không | 0 | — | — | — | — |
| error_message | String @db.Text | Có | — | — | — | — | — |
| started_at | DateTime | Không | now() | — | — | — | — |
| completed_at | DateTime | Có | — | — | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |
| updated_at | DateTime | Không | Prisma @updatedAt | — | — | — | — |

### AppSetting — `app_settings`

[ĐKC] `backend/prisma/schema.prisma:973`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| key | String | Không | — | PK | — | — | — |
| value | Json | Không | — | — | — | — | — |
| updated_by_id | Int | Có | — | — | — | User.id | — |
| created_at | DateTime | Không | now() | — | — | — | — |
| updated_at | DateTime | Không | Prisma @updatedAt | — | — | — | — |

### UserPreference — `user_preferences`

[ĐKC] `backend/prisma/schema.prisma:986`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| user_id | Int | Không | — | @@unique([user_id, scope]); @@index([user_id]) | — | User.id / Cascade | — |
| scope | String @db.VarChar(64) | Không | — | @@unique([user_id, scope]) | comment schema [CXM runtime]: e.g. "enrollments.quick" | — | — |
| value | Json | Không | — | — | comment schema [CXM runtime]: { [columnKey: string]: boolean } — only stores deltas from default | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |
| updated_at | DateTime | Không | Prisma @updatedAt | — | — | — | — |

### CsSheetBackupConfig — `cs_sheet_backup_configs`

[ĐKC] `backend/prisma/schema.prisma:1010`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| cs_user_id | Int | Không | — | unique | — | User.id / Cascade | — |
| name | String | Không | — | — | — | — | — |
| target_spreadsheet_url | String @db.Text | Có | — | — | — | — | — |
| target_spreadsheet_id | String | Có | — | — | — | — | — |
| local_backup_path | String | Có | — | — | — | — | — |
| sheet1_name | String | Không | "1.Chăm sóc" | — | — | — | — |
| sheet3_name | String | Không | "3.Chấm buổi" | — | — | — | — |
| schedule_times | Json | Có | — | — | comment schema [CXM runtime]: e.g. ["12:00", "21:00"] | — | — |
| enabled | Boolean | Không | true | — | — | — | — |
| require_private_sheet | Boolean | Không | true | — | — | — | — |
| mask_sensitive_data | Boolean | Không | false | — | — | — | — |
| last_backup_at | DateTime | Có | — | — | — | — | — |
| last_status | String | Có | — | — | comment schema [CXM runtime]: "IDLE"  /  "RUNNING"  /  "SUCCESS"  /  "FAILED" | — | — |
| last_summary | Json | Có | — | — | — | — | — |
| last_error | String @db.Text | Có | — | — | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |
| updated_at | DateTime | Không | Prisma @updatedAt | — | — | — | — |

### GoogleSheetSyncConfig — `google_sheet_sync_configs`

[ĐKC] `backend/prisma/schema.prisma:1035`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| code | String | Không | — | unique | comment schema [CXM runtime]: "JLPT"  /  "KAIWA" | — | — |
| name | String | Không | — | — | — | — | — |
| program_type | String | Không | "KAIWA" | — | comment schema [CXM runtime]: "JLPT"  /  "KAIWA" | — | — |
| spreadsheet_url | String @db.Text | Có | — | — | — | — | — |
| spreadsheet_id | String | Có | — | — | — | — | — |
| local_file_path | String | Có | — | — | — | — | — |
| sheet_name | String | Không | — | — | — | — | — |
| setting_sheet_name | String | Có | — | — | — | — | — |
| header_row | Int | Không | 2 | — | — | — | — |
| cvht_mapping | Json | Có | — | — | comment schema [CXM runtime]: { "CVHT01": 2, "CVHT02": 3, "CVHT03": 4 } | — | — |
| default_cs_id | Int | Có | — | — | — | — | — |
| sync_interval_minutes | Int | Không | 10 | — | — | — | — |
| enabled | Boolean | Không | true | — | — | — | — |
| last_file_hash | String | Có | — | — | — | — | — |
| last_synced_at | DateTime | Có | — | — | — | — | — |
| last_status | String | Có | — | — | comment schema [CXM runtime]: "IDLE"  /  "SYNCING"  /  "SUCCESS"  /  "PARTIAL_FAILED"  /  "FAILED" | — | — |
| last_summary | Json | Có | — | — | — | — | — |
| last_error | String @db.Text | Có | — | — | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |
| updated_at | DateTime | Không | Prisma @updatedAt | — | — | — | — |

### GoogleSheetRowState — `google_sheet_row_states`

[ĐKC] `backend/prisma/schema.prisma:1063`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| config_id | Int | Không | — | @@unique([config_id, sync_key]); @@index([config_id]) | — | GoogleSheetSyncConfig.id / Cascade | — |
| sync_key | String | Không | — | @@unique([config_id, sync_key]) | — | — | — |
| row_number | Int | Không | — | — | — | — | — |
| row_hash | String | Không | — | — | — | — | — |
| student_id | Int | Có | — | — | — | — | — |
| enrollment_id | Int | Có | — | — | — | — | — |
| updated_at | DateTime | Không | Prisma @updatedAt | — | — | — | — |

### ImportBatch — `import_batches`

[ĐKC] `backend/prisma/schema.prisma:1089`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| uploaded_by_id | Int | Không | — | — | — | User.id | — |
| file_name | String | Không | — | — | — | — | — |
| import_type | ImportType | Không | — | — | WORKBOOK ; STUDENT_ENROLLMENT ; ATTENDANCE ; TEACHER_ATTENDANCE ; GOOGLE_SHEET_SYNC ; GOOGLE_SHEET_BACKUP | — | — |
| total_rows | Int | Không | 0 | — | — | — | — |
| success_rows | Int | Không | 0 | — | — | — | — |
| failed_rows | Int | Không | 0 | — | — | — | — |
| status | ImportBatchStatus | Không | PREVIEW | — | PREVIEW ; PROCESSING ; COMPLETED ; PARTIAL_FAILED ; FAILED ; ROLLED_BACK | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |
| completed_at | DateTime | Có | — | — | — | — | — |

### ImportRow — `import_rows`

[ĐKC] `backend/prisma/schema.prisma:1114`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| import_batch_id | Int | Không | — | — | — | ImportBatch.id | — |
| row_number | Int | Không | — | — | — | — | — |
| raw_data | Json | Không | — | — | — | — | — |
| status | ImportRowStatus | Không | PENDING | — | PENDING ; SUCCESS ; FAILED | — | — |
| error_message | String @db.Text | Có | — | — | — | — | — |
| entity_type | String | Có | — | — | — | — | — |
| entity_id | String | Có | — | — | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |

### AuditLog — `audit_logs`

[ĐKC] `backend/prisma/schema.prisma:1130`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| user_id | Int | Không | — | — | — | User.id | — |
| action | String | Không | — | — | — | — | — |
| entity_type | String | Không | — | — | — | — | — |
| entity_id | String | Không | — | — | — | — | — |
| before_data | Json | Có | — | — | — | — | — |
| after_data | Json | Có | — | — | — | — | — |
| ip_address | String | Có | — | — | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |

### Sale — `sales`

[ĐKC] `backend/prisma/schema.prisma:1146`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| code | String | Không | — | unique | — | — | — |
| name | String | Không | — | — | — | — | — |
| phone | String | Có | — | — | — | — | — |
| email | String | Có | — | — | — | — | — |
| active | Boolean | Không | true | — | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |
| updated_at | DateTime | Không | Prisma @updatedAt | — | — | — | — |

### ImportCreateRequest — `import_create_requests`

[ĐKC] `backend/prisma/schema.prisma:1168`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| import_batch_id | Int | Không | — | @@unique([import_batch_id, external_id, package_code], map: "import_create_requests_batch_ext_pkg_key") | — | ImportBatch.id | — |
| requested_by_id | Int | Không | — | @@index([requested_by_id, status]) | — | User.id | — |
| reviewed_by_id | Int | Có | — | — | — | User.id | — |
| assigned_cs_id | Int | Có | — | @@index([assigned_cs_id, status]) | — | User.id | — |
| external_id | String | Không | — | @@unique([import_batch_id, external_id, package_code], map: "import_create_requests_batch_ext_pkg_key"); @@index([external_id, package_code]) | — | — | — |
| package_code | String | Không | — | @@unique([import_batch_id, external_id, package_code], map: "import_create_requests_batch_ext_pkg_key"); @@index([external_id, package_code]) | — | — | — |
| snapshot | Json | Không | — | — | — | — | — |
| baseline | Json | Có | — | — | — | — | — |
| version | Int | Không | 1 | — | — | — | — |
| status | ImportCreateRequestStatus | Không | PENDING | @@index([status, created_at]); @@index([requested_by_id, status]); @@index([assigned_cs_id, status]) | PENDING ; APPROVED ; REJECTED ; CONFLICT | — | — |
| review_reason | String @db.Text | Có | — | — | — | — | — |
| reviewed_at | DateTime | Có | — | — | — | — | — |
| created_at | DateTime | Không | now() | @@index([status, created_at]) | — | — | — |
| updated_at | DateTime | Không | Prisma @updatedAt | — | — | — | — |

### Friend — `friends`

[ĐKC] `backend/prisma/schema.prisma:1202`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| zalo_account_id | Int | Không | — | @@unique([zalo_account_id, zalo_uid_in_nick]); @@index([zalo_account_id]) | — | ZaloAccount.id | — |
| zalo_uid_in_nick | String | Không | — | @@unique([zalo_account_id, zalo_uid_in_nick]) | — | — | — |
| contact_id | Int | Có | — | @@index([contact_id]) | comment schema [CXM runtime]: FK to Contact (unified Zalo identity) | — | — |
| friendship_status | String | Không | "none" | @@index([friendship_status]) | — | — | — |
| relationship_kind | String | Không | "none" | @@index([relationship_kind]) | — | — | — |
| alias_in_nick | String | Có | — | — | — | — | — |
| has_conversation | Boolean | Không | false | — | — | — | — |
| phone_from_sdk | String | Có | — | @@index([phone_from_sdk]) | — | — | — |
| zalo_display_name | String | Có | — | — | — | — | — |
| zalo_avatar_url | String | Có | — | — | — | — | — |
| zalo_global_id | String | Có | — | @@index([zalo_global_id]) | — | — | — |
| zalo_username | String | Có | — | — | — | — | — |
| first_message_at | DateTime | Có | — | — | — | — | — |
| last_inbound_at | DateTime | Có | — | — | — | — | — |
| last_outbound_at | DateTime | Có | — | — | — | — | — |
| total_inbound | Int | Không | 0) @map("total_inbound" | — | — | — | — |
| total_outbound | Int | Không | 0) @map("total_outbound" | — | — | — | — |
| became_friend_at | DateTime | Có | — | — | — | — | — |
| removed_at | DateTime | Có | — | — | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |
| updated_at | DateTime | Không | Prisma @updatedAt | — | — | — | — |

### Contact — `contacts`

[ĐKC] `backend/prisma/schema.prisma:1246`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| zalo_uid | String | Không | — | unique | comment schema [CXM runtime]: primary Zalo UID | — | — |
| student_id | Int | Có | — | @@index([student_id]) | comment schema [CXM runtime]: optional link to a Student | Student.id | — |
| display_name | String | Có | — | — | — | — | — |
| avatar_url | String | Có | — | — | — | — | — |
| phone | String | Có | — | — | — | — | — |
| last_verified | DateTime | Có | — | — | comment schema [CXM runtime]: last time any nick confirmed this contact | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |
| updated_at | DateTime | Không | Prisma @updatedAt | — | — | — | — |

### ContactAccess — `contact_accesses`

[ĐKC] `backend/prisma/schema.prisma:1264`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| zalo_uid | String | Không | — | @@unique([zalo_uid, zalo_account_id]); @@index([zalo_uid]) | comment schema [CXM runtime]: target contact UID | Contact.zalo_uid | — |
| zalo_account_id | Int | Không | — | @@unique([zalo_uid, zalo_account_id]); @@index([zalo_account_id]) | comment schema [CXM runtime]: nick that holds this contact | ZaloAccount.id | — |
| is_friend | Boolean | Không | false | — | — | — | — |
| friendship_status | String | Không | "none" | — | — | — | — |
| alias_in_nick | String | Có | — | — | — | — | — |
| has_conversation | Boolean | Không | false | — | — | — | — |
| last_seen_at | DateTime | Có | — | — | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |
| updated_at | DateTime | Không | Prisma @updatedAt | — | — | — | — |

### ZaloAccountStatusLog — `zalo_account_status_logs`

[ĐKC] `backend/prisma/schema.prisma:1291`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| account_id | Int | Không | — | @@index([account_id]); @@index([account_id, ended_at]) | — | ZaloAccount.id | — |
| status | String | Không | — | — | — | — | — |
| reason | String | Có | — | — | — | — | — |
| started_at | DateTime | Không | — | — | — | — | — |
| ended_at | DateTime | Có | — | @@index([account_id, ended_at]) | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |

### Conversation — `conversations`

[ĐKC] `backend/prisma/schema.prisma:1311`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| zalo_account_id | Int | Không | — | @@unique([zalo_account_id, external_thread_id]); @@index([zalo_account_id]); @@index([zalo_account_id, tab, last_message_at]) | — | ZaloAccount.id | — |
| external_thread_id | String | Không | — | @@unique([zalo_account_id, external_thread_id]) | — | — | — |
| thread_type | String | Không | — | — | comment schema [CXM runtime]: "user"  /  "group" | — | — |
| display_name | String | Có | — | — | — | — | — |
| avatar_url | String | Có | — | — | — | — | — |
| group_name | String | Có | — | — | — | — | — |
| group_avatar_url | String | Có | — | — | — | — | — |
| group_members_count | Int | Có | — | — | — | — | — |
| last_message_at | DateTime | Có | — | @@index([zalo_account_id, tab, last_message_at]) | — | — | — |
| unread_count | Int | Không | 0) @map("unread_count" | — | — | — | — |
| is_replied | Boolean | Không | true) @map("is_replied" | — | — | — | — |
| tab | String | Không | "main" | @@index([zalo_account_id, tab, last_message_at]) | — | — | — |
| deleted_at | DateTime | Có | — | @@index([deleted_at]) | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |
| updated_at | DateTime | Không | Prisma @updatedAt | — | — | — | — |

### Message — `messages`

[ĐKC] `backend/prisma/schema.prisma:1342`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| conversation_id | Int | Không | — | @@unique([conversation_id, zalo_msg_id]); @@index([conversation_id]) | — | Conversation.id | — |
| zalo_msg_id | String | Không | — | @@unique([conversation_id, zalo_msg_id]) | — | — | — |
| zalo_cli_msg_id | String | Có | — | — | comment schema [CXM runtime]: Zalo client msg ID — needed for undo API | — | — |
| sender_uid | String | Không | — | — | — | — | — |
| sender_name | String | Có | — | — | comment schema [CXM runtime]: display name of sender at send time | — | — |
| sender_type | String | Không | "other") @map("sender_type" | @@index([sender_type]) | comment schema [CXM runtime]: "self"  /  "other" | — | — |
| content | String @db.Text | Không | — | — | — | — | — |
| content_type | String | Không | "text" | — | — | — | — |
| attachments | Json | Không | "[]" | — | comment schema [CXM runtime]: [{url, name, mime, size}] | — | — |
| quote | Json | Có | — | — | comment schema [CXM runtime]: reply quote message reference | — | — |
| mentions | Json | Có | — | — | comment schema [CXM runtime]: [{uid, pos, len, type}] group mentions | — | — |
| reactions | Json | Có | — | — | comment schema [CXM runtime]: { "emoji": ["uid1", "uid2"] } — per-emoji reaction map | — | — |
| album_key | String | Có | — | — | — | — | — |
| album_index | Int | Có | — | — | — | — | — |
| album_total | Int | Có | — | — | — | — | — |
| is_self | Boolean | Không | false | — | — | — | — |
| is_backfill | Boolean | Không | false | — | — | — | — |
| is_deleted | Boolean | Không | false) @map("is_deleted" | — | — | — | — |
| deleted_at | DateTime | Có | — | — | — | — | — |
| delivered_at | DateTime | Có | — | — | comment schema [CXM runtime]: Zalo confirm device received | — | — |
| seen_at | DateTime | Có | — | — | comment schema [CXM runtime]: KH opened conversation | — | — |
| sent_via | String | Không | "user") @map("sent_via" | — | comment schema [CXM runtime]: "user"  /  "automation"  /  "system" | — | — |
| replied_by_user_id | Int | Có | — | — | — | — | — |
| raw_content | Json | Có | — | — | — | — | — |
| timestamp | DateTime | Không | — | — | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |

### ZaloAccountAccess — `zalo_account_accesses`

[ĐKC] `backend/prisma/schema.prisma:1385`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| zalo_account_id | Int | Không | — | @@unique([zalo_account_id, user_id]); @@index([zalo_account_id]) | — | ZaloAccount.id | — |
| user_id | Int | Không | — | @@unique([zalo_account_id, user_id]); @@index([user_id]) | — | User.id | — |
| permission | String | Không | "read" | — | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |

### ZaloLabel — `zalo_labels`

[ĐKC] `backend/prisma/schema.prisma:1405`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| zalo_account_id | Int | Không | — | @@unique([zalo_account_id, zalo_label_id]); @@index([zalo_account_id]) | — | ZaloAccount.id | — |
| zalo_label_id | String | Không | — | @@unique([zalo_account_id, zalo_label_id]) | — | — | — |
| text | String | Có | — | — | — | — | — |
| color | String | Có | — | — | — | — | — |
| emoji | String | Có | — | — | — | — | — |
| conversations | Json | Có | — | — | comment schema [CXM runtime]: array of externalThreadId assigned to this label | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |
| updated_at | DateTime | Không | Prisma @updatedAt | — | — | — | — |

### GroupScan — `group_scans`

[ĐKC] `backend/prisma/schema.prisma:1427`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| zalo_account_id | Int | Không | — | @@index([zalo_account_id]) | — | ZaloAccount.id | — |
| scope | String | Không | "selected" | — | comment schema [CXM runtime]: selected / all | — | — |
| group_ids | Json | Không | — | — | comment schema [CXM runtime]: array of Zalo group IDs to scan | — | — |
| state | String | Không | "queued" | @@index([state]) | comment schema [CXM runtime]: queued / running / completed / partial / failed | — | — |
| resume_cursor | String | Có | — | — | comment schema [CXM runtime]: last groupId processed (resume on retry/crash) | — | — |
| scanned_groups | Int | Không | 0 | — | — | — | — |
| total_groups | Int | Không | 0 | — | — | — | — |
| member_count | Int | Không | 0 | — | — | — | — |
| friend_count | Int | Không | 0 | — | — | — | — |
| error | String | Có | — | — | comment schema [CXM runtime]: last error message (truncated 500 chars) | — | — |
| started_at | DateTime | Có | — | — | — | — | — |
| completed_at | DateTime | Có | — | — | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |
| updated_at | DateTime | Không | Prisma @updatedAt | — | — | — | — |

### GroupMember — `group_members`

[ĐKC] `backend/prisma/schema.prisma:1455`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| zalo_account_id | Int | Không | — | @@unique([zalo_account_id, group_id, member_uid]); @@index([zalo_account_id]) | — | ZaloAccount.id | — |
| group_id | String | Không | — | @@unique([zalo_account_id, group_id, member_uid]); @@index([group_id]) | comment schema [CXM runtime]: Zalo external group ID | — | — |
| member_uid | String | Không | — | @@unique([zalo_account_id, group_id, member_uid]) | comment schema [CXM runtime]: Zalo UID of member | — | — |
| display_name | String | Có | — | — | — | — | — |
| zalo_name | String | Có | — | — | — | — | — |
| avatar_url | String | Có | — | — | — | — | — |
| is_admin | Boolean | Không | false | — | — | — | — |
| is_friend | Boolean | Không | false | — | — | — | — |
| friend_checked_at | DateTime | Có | — | — | — | — | — |
| last_seen_at | DateTime | Có | — | — | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |
| updated_at | DateTime | Không | Prisma @updatedAt | — | — | — | — |

### LineAccount — `line_accounts`

[ĐKC] `backend/prisma/schema.prisma:1498`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| cs_id | Int | Không | — | @@index([cs_id]) | — | User.id | — |
| account_type | LineAccountType | Không | PERSONAL | @@index([account_type]) | OA ; PERSONAL | — | — |
| line_mid | String | Có | — | unique | — | — | — |
| basic_id | String | Có | — | — | comment schema [CXM runtime]: e.g., @edura for OA deep-link | — | — |
| display_name | String | Có | — | — | — | — | — |
| line_phone | String | Có | — | — | — | — | — |
| status | LineAccountStatus | Không | QR_PENDING | @@index([status]) | QR_PENDING ; PIN_REQUIRED ; CONNECTING ; ACTIVE ; NOT_LOGGED_IN ; EXPIRED ; BANNED ; DISABLED | — | — |
| encrypted_session_data | String @db.Text | Có | — | — | comment schema [CXM runtime]: AES-256-GCM: { channelId, channelSecret, channelAccessToken } for OA or { authToken, refreshToken, qrCert, e2eeKeychain, device } for PERSONAL | — | — |
| qr_code | String @db.Text | Có | — | — | — | — | — |
| pin_code | String @db.VarChar(16) | Có | — | — | comment schema [CXM runtime]: 6-digit PIN for @evex/linejs E2EE handshake | — | — |
| webhook_secret | String @db.VarChar(128) | Có | — | — | comment schema [CXM runtime]: optional plain/hashed lookup for OA webhook routing | — | — |
| monthly_quota | Int | Có | — | — | comment schema [CXM runtime]: OA monthly push quota | — | — |
| monthly_consumption | Int | Có | — | — | comment schema [CXM runtime]: OA current month push usage | — | — |
| last_connected_at | DateTime | Có | — | — | — | — | — |
| last_login_at | DateTime | Có | — | — | — | — | — |
| last_active_at | DateTime | Có | — | — | — | — | — |
| proxy_url | String | Có | — | — | — | — | — |
| archived_by_id | Int | Có | — | — | — | User.id | — |
| archived_at | DateTime | Có | — | @@index([archived_at]) | — | — | — |
| disconnect_reason | String @db.VarChar(50) | Có | — | — | — | — | — |
| disconnected_at | DateTime | Có | — | — | — | — | — |
| qr_pending_at | DateTime | Có | — | — | — | — | — |
| session_epoch | Int | Có | — | — | — | — | — |
| last_sync_error | String @db.Text | Có | — | — | — | — | — |
| last_sync_at | DateTime | Có | — | — | — | — | — |
| avatar_url | String @db.VarChar(500) | Có | — | — | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |
| updated_at | DateTime | Không | Prisma @updatedAt | — | — | — | — |

### LineContactRelation — `line_contact_relations`

[ĐKC] `backend/prisma/schema.prisma:1544`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| student_id | Int | Không | — | @@unique([student_id, line_account_id]); @@index([student_id]) | — | Student.id | — |
| line_account_id | Int | Không | — | @@unique([student_id, line_account_id]); @@index([line_account_id]) | — | LineAccount.id | — |
| relation_status | ZaloContactRelationStatus | Không | UNKNOWN | — | FRIEND ; STRANGER ; UNKNOWN ; BLOCKED | — | — |
| target_type | String | Không | "USER" | — | comment schema [CXM runtime]: "USER"  /  "GROUP" | — | — |
| line_group_id | Int | Có | — | @@index([line_group_id]) | comment schema [CXM runtime]: FK to LineGroup when linked to a Student Care Group ("01 - 000000000 ..." — số external_id thật trong ví dụ gốc đã che) | LineGroup.id / SetNull | — |
| matched_by | String | Có | — | — | comment schema [CXM runtime]: "AUTO_GROUP_NAME"  /  "AUTO_PHONE"  /  "DEEP_LINK"  /  "MANUAL" | — | — |
| display_name | String | Có | — | — | — | — | — |
| avatar_url | String | Có | — | — | — | — | — |
| friend_line_uid | String | Có | — | @@index([friend_line_uid]) | comment schema [CXM runtime]: Target LINE userId (U...) or groupId (C...) for worker send | — | — |
| link_code | String | Có | — | unique | comment schema [CXM runtime]: Short code (e.g., LK-893412) for 2-tap oaMessage deep-link binding | — | — |
| last_checked_at | DateTime | Có | — | — | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |
| updated_at | DateTime | Không | Prisma @updatedAt | — | — | — | — |

### LineGroup — `line_groups`

[ĐKC] `backend/prisma/schema.prisma:1572`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| line_group_id | String | Không | — | unique | — | — | — |
| name | String | Có | — | — | — | — | — |
| avatar_url | String | Có | — | — | — | — | — |
| member_count | Int | Có | — | — | — | — | — |
| owner_line_uid | String | Có | — | — | — | — | — |
| line_account_id | Int | Không | — | @@index([line_account_id]) | — | LineAccount.id | — |
| last_synced_at | DateTime | Có | — | — | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |
| updated_at | DateTime | Không | Prisma @updatedAt | — | — | — | — |

### LineGroupMember — `line_group_members`

[ĐKC] `backend/prisma/schema.prisma:1593`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| group_id | Int | Không | — | @@unique([group_id, line_uid]); @@index([group_id]) | — | LineGroup.id / Cascade | — |
| line_uid | String | Không | — | @@unique([group_id, line_uid]) | — | — | — |
| display_name | String | Có | — | — | — | — | — |
| avatar_url | String | Có | — | — | — | — | — |
| is_admin | Boolean | Không | false | — | — | — | — |
| joined_at | DateTime | Có | — | — | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |

### LineFriend — `line_friends`

[ĐKC] `backend/prisma/schema.prisma:1610`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| line_account_id | Int | Không | — | @@unique([line_account_id, line_uid_in_nick]); @@index([line_account_id]) | — | LineAccount.id / Cascade | — |
| line_uid_in_nick | String | Không | — | @@unique([line_account_id, line_uid_in_nick]) | — | — | — |
| friendship_status | String | Không | "friend" | — | comment schema [CXM runtime]: friend  /  follower  /  blocked  /  none | — | — |
| relationship_kind | String | Không | "friend" | — | — | — | — |
| alias_in_nick | String | Có | — | — | — | — | — |
| has_conversation | Boolean | Không | false | — | — | — | — |
| phone_from_sdk | String | Có | — | @@index([phone_from_sdk]) | — | — | — |
| line_display_name | String | Có | — | — | — | — | — |
| line_avatar_url | String | Có | — | — | — | — | — |
| status_message | String @db.Text | Có | — | — | — | — | — |
| first_message_at | DateTime | Có | — | — | — | — | — |
| last_inbound_at | DateTime | Có | — | — | — | — | — |
| last_outbound_at | DateTime | Có | — | — | — | — | — |
| total_inbound | Int | Không | 0 | — | — | — | — |
| total_outbound | Int | Không | 0 | — | — | — | — |
| became_friend_at | DateTime | Có | — | — | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |
| updated_at | DateTime | Không | Prisma @updatedAt | — | — | — | — |

### LineConversation — `line_conversations`

[ĐKC] `backend/prisma/schema.prisma:1639`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| line_account_id | Int | Không | — | @@unique([line_account_id, external_thread_id]); @@index([line_account_id]); @@index([line_account_id, tab, last_message_at]) | — | LineAccount.id / Cascade | — |
| external_thread_id | String | Không | — | @@unique([line_account_id, external_thread_id]) | comment schema [CXM runtime]: userId (U...) or groupId (C...) or roomId (R...) | — | — |
| thread_type | String | Không | — | — | comment schema [CXM runtime]: "user"  /  "group" | — | — |
| display_name | String | Có | — | — | — | — | — |
| avatar_url | String | Có | — | — | — | — | — |
| group_name | String | Có | — | — | — | — | — |
| group_avatar_url | String | Có | — | — | — | — | — |
| group_members_count | Int | Có | — | — | — | — | — |
| reply_token | String @db.VarChar(128) | Có | — | — | comment schema [CXM runtime]: Cached latest webhook replyToken for free replies | — | — |
| reply_token_expires_at | DateTime | Có | — | — | — | — | — |
| last_message_at | DateTime | Có | — | @@index([line_account_id, tab, last_message_at]) | — | — | — |
| unread_count | Int | Không | 0 | — | — | — | — |
| is_replied | Boolean | Không | true | — | — | — | — |
| tab | String | Không | "main" | @@index([line_account_id, tab, last_message_at]) | — | — | — |
| deleted_at | DateTime | Có | — | — | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |
| updated_at | DateTime | Không | Prisma @updatedAt | — | — | — | — |

### LineMessage — `line_messages`

[ĐKC] `backend/prisma/schema.prisma:1668`.

| Trường | Kiểu | Null? | Default | Unique/index | Enum + ý nghĩa | FK | Cite đọc/ghi nghiệp vụ |
|---|---|---|---|---|---|---|---|
| id | Int | Không | autoincrement() | PK | — | — | — |
| conversation_id | Int | Không | — | @@unique([conversation_id, line_msg_id]); @@index([conversation_id]) | — | LineConversation.id / Cascade | — |
| line_msg_id | String | Không | — | @@unique([conversation_id, line_msg_id]) | — | — | — |
| quote_token | String @db.VarChar(255) | Có | — | — | — | — | — |
| sender_uid | String | Không | — | — | — | — | — |
| sender_name | String | Có | — | — | — | — | — |
| sender_type | String | Không | "other" | — | comment schema [CXM runtime]: "self"  /  "other" | — | — |
| content | String @db.Text | Không | — | — | — | — | — |
| content_type | String | Không | "text" | — | comment schema [CXM runtime]: text  /  image  /  sticker  /  file  /  flex  /  location | — | — |
| attachments | Json | Không | "[]" | — | — | — | — |
| quote | Json | Có | — | — | — | — | — |
| mentions | Json | Có | — | — | — | — | — |
| reactions | Json | Có | — | — | — | — | — |
| is_self | Boolean | Không | false | — | — | — | — |
| is_deleted | Boolean | Không | false | — | — | — | — |
| delivered_at | DateTime | Có | — | — | — | — | — |
| seen_at | DateTime | Có | — | — | — | — | — |
| sent_via | String | Không | "user" | — | comment schema [CXM runtime]: "user"  /  "automation"  /  "system"  /  "reply_token" | — | — |
| replied_by_user_id | Int | Có | — | — | — | — | — |
| raw_content | Json | Có | — | — | — | — | — |
| timestamp | DateTime | Không | — | — | — | — | — |
| created_at | DateTime | Không | now() | — | — | — | — |


## Cites nghiệp vụ bổ sung [SLCC]

- `User.staff_code`: đọc `backend/src/modules/imports/imports.service.ts:1361-1367`, `sheet-backup.service.ts:134-146`; map CVHT/đặt tên backup.
- `Teacher.user_id`: fallback User→Teacher `backend/src/modules/classes/classes.service.ts:164-166`; CRUD `backend/src/modules/teachers/teachers.repository.ts:56-123`.
- `Attendance.reconciliation_state`: import `backend/src/modules/attendance/attendance-import.service.ts:198-220`; downstream MATCHED/RESOLVED `attendance.service.ts:58-63`.
- `Enrollment.external_sync_key`: ghi `backend/src/modules/imports/sheet-sync.service.ts:918`; đối chiếu `:799`, `:906`.
- `GoogleSheetSyncConfig.cvht_mapping`: tạo/sửa `sheet-sync.service.ts:387-483`; đọc `:754-767`.
- `GoogleSheetRowState`: upsert `sheet-sync.service.ts:1105`; schema khai báo Cascade.
- `CareLog`: import tạo `sheet-sync.service.ts:1079`; schema có `created_by_id` nhưng không có relation FK.
- `MessageDelivery`: tạo `automation-repository.ts:262`; unique attendance+step chống phát trùng.
- `ZaloContactRelation`/`LineContactRelation`: matcher `student-care-group-matcher.service.ts:610-680`; FK group SetNull.


## Phát hiện chất lượng / trường không liên kết [ĐKC]

- **User vs Teacher vs ZaloAccount**: `Teacher.user_id Int? @unique` (schema:271) → liên kết User–Teacher **không bắt buộc**, 0..1:0..1. Teacher có thể tồn tại độc lập; `ZaloAccount.cs_id Int` (schema:507) bắt buộc trỏ User (CS), không trỏ Teacher.
- **ClassSession.teacher_id (schema:394)**: scalar `Int?`, **không khai báo relation/FK** → DB không ràng buộc giá trị. [ĐKC-CODE] **Đính chính (đọc code 24/10)**: bản trước ghi "raw int, zero validation" là **sai**. `classes.service.ts:160-175 (assignTeacher)` là luồng phân công GV cho **LỚP** qua bảng `ClassTeacher` (resolve Teacher.id → Teacher theo `user_id` → User có hồ sơ Teacher), KHÔNG phải writer của field này. Writer là `class-sessions.repository.ts:42,59`, nhưng **create service có kiểm tra danh tính**: `prisma.user.findUnique({where:{id:data.teacher_id}})` rồi yêu cầu `roles` chứa `TEACHER`, sai thì `AppError(400,'Không tìm thấy giáo viên hợp lệ')` (`class-sessions.service.ts:35-40`). Khoảng trống thực: (a) `updateSession` không lặp lại kiểm tra role (`:56-66`); (b) field mang `User.id` trong khi `ClassTeacher.teacher_id` mang `Teacher.id` — `classes.scope.ts:39-52` phải dò cả hai namespace. Số dòng có/không có `teacher_id` trong snapshot **không** chứng minh misassignment; reader chính đã xác định là `classes.scope.ts` (phạm vi lớp của GV).
- **CareLog.created_by_id (schema:882)**: có cột nhưng **không có @relation** — comment schema tự ghi "created_by should be technically mapped" (schema:888). Field ghi nhận nhưng không JOIN được, không FK. [ĐKC]
- **BroadcastRecipient (schema:815-841)**: `student_id`, `zalo_account_id`, `zalo_group_id`, `line_account_id`, `line_group_id` đều nullable và **không có FK** — chỉ có FK tới campaign. Target platform là tham chiếu lỏng (soft reference). [ĐKC]
- **GoogleSheetRowState (schema:1069-1070)**: `student_id`, `enrollment_id` nullable, **không có FK** — tracking trạng thái dòng không ràng buộc toàn vẹn với bản ghi thật. [ĐKC]
- **ImportRow.entity_id/entity_type (schema:1121-1122)** + **OutboxEvent.aggregate_id (schema:853)**: kiểu String polymorphic, **không FK** — tham chiếu phi cấu trúc. [ĐKC]
- **Friend.contact_id (schema:1206)**: có `@map`, có `@@index([contact_id])` nhưng **không khai báo @relation** tới Contact. [ĐKC]
- **ZaloAccountStatusLog (schema:1291-1305)**: comment (schema:1286-1288) nêu invariant "đúng 1 record ended_at=NULL/account" **không có ràng buộc DB** (MySQL bỏ partial unique), chỉ cưỡng chế bằng transaction → dễ lệch nếu code đổi. [ĐKC]
- **Enum schema vs DB live**: snapshot DB không được re-query trong lượt hoàn thiện này; [CXM] cần kiểm tra `Enrollment.program_type`, `class_model`, `payment_status`, `MatchedBy`, `channel_mode`, `schedule_type` (String tự do, không enum) xem có giá trị ngoài dự kiến.
- **Field nullable ít/rõ ràng không ghi**: [CXM] cần grep riêng nếu muốn kết luận "không nơi nào ghi" (chưa xác minh từng field).
