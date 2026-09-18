# Agent.md — Quy tắc bắt buộc cho AI coding agent

File này là quy tắc vận hành bắt buộc khi AI phân tích, thiết kế, viết code, test, sửa lỗi và cập nhật tài liệu cho dự án `automation_cskh`.

## 1. Nguồn sự thật (source of truth)

Trước khi viết hoặc sửa code, luôn đọc theo thứ tự:

1. `Agent.md`
2. `docs/README.md`
3. `docs/decisions/summary.md`
4. `docs/STATUS.md`
5. File phase hiện tại trong `docs/phases/`
6. Các tài liệu nghiệp vụ/kỹ thuật liên quan đến task.

Thư mục `/docs` là nguồn sự thật của dự án. Nếu code hiện tại mâu thuẫn với docs, không tự chọn một bên. Phải báo xung đột và xin xác nhận nếu thay đổi ảnh hưởng nghiệp vụ, dữ liệu, quyền hoặc kiến trúc.

## 2. Phạm vi MVP

MVP chỉ tập trung nghiệp vụ tham chiếu từ:

- Sheet `1.Chăm sóc`
- Sheet `3.Chấm buổi`

Không tự triển khai nghiệp vụ từ các sheet khác. Không tự triển khai mục trong `docs/product/backlog.md` nếu người dùng chưa yêu cầu.

## 3. Stack cố định

- Frontend: React + Vite + TypeScript + Tailwind CSS
- Backend: Node.js + Express + TypeScript
- Backend architecture: Modular Monolith, feature-first; trong mỗi module dùng Route → Controller → Service → Repository → Prisma
- Database: MySQL 8.x
- ORM: Prisma
- Queue: Redis + BullMQ
- Excel: `exceljs` và/hoặc `xlsx`
- Auth: JWT access token + refresh token HttpOnly cookie
- `User.roles`: JSON array trong MySQL; không tạo `UserRole`
- Zalo: `zca-js`, chỉ triển khai production sau technical spike

Không thay stack hoặc thêm framework lớn nếu chưa được xác nhận.

## 4. Kiến trúc backend bắt buộc

Mỗi domain đặt trong `backend/src/modules/<module>/` và có thể gồm:

- `<module>.routes.ts`
- `<module>.controller.ts`
- `<module>.service.ts`
- `<module>.repository.ts`
- `<module>.schema.ts`
- `<module>.types.ts`
- `<module>.mapper.ts` khi cần
- `__tests__/` khi phù hợp

Luồng chuẩn:

`Route → Controller → Service → Repository → Prisma → MySQL`

Quy tắc:

- Controller mỏng: nhận request, gọi service, trả response.
- Business rule nằm ở service/use-case.
- Query DB tập trung ở repository, trừ truy vấn cực nhỏ được quy định rõ.
- Không gọi Prisma trực tiếp từ route.
- Không nhét business logic dài vào controller.
- Job/worker không gọi controller; gọi service/use-case dùng chung.

## 5. Kiến trúc frontend bắt buộc

Frontend dùng feature-first:

- `src/features/<feature>/`
- `src/components/ui/` cho component nền tảng tái sử dụng
- `src/components/common/` cho component dùng chung theo sản phẩm
- `src/layouts/`
- `src/styles/`
- `src/assets/`
- `public/images/`

Trước khi code UI phải đọc:

- `docs/ui/design-system.md`
- `docs/architecture/frontend.md`
- `.agents/skills/product-frontend/SKILL.md`

Không tự tạo màu, khoảng cách, radius, button, table, card, modal hoặc page layout khác chuẩn design system.

## 6. Assets/ảnh

