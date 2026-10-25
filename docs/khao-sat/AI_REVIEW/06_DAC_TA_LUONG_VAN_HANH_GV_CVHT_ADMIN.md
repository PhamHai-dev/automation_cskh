# AI_REVIEW — Đặc tả luồng vận hành hằng ngày GV–CVHT–Admin

**Baseline:** `main = cbf78c337b8ff534a6d9b3ea5d63cf626cd44b17`, cập nhật 2026-10-24.
**Ký hiệu nguồn:**
- **[PC-USER]** = nguyên tắc chủ dự án nêu trực tiếp trong lượt 24/10 (đưa vào yêu cầu, không còn là suy luận).
- **[CODE]** = đọc code/schema/UI trực tiếp tại baseline.
- **[ĐỀ-XUẤT]** = thiết kế của tôi, chưa được duyệt.
- **[CXM]** = cần kiểm chứng runtime/fixture hoặc cần quyết định.
Không trộn [ĐỀ-XUẤT] vào [PC-USER]. Mọi acceptance ở file này là **tiêu chí kiểm thử**, chưa chạy.

## 0. Các nguyên tắc [PC-USER] đã chốt trong lượt này

1. **Lớp 1-1 lịch linh hoạt.** Thời gian import ban đầu chỉ là tham khảo/điều phối, **không phải điều kiện bắt buộc để điểm danh**.
2. **GV chủ động ghi nhận ca thực học** sau khi dạy, kể cả khi khác lịch đăng ký hoặc **chưa có session tạo trước**.
3. **Hai ca liên tiếp cùng ngày** của một HV là hợp lệ; GV được tạo **hai bản ghi buổi học riêng**.
4. Lưu **ngày học thực tế** và **thời điểm nhập** để truy vết; **không** dùng lịch dự kiến hay quy tắc "mỗi ngày một bản ghi" để chặn ca hợp lệ.
5. **Lớp nhóm lịch cố định:** một buổi lớp → nhiều kết quả điểm danh theo từng HV.
6. **Lịch dự kiến tự nó không chứng minh đã học hoặc đã vắng.**
7. Ba luồng công việc độc lập (mục 1–3 dưới đây), mỗi luồng có **trạng thái hoàn thành riêng**; "chưa nhập ý kiến" ≠ conflict; "đã liên hệ" ≠ "đã nhận phản hồi" ≠ "đã giải quyết".
8. **Admin phân xử** khi GV/CVHT bất đồng. **Quyền phân xử của MANAGE chưa được xác nhận** — hiện code cho MANAGE ([CODE]), đây là điểm cần chốt, không mặc định giữ hay bỏ.

Các điểm **không coi là đã chốt** (theo chính yêu cầu): cách tính mọi mốc; quy đổi thời lượng thành quyền học; hạn nhập/sửa lịch sử; ủy quyền phân xử cho MANAGE.

## 1. Luồng A — Điểm danh ca học + nội dung bài học

### Diễn biến nghiệp vụ
GV dạy xong → ghi nhận ca thực tế (tạo mới nếu chưa có session) → ghi trạng thái tham gia + bài đã học + ghi chú. CVHT kiểm tra và ghi ý kiến **ở phần riêng**. Hai bên khác nhau → **Admin phân xử**; kết quả cuối là dữ liệu chính thức cho số buổi/tiến trình.

