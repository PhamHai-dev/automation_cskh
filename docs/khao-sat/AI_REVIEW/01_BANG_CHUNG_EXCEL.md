# 01 — Bằng chứng Excel / inventory workbook CSHV

> Bản đã ẩn dữ liệu tài khoản/cá nhân (che by placeholder) — nguồn gốc xem NUOI-NGUON.md

> Báo cáo AI_REVIEW, phần Excel/archive. Đã đọc trực tiếp 8/8 workbook trong ZIP, 88/88 sheet (bao gồm hidden; không phát hiện veryHidden). Việc **quét cấu trúc** (tên/trạng thái/used range/ô populated/công thức và metadata) phủ 88/88 sheet; việc **phân tích ngữ nghĩa** chỉ áp dụng cho các sheet có nội dung vận hành, hướng dẫn, attendance/participation, báo cáo và các vùng liên quan được nêu rõ dưới đây — không đồng nhất hai loại độ phủ. Không tải link, không chạy macro, không tính lại công thức. Không dump dữ liệu cá nhân.

## 1. Phạm vi, nguồn và nguyên tắc đọc

- Nguồn duy nhất: `docs/khao-sat/AI_REVIEW/Folder các file của CSHV-20261024T073104Z-1-001.zip` (đọc trực tiếp bằng `zipfile`, ghi scratch tạm, không overwrite nguồn, không fetch link, không enable macro/external calculation).
- **Xác minh tồn kho (độc lập, đợt rà soát 2026-10-24):** SHA-256 zip = `42e1f8211ef9dfdd65a86a47bb7aa5dbf4a9d8cbba43a95fa311526b9a0ce7d2`. Archive chứa đúng 8 entry `.xlsx` dưới thư mục `Folder các file của CSHV/`. Đếm sheet độc lập từ `xl/workbook.xml`: 12+4+2+12+9+5+22+22 = **88 sheet**; hidden 3+0+0+0+0+0+1+8 = **12**; veryHidden = **0**. Tám SHA-256 workbook (8 ký tự đầu) ở Mục 4 khớp bản tính lại trực tiếp từ bytes trong zip (`1b1b3816, 85211aff, 7d0fea3f, 3e067966, a6650e6e, 380e95e1, 58245fc5, 9a73db94`).
- Python 3.10 + openpyxl 3.1.5 (đã cài sẵn; không cài thêm dependency; ExcelJS của backend không cần dùng vì openpyxl đủ). Mỗi `.xlsx` đọc hai chế độ: `data_only=False` (công thức) và `data_only=True` (giá trị cached tại lần lưu cuối). XML gốc được parse độc lập để đếm formula/cached/`IMPORTRANGE`, hyperlink, comment, data validation, table.

**Quy ước diễn giải bằng chứng:**
- "Populated/ô khác None" = chỉ báo có dữ liệu theo openpyxl; `dimension/used range` có thể bị phình do định dạng, không phải số dòng nghiệp vụ.
- Formula XML / cached non-empty" chỉ chứng minh công thức TỒN TẠI và có giá trị lưu, KHÔNG chứng minh đã tính gần đây hay đúng.
- `IMPORTRANGE`/hyperlink là **provenance candidate** (nguồn được khai báo trong công thức/ô), KHÔNG phải bằng chứng dữ liệu đã đồng bộ thành công hay link còn sống/quyền truy cập.
- Phân loại giá trị: (a) literal/manual, (b) formula có cache, (c) synced-label từ IMPORTRANGE (provenance unknown), (d) instruction/policy text. Không trộn lẫn.
- PII (tên/SĐT/email/nội dung trao đổi HV) được redact/không liệt kê; chỉ trích header, range, công thức, cấu hình, aggregate.

## 2. Danh sách sheet: đã đọc / chưa đọc

**Đã quét cấu trúc: toàn bộ 88 sheet của 8 workbook** (Mục 3, kể cả hidden). Không còn sheet ngoài inventory. Đây không phải tuyên bố đã hiểu ngữ nghĩa từng ô/từng dòng. Đợt bổ sung đọc trực tiếp toàn bộ ô có nội dung của 9 sheet W1 (trừ Sheet6, Mẫu BC tuần, Link youtube tổng hợp JLPT), hướng dẫn W2 và 2 sheet W3; đọc chọn lọc header/legend NKHT và comments ở Mục 11. Các bảng định lượng cũ được giữ, không phải toàn bộ đều được đếm lại trong đợt bổ sung.

| # | Workbook | Sheet (theo thứ tự, kèm trạng thái) |
|---|---|---|
| W1 | Edura_bộ phận vận hành.xlsx | Vận hành (visible), Hướng dẫn xử lý lỗi kỹ thuật (visible), Kịch bản mới (visible), Kịch bản tiếp nhận ca tối (visible), Kịch bản JLPT CS (visible), Các đầu việc lớp Kids (visible),  Kịch bản Chăm sóc lớp Kids (visible), Cố Vấn Học Tập (hidden), Quy trình chăm sóc (visible), Link youtube tổng hợp JLPT (visible), Sheet6 (hidden), Mẫu BC tuần (hidden) |
| W2 | File điểm danh của Giáo viên.xlsx | Hướng dẫn sử dụng (visible), Infoー情報 (visible), 2026 スケジュール (visible), QC 2026 (visible) |
| W3 | Format báo cáo học tập.xlsx | 会話 3 - 学習レポート (visible), Đánh giá buổi học từ Bộ phận Ch (visible) |
| W4 | File điểm danh và theo dõi học tập của Cố vấn học tập.xlsx | CVHT01.Báo cáo (visible), 1.Chăm sóc (visible), 3.Chấm buổi (visible), 5. Ca ngày bàn giao (visible), 4.Tái tục  (visible), 6.Nhật ký ca tối (visible), Timeline công việc (visible), Setting (visible), 7.Báo cáo tháng.CVHT01 (visible), Danh sách GV (visible), 9.Link Báo Cáo (visible), Tái tục V2.0 T12 (visible) |
| W5 | Chấm điểm buổi học riêng JLPT của giáo viên.xlsx | Info (visible), 2026 スケジュール (visible), NKHT N2 (visible), NKHT N3 (visible), NKHT N4 (visible), NKHT N3&N4 NC (visible), NKHT N5 (visible), QC 2026 (visible), Setting (visible) |
| W6 | File nguồn tổng Kaiwa - Nguồn xuất phát mọi dữ liệu.xlsx | Tổng (visible), HV đóng tiền nhiều lần (visible), BC Tháng.HV mới.Kaiwa (visible), Lớp sắp kết thúc (visible), Tái tục (visible) |
| W7 | File nguồn tổng JLPT - Nguồn xuất phát mọi dữ liệu.xlsx | Checklist file (hidden), Data JLPT_Inhouse (visible), Báo cáo JLPT T7.2026 (visible), Danh sách HV thi JLPT các năm  (visible), F (visible), CVHT_ Báo cáo (visible), Nội dung họp tuần  (visible), Index (visible), JLPT 2025 (visible), BC Tháng. JLPT.Học viên (visible), JLPT_Inhouse_Đặt cọc (visible), Clean.Data JLPT (visible), [sheet đối soát cá nhân — ẩn tên] (visible), Setting (visible), Báo cáo JLPT  (visible), Điểm học tập (visible), Data.Đại sứ (visible), Meeting PDT (visible), Data.Đại sứ JLPT (visible), Check BTVN JLPT (visible), Chấm buổi (visible), Check giờ dạy GV (visible) |
| W8 | Bản sao của [Edura] Báo cáo chuyên cần sản phẩm JLPT V2.0.xlsx | Map (hidden), Dashboard (visible), Buoi_index (visible), Kiểm tra link (visible), Lich_Kiem_Tra (visible), N4 (hidden), N3 (hidden), N3&4 NC (hidden), N5 (hidden), Data JLPT (visible), Cau_Hinh (hidden), N2 (hidden), Trans_1 (visible), Chuyên cần HV (visible), Data (visible), Helper (hidden), Top lớp (visible), Điểm KT (visible), Thang điểm (visible), Tiến độ (visible), Kết quả thi (visible), NHAN-VIEN-05_Chiều dữ liệu (visible) |

