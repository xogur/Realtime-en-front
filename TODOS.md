# TODOS

## Infrastructure

### Support multi-instance kiosk sessions

**What:** Move kiosk session ownership, controller leases, snapshots, and event distribution to a shared coordinator such as Redis.

**Why:** The approved in-memory `KioskSessionRegistry` is process-local and cannot keep one `kioskId` consistent across multiple voice-server workers or instances.

**Context:** The first production phase deliberately runs one voice-server process. Revisit this when concurrent kiosk demand requires horizontal scaling, rolling deployment without session reset, or process failover. Start from the `KioskSession` protocol and replace only registry storage and event transport; do not redesign the browser contract.

**Effort:** XL
**Priority:** P3
**Depends on:** Stable single-process kiosk session implementation and measured scaling need

### Restore kiosk conversations after server restart

**What:** Persist kiosk conversation domain state so a voice-server restart can restore messages, evaluations, corrections, missions, and sequence metadata.

**Why:** The approved design recovers browser and network disconnects but intentionally starts a new conversation after a server process restart.

**Context:** This requires a durable store, schema versioning, privacy and retention rules, and a policy for in-progress generations that cannot be resumed. Measure actual restart frequency and recovery value before selecting Redis or a database. Build this only after the in-memory snapshot contract is stable.

**Effort:** XL
**Priority:** P3
**Depends on:** Stable kiosk snapshot schema and approved conversation retention policy

## Completed
