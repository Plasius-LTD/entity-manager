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
  isCanonicalUtcTimestamp,
  isChronologicallyAfter,
  isChronologicallyAtOrAfter,
  isOpaqueIdentifier,
  isPresentString,
  isSafeAuthorizationVersion,
} from "./validation.js";

export enum GuardianRole {
  CHILD_MANAGEMENT = "child-management",
  FINANCE_MANAGEMENT = "finance-management",
  BOTH = "both",
}

export enum GuardianRelationshipStatus {
  ACTIVE = "active",
  SUSPENDED = "suspended",
  REVOKED = "revoked",
  ADULTHOOD_TRANSITION = "adulthood-transition",
}

export enum GuardianRoleAssignmentStatus {
  ACTIVE = "active",
  REVOKED = "revoked",
}

/** Distinguishes the household owner from explicitly authorized co-guardians. */
export const GuardianRoleAssignmentKind = {
  HOST_GUARDIAN: "host-guardian",
  CO_GUARDIAN: "co-guardian",
} as const;
export type GuardianRoleAssignmentKind =
  (typeof GuardianRoleAssignmentKind)[keyof typeof GuardianRoleAssignmentKind];

export const guardianRoleAssignmentShape = {
  householdId: identifierField("Household for which the role is granted."),
  guardianAccountId: accountIdentifierField("Guardian receiving the role."),

  assignmentKind: field
    .string()
    .required()
    .version("1.0")
    .description("Whether this assignment is for the host or a co-guardian.")
    .enum([...Object.values(GuardianRoleAssignmentKind)])
    .as<GuardianRoleAssignmentKind>(),

  role: field
    .string()
    .required()
    .version("1.0")
    .description("Explicit household authority granted to the guardian.")
    .enum([...Object.values(GuardianRole)])
    .as<GuardianRole>(),

  status: field
    .string()
    .required()
    .version("1.0")
    .description("Guardian role-assignment lifecycle state.")
    .enum([...Object.values(GuardianRoleAssignmentStatus)])
    .as<GuardianRoleAssignmentStatus>(),

  authorizationVersion: field
    .number()
    .required()
    .version("1.0")
    .description("Non-negative version used to invalidate stale authority.")
    .validator(isSafeAuthorizationVersion),

  grantedAt: timestampField("Time at which the role was granted."),
  grantedByAccountId: internalAccountIdentifierField(
    "Account that granted the role.",
  ),
  revokedAt: optionalTimestampField("Time at which the role was revoked."),
  revokedByAccountId: optionalInternalAccountIdentifierField(
    "Account that revoked the role.",
  ),
};

/** Household-scoped guardian authority assignment. */
export interface GuardianRoleAssignment {
  householdId: string;
  guardianAccountId: string;
  assignmentKind: GuardianRoleAssignmentKind;
  role: GuardianRole;
  status: GuardianRoleAssignmentStatus;
  authorizationVersion: number;
  grantedAt: string;
  grantedByAccountId: string;
  revokedAt?: string;
  revokedByAccountId?: string;
}

function validateGuardianRoleAssignment(
  assignment: GuardianRoleAssignment,
): boolean {
  if (
    !isOpaqueIdentifier(assignment.householdId) ||
    !isOpaqueIdentifier(assignment.guardianAccountId) ||
    !isOpaqueIdentifier(assignment.grantedByAccountId) ||
    !isSafeAuthorizationVersion(assignment.authorizationVersion) ||
    !isCanonicalUtcTimestamp(assignment.grantedAt) ||
    !Object.values(GuardianRoleAssignmentKind).includes(
      assignment.assignmentKind,
    ) ||
    !Object.values(GuardianRole).includes(assignment.role) ||
    !Object.values(GuardianRoleAssignmentStatus).includes(assignment.status)
  ) {
    return false;
  }

  if (
    assignment.assignmentKind === GuardianRoleAssignmentKind.HOST_GUARDIAN &&
    assignment.role !== GuardianRole.BOTH
  ) {
    return false;
  }

  if (assignment.status === GuardianRoleAssignmentStatus.ACTIVE) {
    return (
      assignment.revokedAt === undefined &&
      assignment.revokedByAccountId === undefined
    );
  }

  return (
    isPresentString(assignment.revokedAt) &&
    isOpaqueIdentifier(assignment.revokedByAccountId) &&
    isChronologicallyAtOrAfter(assignment.revokedAt, assignment.grantedAt)
  );
}

