# 10 — Bảng kiểm bao phủ khảo sát

_Cập nhật 2026-10-24. Đây là kiểm kê **tài liệu và bằng chứng**, không phải báo cáo nghiệm thu hay tỷ lệ test pass._

<a id="quy-uoc"></a>
## 1. Quy ước và giới hạn chung

- **S** = schema được mô tả trong [03](03-tu-dien-du-lieu.md), quan hệ trong [04](04-quan-he.md). Không đồng nghĩa mọi writer/reader đã được truy vết.
- **C** = route/service/repository đã được mô tả trong [05a](05a-api-đào-tạo-và-nền-tảng.md) hoặc [05b](05b-api-chăm-soc-omnichannel.md); giới hạn từng đoạn code vẫn giữ nguyên.
- **F** = component/route frontend đã được đặc tả trong [06](06-dac-ta-man-hinh-ui.md). **Không** phải browser test.
- **H** = có quan sát API/DB lịch sử ở [08 §2](08-ma-tran-phan-quyen.md); không re-test ở lượt hoàn thiện. **U** = runtime chưa kiểm chứng. Không có hàng nào đồng nghĩa đã kiểm thử toàn bộ CRUD.
- **R/C/U/D** trong cột thao tác = đọc/tạo/sửa/xóa **được mô tả theo code**, không phải đã thực thi. `—` = không có thao tác tương ứng được xác định ở bề mặt này; không tự bổ sung tính năng.
- **A/M/C/T** = ADMIN/MANAGE/CS/TEACHER, điều kiện OR. Cột role mô tả gate/scope theo code; **M/T runtime đều blocked/unverified**, A/C cũng chỉ có mẫu đọc lịch sử. Khi frontend và backend khác nhau, xem 08 và 05a/05b, không dùng gate UI thay cho authorization API.
- **State/exception** ghi đối tượng đã được tài liệu hóa, không xác nhận mọi cạnh chuyển trạng thái hay lỗi đã được chạy thử. Không đưa phần trăm bao phủ vì chưa có test inventory định lượng đáng tin.

