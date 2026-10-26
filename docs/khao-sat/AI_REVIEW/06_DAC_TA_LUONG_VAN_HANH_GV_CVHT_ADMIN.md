# AI_REVIEW — Đặc tả luồng vận hành hằng ngày GV–CVHT–Admin

**Baseline:** `main = cbf78c337b8ff534a6d9b3ea5d63cf626cd44b17`, cập nhật 2026-10-24; **đồng bộ trạng thái nhánh `feature/attendance-workflows-2026-10-25` ngày 2026-10-26**.
**Ký hiệu nguồn:**
- **[PC-USER]** = nguyên tắc chủ dự án nêu trực tiếp trong lượt 24/10–26/10 (đưa vào yêu cầu, không còn là suy luận).
- **[CODE]** = đọc code/schema/UI trực tiếp (ghi rõ `(Baseline main: ... → Đã sửa trên nhánh: ...)` tại các mục đã triển khai).
- **[ĐỀ-XUẤT]** = thiết kế đề xuất, chỉ áp khi đã có xác nhận của chủ dự án.
- **[CXM]** = cần kiểm chứng runtime/fixture hoặc cần quyết định.
Không trộn [ĐỀ-XUẤT] vào [PC-USER].

## 0. Các nguyên tắc [PC-USER] đã chốt

1. **Lớp 1-1 lịch linh hoạt.** Thời gian import ban đầu chỉ là tham khảo/điều phối, **không phải điều kiện bắt buộc để điểm danh**.
2. **GV chủ động ghi nhận ca thực học** sau khi dạy, kể cả khi khác lịch đăng ký hoặc **chưa có session tạo trước**.
3. **Hai ca liên tiếp cùng ngày** của một HV là hợp lệ; GV được tạo **hai bản ghi buổi học riêng**.
4. Lưu **ngày học thực tế** và **thời điểm nhập** để truy vết; **không** dùng lịch dự kiến hay quy tắc "mỗi ngày một bản ghi" để chặn ca hợp lệ.
5. **Lớp nhóm lịch cố định:** một buổi lớp → nhiều kết quả điểm danh theo từng HV.
6. **Lịch dự kiến tự nó không chứng minh đã học hoặc đã vắng.**
7. Ba luồng công việc độc lập (mục 1–3 dưới đây), mỗi luồng có **trạng thái hoàn thành riêng**; "chưa nhập ý kiến" ≠ conflict; "đã liên hệ" ≠ "đã nhận phản hồi" ≠ "đã giải quyết".
8. **Admin phân xử** khi GV/CVHT bất đồng (`resolve-conflict` đã khóa Admin-only trên nhánh). **Quyền phân xử của MANAGE vẫn `[CHƯA CHỐT]`** — trên nhánh, MANAGE chỉ thực hiện nghĩa vụ CVHT (`cs-mark`/`bulk-approve`) trong phạm vi nhóm được gán (xem §5-D2).

Các điểm **đã chốt thêm ngày 2026-10-25 / 2026-10-26** (xem `05_KE_HOACH_TRIEN_KHAI.md` mục A.1b & A.1c): **D1** (K7 = Attendance FINAL cá nhân có `status = ATTENDED` sắp theo `(session_date, created_at, id)`, 2 ca cùng ngày = 2, S1a/S2c occurrence `(enrollment_id, automation_step_id)` + forward re-eval toàn enrollment), **D3** (1-1 planned-only), **D4-cap** (không cap cứng 3 lần liên hệ), **D5** (due thủ công trước, không build SLA engine), **D6-nguyên-tắc** (trước hạn owner sửa, sau hạn Admin sửa), **D7** (1 Attendance = 1 buổi), **D8** (kiểm tra cửa sổ phân công `[start_date, end_date]` bao phủ `session_date`), **D10-nguyên-tắc** (web owns operational data + calculator chuẩn `enrollment-entitlement.ts`), **D11** (chọn `enrollment_id` tường minh trên `StudentStudyReportPage`).
Các điểm **vẫn `[CHƯA CHỐT]`**: **D6** giá trị số cụ thể của window; **D4** bộ nhãn enum 4–5 trạng thái feedback; **vai trò bảng `CareLog`** (`summary per milestone` vs `per-contact history`) trước khi đặt `@@unique`; **D2** ủy quyền phân xử cho MANAGE; **D10** thời điểm lật precedence của Broadcast (chờ hành động của chủ dự án trên bảng đối soát 2026-10-26 tại `05` A.1c.2); **đề xuất migration `07_PROPOSAL_MILESTONE_OCCURRENCE_MIGRATION.md`** (đang chỉnh sửa theo review chủ dự án — chưa chạy); **D9** Sale↔CS.

## 1. Luồng A — Điểm danh ca học + nội dung bài học

