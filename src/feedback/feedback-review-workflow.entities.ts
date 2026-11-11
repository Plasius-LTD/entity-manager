import {
  FeedbackReviewIdempotencyReceiptSchema,
  FeedbackReviewProjectionCheckpointSchema,
  FeedbackReviewTransitionEventSchema,
  FeedbackReviewTransitionRequestSchema,
  FeedbackReviewWorkflowStateSchema,
  type FeedbackReviewIdempotencyReceipt,
  type FeedbackReviewKind,
  type FeedbackReviewProjectionCheckpoint,
  type FeedbackReviewTransitionEvent,
  type FeedbackReviewWorkflowState,
} from "@plasius/schema";
import { isCanonicalUtcTimestamp } from "../family/validation.js";

/** Persistence version, independent of packet, acceptance receipt and wire versions. */
export const FEEDBACK_REVIEW_ENTITY_VERSION = "1.0.0";

type StorageIdentity<T extends string> = {
  id: string;
  type: T;
  version: typeof FEEDBACK_REVIEW_ENTITY_VERSION;
};

type ExpiringStorage<T extends string> = StorageIdentity<T> & {
  /** Trusted clock at this write, separate from the original packet timestamps. */
  writtenAt: string;
  /** Whole seconds remaining until the original packet expiry at this write. */
  ttl: number;
};

type Data<T> = Omit<T, "type" | "version">;

/** The filter projection for one committed packet, in the fixed kind partition. */
export type FeedbackReviewStateEntity = Data<FeedbackReviewWorkflowState> &
  ExpiringStorage<"feedback-review-state-entity">;

/** Create-only history keyed by packet and resulting revision. */
export type FeedbackReviewHistoryEntity = Data<FeedbackReviewTransitionEvent> &
  ExpiringStorage<"feedback-review-history-entity">;

/** Server-only operation result; only audit acknowledgement can replace it. */
export type FeedbackReviewOperationEntity = Data<FeedbackReviewIdempotencyReceipt> &
  ExpiringStorage<"feedback-review-operation-entity">;

/** Server-only durable checkpoint per kind, independent of individual packet retention. */
export type FeedbackReviewCheckpointEntity = Data<FeedbackReviewProjectionCheckpoint> &
  StorageIdentity<"feedback-review-checkpoint-entity">;

function canonicalTime(value: unknown): value is string {
  return isCanonicalUtcTimestamp(value) && /\.\d{3}Z$/u.test(value);
}

/** Fail closed when there is less than one whole second left to persist the row. */
export function feedbackReviewRemainingTtl(expiresAt: unknown, now: unknown): number | undefined {
  if (!canonicalTime(expiresAt) || !canonicalTime(now)) return undefined;
  const seconds = Math.floor((Date.parse(expiresAt) - Date.parse(now)) / 1_000);
  return seconds > 0 ? seconds : undefined;
}

/** Inspect data descriptors without invoking accessors; never echo rejected input. */
function ownScalarFields(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    const fields: Record<string, unknown> = Object.create(null);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") return undefined;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) return undefined;
      const scalar: unknown = descriptor.value;
      if (typeof scalar !== "string" && typeof scalar !== "number" && typeof scalar !== "boolean") return undefined;
      fields[key] = scalar;
    }
    return fields;
  } catch {
    return undefined;
  }
}

type Validator = { validate(input: unknown): { valid: boolean } };

function storageFields(
  value: unknown,
  type: string,
  schema: Validator,
  expiring: boolean,
): Record<string, unknown> | undefined {
  const fields = ownScalarFields(value);
  if (!fields) return undefined;
  const { id, type: actualType, version, ...payload } = fields;
  if (typeof id !== "string" || actualType !== type || version !== FEEDBACK_REVIEW_ENTITY_VERSION) return undefined;
  if (expiring) {
    const { writtenAt, ttl, ...body } = payload;
    const expected = feedbackReviewRemainingTtl(body.expiresAt, writtenAt);
    if (expected === undefined || ttl !== expected || !schema.validate(body).valid) return undefined;
  } else if (!schema.validate(payload).valid) {
    return undefined;
  }
  return fields;
}

function state(value: unknown): FeedbackReviewStateEntity | undefined {
  const fields = storageFields(value, "feedback-review-state-entity", FeedbackReviewWorkflowStateSchema, true);
  if (!fields) return undefined;
  const row = fields as unknown as FeedbackReviewStateEntity;
  const validTime = row.revision === 1 ? row.writtenAt >= row.updatedAt : row.writtenAt === row.updatedAt;
  return validTime && row.id === `state:${row.packetId}` ? row : undefined;
}

function history(value: unknown): FeedbackReviewHistoryEntity | undefined {
  const fields = storageFields(value, "feedback-review-history-entity", FeedbackReviewTransitionEventSchema, true);
  if (!fields) return undefined;
  const row = fields as unknown as FeedbackReviewHistoryEntity;
  return row.writtenAt === row.occurredAt && row.id === `history:${row.packetId}:${row.revision}` ? row : undefined;
}

function operation(value: unknown): FeedbackReviewOperationEntity | undefined {
  const fields = storageFields(value, "feedback-review-operation-entity", FeedbackReviewIdempotencyReceiptSchema, true);
  if (!fields) return undefined;
  const row = fields as unknown as FeedbackReviewOperationEntity;
  const validTime = row.auditStatus === "pending" ? row.writtenAt === row.occurredAt : row.writtenAt >= row.occurredAt;
  return validTime && row.id === `operation:${row.operationId}` ? row : undefined;
}

