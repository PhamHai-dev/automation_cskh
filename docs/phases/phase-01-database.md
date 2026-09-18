# Phase 1 — Database Schema & Core Persistence

- Status: NOT_STARTED
- Started at:
- Completed at:
- Dependencies: Phase 0 DONE
- Open questions: Q-001 phải chốt trước khi khóa mapping external ID; các câu hỏi khác có thể để field/rule chưa dùng ở phase này.

## Mục tiêu

Chốt schema MySQL/Prisma đủ cho toàn MVP mà không triển khai business API đầy đủ.

## Checklist chi tiết

### 1.1 Auth/organization

- [ ] User
- [ ] AuthSession
- [ ] LoginAudit
- [ ] PasswordResetToken nếu spec vẫn yêu cầu
- [ ] CSGroup
- [ ] CSGroupMember
- [ ] ManageAssignment

### 1.2 Core learning

- [ ] Student
- [ ] Enrollment
- [ ] Package
- [ ] TeacherProfile
- [ ] Class
- [ ] ClassTeacher
- [ ] ClassSchedule
- [ ] EnrollmentClass
- [ ] ClassSession
- [ ] Attendance

### 1.3 Care/automation/import/audit

- [ ] CareLog
- [ ] CareTask
- [ ] ZaloAccount
- [ ] ZaloContactRelation
- [ ] MessageRule
- [ ] MessageDelivery
- [ ] OutboxEvent
- [ ] ImportBatch
- [ ] ImportRow
- [ ] AuditLog

### 1.4 Yêu cầu thiết kế

- [ ] `User.roles` là MySQL JSON.
- [ ] Student không chứa class/teacher/cs trực tiếp.
- [ ] EnrollmentClass giữ lịch sử lớp.
- [ ] Attendance tham chiếu EnrollmentClass + ClassSession.
- [ ] Index các FK và filter chính.
- [ ] Unique constraints đúng nghiệp vụ.
- [ ] Enum/string status phải thống nhất với docs.
- [ ] Tránh stored aggregate làm source of truth nếu derive được.

### 1.5 Repository foundation

- [ ] Có thể tạo repository base/pattern tối thiểu nhưng không tạo abstraction generic phức tạp.

### 1.6 Seed

- [ ] 1 Admin local/dev.
- [ ] Optional demo roles/users chỉ trong dev seed.

  Không commit password thật.

## Không làm

- Không full auth API.
- Không UI CRUD.
- Không Attendance business calculation nếu Q-002 chưa chốt.


## API contract

Phase này chủ yếu DB, chưa implement business API. Nếu schema rename field đã xuất hiện trong draft OpenAPI, phải đồng bộ `docs/api/openapi.yaml` trước khi kết thúc phase để phase sau không dùng contract cũ.

## Test plan

- `prisma format`
- `prisma validate`
- migration apply trên DB sạch
- migration apply/re-run strategy local
- constraint test quan trọng: unique enrollmentClass/session attendance, unique CS group membership, unique assignment phù hợp

## Exit criteria

- [ ] Schema review pass.
- [ ] Migration chạy trên DB sạch.
- [ ] Seed dev hoạt động.
- [ ] Không có quan hệ trái `decisions/summary.md`.
- [ ] Docs schema được cập nhật nếu implementation chi tiết khác spec nhưng đã được duyệt.

## Implementation notes

## Changes from original plan


## Agent notes

Skill bắt buộc khi sửa Prisma: `.agents/skills/prisma-schema-guard/SKILL.md`.
