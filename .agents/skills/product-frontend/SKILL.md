---
name: product-frontend
description: Xây dựng và chỉnh sửa frontend React/Vite/TypeScript cho product automation_cskh theo design system, component dùng chung và responsive convention của dự án. Sử dụng khi tạo hoặc sửa page, layout, dashboard, form, table, filter, modal, navigation, loading/empty/error state hoặc bất kỳ UI frontend nào trong project; phải ưu tiên tái sử dụng component, không tạo màu/spacing/button/table ad-hoc và phải kiểm tra desktop/tablet/mobile.
---

# Product Frontend Workflow

## 1. Đọc nguồn sự thật trước khi code

Đọc:

1. `Agent.md`
2. `docs/ui/design-system.md`
3. `docs/architecture/frontend.md`
4. phase hiện tại trong `docs/phases/`
5. spec feature liên quan

Nếu docs chưa chốt brand/UI behavior ảnh hưởng lớn, ghi `docs/OPEN_QUESTIONS.md` và hỏi user thay vì tự tạo một design direction mới.

## 2. Kiểm tra component có sẵn trước

Theo thứ tự:

1. `frontend/src/components/ui`
2. `frontend/src/components/common`
3. component trong feature hiện tại
4. chỉ tạo component mới nếu chưa có cái phù hợp

Không duplicate Button/Input/Card/DataTable/PageContainer/PageHeader chỉ để thay vài class nhỏ.

## 3. Design token bắt buộc

- Dùng semantic token/theme đã khai báo.
- Không hardcode màu rải rác trong page khi đã có token.
- Không tạo spacing/radius tùy ý ngoài scale nếu không có lý do đặc biệt.
- Nếu cần token mới, thêm tập trung và cập nhật design-system docs nếu đó là convention mới.

## 4. Page composition

Page nghiệp vụ mặc định dùng:

- `PageContainer`
- `PageHeader`
- `FilterBar` khi có filter
- `DataTable` khi là danh sách dữ liệu
- `Card/SectionCard` cho các khối nội dung
- shared loading/empty/error state

Không tự dựng page shell khác nhau giữa các feature.

## 5. Button và action

- Dùng `Button` chung.
- Chọn variant semantic: primary/secondary/outline/ghost/danger.
- Hỗ trợ disabled/loading.
- Destructive action phải rõ ràng và có confirm khi phù hợp.
- Không tạo button bằng chuỗi Tailwind riêng trong từng page nếu component chung đáp ứng được.

## 6. Form

- Dùng component Input/Select/Textarea/Checkbox/Date control chung.
- Có label/error/helper khi cần.
- Validation UX rõ nhưng backend là authority cuối cùng.
- Desktop có thể multi-column; mobile ưu tiên một cột.
- Không để action/form overflow trên viewport nhỏ.

## 7. Table

- Ưu tiên `DataTable`.
- Hỗ trợ loading/empty/error.
- Pagination/filter/sort theo convention project.
- Trên mobile phải có horizontal scroll hoặc representation phù hợp; không để layout vỡ.
- Status hiển thị qua Badge semantic, không hardcode màu từng page.

## 8. Responsive

Kiểm tra ít nhất:

- mobile < 640px
- tablet 640–1023px
- desktop >= 1024px

Phải kiểm tra:

- sidebar/header
- page padding
- filter wrapping/drawer
- form columns
- table overflow
- modal/drawer size
- primary actions

## 9. Assets

- Logo/background public: `frontend/public/images/...`
- Ảnh import React: `frontend/src/assets/images/...`
- Empty state: `frontend/src/assets/images/empty-states/...`
- SVG đặc thù: `frontend/src/assets/svg/...`
- Không nhúng base64 dài hoặc ảnh rải rác trong page.
- Tên file assets dùng kebab-case.

## 10. Accessibility tối thiểu

- Dùng semantic HTML.
- Form có label.
- Button có focus-visible.
- Ảnh có alt phù hợp.
- Không chỉ dùng màu để biểu thị trạng thái.
- Dialog/menu có keyboard behavior theo component library nếu có.

## 11. Không tự thêm library UI lớn

Không tự thêm MUI/Ant Design/Chakra/shadcn hoặc thay design system nếu project chưa chốt. Nếu cần một library mới để giải quyết vấn đề đáng kể, trình bày trade-off và hỏi user.

## 12. Hoàn tất task frontend

Trước khi báo hoàn thành:

1. chạy typecheck
2. chạy lint
3. chạy frontend tests liên quan
4. chạy build
5. kiểm tra desktop/tablet/mobile
6. kiểm tra loading/empty/error
7. kiểm tra permission/action visibility
8. cập nhật phase/docs theo `Agent.md`

Dùng checklist chi tiết trong `references/ui-checklist.md` khi review.
