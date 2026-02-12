# ADR-0002: Public Package Governance Baseline

- Status: Accepted
- Date: 2026-02-12

## Context

`@plasius/entity-manager` is distributed as a public package and should meet the same governance baseline used by `@plasius/schema` for documentation and release quality.

## Decision

Adopt the schema baseline in this repository:

- Maintain full README banner coverage for npm, build, coverage, license, code of conduct, security, and changelog.
- Keep ADR documentation current for architecture-impacting decisions.
- Keep legal and security policy documents versioned with the codebase.
- Release through GitHub CI/CD with automated tests and coverage upload.

## Consequences

- Positive: Consistent package quality signals across the Plasius package set.
- Positive: Architectural and governance decisions are easier to review and audit.
- Negative: Slightly higher maintenance effort when documentation standards evolve.

## Alternatives Considered

- Keep entity-manager standards independent from schema: Rejected due to inconsistent package governance.
- Defer governance work until after release: Rejected because gaps become harder to close once package usage grows.