### Code hiện tại ánh xạ từng bước ([CODE])
| Bước | Trạng thái trong code |
|---|---|
| Hai ý kiến tách riêng | ✅ `Attendance.teacher_status/cs_status + raw/note/user/time`, final `status`, `reconciliation_state`, resolver/note/audit (`schema.prisma` Attendance; `attendance.repository.ts` mark/bulk/update; `reconciliation.service.ts:59-63 deriveState`) |
| Thiếu một phía → pending, không conflict | ✅ `deriveState`: thiếu GV→`PENDING_TEACHER`, thiếu CS→`PENDING_CS`, khớp→`MATCHED`, khác→`CONFLICT`; pending queue còn kiểm cả opinion (`reconciliation.service.ts:87-103`) — **đúng nguyên tắc [PC-USER] 7** |
| CVHT xác nhận đúng buổi GV tạo | ✅ cùng bản ghi Attendance (EC+session), route `/:id/cs-mark` (A/M/C) + `assertCSScope` theo `enrollment.cs_id` |
| Bất đồng → phân xử | ✅ `resolve-conflict`: chỉ nhận bản ghi `CONFLICT` (409 nếu không), giữ hai opinion + audit before/after. ⚠️ Route + `assertCSScope` **cho phép MANAGE và CS-owned**, không riêng Admin — [PC-USER] mới nói "Admin phân xử"; quyền MANAGE **cần chốt** (xem §5-D2) |
| GV tạo ca thực học khi chưa có session | ⚠️ API `POST /classes/:classId/sessions` mở cho TEACHER kèm `requireClassAccess` (`class-sessions.routes.ts:18`); create validate `teacher_id` là User có role TEACHER (`class-sessions.service.ts:35-40`). **Nhưng màn hình GV không có đường tạo ca/attendance**: `MyTeachingSessionsPage` mark cần `selectedAttendance?.id` đã tồn tại, nếu không báo "Buổi học chưa có hồ sơ điểm danh ban đầu. Vui lòng liên hệ CSKH." (`MyTeachingSessionsPage.tsx:137-142`). → **năng lực API một phần đã có, thao tác UI thiếu** |
| Hai ca cùng ngày của một HV | ⚠️ Không bị chặn ở tầng lưu: attendance unique là `(enrollment_class_id, class_session_id)` — hai session khác nhau trong cùng ngày tạo hai attendance hợp lệ (`schema.prisma` Attendance; `business-rules.md:52-66` xác nhận "Attendance không duplicate ngày/giờ; ngày/giờ thuộc ClassSession"). Manual session không có unique class/date (chỉ `class_id+session_number`, `class_schedule_id+session_date`). **Nhưng tầng tính toán phá vỡ:** AttendanceMatrix `processedDates` gom một bản ghi/ngày/EC (báo cáo 02 §10.9); automation `resolveEnrollmentSessionNumber` đếm theo ngày trước đó → hai ca cùng ngày nhận cùng ordinal (automation-trigger.service.ts:256-277); sheet backup map theo ngày giữ một record/ngày (`sheet-backup.service.ts:824-827`). → **lưu được, đếm sai** |
| Ngày thực học + thời điểm nhập | ✅ `class_session.session_date`, `teacher_submitted_at/cs_submitted_at`, `created_at/updated_at`, `source`, `raw_value` |
| Nội dung bài + ghi chú GV | ✅ `lesson_topic` (map với workflow `MãHV-Tên bài` [NV] F01/F02), `teacher_note`, `raw_value` (`reconciliation.service.ts:204-250`) |

### Khoảng trống nghiệm thu (chưa code)
- GV tạo ca thực học **end-to-end từ UI GV** (session mới + attendance skeleton + mark), không phải "liên hệ CSKH".
- Cho phép **chủ động thêm ca 2** trong ngày (kèm guard retry: bấm lặp/lỗi mạng không sinh ca ngoài ý muốn — idempotency key theo (actor, EC, đề-cử session), khác với hai ca chủ đích).
- Mọi reader đếm **đúng số ca thực**, không gom ngày; căn cứ mốc phải được cấu hình riêng sau khi chốt; không mặc định là thứ tự ca thực học hay consumed (xem §4).

## 2. Luồng B — Phiếu đánh giá học tập theo mốc

### Diễn biến
Đến mốc quy định (giữa kỳ/cuối kỳ/số buổi), **GV điền phiếu đánh giá** cho HV của mình, gắn đúng enrollment.

