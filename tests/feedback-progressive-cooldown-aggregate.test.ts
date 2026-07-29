import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  FEEDBACK_PROGRESSIVE_COOLDOWN_LADDER_MS,
  FEEDBACK_PROGRESSIVE_COOLDOWN_MAX_RESERVATIONS,
  FEEDBACK_PROGRESSIVE_COOLDOWN_RESERVATION_LEASE_MS,
  FEEDBACK_PROGRESSIVE_COOLDOWN_RETENTION_MS,
  FEEDBACK_PROGRESSIVE_COOLDOWN_RESET_MS,
  FeedbackReservationState,
  feedbackProgressiveCooldownAggregateEntitySchema,
  type FeedbackProgressiveCooldownAggregateEntity,
  type FeedbackProgressiveCooldownReservationRecord,
} from "../src/index.js";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const BASE_MS = Date.parse("2026-07-18T10:05:00.000Z");
const stateId = `fbs1.${"A".repeat(43)}`;
const reservationId = `fbr1.${"A".repeat(22)}`;
const secondReservationId = `fbr1.${"B".repeat(21)}Q`;
const idempotencyDigest = "E".repeat(43);
const secondIdempotencyDigest = "I".repeat(43);

function canonicalToken(byteLength: 16 | 32, index: number): string {
  const bytes = Buffer.alloc(byteLength);
  bytes.writeUInt32BE(index, byteLength - 4);
  return bytes.toString("base64url");
}

function ttlSeconds(writtenAtMs: number, purgeAfterMs: number): number {
  return Math.max(0, Math.floor((purgeAfterMs - writtenAtMs) / 1_000));
}

function reservedRecord(
  override: Partial<FeedbackProgressiveCooldownReservationRecord> = {},
): FeedbackProgressiveCooldownReservationRecord {
  const reservedAtMs = override.reservedAtMs ?? BASE_MS;
  const leaseExpiresAtMs =
    reservedAtMs + FEEDBACK_PROGRESSIVE_COOLDOWN_RESERVATION_LEASE_MS;
  return {
    reservationId,
    idempotencyDigest,
    status: FeedbackReservationState.RESERVED,
    reservedAtMs,
    leaseExpiresAtMs,
    retainUntilMs:
      leaseExpiresAtMs + FEEDBACK_PROGRESSIVE_COOLDOWN_RETENTION_MS,
    ...override,
  };
}

function aggregate(
  override: Partial<FeedbackProgressiveCooldownAggregateEntity> = {},
): FeedbackProgressiveCooldownAggregateEntity {
  const writtenAtMs = override.writtenAtMs ?? BASE_MS;
  const reservations = override.state?.reservations ?? [reservedRecord()];
  const purgeAfterMs =
    override.state?.purgeAfterMs ??
    Math.max(...reservations.map((record) => record.retainUntilMs));

  return {
    type: "feedbackProgressiveCooldownAggregateEntity",
    version: "1.0.0",
    stateId,
    writtenAtMs,
    ttlSeconds: ttlSeconds(writtenAtMs, purgeAfterMs),
    revision: 0,
    state: {
      schemaVersion: "1",
      streak: 0,
      reservations,
      purgeAfterMs,
      ...override.state,
    },
    ...override,
  };
}

function releasedAggregate(
  existing = aggregate(),
  releasedAtMs = BASE_MS + MINUTE_MS,
): FeedbackProgressiveCooldownAggregateEntity {
  const source = existing.state.reservations[0];
  if (!source) throw new Error("Synthetic fixture is missing a reservation.");
  const released: FeedbackProgressiveCooldownReservationRecord = {
    reservationId: source.reservationId,
    idempotencyDigest: source.idempotencyDigest,
    status: FeedbackReservationState.RELEASED,
    reservedAtMs: source.reservedAtMs,
    leaseExpiresAtMs: source.leaseExpiresAtMs,
    releasedAtMs,
    retainUntilMs:
      releasedAtMs + FEEDBACK_PROGRESSIVE_COOLDOWN_RETENTION_MS,
  };
  const purgeAfterMs = released.retainUntilMs;

  return aggregate({
    writtenAtMs: releasedAtMs,
    ttlSeconds: ttlSeconds(releasedAtMs, purgeAfterMs),
    revision: existing.revision + 1,
    state: {
      schemaVersion: "1",
      streak: 0,
      reservations: [released],
      purgeAfterMs,
    },
  });
}

