# 16. Quy trình thực hiện phase cho AI

## 1. Trước phase

AI phải:

1. Đọc `Agent.md`.
2. Đọc `docs/STATUS.md`.
3. Đọc phase file tương ứng.
4. Đọc `docs/OPEN_QUESTIONS.md`.
5. Nếu phase có business logic, đọc `docs/product/business-rules.md`.
6. Đọc các spec liên quan.
7. Nếu task khớp project-local skill, đọc skill tương ứng trong `.agents/skills/`.
8. Xác nhận prerequisite đã đạt.
9. Tóm tắt scope và những gì cố tình không làm.

Nếu có câu hỏi ảnh hưởng schema/business/permission/API/UX chính, không code phần đó trước khi được xác nhận.

## 2. Khi bắt đầu phase

Cập nhật:

- phase status → `IN_PROGRESS`
- `Started at`
- `docs/STATUS.md`

Không đổi scope phase âm thầm.

## 3. Trong phase

- Làm từng deliverable.
- Chạy test nhỏ theo từng cụm thay đổi nếu hợp lý.
- Nếu phát sinh bug implementation thông thường, tự sửa.
- Nếu phát sinh decision mới, ghi `OPEN_QUESTIONS.md` và hỏi user.
- Nếu user duyệt thay đổi, cập nhật decision/spec trước hoặc cùng commit logic liên quan.

## 4. Khi thay đổi plan

Phân loại:

### Minor implementation adjustment
Không đổi hành vi/architecture. AI có thể tự xử lý và ghi implementation notes.

### Scope/task adjustment
Thêm/bớt task trong phase nhưng không đổi architecture. Cập nhật phase file, ghi lý do. Nếu tăng scope đáng kể phải hỏi user.

### Architecture/business decision
Bắt buộc xin xác nhận. Sau khi duyệt:

- cập nhật `docs/decisions/summary.md` hoặc ADR
- cập nhật phase
- cập nhật spec liên quan
- cập nhật `CHANGELOG.md`
- mới sửa code

## 5. Trước khi kết thúc phase

Chạy quality gate theo `docs/architecture/testing-quality.md`.

Không mark DONE khi:

- build fail do code phase
- test critical fail
- migration chưa validate
- blocker nghiệp vụ chưa giải quyết nhưng lại ảnh hưởng deliverable bắt buộc

## 6. Cập nhật bắt buộc sau phase

### File phase
Cập nhật:

- checklist task
- Implementation notes
- Changes from original plan
- Test result
- Open questions
- Exit criteria
- Status
- Completed at

### STATUS.md
Cập nhật phase hiện tại/hoàn tất và phase kế tiếp.

### CHANGELOG.md
Ghi thay đổi nổi bật theo ngày/phase.

### OPEN_QUESTIONS.md
Đóng câu hỏi đã được user xác nhận; thêm câu hỏi mới.

### Decision docs
Chỉ cập nhật khi đã được user duyệt.

## 7. Báo cáo cho user

Format tối thiểu:

```text
PHASE X — <tên>
Status: DONE | BLOCKED | PARTIAL

Đã làm:
- ...

Kiểm tra đã chạy:
- typecheck: PASS
- lint: PASS
- tests: PASS (...)
- build: PASS
- prisma validate: PASS/N/A

Thay đổi so với plan:
- Không có / ...

Vấn đề phát sinh:
- ...

Cần bạn xác nhận:
1. ...

Docs đã cập nhật:
- ...
```

Sau báo cáo phải dừng. Không tự chạy phase kế tiếp.


## API contract trong mỗi phase

Nếu phase có API:

1. Đọc `docs/api/conventions.md` + `docs/api/README.md`.
2. Cập nhật `docs/api/openapi.yaml` + file module API trước khi frontend phụ thuộc.
3. Implement backend theo contract.
4. Viết/chạy integration test.
5. Implement frontend theo contract.
6. Nếu cần đổi contract do phát hiện vấn đề, phân loại theo Agent.md: thay đổi nhỏ không ảnh hưởng nghiệp vụ có thể cập nhật trong phase; breaking/business/permission/UX change phải hỏi user.
7. Kết thúc phase phải xác nhận API docs và code đồng bộ.
