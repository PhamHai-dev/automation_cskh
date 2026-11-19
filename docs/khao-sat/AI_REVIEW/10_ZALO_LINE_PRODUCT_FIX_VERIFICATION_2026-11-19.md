# Zalo/LINE: kết quả sửa và kiểm thử trên product — 19/11/2026

## Kết quả

Product đã chạy local với DB MySQL hiện có. QR LINE dùng SDK thật đã hiển thị trong trình duyệt bằng PNG tạo ở backend. Gửi/nhận tin và nhận tiếp sau reconnect đã được kiểm chứng trên màn hình Zalo, LINE và Omnichannel với provider giả lập, DB/API/Socket.IO thật. Đây chưa phải bằng chứng tin đã chuyển tới điện thoại thật.

## Thay đổi đã thực hiện

| Nhóm | Kết quả sửa |
| --- | --- |
| QR LINE | Tạo PNG nội bộ; bỏ dịch vụ ảnh ngoài; trả lỗi khởi tạo thay vì QR rỗng; timeout 20 giây; hủy transport QR khi ngắt/tạo lại; chặn callback stale; frontend xử lý lỗi ở phase QR và PIN, báo lỗi tải ảnh |
| Zalo QR/reconnect | Promise hoàn tất khi QR được sinh; reconnect truyền ciphertext đúng định dạng; khởi động SDK listener sau khi gắn handler; lỗi mạng tạm thời giữ session; handle pool error; bỏ sự kiện disconnect/message từ phiên cũ |
| LINE listener | Ánh xạ object SDK `from.id`, `to.id`, `raw.id`, loại GROUP/ROOM, thời gian gốc và chiều outgoing; phát hiện SDK `LegyPusherError` và bỏ readiness giả |
| Readiness | Đồng bộ lời gọi restore LINE đồng thời theo account; automatic readiness chặn disabled/banned/manual/circuit breaker; reconnect thủ công qua service vẫn được xử lý riêng; Zalo boot/cron không bỏ sót disconnect_reason NULL |
| Frontend realtime | Các trang chat/accounts/Omnichannel đăng ký room; reference count tránh một dialog unmount ngắt subscription khác; rejoin sau transport reconnect; LINE dùng đúng externalThreadId; Zalo tải lại tin đã persist để giữ ID/hướng/full content |
| Bảo mật | Socket yêu cầu JWT hợp lệ, user active và role phù hợp; subscription kiểm tra owner; LINE chỉ dùng room riêng; webhook OA bắt buộc HMAC trước side effects |
| Gửi tin | LINE Personal không gửi lần thứ hai plaintext sau lỗi mạng; OA chỉ fallback reply → push khi HTTP 400; kết quả reply không rõ được đánh dấu để worker không auto-retry push |
| Đồng bộ | Lỗi fetch danh bạ Zalo không bị biến thành errors=0; LINE không biến lỗi fetch thành mảng rỗng; mất live adapter báo lỗi sync; UI không toast thành công khi request sync thất bại |

Dependency mới: `qrcode@1.5.4`, type package `@types/qrcode@1.5.6`; dev dependency `socket.io-client@4.8.3` để test socket chạy độc lập trong backend. Không thay framework/stack. Không thay schema hoặc chạy migration. Các thay đổi chưa commit của người dùng ở app.ts và trang điểm danh được giữ nguyên.

## Kiểm thử đã chạy

- **113/113 tests** trong 10 suites liên quan: 91 tests hiện có và 22 regression tests mới.
- Test mới dùng Socket.IO server/client thật để xác nhận thiếu/sai/hết hạn token, user inactive, phân cách event giữa hai owner khi account ID trùng, và từ chối subscribe account khác chủ.
- Test mới xác nhận QR PNG local, lỗi init, lỗi DB callback không thành unhandled rejection, ánh xạ DM nhận/tự gửi/GROUP/ROOM, stream error, không fallback gửi lần hai, manual disconnect, thiếu HMAC, Zalo QR resolve/listener start/ciphertext/session retention.
- Backend typecheck/build và frontend production build thành công. Build frontend còn cảnh báo kích thước bundle có sẵn; không đổi chiến lược chia bundle trong task này.
- `git diff --check` thành công.
- OpenAPI YAML parse thành công. Tài liệu gốc có một description chứa `included: CS` chưa quote, được sửa chỉ phần quoting để kiểm tra toàn bộ YAML.
- Lint **chưa đạt do cấu hình môi trường có sẵn**: backend không cài ESLint; frontend không có config. Không ghi nhận lint pass.

