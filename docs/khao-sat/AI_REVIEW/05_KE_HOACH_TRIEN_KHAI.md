# AI_REVIEW — Kế hoạch triển khai theo giai đoạn (chưa thực thi, cập nhật 24/10 sau khi nhận nguyên tắc mới từ chủ dự án)

**Nguyên tắc:** thứ tự theo phụ thuộc nghiệp vụ-kỹ thuật, không theo độ dễ code. Đây chỉ là kế hoạch; mọi script đọc DB và test ghi fixture cần môi trường, tài khoản và phạm vi được phê duyệt riêng, không mặc định được phép trên DB đang chạy. Mỗi mục gồm: vấn đề & đích, phạm vi, phụ thuộc/quyết định thiếu, tác động dữ liệu, tiêu chí nghiệm thu, độ ưu tiên/kích thước. Không mục nào được coi là đã phê duyệt; mục có `BLOCKED-BY-POLICY` cần trả lời của chủ dự án trước khi code.

**Ký hiệu mới trong bản cập nhật này:** [PC-USER] = nguyên tắc chủ dự án nêu trực tiếp trong lượt 24/10 (đã ghi nhận, không còn phải đi hỏi lại); [ĐỀ-XUẤT] = thiết kế của tôi, chưa duyệt; [CODE] = quan sát tĩnh; [CXM] = cần kiểm chứng runtime. Chi tiết nghiệp vụ từng luồng ở `06_DAC_TA_LUONG_VAN_HANH_GV_CVHT_ADMIN.md`.

## A. Quy tắc đã xác nhận, quy tắc còn thiếu, mô hình "buổi thực học"

### A.1 Đã chốt (không cần hỏi lại, [PC-USER] lượt này)
1. 1-1 linh hoạt; thời gian import chỉ tham khảo, **không** phải điều kiện điểm danh.
2. GV chủ động ghi ca thực học sau khi dạy, **kể cả khi chưa có session dự kiến**.
3. Hai ca liên tiếp cùng ngày của một HV = hai bản ghi hợp lệ, được phép.
4. Phải lưu ngày thực học và thời điểm nhập; **không** dùng "mỗi ngày một bản ghi" để chặn.
5. Nhóm: lịch cố định, một buổi lớp → nhiều điểm danh HV.
6. Lịch dự kiến ≠ bằng chứng đã học/đã vắng.
7. Ba luồng (điểm danh, phiếu đánh giá, feedback chăm sóc) có trạng thái hoàn thành độc lập; "chưa nhập" ≠ "conflict"; "đã liên hệ" ≠ "đã phản hồi" ≠ "đã giải quyết".
8. Admin phân xử khi GV/CVHT bất đồng.

### A.1b DUYỆT QUYẾT ĐỊNH — chủ dự án chốt 2026-10-25: "duyệt D1/D3/D4/D5/D6/D7/D8/D10 theo đề xuất"
Bảng phương án mục D (lượt 23/10, gắn nhãn [ĐỀ-XUẤT]) được **duyệt nguyên văn theo đề xuất**, cụ thể:
- **D1 (duyệt):** mốc chăm (C) = đếm Attendance **final cá nhân có status ATTENDED** (hai ca cùng ngày = 2; một ca lớp nhiều HV = mỗi HV +1; nghỉ C **không** tăng mốc chăm). Mốc đánh giá (B) tách theo catalog phiếu đánh giá, không dùng chung số với mốc chăm. Hệ quả: `[ĐÃ ĐƯỢC THAY THẾ bởi A.1c.1 + A.1c.4 (S1a/S2c)]` — cả **ordinal nhắc tin** (`resolveEnrollmentSessionNumber` trong `automation-trigger.service.ts`) lẫn **tiến trình mốc chăm** (dashboard/care milestone) đều tính thống nhất theo **D1/K7 = các bản ghi Attendance FINAL cá nhân có `status = ATTENDED` sắp theo `(session_date, created_at, id)`** (hai ca cùng ngày = 2; nghỉ `ABSENT_UNAPPROVED_C` tính vào `consumed` K5 nhưng **không** tính vào K7); định danh occurrence của mốc gửi tin là **`(enrollment_id, automation_step_id)`** và được **đánh giá lại xuôi (forward re-evaluation) trên toàn bộ enrollment** mỗi khi kết quả đối soát (`reconciliation_state` / `status`) thay đổi.
- **D3 (duyệt):** **planned-only** — lịch đăng ký **không tự sinh Attendance** cho 1-1 linh hoạt (tạo/nhắc mục lịch là đủ; attendance chỉ do GV/CVHT nhập). Nhóm lịch cố định: được phép tạo **PROVISIONAL** (PENDING_TEACHER/PENDING_CS, **không bao giờ final**) theo ý kiến lớp; default dẫn xuất = PROVISIONAL (Q-003 giữ nguyên).
- **D4 (duyệt nguyên tắc cap / còn mục mở):** **không cap cứng 3 lần liên hệ** — "3 lần liên hệ" là dữ liệu workbook để theo dõi, mỗi lần liên hệ lưu theo contact riêng (nhiều contact/mốc). Phần **bộ nhãn enum 4–5 trạng thái feedback** và **vai trò bảng `CareLog` (`summary per milestone` vs `per-contact history` trước khi thêm `@@unique`)** vẫn **`[CHƯA CHỐT]`**.
- **D5 (duyệt):** due **thủ công trước**; "ba đồng hồ" hiểu là **3 căn cứ sinh việc**, không phải SLA giờ; **không build SLA engine**.
- **D6 (duyệt nguyên tắc, kèm lưu ý `[CHƯA CHỐT]` số window):** **trước hạn chốt** — owner (GV/CVHT) tự sửa phần mình; **sau hạn chốt** — **chỉ Admin** được điều chỉnh final, buộc lý do + lịch sử. **Cửa sổ hạn (window) cụ thể vẫn `[CHƯA CHỐT]`** → chưa enforce tự động; mọi sửa final hiện tại đi qua CONFLICT/audit như đã chốt một phần ở Q-004. Khi có số window, thêm branch theo D6.
- **D7 (duyệt):** giữ **1 Attendance = 1 buổi**; **không** suy 0.5X/45 phút → số quyền học. Không có domain quy đổi.
- **D8 (duyệt):** quyền nhập/ghi kiểm tra **khoảng hiệu lực phân công `[start_date, end_date]` của GV có bao phủ `session_date` hay không** — **kể cả khi `active` hiện tại là `false` vì phân công đã kết thúc sau ngày dạy đó**; chỉ trường hợp `active = false` mà **cả `start_date` lẫn `end_date` đều `null`** mới bị coi là thiếu bằng chứng cửa sổ hiệu lực → trả `403` / chuyển Admin xử lý (đã triển khai tại `teacher-assignment.ts`).
- **D10 (duyệt nguyên tắc / còn mở bước lật Broadcast):** **web owns operational data** (điểm danh/ý kiến/progress); **nguồn ngoài chỉ cung cấp dữ liệu bàn giao/package**; **không global last-writer-wins** — per-field authority theo nguyên tắc này; cột external (`external_remaining_sessions`) giữ nhãn đối soát riêng, **không fold** vào số hệ thống tính (đã triển khai calculator chuẩn tại `enrollment-entitlement.ts`). Riêng **bước lật precedence của Broadcast** vẫn **`[CHƯA CHỐT]`** — chờ xử lý theo bảng đối soát tại A.1c.2.
- **Các mục vẫn `[CHƯA CHỐT]` (không tự áp):** (1) **D2** ủy quyền phân xử cho MANAGE (Admin-only đã code; MANAGE chỉ làm nghĩa vụ CVHT `cs-mark`/`bulk-approve` theo nhóm được gán); (2) **D6** giá trị window cụ thể; (3) **D4** bộ nhãn enum chi tiết 4–5 trạng thái feedback; (4) **vai trò bảng `CareLog`** (`summary per milestone` vs `per-contact history`) trước khi thêm bất kỳ `@@unique` nào; (5) **D10 broadcast precedence flip** (chờ hành động của chủ dự án trên bảng đối soát A.1c.2); (6) **đề xuất migration `07_PROPOSAL_MILESTONE_OCCURRENCE_MIGRATION.md`** (đang chỉnh sửa theo review chủ dự án — **chưa chạy**).
- **Đổi mã định danh (2026-10-25):** tính năng "chọn enrollment tường minh trên UI" từng bị ghi nhầm **D9** trong comment frontend; **D9 dành riêng cho Sale↔CS (Q-009)**. UI picker đổi nhãn thành **D11** (phiếu chăm/đánh giá gắn đúng enrollment, đã triển khai trên `StudentStudyReportPage`). Source docs giữ nguyên chữ; chỉ comment mã nguồn đổi.

