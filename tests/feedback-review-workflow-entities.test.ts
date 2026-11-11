import { describe, expect, it, vi } from "vitest";
import * as entities from "../src/index.js";
import type {
  FeedbackReviewCheckpointEntity,
  FeedbackReviewHistoryEntity,
  FeedbackReviewOperationEntity,
  FeedbackReviewStateEntity,
} from "../src/index.js";

const packetId = "c76e2478-27b5-4f96-9097-a31af971e9da";
const otherPacket = "c76e2478-27b5-4f96-9097-a31af971e9db";
const operationId = "ecaa40e7-1632-48f0-9300-95edbd32611b";
const auditIntentId = "ecaa40e7-1632-48f0-9300-95edbd32611c";
const acceptedAt = "2026-04-01T00:00:00.000Z";
const expiresAt = "2026-04-01T00:01:00.000Z";
const projectedAt = "2026-04-01T00:00:05.000Z";
const writtenAt = "2026-04-01T00:00:10.000Z";
const auditAt = "2026-04-01T00:00:12.250Z";
const version = "1.0.0";

const projection = {
  packetId, acceptedAt, expiresAt, kind: "review", revision: 1,
  status: "unreviewed", satisfaction: 3, updatedAt: acceptedAt,
} as const;
const initial: FeedbackReviewStateEntity = {
  ...projection, id: `state:${packetId}`, type: "feedback-review-state-entity",
  version, writtenAt: projectedAt, ttl: 55,
};
const reviewed: FeedbackReviewStateEntity = {
  ...initial, status: "reviewed", revision: 2, updatedAt: writtenAt, writtenAt, ttl: 50,
};
const history: FeedbackReviewHistoryEntity = {
  id: `history:${packetId}:2`, type: "feedback-review-history-entity", version, writtenAt,
  ttl: 50, packetId, acceptedAt, expiresAt, kind: "review", revision: 2, occurredAt: writtenAt,
  action: "mark-reviewed", fromStatus: "unreviewed", toStatus: "reviewed",
};
const operation: FeedbackReviewOperationEntity = {
  ...history, id: `operation:${operationId}`, type: "feedback-review-operation-entity",
  operationId, auditIntentId, auditStatus: "pending", expectedRevision: 1,
};
const checkpoint: FeedbackReviewCheckpointEntity = {
  id: "checkpoint", kind: "review", type: "feedback-review-checkpoint-entity", version,
  revision: 1, continuation: "cGFnZTE", backfillComplete: false, updatedAt: writtenAt,
  lastSuccessfulAt: writtenAt, leaseEpoch: 1,
};

