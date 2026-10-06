# Quy trình Git Workflow — automation_cskh

> Tài liệu bắt buộc đọc trước khi **pull / push / merge / rebase** trên repository này.
> Cập nhật lần cuối: 2026-10-06 (release gom các branch vào `main`).

## 1. Cấu trúc nhánh hiện tại

```text
main  ←────────────────────────────────────────── production / chuẩn
 ├── fix/zalo-personal-send-friend-uid          (đã merge)
 ├── test_diem_danh                              (đã merge)
 └── merge/test-diem-danh-into-current           (đã merge — release gom)
```

| Branch | Trạng thái | Ghi chú |
|---|---|---|
| `main` | **CHUẨN** — luôn chứa code mới nhất sau merge | Chỉ nhận code qua PR/merge từ branch khác |
| `merge/test-diem-danh-into-current` | Đã merge vào `main` | Branch release, có thể xóa sau |
| `fix/zalo-personal-send-friend-uid` | Đã merge (trước đó vào `main`) | Có thể xóa sau |
| `test_diem_danh` | Đã merge | Có thể xóa sau |
| `feature/...`, `fix/...` | Đang phát triển | Tạo từ `main`, merge lại khi xong |

## 2. Quy tắc chung

1. **`main` là nhánh chuẩn** — không code trực tiếp lên `main`, chỉ nhận merge từ nhánh feature/fix.
2. **Mọi thao tác trên nhánh khác phải bắt đầu từ `main` mới nhất**:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/ten-tinh-nang
   ```
3. **Kết thúc công việc trên nhánh**:
   ```bash
   git add <files>
   git commit -m "type(scope): mô tả ngắn gọn"
   git push -u origin feature/ten-tinh-nang
   ```
4. **Merge vào `main` — LUÔN chạy checklist Section 5 trước khi merge**.
5. **Không force-push** lên `main` hoặc các branch đã có người khác dùng.
6. **Không commit file tạm**: `backend/scratch-*.js`, `*.log`, `backups/`, `src_code_ZaloCRM_tham_khao/` (đã có trong `.gitignore`).

## 3. Thông đi commit (commit message convention)

```text
type(scope): mô tả ngắn gọn

[body: giải thích TẠI SAO nếu cần]
```

| Type | Dùng khi |
|---|---|
| `feat` | Thêm tính năng mới |
| `fix` | Sửa lỗi |
| `docs` | Tài liệu |
| `chore` | Cấu hình, dependency, tooling |
| `test` | Test |
| `release` | Merge gom branch vào `main` |

Scope thường dùng: `zalo`, `attendance`, `enrollment`, `backend`, `frontend`, `prisma`, `docs`.

## 4. Quy trình Merge đúng chuẩn (step-by-step)

### 4.1 Chuẩn bị nhánh feature

```bash
git checkout main
git pull origin main
git checkout -b feature/ten-tinh-nang
# ... code ...
git add .
git commit -m "feat(scope): mô tả"
git push -u origin feature/ten-tinh-nang
```

### 4.2 Đồng bộ lại `main` mới nhất vào nhánh (nếu `main` có commit mới)

```bash
git checkout main && git pull origin main
git checkout feature/ten-tinh-nang
git merge main          # hoặc: git rebase main (ưu tiên nếu nhánh còn ít commit)
```

### 4.3 Verify trước khi merge vào `main`

> Xem checklist chi tiết ở Section 5. Tóm tắt:

```bash
# Backend
cd backend && npm test -- --runInBand && npm run typecheck