> Ghi chú phạm vi loại trừ: **chỉ** loại khỏi phân tích ngữ nghĩa tài liệu có tên `Mẫu tin nhắn và quy trình tự động` (khi xuất hiện như tên tài liệu/vùng được định danh như vậy). Các sheet có tên `Kịch bản mới`, `Kịch bản tiếp nhận ca tối`, `Kịch bản JLPT CS` và ` Kịch bản Chăm sóc lớp Kids` vẫn được đọc và dùng cho các nhận định cấu trúc/vận hành phù hợp; không được mặc định loại toàn bộ các sheet Kịch bản. Các nội dung tin nhắn cụ thể có PII hoặc dữ liệu nhạy cảm chỉ được mô tả ở mức chức năng, không công bố giá trị cá nhân.

## 3. Inventory định lượng theo sheet

| Workbook | Sheet | State | Used range | Ô populated | Formula (XML) | Formula có cache |
|---|---|---|---|---:|---:|---:|
| Edura_bộ phận vận hành.xlsx | `Vận hành` | visible | `A1:H10` | 49 | 0 | 0 |
| Edura_bộ phận vận hành.xlsx | `Hướng dẫn xử lý lỗi kỹ thuật` | visible | `A1:B3` | 4 | 0 | 0 |
| Edura_bộ phận vận hành.xlsx | `Kịch bản mới` | visible | `A1:G141` | 376 | 0 | 0 |
| Edura_bộ phận vận hành.xlsx | `Kịch bản tiếp nhận ca tối` | visible | `A1:H25` | 70 | 0 | 0 |
| Edura_bộ phận vận hành.xlsx | `Kịch bản JLPT CS` | visible | `A1:G124` | 337 | 0 | 0 |
| Edura_bộ phận vận hành.xlsx | `Các đầu việc lớp Kids` | visible | `A1:H9` | 43 | 0 | 0 |
| Edura_bộ phận vận hành.xlsx | ` Kịch bản Chăm sóc lớp Kids` | visible | `A1:G134` | 353 | 0 | 0 |
| Edura_bộ phận vận hành.xlsx | `Cố Vấn Học Tập` | hidden | `A1:Z8` | 36 | 0 | 0 |
| Edura_bộ phận vận hành.xlsx | `Quy trình chăm sóc` | visible | `A1:Z10` | 29 | 0 | 0 |
| Edura_bộ phận vận hành.xlsx | `Link youtube tổng hợp JLPT` | visible | `A1:C1000` | 12 | 0 | 0 |
| Edura_bộ phận vận hành.xlsx | `Sheet6` | hidden | `A1:L35` | 67 | 22 | 22 |
| Edura_bộ phận vận hành.xlsx | `Mẫu BC tuần` | hidden | `A1:Z1000` | 15 | 0 | 0 |
| File điểm danh của Giáo viên.xlsx | `Hướng dẫn sử dụng` | visible | `A1:A998` | 15 | 0 | 0 |
| File điểm danh của Giáo viên.xlsx | `Infoー情報` | visible | `A1:BX1026` | 198 | 14 | 14 |
| File điểm danh của Giáo viên.xlsx | `2026 スケジュール` | visible | `A1:QM83` | 2,432 | 1,371 | 1,371 |
| File điểm danh của Giáo viên.xlsx | `QC 2026` | visible | `A1:N25` | 71 | 48 | 48 |
| Format báo cáo học tập.xlsx | `会話 3 - 学習レポート` | visible | `A1:B78` | 83 | 0 | 0 |
| Format báo cáo học tập.xlsx | `Đánh giá buổi học từ Bộ phận Ch` | visible | `A1:G44` | 39 | 0 | 0 |
| File điểm danh và theo dõi học tập của Cố vấn học tập.xlsx | `CVHT01.Báo cáo` | visible | `A1:K55` | 378 | 283 | 283 |
| File điểm danh và theo dõi học tập của Cố vấn học tập.xlsx | `1.Chăm sóc` | visible | `A1:BI2325` | 8,079 | 4,647 | 4,647 |
| File điểm danh và theo dõi học tập của Cố vấn học tập.xlsx | `3.Chấm buổi` | visible | `A1:QX1011` | 83,613 | 13,837 | 13,837 |
| File điểm danh và theo dõi học tập của Cố vấn học tập.xlsx | `5. Ca ngày bàn giao` | visible | `A1:Z1000` | 1,666 | 0 | 0 |
| File điểm danh và theo dõi học tập của Cố vấn học tập.xlsx | `4.Tái tục ` | visible | `A1:AL959` | 728 | 0 | 0 |
| File điểm danh và theo dõi học tập của Cố vấn học tập.xlsx | `6.Nhật ký ca tối` | visible | `A1:I4143` | 3,721 | 3,266 | 3,266 |
| File điểm danh và theo dõi học tập của Cố vấn học tập.xlsx | `Timeline công việc` | visible | `A1:Z1000` | 45 | 0 | 0 |
| File điểm danh và theo dõi học tập của Cố vấn học tập.xlsx | `Setting` | visible | `A1:K13` | 43 | 0 | 0 |
| File điểm danh và theo dõi học tập của Cố vấn học tập.xlsx | `7.Báo cáo tháng.CVHT01` | visible | `A1:I993` | 110 | 56 | 56 |
| File điểm danh và theo dõi học tập của Cố vấn học tập.xlsx | `Danh sách GV` | visible | `A1:AU231` | 929 | 453 | 229 |
| File điểm danh và theo dõi học tập của Cố vấn học tập.xlsx | `9.Link Báo Cáo` | visible | `A1:E16` | 34 | 0 | 0 |
| File điểm danh và theo dõi học tập của Cố vấn học tập.xlsx | `Tái tục V2.0 T12` | visible | `A1:U1001` | 23 | 0 | 0 |
| Chấm điểm buổi học riêng JLPT của giáo viên.xlsx | `Info` | visible | `A1:BW1041` | 167 | 14 | 14 |
| Chấm điểm buổi học riêng JLPT của giáo viên.xlsx | `2026 スケジュール` | visible | `A1:PZ1000` | 1,705 | 815 | 815 |
| Chấm điểm buổi học riêng JLPT của giáo viên.xlsx | `NKHT N2` | visible | `A1:BC940` | 67 | 6 | 6 |
| Chấm điểm buổi học riêng JLPT của giáo viên.xlsx | `NKHT N3` | visible | `A1:AU936` | 59 | 6 | 6 |
| Chấm điểm buổi học riêng JLPT của giáo viên.xlsx | `NKHT N4` | visible | `A1:AN936` | 52 | 6 | 6 |
| Chấm điểm buổi học riêng JLPT của giáo viên.xlsx | `NKHT N3&N4 NC` | visible | `A1:X937` | 36 | 6 | 6 |
| Chấm điểm buổi học riêng JLPT của giáo viên.xlsx | `NKHT N5` | visible | `A1:AQ936` | 55 | 6 | 6 |
| Chấm điểm buổi học riêng JLPT của giáo viên.xlsx | `QC 2026` | visible | `A1:N24` | 69 | 48 | 48 |
| Chấm điểm buổi học riêng JLPT của giáo viên.xlsx | `Setting` | visible | `A1:BN984` | 61 | 1 | 1 |
| File nguồn tổng Kaiwa - Nguồn xuất phát mọi dữ liệu.xlsx | `Tổng` | visible | `A1:BY6984` | 82,304 | 11,834 | 5,965 |
| File nguồn tổng Kaiwa - Nguồn xuất phát mọi dữ liệu.xlsx | `HV đóng tiền nhiều lần` | visible | `A1:BB999` | 2,269 | 2,229 | 2,229 |
| File nguồn tổng Kaiwa - Nguồn xuất phát mọi dữ liệu.xlsx | `BC Tháng.HV mới.Kaiwa` | visible | `A1:AK50` | 1,567 | 504 | 504 |
| File nguồn tổng Kaiwa - Nguồn xuất phát mọi dữ liệu.xlsx | `Lớp sắp kết thúc` | visible | `A1:AZ2539` | 79 | 29 | 29 |
| File nguồn tổng Kaiwa - Nguồn xuất phát mọi dữ liệu.xlsx | `Tái tục` | visible | `A1:D33` | 64 | 0 | 0 |
| File nguồn tổng JLPT - Nguồn xuất phát mọi dữ liệu.xlsx | `Checklist file` | hidden | `A1:C8` | 16 | 0 | 0 |
| File nguồn tổng JLPT - Nguồn xuất phát mọi dữ liệu.xlsx | `Data JLPT_Inhouse` | visible | `A1:AZ10000` | 41,159 | 18,111 | 18,074 |
| File nguồn tổng JLPT - Nguồn xuất phát mọi dữ liệu.xlsx | `Báo cáo JLPT T7.2026` | visible | `A1:N293` | 1,284 | 181 | 181 |
| File nguồn tổng JLPT - Nguồn xuất phát mọi dữ liệu.xlsx | `Danh sách HV thi JLPT các năm ` | visible | `A1:L95` | 588 | 474 | 474 |
| File nguồn tổng JLPT - Nguồn xuất phát mọi dữ liệu.xlsx | `F` | visible | `A2:B11` | 10 | 0 | 0 |
| File nguồn tổng JLPT - Nguồn xuất phát mọi dữ liệu.xlsx | `CVHT_ Báo cáo` | visible | `A1:Z82` | 406 | 291 | 291 |
| File nguồn tổng JLPT - Nguồn xuất phát mọi dữ liệu.xlsx | `Nội dung họp tuần ` | visible | `A1:A1` | 0 | 0 | 0 |
| File nguồn tổng JLPT - Nguồn xuất phát mọi dữ liệu.xlsx | `Index` | visible | `B2:C2` | 2 | 0 | 0 |
| File nguồn tổng JLPT - Nguồn xuất phát mọi dữ liệu.xlsx | `JLPT 2025` | visible | `A1:J125` | 426 | 8 | 8 |
| File nguồn tổng JLPT - Nguồn xuất phát mọi dữ liệu.xlsx | `BC Tháng. JLPT.Học viên` | visible | `A1:Y96` | 1,771 | 1,672 | 1,672 |
| File nguồn tổng JLPT - Nguồn xuất phát mọi dữ liệu.xlsx | `JLPT_Inhouse_Đặt cọc` | visible | `A1:R1000` | 2,166 | 2,127 | 2,127 |
| File nguồn tổng JLPT - Nguồn xuất phát mọi dữ liệu.xlsx | `Clean.Data JLPT` | visible | `A1:AE2002` | 38,919 | 33,649 | 31,375 |
| File nguồn tổng JLPT - Nguồn xuất phát mọi dữ liệu.xlsx | `[sheet đối soát cá nhân — ẩn tên]` | visible | `B2:F4` | 11 | 3 | 3 |
| File nguồn tổng JLPT - Nguồn xuất phát mọi dữ liệu.xlsx | `Setting` | visible | `A1:O1502` | 116 | 1 | 1 |
| File nguồn tổng JLPT - Nguồn xuất phát mọi dữ liệu.xlsx | `Báo cáo JLPT ` | visible | `A1:J1004` | 268 | 0 | 0 |
| File nguồn tổng JLPT - Nguồn xuất phát mọi dữ liệu.xlsx | `Điểm học tập` | visible | `A1:BX1000` | 63,260 | 7,984 | 7,984 |
| File nguồn tổng JLPT - Nguồn xuất phát mọi dữ liệu.xlsx | `Data.Đại sứ` | visible | `A1:AL1000` | 1,001 | 2 | 1 |
| File nguồn tổng JLPT - Nguồn xuất phát mọi dữ liệu.xlsx | `Meeting PDT` | visible | `A1:I2` | 7 | 0 | 0 |
| File nguồn tổng JLPT - Nguồn xuất phát mọi dữ liệu.xlsx | `Data.Đại sứ JLPT` | visible | `A1:AK90` | 51 | 1 | 1 |
| File nguồn tổng JLPT - Nguồn xuất phát mọi dữ liệu.xlsx | `Check BTVN JLPT` | visible | `A1:BL1000` | 1,063 | 999 | 999 |
| File nguồn tổng JLPT - Nguồn xuất phát mọi dữ liệu.xlsx | `Chấm buổi` | visible | `A1:AGY2244` | 135,682 | 121,954 | 121,949 |
| File nguồn tổng JLPT - Nguồn xuất phát mọi dữ liệu.xlsx | `Check giờ dạy GV` | visible | `A1:AH3262` | 8,539 | 8,182 | 7,995 |
| Bản sao của [Edura] Báo cáo chuyên cần sản phẩm JLPT V2.0.xlsx | `Map` | hidden | `A1:B1` | 2 | 0 | 0 |
| Bản sao của [Edura] Báo cáo chuyên cần sản phẩm JLPT V2.0.xlsx | `Dashboard` | visible | `A1:AR1078` | 13,321 | 12,951 | 5,396 |
| Bản sao của [Edura] Báo cáo chuyên cần sản phẩm JLPT V2.0.xlsx | `Buoi_index` | visible | `A1:Q1001` | 2,347 | 206 | 200 |
| Bản sao của [Edura] Báo cáo chuyên cần sản phẩm JLPT V2.0.xlsx | `Kiểm tra link` | visible | `A1:E300` | 342 | 206 | 34 |
| Bản sao của [Edura] Báo cáo chuyên cần sản phẩm JLPT V2.0.xlsx | `Lich_Kiem_Tra` | visible | `A1:E45` | 215 | 0 | 0 |
| Bản sao của [Edura] Báo cáo chuyên cần sản phẩm JLPT V2.0.xlsx | `N4` | hidden | `A1:AN7060` | 31,671 | 31,631 | 31,631 |
| Bản sao của [Edura] Báo cáo chuyên cần sản phẩm JLPT V2.0.xlsx | `N3` | hidden | `A1:AU7060` | 18,828 | 18,781 | 18,781 |
| Bản sao của [Edura] Báo cáo chuyên cần sản phẩm JLPT V2.0.xlsx | `N3&4 NC` | hidden | `A1:Y982` | 2,424 | 2,399 | 2,399 |
| Bản sao của [Edura] Báo cáo chuyên cần sản phẩm JLPT V2.0.xlsx | `N5` | hidden | `A1:AQ7060` | 14,671 | 14,628 | 14,628 |
| Bản sao của [Edura] Báo cáo chuyên cần sản phẩm JLPT V2.0.xlsx | `Data JLPT` | visible | `A1:J39122` | 33,953 | 33,953 | 7,712 |
| Bản sao của [Edura] Báo cáo chuyên cần sản phẩm JLPT V2.0.xlsx | `Cau_Hinh` | hidden | `A1:D6` | 15 | 0 | 0 |
| Bản sao của [Edura] Báo cáo chuyên cần sản phẩm JLPT V2.0.xlsx | `N2` | hidden | `A1:AU1000` | 3,706 | 3,659 | 3,659 |
| Bản sao của [Edura] Báo cáo chuyên cần sản phẩm JLPT V2.0.xlsx | `Trans_1` | visible | `A1:F79048` | 414,937 | 414,931 | 414,931 |
| Bản sao của [Edura] Báo cáo chuyên cần sản phẩm JLPT V2.0.xlsx | `Chuyên cần HV` | visible | `A1:V998` | 19,934 | 18,179 | 8,586 |
| Bản sao của [Edura] Báo cáo chuyên cần sản phẩm JLPT V2.0.xlsx | `Data` | visible | `A1:L151384` | 655,826 | 402,169 | 401,887 |
| Bản sao của [Edura] Báo cáo chuyên cần sản phẩm JLPT V2.0.xlsx | `Helper` | hidden | `A1:L25355` | 233,738 | 200,488 | 192,972 |
| Bản sao của [Edura] Báo cáo chuyên cần sản phẩm JLPT V2.0.xlsx | `Top lớp` | visible | `A1:N987` | 2,399 | 2,277 | 293 |
| Bản sao của [Edura] Báo cáo chuyên cần sản phẩm JLPT V2.0.xlsx | `Điểm KT` | visible | `A1:Y898` | 16,103 | 16,076 | 8,039 |
| Bản sao của [Edura] Báo cáo chuyên cần sản phẩm JLPT V2.0.xlsx | `Thang điểm` | visible | `A1:Z998` | 124 | 0 | 0 |
| Bản sao của [Edura] Báo cáo chuyên cần sản phẩm JLPT V2.0.xlsx | `Tiến độ` | visible | `A1:H1000` | 3,099 | 1,996 | 208 |
| Bản sao của [Edura] Báo cáo chuyên cần sản phẩm JLPT V2.0.xlsx | `Kết quả thi` | visible | `A1:P5` | 17 | 4 | 4 |
| Bản sao của [Edura] Báo cáo chuyên cần sản phẩm JLPT V2.0.xlsx | `NHAN-VIEN-05_Chiều dữ liệu` | visible | `A1:G999` | 64 | 0 | 0 |

