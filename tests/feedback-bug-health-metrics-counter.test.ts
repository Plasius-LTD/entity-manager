import { describe, expect, it } from "vitest";
import {
  FEEDBACK_BUG_HEALTH_METRICS_COUNTER_SHARD_COUNT,
  FEEDBACK_BUG_HEALTH_METRICS_FINALIZATION_DELAY_SECONDS,
  FEEDBACK_BUG_HEALTH_METRICS_LIVE_RETENTION_SECONDS,
  FEEDBACK_BUG_HEALTH_METRICS_PURGE_SAFETY_SECONDS,
  feedbackBugHealthMetricsCounterEntitySchema,
} from "../src/index.js";

const HOUR_START = "2026-08-28T10:00:00.000Z";
const HOUR_END = "2026-08-28T11:00:00.000Z";
const LIVE_EXPIRES_AT = "2026-09-06T11:00:00.000Z";
const HARD_DELETE_AT = "2026-09-07T11:00:00.000Z";
const MINUTE_MS = 60_000;

function ttlSeconds(updatedAt: string): number {
  return (Date.parse(LIVE_EXPIRES_AT) - Date.parse(updatedAt)) / 1_000;
}

function counter(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const updatedAt = String(overrides.updatedAt ?? HOUR_START);
  const shard = Number(overrides.shard ?? 0);
  return {
    type: "feedbackBugHealthMetricsCounterEntity",
    version: "1.0.0",
    counterId: `bug-hour:2026-08-28T10:${String(shard).padStart(2, "0")}`,
    windowStart: HOUR_START,
    windowEnd: HOUR_END,
    shard,
    terminalAttemptCount: 0,
    rejectedCount: 0,
    abuseBlockCounts: {
      fiveMinutes: 0,
      fifteenMinutes: 0,
      oneHour: 0,
      sixHours: 0,
      twentyFourHours: 0,
      failClosed: 0,
    },
    heartbeatMinuteSlots: [],
    finalized: false,
    updatedAt,
    expiresAt: LIVE_EXPIRES_AT,
    hardDeleteAt: HARD_DELETE_AT,
    ttlSeconds: ttlSeconds(updatedAt),
    revision: 0,
    ...overrides,
  };
}

function update(
  existing: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const updatedAt = String(overrides.updatedAt ?? existing.updatedAt);
  return {
    ...existing,
    revision: Number(existing.revision) + 1,
    updatedAt,
    ttlSeconds: ttlSeconds(updatedAt),
    ...overrides,
  };
}