### A.1c Ba bổ sung chốt 2026-10-25 (owner ruling — cập nhật trạng thái C.4 / E.3 / B.7)

1. **Ordinal "hai ca cùng ngày" = FIX ĐÃ ĐƯỢC DUYỆT** (owner ruling 2026-10-25). Tiến trình (số ca/mốc) phải đếm theo D1 đã duyệt (final ATTENDED cá nhân; hai ca cùng ngày = 2), tức phần sửa reader ở C.4 là fix đã duyệt, không còn là đề xuất chờ chính sách. **Send control** (có/bị chặn gửi tin nhắc) là quan tâm notification **tách biệt** (NO_SEND/delivery lifecycle), không được viện làm lý do hoãn phần đếm tiến trình, và ngược lại phần đếm không đổi quyết định gửi.
2. **Broadcast precedence flip = EXPLICIT OPEN ITEM — chưa chuyển.** `broadcast.service.ts:154-165` hiện vẫn **ưu tiên dữ liệu ngoài (`external_remaining_sessions`)**. Trước khi lật sang số dư do C.5 calculator tính, bắt buộc dựng **bảng đối soát** `external_remaining` vs `remaining` computed cho từng enrollment (đã có script chỉ-đọc `backend/scripts/entitlement-reconciliation-export.ts`), focus nhóm có **opening balance** hoặc lịch sử điểm danh/import chưa đủ; owner duyệt bảng đối soát xong mới bật. **Không** dùng kết quả export để tự động ghi đè hoặc backfill. **Trạng thái hôm nay (2026-10-25): "Broadcast chưa chuyển sang số dư do calculator tính; vẫn dùng ưu tiên dữ liệu ngoài."**
   - **Kết quả đối soát chỉ-đọc (owner chạy 2026-10-26, DB thật, 2.390 enrollment / 2.373 HV):** sẽ đổi số nếu lật: **1.095 HV**; enrollment lệch (delta≠0): **1.100**, trong đó **1.095 thuộc FINISHED/PAUSED** (snapshot ngoài thấp hơn total do lịch sử tiêu thụ trước khi có web); **chỉ 5 enrollment STUDYING lệch** (HV_001 ext 30/total 36; 427895059 ext 0/total 10 với APY 35; 427897525 ext 1/APY 37; 10056821 ext 9/APY 26; 420217224 ext −2/APY 44). Nguyên nhân gốc: **`attendance_rows_final = 0 trên toàn bộ 2.390 enrollment`** — web chưa có bản ghi điểm danh FINAL nào (298 hàng raw đều pending/conflict; 313 STUDYING có raw attendance nhưng chưa chốt hai phía), nên `consumed` tính toán = 0 mọi nơi và `remaining computed` luôn = `total_sessions`. **Kết luận đối soát: dữ liệu nền CHƯA sẵn sàng để lật** — lật lúc này sẽ gửi "còn nguyên số buổi hợp đồng" cho gần như mọi HV đang học, bỏ qua toàn bộ tiêu thụ thực tế trên sheet, và chạm đúng vùng cutoff `attended_previous_years` chưa chốt (K8). Điều kiện lật lại: hoàn tất nhập lịch sử + hai phía xác nhận (row thành FINAL), chạy lại export, owner duyệt bảng mới. Không backfill từ export.
   - **Hạng mục mở riêng — hai vị trí lệch canonical ngoài broadcast (tách bạch *số tính toán* với *snapshot ngoài*):**
     * `backend/src/modules/imports/imports.service.ts:2352` — xuất danh sách học viên ghi `remaining_sessions: enr?.external_remaining_sessions ?? ''` (chỉ đọc **snapshot ngoài**, không có cột số dư tính toán của calculator).
     * `backend/src/modules/imports/sheet-backup.service.ts:864-866` — khi enrollment chưa có bản ghi attendance trên web, fallback dùng `external_remaining_sessions ?? Math.max(0, total_sessions − attended_previous_years)`, vừa **gộp `attended_previous_years` vào remaining** vừa **clamp `≥ 0`**, trái quy tắc canonical D10/Q-012 (calculator không fold opening balance, remaining unclamped). Cần tách rõ cột số dư tính toán và cột snapshot đối soát ngoài khi đồng bộ với quyết định lật broadcast.
3. **Phạm vi nghiệm thu luồng phân xử (B.7/D2).** **Admin** phân xử — luồng này đủ điều kiện nghiệm thu. **GV và CVHT không phân xử.** **MANAGE: ủy quyền chưa được duyệt → chưa phân xử**; trong nhóm được gán, MANAGE chỉ làm **nghĩa vụ CVHT** (nhập ý kiến/phiếu/theo dõi). "MANAGE extension" cùng các **giá trị cụ thể còn thiếu của D6 (window hạn sửa) và D4 (enum feedback)** là **scoped gaps**: ghi nhận rõ, **không chặn** nghiệm thu luồng Admin-resolution.
4. **S1a/S2c — Định danh mốc độc lập attendance + đánh giá lại khi reconciliation đổi (owner ruling 2026-10-26).** Kết hợp: (a) **dedup theo danh tính mốc** `enrollment_id + milestone_key` (ở tầng gửi: `milestone_occurrence + automation_step` = `(enrollment_id, automation_step_id)`); `attendance_id` chỉ là bằng chứng kích hoạt, đổi nội dung/version cấu hình không tự tạo quyền gửi lại mốc cũ; (b) **đánh giá lại toàn bộ các mốc của enrollment** theo căn cứ D1 (`FINAL ATTENDED` cá nhân sắp theo `(session_date, created_at, id)`) khi reconciliation thay đổi (5 trạng thái: đủ điều kiện chưa có occurrence → tạo một lần; đã có occurrence & căn cứ đổi → cập nhật căn cứ/giữ danh tính; hết điều kiện & chưa gửi → hủy; đã `SENT` → giữ lịch sử, không gửi lại; giảm dưới mốc rồi tăng lại → bước `SENT` không gửi lại, bước chưa gửi xử lý theo điều kiện hiện tại); worker kiểm tra lại điều kiện trước khi gửi; giữ nguyên `NO_SEND` (đã triển khai tại `automation-trigger.service.ts`). Nếu cần unique/bảng occurrence ở DB, trình bày **migration riêng** (`07_PROPOSAL_MILESTONE_OCCURRENCE_MIGRATION.md` — **`[CHƯA CHỐT]` đang chỉnh sửa theo review chủ dự án, chưa chạy migration**); đồng thời cần chốt **vai trò bảng `CareLog` (`summary per milestone` vs `per-contact history`) `[CHƯA CHỐT]`** trước khi thêm bất kỳ `@@unique` nào.

