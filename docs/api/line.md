# LINE connection and realtime contract

Updated 2026-11-20. Changes restore the existing account ownership rule; ADMIN/MANAGE do not gain access to another user's LINE account.

## Account endpoint audit — 2026-11-20

- Account list/detail/lifecycle responses omit `encrypted_session_data` and `webhook_secret`, mask proxy credentials, and include `liveStatus` from the current pool. A stored ACTIVE account with no live adapter reports liveStatus NOT_LOGGED_IN. `GET /accounts/{id}/status` returns the same connection status without credentials.
- Invalid account IDs or malformed/empty send payloads return 400 before provider calls. LINE sends accept text only in this endpoint; other content types return 400.
- OA create/credentials/reconnect verify bot identity before reporting ACTIVE. Failed verification persists NOT_LOGGED_IN with `oa_connection_failed`; it does not fabricate a live adapter.
- Friend requests and contact/group sync must have a ready adapter. A disconnected account returns 503 without inserting a friend or returning a fake success. OA friend requests are unsupported (400); follower contact sync is webhook-driven (400), not a recount of stored followers.

## Personal QR

`POST /api/v1/line/accounts/{id}/qr-login` requires an authenticated ADMIN/MANAGE/CS who owns the account. OA accounts return 400. Response keeps the existing `{ data: result, ...result }` envelope; `result` contains `accountId`, `status`, `qrCode`, `qrUrl`, `pinCode`. QR image fields contain a locally generated PNG data URI. No external QR image service is used.

Initialization errors return 502 and the account reports `NOT_LOGGED_IN` with `disconnect_reason=qr_login_failed`; timeout returns 504 after 20 seconds. A replacement/disconnect cancels the pending attempt; stale provider callbacks cannot publish a QR. A QR response does not confirm phone authentication or E2EE verification.

Personal adapters use `legy: { encrypted: false }` for standard HTTPS Thrift requests instead of the failing `/enc` gateway (upstream [linejs #280](https://github.com/evex-dev/linejs/issues/280)). TLS and E2EE Letter Sealing remain enabled. This setting applies to QR login, saved-session restore and subsequent Talk requests; no automatic send retries or plaintext message fallback are added. The per-connection fetch preserves both SDK request timeouts and disconnect cancellation, accepts native Node Request objects through proxies, and supports HTTP/2 for `/PUSH`. Dispatchers are destroyed when that connection is cancelled.

## Personal account profile

After personal login/restore, the non-empty LINE profile display name replaces the temporary setup name. Contact sync also refreshes the signed-in account profile, including provider name, MID and avatar when returned. Empty/missing provider names do not clear the saved name. The existing `line:status` profile fields (`displayName`, `lineMid`, `avatarUrl`) update the account table immediately; no schema/endpoint change is needed. Profile results from a superseded connection are ignored.

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
