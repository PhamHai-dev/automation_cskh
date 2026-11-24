# Project Status

## Điểm danh Theo lớp học — đồng nhất lớp 1:1 — 2026-11-24

- Theo yêu cầu user, lớp 1:1 không còn gộp lớp/học viên vào một dòng: mọi mô hình có dòng lớp với số học viên + mở/thu gọn và dòng học viên bên dưới.
- Điểm danh/ghi chú/JLPT nhập ở dòng học viên; dòng lớp giữ tổng hợp, bài học chung và thao tác lớp. Nút mở/thu gọn tất cả bao gồm 1:1; badge mô hình và dữ liệu giữ nguyên.
- 22/22 frontend regression tests đạt (2 test mới cho hierarchy/expand all). Browser desktop/tablet/mobile chưa trực tiếp xác minh do lỗi CDP trước đó; không đánh dấu UI acceptance pass.

## JLPT — sửa ô bị khóa với học viên đã chuyển lớp — 2026-11-24

- Root cause đã xác minh: học viên trong ảnh thuộc EnrollmentClass TRANSFERRED nhưng API chỉ trả ACTIVE. User duyệt cho nhập tại đúng ca đã có Attendance chưa xóa.
- Đã đồng bộ list/PATCH/bulk theo điều kiện ACTIVE hoặc TRANSFERRED + Attendance đúng session; giữ trạng thái xếp lớp, quyền lớp/CS và teacher assignment theo ngày ca.
- Live teacher API trên clone QA: GET 200 chứa đúng dòng; PATCH 200, GET đọc lại đúng; khôi phục giá trị ban đầu 200 và xác nhận vẫn TRANSFERRED. Không chạm DB gốc.
- Backend typecheck và 40/40 JLPT tests đạt. Browser UI vẫn chưa trực tiếp xác minh; cần tải lại trang để bỏ cache eligibility cũ.

## JLPT — tiêu chí nhập trực tiếp trong bảng điểm danh — 2026-11-24

- Theo yêu cầu mới, bỏ nút/modal Nhật ký JLPT khỏi màn điểm danh; thêm Chuẩn bị bài, Thái độ học tập, Bài tập về nhà, Số câu đúng ở cả Theo học viên và Theo lớp học (bao gồm dòng học viên con).
- Mỗi ô dùng đúng class/session/enrollment-class, tự lưu một field; dùng chung dữ liệu tải một lần mỗi ca, nullable values, trạng thái lưu/lỗi/thử lại. Không tự tạo ca từ tiêu chí học tập.
- CS/chế độ chỉ xem không sửa; khóa khi GV đánh dấu A/B/C/D/E hoặc ca bị hủy, giữ dữ liệu cũ. Kaiwa không có các cột mới khi lọc riêng.
- Local dev hiện dùng DB clone `automation_cskh_jlpt_qa` đã migrate/backfill an toàn và bật feature flag; DB gốc chưa migrate. Các mục bên dưới là checkpoint lịch sử trước rollout clone.
- Frontend typecheck/build đạt; 20/20 frontend tests đạt (6 regression mới). Lint bị chặn do thiếu ESLint config sẵn có.
- Browser QA/persistence và desktop/tablet/mobile **chưa xác minh**: công cụ đọc DOM/chụp ảnh lỗi CDP/Playwright timeout. Không coi đây là bằng chứng UI đã pass.

## Nhật ký học tập JLPT — Hoàn tất kế hoạch A–F — 2026-11-24

- Đã hoàn tất contract/schema/template/ClassSession/learning record/UI và NKHT manual preview→resolve→confirm/export.
- Google Sheet có flow `JLPT_LEARNING_LOG` multi-sheet với absolute-source semantics, run history/audit và hàng chờ chuẩn hóa theo data scope.
- Sync history có tab Chờ chuẩn hóa; export round-trip dùng `O/X` + `[STATUS:...]`, không xuất `0.5X`; TEACHER bị cấm export/import.
- Hardening cuối bổ sung task idempotency bằng unique pending key, rollback-safe transaction, shared Attendance post-commit lifecycle và ADMIN-only config/run sync; MANAGE chỉ resolve task trong scope.
- Xác minh: backend typecheck, frontend build, Prisma validate, OpenAPI 83 paths/65 schemas/104 refs, 17/17 import-sync hardening tests và 51/51 JLPT/ClassSession regression tests, `git diff --check` đạt.
- Rollout vẫn an toàn: `VITE_ENABLE_JLPT_LEARNING_LOG=false`; migration chưa apply và không ghi business data lên DB hiện tại.

