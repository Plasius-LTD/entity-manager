# ADR-0006: Separate system feedback entities from reporter controls

- Status: Accepted
- Date: 2026-07-18

## Context

Privacy-safe feedback needs immutable packet, materialized-report, timer
checkpoint, and safe game-reconstruction metadata. Existing `BaseEntity`
requires a user actor through `createdBy`, which is inappropriate for
system-generated artifacts and would add an identity to otherwise
identifier-free feedback.

Review suppression, progressive bug cooldowns, and submission reservations do
need short-lived reporter correlation. That correlation is pseudonymous
personal data and must not enter feedback packets, reports, Admin, MCP, or
public honesty metrics.

The current released schema dependency silently ignores unknown object fields
during validation. At this boundary, silently accepting an identity or
narrative property is unsafe even if serialization would later omit it.

## Decision

`@plasius/entity-manager` exposes additive, actor-free system entities for:

- structured bug/review packet metadata;
- hourly/daily/public materialization metadata;
- conditional processor checkpoints; and
- server-created safe game-reconstruction metadata.

These entities do not extend `BaseEntity` and contain no actor fields.
Packet/report/reconstruction metadata is immutable at revision zero.
Checkpoints use monotonic revisions and must also be written with a storage
condition.

Content, report, and reporter-control schemas declare distinct store names:
`feedbackContent`, `feedbackReports`, and `feedbackControl`. Infrastructure
must preserve that authorization separation.

Report and checkpoint windows use purpose-prefixed, calendar-validated UTC
grammars for hour, day, or five-minute reconciliation buckets. Checkpoint IDs
are the exact deterministic composition of processor and window. Generic
"safe" strings, UUIDs, pseudonyms, and account-shaped values are not valid
window or checkpoint identifiers.

Reporter controls are separate schemas for:

- accepted bug count, cooldown streak, cooldown expiry, and quiet-reset expiry;
- accepted review count and review-deny expiry; and
- reservation/commit/release state.

A control subject is exactly a versioned, canonical unpadded base64url
HMAC-SHA-256 token. A reservation ID is exactly a versioned, canonical
unpadded base64url 128-bit random token. Validators require zero unused pad
bits so multiple textual aliases cannot represent the same token. Control
entities contain no packet or artifact ID, so the pseudonym boundary cannot be
joined to content through these contracts. Every control field is internal;
the keyed subject is marked as pseudonymous personal data and redacted for
logging.

Every feedback schema rejects unknown top-level fields before normal schema
validation. It returns a fixed error without echoing a field value. Lifecycle
validation binds TTL to an absolute hard-delete deadline and limits retention
after logical expiry to seven days.

The abuse entity validates the fixed `5m → 15m → 1h → 6h → 24h` ladder and
48-hour quiet reset. It accepts the next bug only at or after the current
cooldown expiry and requires a strictly monotonic update time. The review
entity validates a 30-day deny. Conditional updates advance accepted counters
by exactly one, and reservation retries advance only their bounded attempt
counter.

Reservation creation is valid only in `reserved` with exactly one attempt.
Every transition preserves the original logical expiry and hard-delete
deadline. A transition may commit or release the reservation, after which all
entity fields—including revision and every expiry or TTL value—are immutable.
Exact no-op replay remains valid for idempotency.

## Integrity and availability

New mutable state starts at revision zero. Updates validated against an
existing entity must advance by exactly one, except an exact idempotent replay
of a terminal reservation. Committed and released reservations are otherwise
fully immutable. Storage adapters must combine this contract with ETag or
transactional conditional writes; schema revision validation alone does not
provide distributed atomicity.

Callers must distinguish an available empty read from an unavailable control
store. An unavailable store fails closed. The `@plasius/api` reservation and
cooldown interface owns retry and `Retry-After` behaviour.

## Privacy consequences

- Feedback content remains identifier-free and actor-free.
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
- Rely on serialization to drop extra fields: rejected because unsafe input
  would be accepted silently before persistence.
- Use TTL without an absolute deadline: rejected because updates and backup
  retention could extend the true lifetime unexpectedly.
