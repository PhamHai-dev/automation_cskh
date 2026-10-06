# Project Changelog

## 2026-10-06 — Audit actor cho điểm danh tự động

- Theo xác nhận của user, scheduler sử dụng tài khoản audit riêng `auto-attendance@system.invalid`, tạo idempotently khi cần, không gán user ID=1.
- Tài khoản inactive, roles rỗng, password marker không phải hash đăng nhập; nếu identity dành riêng bị thay đổi thành tài khoản khác thì từ chối sử dụng.
- Session và Attendance ghi nhận cùng actor hệ thống. Không tự cấp quyền hoặc sửa tài khoản trùng email.
- Backend typecheck pass; 21/21 integration tests pass trên database test cô lập, gồm audit actor và login trả 403.
- Không thay đổi retry FAILED, lịch sử migration, cấu hình Redis hay database đang dùng.


## 2026-09-22 — Mở Rộng Form Thêm Mới & Chỉnh Sửa Học Viên Đầy Đủ Các Cột Sheet 1 & Chuẩn Hóa Lịch Học

- **Mở Rộng Form Thêm Mới & Chỉnh Sửa Học Viên (`/students`):**
  - Mở rộng giao diện modal lên kích thước lớn (`size="2xl"`, tối đa `max-w-4xl`) chia làm 4 tab nghiệp vụ chuyên biệt:
    1. **1. Hồ sơ & Liên hệ:** Mã học viên, Họ và tên, Giới tính, Ngày sinh, Số điện thoại, Email, Zalo UID, Nghề nghiệp, Trường học, Họ tên & SĐT Phụ huynh, Ghi chú cá nhân.
    2. **2. Khóa học & Tài chính:** Nội dung khóa học, Trình độ (N5..N1, Kaiwa), Sale phụ trách, Trạng thái học viên, Ngày nộp học phí, Trạng thái thanh toán, Tổng số buổi, Số buổi còn lại (hỗ trợ nhập âm nợ), Mô hình lớp, Ghi chú sale.
    3. **3. Lớp học & Lịch học:** Tên lớp học, Giáo viên phụ trách, Trạng thái gói, Ngày bắt đầu, Ngày kết thúc, cùng 3 trường lịch học chuẩn hóa (**Giờ học**, **Lịch học**, **Thời lượng**).
    4. **4. Báo cáo & CSKH:** Đường dẫn báo cáo học tập Google Docs/Sheets, Lịch hẹn gọi CSKH, Điểm nóng/Vấn đề gấp, Ngày bàn giao, Ngày tạo tài khoản, Trao đổi với HV/PH, Chăm sóc sau khóa học.
  - Hỗ trợ thanh điều hướng Bước (Quay lại / Tiếp theo) và tự động nạp đầy đủ dữ liệu khi mở chỉnh sửa học viên có sẵn.
  - Backend xử lý lưu/cập nhật đồng thời qua Prisma Transaction giữa `Student`, `Enrollment`, `Class`, `ClassSchedule` và `EnrollmentClass`.

- **Chuẩn Hóa Tiêu Đề Cột & Tinh Gọn Cột Lịch Học:**
  - Quy chuẩn toàn bộ tiêu đề cột: Chỉ viết hoa chữ cái đầu và in đậm (Sentence case + bold).
  - Tinh gọn 6 cột lịch học phức tạp thành đúng 3 cột: `Giờ học`, `Lịch học`, `Thời lượng`.

## 2026-09-22 — Chuẩn Hóa Danh Sách Học Viên Theo Đúng Cấu Trúc Sheet 1 Phân Chia 2 Tab (Học Viên & Báo Cáo Học Tập)