- `frontend/public/images/logos/`: logo dùng trực tiếp bằng URL.
- `frontend/public/images/backgrounds/`: background tĩnh.
- `frontend/public/images/placeholders/`: placeholder public.
- `frontend/src/assets/images/`: ảnh import trong React.
- `frontend/src/assets/images/empty-states/`: empty-state illustration.
- `frontend/src/assets/svg/`: SVG đặc thù.
- Không lưu ảnh rải rác trong `pages/` hoặc component feature nếu không có lý do rõ ràng.
- Không nhúng base64 dài trực tiếp trong component.
- Icon UI phổ thông ưu tiên icon library đã chốt, không tạo PNG riêng.

## 7. Domain rules không được tự thay đổi

### Student
`Student` = một con người. Không lưu trực tiếp `class_id`, `teacher_id`, `cs_id`, attendance hoặc lịch sử lớp.

### Enrollment
`Enrollment` = một gói/lần đăng ký học của Student. Một Student có thể có nhiều Enrollment.

### EnrollmentClass
`EnrollmentClass` = hành trình một Enrollment học trong một Class. Dùng để giữ lịch sử chuyển lớp/đi tiếp level trong cùng Enrollment.

Không thay bằng một `Enrollment.class_id` duy nhất nếu chưa được duyệt.

### ClassSession
`ClassSession` = một buổi học thực tế của Class. Ngày/giờ buổi học nằm ở đây.

### Attendance
`Attendance` = trạng thái của một `EnrollmentClass` trong một `ClassSession`.

Phải tham chiếu:

- `EnrollmentClass`
- `ClassSession`

Phải có unique constraint tương đương:

`UNIQUE(enrollment_class_id, class_session_id)`

Không gắn Attendance trực tiếp với Student và không duplicate ngày/giờ buổi học trong Attendance.

## 8. Giáo viên

- Giáo viên là `User` có role `TEACHER`.
- Thông tin nghiệp vụ riêng nằm trong `TeacherProfile` nếu cần.
- Quan hệ GV ↔ lớp dùng `ClassTeacher` để giữ lịch sử.
- Không gắn teacher cố định trực tiếp lên Student.

## 9. Auth, role và data scope

Roles hợp lệ:

- `ADMIN`
- `MANAGE`
- `CS`
- `TEACHER`

Không có public signup. Admin tạo/quản lý tài khoản trong Settings/User Management.

Mọi API protected phải kiểm tra 3 lớp:

1. Authentication
2. Permission/role
3. Data scope

Scope:

- ADMIN: toàn hệ thống
- MANAGE: CS thuộc nhóm được gán qua `ManageAssignment`
- CS: Enrollment có `cs_id = currentUser.id`
- TEACHER: Class/Enrollment thuộc lớp được phân công qua `ClassTeacher`

User đa role không tự động có full scope. Nếu endpoint chưa có rule đa role rõ ràng, dừng và hỏi.

## 10. Database rules

Khi tạo/sửa/review Prisma schema hoặc migration, phải áp dụng `.agents/skills/prisma-schema-guard/SKILL.md`.

Trước khi sửa Prisma schema, đọc:

- `docs/architecture/data-model-core.md`
- `docs/architecture/data-model-zalo-care.md`
- `docs/decisions/summary.md`

Yêu cầu:

- giữ foreign key integrity
- index các FK/filter thường dùng
- unique constraint khi duplicate là sai nghiệp vụ
- tránh nhiều source of truth
- multi-record write quan trọng phải dùng transaction
- không xóa lịch sử âm thầm
- không đổi quan hệ dữ liệu chỉ để code dễ hơn

Sau thay đổi schema phải chạy tối thiểu:

```bash
npx prisma format
npx prisma validate
```

Nếu có DB khả dụng, tạo và review migration trước khi kết thúc phase.

## 11. Attendance rule chưa rõ thì không được đoán

Các rule về A/B/C/D/E phải theo docs. Nếu còn `TBD`, AI không được tự quyết:

- có trừ buổi không
- có tính completed không
- có trigger message không

Nếu phase hiện tại phụ thuộc rule chưa chốt, thêm vào `docs/OPEN_QUESTIONS.md`, báo người dùng và dừng phần phụ thuộc.

## 12. Excel import