### Diễn biến nghiệp vụ
GV dạy xong → ghi nhận ca thực tế (tạo mới nếu chưa có session) → ghi trạng thái tham gia + bài đã học + ghi chú. CVHT kiểm tra và ghi ý kiến **ở phần riêng**. Hai bên khác nhau → **Admin phân xử**; kết quả cuối là dữ liệu chính thức cho số buổi/tiến trình.

### Code hiện tại ánh xạ từng bước ([CODE])
| Bước | Trạng thái trong code |
|---|---|
| Hai ý kiến tách riêng | ✅ `Attendance.teacher_status/cs_status + raw/note/user/time`, final `status`, `reconciliation_state`, resolver/note/audit (`schema.prisma` Attendance; `attendance.repository.ts` mark/bulk/update; `reconciliation.service.ts:59-63 deriveState`) |
| Thiếu một phía → pending, không conflict | ✅ `deriveState`: thiếu GV→`PENDING_TEACHER`, thiếu CS→`PENDING_CS`, khớp→`MATCHED`, khác→`CONFLICT`; pending queue còn kiểm cả opinion (`reconciliation.service.ts:87-103`) — **đúng nguyên tắc [PC-USER] 7** |
| CVHT xác nhận đúng buổi GV tạo | ✅ Cùng bản ghi Attendance (EC+session), route `/:id/cs-mark` và `bulk-approve` kiểm scope `assertCSScope`: CS theo `enrollment.cs_id`, **MANAGE theo phạm vi nhóm CVHT được gán (group-scoped)** *(Baseline main: mở A/M/C nhưng chưa tách rõ nghĩa vụ CVHT theo nhóm của MANAGE với quyền phân xử → Đã sửa trên nhánh: MANAGE giữ quyền nghĩa vụ CVHT `cs-mark`/`bulk-approve` theo nhóm được gán, tách khỏi `resolve-conflict`)* |
| Bất đồng → phân xử | ✅ **Đã khóa `ADMIN`-only trên `resolve-conflict`** (`reconciliation.routes.ts` + `reconciliation.service.ts`): chỉ nhận bản ghi `CONFLICT` (409 nếu không), giữ nguyên hai opinion + audit before/after; GV/CVHT/MANAGE gọi `resolve-conflict` bị chặn 403 *(Baseline main: route + `assertCSScope` cho phép cả `MANAGE` và `CS` sở hữu enrollment tự phân xử → Đã sửa trên nhánh: chỉ `ADMIN` phân xử; phần ủy quyền phân xử cho `MANAGE` vẫn `[CHƯA CHỐT]`, xem §5-D2)* |
| GV tạo ca thực học khi chưa có session | ✅ **Đã triển khai end-to-end trên nhánh (`MyTeachingSessionsPage.tsx` + backend session/attendance mark flow + `teacher-assignment.ts`):** GV chủ động tạo ca thực học trực tiếp từ UI (kể cả khi chưa có session dự kiến hoặc khác lịch đăng ký), hỗ trợ **intent-key idempotency** để phân biệt bấm lặp/retry mạng với chủ đích thêm ca thứ 2 trong ngày, và kiểm tra quyền ghi theo cửa sổ phân công `[start_date, end_date]` bao phủ `session_date` (D8) *(Baseline main: API `POST /classes/:classId/sessions` đã mở cho TEACHER nhưng `MyTeachingSessionsPage.tsx:137-142` chặn khi thiếu `selectedAttendance?.id` và báo "Vui lòng liên hệ CSKH" → Đã sửa trên nhánh)* |
| Hai ca cùng ngày của một HV | ✅ **Lưu được và đếm đúng = 2 trên mọi reader đã nối calculator trên nhánh:** unique `(enrollment_class_id, class_session_id)` cho phép 2 session cùng ngày; calculator chuẩn `enrollment-entitlement.ts` cùng `AttendanceMatrix.tsx`, `dashboard.repository.ts`, `sheet-backup.service.ts` và `automation-trigger.service.ts` đều đếm đủ **2 ca cùng ngày = 2** theo thứ tự `(session_date, created_at, id)` kết hợp S1a/S2c occurrence `(enrollment_id, automation_step_id)` + forward re-eval *(Baseline main: lưu được ở DB nhưng `AttendanceMatrix` `processedDates`, `automation-trigger.service.ts:256-277` và `sheet-backup.service.ts:824-827` gom theo ngày nên mất 1 trong 2 ca hoặc trùng ordinal → Đã sửa trên nhánh)* |
| Ngày thực học + thời điểm nhập | ✅ `class_session.session_date`, `teacher_submitted_at/cs_submitted_at`, `created_at/updated_at`, `source`, `raw_value` |
| Nội dung bài + ghi chú GV | ✅ `lesson_topic` (map với workflow `MãHV-Tên bài` [NV] F01/F02), `teacher_note`, `raw_value` (`reconciliation.service.ts:204-250`) |

