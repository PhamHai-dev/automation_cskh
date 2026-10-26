# 07 — Đề xuất Migration (v2): Milestone Occurrence, Bảo toàn Lịch sử & Ràng buộc Duy nhất có Phạm vi (S1a / S2c)

**Phiên bản:** v2.0 (Bản viết lại toàn diện sau phản hồi của Owner)  
**Ngày cập nhật:** 2026-10-26  
**Phạm vi:** `MessageDelivery` / `AutomationStep` (`backend/prisma/schema.prisma`, `backend/src/modules/automation/*`)  
**Trạng thái:** Đề xuất kỹ thuật trình duyệt — **TUYỆT ĐỐI KHÔNG tự chạy migration hay SQL biến đổi dữ liệu trên bất kỳ DB nào** khi chưa có phê duyệt tường minh của Owner.

---

## Lịch sử phiên bản (Changelog)

| Phiên bản | Ngày | Nội dung thay đổi |
|---|---|---|
| **v1.0** | 2026-10-26 | Bản nháp đầu tiên đề xuất `@@unique([enrollment_id, automation_step_id])` toàn cục trên `message_deliveries` kèm bước tiền xử lý `DELETE` các bản ghi trùng lịch sử. |
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

### 2.3. Quy tắc tất định chọn bản ghi tiếp tục (Canonical Row Selection) & Xử lý bản ghi chưa gửi dư thừa

Đối với các bước thuộc họ mốc `trigger_event = 'ATTENDED'`, khi tồn tại $\ge 2$ dòng cho cùng `(enrollment_id, automation_step_id)`, quy tắc chọn **1 dòng đại diện duy nhất (canonical row)** được định nghĩa tất định (đồng nhất với `pickCanonicalOccurrence` trong `automation-repository.ts` dòng 578–605 và `reconcileEnrollmentMilestones` trong `automation-trigger.service.ts` dòng 975–1012):

1. **Ưu tiên 1 — Bảo vệ bằng chứng đã/đang gửi (`SENT` / `SENDING`):**
   Nếu có bất kỳ dòng nào ở trạng thái `SENT` hoặc `SENDING`, chọn dòng có thứ tự `SENT` (1) > `SENDING` (2), nếu có nhiều dòng cùng trạng thái thì chọn dòng có `id` nhỏ nhất (`id ASC` — bản ghi phát sinh đầu tiên).
   - **Hệ quả:** Khi đã có dòng `SENT`/`SENDING`, mốc đó được coi là đã hoàn tất/đang xử lý; **mọi dòng `SCHEDULED`/`QUEUED` còn lại trong cùng cặp `(enrollment_id, automation_step_id)` bắt buộc phải bị hủy** để không gửi lặp lần 2.
2. **Ưu tiên 2 — Khớp căn cứ điểm danh hiện hành (`attendance_id = current_basis_attendance_id`):**
   Nếu chưa có dòng `SENT`/`SENDING`, và có dòng đang gắn với `attendance_id` trùng khớp với bản ghi điểm danh thứ `k` hiện tại theo thứ tự chuẩn K7 (`A_k.id`), chọn dòng đó.
   - **Lý do kỹ thuật:** Tránh xung đột với khóa duy nhất hiện hữu `@@unique([attendance_id, automation_step_id])` khi thực hiện `rebindDeliveryBasis`.
3. **Ưu tiên 3 — Thứ bậc tiến độ trạng thái và `id` nhỏ nhất:**
   Nếu không rơi vào 2 trường hợp trên, sắp xếp theo trọng số trạng thái:
   `QUEUED (3) < SCHEDULED (4) < CANCELLED (5) < FAILED / SKIPPED_* (6)`, sau đó ưu tiên `id ASC` (dòng gốc tạo sớm nhất).

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

> **Ghi nhận khoảng trống hiện tại trong code (`automation.service.ts`):** `updateStep` hiện chưa chặn `dto.session_number` và `dto.trigger_event` khi `step` đã có `MessageDelivery`. Đây là điểm cần lưu ý để bổ sung guard ở tầng `AutomationService.updateStep` khi Owner cho phép mở rộng phạm vi sang CRUD step.

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
4. **Yêu cầu bảo toàn khi sửa/nâng cấp:**
   - Mọi cải tiến cơ chế retry của worker (ví dụ: giữ `status = 'QUEUED'` kèm `retry_count` tăng lên khi `job.attemptsMade + 1 < job.opts.attempts`, chỉ chuyển sang `FAILED` ở lần thử cuối cùng) **bắt buộc phải thao tác trên cùng `delivery.id`**, tuyệt đối không tạo dòng `MessageDelivery` mới và không được phép gửi lại nếu mốc `checkMilestoneStillEligible(delivery)` không còn đủ điều kiện tại thời điểm retry.

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
