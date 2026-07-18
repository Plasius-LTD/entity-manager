import {
  createSchema,
  field,
  validateSemVer,
  type Infer,
  type Schema,
  type SchemaShape,
} from "@plasius/schema";
import { isCanonicalUtcTimestamp } from "../family/validation.js";

const MAX_HARD_DELETE_LAG_SECONDS = 7 * 24 * 60 * 60;
const MAX_TTL_SECONDS = 3 * 366 * 24 * 60 * 60;
const REVIEW_DENY_SECONDS = 30 * 24 * 60 * 60;
const BUG_QUIET_RESET_SECONDS = 48 * 60 * 60;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const KEYED_SUBJECT_PATTERN =
  /^fbs1\.[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u;
const RESERVATION_ID_PATTERN = /^fbr1\.[A-Za-z0-9_-]{21}[AQgw]$/u;
const DAY_WINDOW_PATTERN = /^day:(\d{4}-\d{2}-\d{2})$/u;
const HOUR_WINDOW_PATTERN =
  /^hour:(\d{4}-\d{2}-\d{2}T\d{2})$/u;
const RECONCILIATION_WINDOW_PATTERN =
  /^reconcile:(\d{4}-\d{2}-\d{2}T\d{2}):(00|05|10|15|20|25|30|35|40|45|50|55)$/u;

/** Maximum permitted delay between logical control expiry and hard deletion. */
export const FEEDBACK_CONTROL_MAX_HARD_DELETE_LAG_SECONDS =
  MAX_HARD_DELETE_LAG_SECONDS;
/** Exact accepted-review deny duration. */
export const FEEDBACK_REVIEW_DENY_SECONDS = REVIEW_DENY_SECONDS;
/** Exact quiet period after which the progressive bug ladder resets. */
export const FEEDBACK_BUG_QUIET_RESET_SECONDS = BUG_QUIET_RESET_SECONDS;
/** Progressive accepted-bug cooldown ladder, capped at 24 hours. */
export const FEEDBACK_BUG_COOLDOWN_SECONDS = [
  5 * 60,
  15 * 60,
  60 * 60,
  6 * 60 * 60,
  24 * 60 * 60,
] as const;

/** Closed kinds for actor-free feedback content-plane metadata. */
export const FeedbackArtifactKind = {
  BUG_PACKET: "bug-packet",
  REVIEW_PACKET: "review-packet",
  HOURLY_BUG_REPORT: "hourly-bug-report",
  DAILY_SATISFACTION_REPORT: "daily-satisfaction-report",
  PUBLIC_SUMMARY: "public-summary",
  MATERIALIZATION_MANIFEST: "materialization-manifest",
  GAME_RECONSTRUCTION: "game-reconstruction",
} as const;
export type FeedbackArtifactKind =
  (typeof FeedbackArtifactKind)[keyof typeof FeedbackArtifactKind];

/** Closed timer processors that may own a feedback checkpoint. */
export const FeedbackProcessor = {
  BUG_HOURLY: "bug-hourly",
  REVIEW_DAILY: "review-daily",
  COMMIT_RECONCILIATION: "commit-reconciliation",
} as const;
export type FeedbackProcessor =
  (typeof FeedbackProcessor)[keyof typeof FeedbackProcessor];

/** Submission surfaces protected by a reservation. */
export const FeedbackSubmissionKind = {
  BUG: "bug",
  REVIEW: "review",
} as const;
export type FeedbackSubmissionKind =
  (typeof FeedbackSubmissionKind)[keyof typeof FeedbackSubmissionKind];

/** Reservation lifecycle; committed and released records are terminal. */
export const FeedbackReservationState = {
  RESERVED: "reserved",
  COMMITTED: "committed",
  RELEASED: "released",
} as const;
export type FeedbackReservationState =
  (typeof FeedbackReservationState)[keyof typeof FeedbackReservationState];

type RevisionMode = "immutable" | "increment";

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function ownDataKeys(
  value: Record<string, unknown>,
): readonly string[] | undefined {
  try {
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) return undefined;

    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined
      ) {
        return undefined;
      }
    }

    return keys as string[];
  } catch {
    return undefined;
  }
}

