# Class API

Base: `/api/v1/classes`

## Endpoints dự kiến

- `GET /api/v1/classes`
- `POST /api/v1/classes`
- `GET /api/v1/classes/{classId}`
- `PATCH /api/v1/classes/{classId}`
- `POST /api/v1/classes/{classId}/teachers`
- `PATCH /api/v1/classes/{classId}/teachers/{classTeacherId}`
- `GET /api/v1/classes/{classId}/schedules`
- `POST /api/v1/classes/{classId}/schedules`

## Scope

- TEACHER chỉ xem/làm việc với lớp được gán theo endpoint rule.
- CS/MANAGE/ADMIN theo data scope nghiệp vụ.
