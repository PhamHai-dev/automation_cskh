# Dashboard API

Cung cấp các số liệu phân tích và báo cáo thống kê trực tiếp từ nguồn sự thật (Source of truth) trong cơ sở dữ liệu.

Base URL: `/api/v1/dashboard`

Quyền truy cập & Data Scope:
- `ADMIN`: Xem toàn bộ hệ thống.
- `MANAGE`: Xem tổng hợp trong phạm vi các nhóm CS quản lý.
- `CS`: Xem tổng hợp các học viên và nhiệm vụ thuộc quyền phụ trách.
- `TEACHER`: Xem các lớp được phân công giảng dạy.

---

## 1. Endpoints

### 1.1. `GET /api/v1/dashboard/summary`
Tổng hợp tình hình học viên và các gói học.
- **Query Parameters:** `date_from`, `date_to`, `package_id`, `cs_id`, `status`
- **Response 200:**
  ```json
  {
    "total_enrollments": 120,
    "unique_students": 95,
    "status_breakdown": {
      "NOT_STARTED": 15,
      "STUDYING": 80,
      "PAUSED": 10,
      "FINISHED": 12,
      "CANCELLED": 3
    },
    "status_percentage": {
      "STUDYING": 66.7,
      "NOT_STARTED": 12.5,
      "PAUSED": 8.3,
      "FINISHED": 10.0,
      "CANCELLED": 2.5
    }
  }
  ```

### 1.2. `GET /api/v1/dashboard/attendance`
Thống kê tổng hợp số buổi học và tỷ lệ chuyên cần.
- **Query Parameters:** `date_from`, `date_to`, `class_id`, `package_id`
- **Response 200:**
  ```json
  {
    "total_sessions": 250,
    "total_attendances": 320,
    "attendance_rate": 88.5,
    "breakdown": {
      "ATTENDED": 283,
      "ABSENT_APPROVED_A": 15,
      "LEAVE_B": 8,
      "ABSENT_UNAPPROVED_C": 6,
      "TEACHER_ABSENT_D": 5,
      "TECH_ERROR_E": 3
    }
  }
  ```

### 1.3. `GET /api/v1/dashboard/care-pivot`
Bảng ma trận Pivot tổng hợp số lượng nhật ký chăm sóc: `Mốc buổi học (after_session_number)` × `Kết quả (outcome)`.
- **Query Parameters:** `date_from`, `date_to`, `cs_id`, `package_id`
- **Response 200:**
  ```json
  {
    "session_numbers": [1, 3, 5, 10, 15, 20],
    "outcomes": [
      "POSITIVE",
      "NEED_SUPPORT_SYSTEM",
      "TEMP_PAUSE",
      "NEED_CURRICULUM_SUPPORT",
      "NEED_STUDENT_WEAKNESS_FIX",
      "NEED_TEACHER_SUPPORT",
      "NEGATIVE_WANTS_TO_STOP",
      "NO_RESPONSE"
    ],
    "matrix": {
      "1": { "POSITIVE": 45, "NEED_SUPPORT_SYSTEM": 5, "NO_RESPONSE": 2 },
      "3": { "POSITIVE": 38, "NEED_CURRICULUM_SUPPORT": 4, "TEMP_PAUSE": 3 }
    },
    "total_logs": 97
  }
  ```

### 1.4. `GET /api/v1/dashboard/tasks-overview`
Tổng hợp tình hình các nhiệm vụ chăm sóc học viên (hẹn gọi lại, điểm nóng).
- **Query Parameters:** `cs_id`
- **Response 200:**
  ```json
  {
    "pending_total": 12,
    "overdue": 3,
    "due_today": 5,
    "due_this_week": 4,
    "urgent_hot_issues": 2,
    "completed_recent": 20
  }
  ```
