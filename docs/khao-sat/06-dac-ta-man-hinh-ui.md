# 06. Đặc tả màn hình UI theo mã nguồn

Ngày khảo sát: 24/10/2026. Phạm vi là các page được import/mount từ `frontend/src/App.tsx` và component con quan trọng của chúng. Không chạy frontend nên các nhận định cần runtime đánh dấu **[SLCC]**. **[ĐKC]** = đọc trực tiếp mã; **[CXM]** = chưa có bằng chứng trong phạm vi khảo sát. Quyền route là ProtectedRoute; quyền hiển thị/ghi dữ liệu có thể hẹp hơn.

## Quy ước dùng chung

- `DataTable` mặc định phân trang client 10 dòng/trang, cho phép 10/20/50/100; server mode dùng `page`, `total`, callback và vẫn mặc định page size 10 (`frontend/src/components/common/DataTable.tsx:44-77,148-199`). Loading dùng skeleton, rỗng dùng Inbox + `emptyMessage` (`:100-123`). Không thấy cơ chế sort chung trong DataTable; sort/filter riêng từng page.
- `ProtectedRoute` tải phiên → loading; không user → `/login`; sai role → `/` (`frontend/src/components/auth/ProtectedRoute.tsx:9-28`). Vì vậy “ẩn nút” và “chặn route” là hai lớp khác nhau.
- API được ghi theo object gọi trong page, còn endpoint cụ thể nằm ở file `features/*/api/*.api.ts`. Các biểu thức `api.*` dưới đây là nguồn gọi thực tế; không suy diễn request ngoài mã đã đọc.
- Field “bắt buộc” chỉ ghi khi HTML có `required`, điều kiện disable, hoặc validator code thể hiện rõ. Field readonly/không cho sửa ghi riêng. Error thường Toast; không có bằng chứng cho retry tự động trừ khi nêu rõ. [SLCC] thông báo lỗi có thể khác backend.

# A. TỔNG QUAN

<a id="a1"></a>
## A1. LoginPage — `/login`

- **Mục đích:** đăng nhập, hiển thị lỗi và chọn tài khoản demo; API `apiClient` (`frontend/src/pages/auth/LoginPage.tsx:1-4,24-43`). `/dang-nhap` redirect về đây (`App.tsx:47-50`).
- **Bảng/dữ liệu:** không có bảng. Email (`placeholder="Nhập email của bạn"`), password (`placeholder="Nhập mật khẩu"`), nút hiện/ẩn mật khẩu; không có filter/sort/pagination (`LoginPage.tsx:83-130`).
- **Form/nút:** submit đăng nhập; Forgot password và Contact admin là nút UI (`:100-178`); danh sách demo cho phép chọn role/email, title lộ mật khẩu demo [giá trị credential không công bố] (`:178-200`). [ĐKC] Chưa thấy dialog reset password trong page; [CXM] hành vi Forgot/Contact có thể được xử lý ở nơi khác.
- **API/Trạng thái/quyền:** handler gọi `POST /auth/login` với `{email,password}`, rồi `login(accessToken,user)` và navigate `/` khi thành công (`LoginPage.tsx:30-46`). State `rememberMe` tồn tại nhưng không được đưa vào request trong handler [ĐKC]/[SLCC] — cần kiểm thử xem checkbox có tác dụng lưu phiên hay chỉ là UI. `error` hiện banner + toast; submit loading; không cần role.

<a id="a2"></a>
## A2. HomePage — `/`

- **Mục đích:** welcome và quick launch; không gọi API riêng, lấy `user` từ AuthContext (`frontend/src/pages/home/HomePage.tsx:20-24,119-179`).
- **Thẻ hiển thị:** Báo cáo, Chăm sóc, Ghi danh, Lớp & Điểm danh, Học viên, Gói học, Giáo viên, Nhập/Xuất, Quản trị; mỗi thẻ có title/description/path (`:26-117`). Không bảng, filter, sort, pagination.
- **Quyền:** lọc bằng `hasRole`: dashboard/care/enrollments/students A/M/C; classes A/M/C/T; packages/teachers/imports A/M; users A (`:35-116`). [ĐKC] Imports quick link không hiển thị cho CS/TEACHER dù route cho phép; Care không hiển thị cho TEACHER dù route cho phép. [SLCC] Đây là bất nhất UX được ghi nhận, không phải route denial.
- **Trạng thái:** welcome luôn render nếu đã qua ProtectedRoute; không empty/loading/error riêng.

<a id="a3"></a>
## A3. DashboardPage — `/dashboard`

- **Mục đích/API:** trung tâm báo cáo CSKH; `dashboardApi.getOverview/getCare/getAttendanceTab/getPerformance(filters)` theo tab (`frontend/src/features/dashboard/pages/DashboardPage.tsx:16,35,108-115`).
- **Tabs/default:** tab lấy từ `?tab=` (`searchParams`), mặc định overview; tổng quan, chăm sóc, chuyên cần, hiệu suất (`:40-43,80-82`). **Bộ lọc mặc định là 30 ngày** (`presetRange('30d')` khi không có query date) cùng `status`, `cs_id` đọc từ query (`:84-89`); preset Hôm nay/7 ngày/30 ngày/Tháng này/Tất cả (`:70-77`). Nút refresh (`:149-152`). Không bảng phân trang; biểu đồ/stat cards.
- **Nội dung/field nguồn:** overview KPI `total_enrollments`, `studying`/`studying_pct`, `paused`, `near_completion` (≤10 buổi còn lại), `overdue_tasks` (`:215-219`); care tab: total_entered, response_rate, chưa nhập, `NEGATIVE_WANTS_TO_STOP` (`:249-252`); attendance: `attendance_rate`, `total_sessions`, `ABSENT_UNAPPROVED_C`, `ATTENDED` (`:288-291`); performance: pending_total, overdue, due_today, urgent_hot_issues (`:317-320`).
- **Bảng con (component):** `AtRiskTable` cột Học viên / Mốc buổi / CVHT / Ngày log (`features/dashboard/components/AtRiskTable.tsx:21-24`); `CarePivotTable` hàng = mốc chăm sóc, cột = bucket phản hồi (Phản hồi tích cực / Cần hỗ trợ hệ thống / Phản hồi tạm / Cần hỗ trợ chương trình / điểm yếu HV / giáo viên / Tiêu cực muốn dừng / Chưa phản hồi / Khác / Chưa nhập) + Tổng (`CarePivotTable.tsx:10-19,61-63`); leaderboard `PerformanceCharts` cột #, CVHT, Ghi danh, Log CS, % Tích cực, NV hoàn thành (`PerformanceCharts.tsx:51-56`). Có xuất CSV at-risk (`DashboardPage.tsx:278`).
- **Quyền:** route A/M/C; leaderboard có `canSeeLeaderboard` chỉ A/M (`:130,336-343`). [ĐKC] CS vẫn thấy các tab còn lại. Loading khi chưa có payload (`:350-361`); lỗi toast ở load callback; payload thiếu khiến phần tương ứng không render. [SLCC] Không có empty-state riêng cho từng chart.

<a id="a4"></a>
## A4. PreferencesPage — `/settings/preferences`

- **Mục đích/API:** cấu hình cột theo user; `preferencesApi.get/save(scope)` nằm trong `useColumnVisibility` (`frontend/src/features/preferences/pages/PreferencesPage.tsx:1-10`; `features/preferences/hooks/useColumnVisibility.ts:56,119`).
- **Tabs/scope:** enrollment quick/detailed/stats; student tab1/tab2 (`PreferencesPage.tsx:17-26`). Mỗi section có checklist cột; locked `action` luôn visible; chọn tất cả/bỏ tất cả.
- **Bảng/field:** registry label→key/default trong `frontend/src/features/preferences/columns.ts:21-73,77-157`: enrollment quick `external_id,full_name,package_name,course_content,total_sessions,level,email,model_type,status`; detailed thêm remaining/start/end/time/schedule/duration/teacher/code/class/sale; stats có nhóm summary; student tab1 có action, STT, ID, tên, chương trình, CVHT, paid/sale/status/gender/phone/email/course/payment/package/level/sessions/class/date/teacher/attendance; tab2 thêm report/exchange/callback/hot issue/JLPT scores/support/renewal/post-care.
- **Actions/state:** Lưu thay đổi disabled nếu clean/saving; Khôi phục mặc định; dirty badge; skeleton 9 cells khi loading (`PreferencesPage.tsx:63-105`). Không search/sort/pagination. [ĐKC] áp dụng mọi authenticated user; [SLCC] role-specific backend visibility chưa biết.

