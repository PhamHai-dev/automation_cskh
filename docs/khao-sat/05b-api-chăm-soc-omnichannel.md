# 05b — API chăm sóc và omnichannel

Ngày khảo sát: 24/10/2026. Phương pháp: đọc mã nguồn tĩnh; không chạy server, không sửa dữ liệu. Đường dẫn dẫn chứng tính từ gốc repository.

- **[ĐKC]**: đã kiểm chứng trực tiếp trong mã nguồn, không đồng nghĩa đã chạy thử.
- **[SLCC]**: suy luận có căn cứ từ mã nguồn; cần kiểm thử để kết luận runtime.
- **[CXM]**: chưa xác minh hoặc phụ thuộc dịch vụ/môi trường ngoài.

<a id="section-1"></a>
## 1. Mount và quy ước đọc bảng

[ĐKC] `backend/src/app.ts:82-89` mount imports `/api/v1/imports`, Zalo `/api/v1/zalo`, LINE `/api/v1/line`, automation `/api/v1/automation`; **careRouter mount cuối tại `/api/v1`**, không có tiền tố `/care`. `/health` ở ngoài API (`app.ts:66-69`). Bảng dùng đường dẫn tuyệt đối từ HTTP root; các nhóm path cùng hàng có chung chính sách nếu không ghi ngoại lệ.

[ĐKC] `backend/src/modules/cs-groups/` hiện chỉ có `.gitkeep`; không có router riêng được import/mount trong `app.ts:8-25,72-89`. Các API CS group thực tế thuộc careRouter; không được coi thư mục trống là một module API độc lập.

> Tài liệu được ghi tăng dần theo từng module; các phần tiếp theo là kết quả khảo sát mã nguồn.

<a id="section-2"></a>
## 2. Care — nhật ký, task, thông báo

[ĐKC] Toàn bộ router đã `authenticate`; roles nêu trong bảng ở `backend/src/modules/care/care.routes.ts:8-106`. Data-scope được áp dụng trong service: ADMIN toàn hệ thống; MANAGE bản thân + thành viên các CS group được phân công; CS chỉ `[userId]` (`care.service.ts:23-51`). TEACHER chỉ có notification, không có care log/task (`care.routes.ts:88-106`).

| METHOD / path | requireRoles | data-scope | validation | side-effects | machine/state |
|---|---|---|---|---|---|
| GET/POST `/enrollments/:enrollmentId/care-logs` | ADMIN, MANAGE, CS | enrollment.cs_id phải thuộc scope (`care.service.ts:54-86`) | DTO Zod: session dương, outcome enum, content tùy chọn (`care.schema.ts:228-234`) | POST ghi CareLog, không thấy socket/queue | log append; không có idempotency key |
| GET `/care-tasks`, GET `/care-tasks/:taskId` | ADMIN, MANAGE, CS | lọc assigned_to_id theo scope; CS chỉ task của mình (`care.service.ts:90-159`) | query status/priority/type/due_filter, limit/offset parse (`care.controller.ts:38-68`) | đọc DB | status PENDING/DONE/CANCELLED |
| POST `/care-tasks`, PATCH `/:taskId` | ADMIN, MANAGE, CS | enrollment và task phải accessible; `assigned_to_id` trong body chưa được assert lại sau patch [SLCC] (`care.service.ts:162-192`) | create/update schema enum + số dương (`care.schema.ts:236-258`) | tạo/cập nhật task | create mặc định assignee enrollment.cs_id; không idempotency |
| POST `/:taskId/complete`, `/:taskId/cancel` | ADMIN, MANAGE, CS | task scope | chỉ parse taskId | update `status`, complete thêm `completed_at` (`care.service.ts:194-207`) | terminal DONE hoặc CANCELLED; không transition guard rõ ràng |
| GET/POST `/milestones` | ADMIN, MANAGE, CS | GET toàn cục; POST user ghi creator | session_number integer dương (`care.schema.ts:260-264`) | tạo cấu hình | milestone không có trạng thái |
| PUT `/enrollments/:enrollmentId/care`, PUT `/enrollments/:enrollmentId/sessions/:sessionNumber/care-log` | ADMIN, MANAGE, CS | enrollment scope | field nullable/string; session content bắt buộc (`care.schema.ts:266-281`) | callback_note tự tạo CALLBACK task; hot_issue_note tự tạo HOT_ISSUE task (`care.service.ts:244-291`) | upsert theo session; auto-task có thể lặp khi gọi lại [SLCC], không thấy idempotency |
| GET `/care-notifications`, POST `/care-notifications/read-all`, POST `/:notificationId/read` | ADMIN, MANAGE, CS, TEACHER | CS/Teacher bị khóa recipient=userId; ADMIN/MANAGE có thể chọn recipient (`care.service.ts:321-399`) | status all/unread/read, pagination; recipient parse | cập nhật `after_data.is_read/read_at`; không socket | read/unread; bulk tuần tự, không transaction rõ ràng |

