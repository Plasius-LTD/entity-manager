# ADR-0010: Reconcile counter commits with atomic short-lived receipts

- Status: Accepted
- Date: 2026-08-30

## Context

A conditional Cosmos counter replacement can commit before its response is
lost. Retrying blindly can double-count, while treating every ambiguous result
as failure can cause the application to serve a 503 after the durable counter
recorded a different terminal response. The aggregate-only row has no safe
operation identity with which to distinguish those states.

## Decision

For each terminal-outcome mutation, generate a new cryptographically random
UUIDv4 and create an immutable operation receipt in the same `counterId`
partition and Cosmos transactional batch as the conditional counter replace.
The receipt binds the canonical hour, shard, resulting revision, and a closed
terminal outcome. An ambiguous response is reconciled by exact receipt lookup.

Receipts live for exactly 15 minutes and have a one-day hard-delete and
bounded-backup safety deadline. They contain no reporter, account, pseudonym,
cookie, session, idempotency value, packet, request ID, IP, user agent, URL,
route, narrative, ciphertext, client timestamp, or exact event timestamp.
They are create-only: replacement, upsert, and replay writes are invalid.

## Consequences

- Receipt presence proves the entire same-partition transaction committed.
- Receipt absence permits a fresh random operation without duplicating a
  committed increment.
- A short random receipt adds temporary per-operation storage but no stable
  user or request correlation.
- Storage adapters must enforce same-partition transactional batches,
  If-None-Match receipt creation, TTL, and exact lookup; schema validation is
  not a distributed transaction.
