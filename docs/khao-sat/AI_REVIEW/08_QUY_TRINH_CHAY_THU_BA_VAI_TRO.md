# AI_REVIEW — Quy trình chạy thử ba vai trò (GV → CVHT → Admin) trên môi trường kiểm thử

**Ngày lập:** `2026-10-26`  
**Nhánh mã nguồn:** `feature/attendance-workflows-2026-10-25`  
**Tài liệu đối chiếu:** `05_KE_HOACH_TRIEN_KHAI.md`, `06_DAC_TA_LUONG_VAN_HANH_GV_CVHT_ADMIN.md`, `07_PROPOSAL_MILESTONE_OCCURRENCE_MIGRATION.md`  
**Suite kiểm thử API tương ứng:** `backend/src/modules/attendance/__tests__/three-role-ui-flow.acceptance.integration.test.ts`

---

## 1. Mục đích & phạm vi

Tài liệu này hướng dẫn **chủ dự án / người kiểm thử** tự thực hiện một lượt chạy thử end-to-end trên giao diện web cho **ba vai trò vận hành hằng ngày**:
1. **Giáo viên (`TEACHER` — GV):** chủ động tạo 2 ca thực học cùng ngày trên màn hình *Buổi dạy của tôi* (`MyTeachingSessionsPage.tsx`) và ghi nhận điểm danh + nội dung bài học.
2. **Cố vấn học tập (`CS` — CVHT):** kiểm tra hàng đợi đối soát trên màn hình *Đối soát điểm danh* (`AttendanceReconciliationPage.tsx`), xác nhận khớp ca 1 (`MATCHED`) và ghi ý kiến khác ở ca 2 (`CONFLICT`).
3. **Quản trị (`ADMIN` — Admin):** phân xử ca 2 (`RESOLVED`), giữ nguyên lịch sử hai ý kiến + nhật ký kiểm toán (`AuditLog`), sau đó kiểm tra các màn hình đọc số liệu (*Ma trận điểm danh*, *Dashboard*, *Phiếu báo cáo học tập*, *Sheet backup*).

**Phạm vi dữ liệu & môi trường:**
- Chỉ thực hiện bằng **tài khoản fixture thử nghiệm** và **học viên/lớp giả lập** (ví dụ tiền tố `trial_flow_20261026`).
- **Tuyệt đối không dùng tài khoản thật hay học viên thật** để bấm thử luồng tạo ca / phân xử / gửi tin.
- Đây là **quy trình kiểm thử tích hợp/chạy thử trên nhánh `feature/attendance-workflows-2026-10-25`**, **không phải xác nhận hoàn tất trên production**.

---

## 2. Điều kiện môi trường & cảnh báo an toàn gửi tin (QUAN TRỌNG)

### 2.1 Cơ sở dữ liệu được phép dùng
- Chỉ chạy trên **DB test** (`automation_cskh_test` qua `.env.test` khi chạy suite tự động) hoặc **môi trường staging/local tách biệt** đã được chủ dự án duyệt.
- Không trỏ thẳng vào cơ sở dữ liệu vận hành đang có học viên thật nếu chưa bật các chốt chặn gửi tin bên dưới.

### 2.2 Cảnh báo Worker Automation đang chạy sẽ gửi tin thật ra Zalo / LINE
Khi một bản ghi điểm danh chuyển sang trạng thái `FINAL` (`MATCHED` hoặc `RESOLVED`), `runAttendancePostCommit` → `handleAttendanceEvent` sẽ đánh giá mốc K7 (`ATTENDED` cá nhân theo thứ tự `(session_date, created_at, id)`). Nếu hội đủ cả 4 điều kiện:
1. `Enrollment.auto_message_enabled = true`,
2. Học viên đó được gắn vào một `AutomationWorkflow` đang `active = true` có `AutomationStep` khớp `session_number`,
3. Học viên có liên kết `ZaloContactRelation` / `LineContactRelation` (`FRIEND`) hoặc nhóm Zalo/LINE đang `ACTIVE`,
4. Tiến trình BullMQ worker (`automation-worker.ts`) đang chạy và kết nối Redis + phiên Zalo/LINE thật,

thì **hệ thống sẽ xếp hàng và gửi tin nhắn thật ra ngoài**.

**Hướng dẫn phòng ngừa bắt buộc trước khi chủ dự án bấm thử trên UI (chủ dự án tự thao tác, agent không tự bật/tắt dịch vụ):**
- **Cách 1 — Không gắn kênh ngoài / tắt tự động gửi trên enrollment thử nghiệm (khuyến nghị khi chỉ thử điểm danh & đối soát):**
  - Không tạo `ZaloContactRelation` / `LineContactRelation` cho học viên fixture, hoặc đặt `Enrollment.auto_message_enabled = false`.
  - Khi đó, tiến trình K7 (số buổi đã học / cột mốc trên ma trận & dashboard) **vẫn tăng đầy đủ**, còn `MessageDelivery` được bỏ qua an toàn (`SKIPPED_NO_LINK` hoặc không tạo mới).