### Code hiện tại ([CODE])
- Có form report JSON: `StudentStudyReportPage.tsx:33-50,125-160` — mốc 1/3, giai đoạn 1–10/11–20/21–30, giữa/cuối kỳ; lưu vào `Enrollment.program_metadata.study_report` qua **Student update** (`students.repository.ts:378-379,444-475`).
- **Sai context:** UI đọc `enrollments[0]` (không đảm bảo là enrollment GV đang dạy), backend update chọn **enrollment id lớn nhất** — hai quy tắc chọn khác nhau, có thể ghi đè enrollment khác ([CODE], báo cáo 02 §9; 03 R14).
- **Không có** tác giả phiếu, trạng thái hoàn thành phiếu, deadline mốc, quan hệ enrollment↔phiên bản lộ trình trong metadata; route không nhận `enrollment_id` tường minh cho report lane này.
- Đây là **form nhập tay**, chưa phải quy trình "đến mốc → sinh việc cho GV → GV nộp → đóng mốc".

### [ĐỀ-XUẤT] mô hình tối thiểu (chưa duyệt)
Bảng/JSON contract: `evaluation(enrollment_id, milestone_basis, session_ref, author_teacher_id, submitted_at, status DRAFT|SUBMITTED|REVIEWED, payload)`; milestone basis lấy từ §4 sau khi chốt. Không tự chọn mốc nào gửi gì — xem §5-D4.

## 3. Luồng C — Chăm sóc đến mốc: lấy feedback

### Diễn biến
Đến mốc chăm sóc, **CVHT liên hệ xin feedback**, ghi phản hồi, theo dõi việc cần xử lý tiếp. "Đã liên hệ" khác "đã nhận phản hồi" khác "đã giải quyết".

### Code hiện tại ([CODE])
| Yêu tố | Trạng thái |
|---|---|
| Mốc | `CareMilestoneConfig.session_number` unique **toàn cục**, không product/version/basis (`schema.prisma:936-944`) — không phân biệt Kaiwa/JLPT/theo nhóm |
| Ghi log theo mốc | `PUT /enrollments/:id/sessions/:n/care-log` findFirst rồi update/create theo (enrollment, session_number) — reuse khi tuần tự, không atomic (findFirst→update/create, `care.repository.ts:257-299`) [CODE]; 03 §3.3 |
| Task chăm | `CareTask(PENDING/DONE/CANCELLED)` theo enrollment/assignee/due/priority; **có idempotency_key** nhưng lane callback/hot-issue không dùng (`care.service.ts:244-291`: mỗi lần save note có nội dung là tạo task mới) |
| Trạng thái liên hệ/phản hồi/giải quyết | ❌ Không tách: CareTask PENDING/DONE/CANCELLED; CareLog có NO_RESPONSE nhưng chưa có lifecycle tách contact attempts/response/resolution; **chưa nhập** (không có log) ≠ **đã từ chối** ≠ **đã xong** |
| Giao tin tự động | Tách biệt: delivery chỉ qua automation + gate MATCHED/RESOLVED + unique (attendance, step); **không mặc định mọi mốc gửi tin** [PC-USER] |

### [ĐỀ-XUẤT] state machine feedback (chưa duyệt)
`Mốc chạm (tính từ §4) → Việc CVHT sinh (idempotent) → ĐÃ LIÊN HỆ → ĐÃ PHẢN HỒI (ghi CareLog + tiếp nối) | CHƯA PHẢN HỒI (hẹn lại, đếm lần 1/2/3 theo [NV] F08) → ĐÃ GIẢI QUYẾT / DỪNG`. ba mốc người dùng nêu [NV F08: "3 đồng hồ"] là **đối chiếu từ workbook**, chưa quy thành SLA hệ thống — §5-D5.

## 4. Chuẩn hóa khái niệm tính buổi (8 khái niệm tách bạch)