### Trạng thái nghiệm thu Luồng A trên nhánh `feature/attendance-workflows-2026-10-25`
- **Đã triển khai trên nhánh:** GV tạo ca thực học end-to-end từ UI GV (session mới + attendance + mark); thêm ca thứ 2 cùng ngày kèm intent-key idempotency chống nhân bản khi retry; `resolve-conflict` khóa Admin-only; MANAGE thực hiện `cs-mark`/`bulk-approve` theo nhóm được gán; kiểm quyền ghi của GV theo cửa sổ `[start_date, end_date]` bao phủ `session_date` (D8); mọi reader (`AttendanceMatrix`, dashboard, sheet-backup, automation S1a/S2c) đếm đúng 2 ca cùng ngày = 2 theo `enrollment-entitlement.ts`.
- **Còn `[CHƯA CHỐT]` (không chặn nghiệm thu Luồng A cơ bản):** ủy quyền phân xử cho MANAGE (D2); giá trị số cụ thể của window sửa lịch sử (D6); thời điểm lật Broadcast precedence (D10 — xem `05` A.1c.2); đề xuất migration DB `07_PROPOSAL_MILESTONE_OCCURRENCE_MIGRATION.md` (đang chỉnh sửa theo review chủ dự án, chưa chạy).

## 2. Luồng B — Phiếu đánh giá học tập theo mốc

### Diễn biến
Đến mốc quy định (giữa kỳ/cuối kỳ/số buổi), **GV điền phiếu đánh giá** cho HV của mình, gắn đúng enrollment.

### Code hiện tại ([CODE])
- Có form report JSON: `StudentStudyReportPage.tsx` — mốc 1/3, giai đoạn 1–10/11–20/21–30, giữa/cuối kỳ; lưu vào `Enrollment.program_metadata.study_report`.
- **Chọn đúng enrollment (D11 — đã sửa trên nhánh):** *(Baseline main: UI đọc `enrollments[0]` trong khi backend update chọn enrollment `id` lớn nhất, có thể ghi đè chéo enrollment → Đã sửa trên nhánh: `StudentStudyReportPage` có bộ chọn `enrollment_id` tường minh (D11) và truyền `enrollment_id` đích danh khi đọc/lưu báo cáo học tập).*
- **Phân tách với mốc chăm (D1 — đã chốt 2026-10-25):** mốc đánh giá (B) tách theo catalog phiếu đánh giá riêng, không dùng chung số đếm với mốc chăm sóc (C).
- Các phần mở rộng vòng đời phiếu (workflow tự động sinh việc đánh giá theo catalog mốc, trạng thái `DRAFT|SUBMITTED|REVIEWED`) thuộc hạng mục D-EVAL (`05_KE_HOACH_TRIEN_KHAI.md`).

## 3. Luồng C — Chăm sóc đến mốc: lấy feedback

### Diễn biến
Đến mốc chăm sóc, **CVHT liên hệ xin feedback**, ghi phản hồi, theo dõi việc cần xử lý tiếp. "Đã liên hệ" khác "đã nhận phản hồi" khác "đã giải quyết".

### Code hiện tại ([CODE])
| Yếu tố | Trạng thái |
|---|---|
| Căn cứ đếm mốc chăm (D1/K7) | ✅ **Đã chốt & đã code trên nhánh (`enrollment-entitlement.ts` + `dashboard.repository.ts` + `automation-trigger.service.ts`):** đếm Attendance **FINAL cá nhân có `status = ATTENDED`** sắp theo `(session_date, created_at, id)` (2 ca cùng ngày = 2; nghỉ `ABSENT_UNAPPROVED_C` không tăng mốc chăm). `CareMilestoneConfig.session_number` hiện vẫn là cấu hình theo số buổi |
| Ghi log theo mốc & vai trò bảng `CareLog` | ⚠️ `PUT /enrollments/:id/sessions/:n/care-log` (`care.repository.ts:257-299`). Chủ dự án đã chốt **D4: không cap cứng 3 lần liên hệ** (mỗi lần liên hệ lưu theo contact riêng); tuy nhiên **vai trò bảng `CareLog` (`summary per milestone` vs `per-contact history`) vẫn `[CHƯA CHỐT]`** trước khi đặt bất kỳ ràng buộc `@@unique` nào |
| Task chăm | `CareTask(PENDING/DONE/CANCELLED)` theo enrollment/assignee/due/priority; **D5 đã chốt**: due **thủ công trước**, "ba đồng hồ" là 3 căn cứ sinh việc, **không build SLA engine** |
| Trạng thái liên hệ/phản hồi/giải quyết | ⚠️ Nguyên tắc tách 3 giai đoạn đã chốt ([PC-USER] 7) và không cap cứng 3 lần liên hệ (D4); riêng **bộ nhãn enum chi tiết 4–5 trạng thái feedback vẫn `[CHƯA CHỐT]`** |
| Giao tin tự động (S1a/S2c) | ✅ **Đã sửa trên nhánh (`automation-trigger.service.ts`):** định danh occurrence theo **`(enrollment_id, automation_step_id)`** (độc lập `attendance_id`) + **đánh giá lại xuôi (forward re-evaluation) toàn bộ các mốc của enrollment** khi reconciliation thay đổi; worker kiểm tra lại điều kiện trước khi gửi; giữ nguyên `NO_SEND` *(Baseline main: dedup theo `(attendance_id, step)` và đếm ATTENDED trước ngày +1 → Đã sửa trên nhánh; đề xuất migration DB `07_PROPOSAL_MILESTONE_OCCURRENCE_MIGRATION.md` đang `[CHƯA CHỐT]` chờ review chủ dự án, chưa chạy)* |

