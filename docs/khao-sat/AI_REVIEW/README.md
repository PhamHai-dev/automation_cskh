# AI_REVIEW — Tổng hợp, kết luận và việc cần làm

> **Cập nhật 24/10 — nguyên tắc chủ dự án ([PC-USER]):** 1-1 linh hoạt và GV ghi ca thực học (kể cả ngoài lịch / chưa có session); hai ca cùng ngày là hợp lệ; lớp nhóm một buổi nhiều HV; lịch dự kiến không phải bằng chứng đã học/vắng; ba luồng (điểm danh → CVHT → phân xử, phiếu đánh giá, lấy feedback) có trạng thái hoàn thành độc lập; Admin phân xử. **Vẫn chưa chốt:** cách tính mọi mốc, quy đổi thời lượng→quyền học, hạn sửa lịch sử, ủy quyền MANAGE. Đọc `06_DAC_TA_LUONG_VAN_HANH_GV_CVHT_ADMIN.md` cho đặc tả nghiệp vụ và acceptance; `04`/`05`/`00` đã đồng bộ theo.

Thư mục này chứa kết quả nghiên cứu READ-ONLY trên nền `main = cbf78c337b8ff534a6d9b3ea5d63cf626cd44b17`. Không sửa code/schema/dữ liệu/config, không kích hoạt automation, không ghi đè tài liệu nguồn.

## Tài liệu trong bộ này

| File | Nội dung | Trạng thái |
|---|---|---|
| `00_CATALOG_VA_PHUONG_PHAP.md` | Danh mục nguồn (kèm SHA-256), phân loại bằng chứng, các kiểm tra đã/chưa chạy, giới hạn | hoàn tất |
| `01_BANG_CHUNG_EXCEL.md` | Inventory 8 workbook / 88 sheet / 12 hidden, formula/cache/link/comment/validation, mâu thuẫn chính sách trong file | hoàn tất + đã xác minh 88/12 & ô B26 |
| `02_HIEN_TRANG_DAO_TAO.md` | Trace code đào tạo: người→đăng ký→lớp→buổi→điểm danh→số dư; các writer và invariant | hoàn tất + đã xác minh writer/downstream |
| `03_DOI_CHIEU_REVIEW_VA_LIEN_PHAN_HE.md` | Phán quyết R01–R23 & G01–G10 của review cũ; hiệu đính concurrency/authority | hoàn tất + đã xác minh R01/R02/R04/R15/R12 |
| `04_MA_TRAN_NHU_CAU_VA_KHOANG_TRONG.md` | Ma trận 20 nghiệp vụ: nhu cầu, hiện trạng, bằng chứng, khoảng trống, tác động, đề xuất, độ chắc chắn và 5 phân loại | hoàn tất |
| `05_KE_HOACH_TRIEN_KHAI.md` | Kế hoạch chia giai đoạn theo phụ thuộc; acceptance; việc đầu tiên; câu hỏi blocking | **đã cập nhật 24/10 theo [PC-USER]** |
| `06_DAC_TA_LUONG_VAN_HANH_GV_CVHT_ADMIN.md` | Đặc tả luồng hằng ngày GV–CVHT–Admin: 8 khái niệm tính buổi, 3 luồng việc, auto-model, D1–D8, acceptance 14 tình huống | **mới, 24/10** |

## Kết luận điều hành (TLDR)

