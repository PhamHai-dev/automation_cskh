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
- **D1 (duyệt):** mốc chăm (C) = đếm Attendance **final cá nhân có status ATTENDED** (hai ca cùng ngày = 2; một ca lớp nhiều HV = mỗi HV +1; nghỉ C **không** tăng mốc chăm). Mốc đánh giá (B) tách theo catalog phiếu đánh giá, không dùng chung số với mốc chăm. Hệ quả: `resolveEnrollmentSessionNumber` (automation) và basis milestone dashboard cần chốt nguồn đếm theo từng metric — ordinal nhắc tin giữ consumed (đúng vì đã final), mốc chăm dùng ATTENDED-final; **không** thay thế lẫn nhau tùy tiện.
- **D3 (duyệt):** **planned-only** — lịch đăng ký **không tự sinh Attendance** cho 1-1 linh hoạt (tạo/nhắc mục lịch là đủ; attendance chỉ do GV/CVHT nhập). Nhóm lịch cố định: được phép tạo **PROVISIONAL** (PENDING_TEACHER/PENDING_CS, **không bao giờ final**) theo ý kiến lớp; default dẫn xuất = PROVISIONAL (Q-003 giữ nguyên).
- **D4 (duyệt):** **không cap cứng 3 lần liên hệ** — "3 lần liên hệ" là dữ liệu workbook để theo dõi, mỗi lần liên hệ lưu theo contact riêng (nhiều contact/mốc).
- **D5 (duyệt):** due **thủ công trước**; "ba đồng hồ" hiểu là **3 căn cứ sinh việc**, không phải SLA giờ; **không build SLA engine**.
- **D6 (duyệt, kèm lưu ý):** **trước hạn chốt** — owner (GV/CVHT) tự sửa phần mình; **sau hạn chốt** — **chỉ Admin** được điều chỉnh final, buộc lý do + lịch sử. **Cửa sổ hạn (window) chưa có số cụ thể** → chưa enforce tự động; mọi sửa final hiện tại đi qua CONFLICT/audit như đã chốt một phần ở Q-004. Khi có số window, thêm branch theo D6.
- **D7 (duyệt):** giữ **1 Attendance = 1 buổi**; **không** suy 0.5X/45 phút → số quyền học. Không có domain quy đổi.
- **D8 (duyệt):** quyền nhập theo **phân công hiệu lực tại ngày dạy** (dùng `ClassTeacher.start_date/end_date` nếu dữ liệu đầy đủ); **thiếu dữ liệu** → Admin xác nhận từng trường hợp (phiếu/sửa lịch sử). Helper kiểm tra assignment theo ngày dạy là hạng mục code được phép.
- **D10 (duyệt):** **web owns operational data** (điểm danh/ý kiến/progress); **nguồn ngoài chỉ cung cấp dữ liệu bàn giao/package**; **không global last-writer-wins** — per-field authority theo nguyên tắc này; cột external (`external_remaining_sessions`) giữ nhãn đối soát riêng, **không fold** vào số hệ thống tính.
- **Không phải D:** MANAGE phân xử vẫn **chưa duyệt** (Admin-only đã code); enum chi tiết 4–5 trạng thái feedback (phần nhãn của D4) và **số window của D6** chưa chốt → code không tự áp.
- **Đổi mã định danh (2026-10-25):** tính năng "chọn enrollment tường minh trên UI" từng bị ghi nhầm **D9** trong comment frontend; **D9 dành riêng cho Sale↔CS (Q-009)**. UI picker đổi nhãn thành **D11** (phiếu chăm/đánh giá gắn đúng enrollment). Source docs giữ nguyên chữ; chỉ comment mã nguồn đổi.

### A.1c Ba bổ sung chốt 2026-10-25 (owner ruling — cập nhật trạng thái C.4 / E.3 / B.7)

