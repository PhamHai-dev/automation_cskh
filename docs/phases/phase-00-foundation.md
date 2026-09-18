# Phase 0 — Foundation & Project Bootstrap

- Status: DONE
- Started at: 2026-09-18
- Completed at: 2026-09-18
- Dependencies: none
- Open questions: Q-006 (brand color) không block backend bootstrap; chỉ block việc chốt visual branding cuối cùng.

## Mục tiêu

Tạo nền tảng kỹ thuật ổn định để các phase sau không phải đổi cấu trúc project giữa chừng.

## Checklist chi tiết

### 0.1 Repository/project structure

- [x] Xác nhận `.antigravityrules` → `Agent.md` → docs index hoạt động như entrypoint cho AI.
- [x] Xác nhận project-local skills có sẵn: `product-frontend`, `prisma-schema-guard`, `api-module-scaffold`.
- [x] Tạo `backend/` và `frontend/` theo `docs/architecture/project-structure.md`.
- [x] Tạo các file `.env.example` riêng biệt (root, backend, frontend).
- [x] Tạo `.gitignore`.
- [x] Tạo scripts chuẩn cho dev/build/lint/typecheck/test.

### 0.2 Backend bootstrap

- [x] Node.js + Express + TypeScript.
- [x] `app.ts` tách `server.ts` để test dễ.
- [x] Central error handler.
- [x] Request validation foundation.
- [x] Config/env loader có validation.
- [x] Health endpoint, ví dụ `/health`.
- [x] Prisma client wrapper.
- [x] Redis connection foundation.
- [x] Logger foundation.

### 0.3 Infrastructure local

- [x] `docker-compose.yml` cho MySQL 8.x + Redis.
- [x] Volume persistence local.
- [x] Healthcheck container nếu phù hợp.
- [x] Không hardcode password production.

### 0.4 Frontend bootstrap

- [x] React + Vite + TypeScript + Tailwind.
- [x] Router foundation.
- [x] App providers.
- [x] `AppLayout` skeleton.
- [x] `PageContainer`, `PageHeader` skeleton.
- [x] Design-token file.
- [x] Base Button/Input/Card/Badge component skeleton nếu cần để chốt pattern.
- [x] Asset folders theo `architecture/project-structure.md`.

### 0.5 UI foundation

- [x] Implement semantic token names từ `ui/design-system.md`.
- [x] Nếu brand color chưa chốt: dùng màu tạm có comment/documentation; không biến nó thành hardcoded màu rải rác.
- [x] Responsive shell hoạt động desktop/tablet/mobile ở mức scaffold.

### 0.6 Deliverables

- [x] Project chạy local.
- [x] Frontend build được.
- [x] Backend build được.
- [x] MySQL + Redis chạy local.
- [x] Backend kết nối được MySQL/Redis hoặc có health readiness tương ứng.
- [x] Cấu trúc folder đúng docs.

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

- [x] AI entrypoint/rules/skills đúng spec.
- [x] Repo structure đúng spec.
- [x] Không có secret hardcoded.
- [x] Các file `.env.example` đủ biến nền tảng.
- [x] Docker local hoạt động.
- [x] Frontend/backend build pass.
- [x] STATUS/CHANGELOG được cập nhật.

- [x] API contract/docs liên quan đã đồng bộ với implementation.

## Implementation notes

## Changes from original plan
