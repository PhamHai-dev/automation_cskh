# 07 — Đề xuất Migration (v2): Milestone Occurrence, Bảo toàn Lịch sử & Ràng buộc Duy nhất có Phạm vi (S1a / S2c)

**Phiên bản:** v2.3 (Khắc phục 3 điểm SQL & Cutover theo phản biện của Owner đối với v2.2 ngày 2026-10-26: Gate chống ghi đè `SENT`/`SENDING` khi Rollback `R2.0`/`R2.1`, Quy tắc Canonical thống nhất kèm Delta-Sync thực chất ở `§2.3`/`§7.3`/`R3`, và Write-Quiesce Gate chặn toàn bộ đường ghi API + Worker ở `§7.4`; đã kiểm chứng bằng bài test diễn tập DB thực tế `s1-migration-rehearsal.integration.test.ts`)  
**Ngày cập nhật:** 2026-10-26  
**Phạm vi:** `MessageDelivery` / `AutomationStep` (`backend/prisma/schema.prisma`, `backend/src/modules/automation/*`)  
**Trạng thái:** Đề xuất kỹ thuật trình duyệt — **TUYỆT ĐỐI KHÔNG tự chạy migration hay SQL biến đổi dữ liệu trên DB vận hành** khi chưa có phê duyệt tường minh của Owner (việc diễn tập SQL chỉ thực hiện trên bảng tạm tự dọn sạch trong môi trường test `automation_cskh_test`).

---

## Lịch sử phiên bản (Changelog)

| Phiên bản | Ngày | Nội dung thay đổi |
|---|---|---|
| **v1.0** | 2026-10-26 | Bản nháp đầu tiên đề xuất `@@unique([enrollment_id, automation_step_id])` toàn cục trên `message_deliveries` kèm bước tiền xử lý `DELETE` các bản ghi trùng lịch sử. |
| **v2.3** | 2026-10-26 | **Khắc phục 3 vấn đề SQL & quy trình Cutover/Rollback theo phản biện của Owner đối với bản v2.2 + Diễn tập thực tế trên `automation_cskh_test`:**<br>1. **Bảo vệ tuyệt đối bằng chứng `SENT`/`SENDING` trong Rollback (`§7.5 Bước R2.0 & R2.1`):** Bổ sung cổng kiểm tra tiền điều kiện bắt buộc **`R2.0 (Contradiction Pre-Check Gate)`** phát hiện mọi mâu thuẫn giữa `milestone_occurrences` và `message_deliveries` liên quan tới `SENT`/`SENDING` (nếu `> 0` dòng mâu thuẫn $\rightarrow$ `SIGNAL SQLSTATE '45000'` dừng rollback ngay lập tức và xuất danh sách đối soát thủ công, không tự quyết `SENDING`, không hạ `SENT` về trạng thái chờ). Viết lại **`R2.1`** chỉ đồng bộ các trạng thái chưa gửi (`WHERE md.status NOT IN ('SENT', 'SENDING') AND mo.status NOT IN ('SENT', 'SENDING')`), tuyệt đối không chạm vào `status`, `attendance_id`, `rendered_content`, `sent_at`, `provider_message_id` của bản ghi đã gửi.<br>2. **Thống nhất quy tắc chọn Canonical (`§2.3`, `§7.3`, `§7.5 R3`) & sửa Delta-Sync thực chất:** Đồng nhất 100% biểu thức xếp hạng SQL ở cả 3 mục với hàm ứng dụng `pickCanonicalOccurrence` (`automation-repository.ts` dòng 584–611), bao gồm việc tính buổi `FINAL ATTENDED` thứ `k` hiện hành theo chuẩn K7 (`ROW_NUMBER() OVER (PARTITION BY ec.enrollment_id ORDER BY cs.session_date ASC, a.created_at ASC, a.id ASC)`) và ưu tiên dòng khớp `current_basis_attendance_id`. Sửa `ON DUPLICATE KEY UPDATE` ở `§7.3` để thực sự cập nhật `basis_attendance_id`, `canonical_delivery_id`, `satisfied_at`, `status`, `updated_at` kèm chốt chặn đơn điệu (monotonic guard: không bao giờ hạ cấp dòng đã `SENT`, và chỉ cho phép `SENDING -> SENT` trên cùng `canonical_delivery_id`).<br>3. **Chặn toàn bộ đường ghi khi Cutover (`§7.4 Write-Quiesce Gate`) & bỏ cam kết cứng `"< 1 phút"`:** Quy định rõ việc dừng `automation-worker` chưa chặn được các đường ghi từ API (`attendance`, `attendance-reconciliation`, `import-excel/confirm`, `automation`). Thiết lập quy trình 5 bước có cổng chặn ghi `MAINTENANCE_FREEZE_MILESTONE_WRITES = true`, chờ xả hết giao dịch đang chạy (`information_schema.innodb_trx`), chạy Delta-Sync cuối + đối soát từng ô dữ liệu (cell-by-cell equivalence), rồi mới chuyển đồng bộ API + Worker sang `S1_OCCURRENCE_TABLE`. Loại bỏ cam kết `"< 1 phút"` chưa đo đạc.<br>4. **Kiểm thử diễn tập trên MySQL thực (`s1-migration-rehearsal.integration.test.ts`):** Chứng minh bằng Jest integration test trên `automation_cskh_test` cho cả 3 kịch bản (Canonical SQL = `pickCanonicalOccurrence`, Delta-Sync `QUEUED -> SENT` + monotonic guard, và Rollback Gate `R2.0` + `R2.1` + `R3`). |
| **v2.2** | 2026-10-26 | **Viết lại & gia cố Mục 7 (`S1 — Kế hoạch chuyển đổi (Cutover) & Rollback`) theo 4 yêu cầu bắt buộc của Owner (2026-10-26):**<br>1. **Bảo toàn 100% lịch sử cho nhóm có nhiều `SENT`/`SENDING`:** Giữ nguyên `0 DELETE` trên `message_deliveries`; dòng chính gắn vào `milestone_occurrences.canonical_delivery_id` (`current_delivery_id`), đồng thời mọi dòng lịch sử (bao gồm toàn bộ các dòng `SENT`/`SENDING` thứ 2 trở đi của cùng cặp `(enrollment_id, automation_step_id)`) được liên kết tường minh qua cột `message_deliveries.milestone_occurrence_id` để không có bất kỳ bản ghi `SENT`/`SENDING` quá khứ nào bị mồ côi khỏi occurrence.<br>2. **Chỉ một cơ chế gửi có hiệu lực tại mọi thời điểm (`MILESTONE_STORAGE_MODE = LEGACY_DELIVERY_SCAN \| S1_OCCURRENCE_TABLE`) & Fail-Closed khi lỗi DB:** Loại bỏ hoàn toàn cơ chế "bắt lỗi truy cập bảng mới rồi âm thầm fallback". Khi đang ở `S1_OCCURRENCE_TABLE`, mọi lỗi truy vấn/kết nối/quyền trên `milestone_occurrences` bắt buộc **fail-closed** (ném lỗi, hủy giao dịch, không xếp hàng gửi tin, cảnh báo vận hành).<br>3. **Quy trình Rollback vận hành 5 bước (R1–R5) bảo toàn chống gửi trùng cho cả dữ liệu phát sinh sau cutover:** Đóng cổng worker tạm thời (R1) $\rightarrow$ Đồng bộ ngược & hội tụ các dòng `message_deliveries` phát sinh sau `T_cutover` (R2) $\rightarrow$ Đối soát bất biến chống gửi trùng giữa 2 bảng (R3) $\rightarrow$ Chuyển `MILESTONE_STORAGE_MODE` về `LEGACY_DELIVERY_SCAN` và mở lại worker (R4) $\rightarrow$ `DROP TABLE milestone_occurrences` chỉ là bước dọn dẹp cuối cùng sau khi Owner ký xác nhận ổn định (R5). |
| **v2.1** | 2026-10-26 | **Cập nhật triển khai sớm (Task 1 & Task 2) và bổ sung bản nháp Mục 7**:<br>1. Triển khai ngay trong code `AutomationService.updateStep` / `deleteStep` guard bảo vệ định danh bước (`session_number`, `trigger_event`) và chặn xóa bước khi đã có `MessageDelivery` (409).<br>2. Triển khai ngay trong `automation-worker.ts` cơ chế retry trên cùng `delivery.id` khi `status = 'FAILED'` (`retry_count < 3`), kiểm tra lại `checkInvariants` + `checkMilestoneStillEligible` ở mỗi lần retry, phân biệt 3 lớp lỗi (`PRE_SEND`, `UNCERTAIN_SEND` cho Zalo & LINE Personal `@evex/linejs`, và `LINE OA` retry an toàn nhờ header `X-Line-Retry-Key`), không bao giờ blind-resend dòng `SENDING`. |
| **v2.0** | 2026-10-26 | **Bản viết lại theo chỉ đạo phản biện của Owner (2026-10-26)** — Bác bỏ hoàn toàn việc chạy v1.0 nguyên trạng và giải quyết 5 điểm bắt buộc:<br>1. **Cấm dùng `DELETE` làm bước dọn dữ liệu mặc định**: Thay bằng truy vấn kiểm toán chỉ đọc (Read-only Duplicate Report), khẳng định nguyên tắc *"chống gửi trùng tương lai ≠ xóa bằng chứng gửi trùng quá khứ"*, quy tắc hội tụ tất định cho các bản ghi chưa gửi (`CANCELLED` + hủy job BullMQ, giữ nguyên dòng), và điều kiện tiên quyết trước mọi DDL.<br>2. **Thu hẹp phạm vi ràng buộc (Scoped Uniqueness)**: Khảo sát toàn bộ 6 `AutomationTriggerEvent`; chứng minh các bước `non-ATTENDED` có thể phát sinh hợp lệ $\ge 2$ `MessageDelivery` cho cùng `(enrollment_id, automation_step_id)`; cung cấp giải pháp MySQL 8.0 chỉ khóa nhóm mốc `ATTENDED` (bảng `milestone_occurrences` hoặc Generated Column có điều kiện).<br>3. **Ngữ nghĩa chỉnh sửa `AutomationStep`**: Phân loại trường cho phép sửa vs trường định danh cần khóa khi đã có delivery; quy định `rendered_content` + `variables_snapshot` là nguồn sự thật lịch sử; sửa cấu hình/nội dung bước không cấp quyền gửi lại mốc đã `SENT`.<br>4. **Phục hồi trạng thái `SENDING` & Retry**: Quy định `SENDING` không phải bằng chứng nhà cung cấp đã nhận; cơ chế đối soát LINE (`X-Line-Retry-Key`) vs Zalo (`zca-js`); cấm tạo dòng mới khi đang retry dòng cũ; ghi nhận điểm lệch hiện tại trong `automation-worker.ts` khi retry từ `FAILED`.<br>5. **Tính nhất quán khi Rebind & `NO_SEND`**: Ghim chặt hành vi thực tế của code (kèm unit/integration test) khi rebind occurrence đang `SCHEDULED`/`QUEUED`, hành vi của BullMQ worker khi job payload mang `attendanceId` cũ, và cam kết `NO_SEND` không kích hoạt lại dòng `CANCELLED`. |

---

## 1. Bối cảnh & Tóm tắt hiện trạng tại tầng Application (Commit `0970bec`)

### 1.1. Nguyên nhân gốc rễ (S1a / S2c)
Trong `backend/prisma/schema.prisma`:
- `AutomationStep` (dòng 680–700) có khóa duy nhất `@@unique([workflow_id, session_number, trigger_event])`. Mỗi `automation_step_id` định danh duy nhất cho một bước thuộc một mốc `(workflow_id, session_number, trigger_event)`.
- `MessageDelivery` (dòng 730–763) hiện chỉ có khóa duy nhất `@@unique([attendance_id, automation_step_id])`.
- Khi áp dụng cho các bước chăm sóc theo mốc buổi học (`trigger_event = ATTENDED`):
  - **S1a (Chốt điểm danh lệch thứ tự — Out-of-order finalization):** Buổi B (`09:00`) chốt `MATCHED` trước buổi A (`01:00` cùng ngày) nên chạm mốc 5 trước. Khi A chốt `MATCHED` muộn hơn, A trở thành buổi thứ 5 theo thứ tự chuẩn K7 `(session_date, created_at, id)` và B dịch lên buổi thứ 6. Khóa cũ `(attendance_id, automation_step_id)` không chặn được việc tạo bản ghi thứ hai cho mốc 5 với `attendance_id = A`.
  - **S2c (`FINAL → CONFLICT → FINAL` / dịch chuyển căn cứ):** Khi bản ghi căn cứ của mốc `k` chuyển sang `CONFLICT` làm bản ghi kế cận dịch vào vị trí thứ `k`, hoặc khi số buổi tụt dưới mốc rồi tăng lại với một `attendance_id` khác, khóa theo `attendance_id` không đại diện cho định danh mốc của ghi danh (`Enrollment`).

### 1.2. Cơ chế đã hoạt động ở tầng Application (Chưa đổi Schema)
Commit `0970bec` trong `automation-trigger.service.ts` và `automation-repository.ts` đã triển khai:
- **Cơ chế A (Milestone Occurrence Dedup):** Với `trigger_event = ATTENDED`, định danh occurrence là `(enrollment_id, automation_step_id)`. `attendance_id` chỉ là bản ghi điểm danh làm căn cứ hiện tại (`basis_attendance_id`).
- **Cơ chế B (Enrollment-wide Forward Re-evaluation):** Hàm `reconcileEnrollmentMilestones` tính lại danh sách K7 (`FINAL` + `ATTENDED`, sắp xếp theo `(session_date, created_at, id)`) trên toàn bộ `Enrollment` sau mỗi biến động đối soát để tạo mới (nếu chưa có dưới `SEND`), rebind tại chỗ (nếu dịch căn cứ khi chưa gửi), hủy `CANCELLED` (nếu tụt dưới mốc), hoặc kích hoạt lại chính dòng `CANCELLED` (khi đủ điều kiện trở lại dưới `SEND`).
- **Khoá đồng thời (Concurrency Guard):** Sử dụng per-enrollment in-process lock kết hợp giao dịch `Serializable` (`SELECT id FROM enrollments WHERE id = ? FOR UPDATE`) và retry khi gặp `P2002` / deadlock.

---

## 2. Điểm 1 — Cấm xóa dữ liệu lịch sử (`NO DELETE`); Báo cáo kiểm toán & Hội tụ không phá hủy

### 2.1. Nguyên tắc bất biến
> **"Chống gửi trùng tương lai ≠ Xóa bằng chứng gửi trùng quá khứ."**

1. **Mọi bản ghi `SENT` (và `SENDING`) là bằng chứng kiểm toán/vận hành bất biến:** Tuyệt đối không dùng câu lệnh `DELETE` để xóa bớt các dòng `MessageDelivery` trùng lặp trong quá khứ. Mọi trường bằng chứng gồm `id`, `sent_at`, `provider_message_id`, `rendered_content`, `variables_snapshot`, `zalo_account_id`/`line_account_id`, `attendance_id` phải được giữ nguyên 100% để phục vụ đối soát với phụ huynh/học viên và nhà cung cấp (Zalo/LINE).
2. **Mọi bản ghi chưa gửi (`SCHEDULED`, `QUEUED`) bị thay thế cũng không bị `DELETE`:** Khi hội tụ nhiều bản ghi chưa gửi của cùng một mốc về một dòng duy nhất, các dòng dư thừa phải được chuyển sang trạng thái kết thúc có vết kiểm toán (`CANCELLED` kèm `error_message` nêu rõ lý do và `id` của dòng được giữ lại), đồng thời hủy job tương ứng trên BullMQ.

### 2.2. Báo cáo kiểm toán trùng lặp chỉ đọc (Read-only Duplicate Report — SQL chuẩn)

Trước khi bàn tới bất kỳ thay đổi schema nào, đội vận hành/kỹ thuật chạy các truy vấn **chỉ đọc (`SELECT`)** sau để định lượng hiện trạng dữ liệu trên DB:

#### (a1) Thống kê các cặp `(enrollment_id, automation_step_id)` có từ 2 dòng trở lên (phân tách theo `trigger_event` và trạng thái)

