# Cấu trúc Thư mục & File Mẫu Backup / Import (`docs/data/import/`)

Thư mục này chứa bộ file Excel mẫu chuẩn cho cả **4 nhóm đối tượng Backup & Đồng bộ 2 chiều** (có đầy đủ tiêu đề cột chuẩn và 2 dòng `data_test` trong mỗi Sheet).

Để sinh / cập nhật lại toàn bộ các file `.xlsx` trong thư mục này, chạy lệnh:

```bash
cd backend
npx ts-node src/scripts/generate-backup-templates.ts
```

---

## 1. Cấu trúc Thư mục & Danh sách File

```text
docs/data/import/
├── admin/
│   ├── backup_admin_kaiwa.xlsx          # Sổ Tổng Kaiwa (Admin)
│   ├── backup_admin_jlpt.xlsx           # Sổ Tổng JLPT (Admin)
│   └── backup_admin_doi_soat.xlsx       # Sổ Đối soát Điểm danh Tổng (Admin)
├── cskh/
│   ├── backup_cskh_kaiwa_CVHT01.xlsx    # File 1A — Sổ CSKH Kaiwa
│   └── backup_cskh_jlpt_CVHT01.xlsx     # File 1B — Sổ CSKH JLPT
├── giao_vien/
│   └── diem_danh_gv_GV505.xlsx          # Sổ Điểm danh Giáo viên (giữ nguyên)
└── bao_cao_hoc_tap/
    ├── backup_bao_cao_hoc_tap_kaiwa.xlsx # Báo cáo học tập Kaiwa (Bảng ngang phẳng hóa)
    └── backup_bao_cao_hoc_tap_jlpt.xlsx  # Báo cáo học tập JLPT (Chuyên cần HV + Nhật ký)
```

---

## 2. Chi tiết các Sheet & Các cột đã chuẩn hóa / bổ sung

### A. Nhóm 1 — Phía ADMIN (`docs/data/import/admin/`)

1. **`backup_admin_kaiwa.xlsx`**
   * **Sheet 1 (`1.Chăm sóc` - 60 cột `A..BH`):** Hồ sơ học viên, học phí, lịch học, 15 mốc chăm sóc (Buổi 1..90) và 2 cột cộng dồn nhiều năm (`Tổng số buổi đã học năm trước`, `Tổng số buổi đã học trong năm`).
   * **Sheet 2 (`Báo cáo học tập Kaiwa` - 61 cột chia 8 nhóm):** Phẳng hóa toàn bộ báo cáo học tập Kaiwa để lưu hàng nghìn học viên trên 1 sheet (Thông tin HV + Buổi 1 + Buổi 3 + Chặng 1-10 + Chặng 11-20 + Chặng 21-30 + Giữa kỳ + Cuối kỳ).
   * **Sheet 3 (`Điểm danh chốt 2026`) & Sheet 4 (`Điểm danh chốt 2025`):** Tách theo từng năm học, gồm 12 cột cố định + các Block Tháng (6 cột tổng kết `Số buổi đã học / A / B / C / D / E` + các cột ngày `01..31`).

2. **`backup_admin_jlpt.xlsx`**
   * **Sheet 1 (`Data JLPT_Inhouse` - 52 cột `A..AZ`):** Hồ sơ học viên JLPT, lớp học, lịch hẹn tái chăm, điểm kiểm tra L1..L7, hỗ trợ đặc biệt L1..L3, đăng ký thi & kết quả thi thật.
   * **Sheet 2 (`Chuyên cần HV` - 24 cột `A..X`):** Giữ nguyên 22 cột chuẩn `A..V` của sheet `Chuyên cần HV` (Mã lớp, Họ và tên, Số buổi tham gia, Tổng số buổi đã điểm danh, Tỷ lệ tham gia, Điểm KT trung bình, Số buổi đã làm bài, Chuỗi vắng liên tiếp, Cảnh báo vắng, Chuỗi không làm bài, Cảnh báo không làm bài, Thông tin trao đổi, Trạng Thái, CVHT, Khoá, KT gần nhất, Buổi KT gần nhất, Cách đây, KT tiếp theo, Buổi KT tiếp theo, Còn buổi, Cảnh báo lịch KT) + **bổ sung 2 cột định danh `ID Học viên` (Cột W) và `Mã GV` (Cột X)** để đảm bảo đồng bộ/backup không bị trùng tên học viên.
   * **Sheet 3 (`Điểm danh chốt 2026`) & Sheet 4 (`Điểm danh chốt 2025`):** Điểm danh đã đối soát chốt theo từng năm.

