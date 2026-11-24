# Import / Export API

Base URL: `/api/v1/imports`

Quyền truy cập: Bắt buộc đăng nhập (`authenticate`). Cho phép tất cả các quyền `ADMIN`, `MANAGE`, `CS`, `TEACHER` theo quyết định Q-013. Áp dụng Data Scope: CS chỉ import/ghi đè học viên của mình; Teacher chỉ import điểm danh lớp mình dạy; các dòng ngoài quyền tự động bỏ qua.

## 1. Flow quy trình Import chuẩn

```text
Upload file Excel (.xlsx)
        ↓ (tạo ImportBatch draft status PREVIEW)
Xem trước Sheets & Ánh xạ cột (Preview & Mapping)
        ↓ (chốt columnMapping)
Kiểm tra tính hợp lệ (Validate report)
        ↓ (trả về danh sách cảnh báo, lỗi, số dòng hợp lệ)
Xác nhận thực hiện (Confirm)
        ↓ (thực thi theo transaction/batch an toàn)
Ghi nhận kết quả (ImportBatch completed/partial_failed + ImportRow logs)
        ↓
Tải file báo cáo lỗi (Error Report) nếu có dòng thất bại
```

## 2. Danh sách Endpoints

### 2.1. `POST /api/v1/imports/upload`
Upload file Excel (`multipart/form-data`) và khởi tạo đợt import.
- **Form fields:**
  - `file`: File Excel (.xlsx)
  - `import_type`: `STUDENT_ENROLLMENT` (Sheet 1) hoặc `ATTENDANCE` (Sheet 3)
- **Response 200:**
  ```json
  {
    "importId": 1,
    "fileName": "cham_soc_hoc_vien.xlsx",
    "importType": "STUDENT_ENROLLMENT",
    "sheets": ["1.Chăm sóc", "3.Chấm buổi", "Setting"],
    "selectedSheet": "1.Chăm sóc",
    "totalRows": 2320,
    "previewRows": [
      { "A": "420274574", "E": "Đặng Văn Thạch", "G": "07012519244", "K": "SKAI231030VN", ... }
    ],
    "suggestedMapping": {
      "external_id": "A",
      "full_name": "E",
      "phone": "G",
      "email": "H",
      "package_code": "K"
    }
  }
  ```

### 2.2. `GET /api/v1/imports/:importId/preview`
Lấy dữ liệu xem trước theo sheet được chỉ định.
- **Query params:** `sheetName` (optional), `limit` (default: 10).
- **Response 200:** Chứa danh sách cột, các dòng mẫu, và gợi ý mapping.

### 2.3. `POST /api/v1/imports/:importId/mapping`
Lưu cấu hình ánh xạ cột cho batch.
- **Body:**
  ```json
  {
    "sheetName": "1.Chăm sóc",
    "columnMapping": {
      "external_id": "A",
      "fee_paid_at": "B",
      "sale_name": "C",
      "student_source_status": "D",
      "full_name": "E",
      "gender": "F",
      "phone": "G",
      "email": "H",
      "course_content": "I",
      "payment_status": "J",
      "package_code": "K",
      "course_teacher_type": "L",
      "level": "M",
      "total_sessions": "N",
      "class_model": "O",
      "sales_note": "P",
      "date_of_birth": "Q",
      "occupation": "R",
      "remaining_sessions": "T",
      "start_date": "U",
      "status": "V",
      "end_date": "W"
    }
  }
  ```

### 2.4. `POST /api/v1/imports/:importId/validate`
Chạy kiểm tra dữ liệu trước khi import.
- **Response 200:**
  ```json
  {
    "totalRows": 150,
    "validRows": 145,
    "invalidRows": 5,
    "errors": [
      { "rowNumber": 12, "field": "phone", "message": "Số điện thoại không hợp lệ" },
      { "rowNumber": 45, "field": "external_id", "message": "Trùng lặp ID trong file" }
    ],
    "warnings": []
  }
  ```

