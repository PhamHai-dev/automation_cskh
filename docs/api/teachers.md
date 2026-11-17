# Teacher API

Base: `/api/v1/teachers`

## Endpoints

### `GET /api/v1/teachers`

Protected endpoint for `ADMIN`, `MANAGE`, `CS`, and `TEACHER`. The list is always paginated server-side; when omitted, `page=1` and `pageSize=20` are applied. `search` searches teacher name/code/phone/email and linked account email. Optional filters are `active=true|false`, `teacher_type=VIETNAMESE|JAPANESE|OTHER`, and `account_status=HAS_ACCOUNT|NO_ACCOUNT|ACTIVE_ACCOUNT|LOCKED_ACCOUNT` (the aliases `PROVISIONED`/`UNPROVISIONED` are also accepted).

Response:

```json
{
  "data": [],
  "meta": { "page": 1, "pageSize": 20, "total": 0, "totalPages": 1 }
}
```

Invalid pagination, boolean, enum, or filter values return `400 VALIDATION_ERROR`/the standard error envelope. Search and filters are applied in the repository query before pagination; `total` is counted using the same filters.

### `GET /api/v1/teachers/me`

- Role: `TEACHER`.
- Scope: chỉ hồ sơ `Teacher` liên kết với `req.user.id` qua `Teacher.user_id`.
- Trả `404` nếu tài khoản chưa có hồ sơ giáo viên liên kết.
- Dùng cho Dashboard và trang Hồ sơ giáo viên.

### `PATCH /api/v1/teachers/me`

- Role: `TEACHER`.
- Scope: chỉ cập nhật hồ sơ của chính tài khoản đang đăng nhập.
- Chỉ chấp nhận `phone` và `email`; mã giáo viên, họ tên, phân loại, trạng thái và tài khoản đăng nhập là read-only.
- Body phải có ít nhất một field; field ngoài contract bị từ chối.
- Thay đổi được ghi `AuditLog`.

### Other endpoints

- `GET /api/v1/teachers/{teacherId}`
- `POST /api/v1/teachers`
- `PATCH /api/v1/teachers/{teacherId}`
- `POST /api/v1/teachers/{teacherId}/account`

Teacher là User role `TEACHER`; thông tin nghiệp vụ riêng nằm trong TeacherProfile.