1. **Ordinal "hai ca cùng ngày" = FIX ĐÃ ĐƯỢC DUYỆT** (owner ruling 2026-10-25). Tiến trình (số ca/mốc) phải đếm theo D1 đã duyệt (final ATTENDED cá nhân; hai ca cùng ngày = 2), tức phần sửa reader ở C.4 là fix đã duyệt, không còn là đề xuất chờ chính sách. **Send control** (có/bị chặn gửi tin nhắc) là quan tâm notification **tách biệt** (NO_SEND/delivery lifecycle), không được viện làm lý do hoãn phần đếm tiến trình, và ngược lại phần đếm không đổi quyết định gửi.
2. **Broadcast precedence flip = EXPLICIT OPEN ITEM — chưa chuyển.** `broadcast.service.ts:154-165` hiện vẫn **ưu tiên dữ liệu ngoài (`external_remaining_sessions`)**. Trước khi lật sang số dư do C.5 calculator tính, bắt buộc dựng **bảng đối soát** `external_remaining` vs `remaining` computed cho từng enrollment (đã có script chỉ-đọc `backend/scripts/entitlement-reconciliation-export.ts`), focus nhóm có **opening balance** hoặc lịch sử điểm danh/import chưa đủ; owner duyệt bảng đối soát xong mới bật. **Không** dùng kết quả export để tự động ghi đè hoặc backfill. **Trạng thái hôm nay (2026-10-25): "Broadcast chưa chuyển sang số dư do calculator tính; vẫn dùng ưu tiên dữ liệu ngoài."**
   - **Hạng mục mở riêng — hai vị trí lệch canonical ngoài broadcast (tách bạch *số tính toán* với *snapshot ngoài*):**
     * `backend/src/modules/imports/imports.service.ts:2352` — xuất danh sách học viên ghi `remaining_sessions: enr?.external_remaining_sessions ?? ''` (chỉ đọc **snapshot ngoài**, không có cột số dư tính toán của calculator).
     * `backend/src/modules/imports/sheet-backup.service.ts:864-866` — khi enrollment chưa có bản ghi attendance trên web, fallback dùng `external_remaining_sessions ?? Math.max(0, total_sessions − attended_previous_years)`, vừa **gộp `attended_previous_years` vào remaining** vừa **clamp `≥ 0`**, trái quy tắc canonical D10/Q-012 (calculator không fold opening balance, remaining unclamped). Cần tách rõ cột số dư tính toán và cột snapshot đối soát ngoài khi đồng bộ với quyết định lật broadcast.
3. **Phạm vi nghiệm thu luồng phân xử (B.7/D2).** **Admin** phân xử — luồng này đủ điều kiện nghiệm thu. **GV và CVHT không phân xử.** **MANAGE: ủy quyền chưa được duyệt → chưa phân xử**; trong nhóm được gán, MANAGE chỉ làm **nghĩa vụ CVHT** (nhập ý kiến/phiếu/theo dõi). "MANAGE extension" cùng các **giá trị cụ thể còn thiếu của D6 (window hạn sửa) và D4 (enum feedback)** là **scoped gaps**: ghi nhận rõ, **không chặn** nghiệm thu luồng Admin-resolution.
4. **S1a/S2c — Định danh mốc độc lập attendance + đánh giá lại khi reconciliation đổi (owner ruling 2026-10-26).** Kết hợp: (a) **dedup theo danh tính mốc** `enrollment_id + milestone_key` (ở tầng gửi: `milestone_occurrence + automation_step` = `(enrollment_id, automation_step_id)`); `attendance_id` chỉ là bằng chứng kích hoạt, đổi nội dung/version cấu hình không tự tạo quyền gửi lại mốc cũ; (b) **đánh giá lại toàn bộ các mốc của enrollment** theo căn cứ D1 (`FINAL ATTENDED` cá nhân) khi reconciliation thay đổi (5 trạng thái: đủ điều kiện chưa có occurrence → tạo một lần; đã có occurrence & căn cứ đổi → cập nhật căn cứ/giữ danh tính; hết điều kiện & chưa gửi → hủy; đã `SENT` → giữ lịch sử, không gửi lại; giảm dưới mốc rồi tăng lại → bước `SENT` không gửi lại, bước chưa gửi xử lý theo điều kiện hiện tại); worker kiểm tra lại điều kiện trước khi gửi; giữ nguyên `NO_SEND`. Nếu cần unique/bảng occurrence ở DB, trình bày **migration riêng** (`07_PROPOSAL_MILESTONE_OCCURRENCE_MIGRATION.md`), không tự chạy migration trong vòng tính năng.

### A.2 Còn thiếu, **không** được tự chốt (giữ nguyên [CXM]/[CHƯA CHỐT])
Cách tính từng mốc cụ thể (D1); quy đổi thời lượng→quyền học (D7, vd 45/60 phút, 0.5X); hạn nhập/sửa dữ liệu lịch sử (D6 — người dùng **nêu đích danh** cái này "không tự coi là đã chốt", kể cả khi OPEN_QUESTIONS Q-004 ghi RESOLVED một phần — xem Q-POL-4 bên dưới để đối chiếu); quyền phân xử có ủy quyền cho MANAGE hay không (D2 — người dùng xác nhận **Admin** phân xử nhưng **không xác nhận** MANAGE, trong khi code hiện cho cả MANAGE và CS sở hữu enrollment: `reconciliation.routes.ts:91` `requireRoles(['ADMIN','MANAGE','CS'])` + `reconciliation.service.ts:314 assertCSScope`).

### A.3 Mô hình "buổi thực học" (tách 8 khái niệm — chi tiết bảng đầy đủ ở 06 §4)
`planned (K1) → actual session record (K2) → opinion/final (K3) → attended-valid (K4) → consumed entitlement (K5) → class/content ordinal (K6) → personal care sequence (K7) → external/opening balance (K8)`.
Bất biến cần kiểm ở mọi reader/test: **K7 (căn cứ mốc chăm/đánh giá) không mặc định bằng K5 (consumed)** — một lần nghỉ C tiêu thụ quyền học nhưng không tự động được tính là "đã học đủ N buổi" cho mốc chăm; hai khái niệm này phải là hai output riêng (chưa có công thức K7 chuẩn, chờ D1).

