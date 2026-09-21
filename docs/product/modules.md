> 📄 Phần của bộ tài liệu spec — xem `../README.md` để biết thứ tự đọc và bối cảnh tổng thể.

## 4. Chi tiết từng module

### Module 0 — Đăng nhập + Settings + quản lý user

#### 0.1. Màn hình đăng nhập

- Email + mật khẩu.
- Không hiển thị nút “Đăng ký tài khoản”.
- Nếu account `active = false` → từ chối đăng nhập.
- Ghi `LoginAudit` cho login thành công/thất bại.
- Access token ngắn hạn; refresh token nằm trong cookie `HttpOnly`, quản lý bằng `AuthSession`.

#### 0.2. Settings → User Management (chỉ Admin)

Admin có thể:

- xem danh sách user
- tìm kiếm/filter theo role, trạng thái
- tạo tài khoản mới
- gán một hoặc nhiều role vào `User.roles`
- sửa tên/email/phone
- khóa/mở tài khoản
- reset mật khẩu / cấp mật khẩu tạm thời
- thu hồi toàn bộ phiên đăng nhập của user
- với role `CS`: gán vào `CSGroup`
- với role `MANAGE`: gán nhóm quản lý qua `ManageAssignment`
- với role `TEACHER`: việc gán lớp thực hiện qua `ClassTeacher`

**Không cho Admin sửa/xóa tài khoản theo cách làm mất audit history.** Nếu user nghỉ việc thì ưu tiên `active = false`; dữ liệu cũ vẫn giữ reference tới user đó.

#### 0.3. Authorization middleware

Mỗi API nghiệp vụ phải qua hai lớp:

```text
Authentication
  ↓
JWT/AuthSession hợp lệ + User active
  ↓
Permission check từ `User.roles`
  ↓
Data-scope check
  ↓
Business operation
```

Không chỉ ẩn button ở frontend; backend là nơi quyết định quyền cuối cùng.

---

### Module 1 — Quản lý Học viên & Điểm danh (`learning_system`)

> Hệ thống phân định rõ: `Student` (con người), `Enrollment` (gói/lần học) và `EnrollmentClass` (lớp đã/đang học). Đồng thời, **Sale và nhân viên CSKH là cùng 1 vai trò** (`CS`); cột Sale trong Sheet 1 ánh xạ trực tiếp đến tài khoản đăng nhập của nhân viên.

#### 1.1. Tab Danh sách học viên (`/students`) — Chuẩn Cấu trúc Sheet 1 (`1.Chăm sóc`)

- **Cấu trúc 28 cột dữ liệu:** Hiển thị đầy đủ 28 trường thông tin theo đúng định dạng Sheet 1: *ID (Mã HV), Ngày nộp HP, Sale phụ trách, Trạng thái HV, Họ tên HV, Giới tính, SĐT, Email, Nội dung khoá, Trạng thái TT, Gói học, Trình độ, Tổng buổi, Mô hình lớp, Ghi chú Sale, Ngày sinh, Nghề nghiệp, Số buổi còn lại, Ngày BĐ, Trạng thái học, Ngày KT/Bảo lưu, Giờ học, Lịch học, Thời lượng, GV & Mã GV, Tên lớp, Tổng buổi đã học*.
- **Phân quyền dữ liệu (Data Scope):**
  - **CS (Sale):** Tự động khóa bộ lọc và chỉ hiển thị học viên do tài khoản của mình phụ trách.
  - **Admin / Manage:** Xem toàn bộ học viên và có bộ lọc chọn theo từng Sale.
- **Cảnh báo Nợ buổi âm:** Tự động phát hiện và làm nổi bật các trường hợp số buổi còn lại mang giá trị âm (`< 0`) bằng huy hiệu màu đỏ đậm (`bg-red-100 text-red-800 border-red-300 font-extrabold`), giúp phát hiện học viên học quá số buổi đã thanh toán.
- **Chi tiết hồ sơ học viên:** Modal xem chi tiết trọn vẹn 28 trường dữ liệu.

