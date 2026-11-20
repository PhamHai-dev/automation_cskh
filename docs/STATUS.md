# Project Status

## Khôi phục tải dữ liệu do DB chưa migrate — 2026-11-20

- Lỗi thật `/students?page=1&pageSize=25` là Prisma P2022 thiếu `enrollments.course_code`; cùng lỗi ảnh hưởng enrollment/class/dashboard/matcher. Hai migration 20261113/20261117 chưa áp dụng. Migration index có UTF-8 BOM khiến MySQL dừng ngay statement đầu; bỏ BOM, đánh dấu lần thất bại rolled-back rồi deploy lại thành công, không sửa nội dung nghiệp vụ migration.
- Đã áp dụng hai migration có sẵn và `20261120060000_reconcile_program_backups`: tạo bảng backup per-program hiện tại, copy 3 config cũ sang KAIWA với sheet1→profile/sheet3→attendance, giữ nguyên bảng legacy và cấu hình, thêm indexes/FK còn thiếu. Không dùng db push/reset hoặc SQL diff có DROP TABLE. Prisma status up-to-date; diff còn bảng legacy được chủ động giữ để phục hồi/đối chiếu.
- Snapshot trước migrate tại `scratch/db-recovery-2026-11-20/before-migrations.json` (được ignore Git). Đối chiếu giữ 2.390 enrollments, 129 package cũ, 9 sync configs và 3 backup configs cũ; 1.268 mã khóa JLPT được giữ, 1.070 package_id được chuẩn hóa theo migration đã chốt 17/11; các field ghi danh khác không đổi.
- Sửa queryCache dùng `then(cleanup, cleanup)` thay `finally` bị bỏ promise trả về, tránh Uncaught rejection thứ cấp khi API 500. Hai regression cases lỗi HTTP và request thay thế pass. Sửa test workbook backup dùng sandbox tạm của chính nó, không nới guard đường dẫn production.
- 32 lượt GET thật bằng Admin/CS đều 200 (students/enrollments/classes/packages/teachers/dashboard/sync/backup/care-group report/group directory). Browser 7 trang dữ liệu thật không 500/pageerror; giả lập 500 hiển thị lỗi đúng, không unhandled rejection. 28 frontend tests, 9 backend scope/backup tests và frontend build/typecheck pass; Prisma format/validate đạt. Worker automation vẫn tắt, không reset dữ liệu hoặc chạy backup ra dịch vụ ngoài.

## Nhóm lớp và Danh bạ đa kênh đúng phạm vi — 2026-11-20

- Review bố cục tiếp theo: cố định cùng tỷ lệ cột nhóm/tài khoản/liên kết/thành viên/thao tác ở hai bảng, min-width 1080px và cuộn nội bộ trên màn hình nhỏ. Tên nhóm/tài khoản/lớp căn trái và cùng mép trên, số thành viên căn phải, header luôn giữa. Thao tác dùng grid 3 vị trí để nút Zalo/LINE không dịch ngang khi thiếu nút đổi tên. Browser đo độ rộng cột, vị trí nút và overflow với tên/mã dài, nhiều liên kết ở 1440/768/390; dữ liệu thật local đã review lại.
- `/omnichannel/groups` chỉ hiển thị nhóm có quan hệ GROUP đã lưu tới học viên có lớp qua Enrollment → EnrollmentClass. Bảng hiển thị lớp/học viên tương ứng; giữ lớp lịch sử, không đoán theo tên nhóm hoặc coi mọi nhóm đồng bộ là nhóm lớp.
- Danh bạ chia hai mục: Danh sách bạn bè và Danh sách nhóm và cộng đồng. Mục nhóm đọc toàn bộ nhóm đã lưu từ tài khoản sở hữu, gồm nhóm chưa liên kết lớp; bạn bè giữ lọc/đồng bộ/nhắn tin Zalo/LINE hiện có. Tab nhóm có lọc nền tảng/tài khoản/tìm kiếm, phân trang server; đồng bộ từng tài khoản không gọi sync-and-match.
- API mới `GET /api/v1/omnichannel/groups?scope=all|class-linked` dùng cùng nguồn cho cả hai view. Enforce auth/roles/owner isolation kể cả Admin, metadata lớp/học viên theo scope student hiện hành. Select tối thiểu tránh lỗi schema drift course_code; không đổi schema/migration, không thay liên kết hay tự bật automation.
- 16 integration tests endpoint pass (đăng nhập, role, owner, scope CS/Manage/Admin, thiếu lớp, account chéo, dedupe, tìm kiếm/phân trang và query sai). Browser fixture desktop/tablet/mobile pass với hai nền tảng, tab bạn bè/nhóm, lọc, loading/empty/error/retry; không gửi tin thật. DB/API thật owner local xác nhận 7 nhóm tổng, 1 nhóm liên kết lớp, 2 tài khoản.
- 26 frontend tests, backend typecheck/build và frontend typecheck/build pass; OpenAPI parse/check schema pass. Browser dữ liệu thật mở được cả hai trang, không lỗi. Đã khôi phục phiên Zalo 5/LINE 13 sau backend reload; không bật worker. Lint chưa khả dụng do backend thiếu executable ESLint và frontend thiếu config có sẵn.