<a id="a5"></a>
## A5. UsersPage — `/settings/users` (A)

- **Mục đích/API:** quản trị users và cấu hình hệ thống; `apiClient` (`frontend/src/pages/admin/UsersPage.tsx:1-2`). Route chỉ A (`App.tsx:60-64`).
- **Bảng/filter:** user columns thực tế: Họ tên, Email, Vai trò, mã hiển thị/staff, trạng thái, last login/created và thao tác (`pages/admin/UsersPage.tsx:187-316`); search Tên/Email, role ALL/ADMIN/MANAGE/CS/TEACHER (`:349-388`), DataTable client page size mặc định 10. Empty `Không tìm thấy người dùng nào phù hợp` (`:392-397`).
- **Cấu hình hệ thống:** tab Settings render `AutoAttendanceConfigCard`, không phải bảng users (`:345-347`). Card gọi `GET /settings/auto-attendance`, `PATCH /settings/auto-attendance` và `POST /settings/auto-attendance/run`; các preset delay 0/5/10/15/30/60 phút, mặc định hiển thị 15 phút (`pages/admin/components/AutoAttendanceConfigCard.tsx:27-32,50-117`). Nút bật/tắt, lưu và chạy ngay có disabled/loading (`:175-229`).
- **Form/dialog:** name **required**, email **required + type=email + disabled khi edit**, password **required + minLength=6 chỉ create**, code optional, phone, staff_code (auto uppercase), roles phải có ít nhất một; `formData.roles.length===0` disable submit (`UsersPage.tsx:402-499`). Toggle active và revoke sessions có dialog confirm (`:512-568`).
- **State:** loading/error toast hoặc danh sách rỗng theo DataTable; settings panel có nội dung cấu hình riêng chưa đọc sâu [CXM].

# B. CHĂM SÓC KHÁCH HÀNG

<a id="b1"></a>
## B1. StudentsPage — `/students`

- **Mục đích/API:** danh sách hồ sơ và care report; `studentsApi.list/create/update`, `careApi.getMilestones/addMilestone/updateEnrollmentCare/saveSessionCareLog`, `teachersApi.list` (`frontend/src/features/students/pages/StudentsPage.tsx:3-18,285-307,471-536,646-677`).
- **Tabs/default:** Hồ sơ học viên và Báo cáo học tập & chăm sóc (`:1831-1848`). Program switch ALL/KAIWA/JLPT; status/gender/sale/CVHT filters; search tên, SĐT, ID, email (`:1851-1923`). CS-only bị khóa theo học viên được phân công (`:186-198,348-398`), không thấy sort hay server pagination; DataTable client page size mặc định 10.
- **Bảng tab hồ sơ:** label→field chính từ cột `:691-1335`: `#→stt`, Mã HV→external_id, Họ tên→full_name, Khóa→program_type, CVHT→cs_staff_code, Ngày nộp→paid_at, Sale/CSKH→sale_name, trạng thái HV, gender, phone, email, nội dung/course, payment, package, khóa/trình độ, total_sessions, class_model, class_code, sales_note, DOB, occupation, model_type, remaining_sessions, start_date, status, end_date, start_time, schedule_pattern, duration, recurring, ngay_hoc, teacher_name/code, class_name, attended_prev, attended_this_year.
- **Bảng tab care:** report URL, exchange, callback, hot issue, satisfaction B18, exam registration/score/result, test scores L1-L7, special support L1-L3, renewal, post-course care, end date, handed-over, paid month, account created (`:1350-1679`). Cột dynamic care milestone lấy API milestones và không hoàn toàn cấu hình được [ĐKC].
- **Form/dialog:** thêm mốc buổi: số buổi nhập number, add/cancel (`:1935-1995`). View detail full Sheet 1 (`:1998-2216`). Create/edit modal 4 tabs Hồ sơ & liên hệ / Khóa học & tài chính / Lớp học & lịch học / Báo cáo & CSKH (`:2219-2841`). Form fields khởi tạo tại `:224-276`: external_id, full_name, gender, phone/email/DOB/parent/school/occupation/Zalo/LINE/note; paid/sale/source/payment/level/sessions/remaining/attended/class model/sales note; class/teacher/start/end/status/time/pattern/duration; report/exchange/callback/hot/post-care/handed/account; program metadata. [ĐKC] create/update dùng submit; required/read-only từng field phụ thuộc component input và payload; external_id/package logic validate ở backend/handler [SLCC].
- **Actions/states:** inline edit các care/program/session fields; add milestone; create/update; refresh. `loading` skeleton/DataTable; empty DataTable message; API lỗi toast. Không có bulk action rõ ràng. [CXM] Chưa kiểm chứng trực tiếp encoding/rendering trong trình duyệt.
- **Quyền:** route A/M/C; `isCS` chỉ CS không A (`:186`) nhưng một số CS+MANAGE được coi privileged. [ĐKC] CS xem banner “Học viên của Sale”, không chọn sale; staff filter khác chọn Sale.

<a id="b2"></a>
## B2. StudentStudyReportPage — `/students/:id/study-report`

- **Mục đích/API:** chi tiết báo cáo học tập một học viên; `studentsApi.get(id)` và `studentsApi.update` (`frontend/src/features/students/pages/StudentStudyReportPage.tsx:3,125,156`).
- **UI:** không danh sách/pagination; nhiều form textarea/input cho chuẩn bị bài, tương tác, tiếp thu, số buổi, điểm từ vựng/ngữ pháp/ngữ âm/độ trôi chảy, điểm/nhận xét bổ sung, trao đổi (`:260-750`). [ĐKC] field cần nhập theo từng report section; nút lưu/cập nhật ở khoảng `:637-662`; quay về `/students` `:214`.
- **State/quyền:** loading/error student fetch và save toast; route A/M/C kế thừa. [CXM] readonly conditions theo enrollment/status chưa thấy đầy đủ trong đoạn page.

<a id="b3"></a>
## B3. EnrollmentsPage — `/enrollments`

- **Mục đích/API:** hợp nhất ghi danh và ma trận điểm danh; `enrollmentsApi.list({sale})`, `classSessionsApi.list/create`, `attendanceApi.bulkMark` (`frontend/src/features/enrollments/pages/EnrollmentsPage.tsx:2,52-68,490-508`).
- **Tabs/default:** Điểm danh nhanh, Điểm danh chi tiết, Thống kê; mặc định quick, status mặc định STUDYING/blank stats (`:27-76,575-585`). Program ALL/Kaiwa/JLPT counts (`:515-570`).
- **Filter/search:** `EnrollmentFilterBar`: sale, package, teacher/name/code, class, program/course level, status, model, schedule/time, start/end date, tổng/đã học/còn lại theo EXACT hoặc khoảng; search query ID/name/phone/email; mặc định quick status STUDYING, client filtering (`:287-454`). Không sort/pagination riêng ngoài matrix/DataTable [SLCC].
- **Bảng/matrix field:** StudentRow map ở `:86-175`: enrollment class/id, class code, student ID/external/full name, package, course, total/level/email/phone/model/remaining/attended, start/status/end/time/schedule/duration/teacher/code/class/sale/program/CVHT. Hiển thị cột theo preferences scope (`:44-45,608-641`); labels registry ở `preferences/columns.ts`.
- **Actions:** ma trận ghi attendance bulk theo class/date/session; create session nếu thiếu (`:464-508`); row/cell actions do AttendanceMatrix. CS flag `isCS` chỉ CS thuần (`:36`) ảnh hưởng filter/side. Loading message trước khi data; toast lỗi fetch/save.
- **Tab sheet sync/backup:** Không có tab Google Sheet/backup trong page. Các tab đó ở ImportsPage [ĐKC], tránh nhầm chức năng.

<a id="b4"></a>
## B4. CarePage — `/care`

