# Audit Task Backlog — 2026-10-23

> Kết quả kiểm toán toàn project (kỹ thuật + nghiệp vụ) ngày 2026-10-23, sau merge `test_diem_danh` (Google Sheet sync/backup) và các fix schedule-pattern/retry group-refresh (`a2eafd8`, `29cc7e7`).
> Trạng thái code được đối chiếu trực tiếp (file:line). Mỗi task có ô check để tick khi xong.
> **Chủ dự án có thể bổ sung task riêng vào mục E cuối file.**

---

## P0 — Rủi ro xảy ra thiệt hại thật (làm trước)

### K1. Broadcast scheduler không có lock claim ⇒ gửi trùng chiến dịch
- [ ] Thêm claim atomically trong `processDueScheduledCampaigns`: `updateMany({ where: { id, schedule_type: SCHEDULED, status: PLANNED/PENDING, scheduled_at: { lte: now } }, data: { status: RUNNING } })` → chỉ process khi `count === 1`.
- [ ] Thêm recovery: lúc boot + trong poller, quét campaign `RUNNING` có `updated_at` cũ hơn X phút → đưa về trạng thái cho resume ( recipients PENDING gửi tiếp, không gửi lại SENT).
- [ ] Kiểm chứng: 2 tiến trình backend cùng chạy, tạo scheduled campaign → chỉ 1 lần execute; kill server giữa chiến dịch → restart không gửi double.
- Bằng chứng: `backend/src/modules/automation/broadcast.service.ts:836,859` (không có updateMany claim; không có dòng quét RUNNING).

### K2. Socket.IO không xác thực — lộ QR/tin nhắn realtime theo accountId
- [ ] Thêm `io.use()` JWT handshake auth (verify `env.JWT_SECRET`, gắn `socket.data.user`).
- [ ] `zalo:subscribe` / `line:subscribe`: chỉ cho join room nếu user là ADMIN/MANAGE hoặc là chủ/được chia sẻ account (`zalo_account_accesses`); lưu `accountId → socket` map để revoke khi disable user.
- [ ] Kiểm chứng: connect socket không token → bị từ chối; CS#3 subscribe account của CS#2 → 403.
- Bằng chứng: `backend/src/modules/zalo/zalo-socket.ts:18-42` — chỉ kiểm tra account tồn tại, comment "Single-org: không có cross-tenant IDOR"; cookie sid nằm trong DB encrypted nhưng QR payload + message events đi qua room công khai.

### K9a. API login không rate-limit + mật khẩu đại trà `123456`
- [ ] Thêm rate-limit `express-rate-limit` cho `POST /auth/login` (vd 10 req / 15 phút / IP + theo email), lock tạm theo login_audits FAILED.
- [ ] Ép đổi mật khẩu lần đầu (cột `must_change_password` hoặc so hash với seed known-hash) — ít nhất cho ADMIN.
- [ ] Kiểm chứng: 20 lần sai mật khẩu liên tiếp vẫn 200/401 nhanh → sau fix phải 429.
- Bằng chứng: `backend/src/modules/auth/auth.routes.ts` grep `rate|limiter` = 0 kết quả; DB live: #1,#2,#3,#5,#6 đều = `123456` (reset tập trung hôm 23/10).

### N5. Nhóm cộng đồng bị match làm nhóm chăm sóc ⇒ broadcast bắn vào group 700+ thành viên
- [ ] Thêm cờ xác nhận `is_care_group` (hoặc `verified_by`) trên `zalo_groups`/`line_groups`; matcher chỉ tự link khi nhóm được xác nhận HOẶC thành viên ≤ ngưỡng (vd 20).
- [ ] UI Liên kết HV: nhóm auto-match hiện badge "chưa xác nhận", cho phép xác nhận/từ chối 1 click; từ chối = chặn match lại tên đó.
- [ ] Chặn chiến dịch target GROUP có member_count lớn khi chưa xác nhận (cảnh báo cứng trong `createCampaign`/`executeCampaign`).
- Bằng chứng: DB live có group `VIP KH - KHÔNG CHAT (732)`, `Cộng Đồng Tài Khoản Pro Sinh Viên (747)`, `TỔ HÓA AI 2 (320)` cùng bảng match; `matched_by=AUTO_GROUP_NAME` ghi FRIEND thẳng không qua duyệt (`student-care-group-matcher.service.ts` upsert FRIEND ngay).

