# Phase 0 — Foundation & Project Bootstrap

- Status: NOT_STARTED
- Started at:
- Completed at:
- Dependencies: none
- Open questions: Q-006 (brand color) không block backend bootstrap; chỉ block việc chốt visual branding cuối cùng.

## Mục tiêu

Tạo nền tảng kỹ thuật ổn định để các phase sau không phải đổi cấu trúc project giữa chừng.

## Checklist chi tiết

### 0.1 Repository/project structure

- [ ] Xác nhận `.antigravityrules` → `Agent.md` → docs index hoạt động như entrypoint cho AI.
- [ ] Xác nhận project-local skills có sẵn: `product-frontend`, `prisma-schema-guard`, `api-module-scaffold`.
- [ ] Tạo `backend/` và `frontend/` theo `docs/architecture/project-structure.md`.
- [ ] Tạo `.env.example`.
- [ ] Tạo `.gitignore`.
- [ ] Tạo scripts chuẩn cho dev/build/lint/typecheck/test.

### 0.2 Backend bootstrap

- [ ] Node.js + Express + TypeScript.
- [ ] `app.ts` tách `server.ts` để test dễ.
- [ ] Central error handler.
- [ ] Request validation foundation.
- [ ] Config/env loader có validation.
- [ ] Health endpoint, ví dụ `/health`.
- [ ] Prisma client wrapper.
- [ ] Redis connection foundation.
- [ ] Logger foundation.

### 0.3 Infrastructure local

- [ ] `docker-compose.yml` cho MySQL 8.x + Redis.
- [ ] Volume persistence local.
- [ ] Healthcheck container nếu phù hợp.
- [ ] Không hardcode password production.

### 0.4 Frontend bootstrap

- [ ] React + Vite + TypeScript + Tailwind.
- [ ] Router foundation.
- [ ] App providers.
- [ ] `AppLayout` skeleton.
- [ ] `PageContainer`, `PageHeader` skeleton.
- [ ] Design-token file.
- [ ] Base Button/Input/Card/Badge component skeleton nếu cần để chốt pattern.
- [ ] Asset folders theo `architecture/project-structure.md`.

### 0.5 UI foundation

- [ ] Implement semantic token names từ `ui/design-system.md`.
- [ ] Nếu brand color chưa chốt: dùng màu tạm có comment/documentation; không biến nó thành hardcoded màu rải rác.
- [ ] Responsive shell hoạt động desktop/tablet/mobile ở mức scaffold.

### 0.6 Deliverables

- [ ] Project chạy local.
- [ ] Frontend build được.
- [ ] Backend build được.
- [ ] MySQL + Redis chạy local.
- [ ] Backend kết nối được MySQL/Redis hoặc có health readiness tương ứng.
- [ ] Cấu trúc folder đúng docs.

## Không làm trong phase này

- Không tạo full DB nghiệp vụ.
- Không làm login business flow hoàn chỉnh.
- Không CRUD Student.
- Không import Excel.
- Không Zalo.


## API contract

- Khởi tạo/kiểm tra `docs/api/openapi.yaml` và conventions.
- Health endpoint `/health` phải được ghi rõ là endpoint infrastructure ngoài `/api/v1` nếu implementation theo hướng đó.
- Chưa tạo business endpoint ngoài scope Phase 0.

## Test plan

- Backend typecheck/lint/build.
- Frontend typecheck/lint/build.
- Start MySQL/Redis local.
- Health endpoint PASS.
- Frontend route root PASS.
- Smoke responsive app shell.

## Exit criteria

- [ ] AI entrypoint/rules/skills đúng spec.
- [ ] Repo structure đúng spec.
- [ ] Không có secret hardcoded.
- [ ] `.env.example` đủ biến nền tảng.
- [ ] Docker local hoạt động.
- [ ] Frontend/backend build pass.
- [ ] STATUS/CHANGELOG được cập nhật.

- [ ] API contract/docs liên quan đã đồng bộ với implementation.

## Implementation notes

## Changes from original plan