Flow chuẩn:

1. Upload
2. Parse
3. Preview
4. Mapping cột
5. Validate
6. Confirm
7. Import bằng transaction khi cần
8. Ghi `ImportBatch` + `ImportRow`
9. Trả success/error chi tiết

Không phụ thuộc cứng vào vị trí cột nếu spec yêu cầu mapping. Không tự sửa dữ liệu nguồn lỗi. Không bỏ qua duplicate/unrecognized row âm thầm.

## 13. Zalo automation

Không triển khai production automation trước khi core flow ổn định và technical spike đạt.

Khi triển khai phải dùng:

- `ZaloAccount`
- `ZaloContactRelation`
- `MessageRule`
- `MessageDelivery`
- `OutboxEvent`
- BullMQ

Message delivery phải idempotent. Không chỉ check duplicate trong memory. Không tự bịa quota/hành vi Zalo không được xác minh.

## 14. Reliability

Không dùng luồng dễ mất job:

`ghi Attendance → queue.add()`

nếu crash giữa hai bước có thể làm mất message. Dùng Outbox/MessageDelivery theo docs.

Các write quan trọng phải audit được.

## 15. Quy tắc code

- TypeScript cho frontend/backend.
- Validate input request.
- Không hardcode secret.
- Duy trì `.env.example`.
- API error format thống nhất.
- Ưu tiên code rõ ràng hơn abstraction phức tạp.
- Không refactor code ngoài phạm vi phase/task nếu không cần.
- Không thêm dependency nếu standard library/dependency hiện tại đã đủ.
- Không tạo utility chung khi mới chỉ có một use-case trừ khi logic thực sự cross-cutting.


## 16. API contract bắt buộc

Khi tạo/sửa backend API module hoặc endpoint, phải áp dụng `.agents/skills/api-module-scaffold/SKILL.md`.

Khi task liên quan API, trước khi code phải đọc:

- `docs/api/conventions.md`
- `docs/api/README.md`
- `docs/api/openapi.yaml`
- file `docs/api/<module>.md` tương ứng

Quy tắc contract-first:

1. Endpoint mới hoặc thay đổi endpoint phải được mô tả trong `docs/api/openapi.yaml` và docs module **trước hoặc cùng task trước khi frontend phụ thuộc vào nó**.
2. Backend implementation phải khớp method/path/request/response/status code trong contract.
3. Frontend không được tự suy đoán field, path hoặc response shape chưa có trong contract.
4. Mọi protected endpoint vẫn phải enforce Authentication + Permission/Role + Data Scope.
5. Thay đổi API breaking hoặc thay đổi business rule/permission/UX flow không được tự quyết; phải ghi `OPEN_QUESTIONS.md` và hỏi user.
6. Sau khi API implementation hoàn tất phải có integration test phù hợp.
7. Nếu API contract thay đổi trong phase, phải cập nhật `docs/api/*`, file phase và `docs/CHANGELOG.md`.

OpenAPI không thay thế business docs. Nếu OpenAPI mâu thuẫn domain/decision đã chốt, phải báo xung đột.


## 16.1. Business rules registry

`docs/product/business-rules.md` là điểm tra cứu tập trung cho rule đã chốt/chưa chốt.
Nếu rule ở đó là `CHƯA CHỐT` hoặc liên kết tới `OPEN_QUESTIONS.md` trạng thái `WAITING_USER`, AI không được tự quyết chỉ vì một tài liệu phụ hoặc code hiện tại đang có một giả định.

## 16.2. Code conventions

Mọi code mới phải tuân thủ `docs/architecture/code-conventions.md`, đặc biệt naming, validation boundary, transaction, error handling, secret/logging và dependency discipline.

## 17. Kỷ luật theo phase

AI chỉ làm **một phase tại một thời điểm** theo `docs/phases/`.

Trước khi bắt đầu phase:

