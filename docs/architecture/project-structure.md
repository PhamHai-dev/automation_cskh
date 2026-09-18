# 11. Cấu trúc project chuẩn

## 1. Mục tiêu

Giữ codebase dễ mở rộng, dễ để AI/dev tìm đúng nơi sửa, tránh rải logic giữa nhiều thư mục không nhất quán.

## 2. Cấu trúc tổng thể

```text
automation_cskh/
├── .antigravityrules
├── Agent.md
├── README.md
├── .agents/
│   └── skills/
│       ├── product-frontend/
│       ├── prisma-schema-guard/
│       └── api-module-scaffold/
├── docs/
│   ├── README.md
│   ├── STATUS.md
│   ├── CHANGELOG.md
│   ├── OPEN_QUESTIONS.md
│   ├── product/
│   ├── architecture/
│   ├── ui/
│   ├── api/
│   ├── delivery/
│   ├── phases/
│   ├── decisions/
│   ├── templates/
│   └── data/
├── backend/
├── frontend/
├── docker-compose.yml
├── .env.example
└── .gitignore
```

`docs/` chỉ giữ các file tracking thường xuyên dùng ở root; tài liệu chi tiết phải nằm trong nhóm tương ứng. Không tạo thêm file spec rải trực tiếp ở `docs/` nếu đã có nhóm phù hợp.

## 3. Backend — Modular Monolith, feature-first

```text
backend/
├── .env.example
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── config/
│   │   ├── env.ts
│   │   ├── database.ts
│   │   └── redis.ts
│   ├── middlewares/
│   │   ├── auth.middleware.ts
│   │   ├── permission.middleware.ts
│   │   ├── validate.middleware.ts
│   │   └── error.middleware.ts
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── cs-groups/
│   │   ├── students/
│   │   ├── enrollments/
│   │   ├── packages/
│   │   ├── teachers/
│   │   ├── classes/
│   │   ├── attendance/
│   │   ├── care/
│   │   ├── imports/
│   │   ├── dashboard/
│   │   └── zalo/
│   ├── jobs/
│   │   ├── outbox/
│   │   ├── zalo/
│   │   └── imports/
│   ├── shared/
│   │   ├── errors/
│   │   ├── constants/
│   │   ├── utils/
│   │   ├── types/
│   │   └── logger/
│   └── prisma/
│       └── client.ts
└── tests/
    ├── integration/
    └── e2e/
```

### Cấu trúc một module

```text
modules/students/
├── student.routes.ts
├── student.controller.ts
├── student.service.ts
├── student.repository.ts
├── student.schema.ts
├── student.types.ts
├── student.mapper.ts      # chỉ khi cần
└── __tests__/
```

Luồng bắt buộc:

`Route → Controller → Service → Repository → Prisma`

## 4. Frontend — feature-first

```text
frontend/
├── .env.example
├── public/
│   ├── images/
│   │   ├── logos/
│   │   ├── backgrounds/
│   │   └── placeholders/
│   └── favicon.ico
├── src/
│   ├── app/
│   │   ├── router/
│   │   ├── providers/
│   │   └── guards/
│   ├── assets/
│   │   ├── images/
│   │   │   ├── empty-states/
│   │   │   └── ui/
│   │   └── svg/
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Select.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Table.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Badge.tsx
│   │   │   └── Pagination.tsx
│   │   └── common/
│   │       ├── PageContainer.tsx
│   │       ├── PageHeader.tsx
│   │       ├── FilterBar.tsx
│   │       ├── DataTable.tsx
│   │       ├── EmptyState.tsx
│   │       └── LoadingState.tsx
│   ├── features/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── students/
│   │   ├── enrollments/
│   │   ├── classes/
│   │   ├── attendance/
│   │   ├── care/
│   │   ├── imports/
│   │   └── dashboard/
│   ├── layouts/
│   │   ├── AppLayout.tsx
│   │   ├── Header.tsx
│   │   └── Sidebar.tsx
│   ├── hooks/
│   ├── lib/
│   ├── services/
│   ├── styles/
│   │   ├── globals.css
│   │   └── tokens.css
│   ├── types/
│   └── utils/
└── tests/
```

## 5. Quy tắc vị trí file

- Business page/component feature-specific đặt trong `features/<feature>`.
- Component UI primitive dùng lại nhiều nơi đặt trong `components/ui`.
- Component product-level dùng nhiều feature đặt trong `components/common`.
- Không tạo một `utils.ts` khổng lồ.
- Không đặt API call trực tiếp trong page nếu project đã có service/query layer.
- Không đặt ảnh trong page/component tùy tiện.


## 6. API documentation structure

`docs/api/` là contract layer giữa frontend/backend:

```text
docs/api/
├── README.md
├── openapi.yaml
├── auth.md
├── users.md
├── cs-groups.md
├── students.md
├── enrollments.md
├── packages.md
├── teachers.md
├── classes.md
├── attendance.md
├── care.md
├── imports.md
├── dashboard.md
└── zalo.md
```

Không tạo `backend/src/api/` chỉ để chứa toàn bộ API. Implementation vẫn nằm theo feature-first trong `backend/src/modules/*`; `docs/api/` chỉ là contract/documentation.


## 7. Project-local skills

```text
.agents/skills/
├── product-frontend/
├── prisma-schema-guard/
└── api-module-scaffold/
```

- `product-frontend`: giữ UI/design system/responsive nhất quán.
- `prisma-schema-guard`: bảo vệ data model, relation, index, unique constraint và migration.
- `api-module-scaffold`: contract-first + feature-first API module + permission/data scope/test.

`.antigravityrules` chỉ là entrypoint ngắn cho Antigravity; `Agent.md` vẫn là rule đầy đủ.
