import {
  createSchema,
  field,
} from "@plasius/schema";
import {
  AgeAssuranceLevel,
  AgeBand,
  ageAssuranceEvidenceShape,
  type AgeAssuranceEvidence,
  validatePublicAgeAssuranceEvidence,
} from "./age-assurance.js";
import {
  isCanonicalUtcTimestamp,
  isChronologicallyAtOrAfter,
  isOpaqueIdentifier,
  isPresentString,
  isSafeAuthorizationVersion,
  isTimestampAfterInstant,
  isTimestampAtOrBeforeInstant,
} from "./validation.js";

export const PrincipalAccountType = {
  USER: "user",
  MANAGED_CHILD: "managed-child",
} as const;
export type PrincipalAccountType =
  (typeof PrincipalAccountType)[keyof typeof PrincipalAccountType];

export const PrincipalType = {
  SELF: "self",
  GUARDIAN_DELEGATED: "guardian-delegated",
} as const;
export type PrincipalType = (typeof PrincipalType)[keyof typeof PrincipalType];

export const principalReferenceShape = {
  accountId: field
    .string()
    .required()
    .version("1.0")
    .description("Stable account identifier.")
    .validator(isOpaqueIdentifier)
    .PID({
      classification: "low",
      action: "none",
      logHandling: "pseudonym",
      purpose: "authorization principal correlation",
    }),

  accountType: field
    .string()
    .required()
    .version("1.0")
    .description("Account category represented by this principal reference.")
    .enum([...Object.values(PrincipalAccountType)]),
};

/** Stable account reference used for both authorization actors and subjects. */
export interface PrincipalReference {
  accountId: string;
  accountType: PrincipalAccountType;
}

export const actorSubjectPrincipalShape = {
  actor: field
    .object(principalReferenceShape)
    .required()
    .version("1.0")
    .description("Authenticated account that initiated the session or action.")
    .as<PrincipalReference>(),

  subject: field
    .object(principalReferenceShape)
    .required()
    .version("1.0")
    .description("Account whose authority and data scope are active.")
    .as<PrincipalReference>(),

  principalType: field
    .string()
    .required()
    .version("1.0")
    .description("Whether the subject acts directly or through a guardian.")
    .enum([...Object.values(PrincipalType)]),

  relationshipId: field
    .string()
    .optional()
    .version("1.0")
    .description("Relationship authorizing a delegated principal.")
    .validator(isOpaqueIdentifier),

  authorizationVersion: field
    .number()
    .optional()
    .version("1.0")
    .description("Version used to revoke stale delegated sessions.")
    .validator(isSafeAuthorizationVersion),

  ageBand: field
    .string()
    .optional()
    .version("1.0")
    .description("Derived age band attached to the subject.")
    .enum([...Object.values(AgeBand)]),

  assurance: field
    .object(ageAssuranceEvidenceShape)
    .optional()
    .version("1.0")
    .description("Age assurance attached to the subject.")
    .as<AgeAssuranceEvidence>(),

  authenticatedAt: field
    .string()
    .required()
    .version("1.0")
    .description("ISO 8601 timestamp for the actor authentication event.")
    .validator(isCanonicalUtcTimestamp),
};

/** Authentication principal that keeps audit actor separate from authority subject. */
export interface ActorSubjectPrincipal {
  actor: PrincipalReference;
  subject: PrincipalReference;
  principalType: PrincipalType;
  relationshipId?: string;
  authorizationVersion?: number;
  ageBand?: AgeBand;
  assurance?: AgeAssuranceEvidence;
  authenticatedAt: string;
}

function validateActorSubjectPrincipal(
  principal: ActorSubjectPrincipal,
): boolean {
  const actor = principal.actor;
  const subject = principal.subject;
  const now = Date.now();

  if (!isTimestampAtOrBeforeInstant(principal.authenticatedAt, now)) {
    return false;
  }

  const hasAgeBand = principal.ageBand !== undefined;
  const hasAssurance = principal.assurance !== undefined;
  if (hasAgeBand !== hasAssurance) return false;

  if (
    principal.assurance !== undefined &&
    (!validatePublicAgeAssuranceEvidence(principal.assurance) ||
      !isChronologicallyAtOrAfter(
        principal.authenticatedAt,
        principal.assurance.assertedAt,
      ) ||
      (principal.assurance.expiresAt !== undefined &&
        !isTimestampAfterInstant(principal.assurance.expiresAt, now)))
  ) {
    return false;
  }

  if (principal.principalType === PrincipalType.SELF) {
    if (
      principal.assurance?.level === AgeAssuranceLevel.PROVIDER_ASSERTED &&
      principal.ageBand !== AgeBand.ADULT
    ) {
      return false;
    }

    return (
      actor.accountType === PrincipalAccountType.USER &&
      subject.accountType === PrincipalAccountType.USER &&
      actor.accountId === subject.accountId &&
      !isPresentString(principal.relationshipId) &&
      principal.authorizationVersion === undefined &&
      hasAgeBand === hasAssurance
    );
  }

  if (principal.principalType === PrincipalType.GUARDIAN_DELEGATED) {
    return (
      actor.accountType === PrincipalAccountType.USER &&
      subject.accountType === PrincipalAccountType.MANAGED_CHILD &&
      actor.accountId !== subject.accountId &&
      isOpaqueIdentifier(principal.relationshipId) &&
      isSafeAuthorizationVersion(principal.authorizationVersion) &&
      principal.ageBand !== undefined &&
      principal.ageBand !== AgeBand.ADULT &&
      principal.assurance !== undefined &&
      principal.assurance.level !== AgeAssuranceLevel.SELF_ASSERTED &&
      principal.assurance.level !== AgeAssuranceLevel.PROVIDER_ASSERTED
    );
  }

  return false;
}

export const actorSubjectPrincipalSchema = createSchema(
  actorSubjectPrincipalShape,
  "actorSubjectPrincipal",
  {
    version: "1.0.0",
    piiEnforcement: "strict",
    schemaValidator: validateActorSubjectPrincipal,
  },
);