```sql
-- Truy vấn 1 (READ-ONLY): Tổng hợp các cặp (enrollment_id, automation_step_id) có >= 2 bản ghi MessageDelivery
SELECT
  md.enrollment_id,
  md.automation_step_id,
  s.workflow_id,
  s.session_number,
  s.trigger_event,
  COUNT(*) AS total_rows,
  SUM(CASE WHEN md.status = 'SENT' THEN 1 ELSE 0 END) AS sent_count,
  SUM(CASE WHEN md.status = 'SENDING' THEN 1 ELSE 0 END) AS sending_count,
  SUM(CASE WHEN md.status = 'QUEUED' THEN 1 ELSE 0 END) AS queued_count,
  SUM(CASE WHEN md.status = 'SCHEDULED' THEN 1 ELSE 0 END) AS scheduled_count,
  SUM(CASE WHEN md.status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled_count,
  SUM(CASE WHEN md.status = 'FAILED' THEN 1 ELSE 0 END) AS failed_count,
  SUM(CASE WHEN md.status LIKE 'SKIPPED_%' THEN 1 ELSE 0 END) AS skipped_count,
  GROUP_CONCAT(
    CONCAT(
      '#', md.id,
      '(att=', md.attendance_id,
      ',st=', md.status,
      ',pmid=', IFNULL(md.provider_message_id, 'NULL'),
      ',job=', IFNULL(md.queue_job_id, 'NULL'), ')'
    )
    ORDER BY md.id ASC
    SEPARATOR '; '
  ) AS delivery_audit_trail
FROM message_deliveries md
INNER JOIN automation_steps s ON s.id = md.automation_step_id
GROUP BY
  md.enrollment_id,
  md.automation_step_id,
  s.workflow_id,
  s.session_number,
  s.trigger_event
HAVING COUNT(*) > 1
ORDER BY
  (s.trigger_event = 'ATTENDED') DESC,
  sent_count DESC,
  total_rows DESC,
  md.enrollment_id ASC,
  md.automation_step_id ASC;
```

#### (a2) Tóm tắt cấp cao theo `trigger_event` và nhóm rủi ro (Chỉ đọc)

```sql
-- Truy vấn 2 (READ-ONLY): Phân loại nhóm trùng lặp theo trigger_event và tính chất trạng thái
SELECT
  s.trigger_event,
  COUNT(*) AS duplicate_occurrence_groups,
  SUM(t.total_rows) AS total_delivery_rows_in_groups,
  SUM(CASE WHEN t.sent_count >= 2 THEN 1 ELSE 0 END) AS groups_with_multiple_sent,
  SUM(CASE WHEN t.sent_count = 1 AND t.unsent_active_count >= 1 THEN 1 ELSE 0 END) AS groups_with_sent_plus_pending,
  SUM(CASE WHEN t.sent_count = 0 AND t.unsent_active_count >= 2 THEN 1 ELSE 0 END) AS groups_with_multiple_pending
FROM (
  SELECT
    md.enrollment_id,
    md.automation_step_id,
    COUNT(*) AS total_rows,
    SUM(CASE WHEN md.status IN ('SENT', 'SENDING') THEN 1 ELSE 0 END) AS sent_count,
    SUM(CASE WHEN md.status IN ('SCHEDULED', 'QUEUED') THEN 1 ELSE 0 END) AS unsent_active_count
  FROM message_deliveries md
  GROUP BY md.enrollment_id, md.automation_step_id
  HAVING COUNT(*) > 1
) t
INNER JOIN automation_steps s ON s.id = t.automation_step_id
GROUP BY s.trigger_event
ORDER BY s.trigger_event ASC;
```

### 2.3. Quy tắc tất định chọn bản ghi tiếp tục (Unified Canonical Row Selection) & Xử lý bản ghi chưa gửi dư thừa

> **QUY TẮC CANONICAL DÙNG CHUNG CHO TOÀN BỘ TÀI LIỆU (`§2.3`, `§7.3` Backfill/Delta-Sync và `§7.5 R3` Rollback Verification):**
> Cả ba nơi bắt buộc dùng chung **một biểu thức xếp hạng SQL duy nhất** (khối `k7_basis` + `ORDER BY` 3 tầng dưới đây), đối chiếu khớp với quy tắc chọn canonical của tầng ứng dụng (`pickCanonicalOccurrence` trong `automation-repository.ts` dòng 584–611 và `reconcileEnrollmentMilestones` trong `automation-trigger.service.ts` dòng 975–1012). Sự nhất trị SQL ↔ ứng dụng được **kiểm chứng tự động bằng diễn tập DB thực tế** trong `backend/src/modules/automation/__tests__/s1-migration-rehearsal.integration.test.ts` (Case 1 so trực tiếp kết quả SQL với `automationRepository.findDeliveryForMilestoneOccurrence`).

Đối với các bước thuộc họ mốc `trigger_event = 'ATTENDED'`, trước tiên xác định **bản ghi điểm danh căn cứ hiện hành (`current_basis_attendance_id` / `k7_basis.attendance_id`)** của mốc `k = step.session_number`:
- Tập hợp các bản ghi điểm danh chuẩn K7 của ghi danh: `a.status = 'ATTENDED'`, `a.reconciliation_state IN ('MATCHED', 'RESOLVED')`, `a.deleted_at IS NULL`, sắp xếp theo `(cs.session_date ASC, a.created_at ASC, a.id ASC)` (`ROW_NUMBER() OVER (PARTITION BY ec.enrollment_id ORDER BY cs.session_date ASC, a.created_at ASC, a.id ASC) AS k7_ordinal` — đúng bằng `findMilestoneBasisRows`).
- Bản ghi có `k7_ordinal = s.session_number` chính là `k7_basis.attendance_id` (nếu ghi danh hiện có ít hơn `s.session_number` buổi K7 thì `k7_basis.attendance_id IS NULL`).

Khi tồn tại $\ge 1$ dòng `message_deliveries` cho cùng `(enrollment_id, automation_step_id)`, **1 dòng đại diện duy nhất (canonical row)** được chọn theo thứ tự 3 tầng (`Tier 1 -> Tier 2 -> Tier 3`):

1. **Tier 1 (`PROTECTED` — Bảo vệ bằng chứng đã/đang gửi: `status IN ('SENT', 'SENDING')`):**
   - Không bao giờ bị thay thế bởi các dòng chưa gửi hay dòng đã hủy.
   - Nếu có dòng ở trạng thái `SENT` hoặc `SENDING`, ưu tiên `SENT` (1) $\rightarrow$ `SENDING` (2), và nếu có nhiều dòng cùng trạng thái thì chọn dòng phát sinh sớm nhất (`md.id ASC`, khớp với `rows.find(r => r.status === 'SENT' || r.status === 'SENDING')` trên danh sách `orderBy: { id: 'asc' }`).
   - **Hệ quả:** Khi đã có dòng `SENT`/`SENDING`, **mọi dòng `SCHEDULED`/`QUEUED` còn lại trong cùng cặp `(enrollment_id, automation_step_id)` bắt buộc phải chuyển sang `CANCELLED` và gỡ job BullMQ** để không gửi lặp lần 2.
2. **Tier 2 (`ACTIVE` — Các bản ghi chưa gửi đang hoạt động: `status IN ('QUEUED', 'SCHEDULED')`):**
   - Khi chưa có dòng `SENT`/`SENDING`, các dòng đang chờ gửi (`QUEUED`, `SCHEDULED`) luôn đứng trước các dòng đã kết thúc (`CANCELLED`, `FAILED`, `SKIPPED_*`).
   - Trong nhóm `ACTIVE`, **ưu tiên tuyệt đối bản ghi có `md.attendance_id = k7_basis.attendance_id`** (khớp với `const basisMatch = rows.find(r => r.attendance_id === basisAttendanceId)` trong `pickCanonicalOccurrence`), tránh xung đột với khóa `@@unique([attendance_id, automation_step_id])` khi rebind.
   - Nếu không có (hoặc cùng khớp) `k7_basis.attendance_id`, xếp theo tiến độ `QUEUED` (3) $\rightarrow$ `SCHEDULED` (4), rồi `md.id ASC`.
3. **Tier 3 (`REST` — Các bản ghi đã kết thúc: `CANCELLED`, `FAILED`, `SKIPPED_*`):**
   - Loại trừ xuống cuối các dòng phụ đã bị đánh dấu gộp trùng (`error_message LIKE 'Superseded duplicate%'` hoặc `error_message LIKE 'Rollback reconciliation:%'`).
   - Ưu tiên dòng khớp `md.attendance_id = k7_basis.attendance_id` (nếu có), sau đó xếp `CANCELLED` (5) $\rightarrow$ `FAILED`/`SKIPPED_*` (6), rồi `md.id ASC`.

**Biểu thức SQL chuẩn hóa dùng chung cho `§2.3`, `§7.3` và `§7.5 R3`:**

```sql
-- Biểu thức xếp hạng Canonical dùng chung (Unified Canonical Selector — MySQL 8.0):
ROW_NUMBER() OVER (
  PARTITION BY md.enrollment_id, md.automation_step_id
  ORDER BY
    -- Tier 1 (PROTECTED): SENT (1) > SENDING (2) > các trạng thái khác (3)
    CASE
      WHEN md.status = 'SENT' THEN 1
      WHEN md.status = 'SENDING' THEN 2
      ELSE 3
    END ASC,
    -- Tier 2 vs Tier 3: Nhóm ACTIVE (QUEUED/SCHEDULED) đứng trước nhóm REST (CANCELLED/FAILED/SKIPPED_*)
    CASE
      WHEN md.status IN ('SENT', 'SENDING') THEN 0
      WHEN md.status IN ('QUEUED', 'SCHEDULED') THEN 1
      ELSE 2
    END ASC,
    -- Đẩy các bản ghi phụ đã bị đánh dấu Superseded / Rollback reconciliation xuống sau bản ghi gốc
    CASE
      WHEN COALESCE(md.error_message, '') LIKE 'Superseded duplicate%'
        OR COALESCE(md.error_message, '') LIKE 'Rollback reconciliation:%'
      THEN 1
      ELSE 0
    END ASC,
    -- Khi chưa SENT/SENDING: Ưu tiên bản ghi khớp căn cứ điểm danh K7 hiện hành (md.attendance_id = k7_basis.attendance_id)
    CASE
      WHEN md.status NOT IN ('SENT', 'SENDING')
       AND k7_basis.attendance_id IS NOT NULL
       AND md.attendance_id = k7_basis.attendance_id
      THEN 0
      ELSE 1
    END ASC,
    -- Thứ bậc trạng thái chi tiết (SENT < SENDING < QUEUED < SCHEDULED < CANCELLED < FAILED/SKIPPED_*)
    CASE md.status
      WHEN 'SENT' THEN 1
      WHEN 'SENDING' THEN 2
      WHEN 'QUEUED' THEN 3
      WHEN 'SCHEDULED' THEN 4
      WHEN 'CANCELLED' THEN 5
      ELSE 6
    END ASC,
    -- Tie-breaker tất định theo id tăng dần (khớp orderBy: { id: 'asc' } trong pickCanonicalOccurrence)
    md.id ASC
) AS rn
```

**Quy trình xử lý các dòng chưa gửi (`SCHEDULED`, `QUEUED`) không được chọn (`extras`):**
- **Bước 1 (Hàng đợi BullMQ):** Gọi `cancelDelivery(extra.id, extra.queue_job_id)` để gỡ job `automation:delivery:${extra.id}` khỏi Redis/BullMQ.
- **Bước 2 (Cập nhật trạng thái có vết, KHÔNG xóa):**
  Cập nhật tại chỗ bản ghi `extra`:
  - `status = 'CANCELLED'`
  - `error_message = 'Superseded duplicate milestone occurrence (canonical delivery #<canonical_id>)'`
- *(Ghi chú về enum trạng thái)*: Trong `schema.prisma` hiện tại, `MessageDeliveryStatus` có giá trị `CANCELLED` (chưa có enum `SUPERSEDED` riêng). Ở tầng ứng dụng hiện hành (`automation-trigger.service.ts` dòng 996–998), hệ thống ghi `status = 'CANCELLED'` kèm `error_message = 'Superseded duplicate milestone occurrence'`. Nếu Owner muốn phân biệt tường minh trên bộ lọc UI giữa *"Hủy do tụt dưới mốc"* và *"Hủy do gộp bản ghi trùng"*, có thể bổ sung giá trị `SUPERSEDED` vào `enum MessageDeliveryStatus` trong một migration tương lai; trước mắt `status = 'CANCELLED'` + tiền tố chuẩn trong `error_message` bảo toàn đầy đủ vết kiểm toán mà không cần đổi enum.

### 2.4. Quyết định lưu trữ lịch sử & Điều kiện tiên quyết (Preconditions) trước khi thêm bất kỳ Unique Constraint nào

Một ràng buộc phẳng `UNIQUE (enrollment_id, automation_step_id)` trực tiếp trên bảng `message_deliveries` **không thể共存 (cùng tồn tại)** với việc giữ lại các dòng lịch sử trùng cặp `(enrollment_id, automation_step_id)` trong cùng bảng đó (dù dòng thứ hai đã ở trạng thái `CANCELLED` hay là dòng `SENT` lịch sử thứ hai).

Do đó, **Điều kiện tiên quyết bắt buộc (Preconditions)** trước khi thực thi bất kỳ DDL nào là:

1. **Precondition P1 (Không xóa dòng trong `message_deliveries`):** Nếu giữ nguyên toàn bộ lịch sử trong `message_deliveries` (bao gồm cả các dòng `SENT` trùng trong quá khứ và các dòng `CANCELLED` bị superseded), **KHÔNG ĐƯỢC** đặt `UNIQUE(enrollment_id, automation_step_id)` phẳng trên toàn bộ các dòng của `message_deliveries`. Thay vào đó, phải dùng **Cơ chế khóa có phạm vi (Scoped Uniqueness)** ở Mục 3 bên dưới (Bảng `milestone_occurrences` riêng hoặc Generated Column chỉ sinh khóa cho occurrence đang giữ vai trò canonical).
2. **Precondition P2 (Đã hội tụ hết các dòng `SCHEDULED`/`QUEUED` trùng):** Kết quả chạy Truy vấn 2 ở Mục 2.2 cho `trigger_event = 'ATTENDED'` phải thỏa mãn:
   - `groups_with_sent_plus_pending = 0` (không còn dòng `SCHEDULED`/`QUEUED` nào tồn tại song song với dòng `SENT`/`SENDING`).
   - `groups_with_multiple_pending = 0` (không còn cặp `(enrollment_id, automation_step_id)` nào có từ 2 dòng `SCHEDULED`/`QUEUED` trở lên).
3. **Precondition P3 (Đối soát `SENDING` treo):** Không còn bản ghi nào kẹt ở trạng thái `SENDING` quá thời gian lease mà chưa được phân định (xem Mục 5).

---

## 3. Điểm 2 — Phạm vi áp dụng (Scope): Khảo sát 6 `AutomationTriggerEvent` & Cơ chế Khóa Duy nhất có Phạm vi trên MySQL 8

### 3.1. Khảo sát toàn diện từng `AutomationTriggerEvent` trong codebase hiện tại

Trong `backend/prisma/schema.prisma` (dòng 647–654), `AutomationTriggerEvent` có đúng 6 giá trị, ánh xạ 1-1 từ `AttendanceStatus`:

| `AutomationTriggerEvent` | Ý nghĩa nghiệp vụ | Nhánh xử lý trong `automation-trigger.service.ts` | Cách tính `session_number` khi đối sánh bước (`resolveEnrollmentSessionNumber`) | Một `Enrollment` hợp lệ có thể có **NHIỀU** `MessageDelivery` cho cùng một `AutomationStep` theo thời gian không? |
|---|---|---|---|---|
| **`ATTENDED`** | Học viên có mặt (buổi học tích lũy vào tiến độ gói học K7) | **Milestone Occurrence Engine** (`applyMilestoneOccurrence` + `reconcileEnrollmentMilestones`, dòng 424–435, 525–535) | `1 + count(FINAL ATTENDED trước dòng hiện tại)` theo thứ tự `(session_date, created_at, id)`. Mỗi buổi `ATTENDED` làm tăng số đếm K7 lên 1. | **KHÔNG (Tối đa 1 occurrence active/sent).** Mỗi mốc buổi học thứ `k` của một ghi danh chỉ được phép hoàn thành và gửi tin chăm sóc/đánh giá đúng 1 lần. |
| **`ABSENT_APPROVED_A`** | Nghỉ có phép (được duyệt / báo trước đúng quy định) | **Legacy Per-Row Path** (`findDeliveryForIdempotency(attendanceId, step.id)`, dòng 437–517) | Hàm `resolveEnrollmentSessionNumber` (dòng 1245–1268) **chỉ đếm các dòng `status = 'ATTENDED'`**. Bản ghi nghỉ `ABSENT_APPROVED_A` **không** làm tăng bộ đếm `ATTENDED`. | **CÓ.** Nếu học viên đã học 4 buổi (`ATTENDED = 4`), sau đó nghỉ có phép 2 buổi liên tiếp (`att_1` ngày 18/10 và `att_2` ngày 20/10) trước khi học buổi thứ 5, cả `att_1` và `att_2` đều có `sessionNumber = 4 + 1 = 5`. Cả hai buổi nghỉ đều khớp bước `(session_number=5, trigger_event=ABSENT_APPROVED_A)` với 2 `attendance_id` khác nhau. |
| **`LEAVE_B`** | Nghỉ phép loại B | **Legacy Per-Row Path** (dòng 437–517) | Đếm số dòng `FINAL ATTENDED` đứng trước $+ 1$ (không tăng khi phát sinh `LEAVE_B`). | **CÓ.** Hai buổi `LEAVE_B` liên tiếp giữa buổi học thứ `k-1` và thứ `k` đều có cùng `sessionNumber = k` và tạo 2 `MessageDelivery` hợp lệ gắn với 2 `attendance_id` khác nhau. |
| **`ABSENT_UNAPPROVED_C`** | Nghỉ không phép | **Legacy Per-Row Path** (dòng 437–517) | Đếm số dòng `FINAL ATTENDED` đứng trước $+ 1$ (không tăng khi phát sinh `ABSENT_UNAPPROVED_C`). | **CÓ.** Học viên nghỉ không phép nhiều buổi liên tiếp khi đang dừng ở cùng số buổi đã học `k-1` sẽ luôn tính ra cùng `sessionNumber = k`, tạo nhiều `MessageDelivery` trên cùng `automation_step_id`. |
| **`TEACHER_ABSENT_D`** | Giáo viên vắng | **Legacy Per-Row Path** (dòng 437–517) | Đếm số dòng `FINAL ATTENDED` đứng trước $+ 1$ (không tăng khi giáo viên vắng). | **CÓ.** Nếu giáo viên cáo bận 2 buổi liên tiếp tại cùng mốc tiến độ của học viên, cả 2 buổi đều có cùng `sessionNumber = k`. |
| **`TECH_ERROR_E`** | Lỗi kỹ thuật | **Legacy Per-Row Path** (dòng 437–517) | Đếm số dòng `FINAL ATTENDED` đứng trước $+ 1$ (không tăng khi buổi học bị lỗi kỹ thuật). | **CÓ.** Hai buổi lỗi kỹ thuật liên tiếp ở cùng tiến độ học tạo 2 `MessageDelivery` hợp lệ cho cùng `(enrollment_id, automation_step_id)`. |