| # | Khái niệm | Định nghĩa [PC-USER]+[NV] | Nguồn trong code | Không được đồng nhất với |
|---|---|---|---|---|
| K1 | **Buổi dự kiến (planned)** | Slot lịch nền/pattern, chỉ là kế hoạch | `ClassSchedule` pattern + `ClassSession` sinh từ schedule/auto | Mọi chứng minh tham gia; không phải bản ghi học |
| K2 | **Ca thực tế được ghi nhận (actual session record)** | Một lần dạy/học thật, do GV/CVHT ghi; 1-1 có thể ngoài lịch; 2 ca/ngày = 2 records | `ClassSession` + Attendance `(EC, session)` | Số quyền học; ngày dự kiến |
| K3 | **Ý kiến GV/CVHT & kết quả cuối** | Hai opinion độc lập; final = MATCHED/RESOLVED | `teacher_status/cs_status/status/reconciliation_state` | Attendance một chiều; `status` khi pending |
| K4 | **Số buổi thực học hợp lệ (attended-valid)** | K2 đã final với ý nghĩa "đã học" | Chưa có predicate duy nhất; automation chỉ ATTENDED-final, dashboard đếm mọi row | consumed (vì C là vắng vẫn tiêu thụ); mốc chăm |
| K5 | **Quyền học đã tiêu thụ (consumed)** | business-rules §2 (Q-002 RESOLVED): final `ATTENDED` hoặc `ABSENT_UNAPPROVED_C`, mỗi bản ghi đúng 1 buổi; A/B/D/E không | Chưa có calculator chung (6 reader lệch — 04 §10) | attended-valid; ordinal |
| K6 | **Thứ tự buổi lớp/lộ trình (class/content ordinal)** | Vị trí buổi trong lớp hoặc bài trong lộ trình; nhóm 8 HV có thể cùng ordinal 5 | `ClassSession.session_number` (per class) | Số buổi cá nhân đã học; mốc chăm cá nhân |
| K7 | **Căn cứ mốc đánh giá/chăm sóc** | [PC-USER] chưa chốt cách tính mọi mốc. [ĐỀ-XUẤT] có thể dùng personal sequence, buổi lớp hoặc tiến độ lộ trình tùy loại mốc/product/version; không mặc định một basis duy nhất | automation hiện count ATTENDED final trước ngày +1: hai ca cùng ngày có cùng ordinal; không deleted filter. Không đếm C chỉ là khác consumed, chưa chứng minh sai đối với mốc chưa chốt | consumed; class ordinal; số ngày học |
| K8 | **Số dư ngoài & số dư đầu kỳ** | `external_remaining_sessions` (đối soát, kèm `external_synced_at`) và `attended_previous_years` (opening balance, quy tắc cutoff **chưa chốt**) | `Enrollment` fields; backup/exports dùng | consumed computed; không overwrite nguồn chính (business-rules §3) |

**Hai khẳng định cần nhắc lại:** (a) căn cứ mốc (K7) **không mặc định bằng** consumed (K5) — một lần nghỉ C bị tiêu thụ quyền học nhưng không chứng minh nó được tính vào mốc “sau N buổi đã học”; (b) học 2 ca vượt một mốc, sau khi đã xác nhận basis, phải sinh đúng một việc cho mốc đó (không bỏ sót vì count-theo-ngày, không nhân bản vì retry) — test §6.8.

## 5. Auto-attendance trong mô hình mới + các quyết định còn thiếu

### Rà lại auto ([CODE] + [PC-USER])
Với **lớp 1-1 lịch linh hoạt** [PC-USER 1–2], auto-tạo attendance theo lịch dự kiến **không nên mặc định tiếp tục** tạo `status=ATTENDED` — attendance là bằng chứng thực học, còn lịch chỉ là dự kiến [PC-USER 6]. Code hiện: auto ghi `ATTENDED`+`AUTO_SCHEDULE`, không opinion (`auto-attendance.repository.ts:235-251`); trigger gate MATCHED/RESOLVED nên thường không bắn; KPI/backup/milestone lại đọc raw rows (02 §7–8). [ĐỀ-XUẤT] tách auto thành **hai tác vụ khác nhau**: (a) *nhắc lịch/tạo mục lịch dự kiến* (planned calendar item, không phải attendance) và (b) *điền attendance* — chỉ khi có policy confirmed; với lớp nhóm lịch cố định auto-planned vẫn hợp lý, attendance vẫn cần ý kiến GV/CVHT.