[ĐKC] `care.md` mô tả đúng phần lớn endpoint nhưng không ghi milestones, session-care-log, enrollment-care, notifications; nó cũng gọi base đúng theo mount hiện tại. `TEACHER` trong docs nói không xem log nội bộ, khớp routes.

<a id="section-3"></a>
## 3. Imports — workbook, sheet-sync, sheet-backup, create-request

[ĐKC] Base `/api/v1/imports`; mọi route authenticate (`imports.routes.ts:14`). Upload/preview/mapping/validate/confirm, batches và export/template cho ADMIN/MANAGE/CS/TEACHER; sheet-sync cấu hình/chạy chỉ ADMIN/MANAGE; backup config đọc và chạy cá nhân cho CS, sửa config/chạy-all ADMIN/MANAGE; create-request list/read CS nhưng approve/reject chỉ ADMIN/MANAGE (`imports.routes.ts:17-53`).

| METHOD / path | requireRoles | data-scope | validation | side-effects | machine/state |
|---|---|---|---|---|---|
| GET `/template/:type`, `/export/students`, `/export/attendance`, `/batches`, `/:importId`, `/:importId/errors` | ADMIN, MANAGE, CS, TEACHER | service lọc dữ liệu theo user/role; docs nói CS học viên mình, Teacher lớp mình (`docs/api/imports.md`, cần đối chiếu thực thi) | type/query parse trong controller | tạo file Excel hoặc đọc batch/error rows | batch PREVIEW/VALIDATING/CONFIRMING/COMPLETED/PARTIAL_FAILED/FAILED tùy flow; không runtime xác minh [CXM] |
| POST `/upload`, `/:importId/mapping`, `/:importId/validate`, `/:importId/confirm` | ADMIN, MANAGE, CS, TEACHER | import dòng ngoài scope bị bỏ qua theo docs; phải kiểm chứng service | multer file; mapping/validate/confirm body (`imports.controller.ts`) | parse workbook nhiều sheet; confirm ghi Student/Enrollment/Attendance và ImportRow; queue không thấy trong route | upload draft/PREVIEW → mapping → validate → confirm; retry/idempotency cần kiểm tra batch guard [SLCC] |
| GET `/sheet-sync/configs`, PUT `/sheet-sync/service-account`, PUT `/sheet-sync/configs/:code` | ADMIN, MANAGE | cấu hình toàn hệ thống | code + credential/config | lưu credential/config; secret không nên trả plaintext [SLCC] | config enabled/disabled; service-account thay đổi ảnh hưởng sync |
| POST `/sheet-sync/configs/:code/sync`, POST `/sheet-sync/sync-all` | ADMIN, MANAGE | theo config code; sync-all toàn bộ | code/DB config | đọc Google Sheet, parse 2 sheet, reconciliation/upsert và log row-state; xem `sheet-sync.service.ts` | row-state delta (new/changed/unchanged/error); retry/overlap phụ thuộc service, lock chưa thấy [CXM] |
| GET `/sheet-backup/configs`, PUT `/sheet-backup/configs/:csUserId`, POST `/sheet-backup/configs/:csUserId/run`, POST `/sheet-backup/run-all`, GET `/sheet-backup/configs/:csUserId/download` | read/run: ADMIN, MANAGE, CS; update/run-all: ADMIN, MANAGE | CS chỉ config/run/download của mình theo service; ADMIN/MANAGE rộng hơn [SLCC] | csUserId parse; file download | serialize workbook backup, lưu artifact/file; run-all nhiều CS | backup run/snapshot state; thiếu transaction/idempotency rõ ràng |
| GET `/create-requests`, `/:id`; POST `/:id/approve`, `/:id/reject` | list/read ADMIN, MANAGE, CS; decision ADMIN, MANAGE | CS xem request scope của mình; approve manager/admin | id parse; approve/reject payload theo controller/service | approve tạo hoặc cập nhật student/enrollment và kích hoạt care-group sync ở downstream [SLCC] | pending → approved/rejected; cần chống approve lặp bằng trạng thái/unique |

