# ADR-0005: Separate platform, group, and professional authority contracts

## Status

Accepted, 2026-07-18.

## Context

The touch-first Admin control plane needs shared contracts for platform
administrators, group membership and ownership, and in-game professional
standing. The legacy `Role` enum and `RoleEntity` combine fixed role labels in
one storage-oriented record. Extending that record with group ownership or
game roles would make privilege escalation possible and would prevent each
domain from evolving independently.

The controlling work is:

- `Plasius-LTD/entity-manager#38`, inheriting
  `admin.identity-governance.enabled`;
- `Plasius-LTD/entity-manager#39`, inheriting
  `admin.professional-roles.enabled`;
- the approved site design
  `docs/Design/touch-first-admin-control-plane.md`.

## Decision

Add three structurally independent, additive contract families:

1. `PlatformAuthorityAssignment` binds one fixed platform authority to a stable
   account and immutable canonical OIDC issuer and subject. It records source,
   lifecycle, positive concurrency revision, latest idempotency identifier, and
   protected audit provenance. The account, subject, and operator identifiers
   are internal and are omitted by public serialization.
2. `GroupDefinition` and versioned `GroupMembership` represent active or
   archived groups and active or removed member/owner relationships.
   `GroupMembershipBoundary` validates a complete proposed snapshot and rejects
   duplicate active accounts or removal of the final active owner.
3. `ProfessionalRoleCategory`, `ProfessionalRoleDefinition`, and
   `ProfessionalRoleAssignment` represent non-security game standing.
   Assignments require world, character, and institution scope and may include
   a group as the delegated governance boundary. Interface and authority keys
   are limited to `game.professional.*`.

All mutable records carry a positive `revision` and protected
`lastMutationId`. Lifecycle transitions require complete, chronological audit
provenance. Delete behavior is represented by archive/end/remove states so
history can be retained.

The package exports product-neutral seed category metadata for guilds,
education, nobility, and divinity. The catalogue remains open; consumers
materialize identifiers and audit fields.

The legacy `Role` enum and `RoleEntity` remain unchanged for backward
compatibility. No professional role value can be supplied where a
`PlatformAuthority` is required.

## Migration support

`getLegacyPlatformAuthorityPromotions` maps only the existing full-admin aliases
`admin` and `service-admin` to `platform-owner`. It deliberately excludes
`user-admin` and `moderator`. Runtime migration, persistence transactions,
owner-count verification, bootstrap secrets, and rollout evaluation remain in
the consuming service.

## Privacy and security

- Issuer/subject identity is used instead of email matching.
- OIDC subjects, character/account identifiers, mutation identifiers, operator
  IDs, and reasons are protected from default public serialization.
- Professional keys cannot enter platform Admin or capability namespaces.
- Aggregate group validation supports transactional final-owner enforcement,
  but storage atomicity remains the responsibility of the consuming service.

## Consequences

- Consumers gain versioned public schemas without a breaking change to legacy
  exports.
- Services must persist and compare revisions atomically and must evaluate the
  inherited stored feature flags before exposing the corresponding behavior.
- Services must build purpose-specific, pseudonymous response DTOs instead of
  returning protected persisted fields directly.
- Disabling either feature flag stops new behavior while retaining assignment
  and membership history for rollback.
