---
name: prisma-schema-guard
description: Bảo vệ tính nhất quán Prisma/MySQL của dự án automation_cskh. Dùng khi tạo, sửa hoặc review schema.prisma, migration, model, field, relation, index hoặc unique constraint để đảm bảo thay đổi khớp data model/decision đã chốt và không làm sai Student → Enrollment → EnrollmentClass → ClassSession/Attendance.
---

# Prisma Schema Guard

## Trước khi sửa

Đọc:
1. `Agent.md`
2. `docs/architecture/data-model-core.md`
3. `docs/architecture/data-model-zalo-care.md`
4. `docs/decisions/summary.md`
5. `docs/product/business-rules.md`
6. `docs/OPEN_QUESTIONS.md`
7. phase hiện tại.

## Invariants bắt buộc

- `User.roles` dùng Prisma `Json`; không tạo `UserRole` nếu docs chưa đổi.
- `Student` không chứa `classId`, `teacherId`, `csId` như quan hệ học hiện tại.
- `EnrollmentClass` giữ lịch sử lớp của Enrollment; không rút gọn thành một `Enrollment.classId` duy nhất.
- `Attendance` phải FK tới `EnrollmentClass` và `ClassSession`.
- `Attendance` phải có unique tương đương `@@unique([enrollmentClassId, classSessionId])`.
- Không duplicate session date/time vào Attendance.
- MessageDelivery/Outbox phải giữ idempotency/unique constraint theo data model đã chốt.
- Thêm index cho FK và filter/query quan trọng theo use-case thực tế.

## Khi spec chưa đủ

Nếu user/task yêu cầu model/field/relation không có trong docs hoặc mâu thuẫn docs:
- không tự thêm;
- ghi vấn đề vào `OPEN_QUESTIONS.md` nếu material;
- nêu impact và phương án;
- hỏi user trước khi đổi architecture/data relationship.

## Sau khi sửa

Chạy tối thiểu:

```bash
npx prisma format
npx prisma validate
```

Nếu có DB/migration environment:
- tạo/review migration;
- kiểm tra destructive change;
- cập nhật phase, `CHANGELOG.md`, data-model docs/ADR nếu quyết định được duyệt.
