import {
  FEEDBACK_BUG_COOLDOWN_SECONDS as SCHEMA_FEEDBACK_BUG_COOLDOWN_SECONDS,
  FEEDBACK_REVIEW_COOLDOWN_SECONDS,
  createSchema,
  field,
  validateSemVer,
  type Infer,
  type Schema,
  type SchemaShape,
} from "@plasius/schema";
import { isCanonicalUtcTimestamp } from "../family/validation.js";

const MAX_HARD_DELETE_LAG_SECONDS = 7 * 24 * 60 * 60;
const CONTROL_PURGE_SAFETY_SECONDS = 24 * 60 * 60;
const MAX_TTL_SECONDS = 3 * 366 * 24 * 60 * 60;
const REVIEW_DENY_SECONDS = FEEDBACK_REVIEW_COOLDOWN_SECONDS;
const BUG_QUIET_RESET_SECONDS = 48 * 60 * 60;
const DRAFT_TTL_SECONDS = 24 * 60 * 60;
const BUG_HEALTH_METRICS_COUNTER_SHARD_COUNT = 16;
const BUG_HEALTH_METRICS_FINALIZATION_DELAY_SECONDS = 2 * 60;
const BUG_HEALTH_METRICS_LIVE_RETENTION_SECONDS = 9 * 24 * 60 * 60;
const BUG_HEALTH_METRICS_PURGE_SAFETY_SECONDS = 24 * 60 * 60;
const BUG_HEALTH_METRICS_OPERATION_RECEIPT_TTL_SECONDS = 15 * 60;
const BUG_HEALTH_METRICS_OPERATION_RECEIPT_PURGE_SAFETY_SECONDS =
  24 * 60 * 60;
const MILLISECONDS_PER_SECOND = 1_000;
const PROGRESSIVE_COOLDOWN_RESERVATION_LEASE_MS = 5 * 60 * 1_000;
const PROGRESSIVE_COOLDOWN_RECONCILIATION_MS = 6 * 24 * 60 * 60 * 1_000;
const PROGRESSIVE_COOLDOWN_PURGE_SAFETY_MS = 24 * 60 * 60 * 1_000;
const COMMITTED_ACCEPTANCE_DELIVERY_GRACE_MS =
  PROGRESSIVE_COOLDOWN_RECONCILIATION_MS;
const COMMITTED_ACCEPTANCE_DELIVERY_PURGE_SAFETY_MS =
  PROGRESSIVE_COOLDOWN_PURGE_SAFETY_MS;
const PROGRESSIVE_COOLDOWN_RESET_MS = 48 * 60 * 60 * 1_000;
const PROGRESSIVE_COOLDOWN_MAX_RESERVATIONS = 64;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
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
const BUG_HEALTH_METRICS_COUNTER_ID_PATTERN =
  /^bug-hour:(\d{4}-\d{2}-\d{2}T\d{2}):(0[0-9]|1[0-5])$/u;

/** Maximum permitted delay between logical control expiry and hard deletion. */
export const FEEDBACK_CONTROL_MAX_HARD_DELETE_LAG_SECONDS =
  MAX_HARD_DELETE_LAG_SECONDS;
/** Reserved time for verified control deletion and bounded backup expiry. */
export const FEEDBACK_CONTROL_PURGE_SAFETY_SECONDS =
  CONTROL_PURGE_SAFETY_SECONDS;
/** Exact accepted-review deny duration. */
export const FEEDBACK_REVIEW_DENY_SECONDS = REVIEW_DENY_SECONDS;
/** Exact lifetime of a structured, narrative-free feedback draft. */
export const FEEDBACK_DRAFT_TTL_SECONDS = DRAFT_TTL_SECONDS;
/** Fixed number of contention-bounding rows for one metrics hour. */
export const FEEDBACK_BUG_HEALTH_METRICS_COUNTER_SHARD_COUNT =
  BUG_HEALTH_METRICS_COUNTER_SHARD_COUNT;
/** Earliest permitted seal after the end of an observed hour. */
export const FEEDBACK_BUG_HEALTH_METRICS_FINALIZATION_DELAY_SECONDS =
  BUG_HEALTH_METRICS_FINALIZATION_DELAY_SECONDS;
/** Live correction horizon for the private aggregate source. */
export const FEEDBACK_BUG_HEALTH_METRICS_LIVE_RETENTION_SECONDS =
  BUG_HEALTH_METRICS_LIVE_RETENTION_SECONDS;
/** Final hard-purge and bounded-backup safety interval. */
export const FEEDBACK_BUG_HEALTH_METRICS_PURGE_SAFETY_SECONDS =
  BUG_HEALTH_METRICS_PURGE_SAFETY_SECONDS;
/** Short live lifetime for atomic counter-operation reconciliation evidence. */
export const FEEDBACK_BUG_HEALTH_METRICS_OPERATION_RECEIPT_TTL_SECONDS =
  BUG_HEALTH_METRICS_OPERATION_RECEIPT_TTL_SECONDS;
/** Bounded deletion and backup-expiry safety window for operation receipts. */
export const FEEDBACK_BUG_HEALTH_METRICS_OPERATION_RECEIPT_PURGE_SAFETY_SECONDS =
  BUG_HEALTH_METRICS_OPERATION_RECEIPT_PURGE_SAFETY_SECONDS;
/** Exact quiet period after which the progressive bug ladder resets. */
export const FEEDBACK_BUG_QUIET_RESET_SECONDS = BUG_QUIET_RESET_SECONDS;
/** Progressive accepted-bug cooldown ladder, capped at 24 hours. */
export const FEEDBACK_BUG_COOLDOWN_SECONDS =
  SCHEMA_FEEDBACK_BUG_COOLDOWN_SECONDS;

/**
 * Exact default progressive-cooldown policy shared with `@plasius/api`.
 *
 * This policy is deliberately closed: persisted feedback rows must not carry
 * caller-selected cooldown or reconciliation values.
 */
export const FEEDBACK_PROGRESSIVE_COOLDOWN_LADDER_MS = Object.freeze([
  ...SCHEMA_FEEDBACK_BUG_COOLDOWN_SECONDS.map(
    (cooldownSeconds) => cooldownSeconds * MILLISECONDS_PER_SECOND,
  ),
] as const);
/** Exact five-minute reservation lease. */
export const FEEDBACK_PROGRESSIVE_COOLDOWN_RESERVATION_LEASE_MS =
  PROGRESSIVE_COOLDOWN_RESERVATION_LEASE_MS;
/** Exact six-day post-expiry reconciliation availability. */
export const FEEDBACK_PROGRESSIVE_COOLDOWN_RECONCILIATION_MS =
  PROGRESSIVE_COOLDOWN_RECONCILIATION_MS;
/**
 * Safety window reserved for explicit deletion, verification, and bounded
 * backup expiry before the absolute control-data purge deadline.
 */
export const FEEDBACK_PROGRESSIVE_COOLDOWN_PURGE_SAFETY_MS =
  PROGRESSIVE_COOLDOWN_PURGE_SAFETY_MS;
/** Exact 48-hour quiet-reset duration. */
export const FEEDBACK_PROGRESSIVE_COOLDOWN_RESET_MS =
  PROGRESSIVE_COOLDOWN_RESET_MS;
/**
 * Exact post-eligibility interval during which a committed acceptance remains
 * available for identifier-free evidence delivery.
 */
export const FEEDBACK_COMMITTED_ACCEPTANCE_DELIVERY_GRACE_MS =
  COMMITTED_ACCEPTANCE_DELIVERY_GRACE_MS;
/**
 * Final explicit-deletion and backup-expiry window before the absolute
 * control-data deadline.
 */
