# Auth API

Base: `/api/v1/auth`

## Endpoints

| Method | Path | Auth | Mục đích |
| --- | --- | --- | --- |
| POST | `/login` | Public | Đăng nhập email/password, tạo AuthSession |
| POST | `/refresh` | Refresh cookie | Rotate refresh token, cấp access token mới |
| POST | `/logout` | Auth/refresh session | Revoke session hiện tại |
| GET | `/me` | Access token | Trả current user + roles + thông tin scope cơ bản |

## Quy tắc

- Không có public signup.
- Không trả password hash/refresh token hash.
- Refresh token lưu HttpOnly cookie, DB chỉ lưu hash nếu schema chốt như docs.
- Disabled user không được refresh session.
- 401 cho token/session invalid; 403 cho account bị disable nếu policy chọn như vậy và phải thống nhất.
