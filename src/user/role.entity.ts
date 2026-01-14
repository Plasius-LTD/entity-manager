import { BaseEntity } from "../base.entity.js";
import { createSchema, field, SchemaShape, validateDateTimeISO } from "@plasius/schema";
import { type Infer, validateUserId } from "@plasius/schema";

export enum Role {
  ADMIN = "admin",
  USER = "user",
  GUEST = "guest",
  MODERATOR = "moderator",
  CONTRIBUTOR = "contributor",
  VIEWER = "viewer",
  EDITOR = "editor",
  OWNER = "owner",
  MEMBER = "member",
}

const roleEntityShape: SchemaShape = {
  roles: field.array(field.string())
    .version("1.0")
    .description("Assigned roles for the user")
    .immutable()
    .enum([...Object.values(Role)]),

  active: field.boolean()
    .version("1.0")
    .description("Have the roles been activated?"),

  activatedAt: field.string()
    .version("1.0")
    .description("When were the roles activated")
    .optional()
    .validator(validateDateTimeISO)
    .as<Date>(),

  activatedBy: field.string()
    .version("1.0")
    .description("Who activated the roles?")
    .optional()
    .validator(validateUserId),

  deactivatedAt: field.string()
    .version("1.0")
    .description("When were the roles deactivated for this user")
    .optional()
    .validator(validateDateTimeISO)
    .as<Date>(),

  deactivatedBy: field.string()
    .version("1.0")
    .description("Who deactivated the roles for this user?")
    .optional()
    .validator(validateUserId),
};

// Add schema-level validator
function validateRoleEntitySchema(
  entity: Infer<typeof roleEntityShape>
): boolean {
  if (entity.active) {
    // If active, activatedBy must be set
    if (!entity.activatedBy || (entity.activatedBy as string).trim() === "") {
      return false;
    }
  } else {
    // If inactive, deactivatedBy must be set
    if (
      !entity.deactivatedBy ||
      (entity.deactivatedBy as string).trim() === ""
    ) {
      return false;
    }
  }
  return true;
}

export const roleEntitySchema = createSchema(
  roleEntityShape,
  "roleEntity",
  { version: "1.0.0",
   piiEnforcement: "strict",
  table: "roles",
  schemaValidator: validateRoleEntitySchema }
);

export type RoleEntity = Infer<typeof roleEntitySchema> & BaseEntity;
