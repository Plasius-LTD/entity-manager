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
const MILLISECONDS_PER_SECOND = 1_000;
const PROGRESSIVE_COOLDOWN_RESERVATION_LEASE_MS = 5 * 60 * 1_000;
const PROGRESSIVE_COOLDOWN_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
const PROGRESSIVE_COOLDOWN_RESET_MS = 48 * 60 * 60 * 1_000;
const PROGRESSIVE_COOLDOWN_MAX_RESERVATIONS = 64;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const KEYED_SUBJECT_PATTERN =
  /^fbs1\.[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u;
const RESERVATION_ID_PATTERN = /^fbr1\.[A-Za-z0-9_-]{21}[AQgw]$/u;
const IDEMPOTENCY_DIGEST_PATTERN =
  /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u;
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

/**
 * Exact default progressive-cooldown policy shared with `@plasius/api`.
 *
 * This policy is deliberately closed: persisted feedback rows must not carry
 * caller-selected cooldown or retention values.
 */
export const FEEDBACK_PROGRESSIVE_COOLDOWN_LADDER_MS = Object.freeze([
  5 * 60 * 1_000,
  15 * 60 * 1_000,
  60 * 60 * 1_000,
  6 * 60 * 60 * 1_000,
  24 * 60 * 60 * 1_000,
] as const);
/** Exact five-minute reservation lease. */
export const FEEDBACK_PROGRESSIVE_COOLDOWN_RESERVATION_LEASE_MS =
  PROGRESSIVE_COOLDOWN_RESERVATION_LEASE_MS;
/** Exact seven-day post-expiry control retention. */
export const FEEDBACK_PROGRESSIVE_COOLDOWN_RETENTION_MS =
  PROGRESSIVE_COOLDOWN_RETENTION_MS;
/** Exact 48-hour quiet-reset duration. */
export const FEEDBACK_PROGRESSIVE_COOLDOWN_RESET_MS =
  PROGRESSIVE_COOLDOWN_RESET_MS;
/** Maximum number of retained reservation records in one control row. */
export const FEEDBACK_PROGRESSIVE_COOLDOWN_MAX_RESERVATIONS =
  PROGRESSIVE_COOLDOWN_MAX_RESERVATIONS;

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
  replayFieldComparator: (
    next: unknown,
    existing: unknown,
  ) => boolean = Object.is,
  rawInputValidator?: (input: Record<string, unknown>) => boolean,
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
      if (
        rawInputValidator !== undefined &&
        !rawInputValidator(input)
      ) {
        return invalidResult("Invalid feedback entity data.");
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
            replayFieldComparator(input[key], existing[key]),
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

export interface FeedbackProgressiveCooldownReservationRecord {
  readonly reservationId: string;
  readonly idempotencyDigest: string;
  readonly status: FeedbackReservationState;
  readonly reservedAtMs: number;
  readonly leaseExpiresAtMs: number;
  readonly retainUntilMs: number;
  readonly committedAtMs?: number;
  readonly committedStreak?: number;
  readonly cooldownDurationMs?: number;
  readonly cooldownUntilMs?: number;
  readonly releasedAtMs?: number;
}

export interface FeedbackProgressiveCooldownState {
  readonly schemaVersion: "1";
  readonly streak: number;
  readonly lastCommittedAtMs?: number;
  readonly cooldownUntilMs?: number;
  readonly reservations: readonly FeedbackProgressiveCooldownReservationRecord[];
  readonly purgeAfterMs: number;
}

/**
 * Adapter-private envelope for a single `@plasius/api`
 * `ProgressiveCooldownState` row.
 */
export interface FeedbackProgressiveCooldownAggregateEntity {
  readonly type: "feedbackProgressiveCooldownAggregateEntity";
  readonly version: "1.0.0";
  readonly stateId: string;
  readonly writtenAtMs: number;
  readonly ttlSeconds: number;
  readonly revision: number;
  readonly state: FeedbackProgressiveCooldownState;
}

function internalMillisecondField(description: string) {
  return field
    .number()
    .internal()
    .required()
    .version("1.0")
    .description(description)
    .validator(isNonnegativeSafeInteger);
}

function optionalInternalMillisecondField(description: string) {
  return field
    .number()
    .internal()
    .optional()
    .version("1.0")
    .description(description)
    .validator(isNonnegativeSafeInteger);
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function safeAddMilliseconds(
  timestamp: number,
  duration: number,
): number | undefined {
  const result = timestamp + duration;
  return Number.isSafeInteger(result) ? result : undefined;
}

function hasExactEnumerableDataKeys(
  value: unknown,
  required: ReadonlySet<string>,
  allowed: ReadonlySet<string> = required,
): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const keys = ownDataKeys(value);
  if (
    keys === undefined ||
    keys.some((key) => !allowed.has(key)) ||
    [...required].some((key) => !keys.includes(key))
  ) {
    return false;
  }

  return keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true;
  });
}

function isDenseDataArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;

  let keys: readonly PropertyKey[];
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) return false;
    keys = Reflect.ownKeys(value);
  } catch {
    return false;
  }

  if (
    keys.some(
      (key) =>
        typeof key !== "string" ||
        (key !== "length" &&
          (!/^(?:0|[1-9][0-9]*)$/u.test(key) ||
            Number(key) >= value.length)),
    ) ||
    keys.length !== value.length + 1
  ) {
    return false;
  }

  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      descriptor === undefined ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined ||
      descriptor.enumerable !== true
    ) {
      return false;
    }
  }

  return true;
}

function deepDataEqual(
  left: unknown,
  right: unknown,
  depth = 0,
): boolean {
  if (Object.is(left, right)) return true;
  if (depth > 8) return false;

  if (Array.isArray(left) || Array.isArray(right)) {
    if (
      !isDenseDataArray(left) ||
      !isDenseDataArray(right) ||
      left.length !== right.length
    ) {
      return false;
    }
    return left.every((value, index) =>
      deepDataEqual(value, right[index], depth + 1),
    );
  }

  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = ownDataKeys(left);
  const rightKeys = ownDataKeys(right);
  if (
    leftKeys === undefined ||
    rightKeys === undefined ||
    leftKeys.length !== rightKeys.length ||
    leftKeys.some((key) => !rightKeys.includes(key))
  ) {
    return false;
  }

  return leftKeys.every((key) => {
    const leftDescriptor = Object.getOwnPropertyDescriptor(left, key);
    const rightDescriptor = Object.getOwnPropertyDescriptor(right, key);
    return (
      leftDescriptor?.enumerable === true &&
      rightDescriptor?.enumerable === true &&
      deepDataEqual(left[key], right[key], depth + 1)
    );
  });
}

function progressiveAggregateReplayValueEqual(
  left: unknown,
  right: unknown,
): boolean {
  if (
    !hasExactEnumerableDataKeys(
      left,
      progressiveStateRequiredKeys,
      progressiveStateKeys,
    ) ||
    !hasExactEnumerableDataKeys(
      right,
      progressiveStateRequiredKeys,
      progressiveStateKeys,
    ) ||
    !isDenseDataArray(left.reservations) ||
    !isDenseDataArray(right.reservations)
  ) {
    return deepDataEqual(left, right);
  }

  const leftWithoutReservations = {
    ...left,
    reservations: undefined,
  };
  const rightWithoutReservations = {
    ...right,
    reservations: undefined,
  };
  if (
    !deepDataEqual(leftWithoutReservations, rightWithoutReservations) ||
    left.reservations.length !== right.reservations.length
  ) {
    return false;
  }

  const rightById = new Map<string, unknown>();
  for (const candidate of right.reservations) {
    if (!isRecord(candidate) || typeof candidate.reservationId !== "string") {
      return false;
    }
    rightById.set(candidate.reservationId, candidate);
  }
  return left.reservations.every(
    (candidate) =>
      isRecord(candidate) &&
      typeof candidate.reservationId === "string" &&
      deepDataEqual(candidate, rightById.get(candidate.reservationId)),
  );
}

