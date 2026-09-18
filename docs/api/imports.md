# Import / Export API

Base: `/api/v1/imports`

## Flow contract

1. `POST /api/v1/imports/upload` — upload file, trả import token/batch draft.
2. `POST /api/v1/imports/{importId}/preview` — đọc sheet/rows mẫu.
3. `POST /api/v1/imports/{importId}/mapping` — lưu/validate mapping.
4. `POST /api/v1/imports/{importId}/validate` — trả validation report.
5. `POST /api/v1/imports/{importId}/confirm` — bắt đầu import.
6. `GET /api/v1/imports/{importId}` — status/progress/result.
7. `GET /api/v1/imports/{importId}/errors` — lỗi theo row.

Nếu implementation gộp bước để đơn giản, phải cập nhật `openapi.yaml` và docs này trước khi code frontend.

## Quy tắc

- Chỉ Sheet 1 + Sheet 3 trong MVP.
- Không silent-fix dữ liệu.
- ImportBatch + ImportRow phải phản ánh kết quả thật.
