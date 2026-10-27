# 09 — Danh sách lỗi, điểm bất nhất & câu hỏi chưa giải quyết

> Bản đã ẩn dữ liệu tài khoản/cá nhân (che by placeholder) — nguồn gốc xem NUOI-NGUON.md

Sổ cái phát hiện từ khảo sát. Mỗi dòng: mức, thể loại, bằng chứng và tham chiếu backlog `docs/AUDIT_TASKS_2026-10-23.md` nếu có.

**Quy tắc phân loại (áp dụng lại 24/10):** một mục chỉ ghi "xác nhận" khi có bằng chứng trực tiếp từ code/schema hoặc runtime đã chạy. Nếu mới đọc thấy *thiếu* một cơ chế trong đoạn code đã xem, hoặc hệ quả phụ thuộc policy/deployment/integration test, mục đó phải mang **[CXM]** và được hiểu là **giả thuyết cần kiểm chứng**. Lượt hoàn thiện này **không** re-test login/API/DB và **không** chạy thao tác ghi/xóa.

## A. Phát hiện kỹ thuật (tách mức theo sức nặng bằng chứng)

| Mã | P | Mô tả | Bằng chứng | Backlog |
|---|---|---|---|---|
| K1 | P1 [CXM] | Poller campaign SCHEDULED chạy mỗi 15s; cờ `isPollingScheduled` chỉ **process-local**, các đoạn đã đọc không thấy distributed lock hay DB claim atomic trước khi execute. Điều kiện **có thể** gây chạy trùng khi nhiều process/tick chồng; chưa có bằng chứng runtime đã gửi trùng, và `executeCampaign` có guard `activeCampaignRuns` ở mức process | `automation-worker.ts:609-624`; `broadcast.service.ts:105,859-866,1207-1244`; 05b §4 | K1 |
| K2 | P1 [CXM] | `zalo:subscribe` (và phía LINE) join room `account:{id}` sau khi kiểm tra account tồn tại; trong file đã đọc không thấy verify JWT/sở hữu, header code ghi nhận chủ ý single-org. Mức lộ QR/tin nhắn realtime phụ thuộc auth middleware socket ngoài handler và deployment → cần probe | `zalo-socket.ts:21-45`; `line-socket.ts:21-37` | K2 |
| K9 | P1 [CXM] | Trong `auth.routes.ts`/`auth.service.ts` đã đọc không thấy rate-limit cho `POST /auth/login` (có thể nằm ở middleware/deployment). Không ghi credential và không suy ra mật khẩu của bất kỳ tài khoản nào từ snapshot; rủi ro brute-force cần test | 05a §1; `auth.routes.ts:8`; `auth.service.ts:7-23` | K9a |
| K4 | P2 [CXM] | **Đính chính: dedup dòng tin nhắn CÓ tồn tại** — `@@unique([conversation_id, line_msg_id])` (`schema.prisma:1694`) và `saveMessage` upsert theo khóa đó (`line-repository.ts:437-443`), nên redelivery không sinh bản trùng. Khoảng trống còn lại (chưa test): `incrementUnread: true` mỗi event (`line-webhook.handler.ts:370-384`) và socket `emitLineMessage` phát lại (`:406-420`) có thể làm unread/realtime đếm trùng; `reply_token` bị ghi đè theo event mới; không thấy timestamp-skew guard. HMAC đã validate ✓ | 05b §6, §7.4; `line-webhook.handler.ts:367-420` | K4 |
| K5 | P2 [CXM] | Domain chứa `_` (như `automation_cskh.local`) có thể bị zod `.email()` từ chối — giả thuyết tương thích validator, không được re-test trong lượt này trên đúng phiên bản Zod cài đặt; không đủ sở cứ để nói tài khoản TEACHER cụ thể nào login được hay không | 05a §1, §15; `auth.schema.ts:3-8` | MỚI (đề xuất thêm backlog) |
| P-SCOPE-1 | P1 [CXM] | `classes.scope.ts:11-14` trả `null` (= không giới hạn class id) cho ADMIN/MANAGE/CS trong khi `/students` và `/enrollments` lọc theo `cs_id`; snapshot ghi CS nhận số lớp bằng ADMIN. **Quan sát có thật, phân loại chưa có**: cần policy trả lời 09-Q1 trước khi gọi là lỗ hổng; route chi tiết vẫn `requireClassAccess` | `classes.scope.ts:11-14`; 08 §2; 05a §6 | LIÊN QUAN 09-Q1 |
| K6 | P2 [SLCC] | Matcher có vòng `await` tuần tự (refresh `getGroupInfo` theo từng group, duyệt students) và không thấy mutex trong code đã đọc. Đây là quan sát throughput/latency; `await` trên IO **không đồng nghĩa event loop bị block**. Nhịp cron, overlap và ảnh hưởng thật là [CXM] | `student-care-group-matcher.service.ts:117-145,260-306,423-499`; 05b §5 | K6 |
| K3 | P2 [ĐKC-CODE] | `refresh()` load các session chưa revoke/chưa hết hạn rồi `bcrypt.compare` từng dòng (`auth.service.ts:68-92`), chỉ cập nhật `last_used_at/ip/user_agent` (`:103-108`); trong đoạn đã đọc không thấy cấp refresh token mới ⇒ docs/api nói rotate nhưng code không. Việc token cũ còn dùng được là suy luận từ không rotate, chưa test | `auth.service.ts:68-108`; 05a §1, §14 | K3 |
| K7 | P2 [CXM] | Schema `Student` không có `deleted_at` (khác `Attendance`). Khả năng phá liên kết khi xóa và tái dùng `external_id` là giả thuyết — cần xem route delete, hành vi FK và policy lưu trữ | 03 §Student; 04 §quan hệ | K7 |
| K8 | P2 [CXM] | Trong đoạn upload đã đọc không thấy `fileFilter` theo MIME; stored-XSS phụ thuộc static serving/headers và cách render → cần security test riêng, chưa lập lỗi | `broadcast.routes.ts:21-43` | K8 |

