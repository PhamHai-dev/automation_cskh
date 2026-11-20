# Phase 7 — Zalo Technical Spike

- Status: IN_PROGRESS
- Started at:
- Completed at:
- Dependencies: Core phases 0–6 stable
- Open questions: Q-007; technical results có thể tạo câu hỏi mới.

## Mục tiêu

Giảm rủi ro `zca-js` trước khi tích hợp sâu. Đây là technical spike, không phải production automation.

## Checklist chi tiết

### 7.0 Program-scoped care-group foundation — 2026-11-20

- [x] Kaiwa/JLPT naming engine, validation and preview
- [x] Program-scoped Zalo/LINE relations and migration backup
- [x] Duplicate candidate report with manual selection rule
- [x] Automation target isolation and pre-send relation checks
- [x] Admin/Manage settings UI, responsive table QA and permission tests
- [x] MySQL API verification with dual-program fixture; no real provider send

### 7.1 Bắt buộc test

- [ ] pin exact repo/version
- [ ] login flow thực tế
- [ ] lưu/restore session sau restart
- [ ] expired/re-login
- [ ] gửi text test
- [ ] recipient/thread id
- [ ] contact/friend relation nếu API hỗ trợ ổn định
- [ ] 2–3 account đồng thời
- [ ] process restart
- [ ] account login nơi khác
- [ ] failure/retry behavior
- [ ] memory/process footprint sơ bộ

### 7.2 Output

- [ ] version tested
- [ ] environment
- [ ] test matrix
- [ ] observed limitations
- [ ] session persistence strategy khả thi
- [ ] blockers
- [ ] go/no-go recommendation về mặt kỹ thuật

  Không được coi rate limit tự đặt là đảm bảo account an toàn.

## Không làm

- Không bật auto messaging cho user thật production.
- Không nối Attendance → send production.
- Không build full MessageRule UI.


## API contract

Technical spike không bắt buộc expose public business API. Nếu tạo temporary/debug endpoint thì phải đánh dấu rõ chỉ dùng development và không đưa vào production contract. Kết quả spike phải xác định contract dự kiến cho Phase 8 trước khi bắt đầu Phase 8.

## Exit criteria

- [ ] Có spike report.
- [ ] Có exact version pin.
- [ ] Có quyết định kỹ thuật có tiếp tục zca-js hay không.
- [ ] Nếu blocker: Phase 8 không được bắt đầu trước khi user xác nhận phương án.

## Implementation notes

### Added during implementation — 2026-11-19 connection verification

Theo yêu cầu tiếp tục của người dùng, đã chạy product và sửa lỗi kết nối Zalo/LINE hiện có; không coi đây là hoàn tất toàn bộ Phase 7 hoặc cho phép bật automation production.

- QR LINE SDK thật tạo được PNG và browser tải thành công ở desktop/tablet/mobile; chưa quét QR/PIN.
- 113 regression tests liên quan pass; browser test với DB/API/Socket.IO thật và provider giả lập xác nhận gửi/nhận/reconnect ở Zalo, LINE và cập nhật Omnichannel.
- Các tiêu chí tài khoản thật, provider delivery, restart/recovery đầy đủ và nghiệm thu production vẫn chưa được đánh dấu đạt.
- Chi tiết: `../khao-sat/AI_REVIEW/10_ZALO_LINE_PRODUCT_FIX_VERIFICATION_2026-11-19.md`.

## Changes from original plan

### Rà soát UI toàn project — 2026-11-20

Theo yêu cầu người dùng rà toàn bộ giao diện, sửa header/action/filter/popover bị tràn, icon bị co, câu hướng dẫn QR và PIN mobile; chuẩn hóa primitive form/button/modal, token và Lucide/logo catalog. Chuyển các modal tự dựng về Modal chung, kiểm tra focus/scroll/keyboard lồng nhau. Không sửa API, DB hoặc bật automation; không đánh dấu nghiệm thu provider/phase. Browser dữ liệu thật kiểm tra 48 trang/tab ở bốn viewport (192 lượt), bổ sung CS và fixture modal/inbox/account/group; 31 frontend tests/build đạt, lint thiếu config có sẵn. Chi tiết tại `../khao-sat/AI_REVIEW/12_UI_CONSISTENCY_AUDIT_2026-11-20.md`.

