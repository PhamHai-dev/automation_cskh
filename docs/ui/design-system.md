# 12. UI Design System

## 1. Mục tiêu

Đảm bảo mọi trang do AI/dev tạo ra có cùng màu sắc, typography, spacing, kích thước, button, form, table, card, modal và responsive behavior.

Design system là nguồn sự thật cho UI. Không tạo style ad-hoc trong từng page nếu đã có token/component.

## 2. Nguyên tắc

- Semantic token trước, giá trị màu cụ thể sau.
- Một component chuẩn cho mỗi loại UI cơ bản.
- Không copy/paste chuỗi Tailwind dài để tạo button/table khác nhau giữa các trang.
- Ưu tiên ít shadow, border rõ, giao diện quản trị sạch và dễ đọc.
- Desktop-first cho dashboard nhưng bắt buộc responsive tablet/mobile.

## 3. Design tokens

Các token phải được khai báo tập trung trong `frontend/src/styles/tokens.css` hoặc cấu hình Tailwind tương đương.

### Color semantic

- `--color-primary`
- `--color-primary-hover`
- `--color-primary-soft`
- `--color-background`
- `--color-surface`
- `--color-surface-muted`
- `--color-text-primary`
- `--color-text-secondary`
- `--color-text-muted`
- `--color-border`
- `--color-border-strong`
- `--color-success`
- `--color-warning`
- `--color-danger`
- `--color-info`

> Brand primary color chưa được người dùng chốt thì không tự coi một màu là branding cuối cùng. Có thể dùng giá trị tạm trong scaffold nhưng phải ghi vào `OPEN_QUESTIONS.md` và thay tập trung qua token khi được chốt.

### Spacing scale

Chỉ dùng scale chuẩn trừ trường hợp component đặc biệt:

- 4px
- 8px
- 12px
- 16px
- 20px
- 24px
- 32px
- 40px
- 48px

Quy ước mặc định:

- icon ↔ text: 8px
- field ↔ field: 16px
- card padding desktop: 24px
- section gap: 24px
- page padding desktop: 24px
- page padding tablet: 20px
- page padding mobile: 16px

### Radius

- small: 6px
- medium: 8px
- large: 12px
- modal/large panel: 12–16px tùy component chuẩn

Không tạo radius mới tùy page.

### Typography

- Body mặc định: 14px hoặc 16px tùy context, phải thống nhất qua component/token.
- Page title: 24–28px, semibold/bold.
- Section title: 18–20px, semibold.
- Table/body compact: 14px.
- Caption/meta: 12–13px.

Không dùng quá nhiều font-weight/size khác nhau.

## 4. Layout

### App shell

- Desktop: sidebar cố định/collapsible + header + content.
- Tablet: sidebar collapsible/drawer.
- Mobile: navigation drawer; content full width.

### PageContainer

Mọi page nghiệp vụ phải đi qua `PageContainer`.

Chuẩn:

- max width: khoảng 1600px cho dashboard/data table
- desktop padding: 24px
- tablet padding: 20px
- mobile padding: 16px

### PageHeader

Gồm:

- title
- optional description
- optional breadcrumbs
- action area bên phải

Không tự viết heading layout khác nhau ở từng trang.

## 5. Button

Dùng `Button` component chung.

Variants tối thiểu:

- primary
- secondary
- outline
- ghost
- danger

Sizes:

- sm
- md
- lg

States bắt buộc:

- default
- hover
- focus-visible
- disabled
- loading

Không viết button trực tiếp bằng class Tailwind lặp lại nếu `Button` đáp ứng được.

## 6. Form controls

Component chuẩn:

- Input
- Textarea
- Select
- Checkbox
- Radio
- DatePicker/Date input
- SearchInput

Mỗi control phải có:

- label
- optional helper text
- error message
- disabled state
- focus state

Form 2 cột trên desktop phải về 1 cột trên mobile khi phù hợp.

## 7. Card/Section

Dùng `Card`/`SectionCard` chung.

Chuẩn:

- surface background
- border semantic
- radius chuẩn
- padding chuẩn
- shadow rất nhẹ hoặc không shadow

Không tự tạo border/shadow khác nhau giữa các page.

## 8. DataTable

Đây là component quan trọng vì product có nhiều bảng.

Chuẩn tối thiểu:

- sticky/clear header khi cần
- row hover
- selectable row khi feature cần
- loading state
- empty state
- error state
- pagination
- sort indicator
- filter integration
- horizontal overflow trên màn hình nhỏ

Kích thước mặc định:

- header height khoảng 44px
- row height khoảng 48px
- cell padding khoảng 12px 16px
- font 14px

Không để mỗi page tự viết table style riêng.

