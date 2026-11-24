# Enhancement — Nhật ký học tập JLPT

- Status: IN_PROGRESS
- Started at: 2026-11-23
- Completed at: Chờ browser acceptance cho thay đổi inline ngày 2026-11-24
- Dependencies: Phase 4 và Phase 5 đã hoàn thành; Q-016 RESOLVED
- Open questions: Không còn câu hỏi nghiệp vụ chặn rollout; browser QA đang bị chặn kỹ thuật.

## Added during implementation — nhật ký là cột điểm danh (2026-11-24)

- User yêu cầu bỏ form riêng: bốn tiêu chí hiện nằm trong bảng nhập điểm danh ở cả Theo học viên/Theo lớp học, học viên lớp nhóm có ô riêng.
- Autosave đúng ca và EnrollmentClass, tải một lần mỗi ca; không tự tạo ca. Giữ quyền hiện tại, khóa A/B/C/D/E từ GV và ca hủy, không xóa dữ liệu cũ.
- Local dev đã chuyển sang clone `automation_cskh_jlpt_qa`, migrate và backfill phần an toàn, seed template 35 buổi; DB gốc không migrate. Ngoại lệ classification vẫn cần review trước production.
- Typecheck/build và 20/20 frontend tests đạt; 6 tests mới kiểm tra validation/absence/integration. Lint chưa chạy được vì thiếu ESLint config.
- [ ] Kiểm tra browser hai chế độ, desktop/tablet/mobile, nhiều ca và persistence. Bị chặn bởi CDP/Playwright timeout khi đọc DOM/chụp ảnh; không có screenshot pass.
- Các phần dưới giữ lịch sử kế hoạch A–F; UI Theo buổi/Toàn khóa ban đầu đã bị thay thế ở entrypoint điểm danh theo yêu cầu user.


## Mục tiêu

Mở rộng Attendance hiện tại để lưu đủ workbook NKHT JLPT, có template Buổi/KT động, import/sync/export và hàng chờ chuẩn hóa nhưng không tạo hệ thống điểm danh thứ hai.

## Phạm vi theo chặng

### Chặng A — Contract và nền dữ liệu

- [x] Ghi quyết định Q-016/Q-017, business rules và status.
- [x] Cập nhật API module docs và OpenAPI theo singleton template.
- [x] Cập nhật core data model.
- [x] Cập nhật Prisma schema.
- [x] Tạo migration SQL nhưng không chạy trên DB hiện tại.
- [x] Tạo dry-run backfill audit, chỉ đọc dữ liệu.
- [x] Tái chạy Prisma/OpenAPI/typecheck/test/safety checks sau quyết định singleton.

### Chặng B — Template và ClassSession

- [x] CRUD singleton template và apply preview; không có class binding.
- [x] Change request/approve/reject với data scope trên toàn bộ Class JLPT bị ảnh hưởng.
- [x] Program type Class và metadata session.
- [x] Audit và unit/regression test cô lập persistence mới.

### Chặng C — Learning record và UI nhập

- [x] JLPT record API và autosave từng field.
- [x] UI JLPT theo buổi và toàn khóa.
- [x] Kaiwa regression bằng suite backend và frontend production build; browser QA trên DB hiện tại bị feature flag chặn an toàn.

### Chặng D — NKHT import/export

- [x] Manual preview/confirm/conflict resolution, ADMIN-only.
- [x] Export workbook theo năm + giáo viên/lớp và marker round-trip.
- [x] Parser test bằng fixture sinh từ cấu trúc workbook thật và kiểm tra O/X/0.5X.

### Chặng E — Google Sheet sync và chuẩn hóa

- [x] Flow `JLPT_LEARNING_LOG` đọc workbook nhiều sheet và absolute-source semantics.
- [x] Normalization queue, data scope và resolve/reconciliation/audit.
- [x] UI tab Chờ chuẩn hóa trong chi tiết lịch sử.
- [x] Blank-cell clear, ambiguous-X preservation và run-item history.

### Chặng F — Hardening

