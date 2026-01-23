# ADR-0001: Entity Schemas and Validators

## Status

- Proposed -> Accepted
- Date: 2025-09-12
- Version: 1.0
- Supersedes: N/A
- Superseded by: N/A

## Context

Plasius requires consistent entity definitions and validation across services and clients. Without a shared package, entity shapes diverge and validation logic is duplicated, leading to inconsistencies and higher maintenance costs.

## Decision

We will provide `@plasius/entity-manager` with these structural choices:

- Centralize entity schemas and validators in a single TypeScript package.
- Export strongly typed schemas, enums, and helpers for common entity types.
- Keep the package open source to enable external integrations and transparency.
- Publish both ESM and CJS builds with TypeScript types.

## Consequences

- **Positive:** Consistent entity definitions, reusable validation logic, and easier integration across projects.
- **Negative:** Requires careful versioning to avoid breaking schema consumers.
- **Neutral:** External consumers can adopt the schemas without adopting the full platform.

## Alternatives Considered

- **Per-project schemas:** Rejected due to duplication and divergence.
- **Use a third-party schema package only:** Rejected because it does not capture Plasius-specific entities and constraints.