[ĐKC] `docs/api/imports.md` có flow Excel 1.Chăm sóc/3.Chấm buổi, nhưng route thật còn sheet-sync, sheet-backup, create-requests; docs thiếu toàn bộ nhóm này. Mô tả “Teacher chỉ import lớp mình” phải xem như [CXM] nếu không có test/service assertion tương ứng.

<a id="section-4"></a>
## 4. Automation — workflows và broadcast

[ĐKC] `automationRouter` authenticate ở `automation.routes.ts:16`, gắn nested broadcast router (`:19`); route không dùng `requireRoles` nhưng helper `getRole` map ADMIN/MANAGE/CS và service áp owner/scope (`automation.routes.ts:21-31`, `automation.service.ts:25-165`). Broadcast routes cũng chỉ thấy authenticate (`broadcast.routes.ts:17`), nhưng helper `getRole` truyền vào service để scope campaign (`broadcast.routes.ts:68-79`).

| METHOD / path | requireRoles | data-scope | validation | side-effects | machine/state |
|---|---|---|---|---|---|
| GET/POST `/workflows`, GET/PATCH/DELETE `/workflows/:id` | authenticate; roles không khai báo tại route | service so owner/creator (`automation.service.ts:25-74`); CS không được workflow người khác | body validation trong route/service; duplicate 409 | DB workflow | workflow active/inactive (chi tiết enum xem types); delete cascade cần kiểm chứng |
| POST `/workflows/:id/steps`, PATCH/DELETE `/steps/:stepId` | authenticate | kiểm ownership workflow | step type/config, duplicate order/transition 409/422 (`automation.service.ts:86-114`) | DB step | step ordering/config |
| GET/POST/DELETE `/workflows/:id/enrollments...`, GET deliveries | authenticate | workflow scope; enrollment assignment | id/query parse | enrollment/delivery records | delivery status theo worker; retry qua BullMQ |
| GET/POST `/broadcasts` (`broadcast.routes.ts:104-235`) | authenticate | target catalog chọn account/student/group; ownership không thể hiện ở router [CXM] | campaign name/content/time/target, upload media | tạo campaign + recipients, render rich message | IMMEDIATE thành QUEUED/SENDING; SCHEDULED giữ SCHEDULED |
| POST `/broadcasts/:id/send-now`, `/cancel`, `/retry-failed`, DELETE `/:id` | authenticate | service kiểm campaign existence/status | terminal checks (COMPLETED/CANCELLED) | claim/send, cancel recipient, retry failed | campaign SCHEDULED/QUEUED → SENDING → COMPLETED/PARTIAL_FAILED/FAILED; CANCELLED terminal |

