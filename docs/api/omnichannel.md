# Omnichannel groups — 2026-11-20

## Program-specific care groups and configurable naming

- Liên kết nhóm phân biệt KAIWA/JLPT bằng `program_type` trên ZaloContactRelation/LineContactRelation; unique student + account + program. `ALL` giữ liên kết cá nhân/legacy, GROUP legacy không tự coi là đúng cho cả hai chương trình; cần xác nhận. Không xóa/đổi nhóm cũ khi migrate hoặc lưu quy tắc.
- Mẫu mặc định Kaiwa: `{csNumber} - {studentId} {studentName}`. JLPT: `{csNumber} - {studentId} {studentName} {level}`. `{level}` chỉ nhận diện hậu tố JLPT trong danh sách ghi chú cấu hình, không so với Enrollment.level và không chọn một nhóm N3/N4 theo trình độ. Có nhiều ứng viên cùng CS + mã HV + chương trình thì báo mơ hồ, không chọn nhóm đầu. Chỉ match trên tài khoản của CS đang phụ trách; liên kết MANUAL không bị auto ghi đè.
- `GET /api/v1/omnichannel/care-group-rules`: ADMIN/MANAGE/CS đọc `{data:{kaiwaTemplate,jlptTemplate,jlptNotes,enabled,updatedAt}}`. Cấu hình toàn hệ thống, lưu AppSetting, có audit. `PUT` chỉ ADMIN/MANAGE, body config + `expectedUpdatedAt` để chống ghi đè, trả 409 nếu phiên bản đã đổi; không tự sync/link/rename/send khi lưu.
- `POST /api/v1/omnichannel/care-group-rules/preview`: ADMIN/MANAGE, body `{config,groupName}`; validate cùng schema save, trả program/csNumber/studentId/levelNote hoặc null. Không ghi DB/đụng SDK.
- API liên kết Zalo/LINE nhận thêm `program_type=KAIWA|JLPT|ALL`; GROUP ghi mới yêu cầu KAIWA/JLPT và học viên có ghi danh tương ứng. USER mặc định ALL. Các báo cáo care-group trả một mục theo học viên + chương trình + CS (thêm programType, csId), không gộp Kaiwa/JLPT. Worker chỉ lấy quan hệ cùng chương trình hoặc USER dùng chung, không fallback GROUP legacy/chương trình khác.
- Danh sách nhóm trả `programType=KAIWA|JLPT|null` dựa quy tắc hiện tại và `classLinks[].programType` từ ghi danh; metadata lớp chỉ hiện theo chương trình của liên kết, không gán mọi lớp học viên vào mọi nhóm.

`GET /api/v1/omnichannel/groups` phục vụ hai phạm vi:

- `scope=all`: toàn bộ nhóm/cộng đồng đã lưu từ tài khoản Zalo/LINE của người đang đăng nhập, dùng trong Danh bạ → Danh sách nhóm và cộng đồng.
- `scope=class-linked`: chỉ nhóm có liên kết `target_type=GROUP` đã lưu tới học viên có `EnrollmentClass` trong phạm vi học viên được phép xem. Không đoán tên nhóm, không coi nhóm sync thành nhóm lớp. Liên kết lớp lịch sử được giữ; không tự suy đoán trạng thái đang học. Nhóm liên kết học viên chưa có lớp không thuộc phạm vi này.

ADMIN/MANAGE/CS đều giữ owner isolation của tài khoản kênh hiện có; không đọc nhóm của người khác. Metadata học viên/lớp dùng phạm vi student hiện hành (ADMIN toàn bộ, MANAGE nhóm CS + self, CS self). TEACHER-only bị từ chối; multi-role dùng quyền hợp lệ như các API kênh hiện có. Không trả session, credential hoặc token.

Query `platform=ALL|ZALO|LINE`, `accountId` (phải có nền tảng cụ thể), `search` tối đa 200 ký tự, `page`, `pageSize` 1–100. Tìm tên/mã nhóm, tài khoản, lớp và học viên; lọc trước phân trang. Trả `{data,meta}` với tổng thực tế, trang đã clamp và danh sách tài khoản sở hữu không archived trong `meta.accounts`.

`classLinks` chứa studentId/name/externalId, classId/name/code, loại trùng theo học viên + lớp. Quan hệ GROUP chỉ được đọc khi account của quan hệ khớp account nhóm. Thông tin thành viên chưa có dùng null, không giả bằng 0. Dữ liệu được đọc từ DB, không gọi SDK, không tự ghép nhóm, không thay liên kết hoặc khởi động automation. Đồng bộ nhóm ở Danh bạ dùng endpoint sync từng tài khoản hiện có; không gọi sync-and-match.
