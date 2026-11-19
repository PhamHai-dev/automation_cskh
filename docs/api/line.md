# LINE connection and realtime contract

Updated 2026-11-19. Changes restore the existing account ownership rule; ADMIN/MANAGE do not gain access to another user's LINE account.

## Personal QR

`POST /api/v1/line/accounts/{id}/qr-login` requires an authenticated ADMIN/MANAGE/CS who owns the account. OA accounts return 400. Response keeps the existing `{ data: result, ...result }` envelope; `result` contains `accountId`, `status`, `qrCode`, `qrUrl`, `pinCode`. QR image fields contain a locally generated PNG data URI. No external QR image service is used.

Initialization errors return 502 and the account reports `NOT_LOGGED_IN` with `disconnect_reason=qr_login_failed`; timeout returns 504 after 20 seconds. A replacement/disconnect cancels the pending attempt; stale provider callbacks cannot publish a QR. A QR response does not confirm phone authentication or E2EE verification.

## Webhook OA

`POST /api/v1/line/webhook/{accountId}` and destination-resolved alias `POST /api/v1/line/webhook` are public HTTP routes authenticated by HMAC-SHA256 over the raw body. Signature, configured secret and original body are required; missing/invalid values return 401 before restoring adapters or writing events. Local machine deployments need a provider-reachable HTTPS callback to receive OA events. Personal accounts use their SDK receive stream.

## Socket.IO

Handshake must provide a valid application access token for an active ADMIN/MANAGE/CS. Missing, invalid, expired or inactive-user credentials cause `connect_error: Unauthorized`. Account subscription always checks the current user's ownership.

- Client: `line:subscribe { accountId }`, `line:unsubscribe { accountId }`.
- Room: `line:<accountId>` exclusively. LINE never joins Zalo's `account:<id>` room.
- `line:qr`: `{ accountId, qrUrl, qrCodeDataUri, status, timestamp }`; image consumers use `qrCodeDataUri`.
- `line:pin`: `{ accountId, pinCode, status, timestamp }`.
- `line:status`: existing status payload with optional `disconnectReason`.
- `line:message`: `{ accountId, conversationId, externalThreadId, threadType, message }`. Nested message includes `id`, `lineMsgId`, `senderUid`, `senderName`, `senderType`, `content`, `contentType`, `isSelf`, `sentVia`, `timestamp`.

Shared client subscriptions are counted per platform/account. Reconnecting transports rejoin all active subscriptions; closing a QR dialog does not unsubscribe another mounted consumer. Chat reloads the persisted message list so it displays DB IDs and direction rather than inventing temporary event IDs.

## Uncertain sends

Personal send errors do not automatically send a second plaintext message. OA reply failures only fall back to push on HTTP 400; ambiguous reply outcomes carry `LINE_UNCERTAIN_SEND`, so the automation worker preserves uncertain-send handling rather than retrying the reply as a push operation.

## Verification

Regression tests: `backend/tests/__tests__/channel-realtime-regression.test.ts`; SDK and browser checks are described in the 2026-11-19 Zalo/LINE implementation report. No acceptance claim is made for actual phone authentication or provider delivery until those checks run with a designated test account/recipient.