## Nhật ký học tập JLPT — Chặng C learning record & UI — 2026-11-24

- Đã triển khai API list/PATCH một field/bulk transaction cho `JlptLearningRecord`, với AuditLog cùng transaction và không kích hoạt Attendance automation.
- Enforce row-level scope cho CS/MANAGE, attendance privacy cho pure TEACHER, teacher assignment hiệu lực theo ngày buổi học và invariant class/session/enrollment.
- UI JLPT có chế độ Theo buổi và Toàn khóa, autosave trạng thái từng ô, bulk có xác nhận, TEST highlight, CS read-only và khóa/ẩn tiêu chí khi vắng nhưng giữ dữ liệu DB.
- Feature được gate mặc định bằng `VITE_ENABLE_JLPT_LEARNING_LOG=false`; migration JLPT vẫn chưa apply trên DB hiện tại.
- Xác minh: backend typecheck, 44/44 regression test JLPT/ClassSession trong 3 suite, frontend production build, OpenAPI parse và diff check đạt. Browser responsive/Kaiwa QA còn chờ isolated migrated environment; frontend lint bị chặn vì chưa có ESLint config.

## Nhật ký học tập JLPT — Chặng B template & ClassSession backend — 2026-11-24

- Đã triển khai backend cho singleton template toàn cục: CRUD, preview/apply theo lớp, class template status, change request/approve/reject và chuyển `Class.program_type`.
- Apply/approval chỉ cập nhật `ClassSession.session_type/session_title` đã tồn tại; không tạo/xóa session hoặc đổi ngày/giờ. Session thiếu/thừa được trả dưới dạng diff/cảnh báo.
- RBAC/data scope đã enforce: ADMIN tạo/xóa; MANAGE chỉ đổi/duyệt template khi bao phủ mọi lớp JLPT; TEACHER chỉ gửi change request từ lớp được phân công; CS/TEACHER không sửa trực tiếp metadata template.
- Bổ sung AuditLog cho tạo/sửa/xóa template, apply metadata, program transition và review request; khóa đổi `session_number` hoặc xóa session khi đã có dữ liệu JLPT.
- Xác minh đạt: backend typecheck, 42/42 test trong 4 suite và `git diff --check`. Test persistence mới dùng mock vì database hiện tại chưa có migration JLPT.
- Migration `20261123103000_add_jlpt_learning_log_foundation` vẫn **chưa chạy**; không ghi dữ liệu nghiệp vụ trên database hiện tại.

## Nhật ký học tập JLPT — Chặng A contract & data foundation — 2026-11-23

- Chặng A hoàn tất theo thiết kế một template JLPT singleton toàn cục: source-of-truth docs, OpenAPI, Prisma schema, migration thủ công và dry-run audit đã đồng bộ.
- Q-017 đã RESOLVED: course code chỉ xét EnrollmentClass ACTIVE; level chỉ tự đề xuất khi class code và mọi active course code cùng chỉ về một N2–N5, ngoại lệ xử lý thủ công.
- Audit chỉ đọc 1.399 lớp: 1.071 Kaiwa, 328 JLPT, 0 mixed/unknown; 7 level chuẩn, 243 level đề xuất an toàn, 78 level cần xử lý thủ công; active course code gồm 270 unique, 2 missing và 56 multiple.
- Prisma format/validate, OpenAPI parse/ref, backend typecheck, 4/4 unit test, migration/write safety scan và `git diff --check` đều đạt. Tại thời điểm checkpoint Chặng A, các chặng API implementation, UI, import/export và Google Sheet sync chưa bắt đầu; hiện đã hoàn tất trong mục A–F phía trên.
- Migration `20261123103000_add_jlpt_learning_log_foundation` **chưa chạy trên database hiện tại**; không có dữ liệu nghiệp vụ nào được ghi bởi Chặng A.

## Lịch sử điểm danh riêng tư cho Giáo viên — 2026-11-23

- Tài khoản thuần `TEACHER` chỉ thấy trạng thái do mình chấm trong `Lịch sử điểm danh`; bảng tháng dùng `1/A/B/C/D/E`, `–` khi ca đã có nhưng GV chưa chấm và `·` khi không có ca.
- Nhật ký chỉ còn `Trạng thái của tôi`; drawer chỉ đọc hiển thị trạng thái GV, bài học, ghi chú GV và `cs_note`. Không có CSKH/final/reconciliation/admin resolution hoặc thao tác tạo/sửa/xóa/hàng loạt trong lịch sử.
- Backend role-shape dữ liệu ở class/session/attendance và teacher tracking/write responses nên trường nhạy cảm không xuất hiện trong Network. Tài khoản đa vai trò giữ response/UI đặc quyền hiện hành.
- Xác minh: presenter privacy 4/4 test pass; teacher-student-info 13/13 test pass. Backend typecheck và frontend build được chạy lại sau thay đổi cuối.


