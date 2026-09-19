# Class API

Base: `/api/v1/classes`

## Endpoints

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

---

# ClassSession API

Base: `/api/v1/classes/{classId}/sessions`

`ClassSession` = một buổi học cụ thể của lớp.

## Endpoints

- `GET /api/v1/classes/{classId}/sessions`
- `POST /api/v1/classes/{classId}/sessions`
- `GET /api/v1/classes/{classId}/sessions/{sessionId}`
- `PATCH /api/v1/classes/{classId}/sessions/{sessionId}`
- `POST /api/v1/classes/{classId}/sessions/{sessionId}/cancel`

## Quy tắc

- `session_number` unique trong 1 `class_id`.
- TEACHER chỉ sửa buổi học của lớp mình được phân công.
- CS/MANAGE/ADMIN theo data scope nghiệp vụ.
- Source rule: `LEARNING_SYSTEM` do CS nhập, `ZOOM` do Teacher upload.