#### Kết luận từ khảo sát code:
1. Trong thiết kế hiện tại (`automation-trigger.service.ts` dòng 1245–1268), `resolveEnrollmentSessionNumber` luôn truy vấn `where: { status: 'ATTENDED', reconciliation_state: { in: ['MATCHED', 'RESOLVED'] }, deleted_at: null }`. Vì các trạng thái vắng/lỗi (`ABSENT_APPROVED_A`, `LEAVE_B`, `ABSENT_UNAPPROVED_C`, `TEACHER_ABSENT_D`, `TECH_ERROR_E`) không làm tăng số buổi `ATTENDED`, một học viên hoàn toàn có thể phát sinh **nhiều buổi vắng/lỗi liên tiếp có cùng `sessionNumber`** trước khi hoàn thành buổi `ATTENDED` tiếp theo.
2. Ngoài ra, ngay cả khi một buổi học ở mốc `k` ban đầu bị đánh dấu `ABSENT_UNAPPROVED_C` (đã gửi tin báo vắng cho phụ huynh), sau đó buổi học bù mới là `ABSENT_UNAPPROVED_C` lần nữa, mỗi sự kiện điểm danh (`attendance_id`) là một sự kiện thông báo độc lập.
3. **Do đó, Phương án A của bản v1.0 (`@@unique([enrollment_id, automation_step_id])` toàn cục trên `message_deliveries`) KHÔNG PHẢI là "tương thích ngược 100%":** Nếu áp dụng toàn cục, nó sẽ chặn (hoặc gây lỗi `P2002`) mọi lần gửi thông báo thứ hai trở đi của các bước `non-ATTENDED` khi học viên vắng/lỗi liên tiếp tại cùng một mốc buổi học, đồng thời xung đột trực tiếp với yêu cầu bảo toàn không xóa các dòng lịch sử trùng trong `message_deliveries`.

---

### 3.2. Các cơ chế MySQL 8.0 cụ thể cho Ràng buộc Duy nhất có Phạm vi (Scoped Uniqueness)

Để vừa **khóa cứng 1 occurrence cho mỗi `(enrollment_id, automation_step_id)` thuộc họ mốc `ATTENDED`** ở tầng CSDL, vừa **không ảnh hưởng tới các bước `non-ATTENDED`**, vừa **không phải `DELETE` bất kỳ dòng lịch sử nào trong `message_deliveries`**, có 2 cơ chế kỹ thuật chuẩn trên MySQL 8.0:

---

#### Phương án S1 (KHUYẾN NGHỊ CHÍNH) — Bảng `milestone_occurrences` chuyên biệt cho họ mốc `ATTENDED`

Tách định danh mốc `(enrollment_id, automation_step_id)` vào bảng `milestone_occurrences` chỉ dành cho các bước theo mốc (`trigger_event = 'ATTENDED'`), trong khi giữ nguyên bảng `message_deliveries` làm nhật ký các lần giao phát tin nhắn (delivery log).

```prisma
model MilestoneOccurrence {
  id                    Int                   @id @default(autoincrement())
  enrollment_id         Int
  automation_step_id    Int
  basis_attendance_id   Int
  canonical_delivery_id Int?                  @unique
  session_number        Int
  status                MessageDeliveryStatus @default(SCHEDULED)
  first_reached_at      DateTime              @default(now())
  satisfied_at          DateTime?
  updated_at            DateTime              @updatedAt

  enrollment            Enrollment            @relation(fields: [enrollment_id], references: [id], onDelete: Cascade)
  automation_step       AutomationStep        @relation(fields: [automation_step_id], references: [id], onDelete: Cascade)
  basis_attendance      Attendance            @relation(fields: [basis_attendance_id], references: [id])
  canonical_delivery    MessageDelivery?      @relation("CanonicalMilestoneDelivery", fields: [canonical_delivery_id], references: [id])

  @@unique([enrollment_id, automation_step_id])
  @@index([enrollment_id, session_number])
  @@map("milestone_occurrences")
}
```

**SQL DDL tương ứng (MySQL 8.0 — Không xóa bất kỳ dòng nào trong `message_deliveries`):**

```sql
CREATE TABLE `milestone_occurrences` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `enrollment_id` INT NOT NULL,
  `automation_step_id` INT NOT NULL,
  `basis_attendance_id` INT NOT NULL,
  `canonical_delivery_id` INT NULL,
  `session_number` INT NOT NULL,
  `status` ENUM(
    'SCHEDULED', 'QUEUED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED',
    'SKIPPED_NOT_FRIEND', 'SKIPPED_GROUP_INACTIVE', 'SKIPPED_ACCOUNT_INACTIVE',
    'SKIPPED_SESSION_EXPIRED', 'SKIPPED_DISABLED'
  ) NOT NULL DEFAULT 'SCHEDULED',
  `first_reached_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `satisfied_at` DATETIME(3) NULL DEFAULT NULL,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `milestone_occurrences_enrollment_id_automation_step_id_key` (`enrollment_id`, `automation_step_id`),
  UNIQUE INDEX `milestone_occurrences_canonical_delivery_id_key` (`canonical_delivery_id`),
  INDEX `milestone_occurrences_enrollment_id_session_number_idx` (`enrollment_id`, `session_number`),
  CONSTRAINT `milestone_occurrences_enrollment_id_fkey`
    FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `milestone_occurrences_automation_step_id_fkey`
    FOREIGN KEY (`automation_step_id`) REFERENCES `automation_steps`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `milestone_occurrences_basis_attendance_id_fkey`
    FOREIGN KEY (`basis_attendance_id`) REFERENCES `attendances`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `milestone_occurrences_canonical_delivery_id_fkey`
    FOREIGN KEY (`canonical_delivery_id`) REFERENCES `message_deliveries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

**Ưu điểm vượt trội của Phương án S1:**
1. **Bảo toàn 100% lịch sử `message_deliveries` (Zero-Delete):** Ngay cả khi dữ liệu lịch sử trước commit `0970bec` có 2 dòng `SENT` hoặc 1 dòng `SENT` + 1 dòng `CANCELLED` cho cùng `(enrollment_id, automation_step_id)`, toàn bộ các dòng đó vẫn nằm nguyên trong `message_deliveries`. Bảng `milestone_occurrences` chỉ nạp đúng 1 dòng đại diện (`canonical_delivery_id` trỏ tới dòng thắng theo quy tắc tất định ở Mục 2.3).
2. **Cách ly tuyệt đối phạm vi `ATTENDED`:** Chỉ các bước `trigger_event = 'ATTENDED'` mới ghi vào `milestone_occurrences`. Các bước `ABSENT_APPROVED_A`, `LEAVE_B`, `ABSENT_UNAPPROVED_C`, `TEACHER_ABSENT_D`, `TECH_ERROR_E` tiếp tục ghi vào `message_deliveries` với khóa `(attendance_id, automation_step_id)` mà không bị chặn.
3. **Khóa cứng cấp DB chống race condition:** `UNIQUE (enrollment_id, automation_step_id)` trên `milestone_occurrences` đóng vai trò chốt chặn vật lý cuối cùng ở tầng InnoDB.

---

#### Phương án S2 — Cột sinh tự động có điều kiện (MySQL 8.0 Conditional Generated Column) ngay trên `message_deliveries`

Nếu không muốn tạo bảng mới mà muốn đặt khóa duy nhất ngay trên `message_deliveries`, có thể tận dụng tính chất chuẩn SQL của MySQL 8.0 InnoDB: **trong một `UNIQUE INDEX`, các giá trị `NULL` không va chạm với nhau (`(enrollment_id=10, NULL)` có thể lặp lại vô hạn lần, nhưng `(enrollment_id=10, milestone_step_key=41)` chỉ được xuất hiện tối đa 1 lần).**

Lưu ý: MySQL 8.0 không cho phép biểu thức `GENERATED ALWAYS AS (...)` tham chiếu sang bảng khác (`automation_steps.trigger_event`). Do đó, ta thêm cột cờ `is_canonical_milestone TINYINT(1) NULL` (chỉ mang giá trị `1` đối với occurrence chính thức của bước `ATTENDED`, và mang `NULL` đối với các bước `non-ATTENDED` hoặc các dòng lịch sử đã bị `CANCELLED` do superseded):

```sql
ALTER TABLE `message_deliveries`
  ADD COLUMN `is_canonical_milestone` TINYINT(1) NULL DEFAULT NULL,
  ADD COLUMN `milestone_unique_step_id` INT GENERATED ALWAYS AS (
    IF(`is_canonical_milestone` = 1, `automation_step_id`, NULL)
  ) VIRTUAL,
  ADD UNIQUE INDEX `message_deliveries_enrollment_milestone_canonical_key` (
    `enrollment_id`,
    `milestone_unique_step_id`
  );
