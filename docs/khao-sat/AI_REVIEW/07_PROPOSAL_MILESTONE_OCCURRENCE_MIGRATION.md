# 07 — Đề xuất Migration: Milestone Occurrence & Unique Constraint chống nhân bản (S1a / S2c)

**Ngày:** 2026-10-26  
**Phạm vi:** `MessageDelivery` / `AutomationStep` (`backend/prisma/schema.prisma`)  
**Trạng thái:** Đề xuất kỹ thuật độc lập (KHÔNG tự ý chạy migration trên DB theo chỉ đạo của Owner)

---

## 1. Bối cảnh & Nguyên nhân gốc rễ (Root Cause)

Trong schema hiện hành (`backend/prisma/schema.prisma`):

1. **`AutomationStep` (dòng 680–700)** đã có ràng buộc duy nhất:
   ```prisma
   @@unique([workflow_id, session_number, trigger_event])
   ```
   Do đó, mỗi `automation_step_id` đã định danh duy nhất cho một bước thuộc một mốc `(workflow_id, session_number, trigger_event)` (`milestone_key + step`). Hai mốc khác loại (ví dụ: chăm sóc vs đánh giá, hoặc hai workflow khác nhau ở cùng buổi thứ `k`) luôn có `automation_step_id` khác nhau.

2. **`MessageDelivery` (dòng 730–763)** đã có đủ cả hai cột `enrollment_id` và `automation_step_id` (cùng `attendance_id` đóng vai trò bản ghi điểm danh làm căn cứ trigger). Tuy nhiên, unique constraint hiện tại ở tầng DB là:
   ```prisma
   @@unique([attendance_id, automation_step_id])
   ```
   Hệ quả:
   - **S1a (Out-of-order finalization):** Khi buổi B (`09:00`) chốt `MATCHED` trước buổi A (`01:00` cùng ngày), B chạm mốc buổi 5 và tạo `MessageDelivery(enrollment_id=E, attendance_id=B, automation_step_id=step5)`. Khi A chốt `MATCHED` muộn hơn, A trở thành buổi thứ 5 theo thứ tự ổn định `(session_date, created_at, id)` và B dịch lên buổi thứ 6. Vì khóa cũ chỉ chặn theo `(attendance_id, automation_step_id)`, hệ thống tạo thêm bản ghi thứ hai `(attendance_id=A, automation_step_id=step5)` cho cùng một học viên / ghi danh ở cùng mốc.
   - **S2c (FINAL → CONFLICT → FINAL / dịch chuyển căn cứ):** Khi bản ghi điểm danh căn cứ của mốc `k` chuyển sang `CONFLICT` làm một bản ghi điểm danh khác dịch vào vị trí thứ `k`, hoặc khi giảm dưới mốc rồi tăng trở lại với một `attendance_id` khác, khóa `(attendance_id, automation_step_id)` không ngăn được việc tạo mới `MessageDelivery` trùng lặp cho cùng `(enrollment_id, automation_step_id)`.

---

## 2. Giải pháp đã áp dụng ngay ở tầng Application / Repository (Không đổi Schema)

Trước khi áp dụng migration vật lý, tầng `automation-repository.ts` và `automation-trigger.service.ts` đã cưỡng bức ngữ nghĩa **1 occurrence duy nhất cho mỗi `(enrollment_id, automation_step_id)`** đối với các bước theo mốc (`trigger_event = ATTENDED`):

1. **Định danh mốc (Milestone Occurrence Identity):** `(enrollment_id, automation_step_id)`. Cột `attendance_id` trên `MessageDelivery` được giữ làm bằng chứng/căn cứ điểm danh hiện tại (`basis_attendance_id`).
2. **Cập nhật tại chỗ (In-place Rebind / Reactivate):**
   - Nếu `(enrollment_id, automation_step_id)` chưa có bản ghi và đủ điều kiện (`session_number <= count(K7)`) dưới chính sách `SEND` → tạo 1 bản ghi duy nhất.
   - Nếu đã có bản ghi ở trạng thái `SENT` hoặc `SENDING` → giữ nguyên lịch sử đã gửi, tuyệt đối không gửi lại hay tạo bản ghi thứ hai dù `attendance_id` căn cứ bị thay thế hoặc số buổi biến động.
   - Nếu đã có bản ghi ở trạng thái `SCHEDULED` / `QUEUED` và mốc vẫn đủ điều kiện nhưng căn cứ dịch sang `A_k` mới → cập nhật `attendance_id = A_k.id` (cùng nội dung/biến nếu cần) ngay trên dòng hiện hữu, giữ nguyên 1 `delivery.id`.
   - Nếu mốc không còn đủ điều kiện (`step.session_number > count(K7)`) và bản ghi đang `SCHEDULED` / `QUEUED` → chuyển `status = CANCELLED` và hủy job trên hàng đợi BullMQ.
   - Nếu bản ghi đang `CANCELLED` (do trước đó tụt dưới mốc) và nay đủ điều kiện trở lại dưới `SEND` → kích hoạt lại (reactivate) chính dòng `MessageDelivery` đó thay vì `INSERT` dòng mới.
