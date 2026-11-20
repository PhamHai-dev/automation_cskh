# Audit bố cục và căn cột toàn frontend — 2026-11-20

Theo yêu cầu rà toàn bộ table và thống nhất tiêu đề cột căn giữa, đã duyệt source 38 bảng HTML và 155 định nghĩa cột trong 32 file frontend. Danh mục gồm bảng trong modal và các nhánh điều kiện. Không sửa business rule, schema, API contract, quyền hoặc gửi tin.

## Quy tắc áp dụng

| Thành phần | Căn lề | Xuống dòng |
| --- | --- | --- |
| Mọi tiêu đề cột | Giữa ngang/dọc | Không tự vỡ từ; giữ các dòng nhóm ngày/tháng có chủ đích |
| Tên, lớp/gói, email/link, mô tả, ghi chú, lý do, giá trị diff hỗn hợp | Trái | Theo từ; chuỗi liền dài được ngắt khi cần |
| STT, checkbox, mã/ID ngắn, SĐT, ngày/giờ, lịch, loại, trạng thái | Giữa | Mã/ngày/badge giữ một dòng |
| Số lượng, tiền, thời lượng, điểm, tỷ lệ, số buổi âm | Phải | Một dòng, tabular-nums |
| Thao tác, switch, ô điểm danh theo ngày | Giữa | Nút/icon không co; nhóm flex đi theo căn ô |

Quy chuẩn tại `docs/ui/design-system.md`. `Column.align` và `Column.wrap` là bắt buộc. Bảng riêng có `data-table`, cell có `data-align`/`data-wrap`, header có scope. CSS chung ở `frontend/src/styles/tables.css`. Ô ma trận nhiều phần giữ bố cục riêng bằng `data-cell-layout="custom"`.

## Lỗi và sửa chữa

1. Bỏ header text-left/text-right và override đa kênh; tách căn header khỏi body.
2. Đồng bộ nhóm flex/nút với căn ô, tránh căn giữa cell nhưng nút dồn sang phải.
3. Chuyển số tổng/buổi/điểm từ giữa sang phải; đồng bộ numeric input, giữ dấu âm và đơn vị.
4. Giữ mã, SĐT, ngày, trạng thái và nhóm thao tác trên một dòng; không nowrap cả bảng.
5. Sửa container chọn ghi danh và thống kê sao lưu trong modal bị overflow-hidden cắt cột.
6. Dưới 640px bỏ offset ghim ngang của cột cố định để không che hết viewport; giữ sticky dọc và offset desktop.
7. Báo cáo học tập mobile: nhãn/value thông tin học viên tách hàng, tránh chen lẫn nội dung.
8. Thêm title cho 20 giá trị bị ellipsis trong file có bảng. Giữ truncate có chủ đích cho cột cố định; văn bản dài vẫn được wrap để đọc.
9. Chuẩn hóa nhãn tiếng Việt: Mã nhân viên / ID, Họ và tên / Email, Loại giáo viên, Điều kiện kích hoạt, Đã gửi / Tổng số, Lượt chăm sóc, Tỷ lệ tích cực, Nhiệm vụ hoàn thành, Tên nhóm chăm sóc gợi ý. Đặt tên cột thao tác rỗng và nhãn truy cập header chọn học viên.

## Kiểm chứng

- `node --test frontend/tests/table-layout.test.cjs frontend/tests/data-management.test.cjs frontend/tests/activity-logs.test.cjs`: **17/17 pass**. Guard AST quét toàn frontend, kiểm tra contract từng bảng/cột và scope header. Render thật DataTable kiểm tra alignment, wrap, loading/empty.
- `npm run build` tại frontend: TypeScript và Vite pass. Còn cảnh báo bundle lớn hiện hữu.
- `npm run lint`: bị chặn vì repository thiếu ESLint config; không ghi nhận lint pass.
- Chrome/Playwright với fixture tại 1440/768/390px: đo computed alignment header/body, page overflow và control vượt biên cell; dùng tên/email/link dài, số âm, tổng lớn, badge, nhóm nút.
- 11 component/view qua harness: DataTable, JLPT, AttendanceMatrix quick/detailed/stats/log, CarePivotTable, AtRiskTable, CSLeaderboard, CareGroupSyncReportCard (linked/unlinked), ImportHistoryTable. Không ghi nhận alignment/control/page-overflow/page-error sau sửa trong fixture này.
- Product dùng route thật + API giả lập: nhân viên, giáo viên, gói, học viên, báo cáo chăm sóc/học tập, lớp theo học viên/lớp và quick/detailed/stats, kịch bản/broadcast, đối soát các tab, hoạt động các tab, nguồn/lịch sử đồng bộ, preview/chi tiết sync, nguồn/lịch sử sao lưu, liên kết đa kênh, cấu hình cột, lịch dạy và thông tin học viên giáo viên. Tab hoạt động đổi sang card trên tablet/mobile theo thiết kế. Một số tab đối soát chạy empty fixture; không coi là test luồng ghi dữ liệu.
- Bảng account kiểm tra thêm 1280px: tìm/lọc, loading/empty/error/retry, trạng thái/nút và mở cài đặt pass.

