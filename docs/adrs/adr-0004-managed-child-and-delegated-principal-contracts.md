# ADR-0004: Managed-child and delegated-principal contracts

- Status: Accepted
- Date: 2026-07-15

## Context

Family accounts need an identity model for players aged five and older without
weakening the email requirement of the existing `UserEntity`. A guardian who
opens a child session must remain the authenticated actor while the managed
child is the authorization subject. The relationship authorizing that session
must be revocable without waiting for every delegated session to expire.

Exact dates of birth and provider evidence are unnecessarily sensitive for the
shared entity contract. Token balances and financial journals also belong to
the separate economy boundary and must not enter profile autosave entities.

## Decision

`@plasius/entity-manager` will expose additive version 1 contracts for:

- derived age bands and assurance evidence;
- email-free managed-child profiles with explicit adulthood lifecycle states;
- actor/subject principals and typed account references;
- household identity and aggregate host-guardian boundaries;
- host/co-guardian role assignments, guardian-child relationships, and
  two-sided invitations.

Age-band, assurance, principal, and host-assignment discriminators use
`as const` runtime objects with literal-union public types. Existing dot-style
access such as `AgeBand.SIX_TO_NINE` remains available, while structurally
compatible string literals can be assigned by downstream packages without enum
casts.

A self principal must reference the same user account as actor and subject. A
guardian-delegated principal must reference a user actor and a different
managed-child subject, together with the relationship ID, non-negative safe
integer authorization version, age band, and non-self-asserted assurance. The
authorization version is intended to invalidate stale delegated sessions.
Self principals either omit both age band and assurance or provide both.

All family timestamps are valid canonical UTC values with seconds or exactly
millisecond precision. Active principals reject future authentication times,
assurance asserted after authentication, and assurance expired at validation.
Accepted child-link invitations reject assurance asserted after or expired at
their atomic resolution. Every terminal invitation outcome records both its
resolution time and resolving account or service identity.

The assurance contract stores only its level, method, assertion/expiry times,
and an optional protected opaque evidence reference. It contains no raw date of
birth, contact details, document data, or provider payload.
Stored evidence validation requires the protected reference for
provider-verified decisions. Public principal validation explicitly permits the
reference to be absent after serialization, while preserving every other
method, level, timestamp, and expiry invariant. This makes public principal
serialization and validation composable without weakening the persistence
boundary.

A managed child cannot create itself. Its assurance must be asserted no later
than account creation and remain unexpired at creation. If a closed profile
retains claim history, it must represent an adult account and satisfy
`createdAt ≤ claimedAt ≤ closedAt`; profiles closed without a claim remain
valid.

Accepted invitations may be resolved by either authenticated participant after
both approvals: the initiating guardian or the target account. An unrelated
account cannot complete acceptance. Other terminal outcomes may still record a
valid service resolver where operational expiry processing requires it.

Opaque account and relationship identifiers use the same one-to-128-character
ASCII grammar as the economy package. This broadens the initial minimum-length
draft without invalidating any previously accepted family identifier.

Each household identity names its current host guardian. Guardian-role
assignments distinguish the host from co-guardians while retaining protected
`grantedByAccountId` and `revokedByAccountId` audit fields. Host authority
always includes both child and finance management. The aggregate household
guardian boundary accepts exactly one active host matching the household
identity. Services must validate the complete proposed snapshot atomically, so
the last host cannot be revoked without an active replacement.

`UserEntity` remains unchanged and continues to require email. These schemas do
not contain Token balances, allocations, receipts, payment data, or ledger
behavior.

## Rollout and authorization

The parent Feature is controlled by `profile.family-accounts.enabled`. Family
view/manage capabilities determine discoverability and user access; the flag is
a rollout control and never substitutes for server authorization. The source of
truth for evaluating both remains the site authentication and capability
services, not this schema package.

Disabling the flag stops creation, linking, and delegated-session issuance.
Existing records remain readable for account recovery and privacy workflows;
they are not rewritten or deleted as rollback behavior.

## Consequences

- Existing user/profile consumers remain backward compatible.
- Managed children can have stable account identities without fabricated email.
- Authorization code can distinguish actor audit identity from subject scope.
- Public provider-verified principals round-trip through safe serialization
  while strict stored evidence continues to require its protected reference.
- Literal-union discriminators remain wire-compatible across independently
  versioned TypeScript packages while preserving dot-style constants.
- Household transitions have an explicit aggregate invariant protecting the
  single matching host and preventing removal of the last host.
- Relationship version checks and lifecycle transitions remain runtime concerns
  but now share validated, versioned data contracts.
- Exact birth data and financial state stay outside broadly reused entity
  serialization.

## Alternatives considered

- Make email optional on `UserEntity`: rejected because it weakens existing
  identity guarantees and risks unsafe assumptions in current consumers.
- Switch the frontend between guardian and child IDs without a delegated
  principal: rejected because it loses actor provenance and can inherit guardian
  authority accidentally.
- Add wallet fields to the child profile: rejected because balances require an
  authoritative, immutable economy ledger rather than profile autosave.
- Treat host status as an implicit role: rejected because it cannot express an
  atomic host transfer or prove that a household retains exactly one host.
