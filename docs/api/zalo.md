# Zalo API

## Account endpoint audit — 2026-11-20

Account JSON responses omit encrypted sessions, mask proxy credentials and include an honest live connection state. Stored ACTIVE without an entry in the live pool reports disconnected. Invalid account IDs return 400. Conversation previews resolve the newest persisted message for every conversation in a page using individually bound SQL IDs, including deterministic ties by message ID.

## Frontend status normalization — 2026-11-20

The current account/status HTTP responses can expose internal pool names in `liveStatus`: `connected`, `disconnected`, `qr_pending`, `connecting`. The frontend Zalo API boundary maps these to `ACTIVE`, `NOT_LOGGED_IN`, `QR_PENDING`, `CONNECTING` before consumers use labels, counters or action visibility. Existing uppercase values remain supported. Unknown/missing live status falls back to the stored account status; stored `DISABLED`/`BANNED` takes priority. This is compatibility handling for existing responses; backend routes and owner scope are unchanged.

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