function invalidResult(message: string) {
  return {
    valid: false as const,
    errors: [message],
    issues: [],
  };
}

/**
 * The schema package version consumed here predates closed-object validation.
 * Wrap validation so unexpected values are rejected rather than silently
 * dropped, which is essential at the content/control privacy boundary.
 */
function closeFeedbackSchema<S extends SchemaShape>(
  schema: Schema<S>,
  revisionMode: RevisionMode,
  transitionValidator?: (
    next: Record<string, unknown>,
    existing: Record<string, unknown>,
  ) => boolean,
  creationValidator?: (input: Record<string, unknown>) => boolean,
  exactReplayValidator?: (
    next: Record<string, unknown>,
    existing: Record<string, unknown>,
  ) => boolean,
): Schema<S> {
  const validate = schema.validate.bind(schema);
  const allowedFields = new Set(Object.keys(schema._shape));

  schema.validate = (input, existing) => {
    if (
      typeof input === "object" &&
      input !== null &&
      !isRecord(input)
    ) {
      return invalidResult("Feedback entity must be a plain object.");
    }

    if (isRecord(input)) {
      const inputKeys = ownDataKeys(input);
      if (inputKeys === undefined) {
        return invalidResult("Feedback entity must contain data fields only.");
      }

      for (const key of inputKeys) {
        if (!allowedFields.has(key)) {
          return invalidResult("Unsupported feedback entity field.");
        }
      }

      const revision = input.revision;
      if (
        !Number.isSafeInteger(revision) ||
        (existing === undefined && revision !== 0)
      ) {
        return invalidResult("Invalid feedback entity revision.");
      }
      if (
        existing === undefined &&
        creationValidator !== undefined &&
        !creationValidator(input)
      ) {
        return invalidResult("Invalid feedback entity initial state.");
      }

      if (revisionMode === "immutable" && revision !== 0) {
        return invalidResult("Immutable feedback entities use revision zero.");
      }

      if (existing !== undefined) {
        if (
          !isRecord(existing) ||
          ownDataKeys(existing) === undefined
        ) {
          return invalidResult("Invalid existing feedback entity.");
        }

        const existingRevision = existing.revision;
        const isExactReplay =
          exactReplayValidator !== undefined &&
          exactReplayValidator(input, existing) &&
          [...allowedFields].every((key) =>
            Object.is(input[key], existing[key]),
          );

        if (isExactReplay) {
          return validate(input, existing);
        }

        if (
          revisionMode === "increment" &&
          (!Number.isSafeInteger(existingRevision) ||
            revision !== Number(existingRevision) + 1)
        ) {
          return invalidResult("Feedback entity revision conflict.");
        }

        if (
          transitionValidator !== undefined &&
          !transitionValidator(input, existing)
        ) {
          return invalidResult("Invalid feedback entity state transition.");
        }
      }
    }

    return validate(input, existing);
  };

  return schema;
}

function canonicalTimestampField(description: string) {
  return field
    .string()
    .internal()
    .required()
    .version("1.0")
    .description(description)
    .validator(isCanonicalUtcTimestamp);
}

function feedbackWindowField(description: string) {
  return field
    .string()
    .internal()
    .required()
    .version("1.0")
    .description(description)
    .validator(isFeedbackWindowKey);
}

function artifactIdField(description: string, immutable = true) {
  const builder = field
    .string()
    .internal()
    .required()
    .version("1.0")
    .description(description)
    .validator((value) => UUID_V4_PATTERN.test(value));

  return immutable ? builder.immutable() : builder;
}

function revisionField(immutable = false) {
  const builder = field
    .number()
    .internal()
    .required()
    .version("1.0")
    .description("Optimistic-concurrency revision.")
    .validator(
      (value) =>
        Number.isSafeInteger(value) &&
        value >= 0 &&
        value <= Number.MAX_SAFE_INTEGER,
    );

  return immutable ? builder.immutable() : builder;
}