function committedAggregate(
  existing: FeedbackProgressiveCooldownAggregateEntity,
  committedAtMs: number,
): FeedbackProgressiveCooldownAggregateEntity {
  const source = existing.state.reservations[0];
  if (!source) throw new Error("Synthetic fixture is missing a reservation.");
  const committedStreak = 1;
  const cooldownDurationMs =
    FEEDBACK_PROGRESSIVE_COOLDOWN_LADDER_MS[committedStreak - 1];
  if (cooldownDurationMs === undefined) {
    throw new Error("Synthetic cooldown step is missing.");
  }
  const cooldownUntilMs = committedAtMs + cooldownDurationMs;
  const committed: FeedbackProgressiveCooldownReservationRecord = {
    reservationId: source.reservationId,
    idempotencyDigest: source.idempotencyDigest,
    status: FeedbackReservationState.COMMITTED,
    reservedAtMs: source.reservedAtMs,
    leaseExpiresAtMs: source.leaseExpiresAtMs,
    committedAtMs,
    committedStreak,
    cooldownDurationMs,
    cooldownUntilMs,
    retainUntilMs:
      committedAtMs +
      FEEDBACK_PROGRESSIVE_COOLDOWN_RESET_MS +
      FEEDBACK_PROGRESSIVE_COOLDOWN_RETENTION_MS,
  };
  const purgeAfterMs = committed.retainUntilMs;

  return aggregate({
    writtenAtMs: committedAtMs,
    ttlSeconds: ttlSeconds(committedAtMs, purgeAfterMs),
    revision: existing.revision + 1,
    state: {
      schemaVersion: "1",
      streak: committedStreak,
      lastCommittedAtMs: committedAtMs,
      cooldownUntilMs,
      reservations: [committed],
      purgeAfterMs,
    },
  });
}

function addedReservationAggregate(
  existing: FeedbackProgressiveCooldownAggregateEntity,
  reservedAtMs: number,
  index: number,
): FeedbackProgressiveCooldownAggregateEntity {
  const reset =
    existing.state.lastCommittedAtMs !== undefined &&
    reservedAtMs - existing.state.lastCommittedAtMs >=
      FEEDBACK_PROGRESSIVE_COOLDOWN_RESET_MS;
  const nextRecord = reservedRecord({
    reservationId: `fbr1.${canonicalToken(16, index)}`,
    idempotencyDigest: canonicalToken(32, index),
    reservedAtMs,
    leaseExpiresAtMs:
      reservedAtMs + FEEDBACK_PROGRESSIVE_COOLDOWN_RESERVATION_LEASE_MS,
    retainUntilMs:
      reservedAtMs +
      FEEDBACK_PROGRESSIVE_COOLDOWN_RESERVATION_LEASE_MS +
      FEEDBACK_PROGRESSIVE_COOLDOWN_RETENTION_MS,
  });
  const reservations = [
    ...existing.state.reservations.filter(
      (record) => record.retainUntilMs > reservedAtMs,
    ),
    nextRecord,
  ];
  const lastCommittedAtMs = reset
    ? undefined
    : existing.state.lastCommittedAtMs;
  const cooldownUntilMs = reset
    ? undefined
    : existing.state.cooldownUntilMs;
  const purgeAfterMs = Math.max(
    reservedAtMs,
    ...reservations.map((record) => record.retainUntilMs),
    ...(lastCommittedAtMs === undefined
      ? []
      : [
          lastCommittedAtMs +
            FEEDBACK_PROGRESSIVE_COOLDOWN_RESET_MS +
            FEEDBACK_PROGRESSIVE_COOLDOWN_RETENTION_MS,
        ]),
    ...(cooldownUntilMs === undefined
      ? []
      : [
          cooldownUntilMs +
            FEEDBACK_PROGRESSIVE_COOLDOWN_RETENTION_MS,
        ]),
  );

  return aggregate({
    writtenAtMs: reservedAtMs,
    ttlSeconds: ttlSeconds(reservedAtMs, purgeAfterMs),
    revision: existing.revision + 1,
    state: {
      schemaVersion: "1",
      streak: reset ? 0 : existing.state.streak,
      ...(lastCommittedAtMs === undefined ? {} : { lastCommittedAtMs }),
      ...(cooldownUntilMs === undefined ? {} : { cooldownUntilMs }),
      reservations,
      purgeAfterMs,
    },
  });
}