## 4. Metadata cấu trúc và giới hạn kỹ thuật

| Workbook | SHA-256 (8 ký tự) | externalLink parts | defined names | calcChain | Macro/OLE | Sheet protection | Workbook protection |
|---|---|---:|---:|---|---|---|---|
| Edura_bộ phận vận hành.xlsx | `1b1b3816` | 0 | 0 | False | 0 | 0 | False |
| File điểm danh của Giáo viên.xlsx | `85211aff` | 0 | 0 | False | 0 | 0 | False |
| Format báo cáo học tập.xlsx | `7d0fea3f` | 0 | 0 | False | 0 | 0 | False |
| File điểm danh và theo dõi học tập của Cố vấn học tập.xlsx | `3e067966` | 0 | 0 | False | 0 | 0 | False |
| Chấm điểm buổi học riêng JLPT của giáo viên.xlsx | `a6650e6e` | 0 | 0 | False | 0 | 0 | False |
| File nguồn tổng Kaiwa - Nguồn xuất phát mọi dữ liệu.xlsx | `380e95e1` | 0 | 0 | False | 0 | 0 | False |
| File nguồn tổng JLPT - Nguồn xuất phát mọi dữ liệu.xlsx | `58245fc5` | 0 | 0 | False | 0 | 0 | False |
| Bản sao của [Edura] Báo cáo chuyên cần sản phẩm JLPT V2.0.xlsx | `9a73db94` | 0 | 0 | False | 0 | 0 | False |

