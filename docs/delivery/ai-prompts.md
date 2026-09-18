# 17. Prompt mẫu cho AI coding agent

## Prompt khởi động project

```text
Đọc @Agent.md, @docs/README.md, @docs/STATUS.md, @docs/OPEN_QUESTIONS.md và @docs/api/README.md.
Sau đó đọc phase hiện tại và các spec liên quan.

Chưa code ngay.
Hãy báo:
1. scope phase,
2. prerequisite,
3. open questions/blocker,
4. file/module dự kiến thay đổi,
5. test/quality gate dự kiến.

Nếu có quyết định nghiệp vụ/kiến trúc chưa rõ, hỏi tôi trước khi code.
```

## Prompt bắt đầu phase sau khi đã rõ

```text
Bắt đầu Phase X theo @docs/phases/phase-XX-....md.
Tuân thủ @Agent.md.
Chỉ làm đúng scope phase.
Sau khi hoàn thành phải chạy test/typecheck/lint/build phù hợp, cập nhật phase, STATUS, CHANGELOG, OPEN_QUESTIONS và dừng để tôi review.
```

## Prompt khi AI đề xuất thay đổi kiến trúc

```text
Không sửa code phần này ngay.
Hãy ghi vấn đề vào @docs/OPEN_QUESTIONS.md và trình bày:
- vấn đề,
- tác động,
- các phương án,
- ưu/nhược,
- phương án bạn đề xuất.
Chờ tôi xác nhận trước khi cập nhật decision/spec/code.
```

## Prompt review cuối phase

```text
Review phase hiện tại như một reviewer độc lập:
- so với scope phase,
- so với docs/decisions,
- security/data scope,
- DB constraints/indexes,
- test coverage,
- responsive/design system nếu có frontend.
Sửa lỗi implementation trong scope nếu rõ ràng; nếu cần đổi nghiệp vụ/kiến trúc thì hỏi tôi trước.
Sau đó cập nhật phase report và dừng.
```


## Prompt khi bắt đầu phase có API

```text
Đọc @Agent.md, phase hiện tại, @docs/api/conventions.md, @docs/api/README.md, @docs/api/openapi.yaml và file API module liên quan.

Trước khi code:
1. Liệt kê endpoint phase này cần dùng.
2. Chỉ ra endpoint nào đã có contract và endpoint nào cần bổ sung/chỉnh sửa.
3. Nêu role/data scope/request/response/error chính.
4. Nếu thay đổi contract ảnh hưởng business rule/permission/UX, dừng và hỏi tôi.
5. Sau khi contract được chốt mới implement backend → integration test → frontend.
```