## B. Bất nhất mô hình dữ liệu (đối chiếu schema + code trực tiếp)

| Mã | P | Mô tả | Ghi chú hiệu đính |
|---|---|---|---|
| D1 | P1 | `ClassSession.teacher_id`: scalar `Int?`, **không FK/@relation** (`schema.prisma:394`). **Đính chính (đọc code 24/10)**: các bản trước ghi "ghi raw int, zero validation" là **sai** — create service **CÓ** kiểm tra `prisma.user.findUnique` + yêu cầu `roles` chứa `TEACHER` (`class-sessions.service.ts:35-40`) trước khi repository ghi (`:42,59`). Khoảng trống thật: (a) `updateSession` không lặp lại kiểm tra role (`:56-66`); (b) field mang `User.id` còn `ClassTeacher.teacher_id` mang `Teacher.id` (hai namespace, `classes.scope.ts:39-52` dò cả hai). `classes.service.ts:159+` là writer của `ClassTeacher`, không phải field session. **Không dùng count/`teacher_id=3` trong snapshot để kết luận misassignment** | 03 §ClassSession; 04 §1; 05a §7 |
| D2 | P2 [ĐKC-CODE] | Nhiều cột FK-mềm không @relation: `BroadcastCampaign.created_by_id`, `GoogleSheetSyncConfig.default_cs_id`, `BroadcastRecipient.{student/zalo/line…}`, `GoogleSheetRowState.{student/enrollment}`, `CareLog.created_by_id`, `Friend.contact_id`, `Message.replied_by_user_id` → DB không bảo vệ toàn vẹn, Prisma không JOIN hộ | 04 §quan hệ mồ côi |
| D3 | P2 [ĐKC-CODE] | CASCADE vs RESTRICT lệch giữa LINE và Zalo cho quan hệ tương ứng; `LineContactRelation` tái dùng enum `ZaloContactRelationStatus`. Hệ quả dữ liệu khi xóa là suy luận từ `onDelete`, chưa test | 04 |
| D4 | P2 | Tên model theo schema: `ClassSchedule` (`:361`), `AutoAttendanceExecution` (`:953`), `AutomationWorkflow` (`:663`), `AutomationStep` (`:680`), `AutomationEnrollment` (`:702` — bản ghi enrollment được đưa vào workflow), `MessageDelivery` (`:730`). **Không tồn tại** `AutomationExecution`/`AutoAttendanceSchedule`; 07 đã sửa sang tên thật. Không suy ra "workflow không có bảng chạy": lượt giao tin theo dõi qua `MessageDelivery` + BullMQ retry; mức độ audit *một lần chạy workflow* là [CXM] | 03 §model; 05a §10; 05b §4 |
| D5 | P2 [ĐKC-CODE] | `Teacher.user_id Int? @unique` → hồ sơ GV có thể không gắn tài khoản; `ZaloAccount.cs_id` bắt buộc trỏ User. Ghi nhận phân vai trò/hồ sơ ở 02; **không phải lỗi** | 03, 04 §1 |

