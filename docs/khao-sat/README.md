# Bộ hồ sơ khảo sát hệ thống Edura Automation CSKH

_Cập nhật: 2026-10-24 · Phạm vi: tài liệu khảo sát code/schema và các quan sát runtime lịch sử đã được ghi nhận._

## Mục lục deliverable

| # | Tài liệu | Mục đích |
|---|---|---|
| 00 | [Phạm vi và phương pháp](00-pham-vi-va-phuong-phap.md) | Phạm vi, nguồn bằng chứng, giới hạn môi trường và tài khoản theo snapshot. |
| 01 | [Bản đồ chức năng](01-ban-do-chuc-nang.md) | Route, sidebar, màn hình và alias frontend. |
| 02 | [Vai trò, thực thể, thuật ngữ](02-vai-tro-thuc-the-thuat-ngu.md) | Ngữ nghĩa role, hồ sơ, thực thể và thuật ngữ nghiệp vụ. |
| 03 | [Từ điển dữ liệu](03-tu-dien-du-lieu.md) | Schema Prisma, trường, enum, quan hệ và các writer/reader đã truy được. |
| 04 | [Quan hệ](04-quan-he.md) | Ma trận quan hệ nghiệp vụ, FK/relation và các tham chiếu mềm. |
| 05a | [API đào tạo và nền tảng](05a-api-đào-tạo-và-nền-tảng.md) | Route, validation, data-scope và side-effect nhóm đào tạo/nền tảng. |
| 05b | [API chăm sóc và omnichannel](05b-api-chăm-soc-omnichannel.md) | Care, import, automation, broadcast, Zalo, LINE, Sheet. |
| 06 | [Đặc tả màn hình UI](06-dac-ta-man-hinh-ui.md) | UI suy từ component/route code; cột, filter, form, dialog và role gate. |
| 07 | [Luồng nghiệp vụ](07-luong-nghiep-vu.md) | Các luồng xuyên module, state và side-effect; phân biệt code với runtime. |
| 08 | [Ma trận phân quyền](08-ma-tran-phan-quyen.md) | Route/data-scope/field scope theo role; runtime chỉ là snapshot lịch sử. |
| 08b | [Ma trận truy vết trường](08b-ma-tran-truy-vet.md) | Mẫu 18 trường trọng yếu; không đại diện writer/reader toàn schema. |
| 09 | [Lỗi và câu hỏi mở](09-loi-va-cau-hoi.md) | Phát hiện, giả thuyết [CXM], câu hỏi policy và giới hạn kiểm chứng. |
| 10 | [Bảng kiểm bao phủ](10-bao-phu-khao-sat.md) | Ma trận màn hình/chức năng × các lớp bằng chứng và trạng thái test. |

## Legend bằng chứng

- **[ĐKC-CODE]**: quan sát trực tiếp source code, route, schema hoặc component; không tự đồng nghĩa hành vi runtime.
- **[ĐKC-RT]**: quan sát runtime đã được ghi nhận trong lượt khảo sát trước; trong bản hoàn thiện này không re-test.
- **[ĐKC-DB]**: snapshot dữ liệu đã ghi nhận trước; số lượng/bản ghi không tự chứng minh policy hay misassignment.
- **[SLCC]**: suy luận có căn cứ từ nhiều mảnh code, cần test/đối chiếu thêm.
- **[CXM]**: chưa xác minh, phụ thuộc policy, deployment, external service hoặc integration test. Không được đọc như lỗi đã xác lập.

## Phạm vi và giới hạn hiện tại

Hồ sơ ưu tiên hai luồng MVP từ Sheet `1.Chăm sóc` và `3.Chấm buổi`, đồng thời mô tả các module đang có trong code. UI được đặc tả từ mã nguồn, **chưa có full browser clickthrough/screenshot**. MANAGE và TEACHER runtime chưa được xác minh đầy đủ. Không chạy thao tác ghi/xóa, không gửi tin thật tới Zalo/LINE, không tự reset mật khẩu, không tự cấp quyền sửa DB dev. Google Sheets cần OAuth thật cho kiểm chứng end-to-end.

08b chỉ là mẫu các trường trọng yếu; chưa truy vết writer/reader cho mọi field. Không dùng tỷ lệ phần trăm bao phủ giả định. Các count runtime là snapshot lịch sử, không chứng minh thiếu nhóm remote, misassignment hoặc vi phạm policy. Các khoảng trống còn lại giữ nhãn [CXM] thay vì lấp bằng chức năng “chuẩn ngành”.

## Cách đọc nhanh

Bắt đầu từ 01 để hiểu bề mặt frontend, 05a/05b để đối chiếu route và code authority, 03/04 để kiểm tra tên model/quan hệ, 06 để xem chi tiết UI. Dùng 07 cho luồng xuyên suốt, 08/08b cho scope và traceability, 09 cho các điểm cần quyết định, và 10 cho trạng thái bao phủ theo từng deliverable. Khi 05a/05b mâu thuẫn với bản audit cũ, ưu tiên code đã cite trong 05a/05b; mục chưa đủ chứng cứ phải chuyển thành [CXM].
