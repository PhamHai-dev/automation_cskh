# Rà soát kết nối, đồng bộ và tương tác Zalo/LINE — 19/11/2026

> Báo cáo này ghi hiện trạng trước khi sửa. Sau yêu cầu “Continue. Có thể chạy product để kiểm thử lỗi”, một phần các lỗi đã được sửa và kiểm chứng; xem [báo cáo triển khai và kiểm thử product](10_ZALO_LINE_PRODUCT_FIX_VERIFICATION_2026-11-19.md). Script `reproduce.cjs` giữ lại để đối chiếu baseline, không phải bộ regression tests cho code đã sửa.

## Kết luận

Luồng hai chiều hiện có nhiều lỗi nối SDK → backend → Socket.IO → giao diện. Trạng thái `ACTIVE`/`connected` chưa chứng minh listener đang chạy hoặc trình duyệt đang nhận tin. Chưa đủ bằng chứng xác nhận gửi/nhận hai chiều ổn định khi deploy.

Riêng QR LINE: đã tạo được URL QR bằng SDK thật trong khoảng **1.105 ms**, và dịch vụ ảnh trả HTTP 200 trong khoảng **1.805 ms** trên máy truy cập workspace. Chưa tái hiện được chính lần lỗi QR mà người dùng gặp. Đã xác nhận các lỗi xử lý khiến lỗi này khó thấy trên giao diện, cùng sự phụ thuộc dịch vụ ảnh ngoài.

Đã chạy **91/91 test có sẵn**, backend typecheck và frontend typecheck thành công. Bộ test này chưa bao phủ những lỗi tích hợp bên dưới. Script chẩn đoán bổ sung tái hiện **18 tình huống lỗi**, có dùng lớp `TalkMessage` và `Client` từ SDK LINE thật đang cài; DB, phiên đăng nhập và lệnh gửi đều được giả lập.

## Phạm vi và giới hạn bằng chứng

- Branch `develop`, HEAD `556bbe7`; đọc trạng thái working tree hiện có, gồm thay đổi có sẵn ở `backend/src/app.ts`.
- Runtime: Windows, Node.js `22.21.0`, `zca-js` `2.2.0`, `@evex/linejs` alias `@jsr/evex__linejs` `3.5.0`.
- Rà soát Zalo personal, LINE personal, LINE OA, màn hình Omnichannel, chat riêng từng kênh, sync danh bạ/nhóm/lịch sử, automation theo điểm danh và broadcast.
- Không sửa mã ứng dụng, không migrate DB, không đăng nhập tài khoản thật, không gửi tin thật. Chỉ bổ sung tài liệu và script chẩn đoán trong `scratch/zalo-line-audit/`.
- Probe SDK LINE dừng ngay khi tạo URL QR, không in URL hoặc khóa đăng nhập và không quét QR/PIN.
- Tại thời điểm kiểm tra không thấy service lắng nghe các cổng chuẩn 3000/5173/5174/3306/6379 trên máy workspace. Điều này không loại trừ deploy dùng cổng khác hoặc chạy trên máy khác.
- Log `logs/backend.out.log` kết thúc ngày **26/10/2026**. Không dùng log này để kết luận tình trạng service ngày 19/11.
- Chưa kiểm thử end-to-end với điện thoại, trình duyệt deploy và người nhận thật. Kết quả gửi ra provider và nhận từ provider vẫn cần vòng kiểm chứng riêng.

P0 = lỗi kiểm soát truy cập cần sửa trước khi mở kênh; P1 = chặn chức năng hoặc rủi ro mất/trùng tin; P2 = thiếu đồng bộ/khả năng quan sát.

## 1. QR và quản lý phiên

### C01 — P1: QR LINE có thể lỗi nhưng giao diện vẫn ở màn hình chờ

Nguồn: `backend/src/modules/line/line-personal.adapter.ts:273`, `:335`, `:380`; `frontend/src/features/line/components/LineQrLoginDialog.tsx:113`, `:146`, `:292`.

