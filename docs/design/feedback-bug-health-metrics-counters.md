# Identifier-free feedback bug-health counters

## Purpose

Hourly bug-health reporting needs genuine application rejection, terminal
attempt, and progressive-cooldown-band counts. Raw request telemetry is not an
admissible source because it can contain IP addresses, cookies, headers, URLs,
user agents, account correlation, or narrative. Missing counters must not be
silently replaced with zero.

This package defines the persistence contract for a small, fixed set of
system-managed counter shards. It does not implement storage, scheduling, or
feature-flag evaluation.

## Boundary

Each row represents one of 16 fixed shards for one canonical UTC hour. Its ID
is exactly `bug-hour:YYYY-MM-DDTHH:<00-15>`. It contains only:

- the canonical hour start and end;
- the shard number;
- aggregate terminal-attempt and rejected-attempt counts;
- fixed counters for the five application-owned progressive-cooldown bands
  and the fail-closed band;
- on shard zero only, a sorted set of heartbeat minute slots from 0 through
  59;
- a closed finalisation state and system finalisation instant;
- a server-owned update instant, bounded lifecycle metadata, and CAS revision.

The contract has no reporter, account, cookie, session, idempotency,
reservation, packet, request, IP, user-agent, URL, route, narrative,
ciphertext, client timestamp, exact event timestamp, or arbitrary label. It
also excludes the `edge-blocked` band because application code cannot derive
that value without joining restricted edge telemetry.

## Transitions

Creation is an empty, open, revision-zero row. A material update advances the
revision by exactly one and is one of:

1. one terminal application outcome: terminal count increases by one,
   rejected count increases by zero or one, and at most one closed abuse band
   increases by one;
2. one shard-zero heartbeat: exactly one previously absent minute slot is
   added and all counters remain unchanged; or
3. finalisation: all 60 heartbeat slots must be present, counts remain
   unchanged, and the row becomes terminal no earlier than two minutes after
   the hour ends.

Every update advances the canonical server update instant, shortens the live
TTL against the immutable deletion deadline, and may not extend retention.
Exact replay is not a persistence transition, including for finalised rows.
Adapters validate provider reads with
`validateFeedbackBugHealthMetricsCounterSnapshot`, acknowledge an identical
retry as a read-only no-op, and must not replace, upsert, touch, or refresh its
TTL. Material writes use `feedbackBugHealthMetricsCounterEntitySchema` with an
ETag or transactional condition; schema revision validation is not a
distributed lock.

Terminal-outcome mutations additionally require an immutable operation receipt
with a cryptographically random UUIDv4. The receipt uses `counterId` as its
partition key and is created with If-None-Match in the same Cosmos
transactional batch as the conditional counter replacement. It records only
the bound hour, shard, resulting counter revision, a closed outcome, and
minute-rounded lifecycle values. It contains no stable reporter or request
identifier and expires after 15 minutes, with hard purge and bounded-backup
expiry due one day later.

If the provider result is ambiguous, the adapter must read the exact receipt.
Presence proves the counter operation committed atomically; absence permits a
new server-random operation. Receipt replacement, upsert, TTL refresh, and
cross-partition batching are forbidden.

## Composition and rollout

The site inherits `feedback.reporting.enabled`. An isolated counter writer may
write only this entity table; an isolated producer reads exact 16-row windows,
requires all rows finalised and shard-zero heartbeat completeness, emits the
schema-backed immutable metrics projection, and never reads raw telemetry.
The producer fails the hour closed for missing, partial, corrupt, changed, or
future source data.

Disabling the parent flag stops new reporting work. It does not reinterpret a
missing source as an all-zero hour. Infrastructure must configure private
networking, managed identity, bounded backup retention, TTL, and live
container-scope attestations before enabling the source.