const progressiveReservationCommonKeys = new Set([
  "reservationId",
  "idempotencyDigest",
  "status",
  "reservedAtMs",
  "leaseExpiresAtMs",
  "retainUntilMs",
]);
const progressiveReservedKeys = progressiveReservationCommonKeys;
const progressiveReleasedKeys = new Set([
  ...progressiveReservationCommonKeys,
  "releasedAtMs",
]);
const progressiveCommittedKeys = new Set([
  ...progressiveReservationCommonKeys,
  "committedAtMs",
  "committedStreak",
  "cooldownDurationMs",
  "cooldownUntilMs",
]);
const progressiveReservationKeys = new Set([
  ...progressiveCommittedKeys,
  "releasedAtMs",
]);
const progressiveStateRequiredKeys = new Set([
  "schemaVersion",
  "streak",
  "reservations",
  "purgeAfterMs",
]);
const progressiveStateKeys = new Set([
  ...progressiveStateRequiredKeys,
  "lastCommittedAtMs",
  "cooldownUntilMs",
]);

function validateProgressiveReservation(
  input: unknown,
  writtenAtMs: number,
): input is FeedbackProgressiveCooldownReservationRecord {
  if (!isRecord(input)) return false;
  const rawKeys = ownDataKeys(input);
  if (
    rawKeys === undefined ||
    rawKeys.some((key) => !progressiveReservationKeys.has(key)) ||
    rawKeys.some(
      (key) =>
        Object.getOwnPropertyDescriptor(input, key)?.enumerable !== true,
    )
  ) {
    return false;
  }
  const status = input.status;
  const exactKeys =
    status === FeedbackReservationState.RESERVED
      ? progressiveReservedKeys
      : status === FeedbackReservationState.RELEASED
        ? progressiveReleasedKeys
        : status === FeedbackReservationState.COMMITTED
          ? progressiveCommittedKeys
          : undefined;
  if (
    exactKeys === undefined ||
    !hasExactEnumerableDataKeys(input, exactKeys) ||
    typeof input.reservationId !== "string" ||
    !RESERVATION_ID_PATTERN.test(input.reservationId) ||
    typeof input.idempotencyDigest !== "string" ||
    !IDEMPOTENCY_DIGEST_PATTERN.test(input.idempotencyDigest) ||
    !isNonnegativeSafeInteger(input.reservedAtMs) ||
    input.reservedAtMs > writtenAtMs ||
    !isNonnegativeSafeInteger(input.leaseExpiresAtMs) ||
    input.leaseExpiresAtMs !==
      safeAddMilliseconds(
        input.reservedAtMs,
        PROGRESSIVE_COOLDOWN_RESERVATION_LEASE_MS,
      ) ||
    !isNonnegativeSafeInteger(input.retainUntilMs) ||
    input.retainUntilMs <= writtenAtMs
  ) {
    return false;
  }

  if (status === FeedbackReservationState.RESERVED) {
    return (
      input.retainUntilMs ===
      safeAddMilliseconds(
        input.leaseExpiresAtMs,
        PROGRESSIVE_COOLDOWN_RETENTION_MS,
      )
    );
  }

  if (status === FeedbackReservationState.RELEASED) {
    return (
      isNonnegativeSafeInteger(input.releasedAtMs) &&
      input.releasedAtMs >= input.reservedAtMs &&
      input.releasedAtMs <= writtenAtMs &&
      input.retainUntilMs ===
        safeAddMilliseconds(
          input.releasedAtMs,
          PROGRESSIVE_COOLDOWN_RETENTION_MS,
        )
    );
  }

  const committedAtMs = input.committedAtMs;
  const committedStreak = input.committedStreak;
  if (
    !isNonnegativeSafeInteger(committedAtMs) ||
    committedAtMs < input.reservedAtMs ||
    committedAtMs > writtenAtMs ||
    !isNonnegativeSafeInteger(committedStreak) ||
    committedStreak < 1 ||
    committedStreak >
      FEEDBACK_PROGRESSIVE_COOLDOWN_LADDER_MS.length
  ) {
    return false;
  }

  const expectedDuration =
    FEEDBACK_PROGRESSIVE_COOLDOWN_LADDER_MS[
      committedStreak - 1
    ];
  const expectedCooldownUntil =
    expectedDuration === undefined
      ? undefined
      : safeAddMilliseconds(committedAtMs, expectedDuration);
  const quietResetAt = safeAddMilliseconds(
    committedAtMs,
    PROGRESSIVE_COOLDOWN_RESET_MS,
  );
  const expectedRetainUntil =
    quietResetAt === undefined
      ? undefined
      : safeAddMilliseconds(
          quietResetAt,
          PROGRESSIVE_COOLDOWN_RETENTION_MS,
        );

  return (
    input.cooldownDurationMs === expectedDuration &&
    input.cooldownUntilMs === expectedCooldownUntil &&
    input.retainUntilMs === expectedRetainUntil
  );
}