### Bảng quyết định còn chặn thiết kế
> **Cập nhật 2026-10-25:** chủ dự án đã **DUYỆT D1/D3/D4/D5/D6/D7/D8/D10 theo đề xuất**. Chi tiết quyết định + hệ quả code nằm ở `05_KE_HOACH_TRIEN_KHAI.md` mục **A.1b**. Trạng thái "[CHƯA CHỐT]" bên dưới áp dụng cho các phần *chi tiết thiết kế chưa số hóa* còn lại: (D6) **giá trị window cụ thể** chưa chốt → chưa enforce tự động; (D4) **enum 4–5 trạng thái feedback** chi tiết chưa chốt → contact/response/resolution thủ công đã code được; (D2) **ủy quyền MANAGE cho phân xử** vẫn chưa duyệt (Admin-only đã code; MANAGE write theo phạm vi nhóm CVHT đã code 2026-10-25). (D1) milestone basis K7=FINAL ATTENDED đã code (dashboard reader + predicate dùng chung `isCareMilestoneAttendance`); (D3) planned-only cho 1-1 đã code trong auto-attendance (`ClassModelType.ONE_TO_ONE` skip create Attendance, vẫn tạo mục lịch).

| ID | Quyết định | Hiện trạng code | Trạng thái |
|---|---|---|---|
| D1 | Căn cứ mốc chăm/đánh giá: personal sequence theo K7 loại status nào (chỉ ATTENDED final? gồm C?), đơn vị (buổi lớp hay ca cá nhân), theo product/version | automation: count ATTENDED-final trước ngày | **[CHƯA CHỐT]** — [PC-USER] nói "đến mốc" nhưng không chốt công thức; §4 tách khái niệm, chưa chọn |
| D2 | Ai được phân xử: chỉ ADMIN hay cả MANAGE/CS-owned | route+service cho A/M + CS sở hữu enrollment | **ĐÃ CHỐT Admin phân xử**; quyền CS hiện tại không phải quyền phân xử đã được user cho phép. Chỉ phần **ủy quyền MANAGE chưa chốt**; không hỏi lại vai trò Admin, và không giữ mặc định CS tự phân xử |
| D3 | Auto-attendance 1-1: tắt / chuyển planned-only / giữ provisional | tạo ATTENDED không opinion | **[CHƯA CHỐT]** (liên quan Q-POL-1 cũ) |
| D4 | Mốc và số lần: catalog milestone per product/version; feedback tối đa bao nhiêu lần contact | config global session_number; [NV] "3 lần liên hệ" chỉ là workbook | **[CHƯA CHỐT]** |
| D5 | SLA liên hệ/giữa các lần hẹn ( workbook nói "3 đồng hồ" — đối chiếu F07/F08) | không có SLA engine | **[CHƯA CHỐT]** |
| D6 | Hạn nhập ý kiến GV / hạn sửa final lịch sử | không enforced (mark không chặn theo tuổi bản ghi) | **[CHƯA CHỐT]** — Q-004: OPEN_QUESTIONS ghi RESOLVED (sửa final trong scope + audit + lệch→CONFLICT + hủy delivery chờ, không hoàn tác đã gửi); business-rules §8 vẫn CHƯA CHỐT danh sách 5 mục (role/window/override/audit/rollback). Phần **[PC-USER] lượt này loại "hạn nhập/sửa lịch sử" khỏi các điểm đã chốt** → coi như chưa có window |
| D7 | Quy đổi thời lượng (45/60 phút, half-session 0.5X) thành quyền học | không có domain; [NV] F07 nhóm 1-2/45' 1-4/60' | **[CHƯA CHỐT]** — [PC-USER] không chốt; không tự áp |
| D8 | Quyền nhập/sửa ca bổ sung theo **phân công tại ngày dạy** (không chỉ phân công hôm nay) | scope hiện xét `active` hiện tại, không xét hiệu lực theo `session_date` (02 §4) | **[PC-USER] đã yêu cầu** quyền nhập bổ sung xét phân công tại ngày dạy, không chỉ active hôm nay; window sửa lịch sử và override vẫn chưa chốt |
| D9 | Sale↔CS (Q-009 vs business-rules §15) | sale_name substring trong students repo | **[CHƯA CHỐT — chặn 2.x của kế hoạch]** |
| D10 | Sheet↔Web winner per-field | không conflict rule | **[CHƯA CHỐT]** |