- **Cách 2 — Kiểm tra sinh `MessageDelivery` nhưng không phát tin ra ngoài:**
  - Dừng tiến trình BullMQ worker (`automation-worker`) theo quy trình vận hành của chủ dự án trước khi chạy thử, **hoặc** dùng môi trường không kết nối tài khoản Zalo/LINE thật.
  - Khi thực hiện import lịch sử bằng file Excel (`POST /api/v1/attendance-reconciliation/import-excel/confirm`), giữ nguyên chính sách mặc định `deliveryPolicy = "NO_SEND"` để chỉ cập nhật tiến trình K7 mà không sinh lệnh gửi tin mới.

---

## 3. Chuẩn bị tài khoản & dữ liệu fixture (không dùng tài khoản thật)

Tạo bộ dữ liệu tách biệt với hậu tố định danh dễ dọn dẹp (ví dụ `trial_flow_20261026`):

| Thành phần | Giá trị gợi ý khi chạy thử | Ghi chú thiết lập |
|---|---|---|
| Tài khoản **Admin** | `admin_trial_flow_20261026@example.com` | Role: `["ADMIN"]` (màn hình *Quản lý người dùng* `/admin/users` → `POST /api/v1/settings/users`) |
| Tài khoản **CVHT (CS)** | `cs_trial_flow_20261026@example.com` | Role: `["CS"]`, `staff_code`: `CS_TRIAL_01` |
| Tài khoản **Giáo viên (GV)** | `teacher_trial_flow_20261026@example.com` | Role: `["TEACHER"]`, liên kết hồ sơ `Teacher` (`code = "GV_TRIAL_01"`, `active = true`) |
| Học viên thử nghiệm | `HV_TRIAL_20261026` — `Học Viên Chạy Thử` | SĐT giả lập `0900000001`, không gắn Zalo/LINE thật |
| Gói học (`Package`) | `PKG_TRIAL_20261026` | `default_total_sessions = 10` |
| **2 Enrollment** của cùng học viên | **Enrollment #1:** `program_type = "KAIWA"`, `total_sessions = 10`, `cs_id = <ID CVHT>`, `status = "STUDYING"`<br>**Enrollment #2:** `program_type = "JLPT"`, `total_sessions = 20`, `cs_id = <ID CVHT>`, `status = "STUDYING"` | Tạo 2 enrollment cho cùng 1 học viên để kiểm chứng luôn tính năng chọn `enrollment_id` tường minh trên trang *Phiếu báo cáo học tập* (D11) |
| Lớp học 1-1 (`Class`) | `CLS_TRIAL_20261026` — `Lớp 1-1 Chạy Thử` | `model_type = "ONE_TO_ONE"`, `attendance_source = "LEARNING_SYSTEM"`, `active = true` |
| Phân công GV (`ClassTeacher`) | Gắn `GV_TRIAL_01` vào `CLS_TRIAL_20261026` | `role = "MAIN"`, `active = true`, `start_date = 2026-09-01`, `end_date = 2026-10-31` (bao phủ ngày học thử `2026-10-20` theo quy tắc D8) |
| Xếp lớp (`EnrollmentClass`) | Gắn **Enrollment #1** vào `CLS_TRIAL_20261026` | `sequence_no = 1`, `status = "ACTIVE"` |

---

## 4. Trình tự thao tác trên UI theo từng vai trò & kết quả kỳ vọng

### Bước 1 — Vai trò Giáo viên (`TEACHER`): Tạo 2 ca thực học cùng ngày và điểm danh

1. **Đăng nhập bằng tài khoản GV** (`teacher_trial_flow_20261026@example.com`) tại `/login` (`POST /api/v1/auth/login`).
2. Mở màn hình **Buổi dạy của tôi** (`MyTeachingSessionsPage.tsx`):
   - Khi mở trang, UI tự động gọi:
     - `GET /api/v1/classes` để nạp danh sách lớp đang phụ trách và học viên trong lớp.
     - `GET /api/v1/attendance-reconciliation/teacher-sessions?startDate=2026-10-01&endDate=2026-10-31` để hiển thị lịch/buổi dạy trong khoảng ngày lọc.
   - **Kết quả kỳ vọng:** Chỉ tài khoản có vai trò `TEACHER` (không phải Admin/Manage đang xem hộ) mới thấy khung **Ghi ca thực học**.
3. **Tạo Ca 1 trong ngày `2026-10-20` (19:00 – 19:30):**
   - Trong khung **Ghi ca thực học**, chọn:
     - Lớp: `Lớp 1-1 Chạy Thử (CLS_TRIAL_20261026)`
     - Học viên: `Học Viên Chạy Thử (HV_TRIAL_20261026)`
     - Ngày học: `2026-10-20`, Giờ bắt đầu: `19:00`, Giờ kết thúc: `19:30`
     - Nội dung bài học (`lessonTopic`): `Bài 1: Hội thoại mở đầu`
     - Ghi chú GV (`note`): `HV phát âm tốt ca 1`
   - Bấm nút **Ghi nhận ca thực học**.
   - **Trình tự API UI thực hiện:**
     1. `POST /api/v1/classes/:classId/sessions/actual` kèm `idempotency_key` duy nhất cho lần bấm, `enrollment_class_id`, `session_date: "2026-10-20"`, `start_time: "19:00"`, `end_time: "19:30"` → trả về `201 Created` (`meta.replayed = false`) cùng bản ghi `ClassSession` mới và `Attendance` skeleton (`reconciliation_state = PENDING_TEACHER`, cả `teacher_status` và `cs_status` đều `null`). *(Nếu mạng chập chờn khiến request gửi lặp cùng `idempotency_key`, server trả `200 OK` với `meta.replayed = true`, không sinh trùng buổi).*
     2. Ngay lập tức nối tiếp `POST /api/v1/attendance-reconciliation/:attendance1Id/teacher-mark` với `{ status: "ATTENDED", lessonTopic: "Bài 1: Hội thoại mở đầu", note: "HV phát âm tốt ca 1", rawValue: "<ecId>-Bài 1: Hội thoại mở đầu" }`.
     3. Tải lại `GET /api/v1/attendance-reconciliation/teacher-sessions`.