### A.4 Rà lại auto-attendance theo mô hình mới
[CODE] auto hiện tạo `status=ATTENDED`+`source=AUTO_SCHEDULE`, không có opinion (`auto-attendance.repository.ts:235-251`); trigger bị gate `MATCHED/RESOLVED` nên phần lớn không bắn (`automation-trigger.service.ts:90-97`). [PC-USER A.6] "lịch dự kiến tự nó không chứng minh đã học/vắng" — với 1-1, **không mặc định giữ nguyên** cơ chế auto-tạo-attendance-theo-lịch; tách thành (a) *nhắc lịch/mục lịch dự kiến* (planned calendar item, không phải Attendance) và (b) *ghi attendance thật* chỉ khi GV/CVHT nhập. Lớp nhóm lịch cố định: auto tạo mục lịch vẫn hợp lý, nhưng attendance vẫn phải có ý kiến, không auto-final. **[CHƯA CHỐT]** mức (b) tự động tới đâu (D3/Q-POL-1).

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
`ClassSession.teacher_id` create validate `User.id`+role; `ClassTeacher.teacher_id` là `Teacher.id`; scope dò cả hai. Update session không validate lại. Chưa xét `ClassTeacher.start_date/end_date` khi authorize. Test Teacher.id≠User.id, assignment hết hạn, và **quyền mark xét theo phân công hiệu lực tại `session_date`, không chỉ `active` hôm nay** (06 D8, [ĐỀ-XUẤT] chưa duyệt).

### B.7 Resolve-conflict / phân xử ([PC-USER A.8] + [CODE])
`resolve-conflict` hiện `requireRoles(['ADMIN','MANAGE','CS'])` (`reconciliation.routes.ts:89-93`) + `assertCSScope` cho phép CS sở hữu enrollment tự phân xử (`reconciliation.service.ts:314`). [PC-USER] chỉ nói **"Admin phân xử"**, chưa xác nhận MANAGE/CS → **D2:** Admin phân xử đã xác nhận; code cho CS tự resolve là khoảng trống cần sửa (chưa sửa trong lượt tài liệu). Chỉ ủy quyền MANAGE còn chờ quyết định; tài liệu không coi quyền hiện tại là quyền nghiệp vụ đã duyệt. **[Nghiệm thu 2026-10-25 — A.1c(3): luồng Admin-resolution nghiệm thu độc lập; GV/CVHT không phân xử; MANAGE chưa được ủy quyền nên chưa phân xử và chỉ làm nghĩa vụ CVHT trong nhóm được gán; MANAGE extension + giá trị cụ thể D6/D4 là scoped gaps không chặn nghiệm thu này.]**

## C. Luồng A — GV ghi ca thực học + điểm danh + nội dung → CVHT đối chiếu → Admin phân xử → cập nhật tiến trình

### C.1 Cho phép GV tạo ca từ UI (đang chặn bởi UX, không phải DB)
[CODE] `MyTeachingSessionsPage.tsx:137-142`: nếu `!selectedAttendance?.id` → báo "chưa có hồ sơ điểm danh, liên hệ CSKH" — dù API `POST /classes/:classId/sessions` đã mở cho TEACHER (`class-sessions.routes.ts:18`). **Không** phải "chưa triển khai toàn bộ": backend đã có đường tạo session (kèm validate role khi create); thiếu là **UX nối tiếp** (tạo session skeleton + attendance + chuyển vào mark flow cùng màn). Phạm vi: form "Ghi ca thực học" (chọn enrollment đúng, ngày/giờ thực tế khác lịch được phép, 2-ca-cùng-ngày); reuse service/repo đã có, không viết lại pipeline. **Phụ thuộc:** không. **Tác động dữ liệu:** thêm session/attendance mới, không đổi schema nếu dùng bảng hiện có (cần kiểm `session_number` max+1 khi hai ca cùng ngày, xem C.2). **Nghiệm thu:** 06 §6.1–6.4. **P/size:** P0 (nghiệp vụ sống còn, đang chặn workflow thật của GV) / M (3–5 ngày).

### C.2 Idempotency khi lưu + guard "thêm ca 2 chủ đích" ≠ "retry nhân bản"
[CODE] `class-sessions.repository.ts:50-64` create lấy `max(session_number)+1`; manual session không có unique class/date (chỉ `class_id+session_number` và `class_schedule_id+session_date`) → bấm lặp vì lỗi mạng/retry có thể sinh 2 bản ghi không chủ đích, trong khi 2 ca **chủ đích** trong ngày phải được phép (khái niệm khác nhau, dễ nhầm). [ĐỀ-XUẤT]: idempotency key client-generated theo (actor, enrollment/EC, đề cử thời gian), server dedupe theo key này; không dùng "đã có session cùng ngày" làm khóa loại trừ. **Phụ thuộc:** C.1. **Nghiệm thu:** 06 §6.3–6.4. **P/size:** P0 / M.