function expectedProgressivePurgeAfterMs(
  state: FeedbackProgressiveCooldownState,
  writtenAtMs: number,
): number | undefined {
  let purgeAfterMs = writtenAtMs;

  for (const reservation of state.reservations) {
    purgeAfterMs = Math.max(purgeAfterMs, reservation.retainUntilMs);
  }

  if (state.lastCommittedAtMs !== undefined) {
    const resetAt = safeAddMilliseconds(
      state.lastCommittedAtMs,
      PROGRESSIVE_COOLDOWN_RESET_MS,
    );
    const retainUntil =
      resetAt === undefined
        ? undefined
        : safeAddMilliseconds(
            resetAt,
            PROGRESSIVE_COOLDOWN_RETENTION_MS,
          );
    if (retainUntil === undefined) return undefined;
    purgeAfterMs = Math.max(purgeAfterMs, retainUntil);
  }

  if (state.cooldownUntilMs !== undefined) {
    const retainUntil = safeAddMilliseconds(
      state.cooldownUntilMs,
      PROGRESSIVE_COOLDOWN_RETENTION_MS,
    );
    if (retainUntil === undefined) return undefined;
    purgeAfterMs = Math.max(purgeAfterMs, retainUntil);
  }

  return purgeAfterMs;
}

function validateCommittedSequence(
  records: readonly FeedbackProgressiveCooldownReservationRecord[],
): boolean {
  const commits = records
    .map((record, index) => ({ record, index }))
    .filter(
      (
        value,
      ): value is {
        record: FeedbackProgressiveCooldownReservationRecord & {
          committedAtMs: number;
          committedStreak: number;
          cooldownUntilMs: number;
        };
        index: number;
      } =>
        value.record.status === FeedbackReservationState.COMMITTED &&
        value.record.committedAtMs !== undefined &&
        value.record.committedStreak !== undefined &&
        value.record.cooldownUntilMs !== undefined,
    )
    .sort(
      (left, right) =>
        left.record.committedAtMs - right.record.committedAtMs ||
        left.record.committedStreak - right.record.committedStreak ||
        left.record.reservationId.localeCompare(
          right.record.reservationId,
        ) ||
        left.index - right.index,
    );

  for (let index = 1; index < commits.length; index += 1) {
    const previous = commits[index - 1]?.record;
    const current = commits[index]?.record;
    if (previous === undefined || current === undefined) return false;
    const expectedStreak =
      current.committedAtMs - previous.committedAtMs >=
      PROGRESSIVE_COOLDOWN_RESET_MS
        ? 1
        : Math.min(
            previous.committedStreak + 1,
            FEEDBACK_PROGRESSIVE_COOLDOWN_LADDER_MS.length,
          );
    if (current.committedStreak !== expectedStreak) return false;
  }

  return true;
}

