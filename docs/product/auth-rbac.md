> 📄 Phần của bộ tài liệu spec — xem `../README.md` để biết thứ tự đọc và bối cảnh tổng thể.

## 1. Đăng nhập, vai trò & phân quyền (Auth + RBAC)

### 1.1. Nguyên tắc tài khoản

- Hệ thống **không có public signup/đăng ký tự do**.
- Chỉ **Admin** được tạo tài khoản mới tại `Settings → User Management`.
- Khi tạo user, Admin nhập: họ tên, email, số điện thoại, mật khẩu tạm thời (hoặc hệ thống tự sinh), trạng thái và một hoặc nhiều role.
- User đăng nhập bằng **email + password**.
- Mật khẩu lưu dạng hash; không lưu plain text.
- Admin có thể khóa/mở tài khoản, reset mật khẩu và thu hồi toàn bộ phiên đăng nhập của user.

### 1.2. Role

`User` dùng **một cột `roles` kiểu JSON** trong MySQL, không cần bảng `UserRole`. Một user có thể có nhiều role nếu nghiệp vụ cần.

> Vì MySQL không có kiểu mảng enum native như PostgreSQL, `roles` sẽ lưu JSON array, ví dụ `["CS"]` hoặc `["MANAGE", "TEACHER"]`. Backend phải validate chỉ chấp nhận các giá trị `ADMIN`, `MANAGE`, `CS`, `TEACHER`; không cho ghi role tùy ý.

| Role | Quyền chính |
| --- | --- |
| **ADMIN** | Toàn quyền: Settings, tạo/quản lý user, nhóm CS, phân công enrollment, cấu hình hệ thống, xem thống kê toàn công ty |
| **MANAGE** | Quản lý theo **nhóm CS** được gán: thấy enrollment/thống kê của các CS trong nhóm mình quản lý, phân công lại enrollment giữa CS trong nhóm, xem/chỉnh kịch bản Zalo trong phạm vi nhóm |
| **CS** | Chỉ thấy enrollment được phân công cho mình; điểm danh lớp `learning_system`; cấu hình kịch bản Zalo; ghi log chăm sóc; xem thống kê phần mình phụ trách |
| **TEACHER** | Chỉ thấy lớp/enrollment mình dạy; tạo buổi học, nhập/upload điểm danh cho lớp Zoom; không thấy dữ liệu nội bộ của CS/Zalo ngoài thông tin cần thiết cho lớp học |

Ví dụ:

```text
User A.roles = [CS]
User B.roles = [MANAGE]
User C.roles = [MANAGE, TEACHER]
User D.roles = [ADMIN]
```

### 1.3. Permission matrix

Permission được map từ `User.roles` ở backend. MVP **không cần bảng Permission động**; permission code được định nghĩa trong code để đơn giản và dễ test.

Các permission chính dự kiến:

```text
settings.access
user.view
user.create
user.update
user.disable
user.reset_password
user.revoke_sessions

student.view
enrollment.view
enrollment.create
enrollment.update
enrollment.reassign

class.view
class.manage
attendance.view
attendance.create
attendance.update

message_rule.view
message_rule.manage
zalo_account.manage
care_log.view
care_log.manage

dashboard.view_own
dashboard.view_team
dashboard.view_all
```

Quyền được cấp theo role. Nếu user có nhiều role, permission là **hợp (union)** của các role đó.

### 1.4. Data scope

Có permission **không đồng nghĩa** được xem tất cả dữ liệu. Backend phải kiểm tra thêm data scope:

- `ADMIN`: toàn bộ dữ liệu.
- `MANAGE`: enrollment thuộc các CS trong `CSGroup` mà user được gán qua `ManageAssignment`.
- `CS`: enrollment có `cs_id = currentUser.id`.
- `TEACHER`: EnrollmentClass/Class thuộc lớp user được gán qua `ClassTeacher`.
- User có nhiều role: scope được hợp theo các role hợp lệ cho endpoint; `ADMIN` luôn là full scope.

> Ví dụ: `MANAGE + TEACHER` có thể xem dữ liệu team CS mình quản lý **hoặc** lớp mình dạy, tùy endpoint; không được tự động thấy dữ liệu toàn công ty.

### 1.5. Nhóm CS

Cần có `CSGroup`. Một CS có thể thuộc một hoặc nhiều nhóm; một tài khoản có role `MANAGE` được gán quản lý một hoặc nhiều nhóm cụ thể qua `ManageAssignment`. Admin tạo nhóm và gán Manage trong Settings.

---

