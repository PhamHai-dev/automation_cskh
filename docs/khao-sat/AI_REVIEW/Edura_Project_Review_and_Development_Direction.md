# EDURA — Đánh giá hiện trạng project và hướng phát triển

> Bản đã ẩn dữ liệu tài khoản/cá nhân (che by placeholder) — nguồn gốc xem ../NUOI-NGUON.md


**Ngày đánh giá: 24/10/2026. Mốc source do bộ khảo sát nêu: `main = cbf78c3`, repo `vd-owner/automation_cskh`.**

## 1. Kết luận chính

Project đã có một nền quản lý đào tạo và chăm sóc đáng giữ lại: phân tách Student–Enrollment–EnrollmentClass–ClassSession, lịch có hiệu lực, phân công GV, điểm danh hai phía, đối soát, task/log chăm sóc, import có preview và các kết nối Zalo/LINE. Một số cơ chế được thiết kế khá tốt như giữ ý kiến CS/GV riêng, chống trùng attendance theo quan hệ, khóa delivery theo attendance/bước workflow, lưu raw/import row và snapshot nội dung gửi.

Điểm yếu lớn nhất là **các đường thao tác chưa cùng tuân theo một hợp đồng nghiệp vụ và phạm vi dữ liệu**. Theo báo cáo API chi tiết, cùng một hồ sơ có thể được sửa từ Students, Enrollments, import, Sheet sync hoặc chấm buổi, nhưng cách chọn enrollment, kiểm ownership, sửa lịch/lớp và kích hoạt downstream khác nhau. Vì vậy, có nhiều màn hình và nhiều model chưa đồng nghĩa đã có một hành trình học viên vận hành xuyên suốt, nhất quán.

**Hướng phát triển đề xuất:** giữ nền hiện có; ưu tiên sửa quyền truy cập và các đường ghi có thể ảnh hưởng sai người/lớp, chuẩn hóa buổi–attendance–quyền lợi–mốc chăm và các writer, đóng những luồng đang thiếu đường UI, sau đó bổ sung các biến thể nghiệp vụ đã có bằng chứng trong knowledge map V2. Không cần chuyển 48 thực thể khái niệm thành 48 bảng hoặc xây lại toàn project.

### 1.1. Bảng đánh giá tổng hợp

| Nhóm | Kết luận | Cần hiểu đúng |
|---|---|---|
| Đã triển khai có nền rõ | Hồ sơ/ghi danh/lớp/buổi, quan hệ chuyển lớp, điểm danh/đối soát, care task/log, import, đa kênh | Được mô tả trong code/schema/UI của Agent; chưa phải toàn bộ đã chạy thử |
| Làm tốt về cấu trúc | Tách danh tính User/Teacher, tách người và enrollment, ý kiến điểm danh riêng, audit/import provenance, một số khóa chống trùng | Cần bảo toàn khi sửa các lỗi quanh chúng |
| Làm rồi nhưng cần sửa ưu tiên | Ownership và liên kết object trong API đọc/ghi; Student update sửa enrollment mới nhất/lớp chung; danh tính GV; KPI attendance và downstream import | Đây là các phát hiện cụ thể ở báo cáo 05a, có phần chưa được nâng đủ trong bản tổng hợp 09 |
| Làm rồi nhưng chưa khép luồng | Duyệt import chưa có đường UI; sửa/reset/import/auto chưa đồng nhất tác động; lịch buổi/đổi/nghỉ chưa thành quy trình hoàn chỉnh | Có code thành phần, thiếu hợp đồng đầu–cuối và kiểm thử hành vi |
| Có dữ liệu/JSON nhưng chưa thấy nghiệp vụ đầy đủ | Report học tập, quyền lợi riêng, thông tin phụ huynh, mốc chăm theo sản phẩm, thay đổi lịch | Không đánh đồng có ô nhập với đã có workflow và ràng buộc đúng |
| Chưa được chứng minh có | GV đăng ký available, quản lý đổi/bù theo yêu cầu, checklist onboarding, bàn giao ca/SLA, quyền truy cập học, offer/referral, QC theo rubric | Cần truy vết thêm hoặc phát triển theo phạm vi MVP; không kết luận toàn repo chắc chắn không có chỉ từ tài liệu |
| Chưa đủ bằng chứng vận hành ổn | Browser từng role, CRUD, MANAGE/TEACHER, import/Sheet E2E, gửi thật, cạnh tranh/replay | Không đưa % hoàn thiện hoặc % test pass từ bộ khảo sát này |

## 2. Cơ sở đánh giá và giới hạn bằng chứng

### 2.1. Đã đọc những gì

Đã đọc 14 báo cáo Markdown trong `khao-sat.zip`, gồm từ điển dữ liệu, quan hệ, API đào tạo/nền tảng, API chăm/đa kênh, chi tiết UI, luồng nghiệp vụ, phân quyền, truy vết trường, vấn đề và ma trận bao phủ. Đã đối chiếu với [Knowledge Map nghiệp vụ V2](sandbox:/workspace/scratch/51c910380267/outputs/Edura_Business_Knowledge_Map_Detail.md), bản dựa trên 8 workbook/88 sheet.

Các nguồn thuộc hai tầng khác nhau:

- **Bộ khảo sát project:** Agent mô tả code/schema/component, có dẫn đường dẫn và dòng source. Một số quan sát API/DB là snapshot lịch sử, không re-test trong lượt hoàn thiện.
- **Knowledge map V2:** mô tả nghiệp vụ từ Excel, hướng dẫn và xác nhận của người dùng. Một phần là mô hình đề xuất, một phần là chính sách chưa chốt. Không lấy mọi đề xuất trong map làm yêu cầu bắt buộc đã được duyệt.

Đã thử truy cập commit và schema qua kết nối GitHub hiện có; cả hai trả 404. Điều này chỉ xác nhận **kết nối hiện tại không lấy được nguồn đó**, không chứng minh repo/commit không tồn tại. Lượt đánh giá này không đọc độc lập được source, không chạy app/test/DB, không sửa code hoặc gửi tin thật. Vì vậy mốc hiện trạng trong báo cáo là **snapshot `cbf78c3` được Agent công bố**, chưa xác nhận HEAD mới nhất.

### 2.2. Nhãn dùng trong báo cáo này

| Nhãn | Nghĩa |
|---|---|
| **BC-CODE** | Bộ khảo sát mô tả đã đọc trực tiếp code/schema/UI và có dẫn chứng; người đánh giá hiện tại chưa kiểm chứng lại source |
| **BC-RT-CŨ** | Bộ khảo sát có quan sát runtime/DB lịch sử; không suy rộng thành toàn bộ luồng đã test |
| **ĐC-NV** | Đối chiếu/suy luận của lượt này với nghiệp vụ có bằng chứng ở knowledge map |
| **CXM** | Cần xác minh source/runtime/policy trước khi kết luận hành vi thực tế hoặc triển khai quyết định |

**Cách hiểu ưu tiên:** P0 = cần kiểm tra và khắc phục hoặc chứng minh đã an toàn trước pilot với dữ liệu/người nhận thật; P1 = cần đóng để một luồng MVP làm việc nhất quán; P2 = mở rộng/hardening sau phần cốt lõi; P3 = tối ưu hoặc dọn dẹp có kiểm soát. Đây là thứ tự phát triển được đề xuất, không phải tuyên bố đã xảy ra sự cố production.

## 3. Đánh giá chi tiết từng báo cáo

| Báo cáo | Tri thức thu được | Điểm làm tốt | Khoảng trống/cần chỉnh khi dùng làm kế hoạch |
|---|---|---|---|
| README | Phân loại CODE/RT/DB/SLCC/CXM, scope hai Sheet ưu tiên và nguồn tài liệu | Nói rõ documented khác tested; không giả % | Nên mở bằng danh sách issue thực sự ảnh hưởng MVP, không chỉ mục lục |
| 00 Phạm vi/phương pháp | Repo/commit, stack, môi trường, tài khoản khảo sát và hạn chế | Neo snapshot và không chép credential | Mốc commit chưa đối chiếu độc lập; các tài khoản/đếm là lịch sử, không dùng làm số vận hành hiện tại |
| 01 Bản đồ chức năng | Bốn nhóm nghiệp vụ, bảy nhóm sidebar, route/alias/gate | Phân biệt menu, route, component có file và route mount | Chưa đo hoàn thành thao tác; role đa vai và route legacy cần luồng kiểm chứng cụ thể |
| 02 Vai trò/thực thể | User role, Teacher profile, CSGroup/ManageAssignment, account kênh | Tách đăng nhập, hồ sơ GV và tài khoản kênh rất đúng | Còn nhắc ClassStatus/TeacherAttendance không đối ứng rõ trong từ điển; đoạn MANAGE global chưa đồng nhất với 05a; CVHT không chỉ là mã về mặt nghiệp vụ dù dùng role CS trong code |
| 03 Từ điển dữ liệu | Các model/trường, enum, null/default, FK và một số writer/reader | Hữu ích để bảo toàn schema; có raw/status/audit/metadata | Nhiều reader/writer trống; một số default dính cú pháp @map; không được suy field chưa có writer hoặc model không có workflow chỉ từ bảng này |
| 04 Quan hệ | Cardinality, FK mềm, hiệu lực, onDelete, namespace GV | Nêu rõ FK không thay policy; phân biệt soft reference với orphan thật | Sơ đồ User–backup config đang vẽ bắt buộc 1:1 phía User; unique ở config chỉ chứng minh User có tối đa một config. Không FK không tự chứng minh đã có orphan |
| 05a API đào tạo/nền tảng | Guard, scope, validation và tác động của mọi writer chính | Đây là nguồn có nhiều phát hiện quan trọng nhất về nghiệp vụ và quyền | Phải đưa ownership Students, nested attendance GET, cập nhật lớp chung và KPI vào backlog cấp cao; bảng summary x(d) dễ bị hiểu nhầm thành scope đúng |
| 05b API care/đa kênh | Task/log, import/sync, workflow/delivery, account/link/chat, LINE | Phân biệt HMAC, upsert tin nhắn và hạn chế replay; nhận diện owner scope | Một số phần imports còn dựa docs, không đủ trace implementation; vài chỗ dùng QUEUED cho campaign lẫn recipient; side effect approve chưa nhất quán mức xác nhận |
| 06 UI | Form, field, filter, state, quyền, alias, import panel | Đặc tả rất cụ thể; phát hiện default lịch giả, queue chưa mount, hạn chế pagination | Chưa clickthrough; thấy input/report section không chứng minh backend lưu/đọc lại đúng enrollment; ưu tiên lỗi mất/sai dữ liệu trước lỗi tiện ích |
| 07 Luồng | Import → enrollment → session/attendance → care/delivery và Sheet | Có các hiệu đính tránh bịa model hoặc kết luận duplicate LINE | Một số flow vẫn là call graph chưa khép; method assign khác 05a; attendance event không tự đồng nghĩa milestone task đã được sinh |
| 08 Phân quyền | Role/UI/API/data/field scope và vài probe lịch sử | Đúng khi không gọi CS thấy toàn lớp là lỗi trước khi chốt policy | Bản tổng hợp chưa phản ánh đủ các đường chưa kiểm scope được 05a mô tả; quyền mark phía GV khác quyền resolve-conflict; cần sửa bảng capability |
| 08b Truy vết | 18 trường trọng yếu và downstream | Chọn đúng xương sống external_id/cs_id/attendance/target/delivery | Mẫu 18 trường chưa đáp ứng mọi field; remaining/chuẩn attendance/schedule metadata chưa truy hết; dùng PATCH assign trong khi 05a ghi POST |
| 09 Lỗi/câu hỏi | Tách lỗi, giả thuyết, schema và policy; đính chính nhiều kết luận cũ | Tránh nói LINE không dedup, GV raw ID không validate, count là sai phân công | Danh sách ưu tiên chưa đủ: thiếu các vấn đề rõ ở 05a Students, attendance URL, sửa lớp chung, KPI, downstream import. Không nên dùng riêng file này làm backlog |
| 10 Bao phủ | Màn hình × schema/backend/frontend/runtime và điều kiện đóng khoảng trống | Trung thực: không full browser, không CRUD, không M/T runtime, không live-send | Là bao phủ khảo sát tài liệu, không phải độ hoàn thiện sản phẩm; cần bổ sung ma trận theo kịch bản nghiệp vụ và invariant |

