> 📄 Phần của bộ tài liệu spec — xem `../README.md` để biết thứ tự đọc và bối cảnh tổng thể.

### 3.12. ZaloAccount & quan hệ bạn bè

```text
ZaloAccount (
  id,
  cs_id -> User(role=cs),
  zalo_phone,
  encrypted_session_data,
  status[not_logged_in|active|expired|banned|disabled],
  last_login_at?,
  last_active_at?,
  created_at,
  updated_at,
  UNIQUE(cs_id)
)
```

```text
ZaloContactRelation (
  id,
  student_id -> Student,
  zalo_account_id -> ZaloAccount,
  relation_status[friend|stranger|unknown|blocked],
  last_checked_at?,
  created_at,
  updated_at,
  UNIQUE(student_id, zalo_account_id)
)
```

Trạng thái bạn bè phụ thuộc từng ZaloAccount của CS, không phải thuộc tính cố định của Student.

### 3.13. MessageRule

```text
MessageRule (
  id,
  package_id? -> Package,
  enrollment_id? -> Enrollment,
  trigger_session_number,
  delay_minutes,
  require_approval,
  channel[zalo_personal],
  message_content,
  message_variables,
  version,
  active,
  created_by -> User,
  created_at,
  updated_at
)
```

**Rule precedence:**

```text
Enrollment-specific rule
  ↓ nếu không có
Package rule
  ↓ nếu không có
Không gửi
```

### 3.14. MessageDelivery

```text
MessageDelivery (
  id,
  enrollment_id -> Enrollment,
  attendance_id -> Attendance,
  message_rule_id -> MessageRule,
  zalo_account_id -> ZaloAccount,
  scheduled_at,
  sent_at?,
  status[
    scheduled|waiting_approval|queued|sending|sent|failed|cancelled|
    skipped_not_friend|skipped_session_expired|skipped_disabled
  ],
  template_version,
  rendered_content,
  variables_snapshot,
  retry_count,
  provider_message_id?,
  error_message?,
  queue_job_id?,
  created_at,
  updated_at,
  UNIQUE(attendance_id, message_rule_id)
)
```

### 3.15. OutboxEvent

```text
OutboxEvent (
  id,
  event_type,
  aggregate_type,
  aggregate_id,
  payload,
  status[pending|published|failed],
  retry_count,
  published_at?,
  created_at,
  updated_at
)
```

Dùng để tránh mất event/message nếu process chết sau khi ghi Attendance nhưng trước khi enqueue BullMQ.

### 3.16. CareLog & CareTask

Các cột `Nội dung chăm sóc sau buổi 1/3/10/...` của Sheet 1 không tạo thành hàng chục cột DB. Mỗi lần chăm sóc là một record.

```text
CareLog (
  id,
  enrollment_id -> Enrollment,
  cs_id -> User(role=cs),
  after_session_number?,
  outcome?[
    positive|need_support_system|temp_pause|need_curriculum_support|
    need_student_weakness_fix|need_teacher_support|negative_wants_to_stop|no_response
  ],
  content?,
  created_by -> User,
  created_at,
  updated_at
)
```

`CareTask` phục vụ `Lịch hẹn gọi` và `Điểm nóng` trong Sheet 1:

```text
CareTask (
  id,
  enrollment_id -> Enrollment,
  assigned_to -> User,
  type[callback|hot_issue|follow_up],
  title?,
  note?,
  due_at?,
  priority[low|normal|high|urgent],
  status[pending|done|cancelled],
  completed_at?,
  created_at,
  updated_at
)
```

### 3.17. ImportBatch & ImportRow

```text
ImportBatch (
  id,
  uploaded_by -> User,
  file_name,
  import_type[student_enrollment|attendance|teacher_attendance],
  total_rows,
  success_rows,
  failed_rows,
  status[preview|processing|completed|partial_failed|failed|rolled_back],
  created_at,
  completed_at?
)

ImportRow (
  id,
  import_batch_id -> ImportBatch,
  row_number,
  raw_data,
  status[pending|success|failed],
  error_message?,
  entity_type?,
  entity_id?,
  created_at
)
```

### 3.18. AuditLog

```text
AuditLog (
  id,
  user_id -> User,
  action,
  entity_type,
  entity_id,
  before_data?,
  after_data?,
  ip_address?,
  created_at
)
```

Audit các thao tác quan trọng: sửa Attendance, đổi CS, chuyển lớp, đổi GV, thay MessageRule, import/rollback, khóa/mở dữ liệu.

### 3.19. Sơ đồ quan hệ lõi

```text
User
 ├─ TeacherProfile
 ├─ CSGroupMember ── CSGroup ── ManageAssignment
 ├─ ClassTeacher ────────────────┐
 └─ ZaloAccount                  │
        └─ ZaloContactRelation   │
                 │               │
                 ▼               ▼
              Student          Class
                 │               │
                 └─ Enrollment   ├─ ClassSchedule
                        │        └─ ClassSession
                        │               │
                        └─ EnrollmentClass
                                  │     │
                                  └─ Attendance
                                         │
                                         └─ MessageDelivery
                                                ├─ MessageRule
                                                └─ ZaloAccount

Enrollment
 ├─ Package
 ├─ CareLog
 └─ CareTask

Attendance / thay đổi nghiệp vụ
       ↓
OutboxEvent
       ↓
BullMQ
       ↓
MessageDelivery
       ↓
ZaloAccount
```

---

