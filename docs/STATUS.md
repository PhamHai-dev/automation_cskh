# Project Status

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