### C.3 Canonical attendance write pipeline (tổng hợp từ 1.2 cũ + mode NO_SEND)
Mọi writer — manual, reconciliation, importer Excel mới (`attendance-import.service.ts`, [CODE] thiếu `handleAttendanceEvent`/`cancelPendingDeliveries` ở commit path `:191-238`), generic import cũ còn active, auto, và **luồng GV-mới-tạo-ca (C.1)** — đi qua một chuỗi: scope → side opinion → derive state → final gate → audit → downstream. **Mode tường minh bắt buộc:** `PROVISIONAL` (chờ phía kia), `FINAL` (đã khớp/đã phân xử), `NO_SEND` (import dữ liệu lịch sử — **không** tạo MessageDelivery dù MATCHED, theo phản hồi của chủ dự án ở lượt trước và yêu cầu mục 6 của lượt này). Không đặt acceptance kiểu "mọi MATCHED import đều tạo delivery" — chỉ `FINAL` ngoài mode `NO_SEND` mới nối downstream. **Phụ thuộc:** A.3/B.4; Q-POL-1 (auto), Q-POL-4 (final-edit window, xem D). **Nghiệm thu:** integration test từng writer + 06 §6.5–6.6. **P/size:** P0 / L (6–10 ngày).

### C.4 Đọc "số ca thực học" đúng khi hai ca cùng ngày (đọc-side của C.1–C.3)
[CODE] ba reader hiện gom theo ngày: `AttendanceMatrix.tsx` `processedDates`; `automation-trigger.service.ts:256-277` (count ATTENDED **trước ngày** +1); `sheet-backup.service.ts:824-827` map ngày→một record. Với [PC-USER A.3] (2 ca/ngày hợp lệ), cả ba đều **thiếu một trong hai ca** hoặc gán cùng thứ tự — đây là hệ quả tính toán ([CODE], không chỉ là [CXM] vì công thức đọc trực tiếp được). Sửa đồng bộ sau khi có C.5 (entitlement calculator); **không** sửa lẻ tẻ từng UI. **P/size:** P0 / gộp vào C.5+E. **[TRẠNG THÁI 2026-10-25: FIX ĐÃ DUYỆT — xem A.1c(1); send control tách riêng, không chặn phần đếm.]**

### C.5 Entitlement + personal-sequence read model (gộp mục 1.1+ordinal cũ)
`consumed` theo **business-rules.md §2/§3 (Q-002 RESOLVED, trích dẫn ở 06 §4 K5)**: final `ATTENDED` hoặc `ABSENT_UNAPPROVED_C`, mỗi Attendance đúng 1 buổi, xuyên EC, `remaining = total − consumed` **không clamp**. `personal sequence (K7)` cho mốc chăm/đánh giá: **tạm để trống công thức** tới khi D1/Q-POL chốt — không mặc định = consumed, và **không mặc định đếm cả C** vì [PC-USER] không xác nhận "một lần nghỉ bị tính quyền học" có nghĩa nó tính vào mốc "sau N buổi đã học" (yêu cầu mục 3 của lượt này nêu đích danh điều cần tách bạch). Cùng read model, hai output khác cột. **Phụ thuộc:** đo hiện trạng (script 0.1, xem E); fixture hai ca cùng ngày. **Nghiệm thu:** bất biến "cùng enrollment → 6+ reader cho cùng consumed; hai ca cùng ngày → count 2; pending không đổi final count; external không bao giờ overwrite computed". **P/size:** P0 / L.

### C.6 Chặn record sai lifecycle (cancel/reset)
`[CODE]` cancel session chỉ đổi status, `mark` attendance không chặn `CANCELLED` (`attendance.service.ts:204-244` kiểm tồn tại+membership, không kiểm `session.status`); hard-delete session xóa luôn attendance (`class-sessions.repository.ts:74-95`, [CODE] gồm cả soft-deleted, FK `message_deliveries` có thể chặn). Phạm vi: chặn mark theo `CANCELLED`; persist `cancel_reason` (schema đã nhận, service chưa dùng — `class-sessions.schema.ts:25-29` vs `class-sessions.service.ts:69-72`); recompute entitlement sau cancel/xóa; cân nhắc soft-delete session thay vì hard-delete (chưa quyết, phụ thuộc policy lịch sử — Q-POL-9). **P/size:** P1 / M.

## D. Quyết định còn thiếu cho Luồng B và C (chưa code, chờ chủ dự án)