## Phân cụm sidebar staff — 2026-11-20

- Sidebar ADMIN được phân thành tám cụm: Tổng quan, Chăm sóc khách hàng, Đào tạo, Giáo viên, Đa kênh, Tự động hóa & Chiến dịch, Dữ liệu và Quản trị hệ thống.
- MANAGE dùng cùng cấu trúc nhưng không có Người dùng & Phân quyền/Cấu hình hệ thống; CS không có Gói học và nhóm Giáo viên. Sidebar tài khoản chỉ có TEACHER giữ nguyên.
- Thêm route `/teachers/schedule` và `/teachers/tasks` cho ADMIN/MANAGE; cả hai tái sử dụng màn hình hiện có và bắt buộc chọn giáo viên trước khi tải dữ liệu.
- Route `/imports` vẫn hoạt động nhưng không xuất hiện trong sidebar theo quyết định sản phẩm.

## Lưu trữ mềm học viên & chỉnh cột Thao tác — 2026-11-20

- Trang Hồ sơ học viên đã bỏ nút `Chuyển CVHT` ở header và nút `Đổi CVHT` từng dòng; cột Thao tác không còn sticky.
- Chỉ ADMIN thấy icon xóa và phải xác nhận. Backend `DELETE /api/v1/students/{studentId}` lưu `deleted_at/deleted_by_id`, không xóa Enrollment/Class/Attendance/Care/Messaging.
- Các truy vấn product, dashboard, import điểm danh, Zalo/LINE và automation đã lọc Student lưu trữ; worker không lấy delivery đang chờ của học viên đã lưu trữ.
- Import/Sheet Sync phát hiện mã học viên đã lưu trữ, đánh dấu lỗi hoặc từ chối thay vì cập nhật/phục hồi/tạo trùng; API tạo liên kết Zalo/LINE cũng kiểm tra Student active cho mọi vai trò.
- Migration `20261120045500_add_student_soft_delete` đã được áp dụng riêng và đánh dấu hoàn tất ngày 2026-11-20 để sửa lỗi `GET /api/v1/students` trả `500` do database thiếu `deleted_at/deleted_by_id`; không chạy gộp các migration cũ đang chờ.
- Xác minh sau sửa: đăng nhập ADMIN thành công; `GET /api/v1/students?page=1&pageSize=25` trả `200` với 25/2383 bản ghi; backend typecheck pass. Ba migration cũ `20261113064500_add_activity_history_indexes`, `20261117024000_unify_enrollment_package`, `20261120032000_align_excel_web_columns` vẫn chưa áp dụng.

## Zalo/LINE: sửa kết nối và kiểm thử product — 2026-11-19

- Đã chạy product local với MySQL hiện có, tắt worker/scheduler gửi tin. Không thay schema, migration hoặc dữ liệu nghiệp vụ.
- QR LINE tạo PNG tại backend; lỗi tạo QR, timeout, hủy/thay thế phiên được xử lý rõ ràng. Sửa listener Zalo/LINE, định dạng tin LINE, room realtime và khôi phục subscription sau reconnect.
- Bắt buộc token cho socket, tách room giữa hai nền tảng và bắt buộc chữ ký webhook OA; giữ nguyên scope chủ tài khoản.
- 113/113 test liên quan pass; backend/frontend typecheck/build pass. Browser kiểm chứng gửi/nhận/reconnect Zalo và LINE, hai tab LINE, và Omnichannel với provider giả lập + DB/API/Socket.IO thật; QR LINE kiểm chứng bằng SDK thật, chưa quét QR/PIN.
- Lint chưa chạy được do hạ tầng có sẵn: backend thiếu ESLint, frontend thiếu config. OpenAPI YAML đã parse thành công sau sửa một scalar mô tả cũ thiếu dấu nháy.
- Chưa xác nhận delivery tới điện thoại thật, bù lịch sử mất kết nối, đồng bộ reaction/read receipt, dedup counters hay recovery DB → queue/broadcast. Chưa bật production automation.
- Báo cáo chi tiết: `khao-sat/AI_REVIEW/10_ZALO_LINE_PRODUCT_FIX_VERIFICATION_2026-11-19.md`.

## Không gian Giáo viên — 2026-11-17