### 3.1. Những điểm cần đính chính trong chính bộ khảo sát

Các điểm sau là **bất nhất tài liệu**, chưa được nâng thành lỗi code mới:

| Mã | Bất nhất | Cách xử lý đúng |
|---|---|---|
| DOC01 | 05a §11 ghi `POST /enrollments/:id/assign`; 07 L3 và 08b ghi PATCH | Đọc router ở commit cụ thể và sửa thống nhất method. Không yêu cầu Agent sửa backend chỉ để khớp một bản tài liệu |
| DOC02 | 05b dùng campaign QUEUED ở vài đoạn; 03/07 nêu enum campaign không có QUEUED | Tách trạng thái campaign, recipient, delivery và queue job |
| DOC03 | 02 nhắc ClassStatus/TeacherAttendance nhưng 03/05a không mô tả model tương ứng | Nếu là tên khái niệm/shorthand phải nói rõ; không tạo migration vì một tên trong báo cáo |
| DOC04 | 08 bảng quyền resolve đánh dấu GV có quyền theo phía GV; 05a chỉ cho A/M/CS resolve-conflict | Tách ghi ý kiến GV, chốt/bulk approve phía CS và resolve conflict theo quyền thực |
| DOC05 | 08 tổng hợp nhấn mạnh list scope mà 05a ghi Student detail/update không ownership | Bổ sung endpoint và field scope, không để nhãn x(d) che thiếu assertion |
| DOC06 | 05b imports mô tả vài trạng thái như VALIDATING/CONFIRMING; 03 enum batch là bộ khác | Phân biệt trạng thái wizard/UI, phase service và enum DB |
| DOC07 | 08b nối attendance tới milestone/care, nhưng 07 nói chưa chứng minh cấu hình milestone tự sinh task | Vẽ từng nhánh: tính mốc, hiển thị cột, sinh task, trigger delivery; xác minh riêng |
| DOC08 | 03 có default như `0) @map(...)` | Sửa parser/tài liệu default; không coi literal lỗi đó là default thật của Prisma |
| DOC09 | 06 C7 còn gọi helper uploadTeacherExcel, trong khi 05a ghi endpoint upload cũ trả 410 | Trace helper thực sự gọi endpoint nào; chưa kết luận UI hỏng chỉ từ tên hàm |
| DOC10 | 04 vẽ User–CsSheetBackupConfig bắt buộc 1:1 | User có thể chưa có config; kiểm tra cardinality 1 : 0..1 từ phía User |

## 4. Những phần đã triển khai và làm tốt, nên giữ

### G01. Xương sống người học–đăng ký–lần vào lớp–buổi đã đi đúng hướng

**BC-CODE:** 03 các phần Student, Enrollment, EnrollmentClass, ClassSession; 04 §1; 07 L3. EnrollmentClass có sequence/status và thời gian bắt đầu/kết thúc; chuyển lớp giữ dòng cũ TRANSFERRED và tạo dòng mới.

**ĐC-NV:** Phù hợp với hồ sơ có nhiều lần đăng ký/chuyển lớp trong Excel. Đây là nền quan trọng để không gộp mọi lịch sử vào một dòng. Cần giữ, đồng thời xác minh writer kết thúc/mở quan hệ hiệu lực và đọc theo đúng enrollment.

### G02. Đã tách hồ sơ giáo viên khỏi tài khoản đăng nhập

**BC-CODE:** Teacher.user_id nullable/unique; có thể import GV trước, cấp tài khoản sau. Không cần ép mọi GV có tài khoản để giữ lịch sử chấm buổi. Account Zalo/LINE lại thuộc nhân sự vận hành, khác User/Teacher. Thiết kế khái niệm này đúng; vấn đề ở cách một số field nhận Teacher.id/User.id chưa nhất quán, không phải cần gộp User và Teacher.

### G03. Lưu ý kiến hai phía và kết quả chốt riêng

**BC-CODE:** Attendance có teacher_status, cs_status, raw/note/user/time, reconciliation_state, status chốt, resolver/reason. Có pending/matched/conflict/resolved. Đây là tiến bộ rõ so với cộng hai file Excel hoặc tùy tiện chọn một nguồn thắng.

**Cần giữ:** raw và actor từng phía; không làm mất CONFLICT để dashboard đẹp hơn; tách user thực thao tác với người được hỗ trợ khi admin mark.

### G04. Có unique và nền phục hồi/reset attendance

**BC-CODE:** unique (enrollment_class_id, class_session_id); soft-delete; reset một phía giữ phía kia; upsert có nhánh khôi phục. Create session cấp số trong Serializable transaction/retry. Đây là các invariant tốt, dù canonical occurrence giữa auto/manual/import còn cần hoàn thiện.

### G05. Auto-schedule có điều kiện và provenance

**BC-CODE:** bỏ LKCD, chỉ STUDYING/ACTIVE và khoảng hiệu lực, chỉ điền ô trống, lưu source AUTO_SCHEDULE/execution và actor hệ thống inactive; thiếu giờ tạo issue. Đã tránh một số lỗi phổ biến là ghi đè attendance hoặc dùng người thật làm actor giả.

**Giới hạn:** vẫn phải gọi đây là dữ liệu tạo theo lịch/chờ xác minh. Việc không tự fire delivery khi chưa đối soát là một lớp bảo vệ đáng giữ; KPI/số dư cần dùng đúng tầng dữ liệu.

### G06. Import điểm danh có preview và kiểm lại server lúc confirm

**BC-CODE:** classification CREATE/UNCHANGED/CONFLICT/INVALID/OUT_OF_SCOPE; re-parse file và recheck scope; action APPLY/KEEP_DATABASE/SKIP; có raw/audit/row result. Guard năm nhuận và date-only là điểm tốt. Cần phát triển thêm partial result/retry và downstream chung, không bỏ preview để import nhanh hơn.

### G07. CareTask và CareLog đã có nền sử dụng được

**BC-CODE:** task theo enrollment, assignee, due, priority/status và idempotency_key; log có outcome/content/session; có notification riêng cho người nhận. Điều này phù hợp mốc chăm và hẹn trong Excel. Cần làm rõ transition/nguồn sinh task và lịch sử tương tác, không cần tạo một hệ thống task hoàn toàn mới ngay.

### G08. Có provenance nguồn và dữ liệu đồng bộ

**BC-CODE:** ImportBatch/Row/raw_data; external_sync_key; GoogleSheetRowState theo config/key/hash; audit before/after. Có thể dùng để bảo toàn dữ kiện và xử lý đổi thứ tự nguồn, với điều kiện chốt key và conflict policy. Hash dòng không thay toàn bộ business identity, nhưng là nền tốt.

### G09. Có các lớp bảo vệ gửi tin đã được mô tả rõ

**BC-CODE:** delivery unique theo attendance/step; content/variables snapshot; account/relation recheck; LINE HMAC, message upsert theo provider id, retry key và guard quota. Điều này là nền tốt để quản lý delivery. Chưa đủ để khẳng định mọi loại gửi/replay/cancel đều an toàn, nhưng không được ghi nhận sai thành “không có chống trùng”.

### G10. UI đã hỗ trợ nhiều thao tác vận hành thực tế

**BC-CODE:** ma trận nhanh/chi tiết, các bộ lọc, form nhiều nhóm, đối soát có tab pending/conflict/history, modal có loading/error, preferences và nhiều bước import. Nên tái sử dụng. Điều cần cải thiện là chọn đúng đối tượng, các action đang dở và dữ liệu/error không bị ẩn, trước khi thêm nhiều trang tương tự.

## 5. Các vấn đề cần sửa hoặc kiểm chứng ưu tiên

### R01 — Student detail/update thiếu cùng một kiểm tra ownership với danh sách

**Ưu tiên P0; bằng chứng BC-CODE, hệ quả runtime cần tái hiện.**

05a §3 mô tả GET Students list lọc theo scope, nhưng GET `/students/:id` không kiểm ownership và include mọi enrollment; PATCH/PUT cũng không ownership. Cùng báo cáo ghi body có thể cập nhật cs_id ở nhánh sửa hồ sơ. Dẫn source của Agent: `students.service.ts:33-36`, `students.repository.ts:115-158,353-380,444-475`.

**Tác động:** giới hạn ở danh sách hoặc filter frontend không bảo vệ detail/update; có thể đọc/sửa hồ sơ và các quan hệ không thuộc phạm vi. Cần xác nhận policy HV chung nhiều enrollment: cho xem identity chung không đồng nghĩa cho xem/ghi mọi enrollment.

**Sửa theo hướng:** áp scope thống nhất cho từng action; field-level allowlist; khi cập nhật enrollment phải truyền/chọn rõ enrollment được phép; có phạm vi khác nhau cho người học chung và các enrollment của người đó. Không sửa bằng cách chỉ ẩn nút frontend.

**Tiêu chí đóng:** fixtures CS-A/CS-B, HV có nhiều enrollment khác CS; GET/PATCH ngoài quyền không trả hoặc đổi dữ liệu nhạy cảm, và thao tác hợp lệ vẫn làm được. Kiểm tra cả API trực tiếp và UI; so dữ liệu trước/sau request bị chặn.

### R02 — Nested attendance GET chưa khóa session vào class trên URL

**Ưu tiên P0; BC-CODE + suy luận kiểm thử.**

05a §8: middleware kiểm classId được phép, nhưng repository list chỉ lọc sessionId, bỏ classId (`attendance.repository.ts:6-22`). Việc các route ghi đã kiểm cặp class/session là điểm tốt nhưng không bảo vệ route đọc này.

**Tác động:** nếu mô tả đúng, ghép class được phép với session lớp khác có thể trả attendance/enrollment/cs_note ngoài phạm vi. Không cần công bố hoặc thao tác dữ liệu thật để kiểm tra; dùng hai lớp fixture.

**Tiêu chí đóng:** mọi endpoint lồng phải assert session.class_id = classId trước query/return; session detail, list attendance và write dùng cùng invariant. Yêu cầu sai cặp không lộ dữ liệu lớp kia.

### R03 — Quyền ghi note CS và quyền của GV theo buổi chưa thống nhất

**Ưu tiên P0/P1 theo phạm vi triển khai; BC-CODE.**

05a §8 mô tả `cs_note` không bị chặn theo side: phía GV có thể gửi field này. GET attendance thường trả cs_note, trong khi teacher-tracking có select an toàn hơn. 05a §6–7 còn mô tả một assignment session cũ có thể mở quyền cả lớp và các route tạo/sửa/hủy/xóa session; write attendance lại yêu cầu ClassTeacher active.

**Tác động:** đường UI/route vào quyết định quyền khác nhau; GV dạy thay có thể đọc lịch sử phù hợp nhưng không nên mặc nhiên sửa buổi khác hay note nội bộ. Ý nghĩa private của từng note cần policy xác nhận; việc cho field write vượt side là bất nhất contract cần sửa.