4. **Tạo tiếp Ca 2 trong CÙNG ngày `2026-10-20` (20:00 – 20:30):**
   - Giữ cùng lớp và cùng học viên, nhập Ngày học `2026-10-20`, Giờ bắt đầu `20:00`, Giờ kết thúc `20:30`, Nội dung bài học `Bài 2: Luyện phản xạ nâng cao`, Ghi chú GV `HV học tiếp ca 2 cùng ngày`.
   - Bấm **Ghi nhận ca thực học** lần thứ hai (UI sinh `idempotency_key` mới vì đây là chủ đích thêm ca thứ 2).
   - **Kết quả kỳ vọng trên màn hình GV:**
     - Danh sách `teacher-sessions` hiển thị **đủ 2 thẻ buổi học riêng biệt** trong cùng ngày `2026-10-20` (`19:00–19:30` và `20:00–20:30`).
     - Cả hai buổi đều mang trạng thái **Chờ CSKH xác nhận (`PENDING_CS`)**, `teacher_status = ATTENDED`, `cs_status = null` (thiếu một phía ý kiến là pending, **không phải** `CONFLICT`).
     - Số buổi đã tiêu thụ (`consumed`) và mốc chăm K7 lúc này **vẫn bằng `0`** vì chưa có buổi nào đạt `FINAL`.

---

### Bước 2 — Vai trò Cố vấn học tập (`CS` — CVHT): Xác nhận Ca 1 (`MATCHED`) và ghi ý kiến khác ở Ca 2 (`CONFLICT`)

1. **Đăng nhập bằng tài khoản CVHT** (`cs_trial_flow_20261026@example.com`).
2. Mở màn hình **Đối soát điểm danh** (`AttendanceReconciliationPage.tsx`):
   - Khi mở trang (hoặc bấm Làm mới), hàm `refreshAll()` gọi song song 4 API:
     - `GET /api/v1/attendance-reconciliation/stats`
     - `GET /api/v1/attendance-reconciliation/conflicts?page=1&pageSize=20`
     - `GET /api/v1/attendance-reconciliation/pending?page=1&pageSize=20`
     - `GET /api/v1/attendance-reconciliation/history?page=1&pageSize=20`
   - **Kết quả kỳ vọng:** Thẻ KPI `pendingCsCount` tăng thêm 2; tab **Chờ đối soát (`Pending`)** hiển thị cả Ca 1 và Ca 2 của `Học Viên Chạy Thử`.
3. **Xác nhận Ca 1 khớp với GV (`MATCHED`):**
   - Tại dòng Ca 1 (`19:00–19:30`), bấm **Ghi nhận khác** (mở modal ghi ý kiến CSKH) hoặc chọn trạng thái `ATTENDED` kèm ghi chú `CVHT xác nhận HV có học ca 1` → gửi `POST /api/v1/attendance-reconciliation/:attendance1Id/cs-mark` với `{ status: "ATTENDED", note: "CVHT xác nhận HV có học ca 1" }` *(hoặc bấm **Duyệt theo GV** gọi `POST /api/v1/attendance-reconciliation/bulk-approve` với `{ attendanceIds: [attendance1Id] }`)*.
   - **Kết quả kỳ vọng sau Ca 1:**
     - Bản ghi Ca 1 chuyển sang `reconciliation_state = MATCHED` (`FINAL`), `status = ATTENDED`.
     - Quyền học đã tiêu thụ (`consumed`) tăng từ `0` lên `1`; số buổi còn lại (`remaining`) = `10 - 1 = 9`.
     - Tiến trình mốc chăm K7 đạt **ordinal `1`** (gắn với `attendance1Id`).