### A.2 Đối chiếu các điểm đã chốt 2026-10-25 vs các điểm vẫn `[CHƯA CHỐT]`
- **`[ĐÃ CHỐT 2026-10-25 — xem A.1b/A.1c]`:**
  * **D1 (cách tính mốc & ordinal):** mốc chăm (C) và ordinal nhắc tin đều tính theo **K7 = các bản ghi Attendance FINAL cá nhân có `status = ATTENDED` sắp theo `(session_date, created_at, id)`** (hai ca cùng ngày = 2; nghỉ `ABSENT_UNAPPROVED_C` tính vào K5 `consumed` nhưng **không** tính vào K7); định danh occurrence là `(enrollment_id, automation_step_id)`, đánh giá lại xuôi toàn enrollment khi reconciliation đổi (`S1a/S2c`). Mốc đánh giá (B) tách riêng theo catalog phiếu đánh giá.
  * **D3 (auto-attendance 1-1):** **planned-only** cho lớp 1-1 linh hoạt (`ClassModelType.ONE_TO_ONE` chỉ tạo `ClassSession` nhắc lịch, không tự sinh `Attendance`; lớp nhóm tạo `PROVISIONAL` chờ ý kiến).
  * **D4 (phần giới hạn số lần liên hệ):** **không cap cứng 3 lần liên hệ** (mỗi lần liên hệ lưu theo contact riêng).
  * **D5 (SLA/due):** due **thủ công trước**, "ba đồng hồ" là 3 căn cứ sinh việc, **không build SLA engine**.
  * **D7 (quy đổi thời lượng):** giữ **1 Attendance = 1 buổi**, không quy đổi 45/60 phút hay 0.5X sang quyền học.
  * **D8 (phân công theo ngày dạy):** quyền ghi kiểm tra khoảng hiệu lực `[start_date, end_date]` của GV có bao phủ `session_date` hay không (kể cả khi `active = false` vì phân công đã kết thúc sau ngày dạy; chỉ `active = false` kèm cả `start_date` và `end_date` đều `null` mới coi là thiếu bằng chứng cửa sổ hiệu lực → `403` / Admin xử lý).
  * **D10 (nguyên tắc sở hữu dữ liệu & calculator):** web sở hữu dữ liệu vận hành; calculator chuẩn trong `enrollment-entitlement.ts` không gộp `external_remaining_sessions` hay `attended_previous_years`.
- **`[CHƯA CHỐT]` — tuyệt đối không tự áp:**
  * **D6 — giá trị số cụ thể của cửa sổ hạn sửa (window):** nguyên tắc trước hạn owner sửa / sau hạn Admin sửa đã duyệt, nhưng con số window cụ thể vẫn `[CHƯA CHỐT]` (xem Q-POL-4 bên dưới).
  * **D4 — bộ nhãn enum chi tiết 4–5 trạng thái feedback:** vẫn `[CHƯA CHỐT]`.
  * **Vai trò bảng `CareLog` (`summary per milestone` vs `per-contact history`):** vẫn `[CHƯA CHỐT]` trước khi đặt bất kỳ `@@unique` nào.
  * **D2 — ủy quyền phân xử cho MANAGE:** Admin phân xử đã chốt và code trên nhánh đã khóa `resolve-conflict` = Admin-only (`reconciliation.routes.ts` / `reconciliation.service.ts`), còn MANAGE chỉ thực hiện nghĩa vụ CVHT (`cs-mark`/`bulk-approve`) theo nhóm được gán; phần **ủy quyền MANAGE phân xử CONFLICT** vẫn `[CHƯA CHỐT]`.
  * **D10 — thời điểm lật precedence của Broadcast (`broadcast.service.ts:154-165`):** vẫn `[CHƯA CHỐT]`, giữ ưu tiên `external_remaining_sessions` chờ hành động của chủ dự án trên bảng đối soát 2026-10-26 tại A.1c.2.
  * **Đề xuất migration `07_PROPOSAL_MILESTONE_OCCURRENCE_MIGRATION.md`:** vẫn `[CHƯA CHỐT]`, đang chỉnh sửa theo review chủ dự án — **không chạy migration lúc này**.
  * **D9 / Q-POL-3 (Sale↔CS)** và **Q-MAP (bảng ánh xạ mã điểm danh)**: vẫn `[CHƯA CHỐT]`.

### A.3 Mô hình "buổi thực học" (tách 8 khái niệm — chi tiết bảng đầy đủ ở 06 §4)
`planned (K1) → actual session record (K2) → opinion/final (K3) → attended-valid (K4) → consumed entitlement (K5) → class/content ordinal (K6) → personal care sequence (K7) → external/opening balance (K8)`.
Bất biến cần kiểm ở mọi reader/test: **K7 (căn cứ mốc chăm/automation) không bằng K5 (consumed)** — một lần nghỉ `ABSENT_UNAPPROVED_C` tiêu thụ quyền học (K5) nhưng **không** tính là buổi đã học cho mốc chăm (K7); hai khái niệm này là hai output riêng trong `enrollment-entitlement.ts` (`[ĐÃ CHỐT 2026-10-25 — xem A.1b/A.1c]`: K7 = các bản ghi Attendance FINAL cá nhân có `status = ATTENDED` sắp theo `(session_date, created_at, id)`, hai ca cùng ngày = 2; mốc đánh giá B tách riêng theo catalog phiếu đánh giá).

### A.4 Rà lại auto-attendance theo mô hình mới
`[Baseline main]`: auto từng tạo `status=ATTENDED`+`source=AUTO_SCHEDULE`, không có opinion (`auto-attendance.repository.ts:235-251`); trigger bị gate `MATCHED/RESOLVED` nên phần lớn không bắn (`automation-trigger.service.ts:90-97`). Theo `[PC-USER A.6]` ("lịch dự kiến tự nó không chứng minh đã học/vắng") và **`[ĐÃ CHỐT 2026-10-25 — D3, xem A.1b]`**: (a) **lớp 1-1 linh hoạt = planned-only** (`ClassModelType.ONE_TO_ONE` chỉ tạo mục lịch `ClassSession` để nhắc lịch, **không** tự sinh `Attendance`; attendance chỉ phát sinh khi GV/CVHT nhập — đã triển khai tại `auto-attendance.service.ts`); (b) **lớp nhóm lịch cố định** được phép tạo bản ghi `PROVISIONAL` (`PENDING_TEACHER`/`PENDING_CS`, không bao giờ auto-final).

## B. Quyền truy cập và phân tách danh tính (sửa song song, không chờ refactor lớn)

### B.1 Ownership Student detail/update (R01/R05) — P0 / M (3–5 ngày)
Vấn đề: `[CODE]` `students.controller.ts:33,59` gọi service không truyền actor; `students.repository.ts:115-158,353-578` không scope, update chọn `enrollment ORDER BY id desc` rồi sửa Class/ClassSchedule/ClassTeacher dùng chung. Phạm vi: actor-aware service, enrollment chọn tường minh, field allowlist. Nghiệm thu (fixture CS-A/CS-B, HV nhiều enrollment): GET/PATCH ngoài quyền → 403, không đổi dữ liệu; audit ghi lần từ chối. **Không phụ thuộc** bất kỳ Q-POL nào — làm được ngay sau khi có fixture B.4.

### B.2 Nested attendance GET khóa cặp class/session (R02) — P0 / S (≤1 ngày)
`[CODE]` `attendance.repository.ts:6` `findBySession(classId, sessionId)` chỉ lọc `class_session_id`, bỏ `classId`. Sửa: assert cặp trước query; cùng invariant detail/write.

### B.3 Export scope (mới, [CODE] lượt này)
`imports.routes.ts:18` mở `GET /export/students` cho ADMIN/MANAGE/CS/TEACHER; `imports.service.ts:2281-2284` chỉ filter khi `isCS` thuần, các role khác → `scope undefined` → toàn bộ. Test bắt buộc (đã nêu acceptance ở bản 03 cuối): TEACHER chỉ lớp mình dạy (assignment ngày dạy, xem 6 §6.14), MANAGE theo phạm vi được chốt, CS theo `enrollment.cs_id`; kiểm cả nội dung file, không chỉ HTTP status. **Không phụ thuộc** Q-POL.

### B.4 Capability matrix thực nghiệm (tiền đề cho mọi mục ở Giai đoạn B)
Supertest fixtures 4 role; seed teacher dùng email zod-hợp-lệ (`teacher@example.test`, không đụng dữ liệu thật). **Không** phải bước "refactor lớn" — là bước test độc lập, chạy song song với B.1–B.3, nhưng B.1–B.3 nên có fixture này trước khi merge.

