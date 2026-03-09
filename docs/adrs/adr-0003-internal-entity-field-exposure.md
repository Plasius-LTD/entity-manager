# ADR-0003: Internal Entity Field Exposure

- Status: Accepted
- Date: 2026-03-09

## Context

`@plasius/entity-manager` models persisted entities that contain both public business data and internal storage or audit metadata such as `partitionKey`, `createdBy`, and `deletedReason`. Consumers increasingly reuse these schemas to validate API payloads and serialize responses. Without an explicit exposure boundary, internal persistence fields can be returned to clients by default.

## Decision

We will mark persistence-only fields as internal using `@plasius/schema` exposure metadata and rely on `schema.serialize(...)` for client-safe default payload generation.

This applies to:

- base entity storage and audit fields;
- permission and role actor ids;
- asset validation actor ids;
- avatar storage metadata.

## Consequences

- Positive: shared entity schemas remain the source of truth for validation while still supporting safe default serialization.
- Positive: downstream APIs can remove bespoke omit-lists for common entity metadata.
- Negative: callers that intentionally need internal fields must opt in explicitly when serializing.

## Alternatives Considered

- Keep entity schemas as validation-only and require every consumer to hand-roll response DTO filters: rejected because it repeats security-sensitive logic.
- Split every entity into separate persistence and public schemas: rejected for now because it duplicates contracts without improving validation quality enough to justify the maintenance cost.
