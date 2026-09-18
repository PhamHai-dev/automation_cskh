# Phase 4 — ClassSession + Attendance

- Status: NOT_STARTED
- Started at:
- Completed at:
- Dependencies: Phase 3 DONE
- Open questions: Q-002 và Q-003 phải được chốt trước khi hoàn tất business logic.

## Mục tiêu

Chuẩn hóa Sheet 3 thành ClassSession + Attendance và cung cấp luồng điểm danh đúng role/source.

## Checklist chi tiết

### 4.1 ClassSession

- [ ] create/update/cancel session
- [ ] session_number rule theo Q-003
- [ ] date/start/end/teacher/status
- [ ] validate class relation

### 4.2 Attendance

- [ ] điểm danh một học viên
- [ ] bulk attendance cho lớp/session
- [ ] unique EnrollmentClass + ClassSession
- [ ] sửa attendance có audit
- [ ] enforce enrollmentClass thuộc đúng class/session

### 4.3 Source rules

- [ ] `learning_system`: CS theo scope được phép import/nhập theo spec.
- [ ] `zoom`: Teacher là nguồn chỉnh sửa chính theo spec.

  Chi tiết quyền phải theo docs, không suy đoán nếu chưa chốt.

### 4.4 Business rule

- [ ] Q-002 phải định nghĩa status nào:
  - consume session
  - completed
  - không completed
  - trigger automation

  Nếu chưa chốt, có thể lưu Attendance status nhưng không được implement derived counts/automation sai giả định.

### 4.5 Frontend

- [ ] ClassSession list/calendar/table mức cần thiết.
- [ ] Attendance sheet-like UI cho một session.
- [ ] Bulk marking.
- [ ] Status legend A/B/C/D/E.
- [ ] Read-only state theo role/source.
- [ ] Confirmation khi sửa dữ liệu cũ nếu policy quy định.


## API contract

Trước implementation, cập nhật `docs/api/attendance.md` và `docs/api/openapi.yaml` cho:

- ClassSession list/create/update/cancel
- attendance sheet
- single/bulk attendance write
- role/source/data-scope behavior

Nếu Q-002/Q-003 chưa chốt thì contract không được giả định derived count/trigger behavior.

## Test plan

- duplicate attendance bị chặn.
- cross-class attendance bị chặn.
- role/source authorization.
- create/update/cancel session.
- business-rule unit tests sau Q-002.
- responsive attendance table.

## Exit criteria

- [ ] Q-002 resolved hoặc phần phụ thuộc bị đánh dấu BLOCKED, không tự đoán.
- [ ] Q-003 resolved.
- [ ] Attendance source/role rules pass.
- [ ] Audit data changes đủ theo spec.

- [ ] API contract/docs liên quan đã đồng bộ với implementation.

## Implementation notes

## Changes from original plan


## Agent notes

Đọc `docs/product/business-rules.md` trước. Khi sửa Prisma dùng `prisma-schema-guard`; khi tạo/sửa API dùng `api-module-scaffold`.