## Một hộp thư chung Zalo/LINE — 2026-11-20

- Theo yêu cầu làm gọn tiếp theo: giảm chiều cao control/spacing, bỏ tiêu đề phụ; mặc định chỉ tìm kiếm + nền tảng/tài khoản. Loại/trạng thái mở bằng Bộ lọc bổ sung, báo số điều kiện đang áp dụng ngay cả khi thu lại. Xóa lọc cùng dòng số kết quả. Browser 1440/768/390 xác nhận khối mặc định dưới 160px, mở/đóng giữ điều kiện và reset đầy đủ; 26 tests pass.
- Theo người dùng chốt, gộp Tất cả/Zalo chi tiết/LINE chi tiết thành một hộp thư, bỏ ba tab chế độ. Gom tìm kiếm, nền tảng, tài khoản, loại hội thoại và trạng thái vào một FilterBar trên danh sách; không tách lọc nền tảng lên header. Loại và trạng thái lọc kết hợp được, có xóa bộ lọc; chọn nền tảng giới hạn đúng các tài khoản. `/zalo/chat`, `/line/chat` dùng cùng trang với bộ lọc ban đầu; giữ query accountId/threadId.
- Dùng chung workspace hai khung, dòng hội thoại, avatar, header, bubble 14px, ngày/giờ và composer. Mobile chuyển danh sách ↔ chat; chiều cao không lồng viewport làm mất ô soạn. Bỏ nút/modal “Nhắn từ danh bạ Zalo” mới thêm, dùng phần Danh bạ hiện có. Cảm xúc/bình chọn Zalo nằm theo hội thoại; LINE OA hiển thị khả năng phản hồi miễn phí khi có token còn hạn.
- Chặn response cũ khi chuyển hội thoại, gửi trùng Enter; giữ nội dung khi gửi lỗi. Lỗi tải từng provider có retry, không che hội thoại của provider còn lại. Lịch sử lưu vẫn xem được khi tài khoản mất kết nối; backend tiếp tục kiểm tra quyền và điều kiện gửi.
- 26 frontend tests pass (5 ca mapping/error mới); browser fixture kiểm tra 1440/768/390, gửi/nhận realtime giả lập, link cũ, loading/empty/error/retry, response cũ và gửi đúng tài khoản. Kiểm tra kết hợp nền tảng → tài khoản → loại → trạng thái, search/reset và option tài khoản theo nền tảng pass. Browser dùng owner thật local tải 10 hội thoại/2 tài khoản, không lỗi provider/UI; không gửi tin thật. Build/typecheck pass; lint chưa chạy được vì repo thiếu ESLint config. Worker không bật.
- Giới hạn có sẵn: quote cũ chỉ có preview, API client không truyền quote và backend chưa gửi quote tới SDK; không mang nút trả lời gây hiểu nhầm sang giao diện chung, vẫn render quote đã lưu. Endpoint history Zalo hiện chưa trả reactions/rawContent của poll; không mở rộng backend trong task UI này. Không coi kiểm thử fixture là xác nhận delivery thật của provider.

