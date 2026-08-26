import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  FEEDBACK_PROGRESSIVE_COOLDOWN_LADDER_MS,
  FEEDBACK_PROGRESSIVE_COOLDOWN_MAX_RESERVATIONS,
  FEEDBACK_PROGRESSIVE_COOLDOWN_PURGE_SAFETY_MS,
  FEEDBACK_PROGRESSIVE_COOLDOWN_RESERVATION_LEASE_MS,
  FEEDBACK_PROGRESSIVE_COOLDOWN_RECONCILIATION_MS,
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
const attemptTokenDigest = "M".repeat(43);
const secondAttemptTokenDigest = "Q".repeat(43);

function canonicalToken(byteLength: 16 | 32, index: number): string {
  const bytes = Buffer.alloc(byteLength);
  bytes.writeUInt32BE(index, byteLength - 4);
  return bytes.toString("base64url");
}

function ttlSeconds(writtenAtMs: number, hardDeleteByMs: number): number {
  return Math.max(
    0,
    Math.floor(
      (hardDeleteByMs -
        writtenAtMs -
        FEEDBACK_PROGRESSIVE_COOLDOWN_PURGE_SAFETY_MS) /
        1_000,
    ),
  );
}

function hardDeleteBy(
  writtenAtMs: number,
  ...reconciliationHorizonsMs: readonly number[]
): number {
  return (
    Math.max(writtenAtMs, ...reconciliationHorizonsMs) +
    FEEDBACK_PROGRESSIVE_COOLDOWN_PURGE_SAFETY_MS
  );
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
    reconciliationUntilMs:
      leaseExpiresAtMs + FEEDBACK_PROGRESSIVE_COOLDOWN_RECONCILIATION_MS,
    attemptGeneration: 1,
    attemptTokenDigest,
    ...override,
  };
}