## Kiểm thử trình duyệt

Sử dụng Chrome thật qua Playwright, đăng nhập tài khoản test local đã tồn tại.

| Kịch bản | Kết quả | Loại bằng chứng |
| --- | --- | --- |
| Thêm LINE Personal → mở QR → SDK tạo QR → render ảnh | PASS | SDK thật, API/DB/browser thật; không quét điện thoại |
| QR ở 1440px, 768px, 390px | PASS | Ảnh nằm trong viewport; screenshot QR được che |
| QR request thất bại 502 | PASS | Browser nhận response lỗi giả lập và hiện thông báo rõ |
| Nhận tin LINE khi đang mở chat | PASS | Actual SDK TalkMessage class + provider fixture; API/DB/socket/browser thật |
| Gửi LINE từ composer | PASS | Lệnh đi qua API/pool, provider gửi được giả lập, DB/UI có outgoing message |
| Ngắt WebSocket → tự kết nối lại → nhận LINE tiếp | PASS | Đóng transport thật và kiểm tra UI tự cập nhật sau rejoin |
| Hai tab LINE cùng nhận một tin | PASS | Hai page cùng browser context |
| Nhận/gửi Zalo từ chat | PASS | Handler/provider fixture Zalo; API/DB/socket/browser thật |
| Ngắt WebSocket → nhận Zalo tiếp | PASS | Transport thật, không refresh trang |
| Omnichannel cập nhật khi nhận LINE | PASS | Không refresh trang |
| JavaScript page errors trong vòng chat | 0 | Ghi nhận qua Playwright |

Các script kiểm thử local nằm ở `scratch/zalo-line-audit/`:

- `product-probe.cjs`: QR và responsive/error state trên product cổng 3000/5173.
- `product-channel-server.cjs`: chạy application thật với provider fixture trên loopback 3001, tắt external workers; không deploy script này.
- `product-chat-check.cjs`: browser check trên frontend 5174 trỏ tới provider-fixture server.
- `product-chat-results.json`: kết quả gửi/nhận/reconnect; screenshot chat và QR/error nằm cùng thư mục. QR thật được che trong screenshot giao lại.

Các endpoint `__audit` chỉ có trong script loopback ở scratch; không thêm endpoint thử nghiệm vào application source. Account/hội thoại/message fixture do script tạo được dọn khi kết thúc; worker automation không được bật.

## Phần chưa xác nhận hoặc chưa xử lý

1. Quét QR/PIN, login với tài khoản Zalo/LINE thật, xác nhận E2EE, gửi/nhận trên điện thoại của người nhận kiểm thử. Không gửi tin tới học viên trong phiên kiểm tra.
2. LINE OA qua callback HTTPS công khai cần kiểm thử ở môi trường deploy; không giả định localhost nhận webhook từ LINE được.
3. Mất mạng dài, bù lịch sử/checkpoint; reaction/thu hồi/read receipt; dedup unread counters và cập nhật theo thứ tự event. Những mục audit này chưa được tuyên bố hoàn tất.
4. Khoảng trống DB → queue, publisher Outbox và phục hồi broadcast `SENDING` sau crash vẫn cần một đợt reliability riêng; không tự đổi schema, policy retry hoặc bật gửi production để thử.
5. Log DB cũ có lỗi unique line_mid. Source hiện có logic giải phóng MID, nhưng chưa có kiểm chứng login lại cùng tài khoản thật; không tuyên bố lỗi cũ đã được tái hiện/sửa qua kiểm thử QR chưa quét.

Tài liệu phase trước đó vẫn ghi technical spike chưa hoàn tất. Đợt sửa này bổ sung bằng chứng kỹ thuật, không đánh dấu Phase 7/8 production DONE.
