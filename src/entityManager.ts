import { BaseEntity } from "./types.js";

type Validator<T> = (value: unknown) => asserts value is T;

export interface Schema<T> {
  name: string;
  validate: Validator<T>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isISODateString = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
};

const assertISODate = (value: unknown, field: string): asserts value is string => {
  if (!isISODateString(value)) {
    throw new Error(`${field} must be an ISO8601 string`);
  }
};

const assertNonEmptyString = (value: unknown, field: string): asserts value is string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} must be a non-empty string`);
  }
};

const assertNonNegativeInteger = (value: unknown, field: string): asserts value is number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
};

export const baseEntitySchema: Schema<BaseEntity> = {
  name: "BaseEntity",
  validate: (value: unknown): asserts value is BaseEntity => {
    if (!isRecord(value)) {
      throw new Error("Entity must be an object");
    }

    const { id, type, version, createdAt, updatedAt } = value;

    assertNonEmptyString(id, "id");
    assertNonEmptyString(type, "type");
    assertNonNegativeInteger(version, "version");
    assertISODate(createdAt, "createdAt");
    assertISODate(updatedAt, "updatedAt");

    const created = new Date(createdAt);
    const updated = new Date(updatedAt);
    if (updated.getTime() < created.getTime()) {
      throw new Error("updatedAt cannot be before createdAt");
    }
  },
};

export function ensureValid<T>(schema: Schema<T>, value: unknown): T {
  schema.validate(value);
  return value;
}

export function bumpVersion<T extends BaseEntity>(
  entity: T,
  now: Date = new Date(),
): T {
  ensureValid(baseEntitySchema, entity);

  return {
    ...entity,
    version: entity.version + 1,
    updatedAt: now.toISOString(),
  };
}