- **Không workbook nào** có `xl/externalLinks` (0), 0 defined names, không VBA/OLE/ActiveX, không richValue/linked data type, không sheet/workbook protection. Cả 8 workbook thiếu `calcChain.xml` → không suy ra thời điểm recalculate cuối.
- 3 workbook có `vmlDrawing` (nơi commentOLD lưu): CVHT, nguồn JLPT, Bản sao chuyên cần. Số comment: CVHT = 2+333+44; nguồn JLPT = 269+11; Bản sao = 2+34. Comments được đọc nội bộ để phân loại và kiểm tra ghi chú hướng dẫn; không công bố tác giả/nội dung cá nhân. Xem Mục 11.3.
- 7 workbook có `dataValidation` (W2–W8; đếm lại XML, W1 không có): nguồn GV (4 loại), định dạng báo cáo (1), CVHT (11), chấm GV JLPT (34), nguồn JLPT (nhiều, gồm cả `#REF!` broken). Nguồn Kaiwa/Bản sao chỉ có validation sparse. Bảng validation cụ thể ở Mục 6.

## 5. Dòng thời gian dữ liệu (available schedule vs planned vs actual) — bằng chứng theo sheet

| Khái niệm | Workbook / sheet / range | Bằng chứng | Phân loại |
|---|---|---|---|
| Lịch rảnh GV (available, không phải lịch buổi học đã xếp; slot 30 phút 08:30–21:30) | File điểm danh của Giáo viên.xlsx — `Infoー情報!E3:AD3`, `B6`; `Hướng dẫn sử dụng!A7`; validation `B4:AD5` (`A,P`) | Legend B6: `A: Lịch rảnh`; A7 hướng dẫn chọn A ở khung muốn dạy. Validation có A/P; không suy P thành mã nghỉ hay attendance | manual candidate + validation enum |
| Lịch dạy THỰC TẾ theo tháng (actual, format Nhật) | File điểm danh của Giáo viên.xlsx — `2026 スケジュール!A1:QM83`; 1371 formula, cached 1371 | `H3/I3 =COUNTIF($N:$AR, id&"*"/&"-A")`, `G3` suy giờ theo hệ số lớp 1-1/1-2/1-n, `G19=SUM(G3:G18)` | formula tồn tại và có cache; chưa xác minh tính đúng |
| Bảng chấm công GV riêng JLPT | Chấm điểm buổi học riêng JLPT...xlsx — `2026 スケジュール!A1:PZ1000`, `QC 2026!A1:N24` | `G3=if($B3="",0,COUNTIF(...)-SUM(...))`; 48 IFERROR ở QC | formula cache; Info có 61 ô dạng lỗi (`#N/A`/`#REF!`) |
| Attendance matrix theo NGÀY (actual, CVHT Kaiwa) | File điểm danh...CVHT.xlsx — `3.Chấm buổi!AC2:AG2, S...QX`; 14.617 formula cell | `AD..AG` gắn nhãn "Số buổi xin nghỉ có phép A / bảo lưu B / nghỉ sai C / GV nghỉ D", `Y3=SUMIF(...,"Số buổi đã học",...)+X3`, `LI3=countif(LN3:MQ3,"A")`, `LW8=IFS(TODAY()...)` | formula cache; hướng dẫn W2!A10:A15 mô tả mã A–E (Mục 10); không coi là mapping sang O/X/0.5X |
| Attendance matrix theo NGÀY (actual, JLPT nguồn) | File nguồn tổng JLPT.xlsx — `Chấm buổi!A2:AGY2244` (dimension tới cột AGY, tháng 12/2026); header tổng hợp nghỉ cần đọc cùng legend A–E W2 (không dùng khoảng đảo `S2:R2`) | `N3=COUNTIF(S3:AV3,"A")`, `L3=IFERROR(SUM(M3:AGY3),"-")`; ngày dạng serial ở row2 | formula cache; dữ liệu ngày 2025–2026 |
| Chuyên cần "actual" chuẩn hóa (dashboard) | Bản sao...Chuyên cần JLPT V2.0.xlsx — `Data!A1:L151384` (header: Mã GV, Mã lớp, Họ tên, Tiêu chí, Buổi số, Điểm số) + `Dashboard!A1:AR1078` | `Data` lưu `O/X/0.5X` ở tiêu chí Chuyên cần (kiểm tra giá trị cached trong 11.999 dòng đầu); validation O/X/0.5X xác minh ở NKHT W5, không suy rộng validation cho toàn Data; `Dashboard B4 = 1-COUNTIFS(...,"X")/COUNTIFS(...,"<>")` cached 0.688 | derived từ Trans_1/N2..N5 (REDUCE+VSTACK+IMPORTRANGE), provenance từng bản ghi unknown |
| Trạng thái khóa học (available/planned) | nguồn Kaiwa `Tổng!V2:V...`, CVHT `1.Chăm sóc!V`, nguồn JLPT `Data JLPT_Inhouse!S` | enum `Chờ lớp / Đang học / Bảo lưu / Kết thúc / Sắp học / Chưa học` (Setting) và `Kết thúc...video/Chờ lớp` | synced label (IMPORTRANGE) hoặc manual; provenance unknown |
| Cân đối học phí/bảo lưu (balances) | nguồn JLPT `JLPT_Inhouse_Đặt cọc!A1:R1000` (`ABS(D2-TODAY())` đếm ngày cọc), `HV-NGOAI-LE-01!B2:F4` (hardcode 7.4tr, 3.855tr, 1.927tr, 1.927tr) | Đặt cọc: 1128 dummy+ABS cached; sheet cá nhân có 3 literal | cân đối snapshot; nguồn khớp phí chưa verify |
| Cân đối giảng phí (balance nội bộ) | Edura_bộ phận vận hành.xlsx — `Sheet6!A4:E26` (hidden) | `E8=SUM(E5:E7)→942.205.000`, `B26=E8+E19+E24+E14*180→1.213.545.560`; số HV/buổi một phần literal | manual+formula, không reconcile |
| Tái tục / renewal care | CVHT `4.Tái tục!B1:AL959` (Table_1), `Tái tục V2.0 T12!A1:U1001` (0 formula, manual), Kaiwa `Tổng!BJ=DATEVALUE(B149)+45` (hạn khóa), Kaiwa `Tái tục!B3:D33` (S0–S5.6), dashboard `AV` enum tái tục tư vấn | 0 formula ở 2 sheet tái tục CVHT | pipeline thủ công, không có conversion ledger |
| BTVN / kiểm tra (thang điểm) | nguồn JLPT `Điểm học tập!M..` (`J3=COUNTA(M3:BJ3)`), `Check BTVN JLPT!C2` (999 COUNTA), Bản sao `Thang điểm!A1:D31`, `Helper!A1:L25355` (chuỗi vắng/chưa làm liên tiếp), `Điểm KT!A1:Y898` | COUNTA + helper IF/IFS; Thang điểm hardcode số câu | derived; giá trị bài thi là literal enum |
| Kết quả thi | Bản sao `Kết quả thi!A1:P5`; nguồn `Danh sách HV thi JLPT các năm!A3`, enum `AZ` pass/not pass | `K2=J2/I2` cached `#DIV/0!` | snapshot rỗng → ratio chưa xác định, KHÔNG phải 0% |
| Điểm nóng / cảnh báo | Bản sao `Cau_Hinh!B1:D5` | 4 ngưỡng: KT trước ≤2 buổi, sau ≤1, chuyên cần đỏ <0.70, vàng <0.85 | tham số chính sách nội bộ file |