## C. Tài liệu API lệch code (agent 05a/05b đối chiếu docs/api)

| Module | docs/api nói | code thật |
|---|---|---|
| zalo | tài liệu thiết kế cũ, endpoint `/account` (số ít), `/message-rules` | không tồn tại; thực tế `/accounts`, nhiều route omnichannel |
| imports | thiếu | thiếu mô tả sheet-sync, sheet-backup, create-requests |
| care | thiếu | thiếu notifications/milestones/session routes |
| users | docs: list = ADMIN | code: `GET /users` mở cho cả **MANAGE** (users.routes.ts:9); roles không whitelist; **không có route reset-password** dù tài liệu/ý định đề cập |
| teachers | docs API | endpoint thực khác `/profile`; scope GV vs write attendance không đồng nhất |
| enrollments | docs paths | code dùng `/assign`, `/transfer-class` |
| attendance | docs | thiếu `/summary`; reset có nhánh giữ record |
| auth | docs nói refresh **rotate** | code **không rotate** (K3) |
| dashboard | docs nói TEACHER xem được | route guard chặn TEACHER |
| reconciliation | — | Zod parse lỗi rơi qua middleware → **500** thay vì 400 |

## D. Phát hiện UX/bất nhất giao diện (agent 06 — 21 mục, trích mục nặng)

| Mã | Mô tả |
|---|---|
| U1 | `ImportApprovalQueue` tồn tại nhưng không được import/render bởi page nào trong `frontend/src` (grep) → luồng duyệt yêu cầu tạo HV từ import không có đường vào UI, chỉ đi được qua API [ĐKC-CODE]. "Bị nghẽn" là hệ quả nghiệp vụ, cần chủ dự án xác nhận |
| U2 | Tab `/omnichannel/student-links?tab=ZALO\|LINE` thực chất mở `UNLINKED_ZALO/LINE` — nhãn tab dễ hiểu nhầm (đã xác nhận trong 06 mục F.10 từ mapping component) |
| U3 | Home quick-links Care (A/M/C) và Imports (A/M) hẹp hơn sidebar/route (A/M/C/T) → C/T thiếu lối vào từ trang chủ; thiếu role bị redirect `/`, không có trang 403 (06 F.1, F.21) |
| U4 | Omnichannel LINE contacts limit 200 không phân trang; inbox chỉ lấy 40 conv/60 msg; mark-read nuốt lỗi |
| U5 | Workflow/broadcast API limit 100/200 "không phân trang thật" → vượt ngưỡng ẩn dữ liệu |
| U6 | ZaloMonitor có thể hiển thị payload thô (nội dung/ID nội bộ) |
| U7 | Wizard import nuốt lỗi khi load user list; backup controls disabled mà không giải thích |
| U8 | Defaults lịch học "giả" trong Enrollments; dashboard loading tab cũ che tab mới |
| U9 | Preferences mở cho MỌI user dù bảng vai trò chỉ liệt kê A/M/C |
| U10 | Student CS filtering khác logic Enrollments (includes substring vs exact) |