describe("feedback review storage entities", () => {
  it("accepts four separately versioned, partitionable storage records", () => {
    expect(entities.FEEDBACK_REVIEW_ENTITY_VERSION).toBe(version);
    expect(entities.isFeedbackReviewStateEntity(initial)).toBe(true);
    expect(entities.isFeedbackReviewHistoryEntity(history)).toBe(true);
    expect(entities.isFeedbackReviewOperationEntity(operation)).toBe(true);
    expect(entities.isFeedbackReviewCheckpointEntity(checkpoint)).toBe(true);
  });

  it.each(["actorId", "reporterId", "note", "externalReference", "_etag", "idempotencyKey"])(
    "rejects unsupported field %s across all four entity types",
    (field) => {
      expect(entities.isFeedbackReviewStateEntity({ ...initial, [field]: "canary.invalid" })).toBe(false);
      expect(entities.isFeedbackReviewHistoryEntity({ ...history, [field]: "canary.invalid" })).toBe(false);
      expect(entities.isFeedbackReviewOperationEntity({ ...operation, [field]: "canary.invalid" })).toBe(false);
      expect(entities.isFeedbackReviewCheckpointEntity({ ...checkpoint, [field]: "canary.invalid" })).toBe(false);
    },
  );

  it("does not evaluate untrusted accessors or accept hidden, inherited or malformed records", () => {
    const getter = vi.fn(() => packetId);
    expect(entities.isFeedbackReviewStateEntity(Object.defineProperty({ ...initial }, "packetId", { get: getter }))).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    expect(entities.isFeedbackReviewStateEntity(Object.create(initial))).toBe(false);
    expect(entities.isFeedbackReviewStateEntity({ ...initial, ["__proto__"]: "unsupported" })).toBe(false);
    expect(entities.isFeedbackReviewStateEntity({ ...initial, [Symbol("hidden")]: 1 })).toBe(false);
    expect(entities.isFeedbackReviewStateEntity(Object.defineProperty({ ...initial }, "ttl", { enumerable: false }))).toBe(false);
    expect(entities.isFeedbackReviewStateEntity(new Proxy(initial, { ownKeys() { throw Error("canary"); } }))).toBe(false);
    for (const value of [null, 1, [], new Date(), { ...initial, kind: {} }]) {
      expect(entities.isFeedbackReviewStateEntity(value)).toBe(false);
    }
  });

  it("binds identities to closed contract values and canonical storage IDs", () => {
    expect(entities.isFeedbackReviewStateEntity({ ...initial, id: `state:${otherPacket}` })).toBe(false);
    expect(entities.isFeedbackReviewStateEntity({ ...initial, version: "2.0.0" })).toBe(false);
    expect(entities.isFeedbackReviewStateEntity({ ...initial, packetId: 7 })).toBe(false);
    expect(entities.isFeedbackReviewHistoryEntity({ ...history, id: `history:${packetId}:3` })).toBe(false);
    expect(entities.isFeedbackReviewHistoryEntity({ ...history, outcome: "duplicate" })).toBe(false);
    expect(entities.isFeedbackReviewOperationEntity({ ...operation, id: history.id })).toBe(false);
    expect(entities.isFeedbackReviewOperationEntity({ ...operation, expectedRevision: 2 })).toBe(false);
    expect(entities.isFeedbackReviewCheckpointEntity({ ...checkpoint, id: "other" })).toBe(false);
    expect(entities.isFeedbackReviewCheckpointEntity({ ...checkpoint, continuation: "a/b=" })).toBe(false);
  });

  it("floors TTL at write time and refuses extension, subsecond writes, and invalid clocks", () => {
    expect(entities.feedbackReviewRemainingTtl(expiresAt, auditAt)).toBe(47);
    expect(entities.feedbackReviewRemainingTtl(expiresAt, expiresAt)).toBeUndefined();
    expect(entities.feedbackReviewRemainingTtl(expiresAt, "2026-04-01T00:00:59.001Z")).toBeUndefined();
    expect(entities.feedbackReviewRemainingTtl(expiresAt, "2026-04-01T00:00:05Z")).toBeUndefined();
    expect(entities.isFeedbackReviewStateEntity({ ...initial, ttl: 60 })).toBe(false);
    expect(entities.isFeedbackReviewStateEntity({ ...initial, writtenAt: "2026-03-31T23:59:59.000Z", ttl: 61 })).toBe(false);
    expect(entities.isFeedbackReviewHistoryEntity({ ...history, writtenAt: auditAt, ttl: 47 })).toBe(false);
    expect(entities.isFeedbackReviewOperationEntity({ ...operation, writtenAt: auditAt, ttl: 47 })).toBe(false);
  });

  it("allows only create-only revision-one projection of the original packet", () => {
    expect(entities.isFeedbackReviewInitialState(initial, projection, projectedAt)).toBe(true);
    expect(entities.isFeedbackReviewInitialState(initial, { ...projection, expiresAt: "2026-04-01T00:02:00.000Z" }, projectedAt)).toBe(false);
    expect(entities.isFeedbackReviewInitialState(initial, { ...projection, satisfaction: 4 }, projectedAt)).toBe(false);
    expect(entities.isFeedbackReviewInitialState(initial, projection, writtenAt)).toBe(false);
    expect(entities.isFeedbackReviewInitialState(reviewed, projection, writtenAt)).toBe(false);
    expect(entities.isFeedbackReviewInitialState(initial, { ...projection, note: "canary.invalid" }, projectedAt)).toBe(false);
  });
});

