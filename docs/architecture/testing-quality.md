# 15. Testing & Quality Gate

## 1. Mục tiêu

Không coi phase hoàn thành chỉ vì code compile. Mỗi phase có quality gate riêng.

## 2. Test pyramid đề xuất

### Unit test
Dùng cho:

- pure business rule
- parser/mapping helper
- permission helper
- message rendering
- status calculation

### Integration test
Dùng cho:

- API + service + repository + test DB
- auth/refresh/revoke
- data scope
- transaction
- unique constraint behavior

### E2E
Dùng cho các flow critical:

- login
- Admin tạo user
- CS xem đúng enrollment của mình
- Teacher chấm buổi đúng lớp
- import preview → confirm
- attendance tạo → automation scheduling (sau khi Zalo phase hoàn tất)

## 3. Quality gate backend

Tùy package scripts thực tế, chạy tương đương:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Nếu schema thay đổi:

```bash
npx prisma format
npx prisma validate
```

và review migration.

## 4. Quality gate frontend

- typecheck
- lint
- unit/component test nếu có
- build
- manual/automated smoke test các route thay đổi
- responsive check desktop/tablet/mobile
- loading/empty/error state check

## 5. Permission test bắt buộc

Không chỉ test UI ẩn button. Test backend:

- CS không đọc/sửa enrollment của CS khác
- Manage không vượt CSGroup được gán
- Teacher không chấm lớp không được phân công
- User disabled không refresh được session
- Admin route không mở cho role khác

## 6. Import test

Có fixture cho:

- file hợp lệ
- thiếu cột
- sai kiểu ngày
- duplicate
- unknown student/enrollment/class
- dữ liệu bất thường
- partial errors

## 7. Regression

Bug production/critical sau khi sửa nên có regression test nếu hợp lý.

## 8. Không được bỏ qua fail

Nếu test fail do lỗi có sẵn từ trước, AI phải phân biệt:

- fail đã tồn tại trước task
- fail do task hiện tại

Không được tự sửa unrelated fail lớn mà không báo. Nhưng không được kết luận phase pass nếu fail do code phase mới.