**Sửa theo hướng:** tách quyền xem lịch sử, xem thông tin học tập, ghi ý kiến của mình, sửa lịch/buổi và xem/ghi nội bộ CS. Kiểm current/effective assignment và phạm vi buổi ở action ghi. Không giải quyết bằng cấm GV mọi lịch sử hoặc cho GV mọi quyền chăm sóc.

### R04 — `sale_name` đang bị dùng như căn cứ chọn CVHT và scope

**Ưu tiên P0/P1; BC-CODE + ĐC-NV.**

05a §3: create Student dò `sale_name` substring trên code/name/email của mọi User, có thể chọn người khác currentUser mà chưa xác minh role CS. §11: list enrollments cho CS dùng OR giữa cs_id và sale/name/email; detail lại chỉ cs_id. 06 F.7 còn nêu filter frontend trộn sale với CS.

**Tác động:** người bán, người chăm và phạm vi được nhìn bị trộn. Một chuỗi tên ngắn không phải căn cứ đáng tin để giao chăm hay mở quyền đọc. Dữ liệu Sales trong Excel là trường riêng; scope phải theo quan hệ được xác nhận.

**Tiêu chí đóng:** sale_id/name không làm đổi cs_id hoặc quyền xem nếu không qua hành động bàn giao có thẩm quyền. Mapping CVHT dùng ID/code đã xác minh; trường hợp mơ hồ phải chờ đối chiếu. List/detail không dùng tiêu chí trái nhau cho cùng một quyền.

### R05 — Sửa hồ sơ HV có thể sửa enrollment mới nhất và lớp dùng chung

**Ưu tiên P0/P1; BC-CODE + ĐC-NV.**

05a §3: update Student chọn enrollment mới nhất; thay class_name/schedule/GV có thể sửa Class đang dùng chung (`students.repository.ts:353-380,478-572`).

**Tác động:** HV có combo/nhiều đăng ký có thể bị đổi nhầm chặng; đổi lịch cá nhân một người nhóm có thể thay lớp của nhiều người. Đây là vấn đề blast radius của action, không chỉ thiếu một field.

**Sửa theo hướng:** form chọn enrollment/lần tham gia rõ; cập nhật identity riêng, enrollment riêng, lớp riêng. Action đổi lớp/lịch nhóm phải xác nhận phạm vi và bên bị ảnh hưởng. Đổi một buổi có request/occurrence riêng; không gọi update class chung từ một ô lịch cá nhân.

**Tiêu chí đóng:** sửa HV-A không đổi enrollment khác hoặc lớp của HV-B ngoài action tập thể được xác nhận; lưu before/after và hiệu lực.

### R06 — Teacher.id và User.id vẫn trộn ở phân công và session

**Ưu tiên P1; BC-CODE; không khẳng định đã có sai phân công thực tế.**

ClassTeacher.teacher_id là Teacher.id; ClassSession.teacher_id ở create kiểm User role TEACHER; update không lặp kiểm. `classes.scope.ts` dò cả hai namespace. Việc tách Teacher/User là đúng; fallback đoán bằng số là phần cần bỏ dần.

**Tiêu chí đóng:** chọn một contract rõ cho field phân công, actor và người được hỗ trợ; create/update/import/serializer/frontend dùng đúng ID. Test Teacher.id khác User.id, hai người có số ID giao nhau và GV chưa có User. Không tự sửa bản ghi bằng cách đổi số ID hàng loạt chưa mapping.

### R07 — Buổi lịch tự sinh, ý kiến điểm danh và kết quả chốt bị các reader hiểu khác nhau

**Ưu tiên P1; BC-CODE + ĐC-NV.**

Auto tạo `Attendance.status` và source nhưng không có ý kiến hai bên; DB mặc định PENDING_CS. Derive trong reconciliation lại định nghĩa thiếu GV là PENDING_TEACHER. Delivery gate MATCHED/RESOLVED có bảo vệ, nhưng 05a cuối §16 nêu dashboard stats không yêu cầu state chốt và không loại deleted_at. Knowledge map V2 đã chứng minh số 1 theo lịch không phải chứng cứ HV học thực.

**Sửa theo hướng:** định nghĩa rõ dự kiến/auto-provisional, opinion CS/GV, chốt hợp lệ và phát sinh tiêu thụ quyền. Có thể giữ model hiện tại và thêm resolver/predicate; chưa nhất thiết tạo bảng mới. Chốt tính chuyên cần/tiêu thụ/mốc trên trạng thái nào theo policy. Nếu giữ auto-provisional, UI phải gọi đúng tên và không dùng nó như attendance xác minh.

**Tiêu chí đóng:** cùng bộ fixture pending/conflict/resolved/reset/auto, dashboard, số còn, danh sách mốc và delivery dùng đúng tập. Không được “sửa” bằng cách tự MATCHED mọi auto record.

### R08 — Dashboard có mẫu số, phạm vi và mốc ngày không đồng nhất

**Ưu tiên P1; BC-CODE, cần test trên fixtures.**

05a cuối §16 mô tả `total_sessions` chỉ theo class_id, không cùng scope/date/package với attendance; attendance stats không dùng filter.cs_id, không loại soft-delete hoặc pending/conflict. Ngày cuối ở dashboard là midnight, khác reconciliation dùng hết ngày.

**Tác động:** tỷ lệ sai có thể dẫn tới chăm nhầm, đánh giá nhân sự sai và hiểu nhầm số buổi. Có chart không chứng minh KPI đã đúng.

**Tiêu chí đóng:** mỗi KPI ghi tử/mẫu, đơn vị session hay lượt HV–buổi, tập đủ điều kiện và đồng hồ. Với cùng filter, mọi thành phần dùng cùng scope phù hợp; ngày cuối không mất buổi chiều/tối. Ghi rõ dữ liệu chưa xác minh thay vì gộp thành vắng/0.

### R09 — Các writer attendance chưa cùng thực hiện downstream

**Ưu tiên P1; BC-CODE + CXM ở các nhánh chưa đọc hết.**

05a §8–10: manual mark/resolve/reset có các call audit/automation/cancel pending khác nhau; Excel confirm commit attendance nhưng nhánh được mô tả không gọi handleAttendanceEvent; auto có gọi nhưng state pending nên gate chặn. Sheet sync là writer khác. Metadata resolve bị xóa khác nhau giữa PATCH và upsert.

**Tác động:** cùng kết quả cuối nhưng nhận từ UI/import/sync có thể ra số dư, cảnh báo, task hoặc delivery khác. Import có thể cần chủ ý không gửi tin lịch sử; điều đó phải là chế độ explicit, không do bỏ quên downstream.

**Sửa theo hướng:** thống nhất một chuỗi áp dụng thay đổi nghiệp vụ, giữ origin/mode như import lịch sử không phát tin, recompute có kiểm soát. Mọi writer phải cập nhật invariant và tạo tác động đúng hợp đồng. Sửa sau chốt cần quyết định điều chỉnh, không chỉ overwrite.

### R10 — Session manual/auto/import cần một cách nhận diện occurrence thống nhất

**Ưu tiên P1; BC-CODE + suy luận cần kiểm thử.**

Auto session có class_schedule_id, manual create không set; schema unique schedule/date và class/session_number không tự hợp nhất hai session cùng ý nghĩa. Import còn có fallback ngày date-only. Một ngày có hai buổi hợp lệ vẫn có thể tồn tại, nên ép unique(class,date) không phải lời giải chung.

**Tiêu chí đóng:** cùng một occurrence được tạo qua auto/manual/import chỉ có một buổi canonical; hai buổi thật khác giờ không bị gộp; đổi lịch/bù giữ liên kết buổi cũ/mới; sequence lớp khác với buổi thứ mấy của HV.

### R11 — Cancel/reset/soft-delete và chốt đối soát chưa có hành vi xuyên luồng đầy đủ

**Ưu tiên P1; BC-CODE + ĐC-NV.**

05a mô tả ghi attendance chưa chặn session CANCELLED, các trạng thái được gán trực tiếp, resolve có thể mở lại, reconciliation có nhánh đọc/mark soft-deleted, DELETE session hard-delete attendance và chưa thấy recompute care. Các hành vi này không phải lúc nào đều sai, nhưng chưa có contract nêu ai được làm và tác động gì.

**Tiêu chí đóng:** hủy buổi không sinh thêm nghĩa vụ vắng/nhắc cũ; reset một phía giữ đúng phía kia; record deleted không vào KPI/tác nghiệp ngoài chủ ý; sửa kết quả đã gửi/chốt không làm mất lịch sử. Test transaction khi attendance còn delivery/FK liên quan trước khi chọn hard-delete hay void/archive.

### R12 — Import có thành phần duyệt nhưng người dùng chưa hoàn tất được qua UI

**Ưu tiên P1; BC-CODE.**

06 E/D13 và 09 U1 nêu ImportApprovalQueue chưa được mount; wizard có create/transfer request; approve/reject có API. UI còn mặc định tab Sheet-sync dù CS/TEACHER không có quyền API tương ứng; callback có thể chuyển history trước bước kết quả. Confirm attendance commit theo item, nên lỗi giữa batch có thể để lại phần đã thành công.

**Tiêu chí đóng:** người tạo biết request đang chờ ai; người có quyền mở/duyệt/từ chối; optimistic version được kiểm tra; duplicate approve không nhân đôi dữ liệu; batch partial có kết quả bền vững và retry đúng item. Không bắt mọi batch phải atomic nếu nghiệp vụ chấp nhận partial có báo cáo rõ.

### R13 — Default lịch ở UI tạo dữ liệu có vẻ thật khi thực tế đang thiếu

**Ưu tiên P1 cho vận hành; BC-CODE.**

06 F.19: thiếu lịch bị hiển thị fallback `246`, `20h00`, `30` phút. Bộ lọc dùng các giá trị đó. Default chỉ để gợi ý trong form tạo khác dữ liệu hiện có đã được xác nhận.

**Tiêu chí đóng:** thiếu lịch hiển thị Chưa xác nhận/Thiếu dữ liệu; không khớp filter lịch thật hoặc sinh nhắc/buổi từ fallback; nhập giá trị đề xuất phải có hành động xác nhận rõ.

05a §3 còn mô tả create Student mặc định KAIWA/STUDYING/30 buổi và total_sessions=0 fallback 30. Nếu đây là form chuyên một sản phẩm đã chốt thì phải hiển thị rõ các giá trị xác nhận; nếu là import/hồ sơ đa sản phẩm, không được âm thầm coi thiếu thông tin là đăng ký 30 buổi Kaiwa đang học. Cần phân biệt default được nghiệp vụ duyệt và giá trị lấp chỗ trống.

### R14 — Report học tập có form, nhưng quyền tác giả và phạm vi enrollment cần hoàn thiện

**Ưu tiên P1/P2 theo MVP; BC-CODE + ĐC-NV.**

06 B2 cho thấy đã có trang report với nhiều tiêu chí năng lực; không được kết luận project chưa có report native. Tuy nhiên route A/M/CS, lưu qua studentsApi.update; trong nghiệp vụ F02, GV phải điền báo cáo HV. Khi writer Student update chọn enrollment mới nhất, report của chặng cũ cần được kiểm tra đặc biệt.

**Tiêu chí đóng:** report gắn đúng enrollment/chặng/mốc, có người đánh giá và thời điểm; GV được ghi phần học tập trong phạm vi phân công, CVHT ghi/chăm phần riêng; GV không vì được viết report mà có quyền đọc note nội bộ. Test hai enrollment cùng HV và lưu/đọc lại từng report.

### R15 — Mốc chăm đang có cấu hình nhưng chưa thể hiện đủ sản phẩm, phiên bản và căn cứ tính

**Ưu tiên P1/P2; BC-CODE + ĐC-NV.**

