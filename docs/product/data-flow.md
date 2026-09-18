> 📄 Phần của bộ tài liệu spec — xem `../README.md` để biết thứ tự đọc và bối cảnh tổng thể.

## 5. Luồng dữ liệu tổng thể V3

```text
Student
  ↓
Enrollment (gói/lần học)
  ↓
EnrollmentClass (lớp/giai đoạn hiện tại)
  ↓
Class
  ├─ ClassTeacher
  ├─ ClassSchedule
  └─ ClassSession
          │
          ▼
      Attendance
          │
          ├──► aggregate số buổi đã học/còn lại
          ├──► Dashboard Sheet 3
          │
          └──► Business rule trigger message?
                    │
                    ▼
               MessageRule
                    │
                    ▼
             MessageDelivery
                    + OutboxEvent
                    │
                    ▼
                 BullMQ
                    │
                    ▼
               Zalo worker
                    │
                    ▼
               ZaloAccount
                    │
                    ▼
                 Student

Sheet 1:
Student + Enrollment + EnrollmentClass + Class/Teacher
        ├── CareLog
        └── CareTask

Sheet 3:
ClassSession + Attendance
```

**Nguyên tắc:** Sheet 1 cung cấp bức tranh hồ sơ/hành trình học; Sheet 3 cung cấp event điểm danh theo buổi. Hai sheet gặp nhau tại `EnrollmentClass`.

---