[ĐKC] Broadcast service phát Socket.IO `broadcast:progress` và `broadcast:completed` (`broadcast.service.ts:14-15, 853-857, 899-901, 1148-1193`); worker re-check delivery `SCHEDULED/QUEUED`, account ACTIVE và relation FRIEND trước gửi (`automation-worker.ts:94-140,334-377`). Recipient có `SENT`, `FAILED`, `SKIPPED_ACCOUNT_INACTIVE`, `SKIPPED_NOT_FRIEND`; failure tăng retry_count và BullMQ retry (`automation-worker.ts:205-224,314-320`). LINE dùng retry key xác định theo deliveryId (`automation-worker.ts:37-40,156-195`), broadcast service cũng dựng key theo recipient (`broadcast.service.ts:86`).

[ĐKC] Poller scheduled chạy mỗi 15 giây (`automation-worker.ts:609-624`), service có cờ process-local `isPollingScheduled` (`broadcast.service.ts:105,1207-1244`), không phải distributed lock; nhiều worker/process có thể cùng claim [ĐKC: thiếu lock trong đoạn đã đọc; cần DB claim atomic để kết luận trùng gửi]. Rich-message compiler ở `automation/rich-message.compiler.ts:1-732` compile payload, không phải API route.

<a id="section-5"></a>
## 5. Zalo — account, đăng nhập, đồng bộ và chăm sóc nhóm

[ĐKC] `zalo.routes.ts:32-33` áp authenticate + roles ADMIN/MANAGE/CS cho toàn router. Các sub-router được mount tại `zalo.routes.ts:217-257`; vì vậy đường dẫn dưới đây đều có prefix `/api/v1/zalo`.

| METHOD / path (nhóm) | requireRoles | data-scope | validation | side-effects | machine/state |
|---|---|---|---|---|---|
| GET/POST/PATCH/DELETE `/accounts`, `/accounts/:id`, `/accounts/:id/restore`, `/reconnect`, `/disconnect`, `/status` | ADMIN, MANAGE, CS | account access phải theo CS/ownership; matcher loại account archived/disabled (`zalo.routes.ts:36-62`, `zalo-access-routes.ts:69-183`) | id/body/proxy URL; account type/status | connect pool/socket, disconnect, refresh | account status ACTIVE/CONNECTING/QR_PENDING/NOT_LOGGED_IN/DISABLED/BANNED; login QR 2 bước `/qr` + `/qr/complete` |
| GET `/accounts/:id/friends`, `/groups`; POST `/accounts/:id/groups/refresh`, `/sync-contacts`, `/sync-history`, `/backfill...` | ADMIN, MANAGE, CS | account scope | id, scan/backfill body | Zalo API sync, DB upsert, socket/listener events; cron friend sync (`friend-sync-cron.ts:31-70`) | friend/group snapshot; sync job running/completed/failed/cancelled; retry phụ thuộc queue |
| GET/POST/PATCH/DELETE `/accounts/:accountId/groups...` và moderation/group scan | ADMIN, MANAGE, CS | account + group ownership; member/deputy changes scoped account | groupId/userId/body schema | remote group mutation, refresh/link, polls | group link enabled/disabled; scan state; moderation pending/blocked |
| GET `/accounts/:accountId/conversations`, counts, messages; POST message/mark-read; DELETE/restore conversation; ensure group conversation | ADMIN, MANAGE, CS | account access; conversation belongs account | thread/message/rich payload compiler | send Zalo message, persist inbound/outbound, socket (`zalo-socket.ts:1-55`), reactions/polls | message delivery success/failure; conversation archived/restored; no universal idempotency stated |
| GET/POST/PATCH/DELETE `/links`, `/students/:id/links`, `/:accountId/students-linked`, `/auto-suggest-links` | ADMIN, MANAGE, CS | student/account/group link ownership; non-owner returns 403 (`student-link-routes.ts:203-347,351-807`) | Zod relation_status FRIEND/STRANGER/UNKNOWN/BLOCKED (`:407-418`) | create/update relation; may trigger group sync/match | `relation_status` machine; matcher only FRIEND/eligible ACTIVE accounts; link delete/update |
| POST `/care-groups/sync-and-match`, GET `/care-groups/report`, `/groups`, `/students/unlinked` | ADMIN, MANAGE, CS | account/group scope and archived exclusion | optional account/group filters, schema | refresh groups then `syncAndMatchCareGroups`; student-care-group matcher | membership/relation delta; match report unknown if remote unavailable |
| GET/PATCH `/accounts/:id/profile...`, labels, access, credentials export/import | ADMIN, MANAGE, CS | account owner/access records; credential export is sensitive | profile/label/access schemas, encrypted credential import | remote profile/label/access updates, credential backup | credential/session state; access grants; secret values must not be exposed |
| GET/PUT/PATCH `/accounts/:accountId/limits`; GET/PATCH `/accounts/:accountId/proxy` | ADMIN, MANAGE, CS | account scope | limit numeric/category, proxy URL validation (`zalo.routes.ts:65-215`) | cache invalidation, proxy dispatcher | SDK quota counters; proxy configured/invalid |