CareMilestoneConfig unique session_number toàn cục; AutomationStep cũng dùng session_number và sự kiện attendance. Nguồn thực tế có Kaiwa/JLPT/Kids, quyền dài tới 90 buổi, người vào giữa lớp và chăm theo hẹn/thi. Bộ khảo sát chưa chứng minh attendance đạt mốc tự tạo task có chống lặp.

**Sửa theo hướng:** giữ mốc số buổi hiện tại cho scope MVP đã chốt, thêm phạm vi sản phẩm/lộ trình và basis (lớp/cá nhân/tiêu thụ). Đếm đạt/vượt mốc để import nhảy từ 2 lên 4 không bỏ mất mốc 3; sửa đếm xuống rồi lên không nhân đôi việc đã xử lý. Tách task cho người làm, log kết quả và delivery gửi tin.

05b §2 còn cho CS POST mốc vào danh mục chung. Cần xác nhận ai được thay cấu hình dùng toàn trung tâm và hiệu lực với hồ sơ cũ; quyền thêm mốc trên UI không nên bị hiểu mặc nhiên là quyền thay chính sách mọi chương trình.

### R16 — Nhóm khớp tên và liên hệ theo Student chưa đủ thể hiện người nhận hợp lệ

**Ưu tiên P1 trước tự gửi; BC-CODE + ĐC-NV, policy CXM.**

Matcher theo tên nhóm/code/ID, có fallback enrollment/CS; relation chủ yếu student-account. Knowledge map có phụ huynh nhiều con, người mua khác người học và nhiều enrollment đồng thời. Match tên là ứng viên liên kết, không tự chứng minh mục đích nhóm/nhân sự/người nhận theo từng loại tin.

**Tiêu chí đóng:** xác định nguồn nhóm/target được xác nhận, mục đích học/chăm/thu phí, người nhận và enrollment liên quan; trường hợp nhiều CS/người liên hệ xử lý rõ. Đổi CS/nhóm, archive account, bảo lưu hoặc hủy buổi khiến các delivery tương lai được đánh giá lại. Không kết luận mọi nhóm tên đúng đang bị gửi sai; đây là khoảng policy/kiểm chứng cần đóng.

### R17 — Gửi theo lịch, socket và replay còn điều kiện cần kiểm chứng

**Ưu tiên P0 cho kiểm tra quyền socket; P1 cho tính nhất quán gửi khi bật thật; BC-CODE/CXM.**

09 K1/K2/K4: poller/cờ chống chạy đồng thời chỉ process-local trong đoạn đã đọc; socket room chưa thấy đủ auth/ownership trong handler; LINE có message upsert nhưng unread/socket có thể xử lý event lặp. Không được nâng thành “đã gửi trùng”, “socket chắc chắn public” hoặc “LINE không dedup”.

**Tiêu chí đóng:** API/socket từ user khác scope không nhận QR/tin; hai executor không cùng thực hiện một lượt gửi; cancel/retry có kết quả đúng; webhook lặp giữ một tin và unread/event hiển thị đúng. Dùng adapter giả/sandbox, không gửi ra HV thật để thử. Chỉ mở rộng nhiều kênh sau khi contract target/cancel/retry đủ rõ.

### R18 — Sheet hai chiều và import identity chưa có nguồn thẩm quyền theo trường

**Ưu tiên P1 khi dùng song song; BC-CODE + CXM ở integration.**

Row hash/config key đã có, nhưng bản khảo sát chưa chứng minh đầy đủ field ownership, conflict winner, khóa nguồn đổi thứ tự, nhiều lần đăng ký cùng gói và re-import. `external_id + package_code` ở một số flow không đủ phân biệt luôn việc mua lại cùng gói. Default CS theo email/code hoặc CVHT01 cần kiểm chứng dữ liệu, không gọi chắc chắn sai người.

**Tiêu chí đóng:** chọn nguồn thẩm quyền từng nhóm field, nhận diện đăng ký lặp và cùng người nhiều gói; reorder nguồn không gắn sai care; retry không tạo quyền/task trùng; Web edit rồi backup/sync không tự hoàn tác. Những mục chưa mapping rõ phải đưa vào hàng chờ xác minh, không tự đẩy về CS đầu tiên.

### R19 — Lỗi đầu vào bị trả 500 và lỗi bị nuốt khiến người dùng hiểu sai trạng thái

**Ưu tiên P1/P2 theo action; BC-CODE.**

05a §9: ZodError reconciliation đi thành 500; auto-attendance PATCH có nhánh lỗi không trả response theo đoạn code mô tả. 06 nêu load CS list/mark-read nuốt lỗi, backup disabled không giải thích, attachment local preview có thể trông gửi được dù upload backend thất bại.

**Tiêu chí đóng:** validation trả thông tin sửa được; lỗi quyền khác lỗi nhập; API lỗi không hiện danh sách rỗng/đã đọc/ảnh gửi được giả; partial/saving/loading đúng đối tượng và tab.

### R20 — Phân quyền frontend đa role và bề mặt teacher chưa nhất quán

**Ưu tiên P1 nếu có user đa role; P2 phần tiện ích; BC-CODE.**

06 F.2/F.6/F.20: CS+TEACHER hoặc CS+MANAGE được suy vai khác giữa Sidebar/Care/Classes/AttendanceMatrix; cùng attendance có thể ghi ở trang này mà bị chặn ở trang khác. CS có route teacher nhưng API chỉ A/M/T. Teacher có Preferences của trang không được vào.

**Tiêu chí đóng:** một capability/side policy dùng nhất quán ở các màn, dựa trên quyền backend; test các tổ hợp role thực sự được trung tâm dùng. Role sai có thông báo rõ, không redirect về Home im lặng. Không coi việc có nhiều role tự nó là lỗi.

### R21 — API đọc đang có tác động sửa dữ liệu định danh

**Ưu tiên P1/P2 theo phụ thuộc nguồn; BC-CODE.**

05a §2/§6 mô tả GET users tự bổ sung code/staff_code và GET classes/detail chuẩn hóa một số mã lớp cũ. Việc normalize có thể cần thiết, nhưng thực hiện qua đọc danh sách khiến quyền xem, thời điểm mutation và audit khó hiểu. Đây cũng là lý do bộ khảo sát không gọi mọi GET như thao tác thuần đọc.

**Tiêu chí đóng:** chuẩn hóa có lệnh/migration rõ, mapping before/after, kiểm tra consumer; các GET phục vụ người dùng không đổi mã/quan hệ ngoài hợp đồng được ghi rõ. Không xóa hành vi normalize trước khi hiểu nó có đang sửa dữ liệu legacy cần thiết hay không.

### R22 — Ngày/giờ, khoảng hiệu lực và timezone chưa có contract thống nhất

**Ưu tiên P1; BC-CODE + ĐC-NV.**

05a mô tả auto dùng giờ local nhưng key ngày UTC; session/start/end nhận string rồi new Date, giờ tự do chưa kiểm end>start; các API lọc ngày cuối khác nhau. Excel còn có giờ Việt/Nhật và file tên 2026 chứa serial 2025. Đây là vấn đề nghiệp vụ lịch, không chỉ định dạng hiển thị.

**Tiêu chí đóng:** lưu và diễn giải tách date-only, local time, timezone và instant khi cần; hiệu lực có đầu/cuối hợp lệ; ngày cuối không bỏ buổi tối. Test lịch Việt/Nhật, sát ngày, năm nhuận và target-year import có xác nhận; không tự sửa năm từ tên sheet. Không chọn timezone máy chủ làm policy ngầm.

### R23 — Phone/email trùng cần được kiểm theo đúng vai trò liên hệ

**Ưu tiên P1/P2 theo dữ liệu phục vụ; BC-CODE + ĐC-NV/policy CXM.**

05a §3 mô tả service Student trả 409 khi phone/email trùng, trong khi schema không ghi unique cho hai cột này. Knowledge map có phụ huynh đại diện nhiều con. Nếu form dùng phone/email của phụ huynh cho người học, ràng buộc hiện tại có thể chặn một quan hệ hợp lệ hoặc thúc đẩy nhập dữ liệu giả.

**Tiêu chí đóng:** định nghĩa phone/email là của ai; hai con có thể dùng chung người liên hệ mà vẫn là hai Student khác ID; không gộp người chỉ vì phone. Có thể giữ kiểm tra trùng như cảnh báo/xác minh hoặc quản lý liên hệ riêng theo policy, không nhất thiết bỏ mọi kiểm tra dữ liệu.

## 6. Các nghiệp vụ còn thiếu hoặc mới có một phần nền

Phân loại dưới đây chỉ áp cho **những gì bộ 14 báo cáo chứng minh được**. “Chưa thấy” khác “đã grep toàn bộ source và chứng minh không tồn tại”. Cần yêu cầu Agent cung cấp writer–reader–UI–test nếu họ cho rằng một mục đã có ở module/JSON khác.

| Nghiệp vụ theo knowledge map V2 | Nền đang có trong báo cáo | Phần chưa khép | Hướng mở rộng phù hợp |
|---|---|---|---|
| Bàn giao/onboarding | Student/Enrollment có handed_over_at/account_created_at, form và import | Checklist đăng nhập/đúng khóa/thao tác; hồ sơ thiếu và thời hạn nhận chưa thành luồng | Dùng enrollment + checklist/task có nguồn và thời điểm; không chỉ thêm timestamp |
| Người học–phụ huynh/người mua | Form có parent/school/metadata; Contact Zalo gắn Student tùy chọn | Vai trò liên hệ n-n, phạm vi nhận từng loại tin, cùng phụ huynh nhiều con | Có thể bắt đầu quan hệ/metadata có contract; không đồng nhất Contact kênh với business contact |
| Gói/combo nhiều chặng | Package số buổi và Enrollment.metadata | Thành phần gói, thứ tự chặng, quyền còn, mua lại cùng gói | Giữ Package hiện tại, bổ sung cấu trúc thành phần và lần đăng ký rõ |
| Quyền lợi | total_sessions, attended_previous_years, external_remaining | Công thức/căn cứ tiêu thụ, điều chỉnh/chuyển, số dư đầu kỳ và phạm vi buổi/phút/video | Một sổ phát sinh hoặc lịch sử điều chỉnh đủ audit, không chỉ sửa tổng |
| GV available | Teacher, ClassTeacher, ClassSchedule | Chưa thấy nơi GV đăng ký rảnh/múi giờ/hiệu lực và đối chiếu nhu cầu HV | ClassSchedule là lịch lớp, không thay Teacher availability |
| Đổi lịch/nghỉ/bù | CRUD session/cancel, status A–E và schedule | Yêu cầu, phạm vi một buổi/chuỗi, xác nhận, buổi thay thế, quyền bù, cập nhật nhắc | Thêm workflow trên session/schedule có hiệu lực, tránh sửa lịch chung qua Student |
| Giảng dạy/điểm danh | Hai ý kiến, lesson topic/note, đối soát | Nguồn provisional/chốt, người thực dạy, tham gia một phần, đồng bộ reader | Củng cố R06–R11 trước thêm trạng thái tự động |
| Bài tập/KT/đánh giá | Report UI, JLPT fields/metadata, điểm/nhận xét | Bài giao/hạn/nộp/chấm/lần làm/thang và quyền GV nhập report chưa rõ | Đặc tả phần native tối thiểu; vẫn cho dẫn báo cáo nguồn khi chưa thay LMS |
| Mốc chăm | CareMilestoneConfig, CareLog, CareTask, AutomationStep | Product/version/basis, task đúng hạn không trùng, đạt/vượt mốc | Tách config mốc, người làm và delivery; không dùng số buổi lớp cho tất cả |
| Trực ca/SLA | Task/priority/due/status, omnichannel inbox | Ca giao/nhận, time-to-ack/time-to-resolve, người giữ việc và escalation | Tận dụng CareTask + interaction/handover history; chưa cần app trực ca riêng |
| Hỗ trợ/vấn đề | HOT_ISSUE, CALLBACK và log outcome | Nguyên nhân, bộ phận xử lý, trạng thái chờ, kết quả xác nhận | Nâng task thành việc xử lý có liên kết; không phải mọi loại đều cần model mới |
| Tài khoản/quyền LMS | Enrollment.account_created_at; User và account kênh là thứ khác | Kiểm tra quyền khóa/video, chu kỳ duyệt–deactive, nhiều quyền sau lớp | Tách trạng thái học, login nội bộ và quyền LMS. Trước hết có checklist/decision dù chưa có API LMS |
| Tái tục/offer/referral | Một số renewal fields và broadcast | Cơ hội, phương án, lần liên hệ, hẹn đóng, giao dịch xác minh, referral | Một luồng CS có owner/hạn; broadcast không thay sổ cơ hội |
| QC GV/record | Teacher, report UI, một số link dữ liệu | Rubric 10/12 tiêu chí, người chấm, kỳ, record, kế hoạch cải thiện | Có thể làm report/task chuyên môn trước; không quy mọi vắng/điểm thấp thành QC |
| Hoàn thành/thi | Status FINISHED, metadata đăng ký/điểm/kết quả | Policy theo lộ trình, kỳ/cấp/lần thi, thực dự thi, chưa phản hồi | Không dùng FINISHED thay đạt; metadata có schema có thể là bước đầu |
| Điều hành | Nhiều dashboard/filter/pivot | Đúng đơn vị, thời điểm, mẫu số và dữ liệu đủ điều kiện | Làm ít KPI có định nghĩa/fixture đúng trước khi tăng chart |
| Quản trị dữ liệu/nguồn | Import row/hash/audit, settings | Field authority, conflict, ID mapping, provenance và retry mọi writer | Chốt contract nguồn; không ép mọi FK mềm thành FK thật một cách máy móc |

