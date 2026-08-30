import { describe, expect, it } from "vitest";
import {
  FEEDBACK_BUG_HEALTH_METRICS_OPERATION_RECEIPT_PURGE_SAFETY_SECONDS,
  FEEDBACK_BUG_HEALTH_METRICS_OPERATION_RECEIPT_TTL_SECONDS,
  FeedbackBugHealthMetricsReceiptOutcome,
  feedbackBugHealthMetricsOperationReceiptEntitySchema,
} from "../src/index.js";

const RECORDED_AT = "2026-08-28T10:04:00.000Z";

function receipt(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type: "feedbackBugHealthMetricsOperationReceiptEntity",
    version: "1.0.0",
    receiptId: "018f1c2d-3e4f-4a5b-8c6d-7e8f90123456",
    counterId: "bug-hour:2026-08-28T10:03",
    windowStart: "2026-08-28T10:00:00.000Z",
    windowEnd: "2026-08-28T11:00:00.000Z",
    shard: 3,
    counterRevisionAfter: 7,
    outcome: FeedbackBugHealthMetricsReceiptOutcome.COOLDOWN_FIFTEEN_MINUTES,
    recordedAt: RECORDED_AT,
    expiresAt: "2026-08-28T10:19:00.000Z",
    hardDeleteAt: "2026-08-29T10:19:00.000Z",
    ttlSeconds: 15 * 60,
    revision: 0,
    ...overrides,
  };
}

describe("feedback bug-health metrics operation receipt", () => {
  it("exports a short fixed lifecycle and no PII fields", () => {
    expect(FEEDBACK_BUG_HEALTH_METRICS_OPERATION_RECEIPT_TTL_SECONDS)
      .toBe(15 * 60);
    expect(FEEDBACK_BUG_HEALTH_METRICS_OPERATION_RECEIPT_PURGE_SAFETY_SECONDS)
      .toBe(24 * 60 * 60);
    expect(feedbackBugHealthMetricsOperationReceiptEntitySchema.tableName?.())
      .toBe("feedbackMetricsControl");
    expect(feedbackBugHealthMetricsOperationReceiptEntitySchema.getPiiAudit())
      .toEqual([]);
  });

  it("accepts one immutable server-random receipt bound to a counter result", () => {
    const value = receipt();
    expect(
      feedbackBugHealthMetricsOperationReceiptEntitySchema.validate(value)
        .valid,
    ).toBe(true);
    expect(
      feedbackBugHealthMetricsOperationReceiptEntitySchema.serialize(value),
    ).toEqual({
      type: "feedbackBugHealthMetricsOperationReceiptEntity",
      version: "1.0.0",
    });
    expect(
      feedbackBugHealthMetricsOperationReceiptEntitySchema.validate(
        structuredClone(value),
        value,
      ).valid,
    ).toBe(false);
  });

  it("rejects substitution, mutation, lifecycle extension, and PII-shaped fields", () => {
    const hostile = receipt();
    Object.defineProperty(hostile, "outcome", {
      enumerable: true,
      get: () => FeedbackBugHealthMetricsReceiptOutcome.ACCEPTED,
    });

    for (const invalid of [
      receipt({ receiptId: "not-random" }),
      receipt({ counterId: "bug-hour:2026-08-28T10:04" }),
      receipt({ windowStart: "2026-08-28T09:00:00.000Z" }),
      receipt({ windowEnd: "2026-08-28T12:00:00.000Z" }),
      receipt({ shard: 16, counterId: "bug-hour:2026-08-28T10:16" }),
      receipt({ counterRevisionAfter: 0 }),
      receipt({ outcome: "other" }),
      receipt({ recordedAt: "2026-08-28T10:04:00.001Z" }),
      receipt({ expiresAt: "2026-08-28T10:20:00.000Z" }),
      receipt({ hardDeleteAt: "2026-08-30T10:19:00.000Z" }),
      receipt({ ttlSeconds: 901 }),
      receipt({ revision: 1 }),
      receipt({ reporterId: "synthetic-account" }),
      receipt({ requestId: "synthetic-request" }),
      receipt({ ipAddress: "192.0.2.1" }),
      receipt({ userAgent: "synthetic-agent" }),
      receipt({ url: "https://example.invalid/private" }),
      receipt({ narrative: "synthetic narrative" }),
      receipt({ packetId: "018f1c2d-3e4f-4a5b-8c6d-7e8f90123457" }),
      hostile,
    ]) {
      expect(
        feedbackBugHealthMetricsOperationReceiptEntitySchema.validate(invalid)
          .valid,
      ).toBe(false);
    }
  });
});