- **Cấu Trúc 2 Tab Trên Trang Danh Sách Học Viên (`/students`):**
  - **Tab 1 — Hồ sơ Học viên (Cột A ➔ AJ):**
    - Cột A ➔ I: Định danh & thông tin liên hệ học viên, Sale/CS phụ trách, Trạng thái, Khóa học đăng ký.
    - Cột J ➔ AJ: Chi tiết học phí, số tiền đã đóng, nợ học phí, gói học, lớp học, giáo viên, lịch học (thứ, giờ, thời lượng), tiến độ số buổi (tổng buổi, đã học, còn lại, nợ buổi highlight cảnh báo âm).
    - Giữ nguyên giao diện bảng trực quan kèm Modal xem chi tiết 4 nhóm trường nghiệp vụ.
  - **Tab 2 — Báo cáo Học tập & Chăm sóc (Cột A ➔ I + Cột AK ➔ BH):**
    - Cột A ➔ I: Cố định bên trái để đối soát không bị lệch hàng khi cuộn ngang.
    - Cột AK (Báo cáo học tập): Hiển thị nút/link mở trực tiếp file Google Docs/Sheets báo cáo học tập, hỗ trợ click để dán/sửa link nhanh.
    - Cột AL (Trao đổi với HV/PH): Hỗ trợ chỉnh sửa trực tiếp dạng bảng tính Excel (Inline Edit) — click gõ nội dung, blur hoặc nhấn Enter tự động lưu ngầm vào Database.
    - Cột AM (Lịch hẹn gọi) & Cột AN (Điểm nóng): Inline edit trực tiếp trên ô + tự động sinh và đồng bộ nhiệm vụ chăm sóc (`CareTask` loại `CALLBACK` hoặc `HOT_ISSUE`) cho CS phụ trách.
    - Cột Chăm sóc sau buổi: Mặc định hiển thị `CS Buổi 1`. Tích hợp nút **"+ Thêm mốc buổi CS"** cho phép người dùng tự do thêm bất kỳ mốc buổi nào (Buổi 3, Buổi 5, Buổi 10...), tự động lưu cấu hình toàn hệ thống (`care_milestone_configs`) để tất cả tài khoản thấy cùng danh sách cột. Hỗ trợ inline edit nội dung chăm sóc sau buổi trực tiếp vào `CareLog`.
    - Cột BD ➔ BH: Chăm sóc sau kết thúc (inline edit), Ngày kết thúc, Ngày bàn giao, Tháng nộp HP, Ngày tạo tài khoản.
- **Backend & Database:**
  - Cập nhật model `Enrollment` bổ sung các trường: `study_report_url`, `exchange_info`, `callback_note`, `hot_issue_note`, `post_course_care`.
  - Bổ sung model `CareMilestoneConfig` (`care_milestone_configs`) lưu cấu hình các mốc buổi CSKH tùy biến.
  - Thêm các API endpoints: `GET /api/v1/milestones`, `POST /api/v1/milestones`, `PUT /api/v1/enrollments/:id/care`, `PUT /api/v1/enrollments/:id/sessions/:session/care-log`.
  - Cập nhật module Import Excel: Tự động phát hiện và trích xuất link hyperlink (Google Docs/Sheets) cho cột AK, lưu thông tin trao đổi AL, ghi chú mốc buổi AO..BC vào `CareLog` và cột BD vào `Enrollment`.
- **Kiểm Thử & Xác Nhận:**
  - 14/14 tests integration module Care vượt qua thành công (100% pass).
  - Frontend TypeScript build và Vite compile sạch 0 lỗi (`dist` bundle sẵn sàng).
  - Subagent trình duyệt kiểm thử thực tế luồng tương tác: chuyển tab mượt mà, thêm cột Buổi 3 thành công thời gian thực, chụp screenshot và quay video WebP lưu lại artifact.

## 2026-09-21 — Ma trận Điểm danh Lịch Ngày, Cấu trúc Tab CSKH/Sale, Chuẩn hóa 5 Tài khoản Test & Tối ưu Giao diện

