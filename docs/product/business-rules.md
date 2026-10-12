# 18. Business Rules Registry

File này là **điểm tra cứu tập trung** cho các business rule quan trọng của dự án.
Không dùng file này để thay thế data model/API spec; nó giúp AI/dev biết rule nào đã chốt,
rule nào còn chờ user xác nhận và nơi chứa source chi tiết.

## 1. Nguyên tắc sử dụng

- `CHỐT`: được phép implement theo rule ghi ở đây và spec liên quan.
- `CHƯA CHỐT`: nếu task phụ thuộc rule đó, phải ghi/đối chiếu `OPEN_QUESTIONS.md`, hỏi user và dừng phần phụ thuộc.
- Không được chuyển trạng thái `CHƯA CHỐT → CHỐT` chỉ dựa trên suy luận của AI.
- Khi user chốt rule mới, cập nhật đồng thời file này + `OPEN_QUESTIONS.md` + spec/phase liên quan.

## 2. Attendance status và tiêu thụ buổi — CHỐT

Nguồn schema: `architecture/data-model-core.md`.
Quyết định tracking: `OPEN_QUESTIONS.md` — Q-002 (RESOLVED, cập nhật 2026-10-10).

| Attendance status | Tên hiển thị / ý nghĩa | Có tiêu thụ/trừ buổi? |
| --- | --- | --- |
| `ATTENDED` | Có mặt | Có, đúng 1 buổi |
| `ABSENT_APPROVED_A` | Nghỉ có phép | Không |
| `LEAVE_B` | Bảo lưu | Không |
| `ABSENT_UNAPPROVED_C` | Nghỉ sai quy định | Có, đúng 1 buổi |
| `TEACHER_ABSENT_D` | GV xin nghỉ | Không |
| `TECH_ERROR_E` | Lỗi kỹ thuật | Không |

Mỗi Attendance đại diện đúng một `ClassSession`; không lưu `session_count`. Với import điểm danh, số nguyên dương `N` được biểu diễn bằng `N` ClassSession liên tiếp và N Attendance riêng biệt, không phải N trên một Attendance. `X`/`1` chỉ biểu diễn một session.

## 3. Source of truth cho số buổi và điều kiện final — CHỐT

```text
total_sessions       ← Enrollment.total_sessions
consumed_sessions    ← đếm Attendance final có status ATTENDED hoặc ABSENT_UNAPPROVED_C
remaining_sessions   ← total_sessions - consumed_sessions
```

Chỉ Attendance có `reconciliation_state` là `MATCHED` hoặc `RESOLVED` được tính buổi và kích hoạt automation. `PENDING_TEACHER`, `PENDING_CS`, `CONFLICT` là dữ liệu tạm, không được dùng làm kết quả chính thức.

Các số tổng hợp từ Excel/hệ thống ngoài chỉ dùng import/đối soát, không được âm thầm overwrite nguồn tính chính. Field đối soát nếu có dùng `external_remaining_sessions`, `external_synced_at` theo data model.

Không được suy ra một Attendance event mới chỉ từ các số tổng như “đã học 5/còn 15”. Automation chỉ được trigger từ `ClassSession + Attendance` cụ thể đã final.

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

## 15. Sale & CSKH role — CHỐT (CẬP NHẬT)

Quyết định tracking: Q-009 & Quyết định 32 (RESOLVED).

- **Tách biệt vai trò:** Cột `Sale` trong Sheet 1 không phải là người chăm sóc khách hàng (`cs_id`), mà là trường nhân viên kinh doanh độc lập. Bảng `Sale` (`sales`) lưu danh mục nhân viên kinh doanh và liên kết với `Enrollment.sale_id`.
- **Cột Sale Sheet 1:** Giá trị trong cột `Sale` của Sheet 1 là mã định danh sale (`code`). Khi import, hệ thống tự động tìm hoặc tạo mới bản ghi `Sale` (nếu chưa có) và liên kết `sale_id` vào `Enrollment`.
- **Data Scope:** Người dùng role `CS` quản lý học viên dựa trên `enrollment.cs_id` (tài khoản CSKH được phân công), không phụ thuộc vào cột `Sale`. `ADMIN` và `MANAGE` có quyền xem toàn bộ học viên và có bộ lọc theo CSKH hoặc Sale.