- **Mục đích/API:** tasks, care logs, attendance notifications; `careApi.listNotifications/markNotificationRead/markAllNotificationsRead`, `listTasks/completeTask/cancelTask/updateTask/createTask`, `getLogs/createLog` (`frontend/src/features/care/pages/CarePage.tsx:9,136-293`).
- **Tabs/quyền:** teacher-only (TEACHER không A/M/C) chỉ tab Thông báo; còn lại Nhiệm vụ chăm sóc, Nhật ký chăm sóc, Thông báo (`:90-105,301-319`). Route A/M/C/T. CS/A/M có nút tạo task; teacher không có.
- **Tasks:** CareTaskList filter status (mặc định PENDING), list; cột/row gồm title/type/priority/due/status/assignment và action hoàn tất/hủy/sửa (page `:108-117,326-364`; component). Dialog xác nhận hủy (`:614-629`). CareTaskModal fields: enrollment_id **required khi create**, type CALLBACK/HOT_ISSUE/FOLLOW_UP, priority LOW/NORMAL/HIGH/URGENT, title/note/due_at; khi edit enrollment_id không hiện/không gửi (`features/care/components/CareTaskModal.tsx:34-89,112-156`).
- **Logs:** nhập enrollment ID number min=1 **required**, submit Xem lịch sử; rỗng hướng dẫn nhập; timeline cho phép add log (`CarePage.tsx:365-405`).
- **Notifications:** filter Tất cả/Chưa đọc/Đã đọc; refresh; đánh dấu tất cả; list có date, student, recipient role, status/message; loading/rỗng text rõ (`:407-506`). [ĐKC] limit notifications=100 (`:136-145`).
- **State/error:** toast theo action; skeleton/text loading; empty notifications. [SLCC] task list empty/error chi tiết do component.

# C. ĐÀO TẠO & LỚP

<a id="c1"></a>
## C1. PackagesPage — `/packages` (A/M)

- **Mục đích/API:** CRUD gói học, `packagesApi.list/create/update` (`frontend/src/features/packages/pages/PackagesPage.tsx:2,38,83,92`).
- **Bảng/filter:** mã gói, tên, số buổi, mô tả và thao tác; search mã/tên (`:149-177`), không filter/sort riêng; DataTable client pagination mặc định 10.
- **Form/dialog:** create/edit: `code` **required, disabled khi edit**, `name` optional, `default_total_sessions` number min=1, `description`; checkbox active **chỉ khi edit** (`PackagesPage.tsx:209-252`). Không có field metadata. Nút thêm/sửa/lưu/hủy.
- **Cột chính xác:** Mã gói→code, Tên gói học→name, Số buổi định mức→default_total_sessions, Trạng thái→active, Thao tác→edit (`:110-139`); description không là cột danh sách.
- **State/quyền:** loading skeleton, empty message, toast lỗi; route A/M. [SLCC] backend có thể cấm M cho một số package.

<a id="c2"></a>
## C2. TeachersPage — `/teachers` (A/M)

- **Mục đích/API:** hồ sơ giáo viên và cấp tài khoản; `teachersApi.list/create/update/provisionAccount` (`frontend/src/features/teachers/pages/TeachersPage.tsx:2,54,121,132,147`).
- **Bảng/filter:** cột thực tế: Họ tên Giáo viên (kèm email phụ), Mã giáo viên, Phân loại GV, Số điện thoại, Tài khoản đăng nhập (Đã cấp/Chưa cấp + email user), Trạng thái (Đang giảng dạy/Tạm ngừng), Thao tác (`features/teachers/pages/TeachersPage.tsx:187-250`). Search tên, filter phân loại, filter trạng thái tài khoản PROVISIONED/UNPROVISIONED (`:285-353`), DataTable client pagination mặc định 10, empty “Không tìm thấy giáo viên nào phù hợp”.
- **Form:** create/edit: code optional (“bỏ trống để tự sinh”), Họ tên **required**, email/phone optional, `teacher_type` VIETNAMESE/JAPANESE/OTHER, checkbox “Đang còn giảng dạy” **chỉ khi edit** (`:365-459`). Provision dialog email/password (`:464-505`). [SLCC] chưa xác minh validation password provision ngoài placeholder.
- **Actions/state:** thêm/sửa, Cấp tài khoản; loading/empty/error toast. [CXM] bulk action không thấy.

<a id="c3"></a>
## C3. ClassesPage — `/classes`

- **Mục đích/API:** danh sách lớp và điểm danh hai mode; `classesApi.list/create/update`, `classSessionsApi.create`, `attendanceApi.mark/update/bulkMark/remove` (`frontend/src/features/classes/pages/ClassesPage.tsx:4-5,227,496-684,1048-1089`).
- **Quyền:** route A/M/C/T. `isTeacher` chỉ TEACHER không A/M/C; `canManageClasses` A/M (`:128-136`). Teacher chỉnh điểm danh/notebook; quản lý chỉnh thông tin lớp/session. [ĐKC]
- **Tabs/filter:** Điểm danh nhanh (1 ngày) và chi tiết (ma trận tháng), mặc định quick (`:141-145,1169-1178`). Search class code/name/student/teacher (`placeholder` `:1194-1199`), model filter, clear; date previous/current/next và period previous/next (`:1260-1357`). Không pagination; ma trận ngày có cột thay đổi theo period.
- **Bảng:** cột nhận diện lớp/mã, học viên, gói, status, GV, lịch, ngày/session attendance và notes; header cụ thể `:1373-1500`. Quick cell có status; detailed ma trận date columns. [SLCC] cột cuối phụ thuộc data.
- **Actions/forms:** mark individual/all attended, save; add session + lesson topic/note (`:1756-1816,2030-2157`); create/edit class dialog fields class name/code (code auto nếu trống), level/model/teacher/schedule/time/duration (`:2250-2349`); delete/remove guarded; session create may occur on first attendance. Empty state/filter no matches; loading; forbidden/role-specific controls.

<a id="c4"></a>
## C4. ClassSessionsPage — `/classes/:classId/sessions`

- **Mục đích/API:** CRUD lịch buổi của lớp; `classesApi.get`, `classSessionsApi.list/update/create/cancel/remove` (`frontend/src/features/classes/pages/ClassSessionsPage.tsx:3-4,59-157`).
- **Bảng/filter:** cột thực tế: Buổi số→`session_number`, Ngày học→`session_date`, Khung giờ→`start_time - end_time`, Trạng thái→`status`, Thao tác & Điểm danh (`features/classes/pages/ClassSessionsPage.tsx:166-185`). Không search/sort riêng; DataTable client mặc định 10 nếu rows vượt trang.
- **Form/dialog:** create: Ngày diễn ra **required**, giờ start/end optional, số thứ tự tự cấp; edit thêm Buổi số **required** và status SCHEDULED/COMPLETED/CANCELLED (`:318-365`). Hủy và xóa toàn lớp có confirm (`:370-406`), xóa nêu rõ attendance liên quan.
- **State:** class not accessible page (`:247-274`), loading/error toast, empty sessions. Route A/M/C/T; backend ownership thêm.

<a id="c5"></a>
## C5. AttendanceSheetPage — `/classes/:classId/attendance` và session variant

- **Mục đích/API:** phiếu điểm danh class/session; `classesApi.get`, session list/get, `attendanceApi.list/bulkMark/remove` (`frontend/src/features/classes/pages/AttendanceSheetPage.tsx:3-4,128-142,281,546`).
- **Tabs:** Ma trận theo ngày và Phiếu buổi #N nếu có session (`:390-410`).
- **Bảng phiếu:** Học viên, Gói học, Trạng thái hiện tại, các cột GV/CS/chốt hoặc input status và Lý do vắng/nghỉ (`:435-554`). Có checkbox “tích chọn tất cả có mặt”; mặc định không có attendance là chưa điểm danh. Ma trận do AttendanceMatrix.
- **Actions:** mark all attended; chỉnh status cell; Lưu thay đổi disabled nếu không edits; remove attendance. [ĐKC] status codes A/B/C/D/E và ATTENDED được dùng trong AttendanceMatrix. Forbidden state có nút về classes (`:321-350`). Loading/error toast; empty students [SLCC].

<a id="c6"></a>
## C6. AttendanceReconciliationPage — `/attendance/reconciliation`