### Endpoint tài khoản và hậu tố JLPT tự do — 2026-11-20

Theo người dùng làm rõ Q-016, hậu tố JLPT chỉ là dấu hiệu chương trình và không tương ứng với trường học viên. Matcher xác định phần lõi bằng CSKH + mã + tên đã biết, chấp nhận `VIPN4N5` khi hồ sơ ghi `N54Video`; không dùng danh sách ví dụ để giới hạn hậu tố hoặc lấy trình độ hồ sơ làm gợi ý. Giữ báo trùng/chọn thủ công. DB/API thật xác nhận nhóm của học viên `420285164` đã liên kết `JLPT/AUTO_GROUP_NAME`; preview và UI cấu hình được cập nhật.

Audit endpoint Zalo/LINE: lọc credential/che proxy, kiểm tra trạng thái live, OA verification, ID/text validation, không báo sync/friend request thành công giả, chặn QR/reconnect tài khoản Zalo archived/disabled/banned, query tin mới nhất an toàn. 128 tests backend, 28 tests frontend, backend typecheck/frontend build/OpenAPI parse và browser ADMIN/CS desktop/tablet/mobile đạt; 12 GET thật trả 200, auth/owner trả 401/403. Một integration test bổ sung bị chặn bởi DB test thiếu `students.birth_year`, lint thiếu executable/config có sẵn. Không tạo migration, bật worker, gửi tin thật hay tạo QR mới; chưa nghiệm thu delivery hai chiều provider hoặc hoàn thành phase.

### Nhóm lớp và danh bạ — 2026-11-20

Follow-up layout: bảng nhóm lớp/danh bạ giữ cùng tỷ lệ cột qua fixed layout; text căn trái/trên, số phải và action grid giữ vị trí theo nền tảng. Kiểm tra DOM chiều rộng, overflow, tên/mã dài, nhiều liên kết và dữ liệu thật local; không đổi API hoặc khởi động lại backend.

Theo người dùng yêu cầu, nhóm lớp chỉ hiện nhóm GROUP liên kết học viên có EnrollmentClass trong phạm vi được xem; danh bạ có hai mục bạn bè và nhóm/cộng đồng (toàn bộ nhóm sync). API đọc `/omnichannel/groups` phân biệt scope, giữ owner isolation và student scope, không cần migration/field mới hoặc query toàn bộ Enrollment gây lỗi course_code hiện có. 16 integration tests pass, browser fixture desktop/tablet/mobile pass và API local xác nhận 7 nhóm tổng/1 nhóm liên kết lớp. Chỉ đọc/kiểm thử fixture; không gửi tin thật hoặc bật automation, không thay trạng thái nghiệm thu phase.

### Gộp hộp thư — 2026-11-20

Review tiếp theo: thu bộ lọc mặc định xuống dưới 160px (chưa tính padding ngoài); chỉ hiện tìm kiếm/nền tảng/tài khoản, loại/trạng thái mở qua Bộ lọc bổ sung có badge số điều kiện. Không thay logic lọc; browser responsive, mở/đóng/reset và 26 tests pass.

Người dùng chọn một hộp thư chung thay ba tab trùng lặp. `OmnichannelInboxPage` dùng `InboxWorkspace` + `InboxThread`, mapper chung Zalo/LINE; bỏ hai page chat riêng. Theo review tiếp theo của người dùng, tìm kiếm/nền tảng/tài khoản/loại/trạng thái gom vào một FilterBar tại danh sách, loại và trạng thái lọc kết hợp, có reset; bỏ nút nhắn từ danh bạ và lọc nền tảng riêng trên header. Alias route cũ giữ nguyên khả năng truy cập. Chức năng Zalo được đặt theo hội thoại; free reply chỉ hiện cho LINE OA còn hạn. Kiểm thử browser 1440/768/390 với fixture không gửi tin thật: bố cục, gửi nhiều dòng, giữ draft khi lỗi, realtime, link cũ, race và retry; 26 frontend tests và build pass. Không đổi API/DB, không bật worker hoặc đánh dấu nghiệm thu provider/phase. Các giới hạn quote/reactions/poll history có sẵn được ghi trong STATUS.

