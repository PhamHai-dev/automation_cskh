> 📄 Phần của bộ tài liệu spec — xem `../README.md` để biết thứ tự đọc và bối cảnh tổng thể.

## 2. Kiến trúc hệ thống đề xuất

```text
┌──────────────┐      HTTP      ┌──────────────────┐      SQL      ┌──────────────┐
│ Frontend     │◄──────────────►│ Backend API      │◄────────────►│ MySQL 8.x    │
│ React + Vite │                │ Node + Express   │              │              │
└──────────────┘                └────────┬─────────┘              └──────────────┘
                                      │
                         ┌────────────┴────────────┐
                         │ Redis + BullMQ          │
                         │ - delayed message       │
                         │ - retry                 │
                         │ - import jobs           │
                         │ - per-account throttle  │
                         └────────────┬────────────┘
                                      │
                         ┌────────────┴────────────┐
                         │ Zalo Session Service    │
                         │ zca-js                  │
                         │ - login/session         │
                         │ - send message          │
                         │ - relation/contact      │
                         └─────────────────────────┘
```

**Stack đề xuất:**

- Backend: **Node.js + Express.js**
- Frontend: **React + Vite + Tailwind**
- Database: **MySQL 8.x**
- ORM: **Prisma**
- `User.roles`: **MySQL JSON column**; backend/Prisma đọc thành array và validate bằng enum ứng dụng. Không dùng `UserRole` trong MVP.
- Queue: **BullMQ + Redis**
- Import/Export Excel: `xlsx` / `exceljs`
- Auth: email/password + JWT access token ngắn hạn + refresh token cookie `httpOnly`; refresh token được quản lý bằng `AuthSession`
- Zalo: `zca-js` — thư viện không chính thức; cần technical spike sớm và luôn có phương án thao tác tay dự phòng
- Backend/Zalo service cần chạy trên server **luôn bật**, không dùng serverless cho session Zalo
- Redis production phải bật persistence phù hợp, không cấu hình eviction làm mất key queue quan trọng

### 2.1. Nguyên tắc reliability cho automation

Không dùng luồng đơn giản:

```text
INSERT Attendance
→ queue.add()
```

vì nếu DB ghi thành công nhưng process chết trước khi enqueue thì message có thể bị mất.

Thay vào đó dùng:

```text
DB transaction
  ├─ INSERT/UPDATE Attendance
  ├─ INSERT MessageDelivery
  └─ INSERT OutboxEvent
COMMIT

Outbox worker
  ↓
BullMQ
  ↓
Zalo worker
```

Ngoài ra phải có unique constraint để đảm bảo **idempotency** và chống gửi trùng.

---

