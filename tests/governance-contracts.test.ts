import { describe, expect, it } from "vitest";
import {
  BUILT_IN_PROFESSIONAL_ROLE_CATEGORY_KEYS,
  GroupDefinitionStatus,
  GroupMembershipRole,
  GroupMembershipStatus,
  PlatformAuthority,
  PlatformAuthorityAssignmentSource,
  PlatformAuthorityAssignmentStatus,
  ProfessionalRoleAssignmentSource,
  ProfessionalRoleAssignmentStatus,
  ProfessionalRoleLifecycleStatus,
  Role,
  getLegacyPlatformAuthorityPromotions,
  groupDefinitionSchema,
  groupMembershipBoundarySchema,
  groupMembershipSchema,
  isProfessionalInterfaceKey,
  platformAuthorityAssignmentSchema,
  professionalRoleAssignmentSchema,
  professionalRoleCategorySchema,
  professionalRoleDefinitionSchema,
  validateGroupMembershipBoundary,
  validatePlatformAuthorityAssignment,
} from "../src/index.js";

const createdAt = "2026-07-18T09:00:00.000Z";
const updatedAt = "2026-07-18T10:00:00.000Z";
const archivedAt = "2026-07-18T11:00:00.000Z";
const actorAccountId = "account-admin-001";

const activeAuthorityAssignment = {
  type: "platformAuthorityAssignment",
  version: "1.0.0",
  assignmentId: "authority-assignment-001",
  identity: {
    issuer: "https://identity.example.test",
    subject: "provider-subject-001",
  },
  accountId: "account-owner-001",
  authority: PlatformAuthority.PLATFORM_OWNER,
  status: PlatformAuthorityAssignmentStatus.ACTIVE,
  source: PlatformAuthorityAssignmentSource.LEGACY_ADMIN_MIGRATION,
  revision: 1,
  lastMutationId: "migration-run-001",
  assignedAt: createdAt,
  assignedByAccountId: actorAccountId,
  reason: "Promote an existing full administrator during owner migration.",
};

describe("platform authority contracts", () => {
  it("validates a normalized immutable issuer/subject authority assignment", () => {
    expect(platformAuthorityAssignmentSchema.validate(activeAuthorityAssignment).valid).toBe(true);
    expect(validatePlatformAuthorityAssignment(activeAuthorityAssignment)).toBe(true);
  });

  it("keeps platform authority separate from legacy and professional roles", () => {
    expect(Object.values(PlatformAuthority)).toEqual([
      "platform-owner",
      "service-admin",
      "user-admin",
      "moderator",
    ]);
    expect(platformAuthorityAssignmentSchema.validate({
      ...activeAuthorityAssignment,
      authority: Role.OWNER,
    }).valid).toBe(false);
  });

  it("promotes only legacy full administrators to platform owner", () => {
    expect(getLegacyPlatformAuthorityPromotions(["admin"])).toEqual([
      PlatformAuthority.PLATFORM_OWNER,
    ]);
    expect(getLegacyPlatformAuthorityPromotions(["service-admin", "admin"])).toEqual([
      PlatformAuthority.PLATFORM_OWNER,
    ]);
    expect(getLegacyPlatformAuthorityPromotions(["user-admin", "moderator"])).toEqual([]);
  });

  it("requires complete, chronological revocation provenance", () => {
    expect(platformAuthorityAssignmentSchema.validate({
      ...activeAuthorityAssignment,
      status: PlatformAuthorityAssignmentStatus.REVOKED,
      revokedAt: updatedAt,
      revokedByAccountId: actorAccountId,
      revocationReason: "Owner access was deliberately transferred.",
    }).valid).toBe(true);

    expect(platformAuthorityAssignmentSchema.validate({
      ...activeAuthorityAssignment,
      status: PlatformAuthorityAssignmentStatus.REVOKED,
      revokedAt: createdAt,
    }).valid).toBe(false);
  });

  it("omits immutable subject and operator provenance from public serialization", () => {
    const serialized = platformAuthorityAssignmentSchema.serialize(activeAuthorityAssignment);

    expect(serialized.identity).toEqual({
      issuer: "https://identity.example.test",
    });
    expect(serialized).not.toHaveProperty("assignedByAccountId");
    expect(serialized).not.toHaveProperty("accountId");
    expect(serialized).not.toHaveProperty("lastMutationId");
    expect(serialized).not.toHaveProperty("reason");
  });
});

const activeGroupDefinition = {
  type: "groupDefinition",
  version: "1.0.0",
  groupId: "group-guild-001",
  key: "moon-guild",
  displayName: "Moon Guild",
  description: "A test guild without real member data.",
  status: GroupDefinitionStatus.ACTIVE,
  revision: 1,
  lastMutationId: "group-create-001",
  createdAt,
  createdByAccountId: actorAccountId,
};

