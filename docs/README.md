# Documentation Index — automation_cskh

`docs/` là nguồn sự thật của dự án. Giữ root của `docs/` tối giản; tài liệu được nhóm theo mục đích để AI/dev tìm đúng file nhanh hơn.

## Cấu trúc

```text
docs/
├── README.md
├── STATUS.md
├── CHANGELOG.md
├── GIT_WORKFLOW.md   # quy trình pull/push/merge chuẩn cho mọi branch
├── OPEN_QUESTIONS.md
├── product/        # scope, nghiệp vụ, role, business rule, module, backlog
├── architecture/   # system, data model, project structure, frontend, testing, code convention
├── ui/             # design system
├── api/            # OpenAPI + contract theo module + API convention
├── delivery/       # roadmap, checklist, phase protocol, prompt AI
├── phases/         # kế hoạch chi tiết Phase 0 → 9
├── decisions/      # quyết định tổng hợp + ADR
├── templates/      # report/issue/decision/test templates
└── data/           # file dữ liệu tham chiếu
```

## Thứ tự AI phải đọc

1. `../Agent.md`
2. `product/overview.md`
3. `decisions/summary.md`
4. `STATUS.md`
5. `OPEN_QUESTIONS.md`
6. phase hiện tại trong `phases/`
7. tài liệu nghiệp vụ/kỹ thuật liên quan đến task

Không cần đọc toàn bộ docs ở mọi task. Chỉ nạp thêm nhóm tài liệu liên quan để tránh context thừa.

## Nghiệp vụ

- `product/overview.md` — mục tiêu và phạm vi MVP.
- `product/auth-rbac.md` — auth, role, permission, data scope.
- `product/business-rules.md` — registry rule đã chốt/chưa chốt.
- `product/modules.md` — module nghiệp vụ.
- `product/data-flow.md` — các luồng dữ liệu chính.
- `product/backlog.md` — ngoài MVP, không tự triển khai.

Nếu business rule đang `CHƯA CHỐT` và task phụ thuộc nó, đối chiếu `OPEN_QUESTIONS.md`, hỏi user và dừng phần phụ thuộc.

## Kiến trúc & code

- `architecture/system.md` — stack và kiến trúc tổng thể.
- `architecture/data-model-core.md` — core database.
- `architecture/data-model-zalo-care.md` — care/Zalo/import/audit model.
- `architecture/project-structure.md` — cấu trúc repo/backend/frontend/docs.
- `architecture/frontend.md` — frontend feature-first.
- `architecture/code-conventions.md` — naming, validation, transaction, error/logging.
- `architecture/testing-quality.md` — test strategy và quality gate.
- `ui/design-system.md` — token, spacing, component, responsive và asset rules.

## API

- `api/openapi.yaml` — source of truth cho method/path/request/response/status code.
- `api/conventions.md` — response/error/pagination/filter/versioning conventions.
- `api/README.md` — index và contract-first workflow.
- `api/<module>.md` — role, data scope, edge case và ghi chú theo module.

Frontend không tự suy đoán API contract.

## Delivery & phase

- `delivery/roadmap.md` — roadmap tổng.
- `delivery/checklists.md` — chuẩn bị dữ liệu/nghiệp vụ + pre-code/production checklist.
- `delivery/phase-protocol.md` — quy trình bắt đầu, thực hiện, test, cập nhật và kết thúc phase.
- `delivery/ai-prompts.md` — prompt mẫu cho AI coding agent.
- `phases/phase-00-*` → `phase-09-*` — scope và exit criteria từng phase.

AI chỉ làm một phase tại một thời điểm. Sau phase phải test, cập nhật tracking và dừng chờ user review.

## Decisions & tracking

- `decisions/summary.md` — quyết định đã chốt.
- `decisions/*.md` — ADR cho quyết định lớn.
- `STATUS.md` — trạng thái phase hiện tại.
- `CHANGELOG.md` — thay đổi quan trọng theo phase/ngày.
- `OPEN_QUESTIONS.md` — câu hỏi AI không được tự đoán.
- `GIT_WORKFLOW.md` — quy trình pull/push/merge/rebase chuẩn cho mọi branch (đọc trước khi thao tác Git).

Khi tài liệu mâu thuẫn, ưu tiên quyết định mới nhất đã được user duyệt, sau đó domain spec, phase hiện tại và cuối cùng mới tới implementation. Nếu vẫn không rõ, hỏi user.

## Scope MVP

MVP chỉ tham chiếu nghiệp vụ từ Sheet `1.Chăm sóc` và Sheet `3.Chấm buổi`. File tham chiếu nằm tại `data/cham_soc_hoc_vien.xlsx`.