| ID | Câu hỏi | [PC-USER] nói gì | [CODE] hiện tại | Phương án + trade-off (đề xuất, **chưa duyệt**) |
|---|---|---|---|---|
| Q-POL/D1 | Công thức mốc đánh giá (B) và mốc chăm (C): theo K4 (attended-valid) hay K7 (personal sequence gồm/những status nào), theo product/version, đơn vị ca cá nhân hay buổi lớp? | Không chốt (nêu đích danh "cách tính mọi mốc" là chưa chốt) | `CareMilestoneConfig.session_number` global; automation ordinal = count-ATTENDED-final-trước-ngày+1 | Catalog theo (product, version, basis) + migration mapping các mốc hiện có; cần dữ liệu mốc Kaiwa/JLPT thật từ chủ dự án hoặc xác nhận dùng workbook làm nguồn |
| Q-POL/D2 | Có ủy quyền phân xử cho MANAGE không? CVHT chỉ nhập ý kiến kiểm tra, Admin phân xử đã chốt | Nêu "Admin phân xử", **không xác nhận** MANAGE delegation | `requireRoles(['ADMIN','MANAGE','CS'])` + `assertCSScope` cho CS sở hữu | Sửa quyền CS tự phân xử theo hướng Admin phân xử đã xác nhận; nếu chưa duyệt MANAGE delegation thì không mặc định cấp. Giữ audit nhưng audit không thay authorization |
| Q-POL/D3 | Auto-attendance 1-1 sau mô hình mới: tắt hẳn, planned-only (không tạo attendance), hay giữ provisional? | "Không mặc định cần tiếp tục tự sinh attendance theo lịch" — hướng rõ nhưng chưa chốt cơ chế | Tạo `status=ATTENDED` không opinion, gate chặn trigger nên thường không gửi | Đề xuất planned-only cho 1-1 (tạo ClassSession để nhắc lịch, **không** tạo Attendance cho tới khi GV/CVHT nhập); lớp nhóm lịch cố định có thể giữ nhưng vẫn pending, không final |
| Q-POL/D4 | Số lần liên hệ feedback tối đa, nhãn trạng thái (đã liên hệ/chưa phản hồi/đã phản hồi/đã giải quyết) | Nêu "đã liên hệ khác đã nhận phản hồi khác đã giải quyết" (chưa nhập ≠ conflict) — đồng ý nguyên tắc, chưa chốt enum cụ thể | `CareTask` PENDING/DONE/CANCELLED; `CareLog.outcome` enum đơn | State machine 4–5 trạng thái ở 06 §3; map CareTask.status cũ sang trạng thái mới cần migration/backfill có điều kiện |
| Q-POL/D5 | SLA liên hệ (workbook F07/F08 nhắc mốc "3 đồng hồ" / 24h bàn giao — **đối chiếu, chưa suy thành hệ thống**) | Không nêu trong [PC-USER] lượt này | Không có SLA/timer engine | Không nên build SLA trước khi D4 chốt trạng thái |
| Q-POL/D6 | Hạn nhập/sửa lịch sử (Q-004) | **Nêu đích danh chưa chốt** | Không enforce theo tuổi bản ghi | Đề xuất window + audit, nhưng **không tự áp**; đối chiếu Q-POL-4 bên dưới |
| Q-POL/D7 | Quy đổi thời lượng (45/60', 0.5X) → số quyền học | **Nêu đích danh chưa chốt** | Không có domain | Không tự chuẩn hóa; giữ nguyên "mỗi Attendance = 1 buổi" theo Q-002 cho tới khi có rule mới |
| Q-POL/D8 | Quyền nhập bổ sung theo phân công tại ngày dạy: thiết kế lịch sử assignment/override thế nào? | Đã yêu cầu trực tiếp trong bộ nghiệm thu: xét phân công tại ngày dạy và policy sửa lịch sử, không chỉ active hôm nay | Chỉ xét `active` hiện tại, không xét `start_date/end_date` | Giữ yêu cầu xét hiệu lực tại ngày dạy; chỉ còn chốt window D6 và override khi thiếu bằng chứng phân công lịch sử. Không hỏi lại nguyên tắc ngày dạy |
| Q-POL/3 | Sale↔CS (chặn B.5) | Không nêu lại trong [PC-USER] lượt này | conflict `students.repository.ts:199-216` | Giữ nguyên phân tích cũ; ưu tiên hỏi cùng đợt D |
| Q-POL/4 | Q-004/Q-008: OPEN_QUESTIONS ghi RESOLVED (2026-10-10) vs business-rules §8/§10 ghi CHƯA CHỐT | [PC-USER] lượt này nói "hạn nhập/sửa lịch sử" **không** phải đã chốt — khớp với phía business-rules §8 hơn là OPEN_QUESTIONS dòng RESOLVED (dòng RESOLVED chỉ nói "sửa trong scope + audit + CONFLICT + hủy delivery chờ", **không** nói window) | — | Đề xuất: đối chiếu kỹ hai bản, thống nhất một câu trả lời cho phần "window/hạn" (dù OPEN_QUESTIONS đã chốt các phần khác của Q-004) — người dùng cần xác nhận, không phải tự chọn "bản nào mới hơn đúng" |

**Không hỏi lại** những gì [PC-USER] đã nêu rõ ở mục A.1 (linh hoạt 1-1, 2 ca/ngày, GV tự tạo ca, planned≠actual, ba luồng trạng thái riêng, Admin phân xử).

## E. Đồng nhất import/sync, calculator, báo cáo, export, automation (gộp 3.x cũ + E mới)

### E.1 Model mapper hợp nhất (1:1/nhóm) — P1 / M
[PC-USER A.1] giờ đã chốt 1-1 linh hoạt/nhóm cố định → **không còn cần hỏi lại Q-POL-7 cũ** (đã trả lời). Việc còn lại thuần [CODE]: sửa hard-code `ONE_TO_ONE` trong WORKBOOK (`imports.service.ts:1582-1609`), single import (`:1911-1922`), approval (`:2548`); một hàm map duy nhất dùng chung với sheet-sync (`sheet-sync.parser.ts:412-416`). Không tự suy từ [PC-USER] ra invariant "mọi schedule 1-1 phải MANUAL_ONLY" nếu chưa hỏi — lịch 1-1 **linh hoạt** theo yêu cầu, không đồng nghĩa "không có schedule nền" (Knowledge Map 8.5 nói 1-1 vẫn có thể học lặp tuần cố định). Nghiệm thu: golden workbook (redact PII) chạy qua 4 đường nhập cho cùng kết quả.

### E.2 Sheet↔Web authority và conflict winner (Q-POL-2, cũ giữ nguyên, **chưa chốt**)
`[CODE]` sync fast-path file/row-hash skip (`sheet-sync.service.ts:689-717,810-817`) nhưng không per-field authority; payload rộng có thể overwrite manual edit khi row đổi (`:902-970`). Cần Q-POL-2 trước khi code, **không** chặn E.1/E.3.

### E.3 Đưa mọi export/dashboard về C.5 read model
Sheet backup (`sheet-backup.service.ts:820-859`), broadcast var (`broadcast.service.ts:154-165` ưu tiên external), dashboard milestone (đếm mọi attendance, không deleted/state — `dashboard.repository.ts:398-429`), export students đơn giản (`imports.service.ts:2303-2318`) → cùng dùng kết quả C.5, kèm nhãn `calculated_at`/`external_only` phân biệt. **Phụ thuộc:** C.5. **Nghiệm thu:** cùng enrollment, mọi export ra cùng số (trừ cột external được ghi nhãn riêng là số đối soát, không phải số hệ thống tính). **[TRẠNG THÁI 2026-10-25: phần broadcast flip là EXPLICIT OPEN ITEM — hiện VẪN ưu tiên dữ liệu ngoài, chưa chuyển sang số do C.5 calculator tính; cần bảng đối soát external vs computed (ưu tiên enrollment có opening balance/lịch sử chưa đủ) rồi mới bật. Chiếu A.1c(2).]**

### E.4 Quality gates từ workbook — P1 / M
Mapping versioned A–E ↔ O/X/0.5X **chưa được chứng minh là ánh xạ 1-1** (01_BANG §7 chỉ ra 2 bộ mã, không có bảng mapping, không phải mặc định chúng cùng chiều nghiệp vụ — xem lại 01 bản cập nhật); import từ chối ô không parse thay vì suy "vắng"; cách ly ô lỗi `#REF!/#DIV/0!`; ID-format-date guard (01_BANG §7.5). **Phụ thuộc:** nghiệp vụ ký bảng mapping (Q-MAP).

### E.5 Approval queue E2E — P2 / S-M
Mount `ImportApprovalQueue` (component tồn tại, chưa thấy mount — [CODE] grep) hoặc công khai API-only; version precheck hiện **ngoài** transaction (`imports.service.ts:2429-2432` precheck, `:2474-2482` update `where:{id}`) → chưa phải CAS; test 2 reviewer đồng thời cùng version.

### E.5b Auto-attendance 1-1 rà lại theo D3
`[CODE]` auto tạo ATTENDED không opinion; nếu chốt D3="planned-only cho 1-1", sửa `createAttendance` không chạy cho lớp 1-1 linh hoạt, hoặc chạy nhưng ghi pending (không final) — phụ thuộc D3, chưa code.

### E.6 Renewal/học tiếp
Giữ nguyên Q-POL-10 (read-only view trước, engine sau khi C.5 ổn định). Không đổi vì [PC-USER] không nêu lại renewal ở lượt này.

## F. Song song hóa — việc không chờ Q-POL

Chạy **ngay, độc lập**, không chờ D1–D8/E.2/E.4:
- B.1 (Student ownership), B.2 (nested attendance), B.3 (export scope), B.4 (capability fixtures).
- C.6 một phần: persist `cancel_reason` (schema đã nhận, chưa dùng), validate teacher ở update session, chặn mark trên session `CANCELLED`.
- C.1+C.2 (UI GV tạo ca + idempotency) — workflow sống còn, không nên xếp sau "refactor lớn" C.3/C.5.
- E.1 (mapper hợp nhất 1:1/nhóm, nay đã có [PC-USER A.1] gỡ blocking cũ).

Phải chờ quyết định:
- C.3 pipeline đầy đủ (sau D3 auto-mode, D6/Q-POL-4 final-window) — nhưng **frame pipeline + NO_SEND mode** dựng được sớm, chỉ thiếu branch finalization theo D3.
- C.5 ordinal K7 (chờ D1).
- B.5 (chờ Q-POL-3), E.2 (chờ Q-POL-2), B.7 (chờ D2).

## Thứ tự phụ thuộc (cập nhật, bỏ các mũi tên chờ Q-POL đã có [PC-USER] gỡ)

```
B.4 ─┬─> B.1/B.2/B.3 (độc lập, chạy song song ngay)
      ├─> C.1 ─> C.2 ─┐
      └─> C.3(frame, NO_SEND) ◄─ D3,Q-POL-4 ─┴─> C.5 ─> C.4/E.3 (read model → mọi reader/export)
                                     └─> C.6
Q-POL-2 ─> E.2        Q-POL-3 ─> B.5        D1 ─> C.5(ordinal K7)        D2 ─> B.7
Q-MAP ─> E.4          E.1: hết bị Q-POL-7 chặn, làm được ngay theo [PC-USER A.1]
```

## Việc làm đầu tiên (ngay khi được phê duyệt, cập nhật theo luồng A/B/C)

1. B.4 fixtures; chạy song song B.1/B.2/B.3.
2. C.1+C.2: cho GV tạo ca thực học từ UI, gồm 2-ca-cùng-ngày, kèm idempotency key phân biệt "retry" vs "chủ đích thêm ca" (nghiệm thu 06 §6.1–6.4).
3. Dựng khung C.3 pipeline với mode `NO_SEND` sẵn cho importer/generic/auto, kể cả khi chưa chốt D3 (branch finalization để trống, mặc định `PROVISIONAL`).
4. C.5 phần `consumed/remaining` (đã đủ cơ sở theo [PC-USER]+business-rules Q-002) — chưa làm phần `personal sequence (K7)` tới khi D1 chốt.
5. Gửi bảng quyết định **mới, gọn hơn** (D1–D8 + Q-POL-2/3/4 đã cũ) — ưu tiên **D2 (ai phân xử)** và **D3 (auto 1-1)** vì chúng chặn trực tiếp Luồng A/C vừa được [PC-USER] làm rõ.

## Bộ acceptance tối thiểu (trích 06 §6, áp cho mọi mục C)
Ca khác lịch; ca khi chưa có session; 2 ca/ngày; retry không nhân bản nhưng thêm ca chủ đích được phép; thiếu một phía ≠ conflict; phân xử giữ opinion + lịch sử; quyền phân xử đúng tập role đã chốt (D2); học 2 ca qua mốc sinh đúng một việc; phiếu gắn đúng enrollment; feedback 3 trạng thái riêng; chuyển lớp giữ lịch sử+tiến trình; import `NO_SEND` không gửi; nhóm 1 buổi nhiều HV; quyền ghi xét theo phân công tại ngày dạy (D8).

## Ghi chú phiên bản ước lượng
S/M/L là ước lượng sơ bộ theo phạm vi đọc, chưa đo velocity, chưa tính công sức migration/backfill cho D1/D4/D8 (chưa rõ dữ liệu hiện có); không phải cam kết thời hạn.

## D-TRIỂN-KHAI. Hai luồng đến hạn có thể nghiệm thu riêng (không thay bảng quyết định §D)

### D-EVAL — GV điền phiếu đánh giá đến hạn (P1 / L, sơ bộ)
- **Vấn đề/bằng chứng:** report UI dùng `enrollments[0]`, save qua Student latest-enrollment; chưa thể hiện vòng đời phiếu/tác giả/mốc. CODE: StudentStudyReportPage:125-160, students.repository:444-475; PC-USER xác nhận GV điền phiếu tại mốc.
- **Kết quả:** chọn đúng enrollment → thấy việc đánh giá đến hạn → GV lưu nháp/nộp → truy lại tác giả/thời điểm/version; hoàn thành phiếu không đóng task feedback hoặc ý kiến attendance.
- **Phạm vi:** contract enrollment-scoped report + assignment authorization + author; schema/JSON có version là lựa chọn thiết kế sau spike, không ép thêm bảng chỉ vì tên nghiệp vụ.
- **Phụ thuộc:** B quyền và Teacher identity; D1/D4 cho lịch đến hạn. Form enrollment-scoped và draft/submit dựng song song, chưa bật sinh việc khi basis thiếu.
- **Dữ liệu cũ:** report JSON hiện có giữ nguyên; chỉ migrate khi mapping enrollment xác định; author không biết phải UNKNOWN/legacy, không gán GV hiện tại làm tác giả cũ.
- **Nghiệm thu/test:** E2E GV nhận việc → nhập bài/đánh giá → nộp đúng enrollment; HV 2 enrollment không ghi chéo; retry không nhân phiếu; không có quyền 403 không đổi dữ liệu; chỉnh final attendance không tự xóa phiếu đã nộp.

### D-FEEDBACK — CVHT lấy feedback và theo dõi (P1 / L, sơ bộ)
- **Vấn đề/bằng chứng:** CareTask đã có assignee/due/status, CareLog có outcome gồm NO_RESPONSE, nhưng không có state hoàn thành tách contact/response/resolution. CODE schema:864-944; care.service:244-291; care.repository:257-299. PC-USER xác nhận ba giai đoạn riêng.
- **Kết quả:** mốc đủ điều kiện → một việc đúng CVHT → ghi lần liên hệ → phản hồi/không phản hồi → follow-up/đóng xử lý với lịch sử.
- **Phạm vi:** reuse CareTask/CareLog; contract state + contact attempts + follow-up owner/due/result; deadline bắt buộc hay tùy chọn và enum là đề xuất cần duyệt. Task/mốc/notification/delivery là 4 sự kiện tách biệt.
- **Phụ thuộc:** D1/D4/D5 cho mốc/SLA; có thể triển khai contact/response/resolution thủ công với task được giao trước khi bật due generation.
- **Dữ liệu cũ:** DONE không tự map thành đã phản hồi/đã giải quyết; giữ legacy completion + evidence thiếu; các task/log trùng cần report trước merge, không auto-delete.
- **Nghiệm thu/test:** contacted + NO_RESPONSE vẫn có thể theo dõi; phản hồi cần hỗ trợ tạo việc tiếp; replay cùng milestone/request không nhân task, nhưng cuộc gọi mới chủ đích có attempt riêng; 2 ca qua mốc sinh đúng 1 việc theo basis fixture đã duyệt; zero outbound khi NO_SEND hoặc không có notification rule.

### Hợp đồng chung cho mọi hạng mục B–E
Các acceptance ghi trên là test **chưa chạy**, không phải pass. Mỗi ticket khi triển khai phải có: fixture/endpoint UI→API→service→DB và before/after diff, kiểm quyền, retry/concurrency, migration dry-run/rollback và kết quả người vận hành đọc lại. B sửa quyền/Teacher identity: dữ liệu cũ giữ nguyên, xuất báo cáo mapping/ambiguity trước backfill. C actual/derive: không biến AUTO_SCHEDULE cũ thành actual/final; ca thiếu giờ vẫn lưu provenance, không suy giờ dự kiến là giờ đã dạy. E reader/import: chỉ reproject dữ kiện có bằng chứng, NO_SEND default với historical import; mapping A–E và O/X/0.5X theo **chiều dữ liệu riêng**, không cần ép bảng một-một.

## Trích quyết định nguồn và phạm vi ảnh hưởng

Các registry ngoài AI_REVIEW giữ nguyên; không chọn nguồn chỉ vì mới hơn.

| Nguồn | Nội dung quyết định được trích | Phạm vi ảnh hưởng / mâu thuẫn |
|---|---|---|
| business-rules:21-42; Q-002 | ATTENDED/C trừ đúng 1 buổi khi MATCHED/RESOLVED; external chỉ đối soát; không sinh event từ tổng số | Chuẩn consumed/final, không chốt mọi mốc hoặc duration conversion. Final không bảo đảm outbound khi NO_SEND/không có rule |
| Q-004, OPEN_QUESTIONS:10 | “cho phép sửa final trong scope, bắt buộc audit. Nếu hai nguồn lệch thì về CONFLICT; hủy delivery còn chờ, không hoàn tác delivery đã gửi” | Registry §8 vẫn CHƯA CHỐT role/window/override/audit/rollback. Q-004 không nêu số ngày khóa; user mới nói rõ window chưa chốt. Không hỏi lại Admin phân xử |
| Q-008, OPEN_QUESTIONS:14 | “Rule riêng Enrollment override rule mặc định Package khi cùng session number; chỉ tạo một delivery” | Registry §10 vẫn CHƯA CHỐT precedence. Chỉ chặn message-rule selection; không chặn GV tạo ca, CVHT review, form đánh giá/feedback thủ công |
| Q-011/Q-013, OPEN_QUESTIONS:17,19 | “chỉ match ClassSession có sẵn” / “chỉ ghi ClassSession đã tồn tại trong scope” | business-rules:179 cho tạo session thiếu, code importer thực sự tạo. User đã cho GV tạo actual+opinion khi chưa có prior session; không tự chốt heuristic import. Historical attendance có evidence vẫn được tạo, NO_SEND |
| Q-003 vs business-rules:28,159 | Q-003 số dương cho một buổi; registry integer N là N session riêng | Cần hợp nhất contract import N trước backfill, không chặn hai ca thật chủ đích |
| Q-009 vs business-rules:145-147,161,169 | Q-009 Sale=CS; §15 Sale độc lập/scope cs_id; §16/17 vẫn nói Sale phụ trách | Mâu thuẫn nguồn; không dùng substring tên làm authorization; B.1/B.2/Teacher identity không chờ toàn bộ mapping Sale |

**Ngày dạy:** user đã xác nhận quyền nhập bổ sung theo assignment tại ngày dạy; không đưa nguyên tắc này trở lại danh sách chưa chốt. Còn thiếu window và override khi assignment cũ thiếu evidence.
**Parallel:** sửa quyền không chờ calculator/mốc. Bỏ day-collapse và xuất đủ hai session có thể kiểm độc lập; chỉ sinh việc theo mốc cần basis duyệt. Khung tạo ca cần B.4/B.6 authorization/identity nhưng không cần công thức milestone.
