# Project Changelog

## 2026-09-18 — Phase 1: Database Schema Complete

- Implement toàn bộ cấu trúc Schema theo `data-model-core.md` và `data-model-zalo-care.md`.
- Khai báo 22 Model hoàn chỉnh (Auth, Learning, Attendance, Care/Automation, v.v.).
- Ràng buộc cấu trúc theo đúng nghiệp vụ (Ví dụ: `@@unique([enrollment_class_id, class_session_id])` cho `Attendance`).
- Khởi tạo script seed (`seed.ts`) để tạo `ADMIN` mặc định.
- Vượt qua `npx prisma validate` thành công.

## 2026-09-18 — Phase 0: Foundation & Bootstrap Complete

- Khởi tạo thư mục và cấu trúc project chuẩn theo kiến trúc Modular Monolith (Backend) và Feature-first (Frontend).
- Tách biệt cấu hình môi trường `.env` thành 3 phần rõ ràng: Root (cho Docker infra), Backend và Frontend.
- Thiết lập Backend: Node.js, Express, TypeScript, Zod environment validation, Prisma client, Central Error Handler.
- Thiết lập Frontend: React (Vite), Tailwind CSS, React Router, cấu hình Design Token (tokens.css, globals.css).
- Khởi tạo file Docker Compose cho MySQL và Redis.
- Khởi tạo OpenAPI contract tại `docs/api/openapi.yaml` với `/health` endpoint.

## 2026-09-18 — Documentation baseline

- Chuẩn hóa tài liệu để AI coding agent làm theo phase.
- Thêm project structure, UI design system, frontend architecture, API conventions, testing quality gate.
- Thêm phase execution protocol, status tracking, open-question workflow và prompt mẫu.
- Thêm project-local frontend skill.

## 2026-09-18 — API contract layer

- Thêm `docs/api/` với OpenAPI contract và tài liệu theo module.
- Chuyển workflow API sang contract-first: docs → backend/test → frontend.
- Cập nhật Agent rules, project structure và các phase để bắt buộc đồng bộ API docs.

## 2026-09-18 — Structure review merge

- Review bộ `quan-ly-hoc-vien-docs` tham khảo và chỉ lấy các phần phù hợp với architecture hiện tại.
- Thêm `.antigravityrules` làm entrypoint ngắn cho Antigravity; giữ `Agent.md` là source of truth đầy đủ.
- Thêm `docs/product/business-rules.md` làm registry tập trung cho rule CHỐT/CHƯA CHỐT.
- Thêm `docs/architecture/code-conventions.md` cho naming, validation, transaction, error/logging, dependency/Git conventions.
- Thêm ADR `docs/decisions/001-tech-stack.md`.
- Thêm project-local skills `prisma-schema-guard` và `api-module-scaffold`, đã adapt sang TypeScript + Modular Monolith feature-first + OpenAPI contract-first.
- Không nhập cấu trúc layer-first/JavaScript từ bộ tham khảo vì mâu thuẫn decision hiện tại.

## 2026-09-18 — Docs cleanup

- Tổ chức lại `docs/` theo nhóm `product/`, `architecture/`, `ui/`, `api/`, `delivery/`, `phases/`, `decisions/`, `templates/`, `data/` để giảm file rải ở root.
- Bỏ `CLAUDE.md`; `Agent.md` + `.antigravityrules` là entrypoint cho AI coding trong project này.
- Gộp checklist chuẩn bị và pre-code vào `docs/delivery/checklists.md`.
