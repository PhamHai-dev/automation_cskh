> 📄 Phần của bộ tài liệu spec — xem `../README.md` để biết thứ tự đọc và bối cảnh tổng thể.

# 6. Roadmap triển khai

Roadmap chi tiết nằm trong `docs/phases/`. AI chỉ triển khai một phase tại một thời điểm và phải tuân thủ `docs/delivery/phase-protocol.md`.

| Phase | Mục tiêu chính | File chi tiết |
| --- | --- | --- |
| 0 | Foundation, repo, infra local, frontend design foundation | `phases/phase-00-foundation.md` |
| 1 | Prisma/MySQL schema, migrations, seed | `phases/phase-01-database.md` |
| 2 | Auth/RBAC, session, Admin User Management | `phases/phase-02-auth-rbac.md` |
| 3 | Student/Enrollment/Class/Teacher core | `phases/phase-03-core-student-class.md` |
| 4 | ClassSession + Attendance | `phases/phase-04-attendance.md` |
| 5 | Import/export Excel Sheet 1 + Sheet 3 | `phases/phase-05-excel-import.md` |
| 6 | CareLog/CareTask + Dashboard | `phases/phase-06-care-dashboard.md` |
| 7 | Zalo technical spike | `phases/phase-07-zalo-spike.md` |
| 8 | Zalo automation production | `phases/phase-08-zalo-automation.md` |
| 9 | Hardening + production readiness | `phases/phase-09-hardening-production.md` |

## Nguyên tắc roadmap

- Không tự chuyển phase sau khi hoàn thành.
- Phase nào có open question ảnh hưởng implementation thì phải hỏi user.
- Mọi thay đổi scope/architecture phải cập nhật phase + docs trước hoặc cùng lúc với code sau khi được duyệt.
- Sau mỗi phase phải chạy quality gate, cập nhật `STATUS.md`, `CHANGELOG.md`, `OPEN_QUESTIONS.md` và báo cáo user.