### Bảng tài khoản: nội dung giới hạn — 2026-11-20

Theo yêu cầu chốt của người dùng, giá trị Nhân viên CSKH căn giữa và bỏ hẳn cột Giới hạn sử dụng cho mọi loại tài khoản, mọi bộ lọc. Không giữ logic ẩn/hiện theo số liệu OA. Giữ chức năng cài đặt và KPI OA có dữ liệu thực tế; kiểm chứng bố cục 5 cột trên desktop/tablet/mobile, không thay backend limits hoặc trạng thái phase.

### LINE own-profile name sync — 2026-11-20

Theo báo lỗi của người dùng, đổi tên tạm thiết lập sang tên hồ sơ LINE khi login/restore và contact sync; không xóa tên khi profile trống/lỗi. Frontend nhận profile status realtime. 66 backend tests pass, xác nhận SDK thật và browser trên tài khoản hiện tại bằng saved session; không gửi tin/khởi động automation. Không thay đổi nghiệm thu phase.

### Zalo status label follow-up — 2026-11-20

Người dùng xác nhận phone login và QR dialog hoàn tất nhưng nhãn tài khoản “Chưa xác định”. Log/DB xác nhận kết nối thật thành công. Sửa frontend chuẩn hóa pool liveStatus lowercase tại API boundary; kiểm thử active/pending/disconnected và action visibility bằng browser fixture, thêm 4 regression cases. Không thay backend/login protocol hoặc restart phiên. Lỗi thiếu cột DB khi sync nhóm vẫn được theo dõi riêng.

### Audit table toàn frontend — 2026-11-20

Theo yêu cầu người dùng, rà toàn bộ 38 bảng HTML và 155 cấu hình cột tại 32 file; quy chuẩn header căn giữa và body theo kiểu dữ liệu trong design system. Triển khai CSS contract chung, kiểm tra source tự động, browser fixture QA trên desktop/tablet/mobile và 17 frontend tests. Không đổi trạng thái phase hoặc coi đây là nghiệm thu automation/provider; chi tiết tại `../khao-sat/AI_REVIEW/11_TABLE_LAYOUT_AUDIT_2026-11-20.md`.

### Bảng tài khoản đa kênh — 2026-11-20

Theo yêu cầu người dùng, chuẩn hóa trạng thái Zalo/LINE, bảng tài khoản, nhóm thao tác và responsive bằng component chung. Bỏ số giới hạn tra cứu ghi cứng/câu khẳng định chống khóa khỏi tổng quan, giữ riêng quota OA. Browser fixture QA pass ở desktop/tablet/mobile và các state loading/empty/error; không thay backend limits, scope hoặc đánh dấu nghiệm thu automation production.

### LINE gateway follow-up — 2026-11-20

Sau báo lỗi thực tế khi quét QR, tái hiện empty 404 của `/enc` bằng SDK 3.5.0 và token giả, đối chiếu upstream linejs #280. Adapter chuyển sang HTTPS Thrift thông thường, giữ Letter Sealing; sửa timeout/cancellation, native Request qua proxy và HTTP/2 PUSH. 22/22 channel regression tests pass; loopback TLS xác nhận duplex h2. Chưa đánh dấu đạt tiêu chí phone login hoặc gửi/nhận provider thật sau thay đổi này.

## Tác vụ UI độc lập — 2026-11-10

Theo yêu cầu người dùng, đã chỉnh trình bày Đồng bộ/Sao lưu dữ liệu theo Q-014.
Không triển khai nghiệp vụ Zalo, không thay đổi trạng thái hoặc phạm vi Phase 7.
Kết quả kiểm tra và giới hạn browser được ghi tại STATUS/CHANGELOG.
