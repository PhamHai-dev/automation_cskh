# Phase 6 — CareLog / CareTask + Dashboard

- Status: NOT_STARTED
- Started at:
- Completed at:
- Dependencies: Phase 5 DONE
- Open questions: none mandatory nếu outcome/status đã chốt trong spec; nếu dữ liệu Sheet 1 khác thì phải hỏi.

## Mục tiêu

Đưa nghiệp vụ chăm sóc Sheet 1 và dashboard vào web, dựa trên dữ liệu chuẩn hóa thay vì spreadsheet formulas.

## Checklist chi tiết

### 6.1 CareLog

- [ ] log chăm sóc theo Enrollment
- [ ] after_session_number
- [ ] outcome
- [ ] note
- [ ] created_by/cs
- [ ] lịch sử không bị ghi đè

### 6.2 CareTask

- [ ] lịch hẹn gọi
- [ ] điểm nóng/priority
- [ ] due_at
- [ ] status
- [ ] assigned_to
- [ ] complete/cancel

### 6.3 Dashboard

- [ ] số lượng enrollment theo status
- [ ] attendance summary
- [ ] care outcomes
- [ ] overdue/upcoming care tasks
- [ ] filter theo CS/nhóm/GV/lớp/package/level/thời gian theo spec

  Dashboard phải query source-of-truth; không nhập số tổng bằng tay.

### 6.4 Frontend

- [ ] Care timeline/log.
- [ ] Task list/calendar tối thiểu theo UX đã chốt.
- [ ] KPI cards dùng component chung.
- [ ] Table/chart responsive.
- [ ] FilterBar dùng chung.

### 6.5 Permission

- [ ] CS own scope.
- [ ] Manage team scope.
- [ ] Admin all.
- [ ] Teacher chỉ dữ liệu được phép theo spec; không tự cho xem CS internal notes nếu docs không cho phép.


## API contract

Cập nhật trước implementation:

- `docs/api/care.md`
- `docs/api/dashboard.md`
- `docs/api/openapi.yaml`

Dashboard endpoint phải mô tả filter + data scope; CareTask/CareLog write phải mô tả permission rõ.

## Test plan

- care CRUD authorization
- task due/status
- dashboard aggregate với fixture data
- filter correctness
- permission regression

## Exit criteria

- [ ] Sheet 1 care workflow dùng được.
- [ ] Dashboard không dựa vào aggregate nhập tay.
- [ ] Scope filter đúng.
- [ ] Responsive UI pass.

- [ ] API contract/docs liên quan đã đồng bộ với implementation.

## Implementation notes

## Changes from original plan