---

## P1 — Sai lệch dữ liệu / hiệu năng / trải nghiệm

### K5+N1. Nguồn sự thật CVHT song song, phân công cs_id lệch
- [ ] Chốt 1 nguồn: `User.code` canonical; `staff_code` là mirror một chiều (đã có logic mirror — rà mọi route ghi).
- [ ] Rà phân công thật: user #2 (Hải Yến) đang gánh 1.388 enrollment trong khi CVHT02/03 là user #5/#6 — đối chiếu sheet `CVHT mapping`, viết script re-map `enrollments.cs_id` theo đúng người (chạy trên backup DB trước).
- [ ] `sheet-sync.service.ts:352-362`: backfill `staff_code` theo **ánh xạ người thật** (email/code), không theo thứ tự danh sách.
- [ ] Kiểm chứng: report care-groups trên từng CS hiển thị đúng số HV được giao; sheet import không ghi nhầm owner.

### K4. LINE webhook thiếu chống replay/dedup
- [ ] Kiểm tra `timestamp` header (chấp nhận skew ≤ 60s? LINE không gửi timestamp trong signature base — thay bằng **dedup `deliveryContext.replyToken`/`line_msg_id`**).
- [ ] Thêm `@@unique([line_account_id, line_msg_id])` cho `LineMessage` + upsert ignore; conversation reply_token cache bind theo msg_id gốc.
- [ ] Kiểm chứng: replay 1 body webhook ký hợp lệ 2 lần → inbox không nhân đôi, không đổi reply_token sai chỗ.
- Bằng chứng: `line-webhook.handler.ts:155` (`reply_token_expires_at = Date.now()+50_000`), schema `LineMessage.line_msg_id` không unique.

### K6. Matcher tuần tự chặn event loop + không mutex
- [ ] Thêm in-flight mutex (theo `triggeredBy` scope) cho `syncAndMatchCareGroups` — login+cron+webhook cùng nổ ⇒ skip trùng.
- [ ] Chuyển scan 2.374 student sang batch (chunk 200 + `Promise.allSettled` bounded) hoặc chỉ re-scan student chưa linked + student thay đổi (incremental).
- [ ] `refreshLiveZaloGroupsForAccount`: song song hoá `getGroupInfo` với concurrency 3-4, respect category `group_sync`.
- Bằng chứng: `student-care-group-matcher.service.ts` vòng for tuần tự, chưa có grep `mutex|inFlight|lock`.

### N3. Vòng đời chăm sóc không chặn hành vi sai
- [ ] Guard milestone-once: không tạo/ gửi cùng loại care-task cho cùng enrollment trong chu kỳ (check `care_logs` theo `milestone_session_number`).
- [ ] Broadcast lọc theo `enrollment.status`: PAUSED/FINISHED/WAITING → mặc định loại, có toggle rõ trong UI.
- [ ] Auto-attendance: ngày lễ (holiday calendar config) + ngày lớp nghỉ → suspend pattern; validate `schedule_pattern` khi lưu (zod) với whitelist `[234567CN]+|LKCD`.
- Bằng chứng: seed có HV `remaining: -2` nhưng luồng gửi không lọc status; schedule lưu chuỗi thô.

### N8. Sheet ⇄ web 2 chiều không có conflict rule; không có backup DB
- [ ] Định nghĩa winner per-field (khuyến nghị: sheet thắng cho field import, web thắng cho field chăm sóc) + log record ghi đè vào `audit_logs`.
- [ ] Thêm job backup MySQL tự động (mysqldump → thư mục `backups/`, giữ 7 bản) — `docker exec cskh_mysql mysqldump ...`.
- [ ] Khi cả sync config + backup config bật đồng thời: không cho chạy chồng lấn (cron mutex).
- Bằng chứng: `GoogleSheetSyncConfig.enabled=true` + `CsSheetBackupConfig` cùng bật; thư mục `backups/` rỗng job.