- [x] RBAC/data-scope và parser/round-trip tests.
- [x] Absolute blank-clear, ambiguous-X preservation, task idempotency, transaction rollback và Attendance post-commit lifecycle tests.
- [x] Backend typecheck, frontend build, Prisma validate, OpenAPI parse và diff check.
- [x] Responsive implementation dùng horizontal scroll/drawer và normalization layout responsive; feature flag mặc định tắt bảo vệ DB chưa migrate.
- [x] Rollout report, STATUS/CHANGELOG/phase docs và migration safety boundary.

## Invariants

- Attendance vẫn gắn `EnrollmentClass + ClassSession` và giữ unique hiện tại.
- NKHT chỉ cập nhật `teacher_status`; không ghi thẳng final.
- Không tự tạo ClassSession khi import/sync NKHT.
- Không xóa dữ liệu tiêu chí khi học viên vắng.
- Không silent-match học viên trùng tên.
- MANAGE không được duyệt ngoài data scope.
- Migration mới không được chạy trên database hiện tại.

## Test plan Chặng A

- OpenAPI YAML parse thành công và `$ref` nội bộ hợp lệ.
- `npx prisma format` và `npx prisma validate` đạt.
- Migration SQL được review không drop/truncate dữ liệu hiện có.
- Dry-run script chỉ thực hiện truy vấn đọc và sinh report; không gọi create/update/delete/raw execute.
- `git diff --check` đạt.

## Kết quả xác minh Chặng A

- Prisma `format` + `validate`: đạt.
- OpenAPI 3.1 YAML parse: đạt; 83 paths, 65 schemas và 104 internal refs hợp lệ.
- Backend typecheck: đạt.
- Unit test dry-run helpers: 4/4 đạt, gồm controlled level inference.
- Migration safety scan: không có `DROP TABLE`, `TRUNCATE`, `DELETE`, data backfill `UPDATE classes` hoặc `INSERT`.
- Dry-run script write scan: không có Prisma create/update/delete/upsert/raw query.
- `git diff --check`: đạt; chỉ có cảnh báo line-ending Windows.
- Không chạy `prisma migrate dev/deploy`, không apply migration và không ghi dữ liệu nghiệp vụ.

## Kết quả audit dữ liệu chỉ đọc

Audit mới trên database hiện tại ghi nhận:

- 1.399 Class: 1.071 Kaiwa và 328 JLPT theo Enrollment.
- 7 Class JLPT đã có level chuẩn `N2|N3|N4|N5`.
- 243 Class level legacy đủ điều kiện đề xuất level an toàn; vẫn cần ADMIN duyệt trước khi ghi.
- 78 Class cần ADMIN xác định level thủ công do Combo, thiếu hoặc xung đột.
- Course code ACTIVE: 270 Class có đúng một mã, 2 Class không có mã và 56 Class có nhiều mã.
- 0 Class mixed Kaiwa/JLPT; 0 Class unknown.
- Báo cáo đầy đủ: artifact `jlpt-classification-audit.json`.

Q-017 đã chốt và audit đã áp dụng: course code chỉ xét EnrollmentClass JLPT `ACTIVE`; level chỉ được đề xuất khi class code và mọi active course code cùng chỉ về đúng một N2–N5. Script không ghi DB; 78/2/56 ngoại lệ tương ứng chuyển ADMIN xử lý.

## Exit criteria Chặng A

- Docs, OpenAPI, Prisma và migration thống nhất singleton template, tên field/enum/quan hệ.
- Có báo cáo dry-run cho mixed/unknown, level hợp lệ/đề xuất/thủ công và zero/one/multiple active course code.
- Không có migration nào được apply.
- Dừng chờ user review trước khi bắt đầu Chặng B.

## Implementation notes

- Vì lịch sử migration đang không đồng nhất, migration được viết thủ công và chỉ validate tĩnh.
- `JlptSessionTemplate.singleton_key = GLOBAL` enforce tối đa một template; `Class` không có template FK.
- Schema migration mặc định Class hiện có là `KAIWA` chỉ để thêm cột an toàn; không được bật feature dựa trên default này. Deployment phải dùng report audit đã review để backfill program/level.

