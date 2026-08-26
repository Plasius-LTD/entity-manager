import { describe, expect, it } from "vitest";
import {
  FEEDBACK_BUG_COOLDOWN_SECONDS,
  FEEDBACK_COMMITTED_ACCEPTANCE_DELIVERY_GRACE_MS,
  FEEDBACK_COMMITTED_ACCEPTANCE_DELIVERY_PURGE_SAFETY_MS,
  FEEDBACK_REVIEW_DENY_SECONDS,
  FeedbackSubmissionKind,
  feedbackCommittedAcceptanceDeliveryOutboxEntitySchema,
} from "../src/index.js";

const DAY_MS = 24 * 60 * 60 * 1_000;
const ACCEPTED_AT_MS = Date.parse("2026-08-26T05:00:00.000Z");
const COMMITTED_AT_MS = ACCEPTED_AT_MS + 2 * 60 * 1_000;
const STATE_ID = `fbs1.${"A".repeat(43)}`;
const RESERVATION_ID = `fbr1.${"A".repeat(22)}`;

function deliveryOutbox(
  submissionKind: "bug" | "review",
  cooldownDurationMs =
    submissionKind === FeedbackSubmissionKind.BUG
      ? FEEDBACK_BUG_COOLDOWN_SECONDS[0] * 1_000
      : FEEDBACK_REVIEW_DENY_SECONDS * 1_000,
) {
  const deliveryUntilMs =
    ACCEPTED_AT_MS +
    cooldownDurationMs +
    FEEDBACK_COMMITTED_ACCEPTANCE_DELIVERY_GRACE_MS;
  return {
    type: "feedbackCommittedAcceptanceDeliveryOutboxEntity",
    version: "1.0.0",
    stateId: STATE_ID,
    reservationId: RESERVATION_ID,
    submissionKind,
    acceptedAtMs: ACCEPTED_AT_MS,
    committedAtMs: COMMITTED_AT_MS,
    deliveryUntilMs,
    hardDeleteByMs:
      deliveryUntilMs +
      FEEDBACK_COMMITTED_ACCEPTANCE_DELIVERY_PURGE_SAFETY_MS,
    ttlSeconds: Math.floor(
      (deliveryUntilMs - COMMITTED_AT_MS) / 1_000,
    ),
    revision: 0,
  } as const;
}