- **Mục đích/API:** đối soát conflict/pending/history; `reconciliationApi.getStats/getConflicts/getPending/getHistory/resolveConflict/bulkApprovePending/markByCS` (`frontend/src/features/attendance/pages/AttendanceReconciliationPage.tsx:27,134-173,223-277`).
- **Tabs:** conflict, pending, history (labels UI quanh `:685-711`); KPI conflictCount/pendingCsCount/pendingTeacherCount (`:712-781`).
- **Filter/bảng:** search tên/ID/SĐT debounce 300ms; date range; pending sub-filter buttons (count theo loại); mỗi tab có server pagination `page=1,pageSize=20` (`:78-130,824-886`). Pending checkbox select-all/select row, columns session/student/class/status/source/reason; buttons Approve one, CS mark, bulk approve (`:476-551`). Không sort thấy trong page.
- **Dialog/form:** resolve conflict với decision/note; CS mark status + reason/note (`:890-1109`), reason ví dụ tình huống Zalo/Zoom; approve confirmation/action. [ĐKC] bulk approve selected IDs; no evidence of bulk CS mark.
- **State/quyền:** route A/M/C. Loading refresh, toast error, empty per tab. [SLCC] route không có TEACHER dù giáo viên là nguồn dữ liệu.

<a id="c7"></a>
## C7. MyTeachingSessionsPage — `/teacher/my-sessions`

- **Mục đích/API:** lịch dạy của GV và chấm điểm danh; `reconciliationApi.getTeacherSessions({startDate,endDate,teacherId})`, `markByTeacher(attendanceId,{...})`, `uploadTeacherExcel(file)`; `teachersApi.list()` chỉ khi privileged (`frontend/src/features/attendance/pages/MyTeachingSessionsPage.tsx:23-26,90-168`).
- **Quyền/mặc định:** `isPrivileged = ADMIN hoặc MANAGE` (`:34`); `hasContext = !isPrivileged || !!selectedTeacherId` (`:42`). Mặc định date range `today`; A/M phải chọn “Giáo viên cần hỗ trợ” trước khi tải (`:199-207`). [ĐKC] CS có route (A/M/C/T) nhưng không privileged → bị xem như GV thường, gọi getTeacherSessions mà không gửi teacherId → backend suy ra theo tài khoản hiện tại; CS không có GV profile nên kết quả có thể rỗng `frontend/src/App.tsx:124-130` `[SLCC]`.
- **Bảng/thẻ:** session list hiển thị ngày/giờ, lớp, học viên, trạng thái, lesson topic, note; nút actions. Empty “Chọn giáo viên để bắt đầu” hoặc “Không có ca dạy nào trong khoảng thời gian này” (`:254-262`). Loading state.
- **Dialog mark:** title theo student; status ATTENDED/A/B/C/D/E (mặc định ATTENDED `:52`); khi ATTENDED hiện input lesson topic (placeholder “VD: K2 L4 hoặc Kaiwa 2 Bài 4”) và textarea ghi chú; buttons Lưu/Hủy (`:401-506`). [ĐKC] lesson topic chỉ khi ATTENDED.
- **Dialog upload Excel:** file input, result summary, close (`:507-549`). [SLCC] preview/không confirm step.
- **State/khác:** upload và mark loading flags; toast lỗi; auto-resync khi có event `teacher-attendance-updated` (global listener ở Sidebar nhưng trang tự reload). [SLCC]

<a id="c8"></a>
## C8. TeacherAttendanceTrackingPage — `/teacher/attendance-tracking`

- **Mục đích/API:** theo dõi lượt GV chưa điểm danh và lịch sử đổi trạng thái; `reconciliationApi.getTeacherTrackingCount/getTeacherTrackingPending/getTeacherTrackingHistory`, `markByTeacher`; `classesApi.list`, `teachersApi.list` khi privileged (`frontend/src/features/attendance/pages/TeacherAttendanceTrackingPage.tsx:15-20,84-141`).
- **Quyền/mặc định:** `isPrivileged` A/M (`:47`); tab mặc định `pending`; pagination server `page=1`, `pageSize=20` (`:49-64`). Empty bắt buộc chọn GV với privileged (`:71,220`).
- **Tabs:** “CSKH đã điểm danh” (badge = pendingCount) và “Lịch sử thay đổi” (`:212-213`).
- **Filter:**GV select (chỉ A/M, label `Giáo viên cần theo dõi`), lớp select, từ ngày/đến ngày (`min=startDate`), search học viên, nút Lọc/Reset (`:191-231`). [ĐKC] search chỉ áp dụng khi bấm Lọc (`appliedSearch` `:56-57`).
- **Bảng pending:** Ngày/giờ, Học viên (full name + external_id/phone), Lớp/buổi, Trạng thái (Badge warning “Chưa điểm danh”), cột thao tác rỗng header + nút `Điểm danh` (`:168-172`).
- **Bảng history:** Thời gian đổi, Học viên, Lớp/buổi, Thay đổi (from → to badges), Ghi chú, Người thao tác (`:176-181`). Cả hai dùng `DataTable serverPagination`, empty “Không còn lượt nào chờ giáo viên điểm danh” / “Chưa có lần thay đổi trạng thái nào” (`:236-238`).
- **Dialog mark:** status bắt buộc (select placeholder “Chọn trạng thái...”); lesson topic chỉ khi ATTENDED; note optional; buttons Hủy/submit (`:243-255`).
- **State:** loading; toast lỗi; count API lỗi → 0 (Sidebar). [SLCC]

<a id="c9"></a>
## C9. AttendanceMatrix (component, dùng ở Classes/Enrollments/AttendanceSheet)

- **Mục đích/API:** ma trận điểm danh ba bên GV/CSKH/Chốt; `attendanceApi.mark/update/remove`, `classSessionsApi.create/remove` (`frontend/src/features/classes/components/AttendanceMatrix.tsx:14-15,965-1246`).
- **Role→side:** `isAdminOrManage` A|M; `isCSOnly` CS không A/M; `isTeacherOnly` T không A/M/CS; `selectedSide = ADMIN | CS | TEACHER` (`:485-488`). Quick tab: cột 1 edit nếu teacherOnly, cột 2 edit nếu CSOnly, cột 3 edit nếu adminOrManage; còn lại readonly cell (`:2081-2100`). `canEditTeacherNote = isTeacherOnly` (`:2840`). [ĐKC] User đa role T+CS (không A/M) → side CS, sửa cột CS; ghi chú GV chỉ T thuần được sửa.
- **Tabs/mặc định:** quick (date hôm nay), detailed (filterMode month), stats (`:490-501`). Optimistic updates và clearedKeys, reset khi `attendances` prop đổi (`:503-520`).
- **Actions:** mark/unmark/clear cell, create session on demand, delete session, bulk save, rename/status popover với status codes A–E. [ĐKC] Popover `AttendancePickerPopover` với onDeleteSession (`:2831-2866`).

# D. ĐA KÊNH, ZALO/LINE, AUTOMATION

<a id="d1"></a>
## D1. OmnichannelAccountsPage — `/omnichannel/accounts` (A/M/C)

- **Mục đích/API:** tài khoản kênh và bảo mật; `zaloApi.listAccounts/createAccount/disconnect/removeAccount/syncFriends/refreshGroups`, `lineApi.listAccounts/createAccount/disconnectAccount/deleteAccount/syncFriends/syncGroups`, `omnichannelApi` cho limits/credentials (`frontend/src/features/omnichannel/pages/OmnichannelAccountsPage.tsx:3-5,126-350`).
- **Channel gate:** `initialChannel` prop hoặc `?channel=` query (`:70-86`). `/line` truyền `LINE_OA`; `/zalo/tai-khoan` redirect kèm `?channel=ZALO` (`frontend/src/App.tsx:96,104`).
- **Bảng:** Tài khoản & Kênh, Nhân viên CSKH, Trạng thái, Kết nối mạng, Giới hạn bảo vệ tài khoản, Thao tác (`:556-561`). Search theo tên/SĐT/CS (`:545`). Không thấy pagination trong page (gộp 2 nguồn tài khoản tĩnh) `[SLCC]`. KPI tổng tài khoản active (`:455`).
- **Actions theo row:** QR login Zalo, QR LINE cá nhân, cấu hình LINE OA, sync groups/contacts + auto-link, cài đặt proxy/limits/sao lưu phiên (mở `ChannelSecurityLimitsDialog`), ngắt kết nối, xóa (`:706-799`). Confirm modal cho disconnect/remove `[SLCC]`.
- **Form create:** Zalo: display name, phone, proxy; LINE OA: name, channel_id, channel_secret, channel_access_token; LINE cá nhân: name, phone, proxy (`:819-916`). [ĐKC] `channel_secret`/`channel_access_token` là input text → rủi ro lộ secret nếu không masked; cần kiểm tra runtime `type` attribute `[SLCC]`.
- **Trạng thái:** loading list; toast lỗi từng action; empty khi chưa tài khoản nào. [SLCC]