#### 1.2. Tab Quản lý ghi danh (`/enrollments`) — Ma trận Điểm danh theo Sale

- **Chế độ Ma trận Điểm danh theo Ngày (Matrix View):**
  - Hiển thị theo Thứ & Ngày trong lịch thực tế (bỏ số thứ tự buổi), mặc định hiển thị **Tháng hiện tại**, hỗ trợ chuyển nhanh theo **Tuần / Tháng / Năm**.
  - Tự động lọc danh sách học viên theo cột `Sale` khớp với tài khoản CS đang đăng nhập.
  - 11 cột thông tin học viên & lớp học cố định bên trái; loại bỏ cột *"Chỉ số chuyên cần ĐH % và BT %"*.
  - Điểm danh trực tiếp qua click ô: `X` (Có mặt), `A` (Nghỉ phép), `B` (Bảo lưu), `C` (Nghỉ không phép), `D` (GV nghỉ), `E` (Lỗi kỹ thuật).
- **Chế độ Bảng Ghi danh (Table View):**
  - Cung cấp bảng danh sách hợp đồng/lần đăng ký học với các cột nghiệp vụ, trạng thái học tập và cảnh báo nợ âm.
- **Nút chuyển đổi linh hoạt:** Chuyển đổi giữa 2 chế độ xem chỉ bằng 1 click.

#### 1.3. Quản lý lớp của Enrollment:

- Thêm Enrollment vào một Class bằng cách tạo `EnrollmentClass`.
- Nếu chuyển lớp giữa chừng: đóng record hiện tại (`status = transferred`, `end_date`) rồi tạo record mới `active`.
- Nếu học xong level/lớp và đi tiếp lớp khác trong cùng gói: record cũ `completed`, tạo record tiếp theo với `sequence_no + 1`.
- Nếu mua gói/khóa mới: tạo **Enrollment mới**, không nối vào Enrollment cũ.

**Điểm danh:**

- Với Class `attendance_source = learning_system`: CS có thể tạo/chọn `ClassSession`, sau đó nhập Attendance tay hoặc import Excel.
- Với Class `attendance_source = zoom`: CS chỉ xem read-only; GV nhập ở Module 4.
- Attendance gắn `enrollment_class_id`, đảm bảo điểm danh thuộc đúng lớp/giai đoạn học.
- Một cặp `(enrollment_class_id, class_session_id)` chỉ có một Attendance.

**Import Sheet 1 / dữ liệu học viên:**

1. Upload `.xlsx`.
2. Parse + preview + mapping cột.
3. Upsert `Student` theo rule nhận diện đã chốt.
4. Tạo/update `Enrollment` theo `external_id`/ID nguồn.
5. Parse cột `Tên lớp` thành 1..N `Class` + `EnrollmentClass` nếu đủ dữ liệu; nếu dữ liệu chuỗi không chắc chắn thì đưa vào màn hình review trước khi commit.
6. Map GV/Mã GV vào `TeacherProfile` + `ClassTeacher` theo dữ liệu có thể xác định.
7. Tạo `ImportBatch` + `ImportRow`, log lỗi từng dòng.

**Import Sheet 3 / Attendance & Chấm buổi:**

- **TH1 — Điền trực tiếp trên Web (Ma trận điểm danh theo Ngày):**
  - Giao diện Ma trận điểm danh theo lớp (AttendanceMatrixTable): **Lược bỏ số thứ tự buổi**, chuyển sang **liệt kê trực tiếp theo các ngày theo lịch** (Thứ & Ngày trong tháng, ví dụ: `T2 01/09`, `T3 02/09`...).
  - **Bộ lọc thời gian ma trận:**
    - Mặc định: Hiển thị toàn bộ các ngày của **tháng hiện tại**.
    - Bổ sung bộ lọc chuyển đổi linh hoạt: **Theo tuần** (7 ngày trong tuần), **Theo tháng** (chọn tháng bất kỳ), **Theo năm** (hoặc chọn khoảng ngày tùy chỉnh).
  - Người dùng (CSKH / Giáo viên) có thể tích chọn / click trực tiếp vào ô ngày học của học viên để đổi nhanh trạng thái (`Có mặt X/Đ`, `Nghỉ phép A`, `Bảo lưu B`, `Nghỉ sai QĐ C`, `GV nghỉ D`, `Lỗi kỹ thuật E`).
