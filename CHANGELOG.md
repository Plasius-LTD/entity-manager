# Changelog

## Unreleased
- add runtime `baseEntitySchema`, `ensureValid`, and `bumpVersion` helpers to enforce entity consistency
- add validation and immutability tests for base entities
- align README usage with the runtime API and note validation rules
- fix test discovery and TypeScript config to cover `tests/`
- relax ISO8601 validation to accept standard variants without milliseconds
- keep `updatedAt` monotonic (never before `createdAt`) when bumping versions, guarding against clock skew
- add `wrapExternalSchema` helper to plug in validators from `@plasius/schema` or other sources
- use `@plasius/schema` field builders for base entity validation, enforce SemVer versions, and document integration
