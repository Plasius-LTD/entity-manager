import { createSchema, field } from "@plasius/schema";
import {
  isCanonicalUtcTimestamp,
  isChronologicallyAtOrAfter,
  isOpaqueIdentifier,
  isPresentString,
} from "../family/validation.js";
import {
  accountIdentifierField,
  descriptionField,
  displayNameField,
  governanceIdentifierField,
  governanceKeyField,
  internalAccountIdentifierField,
  internalReasonField,
  mutationIdentifierField,
  optionalInternalAccountIdentifierField,
  optionalTimestampField,
  revisionField,
  timestampField,
} from "./fields.js";

export enum GroupDefinitionStatus {
  ACTIVE = "active",
  ARCHIVED = "archived",
}

export enum GroupMembershipRole {
  MEMBER = "member",
  OWNER = "owner",
}

export enum GroupMembershipStatus {
  ACTIVE = "active",
  REMOVED = "removed",
}

export const groupDefinitionShape = {
  groupId: governanceIdentifierField("Stable group identifier."),
  key: governanceKeyField("Stable, URL-safe group key."),
  displayName: displayNameField("Human-readable group name."),
  description: descriptionField("Operator-facing group description."),

  status: field
    .string()
    .required()
    .version("1.0")
    .description("Group lifecycle state.")
    .enum([...Object.values(GroupDefinitionStatus)]),

  revision: revisionField(
    "Positive optimistic-concurrency revision for the group.",
  ),
  lastMutationId: mutationIdentifierField(
    "Idempotency identifier for the latest accepted group mutation.",
  ),
  createdAt: timestampField("Time at which the group was created."),
  createdByAccountId: internalAccountIdentifierField(
    "Authenticated account that created the group.",
  ),
  updatedAt: optionalTimestampField("Time of the latest non-archive update."),
  updatedByAccountId: optionalInternalAccountIdentifierField(
    "Authenticated account that performed the latest update.",
  ),
  archivedAt: optionalTimestampField("Time at which the group was archived."),
  archivedByAccountId: optionalInternalAccountIdentifierField(
    "Authenticated account that archived the group.",
  ),
  archiveReason: internalReasonField(
    "Protected operator reason for archiving the group.",
    false,
  ),
};

export interface GroupDefinition {
  groupId: string;
  key: string;
  displayName: string;
  description: string;
  status: GroupDefinitionStatus;
  revision: number;
  lastMutationId: string;
  createdAt: string;
  createdByAccountId: string;
  updatedAt?: string;
  updatedByAccountId?: string;
  archivedAt?: string;
  archivedByAccountId?: string;
  archiveReason?: string;
}

function validateGroupDefinitionLifecycle(group: GroupDefinition): boolean {
  const hasUpdate = group.updatedAt !== undefined || group.updatedByAccountId !== undefined;
  if (
    hasUpdate &&
    (!isCanonicalUtcTimestamp(group.updatedAt) ||
      !isOpaqueIdentifier(group.updatedByAccountId) ||
      !isChronologicallyAtOrAfter(group.updatedAt, group.createdAt))
  ) {
    return false;
  }

  if (group.status === GroupDefinitionStatus.ACTIVE) {
    return (
      group.archivedAt === undefined &&
      group.archivedByAccountId === undefined &&
      group.archiveReason === undefined
    );
  }

  return (
    isCanonicalUtcTimestamp(group.archivedAt) &&
    isOpaqueIdentifier(group.archivedByAccountId) &&
    isPresentString(group.archiveReason) &&
    isChronologicallyAtOrAfter(group.archivedAt, group.updatedAt ?? group.createdAt)
  );
}

export const groupDefinitionSchema = createSchema(
  groupDefinitionShape,
  "groupDefinition",
  {
    version: "1.0.0",
    piiEnforcement: "strict",
    schemaValidator: validateGroupDefinitionLifecycle,
  },
);

