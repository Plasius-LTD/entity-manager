
# Changelog

All notable changes to this project will be documented in this file.

The format is based on **[Keep a Changelog](https://keepachangelog.com/en/1.1.0/)**, and this project adheres to **[Semantic Versioning](https://semver.org/spec/v2.0.0.html)**.

---

## [Unreleased]

- **Added**
  - (placeholder)

- **Changed**
  - Split package release preparation and publication into separate exact-main
    `cd.yml` runs so the npm provenance commit matches the released source.
  - Land release metadata through immutable per-attempt pull-request branches
    and preserve every pending release phase in the CD concurrency queue.

- **Fixed**
  - (placeholder)

- **Security**
  - Clarified that CLA acceptance records remain in access-controlled storage
    outside source control and public release artifacts.
  - Replaced the long-lived npm write-token path with workflow-bound OIDC
    trusted publishing and added repeated exact-SHA successful-main-CI
    admission before any tag, GitHub release, or npm publication mutation.
  - Restricted reusable release preparation to its single GitHub App secret and
    bound prerelease distribution tags to the prepared package version.
  - Isolated dependency and third-party validation code from the npm OIDC job;
    publication now consumes a digest-bound tarball with lifecycle scripts
    disabled.
  - Bound duplicate-publication recovery and GitHub release finalization to
    npm's exact SHA-512 package integrity and version-derived distribution tag.

## [1.0.25] - 2026-07-28

- **Added**
  - Added the registration-free `@plasius/entity-manager/permissions` package
    subpath with ESM, CommonJS, and TypeScript declaration outputs.

- **Changed**
  - Moved the canonical `Scope` enum into a side-effect-free module while
    preserving the existing root export and all enum values.

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [1.0.24] - 2026-07-26

- **Added**
  - Added versioned derived-age, assurance, managed-child, actor/subject
    principal, household identity/host boundary, guardian-role, relationship,
    and two-sided invitation contracts.
  - Added normalized platform-authority assignments, group definitions,
    versioned member/owner relationships, and final-owner snapshot validation.
  - Added professional-role category, definition, and world/character/
    institution-scoped assignment contracts with optional delegated group
    governance, including product-neutral guild, education, nobility, and
    divinity seed metadata.

- **Changed**
  - Authenticated users may now carry an optional server-issued actor/subject
    principal while legacy sessions remain valid; the active subject must
    match `sub` so delegated children cannot inherit guardian authorization.
  - Family age-assurance, principal, and host-assignment constants now expose
    assignable literal union types while retaining dot-style runtime members.
  - Family timestamps now require canonical UTC seconds or millisecond values,
    and family opaque identifiers align with the economy one-to-128-character
    ASCII grammar.
  - The package typecheck gate now includes regression test sources.

- **Fixed**
  - Preserve guardian-role and group-membership enum narrowing in emitted
    nested schema declarations so strict downstream TypeScript consumers can
    validate the public package.
  - Provider-verified actor/subject principals now revalidate after public
    serialization removes their internal evidence reference, without relaxing
    the stored assurance schema.
  - Accepted family invitations may be completed by either authenticated
    participant while rejecting unrelated resolver accounts.
  - Group-owner professional assignments now require their governing
    `groupId`, and migrated assignments may retain historical effective dates
    without falsifying their record timestamp.

- **Security**
  - Added fail-closed source and npm-package admission for the administrative contributor registry and pinned the CI/CD runtime to Node.js 24.18.0 LTS.
  - Kept platform authority, group ownership, and professional standing
    structurally separate; protected immutable identity/audit fields from
    public serialization and restricted professional interfaces to
    `game.professional.*`.
  - Kept raw dates of birth and wallet/payment state out of shared profile
    schemas, and bound delegated child principals to relationship authorization
    versions without inheriting guardian roles.
  - Reject future or temporally invalid active principals, expired assurance at
    invitation acceptance, last-host removal, and terminal invitations without
    a resolver audit identity.
  - Reject self-created managed-child records, assurance invalid at account
    creation, and closed claim histories with inconsistent lifecycle ordering.

## [1.0.23] - 2026-07-13

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)
  - Consume the RFC-remediated `@plasius/schema` and `@plasius/translations` releases (task #32).

- **Fixed**
  - Route release preparation through the same configurable trusted self-hosted
    runner policy as package publication while retaining fork-deny workflow
    guards for task #35.

- **Security**
  - (placeholder)

## [1.0.22] - 2026-06-28

- **Added**
  - (placeholder)

- **Changed**
  - Refreshed the published `@plasius/schema`, `@plasius/translations`, and `react` dependencies to their latest released versions.
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [1.0.21] - 2026-06-22

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [1.0.20] - 2026-06-22

- **Added**
  - Added editable profile validation translation keys, `en-GB` defaults, and helper exports backed by `@plasius/translations`.

- **Changed**
  - Editable profile validation messages now resolve default English text through the package translation dictionary while preserving existing message strings.

- **Fixed**
  - Restored the package CD workflow so protected `main` releases are prepared by PR and published without direct branch pushes.
  - (placeholder)

- **Security**
  - (placeholder)

## [1.0.17] - 2026-05-14

- **Added**
  - Completed `objectAssetEntitySchema` with concrete object asset metadata fields and component attachments.

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [1.0.16] - 2026-05-13

- **Added**
  - (placeholder)

- **Changed**
  - Refreshed dependencies to the latest stable published versions.
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [1.0.15] - 2026-04-21

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [1.0.14] - 2026-04-02

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [1.0.13] - 2026-03-27

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [1.0.12] - 2026-03-09

- **Added**
  - Added public serialization coverage for base, role, permission, asset, and avatar entities.

- **Changed**
  - Raised the minimum `@plasius/schema` dependency to `^1.2.6`.
  - Marked persistence-only audit and storage fields as internal so `schema.serialize()` omits them from default public payloads.

- **Fixed**
  - Prevented `partitionKey`, audit actor ids, and similar persistence metadata from being treated as client-safe entity fields by default.

- **Security**
  - Reduced accidental leakage risk for internal entity metadata during API serialization.

## [1.0.11] - 2026-03-04

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [1.0.7] - 2026-03-01

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [1.0.6] - 2026-02-28

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [1.0.5] - 2026-02-22

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [1.0.4] - 2026-02-10

- **Added**
  - (placeholder)

- **Changed**
  - Publish manifest now explicitly includes `dist/` artifacts so CJS/ESM entry points are shipped.

- **Fixed**
  - npm package now includes `dist/index.cjs`, resolving runtime `Cannot find module .../dist/index.cjs` failures.

- **Security**
  - (placeholder)

## [1.0.3] - 2026-01-22

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [1.0.2] - 2026-01-15

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [1.0.1] - 2026-01-14

- **Added**
  - Migrated all entity schemas, enums, and validators from `@plasius/entity-types` into `@plasius/entity-manager`.

- **Changed**
  - Replaced legacy helper APIs with entity-type exports (base entity, user, asset, component, auth, translation schemas).
  - Refreshed tests and README to reflect the migrated schema surface.

- **Fixed**
  - `baseEntitySchema` version now accepts SemVer strings and soft-delete validation is hardened.

- **Security**
  - (placeholder)


[1.0.1]: https://github.com/Plasius-LTD/entity-manager/releases/tag/v1.0.1
[1.0.2]: https://github.com/Plasius-LTD/entity-manager/releases/tag/v1.0.2
[1.0.3]: https://github.com/Plasius-LTD/entity-manager/releases/tag/v1.0.3
[1.0.4]: https://github.com/Plasius-LTD/entity-manager/releases/tag/v1.0.4

## [1.0.3] - 2026-02-11

- **Added**
  - Initial release.

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)
[1.0.5]: https://github.com/Plasius-LTD/entity-manager/releases/tag/v1.0.5
[1.0.6]: https://github.com/Plasius-LTD/entity-manager/releases/tag/v1.0.6
[1.0.7]: https://github.com/Plasius-LTD/entity-manager/releases/tag/v1.0.7
[1.0.11]: https://github.com/Plasius-LTD/entity-manager/releases/tag/v1.0.11
[1.0.12]: https://github.com/Plasius-LTD/entity-manager/releases/tag/v1.0.12
[1.0.13]: https://github.com/Plasius-LTD/entity-manager/releases/tag/v1.0.13
[1.0.14]: https://github.com/Plasius-LTD/entity-manager/releases/tag/v1.0.14
[1.0.15]: https://github.com/Plasius-LTD/entity-manager/releases/tag/v1.0.15
[1.0.16]: https://github.com/Plasius-LTD/entity-manager/releases/tag/v1.0.16
[1.0.17]: https://github.com/Plasius-LTD/entity-manager/releases/tag/v1.0.17
[1.0.20]: https://github.com/Plasius-LTD/entity-manager/releases/tag/v1.0.20
[1.0.21]: https://github.com/Plasius-LTD/entity-manager/releases/tag/v1.0.21
[1.0.22]: https://github.com/Plasius-LTD/entity-manager/releases/tag/v1.0.22
[1.0.23]: https://github.com/Plasius-LTD/entity-manager/releases/tag/v1.0.23
[1.0.24]: https://github.com/Plasius-LTD/entity-manager/releases/tag/v1.0.24
[1.0.25]: https://github.com/Plasius-LTD/entity-manager/releases/tag/v1.0.25