### 2.5. `POST /api/v1/imports/:importId/confirm`
Bắt đầu import dữ liệu vào Database.
- **Body:** `{ "skipErrors": true }` (Mặc định `true` để import các dòng hợp lệ và ghi nhận dòng lỗi vào `ImportRow`).
- **Response 200:**
  ```json
  {
    "importId": 1,
    "status": "COMPLETED",
    "totalRows": 150,
    "successRows": 145,
    "failedRows": 5,
    "completedAt": "2026-09-20T15:30:00.000Z"
  }
  ```

### 2.6. `GET /api/v1/imports/:importId`
Lấy trạng thái và thống kê của đợt import.

### 2.7. `GET /api/v1/imports/:importId/errors`
- Query param: `download=true` trả về stream file Excel danh sách các dòng lỗi.
- Không có `download` trả về JSON danh sách lỗi.

### 2.8. `GET /api/v1/imports/batches`
Lấy danh sách các đợt import trong hệ thống kèm thông tin người tải, số lượng thành công/thất bại và trạng thái.

### 2.9. `GET /api/v1/imports/template/:type`
Tải file Excel mẫu chuẩn:
- `:type = student_enrollment` (mẫu Sheet 1)
- `:type = attendance` (mẫu Sheet 3)

### 2.10. `GET /api/v1/imports/export/students` & `attendance`
Xuất file Excel dữ liệu thực tế đang có trong hệ thống để đối soát.

### 2.11. Lịch sử Đồng bộ Google Sheet

`GET /api/v1/imports/sheet-sync/history`

- Quyền: `ADMIN`, `MANAGE`, `CS`; không cho `TEACHER`.
- Data scope: ADMIN toàn bộ; MANAGE theo nhóm CS được phân công; CS theo nguồn/cấu hình thuộc trách nhiệm của mình.
- Query: `page`, `pageSize` (tối đa 100), `configId`, `code`, `flowType`, `programType`, `triggerType`, `status`, `search`, `fromDate`, `toDate`.
- Mặc định 7 ngày, giới hạn retention 30 ngày, thống kê “hôm nay” theo `Asia/Ho_Chi_Minh`.
- Response có `items`, `total`, `page`, `pageSize`, `totalPages`, `refreshedAt` và `canRollback`.

`GET /api/v1/imports/sheet-sync/history/:runId` áp dụng cùng data scope khi xem chi tiết.

`POST /api/v1/imports/sheet-sync/history/:runId/rollback` chỉ dành cho `ADMIN`/`MANAGE` và vẫn kiểm tra nguồn thuộc scope trước khi hoàn tác.

### 2.12. Lịch sử Sao lưu Sheet/Excel

`GET /api/v1/imports/sheet-backup/history`

- Quyền: `ADMIN`, `MANAGE`, `CS`; không cho `TEACHER` trong trung tâm lịch sử.
- Trả một dòng cho mỗi đợt sao lưu; `items` của batch chứa các sổ và thống kê 3 sheet.
- Query: `page`, `pageSize` (tối đa 100), `programType`, `status`, `fromDate`, `toDate`.
- Response có `batches`, tổng batch chính xác, metadata phân trang và `refreshedAt`.
- Retention chỉ xóa lịch sử; file Excel sao lưu vật lý không bị xóa.

### 2.13. NKHT JLPT manual import

Ngoại lệ quyền có phạm vi: chỉ `ADMIN` được gọi import NKHT; không thay quyền các luồng Sheet 1/Sheet 3.

`POST /api/v1/imports/jlpt/preview`

- `multipart/form-data`: `file` (.xlsx) và `target_year`.
- Đọc `Info`, sheet lịch/setting và toàn bộ `NKHT N2/N3/N4/N5` có trong workbook.
- Match bằng class code + full name chuẩn hóa, sau đó đối chiếu external student ID từ Info. Duplicate/ambiguous không được đoán.
- Cột buổi map bằng `session_number`; ClassSession thiếu hoặc header lệch là issue, không tự tạo/sửa session.
- Blank là `KEEP_DATABASE`; nonblank khác DB tạo conflict từng field.
- Response trả `preview_token`, summary, items, conflicts, normalization issues và `can_confirm`.

`POST /api/v1/imports/jlpt/confirm`

