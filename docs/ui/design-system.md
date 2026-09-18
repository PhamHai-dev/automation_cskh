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