1. **Nền đúng hướng, nên giữ:** chuỗi Student–Enrollment–EnrollmentClass–ClassSession–Attendance với hai ý kiến GV/CS + final/resolution, unique attendance theo (EC, session), claim execution auto, provenance import/sync, guard delivery. Không cần viết lại.
2. **Rủi ro số 1 (P0 nghiệp vụ): không có một calculator entitlement chung.** Cùng một "số buổi còn lại/đã học" được tính **khác nhau** ở 6 nơi — automation trigger (chỉ ATTENDED-final trước ngày +1), sheet backup (ATTENDED+C, không gate state, clamp 0), broadcast (ưu tiên external), UI matrix (theo selected side/ngày), dashboard milestone (mọi attendance, không lọc deleted/state), export (external nguyên giá trị). Rule chuẩn là `business-rules.md:28-42`. Số dư sai ảnh hưởng quyết định vận hành; công thức mốc phải định nghĩa riêng, không lấy consumed làm ordinal mặc định.
3. **Rủi ro số 2 (P0): các writer attendance không cùng pipeline final/downstream.** Importer Excel **mới** (`attendance-import.service.ts`) **không gọi** `handleAttendanceEvent`/`cancelPendingDeliveries` ở commit path đã đọc (đã xác minh import). Auto ghi `ATTENDED` nhưng không ý kiến/final → thường rớt khỏi queue. Generic import còn active với predicate yếu (class+date, không giờ, không per-record scope).
4. **Rủi ro số 3 (P0 quyền):** Student detail/update thiếu ownership như list (R01/R05 đã xác minh controller không truyền actor); nested attendance GET bỏ classId (R02 xác minh repo chỉ lọc sessionId); `sale_name` substring dùng chọn CVHT/scope (R04 xác minh `students.repository.ts:199-216`).
5. **Phát hiện về tài liệu nghiệp vụ (không phải code):** workbook dùng **các chiều mã khác nhau**: A–E cho lý do/kết quả buổi, O/X/0.5X cho mức tham gia, A/P cho available (chỉ A được giải nghĩa rõ trong nguồn đã đọc); không ép ánh xạ một-một và không suy thiếu mapping là lỗi tương thích; cached formula không chứng minh freshness; `IMPORTRANGE`/link không chứng minh đã sync/quyền còn; ID 9 chữ số bị dán format ngày. Excel là **nhu cầu/đối chiếu**, không phải đã triển khai.

## Đính chính các claim (phân loại evidence-wrong)

- "GV raw int zero-validation" — **sai**: create session **có** validate `User.id`+role TEACHER (`class-sessions.service.ts:35-40`). Khoảng trống thật: update không validate lại; field mang `User.id` còn `ClassTeacher` mang `Teacher.id`.
- "LINE redelivery tạo trùng tin nhắn" — **sai**: `LineMessage @@unique([conversation_id, line_msg_id])` + upsert. Còn lại chỉ unread/emit counting [CXM].
- "mọi import không downstream" — **không dùng như kết luận bao trùm**. Pipeline manual/reconciliation mark có downstream; importer attendance mới thiếu call ở commit path đã đọc. Hàm teacher-upload legacy có trigger nhưng controller trả **410**, nên không được viện dẫn nó để chứng minh một import đang hoạt động có downstream. Xem hiệu đính §3.3 của báo cáo 03.
- "approve idempotent vì có version" — **chưa đủ**: precheck version ngoài transaction, update trong tx dùng `where:{id}` (đã xác minh) → không phải CAS nguyên tử; race chưa test.

## Mâu thuẫn governance cần chủ dự án chốt (KHÔNG tự giải)

1. **Q-004 & Q-008:** `docs/OPEN_QUESTIONS.md` ghi **RESOLVED** (cập nhật 2026-10-10, có nội dung cụ thể), nhưng `docs/product/business-rules.md` §8 ghi Q-004 **CHƯA CHỐT**, §10 ghi Q-008 **CHƯA CHỐT**. Nguồn nào hiện hành? (Chi phối final-edit-window và message precedence.)
2. **Q-009 / Sale↔CS:** OPEN_QUESTIONS Q-009: "Sale và CSKH là **cùng** vai trò CS". business-rules §15 (cập nhật): "Sale **độc lập**, bảng `sales`, không phải cs_id". Hai chiều ngược nhau — quyết định mô hình phân quyền và mapping.
3. **Auto 1-1:** không lấy lịch làm bằng chứng học/vắng; lựa chọn kỹ thuật tắt attendance tự sinh hay chuyển sang planned-only còn cần chốt. Không đưa auto-final từ lịch vào phương án mặc định.
4. **Sheet↔Web winner per-field** khi hai chiều bật (chưa có conflict contract).
5. **`/classes` CS thấy toàn trường hay scoped** (09-Q1, chưa phải lỗ hổng xác nhận).
6. **`attended_previous_years`** = opening balance chính thức, suy từ external, hay không cộng (double-count risk).