- **Ma trận Điểm danh theo Lịch Ngày (Attendance Matrix by Calendar Dates):**
  - Loại bỏ số thứ tự buổi học trừu tượng (Buổi 1, Buổi 2...), chuyển sang hiển thị trực tiếp theo **Thứ & Ngày trong lịch** (VD: `T2 01/09`, `T4 03/09`...) khớp chính xác với Sheet 3 (`3.Chấm buổi`).
  - Bổ sung bộ lọc thời gian đa dạng: Mặc định hiển thị **Tháng hiện tại**, chuyển đổi nhanh xem theo **Tuần**, **Tháng**, hoặc **Tất cả / Khoảng ngày tùy chỉnh**.
  - Cố định 11 cột thông tin học viên & lớp học bên trái: STT, Mã HV, Họ và tên, Ngày bắt đầu học, Trạng thái, Ngày kết thúc/Bảo lưu, Giờ học, Lịch học, Thời lượng, GV & Mã GV, Tên lớp.
  - Loại bỏ cột *"Chỉ số chuyên cần ĐH % và BT %"* theo yêu cầu người dùng.
  - Khắc phục triệt để hiện tượng chữ bị đè khi cuộn ngang bằng cách cố định 3 cột nhận diện (`#`, `Mã HV`, `Họ và tên`) với nền đục (`bg-white`/`bg-slate-50`) và viền đổ bóng nhẹ (`shadow-sm`).
  - Hỗ trợ điểm danh trực tiếp qua click ô: `X` (Có mặt - Xanh lá), `A` (Nghỉ phép - Vàng), `B` (Bảo lưu - Xanh dương), `C` (Nghỉ không phép - Đỏ), `D` (GV nghỉ - Tím), `E` (Lỗi kỹ thuật - Xám).

- **Tái Cấu Trúc Tab & Nghiệp vụ cho Nhân viên Chăm sóc Khách hàng (Sale & CSKH là 1):**
  - **Đồng nhất vai trò:** Xác nhận nghiệp vụ *"Sale với nhân viên chăm sóc khách hàng là 1"*, sử dụng vai trò hệ thống `CS`. Cột `Sale` trong Sheet 1 ánh xạ trực tiếp với tài khoản đăng nhập (Email/Username) mà Admin tạo.
  - **Tab Quản lý ghi danh (`/enrollments`) ➔ Ma trận Điểm danh theo Sale:**
    - Tự động lọc học viên theo tài khoản Sale của người đang đăng nhập nếu là vai trò `CS`.
    - Cung cấp dropdown chọn Sale nếu tài khoản có vai trò `ADMIN` hoặc `MANAGE`.
    - Hỗ trợ chuyển đổi linh hoạt giữa chế độ **Ma trận Điểm danh (Matrix View)** và **Bảng Ghi danh (Table View)**.
  - **Tab Danh sách học viên (`/students`) ➔ Chuẩn Cấu Trúc Sheet 1 (`1.Chăm sóc`):**
    - Hiển thị đầy đủ 28 cột dữ liệu nghiệp vụ của Sheet 1.
    - Nổi bật cảnh báo **Nợ buổi âm** (ví dụ `-1`, `-2` buổi) bằng huy hiệu đỏ đậm (`bg-red-100 text-red-800 border-red-300 font-extrabold`).
    - Tự động lọc danh sách học viên theo Sale phụ trách nếu tài khoản đăng nhập là `CS`.
    - Tích hợp Modal xem chi tiết trọn vẹn 28 trường hồ sơ học viên.
  - **Sidebar CSKH:**
    - Tinh gọn và sắp xếp lại thứ tự menu cho CSKH: Báo cáo Thống kê (`/dashboard`) ➔ Quản lý Ghi danh (`/enrollments`) ➔ Danh sách Học viên (`/students`) ➔ Nhiệm vụ & Chăm sóc (`/care`).

