# Project Status

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
