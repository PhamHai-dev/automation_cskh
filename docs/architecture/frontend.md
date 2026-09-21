# 13. Frontend architecture

## 1. Kiến trúc

Frontend dùng feature-first để code cùng nghiệp vụ nằm gần nhau.

```text
src/features/students/
├── api/
├── components/
├── hooks/
├── pages/
├── schemas/
├── types/
└── utils/
```

Không bắt buộc mọi feature phải có đủ tất cả folder; chỉ tạo khi có nhu cầu thật.

## 2. UI layer

- `components/ui`: primitive/product design-system component.
- `components/common`: composition dùng nhiều feature.
- `features/*/components`: chỉ phục vụ một feature.

Thứ tự ưu tiên trước khi tạo component mới:

1. Tìm trong `components/ui`.
2. Tìm trong `components/common`.
3. Tìm trong feature hiện tại.
4. Chỉ tạo mới nếu chưa có component phù hợp.

## 3. Data fetching

API call phải đi qua layer thống nhất, không gọi `fetch` rải rác trong JSX page.

Một feature nên có module API riêng, ví dụ:

```text
features/students/api/students.api.ts
```

Nếu dùng query library, query key, invalidate strategy và error mapping phải thống nhất.

## 4. Form

- Schema validation dùng giải pháp đã chốt của project.
- Không lặp validation rule khác nhau giữa frontend/backend cho business rule phức tạp; backend là authority cuối cùng.
- Error từ API phải map về form/global feedback rõ ràng.

## 5. Routing và authorization

- Toàn bộ **URL route** trên frontend sử dụng định dạng **tiếng Anh chuẩn mực (kebab-case)** để đồng bộ với API convention, chuẩn web quốc tế và dễ tích hợp:
  - `/login`: Đăng nhập hệ thống (hỗ trợ alias redirect từ `/dang-nhap`).
  - `/dashboard`: Báo cáo tổng quan & thống kê (hỗ trợ alias redirect từ `/tong-quan`).
  - `/care`: Chăm sóc học viên & Nhiệm vụ CS (hỗ trợ alias redirect từ `/cham-soc`).
  - `/enrollments`: Quản lý ghi danh & Ma trận Điểm danh theo Ngày lọc theo Sale (hỗ trợ alias redirect từ `/ghi-danh`).
  - `/classes`: Quản lý danh sách lớp học (hỗ trợ alias redirect từ `/lop-hoc`).
  - `/classes/:classId/sessions`: Danh sách buổi học trong lớp (hỗ trợ alias redirect từ `/lop-hoc/:classId/buoi-hoc`).
  - `/classes/:classId/sessions/:sessionId/attendance`: Bảng điểm danh buổi học (hỗ trợ alias redirect từ `/lop-hoc/:classId/buoi-hoc/:sessionId/diem-danh`).
  - `/students`: Quản lý danh sách học viên chuẩn 28 cột Sheet 1 & lọc theo Sale (hỗ trợ alias redirect từ `/hoc-vien`).
  - `/packages`: Quản lý gói học & số buổi định mức (hỗ trợ alias redirect từ `/goi-hoc`).
  - `/teachers`: Quản lý giảng viên Việt & Bản ngữ (hỗ trợ alias redirect từ `/giao-vien`).
  - `/imports`: Nhập & Xuất Excel Sheet 1 & 3 (hỗ trợ alias redirect từ `/nhap-xuat-excel`).
  - `/settings/users`: Quản lý tài khoản & phân quyền (hỗ trợ alias redirect từ `/cai-dat/nguoi-dung`).
- **Giao diện người dùng (UI text, nhãn, dữ liệu, bảng, modal, thông báo lỗi):** Giữ nguyên chuẩn hóa 100% bằng **Tiếng Việt**.
- **Cấu trúc Menu theo vai trò (Role-based Navigation):**
  - Vai trò `CS` (Sale / CSKH): Thứ tự menu tinh gọn tối ưu quy trình làm việc hàng ngày: **Báo cáo Thống kê** (`/dashboard`) ➔ **Quản lý Ghi danh** (`/enrollments`) ➔ **Danh sách Học viên** (`/students`) ➔ **Nhiệm vụ & Chăm sóc** (`/care`).
  - Dữ liệu tại `/enrollments` và `/students` tự động khóa theo tài khoản Sale đang đăng nhập.
- Route guard chỉ để tối ưu UX; backend vẫn là nơi kiểm tra và enforce quyền (permission) cuối cùng.
- Trang thông báo lỗi 401/403/404 bằng tiếng Việt rõ ràng.

## 6. State management

Ưu tiên:

- local state cho UI cục bộ
- server state/query cache cho API data
- global state chỉ cho auth/session/UI cross-cutting thực sự cần

Không đưa toàn bộ form/table data vào global store.

## 7. Naming

- Component: PascalCase
- Hook: `useXxx`
- API: `xxx.api.ts`
- Schema: `xxx.schema.ts`
- Types: `xxx.types.ts`
- File assets: kebab-case

## 8. Import paths

Thiết lập alias hợp lý, ví dụ `@/` trỏ `src/`, tránh relative path sâu kiểu `../../../../`.


## API integration

- Trước khi viết service/query cho một feature, đọc `docs/api/openapi.yaml` và module doc trong `docs/api/`.
- Không hardcode response shape khác contract.
- Không gọi API trực tiếp rải rác trong page/component nếu đã có service/query layer.
- Nếu frontend cần field/endpoint chưa có, cập nhật/đề xuất contract trước; không tự giả định backend sẽ trả field đó.