## Bảng tài khoản: căn giữa CSKH, bỏ cột Giới hạn sử dụng — 2026-11-20

- Giá trị Nhân viên CSKH căn giữa theo yêu cầu.
- Bỏ hẳn cột Giới hạn sử dụng cho mọi loại tài khoản và bộ lọc. Không còn hai dòng “Theo cấu hình tài khoản / Xem trong cài đặt” hoặc logic ẩn/hiện cột theo dữ liệu OA. Giữ chức năng cài đặt và KPI OA có số liệu thực tế.
- Kiểm chứng bảng luôn có 5 cột trên desktop/tablet/mobile, kể cả OA có đủ quota; frontend tests và build/typecheck.

## LINE: đồng bộ tên hồ sơ tài khoản — 2026-11-20

- Sửa nhánh giữ tên tự đặt lúc thiết lập: tên không rỗng từ LINE được ưu tiên khi đăng nhập/khôi phục phiên. Tên thiết lập chỉ là tạm; không xóa tên khi provider không trả tên hoặc lỗi lấy hồ sơ.
- Đồng bộ danh bạ cập nhật thêm hồ sơ chính chủ (tên/MID/avatar); chặn kết quả từ epoch cũ. Frontend nhận các trường profile trong `line:status` và cập nhật hàng ngay.
- 66/66 tests backend liên quan pass, thêm 5 trường hợp profile; backend typecheck/build và frontend build pass. Dùng phiên đã lưu của LINE account 13 để reconnect trên product; đối chiếu SDK thật `getProfile` xác nhận tên lưu trùng tên trên LINE. Browser thật xác nhận tên provider hiển thị và event cập nhật profile thay đổi hàng.
- Đã khôi phục cả Zalo account 5 sau backend hot-restart bằng phiên lưu; không gửi tin hoặc quét QR lại. Worker automation vẫn tắt. Lỗi DB care-group matcher còn riêng biệt.

## Zalo: nhãn “Chưa xác định” sau đăng nhập QR — 2026-11-20

- Log 10:07:22 (UTC+7) xác nhận quét/đăng nhập, listener và sync danh bạ thành công; DB account 5 `ACTIVE`. Người dùng xác nhận điện thoại đã duyệt và web đóng QR, nhưng bảng hiện “Chưa xác định”.
- Nguyên nhân: API danh sách trả `liveStatus=connected` từ pool, bảng chỉ ánh xạ enum `ACTIVE`. Sửa chuẩn hóa tại frontend API boundary cho toàn bộ consumer Zalo; `connected→ACTIVE`, `disconnected→NOT_LOGGED_IN`, các trạng thái đang kết nối/chờ QR tương ứng. Giữ ưu tiên DISABLED/BANNED đã lưu; không biến mất kết nối thành đang hoạt động.
- Thêm 4 regression tests; 21/21 frontend tests pass và build/typecheck pass. Browser fixture xác nhận nhãn active/pending/disconnected và nút đồng bộ/ngắt/đăng nhập đúng trạng thái. Không thay backend, không khởi động lại phiên hoặc yêu cầu quét lại QR.
- Lỗi DB thiếu `enrollments.course_code` ảnh hưởng sync nhóm sau đăng nhập đã được xử lý bằng migration ngày 2026-11-20; xem mục khôi phục tải dữ liệu ở đầu tài liệu.

## Audit và chuẩn hóa bảng toàn frontend — 2026-11-20