[ĐKC] `friend-sync-cron.ts:31-70` định kỳ chọn account ACTIVE; `group-info-sync-cron.ts`/health-check cung cấp các lane nền. Exact interval, socket event catalog và retry policy của từng sync cần đọc thêm runtime/queue [CXM].

<a id="section-6"></a>
## 6. LINE — webhook, QR/PIN, links, chat và quota

[ĐKC] Webhook public trước middleware auth tại `line.routes.ts:26-66`, còn routes quản trị sau `authenticate` + ADMIN/MANAGE/CS (`:68-71`). `app.ts:38-44` lưu raw body cho `/api/v1/line/webhook`, phục vụ HMAC.

| METHOD / path (nhóm) | requireRoles | data-scope | validation | side-effects | machine/state |
|---|---|---|---|---|---|
| POST `/webhook`, `/webhook/:accountId` | public; HMAC-SHA256 | resolve account từ signature/accountId; không phải CS scope | raw body/signature/event type | persist LineMessage, emit `line:message`, command group sync; reply token cache 50s (`line-webhook.handler.ts:5-14,367-378`) | webhook accepted/rejected; reply token expires ~50s |
| GET/POST/PATCH/DELETE `/accounts`, `/:id`, disconnect/reconnect, `/qr-login` | ADMIN/MANAGE/CS | account scope | body/status/QR/PIN credentials | adapter login, pool/socket, encrypted session | CONNECTING → QR_PENDING/ACTIVE; lỗi → NOT_LOGGED_IN; QR/PIN flow |
| GET/PUT/PATCH `/accounts/:id/limits`, proxy, credential backup, OA credentials | ADMIN/MANAGE/CS | account scope | limits/proxy/credential schemas | quota cache, proxy dispatch, encrypted credential/session backup | monthly quota/guardrail, credential status; no secret response |
| GET/POST `/accounts/:id/friends...`, `/groups.../sync` | ADMIN/MANAGE/CS | account scope | phone/friend/group body | LINE OA/personal adapter calls, persist contacts/groups | friendship status friend/follower/blocked; sync result |
| GET `/accounts/:id/conversations`, messages; POST message/reply/push/mark-read | ADMIN/MANAGE/CS | conversation belongs account | thread/body/rich message validation | reply-token reply first; expired/no token fallback push subject to quota; persist delivery/socket | outbound delivery success/failure/retry; OA quota guardrail (`line.service.ts:260-270`) |
| GET/POST/PATCH/PUT/DELETE `/students/.../links`, `/links/...`, `/auto-suggest-links` | ADMIN/MANAGE/CS | account/student ownership | relation_status FRIEND/STRANGER/UNKNOWN/BLOCKED; deep-link schema | create/update/delete student relation, deep link | relation_status machine; FRIEND required for broadcast |

[ĐKC] Webhook handler caches `replyToken` for 50 seconds and replies through adapter; comments/code state reply consumes 0 quota, while fallback push is quota-governed (`line-webhook.handler.ts:367-378,467-565`, `line.service.ts:260-270`). Exact fallback branch and cache eviction are code-dependent [SLCC]. Health check is `line-health-check.ts`; limits use `line-rate-limiter.ts` and `line.service.ts:260-305`.

