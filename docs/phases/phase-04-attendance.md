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
- [x] Bulk marking.
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

## Agent notes

Đọc `docs/product/business-rules.md` trước. Khi sửa Prisma dùng `prisma-schema-guard`; khi tạo/sửa API dùng `api-module-scaffold`.