4. **Ghi ý kiến khác ở Ca 2 (`CONFLICT`):**
   - Tại dòng Ca 2 (`20:00–20:30`), bấm nút **Ghi nhận khác** → chọn trạng thái `ABSENT_UNAPPROVED_C` (Nghỉ không phép - C), nhập ghi chú `Ghi chú CVHT (giả lập bằng chứng điểm danh): Kiểm tra log phòng học Zoom ca 2 (20:00–20:30) không thấy học viên vào phòng và không có đơn xin nghỉ trước giờ học -> ghi nhận ABSENT_UNAPPROVED_C` → xác nhận.
   - *Lưu ý nghiệp vụ (A.1 mục 7): không dùng lý do "chưa phản hồi tin nhắn chăm sóc" để suy ra học viên vắng mặt; ý kiến điểm danh của CVHT phải dựa trên bằng chứng tham gia buổi học.*
   - UI gọi `POST /api/v1/attendance-reconciliation/:attendance2Id/cs-mark` với `{ status: "ABSENT_UNAPPROVED_C", note: "Ghi chú CVHT (giả lập bằng chứng điểm danh): Kiểm tra log phòng học Zoom ca 2 (20:00–20:30) không thấy học viên vào phòng và không có đơn xin nghỉ trước giờ học -> ghi nhận ABSENT_UNAPPROVED_C" }`.
   - **Kết quả kỳ vọng sau Ca 2:**
     - Bản ghi Ca 2 chuyển sang `reconciliation_state = CONFLICT` (provisional), giữ nguyên `teacher_status = ATTENDED` và `cs_status = ABSENT_UNAPPROVED_C`.
     - Dòng Ca 2 chuyển sang tab **Xung đột (`Conflicts`)** và `conflictCount` trên thẻ KPI tăng lên `1`.
     - **Kiểm tra phân quyền trên tab Xung đột khi đang đăng nhập bằng CVHT (hoặc `MANAGE`):**
       - Vì `isAdmin === false`, cột thao tác trên tab Xung đột **chỉ hiển thị nút `"Ghi ý kiến CS"`**, **KHÔNG hiển thị nút `"Phân xử"`**.
       - Nếu cố gọi trực tiếp API `POST /api/v1/attendance-reconciliation/:attendance2Id/resolve-conflict` bằng token `CS` hoặc `MANAGE`, backend trả về **`403 Forbidden`** (`Chỉ ADMIN được phân xử xung đột điểm danh` — quyết định D2).
     - Khi Ca 2 đang ở `CONFLICT`, số buổi tiêu thụ (`consumed`) vẫn đứng ở **`1`** và mốc K7 vẫn đứng ở **ordinal `1`** (bản ghi `CONFLICT` chưa được tính vào số chính thức).

---

### Bước 3 — Vai trò Quản trị (`ADMIN`): Phân xử Ca 2 (`RESOLVED`) và kiểm tra nhật ký

1. **Đăng nhập bằng tài khoản Admin** (`admin_trial_flow_20261026@example.com`).
2. Mở màn hình **Đối soát điểm danh** (`AttendanceReconciliationPage.tsx`) → tab **Xung đột (`Conflicts`)**:
   - **Kết quả kỳ vọng:** Vì `isAdmin === true`, tại dòng Ca 2 xuất hiện nút **`"Phân xử"`**.
3. **Thực hiện phân xử Ca 2:**
   - Bấm nút **`"Phân xử"`** trên dòng Ca 2 → mở modal phân xử.
   - Kiểm tra modal hiển thị rõ ý kiến GV (`ATTENDED` — `HV học tiếp ca 2 cùng ngày`) và ý kiến CVHT (`ABSENT_UNAPPROVED_C` — `Ghi chú CVHT (giả lập bằng chứng điểm danh): Kiểm tra log phòng học Zoom ca 2 (20:00–20:30) không thấy học viên vào phòng và không có đơn xin nghỉ trước giờ học -> ghi nhận ABSENT_UNAPPROVED_C`).
   - Chọn kết quả cuối cùng (`finalStatus`):
     - **Kịch bản chuẩn (để kiểm chứng đếm đủ 2 ca `ATTENDED` cùng ngày & K7 tăng `1 → 2`):** chọn `ATTENDED`, nhập lý do giải trình bắt buộc (`resolutionNote`): `Admin đối chiếu log lớp học: HV có học đủ ca 2 cùng ngày` → bấm xác nhận.
     - *(Ghi chú: nếu muốn kiểm tra thêm sự tách biệt giữa K5 `consumed` và K7 mốc chăm sóc, có thể thử trên một buổi thứ 3 phân xử thành `ABSENT_UNAPPROVED_C` — khi đó `consumed` tăng thêm 1 nhưng mốc chăm K7 không tăng).*
   - **Trình tự API UI thực hiện:**
     - `POST /api/v1/attendance-reconciliation/:attendance2Id/resolve-conflict` với `{ finalStatus: "ATTENDED", resolutionNote: "Admin đối chiếu log lớp học: HV có học đủ ca 2 cùng ngày" }`.
     - Sau đó gọi lại `refreshAll()`.
   - **Kết quả kỳ vọng ngay sau khi phân xử:**
     - Bản ghi Ca 2 chuyển sang `reconciliation_state = RESOLVED` (`FINAL`), `status = ATTENDED`.
     - **Cả hai ý kiến gốc được giữ nguyên không bị ghi đè:** `teacher_status = ATTENDED`, `cs_status = ABSENT_UNAPPROVED_C`, `teacher_note` và `cs_note` giữ nguyên; bổ sung `resolved_by_id = <ID Admin>`, `resolved_at`, `resolution_note`.
     - Tab **Lịch sử đối soát (`History`)** (`GET /api/v1/attendance-reconciliation/history`) xuất hiện bản ghi hành động `ATTENDANCE_CONFLICT_RESOLVED` với người thực hiện là Admin và nội dung `resolutionNote`.
     - Nếu enrollment có gắn workflow automation (ở chế độ mock hoặc tạm dừng worker), mỗi mốc `(enrollment_id, automation_step_id)` tại `session_number = 1` và `session_number = 2` chỉ sinh **đúng 1 bản ghi `MessageDelivery`** (S1a/S2c: mốc 1 gắn `attendance1Id`, mốc 2 gắn `attendance2Id`; khi chạy dưới chính sách `NO_SEND` thì tạo `0` delivery mới).