```

- Khi tạo mới hoặc giữ dòng canonical của bước `ATTENDED`: đặt `is_canonical_milestone = 1` $\Rightarrow$ `milestone_unique_step_id = automation_step_id` $\Rightarrow$ InnoDB cưỡng bức duy nhất theo `(enrollment_id, automation_step_id)`.
- Khi tạo delivery cho bước `non-ATTENDED` (`ABSENT_*`, `LEAVE_B`, `TEACHER_ABSENT_D`, `TECH_ERROR_E`): để `is_canonical_milestone = NULL` $\Rightarrow$ `milestone_unique_step_id = NULL` $\Rightarrow$ InnoDB cho phép nhiều dòng cho cùng `(enrollment_id, automation_step_id)`.
- Khi đánh dấu một dòng trùng lịch sử là `CANCELLED (Superseded)`: chuyển `is_canonical_milestone = NULL` để giữ nguyên dòng lịch sử trong bảng mà không vi phạm Unique Index.

*(Hạn chế của S2 so với S1: Prisma Schema `schema.prisma` chưa hỗ trợ cú pháp `GENERATED ALWAYS AS`原生 mà phải quản lý qua raw migration SQL + `@ignore` hoặc cột thường, trong khi Phương án S1 biểu diễn tường minh 100% bằng Prisma model chuẩn).*

---

#### Phương án S3 (Biến thể có điều kiện — KHÔNG khuyến nghị mặc định) — Global `@@unique([enrollment_id, automation_step_id])`

Chỉ được phép xem xét nếu thỏa mãn **đồng thời** cả 2 điều kiện nghiệp vụ sau từ Owner:
1. Nghiệp vụ quyết định rằng **mọi** `AutomationTriggerEvent` (kể cả nghỉ có phép/không phép/giáo viên vắng/lỗi kỹ thuật) cũng chỉ được gửi tối đa 1 lần cho mỗi `(enrollment_id, automation_step_id)` trong suốt vòng đời ghi danh.
2. Toàn bộ các dòng trùng lịch sử trong `message_deliveries` đã được di chuyển sang một bảng lưu trữ kiểm toán riêng (`message_deliveries_archive`) trước khi chạy `ALTER TABLE`.

### 3.3. Kết luận khuyến nghị cho Điểm 2
**Tài liệu này khuyến nghị Phương án S1 (`MilestoneOccurrence` chỉ cho `ATTENDED`)** (hoặc **Phương án S2** nếu muốn giữ 1 bảng duy nhất), vì:
- Bảo vệ trọn vẹn các bước `non-ATTENDED` khỏi lỗi chặn nhầm khi học viên vắng nhiều buổi ở cùng một mốc tiến độ;
- Không cần xóa hay di dời bất kỳ dòng lịch sử nào trong `message_deliveries`;
- Khớp 1-1 với phạm vi `trigger_event === 'ATTENDED'` đã được triển khai trong `automation-trigger.service.ts`.

---

## 4. Điểm 3 — Ngữ nghĩa khi chỉnh sửa `AutomationStep` đã có `MessageDelivery`

### 4.1. Khảo sát hiện trạng API cập nhật bước (`PATCH /api/v1/automation/steps/:stepId`)
Hiện tại, trong `backend/src/modules/automation/automation.routes.ts` (dòng 170–197) và `automation.service.ts` (dòng 93–108), endpoint `PATCH /steps/:stepId` đang cho phép cập nhật tất cả 8 trường trên `AutomationStep`:
`session_number`, `trigger_event`, `delay_minutes`, `channel`, `target_group_id`, `message_content`, `message_variables`, `active` mà **chưa kiểm tra** xem bước đó đã phát sinh bản ghi `MessageDelivery` nào hay chưa.

### 4.2. Phân loại Trường Được Phép Sửa (Editable) vs Trường Định Danh Cần Khóa (Protected)

Vì định danh của một occurrence là `(enrollment_id, automation_step_id)`, trong đó `automation_step_id` đại diện cho mốc `(workflow_id, session_number, trigger_event)`, việc sửa các trường định danh sau khi đã có `MessageDelivery` sẽ làm sai lệch lịch sử (ví dụ: một bước đã gửi tin ở buổi thứ 5 bị sửa `session_number` thành buổi thứ 10 sẽ khiến học viên đó bị tính là "đã nhận tin buổi 10" dù thực tế mới nhận tin buổi 5, và không bao giờ nhận được tin ở buổi 10 thực sự).

Bảng quy định ngữ nghĩa các trường của `AutomationStep`:

| Trường trên `AutomationStep` | Phân loại khi `deliveries_count == 0` | Phân loại khi `deliveries_count > 0` | Quy tắc & Hành vi chuẩn |
|---|---|---|---|
| `workflow_id` | **Khóa (Immutable)** | **Khóa (Immutable)** | Không bao giờ được chuyển một step sang workflow khác. |
| `session_number` | Cho phép sửa | **KHÓA (Protected)** | Định danh mốc buổi học. Khi bước đã có bất kỳ `MessageDelivery` nào, không được phép đổi `session_number`. Nếu muốn đổi mốc buổi, phải tắt bước cũ (`active = false`) và tạo bước mới. |
| `trigger_event` | Cho phép sửa | **KHÓA (Protected)** | Định danh loại sự kiện kích hoạt (`ATTENDED` vs `non-ATTENDED`). Không được phép đổi khi đã có delivery để tránh biến đổi ngữ nghĩa giữa milestone occurrence và per-row delivery. |
| `message_content` | Cho phép sửa | **Cho phép sửa (Editable)** | Chỉ áp dụng cho các lần render mới trong tương lai (tạo mới, rebind căn cứ mới, hoặc reactivate từ `CANCELLED`). Không làm thay đổi các bản ghi đã `SENT`/`SENDING`. |
| `message_variables` | Cho phép sửa | **Cho phép sửa (Editable)** | Cập nhật danh sách biến khai báo của template cho các lần render tiếp theo. |
| `delay_minutes` | Cho phép sửa | **Cho phép sửa (Editable)** | Chỉ áp dụng cho các lần `enqueueDelivery` mới hoặc khi `reactivate` từ `CANCELLED`. Các job đang `QUEUED` giữ nguyên lịch hẹn đã đặt. |
| `channel` | Cho phép sửa | **Cho phép sửa (Editable)** | Áp dụng cho các lần tạo mới hoặc `reactivate` trong tương lai. Lưu ý: các dòng đang `SCHEDULED`/`QUEUED` đã gắn `zalo_account_id`/`line_account_id` lúc tạo sẽ gửi theo kênh đã chốt trên delivery trừ khi được `reactivate`. |
| `target_group_id` | Cho phép sửa | **Cho phép sửa (Editable)** | Bắt buộc khác `null` nếu `channel` là `ZALO_GROUP` hoặc `LINE_GROUP`. Áp dụng cho các lần resolve target mới. |
| `active` | Cho phép sửa | **Cho phép sửa (Editable)** | Khi đặt `active = false`, bước ngừng kích hoạt tạo mới cho các học viên tiếp theo. |

> **Trạng thái triển khai trong code (`automation.service.ts` & `automation-repository.ts`):** Đã triển khai sớm theo chỉ đạo của Owner (*"Làm sớm, không cần đợi migration"*):
> - `AutomationRepository.countDeliveriesForStep(stepId)` đếm số bản ghi `MessageDelivery` gắn với bước.
> - `AutomationService.updateStep` chặn với mã `409 Conflict` (`'Bước đã có lịch sử gửi — không thể thay đổi mốc (session_number) hoặc trigger_event. Hãy tạo bước mới nếu cần mốc khác.'`) khi `dto.session_number` hoặc `dto.trigger_event` thay đổi so với giá trị hiện tại và `deliveryCount > 0`. Các trường vận hành (`message_content`, `message_variables`, `delay_minutes`, `channel`, `target_group_id`, `active`) vẫn cho phép chỉnh sửa bình thường.
> - `AutomationService.deleteStep` chặn với mã `409 Conflict` (`'Bước đã có bản ghi gửi — không thể xóa. Hãy đặt active=false để ngừng áp dụng.'`) khi `deliveryCount > 0` (đồng thời bắt phòng thủ lỗi khóa ngoại `P2003`).

### 4.3. Nguồn sự thật của nội dung đã gửi (`Snapshot = Source of Truth`) & Quy tắc "Không cấp quyền gửi lại"

1. **`rendered_content` và `variables_snapshot` trên `MessageDelivery` là nguồn sự thật duy nhất (Source of Truth) cho lịch sử giao phát:**
   - Khi một `MessageDelivery` được tạo ra, nội dung đã kết xuất (`rendered_content`) và toàn bộ biến tại thời điểm đó (`variables_snapshot`) được đóng băng trên dòng `MessageDelivery`.
   - Tại thời điểm gửi thực tế, `automation-worker.ts` (dòng 176, 195, 204, 285, 298) đọc trực tiếp `delivery.rendered_content` từ DB để gửi qua Zalo/LINE, **không** đọc lại `automation_step.message_content`.
   - Đối với mọi bản ghi ở trạng thái `SENT` hoặc `SENDING`, `rendered_content` và `variables_snapshot` là bất biến tuyệt đối — mọi chỉnh sửa trên `AutomationStep` sau đó không làm thay đổi lịch sử đã lưu trên `MessageDelivery`.
2. **Chỉnh sửa cấu hình hoặc nội dung `AutomationStep` KHÔNG cấp quyền gửi lại (No Re-send Rights on Step Edit):**
   - Định danh occurrence là `(enrollment_id, automation_step_id)`.
   - Khi một học viên đã có occurrence ở trạng thái `SENT` (hoặc `SENDING`) cho `automation_step_id`, việc CS/Admin sửa `message_content`, đổi `channel`, đổi `delay_minutes`, hay tắt rồi bật lại `active` (`false → true`) **tuyệt đối không** xóa lịch sử occurrence và **không** tạo quyền gửi lại tin nhắn mốc đó cho học viên.

---

## 5. Điểm 4 — Phục hồi khi sự cố giữa chừng (`SENDING` Recovery) & Quy tắc Retry

### 5.1. Ngữ nghĩa của trạng thái `SENDING`
Trong `automation-worker.ts` (dòng 159–162 cho LINE và dòng 270–273 cho Zalo), worker chuyển trạng thái bản ghi sang `status = 'SENDING'` ngay trước khi gọi hàm gửi mạng (`dispatcher.send*` hoặc `api.sendMessage`), và chuyển sang `status = 'SENT'` (kèm `sent_at`, `provider_message_id`) ngay sau khi hàm gửi trả về thành công.

Do đó, nếu tiến trình worker bị sập nguồn (SIGKILL / OOM / mất kết nối DB) khi bản ghi đang ở trạng thái `SENDING`:
1. **`SENDING` KHÔNG phải là bằng chứng nhà cung cấp đã nhận tin (`SENDING ≠ SENT`):**
   Tiến trình có thể bị ngắt ở một trong hai thời điểm:
   - *Trước khi gói tin tới Zalo/LINE:* Tin nhắn chưa hề được gửi đi.
   - *Sau khi Zalo/LINE đã nhận và phát tin tới học viên, nhưng trước khi câu lệnh `UPDATE ... SET status = 'SENT'` kịp commit xuống MySQL:* Tin nhắn **đã** đến tay người nhận, chỉ thiếu cập nhật DB.
2. **Bảo vệ chống tạo dòng mới khi đang `SENDING` hoặc đang Retry:**
   - Trong `automation-trigger.service.ts` (dòng 96, 609), `MILESTONE_PROTECTED_STATUSES = new Set(['SENT', 'SENDING'])`. Khi occurrence đang ở `SENDING`, mọi sự kiện điểm danh hoặc đối soát chạy qua đều trả về `SKIPPED_DUPLICATE` (`reason: 'Send in progress for this milestone'`), **cấm tuyệt đối** việc tạo thêm dòng `MessageDelivery` thứ hai hay hủy dòng đang `SENDING`.
   - **Đơn vị retry duy nhất:** Chính dòng `MessageDelivery` hiện hữu (`delivery.id`) là đơn vị retry duy nhất của occurrence `(enrollment_id, automation_step_id)`. Không bao giờ tạo một dòng `MessageDelivery` mới để thay thế cho một dòng cũ đang retry hoặc đang `SENDING`.

### 5.2. Quy trình đối soát và phục hồi các bản ghi `SENDING` bị treo (Uncertain Send Reconciliation)

Một bản ghi có `status = 'SENDING'` và `updated_at < NOW() - INTERVAL 5 MINUTE` (vượt quá thời gian thực thi tối đa của một lời gọi HTTP Zalo/LINE và không còn job active trong BullMQ) được xác định là **Stuck / Uncertain `SENDING`**. Cách xử lý phụ thuộc vào khả năng chống trùng (idempotency) của từng nhà cung cấp:

| Kênh gửi | Khả năng đối soát / Idempotency của Provider trong Codebase | Quy trình phục hồi chuẩn khi kẹt ở `SENDING` |
|---|---|---|
| **LINE (`LINE_PERSONAL`, `LINE_GROUP`)** | Trong `automation-worker.ts` (dòng 39–48, 166), mỗi `deliveryId` sinh ra một `retryKey` UUID v4 tất định: `buildLineRetryKey(deliveryId)` từ `sha256("edura:line:delivery:" + deliveryId)`. LINE Messaging API hỗ trợ header `X-Line-Retry-Key` chống gửi trùng trong vòng 24 giờ. | Nếu thời점 hiện tại còn trong cửa sổ hiệu lực của `X-Line-Retry-Key` và dispatcher truyền header này tới LINE API, có thể chuyển lại chính dòng `delivery.id` sang `QUEUED` (tăng `retry_count`) để retry an toàn trên cùng `retryKey`. Nếu không xác minh được với provider, chuyển sang trạng thái cảnh báo cho vận hành. |
| **Zalo (`ZALO_PERSONAL`, `ZALO_GROUP` qua `zca-js`)** | Thư viện `zca-js` (`api.sendMessage(content, threadId, threadType)`) **không** có tham số idempotency key do caller truyền vào và hiện chưa có API tra cứu trạng thái tin nhắn theo `deliveryId` nội bộ khi `provider_message_id` chưa kịp lưu. | **Cấm tự động phát lại (No Blind Auto-Retry)** một dòng Zalo bị kẹt ở `SENDING` (vì nếu gói tin trước đó đã tới Zalo server, phát lại sẽ gây gửi trùng cho phụ huynh/học viên). Bản ghi phải được giữ ở trạng thái hiển thị rõ cho CS/Vận hành (ví dụ: giữ `SENDING` hoặc đánh dấu `FAILED` với `error_message = 'UNCERTAIN_SEND: Worker interrupted during SENDING; verify Zalo thread before manual retry'`) để kiểm tra lịch sử chat trước khi quyết định. |

### 5.3. Phát hiện lệch giữa cấu hình Retry của BullMQ và `automation-worker.ts` (Báo cáo trung thực)

Qua rà soát code hiện hành giữa `automation-bullmq-adapter.ts` và `automation-worker.ts`, tài liệu này ghi nhận một điểm lệch kỹ thuật cần Owner lưu ý:
1. Trong `automation-bullmq-adapter.ts` (dòng 30–36), hàng đợi `automation-delivery` được cấu hình:
   ```ts
   defaultJobOptions: {
     removeOnComplete: 100,
     removeOnFail: 50,
     attempts: 3,
     backoff: { type: 'exponential', delay: 60_000 },
   }
   ```
2. Trong `automation-worker.ts` (dòng 228–239 cho LINE và dòng 319–331 cho Zalo), khi lần gửi thứ nhất gặp lỗi mạng và nhảy vào khối `catch (sendErr)`:
   - Worker cập nhật DB: `status = 'FAILED'`, `error_message = sendErr.message`, `retry_count: { increment: 1 }`.
   - Sau đó worker `throw sendErr;` để BullMQ kích hoạt cơ chế retry (`attempts: 3`, chờ 60 giây cho lần thử thứ 2).
3. **Điểm lệch (Discrepancy):** Khi BullMQ chạy lại job ở lần thử thứ 2 (`attempt #2`), hàm `processDeliveryJob` kiểm tra ở dòng 95:
   ```ts
   if (!['SCHEDULED', 'QUEUED'].includes(delivery.status)) {
     log.info('Delivery no longer pending — skipping', { deliveryId, status: delivery.status });
     return;
   }
   ```
   Vì lần thử thứ 1 đã đổi `delivery.status` sang `'FAILED'`, lần thử thứ 2 (và thứ 3) của BullMQ sẽ **bị bỏ qua ngay ở dòng 95** thay vì thực hiện gửi lại! Tương tự, trong `automation-trigger.service.ts` (dòng 732–742), một occurrence đã mang `status = 'FAILED'` được coi là đã tồn tại (`SKIPPED_DUPLICATE`) và không tạo dòng mới.
4. **Trạng thái đã khắc phục trong `automation-worker.ts` (Triển khai sớm theo chỉ đạo của Owner):**
   - **Cổng kiểm tra đầu vào (Top Gate):** Cho phép xử lý tiếp các dòng `status = 'FAILED'` có `retry_count < MAX_DELIVERY_ATTEMPTS (3)` và `error_message` không mang tiền tố `UNCERTAIN_SEND:`. Mọi lần thử lại đều bắt buộc chạy lại `checkInvariants(delivery)` + `checkMilestoneStillEligible(delivery)` trước khi chạm tới mạng. Các dòng `SENDING` tuyệt đối không bao giờ bị worker tự động gửi lại mù quáng (no blind-resend).
   - **Phân loại 3 lớp chắc chắn (Certainty Classes) tại điểm lỗi:**
     - **Lớp (1) `PRE_SEND` (Chắc chắn chưa gửi):** Lỗi phát sinh trước khi gọi `api.sendMessage` / `dispatcher.send*` (ví dụ: thiếu `zalo_group_id` / `line_group_id`, lỗi truy vấn DB khi `resolvePersonalTarget*`, hoặc lỗi kiểm tra quota/rate-limit trước HTTP) $\rightarrow$ cập nhật cùng dòng `delivery.id` sang `status = 'FAILED'`, `error_message = 'PRE_SEND: <err>'`, tăng `retry_count` và `throw` để BullMQ retry theo backoff trên cùng `delivery.id`.
     - **Lớp (2) `UNCERTAIN_SEND` (Chưa rõ kết quả giao phát trên server nhà cung cấp):**
       - Với **Zalo (`zca-js`)**: Lỗi ném ra trong lúc thực thi `api.sendMessage(...)` khi chưa nhận được `provider_message_id` $\rightarrow$ đánh dấu `status = 'FAILED'`, `error_message = 'UNCERTAIN_SEND: <err> — kiểm tra lịch sử thread Zalo trước khi thử lại'`, tăng `retry_count` và **KHÔNG `throw`** (kết thúc job, không tự động retry để tránh gửi trùng).
       - Với **LINE `PERSONAL` (`@evex/linejs`)**: Qua kiểm tra thực tế `src/modules/line/line-pool.ts` và `line-personal.adapter.ts`, nhánh `LinePersonalAdapter.sendMessage` không truyền header `X-Line-Retry-Key` $\rightarrow$ lỗi giữa chừng khi gọi `sendMessage` cũng được xếp vào Lớp (2) `UNCERTAIN_SEND` và **KHÔNG tự động retry**.
     - **Lớp (3) `LINE OA` có `X-Line-Retry-Key` (`account_type !== 'PERSONAL'`):** Qua kiểm tra `src/modules/line/line-oa.adapter.ts` (`invokePushMessage`, dòng 287–305), `LineOaAdapter` truyền `retryKey = buildLineRetryKey(deliveryId)` vào `@line/bot-sdk` `pushMessage(payload, retryKey)` (gắn header `X-Line-Retry-Key`, hiệu lực chống trùng 24 giờ phía LINE Platform và xử lý idempotent mã HTTP `409 Conflict` tại dòng 242–250) $\rightarrow$ an toàn để đánh dấu `FAILED`, tăng `retry_count` và `throw` cho BullMQ retry trên cùng `delivery.id` với cùng `retryKey`.

---

## 6. Điểm 5 — Tính nhất quán khi Rebind (`SCHEDULED`/`QUEUED`) & Cam kết dưới `NO_SEND`

Phần này ghim chặt hành vi chính xác của hệ thống hiện tại (đã được chứng minh bằng bộ kiểm thử tự động trong `automation-milestone-stability.test.ts` và `milestone-dedup-reeval.acceptance.integration.test.ts`).

### 6.1. Khi một occurrence đang `SCHEDULED` / `QUEUED` được Rebind sang `attendance_id` mới, trường nào thay đổi và trường nào giữ nguyên?

Khi hàm `applyMilestoneOccurrence` (`automation-trigger.service.ts` dòng 631–674) phát hiện occurrence hiện hữu đang ở trạng thái chưa gửi (`SCHEDULED` hoặc `QUEUED`), mốc vẫn đủ điều kiện nhưng bản ghi điểm danh căn cứ tại vị trí thứ `k` đã đổi (`canonical.attendance_id !== basis.id`):

| Trường trên `MessageDelivery` | Hành vi khi Rebind (`rebindDeliveryBasis`) | Giải thích chi tiết |
|---|---|---|
| **`id`** | **GIỮ NGUYÊN** | Bảo toàn định danh duy nhất của occurrence `(enrollment_id, automation_step_id)`. |
| **`attendance_id`** | **CẬP NHẬT MỚI (`= basis.id`)** | Trỏ sang bản ghi điểm danh hiện đang đứng ở vị trí thứ `k` theo danh sách chuẩn K7. |
| **`rendered_content`** | **TÍNH LẠI & CẬP NHẬT MỚI** | Gọi `renderMilestoneContent(step, enrollment, sessionNumber, basis)` (dòng 637) và ghi đè `rendered_content` theo thông tin của buổi căn cứ mới (ví dụ: nếu buổi `basis` mới thuộc lớp chuyển ngang hoặc giáo viên khác, tên lớp `{{class_name}}` và tên giáo viên `{{teacher_name}}` trong nội dung tin nhắn được làm mới chính xác theo buổi `basis` mới). |
| **`variables_snapshot`** | **TÍNH LẠI & CẬP NHẬT MỚI** | Ghi đè JSON snapshot các biến (`student_name`, `session_number`, `remaining_sessions`, `class_name`, `teacher_name`, `attendance_status`, `cs_name`) khớp với `rendered_content` mới. |
| **`scheduled_at`** | **GIỮ NGUYÊN** | `rebindDeliveryBasis` (`automation-repository.ts` dòng 427–444) **không** chạm vào `scheduled_at`. Thời điểm lên lịch ban đầu của mốc được bảo toàn. *(Lưu ý: Chỉ khi một dòng `CANCELLED` được `reactivateDelivery` trở lại trạng thái `SCHEDULED` thì `scheduled_at` mới được đặt lại bằng `new Date()`).* |
| **`status` & `queue_job_id`** | **GIỮ NGUYÊN (`SCHEDULED` / `QUEUED`)** | Không gọi lại `enqueueDelivery` khi dòng đã nằm trên hàng đợi (`localOps` không đẩy thêm lệnh `enqueue`), tránh tạo 2 job hoặc kéo dài thêm `delay_minutes` một cách không cần thiết. |

### 6.2. Điều gì xảy ra với BullMQ Job đã được đẩy vào hàng đợi từ trước (mang `SendJobData` có `attendanceId` cũ)?

Khi occurrence được tạo lần đầu với căn cứ là buổi B (`attendanceId = B`), job BullMQ `automation:delivery:${deliveryId}` được đẩy vào Redis với payload:
```json
{
  "deliveryId": 9001,
  "automationStepId": 41,
  "enrollmentId": 300,
  "attendanceId": 902
}
```
Sau đó, buổi A chốt muộn hơn làm căn cứ của mốc dịch từ `902` (B) sang `901` (A). Trên DB, dòng `MessageDelivery(id=9001)` được rebind tại chỗ: `attendance_id = 901`, `rendered_content` và `variables_snapshot` được cập nhật theo buổi A, nhưng job đang nằm chờ trong Redis vẫn mang `job.data.attendanceId = 902`.