describe("feedback progressive-cooldown aggregate", () => {
  it("publishes the exact default policy shared with @plasius/api", () => {
    expect(FEEDBACK_PROGRESSIVE_COOLDOWN_LADDER_MS).toEqual([
      5 * MINUTE_MS,
      15 * MINUTE_MS,
      HOUR_MS,
      6 * HOUR_MS,
      DAY_MS,
    ]);
    expect(FEEDBACK_PROGRESSIVE_COOLDOWN_RESERVATION_LEASE_MS).toBe(
      5 * MINUTE_MS,
    );
    expect(FEEDBACK_PROGRESSIVE_COOLDOWN_RETENTION_MS).toBe(7 * DAY_MS);
    expect(FEEDBACK_PROGRESSIVE_COOLDOWN_RESET_MS).toBe(48 * HOUR_MS);
    expect(FEEDBACK_PROGRESSIVE_COOLDOWN_MAX_RESERVATIONS).toBe(64);
  });

  it("validates the wire-exact state in one isolated CAS row", () => {
    const value = aggregate();
    const result =
      feedbackProgressiveCooldownAggregateEntitySchema.validate(value);

    expect(result.valid).toBe(true);
    expect(result.value?.state).toEqual(value.state);
    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.serialize(value, {
        includeInternal: true,
      }).state,
    ).toEqual(value.state);
    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.tableName?.(),
    ).toBe("feedbackControl");
    expect(result.value).not.toHaveProperty("packetId");
  });

  it("supports reserve to release to late commit reconciliation", () => {
    const reserved = aggregate();
    const released = releasedAggregate(reserved);
    const lateCommit = committedAggregate(
      released,
      BASE_MS + FEEDBACK_PROGRESSIVE_COOLDOWN_RESERVATION_LEASE_MS + MINUTE_MS,
    );

    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate(
        released,
        reserved,
      ).valid,
    ).toBe(true);
    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate(
        lateCommit,
        released,
      ).valid,
    ).toBe(true);
  });

  it("validates every ladder step and the 24-hour cap", () => {
    const records: FeedbackProgressiveCooldownReservationRecord[] = [];
    let committedAtMs = BASE_MS + MINUTE_MS;
    for (let index = 0; index < 6; index += 1) {
      const committedStreak = Math.min(
        index + 1,
        FEEDBACK_PROGRESSIVE_COOLDOWN_LADDER_MS.length,
      );
      const cooldownDurationMs =
        FEEDBACK_PROGRESSIVE_COOLDOWN_LADDER_MS[committedStreak - 1];
      if (cooldownDurationMs === undefined) {
        throw new Error("Synthetic cooldown step is missing.");
      }
      const reservedAtMs = committedAtMs - 1;
      records.push({
        reservationId: `fbr1.${canonicalToken(16, index + 1)}`,
        idempotencyDigest: canonicalToken(32, index + 1),
        status: FeedbackReservationState.COMMITTED,
        reservedAtMs,
        leaseExpiresAtMs:
          reservedAtMs +
          FEEDBACK_PROGRESSIVE_COOLDOWN_RESERVATION_LEASE_MS,
        committedAtMs,
        committedStreak,
        cooldownDurationMs,
        cooldownUntilMs: committedAtMs + cooldownDurationMs,
        retainUntilMs:
          committedAtMs +
          FEEDBACK_PROGRESSIVE_COOLDOWN_RESET_MS +
          FEEDBACK_PROGRESSIVE_COOLDOWN_RETENTION_MS,
      });
      committedAtMs += cooldownDurationMs;
    }
    const latest = records.at(-1);
    if (
      latest?.committedAtMs === undefined ||
      latest.cooldownUntilMs === undefined ||
      latest.committedStreak === undefined
    ) {
      throw new Error("Synthetic latest commit is missing.");
    }
    const purgeAfterMs = Math.max(
      ...records.map((record) => record.retainUntilMs),
      latest.cooldownUntilMs + FEEDBACK_PROGRESSIVE_COOLDOWN_RETENTION_MS,
    );
    const value = aggregate({
      writtenAtMs: latest.committedAtMs,
      ttlSeconds: ttlSeconds(latest.committedAtMs, purgeAfterMs),
      state: {
        schemaVersion: "1",
        streak: latest.committedStreak,
        lastCommittedAtMs: latest.committedAtMs,
        cooldownUntilMs: latest.cooldownUntilMs,
        reservations: records,
        purgeAfterMs,
      },
    });

    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate(value).valid,
    ).toBe(true);
    expect(latest.committedStreak).toBe(5);
    expect(latest.cooldownDurationMs).toBe(DAY_MS);
  });

  it("permits a new reservation only after active leases and cooldowns end", () => {
    const reserved = aggregate();
    const whileLeaseActive = addedReservationAggregate(
      reserved,
      BASE_MS + MINUTE_MS,
      20,
    );
    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate(
        whileLeaseActive,
        reserved,
      ).valid,
    ).toBe(false);

    const committed = committedAggregate(
      reserved,
      BASE_MS + MINUTE_MS,
    );
    const duringCooldown = addedReservationAggregate(
      committed,
      (committed.state.lastCommittedAtMs ?? 0) + MINUTE_MS,
      21,
    );
    const atCooldownBoundary = addedReservationAggregate(
      committed,
      committed.state.cooldownUntilMs ?? 0,
      22,
    );

    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate(
        duringCooldown,
        committed,
      ).valid,
    ).toBe(false);
    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate(
        atCooldownBoundary,
        committed,
      ).valid,
    ).toBe(true);
  });

  it("accepts an exact replay but rejects stale or skipped CAS revisions", () => {
    const reserved = aggregate();
    const released = releasedAggregate(reserved);

    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate(
        structuredClone(released),
        released,
      ).valid,
    ).toBe(true);
    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate(
        { ...released, revision: released.revision - 1 },
        reserved,
      ).valid,
    ).toBe(false);
    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate(
        { ...released, revision: released.revision + 1 },
        reserved,
      ).valid,
    ).toBe(false);
  });

  it("treats reservation-array order as non-semantic on replay", () => {
    const writtenAtMs = BASE_MS + 2 * MINUTE_MS;
    const records: FeedbackProgressiveCooldownReservationRecord[] = [
      {
        ...reservedRecord(),
        status: FeedbackReservationState.RELEASED,
        releasedAtMs: BASE_MS + MINUTE_MS,
        retainUntilMs:
          BASE_MS +
          MINUTE_MS +
          FEEDBACK_PROGRESSIVE_COOLDOWN_RETENTION_MS,
      },
      {
        ...reservedRecord({
          reservationId: secondReservationId,
          idempotencyDigest: secondIdempotencyDigest,
          reservedAtMs: BASE_MS + 1,
          leaseExpiresAtMs:
            BASE_MS +
            1 +
            FEEDBACK_PROGRESSIVE_COOLDOWN_RESERVATION_LEASE_MS,
        }),
        status: FeedbackReservationState.RELEASED,
        releasedAtMs: BASE_MS + MINUTE_MS + 1,
        retainUntilMs:
          BASE_MS +
          MINUTE_MS +
          1 +
          FEEDBACK_PROGRESSIVE_COOLDOWN_RETENTION_MS,
      },
    ];
    const purgeAfterMs = Math.max(
      ...records.map((record) => record.retainUntilMs),
    );
    const original = aggregate({
      writtenAtMs,
      ttlSeconds: ttlSeconds(writtenAtMs, purgeAfterMs),
      state: {
        schemaVersion: "1",
        streak: 0,
        reservations: records,
        purgeAfterMs,
      },
    });
    const reordered = {
      ...structuredClone(original),
      state: {
        ...structuredClone(original.state),
        reservations: [...original.state.reservations].reverse(),
      },
    };

    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate(
        reordered,
        original,
      ).valid,
    ).toBe(true);
  });

  it("rejects duplicate reservation IDs and idempotency digests", () => {
    const first = reservedRecord();
    const duplicateId = reservedRecord({
      idempotencyDigest: secondIdempotencyDigest,
    });
    const duplicateDigest = reservedRecord({
      reservationId: secondReservationId,
    });

    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate(
        aggregate({
          state: {
            schemaVersion: "1",
            streak: 0,
            reservations: [first, duplicateId],
            purgeAfterMs: first.retainUntilMs,
          },
        }),
      ).valid,
    ).toBe(false);
    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate(
        aggregate({
          state: {
            schemaVersion: "1",
            streak: 0,
            reservations: [first, duplicateDigest],
            purgeAfterMs: first.retainUntilMs,
          },
        }),
      ).valid,
    ).toBe(false);
  });

  it("rejects non-canonical identifiers, aliases, and unknown join fields", () => {
    const value = aggregate();
    const record = value.state.reservations[0];
    if (!record) throw new Error("Synthetic fixture is missing a reservation.");

    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate({
        ...value,
        stateId: `fbs1.${"A".repeat(42)}B`,
      }).valid,
    ).toBe(false);
    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate({
        ...value,
        state: {
          ...value.state,
          reservations: [
            {
              ...record,
              reservationId: `fbr1.${"A".repeat(21)}B`,
            },
          ],
        },
      }).valid,
    ).toBe(false);
    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate({
        ...value,
        packetId: "018f7462-2152-49f3-a4dd-a58325c44b60",
      }).valid,
    ).toBe(false);
    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate({
        ...value,
        state: { ...value.state, accountId: "synthetic-account" },
      }).valid,
    ).toBe(false);
    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate({
        ...value,
        state: {
          ...value.state,
          reservations: [{ ...record, narrative: "synthetic narrative" }],
        },
      }).valid,
    ).toBe(false);
  });

  it("rejects sparse, accessor-bearing, and over-capacity reservation arrays", () => {
    const sparse = [reservedRecord()];
    sparse.length = 2;
    const accessorRecord = {
      ...reservedRecord(),
      get packetId() {
        throw new Error("Unsafe accessor must not be evaluated.");
      },
    };
    const overCapacityWrittenAt = BASE_MS + 2 * MINUTE_MS;
    const overCapacity = Array.from(
      { length: FEEDBACK_PROGRESSIVE_COOLDOWN_MAX_RESERVATIONS + 1 },
      (_, index): FeedbackProgressiveCooldownReservationRecord => {
        const releasedAtMs = BASE_MS + MINUTE_MS + index;
        return {
          ...reservedRecord({
            reservationId: `fbr1.${canonicalToken(16, index + 100)}`,
            idempotencyDigest: canonicalToken(32, index + 100),
          }),
          status: FeedbackReservationState.RELEASED,
          releasedAtMs,
          retainUntilMs:
            releasedAtMs + FEEDBACK_PROGRESSIVE_COOLDOWN_RETENTION_MS,
        };
      },
    );
    const overCapacityPurge = Math.max(
      ...overCapacity.map((record) => record.retainUntilMs),
    );

    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate(
        aggregate({
          state: {
            schemaVersion: "1",
            streak: 0,
            reservations: sparse,
            purgeAfterMs: reservedRecord().retainUntilMs,
          },
        }),
      ).valid,
    ).toBe(false);
    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate(
        aggregate({
          state: {
            schemaVersion: "1",
            streak: 0,
            reservations: [accessorRecord],
            purgeAfterMs: reservedRecord().retainUntilMs,
          },
        }),
      ).valid,
    ).toBe(false);
    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate(
        aggregate({
          writtenAtMs: overCapacityWrittenAt,
          ttlSeconds: ttlSeconds(
            overCapacityWrittenAt,
            overCapacityPurge,
          ),
          state: {
            schemaVersion: "1",
            streak: 0,
            reservations: overCapacity,
            purgeAfterMs: overCapacityPurge,
          },
        }),
      ).valid,
    ).toBe(false);
  });

  it("rejects corrupt reservation and aggregate timelines", () => {
    const reserved = aggregate();
    const committed = committedAggregate(reserved, BASE_MS + MINUTE_MS);
    const record = committed.state.reservations[0];
    if (!record) throw new Error("Synthetic fixture is missing a reservation.");

    const candidates = [
      {
        ...committed,
        state: {
          ...committed.state,
          cooldownUntilMs: committed.state.lastCommittedAtMs,
        },
      },
      {
        ...committed,
        state: {
          ...committed.state,
          reservations: [
            {
              ...record,
              leaseExpiresAtMs:
                record.reservedAtMs +
                FEEDBACK_PROGRESSIVE_COOLDOWN_RESERVATION_LEASE_MS +
                1,
            },
          ],
        },
      },
      {
        ...committed,
        state: {
          ...committed.state,
          reservations: [
            {
              ...record,
              committedAtMs: committed.writtenAtMs + 1,
            },
          ],
        },
      },
      {
        ...committed,
        state: { ...committed.state, streak: 5 },
      },
    ];

    for (const candidate of candidates) {
      expect(
        feedbackProgressiveCooldownAggregateEntitySchema.validate(candidate)
          .valid,
      ).toBe(false);
    }
  });

  it("requires the exact seven-day retention, purge deadline, and row TTL", () => {
    const value = aggregate();
    const record = value.state.reservations[0];
    if (!record) throw new Error("Synthetic fixture is missing a reservation.");

    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate({
        ...value,
        state: {
          ...value.state,
          reservations: [
            {
              ...record,
              retainUntilMs: record.retainUntilMs + 1,
            },
          ],
        },
      }).valid,
    ).toBe(false);
    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate({
        ...value,
        state: { ...value.state, purgeAfterMs: value.state.purgeAfterMs + 1 },
      }).valid,
    ).toBe(false);
    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate({
        ...value,
        ttlSeconds: value.ttlSeconds + 1,
      }).valid,
    ).toBe(false);
    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate({
        ...value,
        writtenAtMs: Number.MAX_SAFE_INTEGER,
      }).valid,
    ).toBe(false);
  });

  it("uses zero TTL for an aggregate pruned exactly at hard deletion", () => {
    const existing = aggregate();
    const hardDeleteAtMs = existing.state.reservations[0]?.retainUntilMs;
    if (hardDeleteAtMs === undefined) {
      throw new Error("Synthetic hard-delete deadline is missing.");
    }
    const pruned: FeedbackProgressiveCooldownAggregateEntity = {
      type: "feedbackProgressiveCooldownAggregateEntity",
      version: "1.0.0",
      stateId,
      writtenAtMs: hardDeleteAtMs,
      ttlSeconds: 0,
      revision: existing.revision + 1,
      state: {
        schemaVersion: "1",
        streak: 0,
        reservations: [],
        purgeAfterMs: hardDeleteAtMs,
      },
    };

    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate(
        pruned,
        existing,
      ).valid,
    ).toBe(true);
    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate({
        ...pruned,
        ttlSeconds: 1,
      }).valid,
    ).toBe(false);
  });

  it("allows pruning only after retention and resets only after 48 quiet hours", () => {
    const committed = committedAggregate(aggregate(), BASE_MS + MINUTE_MS);
    const beforeReset = aggregate({
      writtenAtMs:
        (committed.state.lastCommittedAtMs ?? 0) +
        FEEDBACK_PROGRESSIVE_COOLDOWN_RESET_MS -
        1,
      ttlSeconds: committed.ttlSeconds,
      revision: committed.revision + 1,
      state: { ...committed.state, streak: 0 },
    });
    const resetAt =
      (committed.state.lastCommittedAtMs ?? 0) +
      FEEDBACK_PROGRESSIVE_COOLDOWN_RESET_MS;
    const resetRecord = reservedRecord({
      reservationId: secondReservationId,
      idempotencyDigest: secondIdempotencyDigest,
      reservedAtMs: resetAt,
      leaseExpiresAtMs:
        resetAt + FEEDBACK_PROGRESSIVE_COOLDOWN_RESERVATION_LEASE_MS,
      retainUntilMs:
        resetAt +
        FEEDBACK_PROGRESSIVE_COOLDOWN_RESERVATION_LEASE_MS +
        FEEDBACK_PROGRESSIVE_COOLDOWN_RETENTION_MS,
    });
    const resetPurge = Math.max(
      committed.state.purgeAfterMs,
      resetRecord.retainUntilMs,
    );
    const afterReset = aggregate({
      writtenAtMs: resetAt,
      ttlSeconds: ttlSeconds(resetAt, resetPurge),
      revision: committed.revision + 1,
      state: {
        schemaVersion: "1",
        streak: 0,
        reservations: [
          ...committed.state.reservations,
          resetRecord,
        ],
        purgeAfterMs: resetPurge,
      },
    });

    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate(
        beforeReset,
        committed,
      ).valid,
    ).toBe(false);
    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate(
        afterReset,
        committed,
      ).valid,
    ).toBe(true);

    const prematurePrune = {
      ...afterReset,
      revision: afterReset.revision + 1,
      state: {
        ...afterReset.state,
        reservations: [resetRecord],
        purgeAfterMs: resetRecord.retainUntilMs,
      },
    };
    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate(
        prematurePrune,
        afterReset,
      ).valid,
    ).toBe(false);

    const committedRetentionEnds =
      committed.state.reservations[0]?.retainUntilMs;
    if (committedRetentionEnds === undefined) {
      throw new Error("Synthetic committed retention is missing.");
    }
    const validPrunePurge = resetRecord.retainUntilMs;
    const validPrune = {
      ...afterReset,
      writtenAtMs: committedRetentionEnds,
      ttlSeconds: ttlSeconds(committedRetentionEnds, validPrunePurge),
      revision: afterReset.revision + 1,
      state: {
        ...afterReset.state,
        reservations: [resetRecord],
        purgeAfterMs: validPrunePurge,
      },
    };
    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate(
        validPrune,
        afterReset,
      ).valid,
    ).toBe(true);
  });

  it("does not serialize or log reporter control identifiers", () => {
    const value = aggregate();
    const serialized =
      feedbackProgressiveCooldownAggregateEntitySchema.serialize(value);
    const sanitized =
      feedbackProgressiveCooldownAggregateEntitySchema.sanitizeForLog(
        value,
        () => "must-not-be-used",
      );

    expect(serialized).toEqual({
      type: "feedbackProgressiveCooldownAggregateEntity",
      version: "1.0.0",
    });
    expect(sanitized.stateId).toBe("[REDACTED]");
    expect(sanitized.state).toBe("[REDACTED]");
    expect(JSON.stringify(sanitized)).not.toContain(stateId);
    expect(JSON.stringify(sanitized)).not.toContain(reservationId);
    expect(JSON.stringify(sanitized)).not.toContain(idempotencyDigest);
  });
});
