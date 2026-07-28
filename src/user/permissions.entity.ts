import {
  field,
  createSchema,
  validateDateTimeISO,
  validateUserId,
  type Infer,
  SchemaShape,
} from "@plasius/schema";
import { BaseEntity } from "../base.entity.js";
import { Scope } from "../permissions.js";

const permissionsEntityShape: SchemaShape = {
  scopes: field
    .array(field.string())
    .version("1.0")
    .description("An array of permission scopes defined by the Scope enum.")
    .immutable()
    .enum([...Object.values(Scope)]),

  granted: field
    .boolean()
    .version("1.0")
    .description("Has this permission been validated")
    .optional(),

  grantedBy: field
    .string()
    .internal()
    .version("1.0")
    .description("Which user/system granted the update to permissions")
    .optional()
    .validator(validateUserId),

  grantedAt: field
    .string()
    .version("1.0")
    .description("Date/Time permission was granted")
    .optional()
    .validator(validateDateTimeISO),

  revoked: field
    .boolean()
    .version("1.0")
    .description("Have the permissions been revoked")
    .optional(),

  revokedBy: field
    .string()
    .internal()
    .version("1.0")
    .description("Who revoked the permissions")
    .optional()
    .validator(validateUserId),

  revokedAt: field
    .string()
    .version("1.0")
    .description("Date/Time permission was revoked")
    .optional()
    .validator(validateDateTimeISO),
};

export const permissionsEntitySchema = createSchema(
  permissionsEntityShape,
  "permissionsEntity",
  {
    version: "1.0.0",
    piiEnforcement: "strict",
    table: "permissions",
  }
);
export type PermissionsEntity = Infer<typeof permissionsEntityShape> &
  BaseEntity;
