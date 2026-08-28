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
Finalised rows accept only field-for-field exact replay. Persistence must add
ETag or transactional conditional writes; schema revision validation is not a
distributed lock.

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
