# Zalo API

Chỉ implement production sau Phase 7 technical spike được duyệt.

## Account

- `GET /api/v1/zalo/account`
- `POST /api/v1/zalo/account/connect`
- `GET /api/v1/zalo/account/status`
- `POST /api/v1/zalo/account/disconnect`

## MessageRule

- `GET /api/v1/message-rules`
- `POST /api/v1/message-rules`
- `GET /api/v1/message-rules/{ruleId}`
- `PATCH /api/v1/message-rules/{ruleId}`
- `POST /api/v1/message-rules/{ruleId}/enable`
- `POST /api/v1/message-rules/{ruleId}/disable`

## Delivery

- `GET /api/v1/message-deliveries`
- `GET /api/v1/message-deliveries/{deliveryId}`

Không expose session secret/cookie/token Zalo qua API response.
