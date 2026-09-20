# Import / Export API

Base URL: `/api/v1/imports`

Quyền truy cập: Bắt buộc đăng nhập (`authenticate`). Thao tác import/sửa đổi yêu cầu quyền `ADMIN` hoặc `MANAGE` (theo Q-004).

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

## 3. Quy tắc nghiệp vụ bắt buộc
- **Không silent-fix:** Mọi giá trị sai format, lạ hoặc xung đột phải được báo cáo và lưu lại trạng thái `FAILED`.
- **Sheet 1 (`STUDENT_ENROLLMENT`):** Cột ID map vào `Student.external_id`. Tạo hoặc update `Student`, `Enrollment`, `EnrollmentClass`.
- **Sheet 3 (`ATTENDANCE`):** Tìm `Student` theo `external_id`, tìm `EnrollmentClass`, nhận diện cột ngày điểm danh, parse mã điểm danh (`1/1.0/đã học` -> `ATTENDED`, `A`, `B`, `C`, `D`, `E`), đảm bảo `UNIQUE(enrollment_class_id, class_session_id)`.