### 8.1. AttendanceMatrixTable (Ma trận điểm danh theo lớp & theo Ngày)

Dùng cho màn hình chấm buổi và theo dõi chuyên cần lớp học theo chuỗi ngày học thực tế:
- **Cột thông tin học viên & lớp học (phía bên trái):**
  1. Số thứ tự (`#`)
  2. Mã học viên (`Mã`)
  3. Họ và tên học viên
  4. `Ngày bắt đầu học` (vd: `2025-02-10`, `2025-03-19`)
  5. `Trạng thái` (dropdown/badge: `Đang học`, `Bảo lưu`, `Kết thúc`)
  6. `Ngày kết thúc/Bảo lưu` (vd: `2025-03-20`, `2025-07-21`)
  7. `Giờ học (1)` (vd: `20h00`, `17h10`, `18h00`)
  8. `Lịch học (1)` (vd: `246`, `357`, `LKCD`, `247`, `7Cn`)
  9. `Thời lượng buổi học (1)` (phút, vd: `30`, `70`)
  10. `Giáo viên (1)` & `Mã GV` (vd: `kojima - GV33`, `canhnt - GV426`)
  11. `Tên lớp` (vd: `Nguyễn Duy Đắc - kaiwa 2...`, `Bùi Vi Lâm - kaiwa 2...`)
- **Bộ lọc thời gian ma trận (Time Range Selector):**
  - **Mặc định:** Hiển thị toàn bộ các ngày của **tháng hiện tại** (vd: Ngày 01 -> 30/31).
  - **Chế độ lọc mở rộng:**
    - **Theo tuần:** Hiển thị 7 ngày trong tuần được chọn.
    - **Theo tháng:** Chọn tháng bất kỳ để xem toàn bộ ngày trong tháng đó.
    - **Theo năm / Tùy chỉnh:** Chọn năm hoặc khoảng ngày tùy biến.
- **Hàng tổng hợp trên cùng (Class Summary):** Sĩ số lớp (`Sĩ số: N`), Tỷ lệ tham gia thực tế từng ngày (`100%`, `90%`, `-`).
- **Cột chuỗi ngày học ma trận (Date Matrix - bên phải):**
  - **Bỏ số thứ tự buổi**, chuyển sang **tiêu đề theo ngày dương lịch:** Thứ & Ngày (ví dụ: `T2 01/09`, `T3 02/09`, `T4 03/09`...).
  - Ngày có buổi học đã diễn ra: nền nhẹ màu xanh lá nhạt (`bg-emerald-50/60`).
  - Ngày không có lịch hoặc tương lai: nền trung tính (`bg-slate-50/30`), hiển thị gạch ngang `-`.
- **Tương tác trên Web:**
  - **Điền trực tiếp:** Cho phép click trực tiếp vào từng ô ngày để đổi nhanh trạng thái (`X` hoặc `Đ` - Có mặt, `A` - Nghỉ phép, `B` - Bảo lưu, `C` - Nghỉ không phép, `D` - GV nghỉ, `E` - Lỗi kỹ thuật). Có tooltip giải thích và nút đánh dấu nhanh toàn bộ lớp có mặt.
  - **Đồng bộ từ Excel Sheet 3:** Hệ thống tự động **lọc theo ngày từ file Excel** để điền vào đúng các ngày tương ứng; Khớp học viên cũ -> tự động cập nhật; Phát hiện học viên mới -> hiển thị hộp thoại xác nhận trước khi thêm vào lớp.

### 8.2. EnrollmentDetailTable (Bảng Ghi danh & Chuyên cần A–E chuẩn hóa)

Hiển thị đầy đủ các cột nghiệp vụ từ Sheet 1 (Chăm sóc) và Sheet 3 (Chấm buổi):
1. **Tiến độ học & Hợp đồng:**
   - `Số buổi còn lại`: Đặc biệt làm nổi bật số âm (ví dụ: `-1`, `-90`, `-30`) bằng Badge/Chữ đỏ đậm (`text-rose-700 bg-rose-50 border border-rose-200 font-bold`) để cảnh báo học vượt gói/nợ học phí.
   - `Ngày bắt đầu học`, `Ngày kết thúc/Bảo lưu`, `Trạng thái` (Đang học, Bảo lưu, Kết thúc).
2. **Lịch học & Phân công:**
   - `Giờ học` (vd: `20h00`, `17h10`), `Lịch học` (vd: `246`, `357`, `LKCD`), `Thời lượng` (vd: `30p`, `70p`), `Giáo viên` & `Mã GV`, `Tên lớp`.
3. **Thống kê điểm danh (Attendance Summary):**
   - `Tổng số buổi đã học` (theo đăng ký), `Tổng số buổi đã học (thực tế tích lũy)`, `HV nghỉ có phép`, `HV nghỉ không phép`, `GV nghỉ`.