## 6. Validation list / enum quan trọng (policy candidate)

- Chấm GV (file giáo viên): `A,P`; lịch `T246/T357`; lớp `1-1,1-2,1-n`.
- Chấm GV JLPT (file NKHT): điểm `O,X,0.5X`; xếp loại `A,B,C`; thái độ `Có,Không`; decimal `0.0`.
- CVHT `3.Chấm buổi`: trạng thái `Đang học,Kết thúc,Bảo lưu` + `Setting!A2:A9`; chăm sóc `Setting!K2:K21`.
- Nguồn JLPT `Data JLPT_Inhouse`: `Kết thúc,Bảo lưu,Đang học,video,Chờ lớp`; feedback 7 nhãn; test-trạng-thai 5 nhãn; thi `Có thi,Chưa thi,Đỗ,Trượt,Không phản hồi`; cọc `pass,not pass,Không phản hồi`; tái tục tư vấn 5 nhãn; 1 validation AY `#REF!` (liên kết Setting gãy).
- Bản sao chuyên cần: dropdown chọn lớp từ `Buoi_index!A3:A898`, `L3:L1001` (dynamic list, không hardcode).
- Bảng ngày ở một số sheet dùng custom `DATEVALUE` tolerance → cho phép nhập ngày dạng text lẫn số.