function aggregate(
  override: Partial<FeedbackProgressiveCooldownAggregateEntity> = {},
): FeedbackProgressiveCooldownAggregateEntity {
  const writtenAtMs = override.writtenAtMs ?? BASE_MS;
  const reservations = override.state?.reservations ?? [reservedRecord()];
  const hardDeleteByMs =
    override.state?.hardDeleteByMs ??
    hardDeleteBy(
      writtenAtMs,
      ...reservations.map((record) => record.reconciliationUntilMs),
    );

  return {
    type: "feedbackProgressiveCooldownAggregateEntity",
    version: "1.0.0",
    stateId,
    writtenAtMs,
    ttlSeconds: ttlSeconds(writtenAtMs, hardDeleteByMs),
    revision: 0,
    state: {
      schemaVersion: "1",
      streak: 0,
      reservations,
      hardDeleteByMs,
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
    ...(source.attemptGeneration === undefined
      ? {}
      : { attemptGeneration: source.attemptGeneration }),
    ...(source.attemptTokenDigest === undefined
      ? {}
      : { attemptTokenDigest: source.attemptTokenDigest }),
    releasedAtMs,
    reconciliationUntilMs:
      releasedAtMs + FEEDBACK_PROGRESSIVE_COOLDOWN_RECONCILIATION_MS,
  };
  const hardDeleteByMs = hardDeleteBy(
    releasedAtMs,
    released.reconciliationUntilMs,
  );

  return aggregate({
    writtenAtMs: releasedAtMs,
    ttlSeconds: ttlSeconds(releasedAtMs, hardDeleteByMs),
    revision: existing.revision + 1,
    state: {
      schemaVersion: "1",
      streak: 0,
      reservations: [released],
      hardDeleteByMs,
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
  const cooldownUntilMs = source.reservedAtMs + cooldownDurationMs;
  const committed: FeedbackProgressiveCooldownReservationRecord = {
    reservationId: source.reservationId,
    idempotencyDigest: source.idempotencyDigest,
    status: FeedbackReservationState.COMMITTED,
    reservedAtMs: source.reservedAtMs,
    leaseExpiresAtMs: source.leaseExpiresAtMs,
    ...(source.attemptGeneration === undefined
      ? {}
      : { attemptGeneration: source.attemptGeneration }),
    ...(source.attemptTokenDigest === undefined
      ? {}
      : { attemptTokenDigest: source.attemptTokenDigest }),
    ...(source.writeStartedAtMs === undefined
      ? {}
      : { writeStartedAtMs: source.writeStartedAtMs }),
    committedAtMs,
    committedStreak,
    cooldownDurationMs,
    cooldownUntilMs,
    reconciliationUntilMs:
      committedAtMs +
      FEEDBACK_PROGRESSIVE_COOLDOWN_RESET_MS +
      FEEDBACK_PROGRESSIVE_COOLDOWN_RECONCILIATION_MS,
  };
  const hardDeleteByMs = hardDeleteBy(
    committedAtMs,
    committed.reconciliationUntilMs,
  );

  return aggregate({
    writtenAtMs: committedAtMs,
    ttlSeconds: ttlSeconds(committedAtMs, hardDeleteByMs),
    revision: existing.revision + 1,
    state: {
      schemaVersion: "1",
      streak: committedStreak,
      lastCommittedAtMs: committedAtMs,
      cooldownUntilMs,
      reservations: [committed],
      hardDeleteByMs,
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
    attemptTokenDigest: canonicalToken(32, 10_000 + index),
    reservedAtMs,
    leaseExpiresAtMs:
      reservedAtMs + FEEDBACK_PROGRESSIVE_COOLDOWN_RESERVATION_LEASE_MS,
    reconciliationUntilMs:
      reservedAtMs +
      FEEDBACK_PROGRESSIVE_COOLDOWN_RESERVATION_LEASE_MS +
      FEEDBACK_PROGRESSIVE_COOLDOWN_RECONCILIATION_MS,
  });
  const reservations = [
    ...existing.state.reservations.filter(
      (record) => record.reconciliationUntilMs > reservedAtMs,
    ),
    nextRecord,
  ];
  const lastCommittedAtMs = reset
    ? undefined
    : existing.state.lastCommittedAtMs;
  const cooldownUntilMs = reset
    ? undefined
    : existing.state.cooldownUntilMs;
  const hardDeleteByMs = hardDeleteBy(
    reservedAtMs,
    ...reservations.map((record) => record.reconciliationUntilMs),
    ...(lastCommittedAtMs === undefined
      ? []
      : [
          lastCommittedAtMs +
            FEEDBACK_PROGRESSIVE_COOLDOWN_RESET_MS +
            FEEDBACK_PROGRESSIVE_COOLDOWN_RECONCILIATION_MS,
        ]),
    ...(cooldownUntilMs === undefined
      ? []
      : [
          cooldownUntilMs +
            FEEDBACK_PROGRESSIVE_COOLDOWN_RECONCILIATION_MS,
        ]),
  );

  return aggregate({
    writtenAtMs: reservedAtMs,
    ttlSeconds: ttlSeconds(reservedAtMs, hardDeleteByMs),
    revision: existing.revision + 1,
    state: {
      schemaVersion: "1",
      streak: reset ? 0 : existing.state.streak,
      ...(lastCommittedAtMs === undefined ? {} : { lastCommittedAtMs }),
      ...(cooldownUntilMs === undefined ? {} : { cooldownUntilMs }),
      reservations,
      hardDeleteByMs,
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
    expect(FEEDBACK_PROGRESSIVE_COOLDOWN_RECONCILIATION_MS).toBe(6 * DAY_MS);
    expect(FEEDBACK_PROGRESSIVE_COOLDOWN_PURGE_SAFETY_MS).toBe(DAY_MS);
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

  it("orders late commits without regressing a newer acceptance cooldown", () => {
    const firstReleasedAtMs = BASE_MS + MINUTE_MS;
    const secondReleasedAtMs = firstReleasedAtMs + 1;
    const firstReleased: FeedbackProgressiveCooldownReservationRecord = {
      ...reservedRecord(),
      status: FeedbackReservationState.RELEASED,
      releasedAtMs: firstReleasedAtMs,
      reconciliationUntilMs:
        firstReleasedAtMs + FEEDBACK_PROGRESSIVE_COOLDOWN_RECONCILIATION_MS,
    };
    const secondReleased: FeedbackProgressiveCooldownReservationRecord = {
      ...reservedRecord({
        reservationId: secondReservationId,
        idempotencyDigest: secondIdempotencyDigest,
        attemptTokenDigest: secondAttemptTokenDigest,
        reservedAtMs: BASE_MS - 11 * MINUTE_MS,
        leaseExpiresAtMs:
          BASE_MS -
          11 * MINUTE_MS +
          FEEDBACK_PROGRESSIVE_COOLDOWN_RESERVATION_LEASE_MS,
      }),
      status: FeedbackReservationState.RELEASED,
      releasedAtMs: secondReleasedAtMs,
      reconciliationUntilMs:
        secondReleasedAtMs + FEEDBACK_PROGRESSIVE_COOLDOWN_RECONCILIATION_MS,
    };
    const releasedWrittenAtMs = BASE_MS + 2 * MINUTE_MS;
    const releasedHardDeleteByMs = hardDeleteBy(
      releasedWrittenAtMs,
      firstReleased.reconciliationUntilMs,
      secondReleased.reconciliationUntilMs,
    );
    const released = aggregate({
      writtenAtMs: releasedWrittenAtMs,
      ttlSeconds: ttlSeconds(
        releasedWrittenAtMs,
        releasedHardDeleteByMs,
      ),
      state: {
        schemaVersion: "1",
        streak: 0,
        reservations: [firstReleased, secondReleased],
        hardDeleteByMs: releasedHardDeleteByMs,
      },
    });

    const committedAtMs = BASE_MS + 3 * MINUTE_MS;
    const commitRecord = (
      source: FeedbackProgressiveCooldownReservationRecord,
      committedStreak: number,
    ): FeedbackProgressiveCooldownReservationRecord => {
      const cooldownDurationMs =
        FEEDBACK_PROGRESSIVE_COOLDOWN_LADDER_MS[committedStreak - 1];
      if (cooldownDurationMs === undefined) {
        throw new Error("Synthetic cooldown step is missing.");
      }
      return {
        reservationId: source.reservationId,
        idempotencyDigest: source.idempotencyDigest,
        status: FeedbackReservationState.COMMITTED,
        reservedAtMs: source.reservedAtMs,
        leaseExpiresAtMs: source.leaseExpiresAtMs,
        ...(source.attemptGeneration === undefined
          ? {}
          : { attemptGeneration: source.attemptGeneration }),
        ...(source.attemptTokenDigest === undefined
          ? {}
          : { attemptTokenDigest: source.attemptTokenDigest }),
        ...(source.writeStartedAtMs === undefined
          ? {}
          : { writeStartedAtMs: source.writeStartedAtMs }),
        committedAtMs,
        committedStreak,
        cooldownDurationMs,
        cooldownUntilMs: source.reservedAtMs + cooldownDurationMs,
        reconciliationUntilMs:
          committedAtMs +
          FEEDBACK_PROGRESSIVE_COOLDOWN_RESET_MS +
          FEEDBACK_PROGRESSIVE_COOLDOWN_RECONCILIATION_MS,
      };
    };
    const firstCommitted = commitRecord(firstReleased, 1);
    const commitHardDeleteByMs = hardDeleteBy(
      committedAtMs,
      firstCommitted.reconciliationUntilMs,
    );
    const afterFirstCommit = aggregate({
      writtenAtMs: committedAtMs,
      ttlSeconds: ttlSeconds(committedAtMs, commitHardDeleteByMs),
      revision: released.revision + 1,
      state: {
        schemaVersion: "1",
        streak: 1,
        lastCommittedAtMs: committedAtMs,
        cooldownUntilMs: firstCommitted.cooldownUntilMs,
        reservations: [firstCommitted, secondReleased],
        hardDeleteByMs: commitHardDeleteByMs,
      },
    });
    const secondCommitted = commitRecord(secondReleased, 2);
    const afterSecondCommit = aggregate({
      writtenAtMs: committedAtMs,
      ttlSeconds: ttlSeconds(committedAtMs, commitHardDeleteByMs),
      revision: afterFirstCommit.revision + 1,
      state: {
        schemaVersion: "1",
        streak: 2,
        lastCommittedAtMs: committedAtMs,
        cooldownUntilMs: firstCommitted.cooldownUntilMs,
        reservations: [secondCommitted, firstCommitted],
        hardDeleteByMs: commitHardDeleteByMs,
      },
    });

    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate(
        afterFirstCommit,
        released,
      ).valid,
    ).toBe(true);
    expect(secondCommitted.cooldownUntilMs ?? 0).toBeLessThan(
      firstCommitted.cooldownUntilMs ?? 0,
    );
    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate(
        afterSecondCommit,
        afterFirstCommit,
      ).valid,
    ).toBe(true);
  });

  it("never transitions a reservation at or after reconciliation expiry", () => {
    const reserved = aggregate();
    const released = releasedAggregate(reserved);
    const cases = [
      {
        existing: reserved,
        transition: (
          value: FeedbackProgressiveCooldownAggregateEntity,
          writtenAtMs: number,
        ) => releasedAggregate(value, writtenAtMs),
      },
      {
        existing: reserved,
        transition: (
          value: FeedbackProgressiveCooldownAggregateEntity,
          writtenAtMs: number,
        ) => committedAggregate(value, writtenAtMs),
      },
      {
        existing: released,
        transition: (
          value: FeedbackProgressiveCooldownAggregateEntity,
          writtenAtMs: number,
        ) => committedAggregate(value, writtenAtMs),
      },
    ] as const;

    for (const { existing, transition } of cases) {
      const reconciliationBoundary =
        existing.state.reservations[0]?.reconciliationUntilMs;
      if (reconciliationBoundary === undefined) {
        throw new Error("Synthetic reconciliation boundary is missing.");
      }

      expect(
        feedbackProgressiveCooldownAggregateEntitySchema.validate(
          transition(existing, reconciliationBoundary - 1),
          existing,
        ).valid,
      ).toBe(true);
      expect(
        feedbackProgressiveCooldownAggregateEntitySchema.validate(
          transition(existing, reconciliationBoundary),
          existing,
        ).valid,
      ).toBe(false);
      expect(
        feedbackProgressiveCooldownAggregateEntitySchema.validate(
          transition(existing, reconciliationBoundary + 1),
          existing,
        ).valid,
      ).toBe(false);
    }
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
        cooldownUntilMs: reservedAtMs + cooldownDurationMs,
        reconciliationUntilMs:
          committedAtMs +
          FEEDBACK_PROGRESSIVE_COOLDOWN_RESET_MS +
          FEEDBACK_PROGRESSIVE_COOLDOWN_RECONCILIATION_MS,
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
    const hardDeleteByMs = hardDeleteBy(
      latest.committedAtMs,
      ...records.map((record) => record.reconciliationUntilMs),
      latest.cooldownUntilMs + FEEDBACK_PROGRESSIVE_COOLDOWN_RECONCILIATION_MS,
    );
    const value = aggregate({
      writtenAtMs: latest.committedAtMs,
      ttlSeconds: ttlSeconds(latest.committedAtMs, hardDeleteByMs),
      state: {
        schemaVersion: "1",
        streak: latest.committedStreak,
        lastCommittedAtMs: latest.committedAtMs,
        cooldownUntilMs: latest.cooldownUntilMs,
        reservations: records,
        hardDeleteByMs,
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

  it("rejects a replay when the stored row contains an unknown join field", () => {
    const released = releasedAggregate(aggregate());
    const corruptExisting = {
      ...structuredClone(released),
      accountId: "synthetic-account",
    };

    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate(
        structuredClone(released),
        corruptExisting,
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
        reconciliationUntilMs:
          BASE_MS +
          MINUTE_MS +
          FEEDBACK_PROGRESSIVE_COOLDOWN_RECONCILIATION_MS,
      },
      {
        ...reservedRecord({
          reservationId: secondReservationId,
          idempotencyDigest: secondIdempotencyDigest,
          attemptTokenDigest: secondAttemptTokenDigest,
          reservedAtMs: BASE_MS + 1,
          leaseExpiresAtMs:
            BASE_MS +
            1 +
            FEEDBACK_PROGRESSIVE_COOLDOWN_RESERVATION_LEASE_MS,
        }),
        status: FeedbackReservationState.RELEASED,
        releasedAtMs: BASE_MS + MINUTE_MS + 1,
        reconciliationUntilMs:
          BASE_MS +
          MINUTE_MS +
          1 +
          FEEDBACK_PROGRESSIVE_COOLDOWN_RECONCILIATION_MS,
      },
    ];
    const hardDeleteByMs = hardDeleteBy(
      writtenAtMs,
      ...records.map((record) => record.reconciliationUntilMs),
    );
    const original = aggregate({
      writtenAtMs,
      ttlSeconds: ttlSeconds(writtenAtMs, hardDeleteByMs),
      state: {
        schemaVersion: "1",
        streak: 0,
        reservations: records,
        hardDeleteByMs,
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
            hardDeleteByMs: hardDeleteBy(
              BASE_MS,
              first.reconciliationUntilMs,
            ),
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
            hardDeleteByMs: hardDeleteBy(
              BASE_MS,
              first.reconciliationUntilMs,
            ),
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
          reconciliationUntilMs:
            releasedAtMs + FEEDBACK_PROGRESSIVE_COOLDOWN_RECONCILIATION_MS,
        };
      },
    );
    const overCapacityHardDeleteByMs = hardDeleteBy(
      overCapacityWrittenAt,
      ...overCapacity.map((record) => record.reconciliationUntilMs),
    );

    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate(
        aggregate({
          state: {
            schemaVersion: "1",
            streak: 0,
            reservations: sparse,
            hardDeleteByMs: hardDeleteBy(
              BASE_MS,
              reservedRecord().reconciliationUntilMs,
            ),
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
            hardDeleteByMs: hardDeleteBy(
              BASE_MS,
              reservedRecord().reconciliationUntilMs,
            ),
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
            overCapacityHardDeleteByMs,
          ),
          state: {
            schemaVersion: "1",
            streak: 0,
            reservations: overCapacity,
            hardDeleteByMs: overCapacityHardDeleteByMs,
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

  it("requires exact reconciliation, hard purge, and safety-windowed TTL", () => {
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
              reconciliationUntilMs: record.reconciliationUntilMs + 1,
            },
          ],
        },
      }).valid,
    ).toBe(false);
    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate({
        ...value,
        state: { ...value.state, hardDeleteByMs: value.state.hardDeleteByMs + 1 },
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

  it("reserves a full day for explicit purge and bounded backup expiry", () => {
    const value = aggregate();
    const expectedExpiryAtMs =
      value.writtenAtMs + value.ttlSeconds * 1_000;

    expect(expectedExpiryAtMs).toBe(
      value.state.hardDeleteByMs -
        FEEDBACK_PROGRESSIVE_COOLDOWN_PURGE_SAFETY_MS,
    );
    expect(value.ttlSeconds).toBeGreaterThan(0);
  });

  it("keeps a later record live when another record expires 12 hours earlier", () => {
    const firstReleasedAtMs = BASE_MS + MINUTE_MS;
    const secondReleasedAtMs = firstReleasedAtMs + 12 * HOUR_MS;
    const first: FeedbackProgressiveCooldownReservationRecord = {
      ...reservedRecord(),
      status: FeedbackReservationState.RELEASED,
      releasedAtMs: firstReleasedAtMs,
      reconciliationUntilMs:
        firstReleasedAtMs + FEEDBACK_PROGRESSIVE_COOLDOWN_RECONCILIATION_MS,
    };
    const second: FeedbackProgressiveCooldownReservationRecord = {
      ...reservedRecord({
        reservationId: secondReservationId,
        idempotencyDigest: secondIdempotencyDigest,
        attemptTokenDigest: secondAttemptTokenDigest,
        reservedAtMs: BASE_MS + 1,
        leaseExpiresAtMs:
          BASE_MS +
          1 +
          FEEDBACK_PROGRESSIVE_COOLDOWN_RESERVATION_LEASE_MS,
      }),
      status: FeedbackReservationState.RELEASED,
      releasedAtMs: secondReleasedAtMs,
      reconciliationUntilMs:
        secondReleasedAtMs + FEEDBACK_PROGRESSIVE_COOLDOWN_RECONCILIATION_MS,
    };
    const existingHardDeleteByMs = hardDeleteBy(
      secondReleasedAtMs,
      first.reconciliationUntilMs,
      second.reconciliationUntilMs,
    );
    const existing = aggregate({
      writtenAtMs: secondReleasedAtMs,
      ttlSeconds: ttlSeconds(secondReleasedAtMs, existingHardDeleteByMs),
      state: {
        schemaVersion: "1",
        streak: 0,
        reservations: [first, second],
        hardDeleteByMs: existingHardDeleteByMs,
      },
    });
    const nextWrittenAtMs = first.reconciliationUntilMs;
    const nextHardDeleteByMs = hardDeleteBy(
      nextWrittenAtMs,
      second.reconciliationUntilMs,
    );
    const next: FeedbackProgressiveCooldownAggregateEntity = {
      ...existing,
      writtenAtMs: nextWrittenAtMs,
      ttlSeconds: ttlSeconds(nextWrittenAtMs, nextHardDeleteByMs),
      revision: existing.revision + 1,
      state: {
        schemaVersion: "1",
        streak: 0,
        reservations: [second],
        hardDeleteByMs: nextHardDeleteByMs,
      },
    };

    expect(next.ttlSeconds).toBe(12 * HOUR_MS / 1_000);
    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate(
        next,
        existing,
      ).valid,
    ).toBe(true);
    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate({
        ...next,
        ttlSeconds: 0,
      }).valid,
    ).toBe(false);
  });

  it("uses zero TTL only for an empty aggregate at reconciliation expiry", () => {
    const existing = aggregate();
    const reconciliationUntilMs =
      existing.state.reservations[0]?.reconciliationUntilMs;
    if (reconciliationUntilMs === undefined) {
      throw new Error("Synthetic reconciliation deadline is missing.");
    }
    const pruned: FeedbackProgressiveCooldownAggregateEntity = {
      type: "feedbackProgressiveCooldownAggregateEntity",
      version: "1.0.0",
      stateId,
      writtenAtMs: reconciliationUntilMs,
      ttlSeconds: 0,
      revision: existing.revision + 1,
      state: {
        schemaVersion: "1",
        streak: 0,
        reservations: [],
        hardDeleteByMs:
          reconciliationUntilMs +
          FEEDBACK_PROGRESSIVE_COOLDOWN_PURGE_SAFETY_MS,
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

    const recordWithSubsecondReconciliation =
      existing.state.reservations[0];
    if (recordWithSubsecondReconciliation === undefined) {
      throw new Error("Synthetic reservation is missing.");
    }
    const subsecondWrittenAtMs =
      recordWithSubsecondReconciliation.reconciliationUntilMs - 1;
    const subsecondHardDeleteByMs = hardDeleteBy(
      subsecondWrittenAtMs,
      recordWithSubsecondReconciliation.reconciliationUntilMs,
    );
    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate({
        ...existing,
        writtenAtMs: subsecondWrittenAtMs,
        ttlSeconds: 0,
        state: {
          ...existing.state,
          hardDeleteByMs: subsecondHardDeleteByMs,
        },
      }).valid,
    ).toBe(false);
  });

  it("allows pruning only after reconciliation and resets after 48 quiet hours", () => {
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
      attemptTokenDigest: secondAttemptTokenDigest,
      reservedAtMs: resetAt,
      leaseExpiresAtMs:
        resetAt + FEEDBACK_PROGRESSIVE_COOLDOWN_RESERVATION_LEASE_MS,
      reconciliationUntilMs:
        resetAt +
        FEEDBACK_PROGRESSIVE_COOLDOWN_RESERVATION_LEASE_MS +
        FEEDBACK_PROGRESSIVE_COOLDOWN_RECONCILIATION_MS,
    });
    const resetHardDeleteByMs = hardDeleteBy(
      resetAt,
      committed.state.hardDeleteByMs -
        FEEDBACK_PROGRESSIVE_COOLDOWN_PURGE_SAFETY_MS,
      resetRecord.reconciliationUntilMs,
    );
    const afterReset = aggregate({
      writtenAtMs: resetAt,
      ttlSeconds: ttlSeconds(resetAt, resetHardDeleteByMs),
      revision: committed.revision + 1,
      state: {
        schemaVersion: "1",
        streak: 0,
        reservations: [
          ...committed.state.reservations,
          resetRecord,
        ],
        hardDeleteByMs: resetHardDeleteByMs,
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
        hardDeleteByMs: hardDeleteBy(
          afterReset.writtenAtMs,
          resetRecord.reconciliationUntilMs,
        ),
      },
    };
    expect(
      feedbackProgressiveCooldownAggregateEntitySchema.validate(
        prematurePrune,
        afterReset,
      ).valid,
    ).toBe(false);

    const committedReconciliationEnds =
      committed.state.reservations[0]?.reconciliationUntilMs;
    if (committedReconciliationEnds === undefined) {
      throw new Error("Synthetic committed reconciliation is missing.");
    }
    const validPruneHardDeleteByMs = hardDeleteBy(
      committedReconciliationEnds,
      resetRecord.reconciliationUntilMs,
    );
    const validPrune = {
      ...afterReset,
      writtenAtMs: committedReconciliationEnds,
      ttlSeconds: ttlSeconds(
        committedReconciliationEnds,
        validPruneHardDeleteByMs,
      ),
      revision: afterReset.revision + 1,
      state: {
        ...afterReset.state,
        reservations: [resetRecord],
        hardDeleteByMs: validPruneHardDeleteByMs,
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