### 6.1. Các phần hiện tại có thể coi là MVP hợp lý

Nếu mục tiêu phiên bản đầu là thay hai sheet `1.Chăm sóc` và `3.Chấm buổi`, có thể chấp nhận chưa có kế toán, trả lương, mọi rubric/QC, referral hoàn chỉnh hoặc tự cấp quyền LMS. Nhưng phiên bản đầu vẫn phải bảo đảm:

1. Nhập và mở đúng HV/đăng ký, đúng CVHT/lớp, không gắn sai dữ liệu khi có nhiều đăng ký.
2. Một buổi và attendance có danh tính ổn định; pending/auto/chốt không bị tính lẫn.
3. GV/CS ghi được đúng phần của mình, quyền được kiểm ở API.
4. Số đã dùng/còn và mốc chăm có căn cứ, không âm thầm lấy fallback/ước tính làm sự thật.
5. Một lần chăm có người phụ trách, kết quả, hẹn; request duyệt có đường hoàn tất.
6. Import/sửa/reset không làm mất lịch sử hoặc tạo side effect ngoài chủ ý.

Các tiêu chí này gần hơn với một MVP dùng được so với bổ sung thêm menu hoặc tăng số connector.

## 7. Đánh giá theo 15 luồng của knowledge map

| Luồng | Hiện trạng có bằng chứng | Phân loại | Điều cần đạt tiếp theo |
|---|---|---|---|
| 01 Nhận/import/bàn giao | Student/Enrollment, preview/mapping/validate/confirm, create request | Có nền; có rủi ro R01/R04/R12/R18 | Định danh và assignment đúng; người duyệt hoàn tất trên UI |
| 02 Xếp lớp/phân công | EnrollmentClass, ClassTeacher, create/transfer | Có nền tốt; cần sửa R05/R06 | Đúng enrollment, hiệu lực và phạm vi lớp/GV |
| 03 Vòng đời lịch | Schedule/session, create/update/cancel, auto | Một phần | Available, ngoại lệ, xác nhận, timezone và occurrence thống nhất |
| 04 Ghi buổi/điểm danh | Hai ý kiến, raw, đối soát, teacher views | Có nền mạnh; cần sửa R02/R03/R07/R11 | Đồng nhất quyền, provisional/final và đường tác nghiệp |
| 05 Quyền lợi/giờ | Tổng buổi/offset/source remaining và attendance | Chưa đủ truy vết tính | Một hợp đồng tiêu thụ/số dư; giờ GV là nghiệp vụ khác |
| 06 Bài/KT/tiến bộ | Report page, metadata, teacher note | Một phần | Tác giả GV, đúng enrollment, bài/lần/thang và sự kiện học |
| 07 Chăm sóc | Task/log/outcome/milestone, care fields | Có nền; chưa chứng minh sinh task đúng mốc | Ba đồng hồ, task/lần tương tác/kết quả và chống lặp |
| 08 Nhắc/thông báo | Workflow/delivery/broadcast, notification | Có phần triển khai rộng | Đúng trigger/target/chính sách và cập nhật khi sửa lịch/đếm buổi |
| 09 Bảo lưu/chuyển/học lại | Status và transfer-class | Một phần | Quyết định có hiệu lực, quyền còn, buổi tương lai và khôi phục |
| 10 Hoàn thành/thi/học tiếp | FINISHED, metadata thi/tái tục | Một phần dữ liệu | Xét theo policy, nhiều kỳ/cấp/lần, giao dịch học tiếp xác minh |
| 11 GV/QC | Teacher profile/User/phân công, công cụ attendance | Có nền GV; chưa thấy QC đủ | Available, rubric/record và kế hoạch cải thiện |
| 12 Báo cáo | Nhiều tab KPI và scope CS/Manage | Có nền; cần sửa R08 | Mẫu số/scope/date/tầng dữ liệu đúng và test được |
| 13 Trực ca/bàn giao | Có thể biểu diễn một phần bằng task/chat | Chưa thấy workflow ca | Giao–nhận–giữ việc–hạn–đóng theo ca và báo cáo |
| 14 Sẵn sàng/tài khoản học | Timestamp trong enrollment; không phải account kênh | Chưa thấy workflow đầy đủ | Checklist/quyền nội dung/lớp kỹ thuật và quyết định dừng phạm vi |
| 15 Offer/giới thiệu | Renewal field, nội dung broadcast | Chưa thấy sổ cơ hội/offer/referral hoàn chỉnh | Theo dõi tư vấn/lần liên hệ/hẹn/đăng ký mới, không chỉ gửi tin |

## 8. Phân biệt lỗi, chính sách chưa chốt và giả thuyết

### 8.1. Có thể kiểm tra/sửa theo contract hiện có, không cần bịa chính sách mới

- Cặp classId/sessionId phải cùng lớp; field note phải đúng side; writer chỉ sửa đúng enrollment/object mà action được phép sửa.
- Không thể dùng sale_name mơ hồ làm nguồn quyền/assignment; dữ liệu thiếu phải khác lịch thật.
- Validation error không được biến thành thành công/rỗng; default view không được tạo lịch xác nhận giả.
- Cùng thay đổi nghiệp vụ phải có downstream được xác định, dù mode import lịch sử có chủ ý không gửi tin.
- Runtime không có dữ liệu phải khác “đã test pass”; bảng quyền/tên route phải khớp source trước khi triển khai.

### 8.2. Cần policy của trung tâm, chưa gọi ngay là bug

| Câu hỏi | Vì sao chưa tự chốt | Bằng chứng nghiệp vụ đã có để thảo luận |
|---|---|---|
| CS được nhìn toàn danh mục lớp không? | Danh mục toàn trường có thể phục vụ xếp lớp | Không đồng nghĩa được đọc mọi note/PII hoặc sửa mọi attendance |
| Một HV có nhiều enrollment/CS cùng lúc không? | Có thể học nhiều chặng/sản phẩm; không áp unique enrollment trên Student | Phải chọn context khi đọc/ghi và xác định người nhận từng loại tin |
| Khi nào trừ A/B/C/D/E, có bù không? | Nguồn Excel còn công thức/hướng dẫn mâu thuẫn | Có cần giữ nguyên bản nguồn và quyết định hiệu lực |
| Chăm buổi 1/3/10 tính theo gì? | Lớp, cá nhân, tổng/năm, tiêu thụ là các đồng hồ khác | Có mẫu dài tới 90 và người vào muộn |
| PAUSED/FINISHED có được nhận tin nào? | Có thể vẫn cần thông tin tài khoản/video/quay lại | Phải phân theo mục đích, không blanket “dừng mọi tin” |
| Resolve CONFLICT có cho CS không? | API hiện có scoped CS; thẩm quyền cuối chưa được user chốt | Tách quyền sửa ý kiến và quyền chốt tranh chấp |
| Dừng toàn tài khoản hay một khóa? | Còn nhiều quyền/video sau lớp | Không nối FINISHED trực tiếp với disable toàn tài khoản |
| Mẫu ưu đãi/hoàn thành nào có hiệu lực? | Các kịch bản là snapshot và có sao chép | Không hardcode số %/SLA vào project từ một ô cũ |

### 8.3. Chỉ là giả thuyết/rủi ro cần test, không được báo như sự cố đã xảy ra

Socket không auth/ownership; campaign nhiều executor gửi trùng; unread LINE tăng do replay; domain email seed không qua validator phiên bản hiện tại; stored-XSS từ upload; dữ liệu sai phân công vì ID trùng số; thiếu nhóm remote dựa count; xóa Student đã phá FK; mọi giao dịch approve bị trùng. Có căn cứ để ưu tiên kiểm tra một số mục, nhưng chưa có bằng chứng runtime xác lập trong bộ khảo sát.

Một số việc ở 09 như refresh token không rotate, secret provisioning mặc định hoặc role string không whitelist là hardening đáng làm. Chúng không thay thế các vấn đề dữ liệu/nghiệp vụ R01–R16 trong kế hoạch; cũng không được tự động coi toàn app đã bị xâm phạm.

## 9. Hướng phát triển đề xuất theo thứ tự phụ thuộc

### Giai đoạn A — Chốt snapshot và đóng đường đọc/ghi sai đối tượng

**Làm:** xác nhận source/commit đang làm; tái hiện R01–R06/R20 bằng fixtures; thống nhất action scope và namespace. Đọc các đường endpoint trước sửa; route/detail/update/nested/field được kiểm độc lập. Bổ sung UI queue approve khi cần để test hành trình nhận dữ liệu hoàn chỉnh.

**Đầu ra:** ma trận role × object × action × field có chứng cứ; source patch và test cho các đường thiếu assertion; report DOC01–DOC10 được hiệu đính. Chưa cần mở rộng connector hoặc sửa toàn bộ schema.

**Cổng hoàn tất:** CS/GV/MANAGE và các role kết hợp thực sự dùng có luồng hợp lệ; request sai scope không đọc/đổi dữ liệu; update một HV không đổi sai lớp/enrollment của người khác.

### Giai đoạn B — Làm cho buổi, số dư, mốc và KPI nói cùng một ngôn ngữ

**Làm:** R07–R11/R13; trace đầy đủ các field count; chốt basis trước khi tự động hóa. Dựng bảng truth table theo trạng thái/phía/nguồn/deleted/session status. Tách dự kiến theo lịch, điểm danh chốt và tiêu thụ quyền; chuẩn timezone/occurrence/cancel và mọi writer.

**Đầu ra:** invariant document ngắn, một pipeline cập nhật nghiệp vụ có origin/mode rõ, truy vết KPI tới field, test bảng đối chiếu độc lập. Không yêu cầu dùng framework mới hoặc rewrite worker.