- Rà source toàn bộ: 38 bảng HTML (gồm DataTable chung), 155 định nghĩa cột tại 32 file. Header luôn căn giữa; body văn bản căn trái, mã/ngày/trạng thái/thao tác căn giữa, số lượng/tiền/điểm/tỷ lệ căn phải. Quy định đã lưu ở `ui/design-system.md`.
- `Column.align`/`wrap` bắt buộc; bảng riêng dùng contract `data-table`/`data-align`/`data-wrap`, CSS chung và scope header. Sửa flex trong cell, tránh co nút/icon, giữ mã/ngày/badge nguyên dòng, bỏ ghi đè header lệch trái/phải, sửa vùng modal bị cắt và ghim cột ngang trên mobile.
- Chuẩn hóa nhãn bảng, thêm title cho 20 giá trị rút gọn, sửa nhãn/giá trị thông tin báo cáo học tập trên điện thoại. Giữ logic dữ liệu, quyền và thao tác nghiệp vụ.
- 17/17 tests frontend pass; typecheck/build pass; browser fixture QA ở 1440/768/390px gồm bảng chung, ma trận quick/detailed/stats/log, JLPT, dashboard, import, đa kênh và các trang quản trị. Lint vẫn bị chặn do thiếu config ESLint. Một số API local trả 500 do schema DB lệch; không coi fixture QA là xác nhận nghiệp vụ với dữ liệu thật.
- Báo cáo và danh mục file: `khao-sat/AI_REVIEW/11_TABLE_LAYOUT_AUDIT_2026-11-20.md`.

## Bảng Tài khoản & kênh — 2026-11-20

- Zalo/LINE dùng chung nhãn trạng thái và Badge semantic tại trang đa kênh (`ACTIVE` → `Đã kết nối`). Dùng DataTable, Card, HorizontalTabs chung; tách tên/kênh/ID/SĐT theo cùng thứ tự, căn header/cell và gom thao tác thành nút icon có tên truy cập/title.
- Tách hàng nút thêm tài khoản khỏi tiêu đề; chuẩn hóa KPI/filter/search. Bảng đủ chỗ ở desktop 1440px với fixture kiểm thử, cuộn ngang bên trong ở 1280/768/390px; trang không tràn ngang.
- Bỏ số tra cứu 60/20 ghi cứng và câu khẳng định chống khóa/an toàn khỏi phần tổng quan. Tài khoản cá nhân hướng tới cấu hình; OA giữ hạn mức tin tháng riêng. Không thay đổi hạn mức backend, account ownership hoặc thao tác gửi/đồng bộ.
- Browser QA bằng fixture Zalo/LINE cá nhân/OA: responsive, trạng thái active/expired, action visibility, tìm SĐT, lọc kênh, loading/empty/error/retry, mở cài đặt đều pass; không có page errors. Frontend typecheck/build pass; lint bị chặn do thiếu ESLint config hiện có.

## LINE: lỗi 404 sau quét QR — 2026-11-20

- Tái hiện bằng SDK 3.5.0 tại máy local với token giả: `/enc` trả đúng empty HTTP 404 + `server=legy`, trong khi `/S4` qua HTTPS trả HTTP 200 với Thrift `AUTHENTICATION_FAILED`. Khớp sự cố upstream linejs #280; không cần đổi device hoặc quét tài khoản để tái hiện lỗi gateway.
- Chuyển personal adapter sang standard HTTPS Thrift cho QR/restore/Talk, giữ Letter Sealing. Transport giữ AbortSignal của Request gốc, hỗ trợ HTTP/2 PUSH, dùng native fetch qua proxy và giải phóng dispatcher khi disconnect; khai báo trực tiếp `undici@7.30.1`.
- 65/65 tests trong 4 suites LINE/automation/channel/Zalo connection pass (thêm 4 trường hợp transport). Backend typecheck/build pass; loopback TLS xác nhận HTTP/2 duplex PUSH trực tiếp và qua proxy, SDK thật nhận structured auth error qua transport đã sửa. Chưa xác nhận đăng nhập/gửi-nhận trên điện thoại sau bản sửa; đang chờ người dùng quét QR mới.
- Không chạy migration hoặc bật worker automation. Log lúc người dùng đăng nhập Zalo còn ghi nhận lỗi riêng: thiếu cột DB `enrollments.course_code` và unique conflict khi sync group members; chưa xử lý trong bản sửa LINE này.

## Zalo/LINE: sửa kết nối và kiểm thử product — 2026-11-19

