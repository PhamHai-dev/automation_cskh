# Phase Index

AI chỉ triển khai một phase tại một thời điểm.

Mỗi phase có `Checklist chi tiết` chia theo sub-phase; tick từng dòng khi hoàn thành task đó. `Exit criteria` vẫn là điều kiện cuối để đóng cả phase.

| Phase | File | Mục tiêu |
| --- | --- | --- |
| 0 | `phase-00-foundation.md` | Bootstrap repo, infrastructure, frontend design foundation |
| 1 | `phase-01-database.md` | Prisma/MySQL schema, migrations, indexes, seed baseline |
| 2 | `phase-02-auth-rbac.md` | Auth, sessions, role/data scope, Admin User Management |
| 3 | `phase-03-core-student-class.md` | Student, Enrollment, Package, Teacher, Class, EnrollmentClass |
| 4 | `phase-04-attendance.md` | ClassSession, Attendance, point-danh flows |
| 5 | `phase-05-excel-import.md` | Import/export Sheet 1 + Sheet 3 |
| 6 | `phase-06-care-dashboard.md` | CareLog/CareTask + dashboards/filters |
| 7 | `phase-07-zalo-spike.md` | Technical spike zca-js, chưa production integration |
| 8 | `phase-08-zalo-automation.md` | MessageRule/Delivery/Outbox/BullMQ/Zalo production flow |
| 9 | `phase-09-hardening-production.md` | Security, monitoring, backup, E2E, production readiness |

Mỗi phase phải cập nhật trạng thái, test result, changes from plan và open questions trước khi đánh dấu DONE.
