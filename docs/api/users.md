# Users / Admin Settings API

Base: `/api/v1/settings/users`

## Endpoints dự kiến

| Method | Path | Role | Mục đích |
| --- | --- | --- | --- |
| GET | `/` | ADMIN | List/search/filter users |
| POST | `/` | ADMIN | Tạo tài khoản nội bộ |
| GET | `/{userId}` | ADMIN | Chi tiết user |
| PATCH | `/{userId}` | ADMIN | Sửa profile/roles/basic settings |
| POST | `/{userId}/enable` | ADMIN | Mở tài khoản |
| POST | `/{userId}/disable` | ADMIN | Khóa tài khoản |
| POST | `/{userId}/reset-password` | ADMIN | Reset password theo policy |
| POST | `/{userId}/revoke-sessions` | ADMIN | Revoke toàn bộ AuthSession |

## Validation

- `roles` chỉ nhận `ADMIN`, `MANAGE`, `CS`, `TEACHER`.
- Email unique.
- Không tự tạo bảng UserRole; roles lưu JSON trong User.