## 4. Chuẩn hóa khái niệm tính buổi (8 khái niệm tách bạch)

| # | Khái niệm | Định nghĩa [PC-USER]+[NV] | Nguồn trong code (nhánh `feature/attendance-workflows-2026-10-25`) | Không được đồng nhất với |
|---|---|---|---|---|
| K1 | **Buổi dự kiến (planned)** | Slot lịch nền/pattern, chỉ là kế hoạch | `ClassSchedule` pattern + `ClassSession` sinh từ schedule/auto (`auto-attendance.service.ts`: với `ONE_TO_ONE` chỉ tạo `ClassSession` planned-only theo D3, không tạo `Attendance`) | Mọi chứng minh tham gia; không phải bản ghi học |
| K2 | **Ca thực tế được ghi nhận (actual session record)** | Một lần dạy/học thật, do GV/CVHT ghi; 1-1 có thể ngoài lịch; 2 ca/ngày = 2 records | `ClassSession` + Attendance `(EC, session)` (UI GV `MyTeachingSessionsPage.tsx` tạo trực tiếp + intent-key idempotency) | Số quyền học; ngày dự kiến |
| K3 | **Ý kiến GV/CVHT & kết quả cuối** | Hai opinion độc lập; final = `MATCHED`/`RESOLVED` (Admin phân xử khi `CONFLICT`) | `teacher_status/cs_status/status/reconciliation_state`; `resolve-conflict` khóa `ADMIN`-only; `cs-mark`/`bulk-approve` cho CS sở hữu và MANAGE theo nhóm được gán | Attendance một chiều; `status` khi pending |
| K4 | **Số buổi thực học hợp lệ (attended-valid)** | K2 đã final (`MATCHED`/`RESOLVED`, chưa xóa mềm) với `status = ATTENDED` (1 Attendance = 1 buổi theo D7; 2 ca cùng ngày = 2) | ✅ Predicate & bộ đếm chuẩn trong `enrollment-entitlement.ts` (`isCareMilestoneAttendance` / `calculateEnrollmentEntitlement`), dùng chung cho dashboard, matrix, sheet-backup, automation *(Baseline main: chưa có predicate duy nhất; automation đếm theo ngày trước đó, dashboard đếm mọi row)* | `consumed` K5 (vì `ABSENT_UNAPPROVED_C` là vắng vẫn tiêu thụ quyền học) |
| K5 | **Quyền học đã tiêu thụ (consumed)** | business-rules §2 (Q-002 RESOLVED) + D7/D10: final `ATTENDED` hoặc `ABSENT_UNAPPROVED_C`, mỗi bản ghi đúng 1 buổi, xuyên EC; `remaining = total_sessions − consumed` **không clamp** và **không gộp** `attended_previous_years` / `external_remaining_sessions` | ✅ Calculator chuẩn trong `enrollment-entitlement.ts` (`isConsumedEntitlementAttendance` / `calculateEnrollmentEntitlement`), đã nối vào dashboard, matrix, sheet-backup *(Baseline main: 6 reader tự tính lệch nhau; lưu ý `broadcast.service.ts:154-165` hiện vẫn ưu tiên `external_remaining_sessions` — mục mở `[CHƯA CHỐT]` chờ đối soát D10 tại `05` A.1c.2)* | `attended-valid` K4; `personal care sequence` K7; snapshot ngoài K8 |
| K6 | **Thứ tự buổi lớp/lộ trình (class/content ordinal)** | Vị trí buổi trong lớp hoặc bài trong lộ trình; nhóm 8 HV có thể cùng ordinal 5 | `ClassSession.session_number` (per class) | Số buổi cá nhân đã học; mốc chăm cá nhân |
| K7 | **Căn cứ mốc chăm sóc & nhắc tin (personal care/milestone sequence)** | **`[ĐÃ CHỐT 2026-10-25 — D1 + S1a/S2c]`:** đếm các bản ghi Attendance **FINAL cá nhân có `status = ATTENDED` sắp theo `(session_date, created_at, id)`** (2 ca cùng ngày = 2; nghỉ `ABSENT_UNAPPROVED_C` **không** tăng K7). Mốc đánh giá (B) tách theo catalog phiếu đánh giá riêng | ✅ `enrollment-entitlement.ts` + `automation-trigger.service.ts` + `dashboard.repository.ts`: ordinal theo `(session_date, created_at, id)`, dedup occurrence theo `(enrollment_id, automation_step_id)`, forward re-evaluation toàn enrollment khi reconciliation đổi *(Baseline main: count ATTENDED-final trước ngày +1 khiến 2 ca cùng ngày trùng ordinal và dedup theo `(attendance_id, step)`)* | `consumed` K5; `class ordinal` K6; số ngày học |
| K8 | **Số dư ngoài & số dư đầu kỳ** | `external_remaining_sessions` (snapshot đối soát ngoài, kèm `external_synced_at`) và `attended_previous_years` (opening balance, quy tắc cutoff **chưa chốt**) | `Enrollment` fields + `entitlement-reconciliation-export.ts` (đối soát chỉ-đọc); theo D10 không fold vào calculator `enrollment-entitlement.ts` (riêng bước lật Broadcast precedence và 2 fallback export/backup vẫn `[CHƯA CHỐT]` theo `05` A.1c.2) | `consumed` / `remaining` tính toán của calculator |