export const FEEDBACK_COMMITTED_ACCEPTANCE_DELIVERY_PURGE_SAFETY_MS =
  COMMITTED_ACCEPTANCE_DELIVERY_PURGE_SAFETY_MS;
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

/** Reservation lifecycle mirrored from the current `@plasius/api` wire state. */
export const FeedbackReservationState = {
  RESERVED: "reserved",
  WRITING: "writing",
  COMMITTED: "committed",
  RELEASED: "released",
} as const;
export type FeedbackReservationState =
  (typeof FeedbackReservationState)[keyof typeof FeedbackReservationState];

/** Closed terminal outcome bound to one atomic metrics counter operation. */
export const FeedbackBugHealthMetricsReceiptOutcome = {
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  COOLDOWN_FIVE_MINUTES: "cooldown-five-minutes",
  COOLDOWN_FIFTEEN_MINUTES: "cooldown-fifteen-minutes",
  COOLDOWN_ONE_HOUR: "cooldown-one-hour",
  COOLDOWN_SIX_HOURS: "cooldown-six-hours",
  COOLDOWN_TWENTY_FOUR_HOURS: "cooldown-twenty-four-hours",
  FAIL_CLOSED: "fail-closed",
} as const;
export type FeedbackBugHealthMetricsReceiptOutcome =
  (typeof FeedbackBugHealthMetricsReceiptOutcome)[
    keyof typeof FeedbackBugHealthMetricsReceiptOutcome
  ];

