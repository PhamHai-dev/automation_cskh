# API Contract Index

Thư mục này là **hợp đồng API chính thức** giữa frontend và backend.

## 1. Source of truth

- `openapi.yaml`: contract máy đọc được, là nguồn chính cho method/path/request/response/status code.
- Các file `*.md`: giải thích business rule, role/data scope, filter, edge case và endpoint **dự kiến** theo module. Một endpoint chỉ được xem là contract đã chốt khi đã có trong `openapi.yaml` hoặc được phase hiện tại cập nhật/chốt trước implementation.
- `conventions.md`: quy ước chung về format response, error, pagination, versioning và validation.

Nếu code và API docs mâu thuẫn, không tự sửa một bên. Phải cập nhật contract trước hoặc báo user nếu thay đổi ảnh hưởng nghiệp vụ/kiến trúc.

## 2. Contract-first workflow

Với endpoint mới hoặc thay đổi endpoint:

1. Đọc docs domain và phase hiện tại.
2. Cập nhật `openapi.yaml` và file module tương ứng.
3. Nếu thay đổi contract ảnh hưởng frontend/permission/business rule, báo rõ tác động.
4. Implement backend.
5. Viết/ cập nhật integration test API.
6. Implement frontend theo đúng contract, không tự suy đoán response.
7. Chạy test + typecheck + lint + build.
8. Kết thúc phase phải cập nhật API docs nếu implementation thực tế khác plan đã duyệt.

## 3. Module API docs

- `auth.md` — login/session/current user.
- `users.md` — Admin Settings/User Management.
- `cs-groups.md` — nhóm CS, member, Manage assignment.
- `students.md` — hồ sơ con người.
- `enrollments.md` — lần/gói đăng ký học, CS assignment, class history.
- `packages.md` — gói học.
- `teachers.md` — TeacherProfile và dữ liệu GV phục vụ lớp.
- `classes.md` — class, teacher assignment, schedule, EnrollmentClass.
- `attendance.md` — ClassSession + Attendance.
- `care.md` — CareLog + CareTask.
- `imports.md` — upload/preview/map/validate/confirm/import/export.
- `dashboard.md` — aggregate/filter theo scope.
- `zalo.md` — Zalo account/rule/delivery; chỉ production sau spike.

## 4. Prefix

API business dùng `/api/v1`.

Health/readiness có thể nằm ngoài versioned API, ví dụ `/health`, nếu phase 0 chốt như vậy.

## 5. Bắt buộc với mỗi endpoint

Mỗi endpoint phải xác định rõ:

- HTTP method + path.
- role/permission.
- data scope.
- request params/query/body.
- validation.
- response schema.
- error code/status.
- pagination/filter/sort nếu có.
- idempotency/transaction/audit nếu có write nhạy cảm.