**Hai khẳng định bất biến (đã chốt & đã kiểm thử trên nhánh):** (a) căn cứ mốc chăm/automation (K7 = FINAL `ATTENDED` cá nhân) **tách biệt với** `consumed` (K5 = FINAL `ATTENDED` + `ABSENT_UNAPPROVED_C`) — nghỉ `C` tiêu thụ quyền học nhưng không tăng mốc chăm; (b) học 2 ca cùng ngày được tính đủ 2 buổi theo thứ tự `(session_date, created_at, id)`, và mỗi mốc `(enrollment_id, automation_step_id)` chỉ sinh đúng một occurrence kết hợp đánh giá lại xuôi toàn enrollment khi reconciliation thay đổi (S1a/S2c — test §6.8).

## 5. Auto-attendance trong mô hình mới + trạng thái bảng quyết định D1–D11

### Rà lại auto ([CODE] + [PC-USER] + D3 đã chốt)
Với **lớp 1-1 lịch linh hoạt** ([PC-USER 1–2, 6] + **D3 đã chốt 2026-10-25**): lịch dự kiến chỉ là kế hoạch, **không tự sinh `Attendance`**. Trên nhánh `feature/attendance-workflows-2026-10-25`, `auto-attendance.service.ts` đã áp dụng **planned-only cho `ClassModelType.ONE_TO_ONE`** (chỉ tạo `ClassSession` để nhắc lịch, **bỏ qua tạo `Attendance`**; attendance chỉ phát sinh khi GV/CVHT nhập), còn **lớp nhóm lịch cố định** tạo bản ghi `PROVISIONAL` (`PENDING_TEACHER`/`PENDING_CS`, không bao giờ auto-final) *(Baseline main: `auto-attendance.repository.ts:235-251` tạo `status=ATTENDED` + `source=AUTO_SCHEDULE` không có opinion cho cả 1-1)*.

### Bảng quyết định D1–D11 (đồng bộ trạng thái ngày 2026-10-26)
> **Tóm tắt:** Chủ dự án đã **DUYỆT D1, D3, D4 (phần không cap cứng 3 lần liên hệ), D5, D6 (nguyên tắc trước/sau hạn), D7, D8, D10 (nguyên tắc sở hữu dữ liệu & calculator), D11** và bổ sung **S1a/S2c (2026-10-26)**. Các phần vẫn **`[CHƯA CHỐT]`** được gắn nhãn rõ trong bảng dưới đây để không ai tự áp: (1) **D6** giá trị số cụ thể của window; (2) **D4** bộ nhãn enum 4–5 trạng thái feedback; (3) **vai trò bảng `CareLog`** (`summary per milestone` vs `per-contact history`) trước khi đặt `@@unique`; (4) **D2** ủy quyền phân xử cho MANAGE; (5) **D10** thời điểm lật precedence của Broadcast (chờ hành động của chủ dự án trên bảng đối soát 2026-10-26 tại `05` A.1c.2); (6) **đề xuất migration `07_PROPOSAL_MILESTONE_OCCURRENCE_MIGRATION.md`** (đang chỉnh sửa theo review chủ dự án — chưa chạy); (7) **D9** Sale↔CS.