Chi tiết và trade-off ở `05_KE_HOACH_TRIEN_KHAI.md` §D và `06_DAC_TA_LUONG_VAN_HANH_GV_CVHT_ADMIN.md` §5. Các trạng thái đề xuất không phải quyết định đã duyệt.

## Việc làm đầu tiên (kế hoạch, chưa triển khai)

1. **B.4 và B.1–B.3:** fixtures và sửa quyền Student, nested class/session, export; không chờ refactor mốc.
2. **B.6 và C.1–C.2:** Teacher/User identity, assignment ngày dạy; UI GV tạo ca và opinion, retry không nhân bản nhưng ca thứ hai chủ đích vẫn được.
3. **C.3:** khung lifecycle/audit, historical NO_SEND; tiến trình không đồng nhất outbound delivery.
4. **C.5/E.3:** attended-valid, consumed/remaining và basis mốc riêng. D1 chỉ chặn công thức mốc; backfill opening balance cần quyết định riêng.
5. **D-EVAL/D-FEEDBACK:** form đúng enrollment/author và feedback tracking có thể làm song song; sinh việc đến hạn sau khi basis/catalog được duyệt.

## Những gì lượt này KHÔNG làm (giữ trung thực)

Không chạy app/test/DB/cron/worker/browser; không đăng nhập; không ghi/xóa; không gửi Zalo/LINE; không fetch Google/hyperlink; không tính lại công thức Excel; không dùng migration untracked làm bằng chứng deploy. Không có % hoàn thiện/test pass; không tuyên bố sự cố production đã xảy ra (leak/gửi trùng/sai số dư thực tế) — tất cả là phân tích tĩnh + adjudication, phần runtime gắn **CXM**.

## Bổ sung sau bàn giao báo cáo 03

- `GET /imports/export/students` cho phép ADMIN/MANAGE/CS/TEACHER (`imports.routes.ts:18`); service `exportStudents` chỉ lọc CS-only, còn các role khác truyền scope undefined. Đây là khoảng trống scope xác nhận tĩnh, cần kiểm serializer/repository và test fixture trước kết luận mức dữ liệu lộ qua HTTP; không coi TEACHER full export là đã được policy cho phép.
- `POST /enrollments/:id/assign` là method thật (`enrollments.routes.ts:18`), không phải PATCH như một số báo cáo cũ.
- CareLog milestone reuse dùng `findFirst` rồi update/create, **không phải DB unique/upsert nguyên tử**. Approval precheck version ngoài transaction cũng **chưa phải CAS**. Hai finding concurrency vẫn CXM về phát tác thực tế.
- Xóa session gọi `attendance.deleteMany` rồi xóa session trong transaction (`class-sessions.repository.ts:74-95`), gồm cả attendance soft-deleted; schema/FK có thể khiến transaction thất bại khi có tham chiếu. Chưa chạy DB để khẳng định xóa thành công trong mọi trạng thái.

## Chốt theo 5 điểm yêu cầu (cập nhật 24/10)

**1. Đã có và giữ lại:** chuỗi người→đăng ký→lần vào lớp→buổi→attendance với `UNIQUE(EnrollmentClass, ClassSession)` (không đổi thành unique theo ngày), hai ý kiến GV/CS + raw/note/actor/time, derive PENDING/MATCHED/CONFLICT (thiếu một phía ≠ conflict), resolve giữ opinion + audit, preview→confirm server recheck, provenance import/sync, delivery gate MATCHED/RESOLVED, API tạo session đã mở cho TEACHER.

