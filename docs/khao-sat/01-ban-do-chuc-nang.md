# 01. Bản đồ chức năng frontend

Ngày khảo sát: 24/10/2026. Phạm vi: đọc mã nguồn React, không chạy app/backend. Mọi đường dẫn trích dẫn tính từ gốc repository.

**Nhãn bằng chứng:** [ĐKC] đã kiểm chứng trực tiếp trong code; [SLCC] suy luận từ code, chưa kiểm chứng runtime; [CXM] chưa xác minh. Quyền dưới đây là quyền frontend, không thay thế kiểm tra API/backend. A=ADMIN; M=MANAGE; C=CS; T=TEACHER; `*`=mọi tài khoản đã đăng nhập. Điều kiện role dùng OR, không phải AND.

## 1. Cây chức năng theo bốn nhóm nghiệp vụ

- **Tổng quan:** trang chủ `/`; báo cáo `/dashboard`; đăng nhập `/login`; cấu hình cá nhân `/settings/preferences`; quản trị tài khoản/cấu hình `/settings/users`.
- **Chăm sóc KH:** ghi danh `/enrollments`; học viên `/students`; báo cáo học tập `/students/:id/study-report`; nhiệm vụ/nhật ký/thông báo `/care`; đa kênh accounts/chat/contacts/groups/student-links; automation workflow và chiến dịch broadcast; monitor Zalo; nhập/xuất và đồng bộ/backup Sheet như công cụ dữ liệu hỗ trợ.
- **Đào tạo & Lớp:** gói học `/packages`; giáo viên `/teachers`; lớp `/classes`; lịch buổi `/classes/:classId/sessions`; bảng điểm danh cấp lớp hoặc buổi; đối soát `/attendance/reconciliation`; nhập Excel hồ sơ/điểm danh.
- **Giáo viên:** lịch dạy `/teacher/my-sessions`; theo dõi điểm danh `/teacher/attendance-tracking`; lớp/điểm danh; thông báo trong `/care`; nhập/xuất được route cho phép nhưng từng tab có gate riêng.

[ĐKC] Cây trên là cách nhóm nghiệp vụ, **không phải số nhóm sidebar**. Sidebar thực có 7 nhóm, ghi nguyên văn bên dưới (`frontend/src/layouts/Sidebar.tsx:70-222`). Route được xác minh tại `frontend/src/App.tsx:47-147`.

## 2. Menu sidebar thực tế và quyền

|Nhóm sidebar|Tên mục|Đường dẫn|Gate route|Role thấy menu|
|---|---|---|---|---|
|TỔNG QUAN|Báo cáo Thống kê|`/dashboard`|A M C|A M C|
|CHĂM SÓC KHÁCH HÀNG|Quản lý Ghi danh|`/enrollments`|A M C|A M C|
||Danh sách Học viên|`/students`|A M C|A M C|
||Nhiệm vụ & Chăm sóc|`/care`|A M C T|A M C T|
|ĐÀO TẠO & LỚP HỌC|Đối soát Điểm danh|`/attendance/reconciliation`|A M C|A M C|
||Gói học & Khóa học|`/packages`|A M|A M|
||Danh sách Giáo viên|`/teachers`|A M|A M|
|GIÁO VIÊN|Lớp học & Điểm danh|`/classes`|A M C T|A M C T|
||Lịch dạy của tôi|`/teacher/my-sessions`|A M C T|A M T|
||Theo dõi điểm danh|`/teacher/attendance-tracking`|A M C T|A M T|
|ĐA KÊNH (ZALO & LINE)|Hộp thư Đa kênh|`/omnichannel/chat`|A M C|A M C|
||Tài khoản & Bảo mật|`/omnichannel/accounts`|A M C|A M C|
||Danh bạ Đa kênh|`/omnichannel/contacts`|A M C|A M C|
||Nhóm Lớp Đa kênh|`/omnichannel/groups`|A M C|A M C|
||Liên kết HV Đa kênh|`/omnichannel/student-links`|A M C|A M C|
||Automation Workflow|`/automation`|A M C|A M C|
|DỮ LIỆU & HỆ THỐNG|Nhập & Xuất Excel|`/imports`|A M C T|A M C T|
||Quản trị & Cấu hình|`/settings/users`|A|A|
|CÁ NHÂN|Cấu hình cá nhân|`/settings/preferences`|*|*|