| ID | Quyết định | Hiện trạng code trên nhánh `feature/attendance-workflows-2026-10-25` | Trạng thái |
|---|---|---|---|
| D1 | Căn cứ mốc chăm/nhắc tin (C) và mốc đánh giá (B): đơn vị ca cá nhân, loại status, thứ tự khi 2 ca cùng ngày, định danh mốc (S1a/S2c) | ✅ Đã triển khai trong `enrollment-entitlement.ts`, `automation-trigger.service.ts`, `dashboard.repository.ts`, `AttendanceMatrix.tsx`, `sheet-backup.service.ts`: K7 = Attendance FINAL cá nhân có `status = ATTENDED` sắp theo `(session_date, created_at, id)` (2 ca cùng ngày = 2; nghỉ `C` không tính vào K7); dedup occurrence theo `(enrollment_id, automation_step_id)` + forward re-eval toàn enrollment khi reconciliation đổi *(Baseline main: count ATTENDED-final trước ngày +1, dedup theo `(attendance_id, step)`)* | **`[ĐÃ CHỐT 2026-10-25 & 2026-10-26 — xem 05 A.1b/A.1c]`** (Mốc chăm & ordinal nhắc tin theo K7 FINAL `ATTENDED`; mốc đánh giá B tách theo catalog riêng. Riêng đề xuất migration DB `07_PROPOSAL_MILESTONE_OCCURRENCE_MIGRATION.md` đang **`[CHƯA CHỐT]`** chờ review chủ dự án, chưa chạy) |
| D2 | Ai được phân xử `CONFLICT`: chỉ `ADMIN` hay mở rộng cho `MANAGE`? | ✅ `resolve-conflict` đã khóa **chỉ `ADMIN`** (`reconciliation.routes.ts` + `reconciliation.service.ts`); `MANAGE` chỉ thực hiện nghĩa vụ CVHT (`cs-mark`/`bulk-approve`) trong phạm vi nhóm được gán *(Baseline main: cho phép `ADMIN`, `MANAGE` và `CS` sở hữu enrollment tự phân xử)* | **`[ĐÃ CHỐT Admin phân xử]`** (đã code Admin-only + MANAGE group-scoped CVHT duties). Phần **ủy quyền phân xử cho MANAGE vẫn `[CHƯA CHỐT]`** |
| D3 | Auto-attendance cho lớp 1-1 linh hoạt và lớp nhóm lịch cố định | ✅ Đã triển khai trong `auto-attendance.service.ts`: `ClassModelType.ONE_TO_ONE` chạy **planned-only** (chỉ tạo `ClassSession`, không tạo `Attendance`); lớp nhóm lịch cố định tạo `Attendance` ở trạng thái `PROVISIONAL` (`PENDING_TEACHER`/`PENDING_CS`, không auto-final) *(Baseline main: tự tạo `status=ATTENDED` không opinion)* | **`[ĐÃ CHỐT 2026-10-25 — xem 05 A.1b]`** |
| D4 | Giới hạn số lần liên hệ feedback, bộ nhãn enum 4–5 trạng thái feedback, và vai trò bảng `CareLog` | `CareTask` (`PENDING/DONE/CANCELLED`), `CareLog` (`outcome` enum đơn, lưu theo mốc/lần liên hệ) | **`[ĐÃ CHỐT 2026-10-25]`** phần **không cap cứng 3 lần liên hệ** (mỗi lần liên hệ lưu riêng). Vẫn **`[CHƯA CHỐT]`**: (a) **bộ nhãn enum chi tiết 4–5 trạng thái feedback**; (b) **vai trò bảng `CareLog` (`summary per milestone` vs `per-contact history`) trước khi đặt bất kỳ `@@unique` nào** |
| D5 | Cơ chế due / SLA liên hệ ("ba đồng hồ" trong workbook F07/F08) | Giữ due thủ công trên `CareTask`; không dựng SLA/timer engine | **`[ĐÃ CHỐT 2026-10-25 — xem 05 A.1b]`:** due **thủ công trước**, "ba đồng hồ" là 3 căn cứ sinh việc, **không build SLA engine** |
| D6 | Hạn nhập ý kiến GV / hạn sửa final lịch sử (Q-004) | Mọi sửa final hiện đi qua CONFLICT/audit + hủy delivery chờ theo Q-004; chưa enforce chặn tự động theo tuổi bản ghi vì chưa có số window | **`[ĐÃ CHỐT nguyên tắc 2026-10-25]`** (trước hạn owner tự sửa phần mình; sau hạn chỉ Admin điều chỉnh final kèm lý do + lịch sử). **Giá trị số cụ thể của window vẫn `[CHƯA CHỐT]`** |
| D7 | Quy đổi thời lượng (45/60 phút, half-session 0.5X) thành quyền học | ✅ `enrollment-entitlement.ts` giữ đúng **1 Attendance = 1 buổi**, không có hệ số quy đổi thời lượng | **`[ĐÃ CHỐT 2026-10-25 — xem 05 A.1b]`:** giữ **1 Attendance = 1 buổi**, không quy đổi 0.5X/45 phút |
| D8 | Quyền nhập/ghi ca học của GV theo **phân công hiệu lực tại `session_date`** | ✅ Đã triển khai trong `teacher-assignment.ts`: kiểm tra khoảng hiệu lực phân công **`[start_date, end_date]` có bao phủ `session_date` hay không** — **kể cả khi `active` hiện tại là `false` vì phân công đã kết thúc sau ngày dạy đó**; chỉ khi `active = false` mà **cả `start_date` lẫn `end_date` đều `null`** mới bị coi là thiếu bằng chứng cửa sổ hiệu lực → trả `403` / chuyển Admin xử lý *(Baseline main: chỉ xét `active = true` tại thời điểm gọi)* | **`[ĐÃ CHỐT 2026-10-25 — xem 05 A.1b]`** (đã code tại `teacher-assignment.ts`; riêng con số window của D6 vẫn `[CHƯA CHỐT]`) |
| D9 | Quan hệ Sale↔CS (Q-009 vs business-rules §15) | `students.repository.ts:199-216` còn match `sale_name` substring (đã tách khỏi mã **D11** của UI enrollment picker) | **`[CHƯA CHỐT — chặn B.5 của kế hoạch]`** |
| D10 | Quyền sở hữu dữ liệu vận hành Sheet↔Web và nguồn số dư `remaining` | ✅ Đã triển khai calculator chuẩn trong `enrollment-entitlement.ts` (`remaining = total_sessions − consumed`, không clamp, không fold `external_remaining_sessions` hay `attended_previous_years`) + script đối soát chỉ-đọc `backend/scripts/entitlement-reconciliation-export.ts`. `broadcast.service.ts:154-165` hiện **vẫn ưu tiên `external_remaining_sessions`** | **`[ĐÃ CHỐT nguyên tắc & calculator 2026-10-25]`** (web owns operational data). **Bước lật precedence của Broadcast (cùng 2 vị trí snapshot ngoài tại `imports.service.ts:2352` và `sheet-backup.service.ts:864-866`) vẫn `[CHƯA CHỐT]`** — chờ hành động của chủ dự án trên bảng đối soát ngày 2026-10-26 (`05` A.1c.2: 2.390 enrollment có `attendance_rows_final = 0`, dữ liệu nền chưa sẵn sàng để lật) |
| D11 | Chọn `enrollment_id` tường minh trên UI phiếu đánh giá học tập (`StudentStudyReportPage`) | ✅ Đã triển khai bộ chọn `enrollment_id` tường minh trên `StudentStudyReportPage.tsx` và gắn đúng enrollment khi đọc/lưu *(Baseline main: UI lấy `enrollments[0]`, backend lấy enrollment `id` lớn nhất; từng bị ghi nhầm mã D9 trong comment cũ, nay chuẩn hóa thành **D11**)* | **`[ĐÃ CHỐT & ĐÃ CODE 2026-10-25]`** |