**Tại sao việc `job.data.attendanceId` trong Redis cũ hơn DB là hoàn toàn vô hại và luôn gửi đúng?**
1. **Worker tải lại toàn bộ bản ghi từ DB theo `deliveryId` tại thời điểm gửi:**
   Trong `processDeliveryJob` (`automation-worker.ts` dòng 53–88):
   ```ts
   const { deliveryId } = job.data;
   const delivery = await prisma.messageDelivery.findUnique({
     where: { id: deliveryId },
     include: { automation_step: true, enrollment: ..., attendance: ... },
   });
   ```
   Worker **không bao giờ** đọc `job.data.attendanceId` và **không** chứa nội dung tin nhắn trong `job.data`. Toàn bộ `delivery.rendered_content`, `delivery.attendance_id`, và quan hệ `delivery.attendance` đều được đọc tươi (fresh read) từ MySQL ngay lúc gửi. Do đó, worker luôn gửi đúng `rendered_content` mới nhất đã được rebind theo buổi A.
2. **Chốt chặn đúng đắn tại thời điểm gửi là `checkInvariants` / `checkMilestoneStillEligible`:**
   Trước khi phát tin, `processDeliveryJob` gọi `checkInvariants(delivery)` $\rightarrow$ `checkMilestoneStillEligible(delivery)` (dòng 338–391):
   - Đếm lại số buổi K7 thực tế trong DB (`status = 'ATTENDED'`, `reconciliation_state IN ('MATCHED', 'RESOLVED')`, `deleted_at IS NULL`) của `delivery.enrollment_id`. Nếu `count < step.session_number`, worker hủy gửi ngay lập tức và đánh dấu `status = 'CANCELLED'`, `error_message = 'Milestone no longer eligible at send time'`.
   - Kiểm tra bản ghi `delivery.attendance` hiện tại (đã trỏ sang buổi A sau rebind) vẫn còn hợp lệ (`deleted_at === null`, `reconciliation_state` thuộc `MATCHED`/`RESOLVED`, `status === 'ATTENDED'`).

### 6.3. Hành vi của `NO_SEND` đối với các occurrence đang ở trạng thái `CANCELLED`

Bên cạnh cam kết *"không tạo dòng `MessageDelivery` mới (`0 new rows`)"*, dưới chính sách `deliveryPolicy = 'NO_SEND'`:
- Nếu một mốc trước đó đã tạo `MessageDelivery`, sau đó bị chuyển sang `status = 'CANCELLED'` (do buổi học căn cứ chuyển sang `CONFLICT`), rồi nay dữ liệu điểm danh được chốt lại làm ghi danh **đủ điều kiện chạm mốc trở lại** nhưng lời gọi mang `deliveryPolicy: 'NO_SEND'`:
  - Trong `reconcileEnrollmentMilestones` (dòng 1029–1031): `if (canonical.status === 'CANCELLED' && !canCreate) continue;`
  - Trong `applyMilestoneOccurrence` (dòng 680): `if (policy !== 'SEND') return { local, localOps };`
- **Kết quả bất biến:** Dòng `MessageDelivery` đang `CANCELLED` **tuyệt đối không được kích hoạt lại** (vẫn giữ nguyên `status = 'CANCELLED'`) và **không có bất kỳ lời gọi `enqueueDelivery` nào** được phát sinh. Chỉ khi có sự kiện chạy dưới `deliveryPolicy = 'SEND'` thì dòng `CANCELLED` đó mới được `reactivateDelivery` tại chỗ.

---

## 7. S1 — Kế hoạch chuyển đổi (Cutover) & Rollback

Mục này quy định quy trình chuyển đổi không gián đoạn (zero-loss, additive-only cutover) và kế hoạch hoàn tác (rollback) cho **Phương án S1 (Bảng `milestone_occurrences`)** khi Owner phê duyệt thực thi migration.

> **Chỉ đạo của Owner (2026-10-26):** *"Với S1, mình vẫn ủng hộ hướng bảng occurrence riêng; chưa duyệt cách rollback chỉ bằng drop bảng. Mô tả 'không DELETE delivery cũ' đã tốt hơn nhiều. Nhưng trước khi chạy migration cần chứng minh: (1) Giữ đủ lịch sử, đặc biệt các nhóm có nhiều SENT hoặc SENDING. (2) Chỉ một cơ chế gửi có hiệu lực trong lúc chuyển đổi. (3) Rollback sau khi đã phát sinh occurrence/delivery mới vẫn giữ được chống gửi trùng. (4) Lỗi truy cập bảng mới không bị coi nhầm là 'chưa có bảng' rồi âm thầm fallback. Việc drop bảng mới có thể là bước cuối của rollback sau đối soát; bản thân nó chưa phải toàn bộ phương án rollback."*
>
> **Bảng ánh xạ 4 yêu cầu bắt buộc + 3 điểm hiệu chỉnh SQL/Cutover (v2.3) → giải pháp → bằng chứng nghiệm thu:**
>
> | Yêu cầu của Owner | Giải pháp quy định trong Mục 7 | Bằng chứng nghiệm thu |
>|---|---|---|
> | **(a)** Giữ đủ lịch sử, đặc biệt các nhóm có nhiều `SENT`/`SENDING` | Mục 7.1 + 7.1b: `0 DELETE` trên `message_deliveries`; báo cáo trước migration (§2.2) liệt kê mọi nhóm nhiều `SENT`/`SENDING`; dòng canonical gắn vào `milestone_occurrences.canonical_delivery_id`; **mọi dòng `SENT`/`SENDING` còn lại được liên kết ngược về occurrence qua cột mới `message_deliveries.milestone_occurrence_id`** | Checklist C4 + C6: `0` dòng `SENT`/`SENDING` của bước `ATTENDED` có `milestone_occurrence_id IS NULL` sau backfill |
> | **(b)** Chỉ một cơ chế gửi có hiệu lực trong lúc chuyển đổi & chặn toàn bộ đường ghi khi Cutover | Mục 7.4: cờ **`MILESTONE_STORAGE_MODE = LEGACY_DELIVERY_SCAN \| S1_OCCURRENCE_TABLE`** (Single Active Authority) kết hợp cổng chặn ghi **`MAINTENANCE_FREEZE_MILESTONE_WRITES = true`** (chặn cả API `attendance`, `attendance-reconciliation`, `import-excel/confirm`, `automation` lẫn `automation-worker`), chờ xả hết giao dịch đang chạy (`information_schema.innodb_trx`), chạy Delta-Sync thực chất + đối soát từng trường dữ liệu trước khi đổi mode đồng bộ; không cam kết cứng thời lượng `"< 1 phút"` khi chưa đo thực tế trên Staging | Checklist C7: thử nghiệm Write-Quiesce + đổi mode đồng bộ trên Staging, đo thời gian xả giao dịch và đối soát thực tế |
> | **(c)** Rollback sau khi đã phát sinh occurrence/delivery mới vẫn giữ chống gửi trùng & không ghi đè bằng chứng `SENT`/`SENDING` | Mục 7.5: quy trình rollback **R1–R5** có cổng tiền kiểm **`R2.0 (Contradiction Pre-Check Gate)`** dừng rollback ngay nếu phát hiện mâu thuẫn `SENT`/`SENDING`, **`R2.1`** chỉ đồng bộ các trạng thái chưa gửi (`WHERE md.status NOT IN ('SENT', 'SENDING') AND mo.status NOT IN ('SENT', 'SENDING')`), và **`R3`** đối soát bằng cùng quy tắc canonical K7 với ứng dụng | Checklist C8 + `s1-migration-rehearsal.integration.test.ts` (Case 3): chứng minh `R2.0` chặn mâu thuẫn, `R2.1` không bao giờ ghi đè `SENT`, và `R3` khớp 100% từng trường |
> | **(d)** Lỗi truy cập bảng mới không bị coi nhầm là "chưa có bảng" rồi âm thầm fallback | Mục 7.4b: **Fail-Closed** — khi mode = `S1_OCCURRENCE_TABLE`, mọi lỗi DB trên `milestone_occurrences` phải ném lỗi + abort + không enqueue + cảnh báo; startup probe fail-fast; cấm mọi `try/catch → fallback legacy` | Checklist C9: fault-injection (rename bảng tạm / thu hồi quyền) xác nhận worker **từ chối gửi** thay vì fallback |

### 7.1. Nguyên tắc chuyển đổi: Chỉ thêm mới (Additive-Only, Zero `DELETE`)

1. **Không xóa, không cắt bớt bất kỳ dòng nào trong `message_deliveries`:**
   Tuân thủ tuyệt đối quy tắc tại Mục 2, quá trình chuyển đổi sang bảng `milestone_occurrences` chỉ sử dụng `CREATE TABLE` và `INSERT INTO milestone_occurrences ... SELECT ... FROM message_deliveries`. Bảng `message_deliveries` giữ nguyên 100% số dòng lịch sử (kể cả các dòng trùng lặp lịch sử đã `SENT` hoặc các dòng dư thừa đã chuyển sang `CANCELLED`).
2. **Mỗi cặp `(enrollment_id, automation_step_id)` thuộc bước `trigger_event = 'ATTENDED'` ánh xạ thành đúng 1 dòng trong `milestone_occurrences` theo Quy tắc Canonical dùng chung (`§2.3`):**
   Dòng được chọn để nạp vào `milestone_occurrences.canonical_delivery_id` và `basis_attendance_id` sử dụng chính biểu thức xếp hạng 3 tầng đã chuẩn hóa ở Mục 2.3 (khớp 100% với `pickCanonicalOccurrence`):
   - **Tier 1 (`PROTECTED`):** `SENT` (1) $\rightarrow$ `SENDING` (2), lấy `md.id ASC` nhỏ nhất.
   - **Tier 2 (`ACTIVE`):** `QUEUED` / `SCHEDULED`, ưu tiên dòng có `md.attendance_id = k7_basis.attendance_id` (buổi `FINAL ATTENDED` thứ `k = step.session_number` theo thứ tự chuẩn K7 `cs.session_date ASC, a.created_at ASC, a.id ASC`), sau đó `QUEUED` (3) $\rightarrow$ `SCHEDULED` (4), rồi `md.id ASC`.
   - **Tier 3 (`REST`):** `CANCELLED` (5) $\rightarrow$ `FAILED` / `SKIPPED_*` (6), đẩy các dòng phụ `Superseded duplicate%` / `Rollback reconciliation:%` xuống sau dòng gốc, ưu tiên khớp `k7_basis.attendance_id`, rồi `md.id ASC`.

### 7.1b. Bảo toàn TOÀN BỘ lịch sử khi một cặp `(enrollment_id, automation_step_id)` có nhiều `SENT` hoặc `SENDING` (Yêu cầu a)

Đây là điểm mà phương án "chỉ có `canonical_delivery_id` một chiều" chưa đủ: nếu chỉ trỏ `milestone_occurrences.canonical_delivery_id` vào 1 dòng duy nhất, các dòng `SENT`/`SENDING` **lịch sử thứ hai trở đi** trong cùng nhóm sẽ không còn liên kết nào ngược về occurrence — chúng tồn tại trong `message_deliveries` nhưng "mồ côi" đối với mọi truy vấn bắt đầu từ `milestone_occurrences`. Quy định bắt buộc để đóng khoảng trống đó:

1. **`message_deliveries` giữ 100% dòng lịch sử `SENT`/`SENDING`, không đụng tới (`0 DELETE`):**
   Toàn bộ bản ghi (kể cả các bản ghi trùng `SENT`/`SENDING` phát sinh trước commit `0970bec`, tức trước khi có cơ chế Milestone Occurrence ở tầng ứng dụng) nằm nguyên vị trí cũ với nguyên mọi trường bằng chứng (`id`, `sent_at`, `provider_message_id`, `rendered_content`, `variables_snapshot`, `attendance_id`, tài khoản kênh…). Không sửa `status` của bất kỳ dòng `SENT`/`SENDING` lịch sử nào.
2. **Báo cáo trước migration liệt kê tường minh mọi nhóm nhiều `SENT`/`SENDING`:**
   Mục 2.2 (Truy vấn 1 & 2) chạy ở dạng **báo cáo snapshot đính kèm hồ sơ migration** (checklist C1). Với mỗi cặp `(enrollment_id, automation_step_id)` có `sent_count >= 2` hoặc `sending_count >= 2` (kể cả sau khi đã phân định `SENDING` treo), báo cáo phải nêu: danh sách toàn bộ `md.id` trong nhóm kèm `attendance_id`, `sent_at`, `provider_message_id`, và dòng nào được chọn làm canonical theo Mục 2.3. Owner duyệt danh sách này **trước khi** chạy DDL.
3. **Liên kết hai chiều occurrence ↔ mọi dòng delivery lịch sử qua cột mới `message_deliveries.milestone_occurrence_id`:**
   - `milestone_occurrences.canonical_delivery_id` (đã có ở DDL Mục 3.2; Owner gọi là `current_delivery_id` — trỏ dòng đại diện duy nhất mà cơ chế gửi sẽ tôn trọng).
   - **Cột mở rộng mới (nullable, additive-only)** trên `message_deliveries`:

```sql
-- Cột liên kết ngược (nullable FK): mọi dòng ATTENDED delivery — canonical LẪN các dòng SENT/SENDING/CANCELLED lịch sử
-- — đều trỏ về occurrence của mốc đó. Thêm cột NULL-safe, không sửa bất kỳ dòng nào hiện có.
ALTER TABLE `message_deliveries`
  ADD COLUMN `milestone_occurrence_id` INT NULL DEFAULT NULL,
  ADD INDEX `message_deliveries_milestone_occurrence_id_idx` (`milestone_occurrence_id`),
  ADD CONSTRAINT `message_deliveries_milestone_occurrence_id_fkey`
    FOREIGN KEY (`milestone_occurrence_id`) REFERENCES `milestone_occurrences`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
```

   - **Bước liên kết sau backfill (UPDATE chỉ ghi đè cột mới, không đổi `status` hay bất kỳ trường bằng chứng nào):**

```sql
-- Gán milestone_occurrence_id cho TOÀN BỘ dòng delivery của bước ATTENDED
-- (canonical + mọi dòng SENT/SENDING/CANCELLED/FAILED lịch sử trong cùng nhóm):
UPDATE `message_deliveries` md
INNER JOIN `automation_steps` s ON s.id = md.automation_step_id
INNER JOIN `milestone_occurrences` mo
  ON mo.enrollment_id = md.enrollment_id
 AND mo.automation_step_id = md.automation_step_id
SET md.`milestone_occurrence_id` = mo.`id`
WHERE s.`trigger_event` = 'ATTENDED'
  AND md.`milestone_occurrence_id` IS NULL;
```

4. **Bất biến kiểm chứng (không một dòng `SENT`/`SENDING` nào mồ côi khỏi occurrence):**

```sql
-- Truy vấn nghiệm thu C6 (READ-ONLY) — phải trả về 0 hàng:
-- Mọi dòng SENT/SENDING của bước ATTENDED phải mang milestone_occurrence_id (kể cả các dòng lịch sử thứ 2+ không được chọn làm canonical).
SELECT md.id, md.enrollment_id, md.automation_step_id, md.status, md.sent_at, md.provider_message_id
FROM `message_deliveries` md
INNER JOIN `automation_steps` s ON s.id = md.automation_step_id
WHERE s.`trigger_event` = 'ATTENDED'
  AND md.`status` IN ('SENT', 'SENDING')
  AND md.`milestone_occurrence_id` IS NULL;

-- Truy vấn đối soát hai chiều C4b (READ-ONLY) — 0 hàng vi phạm:
-- canonical_delivery_id của mọi occurrence phải thuộc chính nhóm (enrollment_id, automation_step_id) và được liên kết ngược về nó.
SELECT mo.id
FROM `milestone_occurrences` mo
LEFT JOIN `message_deliveries` cd
  ON cd.id = mo.canonical_delivery_id
 AND cd.enrollment_id = mo.enrollment_id
 AND cd.automation_step_id = mo.automation_step_id
 AND cd.milestone_occurrence_id = mo.id
WHERE cd.id IS NULL;
```

5. **Ngữ nghĩa khi truy vấn lịch sử:** mọi câu hỏi kiểu *"milestone này từng được gửi bao nhiêu lần, bằng chứng ở đâu"* giờ trả lời được từ **cả hai phía**: từ occurrence (`SELECT md.* FROM message_deliveries md WHERE md.milestone_occurrence_id = <mo.id> ORDER BY md.id`) liệt kê đủ toàn bộ `SENT`/`SENDING` quá khứ; từ dòng delivery (`md.milestone_occurrence_id`) biết ngay dòng đó thuộc mốc nào và có phải canonical hiện hành không (`cd.id = mo.canonical_delivery_id`).

### 7.2. Xử lý các nhóm trùng lặp lịch sử & các dòng đã `CANCELLED`-Superseded trước khi Backfill