function ttlField(immutable = false) {
  const builder = field
    .number()
    .internal()
    .required()
    .version("1.0")
    .description(
      "Storage TTL in whole seconds, ending exactly at hardDeleteAt.",
    )
    .validator(
      (value) =>
        Number.isSafeInteger(value) &&
        value > 0 &&
        value <= MAX_TTL_SECONDS,
    );

  return immutable ? builder.immutable() : builder;
}

function keyedSubjectField() {
  return field
    .string()
    .internal()
    .immutable()
    .required()
    .version("1.0")
    .description(
      "Purpose- and version-scoped HMAC-SHA-256 subject; raw auth subjects are invalid.",
    )
    .validator((value) => KEYED_SUBJECT_PATTERN.test(value))
    .PID({
      classification: "low",
      action: "none",
      logHandling: "redact",
      purpose: "feedback abuse and eligibility control",
    });
}

function countField(description: string, minimum = 0, maximum = 1_000_000_000) {
  return field
    .number()
    .internal()
    .required()
    .version("1.0")
    .description(description)
    .validator(
      (value) =>
        Number.isSafeInteger(value) && value >= minimum && value <= maximum,
    );
}

function exactSecondsBetween(
  earlier: unknown,
  later: unknown,
): number | undefined {
  if (
    !isCanonicalUtcTimestamp(earlier) ||
    !isCanonicalUtcTimestamp(later)
  ) {
    return undefined;
  }

  const durationMilliseconds = Date.parse(later) - Date.parse(earlier);
  if (durationMilliseconds <= 0 || durationMilliseconds % 1_000 !== 0) {
    return undefined;
  }

  return durationMilliseconds / 1_000;
}

function isCanonicalDayWindow(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DAY_WINDOW_PATTERN.exec(value);
  if (match?.[1] === undefined) return false;

  const timestamp = Date.parse(`${match[1]}T00:00:00.000Z`);
  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === match[1]
  );
}

function isCanonicalHourWindow(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = HOUR_WINDOW_PATTERN.exec(value);
  if (match?.[1] === undefined) return false;

  const timestamp = Date.parse(`${match[1]}:00:00.000Z`);
  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 13) === match[1]
  );
}

function isCanonicalReconciliationWindow(
  value: unknown,
): value is string {
  if (typeof value !== "string") return false;
  const match = RECONCILIATION_WINDOW_PATTERN.exec(value);
  if (match?.[1] === undefined || match[2] === undefined) return false;

  const component = `${match[1]}:${match[2]}`;
  const timestamp = Date.parse(`${component}:00.000Z`);
  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 16) === component
  );
}

function isFeedbackWindowKey(value: unknown): value is string {
  return (
    isCanonicalDayWindow(value) ||
    isCanonicalHourWindow(value) ||
    isCanonicalReconciliationWindow(value)
  );
}

function windowMatchesProcessor(
  processor: unknown,
  windowKey: unknown,
): boolean {
  if (processor === FeedbackProcessor.BUG_HOURLY) {
    return isCanonicalHourWindow(windowKey);
  }
  if (processor === FeedbackProcessor.REVIEW_DAILY) {
    return isCanonicalDayWindow(windowKey);
  }
  if (processor === FeedbackProcessor.COMMIT_RECONCILIATION) {
    return isCanonicalReconciliationWindow(windowKey);
  }
  return false;
}

function isFeedbackCheckpointId(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 220) return false;

  for (const processor of Object.values(FeedbackProcessor)) {
    const prefix = `checkpoint:${processor}:`;
    if (
      value.startsWith(prefix) &&
      windowMatchesProcessor(processor, value.slice(prefix.length))
    ) {
      return true;
    }
  }

  return false;
}

function reportWindowMatchesArtifact(
  artifactKind: unknown,
  windowKey: unknown,
): boolean {
  if (artifactKind === FeedbackArtifactKind.HOURLY_BUG_REPORT) {
    return isCanonicalHourWindow(windowKey);
  }
  if (
    artifactKind === FeedbackArtifactKind.DAILY_SATISFACTION_REPORT ||
    artifactKind === FeedbackArtifactKind.PUBLIC_SUMMARY
  ) {
    return isCanonicalDayWindow(windowKey);
  }
  if (artifactKind === FeedbackArtifactKind.MATERIALIZATION_MANIFEST) {
    return isFeedbackWindowKey(windowKey);
  }
  return false;
}

