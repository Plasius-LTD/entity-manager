import type { SchemaShape, ValidationResult } from "@plasius/schema";
import { createSchema, field } from "@plasius/schema";
import { BaseEntity } from "./types.js";

type SchemaLike<T> = {
  validate: (input: unknown, existing?: Record<string, any>) => ValidationResult<T>;
};

export interface ExternalSchema<T> {
  name?: string;
  validate: (value: unknown) => void;
}

const nonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const formatErrors = (errors?: string[]) =>
  errors && errors.length > 0 ? errors.join("; ") : "Validation failed";

const baseFields = {
  id: field.string().required().validator(nonEmptyString),
  createdAt: field.dateTimeISO().required(),
  updatedAt: field.dateTimeISO().required(),
} satisfies SchemaShape;

export const baseEntitySchema = createSchema(baseFields, "entity", {
  version: "1.0.0",
  schemaValidator: (value) => {
    const createdMs = Date.parse((value as any).createdAt);
    const updatedMs = Date.parse((value as any).updatedAt);
    if (Number.isNaN(createdMs) || Number.isNaN(updatedMs)) return false;
    return updatedMs >= createdMs;
  },
});

export function ensureValid<T>(
  schema: SchemaLike<T>,
  value: unknown,
): T {
  const result = schema.validate(value);
  if (!result.valid || !result.value) {
    throw new Error(formatErrors(result.errors));
  }
  const validatedValue = result.value as unknown as T;
  if (typeof value !== "object" || value === null) {
    return validatedValue;
  }
  const merged = {
    ...(value as Record<string, unknown>),
    ...(validatedValue as Record<string, unknown>),
  };
  return merged as T;
}

export function wrapExternalSchema<T>(schema: ExternalSchema<T>): SchemaLike<T> {
  return {
    validate: (value: unknown) => {
      try {
        schema.validate(value);
        return { valid: true, value: value as T } as ValidationResult<T>;
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : typeof error === "string" ? error : "Validation failed";
        return { valid: false, errors: [msg] } as ValidationResult<T>;
      }
    },
  };
}

const parseSemVer = (version: string) => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Invalid semver string: ${version}`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
};

const bumpPatch = (version: string) => {
  const { major, minor, patch } = parseSemVer(version);
  return `${major}.${minor}.${patch + 1}`;
};

export function bumpVersion<T extends BaseEntity>(
  entity: T,
  now: Date = new Date(),
): T {
  const validated = ensureValid(baseEntitySchema, entity);

  const nowMs = now.getTime();
  const createdMs = Date.parse(validated.createdAt);
  const nextUpdatedAt = new Date(Math.max(createdMs, nowMs)).toISOString();

  return {
    ...validated,
    version: bumpPatch(validated.version),
    updatedAt: nextUpdatedAt,
  } as T;
}