- `startQrLogin()` chỉ resolve khi có QR/PIN hoặc hết 8 giây; lỗi trong `runQrLoginFlow()` không reject promise đang chờ. Khi SDK lỗi trước QR, kết quả adapter vẫn là `QR_PENDING` không kèm QR.
- Service có đọc lại trạng thái DB (`line.service.ts:249`), nhưng `startQrFlow()` ở frontend bỏ qua `status`/`last_sync_error` khi response không có QR/PIN. Polling chỉ nhận `qr_login_failed` nếu đang ở phase `pin`; lỗi ở phase `qr` bị bỏ qua khi mất socket event.
- Ảnh QR được tạo bởi `api.qrserver.com` ở cả backend lẫn frontend. Nếu dịch vụ ảnh bị chặn/mất mạng, URL đăng nhập có thể đã tồn tại nhưng ảnh không hiển thị. Thẻ ảnh không có `onError` để báo nguyên nhân.
- Payload socket backend dùng `qrCodeDataUri`, frontend tìm `qrDataUrl`; còn `qrUrl` nên đây chưa phải nguyên nhân chắc chắn làm mất QR.

Bằng chứng: `LINE_QR_FAILURE_RETURNS_PENDING`; probe SDK/mạng thành công tại thời điểm kiểm tra. Hướng sửa: truyền lỗi tạo QR tới response/UI, xử lý lỗi cả phase QR và PIN, tạo ảnh nội bộ, quản lý thời hạn QR và hủy phiên cũ khi tạo lại. Cần log mới từ lần lỗi deploy để chốt nguyên nhân cụ thể.

### C02 — P1: Promise tạo QR Zalo không hoàn tất

Nguồn: `backend/src/modules/zalo/zalo-pool.ts:164`, `:171`, `:212`, `:741`; `zalo.service.ts:320`.

`loginQR()` tạo `new Promise((resolve, reject) => ...)` nhưng không gọi `resolve` ở nhánh sinh QR hoặc đăng nhập thành công. HTTP tạo QR chờ vô hạn trong khi socket có thể đã nhận ảnh. Bước persist QR sau `await generateQr()` trong service không chạy. Nếu socket bị lỡ event, người dùng không có response/polling để khôi phục ảnh.

Bằng chứng: `ZALO_QR_PROMISE_NEVER_SETTLES`: QR đã emit, pool đã connected, promise vẫn pending. Hướng sửa: tách kết quả “QR đã được tạo” khỏi kết quả “đăng nhập hoàn tất”, có timeout và kết thúc promise ở mọi nhánh.

### C03 — P1: Nút reconnect Zalo không dùng đúng định dạng session

Nguồn: `backend/src/modules/zalo/zalo.service.ts:290`, `:302`; `zalo-pool.ts:236`, `:590`.

Pool lưu session bằng AES-GCM/base64 và nhận ciphertext để tự giải mã. Service lại gọi `JSON.parse(encrypted_session_data)` rồi truyền object vào pool. Với session được lưu bởi chính pool, reconnect qua API lỗi `SyntaxError` trước khi gọi SDK.

Bằng chứng: `ZALO_RECONNECT_PARSES_CIPHERTEXT_AS_JSON`. Hướng sửa: thống nhất đường đọc/ghi session và để một thành phần chịu trách nhiệm mã hóa/giải mã.

### C04 — P1: Lỗi mạng tạm thời lúc reconnect Zalo xóa session đã lưu

Nguồn: `backend/src/modules/zalo/zalo-pool.ts:329`, `:489`.

Mọi lỗi reconnect đều chuyển DB về `qr_pending`; nhánh này đặt `encrypted_session_data: null`. Lỗi mạng tạm thời vì vậy có thể buộc người dùng quét QR lại, thay vì giữ phiên để retry. `emitEvent({ type: 'error' })` cũng có thể ném lỗi `ERR_UNHANDLED_ERROR` do không có subscriber `zaloPool.on('error')` trong source hiện tại; tác động tới process phụ thuộc nơi gọi có bắt promise rejection hay không.