<a id="d2"></a>
## D2. ChannelSecurityLimitsDialog (component)

- **Mục đích/API:** proxy, rate limits/quota, export/import credentials cho 1 account; `omnichannelApi.getAccountLimits/updateAccountProxy/updateAccountLimits/exportCredentials/importCredentials` (`frontend/src/features/omnichannel/components/ChannelSecurityLimitsDialog.tsx:1-27,78-216`).
- **Tabs:** `proxy` mặc định, limits, credentials (`:54`). Mỗi tab có input/select: proxy URL, monthly quota number, categories rate bounds; JSON textarea cho import (`:59-72`).
- **Actions:** save proxy, save limits, export bundle (download), import JSON; disabled theo busy flag `[SLCC]`. Loading snapshot. [ĐKC] Import parse JSON phía client trước khi gọi API (`:216`).

<a id="d3"></a>
## D3. OmnichannelContactsPage — `/omnichannel/contacts` (A/M/C)

- **Mục đích/API:** danh bạ bạn bè ZALO/LINE; `zaloApi.getFriendsDb/syncFriends/sendMessage`, `lineApi.listFriends/syncFriends/sendMessage/lookupByPhone/sendFriendRequest` (`frontend/src/features/omnichannel/pages/OmnichannelContactsPage.tsx:3-4,155-318`).
- **Channel gate:** `initialChannel` prop (`/zalo/danh-ba` → ZALO, `/line/danh-ba` → LINE); top switcher ZALO/LINE (`:328-352`, App.tsx:99,106).
- **Toolbar/filter:** account select (label có trạng thái kết nối), kind filter all/friend/stranger (kèm counts), tổng liên hệ, search theo tên/ghi nhớ/SĐT (`:398-462`). [ĐKC] ZALO dùng server pagination `page/limit=50`, tự render “Trang x / y” prev/next (`:75-76,157-165,559-576`). LINE gọi `limit: 200` một lần, không thấy phân trang → rủi ro ẩn dữ liệu >200 `[ĐKC]/[SLCC]`.
- **Actions:** Đồng bộ Danh bạ Zalo/LINE; gửi tin nhắn (modal textarea, required content theo handler); LINE PERSONAL mới hiện “Tìm & Kết bạn qua SĐT” (lookup + send friend request) (`:356-392,749-828`). [ĐKC] Nút kết bạn chỉ khi `account_type === 'PERSONAL'`.
- **State:** loading spinner, empty, toast lỗi; search đổi → reset page (`:171`).

<a id="d4"></a>
## D4. OmnichannelGroupsPage — `/omnichannel/groups` (A/M/C)

- **Mục đích/API:** nhóm lớp/care group; `zaloApi.getGroupsDb/sendMessage/renameGroup`, `lineApi.listAllGroups/sendMessage`, `omnichannelApi.syncAndMatchCareGroups` (`frontend/src/features/omnichannel/pages/OmnichannelGroupsPage.tsx:3-5,93-230`).
- **Tab switcher:** Tổng hợp Nhóm / Nhóm Zalo / Nhóm LINE, mỗi tab có count (`:248-293`). Lọc theo tài khoản (`ZALO:{id}` / `LINE:{id}`), số nhóm hiển thị, search tên nhóm/mã HV/tài khoản (`:320-360`). Không phân trang (grid cards) `[ĐKC]`.
- **Card:** platform badge, tên nhóm, tài khoản quản lý, thành viên, mã nhóm, actions gửi tin/đổi tên/link (`:377-442`). [ĐKC] avatar `referrerPolicy="no-referrer"`.
- **Actions/dialog:** Làm mới; Đồng bộ Nhóm Mới Nhất (sync+match); modal gửi thông báo group (textarea required); modal đổi tên nhóm Zalo chuẩn `[ĐKC]` (`:465-532`). Đổi tên xong tự sync lại (`:230`).
- **State:** loading, empty “Chưa có nhóm nào khớp bộ lọc…” (`:368-374`), toast lỗi.

<a id="d5"></a>
## D5. OmnichannelInboxPage — `/omnichannel/chat` (A/M/C)

- **Mục đích/API:** hộp thư hợp nhất; `zaloApi.listAccounts/getConversations/getMessages/sendMessage/markConversationRead`, `lineApi.listAccounts/listConversations/listMessages/sendMessage/markRead` (`frontend/src/features/omnichannel/pages/OmnichannelInboxPage.tsx:3-4,92-278`).
- **Mode gate:** `initialMode` prop (`/zalo/chat` → ZALO, `/line/chat` → LINE), `?channel=` query; `platformFilter` ALL/ZALO/LINE (`:57-73`, App.tsx:101,108).
- **Layout:** list hội thoại + pane tin nhắn. Mỗi nguồn lấy `limit: 40` conversation, `limit: 60` messages (`:103-199`). Search theo học viên/nhóm/tài khoản (`:407-411`), refresh list (`:394-400`). Không pagination; chỉ lấy N gần nhất → ẩn cuộc trò chuyện cũ `[ĐKC]/[SLCC]`.
- **Actions:** chọn conv → load messages + mark read (fire-and-forget `.catch(()=>{})` `:195,213`); gửi tin bằng input text `composerText`, **không sử dụng RichChatComposer** (`:272-278,637-646`). [ĐKC] Tự chọn conversation đầu nếu chưa có (`:162`). RichChatComposer chỉ được mount trong BroadcastCampaignsPanel.
- **State:** loading, empty (chưa account/conv), socket event re-load (`:224-244`), toast lỗi. [SLCC]

<a id="d6"></a>
## D6. OmnichannelStudentLinksPage — `/omnichannel/student-links` (A/M/C)

- **Mục đích/API:** ma trận liên kết học viên ↔ nhóm/tài khoản; `apiClient.get('/students')`, `omnichannelApi.getCareGroupReport/syncAndMatchCareGroups`, `zaloApi.listAccounts/listAccountStudentLinks/getGroupsDb/createStudentLink/listStudentLinks/deleteStudentLink`, `lineApi.listAccounts/listAccountGroups/listLinksByStudent/createLink/deleteLink/generateDeepLink` (`frontend/src/features/omnichannel/pages/OmnichannelStudentLinksPage.tsx:2-4,167-720`).
- **Tab gate:** `initialTab` map UNLINKED_ZALO/UNLINKED_LINE/UNLINKED/LINKED; `/zalo/lien-ket` → ZALO, `/line/lien-ket` → LINE (`:106-123`, App.tsx:98,109). [ĐKC] `initialTab='ZALO'` ánh xạ sang UNLINKED_ZALO, không phải “tất cả ZALO”.
- **Bảng:** Mã HV, Học viên, Nhân viên CSKH, Tên nhóm chuẩn gợi ý, Nhóm/Tài khoản Zalo, Nhóm/Tài khoản LINE (`:1113-1120`). Filter tab, CS dropdown, search theo tên/mã/SĐT/CS/nhóm (`:777-812`). [ĐKC] Lọc client; dữ liệu lấy `/students` full + links per-account → N+1 calls (`:186`).
- **Actions:** copy tên nhóm chuẩn; đổi nhóm/tài khoản liên kết; gỡ liên kết (modal link platform GROUP/USER, search groups/friends); tạo deep link QR LINE (`generateDeepLink`, render ảnh QR từ `api.qrserver.com` `:720,1621`); sync+match (toast counts `:433`). Không bulk action.
- **State:** loading, empty per filter, toast; `getCareGroupReport` optional (`skipReport`) `[ĐKC]`. [SLCC] ảnh QR từ bên thứ ba → phụ thuộc mạng/privacy.

<a id="d7"></a>
## D7. ZaloMonitorPage — `/zalo/monitor` (A/M/C)