function validateProgressiveAggregateLifecycle(
  input: Record<string, unknown>,
): boolean {
  const stateRecord = input.state;
  if (
    !isNonnegativeSafeInteger(input.writtenAtMs) ||
    safeAddMilliseconds(
      input.writtenAtMs,
      PROGRESSIVE_COOLDOWN_RESET_MS +
        PROGRESSIVE_COOLDOWN_RETENTION_MS,
    ) === undefined ||
    !isNonnegativeSafeInteger(input.ttlSeconds) ||
    !isRecord(stateRecord) ||
    !hasExactEnumerableDataKeys(
      stateRecord,
      progressiveStateRequiredKeys,
      progressiveStateKeys,
    ) ||
    stateRecord.schemaVersion !== "1" ||
    !isNonnegativeSafeInteger(stateRecord.streak) ||
    stateRecord.streak >
      FEEDBACK_PROGRESSIVE_COOLDOWN_LADDER_MS.length ||
    !isDenseDataArray(stateRecord.reservations) ||
    stateRecord.reservations.length >
      PROGRESSIVE_COOLDOWN_MAX_RESERVATIONS ||
    !isNonnegativeSafeInteger(stateRecord.purgeAfterMs) ||
    stateRecord.purgeAfterMs < input.writtenAtMs
  ) {
    return false;
  }

  const writtenAtMs = input.writtenAtMs;
  const reservations: FeedbackProgressiveCooldownReservationRecord[] = [];
  const reservationIds = new Set<string>();
  const idempotencyDigests = new Set<string>();
  let activeReservationCount = 0;
  for (const candidate of stateRecord.reservations) {
    if (
      !validateProgressiveReservation(candidate, writtenAtMs) ||
      reservationIds.has(candidate.reservationId) ||
      idempotencyDigests.has(candidate.idempotencyDigest)
    ) {
      return false;
    }
    reservationIds.add(candidate.reservationId);
    idempotencyDigests.add(candidate.idempotencyDigest);
    reservations.push(candidate);
    if (
      candidate.status === FeedbackReservationState.RESERVED &&
      candidate.leaseExpiresAtMs > writtenAtMs
    ) {
      activeReservationCount += 1;
    }
  }
  if (activeReservationCount > 1 || !validateCommittedSequence(reservations)) {
    return false;
  }

  const state = stateRecord as unknown as FeedbackProgressiveCooldownState;
  const streak = stateRecord.streak;
  const hasLastCommittedAt = Object.prototype.hasOwnProperty.call(
    stateRecord,
    "lastCommittedAtMs",
  );
  const hasCooldownUntil = Object.prototype.hasOwnProperty.call(
    stateRecord,
    "cooldownUntilMs",
  );
  const committed = reservations.filter(
    (
      record,
    ): record is FeedbackProgressiveCooldownReservationRecord & {
      committedAtMs: number;
      committedStreak: number;
      cooldownUntilMs: number;
    } =>
      record.status === FeedbackReservationState.COMMITTED &&
      record.committedAtMs !== undefined &&
      record.committedStreak !== undefined &&
      record.cooldownUntilMs !== undefined,
  );
  const latestCommittedAt = committed.reduce(
    (latest, record) => Math.max(latest, record.committedAtMs),
    -1,
  );

  if (streak === 0) {
    if (
      hasLastCommittedAt ||
      hasCooldownUntil ||
      (latestCommittedAt >= 0 &&
        writtenAtMs - latestCommittedAt <
          PROGRESSIVE_COOLDOWN_RESET_MS)
    ) {
      return false;
    }
  } else {
    if (
      !hasLastCommittedAt ||
      !hasCooldownUntil ||
      !isNonnegativeSafeInteger(stateRecord.lastCommittedAtMs) ||
      !isNonnegativeSafeInteger(stateRecord.cooldownUntilMs) ||
      stateRecord.lastCommittedAtMs > writtenAtMs ||
      writtenAtMs - stateRecord.lastCommittedAtMs >=
        PROGRESSIVE_COOLDOWN_RESET_MS ||
      latestCommittedAt > stateRecord.lastCommittedAtMs ||
      !committed.some(
        (record) =>
          record.committedAtMs === stateRecord.lastCommittedAtMs &&
          record.committedStreak === streak &&
          record.cooldownUntilMs === stateRecord.cooldownUntilMs,
      )
    ) {
      return false;
    }
  }

  const expectedPurgeAfterMs = expectedProgressivePurgeAfterMs(
    state,
    writtenAtMs,
  );
  if (
    expectedPurgeAfterMs === undefined ||
    stateRecord.purgeAfterMs !== expectedPurgeAfterMs
  ) {
    return false;
  }

  const expectedTtlSeconds = Math.max(
    0,
    Math.floor(
      (stateRecord.purgeAfterMs - writtenAtMs) /
        MILLISECONDS_PER_SECOND,
    ),
  );
  return input.ttlSeconds === expectedTtlSeconds;
}