function validateLifecycle(
  entity: Record<string, unknown>,
  anchorField: "createdAt" | "updatedAt",
): boolean {
  const ttlSeconds = exactSecondsBetween(
    entity[anchorField],
    entity.hardDeleteAt,
  );
  const hardDeleteLagSeconds = exactSecondsBetween(
    entity.expiresAt ?? entity.retentionExpiresAt,
    entity.hardDeleteAt,
  );

  return (
    ttlSeconds !== undefined &&
    ttlSeconds === entity.ttlSeconds &&
    (entity.hardDeleteAt ===
      (entity.expiresAt ?? entity.retentionExpiresAt) ||
      (hardDeleteLagSeconds !== undefined &&
        hardDeleteLagSeconds <= MAX_HARD_DELETE_LAG_SECONDS))
  );
}

function immutableArtifactShape() {
  return {
    artifactId: artifactIdField("Opaque identifier for the safe artifact."),
    contractVersion: field
      .string()
      .internal()
      .required()
      .immutable()
      .version("1.0")
      .description("Version of the structured artifact contract.")
      .validator(validateSemVer),
    createdAt: canonicalTimestampField(
      "Server-owned artifact creation timestamp.",
    ).immutable(),
    retentionExpiresAt: canonicalTimestampField(
      "Time after which the artifact is no longer live.",
    ).immutable(),
    hardDeleteAt: canonicalTimestampField(
      "Deadline for deleting live, soft-deleted, and backed-up copies.",
    ).immutable(),
    ttlSeconds: ttlField(true),
    revision: revisionField(true),
  };
}

function mutableControlShape() {
  return {
    keyedSubject: keyedSubjectField(),
    updatedAt: canonicalTimestampField(
      "Timestamp of the conditional control-state write.",
    ),
    expiresAt: canonicalTimestampField(
      "Logical expiry after which this control state has no effect.",
    ),
    hardDeleteAt: canonicalTimestampField(
      "Absolute deadline for hard deletion from live data and backups.",
    ),
    ttlSeconds: ttlField(),
    revision: revisionField(),
  };
}

const packetArtifactKinds = [
  FeedbackArtifactKind.BUG_PACKET,
  FeedbackArtifactKind.REVIEW_PACKET,
] as const;

const reportArtifactKinds = [
  FeedbackArtifactKind.HOURLY_BUG_REPORT,
  FeedbackArtifactKind.DAILY_SATISFACTION_REPORT,
  FeedbackArtifactKind.PUBLIC_SUMMARY,
  FeedbackArtifactKind.MATERIALIZATION_MANIFEST,
] as const;

export const systemManagedFeedbackPacketEntityShape = {
  artifactKind: field
    .string()
    .internal()
    .required()
    .immutable()
    .version("1.0")
    .description("Identifier-free packet kind.")
    .enum(packetArtifactKinds),
  ...immutableArtifactShape(),
};

/** Actor-free lifecycle metadata for an immutable structured feedback packet. */
export const systemManagedFeedbackPacketEntitySchema = closeFeedbackSchema(
  createSchema(
    systemManagedFeedbackPacketEntityShape,
    "systemManagedFeedbackPacketEntity",
    {
      version: "1.0.0",
      piiEnforcement: "strict",
      table: "feedbackContent",
      schemaValidator: (entity) =>
        validateLifecycle(entity as Record<string, unknown>, "createdAt"),
    },
  ),
  "immutable",
);
export type SystemManagedFeedbackPacketEntity = Infer<
  typeof systemManagedFeedbackPacketEntityShape
>;

export const systemManagedFeedbackReportEntityShape = {
  artifactKind: field
    .string()
    .internal()
    .required()
    .immutable()
    .version("1.0")
    .description("Identifier-free report or manifest kind.")
    .enum(reportArtifactKinds),
  windowKey: feedbackWindowField(
    "Purpose-prefixed canonical UTC materialization window.",
  ).immutable(),
  ...immutableArtifactShape(),
};

