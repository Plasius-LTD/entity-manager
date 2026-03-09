import {
  createSchema,
  field,
  validateSafeText,
  validateSemVer,
} from "@plasius/schema";
import type { Infer, SchemaShape } from "@plasius/schema";
import { isValidAzureTableKey, isValidEntityType } from "./validators/index.js";
import { validateDateTimeISO, validateUserId } from "@plasius/schema";
import { EntityTypes } from "./types.js";

export const baseEntityShape: SchemaShape = {
  // From TableEntity
  partitionKey: field
    .string()
    .internal()
    .immutable()
    .required()
    .description("Primary partition identifier, usually user ID.")
    .version("1.0")
    .validator(isValidAzureTableKey),

  id: field
    .string()
    .immutable()
    .required()
    .description("Row identifier within the partition.")
    .version("1.0")
    .validator(isValidAzureTableKey),

  version: field
    .string()
    .description("SemVer version string for the record.")
    .version("1.0")
    .system()
    .validator(validateSemVer),

  entityType: field
    .string()
    .version("1.0")
    .description("The derived type of this entity.")
    .immutable()
    .system()
    .enum([...Object.values(EntityTypes)])
    .validator(isValidEntityType),

  createdAt: field
    .string()
    .immutable()
    .required()
    .description("Record creation timestamp.")
    .version("1.0")
    .as<Date>()
    .validator(validateDateTimeISO),

  createdBy: field
    .string()
    .internal()
    .immutable()
    .required()
    .description("User ID who created the record.")
    .version("1.0")
    .validator(validateUserId),

  updatedAt: field
    .string()
    .optional()
    .description("Timestamp of the last update.")
    .version("1.0")
    .as<Date>()
    .validator(validateDateTimeISO),

  updatedBy: field
    .string()
    .internal()
    .optional()
    .description("User ID of the last editor.")
    .version("1.0")
    .validator(validateUserId),

  isDeleted: field
    .boolean()
    .description("Indicates whether this record was soft deleted.")
    .version("1.0"),

  deletedAt: field
    .string()
    .optional()
    .description("Timestamp when the entity was deleted.")
    .version("1.0")
    .as<Date>()
    .validator(validateDateTimeISO),

  deletedBy: field
    .string()
    .internal()
    .optional()
    .description("User ID of who deleted the record.")
    .version("1.0")
    .validator(validateUserId),

  deletedReason: field
    .string()
    .internal()
    .optional()
    .description("Reason the record was deleted.")
    .version("1.0")
    .validator(validateSafeText),
};

// Add schema-level validator
function validateBaseEntitySchema(
  entity: Infer<typeof baseEntityShape>
): boolean {
  const hasDateValue = (value: unknown) => {
    if (value instanceof Date) return !Number.isNaN(value.getTime());
    if (typeof value === "string") return value.trim() !== "";
    return false;
  };

  const hasTextValue = (value: unknown) =>
    typeof value === "string" && value.trim() !== "";

  if (entity.isDeleted) {
    if (!hasDateValue(entity.deletedAt))
      return false;
    if (!hasTextValue(entity.deletedBy)) return false;
    if (!hasTextValue(entity.deletedReason))
      return false;
  } else {
    if (hasDateValue(entity.deletedAt))
      return false;
    if (hasTextValue(entity.deletedBy)) return false;
    if (hasTextValue(entity.deletedReason))
      return false;
  }
  return true;
}

export const baseEntitySchema = createSchema(baseEntityShape, "baseEntity", {
  version: "1.0.0",
  piiEnforcement: "strict",
  schemaValidator: validateBaseEntitySchema,
});
export type BaseEntity = Infer<typeof baseEntitySchema> & {
  id: string;
  partitionKey: string;
};
