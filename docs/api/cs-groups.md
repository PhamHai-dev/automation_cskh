# CS Group API

Base: `/api/v1/cs-groups`

## Endpoints dự kiến

- `GET /api/v1/cs-groups`
- `POST /api/v1/cs-groups`
- `GET /api/v1/cs-groups/{groupId}`
- `PATCH /api/v1/cs-groups/{groupId}`
- `POST /api/v1/cs-groups/{groupId}/members`
- `DELETE /api/v1/cs-groups/{groupId}/members/{userId}`
- `POST /api/v1/cs-groups/{groupId}/managers`
- `DELETE /api/v1/cs-groups/{groupId}/managers/{userId}`

Admin quản lý cấu trúc nhóm. Manage chỉ đọc nhóm/scope của mình trừ khi docs permission mở rộng.