- **Mục đích/API:** debug live event stream Socket.IO, **không gọi REST API**, dùng hook `useSocket` (`frontend/src/features/zalo/pages/ZaloMonitorPage.tsx:1-4,31-38`).
- **Events:** subscribe `zalo:status/qr/message/typing/friend-update/group-update/undo/sync-complete` (`:58-64`), buffer giữ tối đa 500 (`:49`).
- **Controls:** Test Ping (emit `zalo:test-ping`), Pause/Resume, Clear, account filter (chỉ khi có `uniqueAccounts`), status pill connected/disconnected, count (`:90-151`).
- **Trạng thái:** empty “Waiting for events… Connect to a Zalo account to see activity” (`:160-164`); log hiển thị `JSON.stringify(payload)` thô. [SLCC] Có thể in payload chứa dữ liệu cá nhân/secret ra màn hình log → rủi ro leak; không có auto-reconnect trong trang. Route không có trong Sidebar.

<a id="d8"></a>
## D8. AutomationWorkflowsPage — `/automation` (A/M/C)

- **Mục đích/API:** hai workspace; `automationApi.listWorkflows({search, limit:100}), createWorkflow, updateWorkflow(active/name), deleteWorkflow` (`frontend/src/features/automation/pages/AutomationWorkflowsPage.tsx:3,76-145`).
- **Mode/tabs:** `workflows` / `broadcast` đồng bộ với `?tab=broadcast` (`:40-58,322-333`). Badge = workflows.length (`:336-349`). Mặc định workflows nếu không query.
- **Bảng:** Workflow (tên+mô tả, click mở `/automation/:id`), Cụm trigger (`_count.steps`), Học viên áp dụng (`_count.enrollments`), Trạng thái (Đang chạy/Tạm tắt), Người tạo (`owner.name` fallback `CS #id`), Cập nhật (`toLocaleDateString('vi-VN')`), Thao tác (`:180-260`). Search theo tên, Enter để fetch (`:353-362`). DataTable local page size 10; API `limit:100` → chỉ tối đa 100 workflow, phần hơn bị ẩn `[ĐKC]`.
- **Dialog:** tạo/sửa workflow: tên **required**, mô tả textarea (`:374-407`); xóa có confirm (`:410-429`). Toggle active. Row actions dùng `e.stopPropagation` (`:226-258`).
- **Broadcast tab:** render `BroadcastCampaignsPanel` (mục D9) với external create trigger counter.
- **State:** loading, empty “Chưa có automation workflow nào…”, toast lỗi.

<a id="d9"></a>
## D9. AutomationWorkflowDetailPage — `/automation/:id` (A/M/C)

- **Mục đích/API:** `automationApi.getWorkflow/listEnrollments/listDeliveries({limit:100})/addStep/updateStep/deleteStep/addEnrollments/removeEnrollment/listAvailableEnrollments`, `zaloApi.getGroupsDb`, `lineApi` (`frontend/src/features/automation/pages/AutomationWorkflowDetailPage.tsx:3-5,101-296`).
- **Layout:** header workflow name; sections steps (cụm trigger), enrollments đã áp dụng, deliveries. [ĐKC] `listAvailableEnrollments` phân trang server `AVAIL_PAGE_SIZE` với search `q` (`:101`).
- **Step dialog:** select trigger type/session, event điểm danh, delay, target group (ZALO group id select từ `getGroupsDb`, LINE group id manual input), message textarea có biến template (`{{student_name}}`… với nút chèn biến), save/delete (`:637-805`). [ĐKC] `placeholder="ID nhóm Zalo"`, `"Nhập ID nhóm LINE trong hệ thống"`.
- **Enrollment picker dialog:** bảng Học viên / Gói-Lớp-GV / CS phụ trách, checkbox chọn nhiều, search, pagination prev/next, add/remove (`:805-913`).
- **State:** loading, toast; [SLCC] step form validation chỉ suy ra từ placeholder, không có required rõ cho từng select.

<a id="d10"></a>
## D10. BroadcastCampaignsPanel (component)

- **Mục đích/API:** chiến dịch gửi/hẹn giờ; `automationApi.listBroadcasts({limit:200}), getBroadcastTargetsCatalog, createBroadcast, getBroadcastDetail, sendBroadcastNow, cancelBroadcast, retryBroadcastFailed, deleteBroadcast, uploadBroadcastAttachments` (`frontend/src/features/automation/components/BroadcastCampaignsPanel.tsx:239-720,593`).
- **Filter/list:** search + status filter (ALL/SCHEDULED/SENDING/COMPLETED/PARTIAL_FAILED) (`:172-173,1101-1105`). Bảng: Tên chiến dịch & nội dung mẫu (kèm badges urgency/attachments/links), Kênh & chế độ phát, Tiến độ gửi (sent/total + stacked bar), Trạng thái, Thao tác (`:739-913`). [ĐKC] `limit:200` → không đủ khi >200 campaign, không thấy pagination trong panel.
- **Row actions:** Xem chi tiết; khi `SCHEDULED`: Phát ngay + Hủy lịch; khi có failed & !SENDING: retry failed; delete confirm (`:924-960,116-124`). Chi tiết modal có recipient filter ALL/SENT/PENDING/FAILED/SKIPPED (`:2003-2007`).
- **Create dialog:** Tên bắt buộc (`required` `:1215-1220`); schedule IMMEDIATE/SCHEDULED (mặc định IMMEDIATE, datetime-local default `:204-205`); channel mode AUTO/ZALO_ONLY/LINE_ONLY (default AUTO); targets tab STUDENTS/ZALO_GROUPS/LINE_GROUPS, filters search/CS/class/link status/account; RichChatComposer cho nội dung (`:190-232,1787`).
- **RichChatComposer:** urgency thường/!/!!, màu highlight, preview platform ZALO/LINE, link builder (URL **required**, title, desc, CTA label, thumbnail), attachments upload, local preview fallback (`frontend/src/features/automation/components/RichChatComposer.tsx:366-381,593-608,1091-1114,1261-1408`). [ĐKC] Fallback “local preview URL if backend upload route is unreachable” — ảnh có thể hiển thị nhưng không gửi thật → rủi ro UX `[SLCC]`. Component này được dùng trong BroadcastCampaignsPanel; OmnichannelInbox dùng input text riêng.

<a id="d12"></a>
## D12. Legacy standalone pages (chi tiết API/UI)

- **ZaloAccountsPage — `/zalo/standalone` (A/M/C route):** `zaloApi.listAccounts/createAccount/refreshGroups/disconnect/removeAccount` (`frontend/src/features/zalo/pages/ZaloAccountsPage.tsx:39-111`). Bảng các cột mã nguồn nguyên văn `Tai khoan Zalo`, `CS phu trach`, `So dien thoai`, `Trang thai`, `Ket noi cuoi`, `Thao tac` (`:121-153`); không pagination. [ĐKC] Đây là literal ASCII không dấu trong bản standalone (khác bản Omnichannel). Create bắt buộc `cs_id` (User ID), display name/phone/proxy optional (`:252-268`); QR modal, refresh groups, disconnect/remove. `isAdminOrManager` được tính nhưng không đủ bằng chứng cho từng nút `[SLCC]`.
- [ĐKC] **Trang không được mount trong router:** `ZaloChatPage`, `ZaloContactsPage`, `ZaloGroupsPage`, `StudentZaloLinkPage` có file trong `features/zalo/pages` nhưng không xuất hiện trong imports/`Route` của `frontend/src/App.tsx` → mã chết theo router; mọi luồng chat/danh bạ/nhóm/lien ket Zalo đều đi qua bản Omnichannel. [SLCC] Cần kiểm tra dynamic import/đường vào ngoài App trước khi xóa.

