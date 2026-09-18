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

- Route guard chỉ để UX; backend vẫn phải enforce permission.
- Sidebar/menu ẩn theo permission nhưng không được coi đó là security.
- Trang 403/404 rõ ràng.

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
