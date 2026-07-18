# Feedback entity boundaries

## Purpose

This package supplies persistence metadata for privacy-safe feedback artifacts
and the isolated state needed to control review eligibility, progressive bug
cooldowns, and submission reservations. The structured packet, report,
checkpoint payload, and reconstruction-manifest contracts remain owned by
`@plasius/schema`.

The entity boundary deliberately has two non-joinable halves:

1. content-plane metadata identifies an identifier-free structured artifact;
2. control-plane state identifies a reporter only through a purpose- and
   version-scoped keyed pseudonym.

Neither half contains narrative, client pixels, network metadata, raw account
subjects, or an actor audit identity.

The schema store names keep these records physically routable to separate
boundaries: packets/reconstructions use `feedbackContent`, reports/checkpoints
use `feedbackReports`, and every reporter control uses `feedbackControl`.
Deployments must map those names to separately authorised stores rather than
co-locating them behind one broad data role.

## Content-plane entities

The packet, report, checkpoint, and safe-reconstruction entities are
system-managed. They do not extend `BaseEntity`, because `BaseEntity` requires
`createdBy` and can retain other actor audit fields.

The immutable packet, report, and reconstruction entities use revision zero.
An existing entity may be supplied to `schema.validate(next, existing)` for an
idempotent retry, but every immutable field must be identical.

Report windows are not arbitrary opaque identifiers. They use one of three
closed UTC grammars:

- `hour:YYYY-MM-DDTHH` for hourly bug health;
- `day:YYYY-MM-DD` for daily satisfaction and public summaries; or
- `reconcile:YYYY-MM-DDTHH:mm` for a five-minute reconciliation bucket.

Calendar values are round-trip validated and reconciliation minutes are one of
`00, 05, …, 55`. A checkpoint ID is derived exactly as
`checkpoint:<processor>:<windowKey>`, and the processor must match the window
purpose. Raw subjects, pseudonyms, UUIDs, and arbitrary "safe" strings cannot
be smuggled into report or checkpoint keys.

Checkpoint records are conditional-write state. Creation requires revision
zero and every update requires exactly `existing.revision + 1`. The storage
adapter must still enforce the corresponding ETag or transactional condition;
the revision check is a second integrity boundary, not a replacement for an
atomic write.

All content metadata fields are internal. Public APIs should return the
separately validated safe payload projection from `@plasius/schema`, never the
persistence entity.

## Isolated control-plane entities

`keyedSubject` has the exact wire form
`fbs1.<43 canonical unpadded base64url characters>`. This represents a 256-bit
HMAC output scoped to the feedback-control purpose and key version. The final
character must have zero unused pad bits, so alternate strings that decode to
the same bytes are rejected. A raw authentication subject, account ID, email
address, or arbitrary opaque string does not satisfy the contract.

Reservation IDs have the exact wire form
`fbr1.<22 canonical unpadded base64url characters>`, representing 128 random
bits with the same canonical pad-bit rule. Reservations record only the keyed
subject, submission kind, bounded attempt count, state, revision, and expiry
data. They intentionally have no packet or artifact identifier. A
reconciliation worker may prove that an immutable packet exists through its
own bounded outbox protocol, but it must not persist that join in the control
entity.

The accepted-bug state enforces the complete ladder
`5m → 15m → 1h → 6h → 24h`, caps the streak at the final step, and resets its
counter and streak only after 48 quiet hours. An accepted-bug transition must
have a strictly later `updatedAt` and cannot occur before the current cooldown
expires; the exact expiry instant is accepted. The review entity enforces a
30-day deny. Updates advance their accepted counters by exactly one; a review
cannot advance until the previous deny has expired. Reservation retries
advance the attempt counter, while commit/release transitions preserve it.
New reservation records must begin in `reserved` with exactly one attempt.
Every transition preserves the original logical expiry and hard-delete
deadline; `updatedAt`, TTL, revision, attempt count, and state may evolve only
as their transition rules permit. Once `committed` or `released`, every entity
field is frozen; only an exact field-for-field idempotent replay of the same
entity is accepted.

All control fields are marked internal and public serialization emits only the
schema `type` and `version`. The keyed subject is additionally classified as
pseudonymous personal data with redacted log handling.

## Expiry and deletion

Every entity records:

- the time at which the state or artifact stops being live;
- an absolute hard-delete deadline;
- a whole-second storage TTL ending exactly at that hard-delete deadline; and
- the timestamp from which that TTL was calculated.

The hard-delete deadline may be equal to logical expiry and may be at most seven
days later. For mutable records, `ttlSeconds` must equal
`hardDeleteAt - updatedAt`; for immutable artifacts it must equal
`hardDeleteAt - createdAt`. Writers must set `updatedAt`, TTL, and the
conditional revision atomically so an update cannot extend data beyond its
declared deadline accidentally.

The storage implementation remains responsible for configuring live data,
soft-delete, versioning, and backup retention so they honour `hardDeleteAt`.
Expiry is not permission to retain an inaccessible backup indefinitely.

## Failure and concurrency behaviour

The schemas reject:

- unknown fields rather than silently stripping them;
- non-versioned or incorrectly sized keyed subjects and reservations;
- initial revisions other than zero;
- lost-update revisions;
- skipped counters, premature review renewal, accepted bugs before an active
  cooldown expires, non-monotonic control timestamps, and invalid
  cooldown/reset steps;
- arbitrary or identity-shaped report/checkpoint keys and non-canonical token
  aliases;
- reservation retention extension, invalid initial attempt counts, terminal
  reservation mutation, or creation directly in a terminal state;
- changes to immutable artifact fields;
- resurrection of committed or released reservations;
- mismatched TTL/deadline arithmetic; and
- hard-delete deadlines more than seven days after logical expiry.

An unavailable control store is distinct from an absent control record.
Downstream evaluators must fail closed on dependency unavailability and may
treat an explicitly successful empty read as a first-time reporter. This
package intentionally does not turn a failed read into an allow decision.

## Rollout controls

These additive contracts inherit the parent feedback flags, including
`feedback.bug-report.enabled`, `feedback.review.enabled`,
`feedback.reporting.enabled`, and `feedback.game-diagnostics.enabled`.
`feedback.anonymous.enabled` remains off until the edge controls and private
origin are verified. Entity schemas do not evaluate flags or capabilities;
the site/backend capability evaluator remains the source of truth.

Rollback disables intake and processing through those remote flags. Existing
control state remains subject to its original hard-delete deadline and must not
be rewritten to lengthen retention.
