# Phase 9 — Hardening & Production Readiness

- Status: NOT_STARTED
- Started at:
- Completed at:
- Dependencies: các phase MVP cần release đã DONE
- Open questions: backup/retention/infrastructure-specific decisions còn lại.

## Mục tiêu

Đưa hệ thống từ feature-complete sang production-ready.

## Checklist chi tiết

### 9.1 Security

- [ ] dependency audit
- [ ] secret/config review
- [ ] cookie/CORS/headers
- [ ] auth brute-force/rate limit policy
- [ ] PII logging review
- [ ] Zalo session encryption/access review
- [ ] DB least privilege

### 9.2 Database

- [ ] backup strategy
- [ ] restore test
- [ ] migration deploy strategy
- [ ] indexes/query review
- [ ] slow query observation

### 9.3 Redis/BullMQ

- [ ] persistence
- [ ] no unsafe eviction
- [ ] queue monitoring
- [ ] failed job handling
- [ ] retention policy

### 9.4 Observability

- [ ] structured logs
- [ ] request correlation nếu phù hợp
- [ ] error tracking
- [ ] worker/queue metrics
- [ ] alert on repeated Zalo/session failures

### 9.5 Testing

- [ ] E2E critical paths
- [ ] permission/data-scope regression
- [ ] import regression
- [ ] attendance regression
- [ ] automation regression
- [ ] responsive smoke

### 9.6 Deployment

- [ ] staging → production checklist
- [ ] environment variables
- [ ] DB migration order
- [ ] worker process supervision
- [ ] rollback plan

### 9.7 Documentation

- [ ] runbook
- [ ] backup/restore
- [ ] common incidents
- [ ] re-login Zalo
- [ ] failed import handling
- [ ] user/session admin procedures


## API contract

- Validate OpenAPI không lỗi.
- Review endpoint chưa document / docs không còn endpoint thực tế.
- Freeze/version breaking changes cho release.
- Security review auth, error payload, sensitive fields và rate-limit policy.

## Exit criteria

- [ ] Backup restore test pass.
- [ ] Critical E2E pass.
- [ ] Security review complete.
- [ ] Monitoring/alerting operational.
- [ ] Runbook available.
- [ ] Production deployment checklist approved.

- [ ] API contract/docs liên quan đã đồng bộ với implementation.

## Implementation notes

## Changes from original plan
