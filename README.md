# @plasius/entity-manager

[![npm version](https://img.shields.io/npm/v/@plasius/entity-manager.svg)](https://www.npmjs.com/package/@plasius/entity-manager)
[![Build Status](https://img.shields.io/github/actions/workflow/status/Plasius-LTD/entity-manager/ci.yml?branch=main&label=build&style=flat)](https://github.com/Plasius-LTD/entity-manager/actions/workflows/ci.yml)
[![coverage](https://img.shields.io/codecov/c/github/Plasius-LTD/entity-manager)](https://codecov.io/gh/Plasius-LTD/entity-manager)
[![License](https://img.shields.io/github/license/Plasius-LTD/entity-manager)](./LICENSE)
[![Code of Conduct](https://img.shields.io/badge/code%20of%20conduct-yes-blue.svg)](./CODE_OF_CONDUCT.md)
[![Security Policy](https://img.shields.io/badge/security%20policy-yes-orange.svg)](./SECURITY.md)
[![Changelog](https://img.shields.io/badge/changelog-md-blue.svg)](./CHANGELOG.md)

Entity definitions and validation schemas for the Plasius ecosystem.

This package is part of the **Plasius LTD** selective open-source strategy. For more on our approach, see [ADR-0013: Selective Open Source](https://github.com/Plasius-LTD/plasius-ltd-site/blob/main/docs/adrs/adr-0013%3A%20Open%20Source%20Strategy.md). This package is maintained as open source to foster community trust and enable integration, while the core Plasius platform remains proprietary.

Apache-2.0. ESM + CJS builds. TypeScript types included.

---

## Installation

```bash
npm install @plasius/entity-manager
```

---

## Usage

```ts
import {
  userEntitySchema,
  PreferredDisplayOrder,
} from "@plasius/entity-manager";

const user = {
  type: "userEntity",
  version: "1.0",
  email: "alice@example.com",
  name: {
    firstName: "Alice",
    lastName: "Lovelace",
    displayName: "Alice L.",
    preferredDisplayOrder: PreferredDisplayOrder.DISPLAY_NAME,
  },
};

const result = userEntitySchema.validate(user);
if (!result.valid) {
  console.error(result.errors);
}
```

### Editable Profile Validation Translations

Editable profile validation issues expose stable field and message keys with
`en-GB` defaults resolved through `@plasius/translations`.

```ts
import {
  editableUserProfileValidationTranslationKeys,
  mapEditableUserProfileValidationErrors,
  translateEditableUserProfileValidationText,
  validateEditableUserProfile,
} from "@plasius/entity-manager";

const validation = validateEditableUserProfile(profile);
const mapped = mapEditableUserProfileValidationErrors(validation);

const message = translateEditableUserProfileValidationText(
  editableUserProfileValidationTranslationKeys.required,
  { field: "First name" },
);

console.log(mapped.issues[0]?.fieldKey, mapped.issues[0]?.messageKey, message);
```

---

## Export Overview

### Base entity
- `baseEntitySchema`, `baseEntityShape`, `BaseEntity`
- Required fields include `partitionKey`, `id`, `entityType`, `createdAt`, `createdBy`, and `isDeleted` (plus system `type` and `version`).
- Persistence-only fields such as `partitionKey`, `createdBy`, `updatedBy`, `deletedBy`, and `deletedReason` are marked internal and are omitted by default when calling `schema.serialize(...)`.

### Privacy-safe feedback entities

- Actor-free content metadata:
  `systemManagedFeedbackPacketEntitySchema`,
  `systemManagedFeedbackReportEntitySchema`,
  `systemManagedFeedbackCheckpointEntitySchema`, and
  `systemManagedFeedbackReconstructionEntitySchema`
- Isolated reporter controls:
  `feedbackProgressiveCooldownAggregateEntitySchema` and
  `feedbackReviewEligibilityEntitySchema`, and
  the deprecated compatibility projections
  `feedbackAbuseControlEntitySchema` and
  `feedbackSubmissionReservationEntitySchema`
- Closed constants:
  `FeedbackArtifactKind`, `FeedbackProcessor`,
  `FeedbackSubmissionKind`, `FeedbackReservationState`,
  `FEEDBACK_PROGRESSIVE_COOLDOWN_LADDER_MS`,
  `FEEDBACK_PROGRESSIVE_COOLDOWN_RESERVATION_LEASE_MS`,
  `FEEDBACK_PROGRESSIVE_COOLDOWN_RECONCILIATION_MS`,
  `FEEDBACK_PROGRESSIVE_COOLDOWN_PURGE_SAFETY_MS`,
  `FEEDBACK_PROGRESSIVE_COOLDOWN_RESET_MS`,
  `FEEDBACK_PROGRESSIVE_COOLDOWN_MAX_RESERVATIONS`, and
  `FEEDBACK_REVIEW_DENY_SECONDS`

Feedback content metadata deliberately does not extend `BaseEntity`: system
artifacts have no `createdBy`, `updatedBy`, or `deletedBy` identity. Reporter
controls accept only a purpose/version-scoped HMAC token in the form
`fbs1.<43 canonical unpadded base64url characters>`. Reservation IDs use a
canonical 22-character encoding of 128 random bits. Validators reject non-zero
unused pad bits, so one binary token cannot have multiple textual aliases. Raw
account subjects, narrative, pixels, network metadata, and arbitrary extra
fields are rejected.

All reporter-control fields are internal, so default serialization exposes no
pseudonym, reservation, counter, or expiry. The aggregate state ID and its
complete state are also redacted by log sanitization. Reservation state has no
packet ID and therefore cannot create a durable join from the pseudonymous
control plane to identifier-free content.

The progressive bug controller is persisted as one authoritative row per
canonical `fbs1.*` state ID. Its nested `state` is wire-equivalent to
`@plasius/api` `ProgressiveCooldownState`; the envelope adds only the row ID,
numeric CAS revision, server write epoch, and deletion TTL. Validate updates
with the current row:

```ts
const validation =
  feedbackProgressiveCooldownAggregateEntitySchema.validate(next, current);
```

The next revision must be exactly `current.revision + 1`. Persistence must also
use an ETag or transactional condition; schema validation is not a substitute
for an atomic storage write.

The aggregate enforces unique canonical reservation IDs and idempotency
digests, at most 64 retained records, one active lease, the exact five-minute
lease, the `5m → 15m → 1h → 6h → 24h` ladder, a 48-hour quiet reset, and seven
days as the absolute post-expiry privacy deadline. The first six days are the
live reconciliation interval; the final 24 hours are available only for
verified purge and expiry of bounded backups. A released reservation may
become committed during its reconciliation interval after immutable acceptance
is independently verified; this restarts the cooldown without creating a
packet/content join. Exact cloned replays are accepted without advancing the
CAS revision, but neither the submitted nor stored row may contain unknown
fields.

`state.hardDeleteByMs` is the absolute upper-bound deletion deadline and is
recomputed as the latest record or active cooldown/reset reconciliation horizon
plus exactly 24 hours. Each record's `reconciliationUntilMs` is its six-day
availability cutoff. `ttlSeconds` is the maximum whole-second TTL budget ending
at the latest reconciliation horizon, one full day before the hard-delete
deadline. A zero budget is valid only on an empty, inactive delete instruction;
an active or partially retained aggregate must have a positive budget.

The value is calculated at `writtenAtMs`; it must not be copied directly into
Cosmos `ttl`, whose clock starts at the database `_ts`. At persistence time an
adapter must shorten the database TTL using trusted current time, issue a
delete instead when no positive duration remains, and never persist Cosmos TTL
zero (where zero is invalid). A purge worker must explicitly delete and verify
the row during the safety window. Soft-delete, versions, and backups must be
configured to be absent by `hardDeleteByMs`; a database TTL alone is
insufficient. This compensates for Cosmos TTL being relative to the last
database modification and for physical deletion being an asynchronous,
capacity-dependent background task
([Azure TTL behaviour](https://learn.microsoft.com/en-us/azure/cosmos-db/time-to-live)).
The isolated feedback-control boundary therefore requires a restore horizon of
no more than 24 hours and must not be copied into longer-lived continuous or
long-term backups.

The earlier per-subject abuse and per-reservation schemas remain exported only
for source-compatible migration. They cannot atomically enforce aggregate
capacity or released-to-committed reconciliation and must not be used for new
writes. Review eligibility remains a separate 30-day overlay and is never
folded into the bug aggregate.

Other pseudonymous control entities use the same 24-hour purge safety window;
identifier-free artifacts and checkpoints retain an exact whole-second
lifecycle budget. A control hard-delete deadline must be between one and seven
days after logical expiry so the safety budget never removes an effective
cooldown or eligibility overlay. Writers must update the timestamp, TTL budget,
and revision atomically. See
[ADR-0006](./docs/adrs/adr-0006-feedback-system-and-control-entities.md) and the
[feedback entity boundary design](./docs/design/feedback-entity-boundaries.md).

The review contract validates an exact 30-day deny. The deprecated abuse and
per-reservation projections retain their previous validation behaviour only
for migration compatibility.

Report/checkpoint windows use closed purpose-specific UTC keys:
`hour:YYYY-MM-DDTHH`, `day:YYYY-MM-DD`, or a five-minute
`reconcile:YYYY-MM-DDTHH:mm` bucket. Checkpoint IDs are exactly
`checkpoint:<processor>:<windowKey>`. Account-shaped strings, pseudonyms,
UUIDs, invalid calendar values, and processor/window mismatches are rejected.

### User and permissions
- `userEntitySchema`, `userNameSchema`, `userAvatarSchema`
- Editable profile validation helpers and translation keys:
  `validateEditableUserProfile`, `mapEditableUserProfileValidationErrors`,
  `editableUserProfileFieldTranslationKeys`,
  `editableUserProfileValidationTranslationKeys`,
  `entityManagerEnGbTranslations`, `translateEditableUserProfileValidationText`
- `settingsEntitySchema`, `permissionsEntitySchema`, `featureFlagEntitySchema`, `roleEntitySchema`
- Enums: `PreferredDisplayOrder`, `UserEmailPreferences`, `UserNotificationPreferences`, `Role`, `Scope`

Consumers that only need the permission scope contract should use the
registration-free package subpath:

```ts
import { Scope } from "@plasius/entity-manager/permissions";

const requiredScope = Scope.VIEW;
```

The subpath provides ESM, CommonJS, and TypeScript declaration outputs without
loading `@plasius/schema` or registering entity schemas. The existing
`Scope` export from `@plasius/entity-manager` remains available and has the
same enum values.

### Administrative governance

- Platform security:
  `platformAuthorityAssignmentSchema`, `PlatformAuthority`,
  `PlatformAuthorityAssignmentStatus`,
  `getLegacyPlatformAuthorityPromotions`
- Groups:
  `groupDefinitionSchema`, `groupMembershipSchema`,
  `groupMembershipBoundarySchema`, `GroupMembershipRole`,
  `validateGroupMembershipBoundary`
- Professional standing:
  `professionalRoleCategorySchema`, `professionalRoleDefinitionSchema`,
  `professionalRoleAssignmentSchema`,
  `BUILT_IN_PROFESSIONAL_ROLE_CATEGORIES`,
  `isProfessionalInterfaceKey`

Platform authority, group ownership, and professional standing are deliberately
separate contracts. The legacy `Role` and `RoleEntity` exports remain unchanged.
Only `admin` and `service-admin` are migration candidates for
`platform-owner`; user-admins and moderators are not promoted.

```ts
import {
  PlatformAuthority,
  PlatformAuthorityAssignmentSource,
  PlatformAuthorityAssignmentStatus,
  platformAuthorityAssignmentSchema,
} from "@plasius/entity-manager";

const result = platformAuthorityAssignmentSchema.validate({
  type: "platformAuthorityAssignment",
  version: "1.0.0",
  assignmentId: "authority-assignment-001",
  identity: {
    issuer: "https://identity.example.test",
    subject: "provider-subject-001",
  },
  accountId: "account-owner-001",
  authority: PlatformAuthority.PLATFORM_OWNER,
  status: PlatformAuthorityAssignmentStatus.ACTIVE,
  source: PlatformAuthorityAssignmentSource.LEGACY_ADMIN_MIGRATION,
  revision: 1,
  lastMutationId: "migration-run-001",
  assignedAt: "2026-07-18T09:00:00.000Z",
  assignedByAccountId: "account-admin-001",
  reason: "Promote an existing full administrator.",
});
```

Group and professional-role writes carry a positive `revision` plus an internal
`lastMutationId` for optimistic concurrency and idempotency. Validate the
complete proposed `GroupMembershipBoundary` in the same storage transaction to
prevent removal of the final active owner.

Professional assignments require world, character, and institution scope. An
optional group identifies a delegated governance boundary. Future interface
and authority namespace keys must
start with `game.professional.`; these keys never imply a platform permission
or Admin capability. Audit actor IDs, OIDC subjects, mutation identifiers, and
protected reasons are omitted by default public serialization.

### Assets
- `assetEntitySchema`, `imageAssetEntitySchema`, `audioAssetEntitySchema`, `modelAssetEntitySchema`, `objectAssetEntitySchema`

`objectAssetEntitySchema` includes object-specific fields for payload URL, optional thumbnail, optional format/size, and component wiring.
- Enums: `AudioChannel`, `ModelAssetFormat`

### Components
- `baseComponentSchema`, `physicsComponentSchema`, `animationComponentSchema`, `shadowComponentSchema`, `levelOfDetailComponentSchema`
- Enum: `ComponentTypes`

### Auth and translations
- `authenticatedUserSchema`, `AuthProvider`
- Family identity contracts:
  `ageAssuranceEvidenceSchema`, `managedChildProfileSchema`,
  `actorSubjectPrincipalSchema`, `householdIdentitySchema`,
  `householdGuardianBoundarySchema`, `guardianRoleAssignmentSchema`,
  `guardianRelationshipSchema`, and `guardianInvitationSchema`
- Family identity runtime constants and corresponding literal-union types:
  `AgeBand`, `AgeAssuranceLevel`, `AgeAssuranceMethod`,
  `PrincipalAccountType`, `PrincipalType`, and `GuardianRoleAssignmentKind`
- Family identity enums: `ManagedChildLifecycleState`, `GuardianRole`,
  `GuardianRoleAssignmentStatus`,
  `GuardianRelationshipStatus`, `GuardianInvitationKind`, and
  `GuardianInvitationStatus`
- Family identity validators: `validateAgeAssuranceEvidence`,
  `validatePublicAgeAssuranceEvidence`, and
  `validateHouseholdGuardianBoundary`
- `translatableSchema`, `supportedLanguagesSchema`

### Validators and utilities
- `isValidAzureTableKey`, `isValidEntityType`, `validateAssetSchema`
- `validateFeatureFlagValue`, `validateSettingValue`

---

## Public Serialization

Entity schemas validate the full persisted entity shape, including internal audit and storage metadata.
When returning data to clients, prefer `schema.serialize(entity)` so only public fields are included by default.

```ts
import { baseEntitySchema } from "@plasius/entity-manager";

const payload = baseEntitySchema.serialize({
  type: "baseEntity",
  version: "1.0.0",
  entityType: "baseEntity",
  partitionKey: "tenant-a",
  id: "row-1",
  createdAt: new Date().toISOString(),
  createdBy: "user-1",
  isDeleted: false,
});

// partitionKey and createdBy are omitted from the serialized payload.
console.log(payload);
```

## Family identity and delegated sessions

Managed-child profiles are separate from `UserEntity`. They have their own
stable account ID and display name, but deliberately do not contain an email,
exact date of birth, guardian contact data, payment data, or Token balances.
The existing `UserEntity` email requirement is unchanged.

Age assurance is represented using a derived `AgeBand` plus minimal assurance
evidence. The optional `evidenceRef` is marked internal and is omitted by
default serialization. `ageAssuranceEvidenceSchema` and
`validateAgeAssuranceEvidence` remain strict stored-evidence boundaries and
require that reference for provider verification. Public actor/subject
principals use `validatePublicAgeAssuranceEvidence`, which permits only the
intentional absence of that protected reference so serialized principals can
be validated again without weakening stored evidence.

```ts
import {
  AgeAssuranceLevel,
  AgeAssuranceMethod,
  AgeBand,
  ManagedChildLifecycleState,
  managedChildProfileSchema,
} from "@plasius/entity-manager";

const child = managedChildProfileSchema.validate({
  type: "managedChildProfile",
  version: "1.0.0",
  accountId: "managed-child-001",
  displayName: "Moon Explorer",
  ageBand: AgeBand.SIX_TO_NINE,
  assurance: {
    level: AgeAssuranceLevel.GUARDIAN_ATTESTED,
    method: AgeAssuranceMethod.GUARDIAN_ATTESTATION,
    assertedAt: "2025-07-15T09:00:00.000Z",
  },
  lifecycleState: ManagedChildLifecycleState.ACTIVE,
  createdAt: "2025-07-15T09:00:00.000Z",
  createdByAccountId: "guardian-account-001",
});
```

The creating guardian must differ from the managed-child account. Assurance
must have been asserted and remain unexpired at `createdAt`. A closed profile
may retain optional claim history only for an adult account and in the order
`createdAt ≤ claimedAt ≤ closedAt`.

Delegated sessions retain both identities. The guardian remains `actor`; the
managed child is `subject`. The relationship and authorization version bind the
session to current family authority. Guardian roles are intentionally not part
of the child principal and must not be inherited into child authorization.
`AuthenticatedUser` may carry this principal in its optional `principal`
field. Legacy sessions remain valid without it. When present, the active
subject account must equal `AuthenticatedUser.sub`; delegated child mode
therefore uses the managed-child account as `sub` and retains the guardian only
as the audit actor.

```ts
import {
  AgeAssuranceLevel,
  AgeAssuranceMethod,
  AgeBand,
  PrincipalAccountType,
  PrincipalType,
  actorSubjectPrincipalSchema,
} from "@plasius/entity-manager";

const principal = actorSubjectPrincipalSchema.validate({
  type: "actorSubjectPrincipal",
  version: "1.0.0",
  actor: {
    accountId: "guardian-account-001",
    accountType: PrincipalAccountType.USER,
  },
  subject: {
    accountId: "managed-child-001",
    accountType: PrincipalAccountType.MANAGED_CHILD,
  },
  principalType: PrincipalType.GUARDIAN_DELEGATED,
  relationshipId: "guardian-relationship-001",
  authorizationVersion: 0,
  ageBand: AgeBand.SIX_TO_NINE,
  assurance: {
    level: AgeAssuranceLevel.GUARDIAN_ATTESTED,
    method: AgeAssuranceMethod.GUARDIAN_ATTESTATION,
    assertedAt: "2025-07-15T09:00:00.000Z",
  },
  authenticatedAt: "2025-07-15T09:00:00.000Z",
});
```

Family timestamps use canonical UTC only: `YYYY-MM-DDTHH:mm:ssZ` or
`YYYY-MM-DDTHH:mm:ss.sssZ`. Calendar rollovers, offsets, and other fractional
precision are rejected. Active principals reject future authentication,
assurance asserted after authentication, and assurance that has already
expired. Accepted child-link invitations require assurance valid at their
resolution time.

Family opaque identifiers share the economy contract's ASCII grammar: one to
128 characters, starting with an alphanumeric character and continuing with
alphanumerics, `.`, `_`, `:`, or `-`.

`householdIdentitySchema` names the current `hostGuardianAccountId` without
introducing treasury or payment state. Role assignments distinguish
`host-guardian` from `co-guardian`; a host assignment always has both child and
finance management. Validate every proposed complete assignment snapshot with
`householdGuardianBoundarySchema` in the same transaction. It requires exactly
one active host matching the household identity, so revoking the last host is
invalid unless a replacement becomes active atomically. Grant and revocation
actor IDs remain protected audit fields.

The relationship and invitation schemas also validate explicit guardian roles,
lifecycle state, expiry ordering, two authenticated approvals for acceptance,
mandatory resolver audit for every terminal outcome, and safe authorization
versions. Once both sides approve, only the initiating guardian or invitation
target may complete acceptance; arbitrary third-party account IDs are rejected.
APIs must still enforce guardian step-up authentication, atomic writes, and
current relationship-version freshness.

---

## Key Documentation

- [Plasius Pillars](https://github.com/plasius/plasius/blob/main/docs/pillars.md)
- [Investor Brief](https://github.com/plasius/plasius/blob/main/docs/investor-brief.md)
- [Competition](https://github.com/plasius/plasius/blob/main/docs/competition.md)
- [Architecture Decision Records (ADRs)](https://github.com/plasius/plasius/tree/main/docs/architecture/adr)

---

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

- [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Contributor License Agreement](./CLA.md)

---

## License

Licensed under the [Apache-2.0 License](./LICENSE).

<!-- BEGIN PLASIUS RELEASE INTEGRITY -->
## Release integrity

CI keeps the administrative contributor registry outside Git and npm package
artifacts using exact, case-normalised path checks. Pull requests run on
GitHub-hosted runners after same-repository admission; protected `main` CI uses
the workflow-restricted self-hosted group. Release preparation and npm
publication use GitHub-hosted runners with Node.js 24.18.0 LTS.

Package releases start by dispatching `cd.yml` from `main` with the `prepare`
phase. The workflow lands the version and changelog through a unique,
non-force-pushed release pull request, waits for the push-triggered `ci.yml` run
for that exact merge commit, and then dispatches a separate `publish` phase from
the same `main` SHA. Preparation is serialized, while publication runs use the
prepared SHA in their concurrency identity so the self-dispatched publication
cannot be blocked by the preparation run that created it.
Publication fails closed if the workflow SHA, remote `main`, successful CI
evidence, package version, release tag, or version-derived prerelease identity
differs. npm authentication uses the `production` environment's
workflow-specific OIDC trusted-publisher binding; no long-lived npm write token
or token fallback is used. The reusable preparation workflow receives only the
release GitHub App private key rather than inherited organization secrets.
Dependencies, validation, coverage upload, SBOM generation, and
`npm pack --ignore-scripts` run in a separate read-only hosted job. The
production OIDC job downloads the exact package and SBOM artifact IDs, verifies
both file and GitHub artifact digests plus package identity, and publishes only
the verified tarball with lifecycle scripts disabled. The optional Codecov step
runs only after both immutable publication artifacts have been sealed. Before
GitHub release finalization, the workflow requires npm's published SHA-512
integrity to match that exact tarball and the version-derived npm distribution
tag to point at the exact package version; duplicate retries fail closed on
either mismatch.

CD remains disabled until the npm binding for organization `Plasius-LTD`,
repository `entity-manager`, workflow `cd.yml`, environment `production`, and
allowed action `npm publish` has been independently verified. Rollback is to
disable `cd.yml`; an interrupted unpublished release can be retried with
`prepare` and `bump: none` after `main` is stable.
<!-- END PLASIUS RELEASE INTEGRITY -->