describe("feedback review conditional persistence", () => {
  it("accepts exactly one matching revision advance and audit intent in the transaction", () => {
    expect(entities.isFeedbackReviewTransitionWrite(initial, reviewed, history, operation, writtenAt)).toBe(true);
    expect(entities.isFeedbackReviewTransitionWrite(reviewed, reviewed, history, operation, writtenAt)).toBe(false);
    expect(entities.isFeedbackReviewTransitionWrite(initial, reviewed, history, operation, auditAt)).toBe(false);
    expect(entities.isFeedbackReviewTransitionWrite(initial, { ...reviewed, satisfaction: 4 }, history, operation, writtenAt)).toBe(false);
    expect(entities.isFeedbackReviewTransitionWrite(initial, { ...reviewed, expiresAt: "2026-04-01T00:02:00.000Z", ttl: 110 }, history, operation, writtenAt)).toBe(false);
    expect(entities.isFeedbackReviewTransitionWrite(initial, reviewed, { ...history, packetId: otherPacket, id: `history:${otherPacket}:2` }, operation, writtenAt)).toBe(false);
    expect(entities.isFeedbackReviewTransitionWrite(initial, reviewed, history, { ...operation, auditStatus: "complete" }, writtenAt)).toBe(false);
  });

  it("processes then reopens with cleared outcome and unchanged expiry", () => {
    const processAt = "2026-04-01T00:00:15.000Z";
    const reopenAt = "2026-04-01T00:00:20.000Z";
    const processed = { ...reviewed, updatedAt: processAt, writtenAt: processAt, ttl: 45, status: "processed", revision: 3, outcome: "duplicate" } as const;
    const processedEvent = { ...history, id: `history:${packetId}:3`, occurredAt: processAt, writtenAt: processAt, ttl: 45, action: "process", fromStatus: "reviewed", toStatus: "processed", revision: 3, outcome: "duplicate" } as const;
    const processedReceipt = { ...processedEvent, id: operation.id, type: operation.type, operationId, auditIntentId, auditStatus: "pending", expectedRevision: 2 } as const;
    const reopened = { ...reviewed, updatedAt: reopenAt, writtenAt: reopenAt, ttl: 40, revision: 4 };
    const reopenedEvent = { ...history, id: `history:${packetId}:4`, occurredAt: reopenAt, writtenAt: reopenAt, ttl: 40, action: "reopen", fromStatus: "processed", toStatus: "reviewed", revision: 4 } as const;
    const reopenedReceipt = { ...reopenedEvent, id: operation.id, type: operation.type, operationId, auditIntentId, auditStatus: "pending", expectedRevision: 3 } as const;
    expect(entities.isFeedbackReviewTransitionWrite(reviewed, processed, processedEvent, processedReceipt, processAt)).toBe(true);
    expect(entities.isFeedbackReviewTransitionWrite(reviewed, processed, { ...processedEvent, outcome: "no-action" }, processedReceipt, processAt)).toBe(false);
    expect(entities.isFeedbackReviewTransitionWrite(reviewed, processed, processedEvent, { ...processedReceipt, outcome: "no-action" }, processAt)).toBe(false);
    expect(entities.isFeedbackReviewTransitionWrite(processed, reopened, reopenedEvent, reopenedReceipt, reopenAt)).toBe(true);
    expect(entities.isFeedbackReviewTransitionWrite(processed, { ...reopened, outcome: "duplicate" }, reopenedEvent, reopenedReceipt, reopenAt)).toBe(false);
  });

  it("matches only an exact, unexpired replay and preserves the original receipt across audit acknowledgement", () => {
    const command = { action: "mark-reviewed", expectedRevision: 1 } as const;
    const completed = { ...operation, auditStatus: "complete", writtenAt: auditAt, ttl: 47 } as const;
    expect(entities.matchesFeedbackReviewOperation(operation, "review", packetId, operationId, command, auditAt)).toBe(true);
    expect(entities.matchesFeedbackReviewOperation(operation, "review", packetId, operationId, command, expiresAt)).toBe(false);
    expect(entities.matchesFeedbackReviewOperation(operation, "bug", packetId, operationId, command, auditAt)).toBe(false);
    expect(entities.matchesFeedbackReviewOperation(operation, "review", otherPacket, operationId, command, auditAt)).toBe(false);
    expect(entities.matchesFeedbackReviewOperation(operation, "review", packetId, auditIntentId, command, auditAt)).toBe(false);
    expect(entities.matchesFeedbackReviewOperation(operation, "review", packetId, operationId, { action: "reopen", expectedRevision: 1 }, auditAt)).toBe(false);
    expect(entities.matchesFeedbackReviewOperation(operation, "review", packetId, operationId, { ...command, expectedRevision: 2 }, auditAt)).toBe(false);
    expect(entities.matchesFeedbackReviewOperation(completed, "review", packetId, operationId, command, writtenAt)).toBe(false);
    expect(entities.matchesFeedbackReviewOperation(completed, "review", packetId, operationId, command, auditAt)).toBe(true);
    expect(entities.matchesFeedbackReviewOperation(operation, "review", packetId, operationId, { ...command, actorId: "canary.invalid" }, auditAt)).toBe(false);
    expect(entities.isFeedbackReviewAuditCompletion(operation, completed, auditAt)).toBe(true);
    expect(entities.isFeedbackReviewAuditCompletion(completed, completed, auditAt)).toBe(false);
    expect(entities.isFeedbackReviewAuditCompletion(operation, { ...completed, auditIntentId: operationId }, auditAt)).toBe(false);
    expect(entities.isFeedbackReviewAuditCompletion(operation, { ...completed, ttl: 50 }, auditAt)).toBe(false);
  });

  it("requires lease fencing and monotonic revisions and never discards completed backfill", () => {
    const next = { ...checkpoint, revision: 2, updatedAt: auditAt, lastSuccessfulAt: auditAt, leaseEpoch: 2, backfillComplete: true };
    expect(entities.isFeedbackReviewCheckpointWrite(undefined, checkpoint, 1, writtenAt)).toBe(true);
    expect(entities.isFeedbackReviewCheckpointWrite(undefined, next, 2, auditAt)).toBe(false);
    expect(entities.isFeedbackReviewCheckpointWrite(checkpoint, next, 2, auditAt)).toBe(true);
    expect(entities.isFeedbackReviewCheckpointWrite(checkpoint, next, 1, auditAt)).toBe(false);
    expect(entities.isFeedbackReviewCheckpointWrite(checkpoint, { ...next, kind: "bug" }, 2, auditAt)).toBe(false);
    expect(entities.isFeedbackReviewCheckpointWrite(checkpoint, { ...next, leaseEpoch: 1 }, 1, auditAt)).toBe(true);
    expect(entities.isFeedbackReviewCheckpointWrite(checkpoint, { ...next, lastSuccessfulAt: projectedAt }, 2, auditAt)).toBe(false);
    expect(entities.isFeedbackReviewCheckpointWrite(next, { ...next, revision: 3, backfillComplete: false }, 2, auditAt)).toBe(false);
    expect(entities.isFeedbackReviewCheckpointWrite(next, { ...next, revision: 3, leaseEpoch: 1 }, 1, auditAt)).toBe(false);
  });
});