## 6. Bộ tình huống nghiệm thu tối thiểu (acceptance)

Mỗi tình huống = fixture tách biệt (test DB/env được duyệt), kiểm **trước và sau**; không dùng dữ liệu HV thật.

1. **Ca khác lịch đăng ký:** 1-1 lịch import T2 20h; GV dạy T4 19h → tạo session/attendance theo ngày thực; mọi reader (matrix, dashboard, backup, automation) tính đúng 1 ca ngày T4, không tính ngày T2.
2. **Ca khi chưa có session:** GV tạo end-to-end từ UI GV (không "liên hệ CSKH"); attendance skeleton tự sinh; CVHT xác nhận phía mình trên đúng bản ghi.
3. **Hai ca cùng ngày:** GV thêm ca 2 chủ đích → 2 session + 2 attendance; đếm = 2 ở **mọi** reader; export/backup xuất 2 dòng/cột giá trị; không bị processedDates/map-theo-ngày gộp.
4. **Lưu lặp do retry:** cùng request idempotency → đúng 1 record; hai request chủ đích → 2 records (phân biệt rõ với #3).
5. **Thiếu một phía:** chỉ GV mark → `PENDING_CS`, không `CONFLICT`; queue CS thấy; số final không đổi.
6. **Hai phía khác nhau:** → `CONFLICT`; phân xử giữ nguyên `teacher_status/cs_status/raw/note`, ghi resolver/time/note; `RESOLVED` được tính final.
7. **Phân xử quyền (D2):** `resolve-conflict` chỉ cho phép `ADMIN`; `MANAGE` và `CS` gọi `resolve-conflict` bị chặn `403` (trong khi `MANAGE` vẫn thực hiện được `cs-mark`/`bulk-approve` cho nhóm CVHT được gán; phần ủy quyền phân xử cho `MANAGE` vẫn `[CHƯA CHỐT]`).
8. **Học 2 ca qua mốc (D1 + S1a/S2c):** enrollment có mốc 3; HV học ca thứ 2 trong ngày khiến tổng FINAL `ATTENDED` cá nhân đạt/vượt mốc 3 → **đúng một** occurrence `(enrollment_id, automation_step_id)` sinh ra (không 0, không 2), và khi reconciliation thay đổi thì toàn bộ mốc của enrollment được đánh giá lại xuôi (forward re-evaluation).
9. **Phiếu đánh giá đúng enrollment (D11):** HV có 2 enrollment; GV mở report và chọn `enrollment_id` đang dạy → lưu chỉ ghi enrollment đó; từ chối nếu ngoài assignment.
10. **Feedback trạng thái riêng (D4):** liên hệ lần 1 (ĐÃ LIÊN HỆ) → chưa phản hồi (hẹn lần 2, không cap cứng 3 lần) → phản hồi (ĐÃ PHẢN HỒI) → xử lý xong (ĐÃ GIẢI QUYẾT); mỗi bước kiểm được độc lập; không suy "đã liên hệ" từ việc tạo task (bộ nhãn enum 4–5 trạng thái chi tiết và vai trò bảng `CareLog` trước `@@unique` vẫn `[CHƯA CHỐT]`).
11. **Chuyển lớp giữ lịch sử + tiến trình:** transfer EC cũ→EC mới; consumed/ordinal xuyên EC; pending delivery/care task của EC cũ xử lý theo policy đã chốt (không âm thầm mất).
12. **Nhập lịch sử không gửi ngoài ý muốn:** importer chạy ở chế độ `NO_SEND` → 0 delivery mới; nếu có MATCHED chỉ cập nhật read model/audit.
13. **Nhóm một buổi nhiều HV:** 1 ClassSession + N attendance độc lập; HV nghỉ không đổi final của HV khác; mark theo từng người.
14. **Phân công theo ngày dạy (D8):** quyền ghi kiểm tra khoảng hiệu lực `[start_date, end_date]` của GV có bao phủ `session_date` hay không — GV bị gán **sau** `session_date` không mark được ngày trước; GV đã kết thúc phân công (`active = false`) nhưng `[start_date, end_date]` bao phủ `session_date` vẫn mark được ca mình đã dạy; chỉ `active = false` kèm cả `start_date` và `end_date` đều `null` mới bị coi là thiếu bằng chứng cửa sổ hiệu lực → `403` / Admin xử lý.

## 7. Tổng hợp các hạng mục đã hoàn tất trên nhánh vs các mục còn `[CHƯA CHỐT]`

- **Đã chốt & đã triển khai trên nhánh `feature/attendance-workflows-2026-10-25`:**
  * Khóa `resolve-conflict` = `ADMIN`-only; `MANAGE` thực hiện `cs-mark`/`bulk-approve` theo nhóm CVHT được gán (D2).
  * UI GV tạo ca thực học trực tiếp (`MyTeachingSessionsPage.tsx`) + intent-key idempotency chống retry nhân bản khi vẫn cho phép 2 ca chủ đích cùng ngày.
  * Calculator chuẩn `enrollment-entitlement.ts` (K5 `consumed` và K7 `FINAL ATTENDED` cá nhân, D1/D7/D10) + đếm đủ 2 ca cùng ngày = 2 trên `AttendanceMatrix.tsx`, `dashboard.repository.ts`, `sheet-backup.service.ts`, `automation-trigger.service.ts`.
  * S1a/S2c dedup theo `(enrollment_id, automation_step_id)` + forward re-evaluation toàn enrollment trong `automation-trigger.service.ts`.
  * D3 1-1 planned-only trong `auto-attendance.service.ts`.
  * D8 kiểm tra cửa sổ phân công `[start_date, end_date]` bao phủ `session_date` trong `teacher-assignment.ts`.
  * D11 bộ chọn `enrollment_id` tường minh trên `StudentStudyReportPage.tsx`.
- **Vẫn `[CHƯA CHỐT]` (chờ quyết định tiếp theo của chủ dự án):**
  * **D6:** giá trị số cụ thể của window hạn sửa lịch sử.
  * **D4 & `CareLog`:** bộ nhãn enum chi tiết 4–5 trạng thái feedback; vai trò bảng `CareLog` (`summary per milestone` vs `per-contact history`) trước khi đặt `@@unique`.
  * **D2:** có ủy quyền phân xử `CONFLICT` cho `MANAGE` hay không.
  * **D10 Broadcast precedence flip:** chờ chủ dự án xử lý theo kết quả đối soát ngày 2026-10-26 (`05` A.1c.2).
  * **Đề xuất migration `07_PROPOSAL_MILESTONE_OCCURRENCE_MIGRATION.md`:** đang chỉnh sửa theo review của chủ dự án — **chưa chạy**.
  * **D9 (Q-POL-3):** quy tắc ánh xạ Sale↔CS.