const DEPRECATED_FEEDBACK_RESERVATION_STATES = [
  FeedbackReservationState.RESERVED,
  FeedbackReservationState.COMMITTED,
  FeedbackReservationState.RELEASED,
] as const;

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
 * Preserve a second closed-object and data-descriptor boundary around the
 * schema-owned validator. `@plasius/schema` rejects unknown fields, while this
 * wrapper additionally rejects accessors, non-plain objects, invalid CAS
 * revisions, and unsafe state transitions before persistence.
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
        if (!isRecord(existing)) {
          return invalidResult("Invalid existing feedback entity.");
        }
        const existingKeys = ownDataKeys(existing);
        if (
          existingKeys === undefined ||
          existingKeys.some((key) => !allowedFields.has(key))
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

function draftIdField() {
  return field
    .string()
    .internal()
    .immutable()
    .required()
    .version("1.0")
    .description(
      "Opaque identifier for one short-lived structured feedback draft.",
    )
    .validator((value) => UUID_V4_PATTERN.test(value))
    .PID({
      classification: "low",
      action: "none",
      logHandling: "omit",
      purpose: "short-lived feedback draft lookup",
    });
}

function draftRevisionField() {
  return field
    .number()
    .internal()
    .required()
    .version("1.0")
    .description("ETag-protected structured draft revision.")
    .validator(
      (value) =>
        Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000,
    );
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
      "Maximum storage TTL budget in whole seconds before hardDeleteAt.",
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
  purgeSafetySeconds = 0,
): boolean {
  const lifetimeSeconds = exactSecondsBetween(
    entity[anchorField],
    entity.hardDeleteAt,
  );
  const ttlSeconds =
    lifetimeSeconds === undefined
      ? undefined
      : lifetimeSeconds - purgeSafetySeconds;
  const hardDeleteLagSeconds = exactSecondsBetween(
    entity.expiresAt ?? entity.retentionExpiresAt,
    entity.hardDeleteAt,
  );

  return (
    ttlSeconds !== undefined &&
    ttlSeconds > 0 &&
    ttlSeconds === entity.ttlSeconds &&
    (entity.hardDeleteAt ===
      (entity.expiresAt ?? entity.retentionExpiresAt) ||
      (hardDeleteLagSeconds !== undefined &&
        hardDeleteLagSeconds <= MAX_HARD_DELETE_LAG_SECONDS))
  );
}

function validateControlLifecycle(
  entity: Record<string, unknown>,
): boolean {
  const purgeWindowSeconds = exactSecondsBetween(
    entity.expiresAt,
    entity.hardDeleteAt,
  );
  return (
    purgeWindowSeconds !== undefined &&
    purgeWindowSeconds >= CONTROL_PURGE_SAFETY_SECONDS &&
    validateLifecycle(
      entity,
      "updatedAt",
      CONTROL_PURGE_SAFETY_SECONDS,
    )
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

function validateDraftLifecycle(entity: Record<string, unknown>): boolean {
  return (
    exactSecondsBetween(entity.updatedAt, entity.expiresAt) ===
      DRAFT_TTL_SECONDS &&
    entity.expiresAt === entity.hardDeleteAt &&
    entity.ttlSeconds === DRAFT_TTL_SECONDS
  );
}

function validateDraftTransition(
  next: Record<string, unknown>,
  existing: Record<string, unknown>,
): boolean {
  return (
    validateDraftLifecycle(existing) &&
    next.draftId === existing.draftId &&
    next.submissionKind === existing.submissionKind &&
    next.contractVersion === existing.contractVersion &&
    isCanonicalUtcTimestamp(next.updatedAt) &&
    isCanonicalUtcTimestamp(existing.updatedAt) &&
    Date.parse(next.updatedAt) > Date.parse(existing.updatedAt)
  );
}

export const systemManagedFeedbackDraftEntityShape = {
  draftId: draftIdField(),
  submissionKind: field
    .string()
    .internal()
    .immutable()
    .required()
    .version("1.0")
    .description("Closed feedback branch owned by this draft.")
    .enum(Object.values(FeedbackSubmissionKind)),
  contractVersion: field
    .string()
    .internal()
    .immutable()
    .required()
    .version("1.0")
    .description("Version of the schema-owned structured draft packet.")
    .validator(validateSemVer),
  updatedAt: canonicalTimestampField(
    "Server-owned instant of the latest conditional draft save.",
  ),
  expiresAt: canonicalTimestampField(
    "Exact 24-hour expiry of the structured draft.",
  ),
  hardDeleteAt: canonicalTimestampField(
    "Exact draft deletion deadline; no soft-delete extension is allowed.",
  ),
  ttlSeconds: ttlField(),
  revision: draftRevisionField(),
};

/**
 * Actor-free persistence metadata for a schema-validated structured draft.
 *
 * Adapters compose this metadata with the separately schema-validated draft
 * packet inside one conditional storage operation. The packet remains outside
 * this entity shape so this package cannot weaken its closed structured-field
 * contract. Narrative, ciphertext, pixels, reporter keys, and final packet
 * identifiers are never valid entity fields.
 */
export const systemManagedFeedbackDraftEntitySchema = closeFeedbackSchema(
  createSchema(
    systemManagedFeedbackDraftEntityShape,
    "systemManagedFeedbackDraftEntity",
    {
      version: "1.0.0",
      piiEnforcement: "strict",
      table: "feedbackDrafts",
      unknownFields: "reject",
      identity: "exact",
      schemaValidator: (entity) =>
        validateDraftLifecycle(entity as Record<string, unknown>),
    },
  ),
  "increment",
  validateDraftTransition,
  undefined,
  () => true,
);
export type SystemManagedFeedbackDraftEntity = Infer<
  typeof systemManagedFeedbackDraftEntityShape
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
  readonly reconciliationUntilMs: number;
  readonly attemptGeneration?: number;
  readonly attemptTokenDigest?: string;
  readonly writeStartedAtMs?: number;
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
  readonly hardDeleteByMs: number;
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

const METRICS_HOUR_MS = 60 * 60 * 1_000;
const METRICS_MINUTE_MS = 60 * 1_000;
const METRICS_ABUSE_BLOCK_COUNT_KEY_NAMES = [
  "fiveMinutes",
  "fifteenMinutes",
  "oneHour",
  "sixHours",
  "twentyFourHours",
  "failClosed",
] as const;
type FeedbackBugHealthMetricsAbuseBlockCountKey =
  (typeof METRICS_ABUSE_BLOCK_COUNT_KEY_NAMES)[number];
const METRICS_ABUSE_BLOCK_COUNT_KEYS: ReadonlySet<
  FeedbackBugHealthMetricsAbuseBlockCountKey
> = new Set(METRICS_ABUSE_BLOCK_COUNT_KEY_NAMES);

/** Closed application-owned progressive-cooldown and fail-closed counters. */
export interface FeedbackBugHealthMetricsAbuseBlockCounts {
  readonly fiveMinutes: number;
  readonly fifteenMinutes: number;
  readonly oneHour: number;
  readonly sixHours: number;
  readonly twentyFourHours: number;
  readonly failClosed: number;
}

function isCanonicalMinuteTimestamp(value: unknown): value is string {
  if (!isCanonicalUtcTimestamp(value)) return false;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch)
    && new Date(epoch).toISOString() === value
    && epoch % METRICS_MINUTE_MS === 0;
}

function isCanonicalMetricsHour(
  windowStart: unknown,
  windowEnd: unknown,
): windowStart is string {
  if (
    !isCanonicalUtcTimestamp(windowStart)
    || !isCanonicalUtcTimestamp(windowEnd)
  ) {
    return false;
  }
  const start = Date.parse(windowStart);
  const end = Date.parse(windowEnd);
  return Number.isFinite(start)
    && Number.isFinite(end)
    && new Date(start).toISOString() === windowStart
    && new Date(end).toISOString() === windowEnd
    && start % METRICS_HOUR_MS === 0
    && end - start === METRICS_HOUR_MS;
}

function metricsCount(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && Number(value) >= 0
    && Number(value) <= 1_000_000_000;
}

function metricsAbuseBlockCounts(
  value: unknown,
): value is FeedbackBugHealthMetricsAbuseBlockCounts {
  return hasExactEnumerableDataKeys(
    value,
    METRICS_ABUSE_BLOCK_COUNT_KEYS,
  ) && [...METRICS_ABUSE_BLOCK_COUNT_KEYS].every((key) =>
    metricsCount(value[key]));
}

function metricsHeartbeatSlots(value: unknown): value is readonly number[] {
  if (!isDenseDataArray(value) || value.length > 60) return false;
  let previous = -1;
  for (const slot of value) {
    if (
      !Number.isSafeInteger(slot)
      || Number(slot) < 0
      || Number(slot) > 59
      || Number(slot) <= previous
    ) {
      return false;
    }
    previous = Number(slot);
  }
  return true;
}

function metricsCounterNestedData(input: Record<string, unknown>): boolean {
  return metricsAbuseBlockCounts(input.abuseBlockCounts)
    && metricsHeartbeatSlots(input.heartbeatMinuteSlots);
}

function metricsCounterIdentityMatches(
  counterId: unknown,
  windowStart: unknown,
  shard: unknown,
): boolean {
  if (
    typeof counterId !== "string"
    || typeof windowStart !== "string"
    || !Number.isSafeInteger(shard)
  ) {
    return false;
  }
  const match = BUG_HEALTH_METRICS_COUNTER_ID_PATTERN.exec(counterId);
  return match?.[1] === windowStart.slice(0, 13)
    && Number(match[2]) === shard;
}

function metricsCounterLifecycle(input: Record<string, unknown>): boolean {
  if (
    !isCanonicalMetricsHour(input.windowStart, input.windowEnd)
    || !isCanonicalMinuteTimestamp(input.updatedAt)
    || !isCanonicalUtcTimestamp(input.expiresAt)
    || !isCanonicalUtcTimestamp(input.hardDeleteAt)
  ) {
    return false;
  }
  const windowStart = Date.parse(input.windowStart);
  const windowEnd = Date.parse(input.windowEnd as string);
  const updatedAt = Date.parse(input.updatedAt);
  const expiresAt = Date.parse(input.expiresAt);
  const hardDeleteAt = Date.parse(input.hardDeleteAt);
  return updatedAt >= windowStart
    && updatedAt < expiresAt
    && expiresAt === windowEnd
      + BUG_HEALTH_METRICS_LIVE_RETENTION_SECONDS * MILLISECONDS_PER_SECOND
    && hardDeleteAt === expiresAt
      + BUG_HEALTH_METRICS_PURGE_SAFETY_SECONDS * MILLISECONDS_PER_SECOND
    && input.ttlSeconds === (expiresAt - updatedAt) / MILLISECONDS_PER_SECOND;
}

function metricsCounterState(input: Record<string, unknown>): boolean {
  if (
    !metricsCounterNestedData(input)
    || !metricsCounterLifecycle(input)
    || !Number.isSafeInteger(input.shard)
    || Number(input.shard) < 0
    || Number(input.shard) >= BUG_HEALTH_METRICS_COUNTER_SHARD_COUNT
    || !metricsCounterIdentityMatches(
      input.counterId,
      input.windowStart,
      input.shard,
    )
    || !metricsCount(input.terminalAttemptCount)
    || !metricsCount(input.rejectedCount)
    || Number(input.rejectedCount) > Number(input.terminalAttemptCount)
    || [...METRICS_ABUSE_BLOCK_COUNT_KEYS].reduce(
      (total, key) => total
        + Number((input.abuseBlockCounts as Record<string, unknown>)[key]),
      0,
    ) > Number(input.rejectedCount)
    || (input.shard !== 0
      && (input.heartbeatMinuteSlots as readonly unknown[]).length !== 0)
    || typeof input.finalized !== "boolean"
  ) {
    return false;
  }
  const heartbeatMinuteSlots = input.heartbeatMinuteSlots as readonly number[];
  if (input.finalized === false) {
    return !Object.prototype.hasOwnProperty.call(input, "finalizedAt");
  }
  const earliestFinalization = Date.parse(input.windowEnd as string)
    + BUG_HEALTH_METRICS_FINALIZATION_DELAY_SECONDS * MILLISECONDS_PER_SECOND;
  return isCanonicalMinuteTimestamp(input.finalizedAt)
    && input.finalizedAt === input.updatedAt
    && Date.parse(input.finalizedAt) >= earliestFinalization
    && (input.shard === 0
      ? heartbeatMinuteSlots.length === 60
      : heartbeatMinuteSlots.length === 0);
}

function metricsCounterCreation(input: Record<string, unknown>): boolean {
  const abuseBlockCounts = input.abuseBlockCounts;
  return metricsCounterState(input)
    && input.finalized === false
    && input.revision === 0
    && input.terminalAttemptCount === 0
    && input.rejectedCount === 0
    && metricsAbuseBlockCounts(abuseBlockCounts)
    && [...METRICS_ABUSE_BLOCK_COUNT_KEYS].every(
      (key) => abuseBlockCounts[key] === 0,
    )
    && metricsHeartbeatSlots(input.heartbeatMinuteSlots)
    && input.heartbeatMinuteSlots.length === 0
    && Date.parse(input.updatedAt as string)
      < Date.parse(input.windowEnd as string);
}

function metricsCountsEqual(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  return left.terminalAttemptCount === right.terminalAttemptCount
    && left.rejectedCount === right.rejectedCount
    && deepDataEqual(left.abuseBlockCounts, right.abuseBlockCounts);
}

function metricsOutcomeTransition(
  next: Record<string, unknown>,
  existing: Record<string, unknown>,
): boolean {
  const nextAbuse = next.abuseBlockCounts as Record<string, number>;
  const existingAbuse = existing.abuseBlockCounts as Record<string, number>;
  const abuseDeltas = [...METRICS_ABUSE_BLOCK_COUNT_KEYS].map(
    (key) => nextAbuse[key]! - existingAbuse[key]!,
  );
  const rejectedDelta = Number(next.rejectedCount)
    - Number(existing.rejectedCount);
  return Number(next.terminalAttemptCount)
      - Number(existing.terminalAttemptCount) === 1
    && (rejectedDelta === 0 || rejectedDelta === 1)
    && abuseDeltas.every((delta) => delta === 0 || delta === 1)
    && abuseDeltas.reduce<number>((total, delta) => total + delta, 0) <= 1
    && (abuseDeltas.some((delta) => delta === 1)
      ? rejectedDelta === 1
      : true)
    && deepDataEqual(
      next.heartbeatMinuteSlots,
      existing.heartbeatMinuteSlots,
    )
    && next.finalized === false
    && existing.finalized === false
    && Date.parse(next.updatedAt as string)
      < Date.parse(next.windowEnd as string);
}

function metricsHeartbeatTransition(
  next: Record<string, unknown>,
  existing: Record<string, unknown>,
): boolean {
  if (
    next.shard !== 0
    || next.finalized !== false
    || existing.finalized !== false
    || !metricsCountsEqual(next, existing)
  ) {
    return false;
  }
  const nextSlots = next.heartbeatMinuteSlots as readonly number[];
  const existingSlots = existing.heartbeatMinuteSlots as readonly number[];
  if (
    nextSlots.length !== existingSlots.length + 1
    || existingSlots.some((slot) => !nextSlots.includes(slot))
  ) {
    return false;
  }
  const added = nextSlots.find((slot) => !existingSlots.includes(slot));
  const expectedUpdatedAt = added === undefined
    ? undefined
    : Date.parse(next.windowStart as string) + added * METRICS_MINUTE_MS;
  return added === existingSlots.length
    && expectedUpdatedAt !== undefined
    && Date.parse(next.updatedAt as string) === expectedUpdatedAt;
}

function metricsFinalizationTransition(
  next: Record<string, unknown>,
  existing: Record<string, unknown>,
): boolean {
  return existing.finalized === false
    && next.finalized === true
    && metricsCountsEqual(next, existing)
    && deepDataEqual(
      next.heartbeatMinuteSlots,
      existing.heartbeatMinuteSlots,
    );
}

function metricsCounterTransition(
  next: Record<string, unknown>,
  existing: Record<string, unknown>,
): boolean {
  if (
    !metricsCounterState(next)
    || !metricsCounterState(existing)
    || existing.finalized !== false
    || next.counterId !== existing.counterId
    || next.windowStart !== existing.windowStart
    || next.windowEnd !== existing.windowEnd
    || next.shard !== existing.shard
    || next.expiresAt !== existing.expiresAt
    || next.hardDeleteAt !== existing.hardDeleteAt
    || Date.parse(next.updatedAt as string)
      < Date.parse(existing.updatedAt as string)
  ) {
    return false;
  }
  const transitions = [
    metricsOutcomeTransition(next, existing),
    metricsHeartbeatTransition(next, existing),
    metricsFinalizationTransition(next, existing),
  ].filter(Boolean);
  return transitions.length === 1;
}

export const feedbackBugHealthMetricsAbuseBlockCountsShape = {
  fiveMinutes: countField("Five-minute cooldown blocks."),
  fifteenMinutes: countField("Fifteen-minute cooldown blocks."),
  oneHour: countField("One-hour cooldown blocks."),
  sixHours: countField("Six-hour cooldown blocks."),
  twentyFourHours: countField("Twenty-four-hour cooldown blocks."),
  failClosed: countField("Fail-closed application dependency blocks."),
};

export const feedbackBugHealthMetricsCounterEntityShape = {
  counterId: field
    .string()
    .internal()
    .immutable()
    .required()
    .version("1.0")
    .description("Deterministic identifier for one UTC hour and fixed shard.")
    .validator((value) => BUG_HEALTH_METRICS_COUNTER_ID_PATTERN.test(value)),
  windowStart: canonicalTimestampField(
    "Canonical UTC start of the aggregate hour.",
  ).immutable(),
  windowEnd: canonicalTimestampField(
    "Exclusive canonical UTC end of the aggregate hour.",
  ).immutable(),
  shard: field
    .number()
    .internal()
    .immutable()
    .required()
    .version("1.0")
    .description("Fixed contention-bounding shard index.")
    .validator((value) => Number.isSafeInteger(value)
      && value >= 0
      && value < BUG_HEALTH_METRICS_COUNTER_SHARD_COUNT),
  terminalAttemptCount: countField(
    "Terminal application bug-submission attempts.",
  ),
  rejectedCount: countField("Rejected terminal application attempts."),
  abuseBlockCounts: field
    .object(feedbackBugHealthMetricsAbuseBlockCountsShape)
    .internal()
    .required()
    .version("1.0")
    .description("Closed application-owned cooldown and fail-closed bands.")
    .as<FeedbackBugHealthMetricsAbuseBlockCounts>(),
  heartbeatMinuteSlots: field
    .array(
      field
        .number()
        .internal()
        .required()
        .version("1.0")
        .validator((value) => Number.isSafeInteger(value)
          && value >= 0
          && value <= 59),
    )
    .internal()
    .required()
    .max(60)
    .version("1.0")
    .description("Sorted shard-zero source-completeness minute slots."),
  finalized: field
    .boolean()
    .internal()
    .required()
    .version("1.0")
    .description("Terminal seal for this exact counter shard."),
  finalizedAt: field
    .string()
    .internal()
    .optional()
    .version("1.0")
    .description("Minute-rounded server finalization instant.")
    .validator(isCanonicalMinuteTimestamp),
  updatedAt: field
    .string()
    .internal()
    .required()
    .version("1.0")
    .description("Minute-rounded server conditional-write instant.")
    .validator(isCanonicalMinuteTimestamp),
  expiresAt: canonicalTimestampField(
    "End of the nine-day live correction horizon.",
  ).immutable(),
  hardDeleteAt: canonicalTimestampField(
    "Absolute deadline for deleting live and bounded backup copies.",
  ).immutable(),
  ttlSeconds: ttlField(),
  revision: revisionField(),
};

/**
 * Identifier-free, fixed-hour mutable counter shard for the isolated metrics
 * source. Persistence must combine revision validation with an ETag or
 * transactional condition and must never treat a missing hour as zero.
 */
export const feedbackBugHealthMetricsCounterEntitySchema =
  closeFeedbackSchema(
    createSchema(
      feedbackBugHealthMetricsCounterEntityShape,
      "feedbackBugHealthMetricsCounterEntity",
      {
        version: "1.0.0",
        piiEnforcement: "strict",
        table: "feedbackMetricsControl",
        unknownFields: "reject",
        identity: "exact",
        schemaValidator: (entity) =>
          metricsCounterState(entity as Record<string, unknown>),
      },
    ),
    "increment",
    metricsCounterTransition,
    metricsCounterCreation,
    () => true,
    deepDataEqual,
    metricsCounterNestedData,
  );
export type FeedbackBugHealthMetricsCounterEntity = Infer<
  typeof feedbackBugHealthMetricsCounterEntityShape
>;

const METRICS_RECEIPT_OUTCOMES = Object.freeze(
  Object.values(FeedbackBugHealthMetricsReceiptOutcome),
);

function metricsOperationReceiptState(
  input: Record<string, unknown>,
): boolean {
  if (
    typeof input.receiptId !== "string"
    || !UUID_V4_PATTERN.test(input.receiptId)
    || typeof input.counterId !== "string"
    || !Number.isSafeInteger(input.shard)
    || !metricsCounterIdentityMatches(
      input.counterId,
      input.windowStart,
      input.shard,
    )
    || !isCanonicalMetricsHour(input.windowStart, input.windowEnd)
    || !Number.isSafeInteger(input.counterRevisionAfter)
    || Number(input.counterRevisionAfter) < 1
    || !METRICS_RECEIPT_OUTCOMES.includes(
      input.outcome as FeedbackBugHealthMetricsReceiptOutcome,
    )
    || !isCanonicalMinuteTimestamp(input.recordedAt)
    || !isCanonicalUtcTimestamp(input.expiresAt)
    || !isCanonicalUtcTimestamp(input.hardDeleteAt)
    || input.ttlSeconds
      !== BUG_HEALTH_METRICS_OPERATION_RECEIPT_TTL_SECONDS
    || input.revision !== 0
  ) {
    return false;
  }

  const recordedAt = Date.parse(input.recordedAt);
  const windowStart = Date.parse(input.windowStart as string);
  const windowEnd = Date.parse(input.windowEnd as string);
  const expiresAt = Date.parse(input.expiresAt);
  const hardDeleteAt = Date.parse(input.hardDeleteAt);
  return recordedAt >= windowStart
    && recordedAt < windowEnd
    && expiresAt === recordedAt
      + BUG_HEALTH_METRICS_OPERATION_RECEIPT_TTL_SECONDS
        * MILLISECONDS_PER_SECOND
    && hardDeleteAt === expiresAt
      + BUG_HEALTH_METRICS_OPERATION_RECEIPT_PURGE_SAFETY_SECONDS
        * MILLISECONDS_PER_SECOND;
}

export const feedbackBugHealthMetricsOperationReceiptEntityShape = {
  receiptId: artifactIdField(
    "Server-random identity for one atomic metrics counter operation.",
  ),
  counterId: field
    .string()
    .internal()
    .immutable()
    .required()
    .version("1.0")
    .description("Exact same-partition counter identifier.")
    .validator((value) => BUG_HEALTH_METRICS_COUNTER_ID_PATTERN.test(value)),
  windowStart: canonicalTimestampField(
    "Canonical UTC start of the bound counter hour.",
  ).immutable(),
  windowEnd: canonicalTimestampField(
    "Exclusive canonical UTC end of the bound counter hour.",
  ).immutable(),
  shard: field
    .number()
    .internal()
    .immutable()
    .required()
    .version("1.0")
    .description("Exact counter shard selected by the server.")
    .validator((value) => Number.isSafeInteger(value)
      && value >= 0
      && value < BUG_HEALTH_METRICS_COUNTER_SHARD_COUNT),
  counterRevisionAfter: countField(
    "Counter revision committed by the same transaction.",
    1,
    Number.MAX_SAFE_INTEGER,
  ).immutable(),
  outcome: field
    .string()
    .enum(METRICS_RECEIPT_OUTCOMES)
    .internal()
    .immutable()
    .required()
    .version("1.0")
    .description("Closed terminal outcome committed with the counter."),
  recordedAt: field
    .string()
    .internal()
    .immutable()
    .required()
    .version("1.0")
    .description("Minute-rounded server receipt creation instant.")
    .validator(isCanonicalMinuteTimestamp),
  expiresAt: canonicalTimestampField(
    "Absolute end of the fifteen-minute reconciliation lifetime.",
  ).immutable(),
  hardDeleteAt: canonicalTimestampField(
    "Absolute deletion and bounded-backup deadline.",
  ).immutable(),
  ttlSeconds: ttlField(true),
  revision: revisionField(true),
};

/**
 * Immutable, identifier-free proof that one terminal outcome and one counter
 * revision were created atomically. Adapters must partition on `counterId`,
 * create the receipt with If-None-Match in the same transactional batch as the
 * counter replace, and reconcile ambiguous results by exact receipt lookup.
 */
export const feedbackBugHealthMetricsOperationReceiptEntitySchema =
  closeFeedbackSchema(
    createSchema(
      feedbackBugHealthMetricsOperationReceiptEntityShape,
      "feedbackBugHealthMetricsOperationReceiptEntity",
      {
        version: "1.0.0",
        piiEnforcement: "strict",
        table: "feedbackMetricsControl",
        unknownFields: "reject",
        identity: "exact",
        schemaValidator: (entity) =>
          metricsOperationReceiptState(entity as Record<string, unknown>),
      },
    ),
    "immutable",
    () => false,
    metricsOperationReceiptState,
    undefined,
    Object.is,
    metricsOperationReceiptState,
  );
export type FeedbackBugHealthMetricsOperationReceiptEntity = Infer<
  typeof feedbackBugHealthMetricsOperationReceiptEntityShape
>;

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
  "reconciliationUntilMs",
]);
const progressiveReservationAuthorityKeys = new Set([
  "attemptGeneration",
  "attemptTokenDigest",
]);
const progressiveReservedKeys = new Set([
  ...progressiveReservationCommonKeys,
  ...progressiveReservationAuthorityKeys,
]);
const progressiveWritingKeys = new Set([
  ...progressiveReservedKeys,
  "writeStartedAtMs",
]);
const progressiveReleasedRequiredKeys = new Set([
  ...progressiveReservationCommonKeys,
  "releasedAtMs",
]);
const progressiveReleasedKeys = new Set([
  ...progressiveReleasedRequiredKeys,
  ...progressiveReservationAuthorityKeys,
]);
const progressiveCommittedRequiredKeys = new Set([
  ...progressiveReservationCommonKeys,
  "committedAtMs",
  "committedStreak",
  "cooldownDurationMs",
  "cooldownUntilMs",
]);
const progressiveCommittedKeys = new Set([
  ...progressiveCommittedRequiredKeys,
  ...progressiveReservationAuthorityKeys,
  "writeStartedAtMs",
]);
const progressiveReservationKeys = new Set([
  ...progressiveCommittedKeys,
  "releasedAtMs",
]);
const progressiveStateRequiredKeys = new Set([
  "schemaVersion",
  "streak",
  "reservations",
  "hardDeleteByMs",
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
  const requiredKeys =
    status === FeedbackReservationState.RESERVED
      ? progressiveReservationCommonKeys
      : status === FeedbackReservationState.WRITING
        ? progressiveWritingKeys
      : status === FeedbackReservationState.RELEASED
        ? progressiveReleasedRequiredKeys
        : status === FeedbackReservationState.COMMITTED
          ? progressiveCommittedRequiredKeys
          : undefined;
  const allowedKeys =
    status === FeedbackReservationState.RESERVED
      ? progressiveReservedKeys
      : status === FeedbackReservationState.WRITING
        ? progressiveWritingKeys
        : status === FeedbackReservationState.RELEASED
          ? progressiveReleasedKeys
          : status === FeedbackReservationState.COMMITTED
            ? progressiveCommittedKeys
            : undefined;
  const hasAttemptGeneration = Object.prototype.hasOwnProperty.call(
    input,
    "attemptGeneration",
  );
  const hasAttemptTokenDigest = Object.prototype.hasOwnProperty.call(
    input,
    "attemptTokenDigest",
  );
  if (
    requiredKeys === undefined ||
    allowedKeys === undefined ||
    !hasExactEnumerableDataKeys(input, requiredKeys, allowedKeys) ||
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
    !isNonnegativeSafeInteger(input.reconciliationUntilMs) ||
    input.reconciliationUntilMs <= writtenAtMs ||
    hasAttemptGeneration !== hasAttemptTokenDigest ||
    (hasAttemptGeneration &&
      (!Number.isSafeInteger(input.attemptGeneration) ||
        Number(input.attemptGeneration) < 1 ||
        Number(input.attemptGeneration) > Number.MAX_SAFE_INTEGER ||
        typeof input.attemptTokenDigest !== "string" ||
        !IDEMPOTENCY_DIGEST_PATTERN.test(input.attemptTokenDigest)))
  ) {
    return false;
  }

  if (status === FeedbackReservationState.RESERVED) {
    return (
      input.reconciliationUntilMs ===
      safeAddMilliseconds(
        input.leaseExpiresAtMs,
        PROGRESSIVE_COOLDOWN_RECONCILIATION_MS,
      )
    );
  }

  if (status === FeedbackReservationState.WRITING) {
    return (
      hasAttemptGeneration &&
      isNonnegativeSafeInteger(input.writeStartedAtMs) &&
      input.writeStartedAtMs >= input.reservedAtMs &&
      input.writeStartedAtMs < input.leaseExpiresAtMs &&
      input.writeStartedAtMs <= writtenAtMs &&
      input.reconciliationUntilMs ===
        safeAddMilliseconds(
          input.leaseExpiresAtMs,
          PROGRESSIVE_COOLDOWN_RECONCILIATION_MS,
        )
    );
  }

  if (status === FeedbackReservationState.RELEASED) {
    return (
      isNonnegativeSafeInteger(input.releasedAtMs) &&
      input.releasedAtMs >= input.reservedAtMs &&
      input.releasedAtMs <= writtenAtMs &&
      input.reconciliationUntilMs ===
        safeAddMilliseconds(
          input.releasedAtMs,
          PROGRESSIVE_COOLDOWN_RECONCILIATION_MS,
        )
    );
  }

  const committedAtMs = input.committedAtMs;
  const committedStreak = input.committedStreak;
  const hasWriteStartedAtMs = Object.prototype.hasOwnProperty.call(
    input,
    "writeStartedAtMs",
  );
  if (
    !isNonnegativeSafeInteger(committedAtMs) ||
    committedAtMs < input.reservedAtMs ||
    committedAtMs > writtenAtMs ||
    !isNonnegativeSafeInteger(committedStreak) ||
    committedStreak < 1 ||
    committedStreak >
      FEEDBACK_PROGRESSIVE_COOLDOWN_LADDER_MS.length ||
    (hasWriteStartedAtMs &&
      (!hasAttemptGeneration ||
        !isNonnegativeSafeInteger(input.writeStartedAtMs) ||
        input.writeStartedAtMs < input.reservedAtMs ||
        input.writeStartedAtMs >= input.leaseExpiresAtMs ||
        input.writeStartedAtMs > committedAtMs))
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
      : safeAddMilliseconds(input.reservedAtMs, expectedDuration);
  const quietResetAt = safeAddMilliseconds(
    committedAtMs,
    PROGRESSIVE_COOLDOWN_RESET_MS,
  );
  const expectedReconciliationUntil =
    quietResetAt === undefined
      ? undefined
      : safeAddMilliseconds(
          quietResetAt,
          PROGRESSIVE_COOLDOWN_RECONCILIATION_MS,
        );

  return (
    input.cooldownDurationMs === expectedDuration &&
    input.cooldownUntilMs === expectedCooldownUntil &&
    input.reconciliationUntilMs === expectedReconciliationUntil
  );
}

function expectedProgressiveHardDeleteByMs(
  state: FeedbackProgressiveCooldownState,
  writtenAtMs: number,
): number | undefined {
  let reconciliationHorizonMs = writtenAtMs;

  for (const reservation of state.reservations) {
    reconciliationHorizonMs = Math.max(
      reconciliationHorizonMs,
      reservation.reconciliationUntilMs,
    );
  }

  if (state.lastCommittedAtMs !== undefined) {
    const resetAt = safeAddMilliseconds(
      state.lastCommittedAtMs,
      PROGRESSIVE_COOLDOWN_RESET_MS,
    );
    const reconciliationUntil =
      resetAt === undefined
        ? undefined
        : safeAddMilliseconds(
            resetAt,
            PROGRESSIVE_COOLDOWN_RECONCILIATION_MS,
          );
    if (reconciliationUntil === undefined) return undefined;
    reconciliationHorizonMs = Math.max(
      reconciliationHorizonMs,
      reconciliationUntil,
    );
  }

  if (state.cooldownUntilMs !== undefined) {
    const reconciliationUntil = safeAddMilliseconds(
      state.cooldownUntilMs,
      PROGRESSIVE_COOLDOWN_RECONCILIATION_MS,
    );
    if (reconciliationUntil === undefined) return undefined;
    reconciliationHorizonMs = Math.max(
      reconciliationHorizonMs,
      reconciliationUntil,
    );
  }

  return safeAddMilliseconds(
    reconciliationHorizonMs,
    PROGRESSIVE_COOLDOWN_PURGE_SAFETY_MS,
  );
}

function expectedProgressiveTtlSeconds(
  writtenAtMs: number,
  hardDeleteByMs: number,
): number {
  return Math.max(
    0,
    Math.floor(
      (hardDeleteByMs -
        writtenAtMs -
        PROGRESSIVE_COOLDOWN_PURGE_SAFETY_MS) /
        MILLISECONDS_PER_SECOND,
    ),
  );
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
        PROGRESSIVE_COOLDOWN_RECONCILIATION_MS +
        PROGRESSIVE_COOLDOWN_PURGE_SAFETY_MS,
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
    !isNonnegativeSafeInteger(stateRecord.hardDeleteByMs) ||
    stateRecord.hardDeleteByMs < input.writtenAtMs
  ) {
    return false;
  }

  const writtenAtMs = input.writtenAtMs;
  const reservations: FeedbackProgressiveCooldownReservationRecord[] = [];
  const reservationIds = new Set<string>();
  const idempotencyDigests = new Set<string>();
  const attemptTokenDigests = new Set<string>();
  let activeReservationCount = 0;
  for (const candidate of stateRecord.reservations) {
    if (
      !validateProgressiveReservation(candidate, writtenAtMs) ||
      reservationIds.has(candidate.reservationId) ||
      idempotencyDigests.has(candidate.idempotencyDigest) ||
      (candidate.attemptTokenDigest !== undefined &&
        attemptTokenDigests.has(candidate.attemptTokenDigest))
    ) {
      return false;
    }
    reservationIds.add(candidate.reservationId);
    idempotencyDigests.add(candidate.idempotencyDigest);
    if (candidate.attemptTokenDigest !== undefined) {
      attemptTokenDigests.add(candidate.attemptTokenDigest);
    }
    reservations.push(candidate);
    if (
      (candidate.status === FeedbackReservationState.RESERVED ||
        candidate.status === FeedbackReservationState.WRITING) &&
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
  const maximumCommittedCooldownUntil = committed.reduce(
    (latest, record) => Math.max(latest, record.cooldownUntilMs),
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
          record.committedStreak === streak,
      ) ||
      stateRecord.cooldownUntilMs !== maximumCommittedCooldownUntil
    ) {
      return false;
    }
  }

  const expectedHardDeleteByMs = expectedProgressiveHardDeleteByMs(
    state,
    writtenAtMs,
  );
  if (
    expectedHardDeleteByMs === undefined ||
    stateRecord.hardDeleteByMs !== expectedHardDeleteByMs
  ) {
    return false;
  }

  const expectedTtlSeconds = expectedProgressiveTtlSeconds(
    writtenAtMs,
    stateRecord.hardDeleteByMs,
  );
  const isEmptyInactiveDeleteInstruction =
    expectedTtlSeconds === 0 &&
    reservations.length === 0 &&
    streak === 0 &&
    !hasLastCommittedAt &&
    !hasCooldownUntil;
  return (
    input.ttlSeconds === expectedTtlSeconds &&
    (expectedTtlSeconds > 0 || isEmptyInactiveDeleteInstruction)
  );
}

type ProgressiveTransitionKind = "commit" | "release" | "writing";

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
    next.leaseExpiresAtMs !== existing.leaseExpiresAtMs ||
    next.attemptGeneration !== existing.attemptGeneration ||
    next.attemptTokenDigest !== existing.attemptTokenDigest
  ) {
    return undefined;
  }

  if (
    existing.status === FeedbackReservationState.RESERVED &&
    next.status === FeedbackReservationState.WRITING &&
    next.writeStartedAtMs === writtenAtMs &&
    existing.writeStartedAtMs === undefined
  ) {
    return "writing";
  }

  if (
    existing.status === FeedbackReservationState.RESERVED &&
    next.status === FeedbackReservationState.RELEASED &&
    next.releasedAtMs === writtenAtMs &&
    next.writeStartedAtMs === undefined &&
    existing.attemptGeneration !== undefined &&
    existing.attemptTokenDigest !== undefined
  ) {
    return "release";
  }

  if (
    (existing.status === FeedbackReservationState.RESERVED ||
      existing.status === FeedbackReservationState.WRITING ||
      existing.status === FeedbackReservationState.RELEASED) &&
    next.status === FeedbackReservationState.COMMITTED &&
    next.committedAtMs === writtenAtMs &&
    next.writeStartedAtMs === existing.writeStartedAtMs
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
    if (
      existingReservation.reconciliationUntilMs <= next.writtenAtMs
    ) {
      if (nextReservation !== undefined) return false;
      pruned += 1;
      continue;
    }
    if (nextReservation === undefined) {
      return false;
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
        (reservation.status === FeedbackReservationState.RESERVED ||
          reservation.status === FeedbackReservationState.WRITING) &&
        reservation.leaseExpiresAtMs > next.writtenAtMs,
    );
    if (
      addition === undefined ||
      addition.status !== FeedbackReservationState.RESERVED ||
      addition.reservedAtMs !== next.writtenAtMs ||
      addition.attemptGeneration !== 1 ||
      addition.attemptTokenDigest === undefined ||
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
    if (changed?.cooldownUntilMs === undefined) return false;
    const expectedCooldownUntilMs = Math.max(
      baseCooldownUntilMs ?? changed.cooldownUntilMs,
      changed.cooldownUntilMs,
    );
    return (
      changed.committedStreak === expectedStreak &&
      next.state.streak === expectedStreak &&
      next.state.lastCommittedAtMs === next.writtenAtMs &&
      next.state.cooldownUntilMs === expectedCooldownUntilMs
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
  reconciliationUntilMs: internalMillisecondField(
    "Exact status-specific six-day reconciliation-availability deadline.",
  ),
  attemptGeneration: field
    .number()
    .internal()
    .optional()
    .version("1.0")
    .description("Owner-bound immutable-write authority generation.")
    .validator(
      (value) =>
        Number.isSafeInteger(value) &&
        value >= 1 &&
        value <= Number.MAX_SAFE_INTEGER,
    ),
  attemptTokenDigest: field
    .string()
    .internal()
    .optional()
    .version("1.0")
    .description(
      "Domain-separated digest of one-use write authority; never the raw token.",
    )
    .validator((value) => IDEMPOTENCY_DIGEST_PATTERN.test(value))
    .PID({
      classification: "low",
      action: "none",
      logHandling: "redact",
      purpose: "feedback immutable-write authority convergence",
    }),
  writeStartedAtMs: optionalInternalMillisecondField(
    "Owner-bound immutable-write admission epoch.",
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
  hardDeleteByMs: internalMillisecondField(
    "Absolute no-later-than deletion deadline ending the 24-hour purge safety window.",
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
      "Maximum floor-rounded TTL budget ending at reconciliation expiry; zero is an empty/inactive delete instruction.",
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
 * Store adapters must use a conditional write for `revision`, start explicit
 * deletion no later than the one-day safety boundary, and verify that live
 * data and bounded backups are absent by `state.hardDeleteByMs`. `ttlSeconds`
 * is a maximum budget calculated at `writtenAtMs`, not a Cosmos `ttl` value:
 * adapters must shorten it using the trusted persistence time. A zero budget
 * is valid only for an empty and inactive delete instruction and must never be
 * persisted as Cosmos TTL zero. The row contains no packet/artifact identifier
 * or feedback content.
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

function validateCommittedAcceptanceDeliveryOutboxLifecycle(
  input: Record<string, unknown>,
): boolean {
  if (
    !isNonnegativeSafeInteger(input.acceptedAtMs) ||
    !isNonnegativeSafeInteger(input.committedAtMs) ||
    input.acceptedAtMs > input.committedAtMs ||
    !isNonnegativeSafeInteger(input.deliveryUntilMs) ||
    !isNonnegativeSafeInteger(input.hardDeleteByMs) ||
    !isNonnegativeSafeInteger(input.ttlSeconds)
  ) {
    return false;
  }

  const cooldownDurationMs =
    input.deliveryUntilMs -
    input.acceptedAtMs -
    COMMITTED_ACCEPTANCE_DELIVERY_GRACE_MS;
  const validCooldown =
    input.submissionKind === FeedbackSubmissionKind.REVIEW
      ? cooldownDurationMs === REVIEW_DENY_SECONDS * MILLISECONDS_PER_SECOND
      : input.submissionKind === FeedbackSubmissionKind.BUG &&
        FEEDBACK_PROGRESSIVE_COOLDOWN_LADDER_MS.includes(cooldownDurationMs);
  if (!validCooldown) return false;

  const eligibilityUntilMs = safeAddMilliseconds(
    input.acceptedAtMs,
    cooldownDurationMs,
  );
  const deliveryUntilMs =
    eligibilityUntilMs === undefined
      ? undefined
      : safeAddMilliseconds(
          eligibilityUntilMs,
          COMMITTED_ACCEPTANCE_DELIVERY_GRACE_MS,
        );
  const hardDeleteByMs =
    deliveryUntilMs === undefined
      ? undefined
      : safeAddMilliseconds(
          deliveryUntilMs,
          COMMITTED_ACCEPTANCE_DELIVERY_PURGE_SAFETY_MS,
        );
  const ttlSeconds =
    deliveryUntilMs === undefined
      ? undefined
      : Math.floor(
          (deliveryUntilMs - input.committedAtMs) /
            MILLISECONDS_PER_SECOND,
        );

  return (
    deliveryUntilMs !== undefined &&
    hardDeleteByMs !== undefined &&
    ttlSeconds !== undefined &&
    ttlSeconds > 0 &&
    input.deliveryUntilMs === deliveryUntilMs &&
    input.hardDeleteByMs === hardDeleteByMs &&
    input.ttlSeconds === ttlSeconds
  );
}

export const feedbackCommittedAcceptanceDeliveryOutboxEntityShape = {
  stateId: field
    .string()
    .internal()
    .immutable()
    .required()
    .version("1.0")
    .description(
      "Purpose-isolated canonical state key for the atomic commit transaction.",
    )
    .validator((value) => KEYED_SUBJECT_PATTERN.test(value))
    .PID({
      classification: "low",
      action: "none",
      logHandling: "redact",
      purpose: "feedback acceptance-evidence delivery routing",
    }),
  reservationId: field
    .string()
    .internal()
    .immutable()
    .required()
    .version("1.0")
    .description(
      "Canonical random reservation ID for deterministic packet projection.",
    )
    .validator((value) => RESERVATION_ID_PATTERN.test(value))
    .PID({
      classification: "low",
      action: "none",
      logHandling: "redact",
      purpose: "feedback acceptance-evidence delivery routing",
    }),
  submissionKind: field
    .string()
    .internal()
    .immutable()
    .required()
    .version("1.0")
    .description("Closed packet projection branch for evidence delivery.")
    .enum(Object.values(FeedbackSubmissionKind)),
  committedAtMs: internalMillisecondField(
    "Server-owned control transition epoch used to shorten live TTL.",
  ).immutable(),
  acceptedAtMs: internalMillisecondField(
    "Server-owned reservation epoch anchoring immutable acceptance and eligibility.",
  ).immutable(),
  deliveryUntilMs: internalMillisecondField(
    "Final live delivery deadline after the bounded post-eligibility grace period.",
  ).immutable(),
  hardDeleteByMs: internalMillisecondField(
    "Absolute deletion deadline after the fixed purge-safety window.",
  ).immutable(),
  ttlSeconds: ttlField(true),
  revision: revisionField(true),
};

/**
 * Short-lived, pseudonymous delivery row created atomically with a successful
 * feedback commit. The record contains no packet ID or content locator; the
 * trusted worker derives and verifies the immutable packet before emitting
 * identifier-free evidence, then deletes this row conditionally.
 */
export const feedbackCommittedAcceptanceDeliveryOutboxEntitySchema =
  closeFeedbackSchema(
    createSchema(
      feedbackCommittedAcceptanceDeliveryOutboxEntityShape,
      "feedbackCommittedAcceptanceDeliveryOutboxEntity",
      {
        version: "1.0.0",
        piiEnforcement: "strict",
        table: "feedbackControl",
        unknownFields: "reject",
        identity: "exact",
        schemaValidator: (entity) =>
          validateCommittedAcceptanceDeliveryOutboxLifecycle(
            entity as Record<string, unknown>,
          ),
      },
    ),
    "immutable",
  );
export type FeedbackCommittedAcceptanceDeliveryOutboxEntity = Infer<
  typeof feedbackCommittedAcceptanceDeliveryOutboxEntityShape
>;

function validateCommitReconciliationOutboxLifecycle(
  input: Record<string, unknown>,
): boolean {
  if (
    !isNonnegativeSafeInteger(input.reservedAtMs) ||
    !isNonnegativeSafeInteger(input.writeStartedAtMs) ||
    !isNonnegativeSafeInteger(input.leaseExpiresAtMs) ||
    !isNonnegativeSafeInteger(input.reconciliationUntilMs) ||
    !isNonnegativeSafeInteger(input.hardDeleteByMs) ||
    !isNonnegativeSafeInteger(input.ttlSeconds) ||
    input.leaseExpiresAtMs !==
      safeAddMilliseconds(
        input.reservedAtMs,
        PROGRESSIVE_COOLDOWN_RESERVATION_LEASE_MS,
      ) ||
    input.writeStartedAtMs < input.reservedAtMs ||
    input.writeStartedAtMs >= input.leaseExpiresAtMs
  ) {
    return false;
  }

  const reconciliationUntilMs = safeAddMilliseconds(
    input.leaseExpiresAtMs,
    PROGRESSIVE_COOLDOWN_RECONCILIATION_MS,
  );
  const hardDeleteByMs =
    reconciliationUntilMs === undefined
      ? undefined
      : safeAddMilliseconds(
          reconciliationUntilMs,
          PROGRESSIVE_COOLDOWN_PURGE_SAFETY_MS,
        );
  const ttlSeconds =
    reconciliationUntilMs === undefined
      ? undefined
      : Math.floor(
          (reconciliationUntilMs - input.writeStartedAtMs) /
            MILLISECONDS_PER_SECOND,
        );

  return (
    reconciliationUntilMs !== undefined &&
    hardDeleteByMs !== undefined &&
    ttlSeconds !== undefined &&
    ttlSeconds > 0 &&
    input.reconciliationUntilMs === reconciliationUntilMs &&
    input.hardDeleteByMs === hardDeleteByMs &&
    input.ttlSeconds === ttlSeconds
  );
}

export const feedbackCommitReconciliationOutboxEntityShape = {
  stateId: field
    .string()
    .internal()
    .immutable()
    .required()
    .version("1.0")
    .description(
      "Purpose-isolated canonical state key for the control transaction.",
    )
    .validator((value) => KEYED_SUBJECT_PATTERN.test(value))
    .PID({
      classification: "low",
      action: "none",
      logHandling: "redact",
      purpose: "feedback commit reconciliation routing",
    }),
  reservationId: field
    .string()
    .internal()
    .immutable()
    .required()
    .version("1.0")
    .description("Canonical random reservation ID awaiting reconciliation.")
    .validator((value) => RESERVATION_ID_PATTERN.test(value))
    .PID({
      classification: "low",
      action: "none",
      logHandling: "redact",
      purpose: "feedback commit reconciliation routing",
    }),
  submissionKind: field
    .string()
    .internal()
    .immutable()
    .required()
    .version("1.0")
    .description("Closed verifier branch for the immutable acceptance.")
    .enum(Object.values(FeedbackSubmissionKind)),
  reservedAtMs: internalMillisecondField(
    "Reservation creation epoch anchoring the exact five-minute lease.",
  ).immutable(),
  writeStartedAtMs: internalMillisecondField(
    "Owner-bound immutable-write admission epoch.",
  ).immutable(),
  leaseExpiresAtMs: internalMillisecondField(
    "Reservation lease deadline and earliest scheduled reconciliation epoch.",
  ).immutable(),
  reconciliationUntilMs: internalMillisecondField(
    "Final live reconciliation deadline, exactly six days after lease expiry.",
  ).immutable(),
  hardDeleteByMs: internalMillisecondField(
    "Absolute deletion deadline after the fixed one-day purge safety window.",
  ).immutable(),
  ttlSeconds: ttlField(true),
  revision: revisionField(true),
};

/**
 * Immutable, identifier-isolated reconciliation queue record.
 *
 * The row is created transactionally with `reserved -> writing` in the same
 * `feedbackControl` partition and deleted after a verified commit or terminal
 * reconciliation outcome. It contains only control-plane routing IDs. Packet,
 * artifact, draft, idempotency, attempt-token, narrative, and reporter-source
 * values are deliberately outside the closed shape.
 */
export const feedbackCommitReconciliationOutboxEntitySchema =
  closeFeedbackSchema(
    createSchema(
      feedbackCommitReconciliationOutboxEntityShape,
      "feedbackCommitReconciliationOutboxEntity",
      {
        version: "1.0.0",
        piiEnforcement: "strict",
        table: "feedbackControl",
        unknownFields: "reject",
        identity: "exact",
        schemaValidator: (entity) =>
          validateCommitReconciliationOutboxLifecycle(
            entity as Record<string, unknown>,
          ),
      },
    ),
    "immutable",
  );
export type FeedbackCommitReconciliationOutboxEntity = Infer<
  typeof feedbackCommitReconciliationOutboxEntityShape
>;

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
          validateControlLifecycle(entity as Record<string, unknown>) &&
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
        validateControlLifecycle(entity as Record<string, unknown>) &&
        exactSecondsBetween(entity.updatedAt, entity.denyExpiresAt) ===
          REVIEW_DENY_SECONDS &&
        entity.expiresAt === entity.denyExpiresAt,
    },
  ),
  "increment",
  validateReviewEligibilityTransition,
  undefined,
  () => true,
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
    .enum(DEPRECATED_FEEDBACK_RESERVATION_STATES),
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
      !DEPRECATED_FEEDBACK_RESERVATION_STATES.includes(
        nextState as (typeof DEPRECATED_FEEDBACK_RESERVATION_STATES)[number],
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
          validateControlLifecycle(entity as Record<string, unknown>),
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