4. **Phân loại chuyên cần A–E:**
   - `Số buổi đã học`, `Nghỉ phép (A)`, `Bảo lưu (B)`, `Nghỉ sai QĐ (C)`, `GV xin nghỉ (D)`, `Lỗi kỹ thuật (E)`.
- **Quy tắc hiển thị:** Nhóm các cột liên quan thành các cụm Header có màu nền phân biệt nhẹ (nhóm tiến độ, nhóm lịch học, nhóm chuyên cần A-E) kèm thanh cuộn ngang mượt mà, hỗ trợ bật/tắt cột để tối ưu tầm nhìn.

## 9. Badge/Status

Dùng semantic status, không hardcode màu tùy page:

- success
- warning
- danger
- info
- neutral

Ví dụ status học viên/attendance/message phải map về variants semantic.

## 10. Modal/Drawer

- Desktop: modal/dialog cho tác vụ ngắn.
- Mobile: cân nhắc drawer/fullscreen cho form dài.
- Phải trap focus/keyboard accessible nếu library hỗ trợ.
- Action footer đồng nhất.

## 11. Responsive breakpoints

Quy ước logic:

- Mobile: < 640px
- Tablet: 640–1023px
- Desktop: >= 1024px

Yêu cầu:

### Desktop
- Sidebar hiện/collapsible.
- Table đầy đủ.
- Multi-column form được phép.

### Tablet
- Sidebar thu gọn/drawer.
- Filter wrap hợp lý.
- Grid giảm số cột.

### Mobile
- Sidebar thành drawer.
- Filter chuyển stack hoặc drawer.
- Form chủ yếu 1 cột.
- Table dùng horizontal scroll hoặc card view nếu cần.
- Modal dài gần full-screen.
- Action button không bị tràn viewport.

## 12. UI state bắt buộc

Mỗi page/data feature phải xử lý khi phù hợp:

- loading
- empty
- error
- success feedback
- disabled
- permission denied/hidden action
- stale/refetch state nếu dùng query library

## 13. Accessibility tối thiểu

- button thật dùng `<button>`
- form có label
- ảnh có `alt` phù hợp
- focus-visible rõ
- contrast hợp lý
- không chỉ dùng màu để truyền trạng thái

## 14. Review checklist trước khi hoàn thành UI task

- Có dùng PageContainer/PageHeader chuẩn không?
- Có tái sử dụng Button/Input/Card/DataTable không?
- Có hardcode màu/spacing không cần thiết không?
- Desktop/tablet/mobile có dùng được không?
- Loading/empty/error có đủ không?
- Table có overflow đúng không?
- Form mobile có về 1 cột không?
- Action/permission có đúng role/data scope không?

## 15. Quy ước Ngôn ngữ & Thuật ngữ Tiếng Việt (UI Glossary & Localization)

- **Quy tắc URL Routing vs UI Content:**
  - **Đường dẫn URL (Routes):** Sử dụng **tiếng Anh** chuẩn mực kebab-case (VD: `/login`, `/dashboard`, `/care`, `/enrollments`, `/classes`, `/students`, `/packages`, `/teachers`, `/imports`, `/settings/users`) để tương thích tiêu chuẩn web và đồng bộ với RESTful convention.
  - **Nội dung giao diện (UI content, nhãn, bảng, modal, thông báo):** Chuẩn hóa 100% bằng **Tiếng Việt** để tối ưu trải nghiệm vận hành của đội ngũ CSKH và Giáo viên.

### Bảng đối chiếu Thuật ngữ & Trạng thái (Glossary)

| Tiếng Anh / Mã Code | Thuật ngữ Tiếng Việt chuẩn trên UI |
| :--- | :--- |
| **Vai trò (Roles)** | |
| `ADMIN` | Quản trị viên |
| `MANAGE` | Quản lý nhóm CS |
| `CS` | Nhân viên CSKH |
| `TEACHER` | Giáo viên |
| **Trạng thái Ghi danh (Enrollment Status)** | |
| `NOT_STARTED` | Chưa học |
| `STUDYING` | Đang học |
| `PAUSED` | Tạm dừng / Bảo lưu |
| `FINISHED` | Hoàn thành |
| `CANCELLED` | Đã hủy |
| **Điểm danh (Attendance Status)** | |
| `ATTENDED` | Có mặt |
| `ABSENT_APPROVED_A` | Nghỉ phép (A) |
| `LEAVE_B` | Bảo lưu (B) |
| `ABSENT_UNAPPROVED_C` | Nghỉ sai / Không phép (C) |
| `TEACHER_ABSENT_D` | Giáo viên nghỉ (D) |
| `TECH_ERROR_E` | Lỗi kỹ thuật (E) |
| **Nhiệm vụ Chăm sóc (Care Task)** | |
| `CALLBACK` | Hẹn gọi lại |
| `HOT_ISSUE` | Điểm nóng / Khiếu nại |
| `FOLLOW_UP` | Theo dõi tiến độ |
| `URGENT` / `HIGH` / `NORMAL` / `LOW` | Khẩn cấp / Cao / Bình thường / Thấp |
| `PENDING` / `DONE` / `CANCELLED` | Đang chờ / Hoàn thành / Đã hủy |
| **Hành động & Phản hồi chung** | |
| `Create` / `Add` | Tạo mới / Thêm |
| `Edit` / `Update` | Chỉnh sửa / Cập nhật |
| `Delete` / `Cancel` | Xóa / Hủy |
| `Save` / `Save Changes` | Lưu / Lưu thay đổi |
| `Active` / `Inactive` | Đang hoạt động / Tạm ngừng |
| `No data available` | Không có dữ liệu hiển thị |
| `Loading...` | Đang tải dữ liệu... |

