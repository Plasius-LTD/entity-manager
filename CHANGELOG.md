
# Changelog

All notable changes to this project will be documented in this file.

The format is based on **[Keep a Changelog](https://keepachangelog.com/en/1.1.0/)**, and this project adheres to **[Semantic Versioning](https://semver.org/spec/v2.0.0.html)**.

---

## [Unreleased]

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