function checkpoint(value: unknown): FeedbackReviewCheckpointEntity | undefined {
  const fields = storageFields(value, "feedback-review-checkpoint-entity", FeedbackReviewProjectionCheckpointSchema, false);
  return fields?.id === "checkpoint" ? fields as unknown as FeedbackReviewCheckpointEntity : undefined;
}

/** Validate a stored snapshot. The adapter still enforces logical expiry on reads. */
export function isFeedbackReviewStateEntity(value: unknown): value is FeedbackReviewStateEntity {
  return state(value) !== undefined;
}

export function isFeedbackReviewHistoryEntity(value: unknown): value is FeedbackReviewHistoryEntity {
  return history(value) !== undefined;
}

export function isFeedbackReviewOperationEntity(value: unknown): value is FeedbackReviewOperationEntity {
  return operation(value) !== undefined;
}

export function isFeedbackReviewCheckpointEntity(value: unknown): value is FeedbackReviewCheckpointEntity {
  return checkpoint(value) !== undefined;
}

const packetFields = ["kind", "packetId", "acceptedAt", "expiresAt"] as const;
const projectionFields = [...packetFields, "surfaceId", "issueType", "severity", "satisfaction"] as const;
const eventFields = [...packetFields, "occurredAt", "revision", "action", "fromStatus", "toStatus", "outcome"] as const;
const operationFields = [...eventFields, "operationId", "auditIntentId", "expectedRevision"] as const;

function sameFields<K extends string>(
  left: Partial<Record<K, unknown>>,
  right: Partial<Record<K, unknown>>,
  fields: readonly K[],
): boolean {
  return fields.every((key) => left[key] === right[key]);
}

/** Bind a create-only projection to the original packet/receipt projection supplied by the adapter. */
export function isFeedbackReviewInitialState(value: unknown, original: unknown, now: unknown): boolean {
  const row = state(value);
  const projection = ownScalarFields(original);
  return row !== undefined && row.revision === 1 && row.writtenAt === now &&
    projection !== undefined && projection.revision === 1 &&
    FeedbackReviewWorkflowStateSchema.validate(projection).valid &&
    sameFields(row, projection, projectionFields);
}

/**
 * Validate one proposed same-kind atomic write against the current state.
 * The adapter must still use the current ETag and create history and operation rows only if absent.
 */
export function isFeedbackReviewTransitionWrite(
  current: unknown,
  proposed: unknown,
  event: unknown,
  receipt: unknown,
  now: unknown,
): boolean {
  const before = state(current);
  const after = state(proposed);
  const change = history(event);
  const retry = operation(receipt);
  return before !== undefined && after !== undefined && change !== undefined && retry !== undefined &&
    after.writtenAt === now && after.revision === before.revision + 1 &&
    after.updatedAt >= before.writtenAt &&
    sameFields(before, after, projectionFields) && sameFields(after, change, packetFields) &&
    change.revision === after.revision && change.occurredAt === after.updatedAt &&
    change.fromStatus === before.status && change.toStatus === after.status && change.outcome === after.outcome &&
    retry.expectedRevision === before.revision && retry.auditStatus === "pending" &&
    sameFields(change, retry, eventFields);
}

/** A match permits reconciliation, but the caller must complete pending audit before reporting success. */
export function matchesFeedbackReviewOperation(
  receipt: unknown,
  kind: FeedbackReviewKind,
  packetId: string,
  operationId: string,
  request: unknown,
  now: unknown,
): boolean {
  const row = operation(receipt);
  const command = ownScalarFields(request);
  return row !== undefined && command !== undefined && canonicalTime(now) &&
    row.writtenAt <= now && now < row.expiresAt &&
    row.kind === kind && row.packetId === packetId && row.operationId === operationId &&
    FeedbackReviewTransitionRequestSchema.validate(command).valid &&
    sameFields(row, command, ["expectedRevision", "action", "outcome"]);
}

/** Validate a pending-to-complete, ETag-conditional receipt update using its original expiry. */
export function isFeedbackReviewAuditCompletion(current: unknown, proposed: unknown, now: unknown): boolean {
  const before = operation(current);
  const after = operation(proposed);
  return before !== undefined && after !== undefined &&
    before.auditStatus === "pending" && after.auditStatus === "complete" &&
    after.writtenAt === now && after.writtenAt >= before.writtenAt &&
    sameFields(before, after, operationFields);
}

/** Validate a durable feed advance against the adapter's current lease fencing epoch. */
export function isFeedbackReviewCheckpointWrite(
  current: unknown,
  proposed: unknown,
  activeLeaseEpoch: number,
  now: unknown,
): boolean {
  const next = checkpoint(proposed);
  if (!next || next.leaseEpoch !== activeLeaseEpoch || next.updatedAt !== now) return false;
  if (current === undefined) return next.revision === 1;

  const before = checkpoint(current);
  return before !== undefined && before.kind === next.kind &&
    next.revision === before.revision + 1 && next.leaseEpoch >= before.leaseEpoch &&
    next.updatedAt >= before.updatedAt && next.lastSuccessfulAt >= before.lastSuccessfulAt &&
    (!before.backfillComplete || next.backfillComplete);
}