### B.5 Sale↔CS (R04) — **BLOCKED-BY-Q-POL-3**
`students.repository.ts:199-216` match `sale_name` substring trên mọi User, không check role CS → có thể gán `cs_id` sai người; list enrollment CS dùng OR `cs_id`/sale name/email, detail chỉ `cs_id` (bất nhất scope, [CODE]). Chờ Q-POL-3 (xem D bên dưới) trước khi sửa, vì hướng sửa (bỏ substring + mapping qua `sale_id`) phụ thuộc câu trả lời "Sale có phải CS không".

### B.6 Teacher/User namespace + phân công theo ngày ([CODE] 02 §4; 06 §6.14)
`[Baseline main]`: `ClassSession.teacher_id` create validate `User.id`+role; `ClassTeacher.teacher_id` là `Teacher.id`; scope dò cả hai. Update session không validate lại. Chưa xét `ClassTeacher.start_date/end_date` khi authorize. **`[ĐÃ CHỐT 2026-10-25 — D8, xem A.1b; ĐÃ TRIỂN KHAI tại teacher-assignment.ts]`**: quyền ghi kiểm tra **khoảng hiệu lực phân công `[start_date, end_date]` có bao phủ `session_date` hay không** — **kể cả khi `active` hiện tại là `false` vì phân công đã kết thúc sau ngày dạy đó**; chỉ trường hợp `active = false` mà **cả `start_date` lẫn `end_date` đều `null`** mới bị coi là thiếu bằng chứng cửa sổ hiệu lực → trả `403` / chuyển Admin xử lý. Test `Teacher.id ≠ User.id`, assignment đã hết hạn nhưng bao phủ `session_date`, và assignment thiếu bằng chứng cửa sổ hiệu lực.

### B.7 Resolve-conflict / phân xử ([PC-USER A.8] + [CODE])
`[Baseline main]`: `resolve-conflict` mở `requireRoles(['ADMIN','MANAGE','CS'])` (`reconciliation.routes.ts:89-93`) + `assertCSScope` cho phép CS sở hữu enrollment tự phân xử (`reconciliation.service.ts:314`). **`[ĐÃ CHỐT 2026-10-25 — A.1c(3); ĐÃ TRIỂN KHAI trên nhánh]`**: `resolve-conflict` đã khóa **chỉ `ADMIN`** (`reconciliation.routes.ts` / `reconciliation.service.ts`); GV và CVHT không phân xử; **MANAGE chỉ làm nghĩa vụ CVHT (`cs-mark`/`bulk-approve`) theo nhóm được gán**, chưa được phân xử. Phần **ủy quyền phân xử cho MANAGE (D2)** cùng **giá trị cụ thể D6 (window hạn sửa)** và **D4 (bộ nhãn enum 4–5 trạng thái feedback + vai trò bảng `CareLog`)** là **`[CHƯA CHỐT]`** (scoped gaps, không chặn nghiệm thu luồng Admin-resolution).

## C. Luồng A — GV ghi ca thực học + điểm danh + nội dung → CVHT đối chiếu → Admin phân xử → cập nhật tiến trình

### C.1 Cho phép GV tạo ca từ UI (đang chặn bởi UX, không phải DB)
`[Baseline main]`: `MyTeachingSessionsPage.tsx:137-142`: nếu `!selectedAttendance?.id` → báo "chưa có hồ sơ điểm danh, liên hệ CSKH" — dù API `POST /classes/:classId/sessions` đã mở cho TEACHER (`class-sessions.routes.ts:18`). **Không** phải "chưa triển khai toàn bộ": backend đã có đường tạo session (kèm validate role khi create); thiếu là **UX nối tiếp** (tạo session skeleton + attendance + chuyển vào mark flow cùng màn). Phạm vi: form "Ghi ca thực học" (chọn enrollment đúng, ngày/giờ thực tế khác lịch được phép, 2-ca-cùng-ngày); reuse service/repo đã có, không viết lại pipeline. **`[ĐÃ TRIỂN KHAI trên nhánh]`**: UI GV tạo ca thực học trực tiếp kèm chọn ca/ngày thực tế và 2 ca cùng ngày. **Phụ thuộc:** không. **Nghiệm thu:** 06 §6.1–6.4. **P/size:** P0 / M (3–5 ngày).

### C.2 Idempotency khi lưu + guard "thêm ca 2 chủ đích" ≠ "retry nhân bản"
`[Baseline main]`: `class-sessions.repository.ts:50-64` create lấy `max(session_number)+1`; manual session không có unique class/date (chỉ `class_id+session_number` và `class_schedule_id+session_date`) → bấm lặp vì lỗi mạng/retry có thể sinh 2 bản ghi không chủ đích, trong khi 2 ca **chủ đích** trong ngày phải được phép (khái niệm khác nhau, dễ nhầm). **`[ĐÃ CHỐT & ĐÃ TRIỂN KHAI trên nhánh]`**: intent-key / idempotency key client-generated theo `(actor, enrollment/EC, đề cử thời gian)`, server dedupe theo key này; không dùng "đã có session cùng ngày" làm khóa loại trừ. **Phụ thuộc:** C.1. **Nghiệm thu:** 06 §6.3–6.4. **P/size:** P0 / M.

### C.3 Canonical attendance write pipeline (tổng hợp từ 1.2 cũ + mode NO_SEND)
Mọi writer — manual, reconciliation, importer Excel mới (`attendance-import.service.ts`), generic import cũ còn active, auto, và **luồng GV-mới-tạo-ca (C.1)** — đi qua một chuỗi: scope → side opinion → derive state → final gate → audit → downstream. **Mode tường minh bắt buộc:** `PROVISIONAL` (chờ phía kia), `FINAL` (đã khớp/đã phân xử), `NO_SEND` (import dữ liệu lịch sử — **không** tạo MessageDelivery dù MATCHED, theo phản hồi của chủ dự án ở lượt trước và yêu cầu mục 6 của lượt này). Không đặt acceptance kiểu "mọi MATCHED import đều tạo delivery" — chỉ `FINAL` ngoài mode `NO_SEND` mới nối downstream. **Phụ thuộc:** A.3/B.4; `D3` (auto 1-1 planned-only — **`[ĐÃ CHỐT 2026-10-25 — xem A.1b]`**); `D6/Q-POL-4` (nguyên tắc trước/sau hạn đã duyệt, **giá trị số window cụ thể vẫn `[CHƯA CHỐT]`**). **Nghiệm thu:** integration test từng writer + 06 §6.5–6.6. **P/size:** P0 / L (6–10 ngày).

### C.4 Đọc "số ca thực học" đúng khi hai ca cùng ngày (đọc-side của C.1–C.3)
`[Baseline main]`: ba reader gom theo ngày: `AttendanceMatrix.tsx` `processedDates`; `automation-trigger.service.ts:256-277` (count ATTENDED **trước ngày** +1); `sheet-backup.service.ts:824-827` map ngày→một record. Với [PC-USER A.3] (2 ca/ngày hợp lệ), cả ba đều **thiếu một trong hai ca** hoặc gán cùng thứ tự. **`[ĐÃ CHỐT 2026-10-25 — xem A.1b/A.1c; ĐÃ TRIỂN KHAI trên nhánh]`**: matrix/dashboard/sheet-backup và automation đếm **2 ca cùng ngày = 2**; automation dùng K7 = FINAL `ATTENDED` cá nhân sắp theo `(session_date, created_at, id)`, kết hợp S1a/S2c (occurrence `(enrollment_id, automation_step_id)` + forward re-eval, `automation-trigger.service.ts`). **Send control** (có/bị chặn gửi tin nhắc) là quan tâm notification **tách biệt** (NO_SEND/delivery lifecycle), không được viện làm lý do hoãn phần đếm tiến trình, và ngược lại phần đếm không đổi quyết định gửi.