- **Xóa & Tái Thiết Lập Toàn Bộ Dữ Liệu Test (5 Tài khoản Chuẩn Hóa):**
  - Đặt lại toàn bộ cơ sở dữ liệu và khởi tạo đúng 5 tài khoản test với mật khẩu chung `123456`:
    1. `admin@gmail.com` (Quản trị viên, `ADMIN` - toàn quyền quản lý).
    2. `cskh1@gmail.com` (CSKH 1 / Sale 1, `CS` - phụ trách 4 học viên: `HV_001` -> `HV_004`).
    3. `cskh2@gmail.com` (CSKH 2 / Sale 2, `CS` - phụ trách 4 học viên: `HV_005` -> `HV_008`, có nợ âm).
    4. `cskh3@gmail.com` (CSKH 3 / Sale 3, `CS` - phụ trách 5 học viên: `HV_101` -> `HV_105`, có nợ âm).
    5. `teacher@gmail.com` (Sensei Tanaka Kenji, `TEACHER` - giáo viên lớp N5 và N4).
  - Phân bổ học viên và tạo sẵn dữ liệu điểm danh thực tế tháng 9/2026 cho 2 lớp học (Lớp N5-K01 và Lớp N4-K02).
  - Cập nhật các nút đăng nhập thử nghiệm nhanh tại trang Đăng nhập (`LoginPage.tsx`).

- **Cải Thiện Giao Diện & Trải Nghiệm Người Dùng (UI/UX):**
  - Sửa lỗi tương phản màu chữ trong ô nhập email/password trên nền tối của trang Đăng nhập (`text-slate-900` trên nền trắng có viền rõ ràng).
  - Thay thế toàn bộ `alert()` / `window.confirm()` bằng hệ thống Toast thông báo hiện đại (`useToast`) và Modal chuẩn hóa có hiệu ứng làm mờ nền (backdrop blur).
  - Kiểm thử giao diện và xác minh luồng đăng nhập thực tế bằng subagent trình duyệt trên môi trường đang chạy.

- **Quy Tắc Import Excel Sheet 3:**
  - Đối soát học viên cũ: Tự động đồng bộ điểm danh theo ngày mà không hỏi lại.
  - Học viên mới từ file: Hiển thị hộp thoại xác nhận hỏi người dùng có muốn tự động tạo mới học viên và ghi danh vào lớp hay không.

## 2026-09-20 — Web & Docs: Đồng bộ Route Tiếng Anh Chuẩn & Toàn diện Giao diện Tiếng Việt

- **Chuẩn hóa URL Routing Tiếng Anh (Chỉ đường dẫn URL là tiếng Anh):**
  - Chuyển đổi toàn bộ route chính thức sang định dạng tiếng Anh chuẩn mực (RESTful / kebab-case):
    - `/login`: Đăng nhập hệ thống (hỗ trợ alias redirect từ `/dang-nhap`)
    - `/dashboard`: Báo cáo tổng quan & thống kê (hỗ trợ alias redirect từ `/tong-quan`)
    - `/care`: Chăm sóc học viên & Nhiệm vụ CS (hỗ trợ alias redirect từ `/cham-soc`)
    - `/enrollments`: Quản lý hợp đồng & ghi danh (hỗ trợ alias redirect từ `/ghi-danh`)
    - `/classes`: Quản lý danh sách lớp học (hỗ trợ alias redirect từ `/lop-hoc`)
    - `/classes/:classId/sessions`: Danh sách buổi học (hỗ trợ alias redirect từ `/lop-hoc/:classId/buoi-hoc`)
    - `/classes/:classId/sessions/:sessionId/attendance`: Phiếu điểm danh (hỗ trợ alias redirect từ `/lop-hoc/.../diem-danh`)
    - `/students`: Quản lý học viên & phụ huynh (hỗ trợ alias redirect từ `/hoc-vien`)
    - `/packages`: Quản lý gói học (hỗ trợ alias redirect từ `/goi-hoc`)
    - `/teachers`: Quản lý giáo viên (hỗ trợ alias redirect từ `/giao-vien`)
    - `/imports`: Nhập & xuất dữ liệu Excel (hỗ trợ alias redirect từ `/nhap-xuat-excel`)
    - `/settings/users`: Quản lý người dùng & phân quyền (hỗ trợ alias redirect từ `/cai-dat/nguoi-dung`)
  - Duy trì các alias redirect từ route tiếng Việt cũ để tránh lỗi liên kết bookmark.