- **LineAccountsPage — `/line/standalone` (A/M/C route):** `lineApi.listAccounts/createAccount/syncFriends/syncGroups/disconnect/reconnect/delete` (`frontend/src/features/line/pages/LineAccountsPage.tsx:36,66-197`). Bảng Tài khoản LINE, Loại kết nối, CS phụ trách, SĐT/Quota OA, trạng thái, kết nối cuối, thao tác (`:208-312`). Create OA: CS User ID/name/basic ID/channel ID/channel secret/access token required theo JSX `:549-609`; personal: display name required, phone/proxy optional (`:627-640`). Filter loại ALL/PERSONAL/OFFICIAL; no pagination [ĐKC].
- **LineChatPage — `/line/standalone-chat`:** `lineApi.listAccounts/listConversations/listMessages/markRead/sendMessage` (`frontend/src/features/line/pages/LineChatPage.tsx:38-93,182`). Account select, tabs all/unread/… và search local; API limits 100 conversation/100 message, không pagination; pane compose text gửi. markRead lỗi bị nuốt `.catch(()=>{})` (`:93`) [ĐKC]/[SLCC].
- **LineContactsPage — `/line/standalone-contacts`:** `lineApi.listAccounts/listFriends/syncFriends/sendMessage/lookupByPhone/sendFriendRequest` (`frontend/src/features/line/pages/LineContactsPage.tsx:26-170`). account select, search, total; `listFriends(limit:200)` không pagination; sync; send message; lookup+kết bạn. Modal message body required (`:374`).
- **LineGroupsPage — `/line/standalone-groups`:** `lineApi.listAccounts/listAccountGroups/syncGroups/sendMessage` (`frontend/src/features/line/pages/LineGroupsPage.tsx:24-91`). account select, local search, group cards; modal test message required (`:292`), no pagination.
- **StudentLineLinkPage — `/line/standalone-links`:** `lineApi.listUnlinkedStudents/listLinksByAccount/autoSuggestLinks/listFriends/createLink/updateLink/deleteLink/generateDeepLink` (`frontend/src/features/line/pages/StudentLineLinkPage.tsx:38-288`). Tabs unlinked/linked/suggestions; search + account; unlinked API `limit:100`, friends `limit:200`, link edit có readonly field (`:732,879-885`); popup link/unlink, edit status/display/UID, QR deep link. No bulk action. Các bản standalone trùng chức năng omnichannel và không có sidebar.

<a id="d13"></a>
## D13. Các màn hình component nhập/xuất và dialog cần chú ý

- **GoogleSheetSyncPanel:** bảng config mã sheet/CS, fields lịch sync/full sync; `importsApi.getSheetSyncConfigs/updateSheetSyncConfig/runSheetSync/runSheetSyncAll/getServiceAccount/saveServiceAccount`; trạng thái loading/saving/syncing và editor service account (`frontend/src/features/imports/components/GoogleSheetSyncPanel.tsx:74-93,206-288`).
- **CsSheetBackupPanel:** config theo CS, lịch 2 lần/ngày/1 lần/custom, run one/all delta/full, download Excel; A/M mới được sửa/chạy/tài khoản service (`frontend/src/features/imports/components/CsSheetBackupPanel.tsx:54-72,180-264,317-510,783-955`).
- **AttendanceExcelImportPanel:** upload file, source CSKH/GV, target year, preview classification filter, chỉnh action từng item, confirm (`frontend/src/features/attendance/components/AttendanceExcelImportPanel.tsx:14-34,58-70`).
- **ImportApprovalQueue (không mount):** pending request list, select item, approve hoặc reject; reject bắt buộc reason, approve truyền version + CS assignment (`frontend/src/features/imports/components/ImportApprovalQueue.tsx:13-20,94-131`).
- **CareTaskList/CareTaskModal:** task filter/list, complete/cancel/edit; create Enrollment ID required; edit khóa enrollment ID (`frontend/src/features/care/components/CareTaskModal.tsx:34-89`).


# E. ImportsPage và luồng nhập dữ liệu

<a id="imports-page"></a>
## ImportsPage — `/imports` (A/M/C/T)

[ĐKC] `frontend/src/features/imports/pages/ImportsPage.tsx:16-36,96-108`: mặc định tab `sheet-sync`; query `?tab=sheet-backup|attendance|wizard|history` chọn tab ban đầu. Có 5 tab: Đồng bộ Google Sheet (JLPT & Kaiwa), Backup Sổ CSKH (Sheet 1 & 3), Upload Hồ sơ (Sheet 1), Điểm danh CSKH / GV, Lịch sử nhập. Sau upload thành công, callback tự chuyển sang history (`:106`). **Không phải wizard hai sheet đồng thời**: hồ sơ Sheet 1 và điểm danh Sheet 3/GV là hai luồng khác nhau.

- **Export:** `importsApi.exportStudents/exportAttendance` (`ImportsPage.tsx:38-58`), file download, loading riêng từng nút, lỗi toast; không có filter export tại page.
- **API hồ sơ:** `importsApi.upload/saveMapping/validate/confirm`; endpoints lần lượt `/imports/upload`, `/:id/mapping`, `/:id/validate`, `/:id/confirm` (`features/imports/api/imports.api.ts:19-69`). A/M load `/settings/users` để gán CS; không có role gate riêng cho wizard (`ImportWizard.tsx:67-91`).
- **Bước 1:** `.xlsx`; upload disabled nếu chưa file; chọn CS optional (mặc định người đăng nhập). Upload phải trả `studentEnrollment`, thiếu thì lỗi; không giữ attendance preview (`ImportWizard.tsx:106-123,193-235`).
- **Bước 2:** mapping bắt buộc ID HV→`external_id`, Gói học→`package_code`; phần còn lại optional: tên, phone/email, số buổi, lớp, course/status/payment/sale/dates/report/exchange/callback/hot/post-care/handed-over/account-created (`:37-61,180,239-261`). Bảng preview Dòng→`_rowNumber`, header gốc→`row[h.col]`, chỉ 5 dòng và 12 cột đầu (`:262-278`). Không sort/pagination. Nút quay lại và đối soát disabled khi thiếu hai mapping bắt buộc.
- **Bước 3:** tổng khóa/ghi đè/thêm mới/yêu cầu điều chuyển/bỏ ngoài quyền/lỗi→`report.summary.*`; bảng Khóa HV→externalId+packageCode, Hành động→classification, Chi tiết→diffs+attendanceDiffs (4 thay đổi đầu), Cảnh báo/Lỗi→warnings+errors (`:295-405`). Confirm gọi `confirm(importId,true,assignedCsId)` — skipErrors=true, không disabled chỉ vì có invalid; chỉ dữ liệu hợp lệ được xử lý (`:164-178,408-411`). Có nút sửa ánh xạ.
- **Bước 4:** success_rows/failed_rows, conflict_attendances, CareGroupSyncReportCard; nhập file khác, mở liên kết nhóm và đối soát (`:415-465`). [SLCC] Callback page chuyển ngay sang history có thể khiến bước kết quả bị unmount trước khi user xem báo cáo/link; cần test (`ImportsPage.tsx:106`, `ImportWizard.tsx:169-176`).
- **Luồng điểm danh:** `attendanceImportApi.preview/confirm(file,source,year,actions)` (`features/attendance/components/AttendanceExcelImportPanel.tsx:24-38`, API tại `features/attendance/api/reconciliation.api.ts`). Source CSKH mặc định hoặc TEACHER; năm hiện tại, min2020/max2100; .xlsx. Preview bảng Học viên/Ngày/Giá trị/Ca xử lý/Trạng thái/Duyệt; summary filter CREATE/UNCHANGED/CONFLICT/INVALID/OUT_OF_SCOPE; confirm chỉ thay đổi conflict được chọn “Ghi theo Excel”; result bảng Học viên/Ngày/Giá trị/Kết quả/Chi tiết + counts (`:44-67`). Có quay lại preview/đổi file; không phân trang.
- **Lịch sử:** `importsApi.listBatches(50,0)` và `downloadErrors`, hiển thị batch/result và download lỗi (`features/imports/components/ImportHistoryTable.tsx:9-18,136`); loading/error riêng. [SLCC] Chỉ lấy 50 batch đầu, chưa có bằng chứng duyệt lịch sử sâu hơn.
- **Quyền/trạng thái:** route cho cả T; page không lọc tab theo role. Backup controls disabled với non-A/M; GoogleSheetSyncPanel không có useAuth gate. [CXM] Quyền backend sync/export/import phải khảo sát API riêng.

<a id="approval-queue"></a>
## Hàng đợi / luồng chưa có đường vào UI

