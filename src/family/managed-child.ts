import {
  createSchema,
  field,
  type Infer,
  validateSafeText,
} from "@plasius/schema";
import {
  AgeAssuranceLevel,
  AgeBand,
  ageAssuranceEvidenceShape,
  type AgeAssuranceEvidence,
  validateAgeAssuranceEvidence,
} from "./age-assurance.js";
import {
  isChronologicallyAfter,
  isCanonicalUtcTimestamp,
  isChronologicallyAtOrAfter,
  isOpaqueIdentifier,
  isPresentString,
} from "./validation.js";

export enum ManagedChildLifecycleState {
  ACTIVE = "active",
  SUSPENDED = "suspended",
  ADULT_CLAIM_REQUIRED = "adult-claim-required",
  CLAIMED = "claimed",
  CLOSED = "closed",
}

export const managedChildProfileShape = {
  accountId: field
    .string()
    .required()
    .immutable()
    .version("1.0")
    .description("Stable account identifier for the managed child.")
    .validator(isOpaqueIdentifier)
    .PID({
      classification: "low",
      action: "none",
      logHandling: "pseudonym",
      purpose: "managed child account correlation",
    }),

  displayName: field
    .string()
    .required()
    .version("1.0")
    .description("Age-appropriate display name; not a required legal name.")
    .validator(validateSafeText)
    .min(1)
    .max(64)
    .PID({
      classification: "high",
      action: "encrypt",
      logHandling: "redact",
      purpose: "managed child presentation",
    }),

  ageBand: field
    .string()
    .required()
    .version("1.0")
    .description("Derived age band; exact date of birth is deliberately absent.")
    .enum([...Object.values(AgeBand)]),

  assurance: field
    .object(ageAssuranceEvidenceShape)
    .required()
    .version("1.0")
    .description("Evidence supporting the derived age band.")
    .as<AgeAssuranceEvidence>(),

  lifecycleState: field
    .string()
    .required()
    .version("1.0")
    .description("Managed-child account lifecycle state.")
    .enum([...Object.values(ManagedChildLifecycleState)]),

  createdAt: field
    .string()
    .required()
    .immutable()
    .version("1.0")
    .description("ISO 8601 creation timestamp.")
    .validator(isCanonicalUtcTimestamp),

  createdByAccountId: field
    .string()
    .internal()
    .required()
    .immutable()
    .version("1.0")
    .description("Guardian account that created the managed profile.")
    .validator(isOpaqueIdentifier)
    .PID({
      classification: "low",
      action: "none",
      logHandling: "pseudonym",
      purpose: "managed child creation audit",
    }),

  claimedAt: field
    .string()
    .optional()
    .version("1.0")
    .description("ISO 8601 time at which the adult claimed the account.")
    .validator(isCanonicalUtcTimestamp),

  closedAt: field
    .string()
    .optional()
    .version("1.0")
    .description("ISO 8601 time at which the managed profile was closed.")
    .validator(isCanonicalUtcTimestamp),
};

/** Email-free child account profile inferred from the versioned schema. */
export type ManagedChildProfile = Infer<typeof managedChildProfileShape>;

function validateManagedChildProfile(profile: ManagedChildProfile): boolean {
  if (profile.createdByAccountId === profile.accountId) return false;
  if (!validateAgeAssuranceEvidence(profile.assurance)) return false;
  if (
    profile.assurance.level === AgeAssuranceLevel.SELF_ASSERTED ||
    profile.assurance.level === AgeAssuranceLevel.PROVIDER_ASSERTED
  ) {
    return false;
  }
  if (
    !isChronologicallyAtOrAfter(
      profile.createdAt,
      profile.assurance.assertedAt,
    ) ||
    (profile.assurance.expiresAt !== undefined &&
      !isChronologicallyAfter(profile.assurance.expiresAt, profile.createdAt))
  ) {
    return false;
  }

  const isAdult = profile.ageBand === AgeBand.ADULT;
  const adultState =
    profile.lifecycleState === ManagedChildLifecycleState.ADULT_CLAIM_REQUIRED ||
    profile.lifecycleState === ManagedChildLifecycleState.CLAIMED;

  if (
    isAdult !== adultState &&
    profile.lifecycleState !== ManagedChildLifecycleState.CLOSED
  ) {
    return false;
  }

  if (profile.lifecycleState === ManagedChildLifecycleState.CLAIMED) {
    return (
      isPresentString(profile.claimedAt) &&
      isChronologicallyAtOrAfter(profile.claimedAt, profile.createdAt) &&
      !isPresentString(profile.closedAt)
    );
  }

  if (profile.lifecycleState === ManagedChildLifecycleState.CLOSED) {
    if (
      !isPresentString(profile.closedAt) ||
      !isChronologicallyAtOrAfter(profile.closedAt, profile.createdAt)
    ) {
      return false;
    }

    if (!isPresentString(profile.claimedAt)) return true;

    return (
      isAdult &&
      isChronologicallyAtOrAfter(profile.claimedAt, profile.createdAt) &&
      isChronologicallyAtOrAfter(profile.closedAt, profile.claimedAt)
    );
  }

  return (
    !isPresentString(profile.claimedAt) &&
    !isPresentString(profile.closedAt)
  );
}

export const managedChildProfileSchema = createSchema(
  managedChildProfileShape,
  "managedChildProfile",
  {
    version: "1.0.0",
    piiEnforcement: "strict",
    schemaValidator: validateManagedChildProfile,
  },
);
