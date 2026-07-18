import { createSchema, field } from "@plasius/schema";
import {
  isCanonicalUtcTimestamp,
  isChronologicallyAtOrAfter,
  isOpaqueIdentifier,
  isPresentString,
} from "../family/validation.js";
import {
  governanceIdentifierField,
  internalAccountIdentifierField,
  internalReasonField,
  mutationIdentifierField,
  optionalInternalAccountIdentifierField,
  optionalTimestampField,
  revisionField,
  timestampField,
} from "./fields.js";
import {
  isPlatformIdentityIssuer,
  isPlatformIdentitySubject,
} from "./validation.js";

/** Fixed platform security authorities. Never use this enum for game roles. */
export enum PlatformAuthority {
  PLATFORM_OWNER = "platform-owner",
  SERVICE_ADMIN = "service-admin",
  USER_ADMIN = "user-admin",
  MODERATOR = "moderator",
}

export enum PlatformAuthorityAssignmentStatus {
  ACTIVE = "active",
  REVOKED = "revoked",
}

export enum PlatformAuthorityAssignmentSource {
  OWNER_GRANT = "owner-grant",
  LEGACY_ADMIN_MIGRATION = "migration",
  OWNER_BOOTSTRAP = "bootstrap",
  RECOVERY = "recovery",
}

export const platformIdentityReferenceShape = {
  issuer: field
    .string()
    .required()
    .immutable()
    .version("1.0")
    .description("Canonical OIDC issuer for the immutable platform identity.")
    .validator(isPlatformIdentityIssuer),

  subject: field
    .string()
    .required()
    .immutable()
    .internal()
    .version("1.0")
    .description("Case-sensitive OIDC subject within the issuer namespace.")
    .validator(isPlatformIdentitySubject)
    .PID({
      classification: "low",
      action: "none",
      logHandling: "pseudonym",
      purpose: "platform authority identity binding",
    }),
};

export interface PlatformIdentityReference {
  issuer: string;
  subject: string;
}

export const platformAuthorityAssignmentShape = {
  assignmentId: governanceIdentifierField(
    "Stable identifier for this platform-authority assignment.",
  ),

  identity: field
    .object(platformIdentityReferenceShape)
    .required()
    .immutable()
    .version("1.0")
    .description("Immutable issuer and subject receiving platform authority.")
    .as<PlatformIdentityReference>(),

  accountId: internalAccountIdentifierField(
    "Stable platform account receiving the authority assignment.",
  ),

  authority: field
    .string()
    .required()
    .immutable()
    .version("1.0")
    .description("Fixed platform security authority granted to the identity.")
    .enum([...Object.values(PlatformAuthority)]),

  status: field
    .string()
    .required()
    .version("1.0")
    .description("Current assignment lifecycle state.")
    .enum([...Object.values(PlatformAuthorityAssignmentStatus)]),

  source: field
    .string()
    .required()
    .immutable()
    .version("1.0")
    .description("Governed source that established the assignment.")
    .enum([...Object.values(PlatformAuthorityAssignmentSource)]),

  revision: revisionField(
    "Positive optimistic-concurrency revision for the assignment.",
  ),
  lastMutationId: mutationIdentifierField(
    "Idempotency identifier for the latest accepted mutation.",
  ),
  assignedAt: timestampField("Time at which the authority was assigned."),
  assignedByAccountId: internalAccountIdentifierField(
    "Authenticated account that assigned or migrated the authority.",
  ),
  reason: internalReasonField(
    "Protected operator reason for the authority assignment.",
    true,
  ),
  revokedAt: optionalTimestampField("Time at which the authority was revoked."),
  revokedByAccountId: optionalInternalAccountIdentifierField(
    "Authenticated account that revoked the authority.",
  ),
  revocationReason: internalReasonField(
    "Protected operator reason for revoking the authority.",
    false,
  ),
};

export interface PlatformAuthorityAssignment {
  assignmentId: string;
  identity: PlatformIdentityReference;
  accountId: string;
  authority: PlatformAuthority;
  status: PlatformAuthorityAssignmentStatus;
  source: PlatformAuthorityAssignmentSource;
  revision: number;
  lastMutationId: string;
  assignedAt: string;
  assignedByAccountId: string;
  reason: string;
  revokedAt?: string;
  revokedByAccountId?: string;
  revocationReason?: string;
}

function validatePlatformAuthorityLifecycle(
  assignment: PlatformAuthorityAssignment,
): boolean {
  if (
    !isOpaqueIdentifier(assignment.assignedByAccountId) ||
    !isCanonicalUtcTimestamp(assignment.assignedAt) ||
    !isPresentString(assignment.reason)
  ) {
    return false;
  }

  if (assignment.status === PlatformAuthorityAssignmentStatus.ACTIVE) {
    return (
      assignment.revokedAt === undefined &&
      assignment.revokedByAccountId === undefined &&
      assignment.revocationReason === undefined
    );
  }

  return (
    isCanonicalUtcTimestamp(assignment.revokedAt) &&
    isOpaqueIdentifier(assignment.revokedByAccountId) &&
    isPresentString(assignment.revocationReason) &&
    isChronologicallyAtOrAfter(
      assignment.revokedAt,
      assignment.assignedAt,
    )
  );
}

export const platformAuthorityAssignmentSchema = createSchema(
  platformAuthorityAssignmentShape,
  "platformAuthorityAssignment",
  {
    version: "1.0.0",
    piiEnforcement: "strict",
    schemaValidator: validatePlatformAuthorityLifecycle,
  },
);

export function validatePlatformAuthorityAssignment(
  value: unknown,
): value is PlatformAuthorityAssignment {
  return platformAuthorityAssignmentSchema.validate(value).valid;
}

/**
 * Maps only legacy full-admin aliases to the new owner authority. User-admin
 * and moderator roles intentionally receive no promotion.
 */
export function getLegacyPlatformAuthorityPromotions(
  legacyRoles: readonly string[],
): PlatformAuthority[] {
  const normalized = new Set(
    legacyRoles
      .filter((role): role is string => typeof role === "string")
      .map((role) => role.trim().toLowerCase()),
  );

  return normalized.has("admin") || normalized.has("service-admin")
    ? [PlatformAuthority.PLATFORM_OWNER]
    : [];
}
