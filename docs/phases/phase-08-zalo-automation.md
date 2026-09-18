# Phase 8 — Zalo Automation Production

- Status: NOT_STARTED
- Started at:
- Completed at:
- Dependencies: Phase 7 technical spike accepted
- Open questions: Q-002, Q-007, Q-008 phải resolved.

## Mục tiêu

Triển khai automation có reliability, audit và idempotency.

## Checklist chi tiết

### 8.1 ZaloAccount

- [ ] account per CS theo model
- [ ] encrypted session data
- [ ] status/last active
- [ ] re-login/expired handling

### 8.2 ZaloContactRelation

- [ ] relation theo Student + ZaloAccount
- [ ] không dùng boolean friend trên Student

### 8.3 MessageRule

- [ ] rule default theo Package nếu có
- [ ] rule override theo Enrollment nếu spec chốt
- [ ] trigger_session_number
- [ ] delay
- [ ] content/variables
- [ ] approval flag nếu MVP giữ
- [ ] versioning/snapshot strategy

### 8.4 MessageDelivery

- [ ] một lần gửi cụ thể
- [ ] rendered content snapshot
- [ ] scheduled/sending/sent/failed/cancelled/skipped
- [ ] retry/error/provider id
- [ ] DB unique idempotency key

### 8.5 OutboxEvent

- [ ] Attendance write và event/message scheduling không được có cửa sổ mất job không được kiểm soát.

### 8.6 BullMQ

- [ ] delayed jobs
- [ ] retry/backoff
- [ ] per-account throttle
- [ ] job id deterministic khi phù hợp
- [ ] worker monitoring

### 8.7 Flow

- [ ] 1. Attendance hợp lệ được tạo/sửa.
- [ ] 2. Business rule xác định có trigger hay không.
- [ ] 3. Tạo MessageDelivery + OutboxEvent trong transaction phù hợp.
- [ ] 4. Outbox publisher enqueue.
- [ ] 5. Worker re-check invariant tại thời điểm send.
- [ ] 6. Send bằng đúng ZaloAccount.
- [ ] 7. Ghi result.

### 8.8 Cancellation/update

- [ ] Nếu attendance bị hủy/sửa trước send, delivery/job phải được cancel/skip đúng rule, không gửi nhầm.

### 8.9 Frontend

- [ ] connect/reconnect status
- [ ] MessageRule editor
- [ ] variable picker
- [ ] preview
- [ ] delivery history/error state

  Tất cả theo design system.


## API contract

Trước production implementation, cập nhật `docs/api/zalo.md` + `docs/api/openapi.yaml` cho account connect/status/reconnect, MessageRule và MessageDelivery history.

Không expose Zalo session secret/cookie/token trong response.

## Test plan

- duplicate event không gửi đôi
- worker retry
- expired session
- cancel before send
- relation policy
- rule precedence
- rendered snapshot
- restart Redis/worker scenario phù hợp

## Exit criteria

- [ ] Q-002/Q-007/Q-008 resolved.
- [ ] Idempotency test pass.
- [ ] No lost-job happy/recovery path documented.
- [ ] Session encryption/retention policy documented.
- [ ] Monitoring hooks đủ cho production.

- [ ] API contract/docs liên quan đã đồng bộ với implementation.

## Implementation notes

## Changes from original plan


## Agent notes

Đọc `docs/product/business-rules.md` trước; không implement các rule Zalo/MessageRule còn WAITING_USER.