[ĐKC] Nguồn menu: `frontend/src/layouts/Sidebar.tsx:70-222`; lọc role tại `:224-227,255-257`. Logo dẫn về `/` (`:233`). Badge Theo dõi chỉ với TEACHER không có ADMIN/MANAGE; đếm API, lỗi trả 0 (`:50-68,148,279-282`). **CS có thể mở hai route giáo viên trực tiếp nhưng không có menu**; CS+TEACHER vẫn được xem là teacher-only trong logic badge sidebar (khác CarePage).

[ĐKC] ProtectedRoute chờ phiên; chưa đăng nhập → `/login`; thiếu bất kỳ role hợp lệ → `/`, không có trang 403 (`frontend/src/components/auth/ProtectedRoute.tsx:9-28`). Route lạ → `/` (`frontend/src/App.tsx:151-152`). Trang chủ quick links khác sidebar: Care chỉ A/M/C, Imports chỉ A/M (`frontend/src/pages/home/HomePage.tsx:37-46,97-106`). [SLCC] Người dùng T/C có thể tưởng chức năng không tồn tại nếu chỉ vào qua trang chủ.

## 3. Route ngoài sidebar và alias

[ĐKC] Chi tiết workflow `/automation/:id`, báo cáo học viên và các route buổi/điểm danh không có mục menu riêng. `/omnichannel` redirect sang accounts. Các alias tiếng Việt dùng Navigate `replace`, ngoại trừ alias có tham số báo cáo/lớp render trực tiếp cùng component (`frontend/src/App.tsx:48,58,63,69-83,86-88,120-146`).

|Route cũ|Đích/component thực|Tình trạng tĩnh|
|---|---|---|
|`/zalo`|OmnichannelAccountsPage, không initialChannel|Alias render, không redirect|
|`/zalo/tai-khoan`|`/omnichannel/accounts?channel=ZALO`|Redirect|
|`/zalo/monitor`|ZaloMonitorPage|Route hoạt động, không menu riêng|
|`/zalo/lien-ket`, `/danh-ba`, `/nhom`, `/chat`|OmnichannelStudentLinks/Contacts/Groups/Inbox với initial ZALO|Alias render|
|`/zalo/standalone`|ZaloAccountsPage|Trang cũ vẫn được route|
|`/line`|OmnichannelAccountsPage initialChannel LINE_OA|Alias render|
|`/line/tai-khoan`|`/omnichannel/accounts?channel=LINE_OA`|Redirect|
|`/line/danh-ba`, `/nhom`, `/chat`, `/lien-ket`|Omnichannel tương ứng với initial LINE|Alias render|
|`/line/standalone`, `standalone-chat`, `standalone-contacts`, `standalone-groups`, `standalone-links`|LineAccountsPage/LineChatPage/LineContactsPage/LineGroupsPage/StudentLineLinkPage|5 trang cũ còn route|

Nguồn [ĐKC]: `frontend/src/App.tsx:95-114`. **Không có 5 route Zalo standalone**: chỉ Accounts được import và mount; ZaloChatPage, ZaloContactsPage, ZaloGroupsPage, StudentZaloLinkPage tồn tại trên đĩa nhưng không nằm trong imports App. [SLCC] Chúng cô lập với router chính; cần tìm import động/đường vào ngoài App trước khi kết luận mã chết toàn bộ. [CXM] Tần suất sử dụng route cũ và bookmark thực tế chưa xác minh.

## 4. Cấu hình cột cá nhân theo role

[ĐKC] Mọi user đăng nhập đều mở Preferences, không gate nội bộ theo role. Có hai section: Quản lí Ghi danh (Nhanh/Chi tiết/Thống kê) và Danh sách Học viên (Danh sách/Báo cáo & Chăm sóc). Vì vậy T cũng thấy cấu hình cho `/students` và `/enrollments` dù hai route đó chỉ A/M/C (`frontend/src/features/preferences/pages/PreferencesPage.tsx:17-26,112-145`; `frontend/src/App.tsx:76-85`).

[ĐKC] Lưu draft, chọn/bỏ tất cả, khôi phục mặc định, badge Chưa lưu; Lưu disabled nếu không dirty hoặc đang saving; skeleton lúc tải (`PreferencesPage.tsx:34-104`). Registry có 5 scopes, khóa cột action ở 2 tab học viên; cột chăm sóc động theo mốc buổi không cấu hình được; mặc định chi tiết Sale ẩn, thống kê Email/Mã GV/Sale ẩn (`frontend/src/features/preferences/columns.ts:21-73,77-157`). Bản đặc tả trường/cột ở tài liệu 06.
