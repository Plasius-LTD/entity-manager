import {
  createSchema,
  field,
} from "@plasius/schema";
import {
  isCanonicalUtcTimestamp,
  isChronologicallyAfter,
  isOpaqueIdentifier,
} from "./validation.js";

/** A deliberately derived age range; exact birth dates are not part of this contract. */
export const AgeBand = {
  FIVE: "5",
  SIX_TO_NINE: "6-9",
  TEN_TO_TWELVE: "10-12",
  THIRTEEN_TO_FIFTEEN: "13-15",
  SIXTEEN_TO_SEVENTEEN: "16-17",
  ADULT: "18+",
} as const;
export type AgeBand = (typeof AgeBand)[keyof typeof AgeBand];

export const AgeAssuranceLevel = {
  SELF_ASSERTED: "self-asserted",
  GUARDIAN_ATTESTED: "guardian-attested",
  VERIFIED: "verified",
} as const;
export type AgeAssuranceLevel =
  (typeof AgeAssuranceLevel)[keyof typeof AgeAssuranceLevel];

export const AgeAssuranceMethod = {
  SELF_ASSERTION: "self-assertion",
  GUARDIAN_ATTESTATION: "guardian-attestation",
  VERIFIED_PROVIDER: "verified-provider",
  MANUAL_REVIEW: "manual-review",
} as const;
export type AgeAssuranceMethod =
  (typeof AgeAssuranceMethod)[keyof typeof AgeAssuranceMethod];

export const ageAssuranceEvidenceShape = {
  level: field
    .string()
    .required()
    .version("1.0")
    .description("Strength of the age assurance decision.")
    .enum([...Object.values(AgeAssuranceLevel)]),

  method: field
    .string()
    .required()
    .version("1.0")
    .description("Method used to establish the assurance level.")
    .enum([...Object.values(AgeAssuranceMethod)]),

  assertedAt: field
    .string()
    .required()
    .version("1.0")
    .description("ISO 8601 timestamp at which the assurance was established.")
    .validator(isCanonicalUtcTimestamp),

  expiresAt: field
    .string()
    .optional()
    .version("1.0")
    .description("Optional ISO 8601 expiry for time-bounded assurance.")
    .validator(isCanonicalUtcTimestamp),

  evidenceRef: field
    .string()
    .internal()
    .optional()
    .version("1.0")
    .description("Opaque reference to separately protected assurance evidence.")
    .validator(isOpaqueIdentifier)
    .PID({
      classification: "low",
      action: "none",
      logHandling: "omit",
      purpose: "age assurance evidence correlation",
    }),
};

/** Minimal evidence supporting an age decision without raw birth data. */
export interface AgeAssuranceEvidence {
  level: AgeAssuranceLevel;
  method: AgeAssuranceMethod;
  assertedAt: string;
  expiresAt?: string;
  evidenceRef?: string;
}

function validateAgeAssuranceEvidenceWithPolicy(
  evidence: AgeAssuranceEvidence,
  allowRedactedProviderEvidence: boolean,
): boolean {
  if (!isCanonicalUtcTimestamp(evidence.assertedAt)) return false;

  if (
    evidence.evidenceRef !== undefined &&
    !isOpaqueIdentifier(evidence.evidenceRef)
  ) {
    return false;
  }

  if (
    evidence.expiresAt !== undefined &&
    !isChronologicallyAfter(evidence.expiresAt, evidence.assertedAt)
  ) {
    return false;
  }

  switch (evidence.method) {
    case AgeAssuranceMethod.SELF_ASSERTION:
      return evidence.level === AgeAssuranceLevel.SELF_ASSERTED;
    case AgeAssuranceMethod.GUARDIAN_ATTESTATION:
      return evidence.level === AgeAssuranceLevel.GUARDIAN_ATTESTED;
    case AgeAssuranceMethod.VERIFIED_PROVIDER:
      return (
        evidence.level === AgeAssuranceLevel.VERIFIED &&
        (isOpaqueIdentifier(evidence.evidenceRef) ||
          (allowRedactedProviderEvidence && evidence.evidenceRef === undefined))
      );
    case AgeAssuranceMethod.MANUAL_REVIEW:
      return evidence.level === AgeAssuranceLevel.VERIFIED;
    default:
      return false;
  }
}

/**
 * Validates stored assurance, including the protected provider evidence
 * reference required for provider-verified decisions.
 */
export function validateAgeAssuranceEvidence(
  evidence: AgeAssuranceEvidence,
): boolean {
  return validateAgeAssuranceEvidenceWithPolicy(evidence, false);
}

/**
 * Validates assurance carried by a public principal after internal evidence
 * references have been intentionally removed during serialization.
 */
export function validatePublicAgeAssuranceEvidence(
  evidence: AgeAssuranceEvidence,
): boolean {
  return validateAgeAssuranceEvidenceWithPolicy(evidence, true);
}

export const ageAssuranceEvidenceSchema = createSchema(
  ageAssuranceEvidenceShape,
  "ageAssuranceEvidence",
  {
    version: "1.0.0",
    piiEnforcement: "strict",
    schemaValidator: validateAgeAssuranceEvidence,
  },
);