/** Actor-free lifecycle metadata for immutable materialized reports. */
export const systemManagedFeedbackReportEntitySchema = closeFeedbackSchema(
  createSchema(
    systemManagedFeedbackReportEntityShape,
    "systemManagedFeedbackReportEntity",
    {
      version: "1.0.0",
      piiEnforcement: "strict",
      table: "feedbackReports",
      schemaValidator: (entity) =>
        validateLifecycle(
          entity as Record<string, unknown>,
          "createdAt",
        ) &&
        reportWindowMatchesArtifact(
          entity.artifactKind,
          entity.windowKey,
        ),
    },
  ),
  "immutable",
);
export type SystemManagedFeedbackReportEntity = Infer<
  typeof systemManagedFeedbackReportEntityShape
>;

export const systemManagedFeedbackCheckpointEntityShape = {
  checkpointId: field
    .string()
    .internal()
    .required()
    .immutable()
    .version("1.0")
    .description(
      "Deterministic checkpoint:<processor>:<window> identifier.",
    )
    .validator(isFeedbackCheckpointId),
  processor: field
    .string()
    .internal()
    .required()
    .immutable()
    .version("1.0")
    .description("Timer processor owning this checkpoint.")
    .enum(Object.values(FeedbackProcessor)),
  windowKey: feedbackWindowField(
    "Purpose-prefixed canonical UTC processor window.",
  ).immutable(),
  completedAt: canonicalTimestampField(
    "Latest completion time for this checkpoint revision.",
  ),
  outputArtifactId: artifactIdField(
    "Opaque safe report identifier emitted for this revision.",
    false,
  ).optional(),
  updatedAt: canonicalTimestampField(
    "Timestamp of the conditional checkpoint write.",
  ),
  expiresAt: canonicalTimestampField(
    "Logical checkpoint retention expiry.",
  ),
  hardDeleteAt: canonicalTimestampField(
    "Absolute checkpoint hard-delete deadline.",
  ),
  ttlSeconds: ttlField(),
  revision: revisionField(),
};

/** Mutable ETag/checkpoint state with monotonic revision validation. */
export const systemManagedFeedbackCheckpointEntitySchema =
  closeFeedbackSchema(
    createSchema(
      systemManagedFeedbackCheckpointEntityShape,
      "systemManagedFeedbackCheckpointEntity",
      {
        version: "1.0.0",
        piiEnforcement: "strict",
        table: "feedbackReports",
        schemaValidator: (entity) =>
          validateLifecycle(entity as Record<string, unknown>, "updatedAt") &&
          windowMatchesProcessor(entity.processor, entity.windowKey) &&
          entity.checkpointId ===
            `checkpoint:${entity.processor}:${entity.windowKey}` &&
          (entity.processor === FeedbackProcessor.COMMIT_RECONCILIATION ||
            entity.outputArtifactId !== undefined),
      },
    ),
    "increment",
  );
export type SystemManagedFeedbackCheckpointEntity = Infer<
  typeof systemManagedFeedbackCheckpointEntityShape
>;

export const systemManagedFeedbackReconstructionEntityShape = {
  artifactKind: field
    .string()
    .internal()
    .required()
    .immutable()
    .version("1.0")
    .description("Safe server-side reconstruction marker.")
    .enum([FeedbackArtifactKind.GAME_RECONSTRUCTION] as const),
  sourceArtifactId: artifactIdField(
    "Identifier of the safe bug artifact used for reconstruction.",
  ),
  ...immutableArtifactShape(),
};

/** Metadata for a safe reconstruction, never client pixels or a screenshot. */
export const systemManagedFeedbackReconstructionEntitySchema =
  closeFeedbackSchema(
    createSchema(
      systemManagedFeedbackReconstructionEntityShape,
      "systemManagedFeedbackReconstructionEntity",
      {
        version: "1.0.0",
        piiEnforcement: "strict",
        table: "feedbackContent",
        schemaValidator: (entity) =>
          entity.sourceArtifactId !== entity.artifactId &&
          validateLifecycle(entity as Record<string, unknown>, "createdAt"),
      },
    ),
    "immutable",
  );
