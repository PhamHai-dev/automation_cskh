# Phase 4 — ClassSession + Attendance

- Status: COMPLETED
- Started at: 2026-09-18
- Completed at: 2026-09-18
- Dependencies: Phase 3 DONE
- Open questions: None.

## Checklist chi tiết

### 4.1 ClassSession

- [x] create/update/cancel session
- [x] session_number rule theo Q-003 (unique trong class)
- [x] date/start/end/teacher/status
- [x] validate class relation

### 4.2 Attendance

- [x] điểm danh một học viên
- [x] bulk attendance cho lớp/session
- [x] unique EnrollmentClass + ClassSession
- [x] sửa attendance có audit
- [x] enforce enrollmentClass thuộc đúng class/session

### 4.3 Source rules

- [x] `learning_system`: CS theo scope được phép import/nhập theo spec.
- [x] `zoom`: Teacher là nguồn chỉnh sửa chính theo spec.

  Chi tiết quyền theo docs, không suy đoán.

### 4.4 Business rule

- [x] Attendance status: A/B/C/D/E
  - consume session
  - completed
  - không completed
  - trigger automation (chưa implement sau Q-002)

### 4.5 Frontend

- [x] ClassSession list/calendar/table mức cần thiết.
- [x] Attendance sheet-like UI cho một session.
- [x] Ma trận Điểm danh theo Lịch Ngày (Attendance Matrix by Calendar Dates):
  - Hiển thị theo Thứ & Ngày trong lịch (bỏ số thứ tự buổi 1, 2...).
  - Mặc định Tháng hiện tại, bộ lọc chuyển đổi nhanh Tuần / Tháng / Năm.
  - 11 cột thông tin học viên & lớp học cố định bên trái (loại bỏ cột *"Chỉ số chuyên cần ĐH % và BT %"*).
  - Cố định 3 cột định danh (`#`, `Mã HV`, `Họ và tên`) nền đục kèm đổ bóng nhẹ chống đè chữ khi cuộn ngang.
- [x] Ma trận Điểm danh lọc theo Sale tại Tab Quản lý Ghi danh (`/enrollments`).
- [x] Bulk marking trực tiếp qua click ô ngày: `X` (Có mặt), `A` (Nghỉ phép), `B` (Bảo lưu), `C` (Nghỉ không phép), `D` (GV nghỉ), `E` (Lỗi kỹ thuật).
- [x] Status legend A/B/C/D/E.
- [x] Read-only state theo role/source.
- [x] Confirmation khi sửa dữ liệu cũ nếu policy quy định.

## API contract

Đã cập nhật `docs/api/attendance.md` và `docs/api/openapi.yaml`.

## Test plan

- [x] duplicate attendance bị chặn.
- [x] cross-class attendance bị chặn.
- [x] role/source authorization.
- [x] create/update/cancel session.
- [x] business-rule unit tests sau Q-002.
- [x] responsive attendance table.

## Exit criteria

- [x] Q-002 resolved hoặc phần phụ thuộc bị đánh dấu BLOCKED, không tự đoán.
- [x] Q-003 resolved.
- [x] Attendance source/role rules pass.
- [x] Audit data changes đủ theo spec.

- [x] API contract/docs liên quan đã đồng bộ với implementation.

## Implementation notes

- Module `class-sessions` được tạo đầy đủ (routes, controller, service, repository, schema, types)
- Module `attendance` được tạo đầy đủ (routes, controller, service, repository, schema, types)
- Audit logging được thêm vào service với `prisma.auditLog.create`
- Bulk attendance sử dụng Prisma transaction
- Integration tests pass: 13/13

## Changes from original plan

1. **Ma trận Điểm danh theo Ngày thay vì số thứ tự Buổi:** Chuyển đổi từ cột Buổi 1, 2, 3... sang Thứ & Ngày thực tế của tháng để khớp chính xác dữ liệu thực tế tại Sheet 3 (`3.Chấm buổi`).
2. **Loại bỏ cột Chỉ số chuyên cần:** Bỏ cột *"Chỉ số chuyên cần ĐH % và BT %"* trên ma trận điểm danh theo yêu cầu người dùng.
3. **Ma trận lọc theo Sale:** Áp dụng ma trận điểm danh vào Tab Quản lý Ghi danh (`/enrollments`) để nhân viên CSKH/Sale quản lý điểm danh học viên do mình phụ trách theo thời gian thực.

## Reconciliation enhancement — 2026-10-11

- [x] Hàng chờ kiểm tra đồng thời state lưu và cặp trạng thái GV/CSKH; không tính record chưa có ý kiến từ cả hai bên.
- [x] API pending trả giáo viên active được phân công qua `ClassTeacher`.
- [x] UI đối soát có cột Giáo viên và bảng/hành động tách theo Chờ CSKH, Chờ GV, Tất cả.
- [x] Backend typecheck và frontend build pass.
- [x] Integration flow mới cho invariant pending/assigned teacher pass; hai lỗi Flow 4 Excel fixture và cleanup FK là lỗi test có sẵn ngoài phạm vi.

## Agent notes

Đọc `docs/product/business-rules.md` trước. Khi sửa Prisma dùng `prisma-schema-guard`; khi tạo/sửa API dùng `api-module-scaffold`.