## 16. Ma trận Điểm danh theo Lịch Ngày và thao tác hàng loạt — CHỐT

Quyết định tracking: Q-010 & Quyết định 33 (RESOLVED, cập nhật 2026-10-10).

- **Hiển thị theo ngày lịch:** Loại bỏ số thứ tự buổi học trừu tượng, hiển thị trực tiếp theo **Thứ & Ngày trong lịch**.
- **Bộ lọc thời gian:** Mặc định xem **Tháng hiện tại**, hỗ trợ **Tuần**, **Tháng**, **Năm/Tùy chỉnh**.
- **Cột thông tin cố định bên trái (12 cột):** Ô tích chọn, STT, Mã HV, Họ và tên, Ngày bắt đầu học, Trạng thái, Ngày kết thúc/Bảo lưu, Giờ học, Lịch học, Thời lượng, GV & Mã GV, Tên lớp.
- **Thao tác hàng loạt:** Có thể chọn nhiều học viên hoặc cả lớp, nhưng bắt buộc xác nhận trước khi lưu; thay đổi từng học viên được lưu ngay.
- **Có mặt:** UI hiển thị `1` thay cho chữ `X`, nhưng đây chỉ là ký hiệu của một Attendance `ATTENDED`, không phải số lượng buổi có thể chỉnh thành `2`, `3`.
- **Các trạng thái khác:** `A` (Nghỉ phép), `B` (Bảo lưu), `C` (Nghỉ sai QĐ), `D` (GV nghỉ), `E` (Lỗi KT).
- **Excel attendance import:** `X`/`1` và số nguyên dương `N` được xử lý theo N ClassSession liên tiếp; `0`, âm và thập phân là lỗi. Điều này chỉ áp dụng cho luồng import workbook, không biến ô UI matrix thành trường nhập số buổi.
- **Loại bỏ:** Cột *"Chỉ số chuyên cần ĐH % và BT %"* không sử dụng.
- **Tab Quản lý Ghi danh (`/enrollments`):** Tổ chức theo dạng Ma trận Điểm danh theo Sale, tự động lọc học viên theo Sale phụ trách.

## 17. Danh sách Học viên Sheet 1 & Cảnh báo Nợ buổi âm — CHỐT

Quyết định tracking: Q-012 (RESOLVED).

- **Cấu trúc bảng chuẩn Sheet 1:** Trang Danh sách học viên (`/students`) hiển thị đầy đủ 28 cột dữ liệu nghiệp vụ của Sheet `1.Chăm sóc`.
- **Cảnh báo nợ âm:** Các học viên có `Số buổi còn lại < 0` (ví dụ: `-1`, `-2`, `-30`...) phải được làm nổi bật bằng huy hiệu cảnh báo nợ màu đỏ đậm (`bg-red-100 text-red-800 border-red-300 font-extrabold`).
- **Data scope:** Tự động lọc học viên theo Sale phụ trách khi đăng nhập tài khoản `CS`.

## 18. Đối soát Attendance khi import workbook — CHỐT

Quyết định tracking: Q-011 (RESOLVED, cập nhật 2026-10-10).

- Cả workbook giáo viên và CSKH đều theo luồng `preview → xác nhận → commit`, trong tab điểm danh riêng; Sheet 1 chỉ import hồ sơ.
- Preview phân loại `CREATE`, `UNCHANGED`, `CONFLICT`, `INVALID`, `OUT_OF_SCOPE`, hiển thị ngày nguồn → năm đích, raw value, N session và action từng conflict.
- Confirm upload lại workbook và server preview lại trước khi commit; ô lỗi/out-of-scope bị bỏ qua nhưng phải có báo cáo chi tiết. Ô trống giữ nguyên dữ liệu cũ.
- CSKH match bằng mã HV + tên/mã lớp + ngày + giờ `Giờ học (1)`; duration cố định 30 phút. GV match mã HV + model + ngày + start/end. Match phải duy nhất.
- Attendance import không tạo Student, Enrollment, Class, EnrollmentClass. Có thể tạo ClassSession còn thiếu và Attendance cần thiết; chỉ ghi `cs_status` cho CSKH hoặc `teacher_status` cho GV, rồi đi qua reconciliation hiện có.