<a id="section-7"></a>
## 7. Luồng xuyên suốt

### 7.1 Import → duyệt create-request → auto care-group sync

[SLCC] Workbook upload tạo batch preview; mapping/validate/confirm tạo hoặc cập nhật Student/Enrollment và ImportRow theo flow `docs/api/imports.md`, route `imports.routes.ts:45-53`. Các create-request được list/read bởi CS nhưng chỉ ADMIN/MANAGE approve/reject (`imports.routes.ts:39-43`). Sau approve, dữ liệu học viên/gói có thể làm thay đổi tập care-group; endpoint chủ động `POST /api/v1/zalo/care-groups/sync-and-match` gọi matcher (`student-link-routes.ts:34-67`). Quan hệ chỉ nên coi là match khi account ACTIVE và contact relation FRIEND; việc tự động gọi matcher ngay sau approve không được chứng minh trực tiếp trong route [CXM], cần kiểm tra service approve/job.

### 7.2 Login Zalo → friends/groups → match

[ĐKC] QR login gồm generate + complete (`zalo.routes.ts:49-53`); account chuyển qua trạng thái kết nối rồi listener/pool đồng bộ. Cron friend sync chỉ lấy account ACTIVE (`friend-sync-cron.ts:31-70`), group refresh/sync cập nhật remote groups. `sync-and-match` gọi refresh/matcher và tạo/cập nhật student-group links; archived account bị loại ở matcher (căn cứ `student-care-group-matcher.service.ts`, commit hiện hành). Nếu token/remote API lỗi, match report và trạng thái sync phải giữ [CXM], không suy đoán thành “không có nhóm”.

### 7.3 Broadcast IMMEDIATE vs SCHEDULED

[ĐKC] Tạo campaign dựng recipient với trạng thái SCHEDULED/QUEUED; IMMEDIATE được đưa vào execution, SCHEDULED chờ `processDueScheduledCampaigns`. Poller chạy 15 giây (`automation-worker.ts:609-624`), claim candidates ở `broadcast.service.ts:1207-1244`; cờ `isPollingScheduled` chỉ process-local (`broadcast.service.ts:105`) nên **thiếu distributed lock/atomic claim** [ĐKC]. Worker re-check account ACTIVE, relation FRIEND và delivery còn SCHEDULED/QUEUED trước gửi (`automation-worker.ts:94-140`). Kết thúc campaign COMPLETED/PARTIAL_FAILED/FAILED; cancel terminal CANCELLED; retry tạo lại lượt cho FAILED/skipped (`broadcast.service.ts:1526-1581`). LINE idempotency key deterministic theo delivery id (`automation-worker.ts:37-40`), Zalo retry có retry_count nhưng không thấy cùng mức key [SLCC]. Socket events: `broadcast:progress`, `broadcast:completed`.

### 7.4 LINE webhook → reply token cache → push fallback quota

[ĐKC-CODE] Webhook xác thực HMAC bằng raw body; event được lưu và `line:message` phát ra. Reply token được cache với hạn `now+50_000` (`line-webhook.handler.ts:152-155,367-378`). `sendMessageWithReplyFallback` chỉ dùng token khi `reply_token_expires_at > now`, **xóa token trong DB trước khi gọi replyMessage** (`line-oa.adapter.ts:184-197`); nếu reply thất bại thì rơi vào nhánh push, nơi `enforcePushQuotaGuardrail` có thể từ chối với 429 `LINE_OA_QUOTA_EXHAUSTED`, rồi `incrementMonthlyConsumption` và retryKey idempotent với HTTP 409 được coi là đã gửi (`line-oa.adapter.ts:119-247`). Hai điểm còn lại là [CXM]: (a) độ tươi token chỉ được đánh giá theo hạn tự lưu, không đối chiếu trạng thái thực phía LINE — reply fail làm mất token đã cache; (b) `LineConversation.upsertConversation` luôn `incrementUnread: true` theo event (`line-webhook.handler.ts:370-384`) nên redelivery có thể đếm unread trùng, dù `LineMessage` có `@@unique([conversation_id, line_msg_id])` và `saveMessage` upsert (`line-repository.ts:437-443`) nên không sinh dòng tin trùng.

