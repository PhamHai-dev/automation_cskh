# Rà soát giao diện, component và icon — 2026-11-20

Theo yêu cầu người dùng kiểm tra toàn giao diện, đã rà component nền tảng và source các feature, sau đó kiểm tra trên product đang chạy. Phạm vi gồm desktop, tablet, mobile, header/sidebar, bộ lọc, bảng, modal, icon, thông báo và nội dung nhiều phần. Giữ nghiệp vụ, quyền truy cập và quy tắc căn header/body đã chốt.

## Lỗi có bằng chứng và cách sửa

| Vùng | Lỗi tái hiện | Thay đổi |
| --- | --- | --- |
| Header ứng dụng | Breadcrumb + search + profile vượt viewport ở 768/1024px | Breadcrumb co giãn, search từ desktop, tên/email profile từ màn hình rộng; giữ avatar và thao tác tài khoản |
| Báo cáo học tập/học viên | Hàng ba action đẩy nút thêm ra ngoài mobile | PageHeader và nhóm action con wrap, bỏ shrink ép toàn hàng |
| Chiến dịch gửi tin | Thanh search/status/actions vượt màn hình ở 768/1024px | FilterBar chung, Search/Select có label và grid responsive; actions tự xuống hàng |
| Chờ đối soát / học viên giáo viên | Nhóm gạt cột/lọc có chiều cao và chiều rộng cố định làm mất nút làm mới | Giới hạn theo vùng chứa, wrap nhóm và rút gọn nhãn |
| KPI/icon | SVG bị flex-shrink thành hình hẹp; selector Lucide trong Tailwind layer bị purge | CSS icon ngoài layer purge, không co; kích thước icon button/form/tab thống nhất |
| Popup/menu cột | Popup mở gần cuối màn hình vượt cả chiều dọc, không chỉ chiều ngang | Đo trigger/menu và đặt trong viewport, cập nhật khi scroll/resize; max-height và cuộn riêng |
| Modal | Các bản tự dựng khác màu/khung/padding; form dài không có giới hạn chiều cao | Dùng Modal chung, portal, layer 140, body cuộn theo 100dvh; header/footer không co |
| Modal lồng nhau | Escape/scroll/focus chưa có cơ chế chung | Chỉ modal trên cùng xử lý phím, trap và trả focus về opener; giữ scroll lock đến khi đóng hết |
| Hướng dẫn QR | Text/strong nằm trực tiếp trong flex khiến mỗi đoạn thành một cột | Mỗi câu là một span văn bản cạnh số thứ tự; giữ xuống dòng tự nhiên |
| PIN LINE | Sáu ô 44px + gap không vừa màn hình nhỏ | Grid sáu cột min-width 0, giữ đủ sáu số ở 320px |
| Form | Control/button khác chiều cao, label trùng sinh ID trùng | Mặc định 40px; useId và liên kết feedback/aria-invalid |
| Màu | Nền/chữ/viền gray/slate và provider ghi rải rác; các lớp token có `/20` không sinh CSS đúng | Token trung tính/trạng thái/provider, RGB channel hỗ trợ alpha; chữ phụ đậm hơn |
| Icon chức năng | Emoji lẫn Lucide, check SVG tự vẽ, logo Google trùng source | Lucide cho chức năng; logo provider ở BrandIcons; giữ emoji trong tin nhắn và phản ứng |

## Quy tắc hiện hành

Chi tiết ở `../../ui/design-system.md`.

- Button 32/40/44px theo sm/md/lg; Input/Select 40px, bố cục compact inbox giữ 32–36px. Nút không co chữ hoặc icon; hàng action có thể wrap.
- Icon Lucide 16px cho action/form/tab, 20px cho điều hướng, 24px trở lên cho trạng thái lớn. Màu trạng thái semantic, nền surface và viền border thống nhất. Logo provider giữ màu riêng nhưng có cùng catalog.
- Mọi header bảng vẫn giữa; giá trị text trái, định danh/trạng thái/thao tác giữa, số phải theo contract hiện có. Nhân viên CSKH trên bảng tài khoản vẫn giữa; cột Giới hạn sử dụng vẫn được bỏ.
- Form/modal có tên truy cập, ID riêng, feedback gắn đúng control, Escape/focus/scroll đúng trong hộp thoại lồng nhau.
- Không dùng ẩn overflow toàn trang để che nút bị tràn. Bảng/tab dài cuộn nội bộ; text dài được wrap hoặc có title/xem chi tiết khi truncate chủ đích.

