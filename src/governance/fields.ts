import { field, validateSafeText } from "@plasius/schema";
import {
  isCanonicalUtcTimestamp,
  isOpaqueIdentifier,
} from "../family/validation.js";
import {
  isGovernanceIdentifier,
  isGovernanceKey,
  isPositiveGovernanceRevision,
} from "./validation.js";

export function governanceIdentifierField(description: string) {
  return field
    .string()
    .required()
    .immutable()
    .version("1.0")
    .description(description)
    .validator(isGovernanceIdentifier);
}

export function optionalGovernanceIdentifierField(description: string) {
  return field
    .string()
    .optional()
    .immutable()
    .version("1.0")
    .description(description)
    .validator(isGovernanceIdentifier);
}

export function accountIdentifierField(description: string) {
  return field
    .string()
    .required()
    .immutable()
    .version("1.0")
    .description(description)
    .validator(isOpaqueIdentifier)
    .PID({
      classification: "low",
      action: "none",
      logHandling: "pseudonym",
      purpose: "administrative authority provenance",
    });
}

export function internalAccountIdentifierField(description: string) {
  return accountIdentifierField(description).internal();
}

export function optionalInternalAccountIdentifierField(description: string) {
  return field
    .string()
    .optional()
    .version("1.0")
    .description(description)
    .validator(isOpaqueIdentifier)
    .PID({
      classification: "low",
      action: "none",
      logHandling: "pseudonym",
      purpose: "administrative authority provenance",
    })
    .internal();
}

export function governanceKeyField(description: string) {
  return field
    .string()
    .required()
    .immutable()
    .version("1.0")
    .description(description)
    .validator(isGovernanceKey);
}

export function displayNameField(description: string) {
  return field
    .string()
    .required()
    .version("1.0")
    .description(description)
    .validator(validateSafeText)
    .min(1)
    .max(96);
}

export function descriptionField(description: string) {
  return field
    .string()
    .required()
    .version("1.0")
    .description(description)
    .validator(validateSafeText)
    .min(1)
    .max(512);
}

export function internalReasonField(description: string, required: boolean) {
  const builder = field
    .string()
    .version("1.0")
    .description(description)
    .validator(validateSafeText)
    .min(1)
    .max(512)
    .internal();

  return required ? builder.required() : builder.optional();
}

export function timestampField(description: string) {
  return field
    .string()
    .required()
    .version("1.0")
    .description(description)
    .validator(isCanonicalUtcTimestamp);
}

export function optionalTimestampField(description: string) {
  return field
    .string()
    .optional()
    .version("1.0")
    .description(description)
    .validator(isCanonicalUtcTimestamp);
}

export function revisionField(description: string) {
  return field
    .number()
    .required()
    .version("1.0")
    .description(description)
    .validator(isPositiveGovernanceRevision);
}

export function mutationIdentifierField(description: string) {
  return field
    .string()
    .required()
    .version("1.0")
    .description(description)
    .validator(isGovernanceIdentifier)
    .internal();
}