1. Đọc file phase.
2. Đọc `docs/STATUS.md`.
3. Đọc `docs/OPEN_QUESTIONS.md`.
4. Kiểm tra prerequisite của phase.
5. Nếu có blocker chưa chốt, hỏi người dùng trước.

Không tự nhảy phase tiếp theo.

## 18. Bắt buộc sau mỗi phase

Sau khi code xong phase, AI phải thực hiện đầy đủ:

### 18.1. Kiểm tra code

Chạy các kiểm tra phù hợp:

- unit test
- integration test nếu phase có API/DB
- typecheck
- lint
- build
- Prisma format/validate nếu schema thay đổi
- migration review nếu DB thay đổi
- responsive/UI checklist nếu có frontend
- validate `docs/api/openapi.yaml` nếu API contract thay đổi

Không báo hoàn thành nếu check do phase hiện tại gây ra vẫn fail.

### 18.2. Cập nhật tài liệu

AI phải cập nhật:

- file phase hiện tại trong `docs/phases/`
- `docs/STATUS.md`
- `docs/CHANGELOG.md`
- `docs/OPEN_QUESTIONS.md` nếu phát sinh/chốt câu hỏi
- `docs/decisions/summary.md` hoặc ADR nếu có quyết định kiến trúc/nghiệp vụ mới đã được người dùng duyệt
- spec liên quan nếu implementation được duyệt làm thay đổi spec
- `docs/api/openapi.yaml` + module API docs nếu endpoint/contract thay đổi

Không để code và docs lệch nhau âm thầm.

### 18.3. Báo cáo phase

Báo cho người dùng:

- đã làm gì
- file chính đã tạo/sửa
- migration nào được tạo
- test/check nào đã chạy và kết quả
- issue/technical debt mới phát sinh
- thay đổi nào lệch so với plan ban đầu và lý do
- câu hỏi chưa rõ cần người dùng xác nhận

Sau đó **dừng và chờ xác nhận**. Không tự bắt đầu phase kế tiếp.

## 19. Khi phát sinh vấn đề hoặc cần đổi plan

Nếu phát hiện vấn đề trong khi code:

### Trường hợp A — bug implementation, không đổi nghiệp vụ/kiến trúc
Có thể tự sửa trong phase. Ghi vào phase report nếu đáng kể.

### Trường hợp B — cần thay đổi schema, quan hệ, permission, business rule, API contract, UX flow hoặc stack
Không được tự quyết. Phải:

1. Mô tả vấn đề.
2. Nêu tác động.
3. Nêu 1–3 phương án.
4. Đề xuất phương án kỹ thuật nhưng không tự áp dụng.
5. Ghi câu hỏi vào `docs/OPEN_QUESTIONS.md` với trạng thái `WAITING_USER`.
6. Hỏi người dùng xác nhận.
7. Chỉ sau khi được duyệt mới cập nhật `docs/decisions/summary.md`/ADR, file phase và code.

### Trường hợp C — phát hiện phase thiếu task nhưng không thay đổi kiến trúc
Có thể đề xuất thêm task vào file phase; phải ghi rõ `Added during implementation`. Nếu task làm scope tăng đáng kể, hỏi người dùng trước.

## 20. Cách ghi trạng thái phase

Mỗi file phase phải có đầu mục:

- Status: NOT_STARTED | IN_PROGRESS | BLOCKED | DONE
- Started at
- Completed at
- Dependencies
- Open questions
- Scope
- Deliverables
- Test plan
- Exit criteria
- Implementation notes
- Changes from original plan

AI phải cập nhật các trường này khi tiến hành.

## 21. Không được tự suy đoán

Nếu thiếu thông tin ảnh hưởng đến:

- database
- permission/data scope
- attendance calculation
- import mapping
- automation
- migration dữ liệu
- UI workflow chính
- brand/design decision quan trọng

phải hỏi người dùng trước.

Các chi tiết implementation nhỏ, không thay đổi behavior/architecture, có thể chọn theo best practice và ghi lại nếu cần.
