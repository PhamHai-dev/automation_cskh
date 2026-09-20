# Phase 6 — CareLog / CareTask + Dashboard

- Status: COMPLETED
- Started at: 2026-09-20
- Completed at: 2026-09-20
- Dependencies: Phase 5 DONE
- Open questions: none mandatory nếu outcome/status đã chốt trong spec; nếu dữ liệu Sheet 1 khác thì phải hỏi.

## Mục tiêu

Đưa nghiệp vụ chăm sóc Sheet 1 và dashboard vào web, dựa trên dữ liệu chuẩn hóa thay vì spreadsheet formulas.

## Checklist chi tiết

### 6.1 CareLog

- [x] log chăm sóc theo Enrollment
- [x] after_session_number
- [x] outcome
- [x] content / note
- [x] created_by/cs
- [x] lịch sử không bị ghi đè

### 6.2 CareTask

- [x] lịch hẹn gọi
- [x] điểm nóng/priority
- [x] due_at
- [x] status
- [x] assigned_to
- [x] complete/cancel

### 6.3 Dashboard

- [x] số lượng enrollment theo status
- [x] attendance summary
- [x] care outcomes
- [x] overdue/upcoming care tasks
- [x] filter theo CS/nhóm/GV/lớp/package/level/thời gian theo spec

  Dashboard phải query source-of-truth; không nhập số tổng bằng tay.

### 6.4 Frontend

- [x] Care timeline/log (`CareLogTimeline.tsx`).
- [x] Task list tối thiểu theo UX đã chốt (`CareTaskList.tsx`, `CareTaskModal.tsx`).
- [x] KPI cards dùng component chung (`StatCard.tsx`).
- [x] Table/chart responsive (`CarePivotTable.tsx`, `AttendanceChart.tsx`, `TasksOverviewWidget.tsx`).
- [x] FilterBar dùng chung (`DashboardPage.tsx`, `CarePage.tsx`).

### 6.5 Permission

- [x] CS own scope.
- [x] Manage team scope.
- [x] Admin all.
- [x] Teacher chỉ dữ liệu được phép theo spec; không tự cho xem CS internal notes nếu docs không cho phép.


## API contract

Cập nhật trước implementation:

- `docs/api/care.md`
- `docs/api/dashboard.md`
- `docs/api/openapi.yaml`

Dashboard endpoint phải mô tả filter + data scope; CareTask/CareLog write phải mô tả permission rõ.

## Test plan

- [x] care CRUD authorization (pass 100%)
- [x] task due/status (pass 100%)
- [x] dashboard aggregate với fixture data (pass 100%)
- [x] filter correctness (pass 100%)
- [x] permission regression (pass 100%)

## Exit criteria

- [x] Sheet 1 care workflow dùng được.
- [x] Dashboard không dựa vào aggregate nhập tay.
- [x] Scope filter đúng.
- [x] Responsive UI pass.
- [x] API contract/docs liên quan đã đồng bộ với implementation.

## Implementation notes

1. Module `care`:
   - Ghi nhật ký chăm sóc theo từng enrollment (`POST /api/v1/enrollments/:id/care-logs`), lưu lịch sử liên tục không ghi đè.
   - Quản lý nhiệm vụ hẹn gọi lại (`CALLBACK`), điểm nóng (`HOT_ISSUE`), theo dõi (`FOLLOW_UP`) qua `/api/v1/care-tasks`.
   - Phân quyền theo scope: CS chỉ quản lý task của mình, Manage xem nhóm CS, Admin toàn quyền; Teacher cấm truy cập ghi chú nội bộ.
2. Module `dashboard`:
   - Truy vấn source-of-truth bằng Prisma aggregations: `COUNT(DISTINCT student_id)`, thống kê tỷ lệ % từng trạng thái enrollment.
   - Thống kê chuyên cần và lý do nghỉ học.
   - Ma trận Pivot Care: Mốc buổi học (`after_session_number`) × Kết quả chăm sóc (`outcome`).
   - Tổng quan nhiệm vụ: Quá hạn, đến hạn hôm nay, hạn trong tuần, khẩn cấp/điểm nóng.
3. Frontend:
   - Trang `CarePage`: 2 tabs (Nhiệm vụ CS + Lịch sử nhật ký Care Timeline).
   - Trang `DashboardPage`: KPI cards, thanh phân bổ chuyên cần, ma trận Pivot Care và tổng quan nhiệm vụ.
   - Đã kiểm tra build production hoàn tất không lỗi (`tsc -b && vite build` exit code 0).
