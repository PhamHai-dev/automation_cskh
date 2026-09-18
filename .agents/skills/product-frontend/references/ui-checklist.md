# UI Review Checklist

## Consistency

- [ ] Page dùng PageContainer/PageHeader chuẩn.
- [ ] Không có màu hardcode không cần thiết.
- [ ] Spacing/radius theo token/scale.
- [ ] Button/Input/Card/Table tái sử dụng component chung.
- [ ] Status dùng Badge semantic.

## Responsive

- [ ] Mobile không overflow ngoài trường hợp table scroll có chủ đích.
- [ ] Tablet layout hợp lý.
- [ ] Desktop tận dụng không gian nhưng không quá rộng khó đọc.
- [ ] Form nhiều cột chuyển đúng trên mobile.
- [ ] Modal/drawer dùng được trên màn hình nhỏ.

## States

- [ ] Loading.
- [ ] Empty.
- [ ] Error.
- [ ] Disabled/loading action.
- [ ] Permission denied/hidden action đúng UX.

## Table

- [ ] Header/row/cell spacing đồng nhất.
- [ ] Pagination/filter/sort nhất quán.
- [ ] Long text xử lý truncate/wrap hợp lý.
- [ ] Action column không làm vỡ mobile.

## Accessibility

- [ ] Focus-visible.
- [ ] Label cho control.
- [ ] Button semantic.
- [ ] Alt cho image.
- [ ] Contrast/status không phụ thuộc màu duy nhất.
