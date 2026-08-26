# ADR-0008: Separate system feedback entities from reporter controls

- Status: Accepted
- Date: 2026-07-18
- Updated: 2026-08-26

## Context

Privacy-safe feedback needs short-lived structured-draft, immutable packet,
materialized-report, timer-checkpoint, and safe game-reconstruction metadata.
Existing `BaseEntity` requires a user actor through `createdBy`, which is
inappropriate for system-generated artifacts and would add an identity to
otherwise identifier-free feedback.

Review suppression, progressive bug cooldowns, and submission reservations do
need short-lived reporter correlation. That correlation is pseudonymous
personal data and must not enter feedback packets, reports, Admin, MCP, or
public honesty metrics.

`@plasius/schema` 1.4.0 owns the closed feedback packet, draft, aggregate, and
policy contracts. Entity validation must preserve that closed boundary and
also reject accessors, non-plain objects, invalid CAS transitions, and unsafe
retention changes before persistence.

## Decision

`@plasius/entity-manager` exposes additive, actor-free system entities for:

- 24-hour structured-draft metadata;
- structured bug/review packet metadata;
- hourly/daily/public materialization metadata;
- conditional processor checkpoints; and
- server-created safe game-reconstruction metadata.

These entities do not extend `BaseEntity` and contain no actor fields.
Packet/report/reconstruction metadata is immutable at revision zero.
Checkpoints use monotonic revisions and must also be written with a storage
condition.

Draft, content, report, and reporter-control schemas declare distinct store
names: `feedbackDrafts`, `feedbackContent`, `feedbackReports`, and
`feedbackControl`. Infrastructure must preserve that authorization separation.
The draft payload remains owned and validated by `@plasius/schema`; an adapter
composes it with the entity metadata in one ETag-conditional storage operation
without copying the payload shape into this package. A dirty save refreshes an
exact 24-hour lifetime. The metadata contains no narrative, ciphertext,
reporter key, or final packet ID, and soft delete/backups cannot extend expiry.

Report and checkpoint windows use purpose-prefixed, calendar-validated UTC
grammars for hour, day, or five-minute reconciliation buckets. Checkpoint IDs
are the exact deterministic composition of processor and window. Generic
"safe" strings, UUIDs, pseudonyms, and account-shaped values are not valid
window or checkpoint identifiers.

Reporter controls are separate schemas for:

- one authoritative progressive bug cooldown/reservation aggregate; and
- one immutable, identifier-isolated commit-reconciliation outbox row; and
- one immutable, identifier-isolated committed-acceptance delivery outbox row;
  and
- accepted review count and review-deny expiry.

A control state ID is exactly a versioned, canonical unpadded base64url
HMAC-SHA-256 token. A reservation ID is exactly a versioned, canonical
unpadded base64url 128-bit random token and its idempotency digest is a
canonical 256-bit value. Validators require zero unused pad bits so multiple
textual aliases cannot represent the same token. Control entities contain no
packet or artifact ID, so the pseudonym boundary cannot be joined to content
through these contracts. Every control field is internal; the state ID and
complete aggregate are marked as pseudonymous personal data and redacted for
logging.

Every feedback schema rejects unknown top-level fields before normal schema
validation. It returns a fixed error without echoing a field value. Lifecycle
validation binds TTL to an absolute hard-delete deadline and limits the total
privacy lifetime after logical expiry to seven days.

The aggregate stores the wire-exact `@plasius/api` `reservation-v1`
`ProgressiveCooldownState` inside an adapter-private row envelope. It validates
the fixed `5m → 15m → 1h → 6h → 24h` ladder, a five-minute reservation lease,
48-hour quiet reset, six-day post-expiry reconciliation, at most 64 unique
reservation/idempotency/attempt-authority digests, and an exact absolute purge
deadline one day after the final reconciliation horizon. A new reservation
starts only after active leases and cooldowns end and carries generation-one
owner authority. The raw authority token is never persisted.

Reserved records may release or commit. The matching owner authority may also
admit `reserved → writing`; the generation and token digest are immutable, the
server write epoch must be inside the reservation lease, and a writing record
cannot release. It converges through commit after immutable acceptance or the
bounded reconciliation path. A released record may later commit when
reconciliation independently proves immutable acceptance. That late commit
advances/caps the current streak, while its cooldown remains anchored to the
server reservation epoch so reconciliation latency cannot extend it; no packet
identifier is persisted. Committed records are terminal. Exact deep replay is
valid without a revision increment; a material CAS update advances by exactly
one. Reservation-array order is non-semantic, and same-millisecond commits are
valid. Exact replay validates the stored row's closed top-level shape as well
as the submitted row, so a legacy or corrupt identity/join field cannot bypass
validation. The adapter losslessly stringifies the numeric row revision for
the opaque `@plasius/api` snapshot revision.