Toàn bộ hàng dưới đây đều **chưa có full browser clickthrough/screenshot**, **chưa test ghi/xóa**, **chưa live-send external**. Các test có trên đĩa hoặc báo cáo cũ không được tự quy thành test đã chạy trong khảo sát này. Một API mang tên GET có thể có side effect (ví dụ normalize mã lớp ở [05a §6](05a-api-đào-tạo-và-nền-tảng.md#section-6)); vì thế lượt hoàn thiện này không gọi API đọc để tránh vô tình ghi DB.

<a id="ma-tran"></a>
## 2. Ma trận màn hình/chức năng × lớp bằng chứng

Mỗi hàng nối với danh mục [01](01-ban-do-chuc-nang.md) và section tương ứng trong 06. Cột S/C/F chỉ biểu thị **đã tài liệu hóa**; cột runtime thể hiện **đã quan sát hay chưa**.

| Màn hình/chức năng (06) | Schema / backend authority | Frontend | Runtime | Theo role (code) | CRUD được mô tả | Import/export | State / ngoại lệ được mô tả; còn thiếu |
|---|---|---|---|---|---|---|---|
| Login `/login` ([A1](06-dac-ta-man-hinh-ui.md#a1)) | S User/AuthSession; C [05a §1](05a-api-đào-tạo-và-nền-tảng.md#section-1) | F A1 | H auth lịch sử, không reverify | public; active user | Login/refresh/logout, không tạo account | — | schema email, disabled, session expiry; validator domain và auth M/T [CXM] |
| Home `/` ([A2](06-dac-ta-man-hinh-ui.md#a2)) | không model riêng; C auth | F A2 | U | mọi user; quick-link riêng | R/navigation | — | route redirect/gate lệch sidebar; chưa clickthrough |
| Dashboard `/dashboard` ([A3](06-dac-ta-man-hinh-ui.md#a3)) | S training/care; C [05a §13](05a-api-đào-tạo-và-nền-tảng.md#section-13) | F A3 | U | A/M/C; T bị backend guard chặn | R | — | loading/error, scope/filter KPI; correctness aggregate cần test |
| Preferences ([A4](06-dac-ta-man-hinh-ui.md#a4)) | S UserPreference; C [05a §12](05a-api-đào-tạo-và-nền-tảng.md#section-12) | F A4; 01 §4 | U | mọi user đã login | R/U/reset | — | dirty/loading/default; T thấy scope trang không được vào |
| Users / cấu hình ([A5](06-dac-ta-man-hinh-ui.md#a5)) | S User/ManageAssignment; C [05a §2](05a-api-đào-tạo-và-nền-tảng.md#section-2),10 | F A5 | U | UI A; GET users A/M | R/C/U/disable/session revoke | — | code/staff_code, roles, duplicates; không reset password trong khảo sát |
| Students `/students` ([B1](06-dac-ta-man-hinh-ui.md#b1)) | S Student/Enrollment; C [05a §3](05a-api-đào-tạo-và-nền-tảng.md#section-3) | F B1 | H list scope A/C | A/M/C; scope service | R/C/U; delete theo API đã liệt kê | nhập qua Imports, không test | filters, unique external_id, empty/error; writer mọi field chưa hoàn tất |
| Study report ([B2](06-dac-ta-man-hinh-ui.md#b2)) | S Student/Enrollment/Attendance; C [05a §3](05a-api-đào-tạo-và-nền-tảng.md#section-3) | F B2 | U | A/M/C theo route/scope | R | — | report URL, missing data; chưa verify nội dung qua browser |
| Enrollments `/enrollments` ([B3](06-dac-ta-man-hinh-ui.md#b3)) | S Enrollment/EnrollmentClass; C [05a §11](05a-api-đào-tạo-và-nền-tảng.md#section-11) | F B3 | H list A/C | A/M/C; ManageAssignment cần runtime | R/C/U/assign/transfer | qua workbook/Sheet | enum/lịch sử lớp, sale/client filters; không chạy transfer |
| Care `/care` ([B4](06-dac-ta-man-hinh-ui.md#b4)) | S CareLog/CareTask/Milestone; C [05b §2](05b-api-chăm-soc-omnichannel.md#section-2) | F B4 | H list task + 403 care-log | A/M/C log-task; T notification-only | R/C/U/complete/cancel | — | task state; scope assignee, repeat callback [CXM] |
| Care notifications ([B4](06-dac-ta-man-hinh-ui.md#b4)) | S AuditLog projection; C [05b §2](05b-api-chăm-soc-omnichannel.md#section-2) | F B4 | U | A/M chọn recipient; C/T self | R/mark-read/read-all | — | unread/read, pagination; chưa test read mutation |
| Packages `/packages` ([C1](06-dac-ta-man-hinh-ui.md#c1)) | S Package; C [05a §5](05a-api-đào-tạo-và-nền-tảng.md#section-5) | F C1 | U | A/M | R/C/U/active theo API | — | unique code, validation; không tạo/sửa thật |
| Teachers `/teachers` ([C2](06-dac-ta-man-hinh-ui.md#c2)) | S Teacher/User; C [05a §4](05a-api-đào-tạo-và-nền-tảng.md#section-4) | F C2 | U | A/M; profile T API riêng | R/C/U/provision | — | optional user linkage, duplicate, provision default; không tạo account |
| Classes `/classes` ([C3](06-dac-ta-man-hinh-ui.md#c3)) | S Class/ClassTeacher/ClassSchedule; C [05a §6](05a-api-đào-tạo-và-nền-tảng.md#section-6) | F C3 | H list A/C | A/M quản lý; staff broad; T assigned | R/C/U/assign teacher | attendance qua panel | class code/model, role scope; global CS visibility chưa phải policy defect |
| Class sessions ([C4](06-dac-ta-man-hinh-ui.md#c4)) | S ClassSession; C [05a §7](05a-api-đào-tạo-và-nền-tảng.md#section-7) | F C4 | U | A/M/C/T + class scope | R/C/U/cancel/D | — | create teacher User role validation, update khác; serializable numbering, delete confirm |
| Attendance sheet ([C5](06-dac-ta-man-hinh-ui.md#c5)) | S Attendance/EnrollmentClass; C [05a §8](05a-api-đào-tạo-và-nền-tảng.md#section-8) | F C5 | U | A/M/C/T; side/write scope | R/upsert/bulk/U/reset | Excel panel riêng | pending/matched/conflict/resolved, deleted_at; URL class/session consistency cần test |
| Reconciliation ([C6](06-dac-ta-man-hinh-ui.md#c6)) | S Attendance/AuditLog; C [05a §9](05a-api-đào-tạo-và-nền-tảng.md#section-9) | F C6 | U | page A/M/C; T teacher-flow riêng | R/mark/resolve/bulk approve | preview/confirm Excel | PENDING_CS/PENDING_TEACHER/MATCHED/CONFLICT/RESOLVED, Zod errors; chưa chạy mutation |
| My teaching sessions ([C7](06-dac-ta-man-hinh-ui.md#c7)) | S Teacher/ClassTeacher/ClassSession; C [05a §9](05a-api-đào-tạo-và-nền-tảng.md#section-9),15 | F C7 | U (T blocked) | route A/M/C/T, API A/M/T | R | — | teacherId context, no assignment, inactive profile; chưa test theo T |
| Teacher tracking ([C8](06-dac-ta-man-hinh-ui.md#c8)) | S Attendance/AuditLog; C [05a §9](05a-api-đào-tạo-và-nền-tảng.md#section-9),15 | F C8 | U (T blocked) | route A/M/C/T, API A/M/T | R/teacher-mark | Excel panel | contract không cs_note ở tracking, side validation; flow T khác ordinary attendance |
| AttendanceMatrix dùng chung ([C9](06-dac-ta-man-hinh-ui.md#c9)) | S training; C [05a §8](05a-api-đào-tạo-và-nền-tảng.md#section-8)-11 | F C9 | U | host page + selected side | R/mark/reset theo host | qua Imports | date range/cell edit/mixed-role gate; chưa click các host page |
| Omnichannel accounts ([D1](06-dac-ta-man-hinh-ui.md#d1)) | S ZaloAccount/LineAccount; C [05b §5](05b-api-chăm-soc-omnichannel.md#section-5)-6 | F D1 | U | A/M/C + account access | R/C/U/connect/archive/remove theo API | credentials backup là nhạy cảm, chưa chạy | QR/PIN/active/error/proxy; remote credentials không sử dụng |
| Security/limits dialog ([D2](06-dac-ta-man-hinh-ui.md#d2)) | S account limits/proxy; C [05b §5](05b-api-chăm-soc-omnichannel.md#section-5)-6 | F D2 | U | A/M/C account scope | R/U | — | quota/rate/proxy validation; deployment/runtime chưa test |
| Contacts ([D3](06-dac-ta-man-hinh-ui.md#d3)) | S Friend/Contact/LineFriend; C [05b §5](05b-api-chăm-soc-omnichannel.md#section-5)-6 | F D3 | U | A/M/C account scope | R/sync/friend actions | — | limits/pagination khác Zalo-LINE, empty/error; không remote sync |
| Groups ([D4](06-dac-ta-man-hinh-ui.md#d4)) | S ZaloGroup/LineGroup/members; C [05b §5](05b-api-chăm-soc-omnichannel.md#section-5)-6 | F D4 | U | A/M/C account scope | R/sync/moderation theo API | — | remote group availability, OA group/room khác personal; không suy từ counts |
| Inbox ([D5](06-dac-ta-man-hinh-ui.md#d5)) | S Conversation/Message/LineConversation/LineMessage; C [05b §5](05b-api-chăm-soc-omnichannel.md#section-5)-6 | F D5 | U | A/M/C account/conversation scope | R/send/mark-read | attachment upload theo code | reply-token expiry/clear-once, push quota, unread counter khi redelivery, pagination, realtime; không gửi tin thật |
| Student links ([D6](06-dac-ta-man-hinh-ui.md#d6)) | S Zalo/LineContactRelation; C [05b §5](05b-api-chăm-soc-omnichannel.md#section-5)-6,7.2 | F D6 | H report count lịch sử, không remote verify | A/M/C account scope | R/link/U/unlink/suggest | ảnh hưởng từ import/sync | linked/unlinked, archived cleanup, tab alias; counts không chứng minh thiếu nhóm |
| Zalo monitor ([D7](06-dac-ta-man-hinh-ui.md#d7)) | không model riêng; C socket/pool [05b §5](05b-api-chăm-soc-omnichannel.md#section-5) | F D7 | U | A/M/C route | R/events view | — | raw payload, connection/error; chưa subscribe live |
| Workflows ([D8](06-dac-ta-man-hinh-ui.md#d8)) | S AutomationWorkflow/Step; C [05b §4](05b-api-chăm-soc-omnichannel.md#section-4) | F D8 | U | UI A/M/C; API authenticate + owner helper | R/C/U/D | — | active/config validation/pagination; T backend scope chưa test |
| Workflow detail ([D9](06-dac-ta-man-hinh-ui.md#d9)) | S AutomationEnrollment/MessageDelivery; C [05b §4](05b-api-chăm-soc-omnichannel.md#section-4) | F D9 | U | owner/service scope | R/steps C/U/D/enrollment attach/remove | — | step order/delivery retry; audit một lần chạy workflow [CXM] |
| Broadcast panel ([D10](06-dac-ta-man-hinh-ui.md#d10)) | S BroadcastCampaign/Recipient; C [05b §4](05b-api-chăm-soc-omnichannel.md#section-4),7.3 | F D10 | U | UI A/M/C; backend authenticate+service | R/C/send/cancel/retry/D | upload media, không gửi | SCHEDULED/SENDING/COMPLETED/PARTIAL_FAILED/FAILED/CANCELLED; process-local guards, multi-process [CXM] |
| Legacy Zalo accounts ([D12](06-dac-ta-man-hinh-ui.md#d12)) | S ZaloAccount; C [05b §5](05b-api-chăm-soc-omnichannel.md#section-5) | F D12 | U | A/M/C route | R/C/connect/refresh/disconnect/remove | — | alias vs standalone khác; các Zalo legacy page khác chưa mount |
| Legacy LINE accounts ([D12](06-dac-ta-man-hinh-ui.md#d12)) | S LineAccount; C [05b §6](05b-api-chăm-soc-omnichannel.md#section-6) | F D12 | U | A/M/C route | R/C/U/connect/reconnect/D | credentials theo API | OA/personal forms, QR/PIN; chưa connect |
| Legacy LINE chat ([D12](06-dac-ta-man-hinh-ui.md#d12)) | S LineConversation/Message; C [05b §6](05b-api-chăm-soc-omnichannel.md#section-6) | F D12 | U | A/M/C route | R/send/mark-read | — | limits 100, error swallowed; không send |
| Legacy LINE contacts ([D12](06-dac-ta-man-hinh-ui.md#d12)) | S LineFriend; C [05b §6](05b-api-chăm-soc-omnichannel.md#section-6) | F D12 | U | A/M/C route | R/sync/lookup/friend/send | — | limit 200, no pagination; external chưa test |
| Legacy LINE groups ([D12](06-dac-ta-man-hinh-ui.md#d12)) | S LineGroup; C [05b §6](05b-api-chăm-soc-omnichannel.md#section-6) | F D12 | U | A/M/C route | R/sync/send | — | empty/remote permission; không gửi test |
| Legacy LINE links ([D12](06-dac-ta-man-hinh-ui.md#d12)) | S LineContactRelation; C [05b §6](05b-api-chăm-soc-omnichannel.md#section-6) | F D12 | U | A/M/C route | R/C/U/D/suggest/deep-link | — | readonly fields, QR/deep-link, limit; chưa scan QR |
| Import page/wizard ([E](06-dac-ta-man-hinh-ui.md#imports-page)) | S ImportBatch/Row/CreateRequest; C [05b §3](05b-api-chăm-soc-omnichannel.md#section-3) | F E | U | A/M/C/T route; scope service còn [CXM] | upload/map/validate/confirm | Sheet 1 hồ sơ; export students/attendance | preview/errors/skip; không phải wizard hai sheet đồng thời; chưa commit import |
| Attendance Excel panel (D13/E) | S Attendance; C [05a §9](05a-api-đào-tạo-và-nền-tảng.md#section-9) | F D13/E | U | A/M/C/T + source scope | preview/confirm | Sheet 3/GV, year/action mapping | CREATE/UNCHANGED/CONFLICT/INVALID/OUT_OF_SCOPE; commit từng item, không test |
| GoogleSheetSyncPanel (D13/E) | S SyncConfig/RowState; C [05b §3](05b-api-chăm-soc-omnichannel.md#section-3),7.5 | F D13/E | U | backend A/M; panel gate khác | R/config U/run | Sheet→Web | delta row/hash, retry/overlap [CXM]; cần OAuth/service account thật |
| CsSheetBackupPanel (D13/E) | S CsSheetBackupConfig; C [05b §3](05b-api-chăm-soc-omnichannel.md#section-3) | F D13/E | U | C self read/run/download; A/M config/all | R/U/run | Web→Sheet/artifact download theo service | delta/full/schedule/private/mask; đích thực tế cần integration test |
| Import history ([E](06-dac-ta-man-hinh-ui.md#imports-page)) | S ImportBatch/Row; C [05b §3](05b-api-chăm-soc-omnichannel.md#section-3) | F E | U | A/M/C/T route, scope [CXM] | R/errors download | lỗi Excel | giới hạn 50, batch failure/partial; chưa download thật |
| ImportApprovalQueue ([E](06-dac-ta-man-hinh-ui.md#imports-page)/[D13](06-dac-ta-man-hinh-ui.md#d13)) | S ImportCreateRequest; C [05b §3](05b-api-chăm-soc-omnichannel.md#section-3) | F component **chưa mount** | U | list A/M/C; approve/reject A/M | R/approve/reject qua API | yêu cầu từ import | version/reason/pending decision; chưa có đường vào UI, không approve |
| Auto-attendance settings/runner | S ClassSchedule/AutoAttendanceExecution; C [05a §10](05a-api-đào-tạo-và-nền-tảng.md#section-10) | F A5/component liên quan | U | ADMIN | R/U/run | — | enabled/delay/idempotency/skipped/failed; không chạy scheduler thủ công |
| Alias/redirect và trang chưa mount (01 §3) | không model riêng; API của trang đích | F 01 §3,06 D12 | U | theo ProtectedRoute | navigation | — | bookmark/query-tab/route cũ; không nhận page tồn tại trên đĩa là route hoạt động |

<a id="deliverables"></a>
## 3. Ánh xạ 10 yêu cầu đầu ra

Đây là mười nhóm đầu ra của hồ sơ; 00/README hỗ trợ điều hướng và phương pháp. Tách file 05 thành 05a/05b để đọc được theo nhóm API, 08b bổ trợ truy vết trường.

| Đầu ra | File/section chính xác | Đã hoàn thành tài liệu | Chưa được gọi là đã test |
|---|---|---|---|
| 1. Bản đồ chức năng/màn hình | [01 §1-4](01-ban-do-chuc-nang.md), [06 A-E](06-dac-ta-man-hinh-ui.md) | cây nghiệp vụ, menu, routes/alias, role gate | browser navigation/bookmark từng role |
| 2. Vai trò/thực thể/thuật ngữ | [02](02-vai-tro-thuc-the-thuat-ngu.md), [08 §1-5](08-ma-tran-phan-quyen.md) | phân biệt User/Teacher/CS/nhóm | MANAGE/TEACHER runtime và business policy mở |
| 3. Từ điển dữ liệu | [03](03-tu-dien-du-lieu.md), [08b bảng 18 trường](08b-ma-tran-truy-vet.md) | field/type/default/null/enum và writer/reader mẫu | không phải mọi field đã có toàn bộ writer/reader |
| 4. Quan hệ dữ liệu/nghiệp vụ | [04 §1 và phần FK mềm](04-quan-he.md) | cardinality, constraints, namespace GV | hành vi delete/cascade trên DB thật |
| 5. API/validation/side-effects | [05a §1-16](05a-api-đào-tạo-và-nền-tảng.md), [05b §1-9](05b-api-chăm-soc-omnichannel.md) | route inventory theo module, guards, scope, lỗi | request/response live mọi endpoint, external adapters |
| 6. Chi tiết UI | [06 A1-A5, B1-B4, C1-C9, D1-D13, E/F](06-dac-ta-man-hinh-ui.md) | fields, columns, filters, forms, dialogs, loading/empty/error theo code | browser clickthrough, screenshots, responsive/accessibility |
| 7. Luồng xuyên suốt/state | [07 L1-L12](07-luong-nghiep-vu.md), [05a §8-11](05a-api-đào-tạo-và-nền-tảng.md), [05b §7](05b-api-chăm-soc-omnichannel.md) | import→enrollment→attendance→care→delivery theo code | ghi/rollback/retry/cancel và cạnh chuyển bất hợp lệ |
| 8. Phân quyền và truy vết field | [08 §1-5](08-ma-tran-phan-quyen.md), [08b](08b-ma-tran-truy-vet.md) | frontend/API/data/field scope, mẫu trường | toàn bộ role×CRUD×object scope; writer coverage đầy đủ |
| 9. Lỗi/bất nhất/câu hỏi | [09 A-F](09-loi-va-cau-hoi.md) | phân loại bằng chứng; chưa rõ giữ [CXM] | không biến backlog audit thành lỗi runtime xác nhận |
| 10. Bao phủ và khoảng trống | [10 §1-4](#quy-uoc), [README giới hạn](README.md) | mọi màn/chức năng chính ở 01/06 có hàng hoặc nhóm alias | không fake % hoặc coi “documented” là “tested” |

<a id="khoang-trong"></a>
## 4. Khoảng trống còn lại và tiêu chí kiểm chứng sau

1. **Browser:** chưa clickthrough/screenshot. Muốn đóng khoảng trống phải có phiên được chủ dự án cho phép và checklist từng role, filter/form/dialog, empty/error/loading; không tự mở server hoặc đăng nhập ở lượt này.
2. **Role/runtime:** M/T blocked/unverified; A/C chỉ có mẫu đọc lịch sử. Muốn kết luận scope cần dữ liệu có/không quyền và permission policy được chốt. CS global class visibility là quan sát implementation, không tự phân loại security bug.
3. **CRUD và dữ liệu:** chưa create/update/delete/approve/reset trong lượt hoàn thiện. Cần DB test riêng được ủy quyền, fixtures và cleanup rõ ràng. Không coi DB dev là quyền mặc định được ghi.
4. **Import/export:** code/schema/UI đã mô tả; chưa upload/confirm/export/download thật từng role và chưa test malformed files, duplicates, partial commits, concurrent approve, cancellation. Sheet sync/backup cần đích và credentials được phép; không suy đoán tích hợp đã chạy.
5. **External/runtime:** không live-send, QR login, group moderation hoặc production quota/replay tests. LINE OA có group/room semantics trong webhook/adapter; hạn chế group enumeration không đồng nghĩa không hỗ trợ nhóm. Cache 50 giây không chứng minh token luôn mới/hợp lệ sau redelivery.
6. **State/concurrency:** chưa replay multi-process broadcast, race/cancel/retry hoặc cron overlap. Các cờ process-local được code xác nhận nhưng hệ quả gửi trùng vẫn [CXM]. IO `await` tuần tự không chứng minh block event loop.
7. **Data dictionary:** schema đã liệt kê, nhưng cần lần lượt truy field→controller/schema→service→repository/job/import writer→reader/UI/export cho mọi field; 08b chỉ là mẫu. Không kết luận không có writer từ ô trống.
8. **Business policy:** các câu hỏi 09-Q1…Q10 cần chủ dự án quyết định; không lấp khoảng trống bằng chức năng phổ biến ngoài hệ thống hoặc số lượng snapshot. Hoàn tất **bộ tài liệu khảo sát** không đồng nghĩa hoàn tất nghiệm thu, audit bảo mật hay verification toàn bộ app.
