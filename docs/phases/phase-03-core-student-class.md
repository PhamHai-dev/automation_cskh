# Phase 3 — Student / Enrollment / Class / Teacher Core

- Status: COMPLETED
- Started at: 2026-09-18
- Completed at: 2026-09-18
- Dependencies: Phase 2 DONE
- Open questions: Q-001 có thể ảnh hưởng external ID/import readiness.

## Mục tiêu

Có core CRUD và quan hệ nghiệp vụ của Sheet 1 trước khi điểm danh/import tự động.

## Checklist chi tiết

### 3.1 Student

- [x] create/read/update/search
- [x] duplicate handling theo phone/email/external rule đã chốt

### 3.2 Enrollment

- [x] create/read/update/status
- [x] assign/reassign CS đúng scope
- [x] package relation
- [x] total sessions/start/end/status

### 3.3 Package

- [x] CRUD/admin/manage theo permission đã chốt

### 3.4 Teacher

- [x] TeacherProfile
- [x] list/search teacher

### 3.5 Class

- [x] CRUD class
- [x] attendance_source
- [x] schedule relation

### 3.6 ClassTeacher

- [x] gán GV
- [x] giữ history bằng active/start/end nếu model có

### 3.7 EnrollmentClass

- [x] add enrollment vào class
- [x] transfer class
- [x] close current class membership
- [x] đi tiếp level trong cùng enrollment
- [x] không mất history

### 3.8 Frontend

- [x] Student list + filter/search.
- [x] Student detail.
- [x] Enrollment detail/history.
- [x] Class list/detail.
- [x] Teacher/class assignment UI.
- [x] EnrollmentClass timeline/history rõ ràng.
- [x] Reusable DataTable/FilterBar/PageHeader.

### 3.9 Permission/data scope

- [x] CS chỉ enrollment được giao.
- [x] Manage team scope.
- [x] Teacher chỉ class được phân công cho view phù hợp.
- [x] Admin full.

## API contract

Trước implementation backend/frontend, cập nhật:

- `docs/api/students.md`
- `docs/api/enrollments.md`
- `docs/api/packages.md`
- `docs/api/teachers.md`
- `docs/api/classes.md`
- `docs/api/cs-groups.md` nếu có reassign/team API
- `docs/api/openapi.yaml`

Không để frontend tự đoán cấu trúc Student/Enrollment/Class response.

## Test plan

- CRUD integration tests.
- Reassign CS authorization.
- Transfer class không ghi đè history.
- Không thể tạo active EnrollmentClass duplicate sai rule.
- UI responsive/table overflow.

## Không làm

- Không chấm buổi.
- Không import Excel production.
- Không Zalo.

## Exit criteria

- [x] Core Sheet 1 structure dùng được bằng CRUD.
- [x] Chuyển lớp giữ đúng history.
- [x] Data scope tests pass.
- [x] UI dùng design system.

- [x] API contract/docs liên quan đã đồng bộ với implementation.

## Implementation notes

## Changes from original plan


## Agent notes

Khi tạo/sửa API module: áp dụng `.agents/skills/api-module-scaffold/SKILL.md`; khi sửa Prisma: áp dụng `prisma-schema-guard`.