## 6. Bộ tình huống nghiệm thu tối thiểu (acceptance — chưa chạy)

Mỗi tình huống = fixture tách biệt (test DB/env được duyệt), kiểm **trước và sau**; không dùng dữ liệu HV thật.

1. **Ca khác lịch đăng ký:** 1-1 lịch import T2 20h; GV dạy T4 19h → tạo session/attendance theo ngày thực; mọi reader (matrix, dashboard, backup, automation) tính đúng 1 ca ngày T4, không tính ngày T2.
2. **Ca khi chưa có session:** GV tạo end-to-end từ UI GV (không "liên hệ CSKH"); attendance skeleton tự sinh; CVHT xác nhận phía mình trên đúng bản ghi.
3. **Hai ca cùng ngày:** GV thêm ca 2 chủ đích → 2 session + 2 attendance; đếm = 2 ở **mọi** reader; export/backup xuất 2 dòng/cột giá trị; không bị processedDates/map-theo-ngày gộp.
4. **Lưu lặp do retry:** cùng request idempotency → đúng 1 record; hai request chủ đích → 2 records (phân biệt rõ với #3).
5. **Thiếu một phía:** chỉ GV mark → `PENDING_CS`, không `CONFLICT`; queue CS thấy; số final không đổi.
6. **Hai phía khác nhau:** → `CONFLICT`; phân xử giữ nguyên `teacher_status/cs_status/raw/note`, ghi resolver/time/note; `RESOLVED` được tính final.
7. **Phân xử quyền:** theo D2 — fixture chứng minh đúng tập role được duyệt; nếu chốt Admin-only thì MANAGE/CS phải bị 403 (hiện [CODE]: A/M/CS-owner).
8. **Học 2 ca qua mốc:** enrollment có mốc 3; HV học ca thứ 2 trong ngày khiến tổng vượt mốc 3 → **đúng một** việc milestone sinh ra (không 0, không 2); delivery (nếu có rule) một lần.
9. **Phiếu đánh giá đúng enrollment:** HV có 2 enrollment; GV mở report cho enrollment đang dạy → lưu chỉ ghi enrollment đó; từ chối nếu ngoài assignment.
10. **Feedback trạng thái riêng:** liên hệ lần 1 (ĐÃ LIÊN HỆ) → chưa phản hồi (hẹn lần 2) → phản hồi (ĐÃ PHẢN HỒI) → xử lý xong (ĐÃ GIẢI QUYẾT); mỗi bước kiểm được độc lập; không suy "đã liên hệ" từ việc tạo task.
11. **Chuyển lớp giữ lịch sử + tiến trình:** transfer EC cũ→EC mới; consumed/ordinal xuyên EC; pending delivery/care task của EC cũ xử lý theo policy đã chốt (không âm thầm mất).
12. **Nhập lịch sử không gửi ngoài ý muốn:** importer chạy ở chế độ `NO_SEND` → 0 delivery mới; nếu có MATCHED chỉ cập nhật read model/audit.
13. **Nhóm một buổi nhiều HV:** 1 ClassSession + N attendance độc lập; HV nghỉ không đổi final của HV khác; mark theo từng người.
14. **Phân công theo ngày dạy:** GV bị gán **sau** ngày dạy không mark được ngày trước (trừ khi policy D8 cho phép); GV đã thôi assignment vẫn mark được ca mình đã dạy trong thời gian hiệu lực theo D8.

## 7. Việc độc lập chạy song song được

- Quyền/ownership fixes (R01/R02/export scope, D2 nếu chốt) — không chờ calculator.
- Idempotency task callback/hot-issue + milestone unique atomic — không chờ entitlement.
- UI GV tạo ca + guard 2-ca/ngày (kèm #1–4) — không chờ refactor dashboard.
- Calculator/ordinal (D1) và auto-policy (D3) — cần chốt trước khi đổi reader diện rộng.