**2. Cần sửa (kết luận đọc code, chưa phải lỗi tái hiện):** GV UI chặn tạo ca mới (`MyTeachingSessionsPage.tsx:137-142` — trong khi CS/Admin/Matrix tạo được, chỉ thiếu đường cho GV); AttendanceMatrix gõ bài/note trên ô trống tự tạo Attendance `ATTENDED` cho side đang chọn (`:1159-1165`) — content entry có thể âm thầm tạo "đã học"; 3 reader gom theo ngày (AttendanceMatrix processedDates `:700,734-735`, automation `:256-277` hai ca cùng ngày cùng ordinal, backup `:824-827`); import giờ bắt buộc match cho file GV (`attendance-import.service.ts:82-84`) trái rule giờ-chỉ-tham-chiếu; dashboard milestone đếm mọi attendance không lọc deleted/state (`dashboard.repository.ts:401-438`); importer mới thiếu downstream + không clear deleted_at; `attendance.repository.ts:6` bỏ classId; Student detail/update không ownership; `students.repository.ts:199-216` substring sale; export 4 role không scope; Teacher/User namespace; cancel không lưu reason; mark không chặn CANCELLED; CS tự resolve lệch luồng Admin phân xử đã xác nhận; MANAGE delegation còn chờ D2; callback note tạo task lặp; CareLog find-then-write; approve precheck ngoài tx.

**3. Cần bổ sung (theo luồng đã chốt):** entrypoint GV tạo ca thực học + attendance skeleton + idempotency request-level; pipeline final dùng chung với mode `NO_SEND`; read model tách riêng `consumed/remaining` (đã đủ cơ sở theo Q-002) và **cột căn cứ mốc** (chưa chọn công thức — chờ D1, không mặc định cá nhân hóa “personal sequence” là chuẩn); evaluation submission lifecycle (due/draft/submit/history, enrollment-scoped); feedback state machine contacted/responded/resolved + follow-up tracking; mapping versioned A–E / O/X/0.5X / A–P (chỉ khi các bộ mã được xác nhận cùng một chiều nghiệp vụ); auto planned-only cho 1-1 (chờ D3); authority per-field sheet↔web (chờ Q-POL-2).

**4. Quyết định thực sự còn chặn thiết kế:** D1 công thức mốc (basis nào), D2 ai phân xử (MANAGE?), D3 auto 1-1, D4 trạng thái/enum feedback, D5 SLA liên hệ, D6/Q-POL-4 hạn sửa lịch sử, D7 quy đổi thời lượng, D8 cách phục hồi bằng chứng phân công lịch sử/override (nguyên tắc xét ngày dạy đã được xác nhận), Q-POL-3 Sale↔CS, Q-POL-2 sheet winner. **Không hỏi lại** nội dung [PC-USER] đã nêu.

**5. Nhóm làm đầu tiên (độc lập, không chờ Q-POL):** capability fixtures → Student ownership + nested attendance + export scope; C.1+C.2 (UI GV tạo ca, 2 ca/ngày, idempotency); cancel reason + validate teacher ở update; dựng khung pipeline với `NO_SEND`. Không chặn toàn bộ calculator vì D1: consumed và remaining có contract Q-002; chỉ basis mốc, opening-balance backfill và cơ chế auto tương ứng cần quyết định riêng.

**Phân loại:** mục 2/3 = kết luận đọc code + đề xuất (không incident); mục 4 = policy chưa chốt; chưa có lỗi tái hiện bằng runtime trong lượt này; các race (approve đồng thời, sync chồng, soft-delete collision) và socket/broadcast vẫn [CXM].
## Kiểm tra đóng lượt tài liệu

Đã nhận đủ ba báo cáo chuyên đề 01/02/03, rà hiệu đính ngược về 04/05/06 và README. Ba nguồn gốc (ZIP, knowledge map, review direction) được kiểm lại SHA-256 đầy đủ, khớp catalog. Kiểm tra này là integrity/text consistency, không phải build/test ứng dụng. Không có case runtime mới được tái hiện. Tài liệu nguồn và các registry ngoài AI_REVIEW giữ nguyên; các mâu thuẫn được trích để chủ dự án xử lý, không tự sửa quyết định gốc.