export type SystemManagedFeedbackReconstructionEntity = Infer<
  typeof systemManagedFeedbackReconstructionEntityShape
>;

export const feedbackAbuseControlEntityShape = {
  ...mutableControlShape(),
  acceptedBugCount: countField("Accepted bug counter.", 1),
  cooldownStreak: countField(
    "Progressive cooldown ladder index, capped at the 24-hour step.",
    0,
    4,
  ),
  cooldownExpiresAt: canonicalTimestampField(
    "Time at which the current bug cooldown ends.",
  ),
  quietResetExpiresAt: canonicalTimestampField(
    "Time after which the cooldown streak resets.",
  ),
};

function validateAbuseTransition(
  next: Record<string, unknown>,
  existing: Record<string, unknown>,
): boolean {
  if (
    !Number.isSafeInteger(next.acceptedBugCount) ||
    !Number.isSafeInteger(existing.acceptedBugCount) ||
    !Number.isSafeInteger(next.cooldownStreak) ||
    !Number.isSafeInteger(existing.cooldownStreak) ||
    !isCanonicalUtcTimestamp(next.updatedAt) ||
    !isCanonicalUtcTimestamp(existing.updatedAt) ||
    !isCanonicalUtcTimestamp(existing.cooldownExpiresAt) ||
    !isCanonicalUtcTimestamp(existing.quietResetExpiresAt)
  ) {
    return false;
  }

  const nextUpdatedAt = Date.parse(next.updatedAt);
  if (
    nextUpdatedAt <= Date.parse(existing.updatedAt) ||
    nextUpdatedAt < Date.parse(existing.cooldownExpiresAt)
  ) {
    return false;
  }

  const reset =
    nextUpdatedAt >= Date.parse(existing.quietResetExpiresAt);

  if (reset) {
    return next.acceptedBugCount === 1 && next.cooldownStreak === 0;
  }

  return (
    next.acceptedBugCount === Number(existing.acceptedBugCount) + 1 &&
    next.cooldownStreak ===
      Math.min(Number(existing.cooldownStreak) + 1, 4)
  );
}

/** Isolated anonymous/authenticated abuse state; never part of a packet. */
export const feedbackAbuseControlEntitySchema = closeFeedbackSchema(
  createSchema(
    feedbackAbuseControlEntityShape,
    "feedbackAbuseControlEntity",
    {
      version: "1.0.0",
      piiEnforcement: "strict",
      table: "feedbackControl",
      schemaValidator: (entity) => {
        const cooldownSeconds = exactSecondsBetween(
          entity.updatedAt,
          entity.cooldownExpiresAt,
        );
        const quietResetSeconds = exactSecondsBetween(
          entity.updatedAt,
          entity.quietResetExpiresAt,
        );

        return (
          validateLifecycle(
            entity as Record<string, unknown>,
            "updatedAt",
          ) &&
          cooldownSeconds ===
            FEEDBACK_BUG_COOLDOWN_SECONDS[entity.cooldownStreak] &&
          quietResetSeconds === BUG_QUIET_RESET_SECONDS &&
          entity.acceptedBugCount >= entity.cooldownStreak + 1 &&
          entity.expiresAt === entity.quietResetExpiresAt
        );
      },
    },
  ),
  "increment",
  validateAbuseTransition,
);
export type FeedbackAbuseControlEntity = Infer<
  typeof feedbackAbuseControlEntityShape
>;

export const feedbackReviewEligibilityEntityShape = {
  ...mutableControlShape(),
  acceptedReviewCount: countField("Accepted review counter.", 1),
  denyExpiresAt: canonicalTimestampField(
    "Expiry of the system-evaluated review capability deny overlay.",
  ),
};

function validateReviewEligibilityTransition(
  next: Record<string, unknown>,
  existing: Record<string, unknown>,
): boolean {
  return (
    Number.isSafeInteger(next.acceptedReviewCount) &&
    Number.isSafeInteger(existing.acceptedReviewCount) &&
    next.acceptedReviewCount === Number(existing.acceptedReviewCount) + 1 &&
    isCanonicalUtcTimestamp(next.updatedAt) &&
    isCanonicalUtcTimestamp(existing.denyExpiresAt) &&
    Date.parse(next.updatedAt) >= Date.parse(existing.denyExpiresAt)
  );
}

