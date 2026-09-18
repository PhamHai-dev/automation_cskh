# ADR 001 — Tech stack và kiến trúc nền tảng

## Trạng thái

Accepted.

## Bối cảnh

Dự án là web app nội bộ production cho CS/GV/Manage/Admin, có dữ liệu học viên,
điểm danh, import Excel, RBAC/data scope và automation Zalo cần delayed job/retry/idempotency.

## Quyết định

| Thành phần | Quyết định |
| --- | --- |
| Frontend | React + Vite + TypeScript + Tailwind CSS |
| Backend | Node.js + Express + TypeScript |
| Backend organization | Modular Monolith, feature-first |
| Module flow | Route → Controller → Service → Repository → Prisma |
| Database | MySQL 8.x |
| ORM | Prisma |
| User roles | `User.roles` JSON array, không `UserRole` trong MVP |
| Queue | Redis + BullMQ |
| Reliability | MessageDelivery + Transactional Outbox cho automation |
| Excel | `exceljs` và/hoặc `xlsx` |
| Auth | JWT access token + refresh token HttpOnly cookie + AuthSession |
| API | Contract-first, OpenAPI tại `docs/api/openapi.yaml` |
| Frontend organization | feature-first + shared design system |
| Zalo | `zca-js` sau technical spike, luôn có fallback thủ công |

## Hệ quả

- Zalo/session worker cần runtime luôn bật; không thiết kế phần này như serverless stateless thuần.
- Redis production phải có persistence/config phù hợp cho BullMQ.
- API breaking change phải cập nhật contract trước/cùng implementation.
- UI không được tự tạo style ad-hoc; phải dùng design token/component chung.
- `zca-js` là integration rủi ro, phải pin version và verify bằng technical spike.

## Tham chiếu

- `architecture/system.md`
- `decisions/summary.md`
- `architecture/project-structure.md`
- `api/conventions.md`
