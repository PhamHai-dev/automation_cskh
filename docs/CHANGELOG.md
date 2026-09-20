# Project Changelog

## 2026-09-20 — Web & Docs: Đồng bộ Route Tiếng Anh Chuẩn & Toàn diện Giao diện Tiếng Việt

- **Chuẩn hóa URL Routing Tiếng Anh (Chỉ đường dẫn URL là tiếng Anh):**
  - Chuyển đổi toàn bộ route chính thức sang định dạng tiếng Anh chuẩn mực (RESTful / kebab-case):
    - `/login`: Đăng nhập hệ thống (hỗ trợ alias redirect từ `/dang-nhap`)
    - `/dashboard`: Báo cáo tổng quan & thống kê (hỗ trợ alias redirect từ `/tong-quan`)
    - `/care`: Chăm sóc học viên & Nhiệm vụ CS (hỗ trợ alias redirect từ `/cham-soc`)
    - `/enrollments`: Quản lý hợp đồng & ghi danh (hỗ trợ alias redirect từ `/ghi-danh`)
    - `/classes`: Quản lý danh sách lớp học (hỗ trợ alias redirect từ `/lop-hoc`)
    - `/classes/:classId/sessions`: Danh sách buổi học (hỗ trợ alias redirect từ `/lop-hoc/:classId/buoi-hoc`)
    - `/classes/:classId/sessions/:sessionId/attendance`: Phiếu điểm danh (hỗ trợ alias redirect từ `/lop-hoc/.../diem-danh`)
    - `/students`: Quản lý học viên & phụ huynh (hỗ trợ alias redirect từ `/hoc-vien`)
    - `/packages`: Quản lý gói học (hỗ trợ alias redirect từ `/goi-hoc`)
    - `/teachers`: Quản lý giáo viên (hỗ trợ alias redirect từ `/giao-vien`)
    - `/imports`: Nhập & xuất dữ liệu Excel (hỗ trợ alias redirect từ `/nhap-xuat-excel`)
    - `/settings/users`: Quản lý người dùng & phân quyền (hỗ trợ alias redirect từ `/cai-dat/nguoi-dung`)
  - Duy trì các alias redirect từ route tiếng Việt cũ để tránh lỗi liên kết bookmark.
- **Việt hóa Toàn diện Giao diện Web:**
  - `LoginPage`: Tiêu đề, nhãn email/mật khẩu, nút đăng nhập và thông báo lỗi tiếng Việt.
  - `UsersPage`: Tiêu đề "Quản lý Người dùng & Phân quyền", tiêu đề cột, badge vai trò tiếng Việt (`Quản trị viên`, `Quản lý nhóm`, `Nhân viên CSKH`, `Giáo viên`), trạng thái và các modal thao tác.
  - `PackagesPage`: Việt hóa toàn bộ bảng danh mục gói học, số buổi định mức, trạng thái và modal thêm/sửa gói.
  - `TeachersPage`: Việt hóa bảng giáo viên, phân loại giảng viên (`Giáo viên Việt`, `Giáo viên Bản ngữ`), trạng thái và form thông tin.
  - `StudentsPage`: Việt hóa bảng học viên, giới tính, thông tin liên lạc, mã định danh và modal thêm/sửa học viên.
  - `ClassesPage`: Việt hóa bảng lớp học, hình thức đào tạo (`1 kèm 1`, `Lớp nhóm`), nguồn điểm danh và modal tạo lớp.
  - `ClassSessionsPage`: Việt hóa danh sách buổi học, trạng thái (`Đã lên lịch`, `Đã hoàn thành`, `Đã hủy`) và điều hướng điểm danh.
  - `AttendanceSheetPage`: Việt hóa phiếu điểm danh buổi học, nút đánh dấu có mặt, lưu điểm danh.
  - `EnrollmentsPage`: Việt hóa bảng ghi danh, trạng thái học tập (`Chưa học`, `Đang học`, `Tạm dừng / Bảo lưu`, `Hoàn thành`, `Đã hủy`).
  - `DataTable`: Thông báo rỗng "Không có dữ liệu hiển thị".
  - `ProtectedRoute`: Thông báo "Đang tải phiên đăng nhập...".
- **Cập nhật Tài liệu Dự án:**
  - `docs/architecture/frontend.md`: Bổ sung quy định chuẩn hóa URL route tiếng Việt.
  - `docs/ui/design-system.md`: Bổ sung mục 15 — Quy ước Ngôn ngữ & Thuật ngữ Tiếng Việt (UI Glossary & Localization) ánh xạ đầy đủ Role, Status, Action.
- **Xác minh Kỹ thuật:**
  - Frontend production build thành công 100% không lỗi (`tsc -b && vite build`).

## 2026-09-20 — Phase 6: CareLog / CareTask + Dashboard Complete

