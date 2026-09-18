# 18. Business Rules Registry

File này là **điểm tra cứu tập trung** cho các business rule quan trọng của dự án.
Không dùng file này để thay thế data model/API spec; nó giúp AI/dev biết rule nào đã chốt,
rule nào còn chờ user xác nhận và nơi chứa source chi tiết.

## 1. Nguyên tắc sử dụng

- `CHỐT`: được phép implement theo rule ghi ở đây và spec liên quan.
- `CHƯA CHỐT`: nếu task phụ thuộc rule đó, phải ghi/đối chiếu `OPEN_QUESTIONS.md`, hỏi user và dừng phần phụ thuộc.
- Không được chuyển trạng thái `CHƯA CHỐT → CHỐT` chỉ dựa trên suy luận của AI.
- Khi user chốt rule mới, cập nhật đồng thời file này + `OPEN_QUESTIONS.md` + spec/phase liên quan.

## 2. Attendance status — CHƯA CHỐT

Nguồn schema: `architecture/data-model-core.md`.
Câu hỏi tracking: `OPEN_QUESTIONS.md` — Q-002.

| Attendance status | Có tiêu thụ/trừ buổi? | Tính completed? | Trigger message “hoàn thành buổi N”? |
| --- | --- | --- | --- |
| `attended` | TBD | TBD | TBD |
| `absent_approved_A` | TBD | TBD | TBD |
| `leave_B` | TBD | TBD | TBD |
| `absent_unapproved_C` | TBD | TBD | TBD |
| `teacher_absent_D` | TBD | TBD | TBD |
| `tech_error_E` | TBD | TBD | TBD |

AI không được tự suy ra từ tên A/B/C/D/E.

## 3. Source of truth cho số buổi — CHỐT NGUYÊN TẮC

```text
total_sessions       ← Enrollment.total_sessions
consumed/completed   ← derive từ Attendance theo business rule đã được chốt
remaining_sessions   ← derive từ total_sessions và consumed/completed
```

Các số tổng hợp từ Excel/hệ thống ngoài chỉ dùng import/đối soát, không được âm thầm overwrite nguồn tính chính.
Field đối soát nếu có dùng `external_remaining_sessions`, `external_synced_at` theo data model.

Không được suy ra một Attendance event mới chỉ từ các số tổng như “đã học 5/còn 15”.
Automation chỉ được trigger từ `ClassSession + Attendance` cụ thể.

## 4. Student / Enrollment / EnrollmentClass — CHỐT

- `Student` = một con người.
- `Enrollment` = một gói/lần đăng ký học.
- `EnrollmentClass` = lịch sử Enrollment tham gia một hoặc nhiều Class.
- Đang học chuyển lớp hoặc đi tiếp level trong cùng Enrollment → tạo record `EnrollmentClass` mới và giữ record cũ.
- Mua gói/khóa độc lập mới → tạo `Enrollment` mới.

## 5. Attendance identity — CHỐT

`Attendance` luôn thuộc:

```text
EnrollmentClass + ClassSession
```

Bắt buộc chống duplicate tương đương:

```text
UNIQUE(enrollment_class_id, class_session_id)
```

`Attendance` không duplicate ngày/giờ buổi học; ngày/giờ thuộc `ClassSession`.

## 6. ID từ Sheet 1/3 — CHƯA CHỐT

Câu hỏi tracking: Q-001.

Cần user xác nhận ID nguồn là:
- ID cố định của `Student`, hay
- ID của một `Enrollment`.

Không hard-code mapping production trước khi chốt.

## 7. ClassSession / session_number — CHƯA CHỐT

Câu hỏi tracking: Q-003.

Cần chốt nguồn và cách đánh số khi:
- import từ learning system;
- giáo viên tạo/nhập buổi Zoom;
- học viên chuyển lớp/đi tiếp level;
- buổi bị hủy hoặc sửa lịch.

Không tự giả định session_number global theo Enrollment hay global theo Student.

## 8. Quyền sửa dữ liệu import/attendance cũ — CHƯA CHỐT

Câu hỏi tracking: Q-004.

Cần chốt:
- role nào được sửa;
- dữ liệu sau bao lâu thì khóa;
- trường hợp override;
- audit bắt buộc;
- rollback/import conflict policy.

## 9. Multi-role permission/data scope — CHƯA CHỐT CHI TIẾT

Câu hỏi tracking: Q-005.

Nguyên tắc đã chốt:
- Permission có thể là union của roles.
- Scope không tự động thành company-wide chỉ vì có nhiều role.
- `ADMIN` có full scope.

Chi tiết hợp scope cho từng endpoint đa role phải theo `product/auth-rbac.md`/API module và user xác nhận khi chưa có rule.

## 10. MessageRule precedence — CHƯA CHỐT

Câu hỏi tracking: Q-008.

Có hai cấp rule dự kiến:
- Package-level default.
- Enrollment-level override.

Không tự mặc định precedence khi Q-008 chưa được user xác nhận.

## 11. MessageDelivery reliability — CHỐT KỸ THUẬT

Khi automation được triển khai production:
- tạo `MessageDelivery` có idempotency/unique constraint theo spec;
- dùng `OutboxEvent`, không gọi queue trực tiếp sau DB write theo kiểu dễ mất job;
- worker phải đọc trạng thái DB trước khi gửi;
- delivery `sent/cancelled` không được gửi lại;
- attendance bị sửa/hủy phải làm delivery liên quan chuyển trạng thái phù hợp;
- retry có giới hạn, phân biệt transient/permanent failure.

Chi tiết xem `architecture/system.md`, `architecture/data-model-zalo-care.md`, phase 08.

## 12. Zalo contact/friend policy — CHƯA CHỐT

Câu hỏi tracking: Q-007.

Không tự quyết khi student chưa friend/contact với ZaloAccount:
- skip + cảnh báo;
- cho phép gửi theo cấu hình;
- yêu cầu kết bạn trước;
- policy khác.

Technical spike phải xác nhận khả năng thật của version `zca-js` được pin.

## 13. UI/business behavior

UI ẩn/hiện theo role chỉ là UX. Bảo mật luôn nằm ở backend Permission + Data Scope.
Không biến trạng thái/loading/error/empty UI thành thay đổi business rule.

## 14. Checklist khi business rule thay đổi

Khi user chốt hoặc thay đổi business rule:
1. Cập nhật file này.
2. Cập nhật `OPEN_QUESTIONS.md`.
3. Cập nhật `decisions/summary.md` hoặc ADR nếu quyết định lớn.
4. Cập nhật data model/API contract nếu bị ảnh hưởng.
5. Cập nhật phase hiện tại và test cases.
6. Ghi `CHANGELOG.md`.
