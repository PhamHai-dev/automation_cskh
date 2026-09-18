> 📄 Phần của bộ tài liệu spec — xem `../README.md` để biết thứ tự đọc và bối cảnh tổng thể.

## 3. Data model V3

### 3.1. User, đăng nhập & phân quyền

**Lưu ý MySQL:** `roles` là cột `JSON`, không phải native array. Ví dụ dữ liệu hợp lệ: `["ADMIN"]`, `["CS"]`, `["MANAGE", "TEACHER"]`. Permission vẫn được map từ từng role ở backend.

```text
User (
  id,
  name,
  email UNIQUE,
  phone?,
  password_hash,
  roles JSON,                            -- vd ["CS"] hoặc ["MANAGE", "TEACHER"]; MySQL không có native enum array
  active,
  last_login_at?,
  created_by -> User?,                 -- Admin tạo account; null cho seed/super-admin đầu tiên
  created_at,
  updated_at
)

AuthSession (
  id,
  user_id -> User,
  refresh_token_hash,                  -- không lưu refresh token plain text
  device_name?,
  ip_address?,
  user_agent?,
  expires_at,
  revoked_at?,
  last_used_at?,
  created_at
)

PasswordResetToken (
  id,
  user_id -> User,
  token_hash,
  expires_at,
  used_at?,
  created_at
)

LoginAudit (
  id,
  user_id -> User?,
  email_attempted,
  status[success|failed|locked|disabled],
  reason?,
  ip_address?,
  user_agent?,
  created_at
)

CSGroup (
  id,
  group_name,
  active,
  created_at
)

CSGroupMember (
  id,
  cs_group_id -> CSGroup,
  user_id -> User,                     -- user phải có role CS
  UNIQUE(cs_group_id, user_id)
)

ManageAssignment (
  id,
  manage_user_id -> User,              -- user phải có role MANAGE
  cs_group_id -> CSGroup,
  UNIQUE(manage_user_id, cs_group_id)
)
```

**Không tạo bảng `UserRole`:** role được lưu trực tiếp tại `User.roles` (JSON array). MVP cũng không cần bảng `Role`/`Permission` động; permission matrix được định nghĩa trong backend và kiểm thử bằng automated tests.

**Login flow:**

```text
POST /auth/login
  ↓
check User.email + password_hash
  ↓
User.active?
  ↓
create AuthSession
  ↓
return access token
+ set refresh token cookie HttpOnly/Secure/SameSite
```

**Refresh/logout:**

```text
POST /auth/refresh
→ verify refresh token + AuthSession chưa revoked/expired
→ rotate refresh token

POST /auth/logout
→ revoke AuthSession hiện tại

Admin disable user / revoke all sessions
→ User.active = false hoặc revoke toàn bộ AuthSession của user
```

**Tạo tài khoản:** không có endpoint signup public. `POST /settings/users` chỉ cho user có role `ADMIN`.

### 3.2. Student — hồ sơ con người

`Student` đại diện cho **một người học duy nhất**, chỉ lưu thông tin cá nhân tương đối ổn định. Không lưu lớp, gói học, CS phụ trách hay số buổi trực tiếp trên Student.

```text
Student (
  id,
  full_name,
  gender?,
  phone?,
  email?,
  date_of_birth?,
  occupation?,
  zalo_uid?,
  note?,
  created_at,
  updated_at
)
```

**Map từ Sheet 1:** Họ tên HV, Giới tính, SĐT, Email, DOB, Nghề nghiệp.

> Một Student có thể có nhiều Enrollment nếu cùng một người mua/học nhiều gói ở các thời điểm khác nhau.

### 3.3. Enrollment — một lần/gói học của Student

`Enrollment` đại diện cho **một lần đăng ký/gói học**. Đây là record nghiệp vụ chính tương ứng gần nhất với **một dòng học viên trong Sheet 1**.

