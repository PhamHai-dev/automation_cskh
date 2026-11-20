# Project Changelog

## 2026-11-20 — Endpoint tài khoản và nhận diện hậu tố JLPT tự do

- Hậu tố JLPT là ghi chú tự do, không so với trường học viên hay danh sách ví dụ cấu hình; ghép theo lõi CSKH + mã + tên đã biết. Bỏ sao chép trình độ hồ sơ vào gợi ý tên nhóm, giữ chọn thủ công khi trùng và tránh phân loại sai do khoảng trắng cuối.
- Cập nhật preview/config UI và OpenAPI; xác minh liên kết tự động thật cho nhóm `02 - 420285164 Nguyễn Hoài Ngân VIPN4N5`.
- Loại credential khỏi response tài khoản Zalo/LINE, che proxy, phản ánh kết nối live; thêm status LINE owner-scoped. Chặn thành công giả khi OA xác minh lỗi hoặc personal mất kết nối, validate ID/text và chặn QR/reconnect Zalo đã vô hiệu hóa. Sửa query tin mới nhất Zalo bằng tham số Prisma an toàn.
- 128 backend tests, 28 frontend tests, typecheck/build và browser responsive ADMIN/CS đạt; 12 GET thật trả 200, kiểm tra 401/403 đạt. Integration test bổ sung bị chặn bởi schema DB test cũ, lint thiếu cấu hình/executable có sẵn; không gửi tin provider thật hoặc bật worker.

## 2026-11-20 — Sửa lỗi API 500 do database lệch migration

- Áp dụng migration index/history và chuẩn hóa gói học đã có, bổ sung `course_code`; bỏ UTF-8 BOM gây MySQL syntax error ở migration index chưa áp dụng. Thêm migration chuyển backup config legacy sang per-program, giữ bảng/cấu hình cũ, bổ sung index/FK. Có snapshot và kiểm tra bảo toàn dữ liệu trước/sau.
- Giữ 2.390 enrollments, 129 package cũ, 9 sync configs, 3 backup configs; bảo toàn 1.268 mã khóa học JLPT, chuẩn hóa 1.070 liên kết gói theo quyết định 17/11. Không đổi field ghi danh khác hoặc reset DB.
- Sửa Promise cleanup ở queryCache để request lỗi không sinh thêm unhandled rejection; thêm 2 tests, sửa sandbox fixture backup cho đúng guard hiện hành.
- 32 GET thật Admin/CS trả 200, 7 trang browser tải dữ liệu không lỗi 500; 28 frontend tests và 9 backend tests pass, frontend build/typecheck và Prisma format/validate pass.

## 2026-11-20 — Tách phạm vi nhóm lớp và danh bạ

- Sửa bảng nhóm tự co giãn theo dữ liệu: tỷ lệ cột cố định chung hai view, tên/metadata căn trái trên, số căn phải, nút hành động giữ vị trí theo grid; kiểm tra tên/mã dài, nhiều liên kết và scroll tablet/mobile bằng phép đo DOM.
- Nhóm Lớp Đa kênh chỉ chứa nhóm đã liên kết học viên có lớp; bổ sung lớp/học viên cụ thể trong bảng, không lấy toàn bộ nhóm sync vào trang này.
- Danh bạ đa kênh có Danh sách bạn bè và Danh sách nhóm và cộng đồng. Toàn bộ nhóm Zalo/LINE đồng bộ nằm ở mục nhóm, kể cả chưa liên kết; giữ các thao tác bạn bè, hộp thư, đổi tên và quản lý liên kết tại đúng ngữ cảnh.
- Thêm API đọc owner-scoped `/omnichannel/groups`, validation, scope học viên/lớp, lọc trước phân trang và response tối thiểu. Không sửa schema, không thay dữ liệu liên kết khi xem/làm mới, không gọi matcher từ nút đồng bộ danh bạ nhóm.
- 16 backend integration tests và browser fixture 1440/768/390 pass; đọc DB/API local xác nhận 7 nhóm tổng/1 nhóm liên kết lớp.

## 2026-11-20 — Gộp hộp thư Zalo/LINE

- Thu gọn bộ lọc: bỏ header phụ, control 32–36px, gap 8px; thu loại/trạng thái vào Bộ lọc bổ sung có badge đếm. Giữ lọc khi thu lại, reset ở cạnh số kết quả. Kiểm tra browser 3 viewport và 26 tests pass.
- Thay ba màn hình hộp thư bằng một giao diện chung; lọc theo nền tảng/tài khoản, giữ liên kết `/zalo/chat`, `/line/chat` và query mở hội thoại. Xóa hai page chat riêng để không phát sinh lệch giao diện.
- Chuẩn hóa danh sách, header, bubble, ngày/giờ, composer nhiều dòng và mobile back. Gom các bộ lọc vào một FilterBar (tìm kiếm, nền tảng/tài khoản, loại/trạng thái kết hợp, reset), bỏ vùng lọc trên header và nút “Nhắn từ danh bạ Zalo”. Cảm xúc/bình chọn Zalo nằm theo hội thoại, giữ ghi chú phản hồi miễn phí riêng LINE OA. Thông tin hội thoại qua modal chung.
- Giữ bản nháp khi gửi lỗi, chặn gửi trùng và response cũ sau chuyển hội thoại; tách lỗi tải từng provider. 26 tests pass; browser fixture 9 tổ hợp nền tảng/viewport và các tình huống realtime, deep link, retry, race pass; frontend build/typecheck pass. Lint bị thiếu cấu hình có sẵn.
- Ghi nhận giới hạn quote và dữ liệu reactions/poll của history Zalo trong STATUS; không thay API/backend hoặc gửi tin thật khi kiểm thử.

## 2026-11-20 — Căn giữa nhân viên, bỏ cột Giới hạn sử dụng