Bằng chứng: `ZALO_TRANSIENT_RECONNECT_ERROR_CLEARS_SESSION`, `ZALO_ERROR_EVENT_WITHOUT_HANDLER_THROWS`. Hướng sửa: phân loại lỗi xác thực/mạng, giữ session khi lỗi tạm thời và xử lý error event rõ ràng.

### C05 — P1: LINE có thể báo sẵn sàng khi listener đã dừng; reconnect không tuân thủ đầy đủ trạng thái

Nguồn: `backend/src/modules/line/line-personal.adapter.ts:512`, `:608`; `line-pool.ts:185`; `line-health-check.ts:62`; SDK `client/client.js:52`.

- SDK thật `Client.listen()` trả `void`, chạy vòng nhận nền và tự log `LegyPusherError` khi vòng nhận lỗi. Bọc bằng `Promise.resolve(client.listen()).catch(...)` không quan sát được lỗi của vòng nền.
- Với SDK thật mô phỏng lỗi stream, adapter vẫn `isListening = true`, disconnect history không tăng. Với client giả lập trả promise reject, adapter có đổi `isListening = false`, nhưng `client` vẫn tồn tại.
- Pool và health check chỉ kiểm tra có `client`, nên trường hợp thứ hai cũng vẫn báo ready và không khởi động lại listener.
- `ensureAccountReady()` không chặn `manual_disconnect`/`circuit_breaker`/`DISABLED`/`BANNED` khi được gọi trực tiếp. Startup query không loại `manual_disconnect`. Tài khoản đã ngắt có thể bị khôi phục bởi startup/đường gửi; bypass circuit breaker không được ngăn tại pool.
- Không có khóa reconnect theo account; nhiều lời gọi đồng thời có thể tạo adapter/listener riêng. Đây là rủi ro xác định từ code, chưa stress test.

Bằng chứng: `LINE_DEAD_STREAM_STILL_READY`, `LINE_REAL_SDK_STREAM_ERROR_IS_NOT_PROPAGATED`, `LINE_MANUAL_DISCONNECT_RESURRECTED` (đã tái hiện nhánh OA). Hướng sửa: health dựa vào trạng thái vòng nhận/heartbeat thực tế, một tác vụ reconnect/account, và kiểm tra trạng thái tại pool.

## 2. Nhận tin và realtime tới giao diện

### R01 — P1: Listener Zalo không được khởi động

Nguồn: `backend/src/modules/zalo/zalo-pool.ts:212`, `:322`; `zalo-listener-factory.ts:378`, `:854`.

Cả login và reconnect gắn handler nhưng không gọi `api.listener.start()`. Trong `zca-js` đang cài, constructor để `ws = null`, đăng nhập chỉ trả API; WebSocket chỉ mở khi gọi `start()`. `selfListen: true` chỉ bật nhận tin của chính mình trong listener, không tự khởi động listener. Đường QR còn không gọi hàm gắn handler quản lý disconnect/epoch của pool như đường reconnect.

Bằng chứng: `ZALO_RECONNECT_NEVER_STARTS_LISTENER`: handler đã gắn, pool connected, số lần start bằng 0; đối chiếu implementation SDK. Hướng sửa: thống nhất lifecycle attach → start → connected → teardown, guard event theo phiên cho toàn bộ handler.

### R02 — P1: Chat Zalo, chat LINE và Omnichannel chưa đăng ký room nhận sự kiện

Nguồn: `frontend/src/features/zalo/pages/ZaloChatPage.tsx:130`; `frontend/src/features/line/pages/LineChatPage.tsx:52`; `frontend/src/features/omnichannel/pages/OmnichannelInboxPage.tsx:67`, `:244`; `OmnichannelAccountsPage.tsx:147`; `frontend/src/hooks/useSocket.ts:60`.

Các trang chỉ gọi `useSocket()` và `on(...)`, không emit `zalo:subscribe`/`line:subscribe`. Server gửi message/status vào room theo account. Kết nối Socket.IO thành công không tự tham gia room. Trang accounts cũng thiếu subscription thường trực; QR dialog đăng ký tạm rồi unsubscribe khi đóng. Do vậy cập nhật trạng thái/tin nhắn có thể không đến các màn hình chính.