---

## P2 — Củng cố dài hạn

### K3. Refresh token: rotation + bỏ scan toàn bảng
- [ ] Thêm `@@index([refresh_token_hash_prefix])` hoặc lưu `token_id` (uuid) in-session: client gửi `refresh_token = session_id:secret`, lookup O(1).
- [ ] Rotate mỗi lần refresh (issue mới + revoke cũ), phát hiện reuse cũ → revoke cả family.
- Bằng chứng: `auth.service.ts:68-92` findMany toàn bộ sessions + compare tuần tự, không rotate.

### K8. Upload attachments whitelist MIME
- [ ] `fileFilter` chỉ nhận ảnh/pdf/doc/xls/zip an toàn; `Content-Disposition: attachment` + `X-Content-Type-Options` cho `/uploads`; cân nhắc vô hiệu inline HTML/SVG.
- Bằng chứng: `broadcast.routes.ts:21-43` chỉ diskStorage+limits, không fileFilter.

### K7. Student soft-delete + external_id tái sử dụng
- [ ] Thêm `archived_at`/`is_deleted` cho `students`; xóa qua archive; mọi query mặc định lọc archive.
- [ ] Khi sheet import gặp external_id từng thuộc HV archived → cảnh báo reconcile thay vì âm thầm hợp nhất.
- Bằng chứng: schema `students` không có cột delete nào; `external_id @unique`.

### N4. LINE OA quota tự đếm lệch thực
- [ ] Re-sync `monthly_consumption` từ `getMessageQuotaConsumption()` mỗi giờ (cron health-check) thay vì chỉ +1 local; guardrail dựa số LINE-reported khi API khả dụng.

### N7. Audit trục liên kết
- [ ] Thêm `created_by_id`, `revoked_by_id`, `linked_at` trên `*_contact_relations`; report chỉ tiêu CS loại link MANUAL chưa duyệt.

### N9. Per-route ownership check cho careRouter
- [ ] Rà toàn bộ `care.routes.ts`: route đọc/sửa theo student phải verify `student ↔ cs_id == actor` (hoặc MANAGE/ADMIN) — hiện mới thấy `requireRoles` ở vài route đầu.

### K10. Test nợ
- [ ] `reconciliation.integration.test.ts` Flow 4: cập nhật sang flow `import-excel/preview + confirm` (endpoint cũ đã 410).
- [ ] `workbook_reconciliation`: sửa teardown FK (delete theo thứ tự con→cha) + fix case `ATTENDED` (đúng kỳ vọng sau merge sheet-sync?).
- [ ] Tách integration test DB: auto-migrate `automation_cskh_test` từ schema trong `pretest` (`prisma db push --skip-generate`).

### N10. Tài liệu lệch thực tế
- [ ] Sửa mọi tham chiếu `cskh1@gmail.com` trong docs/seed script → `cskh@gmail.com`; ghi chú quy trình reset (`backend/prisma/reset-all-passwords.ts`).

---

## E. Bổ sung của chủ dự án (tự thêm)
- [ ] 
- [ ] 
- [ ] 

---

## Ghi chú đã xong gần đây (để khỏi làm trùng)
- ✅ Merge `test_diem_danh` vào main + reconcile `User.code`/`staff_code` (mirror) — commit `33ddd4a`, push.
- ✅ `parseSchedulePattern` chấp nhận `"2,4,6"`; backfill `class_schedules` — `a2eafd8`. Đã xác minh 0 cảnh báo sau 5+ chu kỳ.
- ✅ Retry transient `fetch failed` trong live group refresh — `a2eafd8`.
- ✅ Lọc group của account archived khỏi match candidates — `29cc7e7`.
- ✅ Reset toàn bộ mk user tương tác về `123456` + revoke session (#1,2,3,5,6; skip #4 test, #7 system) — script `backend/prisma/reset-all-passwords.ts`.
- ✅ Dọn 15 worktree + branch `worktree-agent-*` + `feat/line-hybrid-integration`.