type ProgressiveTransitionKind = "commit" | "release";

function validateProgressiveReservationTransition(
  next: FeedbackProgressiveCooldownReservationRecord,
  existing: FeedbackProgressiveCooldownReservationRecord,
  writtenAtMs: number,
): ProgressiveTransitionKind | "unchanged" | undefined {
  if (deepDataEqual(next, existing)) return "unchanged";
  if (
    next.reservationId !== existing.reservationId ||
    next.idempotencyDigest !== existing.idempotencyDigest ||
    next.reservedAtMs !== existing.reservedAtMs ||
    next.leaseExpiresAtMs !== existing.leaseExpiresAtMs
  ) {
    return undefined;
  }

  if (
    existing.status === FeedbackReservationState.RESERVED &&
    next.status === FeedbackReservationState.RELEASED &&
    next.releasedAtMs === writtenAtMs
  ) {
    return "release";
  }

  if (
    (existing.status === FeedbackReservationState.RESERVED ||
      existing.status === FeedbackReservationState.RELEASED) &&
    next.status === FeedbackReservationState.COMMITTED &&
    next.committedAtMs === writtenAtMs
  ) {
    return "commit";
  }

  return undefined;
}

function validateProgressiveAggregateTransition(
  nextRecord: Record<string, unknown>,
  existingRecord: Record<string, unknown>,
): boolean {
  if (
    !validateProgressiveAggregateLifecycle(nextRecord) ||
    !validateProgressiveAggregateLifecycle(existingRecord)
  ) {
    return false;
  }
  const next =
    nextRecord as unknown as FeedbackProgressiveCooldownAggregateEntity;
  const existing =
    existingRecord as unknown as FeedbackProgressiveCooldownAggregateEntity;
  if (
    next.stateId !== existing.stateId ||
    next.writtenAtMs < existing.writtenAtMs
  ) {
    return false;
  }

  const existingById = new Map(
    existing.state.reservations.map((reservation) => [
      reservation.reservationId,
      reservation,
    ]),
  );
  const nextById = new Map(
    next.state.reservations.map((reservation) => [
      reservation.reservationId,
      reservation,
    ]),
  );
  let pruned = 0;
  let transitioned = 0;
  let transitionKind: ProgressiveTransitionKind | undefined;
  const reset =
    existing.state.lastCommittedAtMs !== undefined &&
    next.writtenAtMs - existing.state.lastCommittedAtMs >=
      PROGRESSIVE_COOLDOWN_RESET_MS;
  const baseStreak = reset ? 0 : existing.state.streak;
  const baseLastCommittedAtMs = reset
    ? undefined
    : existing.state.lastCommittedAtMs;
  const baseCooldownUntilMs = reset
    ? undefined
    : existing.state.cooldownUntilMs;

  for (const existingReservation of existing.state.reservations) {
    const nextReservation = nextById.get(existingReservation.reservationId);
    if (nextReservation === undefined) {
      if (existingReservation.retainUntilMs > next.writtenAtMs) return false;
      pruned += 1;
      continue;
    }
    const result = validateProgressiveReservationTransition(
      nextReservation,
      existingReservation,
      next.writtenAtMs,
    );
    if (result === undefined) return false;
    if (result !== "unchanged") {
      transitioned += 1;
      transitionKind = result;
    }
  }

  const additions = next.state.reservations.filter(
    (reservation) => !existingById.has(reservation.reservationId),
  );
  if (
    additions.length > 1 ||
    transitioned > 1 ||
    additions.length + transitioned > 1
  ) {
    return false;
  }
  if (additions.length === 1) {
    const addition = additions[0];
    const hasActiveLease = existing.state.reservations.some(
      (reservation) =>
        reservation.status === FeedbackReservationState.RESERVED &&
        reservation.leaseExpiresAtMs > next.writtenAtMs,
    );
    if (
      addition === undefined ||
      addition.status !== FeedbackReservationState.RESERVED ||
      addition.reservedAtMs !== next.writtenAtMs ||
      hasActiveLease ||
      (baseCooldownUntilMs !== undefined &&
        baseCooldownUntilMs > next.writtenAtMs)
    ) {
      return false;
    }
  }
  if (additions.length === 0 && transitioned === 0 && pruned === 0) {
    return false;
  }

  if (transitionKind === "commit") {
    const expectedStreak = Math.min(
      baseStreak + 1,
      FEEDBACK_PROGRESSIVE_COOLDOWN_LADDER_MS.length,
    );
    const changed = next.state.reservations.find(
      (reservation) =>
        reservation.status === FeedbackReservationState.COMMITTED &&
        reservation.committedAtMs === next.writtenAtMs &&
        !deepDataEqual(
          reservation,
          existingById.get(reservation.reservationId),
        ),
    );
    return (
      changed?.committedStreak === expectedStreak &&
      next.state.streak === expectedStreak &&
      next.state.lastCommittedAtMs === next.writtenAtMs &&
      next.state.cooldownUntilMs === changed.cooldownUntilMs
    );
  }

  return (
    next.state.streak === baseStreak &&
    next.state.lastCommittedAtMs === baseLastCommittedAtMs &&
    next.state.cooldownUntilMs === baseCooldownUntilMs
  );
}