Bằng chứng: `CHAT_SUBSCRIPTIONS_AND_LINE_PAYLOAD_MISMATCH` và đối chiếu toàn bộ nơi subscribe trong frontend. Hướng sửa: quản lý đăng ký theo danh sách account/selection, đăng ký lại khi reconnect và có đếm số thành phần đang dùng room.

### R03 — P1: Event LINE và Zalo không đủ đồng nhất để hiển thị chính xác

Nguồn: `backend/src/modules/line/line-pool.ts:370`; `line-personal.adapter.ts:582`; `line-webhook.handler.ts:407`; `frontend/src/features/line/pages/LineChatPage.tsx:118`; `frontend/src/features/zalo/pages/ZaloChatPage.tsx:256`; `zalo-listener-factory.ts:645`.

- Backend LINE gửi `externalThreadId`, frontend LINE so `evt.threadId`. Kể cả đăng ký đúng room, hội thoại đang mở vẫn không reload theo event.
- Zalo event không có ID message ổn định hoặc `isSelf`; frontend tự tạo `live_${Date.now()}`, luôn đặt `isSelf: false`, không dedup. Tin gửi từ app/điện thoại của chính mình có thể bị hiển thị thành tin nhận và trùng với bản local.
- Zalo cắt realtime content ở 2.500 ký tự; frontend append trực tiếp nên tin dài có thể chỉ hiện một phần tới khi tải lại.
- Khi chưa chọn hội thoại, handler Zalo return trước cả refresh danh sách.

Hướng sửa: chuẩn hóa payload, truyền message ID/provider ID, hướng gửi/nhận, thời gian gốc, media; cập nhật cache bằng ID thay vì tự sinh danh tính tin nhắn.

### R04 — P1: Adapter LINE đọc sai `TalkMessage` của SDK thật

Nguồn: `backend/src/modules/line/line-personal.adapter.ts:540`; SDK `client/features/message/talk.ts:400`.

SDK trả `msg.from`/`msg.to` là object `{ type, id }`, `id` provider nằm trong `msg.raw.id`, loại hội thoại trong `msg.to.type`/`msg.raw.toType`. Adapter đọc như chuỗi phẳng: `String(msg.from)`, kiểm tra `msg.toType` và lấy `msg.id`.

Bằng chứng bằng lớp SDK thật: tin cá nhân nhận, tin nhóm nhận và tin tự gửi đều tạo thread ID **`[object Object]`**; nhóm bị phân loại user, sender sai, provider ID bị thay bằng `personal_<timestamp>`. Có nguy cơ gộp hội thoại không liên quan và mất dedup.

Hướng sửa: adapter ánh xạ theo SDK đã pin, dùng `raw.id`, `from.id`, `to.id`, phân biệt DM tự gửi/nhận và GROUP/ROOM; kiểm thử bằng object SDK thật.

### R05 — P2: Reaction/thu hồi/đã nhận/đã đọc chưa hoàn chỉnh trên giao diện

Nguồn: `backend/src/modules/zalo/zalo-listener-factory.ts:340`, `:416`, `:471`, `:662`; `zalo-reaction-routes.ts:65`; `frontend/src/features/zalo/pages/ZaloChatPage.tsx:276`.

Handler nhận reaction Zalo hiện chỉ resolve message và log, chưa cập nhật reactions vào DB hoặc emit cho UI. Seen/delivered có cập nhật DB nhưng không emit event cập nhật message; undo có emit nhưng trang chat không đăng ký xử lý. API reaction dùng `client.api.addReaction` trong khi `getAccountClient()` trả API trực tiếp, nên có thể catch lỗi rồi chỉ lưu local và trả thành công dù provider không nhận reaction. Đây là phát hiện từ code, chưa thử tương tác thật. Cần nghiệm thu riêng các tính năng này, không dùng việc thấy badge/emoji ở UI làm bằng chứng provider đã nhận.

## 3. Gửi tin, đồng bộ và độ bền automation

### D01 — P1: Fallback gửi LINE có nguy cơ gửi trùng sau lỗi không rõ kết quả