The immutable reconciliation outbox is created transactionally with
`reserved → writing` in the same `feedbackControl` partition and is deleted
after an idempotent outcome. It carries only the keyed state ID, random
reservation ID, closed submission kind, write/lease/reconciliation timestamps,
an absolute purge deadline, TTL, and revision. It contains no content-plane
identifier, packet/artifact/draft ID, idempotency value, raw or digested attempt
authority, narrative, or account data. Its live TTL ends at the six-day
reconciliation cutoff and its absolute deletion deadline is one day later.

The immutable committed-acceptance delivery outbox is created transactionally
with the successful control commit, including reconciled commits. It carries
only the canonical keyed state ID, random reservation ID, closed packet kind,
separate server-owned acceptance and control-commit epochs, bounded
delivery/deletion epochs, TTL,
and revision zero. It contains no packet ID or content locator/hash, accepted
content/time string, draft, idempotency or attempt-authority data, request
metadata, narrative, ciphertext, pixels, or account data. Its worker derives
the packet UUID transiently, validates the immutable packet, writes the
separate identifier-free evidence idempotently, and only then deletes the row
conditionally.

The acceptance epoch must equal the immutable packet's validated server
reservation time and may not follow the commit epoch. The row remains
deliverable for exactly six days after the associated bug
cooldown step or exact 30-day review deny expires. The seventh and final day is
reserved for explicit deletion and backup expiry. This keeps every copy within
the seven-day post-eligibility privacy bound while allowing crash-safe evidence
delivery. TTL is shortened from the later control commit, while eligibility and
absolute deletion remain anchored to acceptance. The schema validates the
timing arithmetic; the site owns the atomic Cosmos transaction and cross-store
delivery protocol.

Each record's `reconciliationUntilMs` is its live six-day reconciliation
cutoff. The row's `hardDeleteByMs` is the latest record or active
cooldown/reset reconciliation horizon plus exactly one day. The row TTL budget
floors the interval ending at that reconciliation horizon. The following day
is reserved for explicit conditional deletion, verification, and expiry of the
isolated control boundary's short backup window. Zero TTL is valid only for an
empty and inactive delete instruction.

Because Cosmos TTL starts from database `_ts`, adapters shorten the budget
again at actual persistence time. They issue a delete when no positive duration
remains and never write invalid Cosmos TTL zero. Live data, soft-deleted
versions, and backups must all be gone by the absolute deadline; TTL is only
defence in depth because Cosmos TTL starts at the last database modification
and physical deletion is asynchronous
([Azure TTL behaviour](https://learn.microsoft.com/en-us/azure/cosmos-db/time-to-live)).
The isolated feedback-control boundary must consequently use a restore horizon
of at most 24 hours and is excluded from continuous seven-/thirty-day and
long-term backup products. The same safety budget applies to the review deny
and deprecated control projections; the review entity separately validates an
exact 30-day deny.

The previous per-subject abuse and per-reservation schemas remain deprecated
exports for source-compatible migration only. They are not authoritative
because independent rows cannot atomically enforce subject-wide capacity,
cooldown, or released-to-committed reconciliation.

## Integrity and availability

New mutable state starts at revision zero. Updates validated against an
existing entity must advance by exactly one, except an exact idempotent replay.
This equality-only replay rule also applies to the separate review-eligibility
entity at non-zero revisions; it does not permit a new non-zero row or bypass
the accepted-review counter, deny-expiry, lifecycle, or closed-field checks.
Storage adapters must combine this contract with ETag or transactional
conditional writes; schema revision validation alone does not provide
distributed atomicity.

Callers must distinguish an available empty read from an unavailable control
store. An unavailable store fails closed. The `@plasius/api` reservation and
cooldown interface owns retry and `Retry-After` behaviour.

## Privacy consequences

- Feedback content remains identifier-free and actor-free.
- Structured draft metadata remains actor-free, identifier-isolated from final
  packets, and hard-deleted after 24 hours.
- Operators cannot retrieve reporter correlation through public serialization.
- Raw account IDs and arbitrary pseudonyms fail the keyed-subject grammar.
- Narrative, pixels, network data, and arbitrary extra properties fail closed.
- Control state remains pseudonymous personal data and must stay in its
  separately authorised storage boundary.

## Rollout

The contracts inherit the parent feedback feature flags. They introduce no
package-local flag evaluation and no capability grant. Disabling intake stops
new state creation but does not bypass existing cooldowns or extend retention.

## Alternatives considered

- Extend `BaseEntity`: rejected because mandatory actor fields would violate
  content-plane data minimization.
- Put a keyed subject in every packet: rejected because reports, Admin, MCP,
  and public metrics do not need reporter correlation.
- Store a packet ID on the reservation: rejected because it creates a durable
  join between the control and content boundaries.
- Put packet or attempt-authority data in the outbox: rejected because
  reconciliation needs only control routing and independently verified
  immutable acceptance.
- Retain packet IDs or Blob locators in committed-acceptance delivery state:
  rejected because the reservation already provides a transient deterministic
  projection and a persisted locator would join the pseudonymous and content
  planes.
- Rely on serialization to drop extra fields: rejected because unsafe input
  would be accepted silently before persistence.
- Use TTL without an absolute deadline: rejected because updates and backup
  retention could extend the true lifetime unexpectedly.
