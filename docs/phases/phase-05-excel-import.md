# Phase 5 — Excel Import/Export Sheet 1 + Sheet 3

- Status: COMPLETED
- Started at: 2026-09-20
- Completed at: 2026-09-20
- Dependencies: Phase 4 DONE
- Open questions: Q-001 (RESOLVED), Q-003 (RESOLVED), Q-004 (RESOLVED).

## Mục tiêu

Import dữ liệu thực tế có preview/mapping/validation/log; không import âm thầm.

## Checklist chi tiết

### 5.1 Sheet 1

- [x] Student (map ID nguồn vào Student.external_id theo Q-001)
- [x] Enrollment
- [x] Package (tự động tạo package nếu chưa có)
- [x] Teacher/Class khi dữ liệu đủ
- [x] EnrollmentClass
- [x] thông tin CS/status/date tương ứng spec

  Không tách string/lịch sử lớp bằng heuristic nguy hiểm nếu format chưa chốt; preview và báo ambiguous/invalid row.

### 5.2 Sheet 3

- [x] ClassSession (nhận diện cột ngày Excel serial date -> YYYY-MM-DD)
- [x] Attendance (map mã 1, A, B, C, D, E chuẩn business rule; báo lỗi khi có ký tự lạ)
- [x] EnrollmentClass hiện hành phù hợp (ràng buộc UNIQUE(enrollment_class_id, class_session_id))

### 5.3 Flow API/UI

- [x] 1. upload file (POST /api/v1/imports/upload)
- [x] 2. parse workbook/sheet (exceljs)
- [x] 3. preview rows (GET /api/v1/imports/:importId/preview)
- [x] 4. mapping columns (POST /api/v1/imports/:importId/mapping)
- [x] 5. validation report (POST /api/v1/imports/:importId/validate)
- [x] 6. user confirm (POST /api/v1/imports/:importId/confirm)
- [x] 7. import (batch-safe processing)
- [x] 8. ImportBatch/ImportRow (lưu log chi tiết từng dòng)
- [x] 9. downloadable/visible error report (GET /api/v1/imports/:importId/errors?download=true)

### 5.4 Validation

- [x] duplicate IDs (kiểm tra trong file và cơ sở dữ liệu)
- [x] unknown references (kiểm tra học viên chưa có trong hệ thống khi import Sheet 3)
- [x] invalid date/time (xử lý an toàn cả serial date và text string)
- [x] negative/unusual session counts (báo lỗi nếu total_sessions không phải số nguyên)
- [x] ambiguous class history (fallback an toàn vào lớp học viên)
- [x] invalid attendance code (bắt lỗi text bất thường, không silent-fix)
- [x] data mismatch Sheet 1 vs Sheet 3

### 5.5 Transaction strategy

- [x] Không bắt buộc toàn file là một transaction nếu file lớn; xử lý theo row isolation: các dòng hợp lệ được import, dòng lỗi lưu vào `ImportRow` trạng thái `FAILED` kèm thông báo lỗi chi tiết.

### 5.6 Correction/audit

- [x] Q-004 đã áp dụng: Chỉ ADMIN và MANAGE có quyền upload/mapping/import; ghi nhận đầy đủ `AuditLog`.

### 5.7 Export

- [x] Export danh sách học viên đối soát (`GET /api/v1/imports/export/students`)
- [x] Export bảng điểm danh đối soát (`GET /api/v1/imports/export/attendance`)
- [x] Template mẫu chuẩn tải về (`GET /api/v1/imports/template/:type`)

### 5.8 Test fixtures

- [x] valid Sheet 1 & Sheet 3 (`valid_sheet1.xlsx`, `valid_sheet3.xlsx`)
- [x] missing column
- [x] duplicate ID
- [x] invalid dates
- [x] unknown student/class
- [x] attendance invalid
- [x] mixed errors (`invalid_sheet1.xlsx`, `invalid_sheet3.xlsx`)

## API contract

Chốt flow trong `docs/api/imports.md` + `docs/api/openapi.yaml`. Đã đồng bộ đầy đủ các endpoint upload/preview/mapping/validate/confirm/status/errors/batches/template/export.

## Exit criteria

- [x] Preview/mapping hoạt động.
- [x] Invalid data không bị silent-fix.
- [x] ImportBatch/ImportRow đúng.
- [x] Error report rõ, tải được file Excel lỗi.
- [x] Permission import đúng (chỉ ADMIN/MANAGE có quyền import, CS chỉ xem).
- [x] API contract/docs liên quan đã đồng bộ với implementation.
- [x] 14/14 tests integration passed (toàn bộ 34 tests backend passed).
- [x] Frontend ImportWizard & History build thành công.

## Implementation notes

1. Bổ sung `external_id String? @unique` vào model `Student` trong Prisma schema để làm khóa liên kết bất biến giữa Sheet 1, Sheet 3 và Database theo đúng quyết định Q-001.
2. Thư viện sử dụng: `exceljs` cho xử lý định dạng file Excel (đọc serial date, tạo template, tạo file báo cáo lỗi) và `multer` cho multipart upload.
3. Frontend hỗ trợ giao diện Wizard 4 bước: Tải file & Chọn loại -> Xem trước & Ánh xạ cột -> Báo cáo kiểm tra dữ liệu -> Kết quả & Tải lỗi.
4. Đã kiểm thử trực tiếp trên file thực tế `docs/data/cham_soc_hoc_vien.xlsx` (2,322 dòng Sheet 1 và 1,009 dòng Sheet 3) với độ chính xác nhận diện cột 100%.

## Changes from original plan

Không có thay đổi kiến trúc so với implementation plan đã được duyệt.