export const feedbackProgressiveCooldownReservationRecordShape = {
  reservationId: field
    .string()
    .internal()
    .required()
    .version("1.0")
    .description("Canonical random 128-bit reservation identifier.")
    .validator((value) => RESERVATION_ID_PATTERN.test(value))
    .PID({
      classification: "low",
      action: "none",
      logHandling: "redact",
      purpose: "feedback reservation convergence",
    }),
  idempotencyDigest: field
    .string()
    .internal()
    .required()
    .version("1.0")
    .description("Purpose-isolated canonical SHA-256 idempotency digest.")
    .validator((value) => IDEMPOTENCY_DIGEST_PATTERN.test(value))
    .PID({
      classification: "low",
      action: "none",
      logHandling: "redact",
      purpose: "feedback idempotency convergence",
    }),
  status: field
    .string()
    .internal()
    .required()
    .version("1.0")
    .description("Reservation convergence state.")
    .enum(Object.values(FeedbackReservationState)),
  reservedAtMs: internalMillisecondField(
    "Server-owned reservation creation epoch in milliseconds.",
  ),
  leaseExpiresAtMs: internalMillisecondField(
    "Exact five-minute reservation lease deadline.",
  ),
  retainUntilMs: internalMillisecondField(
    "Exact status-specific post-expiry retention deadline.",
  ),
  committedAtMs: optionalInternalMillisecondField(
    "Immutable-acceptance commit epoch in milliseconds.",
  ),
  committedStreak: field
    .number()
    .internal()
    .optional()
    .version("1.0")
    .description("One-based cooldown ladder step at commit.")
    .validator(
      (value) =>
        Number.isSafeInteger(value) &&
        value >= 1 &&
        value <= FEEDBACK_PROGRESSIVE_COOLDOWN_LADDER_MS.length,
    ),
  cooldownDurationMs: optionalInternalMillisecondField(
    "Closed cooldown-ladder duration selected at commit.",
  ),
  cooldownUntilMs: optionalInternalMillisecondField(
    "Absolute cooldown deadline selected at commit.",
  ),
  releasedAtMs: optionalInternalMillisecondField(
    "Reservation release epoch in milliseconds.",
  ),
};