```text
Enrollment (
  id,
  external_id?,                     -- map cột ID của Excel/hệ thống cũ; unique nếu nghiệp vụ xác nhận
  student_id -> Student,
  package_id? -> Package,
  cs_id -> User(role=cs),

  paid_at?,                         -- Ngày nộp học phí
  sale_name?,                       -- Sale; MVP có thể lưu text nếu Sale không dùng web
  student_source_status?,           -- Trạng thái HV, vd HV mới
  course_content?,                  -- Nội dung khoá, vd Thường
  payment_status?,                  -- Full phí/...
  course_teacher_type?,             -- Khoá học: GV Việt Nam / GV Nhật Bản
  level?,                           -- Trình độ: Kaiwa 1/2/3...
  total_sessions,
  class_model?,                     -- Mô hình lớp / Mô hình: 1-1, nhóm...
  sales_note?,

  start_date?,
  end_date?,
  status[not_started|studying|paused|finished|cancelled],
  auto_message_enabled,

  external_remaining_sessions?,     -- số buổi còn lại từ Excel/hệ thống ngoài để đối soát
  external_synced_at?,

  handed_over_at?,                  -- Ngày bàn giao nếu cần hiển thị theo Sheet 1
  account_created_at?,              -- Ngày tạo tài khoản

  created_at,
  updated_at
)
```

**Không có `class_id` trong Enrollment.** Một Enrollment có thể đi qua nhiều lớp trong cùng hành trình học; quan hệ này được lưu ở `EnrollmentClass`.

Ví dụ:

```text
Student: Phan Ngọc Khánh Linh
  ↓
Enrollment E001: gói SKAI11030VN, 90 buổi
  ├─ EnrollmentClass: Kaiwa 1
  ├─ EnrollmentClass: Kaiwa 2
  └─ EnrollmentClass: Kaiwa 3
```

Điều này phù hợp với Sheet 1, nơi một dòng có thể chứa nhiều tên lớp nối tiếp trong cột `Tên lớp`.

### 3.4. Package

```text
Package (
  id,
  code UNIQUE,                      -- vd SKAI11030VN
  name?,
  default_total_sessions?,
  description?,
  active,
  created_at,
  updated_at
)
```

Package đại diện cho **gói học/sản phẩm học tập**. `Enrollment.total_sessions` vẫn là số buổi thực tế của lượt đăng ký đó; không bắt buộc phải bằng `Package.default_total_sessions`.

Package cũng là nơi phù hợp để gắn `MessageRule` mặc định dùng chung cho nhiều Enrollment.

### 3.5. TeacherProfile — thông tin giáo viên

Tài khoản đăng nhập của GV vẫn nằm trong `User` với `roles` chứa `TEACHER`. `TeacherProfile` lưu thông tin nghiệp vụ riêng của giáo viên cần cho Sheet 1/3.

```text
TeacherProfile (
  id,
  user_id -> User,
  teacher_code? UNIQUE,             -- Mã GV, vd GV33
  teacher_type?[vietnamese|japanese|other],
  active,
  created_at,
  updated_at,
  UNIQUE(user_id)
)
```

> Không lưu `teacher_id` trực tiếp trên Student/Enrollment vì giáo viên gắn với lớp và có thể thay đổi theo từng giai đoạn học.

### 3.6. Class & ClassTeacher

```text
Class (
  id,
  class_code?,
  class_name,
  level?,                           -- Kaiwa 1/2/3... nếu xác định được từ dữ liệu lớp
  model_type[one_to_one|group],
  attendance_source[learning_system|zoom],
  active,
  created_at,
  updated_at
)

ClassTeacher (
  id,
  class_id -> Class,
  teacher_id -> User(role=teacher),
  role[main|assistant|substitute],
  start_date?,
  end_date?,
  active,
  created_at,
  updated_at
)
```

`ClassTeacher` giúp lưu lịch sử GV dạy lớp. Nếu đổi GV giữa chừng, đóng record cũ bằng `end_date` rồi tạo record mới thay vì ghi đè.

### 3.7. EnrollmentClass — Enrollment đã/đang học lớp nào

Đây là bảng nối quan trọng giữa `Enrollment` và `Class`.

```text
EnrollmentClass (
  id,
  enrollment_id -> Enrollment,
  class_id -> Class,
  sequence_no,                      -- thứ tự lớp trong hành trình: 1,2,3...
  start_date?,
  end_date?,
  status[planned|active|completed|transferred|cancelled],
  created_at,
  updated_at,
  UNIQUE(enrollment_id, class_id, sequence_no)
)
```

