# Phase 7 — Zalo Technical Spike

- Status: NOT_STARTED
- Started at:
- Completed at:
- Dependencies: Core phases 0–6 stable
- Open questions: Q-007; technical results có thể tạo câu hỏi mới.

## Mục tiêu

Giảm rủi ro `zca-js` trước khi tích hợp sâu. Đây là technical spike, không phải production automation.

## Checklist chi tiết

### 7.1 Bắt buộc test

- [ ] pin exact repo/version
- [ ] login flow thực tế
- [ ] lưu/restore session sau restart
- [ ] expired/re-login
- [ ] gửi text test
- [ ] recipient/thread id
- [ ] contact/friend relation nếu API hỗ trợ ổn định
- [ ] 2–3 account đồng thời
- [ ] process restart
- [ ] account login nơi khác
- [ ] failure/retry behavior
- [ ] memory/process footprint sơ bộ

### 7.2 Output

- [ ] version tested
- [ ] environment
- [ ] test matrix
- [ ] observed limitations
- [ ] session persistence strategy khả thi
- [ ] blockers
- [ ] go/no-go recommendation về mặt kỹ thuật

  Không được coi rate limit tự đặt là đảm bảo account an toàn.

## Không làm

- Không bật auto messaging cho user thật production.
- Không nối Attendance → send production.
- Không build full MessageRule UI.


## API contract

Technical spike không bắt buộc expose public business API. Nếu tạo temporary/debug endpoint thì phải đánh dấu rõ chỉ dùng development và không đưa vào production contract. Kết quả spike phải xác định contract dự kiến cho Phase 8 trước khi bắt đầu Phase 8.

## Exit criteria

- [ ] Có spike report.
- [ ] Có exact version pin.
- [ ] Có quyết định kỹ thuật có tiếp tục zca-js hay không.
- [ ] Nếu blocker: Phase 8 không được bắt đầu trước khi user xác nhận phương án.

## Implementation notes

## Changes from original plan
