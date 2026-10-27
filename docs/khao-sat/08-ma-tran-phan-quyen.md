# 08 — Ma trận phân quyền (tổng hợp)

Nguồn: route guards `requireRoles` trong từng `*.routes.ts` [ĐKC-CODE, chi tiết 05a/05b] + **kết quả runtime ghi nhận ở lượt khảo sát trước (snapshot lịch sử)** + frontend ProtectedRoute [ĐKC-CODE 01/06]. Lượt hoàn thiện tài liệu này **không re-test** đăng nhập/API/DB, nên các con số runtime chỉ là snapshot.

Ký hiệu: ✅=route/guard hoặc code cho phép · ⛔=route/guard chặn · (d)=service có điều kiện scope trong code · ?=chưa xác minh. Con số ở mục 2 là quan sát lịch sử, không thay cho business policy.

## 1. Tuyến route (menu)
| Màn hình | ADMIN | MANAGE | CS | TEACHER |
|---|---|---|---|---|
| /dashboard | ✅ | ✅ | ✅(d) | ⛔ |
| /students | ✅ | ✅ | ✅**(d RT)** | ⛔ |
| /enrollments | ✅ | ✅ | ✅**(d RT)** | ⛔ |
| /classes, sessions, attendance sheet | ✅ | ✅ | ✅ | ✅(d) — scope lớp của GV qua `ClassTeacher` active và/hoặc `ClassSession.teacher_id`=`User.id` (`classes.scope.ts:17-60`); write-scope attendance kiểm tra riêng (`attendance.service.ts:41-55`) — hai phạm vi không đồng nhất (05a §7-8) |
| /attendance/reconciliation | ✅ | ✅ | ✅(d) | ⛔ trang (route A/M/C, 01 §2, 06 F.18); GV đi qua `/teacher/attendance-tracking` |
| /care | ✅ | ✅ | ✅ | ✅ trang nhưng **API log/task ⛔ TEACHER; chỉ notifications recipient=self** (`care.routes.ts:88-106`, 05b §2) |
| /imports | ✅ | ✅ | ✅ | ✅(?) |
| /packages, /teachers | ✅ | ✅ | ⛔ | ⛔ (route); teacher profile API riêng |
| /omnichannel/* (chat, accounts, contacts, groups, links) | ✅ | ✅ | ✅ | ⛔ |
| /automation (UI) | ✅ | ✅ | ✅ | ⛔ trang · **API automation chỉ `authenticate`, không có `requireRoles`** → scope do service/owner, xem 05b §4 |
| /teacher/my-sessions, /teacher/attendance-tracking | ✅ | ✅ | ✅ frontend (API reconciliation yêu cầu A/M/TEACHER, `reconciliation.routes.ts:51-64`) | ✅(d) |
| /settings/users | ✅ | ⛔(route) — **GET list cho MANAGE trong users.routes:9 [ĐKC-CODE, lệch docs]** | ⛔ | ⛔ |
| /settings/preferences | ✅ | ✅ | ✅ | ✅(mọi user — 06 phát hiện) |

## 2. Data-scope: suy từ code + snapshot runtime lịch sử
| Endpoint | ADMIN | CS id5 (CVHT02) | Trạng thái kết luận |
|---|---|---|---|
| `GET /students` | 2374 | **791** | scoped theo `cs_id`, nhất quán code 05a §3 (snapshot) |
| `GET /enrollments` | 2390 | **794** | scoped theo code 05a §11 (snapshot) |
| `GET /classes` | 1381 | **1381** | [CXM] `classes.scope.ts:11-14` trả `null` (= không lọc) cho ADMIN/MANAGE/CS; chưa gọi là lỗi vì policy hiển thị lớp toàn trường chưa chốt (09-Q1) |
| `GET /care-tasks` | 1 | 1 / (CS id6: 0) | scoped theo assignee/scope (`care.service.ts:90-159`); mẫu nhỏ nên không kết luận thêm |
| `GET /enrollments/11/care-logs` (cs_id=1) bởi CS id5/id6 | — | — | 403 "Bạn không có quyền truy cập gói học này", khớp `assertEnrollmentAccess` (`care.service.ts:54-86`) |

→ P-SCOPE-1: khác biệt scope **có thật trong code** — `/classes` không lọc cho CS còn `/students`/`/enrollments` có lọc. Việc CS thấy danh mục lớp toàn trường là **câu hỏi nghiệp vụ** (09-Q1), chưa được chứng minh là vi phạm; route chi tiết vẫn chạy `requireClassAccess` và không có write IDOR trong quan sát này.

## 3. Quyền thao tác ghi nhạy cảm (từ 05a/05b)
| Hành động | ADMIN | MANAGE | CS | TEACHER |
|---|---|---|---|---|
| Tạo/sửa User, reset phiên | ✅ | ⛔ | ⛔ | ⛔ |
| Duyệt ImportCreateRequest | ✅ | ✅(?) | ⛔/submit | — |
| Sửa enrollment cs_id (đổi CS) | ✅ | ✅ | ? (route PATCH nào cho đổi? — 05a) | ⛔ |
| Điểm danh lớp của mình | ✅ | ✅ | ✅(d) | ✅(d) |
| Resolve reconciliation | ✅ | ✅ | ✅(d phía CS) | ✅(d phía GV) |
| Kết nối/QR Zalo, LINE; limits; proxy; export credentials | ✅ | ✅(d qua zalo_account_accesses?) | ✅ owned (d) | ⛔ |
| **Export credentials Zalo/LINE (file phiên)** | ✅? — route requireRoles cụ thể xem 05b; đây là năng lực risk-high | | | |
| Tạo/sửa/xóa Workflow, Broadcast; cancel; retry | ✅ (d?) | ✅ | ✅(d?) | ⛔ |
| Gõ tay chat omnichannel (send) | — | — | ✅ (d theo account access + rate-limit 429) | — |

## 4. Phân quyền theo TRƯỜNG (field-level, phát hiện được)
- `Student.line_uid`: form CS/MANAGE/ADMIN đều sửa được (StudentsPage field) — [ĐKC-CODE].
- `User.code/CVHT`: chỉ ADMIN (users router `use(authenticate, requireRoles(['ADMIN']))` :12) — MANAGE gọi list GET vẫn được (route GET khai riêng :9).
- Attendance note/score cho GV: GV chỉ sửa dòng lớp mình (service filter) [ĐKC-CODE 05a; nhất quán scope chưa đồng nhất — đã ghi].
- `care_tasks.assignee` đổi CS gán: route PATCH `/care-tasks/:id` roles ADMIN/MANAGE/CS — CS khác gán chồng được không? [CXM → 09 Q4].

## 5. Frontend gate vs backend gate (điểm lệch — từ 06)
- **Home quick-links** gate *hẹp hơn* sidebar/route cho hai mục Care (chỉ A/M/C) và Imports (chỉ A/M) trong khi sidebar route cho A/M/C/T → C/T **mất lối vào từ trang chủ**, không phải thấy link rồi bị 403; sai role ở route khác bị redirect về `/` chứ không có trang 403 (06 F.1, F.21). Đây là lệch UX, backend vẫn là quyền quyết định.
- Sidebar /care hiện cho TEACHER và route cho phép; theo 05b §2 thì route care log/task là ADMIN/MANAGE/CS còn TEACHER chỉ được nhóm notification (`care.routes.ts:88-106`), vì vậy màn `/care` của GV có thể chỉ thấy thông báo của mình. Chưa có runtime test cho TEACHER [CXM → 09-Q3].
- `ProtectedRoute allowedRoles` **chỉ là UI guard**; mọi kết luận bảo mật lấy từ requireRoles backend (đã đối chiếu từng route ở 05a/05b).
