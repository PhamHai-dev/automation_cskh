# 18. Business Rules Registry

File này là **điểm tra cứu tập trung** cho các business rule quan trọng của dự án.
Không dùng file này để thay thế data model/API spec; nó giúp AI/dev biết rule nào đã chốt,
rule nào còn chờ user xác nhận và nơi chứa source chi tiết.

## 1. Nguyên tắc sử dụng

- `CHỐT`: được phép implement theo rule ghi ở đây và spec liên quan.
- `CHƯA CHỐT`: nếu task phụ thuộc rule đó, phải ghi/đối chiếu `OPEN_QUESTIONS.md`, hỏi user và dừng phần phụ thuộc.
- Không được chuyển trạng thái `CHƯA CHỐT → CHỐT` chỉ dựa trên suy luận của AI.
- Khi user chốt rule mới, cập nhật đồng thời file này + `OPEN_QUESTIONS.md` + spec/phase liên quan.

## 2. Attendance status — CHỐT MỘT PHẦN

Nguồn schema: `architecture/data-model-core.md`.
Quyết định tracking: `OPEN_QUESTIONS.md` — Q-002 (RESOLVED).

| Attendance status | Tên hiển thị / ý nghĩa | Có tiêu thụ/trừ buổi? | Tính completed? | Trigger message “hoàn thành buổi N”? |
| --- | --- | --- | --- | --- |
| `attended` | Có mặt | TBD | TBD | TBD |
| `absent_approved_A` | Nghỉ có phép | Có | Không | Không |
| `leave_B` | Bảo lưu | Có | Không | Không |
| `absent_unapproved_C` | Nghỉ sai quy định | Có | Không | Không |
| `teacher_absent_D` | GV xin nghỉ | Có | Không | Không |
| `tech_error_E` | Lỗi kỹ thuật | Có | Không | Không |

Rule của `attended` chưa nằm trong quyết định Q-002; chỉ A/B/C/D/E được chốt ở đây.

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

## 6. ID từ Sheet 1/3 — CHỐT

Quyết định tracking: Q-001 (RESOLVED).

`ID` từ Sheet 1/3 là external ID cố định, bất biến của `Student`; dùng xuyên các Enrollment. Schema/import phải map ID nguồn vào Student, không dùng nó làm định danh riêng của Enrollment.

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

## 12. Zalo contact/friend policy — CHỐT

Quyết định tracking: Q-007 (RESOLVED).

Khi Student chưa có `ZaloContactRelation` hợp lệ với `ZaloAccount` của CS:
- không gửi message;
- tạo `MessageDelivery` trạng thái `skipped` kèm lý do rõ ràng;
- hiển thị cảnh báo cho CS;
- không tự retry cho đến khi relation được xác nhận.

Technical spike vẫn phải xác nhận khả năng thật của version `zca-js` được pin.

## 13. UI brand — CHỐT

Quyết định tracking: Q-006 (RESOLVED).

Dùng primary `#2563EB` và accent `#14B8A6` qua semantic token tập trung. Không hardcode màu brand rải rác trong component.

## 14. UI/business behavior

UI ẩn/hiện theo role chỉ là UX. Bảo mật luôn nằm ở backend Permission + Data Scope.
Không biến trạng thái/loading/error/empty UI thành thay đổi business rule.

## 15. Sale & CSKH role — CHỐT

Quyết định tracking: Q-009 (RESOLVED).

- **Đồng nhất vai trò:** Sale và nhân viên chăm sóc khách hàng là cùng 1 vai trò, sử dụng role hệ thống `CS`.
- **Ánh xạ cột Sale Sheet 1:** Giá trị trong cột `Sale` của Sheet 1 chính là tên tài khoản đăng nhập (Email) mà Admin tạo trong hệ thống.
- **Data Scope:** Người dùng có role `CS` chỉ xem và tương tác với các học viên có `Sale` khớp với tài khoản đăng nhập của mình. `ADMIN` và `MANAGE` có quyền xem toàn bộ học viên và có bộ chọn lọc theo từng Sale.

## 16. Ma trận Điểm danh theo Lịch Ngày & Tab Ghi danh — CHỐT

Quyết định tracking: Q-010 (RESOLVED).

- **Hiển thị theo ngày lịch:** Loại bỏ số thứ tự buổi học trừu tượng (Buổi 1, Buổi 2...), hiển thị trực tiếp theo **Thứ & Ngày trong lịch** (VD: `T2 01/09`, `T4 03/09`...).
- **Bộ lọc thời gian:** Mặc định xem **Tháng hiện tại**, hỗ trợ chuyển nhanh theo **Tuần**, **Tháng**, **Năm/Tùy chỉnh**.
- **Cột thông tin cố định bên trái (11 cột):** STT, Mã HV, Họ và tên, Ngày bắt đầu học, Trạng thái, Ngày kết thúc/Bảo lưu, Giờ học, Lịch học, Thời lượng, GV & Mã GV, Tên lớp.
- **Loại bỏ:** Cột *"Chỉ số chuyên cần ĐH % và BT %"* không sử dụng.
- **Tab Quản lý Ghi danh (`/enrollments`):** Tổ chức theo dạng Ma trận Điểm danh theo Sale, tự động lọc học viên theo Sale phụ trách.

## 17. Danh sách Học viên Sheet 1 & Cảnh báo Nợ buổi âm — CHỐT

Quyết định tracking: Q-012 (RESOLVED).

- **Cấu trúc bảng chuẩn Sheet 1:** Trang Danh sách học viên (`/students`) hiển thị đầy đủ 28 cột dữ liệu nghiệp vụ của Sheet `1.Chăm sóc`.
- **Cảnh báo nợ âm:** Các học viên có `Số buổi còn lại < 0` (ví dụ: `-1`, `-2`, `-30`...) phải được làm nổi bật bằng huy hiệu cảnh báo nợ màu đỏ đậm (`bg-red-100 text-red-800 border-red-300 font-extrabold`).
- **Data scope:** Tự động lọc học viên theo Sale phụ trách khi đăng nhập tài khoản `CS`.

## 18. Đối soát Học viên khi Import Sheet 3 — CHỐT

Quyết định tracking: Q-011 (RESOLVED).

- **Học viên cũ:** Nếu học viên từ file khớp với học viên đã có trong cơ sở dữ liệu, hệ thống tự động đồng bộ điểm danh theo ngày mà **không hỏi lại**.
- **Học viên mới:** Nếu phát hiện học viên từ file chưa từng có trong hệ thống, bắt buộc hiển thị hộp thoại xác nhận (Confirm modal) hỏi người dùng có muốn tự động tạo mới học viên và ghi danh vào lớp hay không.

## 19. Checklist khi business rule thay đổi

Khi user chốt hoặc thay đổi business rule:
1. Cập nhật file này.
2. Cập nhật `OPEN_QUESTIONS.md`.
3. Cập nhật `decisions/summary.md` hoặc ADR nếu quyết định lớn.
4. Cập nhật data model/API contract nếu bị ảnh hưởng.
5. Cập nhật phase hiện tại và test cases.
6. Ghi `CHANGELOG.md`.