## 16. Quy ước Giao diện Ma trận Điểm danh theo Lịch Ngày & Bảng Dữ liệu Sheet 1

### 16.1. Ma trận Điểm danh theo Lịch Ngày (Attendance Matrix Table by Dates)
- **Tổ chức cột cố định bên trái (Sticky Left Columns):**
  - Cố định 3 cột nhận diện đầu tiên: `#` (STT), `Mã HV`, `Họ và tên`.
  - **Bắt buộc có nền đục**: Sử dụng nền trắng (`bg-white` cho hàng thường, `bg-slate-50` cho hàng xen kẽ/hover) kèm viền bóng nhẹ (`shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`) để chống hiện tượng chồng đè chữ khi người dùng cuộn ngang bảng.
  - Tổng cộng 11 cột thông tin bên trái: STT, Mã HV, Họ tên, Ngày BĐ, Trạng thái, Ngày KT/Bảo lưu, Giờ học, Lịch học, Thời lượng, GV & Mã GV, Tên lớp.
- **Header ngày học:**
  - Hiển thị 2 dòng: Dòng trên là Thứ (`T2`, `T3`, `T4`, `T5`, `T6`, `T7`, `CN`), dòng dưới là Ngày/Tháng (`DD/MM`).
  - Ngày cuối tuần (`T7`, `CN`) hoặc ngày không có lịch có thể dùng nền xám nhạt để phân biệt.
- **Mã màu & Ký hiệu Điểm danh trực tiếp:**
  - Ô điểm danh có kích thước tối thiểu `32x32px`, bo góc nhẹ `rounded`, click trực tiếp để chuyển đổi trạng thái:
    - `X` / `Đ` (Có mặt): Nền xanh lá `bg-emerald-100 text-emerald-800 border-emerald-300 font-bold`.
    - `A` (Nghỉ phép): Nền vàng cam `bg-amber-100 text-amber-800 border-amber-300 font-bold`.
    - `B` (Bảo lưu): Nền xanh dương `bg-blue-100 text-blue-800 border-blue-300 font-bold`.
    - `C` (Nghỉ không phép): Nền đỏ `bg-rose-100 text-rose-800 border-rose-300 font-bold`.
    - `D` (GV nghỉ): Nền tím `bg-purple-100 text-purple-800 border-purple-300 font-bold`.
    - `E` (Lỗi kỹ thuật): Nền xám `bg-slate-100 text-slate-700 border-slate-300 font-bold`.
- **Bộ lọc thời gian (Time Filter Segment):**
  - Nút chuyển nhanh 3 chế độ: `Tuần (Week)` — `Tháng (Month, Mặc định)` — `Tất cả / Năm (All)`.

### 16.2. Cảnh báo Nợ buổi âm (Negative Sessions Debt Badge)
- Khi `Số buổi còn lại < 0` (học viên học vượt định mức gói):
  - Hiển thị Badge đỏ nổi bật: `bg-red-100 text-red-800 border border-red-300 font-black px-2 py-0.5 rounded text-xs`.
  - Giúp CSKH và Kế toán nhận biết ngay lập tức để thực hiện quy trình thu phí hoặc tái tục.

### 16.3. Bảng Dữ liệu Sheet 1 (`1.Chăm sóc`)
- Hiển thị đầy đủ 28 cột theo cấu trúc chuẩn file Excel.
- Hàng tiêu đề cố định `sticky top-0 bg-slate-100 z-10`.
- Hỗ trợ nút xem Modal chi tiết với bố cục chia nhóm thông tin khoa học (Hành chính, Gói học & Lịch học, Quá trình học & Điểm danh, Ghi chú Sale).