- **Việt hóa Toàn diện Giao diện Web:**
  - `LoginPage`: Tiêu đề, nhãn email/mật khẩu, nút đăng nhập và thông báo lỗi tiếng Việt.
  - `UsersPage`: Tiêu đề "Quản lý Người dùng & Phân quyền", tiêu đề cột, badge vai trò tiếng Việt (`Quản trị viên`, `Quản lý nhóm`, `Nhân viên CSKH`, `Giáo viên`), trạng thái và các modal thao tác.
  - `PackagesPage`: Việt hóa toàn bộ bảng danh mục gói học, số buổi định mức, trạng thái và modal thêm/sửa gói.
  - `TeachersPage`: Việt hóa bảng giáo viên, phân loại giảng viên (`Giáo viên Việt`, `Giáo viên Bản ngữ`), trạng thái và form thông tin.
  - `StudentsPage`: Việt hóa bảng học viên, giới tính, thông tin liên lạc, mã định danh và modal thêm/sửa học viên.
  - `ClassesPage`: Việt hóa bảng lớp học, hình thức đào tạo (`1 kèm 1`, `Lớp nhóm`), nguồn điểm danh và modal tạo lớp.
  - `ClassSessionsPage`: Việt hóa danh sách buổi học, trạng thái (`Đã lên lịch`, `Đã hoàn thành`, `Đã hủy`) và điều hướng điểm danh.
  - `AttendanceSheetPage`: Việt hóa phiếu điểm danh buổi học, nút đánh dấu có mặt, lưu điểm danh.
  - `EnrollmentsPage`: Việt hóa bảng ghi danh, trạng thái học tập (`Chưa học`, `Đang học`, `Tạm dừng / Bảo lưu`, `Hoàn thành`, `Đã hủy`).
  - `DataTable`: Thông báo rỗng "Không có dữ liệu hiển thị".
  - `ProtectedRoute`: Thông báo "Đang tải phiên đăng nhập...".
- **Cập nhật Tài liệu Dự án:**
  - `docs/architecture/frontend.md`: Bổ sung quy định chuẩn hóa URL route tiếng Việt.
  - `docs/ui/design-system.md`: Bổ sung mục 15 — Quy ước Ngôn ngữ & Thuật ngữ Tiếng Việt (UI Glossary & Localization) ánh xạ đầy đủ Role, Status, Action.
- **Xác minh Kỹ thuật:**
  - Frontend production build thành công 100% không lỗi (`tsc -b && vite build`).

## 2026-09-20 — Phase 6: CareLog / CareTask + Dashboard Complete

- **API Contract:** Đồng bộ đầy đủ `docs/api/care.md`, `docs/api/dashboard.md` và `docs/api/openapi.yaml` cho các endpoint CareLog, CareTask và Dashboard (Summary, Attendance, Care Pivot, Tasks Overview).
- **Backend Module Care (`backend/src/modules/care/`):**
  - Quản lý nhật ký chăm sóc `CareLog` theo Enrollment, mốc buổi (`after_session_number`), kết quả (`outcome`), ghi chú (`content`); lưu lịch sử liên tục, không bị ghi đè.
  - Quản lý nhiệm vụ chăm sóc `CareTask`: hẹn gọi lại (`CALLBACK`), điểm nóng/khiếu nại (`HOT_ISSUE`), theo dõi (`FOLLOW_UP`), mức độ ưu tiên (`URGENT`, `HIGH`, `NORMAL`, `LOW`), hạn hoàn thành (`due_at`), trạng thái (`PENDING`, `DONE`, `CANCELLED`).
  - Phân quyền theo data scope: `ADMIN` toàn hệ thống, `MANAGE` trong nhóm CS được gán, `CS` chỉ xem học viên & task của mình; `TEACHER` không được xem ghi chú nội bộ CS.