## Giới hạn

API local thật ở học viên/lớp/sao lưu/liên kết còn trả 500 do database không khớp schema, đã tồn tại trước task. Vì vậy có dùng fixture để kiểm tra layout; chưa xác nhận mọi luồng trên dữ liệu thật hoặc mọi chuỗi có thể xuất hiện. Không chạy migration/reset DB.

Toàn bộ bảng đã review source; browser chỉ xác nhận những view/state liệt kê ở trên. Các modal commit/rollback/import chưa được kích hoạt trên dữ liệu thật. Ảnh và script QA nằm trong `scratch/table-audit/` và `scratch/line-transport/`. Trang harness tạm đã dọn khỏi frontend.

## Danh mục source đã rà

| File | Table HTML | Định nghĩa cột |
| --- | ---: | ---: |
| frontend/src/components/common/DataTable.tsx | 1 | 0 |
| frontend/src/pages/admin/UsersPage.tsx | 0 | 6 |
| frontend/src/features/activity-logs/pages/ActivityLogsPage.tsx | 3 | 28 |
| frontend/src/features/attendance/components/AttendanceExcelImportPanel.tsx | 2 | 0 |
| frontend/src/features/attendance/pages/AttendanceReconciliationPage.tsx | 0 | 22 |
| frontend/src/features/attendance/pages/MyTeachingSessionsPage.tsx | 1 | 11 |
| frontend/src/features/attendance/pages/TeacherStudentInfoPage.tsx | 1 | 0 |
| frontend/src/features/automation/components/BroadcastCampaignsPanel.tsx | 0 | 5 |
| frontend/src/features/automation/pages/AutomationWorkflowDetailPage.tsx | 1 | 0 |
| frontend/src/features/automation/pages/AutomationWorkflowsPage.tsx | 0 | 7 |
| frontend/src/features/classes/components/AttendanceMatrix.tsx | 4 | 0 |
| frontend/src/features/classes/pages/ClassesPage.tsx | 3 | 0 |
| frontend/src/features/dashboard/components/AtRiskTable.tsx | 1 | 0 |
| frontend/src/features/dashboard/components/CarePivotTable.tsx | 1 | 0 |
| frontend/src/features/dashboard/components/PerformanceCharts.tsx | 1 | 0 |
| frontend/src/features/imports/components/BulkPasteLinksModal.tsx | 1 | 0 |
| frontend/src/features/imports/components/CsSheetBackupPanel.tsx | 3 | 0 |
| frontend/src/features/imports/components/GoogleSheetSyncPanel.tsx | 2 | 0 |
| frontend/src/features/imports/components/ImportApprovalQueue.tsx | 1 | 0 |
| frontend/src/features/imports/components/ImportHistoryTable.tsx | 1 | 0 |
| frontend/src/features/imports/components/ImportWizard.tsx | 2 | 0 |
| frontend/src/features/imports/pages/SyncHistoryDetailPage.tsx | 2 | 0 |
| frontend/src/features/imports/pages/SyncPreviewPage.tsx | 1 | 0 |
| frontend/src/features/omnichannel/components/CareGroupSyncReportCard.tsx | 2 | 0 |
| frontend/src/features/omnichannel/pages/OmnichannelAccountsPage.tsx | 0 | 6 |
| frontend/src/features/omnichannel/pages/OmnichannelStudentLinksPage.tsx | 1 | 0 |
| frontend/src/features/packages/pages/PackagesPage.tsx | 0 | 5 |
| frontend/src/features/students/pages/JlptAttendanceReportPage.tsx | 1 | 0 |
| frontend/src/features/students/pages/StudentsPage.tsx | 0 | 58 |
| frontend/src/features/students/pages/StudentStudyReportPage.tsx | 1 | 0 |
| frontend/src/features/teachers/pages/TeachersPage.tsx | 0 | 7 |
| frontend/src/pages/admin/components/SheetBackupAdminConfigCard.tsx | 1 | 0 |