export const guardianRoleAssignmentSchema = createSchema(
  guardianRoleAssignmentShape,
  "guardianRoleAssignment",
  {
    version: "1.0.0",
    piiEnforcement: "strict",
    schemaValidator: validateGuardianRoleAssignment,
  },
);

export const householdIdentityShape = {
  householdId: identifierField("Stable household identifier."),
  hostGuardianAccountId: accountIdentifierField(
    "Guardian account currently responsible for the household.",
  ),
  createdAt: timestampField("Time at which the household was created."),
  createdByAccountId: internalAccountIdentifierField(
    "Account that created the household.",
  ),
};

/** Minimal household identity without treasury, wallet, or payment state. */
export interface HouseholdIdentity {
  householdId: string;
  hostGuardianAccountId: string;
  createdAt: string;
  createdByAccountId: string;
}

export const householdIdentitySchema = createSchema(
  householdIdentityShape,
  "householdIdentity",
  {
    version: "1.0.0",
    piiEnforcement: "strict",
  },
);

export const householdGuardianBoundaryShape = {
  household: field
    .object(householdIdentityShape)
    .required()
    .version("1.0")
    .description("Household whose guardian authority is represented.")
    .as<HouseholdIdentity>(),

  guardianAssignments: field
    .array(
      field
        .object(guardianRoleAssignmentShape)
        .required()
        .as<GuardianRoleAssignment>(),
    )
    .required()
    .min(1)
    .version("1.0")
    .description("Complete guardian-authority snapshot for the household."),
};

/** Aggregate snapshot used to protect the household host invariant. */
export interface HouseholdGuardianBoundary {
  household: HouseholdIdentity;
  guardianAssignments: GuardianRoleAssignment[];
}

/**
 * Requires one active host matching the household identity. Validating the
 * proposed snapshot in the same transaction prevents removal of the last host.
 */
export function validateHouseholdGuardianBoundary(
  boundary: HouseholdGuardianBoundary,
): boolean {
  const { household, guardianAssignments } = boundary;
  if (
    !isOpaqueIdentifier(household.householdId) ||
    !isOpaqueIdentifier(household.hostGuardianAccountId) ||
    !isOpaqueIdentifier(household.createdByAccountId) ||
    !isCanonicalUtcTimestamp(household.createdAt) ||
    !Array.isArray(guardianAssignments) ||
    guardianAssignments.length === 0
  ) {
    return false;
  }

  const activeGuardianIds = new Set<string>();
  const activeHosts: GuardianRoleAssignment[] = [];

  for (const assignment of guardianAssignments) {
    if (
      assignment.householdId !== household.householdId ||
      !validateGuardianRoleAssignment(assignment)
    ) {
      return false;
    }

    if (assignment.status !== GuardianRoleAssignmentStatus.ACTIVE) continue;
    if (activeGuardianIds.has(assignment.guardianAccountId)) return false;
    activeGuardianIds.add(assignment.guardianAccountId);

    if (
      assignment.assignmentKind === GuardianRoleAssignmentKind.HOST_GUARDIAN
    ) {
      activeHosts.push(assignment);
    }
  }

  return (
    activeHosts.length === 1 &&
    activeHosts[0]?.guardianAccountId === household.hostGuardianAccountId
  );
}

export const householdGuardianBoundarySchema = createSchema(
  householdGuardianBoundaryShape,
  "householdGuardianBoundary",
  {
    version: "1.0.0",
    piiEnforcement: "strict",
    schemaValidator: validateHouseholdGuardianBoundary,
  },
);

export const guardianRelationshipShape = {
  relationshipId: identifierField("Stable guardian-child relationship identifier."),
  householdId: identifierField("Household to which the relationship belongs."),
  guardianAccountId: accountIdentifierField("Guardian account identifier."),
  childAccountId: accountIdentifierField("Managed child account identifier."),

  role: field
    .string()
    .required()
    .version("1.0")
    .description("Explicit authority granted to the guardian.")
    .enum([...Object.values(GuardianRole)]),

  status: field
    .string()
    .required()
    .version("1.0")
    .description("Guardian-child relationship lifecycle state.")
    .enum([...Object.values(GuardianRelationshipStatus)]),

  authorizationVersion: field
    .number()
    .required()
    .version("1.0")
    .description("Non-negative version used to invalidate delegated sessions.")
    .validator(isSafeAuthorizationVersion),

  establishedAt: timestampField("Time at which the relationship became active."),

  endedAt: field
    .string()
    .optional()
    .version("1.0")
    .description("Time at which relationship authority ended.")
    .validator(isCanonicalUtcTimestamp),

  endReason: field
    .string()
    .internal()
    .optional()
    .version("1.0")
    .description("Protected reason for ending the relationship.")
    .validator(validateSafeText)
    .max(256),
};