# Frontend
cd frontend && npm run build
```

### 4.4 Merge vào `main`

```bash
git checkout main
git pull origin main
git merge --no-ff feature/ten-tinh-nang -m "merge: <tên tính năng>"
# Verify lần cuối trên main
cd backend && npm test -- --runInBand
cd frontend && npm run build
git push origin main
```

### 4.5 Dọn nhánh sau merge

```bash
git branch -d feature/ten-tinh-nang              # local
git push origin --delete feature/ten-tinh-nang   # remote
```

## 5. Checklist bắt buộc trước MỖI lần merge vào `main`

- [ ] **Schema/DB**: nếu có thay đổi `backend/prisma/schema.prisma`, phải có:
  - Migration mới trong `backend/prisma/migrations/` (hoặc chạy `prisma db push` cho môi trường dev và ghi chú rõ trong commit).
  - Chạy `npx prisma generate` sau khi sửa schema.
- [ ] **Test backend**: `npm test -- --runInBand` — phải pass **tất cả** các suite (14 suites / 131 tests tính đến 2026-10-06).
  - Integration test chạy trên database riêng `automation_cskh_test` (qua `backend/.env.test` + `backend/jest.setup.js`). Không đụng DB dev.
- [ ] **Build frontend**: `npm run build` thành công.
- [ ] **Typecheck**: `npm run typecheck` (backend) không lỗi.
- [ ] **API contract**: nếu sửa endpoint, cập nhật `docs/api/openapi.yaml`.
- [ ] **Docs**: cập nhật `docs/STATUS.md` / `docs/CHANGELOG.md` nếu có thay đổi nghiệp vụ.
- [ ] **Không lọt file tạm**: `git status` không có `scratch`, `*.log`, `backups/`, file upload runtime.

## 6. Lưu ý riêng theo module

### 6.1 Prisma / DB

- **Schema mới `teachers`** (thay `teacher_profiles`): `class_teachers.teacher_id` giờ FK tới bảng `teachers`, không còn FK tới `users.id`.
  - Code/test cũ dùng `user.id` làm `teacher_id` sẽ **fail FK** — phải tạo bản ghi `Teacher` trước.
  - DB dev cũ đã được migrate (data `users`/`teacher_profiles` → `teachers`). DB mới ở môi trường khác cần chạy migration `20261006043000_reconcile_missing_schema` **trên DB đã có bảng `teachers`**.
- Integration test dùng `DATABASE_URL` riêng trong `.env.test`. Khi thêm env mới, thêm cả vào `.env` lẫn `.env.test`.

### 6.2 Zalo module

- `zalo-profile-utils.ts`: dùng `extractZaloProfile()` để chuẩn hóa dữ liệu Zalo (displayName, avatar). Không tự parse response Zalo rải rác trong service.
- Avatar mapping ở frontend chấp nhận cả `fullAvt` / `avt` / `avatar_url` — giữ nguyên khi sửa trang Zalo.
- Khi sửa `zalo-pool.ts`, chú ý event `avatarSyncCompleted` và không ghi đè dữ liệu đã đồng bộ bằng response lỗi.

### 6.3 Test

- Test tích hợp **không được** dùng database dev (`automation_cskh_test` là DB riêng, đã cấu hình sẵn).
- Khi thêm model mới vào `classTeacher`/`teacher`-based flows: xem lại `class-session-attendance.test.ts` và `workbook_reconciliation.integration.test.ts` làm mẫu.

## 7. Xử lý conflict

1. **Không dùng force-push** để "chôn" conflict.
2. Merge `main` vào nhánh của mình, giải quyết conflict ngay trên nhánh:
   ```bash
   git checkout feature/ten-tinh-nang
   git merge main
   # sửa conflict, test lại
   git add .
   git commit
   ```
3. Ưu tiên giữ **logic của `main`** trừ khi nhánh của bạn sửa đúng lỗi đó.
4. Sau khi giải quyết xong, chạy lại checklist Section 5.

## 8. Câu hỏi thường gặp

**Q: `git push` bị treo?**
→ Đang chờ credential GitHub. Mở terminal riêng và đăng nhập, hoặc cấu hình Git Credential Manager. Không kill commit local — push có thể chạy lại bất cứ lúc nào.

**Q: Merge vào `main` nhưng test fail?**
→ KHÔNG push. Quay về nhánh feature, sửa lỗi, chạy lại checklist.

**Q: Muốn xóa branch đã merge?**
→ Chỉ xóa khi đã xác nhận `git branch --merged main` liệt kê branch đó.
