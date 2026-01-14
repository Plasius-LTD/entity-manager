import type { SchemaShape, ValidationResult, Infer } from "@plasius/schema";
import { createSchema, field } from "@plasius/schema";
import { BaseEntity } from "./types.js";

type SchemaLike<T> = {
  validate: (input: unknown, existing?: Record<string, any>) => ValidationResult<T>;
  __defaults?: Record<string, unknown | (() => unknown)>;
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

const timestampsValid = (value: { createdAt: string; updatedAt: string }) => {
  const createdMs = Date.parse(value.createdAt);
  const updatedMs = Date.parse(value.updatedAt);
  if (Number.isNaN(createdMs) || Number.isNaN(updatedMs)) return false;
  return updatedMs >= createdMs;
};

export const baseEntitySchema = createSchema(baseFields, "entity", {
  version: "1.0.0",
  schemaValidator: (value) => timestampsValid(value as any),
});

const createEntitySchema = <T extends SchemaShape>(
  shape: T,
  entityType: string,
  version = "1.0.0",
  defaults?: Record<string, unknown | (() => unknown)>,
) => {
  const schema = createSchema(
    { ...baseFields, ...shape },
    entityType,
    {
      version,
      schemaValidator: (value) =>
        timestampsValid(value as any) &&
        (value as any).type === entityType &&
        (value as any).version === version,
    },
  ) as SchemaLike<Infer<T>>;

  if (defaults) {
    schema.__defaults = defaults;
  }

  return schema;
};

export const userSchema = createEntitySchema(
  {
    email: field.email().required(),
    displayName: field.generalText().optional(),
  },
  "user",
);

export const familySchema = createEntitySchema(
  {
    name: field.generalText().required(),
    ownerId: field.string().required().validator(nonEmptyString),
    memberIds: field.array(field.string()).default(() => []),
  },
  "family",
  "1.0.0",
  { memberIds: [] },
);

export const groupSchema = createEntitySchema(
  {
    name: field.generalText().required(),
    memberIds: field.array(field.string()).default(() => []),
  },
  "group",
  "1.0.0",
  { memberIds: [] },
);

export const characterSchema = createEntitySchema(
  {
    name: field.generalText().required(),
    class: field.generalText().optional(),
    level: field.number().required().validator((n) => Number.isInteger(n) && n > 0),
  },
  "character",
);

const permissionRoles = ["admin", "editor", "member", "viewer"] as const;
const permissionSubjects = ["user", "group", "family", "character"] as const;

export const permissionsSchema = createEntitySchema(
  {
    role: field.string().enum(permissionRoles).required(),
    subjectType: field.string().enum(permissionSubjects).required(),
    subjectId: field.string().required().validator(nonEmptyString),
    scopes: field.array(field.string()).default(() => []),
  },
  "permissions",
  "1.0.0",
  { scopes: [] },
);

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
  const merged: Record<string, unknown> = {
    ...(value as Record<string, unknown>),
    ...(validatedValue as Record<string, unknown>),
  };
  if (schema.__defaults) {
    for (const [key, defaultValue] of Object.entries(schema.__defaults)) {
      if (merged[key] === undefined) {
        merged[key] =
          typeof defaultValue === "function" ? (defaultValue as () => unknown)() : defaultValue;
      }
    }
  }
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

export type User = Infer<typeof userSchema>;
export type Family = Infer<typeof familySchema>;
export type Group = Infer<typeof groupSchema>;
export type Character = Infer<typeof characterSchema>;
export type Permissions = Infer<typeof permissionsSchema>;