Nguồn: `backend/src/modules/line/line-personal.adapter.ts:736`; `line-oa.adapter.ts:190`; `automation-worker.ts:344`.

- Personal: lỗi gửi compact hoặc E2EE (trừ một số mã đã biết) lập tức gửi lại bằng `e2ee: false`. Timeout/reset có thể xảy ra sau khi provider đã nhận tin, nên lần thứ hai có thể gửi trùng. Worker không thể ngăn vì fallback nằm bên trong dispatcher.
- OA: mọi lỗi `replyMessage` đều fallback sang push, kể cả lỗi mạng không rõ reply đã thành công chưa. Retry key của push không dedup được tin đã gửi qua reply.
- Worker đã có `UNCERTAIN_SEND` và retry key OA; đây là phần có ích nhưng chưa bao phủ hai đường fallback này.

Bằng chứng: `LINE_UNCERTAIN_SEND_FALLBACK_DUPLICATES`, `LINE_OA_UNCERTAIN_REPLY_FALLS_BACK_TO_PUSH`. Hướng sửa: fallback chỉ khi chắc chắn lần trước chưa được chấp nhận; giữ kết quả chưa rõ để đối soát, không gửi lại vô điều kiện.

### D02 — P1: Đồng bộ có thể báo thành công dù lấy dữ liệu lỗi

Nguồn: `backend/src/modules/zalo/friend-sync-service.ts:163`; `zalo-sync-routes.ts:40`; `line-personal.adapter.ts:797`; `line.service.ts:530`; `frontend/src/features/omnichannel/pages/OmnichannelAccountsPage.tsx:285`.

- Zalo `getAllFriends` fail chỉ log, `result.errors` vẫn 0; route trả `success: true`.
- LINE sync contacts có nhiều `.catch(() => [])`, sau đó vẫn cập nhật `last_sync_at` và xóa `last_sync_error`.
- LINE service có thể trả tổng dữ liệu đã lưu trong DB dưới nhãn `synced/upserted` khi không có live adapter.
- Nút sync Omnichannel dùng `Promise.allSettled`, chuyển nhánh lỗi thành số 0 rồi `toast.success`; cả sync friends/groups lỗi vẫn có thể hiển thị thành công.

Bằng chứng: `ZALO_SYNC_FALSE_SUCCESS`; log cũ 26/10 cũng ghi `getAllFriends failed` ngay trước `errors=0`. Hướng sửa: kết quả phân biệt success/partial/failed, giữ nguyên lỗi provider và thời điểm lần đồng bộ thành công thật.

### D03 — P1: Dedup message chưa bảo vệ bộ đếm và metadata hội thoại

Nguồn: `backend/src/modules/zalo/zalo-listener-factory.ts:262`; `line-webhook.handler.ts:369`; `line-repository.ts:369`, `:435`; `zalo-chat-routes.ts:508`.

Các đường nhận cập nhật conversation/tăng unread trước khi upsert message theo provider ID. Event trùng không tạo hai message nhưng vẫn tăng unread và emit lại. Zalo gán `last_message_at` theo mọi event/backfill nên lịch sử cũ đến muộn có thể kéo thời gian hội thoại lùi. LINE conversation dùng find rồi create thay vì upsert nguyên tử, có thể xung đột khi hai tin đầu tới đồng thời. Zalo API gửi dùng create message, trong khi self echo cũng upsert cùng ID; nếu echo được lưu trước thì HTTP có thể báo lỗi unique sau khi tin thực tế đã gửi.

Bằng chứng: `DUPLICATE_ZALO_EVENT_INCREMENTS_UNREAD_TWICE`; các race còn lại xác định từ code, chưa chạy stress/DB thật. Hướng sửa: insert/dedup và cập nhật metadata trong transaction, chỉ tăng unread cho message mới; giữ thời gian mới nhất; cùng một đường persist cho API send/self echo.

### D04 — P1: Thiếu phục hồi khoảng trống DB → queue và broadcast sau crash

Nguồn: `backend/src/modules/automation/automation-trigger.service.ts:109`, `:520`; `automation-bullmq-adapter.ts:54`; `automation-worker.ts:900`; `backend/src/modules/attendance/attendance-lifecycle.ts:104`; `broadcast.service.ts:876`, `:1226`.