- [ĐKC] `ImportApprovalQueue` (`features/imports/components/ImportApprovalQueue.tsx:11-143`) gọi `importsApi.listCreateRequests('PENDING')/approveCreateRequest/rejectCreateRequest` với optimistic `version`, reject bắt buộc lý do (`disabled={!reason.trim()}`). File **không được import/render bởi bất kỳ page nào** (grep toàn `frontend/src` chỉ ra chính nó) → hàng đợi phê duyệt yêu cầu tạo học viên chưa có màn hình trong UI.
- [ĐKC] `features/imports/pages/ImportsPage.tsx:96-108` render đúng 5 panel, không có approval queue. Wizard sinh `REQUEST_TRANSFER` (`ImportWizard.tsx:337-341`) nhưng người dùng không có đường duyệt trong app → phụ thuộc API/backend `[SLCC]`.
- [ĐKC] `ZaloMonitorPage` mount nhưng không có mục menu; `ChannelSecurityLimitsDialog` mount qua Accounts page (`OmnichannelAccountsPage.tsx:927`).

# F. Phát hiện bất nhất / lỗi UX trong mã

1. [ĐKC] `HomePage.tsx:97-106` gate Imports theo A/M còn route cho A/M/C/T (`App.tsx:124-134`) và Sidebar cho A/M/C/T → C và T mất lối vào Home. Tương tự Care quick link A/M/C (`HomePage.tsx:37-46`) vs route/sidebar có TEACHER.
2. [ĐKC] `Sidebar.tsx:50` `isTeacherOnly` bỏ qua CS: user TEACHER+CS vẫn được coi teacher-only cho badge điểm danh, trong khi `CarePage.tsx:90-94` và `ClassesPage.tsx:130-135` định nghĩa teacher-only bao gồm “không CS” → cùng một user hành xử khác nhau giữa các trang.
3. [ĐKC] `PreferencesPage.tsx:112-145` cho mọi user cấu hình cột `/enrollments` và `/students` dù route A/M/C (`App.tsx:76-85`); TEACHER thấy cấu hình vô dụng.
4. [ĐKC] `App.tsx:128-131` route teacher có trong nhóm A/M/C/T nhưng `Sidebar.tsx:139-148` hide với CS thuần → CS mở được URL `/teacher/*`, vào trang mà không có lối quay (breadcrub/empty state chưa chắc thân thiện) `[SLCC]`.
5. [ĐKC] `EnrollmentsPage.tsx:52-68` fetch enrollments **chỉ theo `filters.selectedSale`**; các filter khác (program, status, date, session counts…) chạy client trên dữ liệu đã tải → dữ liệu lớn sẽ chậm và “Hiển thị X / Y học viên” (`:608-616`) chỉ là số client, không phải số phía server.
6. [ĐKC] `StudentsPage.tsx:186` `isCS` chỉ loại ADMIN mà không loại MANAGE, khác định nghĩa ở `EnrollmentsPage.tsx:36` (loại cả ADMIN lẫn MANAGE) → CS+MANAGE bị giới hạn danh sách học viên theo sale ở trang Students nhưng không ở trang Enrollments.
7. [ĐKC] `StudentsPage.tsx:382-394` lọc CS so khớp `saleName.includes(userIdentifier)` (chuỗi contains) — nếu tên user là chuỗi con của sale khác thì hiện nhầm học viên; đồng thời `salesList` (`:401-412`) trộn sale_name, cs.name, cs.email vào một dropdown nên label không phân biệt.
8. [ĐKC] `OmnichannelContactsPage.tsx:157-189` phân trang server cho Zalo (`limit:50`) nhưng LINE load một lần `limit:200` không phân trang → >200 bạn bè LINE bị ẩn.
9. [ĐKC] `OmnichannelInboxPage.tsx:103-199` giới hạn 40 conversations và 60 messages, `markConversationRead` fire-and-forget có `.catch(()=>{})` → lỗi đánh dấu đã đọc bị nuốt, UI vẫn báo đã đọc `[SLCC]`.
10. [ĐKC] `OmnichannelStudentLinksPage.tsx:106-123` `initialTab="ZALO"` → filter `UNLINKED_ZALO` (chưa liên kết), không phải toàn bộ ZALO; `App.tsx:98,109` truyền giá trị này nên đường dẫn cũ `/zalo/lien-ket`, `/line/lien-ket` mở tab “chưa liên kết” thay vì tab liên kết → dễ hiểu nhầm.
11. [ĐKC] `AutomationWorkflowsPage.tsx:76` `listWorkflows({ limit: 100 })` và `BroadcastCampaignsPanel.tsx:239` `listBroadcasts({ limit: 200 })` đều không phân trang thật; `DataTable` local page size 10 chỉ chia trang trên dữ liệu đã lấy → workflow/broadcast thứ 101/201 không bao giờ thấy.
12. [ĐKC] `ZaloMonitorPage.tsx:166-178` in `JSON.stringify(e.payload)` thô của event Zalo (tin nhắn, bạn bè, nhóm) ra log màn hình → lộ dữ liệu cá nhân trên màn hình chia sẻ; route không có trong menu nhưng vẫn mở được bằng URL.
13. [ĐKC] `ImportWizard.tsx:82-91` load `/settings/users` cho ADMIN/MANAGE với `.catch(() => {})` im lặng: nếu lỗi, dropdown “Gán học viên cho tài khoản CSKH” rỗng mà không có thông báo → user tưởng không có CS nào.
14. [ĐKC] `CsSheetBackupPanel.tsx:783-955` mọi control `disabled={!isAdminOrManage}` nhưng panel vẫn render cho CS/TEACHER (route `/imports` cho T) → CS thấy bảng điều khiển xám, không rõ vì sao bị khóa; `GoogleSheetSyncPanel` không có gate nào tương tự.
15. [CXM] Không kết luận lỗi encoding từ output terminal Windows: đối chiếu Read/Grep UTF-8 cho thấy `CarePage.tsx:324`, `StudentsPage.tsx:703`, `UsersPage.tsx:431`, `ClassesPage.tsx:1423`, `AutomationWorkflowsPage.tsx:281` có tiếng Việt đúng. Ký tự lỗi ở một số output shell là hạn chế kênh hiển thị khảo sát, không phải bằng chứng lỗi UX.
16. [ĐKC] `StudentsPage.tsx:1929` lọc cột bằng `keepColumn` theo Preferences nhưng `columns.ts` không đăng ký một số cột có trong tab2 (milestone động), nên các cột đó không ẩn được — đã ghi chú `columns.ts:151`.
17. [ĐKC] `DashboardPage.tsx:350` điều kiện loading `!overview && !care && !attendance && !performance`: sau khi chuyển tab, payload tab cũ vẫn còn nên không hiện loading → người dùng không biết tab mới đang tải `[SLCC]`.
18. [ĐKC] `AttendanceReconciliationPage` route `App.tsx:119-120` không có TEACHER dù tab “chờ giáo viên điểm danh” là dữ liệu GV tạo; GV chỉ xử lý qua `/teacher/attendance-tracking`. [SLCC] Có thể là chủ ý phân vai.
19. [ĐKC] `EnrollmentsPage.tsx:120-128,157-163` đặt giá trị mặc định cứng cho `schedule_pattern:'246'`, `start_time:'20h00'`, `duration_minutes:30` khi enrollment chưa có lịch → các bộ lọc lịch học/giờ học (`:424-441`) khớp theo giá trị giả, cho ra kết quả sai bản chất `[SLCC]`.
20. [ĐKC] User có cả CS lẫn TEACHER (không A/M): `ClassesPage.tsx:130-135` đặt `isTeacher=false` và `canManageClasses=false`, nên mọi handler chấm điểm ở ClassesPage đều return sớm (`ClassesPage.tsx:496,546,623,679,1071`) → không chấm được từ `/classes`. Nhưng `AttendanceMatrix.tsx:485-488` xếp họ vào `isCSOnly` (side CS) → vẫn sửa cột CSKH trên `/enrollments` hoặc AttendanceSheet. Cùng một user, cùng dữ liệu điểm danh, khả năng sửa khác nhau tùy trang vào `[SLCC]` (cần kiểm chứng runtime).

21. [SLCC] Không có trang 403/permission-denied chung: sai role bị `Navigate to "/"` (`ProtectedRoute.tsx:24-26`), người dùng không biết mình thiếu quyền gì; riêng ClassSessions/AttendanceSheet có màn “Không có quyền truy cập lớp học” do API 403, tạo cảm giác bất nhất.