## 7. Mâu thuẫn chính sách / phát hiện chất lượng dữ liệu

1. **Ba chiều dữ liệu khác nhau, không phải lỗi tương thích đã chứng minh.** A–E phân loại nguyên nhân/trạng thái buổi không thành công; O/X/0.5X ghi nhận chuyên cần/tham gia ở NKHT và báo cáo JLPT; A/P nằm trong lịch rảnh GV. Không ép ánh xạ một-một giữa ba bộ mã. Thiếu quy tắc tổng hợp liên chiều là câu hỏi cần xác nhận khi đối soát, không đủ để kết luận dashboard không tương thích hoặc số liệu sai. Xem Mục 10.
2. **Nhãn trạng thái lệch giữa Setting và validation.** `Setting!A` của CVHT liệt kê 6–8 trạng thái (`Chờ lớp, Đang học, Bảo lưu, Kết thúc, Sắp học, Chưa học`) nhưng một số dropdown chỉ `Đang học,Kết thúc,Bảo lưu`; nguồn JLPT thêm `video` — nguồn Kaiwa không có enum này trong Setting → phân loại trạng thái không thống nhất.
3. **Thang điểm JLPT khác theo chương trình, cần xác minh nhãn.** `Thang điểm` tổng số câu khác nhau giữa cấp độ (N5 KT6=40 nhưng thiếu KT... ; N3 có KT tới KT9 + cuối kỳ 33; N4CS chỉ 3 mốc) và một số giá trị bị typo hiển thị (`JLPT N5 ôn tập 1..6` nhưng thiếu "4") → cần xác nhận là dữ liệu hay lỗi.
4. **Cân đối tài chính chỉ là snapshot thủ công.** `Sheet6` trộn literal và SUM, `[sheet đối soát cá nhân — ẩn tên]` hardcode phép chia 7.800.000/77*35; không có đối chiếu với học phí thực → không reconcile được.
5. **Rủi ro định dạng ID thành ngày.** Lần quét trước ghi nhận cảnh báo ô có serial ngoài giới hạn ngày tại `5. Ca ngày bàn giao!B649, B107`; không công bố mã HV. Ký hiệu khoa học của số cached tự nó không chứng minh mất chính xác hay bị đổi thành ngày. Cần kiểm tra kiểu/number format và parser ở đúng cột trước khi kết luận; không có thực thi app trong khảo sát này.
6. **Nhiều ô lỗi trong nguồn tính.** Chấm GV JLPT Info: 61 ô #REF/#N/A; Chấm buổi CVHT: 1 dummy lỗi; Data.Đại sứ / Data.Đại sứ JLPT: `#REF!`/`#N/A` nguyên cột → có lỗi lưu trong snapshot, chưa chứng minh toàn bộ survey hoặc kết nối hiện tại đã hỏng.
7. **Dashboard rỗng vẫn tính.** `Kết quả thi!K2` `#DIV/0!` → báo cáo phải phân biệt "chưa có dữ liệu" vs "0%".

## 8. Bảng công thức ngữ nghĩa (representative, đã kiểm tra cache)

| Sheet!cell | Công thức (rút gọn) | Cached | Ngữ nghĩa candidate | Loại |
|---|---|---|---|---|
| vận hành — `Sheet6!C5` | `=99+89` | 188 | số HV 1-1 đang học GV Việt | literal-formula |
| vận hành — `Sheet6!E5` | `=110000*D5/2` | 232,100,000 | giảng phí lớp Việt = đơn giá 110k * buổi /2 | manual rate, formula |
| vận hành — `Sheet6!B26` | `=E8+E19+E24+E14*180` | 1,213,545,560 | tổng quy VND (JPY*180) | formula |
| file GV — `2026!H3` | `=COUNTIF($N:$AR,LEFT($B3,LEN($B3))&"*")-SUM(I3,J3,L3,K3,M3)` | (cache) | đếm buổi theo ID trừ các mã loại | formula (attendance) |
| CVHT — `3.Chấm buổi!Y3` | `=SUMIF(...,"Số buổi đã học",...)+X3` | cache | tổng buổi đã học cộng năm trước | formula |
| CVHT — `CVHT01.Báo cáo!D6` | `=COUNTIFS(1.Chăm sóc!$B:$B,">="&$E$2,...,V:$V,A6)` | 0/3... theo trạng thái | đếm theo ngày bàn giao + trạng thái | formula; snapshot 2025-01-01..2026-10-24 |
| CVHT — `1.Chăm sóc!BE3` | `=W3` | "Ngày kết thúc/Bảo lưu" | alias header (synced/derived label) | label |
| nguồn Kaiwa — `Tổng!BJ151` | `=DATEVALUE(B149)+45` | 2020-02-17 | hạn khóa = nộp phí +45 ngày | formula; **cross-row shift** cần verify |
| nguồn JLPT — `Chấm buổi!N3` | `=COUNTIF(S3:AV3,"A")` | cache | đếm buổi nghỉ có phép mã A | formula |
| nguồn JLPT — `Check giờ dạy GV!S3` | `=VLOOKUP(R3,SORT($A$3:$B3262,2,FALSE),2,FALSE)` | cache | tra GV→số giờ | formula, IMPORTRANGE source |
| Bản sao — `Dashboard!B4` | `=IFERROR(1-COUNTIFS(Data,"Chuyên cần","X")/COUNTIFS(...,"<>"),"")` | 0.688 | tỷ lệ chuyên cần toàn bộ | derived |
| Bản sao — `Chuyên cần HV!C5` | `=D5-IF(...,COUNTIFS(...,"X"))` | cache | số buổi vắng HV | derived |
| Bản sao — `Tiến độ!B4` | `=IF($A4="","",COUNTIFS(...,"<>"))` | cache | tổng buổi đã tổ chức | derived |
| Bản sao — `Helper!J2` | `=IFS(I2="Có",0,I2="Không",1)` | cache | mã hóa BTVN 0/1 | derived |

## 9. Giới hạn độ phủ và chưa xác định