- **TH2 — Upload file Excel (Sheet 3):**
  - Hệ thống **lọc theo ngày từ file Excel** để đối chiếu và điền điểm danh vào đúng các ngày tương ứng trong hệ thống.
  - Các giá trị `đã học / A / B / C / D / E` được chuyển thành `Attendance.status`.
  - **Quy tắc đối soát học viên:**
    1. Nếu `Họ tên và Lớp` khớp với học viên đã tồn tại trong database (thuộc CS/lớp đó): Hệ thống tự động ghi nhận/cập nhật điểm danh theo ngày mà **không hỏi lại**.
    2. Nếu phát hiện **học viên mới** từ file (chưa có trong database hoặc chưa gắn vào lớp học): Hệ thống bắt buộc hiển thị bước xác nhận (Confirmation step): *"Phát hiện học viên mới từ file: [Tên HV - Mã HV - Lớp]. Bạn có muốn thêm học viên này vào hệ thống và lớp học không?"*. Chỉ khi người dùng bấm xác nhận đồng ý thì mới tạo mới học viên và import điểm danh.
  - Các cột tổng (`Tổng số buổi đã học`, số buổi còn lại, nghỉ A/C/D/E...) hiển thị đối soát và cảnh báo màu đỏ nếu số buổi còn lại là số âm.

---

### Module 2 — Kịch bản nhắn tin Zalo tự động

#### 2.1. Kết nối tài khoản Zalo

- Mỗi CS có một `ZaloAccount` trong MVP.
- UI “Kết nối Zalo” cho phép login theo flow hỗ trợ thực tế của version `zca-js` đã pin/test.
- Session được mã hóa khi lưu.
- Có health check định kỳ; khi session hết hạn đổi status → `expired`.
- Message đang chờ không bị mất; delivery giữ nguyên trong DB và được retry/reschedule theo policy.

> `zca-js` là thư viện không chính thức. Không coi việc rate-limit là bảo đảm tài khoản không bị khóa. Hệ thống phải có cảnh báo và fallback gửi tay.

#### 2.2. Quan hệ bạn bè/contact

- Kiểm tra theo `ZaloContactRelation(student_id, zalo_account_id)`.
- Khi reassign enrollment sang CS khác, relation phải được đánh giá lại cho ZaloAccount mới.
- Mặc định automation không gửi nếu relation không đạt policy an toàn đã chốt.
- Không hard-code các quota người lạ không có nguồn chính thức/ổn định; các giới hạn nền tảng phải coi là có thể thay đổi.

#### 2.3. Setup MessageRule

- Có rule mặc định theo `Package`.
- Có override theo `Enrollment`.
- Trigger MVP: `trigger_session_number`.
- Mỗi rule có `delay_minutes` và `require_approval`.
- Editor hỗ trợ biến:
  - `{{student_name}}`
  - `{{email}}`
  - `{{remaining_sessions}}`
  - `{{teacher_name}}`
  - `{{class_name}}`
  - `{{class_time}}`
- Có preview trước khi lưu.
- Mỗi lần sửa rule tăng `version`.

#### 2.4. Engine gửi tin

Luồng chuẩn:

```text
Attendance được tạo/cập nhật
        ↓
Business rule xác định attendance có trigger không
        ↓
Resolve MessageRule
  Enrollment override > Package rule
        ↓
Tạo MessageDelivery
+ OutboxEvent trong cùng DB transaction
        ↓
Outbox worker publish sang BullMQ
        ↓
Đến scheduled_at
        ↓
Worker kiểm tra điều kiện lần cuối
        ↓
zca-js send
        ↓
Update MessageDelivery
```