export const groupMembershipShape = {
  membershipId: governanceIdentifierField("Stable group-membership identifier."),
  groupId: governanceIdentifierField("Group containing this membership."),
  accountId: accountIdentifierField("Account represented by this membership.").internal(),

  role: field
    .string()
    .required()
    .version("1.0")
    .description("Member or owner relationship within the group.")
    .enum([...Object.values(GroupMembershipRole)]),

  status: field
    .string()
    .required()
    .version("1.0")
    .description("Membership lifecycle state.")
    .enum([...Object.values(GroupMembershipStatus)]),

  revision: revisionField(
    "Positive optimistic-concurrency revision for the membership.",
  ),
  lastMutationId: mutationIdentifierField(
    "Idempotency identifier for the latest accepted membership mutation.",
  ),
  joinedAt: timestampField("Time at which the account joined the group."),
  addedByAccountId: internalAccountIdentifierField(
    "Authenticated account that added the member.",
  ),
  roleAssignedAt: timestampField(
    "Time at which the current member or owner role was assigned.",
  ),
  roleAssignedByAccountId: internalAccountIdentifierField(
    "Authenticated account that assigned the current relationship.",
  ),
  removedAt: optionalTimestampField("Time at which membership ended."),
  removedByAccountId: optionalInternalAccountIdentifierField(
    "Authenticated account that removed the member.",
  ),
  removalReason: internalReasonField(
    "Protected operator reason for ending membership.",
    false,
  ),
};

export interface GroupMembership {
  membershipId: string;
  groupId: string;
  accountId: string;
  role: GroupMembershipRole;
  status: GroupMembershipStatus;
  revision: number;
  lastMutationId: string;
  joinedAt: string;
  addedByAccountId: string;
  roleAssignedAt: string;
  roleAssignedByAccountId: string;
  removedAt?: string;
  removedByAccountId?: string;
  removalReason?: string;
}

function validateGroupMembershipLifecycle(
  membership: GroupMembership,
): boolean {
  if (
    !isChronologicallyAtOrAfter(
      membership.roleAssignedAt,
      membership.joinedAt,
    )
  ) {
    return false;
  }

  if (membership.status === GroupMembershipStatus.ACTIVE) {
    return (
      membership.removedAt === undefined &&
      membership.removedByAccountId === undefined &&
      membership.removalReason === undefined
    );
  }

  return (
    isCanonicalUtcTimestamp(membership.removedAt) &&
    isOpaqueIdentifier(membership.removedByAccountId) &&
    isPresentString(membership.removalReason) &&
    isChronologicallyAtOrAfter(
      membership.removedAt,
      membership.roleAssignedAt,
    )
  );
}

export const groupMembershipSchema = createSchema(
  groupMembershipShape,
  "groupMembership",
  {
    version: "1.0.0",
    piiEnforcement: "strict",
    schemaValidator: validateGroupMembershipLifecycle,
  },
);

export const groupMembershipBoundaryShape = {
  groupId: governanceIdentifierField(
    "Group whose complete current membership is represented.",
  ),
  memberships: field
    .array(
      field
        .object(groupMembershipShape)
        .required()
        .as<GroupMembership>(),
    )
    .required()
    .min(1)
    .version("1.0")
    .description("Complete current membership snapshot for invariant checks."),
};

export interface GroupMembershipBoundary {
  groupId: string;
  memberships: GroupMembership[];
}

/**
 * Validates a proposed membership snapshot atomically so no transition can
 * remove the final active owner.
 */
export function validateGroupMembershipBoundary(
  boundary: GroupMembershipBoundary,
): boolean {
  if (
    !Array.isArray(boundary.memberships) ||
    boundary.memberships.length === 0
  ) {
    return false;
  }

  const membershipIds = new Set<string>();
  const activeAccountIds = new Set<string>();
  let activeOwnerCount = 0;

  for (const membership of boundary.memberships) {
    if (
      membership.groupId !== boundary.groupId ||
      !groupMembershipSchema.validate({
        ...membership,
        type: "groupMembership",
        version: "1.0.0",
      }).valid ||
      membershipIds.has(membership.membershipId)
    ) {
      return false;
    }
    membershipIds.add(membership.membershipId);

    if (membership.status !== GroupMembershipStatus.ACTIVE) {
      continue;
    }
    if (activeAccountIds.has(membership.accountId)) {
      return false;
    }
    activeAccountIds.add(membership.accountId);
    if (membership.role === GroupMembershipRole.OWNER) {
      activeOwnerCount += 1;
    }
  }

  return activeOwnerCount >= 1;
}

export const groupMembershipBoundarySchema = createSchema(
  groupMembershipBoundaryShape,
  "groupMembershipBoundary",
  {
    version: "1.0.0",
    piiEnforcement: "strict",
    schemaValidator: validateGroupMembershipBoundary,
  },
);