- **Không có nguồn đối chiếu runtime**: mọi con số là giá trị lưu trong file ZIP; không đối chiếu DB/app/backend. Không kết luận SLA thực đạt, tỷ lệ tái tục/thi đỗ thực, doanh thu hiện hành.
- **IMPORTRANGE**: gần như toàn bộ sheet dữ liệu lớn phụ thuộc Google Sheets nguồn (nhiều doc ID khác nhau, tối thiểu 15 ID ở nguồn JLPT). Không fetch, không verify quyền hạn → không chứng minh dữ liệu nguồn đồng bộ hay phiên bản.
- **Sheet rất lớn**: inventory đã ghi nhận dimension lớn nhất 151.384 dòng (W8 Data), thấp hơn cap 400.000 dòng nêu ở lần quét trước. Không có bằng chứng ở đây rằng cap đã làm bỏ hàng cuối; không dùng cap giả định để tuyên bố thiếu dữ liệu. Tuy nhiên quét cấu trúc không đồng nghĩa phân tích ngữ nghĩa toàn bộ dữ liệu hoặc xác minh cache/công thức từng hàng.
- **Comment/note cá nhân**: đọc nội bộ và tổng hợp theo chủ đề, không trích thông tin cá nhân; chỉ trích ghi chú hướng dẫn ở header (Mục 11.3).
- **Không phát hiện veryHidden**; không phát hiện macro/VBA; không external links; không defined names — không có nghĩa đã chứng minh toàn bộ quan hệ dữ liệu; còn tham chiếu nội bộ, công thức và quy trình nhập tay.


## 10. Phân biệt các mã và đơn vị nghiệp vụ (không ép ánh xạ)

- **A–E (attendance reason/status):** hướng dẫn W2 `Hướng dẫn sử dụng!A10:A15` ghi buổi thành công theo mẫu `mã HV-tên bài`; các trường hợp không thành công gồm `-A` (HV xin nghỉ có phép), `-B` (bảo lưu), `-C` (HV nghỉ không phép), `-D` (GV xin nghỉ), `-E` (lỗi kỹ thuật). Đây là mã lý do/trạng thái của một lần ghi buổi, không phải thang điểm tham gia.
- **O/X/0.5X (participation/attendance value):** kiểm tra W8 `Data`, 11.999 dòng đầu cho tiêu chí `Chuyên cần` cho thấy các giá trị O, X, 0.5X; W5 NKHT có cùng enum ở validation. Đây là bộ giá trị chuyên cần/tham gia trong bảng JLPT, không được tự coi là A–E.
- **A/P (teacher availability):** W2 `Infoー情報!B6` ghi rõ `A: Lịch rảnh`; `Hướng dẫn sử dụng!A7` mô tả chọn A ở khung muốn dạy. Validation có A/P trong chiều lịch rảnh. Báo cáo không đưa ra kết luận về nghĩa riêng của P, không gán nó sang mã attendance và không khẳng định nguồn thiếu định nghĩa P.
- Không có phép ghép một-một giữa A–E, O/X/0.5X và A/P. Để đối soát cần một quy tắc nghiệp vụ độc lập, khóa buổi/lớp/học viên và trạng thái nguồn; hiện báo cáo chỉ kết luận các chiều khác nhau và giữ mapping là **unknown**.

## 11. Ghi nhận vận hành từ vùng đã đọc (không công bố PII)

### 11.0. Bằng chứng vận hành, onboarding, ca tối, JLPT và Kids

Các hàng dưới là **source fact về nội dung hướng dẫn đang lưu**, không phải xác nhận quy trình đã được thực hiện hoặc chính sách còn hiệu lực; không tự biến lời nhắn mẫu thành automation đã triển khai.

| Chủ đề | Anchor trực tiếp trong W1 (trừ khi ghi khác) | Điều quan sát được / giới hạn |
|---|---|---|
| Vận hành thường kỳ | `Vận hành!B3:G7` | Check BTVN 3 buổi/lần; check BCHT 10 buổi/lần; tiếp nhận xin nghỉ và trao đổi học bù theo ca; check buổi hằng ngày; tiếp nhận HV mới theo ca 09:30/14:30. Đây là tần suất hướng dẫn, không phải SLA thực đạt. |
| Tài khoản học tập | `Vận hành!B8:F8` | Có chu kỳ báo cáo/duyệt/deactivate tài khoản dừng học hoặc bảo lưu trong khoảng ngày 25–30 hằng tháng. Không trích danh tính người duyệt/email; không thực hiện thao tác hệ thống. |
| CVHT và xử lý ngoại lệ | `Cố Vấn Học Tập!C3:H8` (hidden) | Kiểm tra tin nhắn, học bù/xếp lớp, theo dõi chăm sóc định kỳ và liên hệ sau nghỉ không phép. KPI phản hồi trong một giờ nằm trong hướng dẫn; không chứng minh thực đạt. |
| Onboarding Kaiwa | `Kịch bản mới!B5:E24`, `B25:F32` | Xác nhận thông tin khóa/lịch học, hướng dẫn hệ thống theo thiết bị, kiểm tra đăng nhập rồi mới hướng dẫn chuẩn bị bài, thông báo khai giảng/GV và kiểm tra vào lớp. Không xuất mật khẩu mẫu hoặc dữ liệu tài khoản. |
| Ca tối | `Kịch bản tiếp nhận ca tối!B5:E24` | Có onboarding theo thiết bị, yêu cầu xác nhận đăng nhập và xem tài liệu/video; `E17` ghi ngoại lệ Kaiwa 6 chỉ có PDF, không có video chuẩn bị. Không lấy hướng dẫn 7 ngày của lớp 1-1 áp chung cho lớp nhóm còn tuyển sinh (`C9:C10`). |
| Theo dõi sau khai giảng | `Kịch bản mới!B34:F61`, đặc biệt `E36`, `E59:E60` | Lấy ý kiến GV/BCHT riêng với xin cảm nhận HV; lớp có sự cố được theo dõi các buổi tiếp theo đến khi giải quyết; BTVN thiếu cần hẹn và kiểm tra lại. Có phân biệt hoạt động liên hệ, phản hồi và xử lý trong văn bản, chưa phải state machine đã triển khai. |
| JLPT | `Kịch bản JLPT CS!B18:F24`, `B27:F53`, `A76:E78`, `A116:E120` | Có thu thập điểm mạnh/yếu từ test và chia sẻ HV, bài ôn trong lúc chờ lớp, chuẩn bị trước/BTVN sau, Zoom cho lớp nhóm; phần sau buổi 16–18 đề cập đề mô phỏng. Có nhãn sau buổi 24 nhưng nội dung khác nhắc 30 bài; đây là lệch văn bản cần xác nhận, không tự sửa nguồn hoặc suy ra basis milestone. |
| Kids | `Các đầu việc lớp Kids!B3:G7`, `A8`; ` Kịch bản Chăm sóc lớp Kids!B27:F29`, `E29`, `A56:F58`, `A125:E130` | Có lấy phản hồi HV **và phụ huynh** sau buổi 1, theo dõi sự cố, đánh giá/BCHT các mốc. Ngưỡng số buổi còn lại 40/20/3/0 trong `A8` khác 60/30/3/0 ở `Vận hành!A9`; cần chính sách theo sản phẩm, không kết luận hai nguồn sai vì khác đối tượng. |
| Chuẩn bị chăm sóc và báo cáo | `Quy trình chăm sóc!B3:E10` | Lọc trạng thái/số buổi, check fail/success, record, FB GV và BTVN trước chăm sóc; báo cáo có ngày chăm sóc, BTVN, phản hồi, phương án. Có lời nhắc không gửi đồng loạt ở `D5`. Chưa xác lập quy tắc đếm milestone từ văn bản lọc này. |
| Đánh giá học tập | W3 `会話 3 - 学習レポート!A10:B78`; `Đánh giá buổi học từ Bộ phận Ch!A1:G8` | Form GV có mốc 1, 3, các khoảng 1–10/11–20/21–30 và kiểm tra; form chuyên môn có ngày, record, chủ đề, nhận xét, ghi chú. Không đồng nhất form chuyên môn với CVHT opinion hay Admin arbitration. |