3. **`backup_admin_doi_soat.xlsx`**
   * **Sheet 1 (`Tổng hợp Đối soát` - 32 cột):** Lưu lịch sử đối soát từng buổi học (Mã buổi học, Năm, Tháng, Ngày, Ca học, Chương trình, Mô hình, Mã lớp, ID HV, Họ tên, Mã GV, Mã CVHT, Trạng thái & Giá trị gốc GV chấm, Trạng thái & Giá trị gốc CSKH chấm, Trạng thái Đối soát `MATCHED/CONFLICT/PENDING/RESOLVED`, Kết quả chốt cuối cùng, Có trừ buổi không, Người phân xử & Ghi chú phân xử).
   * **Sheet 2 (`Thống kê Lệch & Chờ duyệt` - 32 cột):** Lọc riêng các buổi đang `CONFLICT` hoặc `PENDING_CS` / `PENDING_TEACHER`.

---

### B. Nhóm 2 — Phía CSKH (`docs/data/import/cskh/`)

1. **File 1A — `backup_cskh_kaiwa_CVHT01.xlsx`**
   * **Sheet 1 (`1.Chăm sóc` - 60 cột):** Hồ sơ học viên Kaiwa thuộc CVHT phụ trách + các mốc chăm sóc.
   * **Sheet 2 (`3.Chấm buổi` - 28 cột cố định + lịch tháng):** Điểm danh do CSKH chấm (`cs_status !== null`).
   * **Sheet 3 (`Điểm danh chốt` - 12 cột cố định + lịch tháng):** Xuất trạng thái điểm danh chốt.

2. **File 1B — `backup_cskh_jlpt_CVHT01.xlsx`**
   * **Sheet 1 (`Data JLPT_Inhouse` - 52 cột):** Hồ sơ học viên JLPT thuộc CVHT phụ trách + điểm kiểm tra định kỳ.
   * **Sheet 2 (`Chấm buổi` - 12 cột cố định + lịch tháng):** Điểm danh do CSKH chấm.
   * **Sheet 3 (`Điểm danh chốt` - 12 cột cố định + lịch tháng):** Điểm danh đã đối soát chốt giữa CSKH & GV.

---

### C. Nhóm 3 — Phía GIÁO VIÊN (`docs/data/import/giao_vien/`)

1. **`diem_danh_gv_GV505.xlsx`**
   * **Sheet 1 (`2026 スケジュール` - 6 cột cố định `A..F` + Block tháng 7 cột tổng kết & các cột ngày):** Giữ nguyên định dạng hiện tại.

---

### D. Nhóm 4 — File Báo cáo học tập Học viên (`docs/data/import/bao_cao_hoc_tap/`)

1. **`backup_bao_cao_hoc_tap_kaiwa.xlsx`**
   * **Sheet 1 (`Báo cáo học tập Kaiwa` - 61 cột chia 8 nhóm):** Lưu đầy đủ toàn bộ thông tin báo cáo học tập của học viên Kaiwa trên 1 bảng ngang.

2. **`backup_bao_cao_hoc_tap_jlpt.xlsx`**
   * **Sheet 1 (`Chuyên cần HV` - 24 cột `A..X`):** Chuẩn sheet `Chuyên cần HV` kèm `ID Học viên` & `Mã GV`.
   * **Sheet 2 (`Nhật ký nhận xét buổi học` - 12 cột):** Lưu chi tiết nhận xét từng buổi học của Giáo viên JLPT theo ngày.
