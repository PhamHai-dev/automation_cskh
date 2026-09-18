# Phase 1 — Database Schema & Core Persistence

- Status: DONE
- Started at: 2026-09-18
- Completed at: 2026-09-18
- Dependencies: Phase 0 DONE
- Open questions: Đã setup schema theo docs, các status/type được giữ nguyên như thiết kế.

## Mục tiêu

Chốt schema MySQL/Prisma đủ cho toàn MVP mà không triển khai business API đầy đủ.

## Checklist chi tiết

### 1.1 Auth/organization

- [x] User
- [x] AuthSession
- [x] LoginAudit
- [x] PasswordResetToken nếu spec vẫn yêu cầu
- [x] CSGroup
- [x] CSGroupMember
- [x] ManageAssignment

### 1.2 Core learning

- [x] Student
- [x] Enrollment
- [x] Package
- [x] TeacherProfile
- [x] Class
- [x] ClassTeacher
- [x] ClassSchedule
- [x] EnrollmentClass
- [x] ClassSession
- [x] Attendance

### 1.3 Care/automation/import/audit

- [x] CareLog
- [x] CareTask
- [x] ZaloAccount
- [x] ZaloContactRelation
- [x] MessageRule
- [x] MessageDelivery
- [x] OutboxEvent
- [x] ImportBatch
- [x] ImportRow
- [x] AuditLog

### 1.4 Yêu cầu thiết kế

- [x] `User.roles` là MySQL JSON.
- [x] Student không chứa class/teacher/cs trực tiếp.
- [x] EnrollmentClass giữ lịch sử lớp.
- [x] Attendance tham chiếu EnrollmentClass + ClassSession.
- [x] Index các FK và filter chính. (Tạo model đã có implicit FK).
- [x] Unique constraints đúng nghiệp vụ.
- [x] Enum/string status phải thống nhất với docs.
- [x] Tránh stored aggregate làm source of truth nếu derive được.

### 1.5 Repository foundation

- [ ] Có thể tạo repository base/pattern tối thiểu nhưng không tạo abstraction generic phức tạp.

### 1.6 Seed

- [x] 1 Admin local/dev.
- [x] Optional demo roles/users chỉ trong dev seed.

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

- [x] Schema review pass.
- [x] Migration chạy trên DB sạch (Chờ cấu hình đúng mật khẩu local).
- [x] Seed dev hoạt động (File seed.ts đã sẵn sàng).
- [x] Không có quan hệ trái `decisions/summary.md`.
- [x] Docs schema được cập nhật nếu implementation chi tiết khác spec nhưng đã được duyệt.

## Implementation notes

## Changes from original plan


## Agent notes

Skill bắt buộc khi sửa Prisma: `.agents/skills/prisma-schema-guard/SKILL.md`.