### 11.1. Lịch học và đơn vị phiên

- W2 hướng dẫn ghi nhận lịch sử giảng dạy sau mỗi buổi bằng mã học viên + tên bài hoặc hậu tố A–E. Đây là bằng chứng về **một bản ghi buổi theo học viên**; không đủ để khẳng định mô hình dữ liệu là một phiên duy nhất cho mọi học viên.
- Theo xác nhận nghiệp vụ của người dùng (tách khỏi source fact): một giáo viên có thể ghi các phiên thực tế linh hoạt 1-1, không yêu cầu có phiên trước, và có nhiều phiên cùng ngày; một lớp cố định là một phiên lớp có nhiều bản ghi điểm danh học viên. Đây là input cần dùng khi thiết kế/đối chiếu, không phải phát hiện trực tiếp từ ZIP.
- Vì vậy không suy ra “mỗi ngày một buổi”, không suy ra buổi mới phải nối tiếp buổi trước, và không lấy số dòng học viên làm số phiên. Khóa phiên/lớp và bản ghi tham dự phải là hai khái niệm riêng.

### 11.2. Ba workflow độc lập

Theo xác nhận nghiệp vụ của người dùng (không phải source fact), cần giữ riêng ba workflow sau:

1. **Attendance + nội dung/ghi chú buổi:** ghi việc diễn ra và nội dung/ghi chú của buổi; sau đó **CVHT đưa ý kiến riêng**; **Admin thực hiện arbitration riêng**. Không gộp ý kiến CVHT vào bản ghi attendance và không suy ra quyền arbitration từ workbook.
2. **Đánh giá milestone của giáo viên:** đánh giá do giáo viên ghi theo milestone; không suy ra căn cứ milestone, quy đổi thời gian thành quyền lợi, hay quy tắc làm tròn từ các mốc/nhãn đang thấy.
3. **Feedback milestone của CVHT:** giữ độc lập các trạng thái `contacted`, `responded`, `resolved`; không dùng một cờ duy nhất để đại diện cả ba. Nội dung comments cá nhân không được xuất bản.

Source có các mốc như buổi 1/3/10/15/20/25/30 và các vùng báo cáo học tập, nhưng các mốc đó không tự chứng minh thứ tự bắt buộc, cửa sổ sửa lịch sử, hay điều kiện entitlement. Các điểm này vẫn là unknown/proposal cần đặc tả.

### 11.3. Comments và hướng dẫn có privacy

- Đã đếm/đọc nội bộ comments ở các phần W4/W7/W8 để phân loại; không dump tên, số điện thoại, email, nội dung trao đổi hoặc danh tính tác giả. Chủ đề chỉ được tổng hợp ở mức có/không và số lượng.
- Một comment hướng dẫn tại W7 `Data JLPT_Inhouse!AS1` (đã đọc trực tiếp) nêu ví dụ hai buổi liên tiếp không vào lớp/không làm bài. Đây là ví dụ chính sách/giám sát, không phải bằng chứng về một học viên cụ thể và không biến O/X/0.5X thành A–E.
- W1 `Hướng dẫn xử lý lỗi kỹ thuật`, `Vận hành`, `Cố Vấn Học Tập`, W2 `Hướng dẫn sử dụng`, W3 form báo cáo và các vùng attendance/feedback đã được dùng để đọc ngữ nghĩa chức năng; các sheet `Kịch bản*` vẫn thuộc phạm vi đọc. Chỉ tài liệu có tên **`Mẫu tin nhắn và quy trình tự động`** bị loại khỏi phân tích ngữ nghĩa theo yêu cầu.

## 12. User confirmations, source facts và proposal — tách riêng

| Loại | Nội dung | Trạng thái bằng chứng |
|---|---|---|
| User confirmation | 1-1 thực tế do giáo viên ghi nhận linh hoạt; không cần phiên trước; có thể nhiều phiên cùng ngày | Xác nhận nghiệp vụ, không phải source fact |
| User confirmation | Lớp cố định = một phiên lớp, nhiều bản ghi attendance học viên | Xác nhận nghiệp vụ, không phải source fact |
| User confirmation | Attendance/content → CVHT opinion riêng → Admin arbitration; ba workflow không gộp | Xác nhận nghiệp vụ, cần đặc tả quyền |
| User confirmation | Teacher milestone evaluation tách khỏi CVHT milestone feedback | Xác nhận nghiệp vụ |
| User confirmation | CVHT feedback cần contacted/responded/resolved riêng | Xác nhận nghiệp vụ |
| Source fact | W2 hướng dẫn có mã buổi thành công và A–E cho các lý do không thành công | Quan sát tĩnh trong ZIP |
| Source fact | W8 Data và W5 NKHT quan sát O/X/0.5X cho chiều chuyên cần/tham gia | Quan sát tĩnh; phạm vi mẫu/validation đã nêu |
| Source fact | W2 có A là lịch rảnh; A/P thuộc chiều availability, không phải attendance | Quan sát tĩnh, không suy diễn nghĩa P |
| Proposal/unknown | Bảng mapping giữa ba bộ mã, basis milestone, time-to-entitlement, historical edit window, quyền MANAGE arbitration | Chưa có bằng chứng; không được tự suy luận |

## 13. Artefact scratch (không phải nguồn)

- Artefact được báo cáo ở lần quét trước: `scratch/excel_evidence_kmgqysv7/scan.py`, `pass2.py`, `scan_full.json`, `pass2.json`, `validation_tables.json`, `pass2_log.txt`. Đợt bổ sung không xác minh lại nội dung các artefact này, không dùng chúng thay cho nguồn ZIP.
- Đợt bổ sung đọc ZIP trong bộ nhớ, không tạo scratch mới; không sửa source MD/ZIP, app, schema hoặc dữ liệu. Chỉ cập nhật báo cáo này. Inventory/hashes/legend, vùng hướng dẫn và comments được kiểm tra độc lập; phần số lượng ô/công thức của lần quét trước chưa được tái đếm toàn bộ.