Trước khi chạy câu lệnh `INSERT ... SELECT` nạp bảng `milestone_occurrences`:
1. **Đối với các nhóm có $\ge 2$ dòng lịch sử đã được `reconcileEnrollmentMilestones` hội tụ (`CANCELLED` với `error_message = 'Superseded duplicate milestone occurrence'`):**
   - Trong cùng một cặp `(enrollment_id, automation_step_id)`, các dòng phụ đã mang `status = 'CANCELLED'` (trọng số 5), trong khi dòng chính (canonical) mang `SENT` (1), `SENDING` (2), `QUEUED` (3), hoặc `SCHEDULED` (4).
   - Nếu toàn bộ các dòng trong nhóm đều đang ở `CANCELLED` (ví dụ: có 1 dòng `CANCELLED` do tụt dưới mốc và 1 dòng `CANCELLED` do superseded), biểu thức xếp hạng trong SQL Backfill bên dưới ưu tiên dòng **không phải** `Superseded duplicate%` trước (`CASE WHEN md.error_message LIKE 'Superseded duplicate%' THEN 1 ELSE 0 END ASC`), sau đó mới xét `md.id ASC`. Nhờ vậy, `canonical_delivery_id` luôn trỏ vào bản ghi occurrence gốc chứ không trỏ nhầm vào bản ghi phụ bị superseded.
2. **Đối với các nhóm còn tồn đọng $\ge 2$ dòng đang `SCHEDULED`/`QUEUED` chưa hội tụ (nếu có trên môi trường cũ):**
   - Chạy bước hội tụ ứng dụng (hoặc cập nhật trạng thái có vết `status = 'CANCELLED'`, `error_message = CONCAT('Superseded duplicate milestone occurrence (canonical delivery #', canonical_id, ')')` kèm gỡ job BullMQ) trước khi backfill, đảm bảo Precondition P2 (`groups_with_sent_plus_pending = 0` và `groups_with_multiple_pending = 0`).

### 7.3. Câu lệnh Backfill & Delta-Sync SQL Chỉ Thêm Mới (Unified Canonical Selector + Monotonic Guard — MySQL 8.0)

Câu lệnh dưới đây vừa dùng cho **Initial Backfill** (khi hệ thống còn đang mở ở `LEGACY_DELIVERY_SCAN`), vừa dùng cho **Final Delta-Sync** (sau khi đã bật cổng chặn ghi ở Bước 3 của Mục 7.4).

**Hai hiệu chỉnh cốt lõi theo phản biện của Owner (v2.3):**
1. **Quy tắc chọn Canonical thống nhất với `§2.3` và `pickCanonicalOccurrence`:** Tính buổi `FINAL ATTENDED` thứ `k` hiện hành theo chuẩn K7 (`k7_basis.attendance_id` qua `ROW_NUMBER() OVER (PARTITION BY ec.enrollment_id ORDER BY cs.session_date ASC, a.created_at ASC, a.id ASC)`) và ưu tiên bản ghi khớp `md.attendance_id = k7_basis.attendance_id` đối với các dòng chưa gửi.
2. **Delta-Sync thực chất kèm chốt chặn bảo vệ đơn điệu (`Monotonic Protection Guard`):**
   - Thay vì `ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at)` (vốn làm các chuyển đổi `QUEUED -> SENT` giữa lần backfill đầu và lúc cutover bị bỏ sót), câu lệnh cập nhật đầy đủ `basis_attendance_id`, `canonical_delivery_id`, `satisfied_at`, `status`, `updated_at` khi chạy lại.
   - **Chốt chặn đơn điệu (Monotonic Guard):**
     * Nếu dòng hiện hữu trong `milestone_occurrences` đã ở trạng thái **`SENT`**: **TUYỆT ĐỐI KHÔNG** hạ cấp `status`, **KHÔNG** đổi `canonical_delivery_id`, và **KHÔNG** đổi `basis_attendance_id`.
     * Nếu dòng hiện hữu đang ở trạng thái **`SENDING`**: chỉ cho phép chuyển sang `'SENT'` khi chính cùng `canonical_delivery_id` đó đã hoàn tất gửi (`VALUES(status) = 'SENT' AND VALUES(canonical_delivery_id) = milestone_occurrences.canonical_delivery_id`); mọi trường hợp khác giữ nguyên `'SENDING'` để vận hành đối soát.
     * Khi dòng hiện hữu **chưa** ở `SENT` / `SENDING` (`milestone_occurrences.status NOT IN ('SENT', 'SENDING')`): cập nhật `basis_attendance_id = VALUES(basis_attendance_id)`, `canonical_delivery_id = VALUES(canonical_delivery_id)`, `satisfied_at = COALESCE(milestone_occurrences.satisfied_at, VALUES(satisfied_at))`, `status = VALUES(status)`, `updated_at = VALUES(updated_at)`.
   - *(Lưu ý kỹ thuật MySQL 8.0)*: MySQL đánh giá các phép gán trong `ON DUPLICATE KEY UPDATE` tuần tự từ trái sang phải (top-to-bottom). Do đó, `basis_attendance_id`, `canonical_delivery_id`, và `satisfied_at` **bắt buộc** được đặt **trước** phép gán `status = CASE ... END` để điều kiện kiểm tra `milestone_occurrences.status` đọc đúng trạng thái cũ trước khi `status` chuyển sang giá trị mới.

```sql
-- BƯỚC BACKFILL & DELTA-SYNC (ADDITIVE-ONLY, ZERO DELETE, MONOTONIC-GUARDED):
-- Nạp và đồng bộ đúng 1 dòng canonical cho mỗi (enrollment_id, automation_step_id) của các bước ATTENDED
-- từ message_deliveries sang milestone_occurrences theo đúng quy tắc pickCanonicalOccurrence (§2.3).
INSERT INTO `milestone_occurrences` (
  `enrollment_id`,
  `automation_step_id`,
  `basis_attendance_id`,
  `canonical_delivery_id`,
  `session_number`,
  `status`,
  `first_reached_at`,
  `satisfied_at`,
  `updated_at`
)
SELECT
  ranked.enrollment_id,
  ranked.automation_step_id,
  ranked.attendance_id AS basis_attendance_id,
  ranked.id AS canonical_delivery_id,
  ranked.session_number,
  ranked.status,
  ranked.first_reached_at,
  ranked.satisfied_at,
  NOW(3) AS updated_at
FROM (
  SELECT
    md.id,
    md.enrollment_id,
    md.automation_step_id,
    md.attendance_id,
    md.status,
    s.session_number,
    MIN(md.created_at) OVER (
      PARTITION BY md.enrollment_id, md.automation_step_id
    ) AS first_reached_at,
    CASE
      WHEN md.status = 'SENT' THEN COALESCE(md.sent_at, md.created_at)
      ELSE MIN(md.created_at) OVER (
        PARTITION BY md.enrollment_id, md.automation_step_id
      )
    END AS satisfied_at,
    ROW_NUMBER() OVER (
      PARTITION BY md.enrollment_id, md.automation_step_id
      ORDER BY
        -- Tier 1 (PROTECTED): SENT (1) > SENDING (2) > các trạng thái khác (3)
        CASE
          WHEN md.status = 'SENT' THEN 1
          WHEN md.status = 'SENDING' THEN 2
          ELSE 3
        END ASC,
        -- Tier 2 vs Tier 3: Nhóm ACTIVE (QUEUED/SCHEDULED) đứng trước nhóm REST (CANCELLED/FAILED/SKIPPED_*)
        CASE
          WHEN md.status IN ('SENT', 'SENDING') THEN 0
          WHEN md.status IN ('QUEUED', 'SCHEDULED') THEN 1
          ELSE 2
        END ASC,
        -- Đẩy các bản ghi phụ đã bị đánh dấu Superseded / Rollback reconciliation xuống sau bản ghi gốc
        CASE
          WHEN COALESCE(md.error_message, '') LIKE 'Superseded duplicate%'
            OR COALESCE(md.error_message, '') LIKE 'Rollback reconciliation:%'
          THEN 1
          ELSE 0
        END ASC,
        -- Khi chưa SENT/SENDING: Ưu tiên bản ghi khớp căn cứ điểm danh K7 hiện hành (md.attendance_id = k7_basis.attendance_id)
        CASE
          WHEN md.status NOT IN ('SENT', 'SENDING')
           AND k7_basis.attendance_id IS NOT NULL
           AND md.attendance_id = k7_basis.attendance_id
          THEN 0
          ELSE 1
        END ASC,
        -- Thứ bậc trạng thái chi tiết (SENT < SENDING < QUEUED < SCHEDULED < CANCELLED < FAILED/SKIPPED_*)
        CASE md.status
          WHEN 'SENT' THEN 1
          WHEN 'SENDING' THEN 2
          WHEN 'QUEUED' THEN 3
          WHEN 'SCHEDULED' THEN 4
          WHEN 'CANCELLED' THEN 5
          ELSE 6
        END ASC,
        -- Tie-breaker tất định theo id tăng dần (khớp orderBy: { id: 'asc' } trong pickCanonicalOccurrence)
        md.id ASC
    ) AS rn
  FROM `message_deliveries` md
  INNER JOIN `automation_steps` s ON s.id = md.automation_step_id
  LEFT JOIN (
    SELECT
      ec.enrollment_id,
      a.id AS attendance_id,
      ROW_NUMBER() OVER (
        PARTITION BY ec.enrollment_id
        ORDER BY cs.session_date ASC, a.created_at ASC, a.id ASC
      ) AS k7_ordinal
    FROM `attendances` a
    INNER JOIN `enrollment_classes` ec ON ec.id = a.enrollment_class_id
    INNER JOIN `class_sessions` cs ON cs.id = a.class_session_id
    WHERE a.status = 'ATTENDED'
      AND a.reconciliation_state IN ('MATCHED', 'RESOLVED')
      AND a.deleted_at IS NULL
  ) AS k7_basis
    ON k7_basis.enrollment_id = md.enrollment_id
   AND k7_basis.k7_ordinal = s.session_number
  WHERE s.trigger_event = 'ATTENDED'
) AS ranked
WHERE ranked.rn = 1
ON DUPLICATE KEY UPDATE
  -- Lưu ý: Trong MySQL, ON DUPLICATE KEY UPDATE thực thi tuần tự từ trên xuống dưới.
  -- Do đó phải cập nhật basis_attendance_id, canonical_delivery_id, satisfied_at TRƯỚC khi cập nhật status!
  `basis_attendance_id` = CASE
    WHEN `milestone_occurrences`.`status` IN ('SENT', 'SENDING')
      THEN `milestone_occurrences`.`basis_attendance_id`
    ELSE VALUES(`basis_attendance_id`)
  END,
  `canonical_delivery_id` = CASE
    WHEN `milestone_occurrences`.`status` IN ('SENT', 'SENDING')
      THEN `milestone_occurrences`.`canonical_delivery_id`
    ELSE VALUES(`canonical_delivery_id`)
  END,
  `satisfied_at` = CASE
    WHEN `milestone_occurrences`.`status` = 'SENT'
      THEN COALESCE(`milestone_occurrences`.`satisfied_at`, VALUES(`satisfied_at`))
    WHEN `milestone_occurrences`.`status` = 'SENDING'
      THEN CASE
        WHEN VALUES(`status`) = 'SENT'
         AND VALUES(`canonical_delivery_id`) = `milestone_occurrences`.`canonical_delivery_id`
          THEN COALESCE(`milestone_occurrences`.`satisfied_at`, VALUES(`satisfied_at`))
        ELSE `milestone_occurrences`.`satisfied_at`
      END
    ELSE COALESCE(`milestone_occurrences`.`satisfied_at`, VALUES(`satisfied_at`))
  END,
  `first_reached_at` = LEAST(`milestone_occurrences`.`first_reached_at`, VALUES(`first_reached_at`)),
  `status` = CASE
    WHEN `milestone_occurrences`.`status` = 'SENT'
      THEN 'SENT'
    WHEN `milestone_occurrences`.`status` = 'SENDING'
      THEN CASE
        WHEN VALUES(`status`) = 'SENT'
         AND VALUES(`canonical_delivery_id`) = `milestone_occurrences`.`canonical_delivery_id`
          THEN 'SENT'
        ELSE 'SENDING'
      END
    ELSE VALUES(`status`)
  END,
  `updated_at` = VALUES(`updated_at`);
```

### 7.4. Thứ tự chuyển đổi (Cutover 5 Bước có Write-Quiesce Gate) & Cơ chế Một Thẩm Quyền Duy Nhất (`MILESTONE_STORAGE_MODE` — Yêu cầu b)

Bản v2.1 từng mô tả cơ chế *"nếu bảng `milestone_occurrences` chưa tồn tại thì tự động fallback về `message_deliveries`"*. Owner đã bác bỏ điểm này vì hai rủi ro nghiêm trọng: (1) nếu hai cơ chế cùng hoạt động hoặc chuyển đổi không đồng bộ giữa API và Worker thì có thể phát sinh hai đường quyết định gửi song song; (2) nếu dùng `try/catch` để đoán "chưa có bảng" rồi fallback thì một lỗi kết nối/quyền/lock tạm thời trên bảng mới sẽ bị coi nhầm là "bảng chưa tạo", làm hệ thống âm thầm bỏ qua khóa `UNIQUE (enrollment_id, automation_step_id)` và có nguy cơ gửi trùng.

Đồng thời, phản biện của Owner đối với bản v2.2 chỉ rõ: **việc chỉ tạm dừng `automation-worker` chưa chặn hết các đường ghi vào `message_deliveries`**, bởi các API điểm danh (`teacher-mark`, `cs-mark`), đối soát (`attendance-reconciliation` / `resolve-conflict`), import Excel (`import-excel/confirm`) và cấu hình automation vẫn gọi `runAttendancePostCommit` $\rightarrow$ `handleAttendanceEvent` / `reconcileEnrollmentMilestones` để tạo mới, rebind hoặc hủy `message_deliveries` ngay trong tiến trình API. Ngoài ra, **không được cam kết cứng cửa sổ `"dưới một phút"` trước khi diễn tập và đo thực tế trên Staging**.

Do đó, thiết kế v2.3 quy định **cờ thẩm quyền duy nhất (`MILESTONE_STORAGE_MODE`)** kết hợp **cổng tạm chặn ghi đồng bộ (`MAINTENANCE_FREEZE_MILESTONE_WRITES`)**:

```env
# 1. Cờ thẩm quyền lưu trữ mốc (chỉ nhận đúng 1 trong 2 giá trị tường minh):
MILESTONE_STORAGE_MODE=LEGACY_DELIVERY_SCAN   # hoặc S1_OCCURRENCE_TABLE

# 2. Cờ đóng băng tạm thời các đường ghi điểm danh/milestone trong khoảng chuyển đổi cuối (Write-Quiesce Gate):
MAINTENANCE_FREEZE_MILESTONE_WRITES=false     # bật thành true trong Bước 2..4 của Cutover / Rollback
```

Tại mọi thời điểm, trên toàn bộ các tiến trình (`backend API` và `automation-worker`), **chỉ có đúng một cơ chế giữ thẩm quyền quyết định gửi** cho các bước `trigger_event = 'ATTENDED'`:

| Chế độ `MILESTONE_STORAGE_MODE` | Nguồn sự thật & Khóa chống trùng có hiệu lực | Hành vi đọc / ghi của `automation-trigger.service.ts` & `automation-worker.ts` |
|---|---|---|
| **`LEGACY_DELIVERY_SCAN`** *(Mặc định trước cutover & trong bộ test chưa chạy DDL S1)* | Bảng `message_deliveries` + khóa giao dịch `Serializable` (`SELECT id FROM enrollments WHERE id = ? FOR UPDATE`) + `pickCanonicalOccurrence` | Đọc và ghi trực tiếp trên `message_deliveries` như commit `0970bec`. **Không** đọc bảng `milestone_occurrences` để ra quyết định gửi, kể cả khi bảng `milestone_occurrences` đã được tạo trên DB để chuẩn bị backfill. |
| **`S1_OCCURRENCE_TABLE`** *(Sau khi nghiệm thu backfill & bật cutover)* | Bảng `milestone_occurrences` với khóa cứng `UNIQUE (enrollment_id, automation_step_id)` cấp InnoDB + bản ghi `message_deliveries` được trỏ bởi `canonical_delivery_id` | Mọi thao tác tạo mới, rebind `basis_attendance_id`, hủy `CANCELLED`, hoặc `reactivate` của bước `ATTENDED` **bắt buộc** đi qua `milestone_occurrences` trước (nắm giữ khóa `UNIQUE (enrollment_id, automation_step_id)`), đồng thời ghi/cập nhật bản ghi tương ứng trên `message_deliveries` (`milestone_occurrence_id = mo.id`, `canonical_delivery_id = md.id`). |

#### Quy trình Cutover 5 Bước có Kiểm soát Đường ghi (5-Step Controlled Write-Quiesce Cutover):

*(Lưu ý về thời lượng cửa sổ chặn ghi: **Không cam kết cứng một con số cố định khi chưa đo thực tế**; thời gian thực tế của Bước 2 $\rightarrow$ Bước 5 phụ thuộc vào thời gian xả giao dịch đang chạy + thời gian chạy Delta-Sync + thời gian chạy truy vấn đối soát toàn bảng, và bắt buộc phải được đo đạc, ghi biên bản trong buổi diễn tập trên Staging trước khi trình Owner duyệt chạy Production).*