4. **Bước 3b (Kiểm tra bổ sung 2 cổng phân quyền & D8 vừa khép kín ngày `2026-10-26`):**
   - **Cổng 1 — Điểm danh hộ GV (`assist-mark` — `POST /api/v1/attendance-reconciliation/:id/teacher-mark` kèm `teacherId`) khóa chỉ `ADMIN`:**
     - Thử gọi `POST /api/v1/attendance-reconciliation/:id/teacher-mark` có truyền `teacherId` bằng tài khoản `MANAGE` → kỳ vọng nhận **`403 Forbidden`** (quyền đánh hộ GV chỉ dành cho `ADMIN`; tài khoản `MANAGE` vẫn tiếp tục thực hiện bình thường nghĩa vụ CVHT `POST /:id/cs-mark` và `bulk-approve` trong các nhóm được phân công).
     - Khi gọi bằng tài khoản `ADMIN`, hệ thống kiểm tra đồng thời quyền `ADMIN` của người thao tác và cửa sổ hiệu lực `[start_date, end_date]` của `teacherId` tại `session_date` theo D8.
   - **Cổng 2 — Kết thúc phân công GV có `end_date` tường minh (hiện ở tầng API) & kiểm tra D8 khi Điểm danh / Import Excel:**
     - **Lưu ý phạm vi hiện tại:** thao tác Admin **"Kết thúc phân công"** (`PATCH /api/v1/classes/:id/teachers/:assignmentId/end`) hiện **mới có ở tầng API** (đã có validation `422` bắt buộc `end_date` tường minh, cập nhật tại chỗ `active = false` và ghi `AuditLog`), **chưa có nút/form tương ứng trên giao diện web (UI)**. Khi chạy thử trên môi trường test, bước kết thúc phân công được thực hiện qua lời gọi API (hoặc fixture), còn việc kiểm tra hiệu lực D8 sau khi kết thúc phân công được nghiệm thu trên cả UI điểm danh và UI/API import Excel.
     - Admin gọi API kết thúc phân công GV `PATCH /api/v1/classes/:id/teachers/:assignmentId/end` với `{ end_date: "2026-10-31" }` (nếu bỏ trống `end_date` hoặc `end_date < start_date`, API từ chối `422 Unprocessable Entity`, tuyệt đối không tự lấy ngày chạy lệnh) → hệ thống cập nhật `active = false`, lưu `end_date` tường minh và ghi `AuditLog`.
     - Sau khi phân công đã kết thúc (`active = false`, `end_date = 2026-10-31`), thử đánh hộ trên UI/API hoặc **import Excel điểm danh** (`attendance-import.service.ts` — `POST /api/v1/attendance-reconciliation/import-excel/confirm`): buổi học có `session_date` nằm trong `[start_date, end_date]` (`2026-10-20`) được chấp nhận hợp lệ; buổi học có `session_date` nằm ngoài cửa sổ (`2026-11-05`) hoặc phân công `active = false` thiếu `end_date` bị chặn theo quy tắc D8.

---

## 5. Đọc lại số liệu trên các màn hình & lưu ý chỗ còn ưu tiên dữ liệu ngoài

Sau khi cả Ca 1 (`MATCHED`) và Ca 2 (`RESOLVED`) trong cùng ngày `2026-10-20` đã đạt trạng thái `FINAL`, kiểm tra lần lượt các bề mặt đọc dữ liệu:

### 5.1 Ma trận điểm danh (`AttendanceMatrix.tsx` trên `AttendanceSheetPage` và `EnrollmentsPage`)
- **API nguồn:**
  - Từ trang lớp (`AttendanceSheetPage.tsx`): `GET /api/v1/classes/:classId`, `GET /api/v1/classes/:classId/sessions`, và `GET /api/v1/classes/:classId/sessions/:sessionId/attendance`.
  - Từ trang ghi danh (`EnrollmentsPage.tsx`): `GET /api/v1/enrollments`.
- **Kết quả kỳ vọng:**
  - Hiển thị **đủ 2 cột/bản ghi buổi học trong cùng ngày `2026-10-20`** (không bị gộp mất 1 ca như cơ chế `processedDates` cũ trên nhánh `main`).
  - Bộ đếm chuẩn (`calculateEnrollmentEntitlement` trong `enrollment-entitlement.ts`):
    - `totalSessions = 10`
    - `consumedSessions = 2` (mỗi bản ghi `FINAL` thuộc `{ATTENDED, ABSENT_UNAPPROVED_C}` tính đúng 1 buổi theo D7)
    - `remainingSessions = total_sessions − consumed = 10 − 2 = 8` (**không clamp** về 0 nếu âm — giá trị âm là tín hiệu vận hành "nợ buổi" theo Q-012; **không cộng gộp** `attended_previous_years` hay `external_remaining_sessions`).

### 5.2 Dashboard (`DashboardPage.tsx`)
- **API nguồn:**
  - `GET /api/v1/dashboard/attendance?class_id=:classId`
  - `GET /api/v1/dashboard/attendance-tab?date_from=2026-10-01&date_to=2026-10-31`
  - `GET /api/v1/dashboard/overview?date_from=2026-10-01&date_to=2026-10-31`
  - `GET /api/v1/dashboard/care?date_from=2026-10-01&date_to=2026-10-31`
- **Kết quả kỳ vọng:**
  - `total_attendances` của lớp thử nghiệm tăng đúng **2** (`breakdown.ATTENDED = 2`).
  - Tiến trình mốc chăm sóc cá nhân (K7) đếm đúng **2 buổi `ATTENDED` đã `FINAL`** theo thứ tự `(session_date, created_at, id)`.