**Cổng hoàn tất:** cùng fixture và cùng policy tạo cùng số dư/cảnh báo qua manual, import, auto-confirm và Sheet; import lịch sử không gửi ngoài chủ ý; không đếm record deleted/pending như kết quả chốt nếu policy không cho.

### Giai đoạn C — Hoàn tất công việc hằng ngày của CVHT/GV

**Làm:** approval UI; report học tập gắn enrollment và quyền tác giả; timeline/task/hẹn/chăm thực hiện được; errors và partial result hiển thị đúng. Bổ sung minimum handover/checklist sẵn sàng từ task hiện có nếu thuộc MVP đã chốt.

**Đầu ra:** một bộ kịch bản thực hiện được từ onboarding → xếp lớp → ghi buổi hai phía → đối soát → đến mốc → liên hệ → hẹn/đóng việc. Xem được nguồn và bối cảnh trong một hành trình, không phải nhập enrollment ID bằng tay ở mọi bước.

**Cổng hoàn tất:** nhân sự hoàn tất việc qua UI, có dữ liệu đọc lại đúng sau refresh/role switch; không cần API thủ công để thoát khỏi trạng thái chờ duyệt hay lỗi import.

### Giai đoạn D — Hoàn thiện lịch linh hoạt và các biến thể đã có bằng chứng

**Làm:** available GV/nhu cầu HV, lịch nền có hiệu lực, đổi một buổi/chuỗi, nghỉ/bù/dạy thay; gói/chặng và quyền riêng; Kids/PHHS; lộ trình kiểm tra/report theo sản phẩm. Các policy chưa thống nhất được giữ cấu hình/decision, không tự mặc định theo một kịch bản Excel.

**Đầu ra:** workflow lịch có bối cảnh và tác động, số dư có lịch sử, nhóm người nhận/đối tượng phù hợp. Có thể triển khai từng lát 1-1 hoặc nhóm theo nhu cầu, không bắt hoàn thành mọi biến thể cùng lúc.

### Giai đoạn E — Mở rộng vận hành và tự động hóa có kiểm chứng

**Làm:** tài khoản/quyền nội dung theo phạm vi, offer/referral/QC/khảo sát; kiểm chứng delivery/target/cancel/replay và sync/backup end-to-end bằng sandbox/đích được chỉ định. Tối ưu pagination, legacy routes và báo cáo sau khi core semantics ổn.

**Cổng hoàn tất:** mỗi module có trigger, người/đối tượng nhận, quyền thực thi, kết quả và đường xử lý ngoại lệ rõ; không lấy số lượng chức năng hoặc tin gửi thành tiêu chí duy nhất.

### 9.1. Những việc chưa nên ưu tiên trước các cổng A–B

- Tăng số kênh hoặc làm giàu composer trong khi người nhận và event source chưa có contract rõ.
- Thêm chart/leaderboard khi số chốt/pending/auto và mẫu số chưa thống nhất.
- Chuyển mọi trường String/Json thành enum/model trước khi đối chiếu các biến thể thực tế.
- Xóa legacy page hoặc đổi FK hàng loạt chỉ vì báo cáo gọi chúng là thừa/FK mềm; cần biết consumer và migration mapping.
- Tự sửa email/role/DB dev để có tài khoản test mà không phân biệt dữ liệu test và dữ liệu vận hành. Nên dùng fixtures/môi trường kiểm thử riêng.

## 10. Bộ kiểm chứng phải có trước khi gọi một phần là ổn

Các mục dưới đây là **tiêu chí đề xuất**, chưa chạy trong lượt đánh giá này. Test nên tập trung invariant và kết quả nghiệp vụ, không chỉ khẳng định implementation trả đúng giá trị nó tự tạo.

| Mã | Tình huống | Kết quả cần quan sát | Nhóm vấn đề |
|---|---|---|---|
| VT01 | CS-A mở/sửa HV chỉ có enrollment CS-B | Request không vượt policy; không đổi DB ngoài quyền | R01 |
| VT02 | Cùng HV có enrollment A/B khác CS | Xem identity/phần được phép; không đọc/ghi mọi enrollment từ quyền một phần | R01/R05 |
| VT03 | classId hợp lệ của GV + sessionId lớp khác | Không trả attendance/note của lớp kia | R02 |
| VT04 | GV gửi cs_note bằng API trực tiếp | Field bị từ chối hoặc loại đúng policy; không đổi note CS | R03 |
| VT05 | GV chỉ dạy thay buổi cũ thử sửa buổi tương lai khác | Read history và quyền mutation được phân tách đúng | R03/R06 |
| VT06 | Tên Sale là chuỗi con của nhân sự khác | Không tự chọn/giao quyền CVHT mơ hồ | R04 |
| VT07 | Sửa lịch riêng HV-A trong lớp nhóm | Không đổi lịch lớp/HV-B ngoài action tập thể được xác nhận | R05 |
| VT08 | Teacher.id ≠ User.id và có va số giữa hai người | Phân công/đọc/mark nhận đúng danh tính | R06 |
| VT09 | Auto theo lịch tạo record chưa ai xác nhận | Hiển thị provisional; số chốt/mốc/delivery theo policy | R07 |
| VT10 | Pending → matched → conflict → resolved → sửa/reset | Raw/opinion/resolver/status và downstream nhất quán | R07/R09/R11 |
| VT11 | Cùng kết quả nhận qua UI/Excel/Sheet | Count và invariant như nhau; chế độ phát tin lịch sử đúng contract | R09/R18 |
| VT12 | Auto tạo buổi rồi UI/import ghi cùng occurrence | Không nhân đôi buổi; hai buổi thật khác giờ vẫn riêng | R10 |
| VT13 | Hủy/dời buổi; record soft-deleted | Không đếm nghĩa vụ/nhắc sai; lịch sử cũ truy được | R11 |
| VT14 | Filter CS/ngày/package có buổi cuối ngày và dữ liệu deleted | Tử/mẫu và scope đúng, không mất buổi tối | R08 |
| VT15 | Approve một request hai lần hoặc version cũ | Không tạo thêm người/đăng ký; phản hồi conflict rõ | R12 |
| VT16 | Confirm batch một item lỗi giữa chừng rồi retry | Kết quả partial bền vững, không nhân đôi item đã thành công | R12/R18 |
| VT17 | Thiếu giờ/thứ/thời lượng | UI giữ trạng thái thiếu, không filter/sinh buổi theo fallback | R13 |
| VT18 | GV viết report chặng cũ, HV đã có enrollment mới | Đọc lại đúng report/tác giả/chặng; không lộ note CS | R14 |
| VT19 | Count import nhảy qua mốc; giảm rồi tăng lại | Việc/mốc không bị bỏ sót hoặc tạo lặp ngoài policy | R15 |
| VT20 | Một phụ huynh có hai con, nhiều kênh/nhóm | Tin/report gắn đúng HV và mục đích được xác nhận | R16 |
| VT21 | Đổi CS/nhóm/bảo lưu trước lúc delivery chạy | Đánh giá lại target/eligibility, không dùng snapshot sai ngoài chủ ý | R16/R17 |
| VT22 | Hai executor, cancel/retry và webhook lặp | Một hành động hợp lệ, trạng thái và unread/event nhất quán | R17 |
| VT23 | Web edit rồi Sheet reorder/backup/sync lại | Không gắn nhầm care hoặc overwrite ngoài field authority | R18 |
| VT24 | Dữ liệu nhập sai, server error, user list/mark-read/upload fail | Thấy lỗi đúng; không giả rỗng/đã đọc/ảnh đã sẵn sàng gửi | R19 |
| VT25 | Role CS+TEACHER, CS+MANAGE qua các trang | Cùng capability theo backend; side chọn rõ và đúng | R20 |
| VT26 | Class FINISHED nhưng còn quyền video/khóa khác | Quyết định khóa theo phạm vi, giữ cam kết còn hạn | NV tài khoản/quyền |
| VT27 | Gói nửa cấp/15 GV Việt + 15 GV Nhật | Số dư/chặng/GV và mốc theo đúng phạm vi | NV quyền/phân công |
| VT28 | Một vụ việc đi qua ca tối và ca sáng | Có người giữ việc, ack, hạn, hành động và kết quả nhận lại | NV trực ca |
| VT29 | Mở danh sách/detail user/class nhiều lần | Không thay dữ liệu ngoài lệnh normalize/migration được xác nhận | R21 |
| VT30 | Giờ Việt/Nhật, ngày cuối, sát nửa đêm, 29/2 và đổi năm import | Buổi/key/count/hạn có cùng nghĩa thời gian, lỗi nhập được báo rõ | R22 |
| VT31 | Hai con cùng liên hệ phụ huynh và phone/email | Không chặn/gộp người sai; liên hệ và định danh đúng policy | R23 |

## 11. Yêu cầu cho lượt Agent tiếp theo

Thay vì yêu cầu “nghiên cứu toàn bộ một lượt nữa”, lượt sau nên trả kết quả theo từng lát nghiệp vụ và chứng minh bằng các đầu ra sau:

1. **Neo source:** commit trước/sau, đường dẫn thật, route/method, fixture và phạm vi được phép thử. Nếu source đã khác `cbf78c3`, tách thay đổi mới khỏi kết luận của snapshot này.
2. **Mỗi issue một phát biểu kiểm được:** ví dụ “GV sửa cs_note được qua route X” với request/response fixture và DB diff; không chỉ “cần tăng bảo mật”.
3. **Truy vết đường ghi:** UI/form → schema/controller → service → repository → field → count/task/delivery/export. Truy vết cả create/update/import/reset chứ không một đường đại diện.
4. **Báo tác động đúng đối tượng:** identity HV, enrollment, lớp dùng chung, occurrence, người thực dạy, quyền còn và người nhận thông báo. Không dùng row position/tên Sale thay ID.
5. **Test có phản ví dụ:** ngoài happy path phải có khác CS, sai lớp/session, nhiều enrollment, buổi auto chưa xác minh, canceled/deleted, retry và role kết hợp.
6. **Kết quả trung thực:** ghi đã chạy gì, pass/fail gì, phần nào chưa chạy; không lấy build/lint hoặc schema tồn tại để nghiệm thu luồng con người.
7. **Cập nhật tài liệu theo code đã chứng minh:** sửa DOC01–DOC10 và ma trận 08/10; không cập nhật chỉ file 09 trong khi 05a vẫn mô tả hành vi trái nhau.

Đây là yêu cầu đánh giá/triển khai tiếp theo, không phải thông báo rằng các bước trên đã được thực hiện trong lượt này.


## 12. Đối chiếu đủ 74 thao tác của knowledge map V2

Mỗi dòng đối chiếu với **một thao tác logic**, không yêu cầu một màn hình hoặc bảng riêng. “Có nền” nghĩa bộ khảo sát chỉ ra cấu trúc/code/UI liên quan; **mọi dòng vẫn chưa được coi đã nghiệm thu runtime**. “Chưa thấy” nghĩa chưa có đủ bằng chứng trong bộ 14 báo cáo, không phải đã chứng minh toàn repo không có.

### Tổng quan

