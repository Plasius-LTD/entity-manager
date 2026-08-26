import { describe, expect, it } from "vitest";
import {
  FEEDBACK_BUG_COOLDOWN_SECONDS as SCHEMA_FEEDBACK_BUG_COOLDOWN_SECONDS,
  FEEDBACK_REVIEW_COOLDOWN_SECONDS as SCHEMA_FEEDBACK_REVIEW_COOLDOWN_SECONDS,
} from "@plasius/schema";
import * as entityManager from "../src/index.js";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const BASE_MS = Date.parse("2026-08-13T10:00:00.000Z");
const STATE_ID = `fbs1.${"A".repeat(43)}`;
const RESERVATION_ID = `fbr1.${"A".repeat(22)}`;
const IDEMPOTENCY_DIGEST = "E".repeat(43);
const ATTEMPT_TOKEN_DIGEST = "I".repeat(43);
const DRAFT_ID = "018f7462-2152-49f3-a4dd-a58325c44b60";

type RuntimeSchema = {
  tableName?: () => string | undefined;
  validate: (next: unknown, existing?: unknown) => {
    valid: boolean;
    value?: unknown;
  };
  serialize: (value: unknown) => unknown;
};

function exportedSchema(name: string): RuntimeSchema {
  const candidate = (entityManager as Record<string, unknown>)[name];
  expect(candidate, `${name} must be exported`).toBeDefined();
  return candidate as RuntimeSchema;
}

function ownerBoundReservation(status: "reserved" | "writing" = "reserved") {
  const leaseExpiresAtMs = BASE_MS + 5 * MINUTE_MS;
  return {
    reservationId: RESERVATION_ID,
    idempotencyDigest: IDEMPOTENCY_DIGEST,
    status,
    reservedAtMs: BASE_MS,
    leaseExpiresAtMs,
    reconciliationUntilMs: leaseExpiresAtMs + 6 * DAY_MS,
    attemptGeneration: 1,
    attemptTokenDigest: ATTEMPT_TOKEN_DIGEST,
    ...(status === "writing" ? { writeStartedAtMs: BASE_MS + MINUTE_MS } : {}),
  };
}

function aggregate(
  reservation: ReturnType<typeof ownerBoundReservation>,
  writtenAtMs = BASE_MS,
  revision = 0,
) {
  const hardDeleteByMs = reservation.reconciliationUntilMs + DAY_MS;
  return {
    type: "feedbackProgressiveCooldownAggregateEntity",
    version: "1.0.0",
    stateId: STATE_ID,
    writtenAtMs,
    ttlSeconds: Math.floor(
      (hardDeleteByMs - writtenAtMs - DAY_MS) / 1_000,
    ),
    revision,
    state: {
      schemaVersion: "1",
      streak: 0,
      reservations: [reservation],
      hardDeleteByMs,
    },
  };
}

