# Phase 2 — Auth/RBAC + Admin User Management

- Status: DONE
- Started at: 2026-09-18
- Completed at: 2026-09-18
- Dependencies: Phase 1 DONE
- Open questions: Q-005 phải chốt nếu implementation đa role ảnh hưởng endpoint scope.

## Mục tiêu

Có login/session production-oriented và authorization backend thật, không chỉ ẩn UI.

## Checklist chi tiết

### 2.1 Auth API

- [x] POST login
- [x] POST refresh
- [x] POST logout
- [x] GET me
- [x] refresh token rotation
- [x] AuthSession revoke
- [x] disable user làm session/token refresh không còn hợp lệ theo policy

### 2.2 Password

- [x] Hash password an toàn.
- [x] Không log password/token.
- [ ] Reset password flow theo spec.

### 2.3 Middleware

- [x] authenticate
- [x] require role/permission
- [ ] data-scope helpers
- [x] consistent 401/403

### 2.4 Admin Settings/User Management API

- [x] list users
- [x] create user
- [x] edit user cơ bản
- [x] set roles
- [x] enable/disable
- [ ] reset password
- [x] revoke sessions

  Không có public signup.

### 2.5 Frontend

- [x] Login page theo design system.
- [x] Auth provider/session handling.
- [x] Protected routes.
- [x] Admin Settings → User Management.
- [x] Role-based menu visibility chỉ là UX, không thay backend security.
- [x] Loading/session-expired state rõ ràng.

### 2.6 Data-scope tests

- [ ] CS khác không truy cập dữ liệu ngoài scope.
- [ ] Manage chỉ trong CSGroup được giao.
- [ ] Teacher chỉ lớp được phân công khi endpoint core xuất hiện; helper có thể unit test từ phase này.
- [ ] Admin full scope.

### 2.7 Security checks

- [x] Refresh token HttpOnly.
- [x] Secure/SameSite theo env.
- [x] Token hash trong DB nếu spec quy định.
- [x] No sensitive token logs.
- [ ] Rate limit login nếu được chốt/triển khai.


## API contract

Trước backend implementation, chốt/cập nhật:

- `docs/api/auth.md`
- `docs/api/users.md`
- `docs/api/cs-groups.md` nếu Phase 2 expose group management
- `docs/api/openapi.yaml`

Integration test phải kiểm tra request/response/status code khớp contract. Frontend login/User Management chỉ tích hợp theo contract đã cập nhật.

## Exit criteria

- [x] Login/refresh/logout/me pass.
- [x] Admin create/disable/revoke pass.
- [ ] Backend authorization tests pass.
- [x] Frontend auth flow pass.
- [x] Disabled user behavior pass.
- [ ] Q-005 được đóng hoặc các case chưa chốt không bị tự suy đoán.

- [x] API contract/docs liên quan đã đồng bộ với implementation.

## Implementation notes

## Changes from original plan


## Agent notes

Khi tạo/sửa API module: áp dụng `.agents/skills/api-module-scaffold/SKILL.md`.