const ownerMembership = {
  type: "groupMembership",
  version: "1.0.0",
  membershipId: "membership-owner-001",
  groupId: activeGroupDefinition.groupId,
  accountId: "account-owner-001",
  role: GroupMembershipRole.OWNER,
  status: GroupMembershipStatus.ACTIVE,
  revision: 1,
  lastMutationId: "membership-create-001",
  joinedAt: createdAt,
  roleAssignedAt: createdAt,
  addedByAccountId: actorAccountId,
  roleAssignedByAccountId: actorAccountId,
};

describe("group governance contracts", () => {
  it("validates active and archived group definitions", () => {
    expect(groupDefinitionSchema.validate(activeGroupDefinition).valid).toBe(true);
    expect(groupDefinitionSchema.validate({
      ...activeGroupDefinition,
      status: GroupDefinitionStatus.ARCHIVED,
      revision: 2,
      lastMutationId: "group-archive-001",
      archivedAt,
      archivedByAccountId: actorAccountId,
      archiveReason: "The group is no longer active.",
    }).valid).toBe(true);
  });

  it("rejects archive metadata on an active group", () => {
    expect(groupDefinitionSchema.validate({
      ...activeGroupDefinition,
      archivedAt,
      archivedByAccountId: actorAccountId,
      archiveReason: "Unexpected archive state.",
    }).valid).toBe(false);
  });

  it("validates versioned member and owner relationships", () => {
    expect(groupMembershipSchema.validate(ownerMembership).valid).toBe(true);
    expect(groupMembershipSchema.validate({
      ...ownerMembership,
      membershipId: "membership-member-001",
      accountId: "account-member-001",
      role: GroupMembershipRole.MEMBER,
      revision: 2,
      lastMutationId: "membership-remove-001",
      status: GroupMembershipStatus.REMOVED,
      removedAt: updatedAt,
      removedByAccountId: actorAccountId,
      removalReason: "Membership ended.",
    }).valid).toBe(true);
  });

  it("protects the final active group owner in aggregate snapshots", () => {
    const {
      type: _membershipType,
      version: _membershipVersion,
      ...boundaryOwnerMembership
    } = ownerMembership;
    const boundary = {
      type: "groupMembershipBoundary",
      version: "1.0.0",
      groupId: activeGroupDefinition.groupId,
      memberships: [boundaryOwnerMembership],
    };
    expect(groupMembershipBoundarySchema.validate(boundary).valid).toBe(true);
    expect(validateGroupMembershipBoundary(boundary)).toBe(true);

    const withoutOwner = {
      ...boundary,
      memberships: [{
        ...ownerMembership,
        role: GroupMembershipRole.MEMBER,
      }],
    };
    expect(groupMembershipBoundarySchema.validate(withoutOwner).valid).toBe(false);
  });

  it("rejects duplicate active accounts in a group snapshot", () => {
    expect(groupMembershipBoundarySchema.validate({
      type: "groupMembershipBoundary",
      version: "1.0.0",
      groupId: activeGroupDefinition.groupId,
      memberships: [
        ownerMembership,
        {
          ...ownerMembership,
          membershipId: "membership-owner-duplicate",
        },
      ],
    }).valid).toBe(false);
  });
});

const activeProfessionalCategory = {
  type: "professionalRoleCategory",
  version: "1.0.0",
  categoryId: "professional-category-guilds",
  key: "guilds",
  displayName: "Guilds",
  description: "Guild offices and professions.",
  status: ProfessionalRoleLifecycleStatus.ACTIVE,
  revision: 1,
  lastMutationId: "professional-category-create-001",
  createdAt,
  createdByAccountId: actorAccountId,
};

const activeProfessionalDefinition = {
  type: "professionalRoleDefinition",
  version: "1.0.0",
  definitionId: "professional-role-guild-leader",
  categoryId: activeProfessionalCategory.categoryId,
  key: "guild-leader",
  displayName: "Guild leader",
  description: "Leads an institution-scoped guild.",
  interfaceKeys: ["game.professional.guild.leader"],
  status: ProfessionalRoleLifecycleStatus.ACTIVE,
  revision: 1,
  lastMutationId: "professional-definition-create-001",
  createdAt,
  createdByAccountId: actorAccountId,
};

const activeProfessionalAssignment = {
  type: "professionalRoleAssignment",
  version: "1.0.0",
  assignmentId: "professional-assignment-001",
  definitionId: activeProfessionalDefinition.definitionId,
  worldId: "world-001",
  characterId: "character-001",
  institutionId: "institution-guild-001",
  authorityNamespace: "game.professional.guild",
  status: ProfessionalRoleAssignmentStatus.ACTIVE,
  source: ProfessionalRoleAssignmentSource.MANUAL_ADMIN,
  revision: 1,
  lastMutationId: "professional-assignment-create-001",
  effectiveFrom: createdAt,
  assignedAt: createdAt,
  assignedByAccountId: actorAccountId,
};

