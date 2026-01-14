import { createSchema, field, validatePercentage, validateSafeText } from "@plasius/schema";
import type { Infer, SchemaShape } from "@plasius/schema";
import { BaseEntity } from "../base.entity.js";
import { validateFeatureFlagValue } from "../validators/index.js";
import { validateUserIdArray } from "@plasius/schema";

export const featureFlagEntityShape: SchemaShape = {
  defaultValue: field
    .string()
    .version("1.0")
    .description("Default value of the feature flag (ON/OFF or variant)")
    .validator(validateFeatureFlagValue),

  description: field
    .string()
    .version("1.0")
    .description("Description of the feature flag")
    .validator(validateSafeText),

  rolloutPercentage: field
    .number()
    .version("1.0")
    .description("Percentage rollout (0-100), optional")
    .validator(validatePercentage)
    .optional(),

  targetedValue: field
    .string()
    .version("1.0")
    .description("Value to serve to explicitly targeted users or groups.")
    .validator(validateFeatureFlagValue),

  targetedUsers: field
    .array(field.string())
    .version("1.0")
    .description("Specific user IDs targeted, optional")
    .PID({
      classification: "low",
      action: "encrypt",
      logHandling: "pseudonym",
      purpose: "targeted feature flagging",
    })
    .validator(validateUserIdArray)
    .optional(),

  targetedGroups: field
    .array(field.string())
    .version("1.0")
    .description("Groups targeted, optional")
    .PID({
      classification: "low",
      action: "encrypt",
      logHandling: "pseudonym",
      purpose: "targeted feature flagging",
    })
    .optional(),
};

export const featureFlagEntitySchema = createSchema(
  featureFlagEntityShape,
  "featureFlagEntity",
  {
    version: "1.0.0",
    piiEnforcement: "strict",
    table: "featureFlag",
  }
);

export type FeatureFlagEntity = Infer<typeof featureFlagEntitySchema> &
  BaseEntity;