Delivery được ghi DB rồi mới enqueue. Queue tắt/lỗi trả `null`; không có publisher Outbox hoặc sweep delivery đến hạn chưa có job trong `backend/src`. Poller 15 giây chỉ xử lý broadcast. Crash sau ghi delivery/trước enqueue, hoặc Redis không sẵn sàng, có thể để delivery nằm DB mà không gửi nếu không có lần kích hoạt lại phù hợp.

Broadcast dùng khóa memory `activeCampaignRuns`; poller chỉ lấy campaign `SCHEDULED`. Crash giữa `SENDING` chưa có cơ chế recovery được xác định trong source. Không nên mặc định gửi lại recipient chưa rõ kết quả.

Đây là kết luận từ code; chưa mô phỏng crash/Redis thật. Không coi `OutboxEvent` có trong data model là đã có publisher hoạt động; báo cáo không review hoặc đề xuất tự áp dụng migration. Hướng sửa cần thiết kế và kiểm chứng phục hồi DB/queue, phân biệt chắc chắn chưa gửi và chưa rõ kết quả.

### D05 — P1/P2: Đường gửi Zalo automation khác đường chat/broadcast

Nguồn: `backend/src/modules/automation/automation-worker.ts:404`, `:468`; `zalo-chat-routes.ts:449`; `broadcast.service.ts:962`; SDK `zca-js/dist/apis/sendMessage.d.ts:96`.

Worker điểm danh gọi `api.sendMessage` trực tiếp, không gọi rate limiter Zalo trong khi chat/broadcast có kiểm tra. Worker đọc `sent.data.messageId/sent.msgId/sent.messageId`, thiếu shape chuẩn `{ message: { msgId } }`; delivery có thể `SENT` nhưng provider ID rỗng, khó đối soát. Worker cũng dựa vào self listener để lịch sử gửi xuất hiện ở inbox, khác LINE vốn persist outbound tại pool.

Hướng sửa: thống nhất dispatcher gửi, giới hạn theo account và lưu provider ID/outbound message nhất quán; không diễn giải rate limit tự đặt là cam kết an toàn từ provider.

### D06 — P2: Đồng bộ lịch sử còn khoảng trống sau mất kết nối

Nguồn: `backend/src/modules/zalo/zalo-message-sync.ts:173`; `zalo-sync-routes.ts:73`; `zalo-backfill-service.ts:435`; `line-personal.adapter.ts:826`, `:902`.

`startMessageSync()` có implementation nhưng không có nơi gọi trong source. `/sync-history` vẫn trả 501 dù có API `/backfill` riêng. Zalo tự backfill chỉ khi DB chưa có message; account đã có dữ liệu không có cơ chế catch-up theo checkpoint được xác định. LINE sync friends/message boxes tạo metadata hội thoại, không backfill nội dung tin cũ; chưa có cơ chế bù chắc chắn cho thời gian stream dừng.

Hướng sửa: xác định contract lịch sử/catch-up, checkpoint, phân trang và giới hạn; kiểm thử mất mạng rồi phục hồi có đủ tin và không trùng.

## 4. Kiểm soát truy cập trên luồng realtime

### S01 — P0: Socket thiếu token hoặc token lỗi vẫn có thể vào room tài khoản

Nguồn: `backend/src/shared/realtime/socket-singleton.ts:33`; `backend/src/modules/zalo/zalo-socket.ts:39`; `backend/src/modules/line/line-socket.ts:36`.

Middleware luôn `next()` kể cả token thiếu/hết hạn/không hợp lệ. Handlers chỉ từ chối sai chủ tài khoản nếu `socket.data.userId` tồn tại. Người chưa xác thực có thể subscribe account ID và nhận QR/status/message. CORS không thay thế xác thực socket.

Bằng chứng: `SOCKET_UNAUTHENTICATED_ACCOUNT_SUBSCRIPTION` với handler thật và DB giả lập. Hướng sửa: reject handshake chưa xác thực, kiểm tra user còn active/quyền account trước join, có test thiếu/expired/invalid token và tài khoản khác chủ.