1. **Bước 1 — Online Initial Backfill (Hệ thống vẫn hoạt động bình thường dưới `LEGACY_DELIVERY_SCAN`):**
   - Thực thi DDL tạo bảng `milestone_occurrences` (Mục 3.2) và thêm cột nullable `message_deliveries.milestone_occurrence_id` (Mục 7.1b).
   - Chạy lần đầu câu lệnh Backfill `INSERT INTO milestone_occurrences ... SELECT ...` (Mục 7.3) và `UPDATE message_deliveries SET milestone_occurrence_id = mo.id ...` (Mục 7.1b) để nạp phần lớn dữ liệu lịch sử trong khi hệ thống vẫn phục vụ bình thường dưới `LEGACY_DELIVERY_SCAN`.
2. **Bước 2 — Quiesce toàn bộ đường ghi API + Tạm dừng Worker (`Write-Quiesce Gate`):**
   - Bật cổng chặn ghi **`MAINTENANCE_FREEZE_MILESTONE_WRITES = true`** (middleware trả về `503 Service Unavailable — Hệ thống đang đồng bộ mốc chăm sóc, vui lòng thử lại sau ít phút`) trên toàn bộ các route có thể biến đổi dữ liệu điểm danh / milestone:
     * `POST/PATCH/DELETE /api/v1/attendance/*` (`teacher-mark`, `cs-mark`, cập nhật/xóa điểm danh)
     * `POST/PATCH /api/v1/attendance-reconciliation/*` (`resolve`, đối soát hàng loạt)
     * `POST /api/v1/import-excel/confirm` (xác nhận import điểm danh/ghi danh từ Excel)
     * `POST/PATCH/DELETE /api/v1/automation/*` (thay đổi bước/luồng hoặc kích hoạt thủ công)
   - Đồng thời **tạm dừng `automation-worker`** để không có job gửi tin nào chuyển trạng thái `QUEUED -> SENDING -> SENT` trong lúc chốt dữ liệu.
3. **Bước 3 — Chờ xả hết các giao dịch và request đang chạy (`Drain In-Flight Transactions`):**
   - Chờ toàn bộ HTTP request đang xử lý trên các route trên kết thúc (`in_flight_milestone_requests = 0`) và kiểm tra trên MySQL không còn giao dịch ghi nào đang mở chạm tới `attendances` / `message_deliveries`:
     ```sql
     -- Phải trả về active_trx_count = 0 trước khi sang Bước 4:
     SELECT COUNT(*) AS active_trx_count
     FROM information_schema.innodb_trx;
     ```
   - Đảm bảo không còn dòng nào đang ở trạng thái `SENDING` lơ lửng (`SELECT COUNT(*) FROM message_deliveries WHERE status = 'SENDING'` phải được đối soát theo Mục 5.2).
4. **Bước 4 — Chạy Final Delta-Sync & Đối soát từng trường dữ liệu (`Cell-by-Cell Equivalence Verification`):**
   - Chạy lại câu lệnh **Delta-Sync** ở Mục 7.3 (`INSERT INTO milestone_occurrences ... ON DUPLICATE KEY UPDATE ...`) và câu lệnh cập nhật liên kết ngược ở Mục 7.1b (`UPDATE message_deliveries SET milestone_occurrence_id = mo.id ...`) để bắt kịp 100% các thay đổi (`QUEUED -> SENT`, rebind căn cứ, hủy/tạo mới) phát sinh giữa Bước 1 và Bước 2.
   - Chạy bộ truy vấn đối soát toàn diện (**không chỉ đếm số dòng**, mà so khớp từng cột `(enrollment_id, automation_step_id, canonical_delivery_id, status, basis_attendance_id)` giữa `milestone_occurrences` và quy tắc ứng dụng `pickCanonicalOccurrence`):
     * Truy vấn C4 (Tổng số nhóm `(enrollment_id, automation_step_id)` của bước `ATTENDED` khớp 100%).
     * Truy vấn C6 (Mục 7.1b: `0` dòng `SENT`/`SENDING` thuộc `ATTENDED` có `milestone_occurrence_id IS NULL`).
     * Truy vấn R3 / C4c (Mục 7.5: đối chiếu từng trường `(canonical_delivery_id, status, basis_attendance_id)` với kết quả chọn canonical chuẩn K7 trả về **0 hàng lệch**).
5. **Bước 5 — Chuyển đồng bộ API + Worker sang cùng Mode & Mở lại hệ thống (`Synchronous Mode Switch & Unfreeze`):**
   - Chỉ khi toàn bộ truy vấn đối soát ở Bước 4 trả về `0` sai lệch: chuyển cấu hình **`MILESTONE_STORAGE_MODE = S1_OCCURRENCE_TABLE`** đồng bộ trên cả `backend API` và `automation-worker`.
   - Xác nhận Startup Probe (`SELECT 1 FROM milestone_occurrences LIMIT 1`) thành công trên cả hai phía.
   - Ghi nhận mốc thời gian `T_cutover = NOW(3)` vào nhật ký vận hành.
   - Gỡ cổng chặn ghi (`MAINTENANCE_FREEZE_MILESTONE_WRITES = false`) và mở lại `automation-worker`.

---

### 7.4b. Quy tắc Fail-Closed khi lỗi truy cập bảng mới — CẤM âm thầm Fallback (Yêu cầu d)

Để loại bỏ triệt để nguy cơ *"lỗi truy cập bảng mới bị coi nhầm là chưa có bảng rồi âm thầm fallback về cơ chế cũ gây gửi trùng"*, hệ thống áp dụng quy tắc **Fail-Closed tuyệt đối**:

1. **Kiểm tra cấu hình & Startup Probe khi khởi động (`Fail-Fast on Boot`):**
   - Nếu `MILESTONE_STORAGE_MODE` mang giá trị ngoài tập hợp hợp lệ `{LEGACY_DELIVERY_SCAN, S1_OCCURRENCE_TABLE}`, tiến trình từ chối khởi động ngay lập tức (`Invalid MILESTONE_STORAGE_MODE`).
   - Khi `MILESTONE_STORAGE_MODE = S1_OCCURRENCE_TABLE`, ngay lúc khởi động (`server.ts` và `automation-worker.ts`), hệ thống thực thi truy vấn thăm dò `SELECT 1 FROM milestone_occurrences LIMIT 1`. Nếu bảng chưa tồn tại (`ER_NO_SUCH_TABLE` / `P2021`), thiếu quyền `SELECT/INSERT/UPDATE`, hoặc kết nối DB lỗi $\rightarrow$ **tiến trình dừng khởi động ngay lập tức (fail-fast)**, tuyệt đối không tự chuyển về `LEGACY_DELIVERY_SCAN`.
2. **Fail-Closed trong thời gian chạy (`Runtime Fail-Closed — Zero Silent Fallback`):**
   - Khi `MILESTONE_STORAGE_MODE = S1_OCCURRENCE_TABLE`, nếu bất kỳ truy vấn đọc/ghi nào trên `milestone_occurrences` gặp lỗi (lỗi kết nối MySQL, deadlock vượt quá số lần retry, timeout, thiếu quyền, bảng bị khóa hoặc không truy cập được):
     - **Bắt buộc ném lỗi (`throw`) và rollback giao dịch DB hiện tại.**
     - **TUYỆT ĐỐI KHÔNG enqueue job lên BullMQ và KHÔNG phát tin qua Zalo/LINE.**
     - **TUYỆT ĐỐI KHÔNG có bất kỳ khối `catch` nào bắt lỗi truy vấn `milestone_occurrences` để gọi sang `findDeliveryForMilestoneOccurrence` trên `message_deliveries`.**
     - Ghi log mức `ERROR` kèm mã cảnh báo vận hành (`MILESTONE_OCCURRENCE_STORAGE_FAILURE`) để kỹ thuật xử lý sự cố hạ tầng.
   - **Tại sao Fail-Closed bảo toàn chống gửi trùng:** Khi DB gặp sự cố tạm thời ở chế độ `S1_OCCURRENCE_TABLE`, việc dừng gửi (abort) giữ hệ thống ở phía an toàn (không có tin nhắn nào lọt ra ngoài mà không đi qua khóa `UNIQUE (enrollment_id, automation_step_id)`). Sau khi DB phục hồi, lần đối soát hoặc lượt chạy tiếp theo sẽ đánh giá lại trên `milestone_occurrences` một cách nhất quán.

---

### 7.5. Quy trình Hoàn tác (Rollback Protocol 5 Bước — Bảo vệ tuyệt đối bằng chứng `SENT`/`SENDING` & Chống gửi trùng sau Cutover — Yêu cầu c)

> **Nguyên tắc cốt lõi theo chỉ đạo của Owner:**
> 1. Việc `DROP TABLE milestone_occurrences` **không phải** là phương án rollback tự thân, mà chỉ là bước dọn dẹp cuối cùng sau khi đã hoàn tất đối soát.
> 2. **Bảo vệ tuyệt đối bằng chứng đã gửi trong Rollback (Khắc phục lỗi `R2.1` của bản v2.2):**
>    - **Không bao giờ hạ `SENT` thành trạng thái chờ (`QUEUED`/`SCHEDULED`) hay `CANCELLED`.**
>    - **Không bao giờ đổi `attendance_id` căn cứ hay snapshot (`rendered_content`, `variables_snapshot`, `sent_at`, `provider_message_id`) của một delivery đã `SENT`.**
>    - **Không bao giờ tự quyết kết quả của `SENDING`.**
>    - **Nếu hai nguồn bằng chứng (`milestone_occurrences` và `message_deliveries`) mâu thuẫn nhau (ví dụ: `message_deliveries` đã `SENT` nhưng `milestone_occurrences` còn `QUEUED` hoặc trỏ căn cứ khác), bắt buộc DỪNG ROLLBACK ngay tại cổng tiền kiểm `R2.0` để đối soát thủ công — tuyệt đối không dùng `R2.1` ép hai bảng "khớp nhau theo hướng sai" rồi để `R3` báo xanh giả tạo!**

Quy trình Rollback vận hành gồm **5 bước bắt buộc theo đúng thứ tự (`R1` $\rightarrow$ `R5`)**:

#### Bước R1 — Đóng băng toàn bộ đường ghi & cổng phát tin (Freeze API Milestone Writes & Outbound Worker)
- Bật **`MAINTENANCE_FREEZE_MILESTONE_WRITES = true`** trên các API ghi điểm danh / đối soát / import Excel / automation và tạm dừng tiến trình BullMQ worker (`automation-worker`).
- Chờ xả hết các giao dịch đang mở (`SELECT COUNT(*) FROM information_schema.innodb_trx` về `0`) và chờ mọi lời gọi HTTP Zalo/LINE đang thực thi kết thúc.

#### Bước R2 — Cổng phát hiện mâu thuẫn bằng chứng (`R2.0`) & Đồng bộ ngược an toàn (`R2.1` / `R2.2`)

##### Bước R2.0 (BẮT BUỘC CHẠY TRƯỚC MỌI LỆNH `UPDATE`) — Gate phát hiện mâu thuẫn bằng chứng (`Contradiction Pre-Check Gate`)

Trước khi thực hiện bất kỳ ghi đè đồng bộ nào ở `R2.1`, bắt buộc chạy truy vấn kiểm tra mâu thuẫn `R2.0` dưới đây để rà soát toàn bộ các cặp `(mo, md)` thuộc diện:
1. `md.status = 'SENT'` nhưng `mo.status <> 'SENT'`, hoặc `mo.basis_attendance_id <> md.attendance_id`, hoặc `mo.canonical_delivery_id <> md.id` (bao gồm cả trường hợp tồn tại một dòng `md` đã `SENT` trong cùng `(enrollment_id, automation_step_id)` nhưng `mo` lại đang ở `QUEUED`/`SCHEDULED`/`CANCELLED` hoặc trỏ sang delivery khác chưa gửi).
2. `md.status = 'SENDING'` hoặc `mo.status = 'SENDING'` có bất kỳ sai lệch nào giữa `mo` và `md` (hoặc chưa được phân định kết quả gửi).
3. `mo.status = 'SENT'` trong khi bản ghi `md` canonical không ở trạng thái `'SENT'` (hoặc bị thiếu / lệch `attendance_id`).

```sql
-- R2.0 (READ-ONLY PRE-CHECK GATE): Phát hiện mọi mâu thuẫn bằng chứng SENT / SENDING giữa 2 bảng.
-- TIÊU CHÍ BẮT BUỘC: Phải trả về 0 dòng (contradiction_count = 0) mới được phép chạy R2.1!
-- Nếu trả về > 0 dòng: DỪNG ROLLBACK NGAY LẬP TỨC (SIGNAL SQLSTATE '45000' / script exit non-zero)
-- và xuất danh sách dưới đây để vận hành/kỹ thuật đối soát thủ công.
SELECT
  mo.id AS occurrence_id,
  mo.enrollment_id,
  mo.automation_step_id,
  mo.canonical_delivery_id,
  md.id AS delivery_id,
  mo.status AS mo_status,
  md.status AS md_status,
  mo.basis_attendance_id AS mo_basis_attendance_id,
  md.attendance_id AS md_attendance_id,
  CASE
    WHEN md.status = 'SENT' AND (
      mo.status <> 'SENT'
      OR mo.basis_attendance_id <> md.attendance_id
      OR mo.canonical_delivery_id IS NULL
      OR mo.canonical_delivery_id <> md.id
    ) THEN 'SENT_DELIVERY_CONTRADICTS_OCCURRENCE'
    WHEN (md.status = 'SENDING' OR mo.status = 'SENDING') THEN 'UNRESOLVED_OR_MISMATCHED_SENDING'
    WHEN mo.status = 'SENT' AND (
      md.id IS NULL
      OR md.status <> 'SENT'
      OR mo.basis_attendance_id <> md.attendance_id
    ) THEN 'SENT_OCCURRENCE_WITHOUT_MATCHING_SENT_DELIVERY'
    ELSE 'EVIDENCE_CONFLICT'
  END AS contradiction_code
FROM `milestone_occurrences` mo
LEFT JOIN `message_deliveries` md
  ON md.enrollment_id = mo.enrollment_id
 AND md.automation_step_id = mo.automation_step_id
 AND (
   md.id = mo.canonical_delivery_id
   OR md.status IN ('SENT', 'SENDING')
 )
WHERE
  -- (1) Delivery đã SENT nhưng occurrence khác SENT, lệch basis_attendance_id, hoặc lệch canonical_delivery_id
  (
    md.status = 'SENT'
    AND (
      mo.status <> 'SENT'
      OR (md.id = mo.canonical_delivery_id AND mo.basis_attendance_id <> md.attendance_id)
      OR mo.canonical_delivery_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM `message_deliveries` cd
        WHERE cd.id = mo.canonical_delivery_id
          AND cd.enrollment_id = mo.enrollment_id
          AND cd.automation_step_id = mo.automation_step_id
          AND cd.status = 'SENT'
          AND cd.attendance_id = mo.basis_attendance_id
      )
    )
  )
  -- (2) Bất kỳ dòng nào đang SENDING hoặc lệch trạng thái SENDING (không tự quyết kết quả của SENDING)
  OR (
    (md.status = 'SENDING' OR mo.status = 'SENDING')
    AND (
      md.id IS NULL
      OR mo.status <> md.status
      OR mo.basis_attendance_id <> md.attendance_id
      OR mo.canonical_delivery_id IS NULL
      OR mo.canonical_delivery_id <> md.id
    )
  )
  -- (3) Occurrence mang trạng thái SENT nhưng canonical delivery không phải SENT (hoặc lệch căn cứ)
  OR (
    mo.status = 'SENT'
    AND (
      md.id IS NULL
      OR (
        md.id = mo.canonical_delivery_id
        AND (md.status <> 'SENT' OR mo.basis_attendance_id <> md.attendance_id)
      )
    )
  );
```

- **Quy tắc cổng chặn `R2.0`:** Nếu truy vấn `R2.0` trả về `> 0` dòng, script rollback **bắt buộc phát tín hiệu lỗi (`SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'R2.0_CONTRADICTION_DETECTED: Abort rollback for manual reconciliation'` / `exit 1`)** và dừng ngay trước `R2.1`. Tuyệt đối không tự động ghi đè bất kỳ dòng nào trong nhóm mâu thuẫn.

##### Bước R2.1 — Đồng bộ ngược an toàn CHỈ cho các trạng thái chưa gửi (`Unsent-Only Reverse Sync`)

Chỉ sau khi `R2.0` trả về **0 dòng mâu thuẫn**, thực thi `R2.1`. Ngay trong thân câu lệnh `R2.1`, mệnh đề `WHERE` cũng **khóa cứng lần thứ hai (defense-in-depth)**:
- Loại trừ hoàn toàn mọi dòng `md.status IN ('SENT', 'SENDING')` và `mo.status IN ('SENT', 'SENDING')`.
- Loại trừ mọi nhóm `(enrollment_id, automation_step_id)` đã có bất kỳ bản ghi `SENT` hoặc `SENDING` nào trong `message_deliveries`.
- Không bao giờ chạm vào `md.rendered_content`, `md.variables_snapshot`, `md.sent_at`, `md.provider_message_id`, hay `md.attendance_id` của bản ghi đã gửi.
- Chỉ đồng bộ các chuyển đổi trạng thái chưa gửi phát sinh sau `T_cutover` (ví dụ: occurrence chuyển sang `CANCELLED` khi tụt dưới mốc, hoặc rebind `attendance_id` giữa các trạng thái chưa gửi `SCHEDULED`/`QUEUED`).