### 7.5 Reconciliation sheet-sync row-state delta

[SLCC] `sheet-sync.parser.ts` parse workbook và `sheet-sync.service.ts` thực hiện sync theo config. Luồng dự kiến: đọc từng sheet → normalize key → so sánh snapshot/DB → phân loại row new/changed/unchanged/error → upsert và ghi audit. API chỉ ADMIN/MANAGE (`imports.routes.ts:25-30`); config/service-account là side effect nhạy cảm. Chưa có bằng chứng route-level lock, distributed lease, hay complete delta contract [CXM]; không khẳng định reconciliation atomic hoặc idempotent.

<a id="section-8"></a>
## 8. Đối chiếu tài liệu API với routes thật — tài liệu lệch code

| Tài liệu | Lệch chính |
|---|---|
| `docs/api/care.md` | Thiếu `/milestones`, session care-log, enrollment care fields và toàn bộ care-notifications; cần bổ sung status/read semantics. |
| `docs/api/imports.md` | Thiếu sheet-sync, sheet-backup, create-requests; mô tả “bắt buộc” và scope Teacher/CS chưa được route guard thể hiện đầy đủ, cần đánh dấu implementation source. |
| `docs/api/zalo.md` | Gần như là thiết kế cũ: ghi `/zalo/account`, message-rules, message-deliveries nhưng routes thật dùng `/zalo/accounts...`, nhiều sub-router chat/friends/groups/links/limits/proxy/credentials; không có route message-rules như tài liệu. Dòng “chỉ implement sau Phase 7” đã lỗi thời so với code hiện tại. |
| `docs/api/cs-groups.md` | Toàn bộ là endpoint dự kiến `/api/v1/cs-groups`; thư mục `cs-groups` chỉ `.gitkeep`, app không mount router. Scope CS-group hiện được tham chiếu gián tiếp trong care service và matcher, không có CRUD API độc lập. |
| `docs/api/openapi.yaml` | Cần regenerate/đối chiếu: routes mới của imports, Zalo, LINE, automation không thể coi OpenAPI là nguồn đầy đủ nếu không thấy path tương ứng [CXM]. |

<a id="section-9"></a>
## 9. Ma trận vai trò × chức năng

| Chức năng | ADMIN | MANAGE | CS | TEACHER |
|---|---:|---:|---:|---:|
| Care log/task/enrollment care | toàn hệ thống | CS groups được gán | CS của mình | — |
| Care notification | chọn recipient/toàn hệ thống | chọn recipient/toàn hệ thống | chỉ notification của mình | notification của mình |
| Import/export/preview/validate/confirm | ✓ | ✓ | ✓ (scope cần service) | ✓ (scope lớp/điểm danh theo docs) |
| Sheet-sync config/run | ✓ | ✓ | — | — |
| Sheet-backup config | ✓ | ✓ | đọc + run/download của mình | — |
| Create-request xem | ✓ | ✓ | ✓ | — |
| Create-request approve/reject | ✓ | ✓ | — | — |
| Zalo/LINE account, chat, friends/groups/links | ✓ | ✓ | ✓ (account scope) | — |
| Broadcast/workflow | authenticate; role guard chưa rõ | authenticate; role guard chưa rõ | authenticate; owner scope | authenticate nếu route cho phép; cần audit |
| CS-group CRUD `/cs-groups` | — (không có route) | — (không có route) | — | — |

[ĐKC] Dấu “—” nghĩa route guard hiện không cấp quyền; dấu “authenticate” ở automation nhấn mạnh thiếu `requireRoles`, không phải xác nhận mọi vai trò nghiệp vụ được phép. Các điểm [CXM] là nơi nên viết integration test hoặc bổ sung guard/lock trước khi coi contract ổn định.