### S02 — P0: LINE và Zalo dùng chung room `account:<id>`

Nguồn: `backend/src/modules/line/line-socket.ts:40`, `:62`; `backend/src/shared/realtime/socket-singleton.ts:71`.

LINE join cả `line:<id>` và `account:<id>`, emitter LINE gửi vào cả hai. Zalo dùng `account:<id>`. Hai bảng có ID độc lập; nếu Zalo #5 và LINE #5 khác chủ, client được phép xem một account có thể nhận event của account kênh còn lại. Điều kiện lọc ở UI không bảo vệ payload đã tới client.

Bằng chứng: `SOCKET_CROSS_PLATFORM_ROOM_COLLISION`. Hướng sửa: room phân biệt platform, chỉ join/emit room đã được kiểm tra quyền.

### S03 — P0: Webhook LINE chấp nhận yêu cầu thiếu chữ ký

Nguồn: `backend/src/modules/line/line-webhook.handler.ts:69`, `:73`; `line.routes.ts:27`, `:50`.

HMAC chỉ được kiểm tra khi đồng thời có signature/secret/raw body. Thiếu signature không bị reject và handler vẫn xử lý event. Đường webhook là public, có thể tác động danh bạ, hội thoại và các luồng gắn liên hệ. Ngoài ra lỗi xử lý từng event bị catch/log rồi endpoint trả 200, nên provider không được báo lỗi để redeliver những event đó nếu chưa có lưu trữ nội bộ bền vững.

Bằng chứng: `LINE_WEBHOOK_MISSING_SIGNATURE_ACCEPTED`: event `unfollow` không có chữ ký được xử lý và thử ghi DB. Hướng sửa: bắt buộc HMAC trước side effect; tiếp nhận webhook bền vững và idempotent, có chính sách retry khi xử lý lỗi.

LINE OA nhận tin qua webhook: khi deploy trên máy tính, URL callback phải truy cập được từ hạ tầng LINE qua HTTPS. `localhost` chỉ dùng phía máy đang chạy. LINE personal nhận qua SDK và không cần callback OA; không áp dụng cấu hình webhook OA để sửa QR personal.

## 5. Bằng chứng kiểm tra

| Kiểm tra | Kết quả | Giới hạn |
| --- | --- | --- |
| Backend `npm run typecheck` | PASS | Không chứng minh SDK payload runtime đúng |
| Frontend `node node_modules/typescript/bin/tsc --noEmit` | PASS | Không kiểm tra room subscription trên trình duyệt |
| 8 test suites liên quan | 91/91 PASS | Các suite đang mock phần lớn provider/queue |
| Script `scratch/zalo-line-audit/reproduce.cjs` | 18 tình huống lỗi đã tái hiện | Xác nhận hành vi lỗi, không phải acceptance test đã đạt |
| Import SDK LINE thật | Thành công | Không xác nhận quét QR/PIN |
| SDK thật tạo QR với DESKTOPWIN | Có QR sau khoảng 1.105 ms | Không đăng nhập, không in QR/token |
| GET dịch vụ tạo ảnh QR với dữ liệu giả | 200, image/png, khoảng 1.805 ms | Điều kiện mạng tại thời điểm probe |
| HTTPS `legy.line-apps.com` | Host trả 404 ở đường `/` | Chỉ xác nhận kết nối host; API nghiệp vụ được probe riêng qua tạo QR |
| Log repo 26/10 | Có Zalo fetch failure + Redis ECONNREFUSED | Không dùng để kết luận runtime hiện tại |

Các suite đã chạy:

```text
tests/__tests__/zalo-pool-fixes.test.ts
tests/__tests__/zalo-profile-utils.test.ts
src/modules/zalo/__tests__/zalo-security-network.test.ts
src/modules/line/__tests__/line-hybrid.test.ts
src/modules/automation/__tests__/automation-line.test.ts
src/modules/automation/__tests__/automation-session-number.test.ts
src/modules/automation/__tests__/automation-milestone-stability.test.ts
src/modules/automation/__tests__/broadcast-campaign.test.ts
```