- Căn giữa giá trị Nhân viên CSKH trên bảng đa kênh. Bỏ hẳn cột Giới hạn sử dụng ở mọi loại tài khoản và bộ lọc theo yêu cầu chốt của người dùng.
- Giữ chức năng cài đặt và KPI OA dùng số liệu thực tế. Kiểm chứng bố cục 5 cột trên desktop/tablet/mobile, frontend tests và build/typecheck.

## 2026-11-20 — LINE đồng bộ tên hồ sơ chính chủ

- Tên LINE thật ghi đè tên tạm thiết lập khi login/restore; giữ tên đã lưu nếu provider không có tên. Contact sync làm mới tên/MID/avatar và gửi profile qua event status hiện có.
- Bảng tài khoản cập nhật profile từ realtime; form thiết lập giải thích tên tạm. Không thêm field hoặc endpoint.
- Thêm 5 regression cases; 66/66 tests backend và typecheck/build pass. Account LINE hiện tại đã được cập nhật qua phiên lưu; SDK thật xác nhận tên DB khớp hồ sơ LINE, browser kiểm chứng render và realtime profile.

## 2026-11-20 — Zalo “Chưa xác định” sau QR

- Sửa frontend nhận trạng thái pool lowercase (`connected`, `disconnected`, `qr_pending`, `connecting`) thành enum UI dùng chung tại API boundary, áp dụng cho bảng tài khoản/danh bạ/liên kết/chat. Giữ trạng thái vô hiệu hóa/hạn chế đã lưu và không coi offline là active.
- Khôi phục nhãn “Đã kết nối”, số tài khoản kết nối và các nút đồng bộ/ngắt sau đăng nhập. Thêm 4 regression tests; browser fixture nhãn/actions pass; không cần quét lại hoặc restart backend.

## 2026-11-20 — Audit bố cục và căn cột toàn project

- Chuẩn hóa 38 bảng HTML và 155 định nghĩa cột ở 32 file frontend: mọi header căn giữa, body theo kiểu dữ liệu. Bổ sung contract align/wrap bắt buộc cho DataTable và CSS table dùng chung; guard tự động rà cả bảng viết riêng.
- Sửa nhóm flex/nút/icon trong ô, kiểm soát wrap, không ghim ngang che bảng trên điện thoại; sửa scroll modal, label/value báo cáo học tập và nhãn trường. Thêm title cho 20 nội dung ellipsis.
- 17 frontend tests, typecheck/build và browser fixture QA desktop/tablet/mobile pass. Giới hạn hạ tầng ESLint/DB local được ghi trong báo cáo audit; không chạy migration hoặc thay rule nghiệp vụ.

## 2026-11-20 — Chuẩn hóa bảng tài khoản Zalo/LINE

- Thống nhất nhãn trạng thái, cấu trúc thông tin tài khoản và căn cột trên trang đa kênh; dùng DataTable/Badge/Card/HorizontalTabs chung. Giữ ID/SĐT rõ ràng, nút thao tác đồng kích thước và có aria-label/title.
- Tách tiêu đề và hàng thao tác, sửa KPI/filter/search responsive, bổ sung báo lỗi tải từng nền tảng và nút thử lại. Bỏ giới hạn tra cứu ghi cứng và câu khẳng định chống khóa khỏi tổng quan; không thay cấu hình giới hạn thực tế.
- Browser fixture QA pass ở 1440/1280/768/390px cùng loading/empty/error/search/filter/action visibility. Frontend typecheck/build pass; lint chưa chạy được vì thiếu config sẵn có.

## 2026-11-20 — LINE 404 sau quét QR