describe("identifier-free feedback bug-health counter", () => {
  it("exports fixed source policy and routes rows to a separate table", () => {
    expect(FEEDBACK_BUG_HEALTH_METRICS_COUNTER_SHARD_COUNT).toBe(16);
    expect(FEEDBACK_BUG_HEALTH_METRICS_FINALIZATION_DELAY_SECONDS).toBe(120);
    expect(FEEDBACK_BUG_HEALTH_METRICS_LIVE_RETENTION_SECONDS)
      .toBe(9 * 24 * 60 * 60);
    expect(FEEDBACK_BUG_HEALTH_METRICS_PURGE_SAFETY_SECONDS)
      .toBe(24 * 60 * 60);
    expect(feedbackBugHealthMetricsCounterEntitySchema.tableName?.())
      .toBe("feedbackMetricsControl");
    expect(feedbackBugHealthMetricsCounterEntitySchema.getPiiAudit())
      .toEqual([]);
  });

  it("accepts only an empty open revision-zero shard", () => {
    const initial = counter();
    expect(feedbackBugHealthMetricsCounterEntitySchema.validate(initial).valid)
      .toBe(true);
    expect(feedbackBugHealthMetricsCounterEntitySchema.serialize(initial))
      .toEqual({
        type: "feedbackBugHealthMetricsCounterEntity",
        version: "1.0.0",
      });

    for (const invalid of [
      counter({ revision: 1 }),
      counter({ terminalAttemptCount: 1 }),
      counter({ rejectedCount: 1 }),
      counter({ heartbeatMinuteSlots: [0] }),
      counter({ finalized: true, finalizedAt: "2026-08-28T11:02:00.000Z" }),
      counter({ shard: 16, counterId: "bug-hour:2026-08-28T10:16" }),
      counter({ counterId: "bug-hour:2026-08-28T10:01" }),
      counter({ windowEnd: "2026-08-28T12:00:00.000Z" }),
      counter({
        abuseBlockCounts: {
          fiveMinutes: 0,
          fifteenMinutes: 0,
          oneHour: 0,
          sixHours: 0,
          twentyFourHours: 0,
          failClosed: 0,
          edgeBlocked: 1,
        },
      }),
    ]) {
      expect(feedbackBugHealthMetricsCounterEntitySchema.validate(invalid).valid)
        .toBe(false);
    }
  });

  it("accepts exactly one terminal outcome per CAS transition", () => {
    const initial = counter({ shard: 3, counterId: "bug-hour:2026-08-28T10:03" });
    const accepted = update(initial, {
      terminalAttemptCount: 1,
      updatedAt: "2026-08-28T10:04:00.000Z",
    });
    const rejected = update(accepted, {
      terminalAttemptCount: 2,
      rejectedCount: 1,
      abuseBlockCounts: {
        ...(accepted.abuseBlockCounts as Record<string, number>),
        fifteenMinutes: 1,
      },
      updatedAt: "2026-08-28T10:04:00.000Z",
    });

    expect(
      feedbackBugHealthMetricsCounterEntitySchema.validate(accepted, initial)
        .valid,
    ).toBe(true);
    expect(
      feedbackBugHealthMetricsCounterEntitySchema.validate(rejected, accepted)
        .valid,
    ).toBe(true);

    for (const invalid of [
      update(initial, { terminalAttemptCount: 2 }),
      update(initial, { terminalAttemptCount: 1, rejectedCount: 2 }),
      update(initial, {
        terminalAttemptCount: 1,
        abuseBlockCounts: {
          ...(initial.abuseBlockCounts as Record<string, number>),
          failClosed: 1,
        },
      }),
      update(initial, {
        terminalAttemptCount: 1,
        rejectedCount: 1,
        abuseBlockCounts: {
          ...(initial.abuseBlockCounts as Record<string, number>),
          fiveMinutes: 1,
          failClosed: 1,
        },
      }),
      update(rejected, { terminalAttemptCount: 1 }),
      update(initial, { revision: 2, terminalAttemptCount: 1 }),
    ]) {
      expect(
        feedbackBugHealthMetricsCounterEntitySchema.validate(invalid, initial)
          .valid,
      ).toBe(false);
    }
  });

  it("adds one current heartbeat slot on shard zero and forbids backfill", () => {
    const initial = counter();
    const first = update(initial, {
      heartbeatMinuteSlots: [0],
      updatedAt: HOUR_START,
    });
    const second = update(first, {
      heartbeatMinuteSlots: [0, 1],
      updatedAt: "2026-08-28T10:01:00.000Z",
    });

    expect(
      feedbackBugHealthMetricsCounterEntitySchema.validate(first, initial).valid,
    ).toBe(true);
    expect(
      feedbackBugHealthMetricsCounterEntitySchema.validate(second, first).valid,
    ).toBe(true);

    for (const invalid of [
      update(initial, {
        heartbeatMinuteSlots: [1],
        updatedAt: "2026-08-28T10:00:00.000Z",
      }),
      update(first, {
        heartbeatMinuteSlots: [0, 2],
        updatedAt: "2026-08-28T10:02:00.000Z",
      }),
      update(first, { heartbeatMinuteSlots: [0, 0] }),
      update(first, { heartbeatMinuteSlots: [] }),
      update(counter({ shard: 1, counterId: "bug-hour:2026-08-28T10:01" }), {
        heartbeatMinuteSlots: [0],
      }),
    ]) {
      expect(
        feedbackBugHealthMetricsCounterEntitySchema.validate(invalid, first)
          .valid,
      ).toBe(false);
    }
  });

  it("finalizes only a complete source after the exact safety delay", () => {
    const complete = counter({
      heartbeatMinuteSlots: Array.from({ length: 60 }, (_, index) => index),
      revision: 60,
      updatedAt: "2026-08-28T10:59:00.000Z",
      ttlSeconds: ttlSeconds("2026-08-28T10:59:00.000Z"),
    });
    // The complete open fixture is representative of the result after 60
    // individually validated heartbeat transitions.
    const finalizedAt = "2026-08-28T11:02:00.000Z";
    const finalized = update(complete, {
      finalized: true,
      finalizedAt,
      updatedAt: finalizedAt,
    });

    expect(
      feedbackBugHealthMetricsCounterEntitySchema.validate(finalized, complete)
        .valid,
    ).toBe(true);
    expect(
      feedbackBugHealthMetricsCounterEntitySchema.validate(
        structuredClone(finalized),
        finalized,
      ).valid,
    ).toBe(true);
    expect(
      feedbackBugHealthMetricsCounterEntitySchema.validate(
        update(finalized, { terminalAttemptCount: 1 }),
        finalized,
      ).valid,
    ).toBe(false);

    for (const invalid of [
      update({ ...complete, heartbeatMinuteSlots: [0, 1] }, {
        finalized: true,
        finalizedAt,
        updatedAt: finalizedAt,
      }),
      update(complete, {
        finalized: true,
        finalizedAt: "2026-08-28T11:01:00.000Z",
        updatedAt: "2026-08-28T11:01:00.000Z",
      }),
      update(complete, {
        finalized: true,
        finalizedAt,
        updatedAt: finalizedAt,
        terminalAttemptCount: 1,
      }),
      update(finalized, { revision: 62 }),
    ]) {
      expect(
        feedbackBugHealthMetricsCounterEntitySchema.validate(invalid, complete)
          .valid,
      ).toBe(false);
    }
  });

  it("finalizes non-heartbeat shards with an empty slot set", () => {
    const open = counter({
      shard: 15,
      counterId: "bug-hour:2026-08-28T10:15",
      terminalAttemptCount: 1,
      revision: 1,
      updatedAt: "2026-08-28T10:30:00.000Z",
      ttlSeconds: ttlSeconds("2026-08-28T10:30:00.000Z"),
    });
    const finalizedAt = "2026-08-28T11:02:00.000Z";
    const finalized = update(open, {
      finalized: true,
      finalizedAt,
      updatedAt: finalizedAt,
    });
    expect(
      feedbackBugHealthMetricsCounterEntitySchema.validate(finalized, open)
        .valid,
    ).toBe(true);
  });

  it("rejects lifecycle extension, exact event timestamps, hostile objects, and PII-shaped fields", () => {
    const initial = counter();
    const getter = viGetterCounter(initial);
    const sparseSlots = [0, 1];
    delete sparseSlots[0];

    for (const invalid of [
      counter({ updatedAt: "2026-08-28T10:00:00.001Z" }),
      counter({ expiresAt: HARD_DELETE_AT }),
      counter({ hardDeleteAt: "2026-09-08T11:00:00.000Z" }),
      counter({ ttlSeconds: ttlSeconds(HOUR_START) + 1 }),
      counter({ reporterId: "synthetic-account" }),
      counter({ ipAddress: "192.0.2.1" }),
      counter({ url: "https://example.invalid/private" }),
      counter({ narrative: "synthetic narrative" }),
      counter({ eventTimestamp: "2026-08-28T10:00:00.001Z" }),
      counter({ heartbeatMinuteSlots: sparseSlots }),
      getter,
    ]) {
      expect(feedbackBugHealthMetricsCounterEntitySchema.validate(invalid).valid)
        .toBe(false);
    }

    const accepted = update(initial, {
      terminalAttemptCount: 1,
      updatedAt: new Date(Date.parse(HOUR_START) + MINUTE_MS).toISOString(),
    });
    const extended = {
      ...accepted,
      expiresAt: "2026-09-07T11:00:00.000Z",
      hardDeleteAt: "2026-09-08T11:00:00.000Z",
      ttlSeconds: 10 * 24 * 60 * 60,
    };
    expect(
      feedbackBugHealthMetricsCounterEntitySchema.validate(extended, initial)
        .valid,
    ).toBe(false);
  });
});

function viGetterCounter(
  source: Record<string, unknown>,
): Record<string, unknown> {
  const hostile = { ...source };
  Object.defineProperty(hostile, "terminalAttemptCount", {
    enumerable: true,
    get: () => 0,
  });
  return hostile;
}
