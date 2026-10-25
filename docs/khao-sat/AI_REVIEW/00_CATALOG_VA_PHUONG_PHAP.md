# AI_REVIEW — Catalog nguồn, phạm vi và phương pháp

**Ngày:** 2026-10-24  
**Baseline code:** nhánh `main`, commit `cbf78c337b8ff534a6d9b3ea5d63cf626cd44b17`  
**Mục tiêu:** kiểm chứng chéo nhu cầu đào tạo/chăm sóc với code hiện tại; chưa sửa application code, schema, dữ liệu, config hoặc kích hoạt automation.

## 1. Nguồn đã đọc

| Nguồn | Vai trò | Phạm vi/độ tin cậy | SHA-256 hoặc định danh |
|---|---|---|---|
| `Folder các file của CSHV-20261024T073104Z-1-001.zip` | Bằng chứng workbook | 8/8 workbook, 88/88 sheet, gồm 12 sheet hidden; đọc trực tiếp bằng `zipfile` + `openpyxl 3.1.5`; không tính lại công thức, không fetch link | `42e1f8211ef9dfdd65a86a47bb7aa5dbf4a9d8cbba43a95fa311526b9a0ce7d2` |
| `Edura_Business_Knowledge_Map_Detail (1).md` | Tổng hợp tri thức nghiệp vụ | Dẫn chiếu 8 workbook/88 sheet; tự phân biệt `[E]`, `[U]`, `[I]`, `[?]`; không xem đề xuất là yêu cầu đã duyệt | `423608c46fb07d870584e18974039d9681fb1b9dfedd396b0bd9a18c857a306a` |
| `Edura_Project_Review_and_Development_Direction.md` | Review trước đây | Đầu vào cần adjudicate, không phải sự thật mặc định; nhiều claim trỏ snapshot khảo sát cũ | `117f490621ed050f7c6f2c5b1eb452590dc90d759423f69abcdcdf14151c89fe` |
| `01_BANG_CHUNG_EXCEL.md` | Kết quả inventory workbook | Catalog sheet/range/formula/cache/link/comment/validation và giới hạn đọc | File trong thư mục này |
| `02_HIEN_TRANG_DAO_TAO.md` | Trace code đào tạo | Schema + UI/API/service/repository + alternate writers | File trong thư mục này |
| `03_DOI_CHIEU_REVIEW_VA_LIEN_PHAN_HE.md` | Adjudication | Đối chiếu review với code, phân loại claim, hiệu đính concurrency/authority | File trong thư mục này |
| `docs/khao-sat/00..10` | Khảo sát project trước | Dùng làm bản đồ và dẫn chứng cần kiểm tra; không dùng số liệu snapshot như runtime hiện tại | Các file trong `docs/khao-sat/` |
| `docs/product/business-rules.md` | Registry rule sản phẩm | Có rule chốt về attendance/entitlement; đang mâu thuẫn trạng thái với `OPEN_QUESTIONS.md` ở Q-004/Q-008 | Nguồn trong repo |
| `docs/OPEN_QUESTIONS.md` | Registry quyết định | Q-001..Q-013 đều ghi RESOLVED; Q-004/Q-008 và wording Q-009 cần đối chiếu với business-rules | Nguồn trong repo |

**Loại trừ theo yêu cầu (đã thu hẹp đúng phạm vi):** việc loại trừ CHỈ áp dụng cho tài liệu có đích danh tên “Mẫu tin nhắn và quy trình tự động”. **Không** tự động loại toàn bộ sheet tên “Kịch bản” — các sheet onboarding/`Kịch bản tiếp nhận ca tối`/JLPT CS/Kids trong W1 vẫn phải rà ý nghĩa vận hành, chỉ không được dùng để suy chính sách soạn tin nhắn tự động. Báo cáo 01 đã được cập nhật để tách “đã quét inventory 88 sheet” khỏi “đã phân tích đủ ý nghĩa nghiệp vụ”

## 2. Cách phân loại claim

- **BC-NV / business-doc:** workbook hoặc knowledge map cho thấy nhu cầu, thao tác, công thức hoặc quy trình. Không chứng minh code đã đáp ứng.
- **BC-CODE / current-code:** đọc trực tiếp source/schema/UI tại baseline và chỉ ghi điều quan sát được.
- **BC-RT-CŨ:** snapshot runtime/DB từ khảo sát cũ; không coi là test hiện tại.
- **AGENT-ONLY:** nhận định của agent/review chưa có source/test độc lập; không nâng thành kết luận.
- **ĐC-NV:** phán quyết của lượt này khi ghép nhu cầu nghiệp vụ với code.
- **CXM:** cần runtime, integration test, dữ liệu thật/fixture hoặc quyết định policy; không phải lỗi đã tái hiện.
- **[PC-USER]:** nguyên tắc chủ dự án nêu trực tiếp trong lượt 24/10 (đã ghi nhận vào yêu cầu, **không** còn phải hỏi lại phần đã rõ); vẫn tách khỏi **[ĐỀ-XUẤT]** của thiết kế để tránh biến đề xuất thành quy tắc.

