# NUOI-NGUON — nguồn gốc dữ liệu thật (KHÔNG commit vào git)

_Bản này là cầu nối giữa bộ tài liệu `docs/khao-sat/` đã được ẩn danh (che bằng placeholder) và các artifact dữ liệu thật nằm ngoài git. Dữ liệu thật KHÔNG BAO GIỜ được commit; chỉ ghi lại định danh để đối chiếu về sau._

_Cập nhật: 2026-10-25 theo quyết định của chủ dự án._

## 1. ZIP dữ liệu thật — không commit

| File | Vai trò | Kích thước (bytes) | SHA-256 | Sửa đổi lần cuối | Vị trí trên đĩa |
|---|---|---:|---|---|---|
| `khao-sat.zip` | Bundle 14 báo cáo khảo sát Markdown gốc (bản CHƯA che placeholder, chứa email/tên tài khoản thật của nhân viên khảo sát) | 108.705 | `eaae54d3f3599d381e770e76aae4f2b76f3780940045a5e829ab94b3bfb86ff1` | 2026-10-24 15:08:51 +0700 | `<repo>/docs/khao-sat.zip` |
| `Folder các file của CSHV-20261024T073104Z-1-001.zip` | 8 workbook Excel (88 sheet, gồm 12 hidden) — bằng chứng nghiệp vụ gốc, chứa dữ liệu cá nhân học viên/nhân viên thật | 12.046.592 | `42e1f8211ef9dfdd65a86a47bb7aa5dbf4a9d8cbba43a95fa311526b9a0ce7d2` | 2026-10-24 14:30:53 +0700 | `<repo>/docs/khao-sat/AI_REVIEW/` |

Đường dẫn repo tuyệt đối: `D:\AI-for-Enterprise\Edura_Automation_CSKH\automation_cskh`.

## 2. Ánh xạ placeholder đã dùng khi commit bản ẩn danh

| Placeholder | Ý nghĩa nghiệp vụ giữ nguyên | Nơi tra giá trị gốc (KHÔNG ghi lại ở đây) |
|---|---|---|
| `vd-01@example.com` … `vd-05@example.com` | 5 tài khoản khảo sát (ADMIN, CS×3, TEACHER) trong bảng 00 §2 | `users` DB snapshot / `khao-sat.zip` — theo id 1,2,5,6,3 |
| `NHAN-VIEN-01/02/03` | hồ sơ nhân viên CS (CVHT01/02/03) gắn với vd-02/03/04 | họ tên trong cột "hồ sơ gắn" của bảng 00 §2 bản gốc |
| `NHAN-VIEN-05` | tên viết tắt trên tab Excel F06 (bản gốc: tên cá nhân không dấu + "_Chiều dữ liệu") | workbook W8 trong ZIP CSHV |
| `HV-NGOAI-LE-01` | sheet phương án ngoại lệ học phí của MỘT học viên (01_BANG §balances, KM) | sheet tab bản gốc trong workbook JLPT (ZIP CSHV) |
| `000000000` (trong `"01 - 000000000"` / `"(03 - 000000000)"`) | ví dụ pattern tên nhóm chăm sóc `<CS 2 số> - <external_id>` (03 dòng line_group_id, 09 Q5) | external_id học viên thật (9 chữ số) — xem DB/LineGroup |
| Pattern email CS fallback trong sheet-sync (07 §, 08b dòng 4) | fallback mapping CVHT theo email khi thiếu `staff_code` | 3 email gmail nhân viên — xem `sheet-sync.service.ts:352-372` + DB |
| Email seed TEACHER local (07 K5, 00 §2 id 3) | domain đặc biệt chứa `_` để test giả thuyết zod `.email()` | email seed bản gốc — xem DB snapshot |
| `vd-owner/automation_cskh` | tham chiếu repo (00 §1) | owner namespace cá nhân gốc — xem git remote |

Giá trị máy KHÔNG che (hằng số trong code/seed, không phải tài khoản cá nhân): `auto-attendance@system.invalid`, `admin_auto_att_test@example.com`, `teacher@example.test` (fixture test).

## 3. Quy tắc bảo vệ

- `*.zip` dưới `docs/khao-sat*` đã được chặn trong `.gitignore` ở cấp repo — `git add docs/khao-sat` không thể quét nhầm ZIP.
- Không sao chép giá trị gốc vào bất kỳ file nào khác trong repo; đối chiếu khi cần thì mở trực tiếp `khao-sat.zip` ngoài git.
- `backend/prisma/migrations/20261023050000_add_sheet_sync_staff_code/` và `backend/prisma/reset-all-passwords.ts`: artifact untracked có sẵn, không commit trên branch này, không sửa, không chạy.