- Dùng standard HTTPS Thrift thay cho gateway `/enc` đang trả empty 404 (linejs #280), áp dụng QR, restore session và Talk; giữ TLS/Letter Sealing, không retry gửi tin.
- Giữ request timeout khi kết hợp cancellation, bật HTTP/2 cho PUSH và sửa native Request/proxy compatibility; hủy dispatcher cùng connection. Khai báo dependency trực tiếp `undici@7.30.1`.
- Thêm 4 regression cases; 65/65 tests liên quan và backend typecheck/build pass. Kiểm chứng SDK thật với token giả và loopback HTTP/2 duplex trực tiếp/qua proxy. Đăng nhập QR/PIN và trao đổi tin nhắn trên điện thoại vẫn cần kiểm chứng sau sửa.

## 2026-11-19 — Zalo/LINE QR, listener và realtime

- Tạo ảnh QR LINE nội bộ với `qrcode@1.5.4`, truyền lỗi/timeout về UI, hủy transport và chặn callback của phiên QR cũ. Không chuyển URL đăng nhập sang dịch vụ tạo ảnh ngoài.
- Khởi động listener Zalo sau khi gắn handler; reconnect dùng đúng ciphertext và không xóa session vì lỗi mạng tạm thời. Health/boot recovery xử lý đúng disconnect_reason NULL và account disabled.
- Đọc đúng `TalkMessage` LINE (from/to object, raw provider ID); nhận diện stream lỗi từ SDK và coalesce tác vụ reconnect theo account. Không gửi fallback plaintext sau timeout; OA giữ trạng thái chưa rõ kết quả reply.
- Bắt buộc xác thực socket và HMAC webhook, tách LINE room, giữ scope account owner. Frontend đăng ký room theo account có reference count, tự đăng ký lại sau transport reconnect; sửa payload LINE và hiển thị tin Zalo từ DB để giữ chiều outgoing/ID/full content.
- Sync contacts/groups không còn báo toast thành công khi request lỗi. Thêm 22 regression tests, kiểm thử browser với provider giả lập và QR thật; xem báo cáo kiểm chứng để biết phạm vi/giới hạn.
- Không thay schema/migration hay triển khai publisher Outbox trong đợt sửa này. Lint bị chặn bởi cấu hình có sẵn; YAML OpenAPI sửa thêm một lỗi quoting cũ để parse được toàn bộ tài liệu.

## 2026-11-17 — Không gian Giáo viên

- Tài khoản chỉ có role `TEACHER` dùng sidebar tinh gọn theo ba nhóm: Tổng quan, Giảng dạy và Cá nhân; tài khoản đa vai trò tiếp tục dùng sidebar đầy đủ.
- Chuẩn hóa bảy route `/teacher/*` cho Dashboard, Điểm danh, Lịch dạy, Việc cần xử lý, Học viên của tôi, Thông báo và Hồ sơ giáo viên; các URL giáo viên cũ vẫn redirect để giữ tương thích.
- Dashboard giáo viên tổng hợp lịch hôm nay/buổi tiếp theo, hàng chờ xác nhận, thông báo mới, số lớp và số học viên đang phụ trách từ các API có data scope hiện hành.
- Tái sử dụng luồng Lớp học & Điểm danh, Chờ GV xác nhận, Thông tin Học viên & Buổi học và Thông báo; mỗi nghiệp vụ được tách thành trang chuyên biệt, không thay đổi logic điểm danh.
- Thêm `GET/PATCH /api/v1/teachers/me`; giáo viên chỉ được tự cập nhật email và số điện thoại của hồ sơ liên kết, mọi thay đổi được ghi AuditLog.
- Xác minh thành công: backend typecheck; frontend production build; 5/5 unit test teachers; `git diff --check`; browser desktop 1440×900, tablet 732px và viewport hẹp 627px. Frontend lint bị chặn vì repository chưa có ESLint config; build còn cảnh báo bundle lớn hiện hữu.

## 2026-11-17 — Chuẩn hóa Gói học Kaiwa/JLPT

- Kaiwa `Gói học` và JLPT `Gói SP` cùng dùng `Enrollment.package_id -> Package`; bổ sung `Enrollment.course_code` cho JLPT `Mã khóa học`.
- Import/backup workbook, API tạo-sửa học viên và giao diện hai tab Học viên/Chăm sóc dùng cùng contract; `level` chỉ còn trình độ/legacy.
- Thêm migration bảo toàn Mã khóa học cũ trước khi relink package JLPT theo Gói SP. Migration chưa chạy trên database hiện tại do lịch sử migration đang lệch.
- Prisma schema format + validate đạt; generate bị khóa DLL bởi process đang chạy và sẽ được chạy lại sau khi giải phóng file.

## 2026-11-13 — Tái thiết kế và hardening Trung tâm Lịch sử hoạt động

- Tái cấu trúc trang `/activity-logs` từ một file 2.291 dòng thành trang điều phối gọn hơn cùng component KPI, điều khiển ngày và hook debounce chuyên biệt.
- Bổ sung giao diện light-theme hiện đại theo token primary blue: bốn KPI, module chips, filter chips, refresh timestamp, bảng desktop 7 cột, card mobile và modal responsive.
- Lưu tab/page/pageSize/từ khóa/filter/ngày trong URL; tìm kiếm debounce 400ms; mặc định 7 ngày và hỗ trợ Hôm nay/7/30 ngày/tùy chỉnh.
- Đồng bộ contract phân trang server cho audit/login/sync/backup; backup hiển thị một dòng mỗi batch; sync detail có retry và rollback theo quyền.
- Thêm CSV export server-side cho toàn bộ dữ liệu đã lọc của từng view, data scope theo role và timestamp UTC+7.
- Thêm schema Zod, data scope ADMIN/MANAGE/CS, login audit ADMIN/MANAGE, chặn TEACHER, thống kê hôm nay theo `Asia/Ho_Chi_Minh`.
- Thêm retention 30 ngày chạy 02:30 hằng ngày, system actor dành riêng và một audit tổng hợp; file sao lưu vật lý được giữ nguyên.
- Thêm Prisma indexes/migration cho audit/login/sync history; migration chưa được chạy trên database.
- Cập nhật OpenAPI và tài liệu API cho activity logs cùng sync/backup history.
- Xác minh thành công: backend typecheck; 14/14 backend tests; frontend production build; 14/14 frontend feature tests; browser desktop/tablet/mobile. Frontend lint bị chặn vì repository chưa có ESLint config.

## 2026-11-10 — Đổi nhãn Backup thành Sao lưu

- Việt hóa nhãn hiển thị liên quan đến sao lưu Sheet/Excel trong menu, breadcrumb, trang sao lưu, cấu hình, modal và lịch sử hoạt động.
- Giữ nguyên URL, API, identifier kỹ thuật, dữ liệu, quyền, lịch chạy và tên file xuất hiện tại.
- Đã triển khai bố cục được duyệt: thống kê gọn, nhóm có số lượng, bộ lọc phụ thu gọn, bảng 6 cột và dòng mở rộng.
- Tái sử dụng PageHeader/Button; bổ sung điều khiển feature dùng chung, menu portal có phím Escape/mũi tên và trả focus; giữ nguyên callback và điều kiện quyền.
- Lịch sử gom số liệu, form nhóm nâng cao thu gọn, footer sao lưu cố định; phần kết nối giảm màu và hỗ trợ xuống dòng.
- Không chạy tác vụ đồng bộ/sao lưu thực tế. Kiểm thử trình duyệt bị chặn do kết nối CDP timeout; chưa xác minh responsive trực tiếp.
- Nâng cấp diện mạo thành “Trung tâm vận hành dữ liệu”: header navy/indigo, bốn KPI pastel, màu nhận diện theo luồng và viền trái từng dòng; vùng chi tiết luôn xếp một cột.
- Bỏ tab ngang Đồng bộ bị trùng với submenu sidebar. 9/9 kiểm thử UI hồi quy và frontend production build đạt; build còn cảnh báo chunk lớn hiện hữu.
- Theo phản hồi tiếp theo, bỏ viền dọc màu và dòng chi tiết xổ xuống; đưa Kết nối/Nơi lưu và Phạm vi thành cột riêng, rút cột Tự động còn công tắc và đổi header sang xanh nhạt.

## 2026-10-11 — Đối soát điểm danh: giáo viên phụ trách và hàng chờ chính xác

- Trang **Đối soát điểm danh** bổ sung cột **Giáo viên**, lấy từ danh sách `ClassTeacher` đang active của lớp; không dùng tài khoản đã thao tác điểm danh để tránh nhầm khi Admin/Manage hỗ trợ nhập thay.
- Chuẩn hóa hàng chờ theo dữ liệu hai phía: Chờ CSKH chỉ nhận `teacher_status` đã có / `cs_status` chưa có; Chờ GV theo chiều ngược lại. Bản ghi chưa có ý kiến từ cả hai bên không còn lọt vào hàng chờ hoặc KPI.
- Tách cột và thao tác theo từng bộ lọc: Chờ CSKH có duyệt theo GV hoặc ghi nhận khác; Chờ GV chỉ thể hiện kết quả CSKH và trạng thái chờ giáo viên. Duyệt hàng loạt chỉ hiện trong Chờ CSKH.
- Bổ sung integration test cho invariant hai bên, thống kê và dữ liệu giáo viên phụ trách. Backend typecheck và frontend production build pass; suite reconciliation còn 2 lỗi fixture/teardown đã có trước thay đổi.

## 2026-10-06 — Audit actor cho điểm danh tự động

- Theo xác nhận của user, scheduler sử dụng tài khoản audit riêng `auto-attendance@system.invalid`, tạo idempotently khi cần, không gán user ID=1.
- Tài khoản inactive, roles rỗng, password marker không phải hash đăng nhập; nếu identity dành riêng bị thay đổi thành tài khoản khác thì từ chối sử dụng.
- Session và Attendance ghi nhận cùng actor hệ thống. Không tự cấp quyền hoặc sửa tài khoản trùng email.
- Backend typecheck pass; 21/21 integration tests pass trên database test cô lập, gồm audit actor và login trả 403.
- Không thay đổi retry FAILED, lịch sử migration, cấu hình Redis hay database đang dùng.


## 2026-09-22 — Mở Rộng Form Thêm Mới & Chỉnh Sửa Học Viên Đầy Đủ Các Cột Sheet 1 & Chuẩn Hóa Lịch Học

- **Mở Rộng Form Thêm Mới & Chỉnh Sửa Học Viên (`/students`):**
  - Mở rộng giao diện modal lên kích thước lớn (`size="2xl"`, tối đa `max-w-4xl`) chia làm 4 tab nghiệp vụ chuyên biệt:
    1. **1. Hồ sơ & Liên hệ:** Mã học viên, Họ và tên, Giới tính, Ngày sinh, Số điện thoại, Email, Zalo UID, Nghề nghiệp, Trường học, Họ tên & SĐT Phụ huynh, Ghi chú cá nhân.
    2. **2. Khóa học & Tài chính:** Nội dung khóa học, Trình độ (N5..N1, Kaiwa), Sale phụ trách, Trạng thái học viên, Ngày nộp học phí, Trạng thái thanh toán, Tổng số buổi, Số buổi còn lại (hỗ trợ nhập âm nợ), Mô hình lớp, Ghi chú sale.
    3. **3. Lớp học & Lịch học:** Tên lớp học, Giáo viên phụ trách, Trạng thái gói, Ngày bắt đầu, Ngày kết thúc, cùng 3 trường lịch học chuẩn hóa (**Giờ học**, **Lịch học**, **Thời lượng**).
    4. **4. Báo cáo & CSKH:** Đường dẫn báo cáo học tập Google Docs/Sheets, Lịch hẹn gọi CSKH, Điểm nóng/Vấn đề gấp, Ngày bàn giao, Ngày tạo tài khoản, Trao đổi với HV/PH, Chăm sóc sau khóa học.
  - Hỗ trợ thanh điều hướng Bước (Quay lại / Tiếp theo) và tự động nạp đầy đủ dữ liệu khi mở chỉnh sửa học viên có sẵn.
  - Backend xử lý lưu/cập nhật đồng thời qua Prisma Transaction giữa `Student`, `Enrollment`, `Class`, `ClassSchedule` và `EnrollmentClass`.

- **Chuẩn Hóa Tiêu Đề Cột & Tinh Gọn Cột Lịch Học:**
  - Quy chuẩn toàn bộ tiêu đề cột: Chỉ viết hoa chữ cái đầu và in đậm (Sentence case + bold).
  - Tinh gọn 6 cột lịch học phức tạp thành đúng 3 cột: `Giờ học`, `Lịch học`, `Thời lượng`.

## 2026-09-22 — Chuẩn Hóa Danh Sách Học Viên Theo Đúng Cấu Trúc Sheet 1 Phân Chia 2 Tab (Học Viên & Báo Cáo Học Tập)

- **Cấu Trúc 2 Tab Trên Trang Danh Sách Học Viên (`/students`):**
  - **Tab 1 — Hồ sơ Học viên (Cột A ➔ AJ):**
    - Cột A ➔ I: Định danh & thông tin liên hệ học viên, Sale/CS phụ trách, Trạng thái, Khóa học đăng ký.
    - Cột J ➔ AJ: Chi tiết học phí, số tiền đã đóng, nợ học phí, gói học, lớp học, giáo viên, lịch học (thứ, giờ, thời lượng), tiến độ số buổi (tổng buổi, đã học, còn lại, nợ buổi highlight cảnh báo âm).
    - Giữ nguyên giao diện bảng trực quan kèm Modal xem chi tiết 4 nhóm trường nghiệp vụ.
  - **Tab 2 — Báo cáo Học tập & Chăm sóc (Cột A ➔ I + Cột AK ➔ BH):**
    - Cột A ➔ I: Cố định bên trái để đối soát không bị lệch hàng khi cuộn ngang.
    - Cột AK (Báo cáo học tập): Hiển thị nút/link mở trực tiếp file Google Docs/Sheets báo cáo học tập, hỗ trợ click để dán/sửa link nhanh.
    - Cột AL (Trao đổi với HV/PH): Hỗ trợ chỉnh sửa trực tiếp dạng bảng tính Excel (Inline Edit) — click gõ nội dung, blur hoặc nhấn Enter tự động lưu ngầm vào Database.
    - Cột AM (Lịch hẹn gọi) & Cột AN (Điểm nóng): Inline edit trực tiếp trên ô + tự động sinh và đồng bộ nhiệm vụ chăm sóc (`CareTask` loại `CALLBACK` hoặc `HOT_ISSUE`) cho CS phụ trách.
    - Cột Chăm sóc sau buổi: Mặc định hiển thị `CS Buổi 1`. Tích hợp nút **"+ Thêm mốc buổi CS"** cho phép người dùng tự do thêm bất kỳ mốc buổi nào (Buổi 3, Buổi 5, Buổi 10...), tự động lưu cấu hình toàn hệ thống (`care_milestone_configs`) để tất cả tài khoản thấy cùng danh sách cột. Hỗ trợ inline edit nội dung chăm sóc sau buổi trực tiếp vào `CareLog`.
    - Cột BD ➔ BH: Chăm sóc sau kết thúc (inline edit), Ngày kết thúc, Ngày bàn giao, Tháng nộp HP, Ngày tạo tài khoản.
- **Backend & Database:**
  - Cập nhật model `Enrollment` bổ sung các trường: `study_report_url`, `exchange_info`, `callback_note`, `hot_issue_note`, `post_course_care`.
  - Bổ sung model `CareMilestoneConfig` (`care_milestone_configs`) lưu cấu hình các mốc buổi CSKH tùy biến.
  - Thêm các API endpoints: `GET /api/v1/milestones`, `POST /api/v1/milestones`, `PUT /api/v1/enrollments/:id/care`, `PUT /api/v1/enrollments/:id/sessions/:session/care-log`.
  - Cập nhật module Import Excel: Tự động phát hiện và trích xuất link hyperlink (Google Docs/Sheets) cho cột AK, lưu thông tin trao đổi AL, ghi chú mốc buổi AO..BC vào `CareLog` và cột BD vào `Enrollment`.
- **Kiểm Thử & Xác Nhận:**
  - 14/14 tests integration module Care vượt qua thành công (100% pass).
  - Frontend TypeScript build và Vite compile sạch 0 lỗi (`dist` bundle sẵn sàng).
  - Subagent trình duyệt kiểm thử thực tế luồng tương tác: chuyển tab mượt mà, thêm cột Buổi 3 thành công thời gian thực, chụp screenshot và quay video WebP lưu lại artifact.

## 2026-09-21 — Ma trận Điểm danh Lịch Ngày, Cấu trúc Tab CSKH/Sale, Chuẩn hóa 5 Tài khoản Test & Tối ưu Giao diện

- **Ma trận Điểm danh theo Lịch Ngày (Attendance Matrix by Calendar Dates):**
  - Loại bỏ số thứ tự buổi học trừu tượng (Buổi 1, Buổi 2...), chuyển sang hiển thị trực tiếp theo **Thứ & Ngày trong lịch** (VD: `T2 01/09`, `T4 03/09`...) khớp chính xác với Sheet 3 (`3.Chấm buổi`).
  - Bổ sung bộ lọc thời gian đa dạng: Mặc định hiển thị **Tháng hiện tại**, chuyển đổi nhanh xem theo **Tuần**, **Tháng**, hoặc **Tất cả / Khoảng ngày tùy chỉnh**.
  - Cố định 11 cột thông tin học viên & lớp học bên trái: STT, Mã HV, Họ và tên, Ngày bắt đầu học, Trạng thái, Ngày kết thúc/Bảo lưu, Giờ học, Lịch học, Thời lượng, GV & Mã GV, Tên lớp.
  - Loại bỏ cột *"Chỉ số chuyên cần ĐH % và BT %"* theo yêu cầu người dùng.
  - Khắc phục triệt để hiện tượng chữ bị đè khi cuộn ngang bằng cách cố định 3 cột nhận diện (`#`, `Mã HV`, `Họ và tên`) với nền đục (`bg-white`/`bg-slate-50`) và viền đổ bóng nhẹ (`shadow-sm`).
  - Hỗ trợ điểm danh trực tiếp qua click ô: `X` (Có mặt - Xanh lá), `A` (Nghỉ phép - Vàng), `B` (Bảo lưu - Xanh dương), `C` (Nghỉ không phép - Đỏ), `D` (GV nghỉ - Tím), `E` (Lỗi kỹ thuật - Xám).

- **Tái Cấu Trúc Tab & Nghiệp vụ cho Nhân viên Chăm sóc Khách hàng (Sale & CSKH là 1):**
  - **Đồng nhất vai trò:** Xác nhận nghiệp vụ *"Sale với nhân viên chăm sóc khách hàng là 1"*, sử dụng vai trò hệ thống `CS`. Cột `Sale` trong Sheet 1 ánh xạ trực tiếp với tài khoản đăng nhập (Email/Username) mà Admin tạo.
  - **Tab Quản lý ghi danh (`/enrollments`) ➔ Ma trận Điểm danh theo Sale:**
    - Tự động lọc học viên theo tài khoản Sale của người đang đăng nhập nếu là vai trò `CS`.
    - Cung cấp dropdown chọn Sale nếu tài khoản có vai trò `ADMIN` hoặc `MANAGE`.
    - Hỗ trợ chuyển đổi linh hoạt giữa chế độ **Ma trận Điểm danh (Matrix View)** và **Bảng Ghi danh (Table View)**.
  - **Tab Danh sách học viên (`/students`) ➔ Chuẩn Cấu Trúc Sheet 1 (`1.Chăm sóc`):**
    - Hiển thị đầy đủ 28 cột dữ liệu nghiệp vụ của Sheet 1.
    - Nổi bật cảnh báo **Nợ buổi âm** (ví dụ `-1`, `-2` buổi) bằng huy hiệu đỏ đậm (`bg-red-100 text-red-800 border-red-300 font-extrabold`).
    - Tự động lọc danh sách học viên theo Sale phụ trách nếu tài khoản đăng nhập là `CS`.
    - Tích hợp Modal xem chi tiết trọn vẹn 28 trường hồ sơ học viên.
  - **Sidebar CSKH:**
    - Tinh gọn và sắp xếp lại thứ tự menu cho CSKH: Báo cáo Thống kê (`/dashboard`) ➔ Quản lý Ghi danh (`/enrollments`) ➔ Danh sách Học viên (`/students`) ➔ Nhiệm vụ & Chăm sóc (`/care`).

- **Xóa & Tái Thiết Lập Toàn Bộ Dữ Liệu Test (5 Tài khoản Chuẩn Hóa):**
  - Đặt lại toàn bộ cơ sở dữ liệu và khởi tạo đúng 5 tài khoản test với mật khẩu chung `123456`:
    1. `admin@gmail.com` (Quản trị viên, `ADMIN` - toàn quyền quản lý).
    2. `cskh1@gmail.com` (CSKH 1 / Sale 1, `CS` - phụ trách 4 học viên: `HV_001` -> `HV_004`).
    3. `cskh2@gmail.com` (CSKH 2 / Sale 2, `CS` - phụ trách 4 học viên: `HV_005` -> `HV_008`, có nợ âm).
    4. `cskh3@gmail.com` (CSKH 3 / Sale 3, `CS` - phụ trách 5 học viên: `HV_101` -> `HV_105`, có nợ âm).
    5. `teacher@gmail.com` (Sensei Tanaka Kenji, `TEACHER` - giáo viên lớp N5 và N4).
  - Phân bổ học viên và tạo sẵn dữ liệu điểm danh thực tế tháng 9/2026 cho 2 lớp học (Lớp N5-K01 và Lớp N4-K02).
  - Cập nhật các nút đăng nhập thử nghiệm nhanh tại trang Đăng nhập (`LoginPage.tsx`).

- **Cải Thiện Giao Diện & Trải Nghiệm Người Dùng (UI/UX):**
  - Sửa lỗi tương phản màu chữ trong ô nhập email/password trên nền tối của trang Đăng nhập (`text-slate-900` trên nền trắng có viền rõ ràng).
  - Thay thế toàn bộ `alert()` / `window.confirm()` bằng hệ thống Toast thông báo hiện đại (`useToast`) và Modal chuẩn hóa có hiệu ứng làm mờ nền (backdrop blur).
  - Kiểm thử giao diện và xác minh luồng đăng nhập thực tế bằng subagent trình duyệt trên môi trường đang chạy.

- **Quy Tắc Import Excel Sheet 3:**
  - Đối soát học viên cũ: Tự động đồng bộ điểm danh theo ngày mà không hỏi lại.
  - Học viên mới từ file: Hiển thị hộp thoại xác nhận hỏi người dùng có muốn tự động tạo mới học viên và ghi danh vào lớp hay không.

## 2026-09-20 — Web & Docs: Đồng bộ Route Tiếng Anh Chuẩn & Toàn diện Giao diện Tiếng Việt

- **Chuẩn hóa URL Routing Tiếng Anh (Chỉ đường dẫn URL là tiếng Anh):**
  - Chuyển đổi toàn bộ route chính thức sang định dạng tiếng Anh chuẩn mực (RESTful / kebab-case):
    - `/login`: Đăng nhập hệ thống (hỗ trợ alias redirect từ `/dang-nhap`)
    - `/dashboard`: Báo cáo tổng quan & thống kê (hỗ trợ alias redirect từ `/tong-quan`)
    - `/care`: Chăm sóc học viên & Nhiệm vụ CS (hỗ trợ alias redirect từ `/cham-soc`)
    - `/enrollments`: Quản lý hợp đồng & ghi danh (hỗ trợ alias redirect từ `/ghi-danh`)
    - `/classes`: Quản lý danh sách lớp học (hỗ trợ alias redirect từ `/lop-hoc`)
    - `/classes/:classId/sessions`: Danh sách buổi học (hỗ trợ alias redirect từ `/lop-hoc/:classId/buoi-hoc`)
    - `/classes/:classId/sessions/:sessionId/attendance`: Phiếu điểm danh (hỗ trợ alias redirect từ `/lop-hoc/.../diem-danh`)
    - `/students`: Quản lý học viên & phụ huynh (hỗ trợ alias redirect từ `/hoc-vien`)
    - `/packages`: Quản lý gói học (hỗ trợ alias redirect từ `/goi-hoc`)
    - `/teachers`: Quản lý giáo viên (hỗ trợ alias redirect từ `/giao-vien`)
    - `/imports`: Nhập & xuất dữ liệu Excel (hỗ trợ alias redirect từ `/nhap-xuat-excel`)
    - `/settings/users`: Quản lý người dùng & phân quyền (hỗ trợ alias redirect từ `/cai-dat/nguoi-dung`)
  - Duy trì các alias redirect từ route tiếng Việt cũ để tránh lỗi liên kết bookmark.
- **Việt hóa Toàn diện Giao diện Web:**
  - `LoginPage`: Tiêu đề, nhãn email/mật khẩu, nút đăng nhập và thông báo lỗi tiếng Việt.
  - `UsersPage`: Tiêu đề "Quản lý Người dùng & Phân quyền", tiêu đề cột, badge vai trò tiếng Việt (`Quản trị viên`, `Quản lý nhóm`, `Nhân viên CSKH`, `Giáo viên`), trạng thái và các modal thao tác.
  - `PackagesPage`: Việt hóa toàn bộ bảng danh mục gói học, số buổi định mức, trạng thái và modal thêm/sửa gói.
  - `TeachersPage`: Việt hóa bảng giáo viên, phân loại giảng viên (`Giáo viên Việt`, `Giáo viên Bản ngữ`), trạng thái và form thông tin.
  - `StudentsPage`: Việt hóa bảng học viên, giới tính, thông tin liên lạc, mã định danh và modal thêm/sửa học viên.
  - `ClassesPage`: Việt hóa bảng lớp học, hình thức đào tạo (`1 kèm 1`, `Lớp nhóm`), nguồn điểm danh và modal tạo lớp.
  - `ClassSessionsPage`: Việt hóa danh sách buổi học, trạng thái (`Đã lên lịch`, `Đã hoàn thành`, `Đã hủy`) và điều hướng điểm danh.
  - `AttendanceSheetPage`: Việt hóa phiếu điểm danh buổi học, nút đánh dấu có mặt, lưu điểm danh.
  - `EnrollmentsPage`: Việt hóa bảng ghi danh, trạng thái học tập (`Chưa học`, `Đang học`, `Tạm dừng / Bảo lưu`, `Hoàn thành`, `Đã hủy`).
  - `DataTable`: Thông báo rỗng "Không có dữ liệu hiển thị".
  - `ProtectedRoute`: Thông báo "Đang tải phiên đăng nhập...".
- **Cập nhật Tài liệu Dự án:**
  - `docs/architecture/frontend.md`: Bổ sung quy định chuẩn hóa URL route tiếng Việt.
  - `docs/ui/design-system.md`: Bổ sung mục 15 — Quy ước Ngôn ngữ & Thuật ngữ Tiếng Việt (UI Glossary & Localization) ánh xạ đầy đủ Role, Status, Action.
- **Xác minh Kỹ thuật:**
  - Frontend production build thành công 100% không lỗi (`tsc -b && vite build`).

## 2026-09-20 — Phase 6: CareLog / CareTask + Dashboard Complete

- **API Contract:** Đồng bộ đầy đủ `docs/api/care.md`, `docs/api/dashboard.md` và `docs/api/openapi.yaml` cho các endpoint CareLog, CareTask và Dashboard (Summary, Attendance, Care Pivot, Tasks Overview).
- **Backend Module Care (`backend/src/modules/care/`):**
  - Quản lý nhật ký chăm sóc `CareLog` theo Enrollment, mốc buổi (`after_session_number`), kết quả (`outcome`), ghi chú (`content`); lưu lịch sử liên tục, không bị ghi đè.
  - Quản lý nhiệm vụ chăm sóc `CareTask`: hẹn gọi lại (`CALLBACK`), điểm nóng/khiếu nại (`HOT_ISSUE`), theo dõi (`FOLLOW_UP`), mức độ ưu tiên (`URGENT`, `HIGH`, `NORMAL`, `LOW`), hạn hoàn thành (`due_at`), trạng thái (`PENDING`, `DONE`, `CANCELLED`).
  - Phân quyền theo data scope: `ADMIN` toàn hệ thống, `MANAGE` trong nhóm CS được gán, `CS` chỉ xem học viên & task của mình; `TEACHER` không được xem ghi chú nội bộ CS.
- **Backend Module Dashboard (`backend/src/modules/dashboard/`):**
  - Truy vấn số liệu source-of-truth trực tiếp từ database bằng Prisma aggregations (`COUNT(DISTINCT student_id)`, group by enrollment status, attendance breakdown).
  - Ma trận Pivot Care: Thống kê số lượng theo Mốc buổi học × Kết quả phản hồi chăm sóc.
  - Tổng quan nhiệm vụ: Đếm số lượng task quá hạn (overdue), đến hạn hôm nay, trong tuần, khẩn cấp/điểm nóng.
  - Hỗ trợ bộ lọc linh hoạt: CS phụ trách, gói học, lớp học, khoảng thời gian.
- **Kiểm thử tự động Backend:**
  - Viết đầy đủ Integration Tests cho module `care` (10 tests) và `dashboard` (6 tests).
  - Vượt qua 100% test suite backend: **50/50 tests passed**.
- **Frontend Features (`frontend/src/features/care/` & `frontend/src/features/dashboard/`):**
  - `CarePage`: Gồm 2 tabs trực quan: Nhiệm vụ CS (Care Tasks) và Lịch sử Chăm sóc (Care Logs Timeline).
  - `CareLogTimeline`: Hiển thị tiến trình phản hồi qua các mốc buổi học với badge outcome chuẩn màu semantic, modal thêm nhật ký phản hồi nhanh.
  - `CareTaskList` & `CareTaskModal`: Danh sách nhiệm vụ với bộ lọc thông minh (quá hạn, hôm nay, mức ưu tiên) và thao tác nhanh (Hoàn thành, Hủy, Sửa).
  - `DashboardPage`: Tổng hợp các KPI StatCard, biểu đồ chuyên cần `AttendanceChart`, ma trận `CarePivotTable` và widget `TasksOverviewWidget`.
  - Tích hợp điều hướng trên Trang chủ và Router `App.tsx`.
  - Build production frontend thành công 100% không lỗi (`tsc -b && vite build`).

## 2026-09-20 — Phase 5: Excel Import/Export Sheet 1 + Sheet 3 Complete

- **Database:** Bổ sung trường `external_id String? @unique` vào model `Student` trong Prisma schema theo quyết định Q-001 để ánh xạ chính xác định danh bất biến giữa Sheet 1, Sheet 3 và Database.
- **Contract-First API:** Cập nhật `docs/api/openapi.yaml` và `docs/api/imports.md` cho toàn bộ các endpoint của `/api/v1/imports` (upload, preview, mapping, validate, confirm, errors, batches, templates, exports).
- **Backend Module (`backend/src/modules/imports/`):**
  - Tích hợp `exceljs` và `multer` cho quy trình xử lý file Excel an toàn.
  - Xây dựng thuật toán nhận diện tự động cột (auto-mapping) cho Sheet `1.Chăm sóc` và Sheet `3.Chấm buổi`.
  - Bộ kiểm tra (validation engine) phát hiện trùng lặp ID, sai format ngày/giờ, số buổi không hợp lệ, mã điểm danh bất thường, không silent-fix.
  - Chiến lược thực thi theo lô (batch-safe) cách ly từng dòng: dòng hợp lệ được import vào DB, dòng lỗi ghi nhận vào `ImportRow` trạng thái `FAILED`.
  - Hỗ trợ tải báo cáo lỗi Excel chi tiết (`GET /api/v1/imports/:importId/errors?download=true`), tải template mẫu và xuất dữ liệu đối soát học viên/điểm danh.
  - Phân quyền: Chỉ `ADMIN` và `MANAGE` được upload/import (theo Q-004); `CS` chỉ xem/tải template.
  - Ghi nhận `AuditLog` cho mọi đợt import thực hiện.
  - Bộ integration test 14/14 tests passed (100% pass toàn bộ 34 tests trong hệ thống).
- **Frontend Feature (`frontend/src/features/imports/`):**
  - Wizard 4 bước trực quan: Chọn loại & Upload file -> Xem trước & Ánh xạ cột -> Báo cáo kiểm tra -> Kết quả & Tải lỗi.
  - Bảng lịch sử các đợt import (`ImportHistoryTable`) hiển thị trạng thái, số dòng thành công/thất bại và tải log lỗi.
  - Tính năng xuất dữ liệu đối soát trực tiếp trên giao diện.
  - Tuân thủ design token, responsive desktop/tablet/mobile, build thành công bundle production.

## 2026-09-18 — Phase 1: Database Schema Complete

- Implement toàn bộ cấu trúc Schema theo `data-model-core.md` và `data-model-zalo-care.md`.
- Khai báo 22 Model hoàn chỉnh (Auth, Learning, Attendance, Care/Automation, v.v.).
- Ràng buộc cấu trúc theo đúng nghiệp vụ (Ví dụ: `@@unique([enrollment_class_id, class_session_id])` cho `Attendance`).
- Khởi tạo script seed (`seed.ts`) để tạo `ADMIN` mặc định.
- Vượt qua `npx prisma validate` thành công.

## 2026-09-18 — Phase 0: Foundation & Bootstrap Complete

- Khởi tạo thư mục và cấu trúc project chuẩn theo kiến trúc Modular Monolith (Backend) và Feature-first (Frontend).
- Tách biệt cấu hình môi trường `.env` thành 3 phần rõ ràng: Root (cho Docker infra), Backend và Frontend.
- Thiết lập Backend: Node.js, Express, TypeScript, Zod environment validation, Prisma client, Central Error Handler.
- Thiết lập Frontend: React (Vite), Tailwind CSS, React Router, cấu hình Design Token (tokens.css, globals.css).
- Khởi tạo file Docker Compose cho MySQL và Redis.
- Khởi tạo OpenAPI contract tại `docs/api/openapi.yaml` với `/health` endpoint.

## 2026-09-18 — Documentation baseline

- Chuẩn hóa tài liệu để AI coding agent làm theo phase.
- Thêm project structure, UI design system, frontend architecture, API conventions, testing quality gate.
- Thêm phase execution protocol, status tracking, open-question workflow và prompt mẫu.
- Thêm project-local frontend skill.

## 2026-09-18 — API contract layer

- Thêm `docs/api/` với OpenAPI contract và tài liệu theo module.
- Chuyển workflow API sang contract-first: docs → backend/test → frontend.
- Cập nhật Agent rules, project structure và các phase để bắt buộc đồng bộ API docs.

## 2026-09-18 — Structure review merge

- Review bộ `quan-ly-hoc-vien-docs` tham khảo và chỉ lấy các phần phù hợp với architecture hiện tại.
- Thêm `.antigravityrules` làm entrypoint ngắn cho Antigravity; giữ `Agent.md` là source of truth đầy đủ.
- Thêm `docs/product/business-rules.md` làm registry tập trung cho rule CHỐT/CHƯA CHỐT.
- Thêm `docs/architecture/code-conventions.md` cho naming, validation, transaction, error/logging, dependency/Git conventions.
- Thêm ADR `docs/decisions/001-tech-stack.md`.
- Thêm project-local skills `prisma-schema-guard` và `api-module-scaffold`, đã adapt sang TypeScript + Modular Monolith feature-first + OpenAPI contract-first.
- Không nhập cấu trúc layer-first/JavaScript từ bộ tham khảo vì mâu thuẫn decision hiện tại.

## 2026-09-18 — Docs cleanup

- Tổ chức lại `docs/` theo nhóm `product/`, `architecture/`, `ui/`, `api/`, `delivery/`, `phases/`, `decisions/`, `templates/`, `data/` để giảm file rải ở root.
- Bỏ `CLAUDE.md`; `Agent.md` + `.antigravityrules` là entrypoint cho AI coding trong project này.
- Gộp checklist chuẩn bị và pre-code vào `docs/delivery/checklists.md`.
# 2026-11-20 — Tách nhóm chăm sóc Kaiwa/JLPT

- Thêm `program_type` và unique scope theo chương trình cho quan hệ Zalo/LINE; migration giữ nguyên dữ liệu legacy.
- Thêm engine mẫu tên và AppSetting có audit, preview, optimistic update; Admin/Manage mới được lưu.
- Matcher tạo coverage theo học viên + chương trình + CSKH, giữ manual, báo trùng để chọn thủ công, không dùng trình độ để chọn nhóm.
- Cô lập automation send target theo chương trình và kiểm tra lại group relation ngay trước gửi.
- Đồng bộ bảng Liên kết học viên/Danh bạ nhóm, filter chương trình và responsive table contract; QA local không gửi tin thật.