| ID / thao tác | Trạng thái theo bằng chứng | Phần đang có | Nguồn khảo sát | Cần bổ sung/sửa |
|---|---|---|---|---|
| OV01 — Xem tình hình HV theo sản phẩm/CVHT/trạng thái | Có nền, cần sửa | Dashboard theo program/CS/status | 05a §13/16; 06 A3 | R08: scope, date, tử/mẫu và tầng attendance |
| OV02 — Xem việc cần làm | Có một phần | CareTask list/overdue/performance | 05b §2; 06 B4 | Mốc đến hạn, quyền nhận việc và tiêu chí hoàn tất |
| OV03 — Xem lịch học và phát sinh | Có một phần | Classes/sessions/teacher sessions | 05a §6–9; 06 C3–8 | Thay đổi có xác nhận và các bên bị ảnh hưởng |
| OV04 — Xem học tập/rủi ro | Có một phần | At-risk theo care log, conflict/pending | 06 A3/C6; 07 L6 | R07/R15: rủi ro học tập, chuỗi và task đúng căn cứ |
| OV05 — Xem lớp cần chú ý | Có một phần | Class matrix và một số KPI tổng | 06 C3; 05a §13 | Xác minh có xếp hạng lớp đúng mẫu số và bối cảnh hay chưa |
| OV06 — Xem quyền lợi/cam kết | Có một phần | near_completion và fields số còn | 03 Enrollment; 06 A3 | R07/R08: số dư hợp lệ; cam kết/video chưa được chứng minh |
| OV07 — Xem báo cáo kỳ | Có nền, cần sửa | Dashboard tabs, date/preset và pivot | 05a §13/16; 06 A3 | Phân biệt hoạt động/cohort/snapshot; giữ phạm vi thiếu dữ liệu |
| OV08 — Xem độ đầy đủ nguồn | Có một phần | Batch/error/row-state, issue thiếu lịch | 03 Imports/RowState; 05a §10 | Tổng hợp độ đầy đủ và xung đột, không che thành 0 |
| OV09 — Xem bàn giao và việc theo ca | Chưa thấy workflow | Có task/note làm nền, không thấy sổ ca | 05b §2; 06 B4 | Bổ sung ca gửi/nhận, chủ giữ việc, hạn và kết quả |
| OV10 — Xem tài khoản/quyền truy cập đến kỳ | Chưa thấy workflow | Có account_created_at, không thấy rà tài khoản học | 03 Enrollment; 06 B1 | Tài khoản LMS/quyền khóa khác account Zalo/LINE và User |

### CVHT / Chăm sóc

| ID / thao tác | Trạng thái theo bằng chứng | Phần đang có | Nguồn khảo sát | Cần bổ sung/sửa |
|---|---|---|---|---|
| CS01 — Nhận/đối chiếu hồ sơ bàn giao | Có nền, cần sửa | Create/import/preview/request | 05a §3; 05b §3; 06 E | R01/R04/R12/R18/R23: ID, CS, duyệt và shared contact |
| CS02 — Hoàn thiện intake | Có một phần | Hồ sơ, status và mốc bàn giao | 03 Enrollment; 06 B1 | Checklist đủ/thiếu và sẵn sàng tổ chức học |
| CS03 — Quản lý liên hệ/phụ huynh | Có một phần dữ liệu | Parent/school xuất hiện ở form; Contact kênh; lưu metadata cần trace | 03 Student/Contact; 06 B1 | Vai trò liên hệ nhiều HV và mục đích nhận thông tin |
| CS04 — Xem hành trình HV | Có nền, cần sửa | Hai tab Student, report, enrollments/matrix | 06 B1–3 | R05/R14: đọc đúng chặng/lần tham gia và timeline |
| CS05 — Đề nghị/tổ chức xếp lớp | Có nền, cần sửa | Tạo HV có lớp/lịch, transfer enrollment | 05a §3/11 | Không sửa lớp chung từ lịch cá nhân; xác nhận phạm vi |
| CS06 — Theo dõi mốc chăm | Có một phần | Milestone config/cột động và CareLog | 03 CareMilestoneConfig; 07 L6 | R15: basis/product/version/đạt mốc/sinh task/chống lặp |
| CS07 — Ghi một lần liên hệ | Có nền | CareLog tạo/đọc theo enrollment, có content/outcome | 05b §2; 06 B4 | Thêm người nhận/kênh/kết quả/việc tiếp khi cần nghiệp vụ đầy đủ |
| CS08 — Tạo/đổi lịch hẹn | Có nền, cần sửa | CareTask due_at, CALLBACK từ care field | 03 CareTask; 05b §2 | Due có cấu trúc, transition và không lặp task khi save lại |
| CS09 — Xác minh cảnh báo | Có một phần | Reconciliation/AtRisk và nội dung trao đổi | 05a §9; 06 A3/C6 | Nguyên nhân đã xác minh và hành động, không chỉ tín hiệu |
| CS10 — Xử lý/chuyển hỗ trợ | Có một phần | HOT_ISSUE/FOLLOW_UP/priority/status | 03 CareTask; 05b §2 | Người giữ việc, chuyển bộ phận, chờ và kết quả xác nhận |
| CS11 — Đề nghị bảo lưu/chuyển/học lại | Có một phần | Đổi status/transfer-class | 05a §3/11; 07 L3 | Quyết định, hiệu lực, quyền còn và ảnh hưởng buổi/nhắc |
| CS12 — Theo dõi cam kết/quà | Chưa thấy workflow | Có sales_note/report/exchange làm nguồn | 03 Enrollment; 06 B1 | Cam kết/quà: điều kiện, hạn, chủ thực hiện và đã bàn giao |
| CS13 — Tư vấn học tiếp | Có một phần dữ liệu | Renewal trong UI/program metadata | 06 B1/Preferences | Sổ cơ hội, phương án, phản hồi, đăng ký mới xác minh |
| CS14 — Theo dõi thi/kết quả | Có một phần dữ liệu | Kỳ/điểm/kết quả/test fields JLPT | 06 B1; 03 program_metadata | Kỳ/cấp/lần thi và trạng thái dự thi/không phản hồi |
| CS15 — Bàn giao CVHT mới | Có nền, cần sửa | Assign CS endpoint | 05a §11; 07 L3 | Chốt method, scope đích và bàn giao việc/hẹn đang mở |
| CS16 — Nhận và bàn giao ca | Chưa thấy workflow | Task/chat làm nền, không có luồng ca được mô tả | 05b §2; 06 B4/D5 | Giao–nhận ca và trách nhiệm tiếp tục |
| CS17 — Tiếp nhận và chuyển xử lý theo thời hạn | Có một phần nền | Task priority/due, inbox | 03 CareTask; 06 B4/D5 | Đồng hồ ack/resolve, phân loại và escalation |
| CS18 — Kiểm tra sẵn sàng học trên hệ thống | Chưa thấy workflow | Có timestamp tài khoản, report link | 03 Enrollment; 06 B1 | Checklist thiết bị/login/khóa/học liệu/thao tác thử |
| CS19 — Chăm trong giai đoạn chờ lớp | Chưa thấy workflow | Có metadata/test, chưa thấy bài ôn theo tuần lúc chờ | 03/06 B1–2 | Theo nhu cầu F07 JLPT CS, không giả định LMS đã tích hợp |
| CS20 — Theo dõi offer và lần liên hệ | Chưa thấy workflow | Renewal fields và broadcast không đủ thay offer | 06 B1/D10 | Phương án/ưu đãi hiệu lực/hẹn đóng/lần liên hệ/kết quả |
| CS21 — Theo dõi giới thiệu HV | Chưa thấy workflow | Không có sổ giới thiệu được mô tả | 03/07/06 | Quan hệ giới thiệu/chương trình/điều kiện xác minh |
| CS22 — Chăm Kids và phụ huynh | Có một phần dữ liệu | Parent/school ở form chung; phần lưu cần trace | 06 B1 | Biến thể Kids, PHHS và policy phạm vi |
| CS23 — Khảo sát chéo chất lượng | Chưa thấy workflow | Chưa có khảo sát độc lập được mô tả | 03/06/07 | Khảo sát chéo, người thực hiện, kết quả và việc tiếp |
| CS24 — Đóng việc cuối ngày và giao ca tối | Chưa thấy workflow | Task có thể giữ việc nhưng chưa có chu trình ca | 05b §2; 06 B4 | Việc tồn/ca nhận/chủ giữ việc/đối chiếu sáng hôm sau |

### Đào tạo và lớp học

| ID / thao tác | Trạng thái theo bằng chứng | Phần đang có | Nguồn khảo sát | Cần bổ sung/sửa |
|---|---|---|---|---|
| TR01 — Quản lý sản phẩm/gói/chặng | Có một phần | Package CRUD và default_total_sessions | 03 Package; 05a §5; 06 C1 | Thành phần combo/chặng/quyền, không suy từ mã |
| TR02 — Quản lý lộ trình phiên bản | Chưa thấy đầy đủ | Level/model/schedule, metadata học tập | 03 training; 06 B1/C1 | Danh mục bài/mốc/thang/lộ trình có phiên bản |
| TR03 — Tạo/cập nhật lớp | Có nền | Class CRUD và model/source | 05a §6; 06 C3 | Class lifecycle, dữ liệu thiếu và tách object kỹ thuật |
| TR04 — Xếp/chuyển HV | Có nền, cần sửa | EnrollmentClass history và transfer transaction | 03/04; 05a §11 | Scope, trạng thái và hiệu lực/đầu ra cho buổi tương lai |
| TR05 — Phân công/đổi/dạy thay GV | Có nền, cần sửa | ClassTeacher MAIN/ASSISTANT/SUBSTITUTE | 03/04; 05a §6/7 | R06: ID, scope theo buổi và khoảng hiệu lực |
| TR06 — Chốt lịch 1-1 | Có một phần | 1-1 class/schedule/session/LKCD | 03 ClassSchedule; 05a §10 | Available/nhu cầu/xác nhận/đổi lịch cá nhân |
| TR07 — Chốt lịch lớp nhóm | Có nền, cần sửa | Class nhiều enrollment và session chung | 03/04; 06 C3/C9 | Nghĩa vụ từng HV và tránh sửa cả lớp qua Student |
| TR08 — Xử lý đổi/nghỉ/bù | Có một phần | CRUD/cancel session và A–E | 05a §7–9 | Yêu cầu/duyệt, buổi thay, quyền bù và nhắc hiện hành |
| TR09 — Kiểm tra nhật ký/điểm danh | Có nền mạnh, cần sửa | Hai ý kiến, conflict/pending/history/resolve | 05a §8/9; 06 C5–8 | R02/R03/R07/R09/R11: đúng quyền/nguồn/state/downstream |
| TR10 — Quản lý bài tập/kiểm tra | Có một phần | Report/test score fields/metadata | 06 B1/B2 | Bài giao/lần nộp/lần làm/thang và teacher write contract |
| TR11 — Xem tiến bộ/đánh giá | Có nền, cần sửa | StudentStudyReportPage nhiều tiêu chí | 06 B2 | Gắn enrollment/mốc/tác giả và đọc lại; quyền GV |
| TR12 — Xét hoàn thành/học lại | Chưa thấy workflow hoàn chỉnh | FINISHED và một số điểm/kết quả | 03 Enrollment; 06 B1 | Bản policy và giải thích đủ/chưa đủ điều kiện |
| TR13 — Điều chỉnh quyền học | Có một phần fields | total/previous/external_remaining | 03 Enrollment; 08b Q7 | Phát sinh/điều chỉnh/quy đổi có nguồn và hiệu lực |
| TR14 — Đối soát buổi/giờ | Có một phần nền | Attendance/reconciliation, không phải ledger giờ/lương | 03 Attendance; 05a §8/9 | Tách giờ GV/quyền HV và chính sách từng kết quả |
| TR15 — Mở/khóa lớp trên nền tảng | Chưa được chứng minh | Class nội bộ có attendance_source | 03 Class; 06 C3 | Mở/khóa lớp trên LMS/Zoom và tham chiếu lệnh được xác minh |
| TR16 — Cấp/kiểm tra quyền khóa và video | Chưa thấy workflow | Không có quyền LMS/khóa/video đủ trong khảo sát | 03 Enrollment; 06 B1 | Cấp/dừng nội dung theo gói/cam kết và đối chiếu quyền còn |
| TR17 — Lấy và bàn giao record | Chưa thấy workflow | Report URL không tự là record từng buổi | 03 Enrollment; 06 B2 | Record gắn buổi, quyền nhận, sử dụng cho học/QC |
| TR18 — Xử lý lỗi bài/nội dung và yêu cầu reset | Chưa được chứng minh | Có reset attendance, khác reset bài LMS | 05a §8; 06 C5/C9 | Quyền sửa/reset bài, phiên bản/lần làm và kết quả gốc |

