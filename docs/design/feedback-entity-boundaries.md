# Feedback entity boundaries

## Purpose

This package supplies persistence metadata for privacy-safe feedback artifacts
and the isolated state needed to control review eligibility, progressive bug
cooldowns, submission reservations, and commit reconciliation. The structured
draft, packet, report, checkpoint payload, and reconstruction-manifest
contracts remain owned by `@plasius/schema`.

The entity boundary deliberately has two non-joinable halves:

1. content-plane metadata identifies an identifier-free structured artifact;
2. control-plane state identifies a reporter only through a purpose- and
   version-scoped keyed pseudonym.

Neither half contains narrative, client pixels, network metadata, raw account
subjects, or an actor audit identity.

The schema store names keep these records physically routable to separate
boundaries: structured drafts use `feedbackDrafts`, packets/reconstructions use
`feedbackContent`, reports/checkpoints use `feedbackReports`, and every
reporter control uses `feedbackControl`. Deployments must map those names to
separately authorised stores rather than co-locating them behind one broad
data role.

## Content-plane entities

The draft, packet, report, checkpoint, and safe-reconstruction entities are
system-managed. They do not extend `BaseEntity`, because `BaseEntity` requires
`createdBy` and can retain other actor audit fields.

Draft metadata identifies one opaque draft, its closed bug/review branch, the
schema contract version, its latest server save, exact expiry/deletion epoch,
TTL, and CAS revision. The separately validated `@plasius/schema` draft packet
is composed with this metadata by the storage adapter in one conditional
operation; it is not redeclared as an entity field. Each dirty save advances
the revision by exactly one and refreshes an exact 24-hour lifetime. Narrative,
ciphertext, pixels, reporter keys, final packet IDs, and unknown properties are
rejected. Draft storage must not enable a soft-delete or backup window beyond
the declared expiry.

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

The authoritative progressive bug-control row uses `stateId` with the exact
wire form
`fbs1.<43 canonical unpadded base64url characters>`. This represents a 256-bit
HMAC output scoped to the feedback-control purpose and key version. The final
character must have zero unused pad bits, so alternate strings that decode to
the same bytes are rejected. A raw authentication subject, account ID, email
address, or arbitrary opaque string does not satisfy the contract.

Reservation IDs have the exact wire form
`fbr1.<22 canonical unpadded base64url characters>`, representing 128 random
bits with the same canonical pad-bit rule. Each reservation also has a
purpose-isolated canonical 256-bit idempotency digest. New API 1.1.1
reservations additionally store generation-one owner authority as a canonical
256-bit attempt-token digest; the raw one-use token never persists. IDs,
idempotency digests, and attempt-token digests must be unique among at most 64
retained records in one aggregate. The aggregate intentionally has no packet,
artifact, or draft identifier. A reconciliation worker may prove that an
immutable packet exists through its own bounded outbox protocol, but it must
not persist that join in the control entity.

The adapter-private envelope is:

- canonical `stateId`;
- numeric CAS `revision`;
- server-owned `writtenAtMs`;
- floor-rounded `ttlSeconds`; and
- a `state` object wire-equivalent to `@plasius/api` 1.1.1
  `ProgressiveCooldownState`.

The state is one authoritative subject-wide CAS unit: streak, current commit
and cooldown, all retained reservations, and `hardDeleteByMs` change together.
This prevents two independent reservation rows from bypassing capacity or
cooldown decisions.

The aggregate enforces the complete ladder
`5m → 15m → 1h → 6h → 24h`, caps the streak at the final step, and resets its
counter and streak only after 48 quiet hours. New reservations use an exact
five-minute lease and may start only after any active lease and cooldown end.
The matching generation/token digest may move a record from `reserved` to
`writing` at a server epoch inside that lease. Writing continues to hold the
active lease and cannot transition to `released`; it must converge through
verified commit/reconciliation. Reserved and writing records remain available
for reconciliation for exactly six days after lease expiry. Released records
remain available for six days after release. Committed records remain
available until exactly 48 hours plus six days after commit. A separate final
24-hour safety window permits verified deletion and bounded backup expiry
without exceeding the seven-day post-logical-expiry privacy deadline.

Commit and release normally transition a reserved record. Reconciliation may
promote a released record to committed after an independent verifier proves
immutable acceptance. A late commit increments/caps the current streak and
restarts the cooldown from its monotonic commit epoch, even when another
cooldown is active. A committed record is terminal. Exact deep cloned replays
are accepted at the same revision; every material update advances the numeric
revision by exactly one.

