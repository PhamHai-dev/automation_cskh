# Care API

Quản lý nhật ký chăm sóc học viên (CareLog) và các nhiệm vụ chăm sóc/hẹn gọi/điểm nóng (CareTask).

Quyền truy cập: Bắt buộc đăng nhập (`authenticate`).
- `ADMIN`: Toàn quyền xem và quản lý.
- `MANAGE`: Quản lý trong phạm vi các CS thuộc `CSGroup` được gán.
- `CS`: Xem và quản lý các học viên được gán (`cs_id = currentUser.id`) và các nhiệm vụ được giao.
- `TEACHER`: Không được quyền xem nội dung nhật ký nội bộ của CS.

---

## 1. CareLog Endpoints

### 1.1. `GET /api/v1/enrollments/{enrollmentId}/care-logs`
Lấy toàn bộ lịch sử chăm sóc của một gói học (sắp xếp theo thời gian mới nhất hoặc theo mốc buổi học).
- **Responses:**
  - `200`:
    ```json
    [
      {
        "id": 1,
        "enrollment_id": 10,
        "cs_id": 2,
        "after_session_number": 3,
        "outcome": "POSITIVE",
        "content": "Học viên phản hồi học tốt, hiểu bài.",
        "created_by_id": 2,
        "created_at": "2026-09-20T10:00:00.000Z",
        "updated_at": "2026-09-20T10:00:00.000Z",
        "cs": { "id": 2, "name": "CS Nguyễn", "email": "cs@example.com" }
      }
    ]
    ```

### 1.2. `POST /api/v1/enrollments/{enrollmentId}/care-logs`
Tạo ghi nhận chăm sóc mới cho gói học.
- **Request Body:**
  ```json
  {
    "after_session_number": 3,
    "outcome": "POSITIVE",
    "content": "Học viên phản hồi học tốt, hài lòng với giáo viên."
  }
  ```
- **Allowed Outcomes:**
  `POSITIVE`, `NEED_SUPPORT_SYSTEM`, `TEMP_PAUSE`, `NEED_CURRICULUM_SUPPORT`, `NEED_STUDENT_WEAKNESS_FIX`, `NEED_TEACHER_SUPPORT`, `NEGATIVE_WANTS_TO_STOP`, `NO_RESPONSE`
- **Response 201:** Trả về đối tượng `CareLog` vừa tạo.

---

## 2. CareTask Endpoints

### 2.1. `GET /api/v1/care-tasks`
Lấy danh sách nhiệm vụ chăm sóc có hỗ trợ phân trang và bộ lọc.
- **Query Parameters:**
  - `status`: `PENDING` | `DONE` | `CANCELLED`
  - `priority`: `LOW` | `NORMAL` | `HIGH` | `URGENT`
  - `type`: `CALLBACK` | `HOT_ISSUE` | `FOLLOW_UP`
  - `assigned_to_id`: number
  - `enrollment_id`: number
  - `due_filter`: `overdue` | `today` | `this_week` | `all`
  - `limit`: number (mặc định 20)
  - `offset`: number (mặc định 0)
- **Response 200:**
  ```json
  {
    "items": [
      {
        "id": 5,
        "enrollment_id": 10,
        "assigned_to_id": 2,
        "type": "CALLBACK",
        "title": "Hẹn gọi lại trao đổi về đổi giờ học",
        "note": "Học viên bận thứ 6 muốn chuyển sang thứ 7",
        "due_at": "2026-09-21T18:00:00.000Z",
        "priority": "HIGH",
        "status": "PENDING",
        "completed_at": null,
        "created_at": "2026-09-20T10:00:00.000Z",
        "enrollment": {
          "id": 10,
          "student": { "id": 1, "full_name": "Nguyễn Văn A", "phone": "0901234567" },
          "package": { "code": "SKAI231030VN" }
        },
        "assigned_to": { "id": 2, "name": "CS Nguyễn", "email": "cs@example.com" }
      }
    ],
    "total": 1
  }
  ```

### 2.2. `POST /api/v1/care-tasks`
Tạo nhiệm vụ chăm sóc mới.
- **Request Body:**
  ```json
  {
    "enrollment_id": 10,
    "assigned_to_id": 2,
    "type": "HOT_ISSUE",
    "title": "Học viên phàn nàn đường truyền giật lag",
    "note": "Cần hỗ trợ kỹ thuật kiểm tra phòng học Zoom",
    "due_at": "2026-09-20T19:00:00.000Z",
    "priority": "URGENT"
  }
  ```
- **Response 201:** Trả về đối tượng `CareTask` vừa tạo.

### 2.3. `GET /api/v1/care-tasks/{taskId}`
Xem chi tiết một nhiệm vụ chăm sóc.

### 2.4. `PATCH /api/v1/care-tasks/{taskId}`
Cập nhật nội dung, hạn xử lý hoặc mức độ ưu tiên của nhiệm vụ.

### 2.5. `POST /api/v1/care-tasks/{taskId}/complete`
Đánh dấu hoàn thành nhiệm vụ (`status = DONE`, `completed_at = now()`).

### 2.6. `POST /api/v1/care-tasks/{taskId}/cancel`
Hủy nhiệm vụ (`status = CANCELLED`).