3. **Chống race condition đồng thời (Concurrency Guard):**
   - Khoá giao dịch mức `Serializable` (kèm khoá dòng `Enrollment` và bắt lỗi `P2002` / serialization retry) đảm bảo 2 request đồng thời cùng chạm một mốc chỉ tạo đúng 1 occurrence và 1 lệnh enqueue.

---

## 3. Đề xuất Migration Schema (Trình Owner phê duyệt trước khi chạy)

### Phương án A (Khuyến nghị — Tối giản, tương thích ngược 100%)

Bổ sung trực tiếp ràng buộc duy nhất `@@unique([enrollment_id, automation_step_id])` vào bảng `message_deliveries`. Vì mỗi `AutomationStep` là duy nhất cho `(workflow_id, session_number, trigger_event)`, cặp `(enrollment_id, automation_step_id)` biểu diễn chính xác 100% thực thể `MilestoneOccurrence` mà không cần join thêm bảng phụ.

#### Thay đổi trên `backend/prisma/schema.prisma`:

```prisma
model MessageDelivery {
  id                  Int                   @id @default(autoincrement())
  enrollment_id       Int
  attendance_id       Int
  automation_step_id  Int
  // ... các cột giữ nguyên ...

  @@unique([enrollment_id, automation_step_id])
  @@unique([attendance_id, automation_step_id])
  @@index([line_account_id])
  @@index([line_group_id])
  @@map("message_deliveries")
}
```

#### SQL Migration (MySQL 8.0):

```sql
-- Bước 1: Dọn dẹp / hợp nhất các bản ghi trùng (enrollment_id, automation_step_id) nếu có trong dữ liệu lịch sử.
-- Ưu tiên giữ lại bản ghi theo thứ tự: SENT > SENDING > QUEUED > SCHEDULED > CANCELLED > SKIPPED_*, sau đó ưu tiên id nhỏ nhất (bản ghi gốc).
DELETE md_dup
FROM `message_deliveries` md_dup
INNER JOIN (
  SELECT
    `id`,
    ROW_NUMBER() OVER (
      PARTITION BY `enrollment_id`, `automation_step_id`
      ORDER BY
        CASE `status`
          WHEN 'SENT' THEN 1
          WHEN 'SENDING' THEN 2
          WHEN 'QUEUED' THEN 3
          WHEN 'SCHEDULED' THEN 4
          WHEN 'CANCELLED' THEN 5
          ELSE 6
        END ASC,
        `id` ASC
    ) AS `rn`
  FROM `message_deliveries`
) ranked ON md_dup.`id` = ranked.`id`
WHERE ranked.`rn` > 1;

-- Bước 2: Thêm Unique Index cấp DB cho (enrollment_id, automation_step_id)
ALTER TABLE `message_deliveries`
  ADD CONSTRAINT `message_deliveries_enrollment_id_automation_step_id_key`
  UNIQUE (`enrollment_id`, `automation_step_id`);
```

---

### Phương án B (Tách bảng `MilestoneOccurrence` riêng biệt nếu muốn tách lịch sử попыток gửi)

Nếu trong tương lai một mốc cần lưu nhiều lần thử gửi độc lập (multi-delivery history per occurrence), có thể tách bảng `milestone_occurrences`:

```prisma
model MilestoneOccurrence {
  id                  Int                   @id @default(autoincrement())
  enrollment_id       Int
  automation_step_id  Int
  basis_attendance_id Int
  session_number      Int
  status              MessageDeliveryStatus @default(SCHEDULED)
  first_reached_at    DateTime              @default(now())
  updated_at          DateTime              @updatedAt

  enrollment          Enrollment            @relation(fields: [enrollment_id], references: [id], onDelete: Cascade)
  automation_step     AutomationStep        @relation(fields: [automation_step_id], references: [id], onDelete: Cascade)
  basis_attendance    Attendance            @relation(fields: [basis_attendance_id], references: [id])

  @@unique([enrollment_id, automation_step_id])
  @@index([enrollment_id, session_number])
  @@map("milestone_occurrences")
}
```

**Đánh giá:** Phương án A đạt cùng mức bảo vệ toàn vẹn dữ liệu ở tầng DB với chi phí vận hành bằng 0 (không phải sửa các truy vấn thống kê `MessageDelivery` của UI).