Reservation-array order is non-semantic. Same-millisecond commits are ordered
for validation by commit epoch, then committed streak, then canonical
reservation ID. Reads may encounter an otherwise valid row after its absolute
purge deadline while physical TTL deletion converges; adapters preserve the
original `writtenAtMs`, parse the state, and prune expired records before any
next CAS. A newly written row never carries a reservation whose
`reconciliationUntilMs` is at or before its write epoch. If one record expires
before another, the CAS removes only the expired record and preserves a
positive TTL through the later record's reconciliation horizon.

The immutable `feedbackCommitReconciliationOutboxEntitySchema` row is created
in the same `feedbackControl` partition transaction as `reserved → writing`.
It retains only `stateId`, `reservationId`, the closed submission branch, the
write/lease/reconciliation epochs, one-day purge deadline, TTL, and revision.
It has no content-plane ID, draft/packet/artifact ID, idempotency value, raw or
digested attempt authority, narrative, or account field. A worker deletes it
after a deterministic outcome; its TTL reaches the six-day reconciliation
cutoff and hard deletion is due exactly one day later.

The review entity remains a distinct 30-day deny overlay. It cannot be joined
to the bug aggregate. The earlier `feedbackAbuseControlEntitySchema` and
`feedbackSubmissionReservationEntitySchema` are deprecated compatibility
projections: they may support migration reads but are not authoritative for
new writes and retain their original three-state enum.

All control fields are marked internal and public serialization emits only the
schema `type` and `version`. The state ID and complete aggregate state are
classified as pseudonymous personal data with redacted log handling.

## Expiry and deletion

Every entity records:

- the time at which the state or artifact stops being live;
- an absolute hard-delete deadline;
- a whole-second storage TTL bounded by that hard-delete deadline; and
- the timestamp from which that TTL was calculated.

For identifier-free artifacts the hard-delete deadline may equal logical
expiry and may be at most seven days later. Pseudonymous mutable controls
require at least 24 hours and at most seven days between logical expiry and
hard deletion. Their `ttlSeconds` must equal
`hardDeleteAt - updatedAt - 24 hours`; the resulting expiry can never predate
the time the control stops affecting eligibility. The budget must remain
positive or the adapter deletes instead of writing. Identifier-free immutable
artifacts and checkpoints use the full interval from the creation/update anchor
to `hardDeleteAt`. Writers must set `updatedAt`, TTL budget, and the conditional
revision atomically so an update cannot extend data beyond its declared
deadline accidentally.

The progressive aggregate uses millisecond epochs because it persists the
`@plasius/api` state without translation. Each record's
`reconciliationUntilMs` is its six-day availability cutoff. The aggregate's
`hardDeleteByMs` is exactly 24 hours after the maximum of every retained
reconciliation deadline, the latest commit plus 48 hours plus six days, and
the cooldown deadline plus six days. Its maximum relative TTL budget is:

`max(0, floor((hardDeleteByMs - writtenAtMs - 24 hours) / 1000))`.

This formula expires the live row at the final reconciliation horizon. A zero
value is valid only for an empty, inactive delete instruction; it is invalid
when any record, streak, last commit, or cooldown remains. The final 24 hours
between live-row expiry and `hardDeleteByMs` are a purge safety window, not
additional reconciliation availability.
Adapters must begin explicit conditional deletion, verify absence, and allow
the separately bounded backup window to expire before the absolute deadline.
Because Cosmos TTL is relative to database `_ts`, the envelope budget must be
shortened using trusted time at persistence and must never be copied blindly
into the Cosmos `ttl` field. A zero value is an immediate-delete instruction,
not "TTL disabled", and must never be persisted as Cosmos TTL zero. Adapters
must reject `writtenAtMs > hardDeleteByMs` and must not allow soft-delete,
versions, or backups to survive `hardDeleteByMs`.
The feedback-control boundary's restore horizon is at most 24 hours; it is not
eligible for continuous seven-/thirty-day or long-term backup replication.

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
- duplicate aggregate reservation IDs/idempotency digests, more than 64
  retained records, duplicate attempt-authority digests, forged writing
  authority, release after write admission, multiple active leases, sparse
  arrays, nested accessors, corrupt commit sequences, premature pruning, or a
  next reservation before cooldown expiry;
- aggregate CAS skips/stale updates, non-exact purge calculations, TTL
  round-up, and changes to committed records other than exact replay;
- changes to immutable artifact fields;
- draft revision skips, lifetime drift, or reporter/content join fields;
- reconciliation outbox lifetime drift or content/authority join fields;
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

The package depends on the registry-published `@plasius/schema` `^1.4.0`.
Source, Git, workspace, and file dependency pins are prohibited; clean npm
registry installation is a release gate.