/** Versioned relationship binding a guardian to a managed child. */
export type GuardianRelationship = Infer<typeof guardianRelationshipShape>;

function validateGuardianRelationship(
  relationship: GuardianRelationship,
): boolean {
  if (relationship.guardianAccountId === relationship.childAccountId) return false;

  const isEnded =
    relationship.status === GuardianRelationshipStatus.REVOKED ||
    relationship.status === GuardianRelationshipStatus.ADULTHOOD_TRANSITION;

  if (isEnded) {
    return (
      isPresentString(relationship.endedAt) &&
      isChronologicallyAtOrAfter(
        relationship.endedAt,
        relationship.establishedAt,
      )
    );
  }

  return !isPresentString(relationship.endedAt);
}

export const guardianRelationshipSchema = createSchema(
  guardianRelationshipShape,
  "guardianRelationship",
  {
    version: "1.0.0",
    piiEnforcement: "strict",
    schemaValidator: validateGuardianRelationship,
  },
);

export enum GuardianInvitationKind {
  EXISTING_CHILD_LINK = "existing-child-link",
  CO_GUARDIAN = "co-guardian",
}

export enum GuardianInvitationStatus {
  PENDING = "pending",
  ACCEPTED = "accepted",
  DECLINED = "declined",
  REVOKED = "revoked",
  EXPIRED = "expired",
}

export const guardianInvitationShape = {
  invitationId: identifierField("Stable invitation identifier."),
  householdId: identifierField("Household issuing the invitation."),

  kind: field
    .string()
    .required()
    .version("1.0")
    .description("Whether the invitation links a child or adds a co-guardian.")
    .enum([...Object.values(GuardianInvitationKind)]),

  initiatedByAccountId: accountIdentifierField("Account that initiated the invitation."),
  targetAccountId: accountIdentifierField("Authenticated account expected to accept."),

  childAccountId: optionalAccountIdentifierField(
    "Existing child account to link; required only for child-link invitations.",
  ),

  role: field
    .string()
    .optional()
    .version("1.0")
    .description("Role offered to a co-guardian.")
    .enum([...Object.values(GuardianRole)]),

  targetAgeBand: field
    .string()
    .optional()
    .version("1.0")
    .description("Derived age band established for an existing child target.")
    .enum([...Object.values(AgeBand)]),

  targetAssurance: field
    .object(ageAssuranceEvidenceShape)
    .optional()
    .version("1.0")
    .description("Age assurance established for an existing child target.")
    .as<AgeAssuranceEvidence>(),

  status: field
    .string()
    .required()
    .version("1.0")
    .description("Invitation lifecycle state.")
    .enum([...Object.values(GuardianInvitationStatus)]),

  createdAt: timestampField("Time at which the invitation was created."),
  expiresAt: timestampField("Time after which the invitation cannot be accepted."),

  targetApprovedAt: optionalTimestampField(
    "Authenticated target approval timestamp.",
  ),
  guardianApprovedAt: optionalTimestampField(
    "Step-up-authenticated guardian approval timestamp.",
  ),
  resolvedAt: optionalTimestampField("Atomic terminal transition timestamp."),
  resolvedByAccountId: optionalAccountIdentifierField(
    "Authenticated account that completed the terminal transition.",
  ),
};

/** Expiring, two-sided invitation for family-account linking. */
export type GuardianInvitation = Infer<typeof guardianInvitationShape>;