### C.5 Entitlement + personal-sequence read model (gộp mục 1.1+ordinal cũ)
`consumed` theo **business-rules.md §2/§3 (Q-002 RESOLVED, trích dẫn ở 06 §4 K5)**: final `ATTENDED` hoặc `ABSENT_UNAPPROVED_C`, mỗi Attendance đúng 1 buổi, xuyên EC, `remaining = total − consumed` **không clamp**. `personal sequence (K7)` cho mốc chăm và automation nhắc tin: **`[ĐÃ CHỐT 2026-10-25 — D1, xem A.1b/A.1c; ĐÃ TRIỂN KHAI tại enrollment-entitlement.ts]`** = đếm các bản ghi Attendance **FINAL cá nhân có `status = ATTENDED` sắp theo `(session_date, created_at, id)`** (hai ca cùng ngày = 2; nghỉ `ABSENT_UNAPPROVED_C` tính vào `consumed` K5 nhưng **không** tính vào K7; mốc đánh giá B tách riêng theo catalog phiếu đánh giá). Cùng read model (`enrollment-entitlement.ts`), hai output tách biệt (`consumedSessions` vs `careMilestoneSessions`). **Nghiệm thu:** bất biến "cùng enrollment → mọi reader cho cùng consumed & K7; hai ca cùng ngày → count 2; pending không đổi final count; external không bao giờ overwrite computed". **P/size:** P0 / L.

### C.6 Chặn record sai lifecycle (cancel/reset)
`[CODE]` cancel session chỉ đổi status, `mark` attendance không chặn `CANCELLED` (`attendance.service.ts:204-244` kiểm tồn tại+membership, không kiểm `session.status`); hard-delete session xóa luôn attendance (`class-sessions.repository.ts:74-95`, [CODE] gồm cả soft-deleted, FK `message_deliveries` có thể chặn). Phạm vi: chặn mark theo `CANCELLED`; persist `cancel_reason` (schema đã nhận, service chưa dùng — `class-sessions.schema.ts:25-29` vs `class-sessions.service.ts:69-72`); recompute entitlement sau cancel/xóa; cân nhắc soft-delete session thay vì hard-delete (chưa quyết, phụ thuộc policy lịch sử — Q-POL-9). **P/size:** P1 / M.

## D. Bảng quyết định D1–D10 và các điểm còn `[CHƯA CHỐT]` (cập nhật 2026-10-26)