- **API Contract:** Đồng bộ đầy đủ `docs/api/care.md`, `docs/api/dashboard.md` và `docs/api/openapi.yaml` cho các endpoint CareLog, CareTask và Dashboard (Summary, Attendance, Care Pivot, Tasks Overview).
- **Backend Module Care (`backend/src/modules/care/`):**
  - Quản lý nhật ký chăm sóc `CareLog` theo Enrollment, mốc buổi (`after_session_number`), kết quả (`outcome`), ghi chú (`content`); lưu lịch sử liên tục, không bị ghi đè.
  - Quản lý nhiệm vụ chăm sóc `CareTask`: hẹn gọi lại (`CALLBACK`), điểm nóng/khiếu nại (`HOT_ISSUE`), theo dõi (`FOLLOW_UP`), mức độ ưu tiên (`URGENT`, `HIGH`, `NORMAL`, `LOW`), hạn hoàn thành (`due_at`), trạng thái (`PENDING`, `DONE`, `CANCELLED`).
  - Phân quyền theo data scope: `ADMIN` toàn hệ thống, `MANAGE` trong nhóm CS được gán, `CS` chỉ xem học viên & task của mình; `TEACHER` không được xem ghi chú nội bộ CS.
- **Backend Module Dashboard (`backend/src/modules/dashboard/`):**
  - Truy vấn số liệu source-of-truth trực tiếp từ database bằng Prisma aggregations (`COUNT(DISTINCT student_id)`, group by enrollment status, attendance breakdown).
  - Ma trận Pivot Care: Thống kê số lượng theo Mốc buổi học × Kết quả phản hồi chăm sóc.
  - Tổng quan nhiệm vụ: Đếm số lượng task quá hạn (overdue), đến hạn hôm nay, trong tuần, khẩn cấp/điểm nóng.
  - Hỗ trợ bộ lọc linh hoạt: CS phụ trách, gói học, lớp học, khoảng thời gian.
- **Kiểm thử tự động Backend:**
  - Viết đầy đủ Integration Tests cho module `care` (10 tests) và `dashboard` (6 tests).
  - Vượt qua 100% test suite backend: **50/50 tests passed**.
- **Frontend Features (`frontend/src/features/care/` & `frontend/src/features/dashboard/`):**
  - `CarePage`: Gồm 2 tabs trực quan: Nhiệm vụ CS (Care Tasks) và Lịch sử Chăm sóc (Care Logs Timeline).
  - `CareLogTimeline`: Hiển thị tiến trình phản hồi qua các mốc buổi học với badge outcome chuẩn màu semantic, modal thêm nhật ký phản hồi nhanh.
  - `CareTaskList` & `CareTaskModal`: Danh sách nhiệm vụ với bộ lọc thông minh (quá hạn, hôm nay, mức ưu tiên) và thao tác nhanh (Hoàn thành, Hủy, Sửa).
  - `DashboardPage`: Tổng hợp các KPI StatCard, biểu đồ chuyên cần `AttendanceChart`, ma trận `CarePivotTable` và widget `TasksOverviewWidget`.
  - Tích hợp điều hướng trên Trang chủ và Router `App.tsx`.
  - Build production frontend thành công 100% không lỗi (`tsc -b && vite build`).

## 2026-09-20 — Phase 5: Excel Import/Export Sheet 1 + Sheet 3 Complete

- **Database:** Bổ sung trường `external_id String? @unique` vào model `Student` trong Prisma schema theo quyết định Q-001 để ánh xạ chính xác định danh bất biến giữa Sheet 1, Sheet 3 và Database.
- **Contract-First API:** Cập nhật `docs/api/openapi.yaml` và `docs/api/imports.md` cho toàn bộ các endpoint của `/api/v1/imports` (upload, preview, mapping, validate, confirm, errors, batches, templates, exports).
- **Backend Module (`backend/src/modules/imports/`):**
  - Tích hợp `exceljs` và `multer` cho quy trình xử lý file Excel an toàn.
  - Xây dựng thuật toán nhận diện tự động cột (auto-mapping) cho Sheet `1.Chăm sóc` và Sheet `3.Chấm buổi`.
  - Bộ kiểm tra (validation engine) phát hiện trùng lặp ID, sai format ngày/giờ, số buổi không hợp lệ, mã điểm danh bất thường, không silent-fix.
  - Chiến lược thực thi theo lô (batch-safe) cách ly từng dòng: dòng hợp lệ được import vào DB, dòng lỗi ghi nhận vào `ImportRow` trạng thái `FAILED`.
  - Hỗ trợ tải báo cáo lỗi Excel chi tiết (`GET /api/v1/imports/:importId/errors?download=true`), tải template mẫu và xuất dữ liệu đối soát học viên/điểm danh.
  - Phân quyền: Chỉ `ADMIN` và `MANAGE` được upload/import (theo Q-004); `CS` chỉ xem/tải template.
  - Ghi nhận `AuditLog` cho mọi đợt import thực hiện.
  - Bộ integration test 14/14 tests passed (100% pass toàn bộ 34 tests trong hệ thống).
- **Frontend Feature (`frontend/src/features/imports/`):**
  - Wizard 4 bước trực quan: Chọn loại & Upload file -> Xem trước & Ánh xạ cột -> Báo cáo kiểm tra -> Kết quả & Tải lỗi.
  - Bảng lịch sử các đợt import (`ImportHistoryTable`) hiển thị trạng thái, số dòng thành công/thất bại và tải log lỗi.
  - Tính năng xuất dữ liệu đối soát trực tiếp trên giao diện.
  - Tuân thủ design token, responsive desktop/tablet/mobile, build thành công bundle production.

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