## Changes from original plan

- Chặng A được tách thành checkpoint riêng theo quy tắc phase của repository.
- Template `level + course_code` đã được thay bằng singleton toàn cục theo quyết định người dùng.
- Audit phân biệt course code ACTIVE và lịch sử, đồng thời chỉ đề xuất level khi các tín hiệu đồng thuận; không tự ghi DB.

## Kết quả xác minh Chặng B

- Backend typecheck: đạt sau khi generate Prisma Client đầy đủ với native engine; không dùng `--no-engine` vì chế độ đó làm runtime MySQL yêu cầu URL `prisma://`.
- 42/42 test trong 4 suite đạt: JLPT service, metadata ClassSession, actual-session và cancel-session audit.
- Test Chặng B dùng repository/Prisma mock; không chạm database hiện tại chưa có bảng JLPT.
- `git diff --check`: đạt; chỉ có cảnh báo line-ending Windows.
- Không chạy `prisma migrate dev/deploy`, không apply migration và không ghi dữ liệu nghiệp vụ.

## Exit criteria Chặng B

- API singleton template, preview/apply, change request/review và chuyển program đã được mount với RBAC/data scope.
- Apply chỉ sửa `session_type/session_title` của ClassSession tồn tại; session thiếu/thừa chỉ được báo cáo.
- CS/TEACHER không thể sửa trực tiếp metadata template qua generic ClassSession API.
- `session_number` và thao tác xóa được bảo vệ khi đã có dữ liệu JLPT; các thay đổi metadata quan trọng có AuditLog.
- Dừng chờ user review trước khi bắt đầu Chặng C.

## Kết quả xác minh Chặng C

- Ba endpoint learning record đã được mount theo contract: list theo class/session, PATCH đúng một field và bulk transaction all-or-nothing.
- GET lọc từng EnrollmentClass theo owner/viewer scope của CS/MANAGE; pure TEACHER dùng attendance privacy presenter.
- Write chỉ cho ADMIN/MANAGE/TEACHER; giáo viên phải có assignment hiệu lực tại ngày buổi học; cross-class/inactive/out-of-scope bị chặn trước persistence.
- Mỗi create/update/clear learning record được upsert cùng AuditLog trong một transaction và không gọi Attendance automation.
- UI JLPT tách khỏi flow Kaiwa: bảng theo buổi, matrix toàn khóa, TEST highlight, cell save state, bulk confirm, CS read-only, absent hide/lock nhưng không xóa dữ liệu.
- Rollout UI được gate bằng `VITE_ENABLE_JLPT_LEARNING_LOG=false`; chỉ bật sau khi migration/backfill đã được review trên môi trường đích.
- Backend typecheck: đạt.
- Regression JLPT/ClassSession: 44/44 test trong 3 suite đạt, gồm strict patch/bulk schema, scope/privacy/assignment và session metadata.
- Frontend production build: đạt; chỉ còn cảnh báo chunk lớn đã tồn tại ở bundle.
- OpenAPI parse: đạt, 83 paths và 65 schemas.
- `git diff --check`: đạt; chỉ có cảnh báo line-ending Windows.
- Frontend lint không thể chạy vì repository chưa có ESLint configuration; lệnh dừng trước khi lint source.
- Không chạy `prisma migrate dev/deploy`, không apply migration và không ghi dữ liệu nghiệp vụ.

## Exit criteria Chặng C

- API, scope, privacy, audit và autosave/bulk behavior đã được unit-test bằng mock persistence do DB hiện tại chưa có bảng JLPT.
- UI dùng responsive grid/horizontal scroll và giữ nguyên Kaiwa branch; feature flag vẫn mặc định tắt trên DB chưa migrate.

## Kết quả xác minh Chặng D–F

