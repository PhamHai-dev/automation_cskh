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

### Other endpoints

- `GET /api/v1/teachers/{teacherId}`
- `PATCH /api/v1/teachers/{teacherId}/profile`

Teacher là User role `TEACHER`; thông tin nghiệp vụ riêng nằm trong TeacherProfile.