| ID | Câu hỏi | Quyết định chủ dự án (2026-10-25 / 2026-10-26) | Trạng thái code trên nhánh `feature/attendance-workflows-2026-10-25` | Trạng thái chốt & phần còn `[CHƯA CHỐT]` |
|---|---|---|---|---|
| Q-POL/D1 | Công thức mốc đánh giá (B) và mốc chăm (C): theo K4 (attended-valid) hay K7 (personal sequence gồm những status nào), đơn vị ca cá nhân hay buổi lớp? | **`[ĐÃ CHỐT 2026-10-25 — xem A.1b/A.1c]`:** Mốc chăm (C) và ordinal nhắc tin đều theo **K7 = Attendance FINAL cá nhân có `status = ATTENDED` sắp theo `(session_date, created_at, id)`** (2 ca cùng ngày = 2; nghỉ `ABSENT_UNAPPROVED_C` không tăng mốc chăm). Định danh occurrence `(enrollment_id, automation_step_id)` + đánh giá lại xuôi toàn enrollment khi reconciliation đổi (`S1a/S2c`). Mốc đánh giá (B) tách theo catalog phiếu đánh giá | Đã code tại `enrollment-entitlement.ts`, `automation-trigger.service.ts`, `dashboard.repository.ts`, `AttendanceMatrix.tsx`, `sheet-backup.service.ts` | **`[ĐÃ CHỐT]`** công thức K7 + S1a/S2c. Riêng đề xuất migration DB `07_PROPOSAL_MILESTONE_OCCURRENCE_MIGRATION.md` đang **`[CHƯA CHỐT]`** (đang chỉnh sửa theo review chủ dự án — chưa chạy) |
| Q-POL/D2 | Có ủy quyền phân xử cho MANAGE không? CVHT chỉ nhập ý kiến kiểm tra, Admin phân xử đã chốt | **`[ĐÃ CHỐT Admin-only / CHƯA CHỐT ủy quyền MANAGE]`:** Admin phân xử đã chốt; MANAGE chỉ làm nghĩa vụ CVHT trong nhóm được gán | `resolve-conflict` đã khóa **chỉ `ADMIN`** (`reconciliation.routes.ts` / `reconciliation.service.ts`); MANAGE có quyền `cs-mark`/`bulk-approve` theo nhóm được gán (Baseline main: mở `ADMIN/MANAGE/CS` + `assertCSScope`) | **`[ĐÃ CHỐT]`** Admin phân xử; phần **ủy quyền phân xử cho MANAGE** vẫn **`[CHƯA CHỐT]`** |
| Q-POL/D3 | Auto-attendance 1-1 sau mô hình mới: tắt hẳn, planned-only (không tạo attendance), hay giữ provisional? | **`[ĐÃ CHỐT 2026-10-25 — xem A.1b]`:** **planned-only** cho lớp 1-1 linh hoạt (chỉ tạo `ClassSession` nhắc lịch, **không** tự sinh `Attendance`; attendance chỉ do GV/CVHT nhập); lớp nhóm lịch cố định tạo `PROVISIONAL` (`PENDING_TEACHER`/`PENDING_CS`, không bao giờ auto-final) | Đã code tại `auto-attendance.service.ts` (`ClassModelType.ONE_TO_ONE` không tạo `Attendance`; lớp nhóm tạo `PROVISIONAL`) | **`[ĐÃ CHỐT]`** |
| Q-POL/D4 | Số lần liên hệ feedback tối đa, nhãn trạng thái (đã liên hệ/chưa phản hồi/đã phản hồi/đã giải quyết), vai trò bảng `CareLog` | **`[ĐÃ CHỐT không cap cứng 3 lần liên hệ — xem A.1b]`:** "3 lần liên hệ" là dữ liệu theo dõi workbook, mỗi lần liên hệ lưu theo contact riêng | `CareTask` PENDING/DONE/CANCELLED; `CareLog.outcome` enum đơn | **`[ĐÃ CHỐT]`** không cap cứng 3 lần liên hệ. Vẫn **`[CHƯA CHỐT]`**: (a) **bộ nhãn enum chi tiết 4–5 trạng thái feedback**; (b) **vai trò bảng `CareLog` (`summary per milestone` vs `per-contact history`) trước khi đặt bất kỳ `@@unique` nào** |
| Q-POL/D5 | SLA liên hệ (workbook F07/F08 nhắc mốc "3 đồng hồ" / 24h bàn giao) | **`[ĐÃ CHỐT 2026-10-25 — xem A.1b]`:** due **thủ công trước**; "ba đồng hồ" hiểu là **3 căn cứ sinh việc**, không phải SLA giờ; **không build SLA engine** | Không build SLA/timer engine; giữ due thủ công | **`[ĐÃ CHỐT]`** |
| Q-POL/D6 | Hạn nhập/sửa lịch sử (Q-004) | **`[ĐÃ CHỐT nguyên tắc — xem A.1b / CHƯA CHỐT số window]`:** trước hạn chốt owner (GV/CVHT) tự sửa phần mình; sau hạn chốt chỉ Admin điều chỉnh final kèm lý do + lịch sử | Chưa enforce theo tuổi bản ghi vì chưa có số window; mọi sửa final hiện đi qua CONFLICT/audit theo Q-004 | Nguyên tắc trước/sau hạn **`[ĐÃ CHỐT]`**; **giá trị số cụ thể của window vẫn `[CHƯA CHỐT]`** (đối chiếu Q-POL-4) |
| Q-POL/D7 | Quy đổi thời lượng (45/60', 0.5X) → số quyền học | **`[ĐÃ CHỐT 2026-10-25 — xem A.1b]`:** giữ **1 Attendance = 1 buổi**; **không** quy đổi 0.5X/45 phút sang số quyền học | Calculator chuẩn `enrollment-entitlement.ts` tính đúng 1 Attendance final (`ATTENDED`/`ABSENT_UNAPPROVED_C`) = 1 buổi | **`[ĐÃ CHỐT]`** |
| Q-POL/D8 | Quyền nhập bổ sung theo phân công tại ngày dạy: thiết kế lịch sử assignment/override thế nào? | **`[ĐÃ CHỐT 2026-10-25 — xem A.1b]`:** quyền ghi kiểm tra khoảng hiệu lực `[start_date, end_date]` của GV có bao phủ `session_date` hay không (kể cả khi `active` hiện tại là `false` vì phân công đã kết thúc sau ngày dạy; chỉ khi `active = false` mà cả `start_date` và `end_date` đều `null` mới coi là thiếu bằng chứng cửa sổ hiệu lực → `403` / Admin xử lý) | Đã code tại `teacher-assignment.ts` và áp dụng cho luồng ghi ca/điểm danh của GV (Baseline main: chỉ xét `active` hiện tại) | **`[ĐÃ CHỐT]`** quy tắc kiểm tra cửa sổ `[start_date, end_date]` theo `session_date`; chỉ còn chờ số window của D6 (**`[CHƯA CHỐT]`**) |
| Q-POL/D10 | Quyền sở hữu dữ liệu vận hành Sheet↔Web và số dư `remaining` | **`[ĐÃ CHỐT nguyên tắc 2026-10-25 — xem A.1b]`:** **web owns operational data** (điểm danh/ý kiến/progress); nguồn ngoài chỉ cung cấp dữ liệu bàn giao/package; không global last-writer-wins; `external_remaining_sessions` giữ nhãn đối soát riêng, không fold vào calculator | Đã code calculator chuẩn `enrollment-entitlement.ts` + script đối soát chỉ-đọc `entitlement-reconciliation-export.ts`; `broadcast.service.ts:154-165` vẫn giữ ưu tiên `external_remaining_sessions` | Nguyên tắc & calculator **`[ĐÃ CHỐT]`**; **bước lật precedence của Broadcast (cùng 2 vị trí snapshot ngoài ở `imports.service.ts:2352` và `sheet-backup.service.ts:864-866`) vẫn `[CHƯA CHỐT]`** chờ hành động của chủ dự án trên bảng đối soát 2026-10-26 tại A.1c.2 |
| Q-POL/3 (D9) | Sale↔CS (chặn B.5) | Chưa chốt trong các lượt vừa qua | `students.repository.ts:199-216` substring match; UI chọn enrollment đã tách mã **D11** (`StudentStudyReportPage`) | **`[CHƯA CHỐT]`** (riêng D9 Sale↔CS; không nhầm với D11 enrollment picker đã code) |
| Q-POL/4 | Q-004/Q-008: OPEN_QUESTIONS ghi RESOLVED (2026-10-10) vs business-rules §8/§10 ghi CHƯA CHỐT | Nguyên tắc D6 (trước hạn owner sửa, sau hạn Admin sửa) đã duyệt ở A.1b; riêng **con số ngày/giờ của window** chưa chốt | Giữ cơ chế Q-004 (sửa trong scope + audit + lệch→CONFLICT + hủy delivery chờ) | **`[CHƯA CHỐT]`** con số cụ thể của window D6 và precedence rule Q-008 |

**Không hỏi lại** những gì chủ dự án đã chốt ở mục A.1, A.1b và A.1c (linh hoạt 1-1, 2 ca/ngày, GV tự tạo ca, planned≠actual, ba luồng trạng thái riêng, Admin phân xử, D1/D3/D4-cap/D5/D6-nguyên-tắc/D7/D8/D10-nguyên-tắc, S1a/S2c).

## E. Đồng nhất import/sync, calculator, báo cáo, export, automation (gộp 3.x cũ + E mới)

### E.1 Model mapper hợp nhất (1:1/nhóm) — P1 / M
[PC-USER A.1] giờ đã chốt 1-1 linh hoạt/nhóm cố định → **không còn cần hỏi lại Q-POL-7 cũ** (đã trả lời). Việc còn lại thuần [CODE]: sửa hard-code `ONE_TO_ONE` trong WORKBOOK (`imports.service.ts:1582-1609`), single import (`:1911-1922`), approval (`:2548`); một hàm map duy nhất dùng chung với sheet-sync (`sheet-sync.parser.ts:412-416`). Không tự suy từ [PC-USER] ra invariant "mọi schedule 1-1 phải MANUAL_ONLY" nếu chưa hỏi — lịch 1-1 **linh hoạt** theo yêu cầu, không đồng nghĩa "không có schedule nền" (Knowledge Map 8.5 nói 1-1 vẫn có thể học lặp tuần cố định). Nghiệm thu: golden workbook (redact PII) chạy qua 4 đường nhập cho cùng kết quả.

### E.2 Sheet↔Web authority và conflict winner (D10 nguyên tắc đã chốt; chi tiết per-field sync & lật Broadcast còn mở)
**`[ĐÃ CHỐT nguyên tắc D10 ngày 2026-10-25 — xem A.1b]`**: web sở hữu dữ liệu vận hành (điểm danh/ý kiến/progress), nguồn ngoài chỉ cung cấp dữ liệu bàn giao/package, không global last-writer-wins, cột `external_remaining_sessions` giữ nhãn đối soát riêng và không fold vào số hệ thống tính. Trong `sheet-sync.service.ts:689-717,810-817,902-970`, phần áp quy tắc per-field chi tiết cho từng cột sync đồng bộ với bước lật Broadcast (A.1c.2) vẫn **`[CHƯA CHỐT]`**, không chặn E.1/C.5.

### E.3 Đưa mọi export/dashboard về C.5 read model
Sheet backup (`sheet-backup.service.ts`), dashboard milestone (`dashboard.repository.ts`), attendance matrix (`AttendanceMatrix.tsx`) và automation (`automation-trigger.service.ts`) trên nhánh đã nối về calculator chuẩn C.5 (`enrollment-entitlement.ts`: `consumed` K5 và `careMilestoneSessions` K7 tách bạch, đếm đủ 2 ca cùng ngày = 2). **Nghiệm thu:** cùng enrollment, mọi reader tính toán ra cùng số (trừ cột external được ghi nhãn riêng là số đối soát, không phải số hệ thống tính). **[TRẠNG THÁI 2026-10-26 — EXPLICIT OPEN ITEM `[CHƯA CHỐT]`: phần lật precedence của Broadcast (`broadcast.service.ts:154-165` hiện VẪN ưu tiên `external_remaining_sessions`) và 2 vị trí lệch canonical ngoài broadcast (`imports.service.ts:2352` chỉ xuất `external_remaining_sessions`; `sheet-backup.service.ts:864-866` fallback `external_remaining_sessions ?? Math.max(0, total_sessions − attended_previous_years)` khi chưa có attendance trên web) CHƯA chuyển — chờ chủ dự án quyết định hướng xử lý dữ liệu nền sau kết quả đối soát ngày 2026-10-26 tại A.1c.2.]**

### E.4 Quality gates từ workbook — P1 / M
Mapping versioned A–E ↔ O/X/0.5X **chưa được chứng minh là ánh xạ 1-1** (01_BANG §7 chỉ ra 2 bộ mã, không có bảng mapping, không phải mặc định chúng cùng chiều nghiệp vụ — xem lại 01 bản cập nhật); import từ chối ô không parse thay vì suy "vắng"; cách ly ô lỗi `#REF!/#DIV/0!`; ID-format-date guard (01_BANG §7.5). **Phụ thuộc:** nghiệp vụ ký bảng mapping (Q-MAP — **`[CHƯA CHỐT]`**).

### E.5 Approval queue E2E — P2 / S-M
Mount `ImportApprovalQueue` (component tồn tại, chưa thấy mount — [CODE] grep) hoặc công khai API-only; CAS claim trước khi materialize dữ liệu con và chỉ map P2002 của `external_id` sang 409 đã được sửa trên nhánh (`802d57b`); test 2 reviewer đồng thời cùng version.

### E.5b Auto-attendance 1-1 theo D3
**`[ĐÃ CHỐT 2026-10-25 & ĐÃ TRIỂN KHAI trên nhánh — xem A.1b]`**: D3 = **planned-only cho lớp 1-1 linh hoạt**; `auto-attendance.service.ts` chỉ tạo `ClassSession` nhắc lịch và **bỏ qua tạo `Attendance`** đối với `ClassModelType.ONE_TO_ONE` (attendance chỉ phát sinh khi GV/CVHT nhập), còn lớp nhóm lịch cố định tạo bản ghi `PROVISIONAL` (`PENDING_TEACHER`/`PENDING_CS`, không bao giờ auto-final).

### E.6 Renewal/học tiếp
Giữ nguyên Q-POL-10 (read-only view trước, engine sau khi C.5 ổn định). Không đổi vì [PC-USER] không nêu lại renewal ở lượt này.

## F. Song song hóa — hạng mục đã gỡ phụ thuộc vs hạng mục còn `[CHƯA CHỐT]`

Đã có đủ quyết định (A.1, A.1b, A.1c) để triển khai và nghiệm thu độc lập:
- B.1 (Student ownership), B.2 (nested attendance), B.3 (export scope), B.4 (capability fixtures), B.6 (quyền ghi theo cửa sổ phân công `[start_date, end_date]` bao phủ `session_date` — **D8 đã chốt & đã code**), B.7 (Admin-only `resolve-conflict` + MANAGE nghĩa vụ CVHT theo nhóm — **đã chốt & đã code**).
- C.1+C.2 (UI GV tạo ca thực học + intent-key idempotency phân biệt retry với 2 ca cùng ngày — **đã chốt & đã code**).
- C.3+E.5b (pipeline trạng thái + mode `NO_SEND` + auto 1-1 planned-only theo **D3 đã chốt & đã code**).
- C.4+C.5 (calculator `enrollment-entitlement.ts` cho K5 `consumed` và K7 `FINAL ATTENDED` cá nhân + đếm 2 ca cùng ngày = 2 + S1a/S2c occurrence `(enrollment_id, automation_step_id)` & forward re-eval toàn enrollment — **D1/D7/D10-calculator đã chốt & đã code**).
- D11 (chọn `enrollment_id` tường minh trên `StudentStudyReportPage` — **đã chốt & đã code**).
- E.1 (mapper hợp nhất 1:1/nhóm theo [PC-USER A.1]).

Vẫn phải chờ quyết định **`[CHƯA CHỐT]`** trước khi áp vào code/DB:
- **D6 (con số cụ thể của window hạn sửa lịch sử)** — chưa enforce tự động theo tuổi bản ghi.
- **D4 (bộ nhãn enum chi tiết 4–5 trạng thái feedback)** và **vai trò bảng `CareLog` (`summary per milestone` vs `per-contact history`) trước khi đặt bất kỳ `@@unique` nào**.
- **D2 (ủy quyền phân xử CONFLICT cho MANAGE)** — hiện giữ Admin-only.
- **D10 Broadcast precedence flip (`broadcast.service.ts:154-165`) + 2 vị trí snapshot ngoài (`imports.service.ts:2352`, `sheet-backup.service.ts:864-866`)** — chờ chủ dự án duyệt hướng xử lý sau kết quả đối soát ngày 2026-10-26 tại A.1c.2.
- **Đề xuất migration `07_PROPOSAL_MILESTONE_OCCURRENCE_MIGRATION.md`** — đang chỉnh sửa theo review chủ dự án, **chưa chạy migration**.
- **B.5 (chờ D9 / Q-POL-3 Sale↔CS)**, **E.4 (chờ Q-MAP)**.

## Thứ tự phụ thuộc (cập nhật 2026-10-26 sau khi D1/D3/D4-cap/D5/D7/D8/D10-calculator và S1a/S2c đã chốt)

```
B.4 ─┬─> B.1/B.2/B.3 + B.6(D8 date-window) + B.7(Admin-only resolve)
      ├─> C.1 ─> C.2 ─┐
      └─> C.3(NO_SEND + D3 planned-only 1-1) ─┴─> C.5(K5 consumed + K7 D1) ─> C.4/E.3 (matrix/dashboard/backup/S1a-S2c automation)
                                                  └─> C.6
[CHƯA CHỐT]:
  D6(window số cụ thể) ─> branch khóa sửa lịch sử theo tuổi bản ghi
  D2(MANAGE delegation) ─> mở rộng quyền resolve-conflict (nếu duyệt)
  D4(enum 4-5 trạng thái) + CareLog role ─> state machine feedback & unique constraint
  D10(bảng đối soát A.1c.2) ─> lật Broadcast precedence + tách cột snapshot ngoài
  07_PROPOSAL_MILESTONE_OCCURRENCE_MIGRATION ─> chỉ chạy sau khi chủ dự án duyệt bản chỉnh sửa
  Q-POL-3(D9) ─> B.5        Q-MAP ─> E.4
```

## Trạng thái các bước ưu tiên (cập nhật 2026-10-26)

1. B.4 fixtures; B.1/B.2/B.3; B.6 (**D8** kiểm tra `[start_date, end_date]` bao phủ `session_date` tại `teacher-assignment.ts`); B.7 (`resolve-conflict` Admin-only, MANAGE `cs-mark`/`bulk-approve` theo nhóm).
2. C.1+C.2: GV tạo ca thực học từ UI, gồm 2-ca-cùng-ngày, kèm intent-key idempotency phân biệt "retry" vs "chủ đích thêm ca" (nghiệm thu 06 §6.1–6.4).
3. C.3+E.5b: pipeline với mode `NO_SEND` và **D3** planned-only cho lớp 1-1 linh hoạt (`auto-attendance.service.ts`).
4. C.4+C.5: `enrollment-entitlement.ts` tính cả `consumed/remaining` (K5, **D7/D10**) lẫn `personal sequence (K7)` (**D1** = FINAL `ATTENDED` cá nhân sắp theo `(session_date, created_at, id)`), nối với S1a/S2c occurrence `(enrollment_id, automation_step_id)` + forward re-eval toàn enrollment trong `automation-trigger.service.ts`.
5. Các mục giữ **`[CHƯA CHỐT]`** chờ chủ dự án quyết định tiếp: **D6** (số window), **D4** (enum 4–5 trạng thái feedback), **vai trò bảng `CareLog`** trước khi đặt `@@unique`, **D2** (ủy quyền MANAGE phân xử), **D10 Broadcast precedence flip** (theo kết quả đối soát A.1c.2), và **migration `07`** (đang chỉnh sửa theo review, chưa chạy).

## Bộ acceptance tối thiểu (trích 06 §6, áp cho mọi mục C)
Ca khác lịch; ca khi chưa có session; 2 ca/ngày; retry không nhân bản nhưng thêm ca chủ đích được phép; thiếu một phía ≠ conflict; phân xử giữ opinion + lịch sử; quyền phân xử đúng tập role đã chốt (D2: Admin-only, MANAGE chỉ làm nghĩa vụ CVHT theo nhóm); học 2 ca qua mốc sinh đúng một việc (S1a/S2c); phiếu gắn đúng enrollment (D11); feedback 3 trạng thái riêng; chuyển lớp giữ lịch sử+tiến trình; import `NO_SEND` không gửi; nhóm 1 buổi nhiều HV; quyền ghi xét theo cửa sổ phân công `[start_date, end_date]` bao phủ `session_date` (D8).

## Ghi chú phiên bản ước lượng
S/M/L là ước lượng sơ bộ theo phạm vi đọc, chưa đo velocity, chưa tính công sức migration/backfill cho các mục còn mở; không phải cam kết thời hạn.

## D-TRIỂN-KHAI. Hai luồng đến hạn có thể nghiệm thu riêng (không thay bảng quyết định §D)

### D-EVAL — GV điền phiếu đánh giá đến hạn (P1 / L, sơ bộ)
- **Vấn đề/bằng chứng:** `[Baseline main]` report UI dùng `enrollments[0]`, save qua Student latest-enrollment; chưa thể hiện vòng đời phiếu/tác giả/mốc (`StudentStudyReportPage:125-160`, `students.repository:444-475`). **`[Đã sửa D11 trên nhánh]`**: `StudentStudyReportPage` đã có bộ chọn `enrollment_id` tường minh để gắn phiếu đúng enrollment.
- **Kết quả:** chọn đúng enrollment → thấy việc đánh giá đến hạn → GV lưu nháp/nộp → truy lại tác giả/thời điểm/version; hoàn thành phiếu không đóng task feedback hoặc ý kiến attendance.
- **Phạm vi:** contract enrollment-scoped report + assignment authorization (theo D8 `[start_date, end_date]` bao phủ ngày dạy) + author; schema/JSON có version là lựa chọn thiết kế sau spike, không ép thêm bảng chỉ vì tên nghiệp vụ.
- **Phụ thuộc:** B quyền và Teacher identity; **D1 đã chốt** tách mốc đánh giá (B) theo catalog phiếu đánh giá riêng, không dùng chung số với mốc chăm (C).
- **Dữ liệu cũ:** report JSON hiện có giữ nguyên; chỉ migrate khi mapping enrollment xác định; author không biết phải UNKNOWN/legacy, không gán GV hiện tại làm tác giả cũ.
- **Nghiệm thu/test:** E2E GV nhận việc → nhập bài/đánh giá → nộp đúng enrollment; HV 2 enrollment không ghi chéo; retry không nhân phiếu; không có quyền 403 không đổi dữ liệu; chỉnh final attendance không tự xóa phiếu đã nộp.

### D-FEEDBACK — CVHT lấy feedback và theo dõi (P1 / L, sơ bộ)
- **Vấn đề/bằng chứng:** CareTask đã có assignee/due/status, CareLog có outcome gồm NO_RESPONSE, nhưng không có state hoàn thành tách contact/response/resolution. CODE schema:864-944; care.service:244-291; care.repository:257-299. PC-USER xác nhận ba giai đoạn riêng.
- **Kết quả:** mốc đủ điều kiện → một việc đúng CVHT → ghi lần liên hệ → phản hồi/không phản hồi → follow-up/đóng xử lý với lịch sử.
- **Phạm vi:** reuse CareTask/CareLog; contract state + contact attempts + follow-up owner/due/result. Task/mốc/notification/delivery là 4 sự kiện tách biệt.
- **Phụ thuộc:** **`[ĐÃ CHỐT 2026-10-25]`**: D1 (mốc chăm K7 = FINAL `ATTENDED` cá nhân), D4 (không cap cứng 3 lần liên hệ), D5 (due thủ công trước, không build SLA engine). **`[CHƯA CHỐT]`**: bộ nhãn enum chi tiết 4–5 trạng thái feedback và **vai trò bảng `CareLog` (`summary per milestone` vs `per-contact history`) trước khi thêm bất kỳ `@@unique` nào**.
- **Dữ liệu cũ:** DONE không tự map thành đã phản hồi/đã giải quyết; giữ legacy completion + evidence thiếu; các task/log trùng cần report trước merge, không auto-delete.
- **Nghiệm thu/test:** contacted + NO_RESPONSE vẫn có thể theo dõi; phản hồi cần hỗ trợ tạo việc tiếp; replay cùng milestone/request không nhân task, nhưng cuộc gọi mới chủ đích có attempt riêng; 2 ca qua mốc sinh đúng 1 việc theo basis fixture đã duyệt; zero outbound khi NO_SEND hoặc không có notification rule.

### Hợp đồng chung cho mọi hạng mục B–E
Các acceptance ghi trên là tiêu chí kiểm thử xuyên suốt. Mỗi ticket khi triển khai phải có: fixture/endpoint UI→API→service→DB và before/after diff, kiểm quyền, retry/concurrency, migration dry-run/rollback và kết quả người vận hành đọc lại. B sửa quyền/Teacher identity: dữ liệu cũ giữ nguyên, xuất báo cáo mapping/ambiguity trước backfill. C actual/derive: không biến AUTO_SCHEDULE cũ thành actual/final; ca thiếu giờ vẫn lưu provenance, không suy giờ dự kiến là giờ đã dạy. E reader/import: chỉ reproject dữ kiện có bằng chứng, NO_SEND default với historical import; mapping A–E và O/X/0.5X theo **chiều dữ liệu riêng**, không cần ép bảng một-một.

## Trích quyết định nguồn và phạm vi ảnh hưởng

Các registry ngoài AI_REVIEW giữ nguyên; không chọn nguồn chỉ vì mới hơn.

| Nguồn | Nội dung quyết định được trích | Phạm vi ảnh hưởng / mâu thuẫn |
|---|---|---|
| business-rules:21-42; Q-002 | ATTENDED/C trừ đúng 1 buổi khi MATCHED/RESOLVED; external chỉ đối soát; không sinh event từ tổng số | Chuẩn K5 consumed/final; kết hợp D1/D7/D10 đã chốt ngày 2026-10-25 (K7 = FINAL ATTENDED cá nhân; 1 Attendance = 1 buổi; calculator không fold external/opening balance). Final không bảo đảm outbound khi NO_SEND/không có rule |
| Q-004, OPEN_QUESTIONS:10 | “cho phép sửa final trong scope, bắt buộc audit. Nếu hai nguồn lệch thì về CONFLICT; hủy delivery còn chờ, không hoàn tác delivery đã gửi” | Nguyên tắc D6 (trước hạn owner sửa, sau hạn Admin sửa) đã chốt 2026-10-25; riêng **giá trị số cụ thể của window vẫn `[CHƯA CHỐT]`**. Không hỏi lại Admin phân xử |
| Q-008, OPEN_QUESTIONS:14 | “Rule riêng Enrollment override rule mặc định Package khi cùng session number; chỉ tạo một delivery” | Registry §10 vẫn CHƯA CHỐT precedence. Chỉ chặn message-rule selection; không chặn GV tạo ca, CVHT review, form đánh giá/feedback thủ công |
| Q-011/Q-013, OPEN_QUESTIONS:17,19 | “chỉ match ClassSession có sẵn” / “chỉ ghi ClassSession đã tồn tại trong scope” | business-rules:179 cho tạo session thiếu, code importer thực sự tạo. User đã cho GV tạo actual+opinion khi chưa có prior session; không tự chốt heuristic import. Historical attendance có evidence vẫn được tạo, NO_SEND |
| Q-003 vs business-rules:28,159 | Q-003 số dương cho một buổi; registry integer N là N session riêng | Cần hợp nhất contract import N trước backfill, không chặn hai ca thật chủ đích |
| Q-009 vs business-rules:145-147,161,169 | Q-009 Sale=CS; §15 Sale độc lập/scope cs_id; §16/17 vẫn nói Sale phụ trách | Mâu thuẫn nguồn (D9 `[CHƯA CHỐT]`); không dùng substring tên làm authorization; B.1/B.2/Teacher identity không chờ toàn bộ mapping Sale |

**Ngày dạy (D8 — `[ĐÃ CHỐT 2026-10-25]`):** quyền ghi của GV kiểm tra khoảng hiệu lực phân công `[start_date, end_date]` có bao phủ `session_date` hay không (kể cả khi `active` hiện tại là `false` vì phân công đã kết thúc sau ngày dạy đó; chỉ trường hợp `active = false` mà cả `start_date` lẫn `end_date` đều `null` mới bị coi là thiếu bằng chứng cửa sổ hiệu lực → `403` / Admin xử lý; đã triển khai trong `teacher-assignment.ts`). Chỉ còn thiếu giá trị số cụ thể của window D6 (`[CHƯA CHỐT]`).
**Parallel:** sửa quyền, bỏ day-collapse (đếm đủ 2 ca cùng ngày = 2), calculator K5/K7 (`enrollment-entitlement.ts`) và S1a/S2c milestone occurrence (`automation-trigger.service.ts`) đã chốt và triển khai trên nhánh; riêng bước lật Broadcast precedence (A.1c.2) và migration DB `07` vẫn `[CHƯA CHỐT]`.