- Đã chạy product local với MySQL hiện có, tắt worker/scheduler gửi tin. Không thay schema, migration hoặc dữ liệu nghiệp vụ.
- QR LINE tạo PNG tại backend; lỗi tạo QR, timeout, hủy/thay thế phiên được xử lý rõ ràng. Sửa listener Zalo/LINE, định dạng tin LINE, room realtime và khôi phục subscription sau reconnect.
- Bắt buộc token cho socket, tách room giữa hai nền tảng và bắt buộc chữ ký webhook OA; giữ nguyên scope chủ tài khoản.
- 113/113 test liên quan pass; backend/frontend typecheck/build pass. Browser kiểm chứng gửi/nhận/reconnect Zalo và LINE, hai tab LINE, và Omnichannel với provider giả lập + DB/API/Socket.IO thật; QR LINE kiểm chứng bằng SDK thật, chưa quét QR/PIN.
- Lint chưa chạy được do hạ tầng có sẵn: backend thiếu ESLint, frontend thiếu config. OpenAPI YAML đã parse thành công sau sửa một scalar mô tả cũ thiếu dấu nháy.
- Chưa xác nhận delivery tới điện thoại thật, bù lịch sử mất kết nối, đồng bộ reaction/read receipt, dedup counters hay recovery DB → queue/broadcast. Chưa bật production automation.
- Báo cáo chi tiết: `khao-sat/AI_REVIEW/10_ZALO_LINE_PRODUCT_FIX_VERIFICATION_2026-11-19.md`.

## Không gian Giáo viên — 2026-11-17

- Tài khoản chỉ có role `TEACHER` dùng sidebar riêng gồm Dashboard; Giảng dạy (Điểm danh, Lịch dạy, Việc cần xử lý, Học viên của tôi); Cá nhân (Thông báo, Hồ sơ giáo viên). Tài khoản đa vai trò giữ sidebar đầy đủ.
- Dashboard giáo viên tổng hợp lịch hôm nay/buổi tiếp theo, việc chờ xác nhận, thông báo mới, số lớp và số học viên đang phụ trách từ API có scope hiện hành.
- Route giáo viên chuẩn hóa dưới `/teacher/*`; alias route cũ vẫn redirect để giữ tương thích.
- Thêm `GET/PATCH /api/v1/teachers/me`; giáo viên chỉ tự sửa `phone` và `email`, thay đổi có AuditLog.
- Xác minh: backend typecheck pass; frontend production build pass; 5/5 unit test teachers pass; `git diff --check` pass. Browser QA pass ở desktop 1440×900, tablet 732px và viewport hẹp nhất công cụ hỗ trợ 627px; route mới, alias cũ, header link và drawer đều hoạt động, không có lỗi console hay tràn ngang. Frontend lint chưa chạy được vì repository chưa có ESLint config; build còn cảnh báo bundle lớn có sẵn.

## Chuẩn hóa Gói học Kaiwa/JLPT — 2026-11-17

- Đã thống nhất Kaiwa `Gói học` và JLPT `Gói SP` qua `Enrollment.package_id -> Package`; JLPT `Mã khóa học` lưu riêng tại `Enrollment.course_code`.
- Đã cập nhật API tạo/sửa, import/backup workbook và cột Gói học chung ở cả Hồ sơ Học viên lẫn Báo cáo Học tập & Chăm sóc.
- Migration dữ liệu đã được áp dụng ngày 2026-11-20 sau snapshot/preflight để xử lý lỗi tải dữ liệu. Đã đối chiếu đầy đủ field gốc/mã khóa học và package mapping; không reset DB, xem mục khôi phục ở đầu tài liệu.
- Prisma schema format/validate đạt; bước generate từng bị chặn do DLL Prisma đang được process khác sử dụng. Backend/frontend/tests đang được xác minh lại sau chỉnh sửa.

## Trung tâm Lịch sử hoạt động — 2026-11-13