### 5.3 Phiếu báo cáo học tập (`StudentStudyReportPage.tsx` — quyết định D11)
- **API nguồn:** `GET /api/v1/students/:studentId` và `PATCH /api/v1/students/:studentId`.
- **Thao tác & kết quả kỳ vọng:**
  - Mở trang `/students/:studentId/study-report`. Vì học viên có **2 enrollment** (`KAIWA` và `JLPT`), UI hiển thị bộ chọn `enrollment_id` tường minh (không tự ghi đè vào enrollment đầu tiên hay enrollment có ID lớn nhất).
  - Chọn **Enrollment #1 (`KAIWA`)**, nhập nhận xét giai đoạn `sessions_1_10` và bấm Lưu (`PATCH /api/v1/students/:studentId` kèm `enrollment_id`).
  - Tải lại trang: dữ liệu `program_metadata.study_report` chỉ được lưu vào **Enrollment #1**, còn **Enrollment #2 (`JLPT`)** giữ nguyên không bị ảnh hưởng.

### 5.4 Sheet Backup & các vị trí hiện VẪN ưu tiên dữ liệu ngoài (`external_remaining_sessions`)
Khi đối chiếu với file xuất hoặc tính năng gửi tin hàng loạt (Broadcast), cần lưu ý rõ trạng thái hiện tại trên nhánh:
1. **`sheet-backup.service.ts` (khi enrollment ĐÃ có bản ghi điểm danh trên web):** đã nối calculator chuẩn và xuất đủ 2 ca cùng ngày.
2. **Ba vị trí vẫn đang giữ ưu tiên snapshot ngoài (`[CHƯA CHỐT]` thời điểm lật — chờ quyết định chủ dự án sau khi xử lý bảng đối soát D10 ngày `2026-10-26` tại `05_KE_HOACH_TRIEN_KHAI.md` mục A.1c.2):**
   - **Broadcast (`backend/src/modules/automation/broadcast.service.ts:154-165`):** biến `remaining_sessions` khi lọc/render chiến dịch Broadcast hiện vẫn lấy `enr.external_remaining_sessions ?? Math.max(0, enr.total_sessions - attendedCount)` (vẫn ưu tiên `external_remaining_sessions`, chưa chuyển sang calculator chuẩn vì trên dữ liệu thật hiện có `2.390` enrollment có `attendance_rows_final = 0`).
   - **Export danh sách học viên (`backend/src/modules/imports/imports.service.ts:2352`):** cột `remaining_sessions` hiện xuất `enr?.external_remaining_sessions ?? ''` (snapshot ngoài).
   - **Fallback của `sheet-backup.service.ts:864-866` khi enrollment CHƯA có bản ghi attendance nào trên web:** vẫn dùng fallback `external_remaining_sessions ?? Math.max(0, total_sessions − attended_previous_years)`.

---

## 6. Dọn dẹp / Rollback dữ liệu fixture sau khi chạy thử

Nếu chạy bằng suite tự động (`npx jest src/modules/attendance/__tests__/three-role-ui-flow.acceptance.integration.test.ts --runInBand`), khối `afterAll` đã tự động xóa sạch toàn bộ dữ liệu theo đúng thứ tự khóa ngoại (children-before-users) và kiểm tra `count = 0`.

Nếu chủ dự án tạo fixture thủ công trên DB test/staging để bấm qua trình duyệt, phải xóa theo đúng thứ tự **bản ghi con trước → bản ghi cha/người dùng sau** (tránh lỗi khóa ngoại `RESTRICT` trên `attendances.created_by_id`, `class_sessions.created_by_id`, `enrollments.cs_id`, `audit_logs.user_id`):
1. `message_deliveries` (theo `enrollment_id` của các enrollment thử nghiệm)
2. `attendances` (theo `enrollment_class.enrollment_id`)
3. `automation_enrollments`, `care_logs`, `care_tasks` (theo `enrollment_id`)
4. `class_sessions`, `class_teachers` (theo `class_id` của lớp thử nghiệm)
5. `enrollment_classes` → `enrollments`
6. `automation_steps` → `automation_workflows` (nếu có tạo workflow thử nghiệm)
7. `zalo_contact_relations` / `line_contact_relations` → `students`
8. `zalo_accounts` / `line_accounts` (nếu có tạo tài khoản kênh thử nghiệm)
9. `classes`, `teachers`, `packages`
10. `auth_sessions`, `audit_logs` → `users` (các tài khoản `*_trial_flow_20261026@example.com`).

---

## 7. Trạng thái mã nguồn & điều kiện nghiệm thu

