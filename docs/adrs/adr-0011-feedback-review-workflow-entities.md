# ADR-0011: Validate feedback review storage separately from packet and wire contracts

- Status: Accepted
- Date: 2026-11-11
- Work: [Entity Manager #81](https://github.com/Plasius-LTD/entity-manager/issues/81)

## Context

The review queue needs filterable state, immutable transition history, retry
reconciliation and bounded feed checkpoints. Mutating source packets or using
a generic actor-bearing entity would break the existing privacy boundary and
could reset retention. Wire validators alone cannot bind conditional updates
to the preceding record or the original packet expiry.

## Decision

Use closed scalar rows at storage version `1.0.0`, composed from the published
`@plasius/schema` workflow contracts. Partition by `kind`: `bug` or `review`.
Use deterministic IDs `state:<packetId>`, `history:<packetId>:<revision>`,
`operation:<operationId>`, and `checkpoint`. Preserve flat allowlisted filter
fields for indexed state queries. Accept no reporter or administrator identity,
narrative, notes, external references or raw provider data. The checkpoint's
bounded encoded SDK continuation and random, per-operation audit link stay
internal. They are never returned as public cursors or actor identifiers.

Project revision one only from matching committed source evidence. A replay
does not replace existing state. A transition validates one revision step,
unchanged packet metadata, the explicit state change, matching immutable
history and a matching pending audit receipt. The adapter uses the current
state ETag and one same-partition transaction with create-only history and
operation rows. Within that kind partition, reuse of an operation UUID for
another packet or command is a conflict; an exact retry reconciles the
original result. A conditional audit acknowledgement may only advance the
receipt from pending to complete after the separate audit port succeeds.

For each packet-bound write, floor the remaining seconds to the original
expiry and refuse writes with less than one whole second remaining. The
adapter computes the TTL immediately before submission and independently
filters reads by absolute expiry because the datastore applies TTL relative
to its own write time. Retries and audit completion do not extend expiry.
The checkpoint follows the feed rather than a packet: it has no item TTL,
advances conditionally under the active lease epoch and cannot reverse
completed backfill.

## Consequences and rollout

The package adds pure validation and no networking, infrastructure or retry
loops. The site adapter still owns source receipt validation, transactional
I/O, deadlines, concurrency, leases, expiry enforcement, restricted audit
and observability. No package-level auth or UI changes; the site's
`admin.feedback.read` and `admin.feedback.manage` capabilities and
`feedback.review-workflow.enabled` and `feedback.processing.enabled` flags
remain the rollout controls. Disable processing first to preserve reads and
history, or disable the workflow flag to turn off the full surface. No
package version or site flag change is applied by this code at runtime.

Tests cover closed fields, monotonic revisions, matching audit and replay,
lease fencing, and retention for all packet-bound row kinds. Current packet
and acceptance-receipt contracts remain unchanged. Release from protected
main through the approved production npm workflow before MCP and site
integration. Live transaction and race testing, access checks, accessibility,
cost and rollback verification belong to the consuming site.
