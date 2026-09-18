# Phase 2 — Auth/RBAC + Admin User Management

- Status: NOT_STARTED
- Started at:
- Completed at:
- Dependencies: Phase 1 DONE
- Open questions: Q-005 phải chốt nếu implementation đa role ảnh hưởng endpoint scope.

## Mục tiêu

Có login/session production-oriented và authorization backend thật, không chỉ ẩn UI.

## Checklist chi tiết

### 2.1 Auth API

- [ ] POST login
- [ ] POST refresh
- [ ] POST logout
- [ ] GET me
- [ ] refresh token rotation
- [ ] AuthSession revoke
- [ ] disable user làm session/token refresh không còn hợp lệ theo policy

### 2.2 Password

- [ ] Hash password an toàn.
- [ ] Không log password/token.
- [ ] Reset password flow theo spec.

### 2.3 Middleware

- [ ] authenticate
- [ ] require role/permission
- [ ] data-scope helpers
- [ ] consistent 401/403

### 2.4 Admin Settings/User Management API

- [ ] list users
- [ ] create user
- [ ] edit user cơ bản
- [ ] set roles
- [ ] enable/disable
- [ ] reset password
- [ ] revoke sessions

  Không có public signup.

### 2.5 Frontend

- [ ] Login page theo design system.
- [ ] Auth provider/session handling.
- [ ] Protected routes.
- [ ] Admin Settings → User Management.
- [ ] Role-based menu visibility chỉ là UX, không thay backend security.
- [ ] Loading/session-expired state rõ ràng.

### 2.6 Data-scope tests

- [ ] CS khác không truy cập dữ liệu ngoài scope.
- [ ] Manage chỉ trong CSGroup được giao.
- [ ] Teacher chỉ lớp được phân công khi endpoint core xuất hiện; helper có thể unit test từ phase này.
- [ ] Admin full scope.

### 2.7 Security checks

- [ ] Refresh token HttpOnly.
- [ ] Secure/SameSite theo env.
- [ ] Token hash trong DB nếu spec quy định.
- [ ] No sensitive token logs.
- [ ] Rate limit login nếu được chốt/triển khai.


## API contract

Trước backend implementation, chốt/cập nhật:

- `docs/api/auth.md`
- `docs/api/users.md`
- `docs/api/cs-groups.md` nếu Phase 2 expose group management
- `docs/api/openapi.yaml`

Integration test phải kiểm tra request/response/status code khớp contract. Frontend login/User Management chỉ tích hợp theo contract đã cập nhật.

## Exit criteria

- [ ] Login/refresh/logout/me pass.
- [ ] Admin create/disable/revoke pass.
- [ ] Backend authorization tests pass.
- [ ] Frontend auth flow pass.
- [ ] Disabled user behavior pass.
- [ ] Q-005 được đóng hoặc các case chưa chốt không bị tự suy đoán.

- [ ] API contract/docs liên quan đã đồng bộ với implementation.

## Implementation notes

## Changes from original plan


## Agent notes

Khi tạo/sửa API module: áp dụng `.agents/skills/api-module-scaffold/SKILL.md`.