export const feedbackProgressiveCooldownStateShape = {
  schemaVersion: field
    .string()
    .internal()
    .required()
    .version("1.0")
    .description("Closed @plasius/api progressive-cooldown state version.")
    .enum(["1"] as const),
  streak: field
    .number()
    .internal()
    .required()
    .version("1.0")
    .description("Current zero-to-five progressive cooldown streak.")
    .validator(
      (value) =>
        Number.isSafeInteger(value) &&
        value >= 0 &&
        value <= FEEDBACK_PROGRESSIVE_COOLDOWN_LADDER_MS.length,
    ),
  lastCommittedAtMs: optionalInternalMillisecondField(
    "Latest retained immutable-acceptance commit epoch.",
  ),
  cooldownUntilMs: optionalInternalMillisecondField(
    "Current progressive cooldown deadline.",
  ),
  reservations: field
    .array(
      field
        .object(feedbackProgressiveCooldownReservationRecordShape)
        .required()
        .as<FeedbackProgressiveCooldownReservationRecord>(),
    )
    .internal()
    .required()
    .max(PROGRESSIVE_COOLDOWN_MAX_RESERVATIONS)
    .version("1.0")
    .description("Bounded reservation, release, and reconciliation records."),
  purgeAfterMs: internalMillisecondField(
    "Absolute upper-bound deletion deadline for the complete aggregate.",
  ),
};

export const feedbackProgressiveCooldownAggregateEntityShape = {
  stateId: field
    .string()
    .internal()
    .required()
    .immutable()
    .version("1.0")
    .description(
      "Canonical fbs1 state ID derived from a purpose-scoped pseudonym.",
    )
    .validator((value) => KEYED_SUBJECT_PATTERN.test(value))
    .PID({
      classification: "low",
      action: "none",
      logHandling: "redact",
      purpose: "feedback abuse control",
    }),
  writtenAtMs: internalMillisecondField(
    "Server-owned epoch used to derive the row TTL.",
  ),
  ttlSeconds: field
    .number()
    .internal()
    .required()
    .version("1.0")
    .description(
      "Floor-rounded TTL; zero requires adapter-managed immediate expiry.",
    )
    .validator(
      (value) =>
        Number.isSafeInteger(value) &&
        value >= 0 &&
        value <= 10 * 24 * 60 * 60,
    ),
  revision: revisionField(),
  state: field
    .object(feedbackProgressiveCooldownStateShape)
    .internal()
    .required()
    .version("1.0")
    .description(
      "Wire-exact @plasius/api ProgressiveCooldownState; never a content join.",
    )
    .PID({
      classification: "low",
      action: "none",
      logHandling: "redact",
      purpose: "feedback abuse control aggregate",
    })
    .as<FeedbackProgressiveCooldownState>(),
};

/**
 * Authoritative single-row progressive bug cooldown and reservation aggregate.
 *
 * Store adapters must use a conditional write for `revision`, delete at or
 * before `state.purgeAfterMs`, and treat `ttlSeconds === 0` as immediate
 * expiry. The row contains no packet/artifact identifier or feedback content.
 */
export const feedbackProgressiveCooldownAggregateEntitySchema =
  closeFeedbackSchema(
    createSchema(
      feedbackProgressiveCooldownAggregateEntityShape,
      "feedbackProgressiveCooldownAggregateEntity",
      {
        version: "1.0.0",
        piiEnforcement: "strict",
        table: "feedbackControl",
        schemaValidator: (entity) =>
          validateProgressiveAggregateLifecycle(
            entity as unknown as Record<string, unknown>,
          ),
      },
    ),
    "increment",
    validateProgressiveAggregateTransition,
    undefined,
    () => true,
    progressiveAggregateReplayValueEqual,
    validateProgressiveAggregateLifecycle,
  );

/**
 * @deprecated Use `feedbackProgressiveCooldownAggregateEntitySchema`.
 * This pre-aggregate projection cannot represent reservations or reconciliation
 * atomically and is retained only for source compatibility.
 */
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

/**
 * @deprecated Use `feedbackProgressiveCooldownAggregateEntitySchema`.
 * This compatibility schema cannot provide a subject-wide reservation CAS.
 */
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
/** @deprecated Use `FeedbackProgressiveCooldownAggregateEntity`. */
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

/**
 * @deprecated Use `feedbackProgressiveCooldownAggregateEntitySchema`.
 * Per-reservation rows cannot enforce the subject-wide capacity/cooldown CAS.
 */
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
 *
 * @deprecated Use `feedbackProgressiveCooldownAggregateEntitySchema`.
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
/** @deprecated Use `FeedbackProgressiveCooldownReservationRecord`. */
export type FeedbackSubmissionReservationEntity = Infer<
  typeof feedbackSubmissionReservationEntityShape
>;