/** Thirty-day review eligibility overlay in the isolated control boundary. */
export const feedbackReviewEligibilityEntitySchema = closeFeedbackSchema(
  createSchema(
    feedbackReviewEligibilityEntityShape,
    "feedbackReviewEligibilityEntity",
    {
      version: "1.0.0",
      piiEnforcement: "strict",
      table: "feedbackControl",
      schemaValidator: (entity) =>
        validateLifecycle(entity as Record<string, unknown>, "updatedAt") &&
        exactSecondsBetween(entity.updatedAt, entity.denyExpiresAt) ===
          REVIEW_DENY_SECONDS &&
        entity.expiresAt === entity.denyExpiresAt,
    },
  ),
  "increment",
  validateReviewEligibilityTransition,
);
export type FeedbackReviewEligibilityEntity = Infer<
  typeof feedbackReviewEligibilityEntityShape
>;

export const feedbackSubmissionReservationEntityShape = {
  ...mutableControlShape(),
  reservationId: field
    .string()
    .internal()
    .required()
    .immutable()
    .version("1.0")
    .description("Random 128-bit reservation identifier.")
    .validator((value) => RESERVATION_ID_PATTERN.test(value)),
  submissionKind: field
    .string()
    .internal()
    .required()
    .immutable()
    .version("1.0")
    .description("Feedback surface protected by this reservation.")
    .enum(Object.values(FeedbackSubmissionKind)),
  state: field
    .string()
    .internal()
    .required()
    .version("1.0")
    .description("Reservation convergence state.")
    .enum(Object.values(FeedbackReservationState)),
  attemptCount: countField("Bounded reservation attempt counter.", 1),
};

function validateReservationTransition(
  next: Record<string, unknown>,
  existing: Record<string, unknown>,
): boolean {
  const previousState = existing.state;
  const nextState = next.state;

  if (previousState === FeedbackReservationState.RESERVED) {
    if (
      !Object.values(FeedbackReservationState).includes(
        nextState as FeedbackReservationState,
      ) ||
      !Number.isSafeInteger(next.attemptCount) ||
      !Number.isSafeInteger(existing.attemptCount) ||
      next.expiresAt !== existing.expiresAt ||
      next.hardDeleteAt !== existing.hardDeleteAt
    ) {
      return false;
    }

    return (
      (nextState === FeedbackReservationState.RESERVED &&
        next.attemptCount === Number(existing.attemptCount) + 1) ||
      (nextState !== FeedbackReservationState.RESERVED &&
        next.attemptCount === existing.attemptCount)
    );
  }

  return false;
}

function isInitialReservation(
  input: Record<string, unknown>,
): boolean {
  return (
    input.state === FeedbackReservationState.RESERVED &&
    input.attemptCount === 1
  );
}

function isTerminalReservation(
  _next: Record<string, unknown>,
  existing: Record<string, unknown>,
): boolean {
  return (
    existing.state === FeedbackReservationState.COMMITTED ||
    existing.state === FeedbackReservationState.RELEASED
  );
}

/**
 * Reservation/commit state contains no packet identifier, so content and
 * pseudonymous control records cannot be joined through this entity.
 */
export const feedbackSubmissionReservationEntitySchema =
  closeFeedbackSchema(
    createSchema(
      feedbackSubmissionReservationEntityShape,
      "feedbackSubmissionReservationEntity",
      {
        version: "1.0.0",
        piiEnforcement: "strict",
        table: "feedbackControl",
        schemaValidator: (entity) =>
          validateLifecycle(entity as Record<string, unknown>, "updatedAt"),
      },
    ),
    "increment",
    validateReservationTransition,
    isInitialReservation,
    isTerminalReservation,
  );
export type FeedbackSubmissionReservationEntity = Infer<
  typeof feedbackSubmissionReservationEntityShape
>;