**Điều kiện trước khi gửi:**

- Enrollment còn active/đang học theo policy.
- `auto_message_enabled = true`.
- Attendance vẫn hợp lệ và chưa bị hủy/sửa sang status không trigger.
- MessageRule vẫn dùng được cho delivery đã snapshot.
- ZaloAccount active.
- Contact relation đạt policy.
- `MessageDelivery` chưa `sent`.

**Chống gửi trùng:**

- `UNIQUE(attendance_id, message_rule_id)`.
- BullMQ `jobId` dựa trên `message_delivery_id`.
- Worker idempotent: nếu delivery đã `sent/cancelled` thì không gửi lại.

**Nếu attendance bị sửa/hủy trong lúc delay:**

- Update/cancel `MessageDelivery` tương ứng.
- Nếu job đã tồn tại trong BullMQ, remove/cancel nếu có thể; worker vẫn phải check trạng thái DB trước khi send để tránh race condition.

**Retry:**

- Retry có giới hạn.
- Mỗi retry cập nhật `retry_count` + `error_message`.
- Không retry vô hạn lỗi permanent như blocked/not-friend theo policy.

**Rate limit:**

- Rate-limit/throttle theo từng `ZaloAccount`.
- Mục tiêu là tránh burst và kiểm soát tải, không tuyên bố đây là biện pháp bảo đảm tránh khóa tài khoản.

---

### Module 3 — Dashboard thống kê

Query dựa trên `Student`, `Enrollment`, `EnrollmentClass`, `Class`, `Attendance`, `CareLog`, `CareTask`, `MessageDelivery`.

**A. Học viên/enrollment:**

- tổng enrollment
- sắp học / đang học / bảo lưu / kết thúc / hủy
- theo package / lớp hiện tại hoặc lịch sử lớp / GV / CS / CSGroup
- tỷ trọng %

> Nếu cần số **người học duy nhất**, dùng `COUNT(DISTINCT student_id)`. Nếu cần số **lượt đăng ký/khóa đang quản lý**, count Enrollment. Hai chỉ số này phải ghi tên rõ để tránh nhầm.

**B. Tình hình chăm sóc:**

- Pivot `after_session_number` × `CareLog.outcome`.
- Filter theo thời gian, CS, CSGroup, GV, lớp, package.

**C. Automation/Zalo:**

- scheduled
- sent
- failed
- skipped_not_friend
- skipped_session_expired
- tỉ lệ gửi thành công

**D. Export:**

- Excel
- PDF nếu thực sự cần cho báo cáo định kỳ

---

### Module 4 — Upload từ giáo viên cho lớp `zoom`

> Đây là nguồn điểm danh duy nhất cho lớp có `attendance_source = zoom` trong MVP.

Quan trọng: giáo viên phải tạo/ghi nhận được **một buổi học cụ thể**, không chỉ upload số tổng còn lại.

Flow:

1. GV chọn lớp.
2. Tạo/chọn `ClassSession`:
   - session number
   - ngày
   - giờ bắt đầu/kết thúc
3. Nhập tay hoặc upload Excel Attendance cho từng `EnrollmentClass` đang thuộc lớp đó.
4. Preview + validate.
5. Save Attendance với `enrollment_class_id + class_session_id`.
6. Business rule xác định record nào được coi là hoàn thành/tiêu thụ buổi và record nào trigger automation.
7. Tạo MessageDelivery/OutboxEvent nếu đủ điều kiện.
8. Audit ai nhập/sửa và thời điểm sửa.

**Không nên** chỉ nhận bảng tổng kiểu:

```text
Tổng số buổi = 20
Còn lại = 15
A = 1
B = 0
C = 0
```

rồi tự suy ra “vừa hoàn thành buổi 5”, vì không xác định chắc được event nào vừa xảy ra và lúc nào phải trigger message.

Có thể vẫn import các cột tổng hợp để đối soát, nhưng automation phải dựa trên `ClassSession + Attendance` cụ thể.

---

