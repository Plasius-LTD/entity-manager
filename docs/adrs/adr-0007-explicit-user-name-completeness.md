# ADR-0007: User names carry explicit completeness

- Status: Accepted
- Date: 2026-08-01

## Context

Identity providers may omit personal names. A schema-safe provider placeholder
keeps profile creation available, but consumers need to distinguish that
placeholder from a name the user has completed. Inferring completeness by
matching display text is ambiguous and is lost across normalization layers.

Display names also have different character requirements from personal-name
components. Applying one validator to both either rejects legitimate display
names or weakens first, middle, and last names.

## Decision

Add optional `UserName.status` with the values `complete` and `incomplete`.
Absence is the legacy representation and is interpreted as complete. Use the
released `validateDisplayName` contract for `displayName` in both stored user
entities and editable-profile validation. Continue using `validateName` for
first, middle, and last names.

The status is provenance metadata, not a substitute for field validation. A
record marked incomplete must still contain schema-valid fields.

## Consequences

- Existing user records remain valid without migration.
- Provider placeholders can be represented explicitly.
- Display names may contain decimal digits while personal-name fields cannot.
- Server consumers remain responsible for controlling the incomplete-to-
  complete transition instead of trusting an over-posted client value.

## Rollout

Task Plasius-LTD/entity-manager#52 inherits Feature #1642 and
`admin.identity-governance.enabled`. The package consumes a released
`@plasius/schema` version and is itself released through approved CD before
site or profile consumers update.
