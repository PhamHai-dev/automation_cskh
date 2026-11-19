# Zalo API

## Connection hardening — 2026-11-19

The existing implementation uses owner-scoped `/api/v1/zalo/accounts/{id}` routes. Current QR/reconnect paths are documented in `openapi.yaml`; the singular paths below are legacy planning notes.

- `POST /api/v1/zalo/accounts/{id}/qr-login`: returns `{ data: { qrDataUrl }, meta: null }` when the QR is generated, before phone authentication. Provider login completion starts the SDK listener after receive handlers are attached.
- `POST /api/v1/zalo/accounts/{id}/reconnect`: passes encrypted saved credentials unchanged to the pool, which decrypts them. A transient network failure preserves those credentials.
- Socket handshake requires a valid access token for an active authorized user. Only the account owner may subscribe using `zalo:subscribe { accountId }`; events remain in `account:<id>`, isolated from LINE rooms.
- The shared frontend retains account subscriptions across transport reconnects and concurrent consumers. Chat reads persisted messages on realtime events, preserving message IDs, outgoing direction and full content.
- Socket message payload retains existing fields and additionally carries `zaloMsgId` and `isSelf` for consumers. Provider message content is no longer truncated to 2,500 characters in the event.

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
