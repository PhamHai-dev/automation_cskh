# 02 — Vai trò, thực thể nghiệp vụ & thuật ngữ

Căn cứ: `prisma/schema.prisma` [ĐKC-CODE], `backend/src/middlewares/auth.middleware.ts` + route guards [ĐKC-CODE], probe API 24/10 [ĐKC-RT].

## 1. PHÂN BIỆT 4 KHÁI NIỆM TRỌNG TÂM (yêu cầu mục 1 của đề bài)

Hệ thống **không** dùng bảng role chuẩn hóa — `User.roles` là cột JSON kiểu mảng chuỗi (vd `["CS"]`, `["MANAGE","TEACHER"]`), so khớp thô trong `requireRoles` (auth.middleware.ts). Bốn loại đối tượng phải tách riêng:

### 1.1 Vai trò người dùng (giá trị trong `User.roles`)
| Mã | Tên UI (ROLE_LABELS, UsersPage.tsx:35-40) | Bản chất nghiệp vụ |
|---|---|---|
| `ADMIN` | Quản trị viên | cấu hình hệ thống, user mgmt, mọi scope |
| `MANAGE` | Quản lý nhóm | CS group leader; được giao `ManageAssignment` (nhóm CS mà họ quản) |
| `CS` | Nhân viên CSKH | người chăm sóc học viên trực tiếp; có `code` CVHTxx |
| `TEACHER` | Giáo viên | người đứng lớp; hồ sơ qua `Teacher` (user_id 1-1 nullable!) |

[ĐKC-CODE] Không có enum vai trò khác trong code; tài khoản hệ thống #7 có `roles: []` và `active=false` → **không phải vai trò** mà là service account.

### 1.2 Hồ sơ / thực thể nghiệp vụ (KHÔNG phải vai trò đăng nhập)
| Thực thể | Ý nghĩa | Liên kết tài khoản |
|---|---|---|
| `Student` | học viên (mã HV = `external_id`) | không có tài khoản login |
| `Teacher` (bảng) | hồ sơ giáo viên (code, teacher_type, active) | `user_id Int? @unique` — 1-1 **tùy chọn**: GV có thể tồn tại không có tài khoản (dùng cho chấm công thủ công/import). [ĐKC-CODE schema model Teacher] |
| `Sale` | nhân viên kinh doanh (code/name) | **không** gắn User — chỉ là danh chiếu từ sheet |
| `CSGroup` + `CSGroupMember` | nhóm CS và thành viên (User.role CS) | n-n qua CSGroupMember |
| `ManageAssignment` | MANAGE ↔ CSGroup | "quản lý nhóm" = phạm vi quản theo nhóm, không phải quyền menu |
| `Package` | gói học (số buổi chuẩn) | — |
| `Class`/`Enrollment`/`EnrollmentClass` | lớp, đăng ký, tình trạng trong lớp | cs_id → User(id) |

### 1.3 Tài khoản kết nối nền tảng (không phải người dùng web)
| Thực thể | Bản chất | Owner |
|---|---|---|
| `ZaloAccount` | nick Zalo cá nhân vận hành CSKH (session AES mã hóa, cookie sid) | `cs_id` → User; bảng `zalo_account_accesses` n-n |
| `LineAccount` | OA (token bot) hoặc PERSONAL (QR+PIN, E2EE Letter Sealing) | `cs_id` → User |
`Friend`, `ZaloContactRelation`, `LineContactRelation` là hồ sơ liên hệ/chính sách link **giữa** học viên và tài khoản nền tảng.

### 1.4 Tài khoản đăng nhập web = bảng `User`
Một `User` có thể: mang nhiều role (JSON array), có `code` (CVHT cho CS), `staff_code` (mirror cho Google-Sheet feature), liên kết 0-1 `Teacher`, 0-n `ZaloAccount`/`LineAccount` (owned), thành viên 0-n `CSGroup`.