Mỗi kết luận trong báo cáo tổng hợp được gắn một trong năm trạng thái:

1. **kept-good:** nền tảng nên giữ.
2. **needs-completion:** đã có một phần nhưng chưa khép hành trình hoặc chưa cùng contract.
3. **evidence-wrong:** claim trước đây không đúng hoặc diễn đạt quá rộng khi đối chiếu code.
4. **insufficiently-implemented:** code có thành phần nhưng chưa đủ để đáp ứng nhu cầu đã có bằng chứng.
5. **inconclusive:** chưa đủ bằng chứng để chọn kết luận/policy.

## 3. Kiểm tra đã thực hiện trong lượt này

- Đọc trực tiếp ZIP và kiểm lại tổng 88 sheet/12 hidden; không phát hiện veryHidden.
- Kiểm XML công thức/cache, hyperlink/provenance, comments, validations và giới hạn không tính lại/fetch.
- Đọc code/schema về `Enrollment`, `ClassSession`, `Attendance`, reconciliation, auto-attendance, imports, sheet sync, broadcast template và automation trigger.
- Kiểm lại `ClassSession.teacher_id` create: có validate `User.id` và role `TEACHER`; update không lặp validation.
- Kiểm lại `LineMessage @@unique([conversation_id,line_msg_id])` và upsert: không kết luận redelivery tạo duplicate message row.
- Kiểm lại công thức session/remaining ở automation trigger, sheet backup và broadcast: xác nhận chúng không cùng calculator.
- Không chạy app/test/DB/cron/worker/browser; không đăng nhập, không ghi/xóa dữ liệu, không gửi Zalo/LINE, không fetch Google Sheets/hyperlink.

## 4. Giới hạn cần giữ trong mọi báo cáo

Excel có cached formula không chứng minh công thức vừa tính hoặc đúng. `IMPORTRANGE`, `QUERY`, `FILTER`, `REDUCE`, `VSTACK`, hyperlink và nhãn synced chỉ là dấu vết nguồn/provenance; chưa chứng minh link còn sống, quyền truy cập hoặc sync thành công. Planned/available không đồng nghĩa buổi đã chốt; code chạy được không đồng nghĩa quy trình nghiệp vụ đúng. Không dùng số lượng bản ghi để kết luận misassignment. Không tự biến một khoảng trống trong một file thành “chưa triển khai toàn hệ thống”.

Các thay đổi/untracked có sẵn trong working tree (migration sheet sync, script reset password, `docs/khao-sat`, `docs/khao-sat.zip`, `scratch/`, tsbuildinfo) không được dùng làm bằng chứng migration đã deploy; các báo cáo mới là deliverable tài liệu, không phải thay đổi application.

## 5. Bổ sung lượt 24/10 (nguyên tắc mới của chủ dự án)

**Nguồn mới:** phát biểu trực tiếp của chủ dự án về 1-1 linh hoạt, GV tự ghi ca thực học (kể cả ngoài lịch/chưa có session), hai ca cùng ngày hợp lệ, lớp nhóm một buổi nhiều HV, lịch dự kiến không phải bằng chứng học/vắng, ba luồng công việc có trạng thái hoàn thành độc lập, Admin phân xử. Lưu vào `06_DAC_TA_LUONG_VAN_HANH_GV_CVHT_ADMIN.md`; cập nhật vào dòng 3/4/5/7/8/9/10/11/14/15/18 của `04_...md` và toàn bộ `05_...md`.

**Không tự coi là đã chốt (theo đúng chỉ đạo):** cách tính mọi mốc, quy đổi thời lượng→quyền học, hạn nhập/sửa lịch sử, ủy quyền MANAGE phân xử. Bốn điểm này vẫn giữ nhãn [CHƯA CHỐT]/[CXM], có phân tích phương án trong `06 §5` và `05 §D`.

**Kiểm chứng thêm trong lượt này (read-only, code):** `class-sessions.routes.ts:18` mở POST session cho TEACHER; `MyTeachingSessionsPage.tsx:137-142` chặn mark khi chưa có attendance sẵn (báo “liên hệ CSKH”); `attendance.repository.ts:6` bỏ qua `classId`; `reconciliation.routes.ts:91` + `reconciliation.service.ts:314` cho MANAGE/CS resolve; `imports.routes.ts:18` mở export 4 role nhưng service chỉ lọc CS; `class-sessions.repository.ts:74-95` hard-delete attendance khi xóa session. Không chạy app/DB, không kết luận incident dữ liệu thật.

**Đóng lượt:** nhận đủ output 01/02/03; rà consistency 00–06 và README. Source hashes khớp; không application test/runtime mới. Line-count không là semantic coverage. Quyền xét phân công tại ngày dạy là yêu cầu trực tiếp của user; chỉ historical window/override và bằng chứng assignment cũ còn cần chốt.