- Nhận lại `file`, `target_year`, `preview_token`, `conflict_actions` và `normalization_resolutions` dạng JSON string.
- Server parse/preview lại file, không tin dữ liệu preview từ client.
- Mọi conflict phải chọn `OVERWRITE|KEEP_DATABASE`; mọi X có note tự do phải chọn `ABSENT_APPROVED_A|ABSENT_UNAPPROVED_C`.
- Header/session/match error hoặc issue chưa giải quyết làm `can_confirm=false` và confirm trả `409`.
- Commit transaction theo Class/session hợp lý, ghi `ImportBatch`, `ImportRow`, AuditLog, teacher side Attendance + reconciliation và JLPT record.

### 2.14. NKHT JLPT export

`GET /api/v1/imports/export/jlpt?year&teacher_ids&class_ids`

- `ADMIN`, `MANAGE`, `CS` trong data scope; `TEACHER` luôn `403`.
- Bắt buộc `year` và ít nhất một teacher/class filter.
- Class phải là JLPT và có level chuẩn `N2|N3|N4|N5`; level thiếu/sai trả `409` kèm danh sách cần chuẩn hóa. Mọi Class dùng cùng singleton template nên không kiểm tra hoặc tách nhóm tương thích template.
- Workbook có các sheet hỗ trợ và đúng một sheet NKHT cho mỗi level có dữ liệu; không cần clone format/công thức nguồn 100%.
- Present xuất `O`; mọi status vắng/B/D/E xuất `X` cùng marker `[STATUS:<code>]` trong note. Không xuất `0.5X`.
- Marker chỉ thuộc file và phải bị loại trước khi note được lưu lại. Dữ liệu JLPT ẩn do trạng thái vắng vẫn được xuất.

### 2.15. Google Sheet NKHT và normalization

- Flow type chuẩn: `JLPT_LEARNING_LOG`; chỉ ADMIN tạo/cập nhật/chạy config.
- Một config đại diện một workbook/giáo viên, đọc đồng thời các sheet hỗ trợ và NKHT.
- Sync tự động coi Sheet là nguồn tuyệt đối: nonblank overwrite; blank clear đúng field. Blank chuyên cần chỉ clear `teacher_status` qua lifecycle/reconciliation/audit hiện có.
- `X` có note tự do không thay teacher status hiện tại nhưng vẫn sync tiêu chí khác và tạo task `AMBIGUOUS_ABSENCE`; header lệch tạo `SESSION_HEADER_MISMATCH`.

Endpoints:

- `GET /api/v1/imports/jlpt/normalization-tasks` — ADMIN toàn bộ; MANAGE trong scope; lọc `status`, `issue_type`, `run_id`, `class_id`, phân trang.
- `POST /api/v1/imports/jlpt/normalization-tasks/{taskId}/resolve` — body `{ resolution_status?, session_type?, session_title?, note? }` tùy issue.
- `POST /api/v1/imports/jlpt/normalization-tasks/{taskId}/reject` — body `{ reason }`; không thay dữ liệu nghiệp vụ.

Resolve `AMBIGUOUS_ABSENCE` chỉ nhận `ABSENT_APPROVED_A|ABSENT_UNAPPROVED_C`, ghi teacher side, note nguồn đã loại marker và reconciliation. Resolve header mismatch cập nhật metadata session chỉ khi actor có quyền và session khớp scope; không đổi ngày/giờ/số thứ tự.

## 3. Quy tắc nghiệp vụ bắt buộc
- **Không silent-fix:** Mọi giá trị sai format, lạ hoặc xung đột phải được báo cáo và lưu lại trạng thái `FAILED`.
- **Sheet 1 (`STUDENT_ENROLLMENT`):** Cột ID map vào `Student.external_id`. Tạo hoặc update `Student`, `Enrollment`, `EnrollmentClass`.
- **Sheet 3 (`ATTENDANCE`):** Tìm `Student` theo `external_id`, tìm `EnrollmentClass`, nhận diện cột ngày điểm danh, parse mã điểm danh (`1/1.0/đã học` -> `ATTENDED`, `A`, `B`, `C`, `D`, `E`), đảm bảo `UNIQUE(enrollment_class_id, class_session_id)`.