```sql
-- R2.1 (SAFE UNSENT-ONLY SYNC): Chỉ chạy khi R2.0 trả về 0 dòng mâu thuẫn.
-- TUYỆT ĐỐI KHÔNG chạm vào md.status IN ('SENT', 'SENDING') hoặc mo.status IN ('SENT', 'SENDING').
UPDATE `message_deliveries` md
INNER JOIN `milestone_occurrences` mo
  ON mo.`canonical_delivery_id` = md.`id`
 AND mo.`enrollment_id` = md.`enrollment_id`
 AND mo.`automation_step_id` = md.`automation_step_id`
SET
  md.`status` = mo.`status`,
  md.`attendance_id` = mo.`basis_attendance_id`,
  md.`milestone_occurrence_id` = mo.`id`
WHERE mo.`updated_at` >= @T_cutover
  AND md.`status` NOT IN ('SENT', 'SENDING')
  AND mo.`status` NOT IN ('SENT', 'SENDING')
  AND NOT EXISTS (
    SELECT 1
    FROM (
      SELECT m2.`enrollment_id`, m2.`automation_step_id`
      FROM `message_deliveries` m2
      WHERE m2.`status` IN ('SENT', 'SENDING')
    ) AS protected_groups
    WHERE protected_groups.`enrollment_id` = md.`enrollment_id`
      AND protected_groups.`automation_step_id` = md.`automation_step_id`
  )
  AND (
    md.`status` <> mo.`status`
    OR md.`attendance_id` <> mo.`basis_attendance_id`
    OR md.`milestone_occurrence_id` IS NULL
  );
```

##### Bước R2.2 — Khử các bản ghi `SCHEDULED`/`QUEUED` phụ không phải canonical để `LEGACY_DELIVERY_SCAN` không gửi lặp

- Nếu trong cùng một cặp `(enrollment_id, automation_step_id)` thuộc bước `ATTENDED` đã có occurrence ở trạng thái `SENT` hoặc `CANCELLED` (hoặc đã có `canonical_delivery_id` khác), mọi bản ghi `message_deliveries` phụ khác đang ở trạng thái chưa gửi (`SCHEDULED`, `QUEUED`) **bắt buộc** được chuyển sang `CANCELLED` kèm vết kiểm toán và gỡ job khỏi Redis/BullMQ:

```sql
-- R2.2: Chuyển mọi dòng SCHEDULED/QUEUED phụ không phải canonical (hoặc khi mốc đã SENT/CANCELLED) sang CANCELLED
UPDATE `message_deliveries` md
INNER JOIN `milestone_occurrences` mo
  ON mo.`enrollment_id` = md.`enrollment_id`
 AND mo.`automation_step_id` = md.`automation_step_id`
SET
  md.`status` = 'CANCELLED',
  md.`error_message` = CONCAT(
    'Rollback reconciliation: superseded by canonical occurrence #',
    mo.`id`,
    ' (canonical delivery #',
    IFNULL(mo.`canonical_delivery_id`, 0),
    ')'
  ),
  md.`milestone_occurrence_id` = mo.`id`
WHERE md.`status` IN ('SCHEDULED', 'QUEUED')
  AND (
    mo.`status` IN ('SENT', 'CANCELLED')
    OR (mo.`canonical_delivery_id` IS NOT NULL AND md.`id` <> mo.`canonical_delivery_id`)
  );
```
- Đồng thời, với mọi `md.queue_job_id` của các dòng vừa chuyển sang `CANCELLED` ở R2.1 / R2.2, gọi script gỡ job khỏi hàng đợi BullMQ (`automation:delivery:${md.id}`).

#### Bước R3 — Đối soát bất biến chống gửi trùng bằng Quy tắc Canonical Thống nhất (`Unified Canonical Parity Check`)

Chạy truy vấn kiểm tra chỉ đọc (`SELECT`) sử dụng **chính xác cùng biểu thức xếp hạng Canonical 3 tầng có ghép `k7_basis` như Mục 2.3 và Mục 7.3** để xác nhận: với **mọi** cặp `(enrollment_id, automation_step_id)` thuộc các bước `trigger_event = 'ATTENDED'`, kết quả chọn dòng đại diện của thuật toán `LEGACY_DELIVERY_SCAN` (`pickCanonicalOccurrence`) trên bảng `message_deliveries` khớp **100% trên từng trường (`canonical_delivery_id`, `status`, `basis_attendance_id`)** với `milestone_occurrences`:

```sql
-- R3 (READ-ONLY — UNIFIED CANONICAL PARITY CHECK):
-- Kiểm tra đối khớp 100% từng trường (canonical_delivery_id, status, basis_attendance_id)
-- giữa milestone_occurrences và quy tắc chọn canonical chuẩn K7 (pickCanonicalOccurrence) trên message_deliveries.
-- Tiêu chí ĐẠT: Truy vấn phải trả về 0 hàng (mismatch_count = 0).
SELECT
  mo.id AS occurrence_id,
  mo.enrollment_id,
  mo.automation_step_id,
  mo.canonical_delivery_id AS mo_canonical_delivery_id,
  mo.status AS mo_status,
  mo.basis_attendance_id AS mo_basis_attendance_id,
  legacy_pick.id AS legacy_canonical_delivery_id,
  legacy_pick.status AS legacy_status,
  legacy_pick.attendance_id AS legacy_basis_attendance_id
FROM `milestone_occurrences` mo
LEFT JOIN (
  SELECT
    md.id,
    md.enrollment_id,
    md.automation_step_id,
    md.attendance_id,
    md.status,
    ROW_NUMBER() OVER (
      PARTITION BY md.enrollment_id, md.automation_step_id
      ORDER BY
        -- Tier 1 (PROTECTED): SENT (1) > SENDING (2) > các trạng thái khác (3)
        CASE
          WHEN md.status = 'SENT' THEN 1
          WHEN md.status = 'SENDING' THEN 2
          ELSE 3
        END ASC,
        -- Tier 2 vs Tier 3: Nhóm ACTIVE (QUEUED/SCHEDULED) đứng trước nhóm REST (CANCELLED/FAILED/SKIPPED_*)
        CASE
          WHEN md.status IN ('SENT', 'SENDING') THEN 0
          WHEN md.status IN ('QUEUED', 'SCHEDULED') THEN 1
          ELSE 2
        END ASC,
        -- Đẩy các bản ghi phụ đã bị đánh dấu Superseded / Rollback reconciliation xuống sau bản ghi gốc
        CASE
          WHEN COALESCE(md.error_message, '') LIKE 'Superseded duplicate%'
            OR COALESCE(md.error_message, '') LIKE 'Rollback reconciliation:%'
          THEN 1
          ELSE 0
        END ASC,
        -- Khi chưa SENT/SENDING: Ưu tiên bản ghi khớp căn cứ điểm danh K7 hiện hành (md.attendance_id = k7_basis.attendance_id)
        CASE
          WHEN md.status NOT IN ('SENT', 'SENDING')
           AND k7_basis.attendance_id IS NOT NULL
           AND md.attendance_id = k7_basis.attendance_id
          THEN 0
          ELSE 1
        END ASC,
        -- Thứ bậc trạng thái chi tiết (SENT < SENDING < QUEUED < SCHEDULED < CANCELLED < FAILED/SKIPPED_*)
        CASE md.status
          WHEN 'SENT' THEN 1
          WHEN 'SENDING' THEN 2
          WHEN 'QUEUED' THEN 3
          WHEN 'SCHEDULED' THEN 4
          WHEN 'CANCELLED' THEN 5
          ELSE 6
        END ASC,
        -- Tie-breaker tất định theo id tăng dần (khớp orderBy: { id: 'asc' } trong pickCanonicalOccurrence)
        md.id ASC
    ) AS rn
  FROM `message_deliveries` md
  INNER JOIN `automation_steps` s ON s.id = md.automation_step_id
  LEFT JOIN (
    SELECT
      ec.enrollment_id,
      a.id AS attendance_id,
      ROW_NUMBER() OVER (
        PARTITION BY ec.enrollment_id
        ORDER BY cs.session_date ASC, a.created_at ASC, a.id ASC
      ) AS k7_ordinal
    FROM `attendances` a
    INNER JOIN `enrollment_classes` ec ON ec.id = a.enrollment_class_id
    INNER JOIN `class_sessions` cs ON cs.id = a.class_session_id
    WHERE a.status = 'ATTENDED'
      AND a.reconciliation_state IN ('MATCHED', 'RESOLVED')
      AND a.deleted_at IS NULL
  ) AS k7_basis
    ON k7_basis.enrollment_id = md.enrollment_id
   AND k7_basis.k7_ordinal = s.session_number
  WHERE s.trigger_event = 'ATTENDED'
) AS legacy_pick
  ON legacy_pick.enrollment_id = mo.enrollment_id
 AND legacy_pick.automation_step_id = mo.automation_step_id
 AND legacy_pick.rn = 1
WHERE
  legacy_pick.id IS NULL
  OR legacy_pick.id <> mo.canonical_delivery_id
  OR legacy_pick.status <> mo.status
  OR legacy_pick.attendance_id <> mo.basis_attendance_id;
```

- Kiểm tra bổ sung: xác nhận `R2.0` trả về `0` dòng mâu thuẫn, và `groups_with_sent_plus_pending = 0`, `groups_with_multiple_pending = 0` trên Truy vấn 2 (Mục 2.2) cho toàn bộ `trigger_event = 'ATTENDED'`.
- **Chốt chặn:** Nếu truy vấn R3 (hoặc R2.0) trả về bất kỳ dòng nào khác `0`, **tuyệt đối không chuyển mode, không gỡ `MAINTENANCE_FREEZE_MILESTONE_WRITES` và không bật lại worker** cho đến khi xử lý xong dòng lệch đó.

#### Bước R4 — Chuyển đồng bộ `MILESTONE_STORAGE_MODE` về `LEGACY_DELIVERY_SCAN` và mở lại cổng ghi + Worker
- Chỉ sau khi Bước R2.0 và Bước R3 cùng đạt `0` dòng lệch, đổi cấu hình `MILESTONE_STORAGE_MODE = LEGACY_DELIVERY_SCAN` đồng bộ trên cả `backend API` và `automation-worker`.
- Tắt cờ chặn ghi (`MAINTENANCE_FREEZE_MILESTONE_WRITES = false`) và mở lại `automation-worker`. Từ thời điểm này, `LEGACY_DELIVERY_SCAN` tiếp quản hoàn toàn mà không gửi trùng bất kỳ occurrence nào đã phát sinh trước hoặc sau `T_cutover`.

#### Bước R5 — Giữ bảng `milestone_occurrences` để đối chiếu hậu kiểm; `DROP TABLE` chỉ là bước dọn dẹp cuối cùng (Optional Cleanup)
- **Không xóa ngay bảng `milestone_occurrences` khi vừa rollback xong ở Bước R4.** Giữ nguyên bảng `milestone_occurrences` và cột `message_deliveries.milestone_occurrence_id` ở trạng thái đóng băng (chỉ đọc) để phục vụ đối chiếu kiểm toán sau rollback.
- Chỉ khi hệ thống đã vận hành ổn định trên `LEGACY_DELIVERY_SCAN` và **Owner ký xác nhận hoàn tất đối soát sau rollback**, nếu muốn gỡ bỏ hoàn toàn DDL mới thực thi lệnh dọn dẹp cuối cùng:
  ```sql
  -- CHỈ CHẠY SAU KHI ĐÃ HOÀN TẤT R1-R4 VÀ CÓ XÁC NHẬN CỦA OWNER:
  ALTER TABLE `message_deliveries`
    DROP FOREIGN KEY `message_deliveries_milestone_occurrence_id_fkey`,
    DROP INDEX `message_deliveries_milestone_occurrence_id_idx`,
    DROP COLUMN `milestone_occurrence_id`;
  DROP TABLE IF EXISTS `milestone_occurrences`;
  ```

---

### 7.6. Danh mục Điều kiện Tiên quyết & Phê duyệt của Owner (Preconditions & Owner Sign-Off Checklist)

Trước khi thực thi DDL, Backfill và Cutover của Phương án S1 trên môi trường Staging / Production, toàn bộ 9 hạng mục kiểm chứng (**C1 – C9**) dưới đây phải được hoàn tất:

| Mã | Hạng mục kiểm tra / Phê duyệt | Tiêu chí đạt (Pass Criteria) | Người xác nhận |
|---|---|---|---|
| **C1** | Chạy Truy vấn kiểm toán chỉ đọc 1 & 2 (Mục 2.2) | Lưu kết quả snapshot ra file kiểm toán trước khi thao tác, liệt kê đầy đủ mọi nhóm `(enrollment_id, automation_step_id)` có $\ge 2$ dòng `SENT`/`SENDING`. | Kỹ thuật / Vận hành |
| **C2** | Kiểm tra Precondition P2 (Hội tụ các dòng chưa gửi trùng) | `groups_with_sent_plus_pending = 0` và `groups_with_multiple_pending = 0` đối với `trigger_event = 'ATTENDED'`. | Kỹ thuật |
| **C3** | Kiểm tra Precondition P3 (Đối soát dòng `SENDING` treo) | Không còn bản ghi `status = 'SENDING'` nào quá 5 phút chưa được phân định trước lúc cutover. | Vận hành CSKH |
| **C4** | Kiểm chứng hậu Backfill & Delta-Sync (`SELECT COUNT` + Cell-by-Cell Canonical Equivalence) | Số dòng trong `milestone_occurrences` khớp 100% với `COUNT(DISTINCT enrollment_id, automation_step_id)` của các bước `ATTENDED`; truy vấn C4b và truy vấn đối khớp từng trường `(canonical_delivery_id, status, basis_attendance_id)` theo chuẩn K7 trả về `0` dòng lệch; Delta-Sync cập nhật đúng `QUEUED -> SENT` và giữ chốt chặn đơn điệu cho `SENT`; `0 rows deleted` trên `message_deliveries`. | Kỹ thuật |
| **C5** | Phê duyệt tường minh của Owner trước khi chạy trên DB mục tiêu | Owner ký duyệt báo cáo C1–C4, biên bản đo thời gian Write-Quiesce trên Staging, và cho phép chạy DDL + Backfill + Cutover. | **Owner** |
| **C6** | Kiểm chứng liên kết lịch sử đa `SENT`/`SENDING` (Yêu cầu a) | Truy vấn C6 (Mục 7.1b) trả về **0 hàng**: mọi dòng `SENT`/`SENDING` lịch sử của bước `ATTENDED` (bao gồm cả dòng thứ 2+ không phải canonical) đều có `milestone_occurrence_id IS NOT NULL` trỏ đúng về occurrence của mốc đó. | Kỹ thuật |
| **C7** | Kiểm chứng Một Thẩm Quyền Duy Nhất `MILESTONE_STORAGE_MODE` & `MAINTENANCE_FREEZE_MILESTONE_WRITES` (Yêu cầu b) | Thực nghiệm trên Staging xác nhận: (1) ở mỗi giá trị `LEGACY_DELIVERY_SCAN` hoặc `S1_OCCURRENCE_TABLE` chỉ có đúng một cơ chế quyết định gửi hoạt động; (2) khi bật `MAINTENANCE_FREEZE_MILESTONE_WRITES = true` + dừng worker và chờ `information_schema.innodb_trx = 0`, không còn đường ghi API/worker nào lọt vào giữa Delta-Sync và lúc chuyển mode; ghi nhận số đo thực tế thời gian cửa sổ chặn ghi. | Kỹ thuật |
| **C8** | Diễn tập Rollback R1–R4 có cổng chặn mâu thuẫn `R2.0` & bảo vệ `SENT` ở `R2.1` (Yêu cầu c) | Kiểm chứng tự động (`s1-migration-rehearsal.integration.test.ts`) và trên Staging: (1) khi giả lập mâu thuẫn `md.status = 'SENT'` vs `mo.status = 'QUEUED'`, `R2.0` phát hiện (`count > 0`) và chặn rollback, `R2.1` tuyệt đối không ghi đè dòng `SENT`; (2) với các thay đổi chưa gửi hợp lệ sau `T_cutover`, `R2.0` trả về `0`, `R2.1`/`R2.2` đồng bộ chính xác và `R3` đạt `0` dòng lệch. | Kỹ thuật |
| **C9** | Kiểm chứng Fail-Closed khi lỗi truy cập `milestone_occurrences` (Yêu cầu d) | Thực nghiệm fault-injection trên Staging (đổi tên bảng tạm thời hoặc thu hồi quyền khi đang ở `S1_OCCURRENCE_TABLE`): xác nhận hệ thống **báo lỗi & dừng gửi (fail-closed)**, tuyệt đối **không** tự động fallback sang `message_deliveries`. | Kỹ thuật |