function validateGuardianInvitation(invitation: GuardianInvitation): boolean {
  if (!isChronologicallyAfter(invitation.expiresAt, invitation.createdAt)) {
    return false;
  }

  if (invitation.initiatedByAccountId === invitation.targetAccountId) {
    return false;
  }

  for (const approvalAt of [
    invitation.targetApprovedAt,
    invitation.guardianApprovedAt,
  ]) {
    if (
      isPresentString(approvalAt) &&
      (!isChronologicallyAtOrAfter(approvalAt, invitation.createdAt) ||
        isChronologicallyAfter(approvalAt, invitation.expiresAt))
    ) {
      return false;
    }
  }

  if (invitation.kind === GuardianInvitationKind.EXISTING_CHILD_LINK) {
    if (
      invitation.childAccountId !== invitation.targetAccountId ||
      invitation.role !== undefined ||
      invitation.targetAgeBand === undefined ||
      invitation.targetAgeBand === AgeBand.ADULT ||
      invitation.targetAssurance === undefined ||
      !validateAgeAssuranceEvidence(invitation.targetAssurance) ||
      invitation.targetAssurance.level === AgeAssuranceLevel.SELF_ASSERTED
    ) {
      return false;
    }
  } else if (
    invitation.kind === GuardianInvitationKind.CO_GUARDIAN &&
    (invitation.childAccountId !== undefined ||
      invitation.role === undefined ||
      invitation.targetAgeBand !== undefined ||
      invitation.targetAssurance !== undefined)
  ) {
    return false;
  }

  if (invitation.status === GuardianInvitationStatus.PENDING) {
    return (
      !isPresentString(invitation.resolvedAt) &&
      !isPresentString(invitation.resolvedByAccountId)
    );
  }

  if (
    !isPresentString(invitation.resolvedAt) ||
    !isChronologicallyAtOrAfter(invitation.resolvedAt, invitation.createdAt) ||
    !isOpaqueIdentifier(invitation.resolvedByAccountId)
  ) {
    return false;
  }

  if (
    invitation.targetAssurance !== undefined &&
    !isChronologicallyAtOrAfter(
      invitation.resolvedAt,
      invitation.targetAssurance.assertedAt,
    )
  ) {
    return false;
  }

  if (invitation.status === GuardianInvitationStatus.ACCEPTED) {
    return (
      isPresentString(invitation.targetApprovedAt) &&
      isPresentString(invitation.guardianApprovedAt) &&
      !isChronologicallyAfter(
        invitation.targetApprovedAt,
        invitation.resolvedAt,
      ) &&
      !isChronologicallyAfter(
        invitation.guardianApprovedAt,
        invitation.resolvedAt,
      ) &&
      (invitation.resolvedByAccountId === invitation.initiatedByAccountId ||
        invitation.resolvedByAccountId === invitation.targetAccountId) &&
      !isChronologicallyAfter(invitation.resolvedAt, invitation.expiresAt) &&
      (invitation.targetAssurance === undefined ||
        invitation.targetAssurance.expiresAt === undefined ||
        isChronologicallyAfter(
          invitation.targetAssurance.expiresAt,
          invitation.resolvedAt,
        ))
    );
  }

  if (invitation.status === GuardianInvitationStatus.EXPIRED) {
    return isChronologicallyAtOrAfter(
      invitation.resolvedAt,
      invitation.expiresAt,
    );
  }

  return true;
}

export const guardianInvitationSchema = createSchema(
  guardianInvitationShape,
  "guardianInvitation",
  {
    version: "1.0.0",
    piiEnforcement: "strict",
    schemaValidator: validateGuardianInvitation,
  },
);

function identifierField(description: string) {
  return field
    .string()
    .required()
    .immutable()
    .version("1.0")
    .description(description)
    .validator(isOpaqueIdentifier);
}

function accountIdentifierField(description: string) {
  return identifierField(description).PID({
    classification: "low",
    action: "none",
    logHandling: "pseudonym",
    purpose: "family relationship authorization",
  });
}

function internalAccountIdentifierField(description: string) {
  return accountIdentifierField(description).internal();
}

function optionalAccountIdentifierField(description: string) {
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
      purpose: "family invitation authorization",
    });
}

function optionalInternalAccountIdentifierField(description: string) {
  return optionalAccountIdentifierField(description).internal();
}

function timestampField(description: string) {
  return field
    .string()
    .required()
    .version("1.0")
    .description(description)
    .validator(isCanonicalUtcTimestamp);
}

function optionalTimestampField(description: string) {
  return field
    .string()
    .optional()
    .version("1.0")
    .description(description)
    .validator(isCanonicalUtcTimestamp);
}