- Parser đọc `Info` và toàn bộ sheet `NKHT N2–N5`, gom đúng block 6 tiêu chí và map cột theo `session_number`; thiếu ClassSession là lỗi, không tạo lịch/lớp/học viên.
- Manual import là ADMIN-only, bắt buộc preview token khớp hash workbook, resolve toàn bộ conflict/X ghi chú/header mismatch trước confirm; blank giữ dữ liệu web.
- Export cho ADMIN/MANAGE/CS theo class scope, lọc năm + giáo viên/lớp, bỏ level sai có cảnh báo, xuất `O/X` và marker `[STATUS:...]`; không xuất `0.5X`.
- Google Sheet có flow `JLPT_LEARNING_LOG`; populated overwrite, blank clear, ambiguous X giữ teacher status và tạo task, mọi write được audit/run-item hóa.
- Hàng chờ chỉ ADMIN/MANAGE xem và xử lý theo class scope; resolve nghỉ phép/không phép cập nhật teacher side rồi tái tính reconciliation.
- Sync history có tab Chờ chuẩn hóa responsive với thao tác resolve/reject.
- Parser/round-trip tests: 7/7 đạt.
- Sync hardening tests: 5/5 đạt cho blank clear, ambiguous X, task idempotency, rollback và MANAGE scope; RBAC tests xác minh ADMIN-only cho cấu hình/chạy `JLPT_LEARNING_LOG` mà không đổi quyền các flow cũ.
- Attendance writes từ import/sync/resolve chạy shared post-commit lifecycle sau transaction với `NO_SEND`; rollback không phát sinh side effect.
- Backend typecheck, frontend production build, OpenAPI parse, Prisma validate và `git diff --check`: đạt trong lần hardening cuối.
- Regression trước Chặng D–F: JLPT/ClassSession 44/44, core/reconciliation/reassign 37/37, attendance 30/30, classes/enrollment 23/23.
- Browser QA nối DB mới được chuyển thành gate rollout trên clone đã migrate; không bật feature hoặc apply migration vào DB hiện tại.
- Không chạy `prisma migrate dev/deploy`, không apply migration và không ghi business data vào database hiện tại.

## Rollout

1. Tạo DB clone/test và apply migration JLPT tại đó.
2. Chạy dry-run classification, review 78 level/2 zero-course/56 multi-course exceptions.
3. Chạy API/browser QA desktop 1440px, tablet 768px, mobile 390px trên môi trường đã migrate.
4. Backfill program/level đã duyệt rồi mới bật `VITE_ENABLE_JLPT_LEARNING_LOG=true`.
5. Production rollout theo canary; giữ feature flag false để rollback UI tức thời.

## Fix eligibility sau phản hồi không nhập được (2026-11-24)

- Root cause: dòng điểm danh chứa EnrollmentClass TRANSFERRED nhưng learning API lọc ACTIVE nên UI khóa sai kỳ vọng.
- User duyệt exception TRANSFERRED chỉ cho đúng session có Attendance chưa xóa; không thay trạng thái, không mở các trạng thái khác, giữ mọi data scope/assignment guard.
- List/PATCH/bulk dùng chung Prisma predicate; frontend thử tải lại eligibility khi có Attendance mới và thông báo lý do rõ hơn.
- Backend typecheck và 40/40 JLPT tests đạt; Jest có cảnh báo worker teardown. Browser QA vẫn chưa xác minh do lỗi CDP trước đó.

## Đồng nhất lớp 1:1 trong chế độ Theo lớp học (2026-11-24)

- User duyệt hiển thị 1:1 giống hierarchy của lớp nhóm: dòng lớp riêng và dòng học viên con, mở/thu gọn được.
- Bỏ nhánh flatten 1:1; giữ badge mô hình và ID EnrollmentClass, không đổi dữ liệu hay quyền. Ô điểm danh/JLPT chuyển về dòng học viên, dòng lớp giữ tổng hợp/bài học chung.
- Nút mở/thu gọn tất cả áp dụng cả 1:1; thêm aria-expanded và ID dòng để kiểm tra.
- 22/22 frontend tests đạt, trong đó 2 regression mới cho class hierarchy. Browser/responsive chưa trực tiếp xác minh do công cụ CDP lỗi ở lần kiểm tra trước.
