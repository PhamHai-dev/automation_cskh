# 14. API conventions

## 0. API contract source of truth

- Contract chính: `docs/api/openapi.yaml`.
- Giải thích theo module: `docs/api/*.md`.
- File này chỉ định nghĩa **convention chung**, không thay cho endpoint contract.

Workflow bắt buộc khi tạo/thay đổi endpoint:

`Docs/domain + phase → cập nhật API contract → backend implementation/test → frontend integration → quality gate`

Frontend không được tự suy đoán field/path/response nếu contract chưa có.

## 1. Prefix

Business API dùng `/api/v1`.

Không trộn route versioned và non-versioned tùy module. Health/readiness có thể là ngoại lệ theo Phase 0.

## 2. Response thành công

Format chuẩn:

```json
{
  "data": {},
  "meta": null
}
```

List có pagination:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

## 3. Error format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dữ liệu không hợp lệ",
    "details": {}
  }
}
```

Không trả raw stack trace ra production.

## 4. HTTP status

- 200: GET/PATCH/PUT thành công khi phù hợp
- 201: create
- 204: delete/no content khi phù hợp
- 400: request/business validation sai
- 401: chưa đăng nhập/token invalid
- 403: không có quyền/scope
- 404: không tìm thấy resource trong scope
- 409: conflict/duplicate/invariant
- 422: chỉ dùng nếu toàn project chốt thống nhất
- 500: lỗi không mong đợi

## 5. Filter/sort/page

Query param mặc định giữa module:

- `page`
- `pageSize`
- `search`
- `sortBy`
- `sortOrder`

Filter domain đặt tên rõ, tránh JSON query phức tạp nếu không cần.

## 6. Validation

Request schema validate ở boundary. Service vẫn phải enforce business rule và data scope.

## 7. Idempotency

Action có nguy cơ duplicate do retry phải có chiến lược idempotency/unique constraint phù hợp, đặc biệt Attendance import và MessageDelivery.

## 8. Permission + data scope

OpenAPI mô tả auth ở mức contract; implementation vẫn phải enforce role/permission/data scope theo `product/auth-rbac.md` và `Agent.md`.

## 9. Thay đổi contract

Breaking change phải:

1. cập nhật `openapi.yaml` + module docs;
2. ghi vào phase file và `CHANGELOG.md`;
3. đánh giá ảnh hưởng frontend/backend/test;
4. hỏi user nếu thay đổi business rule/permission/UX flow/architecture;
5. không tự đổi route/field đã dùng chỉ vì code thuận tiện hơn.