describe("committed feedback acceptance delivery outbox", () => {
  it.each([
    FeedbackSubmissionKind.BUG,
    FeedbackSubmissionKind.REVIEW,
  ] as const)("accepts a bounded %s delivery row", (submissionKind) => {
    const entity = deliveryOutbox(submissionKind);
    const result =
      feedbackCommittedAcceptanceDeliveryOutboxEntitySchema.validate(entity);

    expect(result.valid).toBe(true);
    expect(
      feedbackCommittedAcceptanceDeliveryOutboxEntitySchema.tableName?.(),
    ).toBe("feedbackControl");
    expect(
      feedbackCommittedAcceptanceDeliveryOutboxEntitySchema.serialize(entity),
    ).toEqual({
      type: "feedbackCommittedAcceptanceDeliveryOutboxEntity",
      version: "1.0.0",
    });
  });

  it.each(FEEDBACK_BUG_COOLDOWN_SECONDS)(
    "accepts the %s-second bug cooldown branch",
    (cooldownSeconds) => {
      expect(
        feedbackCommittedAcceptanceDeliveryOutboxEntitySchema.validate(
          deliveryOutbox("bug", cooldownSeconds * 1_000),
        ).valid,
      ).toBe(true);
    },
  );

  it("uses six delivery days and one purge-safety day after eligibility", () => {
    expect(FEEDBACK_COMMITTED_ACCEPTANCE_DELIVERY_GRACE_MS).toBe(6 * DAY_MS);
    expect(FEEDBACK_COMMITTED_ACCEPTANCE_DELIVERY_PURGE_SAFETY_MS).toBe(
      DAY_MS,
    );

    const review = deliveryOutbox("review");
    expect(review.hardDeleteByMs).toBe(
      ACCEPTED_AT_MS +
        FEEDBACK_REVIEW_DENY_SECONDS * 1_000 +
        7 * DAY_MS,
    );
  });

  it.each([
    { field: "deliveryUntilMs", delta: 1 },
    { field: "hardDeleteByMs", delta: 1 },
    { field: "ttlSeconds", delta: 1 },
    { field: "acceptedAtMs", delta: 1 },
    { field: "committedAtMs", delta: 1 },
  ] as const)("rejects lifecycle drift in $field", ({ field, delta }) => {
    const entity = deliveryOutbox("review");
    expect(
      feedbackCommittedAcceptanceDeliveryOutboxEntitySchema.validate({
        ...entity,
        [field]: entity[field] + delta,
      }).valid,
    ).toBe(false);
  });

  it("rejects non-ladder bug timing and review timing", () => {
    expect(
      feedbackCommittedAcceptanceDeliveryOutboxEntitySchema.validate(
        deliveryOutbox("bug", 10 * 60 * 1_000),
      ).valid,
    ).toBe(false);
    expect(
      feedbackCommittedAcceptanceDeliveryOutboxEntitySchema.validate(
        deliveryOutbox("review", 29 * DAY_MS),
      ).valid,
    ).toBe(false);
  });

  it("anchors eligibility to acceptance without extending it for commit latency", () => {
    const entity = deliveryOutbox("review");

    expect(entity.deliveryUntilMs).toBe(
      entity.acceptedAtMs +
        FEEDBACK_REVIEW_DENY_SECONDS * 1_000 +
        FEEDBACK_COMMITTED_ACCEPTANCE_DELIVERY_GRACE_MS,
    );
    expect(entity.ttlSeconds).toBe(
      Math.floor((entity.deliveryUntilMs - entity.committedAtMs) / 1_000),
    );
    expect(
      feedbackCommittedAcceptanceDeliveryOutboxEntitySchema.validate({
        ...entity,
        acceptedAtMs: entity.committedAtMs + 1,
      }).valid,
    ).toBe(false);
  });

  it.each([
    "packetId",
    "acceptedAt",
    "artifactId",
    "blobUrl",
    "blobPath",
    "contentHash",
    "draftId",
    "idempotencyKey",
    "idempotencyDigest",
    "attemptGeneration",
    "attemptToken",
    "attemptTokenDigest",
    "accountId",
    "subjectId",
    "sessionId",
    "requestId",
    "ipAddress",
    "userAgent",
    "narrative",
    "ciphertext",
    "pixels",
  ])("rejects forbidden delivery field %s", (fieldName) => {
    const result =
      feedbackCommittedAcceptanceDeliveryOutboxEntitySchema.validate({
        ...deliveryOutbox("bug"),
        [fieldName]: "synthetic-sensitive-value",
      });

    expect(result.valid).toBe(false);
    expect(result.errors?.join(" ")).not.toContain("synthetic-sensitive-value");
    expect(result.errors?.join(" ")).not.toContain(fieldName);
  });

  it("classifies both routing keys as redacted pseudonymous control data", () => {
    const sanitized =
      feedbackCommittedAcceptanceDeliveryOutboxEntitySchema.sanitizeForLog(
        deliveryOutbox("bug"),
        () => {
          throw new Error("Delivery routing IDs must not be repseudonymized.");
        },
      );

    expect(sanitized.stateId).toBe("[REDACTED]");
    expect(sanitized.reservationId).toBe("[REDACTED]");
    expect(
      feedbackCommittedAcceptanceDeliveryOutboxEntitySchema.getPiiAudit(),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "stateId",
          classification: "low",
          logHandling: "redact",
        }),
        expect.objectContaining({
          field: "reservationId",
          classification: "low",
          logHandling: "redact",
        }),
      ]),
    );
  });

  it("accepts exact immutable replay and rejects mutation", () => {
    const entity = deliveryOutbox("bug");
    expect(
      feedbackCommittedAcceptanceDeliveryOutboxEntitySchema.validate(
        { ...entity },
        entity,
      ).valid,
    ).toBe(true);
    expect(
      feedbackCommittedAcceptanceDeliveryOutboxEntitySchema.validate(
        { ...entity, revision: 1 },
        entity,
      ).valid,
    ).toBe(false);
    expect(
      feedbackCommittedAcceptanceDeliveryOutboxEntitySchema.validate(
        { ...entity, submissionKind: "review" },
        entity,
      ).valid,
    ).toBe(false);
  });

  it("rejects noncanonical routing IDs and contract identity", () => {
    const entity = deliveryOutbox("bug");
    for (const candidate of [
      { ...entity, stateId: `fbs1.${"A".repeat(42)}B` },
      { ...entity, reservationId: `fbr1.${"A".repeat(21)}B` },
      { ...entity, type: "feedbackCommitReconciliationOutboxEntity" },
      { ...entity, version: "1.0.1" },
    ]) {
      expect(
        feedbackCommittedAcceptanceDeliveryOutboxEntitySchema.validate(
          candidate,
        ).valid,
      ).toBe(false);
    }
  });
});
