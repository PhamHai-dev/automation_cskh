---
name: api-module-scaffold
description: Tạo hoặc sửa backend API module cho automation_cskh theo Modular Monolith feature-first và contract-first. Dùng khi thêm endpoint/resource, route/controller/service/repository/schema/types hoặc thay đổi API contract; bắt buộc đồng bộ OpenAPI, permission, data scope, validation và integration test.
---

# API Module Scaffold

## Trước khi code

Đọc:
1. `Agent.md`
2. `docs/api/conventions.md`
3. `docs/api/README.md`
4. `docs/api/openapi.yaml`
5. `docs/api/<module>.md`
6. `docs/product/auth-rbac.md`
7. `docs/product/business-rules.md` nếu endpoint có business logic liên quan.
8. phase hiện tại + `OPEN_QUESTIONS.md`.

## Contract-first

Nếu endpoint mới/thay đổi:
1. Cập nhật `docs/api/openapi.yaml`.
2. Cập nhật `docs/api/<module>.md`.
3. Chỉ sau đó/cùng task mới implement backend và frontend phụ thuộc contract.

Không tự đổi path/request/response để code thuận tiện hơn.

## Cấu trúc module

Dùng:

```text
backend/src/modules/<module>/
├── <module>.routes.ts
├── <module>.controller.ts
├── <module>.service.ts
├── <module>.repository.ts
├── <module>.schema.ts
├── <module>.types.ts
├── <module>.mapper.ts      # nếu cần
└── __tests__/              # khi phù hợp
```

Flow:

```text
Route → Controller → Service → Repository → Prisma
```

## Middleware/bảo mật

Protected endpoint phải enforce:
1. Authentication.
2. Permission/role.
3. Data scope.
4. Request validation.
5. Business invariant trong service.

Không coi UI hide/show là security.

## Reliability

Endpoint tạo/sửa Attendance có thể kích hoạt automation:
- không gọi BullMQ trực tiếp sau DB write;
- dùng transaction + MessageDelivery + OutboxEvent theo architecture;
- giữ idempotency/unique constraint.

## Quality gate

Sau implementation:
- unit test business logic phù hợp;
- integration test API + permission + data scope;
- typecheck/lint/build;
- validate OpenAPI nếu contract đổi;
- cập nhật phase + STATUS + CHANGELOG + OPEN_QUESTIONS nếu cần;
- dừng chờ user review theo Agent.md.
