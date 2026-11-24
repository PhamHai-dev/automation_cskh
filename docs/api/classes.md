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

## Mở rộng Class cho JLPT

`Class.program_type` là nguồn tường minh `KAIWA|JLPT`; API không còn suy ra chương trình của Class chỉ từ tên lớp hoặc Enrollment. Class không có `jlpt_template_id` vì mọi lớp JLPT dùng template toàn cục.

- tạo/đổi sang `JLPT` chỉ nhận `program_type`;
- đổi `JLPT → KAIWA` trả `409` nếu đã có `JlptLearningRecord`;
- response Class trả `program_type`, không trả template binding.

Endpoint:

- `PATCH /api/v1/classes/{classId}/program` — ADMIN/MANAGE trong scope; body `{ program_type }`.
- `GET /api/v1/classes/{classId}/jlpt-template-status` — so lớp với template toàn cục, trả session khớp/lệch/thiếu và cảnh báo.
- `POST /api/v1/classes/{classId}/jlpt-template/apply` — ADMIN/MANAGE trong scope; chỉ cập nhật `session_type/session_title` của session đã tồn tại có cùng `session_number`, không tạo/xóa/đổi lịch.

## Metadata ClassSession JLPT

Create/update ClassSession nhận thêm:

- `session_type: LESSON|TEST`, mặc định `LESSON`;
- `session_title?: string|null`, tối đa 120 ký tự.

Quy tắc:

- TEST title không được trùng trong cùng Class; kiểm tra ở service do MySQL không có partial unique phù hợp.
- Đổi loại/tên session quá khứ được phép cho ADMIN/MANAGE trong scope và phải AuditLog.
- Không đổi `session_number` khi session đã có Attendance hoặc `JlptLearningRecord`; trả `409`.
- TEACHER không sửa trực tiếp metadata template; chỉ gửi change request.

## JLPT Session Template API

Base: `/api/v1/jlpt/templates`. Giữ dạng plural để đồng nhất routing, nhưng collection có tối đa một bản ghi `GLOBAL`.

- `GET /api/v1/jlpt/templates` — ADMIN/MANAGE/TEACHER/CS đọc; chỉ hỗ trợ lọc `active`, response là mảng 0 hoặc 1 phần tử.
- `POST /api/v1/jlpt/templates` — ADMIN; body gồm `name`, `total_sessions`, `active?`, `items`; tạo lần hai trả `409`.
- `GET /api/v1/jlpt/templates/{templateId}` — đọc singleton template và item.
- `PATCH /api/v1/jlpt/templates/{templateId}` — ADMIN hoặc MANAGE khi toàn bộ Class JLPT bị ảnh hưởng đều trong scope.
- `DELETE /api/v1/jlpt/templates/{templateId}` — ADMIN; trả `409` khi còn Class JLPT hoặc dữ liệu JLPT phụ thuộc template.
- `POST /api/v1/jlpt/templates/{templateId}/apply-preview` — ADMIN/MANAGE; body `{ class_ids }`, chỉ tính diff/cảnh báo, không ghi DB; chỉ nhận Class JLPT trong scope.

Input/output công khai không chứa `singleton_key`, `level` hoặc `course_code`. Item unique theo `session_number` và nằm trong `1..total_sessions`; tên TEST phải có và duy nhất trong template.

## Template change request

- `POST /api/v1/jlpt/templates/{templateId}/change-requests` — TEACHER được phân công một Class JLPT; gửi `class_id`, `proposed_items`, `request_note?`.
- `POST /api/v1/jlpt/template-change-requests/{requestId}/approve` — ADMIN hoặc MANAGE nếu toàn bộ Class JLPT bị ảnh hưởng nằm trong scope.
- `POST /api/v1/jlpt/template-change-requests/{requestId}/reject` — cùng quyền duyệt; body có `review_reason`.

Approval cập nhật singleton template/items và áp metadata lên session tồn tại trong transaction, ghi AuditLog; session thiếu chỉ trả warning, không tự tạo. Request chỉ được xử lý khi `PENDING`, ngược lại `409`.

## Nhật ký JLPT trong bảng điểm danh (2026-11-24)

Bốn tiêu chí hiển thị inline ở cả Theo học viên/Theo lớp học. Contract tại docs/api/attendance.md: ngoài ACTIVE, TRANSFERRED có Attendance chưa xóa tại đúng session cũng được nhập; không sửa EnrollmentClass, giữ class/CS scope và teacher assignment. GET/PATCH/bulk dùng cùng điều kiện.