## E. Câu hỏi nghiệp vụ chưa giải quyết (cần chủ dự án/PM trả lời)

| Q | Câu hỏi | Vì sao quan trọng |
|---|---|---|
| Q1 | CS được phép thấy **lớp của CS khác** không (P-SCOPE-1)? hay `/classes` phải lọc theo lớp có HV của CS? Đây là **quyết định policy**, không phải lỗi đã lập | quyết định fix scope |
| Q2 | Một học viên có **nhiều enrollment/CS cùng lúc** hợp lệ không? (schema cho phép; matcher lấy enrollment mới nhất) | ảnh hưởng L3/L7 |
| Q3 | API log/task không cấp TEACHER, notifications khóa recipient=self (05b §2). Màn `/care` của GV thực tế có chỉ notification và xử lý 403 đúng không? MANAGE scope có đúng phân nhóm? [CXM runtime] | không suy từ quyền vào trang thành quyền đọc toàn bộ care |
| Q4 | CS này **gán/đổi assignee** care task sang CS khác được không? route PATCH `/care-tasks/:id` roles gồm CS | phân công chồng lấn |
| Q5 | Nhóm cùng pattern tên (`03 - 000000000` — external_id ví dụ đã che) là **luôn** nhóm chăm sóc, hay cần cờ xác nhận trước khi được broadcast bắn vào? (liên quan N5, group 700+ mem) | rủi ro ban/pháp lý |
| Q6 | Sheet vs Web: **conflict winner** per-field là gì khi cả 2 chiều bật (N8)? | mất dữ liệu |
| Q7 | `remaining buổi` / nợ buổi tính công thức nào, ở đâu (03 có field nhưng nguồn tính chưa truy được reader) | nghiệp vụ tài chính |
| Q8 | Care milestone có **chống gửi trùng** theo (enrollment, session_number) chưa? `PUT .../sessions/:n/care-log` upsert theo session và callback/hot note tự tạo task (`care.service.ts:244-291`), chưa thấy guard milestone-once → [CXM] | trải nghiệm HV |
| Q9 | Export credentials Zalo/LINE (file phiên) ADMIN/MANAGE được phép tới đâu? (risk-high) | bảo mật |
| Q10 | Có **nên** đặt lại teacher id3 email không-dấu-gạch để đăng nhập, hay sửa zod email regex cho phép `_`? | K5 |

## F. Giới hạn kiểm chứng (không phải lỗi, ghi để trung thực)
- **Không có full browser clickthrough/screenshot.** UI được đặc tả **từ mã nguồn component**; chưa thao tác từng màn hình qua browser có đăng nhập, nên không claim đã verify UI bằng browser.
- **MANAGE và TEACHER runtime bị chặn/chưa xác minh:** không có phiên đăng nhập hợp lệ cho hai vai trò này; mọi kết luận scope của chúng suy từ `requireRoles`/service ([SLCC]/[CXM]).
- **Không chạy thao tác ghi/xóa** và **không gửi tin thật** ra Zalo/LINE; side effect chỉ đọc từ code. Việc ghi vào DB dev **không được mặc định cho phép** và không được tự suy thành quyền.
- **Data dictionary chưa truy vết writer/reader cho mọi field**: 03 liệt kê schema + các writer/reader đã xác định; 08b chỉ là mẫu ~18 trường. Per-field writer coverage **chưa hoàn tất** [CXM].
- **Không dùng con số % bao phủ.** File 10 trình bày trạng thái theo từng mục (documented / tested / unverified) thay vì tỷ lệ giả định.
- **Số lượng bản ghi không tự chứng minh** misassignment hay "thiếu nhóm remote"; các count chỉ là snapshot.
- Google Sheets end-to-end cần OAuth thật — mới khảo schema/parser/UI/service [CXM].
- Hành vi Zalo/LINE production (tốc độ thật, ban thật) ngoài phạm vi môi trường dev.
- **Khoảng trống còn lại không được lấp bằng "chức năng chuẩn ngành"**; chúng giữ nhãn [CXM] tới khi có bằng chứng.