## Kiểm chứng trên product

Chrome/Playwright chạy frontend 5173/backend 3000. Kiểm tra 48 trang/tab dưới đây ở **1440, 1024, 768, 390px**, tổng **192 lượt đo**. Sau lượt mở rộng, sửa riêng lỗi toolbar campaign/pending reconciliation rồi chạy lại sáu route liên quan; kết quả tổng hợp cuối **không có phần tử điều khiển vượt viewport ngoài vùng cuộn chủ đích, nút clipped, icon méo, pageerror hoặc API 500 trong phạm vi đo**.

| Nhóm | Trang/tab đã chạy |
| --- | --- |
| Dashboard | Tổng quan, Chăm sóc, Chuyên cần, Chuyên cần JLPT, Hiệu suất |
| Học viên/lớp | Học viên, Báo cáo chăm sóc, Ghi danh, Lớp, Báo cáo học tập học viên thật |
| Chăm sóc/đối soát | Nhiệm vụ, Nhật ký, Thông báo, Xung đột, Chờ đối soát, Lịch sử |
| Đa kênh | Tài khoản, Danh bạ, Nhóm lớp, Liên kết học viên, Hộp thư, Zalo monitor |
| Automation | Kịch bản, Chiến dịch gửi tin, Chi tiết kịch bản thật |
| Dữ liệu/hoạt động | Đồng bộ, Sao lưu cấu hình/lịch sử/kết nối, Import, Hàng đợi; audit/sync/backup/login logs |
| Quản trị | Users, Teachers, Packages, Settings hub, Auto-attendance config, Sheet backup config |
| Giáo viên | Dashboard, Điểm danh, Lịch dạy, Việc cần xử lý, Học viên, Thông báo, Hồ sơ |

Kiểm chứng bổ sung:

- Hai tài khoản CSKH thật (5/6) mở các trang tài khoản/danh bạ/nhóm/liên kết/hộp thư ở mobile. Không tạo QR provider hoặc gửi tin thật.
- Bảy trường hợp modal (dài/lồng nhau, OA, bảo mật, nhiệm vụ, QR LINE, PIN LINE, QR Zalo) × năm viewport 1440/1024/768/390/320: bounds, controls, Escape, focus, scroll lock và toast dài. Đây là fixture API, không chứng minh kết nối provider.
- Product tạo tài khoản Zalo/LINE OA/LINE cá nhân, thông báo và popup cột: mở/đóng/đo ở năm viewport, không submit. Login/demo popup cũng qua năm viewport và trả focus sau Escape.
- Kiểm thử fixture đã có: account loading/empty/partial-error/retry/action visibility; friends/groups/class-linked filters và retry; ADMIN/CS rules preview/cancel; inbox ALL/ZALO/LINE, composer, dòng dài, draft khi lỗi, response cũ, realtime giả lập và link cũ. Những thao tác ghi đều được mock, không gửi ra provider.
- `node --test frontend/tests/*.test.cjs`: **31 pass**. Ba regression cases mới kiểm tra ID/validation association, Tailwind color alpha compilation, catalog icon toàn source.
- `npm run build`: TypeScript + Vite đạt. `npm run lint` vẫn bị chặn vì repo chưa có ESLint config, không ghi nhận lint pass.

## Giới hạn và bằng chứng

- Browser xác nhận những route/state/data nêu trên; không khẳng định mọi chuỗi dữ liệu hoặc mọi modal nghiệp vụ chưa có dữ liệu đều đã được kích hoạt. Không thực hiện commit import, rollback, xóa, gửi campaign hoặc thay dữ liệu nghiệp vụ.
- Một lượt capture mở rộng bị timeout tải font Google. Đã chạy lại bằng font fallback của ứng dụng và chặn request font ngoài để cố định phép đo; các lượt 33 trang ban đầu và phần lớn fixture cũng đã chạy với font web khi tải được. Không coi lỗi font ngoài là API 500 hay delivery failure.
- Không sửa API/schema/backend, không restart phiên kênh hoặc bật worker. Đây là tác vụ UI trong phase hiện tại, không thay nghiệm thu automation production.
- Script, screenshot và JSON tại `scratch/ui-review-20261120/`; kết quả tổng hợp `final-results.json`, modal `interaction-results.json`. Harness tạm đã sao lưu vào scratch và dọn khỏi frontend trước build cuối. Các thư mục scratch chứa dữ liệu thật không được commit.