### Giáo viên

| ID / thao tác | Trạng thái theo bằng chứng | Phần đang có | Nguồn khảo sát | Cần bổ sung/sửa |
|---|---|---|---|---|
| GV01 — Đăng ký/sửa available | Chưa thấy | ClassSchedule là lịch lớp, không phải available GV | 03 Teacher/ClassSchedule; 06 C2/C7 | GV đăng ký khung rảnh, timezone, hiệu lực và ngoại lệ |
| GV02 — Xem lịch và roster | Có nền, cần sửa | Teacher sessions/tracking và roster | 05a §9/15; 06 C7/C8 | Scope buổi/phân công, context đúng và tránh route 410 cũ |
| GV03 — Ghi nhận sau buổi | Có nền | Teacher mark, lesson_topic/note/raw/time | 03 Attendance; 05a §8/9 | Đúng GV thực dạy/actor và buổi, lưu qua mọi bề mặt |
| GV04 — Điểm danh HV | Có nền, cần sửa | Teacher opinion/mark/import/reconciliation | 05a §8/9; 06 C7–9 | R03/R06/R07/R20: capability/side và kết quả chốt |
| GV05 — Giao/ghi nhận bài | Có một phần dữ liệu | Report/notes có nội dung học tập | 06 B2/C7 | Chưa chứng minh thao tác GV giao/nộp/chấm bài native |
| GV06 — Nhập điểm KT/lần làm | Có một phần dữ liệu | Điểm test qua metadata/form CS | 06 B1/B2 | Lần làm/thang và quyền GV nhập/sửa đúng scope |
| GV07 — Điền báo cáo tiến bộ | Có report, thiếu luồng GV | Report route A/M/CS, lưu Students update | 06 B2; 05a §3 | R14: báo cáo do GV điền theo enrollment/chặng |
| GV08 — Báo vấn đề/yêu cầu đổi | Có một phần | Note/status và notification của GV | 05a §8; 05b §2; 06 C7 | Yêu cầu/vấn đề/lịch cần điều phối, không chỉ note rời |
| GV09 — Sửa/đối soát kết quả | Có nền, cần sửa | Teacher-mark/audit/history/reset | 05a §8/9; 06 C8/C9 | Chốt/sửa có lý do và effects nhất quán |
| GV10 — Xem QC/phản hồi | Chưa thấy workflow QC | Teacher profile/type không là rubric QC | 03 Teacher; 06 C2 | Rubric/record/người đánh giá/phản hồi và việc cải thiện |
| GV11 — Báo/tiếp nhận sự cố vào lớp | Có một phần | A–E/note phản ánh sự cố, chưa có quy trình nhận ca | 05a §8; 06 C7 | Báo chưa vào lớp, xác minh, người tiếp nhận và kết quả |
| GV12 — Hoàn tất chấm và báo cáo đến nhịp | Chưa được chứng minh | Tracking hiện là attendance, không là backlog chấm bài | 06 C8; 07 L6 | Nhịp 3/10 buổi, báo cáo/chấm còn thiếu và theo dõi hoàn tất |

### Quản trị / dữ liệu / chuyên môn

| ID / thao tác | Trạng thái theo bằng chứng | Phần đang có | Nguồn khảo sát | Cần bổ sung/sửa |
|---|---|---|---|---|
| AD01 — Duy trì danh mục chuẩn | Có nền, cần mở rộng | Package/role/model/milestone/settings và mapping | 03/05a/05b | Danh mục nguồn và phiên bản có phạm vi, không ép mọi string thành enum |
| AD02 — Duy trì nguồn liên kết | Có nền, chưa E2E | Sheet config/batch/row-state/account sync | 05b §3/5/6; 06 D13/E | OAuth/đích, thời điểm cập nhật và nguồn lỗi được kiểm chứng |
| AD03 — Đối chiếu ID/khóa | Có một phần | external_id/sync_key/raw_data, matcher | 03/08b; 07 L7/L10 | Định danh enrollment/nguồn mơ hồ, người xác nhận mapping |
| AD04 — Quản lý chính sách hiệu lực | Có một phần settings | Auto delay/enabled, limits kênh | 03 AppSetting; 05a §10 | Policy trừ buổi/bù/hoàn thành/SLA có hiệu lực |
| AD05 — Phân quyền và phạm vi | Có nền, cần sửa | Roles/guards/CSGroup/ManageAssignment | 05a/05b/08 | R01–R06/R20; trace giao diện/API ghi group/member/assignment |
| AD06 — Phê duyệt ngoại lệ | Có một phần | ImportCreateRequest approve/reject và resolve | 03/05a §9; 05b §3 | UI duyệt, phạm vi decision, version và lý do |
| AD07 — Chấm và theo dõi QC | Chưa thấy workflow | Chưa có rubric/QC source trong khảo sát | 03/06/07 | Bản rubric, bằng chứng, người chấm và vòng cải thiện |
| AD08 — Kiểm tra lịch sử sửa/chốt | Có nền, cần sửa | Audit before/after, import/execution logs | 03 Audit; 05a §8/9 | Coverage mọi writer/sửa sau chốt và xem lịch sử đúng quyền |
| AD09 — Duyệt và thực hiện rà soát tài khoản tháng | Chưa thấy workflow | User disable khác tài khoản học/LMS | 05a §2; 03 Enrollment | Duyệt/thực hiện theo kỳ, phạm vi quyền và kết quả |
| AD10 — Duy trì biến thể và hiệu lực quy trình | Chưa thấy đầy đủ | Có program_type/metadata, mốc chung | 03 Enrollment/Milestone; 06 B1 | Biến thể sản phẩm/Kids/lộ trình và chính sách có hiệu lực |


## 13. Các kết luận không nên rút ra từ bộ khảo sát này

- Không có cơ sở nói project hoàn thiện một tỷ lệ phần trăm cụ thể, hoặc đã “sẵn sàng production”.
- Không gọi toàn bộ module có route/schema là đã làm ổn; cần phân biệt có triển khai, có test hành vi và người dùng hoàn tất việc được.
- Không coi mọi mục trong 09 là bug runtime; cũng không bỏ qua các lỗi có dẫn chứng chi tiết ở 05a chỉ vì chưa vào 09.
- Không yêu cầu rewrite app, đổi stack, thay DB/queue hoặc tạo đủ 48 model để phù hợp knowledge map. Các khái niệm có thể được biểu diễn qua model hiện tại, JSON có schema, history hoặc task nếu bảo toàn đúng quan hệ.
- Không suy CS nhìn toàn danh mục lớp là vi phạm khi chưa chốt policy; nhưng quyền đọc chi tiết/ghi field ngoài phạm vi phải được kiểm độc lập.
- Không xóa raw, hai ý kiến, lịch sử chuyển lớp hoặc lỗi nguồn để làm sạch KPI.
- Không coi FINISHED là hoàn thành học tập, một ô còn lại là sổ quyền lợi đầy đủ, một form là đủ workflow, một MessageDelivery là toàn bộ lần chạy workflow.
- Không đồng nhất User nội bộ/tài khoản Zalo–LINE với tài khoản LMS của HV.
- Không áp các con số ưu đãi, hạn báo nghỉ hoặc SLA từ kịch bản cũ thành chính sách hiện hành khi chưa chọn bản hiệu lực.

## 14. Nguồn báo cáo và cách truy vết

Các dẫn `03`, `05a`, `06 B2`… trong tài liệu là mã báo cáo và section của bộ ZIP, không phải xác nhận người đánh giá đã mở được repository ở đường dẫn code. Các đường source file:line trong báo cáo được giữ làm đầu mối cho Agent tái hiện ở commit đang làm.

| Mã | File nguồn |
|---|---|
| 00 | [00-pham-vi-va-phuong-phap.md](sandbox:/workspace/scratch/51c910380267/analysis/project_survey/khao-sat/00-pham-vi-va-phuong-phap.md) |
| 01 | [01-ban-do-chuc-nang.md](sandbox:/workspace/scratch/51c910380267/analysis/project_survey/khao-sat/01-ban-do-chuc-nang.md) |
| 02 | [02-vai-tro-thuc-the-thuat-ngu.md](sandbox:/workspace/scratch/51c910380267/analysis/project_survey/khao-sat/02-vai-tro-thuc-the-thuat-ngu.md) |
| 03 | [03-tu-dien-du-lieu.md](sandbox:/workspace/scratch/51c910380267/analysis/project_survey/khao-sat/03-tu-dien-du-lieu.md) |
| 04 | [04-quan-he.md](sandbox:/workspace/scratch/51c910380267/analysis/project_survey/khao-sat/04-quan-he.md) |
| 05a | [05a-api-đào-tạo-và-nền-tảng.md](sandbox:/workspace/scratch/51c910380267/analysis/project_survey/khao-sat/05a-api-đào-tạo-và-nền-tảng.md) |
| 05b | [05b-api-chăm-soc-omnichannel.md](sandbox:/workspace/scratch/51c910380267/analysis/project_survey/khao-sat/05b-api-chăm-soc-omnichannel.md) |
| 06 | [06-dac-ta-man-hinh-ui.md](sandbox:/workspace/scratch/51c910380267/analysis/project_survey/khao-sat/06-dac-ta-man-hinh-ui.md) |
| 07 | [07-luong-nghiep-vu.md](sandbox:/workspace/scratch/51c910380267/analysis/project_survey/khao-sat/07-luong-nghiep-vu.md) |
| 08 | [08-ma-tran-phan-quyen.md](sandbox:/workspace/scratch/51c910380267/analysis/project_survey/khao-sat/08-ma-tran-phan-quyen.md) |
| 08b | [08b-ma-tran-truy-vet.md](sandbox:/workspace/scratch/51c910380267/analysis/project_survey/khao-sat/08b-ma-tran-truy-vet.md) |
| 09 | [09-loi-va-cau-hoi.md](sandbox:/workspace/scratch/51c910380267/analysis/project_survey/khao-sat/09-loi-va-cau-hoi.md) |
| 10 | [10-bao-phu-khao-sat.md](sandbox:/workspace/scratch/51c910380267/analysis/project_survey/khao-sat/10-bao-phu-khao-sat.md) |
| README | [README.md](sandbox:/workspace/scratch/51c910380267/analysis/project_survey/khao-sat/README.md) |


Nghiệp vụ đối chiếu: [Knowledge Map Edura V2](sandbox:/workspace/scratch/51c910380267/outputs/Edura_Business_Knowledge_Map_Detail.md), phạm vi 8 workbook/88 sheet. Các workbook gốc không bị chỉnh sửa. Bản knowledge map cũng không bị ghi đè bằng các kết luận code của lượt này: đây là **báo cáo đối chiếu hiện trạng triển khai riêng**, để giữ được khác biệt giữa nghiệp vụ mong muốn và phần app đã có.

**Kết luận sử dụng:** nên tiếp tục phát triển trên nền hiện tại với thứ tự A → B → C, đồng thời chọn các lát D/E theo nhu cầu. Việc quan trọng nhất tiếp theo là chứng minh một luồng đúng người–đúng đăng ký–đúng lớp/buổi–đúng quyền–đúng kết quả, thay vì tăng số màn hình hoặc connector.
