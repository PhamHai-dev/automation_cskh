# Phase 3 — Student / Enrollment / Class / Teacher Core

- Status: NOT_STARTED
- Started at:
- Completed at:
- Dependencies: Phase 2 DONE
- Open questions: Q-001 có thể ảnh hưởng external ID/import readiness.

## Mục tiêu

Có core CRUD và quan hệ nghiệp vụ của Sheet 1 trước khi điểm danh/import tự động.

## Checklist chi tiết

### 3.1 Student

- [ ] create/read/update/search
- [ ] duplicate handling theo phone/email/external rule đã chốt

### 3.2 Enrollment

- [ ] create/read/update/status
- [ ] assign/reassign CS đúng scope
- [ ] package relation
- [ ] total sessions/start/end/status

### 3.3 Package

- [ ] CRUD/admin/manage theo permission đã chốt

### 3.4 Teacher

- [ ] TeacherProfile
- [ ] list/search teacher

### 3.5 Class

- [ ] CRUD class
- [ ] attendance_source
- [ ] schedule relation

### 3.6 ClassTeacher

- [ ] gán GV
- [ ] giữ history bằng active/start/end nếu model có

### 3.7 EnrollmentClass

- [ ] add enrollment vào class
- [ ] transfer class
- [ ] close current class membership
- [ ] đi tiếp level trong cùng enrollment
- [ ] không mất history

### 3.8 Frontend

- [ ] Student list + filter/search.
- [ ] Student detail.
- [ ] Enrollment detail/history.
- [ ] Class list/detail.
- [ ] Teacher/class assignment UI.
- [ ] EnrollmentClass timeline/history rõ ràng.
- [ ] Reusable DataTable/FilterBar/PageHeader.

### 3.9 Permission/data scope

- [ ] CS chỉ enrollment được giao.
- [ ] Manage team scope.
- [ ] Teacher chỉ class được phân công cho view phù hợp.
- [ ] Admin full.

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

- [ ] Core Sheet 1 structure dùng được bằng CRUD.
- [ ] Chuyển lớp giữ đúng history.
- [ ] Data scope tests pass.
- [ ] UI dùng design system.

- [ ] API contract/docs liên quan đã đồng bộ với implementation.

## Implementation notes

## Changes from original plan


## Agent notes

Khi tạo/sửa API module: áp dụng `.agents/skills/api-module-scaffold/SKILL.md`; khi sửa Prisma: áp dụng `prisma-schema-guard`.
