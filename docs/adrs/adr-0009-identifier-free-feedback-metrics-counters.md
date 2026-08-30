# ADR-0009: Use closed identifier-free shards for feedback bug-health counters

- Status: Accepted
- Date: 2026-08-28

## Context

The feedback reporting Feature needs hourly application rejection, terminal
attempt, and abuse-band aggregates. Existing analytics, access logs, WAF logs,
and the pseudonymous abuse-control container are deliberately outside the
feedback reporting trust boundary. Joining any of them would weaken the
privacy promise, while substituting missing values with zero would make the
report untrustworthy.

`@plasius/schema` owns the immutable public-to-report projection. A mutable,
concurrency-safe source still needs an entity contract that storage adapters
can validate before conditional writes and before final projection.

## Decision

Expose `feedbackBugHealthMetricsCounterEntitySchema` as an additive,
system-managed contract in the separate `feedbackMetricsControl` table.
Sixteen fixed shards bound write contention. IDs, hours, shard indexes,
counters, heartbeat slots, lifecycle, and transitions are closed and
deterministic.

The contract records terminal application attempts rather than general site
traffic. Consequently the immutable projection's `trafficDenominator` means
the complete number of terminal bug-submission attempts for that hour. This is
a genuine denominator for application acceptance/rejection health and is not
presented as unique visitors, sessions, page views, or accounts.

Shard zero carries minute heartbeat slots. Finalisation requires every slot;
all 16 shards must then be sealed and read by exact deterministic IDs. The
site producer must reject missing or partial hours and must not synthesize
zeros. Heartbeats are system completeness evidence, not user activity.

The row is identifier-free. It contains no raw or pseudonymous subject,
request metadata, packet join, narrative, client timestamp, exact event time,
or open-ended dimension. Application-owned abuse bands are fixed fields;
`edge-blocked` remains absent unless a future separately governed,
privacy-reviewed aggregate source is approved.

Updates use numeric CAS revisions plus provider ETags or transactions. One
update represents exactly one terminal outcome, one new heartbeat slot, or
one finalisation. Counts cannot decrease or jump, heartbeat slots cannot be
removed or reordered, retention cannot be extended, and finalisation is
terminal.

Provider reads use a separate closed snapshot validator. The material
transition schema rejects all exact replays, including open and finalised rows.
An adapter may acknowledge an identical retry only as a read-only no-op; it
must not issue replace, upsert, touch, or TTL-refresh operations because a
provider-managed modification timestamp could otherwise extend retention.

[ADR-0010](./adr-0010-feedback-metrics-atomic-operation-receipts.md) adds one
narrow exception to the aggregate-only storage shape: a server-random,
identifier-free, 15-minute operation receipt created atomically with a terminal
counter mutation. It is reconciliation evidence, not a reporting event source;
processors never enumerate or project it.

## Consequences

- The reporting source can be aggregated without enumerating pseudonymous
  control rows or reading raw telemetry.
- Missing counter-source availability becomes a visible freshness failure
  instead of a fabricated healthy hour.
- The separate table and identities add operational resources and require
  private networking, TTL/backup evidence, and container-level RBAC.
- General site-traffic-normalised rates remain out of scope until an equally
  privacy-safe aggregate source is designed and approved.

## Rollout

The package does not evaluate flags or capabilities. Site consumers inherit
`feedback.reporting.enabled`, keep all workload registration default-off, and
must deploy through approved CI/CD. Anonymous feedback remains independently
gated by its edge/WAF readiness controls.

## Alternatives considered

- Read analytics or WAF/access logs: rejected because those sources can carry
  network and request metadata and are forbidden from feedback joins.
- Enumerate cooldown control rows: rejected because those rows are
  pseudonymous personal data.
- Emit one event row per request: rejected because event-level timing creates
  unnecessary correlation and retention.
- Use one hot counter row: rejected because it creates avoidable write
  contention under abuse.
- Treat a missing hour as zero: rejected because absence is not evidence.
