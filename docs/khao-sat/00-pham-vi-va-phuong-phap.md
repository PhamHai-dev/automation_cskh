# 00 — Phạm vi khảo sát & Phương pháp

> Bản đã ẩn dữ liệu tài khoản/cá nhân (che by placeholder) — nguồn gốc xem NUOI-NGUON.md

_Cập nhật: 2026-10-24. Trạng thái code: `main` = `cbf78c3`._

## 1. Hệ thống được khảo sát

| Hạng mục | Giá trị | Ghi chú |
|---|---|---|
| App | Edura Automation CSKH — quản lý đào tạo + chăm sóc khách hàng | repo `vd-owner/automation_cskh` (đã che tên tài khoản cá nhân của owner) |
| URL khảo sát runtime | `http://localhost:5173` (frontend) · API `http://localhost:3002/api/v1` | local dev; port 3000 bị app khác chiếm |
| Backend | Express + Prisma (MySQL 8 `automation_cskh` @Docker `cskh_mysql`) + Redis/BullMQ (`cskh_redis`) + Socket.IO | |
| Frontend | React + Vite + Tailwind, SPA route tiếng Việt/Anh song song | |
| Tích hợp ngoài | Zalo cá nhân (zca-js), LINE OA (@line/bot-sdk) + LINE cá nhân (@evex/linejs), Google Sheets (sync JLPT/Kaiwa + backup CSKH) | |

## 2. Tài khoản dùng để khảo sát (DB `users`)

| id | email | role | hồ sơ gắn | dùng để kiểm chứng |
|---|---|---|---|---|
| 1 | vd-01@example.com | ADMIN | Super Admin | quyền cao nhất, toàn scope |
| 2 | vd-02@example.com | CS (CVHT01) | NHAN-VIEN-01 | tài khoản có trong snapshot; trạng thái xác thực lịch sử **không được kiểm chứng lại** trong khảo sát này |
| 5 | vd-03@example.com | CS (CVHT02) | NHAN-VIEN-02 | đại diện CS có dữ liệu (791 students) |
| 6 | vd-04@example.com | CS (CVHT03) | NHAN-VIEN-03 | CS gắn account Zalo active id 5 (`zalo_accounts.cs_id=6`) |
| 3 | vd-05@example.com | TEACHER | Teacher 1 | email/domain và khả năng đăng nhập chưa được xác minh lại trong khảo sát này |
| 7 | auto-attendance@system.invalid | (không role, inactive) | Hệ thống điểm danh tự động | tài khoản máy, không interactive |
| 4 | admin_auto_att_test@example.com | ADMIN | test | tài khoản kiểm thử trong snapshot; không dùng làm bằng chứng runtime |

_Lưu ý ẩn danh: email/hồ sơ nhân viên trong bảng trên đã được thay bằng placeholder (`vd-0x@example.com`, `NHAN-VIEN-0x`) để giữ vai trò/scope mà không lộ tài khoản thật. Các định danh máy (`auto-attendance@system.invalid`, `admin_auto_att_test@example.com`) là hằng số trong code/seed, không phải tài khoản cá nhân, nên giữ nguyên._

Không ghi mật khẩu hoặc token vào bộ tài liệu. Xác thực tài khoản là thông tin lịch sử, không được kiểm chứng lại. Không có quyền mặc định ghi DB dev; lượt hoàn thiện chỉ sửa tài liệu, không login, mint token, sửa DB, chạy server hoặc gửi tin thật.

## 3. Nguồn bằng chứng và ký hiệu

| Ký hiệu | Nguồn | Cách dùng |
|---|---|---|
| [ĐKC-RT] | Runtime: curl API + SELECT `automation_cskh` + log backend | quan sát lịch sử, chưa re-test trong lượt hoàn thiện |
| [ĐKC-CODE] | Đọc `backend/src`, `frontend/src`, `prisma/schema.prisma` (cite file:line) | cấu trúc, quy tắc, phân quyền |
| [SLCC] | Suy luận có căn cứ từ ≥1 nguồn nhưng chưa đối chiếu trực tiếp | luôn nêu căn cứ |
| [CXM] | Chưa xác minh (cần quyền/môi trường/time) | nêu rõ khoảng trống |

**Giới hạn đã ghi nhận:**
- UI được đặc tả từ **mã nguồn component**, chưa thao tác từng màn hình qua browser có đăng nhập (trừ các luồng API tương ứng đã probe [ĐKC-RT]); nhãn tương ứng trong file 06.
- Môi trường này là DB dev kế thừa dữ liệu thật một phần → **không mặc định có quyền ghi/xóa**; lượt hoàn thiện chỉ sửa tài liệu, không thao tác DB.
- Zalo/LINE production behavior (tốc độ thật, ban thật) không kiểm chứng được trong khảo sát này.
- Google Sheets integration cần OAuth riêng — chỉ khảo sát được phía schema/parser/UI, không end-to-end với sheet thật [CXM].

## 4. Phương pháp (đã thực hiện)

1. **Lập danh mục**: route map frontend `App.tsx:47-152` + sidebar `layouts/Sidebar.tsx:76-217` [ĐKC-CODE]; router mounts `backend/src/app.ts:72-89` [ĐKC-CODE].
2. **Khảo sát chi tiết**: 4 agent đặc tả (schema→từ điển; routes đào tạo; routes chăm sóc/omnichannel; màn hình UI) → files 03, 04, 05a, 05b, 06, 01.
3. **Quan sát runtime lịch sử**: lượt trước ghi probe scope theo role qua API (`/students`, `/classes`, `/enrollments`, `/care-tasks`, `/enrollments/:id/care-logs`); lượt hoàn thiện **không re-run**, kết quả giữ nhãn snapshot trong 07/08.
4. **Đối chiếu luồng**: login GV chưa được re-test; care-logs/data-scope CS giữ snapshot lịch sử, không chứng minh bao phủ mọi role.
5. **Đối chiếu bao phủ**: file 10.

## 5. Cấu trúc bộ tài liệu

| File | Nội dung |
|---|---|
| 00 | Phạm vi, tài khoản, phương pháp (file này) |
| 01 | Bản đồ chức năng & danh mục màn hình |
| 02 | Vai trò — thực thể — thuật ngữ |
| 03 | Từ điển dữ liệu theo thực thể |
| 04 | Sơ đồ/ma trận quan hệ nghiệp vụ |
| 05a | Đặc tả API & phân quyền: nền tảng + đào tạo |
| 05b | Đặc tả API & phân quyền: chăm sóc + omnichannel + automation + imports |
| 06 | Đặc tả màn hình UI (cột/filter/form/dialog/theo role) |
| 07 | Luồng nghiệp vụ xuyên suốt + state machines (bản gốc leader, agent 05 bổ sung chi tiết) |
| 08 | Ma trận phân quyền (tổng hợp 05a/05b + bằng chứng runtime) |
| 09 | Danh sách lỗi/bất nhất & câu hỏi mở |
| 10 | Bảng kiểm mức độ bao phủ (documented vs tested) |
| README | Index, legend bằng chứng, giới hạn hiện tại |

## 6. Giới hạn nghiệm thu hiện tại

Không có full browser clickthrough/screenshot; MANAGE/TEACHER runtime bị chặn/chưa xác minh. Không thực hiện ghi/xóa hay live-send ở lượt hoàn thiện. Per-field writer/reader chưa đầy đủ; 08b là mẫu 18 trường. Không dùng tỷ lệ phần trăm bao phủ hoặc suy ra sai phân công/thiếu nhóm remote từ counts. Xem [10](10-bao-phu-khao-sat.md) và [README](README.md).
