# Phase 5 — Excel Import/Export Sheet 1 + Sheet 3

- Status: NOT_STARTED
- Started at:
- Completed at:
- Dependencies: Phase 4 DONE
- Open questions: Q-001, Q-003, Q-004 phải đủ rõ cho mapping/correction.

## Mục tiêu

Import dữ liệu thực tế có preview/mapping/validation/log; không import âm thầm.

## Checklist chi tiết

### 5.1 Sheet 1

- [ ] Student
- [ ] Enrollment
- [ ] Package
- [ ] Teacher/Class khi dữ liệu đủ
- [ ] EnrollmentClass
- [ ] thông tin CS/status/date tương ứng spec

  Không tách string/lịch sử lớp bằng heuristic nguy hiểm nếu format chưa chốt; phải preview và báo ambiguous row.

### 5.2 Sheet 3

- [ ] ClassSession
- [ ] Attendance
- [ ] EnrollmentClass hiện hành phù hợp

### 5.3 Flow API/UI

- [ ] 1. upload file
- [ ] 2. parse workbook/sheet
- [ ] 3. preview rows
- [ ] 4. mapping columns
- [ ] 5. validation report
- [ ] 6. user confirm
- [ ] 7. import
- [ ] 8. ImportBatch/ImportRow
- [ ] 9. downloadable/visible error report

### 5.4 Validation

- [ ] duplicate IDs
- [ ] unknown references
- [ ] invalid date/time
- [ ] negative/unusual session counts
- [ ] ambiguous class history
- [ ] invalid attendance code
- [ ] data mismatch Sheet 1 vs Sheet 3

### 5.5 Transaction strategy

- [ ] Không bắt buộc toàn file là một transaction nếu file lớn; phải chốt batch/row strategy đảm bảo có thể giải thích partial result.

### 5.6 Correction/audit

- [ ] Q-004 phải xác định ai được sửa record import cũ và lock policy.

### 5.7 Export

- [ ] Nếu spec yêu cầu export đối chiếu, dùng định dạng ổn định và không phụ thuộc UI table state âm thầm.

### 5.8 Test fixtures

- [ ] valid
- [ ] missing column
- [ ] duplicate
- [ ] invalid dates
- [ ] unknown student/class
- [ ] attendance invalid
- [ ] mixed errors


## API contract

Chốt flow trong `docs/api/imports.md` + `docs/api/openapi.yaml` trước khi frontend làm wizard import.

Contract phải thể hiện rõ upload/preview/mapping/validate/confirm/status/error report. Nếu quyết định gộp bước, cập nhật docs trước implementation.

## Exit criteria

- [ ] Preview/mapping hoạt động.
- [ ] Invalid data không bị silent-fix.
- [ ] ImportBatch/ImportRow đúng.
- [ ] Error report rõ.
- [ ] Permission import đúng.

- [ ] API contract/docs liên quan đã đồng bộ với implementation.

## Implementation notes

## Changes from original plan


## Agent notes

Đọc `docs/product/business-rules.md` và API contract trước; không tự suy đoán mapping/ID chưa chốt.