- Đã tái thiết kế `/activity-logs` thành trung tâm bốn view: thao tác Web, đồng bộ, sao lưu và đăng nhập; desktop dùng bảng, mobile dùng card, modal chi tiết responsive.
- Filter, tab, trang, page size và từ khóa được lưu trong URL; từ khóa debounce 400ms; mặc định 7 ngày; preset Hôm nay/7/30 ngày/tùy chỉnh; page size 25/50/100.
- Backend áp dụng data scope ADMIN/MANAGE/CS, chặn TEACHER; login chỉ ADMIN/MANAGE; rollback sync chỉ ADMIN/MANAGE và kiểm tra scope.
- CSV xuất toàn bộ dữ liệu đã lọc của view hiện tại từ server, không chỉ trang đang xem; thời gian ghi rõ UTC+7.
- Retention vật lý 30 ngày chạy 02:30 theo `Asia/Ho_Chi_Minh` cho audit/login/sync; không xóa file sao lưu vật lý; ghi một audit tổng hợp.
- Đã thêm index Prisma và migration nhưng chưa chạy migration trên database.
- Xác minh: backend typecheck pass; 14/14 activity backend tests pass; frontend production build pass; 14/14 frontend feature regression tests pass; `git diff --check` pass.
- Browser QA pass ở desktop 1440×900, tablet khoảng 768px và mobile khoảng 390px cho bốn view, modal, refresh/export và responsive. Lint frontend chưa chạy được vì repository chưa có ESLint config.

## Cập nhật nhãn sao lưu — 2026-11-10

- Đã đổi nhãn hiển thị Backup → Sao lưu trong các trang Sheet/Excel liên quan; không đổi URL/API/logic/quyền hoặc dữ liệu.
- Đã triển khai UI theo Q-014 được duyệt: sidebar/submenu là điều hướng chính, bảng phẳng theo cột, menu thao tác phụ, bộ lọc thu gọn, form và lịch sử đồng nhất.
- Thiết kế hiện tại dùng header xanh nhạt, 4 KPI pastel và badge nhận diện luồng; không còn viền dọc màu hoặc dòng chi tiết xổ xuống. Thông tin kết nối/nơi lưu và phạm vi được đưa thành cột; cột Tự động chỉ còn công tắc.
- Frontend typecheck + production build pass; có cảnh báo bundle lớn. Lint chưa chạy được vì repository chưa có cấu hình ESLint.
- 9 kiểm thử render/static regression đạt; không thay thế kiểm thử E2E. Browser CDP timeout nên responsive/tương tác thực tế chưa xác minh. Không chạy đồng bộ/sao lưu thật.
- Đây là tác vụ UI riêng, không chuyển trạng thái hoặc bắt đầu phase Zalo.

## Cập nhật đối soát điểm danh — 2026-10-11

- Hàng chờ đối soát giờ được xác định đồng thời từ `reconciliation_state` và trạng thái thực tế hai phía, tránh hiển thị nhầm bản ghi cả GV lẫn CSKH chưa nhập trong Chờ CSKH.
- API pending trả danh sách giáo viên active được phân công theo lớp; giao diện thêm cột Giáo viên và tách cột/thao tác theo Chờ CSKH, Chờ GV và Tất cả.
- Backend typecheck và frontend production build pass. Integration suite reconciliation: 11/12 flow pass, gồm flow mới; Flow 4 Excel fixture và teardown FK vẫn fail do dữ liệu/test cleanup có sẵn.

## Kiểm tra merge — 2026-10-06

- Auto-attendance: đã thay user ID cố định bằng actor hệ thống riêng, inactive và không có role (user phê duyệt).
- Backend typecheck pass; 21/21 integration tests phân quyền giáo viên và auto-attendance pass trên database test riêng, Redis tắt.
- 46 regression tests chọn lọc đã pass trước đó.
- Chưa sẵn sàng deploy: migration replay lỗi tại `20260924043000_add_friend_zalo_uid` (AFTER avatar_url chưa tồn tại); database hiện tại lệch schema và chưa có lịch sử migration.
- Redis local chưa kết nối được; không tự bật worker gửi tin. Chính sách retry execution FAILED chưa thay đổi.
- Không reset/migrate database hiện tại; chưa commit/push/merge.


- Current phase: Phase 7 — Zalo technical spike
- Status: READY
- Last updated: 2026-09-22
- Next phase: Phase 7 — Zalo technical spike

## Blockers hiện tại

Không có blocker kỹ thuật cho Phase 7.

## Program-scoped care groups — 2026-11-20