- **Trạng thái hiện tại:** các fix nằm trên nhánh `feature/attendance-workflows-2026-10-25`; **production chỉ đạt điều kiện sau khi merge + deploy + kiểm tra lại sau deploy**.
- **Phân định rõ mức độ kiểm chứng:**
  - **Đã kiểm chứng bằng integration test có DB (`automation_cskh_test`):** toàn bộ chuỗi request HTTP khớp đúng trình tự gọi của UI cho cả 3 vai trò (`three-role-ui-flow.acceptance.integration.test.ts` và `attendance-e2e.acceptance.integration.test.ts`), với các adapter gửi tin ngoài (`BullMQ`, `Zalo`, `LINE`) được mock để không phát sinh giao dịch thật.
  - **Đã kiểm chứng nhánh hỗ trợ đặc quyền & hai cổng kiểm soát D8 (cập nhật `2026-10-26`):**
    1. **Điểm danh hộ GV (`assist-mark` — `POST /:id/teacher-mark` kèm `teacherId`) khóa chỉ `ADMIN`:** chỉ `ADMIN` được phép đánh hộ khi cửa sổ `[start_date, end_date]` của GV được ghi nhận bao phủ `session_date` (ngày trong cửa sổ trả `200 OK`, ngày ngoài cửa sổ hoặc `active = false` thiếu `end_date` trả `403`); tài khoản `MANAGE` gọi đánh hộ nhận `403`, trong khi `MANAGE` vẫn tiếp tục thực hiện `cs-mark` / `bulk-approve` trong các nhóm được phân công.
    2. **Kết thúc phân công GV (tầng API) & kiểm tra D8 khi Điểm danh / Import Excel:** thao tác Admin "Kết thúc phân công" (`PATCH /api/v1/classes/:id/teachers/:assignmentId/end` bắt buộc `end_date` tường minh với lỗi `422` nếu thiếu + ghi `AuditLog`) **hiện mới triển khai ở tầng API, chưa có nút/form trên UI**; phần kiểm tra hiệu lực phân công theo `session_date` (D8) sau khi kết thúc phân công đã nối đầy đủ trên cả luồng điểm danh/đánh hộ và luồng import Excel điểm danh (`attendance-import.service.ts`).
  - **Chưa thực hiện trong bước chuẩn bị này:** chưa khởi chạy server backend/frontend, chưa bật worker/cron, chưa có nút/form UI cho thao tác "Kết thúc phân công", và chưa bấm thử trên trình duyệt thật (chờ chủ dự án duyệt và trực tiếp thực hiện theo quy trình trên).

---

## 8. Bảng ghi nhận kết quả chạy thử thực tế (Checklist nghiệm thu từng bước)

