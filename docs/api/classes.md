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

## Lọc danh sách lớp

`GET /api/v1/classes` lọc phía server trước phân trang và luôn giữ data scope theo vai trò.

Nhóm query chính:

- nhận dạng: `search`, `class_name`, `teacher_name`, `teacher_code`;
- chương trình: `program_type`, `course_category`, `course_level`;
- khóa học: `package_name`, `status`, `model_filter`, `sale`;
- lịch học: `schedule_pattern`, `start_time`;
- ngày: `start_date_*`, `end_date_*` với `EXACT` hoặc `RANGE`;
- tiến độ: `total_sessions_*`, `remaining_sessions_*`;
- phân trang: `page`, `pageSize` (tối đa 200).

Quy tắc chương trình:

- `JLPT` là giá trị chuẩn trong code và response.
- API tạm nhận `JNPT` như alias tương thích ngược rồi chuẩn hóa thành `JLPT`.
- `course_level` chỉ có nguồn độc lập ở Kaiwa; JLPT lọc bằng mã khóa học, gói và lớp.
- Không map `course_content` Kaiwa sang học phí JLPT.

Contract chi tiết và validation nằm tại `docs/api/openapi.yaml`.

## Scope

- `ADMIN`: không giới hạn phạm vi lớp.
- `CS`: chỉ xem lớp có ít nhất một enrollment đang hoạt động do mình sở hữu (`cs_id`) hoặc được cấp quyền xem (`cs_viewers`).
- `MANAGE`: chỉ xem lớp có ít nhất một enrollment đang hoạt động thuộc chính mình hoặc CS trong các nhóm được gán qua `ManageAssignment`.
- `TEACHER`: chỉ xem lớp được phân công qua `ClassTeacher` hoặc `ClassSession`.
- Student đã lưu trữ (`deleted_at != null`) không cấp quyền nhìn thấy lớp.
- Cùng một scope được áp dụng cho danh sách, tổng số, facets, filter options và API chi tiết lớp; bộ lọc chỉ thu hẹp, không được mở rộng scope.

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