- Tài khoản chỉ có role `TEACHER` dùng sidebar riêng gồm Dashboard; Giảng dạy (Điểm danh, Lịch dạy, Việc cần xử lý, Học viên của tôi); Cá nhân (Thông báo, Hồ sơ giáo viên). Tài khoản đa vai trò giữ sidebar đầy đủ.
- Dashboard giáo viên tổng hợp lịch hôm nay/buổi tiếp theo, việc chờ xác nhận, thông báo mới, số lớp và số học viên đang phụ trách từ API có scope hiện hành.
- Route giáo viên chuẩn hóa dưới `/teacher/*`; alias route cũ vẫn redirect để giữ tương thích.
- Thêm `GET/PATCH /api/v1/teachers/me`; giáo viên chỉ tự sửa `phone` và `email`, thay đổi có AuditLog.
- Xác minh: backend typecheck pass; frontend production build pass; 5/5 unit test teachers pass; `git diff --check` pass. Browser QA pass ở desktop 1440×900, tablet 732px và viewport hẹp nhất công cụ hỗ trợ 627px; route mới, alias cũ, header link và drawer đều hoạt động, không có lỗi console hay tràn ngang. Frontend lint chưa chạy được vì repository chưa có ESLint config; build còn cảnh báo bundle lớn có sẵn.

## Chuẩn hóa Gói học Kaiwa/JLPT — 2026-11-17

- Đã thống nhất Kaiwa `Gói học` và JLPT `Gói SP` qua `Enrollment.package_id -> Package`; JLPT `Mã khóa học` lưu riêng tại `Enrollment.course_code`.
- Đã cập nhật API tạo/sửa, import/backup workbook và cột Gói học chung ở cả Hồ sơ Học viên lẫn Báo cáo Học tập & Chăm sóc.
- Migration dữ liệu đã được viết nhưng **chưa chạy** trên database hiện tại vì lịch sử migration đang không đồng nhất; không reset/migrate DB khi chưa có môi trường test an toàn.
- Prisma schema format/validate đạt; bước generate từng bị chặn do DLL Prisma đang được process khác sử dụng. Backend/frontend/tests đang được xác minh lại sau chỉnh sửa.

## Trung tâm Lịch sử hoạt động — 2026-11-13

- Đã tái thiết kế `/activity-logs` thành trung tâm bốn view: thao tác Web, đồng bộ, sao lưu và đăng nhập; desktop dùng bảng, mobile dùng card, modal chi tiết responsive.
- Filter, tab, trang, page size và từ khóa được lưu trong URL; từ khóa debounce 400ms; mặc định 7 ngày; preset Hôm nay/7/30 ngày/tùy chỉnh; page size 25/50/100.
- Backend áp dụng data scope ADMIN/MANAGE/CS, chặn TEACHER; login chỉ ADMIN/MANAGE; rollback sync chỉ ADMIN/MANAGE và kiểm tra scope.
- CSV xuất toàn bộ dữ liệu đã lọc của view hiện tại từ server, không chỉ trang đang xem; thời gian ghi rõ UTC+7.
- Retention vật lý 30 ngày chạy 02:30 theo `Asia/Ho_Chi_Minh` cho audit/login/sync; không xóa file sao lưu vật lý; ghi một audit tổng hợp.
- Đã thêm index Prisma và migration nhưng chưa chạy migration trên database.
- Xác minh: backend typecheck pass; 14/14 activity backend tests pass; frontend production build pass; 14/14 frontend feature regression tests pass; `git diff --check` pass.
- Browser QA pass ở desktop 1440×900, tablet khoảng 768px và mobile khoảng 390px cho bốn view, modal, refresh/export và responsive. Lint frontend chưa chạy được vì repository chưa có ESLint config.

## Cập nhật nhãn sao lưu — 2026-11-10

- Đã đổi nhãn hiển thị Backup → Sao lưu trong các trang Sheet/Excel liên quan; không đổi URL/API/logic/quyền hoặc dữ liệu.
- Đã triển khai UI theo Q-014 được duyệt: sidebar/submenu là điều hướng chính, bảng phẳng theo cột, menu thao tác phụ, bộ lọc thu gọn, form và lịch sử đồng nhất.
- Thiết kế hiện tại dùng header xanh nhạt, 4 KPI pastel và badge nhận diện luồng; không còn viền dọc màu hoặc dòng chi tiết xổ xuống. Thông tin kết nối/nơi lưu và phạm vi được đưa thành cột; cột Tự động chỉ còn công tắc.
- Frontend typecheck + production build pass; có cảnh báo bundle lớn. Lint chưa chạy được vì repository chưa có cấu hình ESLint.
- 9 kiểm thử render/static regression đạt; không thay thế kiểm thử E2E. Browser CDP timeout nên responsive/tương tác thực tế chưa xác minh. Không chạy đồng bộ/sao lưu thật.
- Đây là tác vụ UI riêng, không chuyển trạng thái hoặc bắt đầu phase Zalo.