| Bước / Vai trò | Màn hình / Endpoint | Thao tác | Kết quả kỳ vọng | Kết quả kiểm chứng API (`automation_cskh_test`) | Kết quả bấm thử UI trình duyệt (Chủ dự án ghi nhận) | Lỗi / Retry gặp phải |
|---|---|---|---|---|---|---|
| **Bước 1.1 — GV (`TEACHER`)** | `MyTeachingSessionsPage.tsx`<br>`POST /api/v1/classes/:classId/sessions/actual` + `POST /api/v1/attendance-reconciliation/:id/teacher-mark` | Đăng nhập GV, tạo **Ca 1** ngày `2026-10-20` (`19:00–19:30`), nhập bài học & ghi chú, bấm *Ghi nhận ca thực học* | Tạo `ClassSession` + `Attendance` (`201 Created`, `meta.replayed = false`), ghi `teacher_status = ATTENDED`, `reconciliation_state = PENDING_CS` | Đã PASS (`three-role-ui-flow.acceptance.integration.test.ts`) | `[ ] Chưa bấm thử` | |
| **Bước 1.2 — GV (`TEACHER`)** | `POST /api/v1/classes/:classId/sessions/actual` (cùng `idempotency_key`) | Giả lập retry mạng gửi lặp cùng `idempotency_key` của Ca 1 | Trả `200 OK` (`meta.replayed = true`), **không** sinh bản ghi buổi học hay điểm danh trùng | Đã PASS (`three-role-ui-flow.acceptance.integration.test.ts`) | `[ ] Chưa bấm thử` | |
| **Bước 1.3 — GV (`TEACHER`)** | `MyTeachingSessionsPage.tsx`<br>`POST /api/v1/classes/:classId/sessions/actual` + `POST /:id/teacher-mark` | Tạo tiếp **Ca 2** trong **cùng ngày `2026-10-20`** (`20:00–20:30`) với `idempotency_key` mới | Hiển thị đủ 2 thẻ buổi học cùng ngày `2026-10-20` ở trạng thái `PENDING_CS` (thiếu ý kiến CSKH là pending, không phải `CONFLICT`); `consumed = 0`, K7 = `0` | Đã PASS (`three-role-ui-flow.acceptance.integration.test.ts`) | `[ ] Chưa bấm thử` | |
| **Bước 2.1 — CVHT (`CS`)** | `AttendanceReconciliationPage.tsx`<br>`POST /api/v1/attendance-reconciliation/:id/cs-mark` (hoặc `bulk-approve`) | Đăng nhập CVHT, mở tab *Chờ đối soát*, xác nhận **Ca 1** `ATTENDED` khớp với GV | Ca 1 chuyển sang `MATCHED` (`FINAL`); `consumed` tăng `0 → 1`, `remaining = 9`; mốc chăm K7 tăng lên ordinal `1` | Đã PASS (`three-role-ui-flow.acceptance.integration.test.ts`) | `[ ] Chưa bấm thử` | |
| **Bước 2.2 — CVHT (`CS`)** | `AttendanceReconciliationPage.tsx`<br>`POST /api/v1/attendance-reconciliation/:id/cs-mark` | Tại **Ca 2**, chọn `ABSENT_UNAPPROVED_C` kèm ghi chú bằng chứng vắng giả lập (log Zoom ca 2 không thấy HV vào phòng, không có đơn xin nghỉ — không trộn với phản hồi tin nhắn) | Ca 2 chuyển sang `CONFLICT` (provisional), giữ nguyên `teacher_status = ATTENDED` & `cs_status = ABSENT_UNAPPROVED_C`; `consumed` và K7 vẫn giữ ở `1` | Đã PASS (`three-role-ui-flow.acceptance.integration.test.ts`) | `[ ] Chưa bấm thử` | |
| **Bước 2.3 — Kiểm khóa quyền phân xử (`CS` / `MANAGE`)** | `AttendanceReconciliationPage.tsx` (tab *Xung đột*)<br>`POST /api/v1/attendance-reconciliation/:id/resolve-conflict` | Kiểm tra giao diện tab *Xung đột* dưới tài khoản `CS`/`MANAGE` và thử gọi API `resolve-conflict` | Trên UI **ẩn nút `"Phân xử"`** (`isAdmin === false`); nếu gọi trực tiếp API bằng `CS` hoặc `MANAGE` thì bị chặn **`403 Forbidden`** (D2) | Đã PASS (`three-role-ui-flow.acceptance.integration.test.ts`) | `[ ] Chưa bấm thử` | |
| **Bước 3.1 — Admin (`ADMIN`)** | `AttendanceReconciliationPage.tsx` (tab *Xung đột* & *Lịch sử*)<br>`POST /api/v1/attendance-reconciliation/:id/resolve-conflict` | Đăng nhập Admin, bấm nút **`"Phân xử"`** ở Ca 2, chọn `finalStatus = ATTENDED`, nhập `resolutionNote` bắt buộc | Ca 2 chuyển sang `RESOLVED` (`FINAL`); giữ nguyên cả 2 ý kiến gốc (`teacher_status`, `cs_status`, `teacher_note`, `cs_note`); ghi `AuditLog` `ATTENDANCE_CONFLICT_RESOLVED`; `consumed` = `2`, K7 = `2` | Đã PASS (`three-role-ui-flow.acceptance.integration.test.ts`) | `[ ] Chưa bấm thử` | |
| **Bước 3b.1 — Cổng đánh hộ GV (`assist-mark`)** | `POST /api/v1/attendance-reconciliation/:id/teacher-mark` kèm `teacherId` | Thử gọi `teacher-mark` có `teacherId` bằng `MANAGE` vs bằng `ADMIN` (trong và ngoài cửa sổ `[start_date, end_date]`) | `MANAGE` gọi đánh hộ nhận **`403 Forbidden`**; `ADMIN` đánh hộ được chấp nhận (`200`) khi `session_date` thuộc `[start_date, end_date]` và bị chặn (`403`) khi ngoài cửa sổ hoặc `active = false` thiếu `end_date` | Đã PASS (`three-role-ui-flow.acceptance.integration.test.ts` + unit tests) | `[ ] Chưa bấm thử` | |
| **Bước 3b.2 — Kết thúc phân công (API) & Import Excel D8** | `PATCH /api/v1/classes/:id/teachers/:assignmentId/end` *(chỉ API, chưa có UI)*<br>`POST /api/v1/attendance-reconciliation/import-excel/confirm` | Gọi API kết thúc phân công có `end_date` (kiểm tra lỗi `422` nếu thiếu `end_date`); sau đó thử import Excel điểm danh cho ngày trong và ngoài `[start_date, end_date]` | API kết thúc phân công bắt buộc `end_date` (`422` nếu thiếu), lưu `active = false` + `AuditLog`; import Excel chấp nhận ngày trong cửa sổ (`2026-10-20`) và chặn ngày ngoài cửa sổ (`2026-11-05`) theo D8 | Đã PASS (`three-role-ui-flow.acceptance.integration.test.ts` + `attendance-import.d8.unit.test.ts`) | `[ ] API-only cho bước kết thúc phân công; chưa bấm thử UI import` | |
| **Bước 4.1 — Ma trận & Dashboard** | `AttendanceMatrix.tsx`, `DashboardPage.tsx`<br>`GET /api/v1/enrollments`, `GET /api/v1/dashboard/*` | Kiểm tra hiển thị 2 ca cùng ngày `2026-10-20` và bộ đếm `total / consumed / remaining`, K7 | Hiển thị đủ 2 cột/bản ghi ngày `2026-10-20`; `total = 10`, `consumed = 2`, `remaining = 8` (không clamp, không cộng gộp dữ liệu ngoài); K7 = `2` | Đã PASS (`three-role-ui-flow.acceptance.integration.test.ts`) | `[ ] Chưa bấm thử` | |
| **Bước 4.2 — Phiếu báo cáo học tập (D11) & Sheet backup** | `StudentStudyReportPage.tsx` (`PATCH /api/v1/students/:id` kèm `enrollment_id`), `sheet-backup.service.ts` | Chọn tường minh **Enrollment #1 (`KAIWA`)** để lưu nhận xét; kiểm tra **Enrollment #2 (`JLPT`)** và dữ liệu xuất Sheet backup | Nhận xét chỉ ghi vào Enrollment #1, Enrollment #2 giữ nguyên; Sheet backup xuất đủ 2 ca cùng ngày và số dư chuẩn khi đã có attendance trên web | Đã PASS (`three-role-ui-flow.acceptance.integration.test.ts`) | `[ ] Chưa bấm thử` | |