- **Backend Module Dashboard (`backend/src/modules/dashboard/`):**
  - Truy vấn số liệu source-of-truth trực tiếp từ database bằng Prisma aggregations (`COUNT(DISTINCT student_id)`, group by enrollment status, attendance breakdown).
  - Ma trận Pivot Care: Thống kê số lượng theo Mốc buổi học × Kết quả phản hồi chăm sóc.
  - Tổng quan nhiệm vụ: Đếm số lượng task quá hạn (overdue), đến hạn hôm nay, trong tuần, khẩn cấp/điểm nóng.
  - Hỗ trợ bộ lọc linh hoạt: CS phụ trách, gói học, lớp học, khoảng thời gian.
- **Kiểm thử tự động Backend:**
  - Viết đầy đủ Integration Tests cho module `care` (10 tests) và `dashboard` (6 tests).
  - Vượt qua 100% test suite backend: **50/50 tests passed**.
- **Frontend Features (`frontend/src/features/care/` & `frontend/src/features/dashboard/`):**
  - `CarePage`: Gồm 2 tabs trực quan: Nhiệm vụ CS (Care Tasks) và Lịch sử Chăm sóc (Care Logs Timeline).
  - `CareLogTimeline`: Hiển thị tiến trình phản hồi qua các mốc buổi học với badge outcome chuẩn màu semantic, modal thêm nhật ký phản hồi nhanh.
  - `CareTaskList` & `CareTaskModal`: Danh sách nhiệm vụ với bộ lọc thông minh (quá hạn, hôm nay, mức ưu tiên) và thao tác nhanh (Hoàn thành, Hủy, Sửa).
  - `DashboardPage`: Tổng hợp các KPI StatCard, biểu đồ chuyên cần `AttendanceChart`, ma trận `CarePivotTable` và widget `TasksOverviewWidget`.
  - Tích hợp điều hướng trên Trang chủ và Router `App.tsx`.
  - Build production frontend thành công 100% không lỗi (`tsc -b && vite build`).

## 2026-09-20 — Phase 5: Excel Import/Export Sheet 1 + Sheet 3 Complete

- **Database:** Bổ sung trường `external_id String? @unique` vào model `Student` trong Prisma schema theo quyết định Q-001 để ánh xạ chính xác định danh bất biến giữa Sheet 1, Sheet 3 và Database.
- **Contract-First API:** Cập nhật `docs/api/openapi.yaml` và `docs/api/imports.md` cho toàn bộ các endpoint của `/api/v1/imports` (upload, preview, mapping, validate, confirm, errors, batches, templates, exports).
- **Backend Module (`backend/src/modules/imports/`):**
  - Tích hợp `exceljs` và `multer` cho quy trình xử lý file Excel an toàn.
  - Xây dựng thuật toán nhận diện tự động cột (auto-mapping) cho Sheet `1.Chăm sóc` và Sheet `3.Chấm buổi`.
  - Bộ kiểm tra (validation engine) phát hiện trùng lặp ID, sai format ngày/giờ, số buổi không hợp lệ, mã điểm danh bất thường, không silent-fix.
  - Chiến lược thực thi theo lô (batch-safe) cách ly từng dòng: dòng hợp lệ được import vào DB, dòng lỗi ghi nhận vào `ImportRow` trạng thái `FAILED`.
  - Hỗ trợ tải báo cáo lỗi Excel chi tiết (`GET /api/v1/imports/:importId/errors?download=true`), tải template mẫu và xuất dữ liệu đối soát học viên/điểm danh.
  - Phân quyền: Chỉ `ADMIN` và `MANAGE` được upload/import (theo Q-004); `CS` chỉ xem/tải template.
  - Ghi nhận `AuditLog` cho mọi đợt import thực hiện.
  - Bộ integration test 14/14 tests passed (100% pass toàn bộ 34 tests trong hệ thống).