## 2. THUẬT NGỮ ĐÃ KIỂM CHỨNG (đối chiếu gọi tên)

| Thuật ngữ | Trong hệ thống | Ghi chú |
|---|---|---|
| "Cố vấn học tập (CVHT)" | `User.code = CVHTxx` (role CS) + prefix tên nhóm chăm sóc | UI UsersPage gọi CS là "Nhân viên CSKH"; CVHT chỉ là **mã số**, không tách thành vai trò riêng [ĐKC-CODE] |
| "Chăm sóc khách hàng" | module `care` (CareTask/CareLog/milestone) + omnichannel | cùng nhóm người dùng CS |
| "Mã học viên" | `Student.external_id @unique` | neo match nhóm + sheet sync |
| "Nhóm chăm sóc" | `ZaloGroup/LineGroup` tên `"<CS#> - <ext_id> …"` | matcher tự sinh link, chưa có cờ xác nhận (N5) |
| "Đối soát điểm danh" | reconciliation CS↔Teacher (`reconciliation_state`) | |
| "Chiến dịch" | `BroadcastCampaign` + recipients | |
| "Nợ buổi" | số buổi đã học > tổng? (seed HV `remaining: -2`) | cách tính: xem 05a attendance/enrollment |
| "Bỏ qua/Ghim/Khóa" (account Zalo) | status DISABLED/archived; circuit breaker | 05b |
| `LKCD` | lịch "làm theo buổi" — manual-only attendance, không auto điểm danh | schedule-pattern.ts |
| JLPT/KAIWA | 2 chương trình (`program_type`) với nguồn sheet riêng | sheet-sync configs |

## 3. DANH MỤC THỰC THỂ PHÁT HIỆN THÊM (đúng yêu cầu mục 1)
Lớp (Class + ClassStatus), Buổi học (ClassSession), Đăng ký học (Enrollment + EnrollmentClass với status), Điểm danh (Attendance + TeacherAttendance/reconciliation), Tự động điểm danh (`ClassSchedule` + `AutoAttendanceExecution`), Phân công giáo viên (`ClassTeacher`; `ClassSession.teacher_id` là field riêng, xem 03/04), Import (ImportBatch/Row/CreateRequest + GoogleSheetSyncConfig/RowState + CsSheetBackupConfig), Care (CareTask/CareLog/CareMilestoneConfig), Automation (Workflow/Step/AutomationEnrollment/MessageDelivery/BroadcastCampaign/Recipient), Kết nối (ZaloAccount/Friend/Contact/Group/GroupMember/Label + LineAccount/Friend/Group/GroupMember/Conversation/Message + 2 ContactRelation), Vận hành (AuthSession/LoginAudit/AuditLog/UserPreference/AppSetting, ZaloAccountStatusLog).

## 4. QUAN HỆ GIỮA TÀI KHOẢN — VAI TRÒ — HỒ SƠ (kết luận theo bằng chứng)

- **CS ↔ Student**: không liên kết trực tiếp; đi qua `Enrollment.cs_id → User.id`. Một HV có thể nhiều enrollment → nhiều CS khác nhau theo thời gian. [ĐKC-CODE]
- **CS ↔ ZaloAccount/LineAccount**: ownership `cs_id` n-1 + bảng truy cập `zalo_account_accesses` (MANAGE cấp). [ĐKC-CODE]
- **TEACHER role ↔ bảng Teacher**: 1-1 optional — GV không có tài khoản vẫn chấm được công qua import; tài khoản có role TEACHER nhưng không có hồ sơ Teacher được hiểu là "giáo viên trên hệ thống chưa có hồ sơ" [SLCC, căn cứ: route teacher-scope dùng user_id join Teacher nullable].
- **MANAGE ↔ CS**: qua `CSGroup` + `ManageAssignment` — MANAGE có toàn scope student list (probe: không khác ADMIN trên `/students`? — **đã probe: ADMIN=2374 vs CS=791; MANAGE chưa probe thiếu tài khoản** [CXM]).