describe("professional role contracts", () => {
  it("exports the seed category keys without closing the category catalogue", () => {
    expect(BUILT_IN_PROFESSIONAL_ROLE_CATEGORY_KEYS).toEqual([
      "guilds",
      "education",
      "nobility",
      "divinity",
    ]);
    expect(professionalRoleCategorySchema.validate(activeProfessionalCategory).valid).toBe(true);
    expect(professionalRoleCategorySchema.validate({
      ...activeProfessionalCategory,
      categoryId: "professional-category-crafting",
      key: "crafting",
      displayName: "Crafting",
    }).valid).toBe(true);
  });

  it("accepts only non-security professional interface keys", () => {
    expect(isProfessionalInterfaceKey("game.professional.guild.leader")).toBe(true);
    expect(isProfessionalInterfaceKey("admin.route.users")).toBe(false);
    expect(professionalRoleDefinitionSchema.validate(activeProfessionalDefinition).valid).toBe(true);
    expect(professionalRoleDefinitionSchema.validate({
      ...activeProfessionalDefinition,
      interfaceKeys: ["admin.platform.owner"],
    }).valid).toBe(false);
    expect(professionalRoleDefinitionSchema.validate({
      ...activeProfessionalDefinition,
      interfaceKeys: undefined,
    }).valid).toBe(true);
    expect(professionalRoleDefinitionSchema.validate({
      ...activeProfessionalDefinition,
      interfaceKeys: [
        "game.professional.guild.leader",
        "game.professional.guild.leader",
      ],
    }).valid).toBe(false);
  });

  it("validates a world, character, and institution scoped assignment", () => {
    expect(professionalRoleAssignmentSchema.validate(activeProfessionalAssignment).valid).toBe(true);
  });

  it("always requires institution scope and permits an optional governing group", () => {
    expect(professionalRoleAssignmentSchema.validate({
      ...activeProfessionalAssignment,
      institutionId: undefined,
    }).valid).toBe(false);
    expect(professionalRoleAssignmentSchema.validate({
      ...activeProfessionalAssignment,
      groupId: "group-guild-001",
    }).valid).toBe(true);
    expect(professionalRoleAssignmentSchema.validate({
      ...activeProfessionalAssignment,
      institutionId: undefined,
      groupId: "group-guild-001",
    }).valid).toBe(false);
  });

  it("requires a governing group for group-owner delegated assignments", () => {
    expect(professionalRoleAssignmentSchema.validate({
      ...activeProfessionalAssignment,
      source: ProfessionalRoleAssignmentSource.GROUP_OWNER,
    }).valid).toBe(false);
    expect(professionalRoleAssignmentSchema.validate({
      ...activeProfessionalAssignment,
      source: ProfessionalRoleAssignmentSource.GROUP_OWNER,
      groupId: "group-guild-001",
    }).valid).toBe(true);
  });

  it("retains historical effective dates for migrated assignments", () => {
    expect(professionalRoleAssignmentSchema.validate({
      ...activeProfessionalAssignment,
      source: ProfessionalRoleAssignmentSource.MIGRATION,
      effectiveFrom: "2025-07-18T09:00:00.000Z",
    }).valid).toBe(true);
    expect(professionalRoleAssignmentSchema.validate({
      ...activeProfessionalAssignment,
      source: ProfessionalRoleAssignmentSource.MANUAL_ADMIN,
      effectiveFrom: "2025-07-18T09:00:00.000Z",
    }).valid).toBe(false);
  });

  it("requires a future effective-until timestamp", () => {
    expect(professionalRoleAssignmentSchema.validate({
      ...activeProfessionalAssignment,
      effectiveUntil: updatedAt,
    }).valid).toBe(true);
    expect(professionalRoleAssignmentSchema.validate({
      ...activeProfessionalAssignment,
      effectiveUntil: createdAt,
    }).valid).toBe(false);
  });

  it("requires complete assignment end provenance", () => {
    expect(professionalRoleAssignmentSchema.validate({
      ...activeProfessionalAssignment,
      status: ProfessionalRoleAssignmentStatus.ENDED,
      revision: 2,
      lastMutationId: "professional-assignment-end-001",
      endedAt: updatedAt,
      endedByAccountId: actorAccountId,
      endReason: "The office was transferred.",
    }).valid).toBe(true);
    expect(professionalRoleAssignmentSchema.validate({
      ...activeProfessionalAssignment,
      status: ProfessionalRoleAssignmentStatus.ENDED,
      endedAt: updatedAt,
    }).valid).toBe(false);
    expect(professionalRoleAssignmentSchema.validate({
      ...activeProfessionalAssignment,
      status: ProfessionalRoleAssignmentStatus.ENDED,
      effectiveFrom: updatedAt,
      assignedAt: updatedAt,
      endedAt: createdAt,
      endedByAccountId: actorAccountId,
      endReason: "Invalid historical end order.",
    }).valid).toBe(false);
  });
});
