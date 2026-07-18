import { describe, expect, it } from "vitest";
import {
  FeedbackArtifactKind,
  FeedbackProcessor,
  FeedbackReservationState,
  FeedbackSubmissionKind,
  feedbackAbuseControlEntitySchema,
  feedbackReviewEligibilityEntitySchema,
  feedbackSubmissionReservationEntitySchema,
  systemManagedFeedbackCheckpointEntitySchema,
  systemManagedFeedbackPacketEntitySchema,
  systemManagedFeedbackReconstructionEntitySchema,
  systemManagedFeedbackReportEntitySchema,
} from "../src/index.js";

const createdAt = "2026-07-18T10:00:00.000Z";
const updatedAt = "2026-07-18T10:05:00.000Z";
const retentionExpiresAt = "2026-10-16T10:00:00.000Z";
const hardDeleteAt = "2026-10-17T10:00:00.000Z";
const artifactTtlSeconds =
  (Date.parse(hardDeleteAt) - Date.parse(createdAt)) / 1_000;
const keyedSubject = `fbs1.${"A".repeat(43)}`;
const reservationId = `fbr1.${"B".repeat(21)}A`;

describe("actor-free feedback artifacts", () => {
  it("routes content, report, and control records to separate stores", () => {
    expect(systemManagedFeedbackPacketEntitySchema.tableName?.()).toBe(
      "feedbackContent",
    );
    expect(systemManagedFeedbackReportEntitySchema.tableName?.()).toBe(
      "feedbackReports",
    );
    expect(systemManagedFeedbackCheckpointEntitySchema.tableName?.()).toBe(
      "feedbackReports",
    );
    expect(feedbackAbuseControlEntitySchema.tableName?.()).toBe(
      "feedbackControl",
    );
  });

  it.each([
    [
      systemManagedFeedbackPacketEntitySchema,
      {
        type: "systemManagedFeedbackPacketEntity",
        version: "1.0.0",
        artifactKind: FeedbackArtifactKind.BUG_PACKET,
        artifactId: "018f7462-2152-49f3-a4dd-a58325c44b60",
        contractVersion: "1.0.0",
        createdAt,
        retentionExpiresAt,
        hardDeleteAt,
        ttlSeconds: artifactTtlSeconds,
        revision: 0,
      },
    ],
    [
      systemManagedFeedbackReportEntitySchema,
      {
        type: "systemManagedFeedbackReportEntity",
        version: "1.0.0",
        artifactKind: FeedbackArtifactKind.HOURLY_BUG_REPORT,
        artifactId: "018f7462-2152-49f3-a4dd-a58325c44b61",
        contractVersion: "1.0.0",
        windowKey: "hour:2026-07-18T09",
        createdAt,
        retentionExpiresAt,
        hardDeleteAt,
        ttlSeconds: artifactTtlSeconds,
        revision: 0,
      },
    ],
    [
      systemManagedFeedbackReconstructionEntitySchema,
      {
        type: "systemManagedFeedbackReconstructionEntity",
        version: "1.0.0",
        artifactKind: FeedbackArtifactKind.GAME_RECONSTRUCTION,
        artifactId: "018f7462-2152-49f3-a4dd-a58325c44b62",
        sourceArtifactId: "018f7462-2152-49f3-a4dd-a58325c44b60",
        contractVersion: "1.0.0",
        createdAt,
        retentionExpiresAt,
        hardDeleteAt,
        ttlSeconds: artifactTtlSeconds,
        revision: 0,
      },
    ],
  ] as const)("validates a minimal system-owned %s", (schema, entity) => {
    expect(schema.validate(entity).valid).toBe(true);
    expect(entity).not.toHaveProperty("createdBy");
    expect(entity).not.toHaveProperty("updatedBy");
    expect(entity).not.toHaveProperty("deletedBy");
  });

  it("rejects actor audit fields instead of silently discarding them", () => {
    const result = systemManagedFeedbackPacketEntitySchema.validate({
      type: "systemManagedFeedbackPacketEntity",
      version: "1.0.0",
      artifactKind: FeedbackArtifactKind.REVIEW_PACKET,
      artifactId: "018f7462-2152-49f3-a4dd-a58325c44b60",
      contractVersion: "1.0.0",
      createdAt,
      retentionExpiresAt,
      hardDeleteAt,
      ttlSeconds: artifactTtlSeconds,
      revision: 0,
      createdBy: "synthetic-account",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(["Unsupported feedback entity field."]);
  });

  it.each([
    keyedSubject,
    "user-123",
    "018f7462-2152-49f3-a4dd-a58325c44b60",
    "2026-07-18T09",
    "hour:2026-02-30T09",
    "day:2026-07-18",
  ])("rejects a non-hourly bug-report window: %s", (windowKey) => {
    const result = systemManagedFeedbackReportEntitySchema.validate({
      type: "systemManagedFeedbackReportEntity",
      version: "1.0.0",
      artifactKind: FeedbackArtifactKind.HOURLY_BUG_REPORT,
      artifactId: "018f7462-2152-49f3-a4dd-a58325c44b61",
      contractVersion: "1.0.0",
      windowKey,
      createdAt,
      retentionExpiresAt,
      hardDeleteAt,
      ttlSeconds: artifactTtlSeconds,
      revision: 0,
    });

    expect(result.valid).toBe(false);
  });

  it.each([
    [FeedbackArtifactKind.DAILY_SATISFACTION_REPORT, "day:2026-07-18"],
    [FeedbackArtifactKind.PUBLIC_SUMMARY, "day:2026-07-18"],
    [
      FeedbackArtifactKind.MATERIALIZATION_MANIFEST,
      "reconcile:2026-07-18T10:05",
    ],
  ] as const)(
    "accepts the purpose-bound %s window",
    (artifactKind, windowKey) => {
      const result = systemManagedFeedbackReportEntitySchema.validate({
        type: "systemManagedFeedbackReportEntity",
        version: "1.0.0",
        artifactKind,
        artifactId: "018f7462-2152-49f3-a4dd-a58325c44b61",
        contractVersion: "1.0.0",
        windowKey,
        createdAt,
        retentionExpiresAt,
        hardDeleteAt,
        ttlSeconds: artifactTtlSeconds,
        revision: 0,
      });

      expect(result.valid).toBe(true);
    },
  );

  it.each([
    ["narrative", "synthetic narrative"],
    ["email", "synthetic@example.invalid"],
    ["keyedSubject", keyedSubject],
    ["ipAddress", "192.0.2.1"],
    ["userAgent", "synthetic-agent"],
  ])("rejects prohibited content-plane field %s", (field, value) => {
    const result = systemManagedFeedbackReportEntitySchema.validate({
      type: "systemManagedFeedbackReportEntity",
      version: "1.0.0",
      artifactKind: FeedbackArtifactKind.DAILY_SATISFACTION_REPORT,
      artifactId: "018f7462-2152-49f3-a4dd-a58325c44b61",
      contractVersion: "1.0.0",
      windowKey: "day:2026-07-17",
      createdAt,
      retentionExpiresAt,
      hardDeleteAt,
      ttlSeconds: artifactTtlSeconds,
      revision: 0,
      [field]: value,
    });

    expect(result.valid).toBe(false);
  });

  it("requires immutable artifacts to remain field-equivalent on idempotent retry", () => {
    const entity = {
      type: "systemManagedFeedbackPacketEntity",
      version: "1.0.0",
      artifactKind: FeedbackArtifactKind.BUG_PACKET,
      artifactId: "018f7462-2152-49f3-a4dd-a58325c44b60",
      contractVersion: "1.0.0",
      createdAt,
      retentionExpiresAt,
      hardDeleteAt,
      ttlSeconds: artifactTtlSeconds,
      revision: 0,
    };

    expect(
      systemManagedFeedbackPacketEntitySchema.validate(entity, entity).valid,
    ).toBe(true);
    expect(
      systemManagedFeedbackPacketEntitySchema.validate(
        { ...entity, contractVersion: "1.0.1" },
        entity,
      ).valid,
    ).toBe(false);
  });

  it("validates checkpoint revision increments for conditional updates", () => {
    const initial = {
      type: "systemManagedFeedbackCheckpointEntity",
      version: "1.0.0",
      checkpointId: "checkpoint:bug-hourly:hour:2026-07-18T09",
      processor: FeedbackProcessor.BUG_HOURLY,
      windowKey: "hour:2026-07-18T09",
      completedAt: createdAt,
      outputArtifactId: "018f7462-2152-49f3-a4dd-a58325c44b61",
      updatedAt,
      expiresAt: retentionExpiresAt,
      hardDeleteAt,
      ttlSeconds:
        (Date.parse(hardDeleteAt) - Date.parse(updatedAt)) / 1_000,
      revision: 0,
    };

    expect(
      systemManagedFeedbackCheckpointEntitySchema.validate(initial).valid,
    ).toBe(true);
    expect(
      systemManagedFeedbackCheckpointEntitySchema.validate(
        {
          ...initial,
          revision: 1,
          completedAt: "2026-07-18T10:10:00.000Z",
          outputArtifactId: "018f7462-2152-49f3-a4dd-a58325c44b63",
        },
        initial,
      ).valid,
    ).toBe(true);
    expect(
      systemManagedFeedbackCheckpointEntitySchema.validate(
        { ...initial, revision: 2 },
        initial,
      ).valid,
    ).toBe(false);
  });

  it("accepts only five-minute reconciliation checkpoint buckets", () => {
    const checkpoint = {
      type: "systemManagedFeedbackCheckpointEntity",
      version: "1.0.0",
      checkpointId:
        "checkpoint:commit-reconciliation:reconcile:2026-07-18T10:05",
      processor: FeedbackProcessor.COMMIT_RECONCILIATION,
      windowKey: "reconcile:2026-07-18T10:05",
      completedAt: createdAt,
      updatedAt,
      expiresAt: retentionExpiresAt,
      hardDeleteAt,
      ttlSeconds:
        (Date.parse(hardDeleteAt) - Date.parse(updatedAt)) / 1_000,
      revision: 0,
    };

    expect(
      systemManagedFeedbackCheckpointEntitySchema.validate(checkpoint).valid,
    ).toBe(true);
    expect(
      systemManagedFeedbackCheckpointEntitySchema.validate({
        ...checkpoint,
        checkpointId:
          "checkpoint:commit-reconciliation:reconcile:2026-07-18T10:07",
        windowKey: "reconcile:2026-07-18T10:07",
      }).valid,
    ).toBe(false);
  });

  it.each([
    {
      checkpointId: `checkpoint:bug-hourly:${keyedSubject}`,
      windowKey: keyedSubject,
    },
    {
      checkpointId: "checkpoint:bug-hourly:user-123",
      windowKey: "user-123",
    },
    {
      checkpointId:
        "checkpoint:bug-hourly:018f7462-2152-49f3-a4dd-a58325c44b60",
      windowKey: "018f7462-2152-49f3-a4dd-a58325c44b60",
    },
    {
      checkpointId: "checkpoint:bug-hourly:day:2026-07-18",
      windowKey: "day:2026-07-18",
    },
    {
      checkpointId: "checkpoint:review-daily:day:2026-07-18",
      windowKey: "day:2026-07-18",
    },
  ])(
    "rejects hidden joins and processor/window mismatches: $windowKey",
    ({ checkpointId, windowKey }) => {
      const result = systemManagedFeedbackCheckpointEntitySchema.validate({
        type: "systemManagedFeedbackCheckpointEntity",
        version: "1.0.0",
        checkpointId,
        processor: FeedbackProcessor.BUG_HOURLY,
        windowKey,
        completedAt: createdAt,
        outputArtifactId: "018f7462-2152-49f3-a4dd-a58325c44b61",
        updatedAt,
        expiresAt: retentionExpiresAt,
        hardDeleteAt,
        ttlSeconds:
          (Date.parse(hardDeleteAt) - Date.parse(updatedAt)) / 1_000,
        revision: 0,
      });

      expect(result.valid).toBe(false);
    },
  );
});

describe("isolated feedback control entities", () => {
  const controlHardDeleteAt = "2026-07-20T10:05:00.000Z";
  const controlTtlSeconds =
    (Date.parse(controlHardDeleteAt) - Date.parse(updatedAt)) / 1_000;

  it("validates an abuse ladder state without account or packet identity", () => {
    const result = feedbackAbuseControlEntitySchema.validate({
      type: "feedbackAbuseControlEntity",
      version: "1.0.0",
      keyedSubject,
      acceptedBugCount: 3,
      cooldownStreak: 2,
      cooldownExpiresAt: "2026-07-18T11:05:00.000Z",
      quietResetExpiresAt: "2026-07-20T10:05:00.000Z",
      updatedAt,
      expiresAt: controlHardDeleteAt,
      hardDeleteAt: controlHardDeleteAt,
      ttlSeconds: controlTtlSeconds,
      revision: 0,
    });

    expect(result.valid).toBe(true);
    expect(result.value).not.toHaveProperty("accountId");
    expect(result.value).not.toHaveProperty("packetId");
  });

  it("requires a versioned 256-bit keyed subject, not a raw subject", () => {
    expect(
      feedbackAbuseControlEntitySchema.validate({
        type: "feedbackAbuseControlEntity",
        version: "1.0.0",
        keyedSubject: "synthetic-account-001",
        acceptedBugCount: 1,
        cooldownStreak: 0,
        cooldownExpiresAt: "2026-07-18T10:10:00.000Z",
        quietResetExpiresAt: "2026-07-20T10:05:00.000Z",
        updatedAt,
        expiresAt: controlHardDeleteAt,
        hardDeleteAt: controlHardDeleteAt,
        ttlSeconds: controlTtlSeconds,
        revision: 0,
      }).valid,
    ).toBe(false);
  });

  it("rejects non-canonical base64url aliases with non-zero pad bits", () => {
    const aliasedSubject = `fbs1.${"A".repeat(42)}B`;
    const aliasedReservation = `fbr1.${"A".repeat(21)}B`;
    const canonicalSubject = `fbs1.${"A".repeat(42)}E`;
    const canonicalReservation = `fbr1.${"A".repeat(21)}w`;
    const abuse = {
      type: "feedbackAbuseControlEntity",
      version: "1.0.0",
      keyedSubject: aliasedSubject,
      acceptedBugCount: 1,
      cooldownStreak: 0,
      cooldownExpiresAt: "2026-07-18T10:10:00.000Z",
      quietResetExpiresAt: "2026-07-20T10:05:00.000Z",
      updatedAt,
      expiresAt: controlHardDeleteAt,
      hardDeleteAt: controlHardDeleteAt,
      ttlSeconds: controlTtlSeconds,
      revision: 0,
    };
    const reservation = {
      type: "feedbackSubmissionReservationEntity",
      version: "1.0.0",
      keyedSubject,
      reservationId: aliasedReservation,
      submissionKind: FeedbackSubmissionKind.BUG,
      state: FeedbackReservationState.RESERVED,
      attemptCount: 1,
      updatedAt,
      expiresAt: "2026-07-18T10:10:00.000Z",
      hardDeleteAt: "2026-07-19T10:10:00.000Z",
      ttlSeconds:
        (Date.parse("2026-07-19T10:10:00.000Z") -
          Date.parse(updatedAt)) /
        1_000,
      revision: 0,
    };

    expect(feedbackAbuseControlEntitySchema.validate(abuse).valid).toBe(false);
    expect(
      feedbackSubmissionReservationEntitySchema.validate(reservation).valid,
    ).toBe(false);
    expect(
      feedbackAbuseControlEntitySchema.validate({
        ...abuse,
        keyedSubject: canonicalSubject,
      }).valid,
    ).toBe(true);
    expect(
      feedbackSubmissionReservationEntitySchema.validate({
        ...reservation,
        reservationId: canonicalReservation,
      }).valid,
    ).toBe(true);
  });

  it("rejects prototype-bearing inputs at the privacy boundary", () => {
    const value = Object.assign(Object.create({ accountId: "synthetic" }), {
      type: "feedbackAbuseControlEntity",
      version: "1.0.0",
      keyedSubject,
      acceptedBugCount: 1,
      cooldownStreak: 0,
      cooldownExpiresAt: "2026-07-18T10:10:00.000Z",
      quietResetExpiresAt: "2026-07-20T10:05:00.000Z",
      updatedAt,
      expiresAt: controlHardDeleteAt,
      hardDeleteAt: controlHardDeleteAt,
      ttlSeconds: controlTtlSeconds,
      revision: 0,
    });

    expect(feedbackAbuseControlEntitySchema.validate(value)).toEqual({
      valid: false,
      errors: ["Feedback entity must be a plain object."],
      issues: [],
    });
  });

  it("rejects accessors and symbol metadata instead of inspecting them", () => {
    const accessor = {
      type: "feedbackAbuseControlEntity",
      version: "1.0.0",
      keyedSubject,
      acceptedBugCount: 1,
      cooldownStreak: 0,
      cooldownExpiresAt: "2026-07-18T10:10:00.000Z",
      quietResetExpiresAt: "2026-07-20T10:05:00.000Z",
      updatedAt,
      expiresAt: controlHardDeleteAt,
      hardDeleteAt: controlHardDeleteAt,
      ttlSeconds: controlTtlSeconds,
      revision: 0,
      get accountId() {
        throw new Error("Unsafe accessor was evaluated.");
      },
    };
    const symbolMetadata = {
      type: "feedbackAbuseControlEntity",
      version: "1.0.0",
      keyedSubject,
      acceptedBugCount: 1,
      cooldownStreak: 0,
      cooldownExpiresAt: "2026-07-18T10:10:00.000Z",
      quietResetExpiresAt: "2026-07-20T10:05:00.000Z",
      updatedAt,
      expiresAt: controlHardDeleteAt,
      hardDeleteAt: controlHardDeleteAt,
      ttlSeconds: controlTtlSeconds,
      revision: 0,
      [Symbol("narrative")]: "synthetic",
    };

    expect(feedbackAbuseControlEntitySchema.validate(accessor)).toEqual({
      valid: false,
      errors: ["Feedback entity must contain data fields only."],
      issues: [],
    });
    expect(
      feedbackAbuseControlEntitySchema.validate(symbolMetadata),
    ).toEqual({
      valid: false,
      errors: ["Feedback entity must contain data fields only."],
      issues: [],
    });
  });

  it.each([
    ["accountId", "synthetic-account"],
    ["userId", "synthetic-user"],
    ["packetId", "018f7462-2152-49f3-a4dd-a58325c44b60"],
    ["narrative", "synthetic narrative"],
    ["ipAddress", "192.0.2.1"],
  ])("rejects prohibited control-plane field %s", (field, value) => {
    const result = feedbackReviewEligibilityEntitySchema.validate({
      type: "feedbackReviewEligibilityEntity",
      version: "1.0.0",
      keyedSubject,
      acceptedReviewCount: 1,
      denyExpiresAt: "2026-08-17T10:05:00.000Z",
      updatedAt,
      expiresAt: "2026-08-17T10:05:00.000Z",
      hardDeleteAt: "2026-08-18T10:05:00.000Z",
      ttlSeconds: 31 * 24 * 60 * 60,
      revision: 0,
      [field]: value,
    });

    expect(result.valid).toBe(false);
  });

  it("enforces the seven-day maximum hard-delete lag", () => {
    const result = feedbackReviewEligibilityEntitySchema.validate({
      type: "feedbackReviewEligibilityEntity",
      version: "1.0.0",
      keyedSubject,
      acceptedReviewCount: 1,
      denyExpiresAt: "2026-08-17T10:05:00.000Z",
      updatedAt,
      expiresAt: "2026-08-17T10:05:00.000Z",
      hardDeleteAt: "2026-08-25T10:05:00.000Z",
      ttlSeconds: 38 * 24 * 60 * 60,
      revision: 0,
    });

    expect(result.valid).toBe(false);
  });

  it("enforces the exact cooldown ladder and 48-hour quiet reset", () => {
    const wrongCooldown = feedbackAbuseControlEntitySchema.validate({
      type: "feedbackAbuseControlEntity",
      version: "1.0.0",
      keyedSubject,
      acceptedBugCount: 2,
      cooldownStreak: 1,
      cooldownExpiresAt: "2026-07-18T10:10:00.000Z",
      quietResetExpiresAt: "2026-07-20T10:05:00.000Z",
      updatedAt,
      expiresAt: controlHardDeleteAt,
      hardDeleteAt: controlHardDeleteAt,
      ttlSeconds: controlTtlSeconds,
      revision: 0,
    });
    const wrongQuietReset = feedbackAbuseControlEntitySchema.validate({
      type: "feedbackAbuseControlEntity",
      version: "1.0.0",
      keyedSubject,
      acceptedBugCount: 1,
      cooldownStreak: 0,
      cooldownExpiresAt: "2026-07-18T10:10:00.000Z",
      quietResetExpiresAt: "2026-07-19T10:05:00.000Z",
      updatedAt,
      expiresAt: "2026-07-19T10:05:00.000Z",
      hardDeleteAt: "2026-07-19T10:05:00.000Z",
      ttlSeconds: 24 * 60 * 60,
      revision: 0,
    });

    expect(wrongCooldown.valid).toBe(false);
    expect(wrongQuietReset.valid).toBe(false);
  });

  it("advances only at the cooldown boundary and resets after 48 quiet hours", () => {
    const initial = {
      type: "feedbackAbuseControlEntity",
      version: "1.0.0",
      keyedSubject,
      acceptedBugCount: 1,
      cooldownStreak: 0,
      cooldownExpiresAt: "2026-07-18T10:10:00.000Z",
      quietResetExpiresAt: "2026-07-20T10:05:00.000Z",
      updatedAt,
      expiresAt: "2026-07-20T10:05:00.000Z",
      hardDeleteAt: "2026-07-21T10:05:00.000Z",
      ttlSeconds: 3 * 24 * 60 * 60,
      revision: 0,
    };
    const nextUpdatedAt = initial.cooldownExpiresAt;
    const nextHardDeleteAt = "2026-07-21T10:10:00.000Z";
    const next = {
      ...initial,
      acceptedBugCount: 2,
      cooldownStreak: 1,
      cooldownExpiresAt: "2026-07-18T10:25:00.000Z",
      quietResetExpiresAt: "2026-07-20T10:10:00.000Z",
      updatedAt: nextUpdatedAt,
      expiresAt: "2026-07-20T10:10:00.000Z",
      hardDeleteAt: nextHardDeleteAt,
      ttlSeconds:
        (Date.parse(nextHardDeleteAt) - Date.parse(nextUpdatedAt)) / 1_000,
      revision: 1,
    };
    const prematureUpdatedAt = "2026-07-18T10:09:00.000Z";
    const prematureHardDeleteAt = "2026-07-21T10:09:00.000Z";
    const premature = {
      ...next,
      cooldownExpiresAt: "2026-07-18T10:24:00.000Z",
      quietResetExpiresAt: "2026-07-20T10:09:00.000Z",
      updatedAt: prematureUpdatedAt,
      expiresAt: "2026-07-20T10:09:00.000Z",
      hardDeleteAt: prematureHardDeleteAt,
      ttlSeconds:
        (Date.parse(prematureHardDeleteAt) -
          Date.parse(prematureUpdatedAt)) /
        1_000,
    };
    const resetUpdatedAt = "2026-07-20T10:05:00.000Z";
    const resetHardDeleteAt = "2026-07-23T10:05:00.000Z";
    const reset = {
      ...initial,
      acceptedBugCount: 1,
      cooldownStreak: 0,
      cooldownExpiresAt: "2026-07-20T10:10:00.000Z",
      quietResetExpiresAt: "2026-07-22T10:05:00.000Z",
      updatedAt: resetUpdatedAt,
      expiresAt: "2026-07-22T10:05:00.000Z",
      hardDeleteAt: resetHardDeleteAt,
      ttlSeconds:
        (Date.parse(resetHardDeleteAt) - Date.parse(resetUpdatedAt)) / 1_000,
      revision: 1,
    };

    expect(feedbackAbuseControlEntitySchema.validate(next, initial).valid).toBe(
      true,
    );
    expect(
      feedbackAbuseControlEntitySchema.validate(premature, initial).valid,
    ).toBe(false);
    expect(
      feedbackAbuseControlEntitySchema.validate(
        { ...next, acceptedBugCount: 3 },
        initial,
      ).valid,
    ).toBe(false);
    expect(
      feedbackAbuseControlEntitySchema.validate(reset, initial).valid,
    ).toBe(true);
  });

  it.each([
    "2026-07-18T10:05:00.000Z",
    "2026-07-18T10:04:00.000Z",
  ])("rejects a non-monotonic abuse update at %s", (candidateUpdatedAt) => {
    const initial = {
      type: "feedbackAbuseControlEntity",
      version: "1.0.0",
      keyedSubject,
      acceptedBugCount: 1,
      cooldownStreak: 0,
      cooldownExpiresAt: "2026-07-18T10:10:00.000Z",
      quietResetExpiresAt: "2026-07-20T10:05:00.000Z",
      updatedAt,
      expiresAt: "2026-07-20T10:05:00.000Z",
      hardDeleteAt: "2026-07-21T10:05:00.000Z",
      ttlSeconds: 3 * 24 * 60 * 60,
      revision: 0,
    };
    const candidateHardDeleteAt =
      candidateUpdatedAt === updatedAt
        ? initial.hardDeleteAt
        : "2026-07-21T10:04:00.000Z";
    const candidateQuietResetAt =
      candidateUpdatedAt === updatedAt
        ? initial.quietResetExpiresAt
        : "2026-07-20T10:04:00.000Z";
    const candidate = {
      ...initial,
      acceptedBugCount: 2,
      cooldownStreak: 1,
      cooldownExpiresAt:
        candidateUpdatedAt === updatedAt
          ? "2026-07-18T10:20:00.000Z"
          : "2026-07-18T10:19:00.000Z",
      quietResetExpiresAt: candidateQuietResetAt,
      updatedAt: candidateUpdatedAt,
      expiresAt: candidateQuietResetAt,
      hardDeleteAt: candidateHardDeleteAt,
      ttlSeconds:
        (Date.parse(candidateHardDeleteAt) -
          Date.parse(candidateUpdatedAt)) /
        1_000,
      revision: 1,
    };

    expect(
      feedbackAbuseControlEntitySchema.validate(candidate, initial).valid,
    ).toBe(false);
  });

  it("enforces an exact 30-day accepted-review deny", () => {
    const result = feedbackReviewEligibilityEntitySchema.validate({
      type: "feedbackReviewEligibilityEntity",
      version: "1.0.0",
      keyedSubject,
      acceptedReviewCount: 1,
      denyExpiresAt: "2026-08-16T10:05:00.000Z",
      updatedAt,
      expiresAt: "2026-08-16T10:05:00.000Z",
      hardDeleteAt: "2026-08-17T10:05:00.000Z",
      ttlSeconds: 30 * 24 * 60 * 60,
      revision: 0,
    });

    expect(result.valid).toBe(false);
  });

  it("does not allow a second review before the previous deny expires", () => {
    const initial = {
      type: "feedbackReviewEligibilityEntity",
      version: "1.0.0",
      keyedSubject,
      acceptedReviewCount: 1,
      denyExpiresAt: "2026-08-17T10:05:00.000Z",
      updatedAt,
      expiresAt: "2026-08-17T10:05:00.000Z",
      hardDeleteAt: "2026-08-18T10:05:00.000Z",
      ttlSeconds: 31 * 24 * 60 * 60,
      revision: 0,
    };
    const tooEarlyUpdatedAt = "2026-08-16T10:05:00.000Z";
    const tooEarlyHardDeleteAt = "2026-09-16T10:05:00.000Z";
    const tooEarly = {
      ...initial,
      acceptedReviewCount: 2,
      denyExpiresAt: "2026-09-15T10:05:00.000Z",
      updatedAt: tooEarlyUpdatedAt,
      expiresAt: "2026-09-15T10:05:00.000Z",
      hardDeleteAt: tooEarlyHardDeleteAt,
      ttlSeconds:
        (Date.parse(tooEarlyHardDeleteAt) -
          Date.parse(tooEarlyUpdatedAt)) /
        1_000,
      revision: 1,
    };
    const allowedUpdatedAt = initial.denyExpiresAt;
    const allowedHardDeleteAt = "2026-09-17T10:05:00.000Z";
    const allowed = {
      ...tooEarly,
      denyExpiresAt: "2026-09-16T10:05:00.000Z",
      updatedAt: allowedUpdatedAt,
      expiresAt: "2026-09-16T10:05:00.000Z",
      hardDeleteAt: allowedHardDeleteAt,
      ttlSeconds:
        (Date.parse(allowedHardDeleteAt) -
          Date.parse(allowedUpdatedAt)) /
        1_000,
    };

    expect(
      feedbackReviewEligibilityEntitySchema.validate(tooEarly, initial).valid,
    ).toBe(false);
    expect(
      feedbackReviewEligibilityEntitySchema.validate(allowed, initial).valid,
    ).toBe(true);
  });

  it("requires TTL to resolve exactly at the hard-delete deadline", () => {
    const result = feedbackReviewEligibilityEntitySchema.validate({
      type: "feedbackReviewEligibilityEntity",
      version: "1.0.0",
      keyedSubject,
      acceptedReviewCount: 1,
      denyExpiresAt: "2026-08-17T10:05:00.000Z",
      updatedAt,
      expiresAt: "2026-08-17T10:05:00.000Z",
      hardDeleteAt: "2026-08-18T10:05:00.000Z",
      ttlSeconds: 60,
      revision: 0,
    });

    expect(result.valid).toBe(false);
  });

  it("models reservation/commit convergence without a packet reference", () => {
    const reservation = {
      type: "feedbackSubmissionReservationEntity",
      version: "1.0.0",
      keyedSubject,
      reservationId,
      submissionKind: FeedbackSubmissionKind.BUG,
      state: FeedbackReservationState.RESERVED,
      attemptCount: 1,
      updatedAt,
      expiresAt: "2026-07-18T10:10:00.000Z",
      hardDeleteAt: "2026-07-19T10:10:00.000Z",
      ttlSeconds:
        (Date.parse("2026-07-19T10:10:00.000Z") -
          Date.parse(updatedAt)) /
        1_000,
      revision: 0,
    };

    expect(
      feedbackSubmissionReservationEntitySchema.validate(reservation).valid,
    ).toBe(true);
    expect(reservation).not.toHaveProperty("packetId");
    expect(
      feedbackSubmissionReservationEntitySchema.validate({
        ...reservation,
        packetId: "018f7462-2152-49f3-a4dd-a58325c44b60",
      }).valid,
    ).toBe(false);
  });

  it("requires an initial reservation to start with exactly one attempt", () => {
    const result = feedbackSubmissionReservationEntitySchema.validate({
      type: "feedbackSubmissionReservationEntity",
      version: "1.0.0",
      keyedSubject,
      reservationId,
      submissionKind: FeedbackSubmissionKind.BUG,
      state: FeedbackReservationState.RESERVED,
      attemptCount: 999,
      updatedAt,
      expiresAt: "2026-07-18T10:10:00.000Z",
      hardDeleteAt: "2026-07-19T10:10:00.000Z",
      ttlSeconds:
        (Date.parse("2026-07-19T10:10:00.000Z") -
          Date.parse(updatedAt)) /
        1_000,
      revision: 0,
    });

    expect(result.valid).toBe(false);
  });

  it("rejects lost-update revisions across every mutable control entity", () => {
    const initial = {
      type: "feedbackSubmissionReservationEntity",
      version: "1.0.0",
      keyedSubject,
      reservationId,
      submissionKind: FeedbackSubmissionKind.REVIEW,
      state: FeedbackReservationState.RESERVED,
      attemptCount: 1,
      updatedAt,
      expiresAt: "2026-07-18T10:10:00.000Z",
      hardDeleteAt: "2026-07-19T10:10:00.000Z",
      ttlSeconds:
        (Date.parse("2026-07-19T10:10:00.000Z") -
          Date.parse(updatedAt)) /
        1_000,
      revision: 0,
    };

    expect(
      feedbackSubmissionReservationEntitySchema.validate(
        {
          ...initial,
          state: FeedbackReservationState.COMMITTED,
          revision: 2,
        },
        initial,
      ).valid,
    ).toBe(false);
  });

  it("allows a single reserved-to-committed transition and rejects resurrection", () => {
    const initial = {
      type: "feedbackSubmissionReservationEntity",
      version: "1.0.0",
      keyedSubject,
      reservationId,
      submissionKind: FeedbackSubmissionKind.BUG,
      state: FeedbackReservationState.RESERVED,
      attemptCount: 1,
      updatedAt,
      expiresAt: "2026-07-18T10:10:00.000Z",
      hardDeleteAt: "2026-07-19T10:10:00.000Z",
      ttlSeconds:
        (Date.parse("2026-07-19T10:10:00.000Z") -
          Date.parse(updatedAt)) /
        1_000,
      revision: 0,
    };
    const committed = {
      ...initial,
      state: FeedbackReservationState.COMMITTED,
      updatedAt: "2026-07-18T10:06:00.000Z",
      ttlSeconds:
        (Date.parse(initial.hardDeleteAt) -
          Date.parse("2026-07-18T10:06:00.000Z")) /
        1_000,
      revision: 1,
    };

    expect(
      feedbackSubmissionReservationEntitySchema.validate(committed, initial)
        .valid,
    ).toBe(true);
    expect(
      feedbackSubmissionReservationEntitySchema.validate(
        {
          ...committed,
          state: FeedbackReservationState.RESERVED,
          revision: 2,
        },
        committed,
      ).valid,
    ).toBe(false);
  });

  it.each([
    FeedbackReservationState.RESERVED,
    FeedbackReservationState.COMMITTED,
  ])(
    "rejects retention extension during reserved-to-%s transition",
    (nextState) => {
      const initial = {
        type: "feedbackSubmissionReservationEntity",
        version: "1.0.0",
        keyedSubject,
        reservationId,
        submissionKind: FeedbackSubmissionKind.BUG,
        state: FeedbackReservationState.RESERVED,
        attemptCount: 1,
        updatedAt,
        expiresAt: "2026-07-18T10:10:00.000Z",
        hardDeleteAt: "2026-07-19T10:10:00.000Z",
        ttlSeconds:
          (Date.parse("2026-07-19T10:10:00.000Z") -
            Date.parse(updatedAt)) /
          1_000,
        revision: 0,
      };
      const nextUpdatedAt = "2026-07-18T10:06:00.000Z";
      const extendedHardDeleteAt = "2026-07-19T10:11:00.000Z";
      const extended = {
        ...initial,
        state: nextState,
        attemptCount:
          nextState === FeedbackReservationState.RESERVED ? 2 : 1,
        updatedAt: nextUpdatedAt,
        expiresAt: "2026-07-18T10:11:00.000Z",
        hardDeleteAt: extendedHardDeleteAt,
        ttlSeconds:
          (Date.parse(extendedHardDeleteAt) -
            Date.parse(nextUpdatedAt)) /
          1_000,
        revision: 1,
      };

      expect(
        feedbackSubmissionReservationEntitySchema.validate(extended, initial)
          .valid,
      ).toBe(false);
    },
  );

  it.each([
    FeedbackReservationState.COMMITTED,
    FeedbackReservationState.RELEASED,
  ])(
    "requires RESERVED on create and freezes terminal %s reservations",
    (terminalState) => {
      const reserved = {
        type: "feedbackSubmissionReservationEntity",
        version: "1.0.0",
        keyedSubject,
        reservationId,
        submissionKind: FeedbackSubmissionKind.BUG,
        state: FeedbackReservationState.RESERVED,
        attemptCount: 1,
        updatedAt,
        expiresAt: "2026-07-18T10:10:00.000Z",
        hardDeleteAt: "2026-07-19T10:10:00.000Z",
        ttlSeconds:
          (Date.parse("2026-07-19T10:10:00.000Z") -
            Date.parse(updatedAt)) /
          1_000,
        revision: 0,
      };
      const terminal = {
        ...reserved,
        state: terminalState,
        revision: 1,
      };

      expect(
        feedbackSubmissionReservationEntitySchema.validate({
          ...reserved,
          state: terminalState,
        }).valid,
      ).toBe(false);
      expect(
        feedbackSubmissionReservationEntitySchema.validate(
          terminal,
          reserved,
        ).valid,
      ).toBe(true);
      expect(
        feedbackSubmissionReservationEntitySchema.validate(
          terminal,
          terminal,
        ).valid,
      ).toBe(true);

      const mutations = [
        { revision: 2 },
        { updatedAt: "2026-07-18T10:06:00.000Z", revision: 2 },
        { expiresAt: "2026-07-18T10:11:00.000Z", revision: 2 },
        { hardDeleteAt: "2026-07-19T10:11:00.000Z", revision: 2 },
        { ttlSeconds: terminal.ttlSeconds + 60, revision: 2 },
        { attemptCount: 2, revision: 2 },
        { state: FeedbackReservationState.RESERVED, revision: 2 },
      ];

      for (const mutation of mutations) {
        expect(
          feedbackSubmissionReservationEntitySchema.validate(
            { ...terminal, ...mutation },
            terminal,
          ).valid,
        ).toBe(false);
      }
    },
  );

  it("marks every control field internal so public serialization cannot expose correlation", () => {
    const serialized = feedbackSubmissionReservationEntitySchema.serialize({
      type: "feedbackSubmissionReservationEntity",
      version: "1.0.0",
      keyedSubject,
      reservationId,
      submissionKind: FeedbackSubmissionKind.BUG,
      state: FeedbackReservationState.RESERVED,
      attemptCount: 1,
      updatedAt,
      expiresAt: "2026-07-18T10:10:00.000Z",
      hardDeleteAt: "2026-07-19T10:10:00.000Z",
      ttlSeconds: 87_900,
      revision: 0,
    });

    expect(serialized).toEqual({
      type: "feedbackSubmissionReservationEntity",
      version: "1.0.0",
    });
  });

  it("classifies and redacts the keyed subject in log-safe projections", () => {
    const pseudonym = () => {
      throw new Error("A second pseudonym must not be derived for logging.");
    };
    const sanitized = feedbackAbuseControlEntitySchema.sanitizeForLog(
      {
        keyedSubject,
        acceptedBugCount: 1,
      },
      pseudonym,
    );

    expect(sanitized.keyedSubject).toBe("[REDACTED]");
    expect(
      feedbackAbuseControlEntitySchema.getPiiAudit(),
    ).toContainEqual({
      field: "keyedSubject",
      classification: "low",
      action: "none",
      logHandling: "redact",
      purpose: "feedback abuse and eligibility control",
    });
  });
});
