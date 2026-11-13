# Activity Logs API

## Mục tiêu

Trung tâm **Lịch sử hoạt động** tổng hợp bốn view độc lập:

- `audit`: thao tác nghiệp vụ trên Web.
- `sync`: phiên đồng bộ Google Sheet.
- `backup`: đợt sao lưu Sheet/Excel.
- `login`: lịch sử đăng nhập và cảnh báo bảo mật.

Contract máy đọc được nằm trong `openapi.yaml`.

## Quyền và data scope

| View | ADMIN | MANAGE | CS | TEACHER |
|---|---|---|---|---|
| Audit | Toàn hệ thống | Hợp của actor thuộc nhóm và dữ liệu của Enrollment do nhóm quản lý | Sự kiện chứng minh được liên quan Student/Enrollment phụ trách, không phụ thuộc actor | Không truy cập |
| Sync | Toàn hệ thống | Nguồn/dữ liệu thuộc nhóm CS quản lý | Nguồn/dữ liệu thuộc trách nhiệm của chính mình | Không truy cập |
| Backup | Toàn hệ thống | Cấu hình/sổ thuộc nhóm CS quản lý | Cấu hình/sổ của chính mình | Không truy cập |
| Login | Toàn hệ thống | Bản thân và user thuộc nhóm CS quản lý | Không truy cập | Không truy cập |

Audit legacy không đủ metadata để chứng minh quan hệ domain:

- không trả về cho CS;
- ADMIN vẫn xem được;
- MANAGE chỉ xem khi actor thuộc nhóm được quản lý.

Raw `beforeData` / `afterData` chỉ trả cho ADMIN/MANAGE. CS chỉ nhận diff đã chuẩn hóa.

## Thời gian và phân trang

- Múi giờ nghiệp vụ: `Asia/Ho_Chi_Minh`.
- Mặc định truy vấn 7 ngày gần nhất.
- Khoảng tùy chỉnh tối đa 30 ngày lịch.
- Dữ liệu ngoài cửa sổ retention 30 ngày không được trả về.
- `page` mặc định `1`.
- `pageSize` mặc định `25`; UI cung cấp `25`, `50`, `100`.
- `total` và `totalPages` phải là số chính xác sau khi áp dụng permission, data scope và filter.
- `refreshedAt` là ISO-8601 UTC; frontend hiển thị theo giờ Việt Nam.

## Export CSV

`GET /api/v1/activity-logs/export` xuất **toàn bộ kết quả đã lọc của một view**, không chỉ trang hiện tại.

- UTF-8 BOM để mở đúng tiếng Việt trong Excel.
- Stream đồng bộ vì retention tối đa 30 ngày.
- Header thời gian ghi rõ `UTC+7`.
- Áp dụng cùng permission, data scope và filter với màn hình.
- `view=login` chỉ dành cho ADMIN/MANAGE.
- Mỗi view có bộ cột riêng.

## Retention

Job chạy lúc `02:30` hằng ngày theo `Asia/Ho_Chi_Minh`:

- xóa vĩnh viễn `audit_logs` quá 30 ngày;
- xóa vĩnh viễn `login_audits` quá 30 ngày;
- xóa vĩnh viễn `google_sheet_sync_runs` quá 30 ngày; run items xóa cascade;
- không xóa file Excel sao lưu vật lý;
- ghi một audit hệ thống tổng hợp số lượng đã xóa, không ghi từng dòng.