describe("feedback final release contract compatibility", () => {
  it("uses the schema-owned cooldown policy", () => {
    expect(entityManager.FEEDBACK_BUG_COOLDOWN_SECONDS).toEqual(
      SCHEMA_FEEDBACK_BUG_COOLDOWN_SECONDS,
    );
    expect(entityManager.FEEDBACK_REVIEW_DENY_SECONDS).toBe(
      SCHEMA_FEEDBACK_REVIEW_COOLDOWN_SECONDS,
    );
  });

  it("accepts reservation-v1 owner-bound states from @plasius/api", () => {
    const schema = entityManager.feedbackProgressiveCooldownAggregateEntitySchema;
    const reserved = aggregate(ownerBoundReservation());
    const writing = aggregate(
      ownerBoundReservation("writing"),
      BASE_MS + MINUTE_MS,
      1,
    );
    const committedAtMs = BASE_MS + 2 * MINUTE_MS;
    const cooldownDurationMs = SCHEMA_FEEDBACK_BUG_COOLDOWN_SECONDS[0] * 1_000;
    const cooldownUntilMs = BASE_MS + cooldownDurationMs;
    const reconciliationUntilMs = committedAtMs + 8 * DAY_MS;
    const hardDeleteByMs = reconciliationUntilMs + DAY_MS;
    const committed = {
      ...writing,
      writtenAtMs: committedAtMs,
      ttlSeconds: (hardDeleteByMs - committedAtMs - DAY_MS) / 1_000,
      revision: 2,
      state: {
        schemaVersion: "1",
        streak: 1,
        lastCommittedAtMs: committedAtMs,
        cooldownUntilMs,
        reservations: [
          {
            ...writing.state.reservations[0],
            status: "committed",
            committedAtMs,
            committedStreak: 1,
            cooldownDurationMs,
            cooldownUntilMs,
            reconciliationUntilMs,
          },
        ],
        hardDeleteByMs,
      },
    };

    expect(schema.validate(reserved).valid).toBe(true);
    expect(schema.validate(writing, reserved).valid).toBe(true);
    expect(schema.validate(committed, writing).valid).toBe(true);
  });

  it("rejects new reservations without owner authority or with duplicate attempt digests", () => {
    const schema = entityManager.feedbackProgressiveCooldownAggregateEntitySchema;
    const ownerBound = ownerBoundReservation();
    const {
      attemptGeneration: _attemptGeneration,
      attemptTokenDigest: _attemptTokenDigest,
      ...legacy
    } = ownerBound;
    const empty = {
      type: "feedbackProgressiveCooldownAggregateEntity",
      version: "1.0.0",
      stateId: STATE_ID,
      writtenAtMs: BASE_MS,
      ttlSeconds: 0,
      revision: 0,
      state: {
        schemaVersion: "1",
        streak: 0,
        reservations: [],
        hardDeleteByMs: BASE_MS + DAY_MS,
      },
    };
    const legacyAddition = {
      ...aggregate(legacy as ReturnType<typeof ownerBoundReservation>),
      revision: 1,
    };
    const released = {
      ...ownerBound,
      status: "released",
      releasedAtMs: BASE_MS,
      reconciliationUntilMs: BASE_MS + 6 * DAY_MS,
    };
    const duplicate = {
      ...released,
      reservationId: `fbr1.${"B".repeat(21)}Q`,
      idempotencyDigest: "M".repeat(43),
    };
    const duplicateHardDeleteByMs = BASE_MS + 7 * DAY_MS;
    const duplicateAggregate = {
      ...aggregate(ownerBound),
      ttlSeconds: 6 * DAY_MS / 1_000,
      state: {
        schemaVersion: "1",
        streak: 0,
        reservations: [released, duplicate],
        hardDeleteByMs: duplicateHardDeleteByMs,
      },
    };

    expect(schema.validate(empty).valid).toBe(true);
    expect(schema.validate(legacyAddition, empty).valid).toBe(false);
    expect(schema.validate(duplicateAggregate).valid).toBe(false);
  });

  it("rejects forged writing authority and release after immutable-write admission", () => {
    const schema = entityManager.feedbackProgressiveCooldownAggregateEntitySchema;
    const reserved = aggregate(ownerBoundReservation());
    const writing = aggregate(
      ownerBoundReservation("writing"),
      BASE_MS + MINUTE_MS,
      1,
    );
    const forgedWriting = {
      ...writing,
      state: {
        ...writing.state,
        reservations: [
          {
            ...writing.state.reservations[0],
            attemptTokenDigest: "M".repeat(43),
          },
        ],
      },
    };
    const releasedAtMs = BASE_MS + 2 * MINUTE_MS;
    const releasedRecord = {
      ...writing.state.reservations[0],
      status: "released",
      releasedAtMs,
      reconciliationUntilMs: releasedAtMs + 6 * DAY_MS,
    };
    const releasedHardDeleteByMs = releasedRecord.reconciliationUntilMs + DAY_MS;
    const released = {
      ...writing,
      writtenAtMs: releasedAtMs,
      ttlSeconds: Math.floor(
        (releasedHardDeleteByMs - releasedAtMs - DAY_MS) / 1_000,
      ),
      revision: 2,
      state: {
        schemaVersion: "1",
        streak: 0,
        reservations: [releasedRecord],
        hardDeleteByMs: releasedHardDeleteByMs,
      },
    };

    expect(schema.validate(forgedWriting, reserved).valid).toBe(false);
    expect(schema.validate(released, writing).valid).toBe(false);
  });

  it("does not let a legacy reservation bypass owner-bound release", () => {
    const schema = entityManager.feedbackProgressiveCooldownAggregateEntitySchema;
    const ownerBound = ownerBoundReservation();
    const {
      attemptGeneration: _attemptGeneration,
      attemptTokenDigest: _attemptTokenDigest,
      ...legacyRecord
    } = ownerBound;
    const legacy = aggregate(
      legacyRecord as ReturnType<typeof ownerBoundReservation>,
    );
    const releasedAtMs = BASE_MS + MINUTE_MS;
    const reconciliationUntilMs = releasedAtMs + 6 * DAY_MS;
    const hardDeleteByMs = reconciliationUntilMs + DAY_MS;
    const released = {
      ...legacy,
      writtenAtMs: releasedAtMs,
      ttlSeconds: (hardDeleteByMs - releasedAtMs - DAY_MS) / 1_000,
      revision: 1,
      state: {
        schemaVersion: "1",
        streak: 0,
        reservations: [
          {
            ...legacyRecord,
            status: "released",
            releasedAtMs,
            reconciliationUntilMs,
          },
        ],
        hardDeleteByMs,
      },
    };

    expect(schema.validate(legacy).valid).toBe(true);
    expect(schema.validate(released, legacy).valid).toBe(false);
  });

  it("validates an actor-free exact-24-hour structured draft metadata row", () => {
    const schema = exportedSchema("systemManagedFeedbackDraftEntitySchema");
    const savedAt = new Date(BASE_MS).toISOString();
    const expiresAt = new Date(BASE_MS + DAY_MS).toISOString();
    const draft = {
      type: "systemManagedFeedbackDraftEntity",
      version: "1.0.0",
      draftId: DRAFT_ID,
      submissionKind: "bug",
      contractVersion: "1.0.0",
      updatedAt: savedAt,
      expiresAt,
      hardDeleteAt: expiresAt,
      ttlSeconds: DAY_MS / 1_000,
      revision: 0,
    };

    expect(schema.tableName?.()).toBe("feedbackDrafts");
    expect(schema.validate(draft).valid).toBe(true);
    expect(schema.serialize(draft)).toEqual({
      type: "systemManagedFeedbackDraftEntity",
      version: "1.0.0",
    });

    const nextSavedAt = new Date(BASE_MS + MINUTE_MS).toISOString();
    const nextExpiresAt = new Date(BASE_MS + DAY_MS + MINUTE_MS).toISOString();
    const nextDraft = {
      ...draft,
      updatedAt: nextSavedAt,
      expiresAt: nextExpiresAt,
      hardDeleteAt: nextExpiresAt,
      revision: 1,
    };
    expect(schema.validate(nextDraft, draft).valid).toBe(true);
    expect(schema.validate(nextDraft, nextDraft).valid).toBe(true);
    expect(
      schema.validate(
        {
          ...nextDraft,
          updatedAt: new Date(BASE_MS + 2 * MINUTE_MS).toISOString(),
          expiresAt: new Date(BASE_MS + DAY_MS + 2 * MINUTE_MS).toISOString(),
          hardDeleteAt: new Date(
            BASE_MS + DAY_MS + 2 * MINUTE_MS,
          ).toISOString(),
        },
        nextDraft,
      ).valid,
    ).toBe(false);

    for (const forbidden of [
      "accountId",
      "keyedSubject",
      "narrative",
      "ciphertext",
      "pixelData",
      "packetId",
      "idempotencyKey",
    ]) {
      expect(schema.validate({ ...draft, [forbidden]: "synthetic" }).valid).toBe(
        false,
      );
    }
  });

  it("validates a bounded identifier-isolated reconciliation outbox row", () => {
    const schema = exportedSchema(
      "feedbackCommitReconciliationOutboxEntitySchema",
    );
    const leaseExpiresAtMs = BASE_MS + 5 * MINUTE_MS;
    const reconciliationUntilMs = leaseExpiresAtMs + 6 * DAY_MS;
    const hardDeleteByMs = reconciliationUntilMs + DAY_MS;
    const outbox = {
      type: "feedbackCommitReconciliationOutboxEntity",
      version: "1.0.0",
      stateId: STATE_ID,
      reservationId: RESERVATION_ID,
      submissionKind: "bug",
      reservedAtMs: BASE_MS,
      writeStartedAtMs: BASE_MS + MINUTE_MS,
      leaseExpiresAtMs,
      reconciliationUntilMs,
      hardDeleteByMs,
      ttlSeconds: Math.floor(
        (reconciliationUntilMs - (BASE_MS + MINUTE_MS)) / 1_000,
      ),
      revision: 0,
    };

    expect(schema.tableName?.()).toBe("feedbackControl");
    expect(schema.validate(outbox).valid).toBe(true);
    expect(schema.serialize(outbox)).toEqual({
      type: "feedbackCommitReconciliationOutboxEntity",
      version: "1.0.0",
    });
    expect(
      schema.validate({
        ...outbox,
        leaseExpiresAtMs: outbox.leaseExpiresAtMs + 1,
        reconciliationUntilMs: outbox.reconciliationUntilMs + 1,
        hardDeleteByMs: outbox.hardDeleteByMs + 1,
      }).valid,
    ).toBe(false);
    expect(
      schema.validate({
        ...outbox,
        reconciliationUntilMs: outbox.reconciliationUntilMs + 1,
      }).valid,
    ).toBe(false);
    expect(schema.validate({ ...outbox, ttlSeconds: outbox.ttlSeconds + 1 }).valid)
      .toBe(false);

    for (const forbidden of [
      "packetId",
      "artifactId",
      "draftId",
      "attemptToken",
      "attemptTokenDigest",
      "idempotencyDigest",
      "narrative",
      "accountId",
    ]) {
      expect(
        schema.validate({ ...outbox, [forbidden]: "synthetic" }).valid,
      ).toBe(false);
    }
  });
});
