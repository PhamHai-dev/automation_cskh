# 19. Code Conventions

## 1. Backend architecture

Backend giữ cấu trúc feature-first theo `architecture/project-structure.md`.
Mỗi module dùng flow:

```text
Route → Controller → Service → Repository → Prisma
```

- Route: khai báo endpoint + middleware + validator.
- Controller: parse context HTTP, gọi service, trả response; không chứa business logic dài.
- Service: business rule, orchestration, transaction boundary.
- Repository: query/persistence Prisma; không chứa permission/business orchestration.
- Worker/job: gọi service/use-case phù hợp, không gọi controller.

## 2. Naming

- File TypeScript: `kebab-case`, có suffix rõ khi cần: `student.service.ts`, `attendance.repository.ts`.
- Variable/function: `camelCase`.
- Type/interface/class: `PascalCase`.
- Constant: `UPPER_SNAKE_CASE` khi là constant global thực sự.
- API JSON field: `camelCase` trừ khi contract đã chốt khác.
- Database physical field/table có thể dùng `snake_case` qua Prisma `@map`/`@@map` nếu đã chốt convention; không tự đổi tên giữa phase.

## 3. Validation

- Validate input ở API boundary bằng schema library đã chốt trong Phase 0 (ưu tiên Zod nếu không có quyết định khác).
- Service vẫn phải validate business invariant; boundary validation không thay thế business rule.
- Excel/import là untrusted input: luôn parse → preview → validate → confirm → commit.

## 4. API

Source of truth:
- `api/conventions.md`
- `api/openapi.yaml`
- `api/<module>.md`

Không tạo endpoint mới mà không cập nhật contract.
Không để frontend tự suy đoán field/response chưa có trong contract.

## 5. Error handling

- Dùng error classes/code thống nhất trong `backend/src/shared/errors/`.
- Không throw raw Prisma/database error ra response production.
- Không trả stack trace cho client production.
- Log correlation/context đủ để điều tra nhưng không log secret/token/session plaintext.

## 6. Transaction

Dùng transaction khi một business action cần nhiều write mà partial success là không an toàn, ví dụ:
- chuyển lớp + đóng/mở `EnrollmentClass`;
- attendance + audit + delivery/outbox;
- import commit nhiều record có invariant chung.

Không kéo network call/Zalo call vào trong DB transaction dài.

## 7. Repository

Repository nên expose operation theo domain/persistence intent, ví dụ:
- `findByIdInScope(...)`
- `findActiveEnrollmentClass(...)`
- `createAttendance(...)`

Tránh repository “god object” hoặc expose Prisma client tràn ra controller.

## 8. Frontend

- Feature-specific code ở `src/features/<feature>`.
- UI primitive ở `components/ui`.
- Product-shared component ở `components/common`.
- Không hardcode màu/spacing/radius nếu design token đã có.
- API call không đặt trực tiếp trong page component khi project đã có feature/service layer.
- Role-based UI chỉ cải thiện UX; không phải security boundary.

## 9. Test location

- Unit gần module nếu dễ maintain: `__tests__/` hoặc convention được chốt Phase 0.
- Integration/E2E ở `backend/tests`/`frontend/tests` theo `architecture/testing-quality.md`.
- Bug quan trọng đã fix nên có regression test khi hợp lý.

## 10. Git/commit

Khuyến nghị Conventional Commits:

```text
feat(attendance): add bulk attendance endpoint
fix(auth): revoke disabled user refresh sessions
docs(api): update attendance contract
test(import): add duplicate row fixture
```

Không gộp refactor unrelated lớn vào cùng task/phase nếu không cần.

## 11. Dependency

- Không thêm dependency chỉ vì tiện nếu codebase hiện tại đã có giải pháp tương đương.
- Dependency mới ảnh hưởng architecture/security/bundle/infra phải nêu lý do trước.
- Pin version hợp lý cho integration rủi ro như `zca-js`.

## 12. Secret/logging

- Secret chỉ từ env/secret manager; duy trì `.env.example` không chứa secret thật.
- Không log password, refresh token, Zalo session/cookie/token plaintext.
- Dữ liệu cá nhân trong log phải tối thiểu hóa.