## Cập nhật đối soát điểm danh — 2026-10-11

- Hàng chờ đối soát giờ được xác định đồng thời từ `reconciliation_state` và trạng thái thực tế hai phía, tránh hiển thị nhầm bản ghi cả GV lẫn CSKH chưa nhập trong Chờ CSKH.
- API pending trả danh sách giáo viên active được phân công theo lớp; giao diện thêm cột Giáo viên và tách cột/thao tác theo Chờ CSKH, Chờ GV và Tất cả.
- Backend typecheck và frontend production build pass. Integration suite reconciliation: 11/12 flow pass, gồm flow mới; Flow 4 Excel fixture và teardown FK vẫn fail do dữ liệu/test cleanup có sẵn.

## Kiểm tra merge — 2026-10-06

- Auto-attendance: đã thay user ID cố định bằng actor hệ thống riêng, inactive và không có role (user phê duyệt).
- Backend typecheck pass; 21/21 integration tests phân quyền giáo viên và auto-attendance pass trên database test riêng, Redis tắt.
- 46 regression tests chọn lọc đã pass trước đó.
- Chưa sẵn sàng deploy: migration replay lỗi tại `20260924043000_add_friend_zalo_uid` (AFTER avatar_url chưa tồn tại); database hiện tại lệch schema và chưa có lịch sử migration.
- Redis local chưa kết nối được; không tự bật worker gửi tin. Chính sách retry execution FAILED chưa thay đổi.
- Không reset/migrate database hiện tại; chưa commit/push/merge.


- Current phase: Phase 7 — Zalo technical spike
- Status: READY
- Last updated: 2026-09-22
- Next phase: Phase 7 — Zalo technical spike

## Blockers hiện tại

Không có blocker kỹ thuật cho Phase 7.

## Phase summary

| Phase | Tên | Status |
| --- | --- | --- |
| 0 | Foundation & project bootstrap | DONE |
| 1 | Database schema & core persistence | DONE |
| 2 | Auth/RBAC + Admin User Management | DONE |
| 3 | Student/Enrollment/Class/Teacher core | COMPLETED |
| 4 | ClassSession + Attendance | COMPLETED |
| 5 | Excel import/export Sheet 1 + Sheet 3 | COMPLETED |
| 6 | CareLog/CareTask + Dashboard | COMPLETED |
| 7 | Zalo technical spike | NOT_STARTED |
| 8 | Zalo automation production | NOT_STARTED |
| 9 | Hardening + production | NOT_STARTED |

## Cập nhật Giao diện & Dữ liệu Nghiệp vụ Thực tế (2026-09-21)

- **Đồng nhất vai trò Sale & CSKH**: Sale và nhân viên chăm sóc khách hàng là 1 (vai trò hệ thống `CS`). Cột `Sale` trong Sheet 1 ánh xạ vào tài khoản đăng nhập của nhân viên.
- **Ma trận Điểm danh theo Lịch Ngày (`/enrollments`)**: Hiển thị trực tiếp Thứ & Ngày theo tháng/tuần/năm (bỏ số thứ tự buổi), 11 cột cố định bên trái, bỏ cột chỉ số chuyên cần ĐH/BT, lọc học viên theo Sale phụ trách.
- **Danh sách Học viên Chuẩn Sheet 1 (`/students`)**: Cấu trúc bảng đầy đủ 28 trường dữ liệu của Sheet `1.Chăm sóc`, highlight badge đỏ cảnh báo nợ buổi âm (`-1`, `-2`...), modal xem chi tiết toàn diện.
- **Chuẩn hóa 5 tài khoản test**: Tạo lại cơ sở dữ liệu với 5 tài khoản test (`admin@gmail.com`, `cskh1@gmail.com`, `cskh2@gmail.com`, `cskh3@gmail.com`, `teacher@gmail.com`) có mật khẩu chung `123456`, gắn 13 học viên thực tế phân bổ cho 3 Sale.
- **Xác thực toàn diện**: 50/50 tests backend passed, frontend & backend build 0 lỗi, kiểm thử browser subagent thành công.

## Documentation readiness

- API contract documentation: READY (`docs/api/openapi.yaml`, `docs/api/care.md`, `docs/api/dashboard.md`, `docs/api/imports.md`).
- Sẵn sàng chuyển tiếp sang Phase 7 (Zalo technical spike).