Ý nghĩa:

```text
Student = người học
Enrollment = gói/lần học
EnrollmentClass = gói học đó đã đi qua lớp nào
Class = lớp thực tế
```

Ví dụ một Enrollment 90 buổi đi qua 3 level:

```text
Enrollment E001
  ├─ EnrollmentClass #1 → Kaiwa 1
  ├─ EnrollmentClass #2 → Kaiwa 2
  └─ EnrollmentClass #3 → Kaiwa 3
```

Trường hợp đang học và chuyển lớp giữa chừng cũng dùng cùng cơ chế: record cũ `transferred`, record mới `active`.

### 3.8. ClassSchedule

Sheet 1/3 có `Giờ học (1)/(2)`, `Lịch học (1)/(2)`, `Thời lượng`. Không lưu cố định thành hai bộ cột trong DB; chuẩn hóa thành nhiều schedule record.

```text
ClassSchedule (
  id,
  class_id -> Class,
  schedule_pattern,                 -- vd 246, 357, LKCD...
  start_time?,
  duration_minutes?,
  valid_from?,
  valid_to?,
  active,
  created_at,
  updated_at
)
```

Một Class có thể có 0..N lịch học, nên không bị giới hạn chỉ `(1)` và `(2)` như Excel.

### 3.9. ClassSession & Attendance

`ClassSession` = **một buổi học thực tế của lớp**.

```text
ClassSession (
  id,
  class_id -> Class,
  session_number,
  session_date,
  start_time?,
  end_time?,
  teacher_id? -> User(role=teacher),
  status[scheduled|completed|cancelled],
  created_by -> User,
  created_at,
  updated_at,
  UNIQUE(class_id, session_number)
)
```

`Attendance` = trạng thái của **một EnrollmentClass trong một ClassSession**.

```text
Attendance (
  id,
  enrollment_class_id -> EnrollmentClass,
  class_session_id -> ClassSession,
  status[
    attended|
    absent_approved_A|
    leave_B|
    absent_unapproved_C|
    teacher_absent_D|
    tech_error_E
  ],
  source[manual|excel_import|teacher_upload],
  created_by -> User,
  created_at,
  updated_at,
  UNIQUE(enrollment_class_id, class_session_id)
)
```

**Vì sao Attendance trỏ `EnrollmentClass` thay vì `Enrollment`:** một Enrollment có thể học qua nhiều lớp. Attendance phải biết chính xác buổi đó thuộc lớp nào/giai đoạn nào, đồng thời DB có thể validate `EnrollmentClass.class_id = ClassSession.class_id`.

Sheet 3 hiện đang trải ngày thành hàng trăm cột. Khi đưa vào DB, mỗi ngày/buổi trở thành một `ClassSession`, mỗi ô điểm danh trở thành một `Attendance`.

### 3.10. Business rule cho Attendance

Phải chốt rule trước khi code automation:

| Attendance status | Có trừ buổi? | Tính completed? | Trigger message “hoàn thành buổi N”? |
| --- | --- | --- | --- |
| attended | TBD | TBD | TBD |
| absent_approved_A | TBD | TBD | TBD |
| leave_B | TBD | TBD | TBD |
| absent_unapproved_C | TBD | TBD | TBD |
| teacher_absent_D | TBD | TBD | TBD |
| tech_error_E | TBD | TBD | TBD |

> Đây là business rule của trung tâm, không được tự suy đoán trong code.

### 3.11. Cách tính số buổi đã học/còn lại

Không dùng nhiều source of truth cùng lúc.

```text
total_sessions          ← Enrollment.total_sessions
consumed/completed      ← derive từ Attendance theo business rule
remaining_sessions      ← total_sessions - consumed
```

Các cột Sheet 3 như `Tổng số buổi đã học`, `Tổng số buổi nghỉ A/C/D...` được aggregate từ `Attendance`, không lưu thành nhiều source độc lập.

Nếu Excel/hệ thống ngoài cung cấp “Số buổi còn lại”, lưu riêng để đối soát:

```text
Enrollment.external_remaining_sessions
Enrollment.external_synced_at
```