Chạy lại phép tái hiện từ root repository:

```powershell
node scratch/zalo-line-audit/reproduce.cjs
```

Output lưu ở `scratch/zalo-line-audit/evidence.json`. Script dùng dữ liệu giả và mô tả hành vi lỗi đang tồn tại; khi sửa code, các assertion xác nhận lỗi phải được thay bằng regression tests cho hành vi mong muốn.

## 6. Thứ tự xử lý đề xuất

1. Sửa S01–S03 và lỗi QR LINE C01. Lấy log mới khi tạo QR trên đúng máy deploy: request `/line/accounts/<id>/qr-login`, `status`, `last_sync_error`, trạng thái WebSocket và kết quả tải ảnh QR. Không đưa URL QR, cookie, token hoặc khóa phiên vào log chia sẻ.
2. Hoàn thiện lifecycle listener Zalo/LINE và sửa ánh xạ `TalkMessage`; reconnect phải giữ đúng phiên, phân biệt lỗi mạng/xác thực và dừng thủ công.
3. Sửa đăng ký room và payload cho cả chat riêng và Omnichannel; thống nhất persist/dedup cho chiều gửi/nhận.
4. Sửa fallback có thể gửi trùng, sync báo thành công giả và cơ chế lịch sử/catch-up.
5. Hoàn thiện DB → queue/recovery và thống nhất dispatcher automation; kiểm tra Redis trên đúng môi trường deploy.

Không tự đổi schema, API contract, quyền hay chính sách retry/nghiệp vụ trong đợt rà soát này. Các thay đổi cần thiết kế riêng phải bám quyết định đã duyệt của dự án.

## 7. Ma trận nghiệm thu bắt buộc cho hai chiều

Chạy riêng Zalo personal, LINE personal và LINE OA; chạy cho DM và nhóm/room phù hợp:

| Tình huống | Điều kiện đạt |
| --- | --- |
| Tạo QR lần đầu, tạo lại, hết hạn, từ chối PIN | Có ảnh/lỗi rõ ràng, trạng thái đúng, không dùng lại QR hết hạn |
| Gửi từ web tới điện thoại | Người nhận thấy đúng một tin; DB và UI cùng provider ID/hướng gửi |
| Gửi từ điện thoại đối tác tới web | Tin tự xuất hiện không cần refresh; đúng sender, thread và nội dung |
| Tự gửi từ LINE/Zalo trên điện thoại | Hiện chiều outgoing, không thành tin đối tác, không nhân đôi |
| Hai tab cùng account; đổi nhanh hội thoại/account | Cả hai tab cập nhật đúng room, response cũ không ghi đè thread mới |
| Hai CS có Zalo/LINE trùng số account ID | Không nhận được bất kỳ payload account của CS khác |
| Token thiếu/sai/hết hạn; webhook thiếu/sai chữ ký | Từ chối trước khi join room/ghi DB |
| Mất mạng rồi phục hồi; restart backend | Listener thật được khôi phục, trạng thái phản ánh vòng nhận, bù đủ tin |
| Event duplicate/out-of-order/redelivery | Một message, unread tăng một lần, thứ tự và last_message_at đúng |
| Tin dài, ảnh, file, sticker, quote/reaction/read receipt | Nội dung được lưu và hiển thị theo phạm vi hỗ trợ đã công bố |
| Timeout sau khi provider có thể đã nhận | Không gửi lại mù; có trạng thái đối soát và provider ID nếu lấy được |
| Redis tắt/khởi động lại; crash giữa ghi DB và enqueue | Delivery đến hạn được phục hồi có kiểm soát, không mất/trùng |
| Automation/broadcast theo lịch và gửi tay cùng account | Cùng giới hạn gửi, cùng lịch sử, kết quả nhất quán, không gửi sau hủy |

Chưa có tiêu chí thời gian realtime được chốt trong task. Cần đo độ trễ thực tế ở vòng nghiệm thu, không tự tuyên bố đã đạt một SLA chưa được kiểm chứng.