## 19. Nhập & Xuất Excel cho Tất Cả Các Vai Trò & Cơ Chế Phân Công CSKH — CHỐT

Quyết định tracking: Q-013 & Quyết định 32 (RESOLVED).

- **Phân quyền truy cập:** Mở quyền tính năng Nhập/Xuất Excel cho `ADMIN`, `MANAGE`, `CS`, `TEACHER`.
- **Phân công CSKH & Phạm vi dữ liệu (Data Scope):**
  - `ADMIN` và `MANAGE`:
    - Giao diện có bộ chọn (dropdown) tài khoản CSKH phụ trách khi upload (`assignedCsId`).
    - Cả học viên mới và học viên cũ được gán cho tài khoản CSKH được chọn.
    - Toàn quyền duyệt hoặc từ chối các yêu cầu điều chuyển học viên trong Hàng đợi phê duyệt (`/create-requests`).
  - `CS`:
    - **Học viên mới:** Tự động gán cho tài khoản CS đang upload (`cs_id = actor.id`).
    - **Học viên cũ đã thuộc CS này (`enrollment.cs_id === actor.id`):** Ghi đè cập nhật bình thường.
    - **Học viên cũ đang thuộc CS khác (`enrollment.cs_id !== actor.id`):** Không được sửa trực tiếp; hệ thống phân loại là `REQUEST_TRANSFER` và tự động tạo yêu cầu phê duyệt chuyển CS (`ImportCreateRequest` trạng thái `PENDING`) vào Hàng đợi để Admin/Manage duyệt.
  - `TEACHER`:
    - Chỉ import điểm danh Sheet 3 cho các lớp học mà giáo viên được phân công giảng dạy (`ClassTeacher`); các dòng ngoài lớp phân công hoặc Sheet 1 tự động bỏ qua.
  - Xuất Excel: Áp dụng data scope tương ứng (CS chỉ xuất học viên do mình chăm sóc, Teacher chỉ xuất lớp mình dạy).
- **Quy tắc Sheet 1 (`1.Chăm sóc`):**
  - Khóa đối soát: `(ID, Gói học)`.
  - Cột `Sale` ánh xạ vào bảng `Sale` (`code`), tự động tạo mới nếu chưa tồn tại.
  - Nếu đã có và được phép sửa: Ghi đè thông tin Student và Enrollment. Nếu ô trên Excel bị để trống, xóa trắng trường đó trong DB để đồng bộ tuyệt đối theo Excel. Lịch sử chăm sóc (`CareLog`, `CareTask`) giữ nguyên vẹn.
  - Nếu chưa có: Thêm mới trực tiếp vào Database (`Student`, `Package`, `Enrollment`, `Class`, `EnrollmentClass`) ngay khi xác nhận import, gán `cs_id` theo quy tắc phân công.
- **Quy tắc Sheet 3 (`3.Chấm buổi`) và workbook GV:**
  - Tách hoàn toàn khỏi Sheet 1; dùng tab **Điểm danh CSKH / GV**, chọn bắt buộc nguồn và năm đích.
  - Không tạo/cập nhật hồ sơ học viên. Thiếu Student/EnrollmentClass/class hoặc match mơ hồ được preview `INVALID`.
  - CSKH đọc lớp và `Giờ học (1)`, GV đọc model và cột thời gian. `X`/`1`, A/B/C/D/E hoặc `MãHV-Tên bài` là một session; integer N là N session liên tiếp.
  - Re-upload khi dữ liệu đã phản ánh là `UNCHANGED`; commit ghi audit và không tạo duplicate Attendance.
- **Định dạng file:** Sheet 1 profile và attendance workbook dùng luồng riêng; source phải phù hợp cấu trúc workbook đã chọn.

## 20. Checklist khi business rule thay đổi

Khi user chốt hoặc thay đổi business rule:
1. Cập nhật file này.
2. Cập nhật `OPEN_QUESTIONS.md`.
3. Cập nhật `decisions/summary.md` hoặc ADR nếu quyết định lớn.
4. Cập nhật data model/API contract nếu bị ảnh hưởng.
5. Cập nhật phase hiện tại và test cases.
6. Ghi `CHANGELOG.md`.