- **Frontend Feature (`frontend/src/features/imports/`):**
  - Wizard 4 bước trực quan: Chọn loại & Upload file -> Xem trước & Ánh xạ cột -> Báo cáo kiểm tra -> Kết quả & Tải lỗi.
  - Bảng lịch sử các đợt import (`ImportHistoryTable`) hiển thị trạng thái, số dòng thành công/thất bại và tải log lỗi.
  - Tính năng xuất dữ liệu đối soát trực tiếp trên giao diện.
  - Tuân thủ design token, responsive desktop/tablet/mobile, build thành công bundle production.

## 2026-09-18 — Phase 1: Database Schema Complete

- Implement toàn bộ cấu trúc Schema theo `data-model-core.md` và `data-model-zalo-care.md`.
- Khai báo 22 Model hoàn chỉnh (Auth, Learning, Attendance, Care/Automation, v.v.).
- Ràng buộc cấu trúc theo đúng nghiệp vụ (Ví dụ: `@@unique([enrollment_class_id, class_session_id])` cho `Attendance`).
- Khởi tạo script seed (`seed.ts`) để tạo `ADMIN` mặc định.
- Vượt qua `npx prisma validate` thành công.

## 2026-09-18 — Phase 0: Foundation & Bootstrap Complete

- Khởi tạo thư mục và cấu trúc project chuẩn theo kiến trúc Modular Monolith (Backend) và Feature-first (Frontend).
- Tách biệt cấu hình môi trường `.env` thành 3 phần rõ ràng: Root (cho Docker infra), Backend và Frontend.
- Thiết lập Backend: Node.js, Express, TypeScript, Zod environment validation, Prisma client, Central Error Handler.
- Thiết lập Frontend: React (Vite), Tailwind CSS, React Router, cấu hình Design Token (tokens.css, globals.css).
- Khởi tạo file Docker Compose cho MySQL và Redis.
- Khởi tạo OpenAPI contract tại `docs/api/openapi.yaml` với `/health` endpoint.

## 2026-09-18 — Documentation baseline

- Chuẩn hóa tài liệu để AI coding agent làm theo phase.
- Thêm project structure, UI design system, frontend architecture, API conventions, testing quality gate.
- Thêm phase execution protocol, status tracking, open-question workflow và prompt mẫu.
- Thêm project-local frontend skill.

## 2026-09-18 — API contract layer

- Thêm `docs/api/` với OpenAPI contract và tài liệu theo module.
- Chuyển workflow API sang contract-first: docs → backend/test → frontend.
- Cập nhật Agent rules, project structure và các phase để bắt buộc đồng bộ API docs.

## 2026-09-18 — Structure review merge

- Review bộ `quan-ly-hoc-vien-docs` tham khảo và chỉ lấy các phần phù hợp với architecture hiện tại.
- Thêm `.antigravityrules` làm entrypoint ngắn cho Antigravity; giữ `Agent.md` là source of truth đầy đủ.
- Thêm `docs/product/business-rules.md` làm registry tập trung cho rule CHỐT/CHƯA CHỐT.
- Thêm `docs/architecture/code-conventions.md` cho naming, validation, transaction, error/logging, dependency/Git conventions.
- Thêm ADR `docs/decisions/001-tech-stack.md`.
- Thêm project-local skills `prisma-schema-guard` và `api-module-scaffold`, đã adapt sang TypeScript + Modular Monolith feature-first + OpenAPI contract-first.
- Không nhập cấu trúc layer-first/JavaScript từ bộ tham khảo vì mâu thuẫn decision hiện tại.

## 2026-09-18 — Docs cleanup

- Tổ chức lại `docs/` theo nhóm `product/`, `architecture/`, `ui/`, `api/`, `delivery/`, `phases/`, `decisions/`, `templates/`, `data/` để giảm file rải ở root.
- Bỏ `CLAUDE.md`; `Agent.md` + `.antigravityrules` là entrypoint cho AI coding trong project này.
- Gộp checklist chuẩn bị và pre-code vào `docs/delivery/checklists.md`.