- Đã tách liên kết nhóm Zalo/LINE theo `student + account + program_type`: Kaiwa và JLPT không ghi đè nhau. Liên kết `ALL` chỉ dùng cho USER cá nhân dùng chung; GROUP legacy được đánh dấu cần xác định chương trình.
- Matcher đọc mẫu tên từ AppSetting: Kaiwa mặc định `{csNumber} - {studentId} {studentName}`, JLPT thêm `{level}` ở cuối. Ghi chú N1–N5 chỉ nhận diện hậu tố; không so với `Enrollment.level` và không dùng để tự chọn nhóm. Nhiều nhóm cùng CS + mã HV + chương trình chuyển sang chọn thủ công.
- Admin/Manage có hộp thoại cấu hình, xem trước và optimistic version; lưu có audit, không tự đổi tên nhóm, gửi tin hoặc chạy đồng bộ. Bảng Liên kết học viên và Danh bạ nhóm có lọc Kaiwa/JLPT, dòng theo chương trình, cảnh báo legacy/trùng và căn chỉnh cố định responsive.
- Automation trigger/worker/broadcast chỉ dùng liên kết đúng chương trình hoặc USER dùng chung; queued group target được kiểm tra lại trước gửi. Manual selection được bảo vệ trong transaction và không ghi đè bởi matcher.
- Migration `20261120080000_program_scoped_care_groups` đã backup và áp dụng; giữ nguyên ID/dữ liệu quan hệ cũ. Prisma format/validate/migrate status, backend typecheck/build, frontend build, 105 backend tests, 28 frontend tests và browser QA 1440/768/390 pass. Không bật worker, không gửi tin thật; đã khôi phục phiên local Zalo 5/LINE 13.

## Phase summary

| Phase | Tên | Status |
| --- | --- | --- |
| 0 | Foundation & project bootstrap | DONE |
| 1 | Database schema & core persistence | DONE |
| 2 | Auth/RBAC + Admin User Management | DONE |
| 3 | Student/Enrollment/Class/Teacher core | COMPLETED |
| 4 | ClassSession + Attendance | COMPLETED |
| 5 | Excel import/export Sheet 1 + Sheet 3 | COMPLETED |
| 6 | CareLog/CareTask + Dashboard | COMPLETED |
| 7 | Zalo technical spike | NOT_STARTED |
| 8 | Zalo automation production | NOT_STARTED |
| 9 | Hardening + production | NOT_STARTED |

## Cập nhật Giao diện & Dữ liệu Nghiệp vụ Thực tế (2026-09-21)

- **Đồng nhất vai trò Sale & CSKH**: Sale và nhân viên chăm sóc khách hàng là 1 (vai trò hệ thống `CS`). Cột `Sale` trong Sheet 1 ánh xạ vào tài khoản đăng nhập của nhân viên.
- **Ma trận Điểm danh theo Lịch Ngày (`/enrollments`)**: Hiển thị trực tiếp Thứ & Ngày theo tháng/tuần/năm (bỏ số thứ tự buổi), 11 cột cố định bên trái, bỏ cột chỉ số chuyên cần ĐH/BT, lọc học viên theo Sale phụ trách.
- **Danh sách Học viên Chuẩn Sheet 1 (`/students`)**: Cấu trúc bảng đầy đủ 28 trường dữ liệu của Sheet `1.Chăm sóc`, highlight badge đỏ cảnh báo nợ buổi âm (`-1`, `-2`...), modal xem chi tiết toàn diện.
- **Chuẩn hóa 5 tài khoản test**: Tạo lại cơ sở dữ liệu với 5 tài khoản test (`admin@gmail.com`, `cskh1@gmail.com`, `cskh2@gmail.com`, `cskh3@gmail.com`, `teacher@gmail.com`) có mật khẩu chung `123456`, gắn 13 học viên thực tế phân bổ cho 3 Sale.
- **Xác thực toàn diện**: 50/50 tests backend passed, frontend & backend build 0 lỗi, kiểm thử browser subagent thành công.

## Documentation readiness

- API contract documentation: READY (`docs/api/openapi.yaml`, `docs/api/care.md`, `docs/api/dashboard.md`, `docs/api/imports.md`).
- Sẵn sàng chuyển tiếp sang Phase 7 (Zalo technical spike).
