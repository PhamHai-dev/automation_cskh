# automation_cskh

Bộ khung tài liệu + quy tắc AI coding cho hệ thống quản lý/chăm sóc học viên.

## Bắt đầu với AI coding agent

1. Cho agent đọc `Agent.md`.
2. Cho agent đọc `docs/README.md`.
3. Yêu cầu agent đọc `docs/STATUS.md` và phase hiện tại.
4. Chỉ triển khai một phase tại một thời điểm.
5. Sau mỗi phase agent phải test, cập nhật docs và dừng chờ xác nhận.

Prompt khởi đầu gợi ý:

```text
Đọc @Agent.md, @docs/README.md, @docs/STATUS.md và phase hiện tại.
Không code ngay nếu còn blocker hoặc câu hỏi chưa chốt.
Hãy tóm tắt scope phase, prerequisite, open questions và kế hoạch thực hiện.
Chỉ bắt đầu code sau khi chắc chắn không có quyết định nghiệp vụ/kiến trúc đang thiếu.
```


## API contract

- Quy ước chung: `docs/api/conventions.md`
- Contract chính: `docs/api/openapi.yaml`
- Giải thích theo module: `docs/api/*.md`
- Endpoint mới/thay đổi phải cập nhật contract trước/cùng implementation.


## AI coding agents

- Antigravity: đọc `.antigravityrules` trước; file này dẫn tới `Agent.md` và docs liên quan.
- Quy tắc đầy đủ: `Agent.md`.
- Skill project-local: `.agents/skills/`.
- Business rules tập trung: `docs/product/business-rules.md`.
- Code conventions: `docs/architecture/code-conventions.md`.
