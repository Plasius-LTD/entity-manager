import { describe, expect, it } from "vitest";
import {
  AgeAssuranceLevel,
  AgeAssuranceMethod,
  AgeBand,
  GuardianInvitationKind,
  GuardianInvitationStatus,
  GuardianRelationshipStatus,
  GuardianRole,
  GuardianRoleAssignmentKind,
  GuardianRoleAssignmentStatus,
  ManagedChildLifecycleState,
  PrincipalAccountType,
  PrincipalType,
  type ActorSubjectPrincipal,
  type AgeAssuranceEvidence,
  actorSubjectPrincipalSchema,
  ageAssuranceEvidenceSchema,
  guardianInvitationSchema,
  guardianRelationshipSchema,
  guardianRoleAssignmentSchema,
  householdGuardianBoundarySchema,
  householdIdentitySchema,
  managedChildProfileSchema,
  userEntitySchema,
  validateAgeAssuranceEvidence,
  validateHouseholdGuardianBoundary,
  validatePublicAgeAssuranceEvidence,
} from "../src/index.js";

const createdAt = "2025-07-15T09:00:00.000Z";
const expiresAt = "2025-07-16T09:00:00.000Z";
const guardianAccountId = "guardian-account-001";
const childAccountId = "managed-child-001";

const guardianAssurance = {
  level: AgeAssuranceLevel.GUARDIAN_ATTESTED,
  method: AgeAssuranceMethod.GUARDIAN_ATTESTATION,
  assertedAt: createdAt,
};

describe("ageAssuranceEvidenceSchema", () => {
  it("keeps the public age-band contract stable", () => {
    expect(Object.values(AgeBand)).toEqual([
      "5",
      "6-9",
      "10-12",
      "13-15",
      "16-17",
      "18+",
    ]);
  });

  it("exposes assignable literal-union types while preserving dot-style constants", () => {
    const literalAgeBand: AgeBand = "6-9";
    const literalLevel: AgeAssuranceLevel = "guardian-attested";
    const literalMethod: AgeAssuranceMethod = "guardian-attestation";
    const literalEvidence: AgeAssuranceEvidence = {
      level: literalLevel,
      method: literalMethod,
      assertedAt: createdAt,
    };

    expect(literalAgeBand).toBe(AgeBand.SIX_TO_NINE);
    expect(literalEvidence).toEqual(guardianAssurance);
    expect(validateAgeAssuranceEvidence(literalEvidence)).toBe(true);
  });

  it("validates derived child age assurance without requiring date of birth", () => {
    const result = ageAssuranceEvidenceSchema.validate({
      type: "ageAssuranceEvidence",
      version: "1.0.0",
      ...guardianAssurance,
    });

    expect(result.valid).toBe(true);
  });

  it("rejects inconsistent assurance method and level combinations", () => {
    const result = ageAssuranceEvidenceSchema.validate({
      type: "ageAssuranceEvidence",
      version: "1.0.0",
      ...guardianAssurance,
      level: AgeAssuranceLevel.VERIFIED,
    });

    expect(result.valid).toBe(false);
  });

  it("rejects an evidence expiry that is not after assurance", () => {
    const result = ageAssuranceEvidenceSchema.validate({
      type: "ageAssuranceEvidence",
      version: "1.0.0",
      ...guardianAssurance,
      expiresAt: createdAt,
    });

    expect(result.valid).toBe(false);
    expect(
      validateAgeAssuranceEvidence({
        ...guardianAssurance,
        expiresAt: "",
      }),
    ).toBe(false);
  });

  it.each([
    "2025-07-15T10:00:00+01:00",
    "2025-07-15T09:00:00.1Z",
    "2025-07-15T09:00:00.0000Z",
    "2025-02-29T09:00:00.000Z",
  ])("rejects a non-canonical UTC millisecond timestamp: %s", (assertedAt) => {
    const result = ageAssuranceEvidenceSchema.validate({
      type: "ageAssuranceEvidence",
      version: "1.0.0",
      ...guardianAssurance,
      assertedAt,
    });

    expect(result.valid).toBe(false);
  });

  it("accepts a canonical UTC timestamp without fractional seconds", () => {
    const result = ageAssuranceEvidenceSchema.validate({
      type: "ageAssuranceEvidence",
      version: "1.0.0",
      ...guardianAssurance,
      assertedAt: "2025-07-15T09:00:00Z",
    });

    expect(result.valid).toBe(true);
  });

  it("requires provider evidence for provider-verified assurance", () => {
    const redactedEvidence = {
      level: AgeAssuranceLevel.VERIFIED,
      method: AgeAssuranceMethod.VERIFIED_PROVIDER,
      assertedAt: createdAt,
    };
    const result = ageAssuranceEvidenceSchema.validate({
      type: "ageAssuranceEvidence",
      version: "1.0.0",
      ...redactedEvidence,
    });

    expect(result.valid).toBe(false);
    expect(validateAgeAssuranceEvidence(redactedEvidence)).toBe(false);
    expect(validatePublicAgeAssuranceEvidence(redactedEvidence)).toBe(true);
  });

  it("omits assurance evidence identifiers and raw birth data from public serialization", () => {
    const serialized = ageAssuranceEvidenceSchema.serialize({
      type: "ageAssuranceEvidence",
      version: "1.0.0",
      ...guardianAssurance,
      evidenceRef: "assurance-evidence-001",
      dateOfBirth: "2018-01-01",
    });

    expect(serialized).toEqual({
      type: "ageAssuranceEvidence",
      version: "1.0.0",
      level: AgeAssuranceLevel.GUARDIAN_ATTESTED,
      method: AgeAssuranceMethod.GUARDIAN_ATTESTATION,
      assertedAt: createdAt,
    });
  });
});

describe("managedChildProfileSchema", () => {
  const managedChild = {
    type: "managedChildProfile",
    version: "1.0.0",
    accountId: childAccountId,
    displayName: "Moon Explorer",
    ageBand: AgeBand.SIX_TO_NINE,
    assurance: guardianAssurance,
    lifecycleState: ManagedChildLifecycleState.ACTIVE,
    createdAt,
    createdByAccountId: guardianAccountId,
  };

  it("validates an email-free managed child profile", () => {
    const result = managedChildProfileSchema.validate(managedChild);

    expect(result.valid).toBe(true);
    expect(managedChild).not.toHaveProperty("email");
    expect(managedChildProfileSchema.describe().shape).not.toHaveProperty("email");
    expect(managedChildProfileSchema.describe().shape).not.toHaveProperty("tokenBalance");
  });

  it("omits guardian audit and assurance evidence references from child serialization", () => {
    const serialized = managedChildProfileSchema.serialize({
      ...managedChild,
      assurance: {
        level: AgeAssuranceLevel.VERIFIED,
        method: AgeAssuranceMethod.VERIFIED_PROVIDER,
        assertedAt: createdAt,
        evidenceRef: "provider-evidence-001",
      },
    });

    expect(serialized).not.toHaveProperty("createdByAccountId");
    expect(serialized.assurance).not.toHaveProperty("evidenceRef");
  });

  it("supports the baseline minimum age band", () => {
    const result = managedChildProfileSchema.validate({
      ...managedChild,
      ageBand: AgeBand.FIVE,
    });

    expect(result.valid).toBe(true);
  });

  it("rejects display names beyond the documented profile bound", () => {
    const result = managedChildProfileSchema.validate({
      ...managedChild,
      displayName: "A".repeat(65),
    });

    expect(result.valid).toBe(false);
  });

  it("rejects structurally inconsistent nested assurance", () => {
    const result = managedChildProfileSchema.validate({
      ...managedChild,
      assurance: {
        ...guardianAssurance,
        method: AgeAssuranceMethod.SELF_ASSERTION,
      },
    });

    expect(result.valid).toBe(false);
  });

  it("keeps the existing user entity email requirement intact", () => {
    const result = userEntitySchema.validate({
      type: "userEntity",
      version: "1.0.0",
      name: {
        firstName: "Adult",
        lastName: "Account",
        displayName: "Adult Account",
        preferredDisplayOrder: "display_name",
      },
    });

    expect(result.valid).toBe(false);
  });

  it("requires an adulthood transition before an 18+ managed child can remain historical", () => {
    const result = managedChildProfileSchema.validate({
      ...managedChild,
      ageBand: AgeBand.ADULT,
      assurance: {
        level: AgeAssuranceLevel.VERIFIED,
        method: AgeAssuranceMethod.VERIFIED_PROVIDER,
        assertedAt: createdAt,
        evidenceRef: "adult-evidence-001",
      },
    });

    expect(result.valid).toBe(false);
  });

  it("validates an explicit adult claim state and timestamp", () => {
    const result = managedChildProfileSchema.validate({
      ...managedChild,
      ageBand: AgeBand.ADULT,
      assurance: {
        level: AgeAssuranceLevel.VERIFIED,
        method: AgeAssuranceMethod.VERIFIED_PROVIDER,
        assertedAt: createdAt,
        evidenceRef: "adult-evidence-001",
      },
      lifecycleState: ManagedChildLifecycleState.CLAIMED,
      claimedAt: expiresAt,
    });

    expect(result.valid).toBe(true);
  });

  it("rejects self-asserted assurance for a managed child", () => {
    const result = managedChildProfileSchema.validate({
      ...managedChild,
      assurance: {
        level: AgeAssuranceLevel.SELF_ASSERTED,
        method: AgeAssuranceMethod.SELF_ASSERTION,
        assertedAt: createdAt,
      },
    });

    expect(result.valid).toBe(false);
  });

  it("rejects a managed child created by its own account identity", () => {
    const result = managedChildProfileSchema.validate({
      ...managedChild,
      createdByAccountId: childAccountId,
    });

    expect(result.valid).toBe(false);
  });

  it("requires assurance to be asserted and unexpired at child creation", () => {
    const assertedAfterCreation = managedChildProfileSchema.validate({
      ...managedChild,
      assurance: {
        ...guardianAssurance,
        assertedAt: "2025-07-15T10:00:00.000Z",
      },
    });
    const expiredAtCreation = managedChildProfileSchema.validate({
      ...managedChild,
      assurance: {
        ...guardianAssurance,
        assertedAt: "2025-07-15T08:00:00.000Z",
        expiresAt: createdAt,
      },
    });
    const validAtCreation = managedChildProfileSchema.validate({
      ...managedChild,
      assurance: {
        ...guardianAssurance,
        assertedAt: "2025-07-15T08:00:00.000Z",
        expiresAt: "2025-07-15T10:00:00.000Z",
      },
    });

    expect(assertedAfterCreation.valid).toBe(false);
    expect(expiredAtCreation.valid).toBe(false);
    expect(validAtCreation.valid).toBe(true);
  });

  it("orders optional claim history before closure on closed profiles", () => {
    const closedAdult = {
      ...managedChild,
      ageBand: AgeBand.ADULT,
      assurance: {
        level: AgeAssuranceLevel.VERIFIED,
        method: AgeAssuranceMethod.VERIFIED_PROVIDER,
        assertedAt: createdAt,
        evidenceRef: "adult-evidence-001",
      },
      lifecycleState: ManagedChildLifecycleState.CLOSED,
      claimedAt: expiresAt,
      closedAt: "2025-07-17T09:00:00.000Z",
    };

    expect(managedChildProfileSchema.validate(closedAdult).valid).toBe(true);
    expect(
      managedChildProfileSchema.validate({
        ...closedAdult,
        claimedAt: "2025-07-18T09:00:00.000Z",
      }).valid,
    ).toBe(false);
    expect(
      managedChildProfileSchema.validate({
        ...closedAdult,
        claimedAt: "2025-07-14T09:00:00.000Z",
      }).valid,
    ).toBe(false);
    expect(
      managedChildProfileSchema.validate({
        ...closedAdult,
        ageBand: AgeBand.SIX_TO_NINE,
      }).valid,
    ).toBe(false);
  });

  it("applies the canonical UTC timestamp contract to managed-child lifecycle times", () => {
    const result = managedChildProfileSchema.validate({
      ...managedChild,
      createdAt: "2025-07-15T10:00:00+01:00",
    });

    expect(result.valid).toBe(false);
  });
});

describe("actorSubjectPrincipalSchema", () => {
  it("keeps principal account and delegation discriminators stable", () => {
    expect(Object.values(PrincipalAccountType)).toEqual(["user", "managed-child"]);
    expect(Object.values(PrincipalType)).toEqual(["self", "guardian-delegated"]);
  });

  it("allows principal discriminator literals to be assigned without enum casts", () => {
    const accountType: PrincipalAccountType = "user";
    const principalType: PrincipalType = "self";
    const principal: ActorSubjectPrincipal = {
      actor: { accountId: guardianAccountId, accountType },
      subject: { accountId: guardianAccountId, accountType },
      principalType,
      authenticatedAt: createdAt,
    };

    expect(principal.actor.accountType).toBe(PrincipalAccountType.USER);
    expect(principal.principalType).toBe(PrincipalType.SELF);
  });

  it("validates a self principal only for the same user account", () => {
    const result = actorSubjectPrincipalSchema.validate({
      type: "actorSubjectPrincipal",
      version: "1.0.0",
      actor: {
        accountId: guardianAccountId,
        accountType: PrincipalAccountType.USER,
      },
      subject: {
        accountId: guardianAccountId,
        accountType: PrincipalAccountType.USER,
      },
      principalType: PrincipalType.SELF,
      authenticatedAt: createdAt,
    });

    expect(result.valid).toBe(true);
  });

  it("rejects a self principal that switches subjects", () => {
    const result = actorSubjectPrincipalSchema.validate({
      type: "actorSubjectPrincipal",
      version: "1.0.0",
      actor: {
        accountId: guardianAccountId,
        accountType: PrincipalAccountType.USER,
      },
      subject: {
        accountId: childAccountId,
        accountType: PrincipalAccountType.MANAGED_CHILD,
      },
      principalType: PrincipalType.SELF,
      authenticatedAt: createdAt,
    });

    expect(result.valid).toBe(false);
  });

  it("requires self-principal age band and assurance to be both absent or both present", () => {
    const selfPrincipal = {
      type: "actorSubjectPrincipal",
      version: "1.0.0",
      actor: {
        accountId: guardianAccountId,
        accountType: PrincipalAccountType.USER,
      },
      subject: {
        accountId: guardianAccountId,
        accountType: PrincipalAccountType.USER,
      },
      principalType: PrincipalType.SELF,
      authenticatedAt: createdAt,
    };

    expect(
      actorSubjectPrincipalSchema.validate({
        ...selfPrincipal,
        ageBand: AgeBand.ADULT,
      }).valid,
    ).toBe(false);
    expect(
      actorSubjectPrincipalSchema.validate({
        ...selfPrincipal,
        assurance: guardianAssurance,
      }).valid,
    ).toBe(false);
    expect(
      actorSubjectPrincipalSchema.validate({
        ...selfPrincipal,
        ageBand: AgeBand.ADULT,
        assurance: guardianAssurance,
      }).valid,
    ).toBe(true);
  });

  it("rejects authentication timestamps in the future", () => {
    const result = actorSubjectPrincipalSchema.validate({
      type: "actorSubjectPrincipal",
      version: "1.0.0",
      actor: {
        accountId: guardianAccountId,
        accountType: PrincipalAccountType.USER,
      },
      subject: {
        accountId: guardianAccountId,
        accountType: PrincipalAccountType.USER,
      },
      principalType: PrincipalType.SELF,
      authenticatedAt: new Date(Date.now() + 60_000).toISOString(),
    });

    expect(result.valid).toBe(false);
  });

  it("rejects assurance asserted after authentication", () => {
    const result = actorSubjectPrincipalSchema.validate({
      type: "actorSubjectPrincipal",
      version: "1.0.0",
      actor: {
        accountId: guardianAccountId,
        accountType: PrincipalAccountType.USER,
      },
      subject: {
        accountId: guardianAccountId,
        accountType: PrincipalAccountType.USER,
      },
      principalType: PrincipalType.SELF,
      ageBand: AgeBand.ADULT,
      assurance: {
        ...guardianAssurance,
        assertedAt: "2025-07-15T10:00:00.000Z",
      },
      authenticatedAt: createdAt,
    });

    expect(result.valid).toBe(false);
  });

  it("rejects assurance that has expired on an active principal", () => {
    const result = actorSubjectPrincipalSchema.validate({
      type: "actorSubjectPrincipal",
      version: "1.0.0",
      actor: {
        accountId: guardianAccountId,
        accountType: PrincipalAccountType.USER,
      },
      subject: {
        accountId: guardianAccountId,
        accountType: PrincipalAccountType.USER,
      },
      principalType: PrincipalType.SELF,
      ageBand: AgeBand.ADULT,
      assurance: {
        ...guardianAssurance,
        assertedAt: "2000-01-01T08:00:00.000Z",
        expiresAt: "2000-01-01T10:00:00.000Z",
      },
      authenticatedAt: "2000-01-01T09:00:00.000Z",
    });

    expect(result.valid).toBe(false);
  });

  it("validates a guardian-delegated actor/subject principal", () => {
    const result = actorSubjectPrincipalSchema.validate({
      type: "actorSubjectPrincipal",
      version: "1.0.0",
      actor: {
        accountId: guardianAccountId,
        accountType: PrincipalAccountType.USER,
      },
      subject: {
        accountId: childAccountId,
        accountType: PrincipalAccountType.MANAGED_CHILD,
      },
      principalType: PrincipalType.GUARDIAN_DELEGATED,
      relationshipId: "guardian-relationship-001",
      authorizationVersion: 3,
      ageBand: AgeBand.SIX_TO_NINE,
      assurance: guardianAssurance,
      authenticatedAt: createdAt,
      roles: ["finance-management"],
    });

    expect(result.valid).toBe(true);
    expect(result.value).not.toHaveProperty("roles");
    expect(
      actorSubjectPrincipalSchema.serialize(result.value as Record<string, unknown>),
    ).not.toHaveProperty("roles");
  });

  it("round-trips a public principal after verified-provider evidence is redacted", () => {
    const initial = actorSubjectPrincipalSchema.validate({
      type: "actorSubjectPrincipal",
      version: "1.0.0",
      actor: {
        accountId: guardianAccountId,
        accountType: PrincipalAccountType.USER,
      },
      subject: {
        accountId: childAccountId,
        accountType: PrincipalAccountType.MANAGED_CHILD,
      },
      principalType: PrincipalType.GUARDIAN_DELEGATED,
      relationshipId: "guardian-relationship-001",
      authorizationVersion: 3,
      ageBand: AgeBand.SIX_TO_NINE,
      assurance: {
        level: AgeAssuranceLevel.VERIFIED,
        method: AgeAssuranceMethod.VERIFIED_PROVIDER,
        assertedAt: createdAt,
        evidenceRef: "provider-evidence-001",
      },
      authenticatedAt: createdAt,
    });

    expect(initial.valid).toBe(true);
    const serialized = actorSubjectPrincipalSchema.serialize(
      initial.value as Record<string, unknown>,
    );
    expect(serialized.assurance).not.toHaveProperty("evidenceRef");
    expect(actorSubjectPrincipalSchema.validate(serialized).valid).toBe(true);
  });

  it("rejects delegated principals without relationship-bound authorization", () => {
    const result = actorSubjectPrincipalSchema.validate({
      type: "actorSubjectPrincipal",
      version: "1.0.0",
      actor: {
        accountId: guardianAccountId,
        accountType: PrincipalAccountType.USER,
      },
      subject: {
        accountId: childAccountId,
        accountType: PrincipalAccountType.MANAGED_CHILD,
      },
      principalType: PrincipalType.GUARDIAN_DELEGATED,
      ageBand: AgeBand.SIX_TO_NINE,
      assurance: guardianAssurance,
      authenticatedAt: createdAt,
    });

    expect(result.valid).toBe(false);
  });

  it("rejects negative and fractional authorization versions", () => {
    for (const authorizationVersion of [-1, 1.5]) {
      const result = actorSubjectPrincipalSchema.validate({
        type: "actorSubjectPrincipal",
        version: "1.0.0",
        actor: {
          accountId: guardianAccountId,
          accountType: PrincipalAccountType.USER,
        },
        subject: {
          accountId: childAccountId,
          accountType: PrincipalAccountType.MANAGED_CHILD,
        },
        principalType: PrincipalType.GUARDIAN_DELEGATED,
        relationshipId: "guardian-relationship-001",
        authorizationVersion,
        ageBand: AgeBand.SIX_TO_NINE,
        assurance: guardianAssurance,
        authenticatedAt: createdAt,
      });

      expect(result.valid).toBe(false);
    }
  });
});

describe("guardianRelationshipSchema", () => {
  const activeRelationship = {
    type: "guardianRelationship",
    version: "1.0.0",
    relationshipId: "guardian-relationship-001",
    householdId: "household-001",
    guardianAccountId,
    childAccountId,
    role: GuardianRole.BOTH,
    status: GuardianRelationshipStatus.ACTIVE,
    authorizationVersion: 1,
    establishedAt: createdAt,
  };

  it("validates an active relationship and explicit guardian role", () => {
    expect(Object.values(GuardianRole)).toEqual([
      "child-management",
      "finance-management",
      "both",
    ]);
    expect(guardianRelationshipSchema.validate(activeRelationship).valid).toBe(true);
  });

  it("rejects unsupported roles and short identifiers", () => {
    expect(
      guardianRelationshipSchema.validate({
        ...activeRelationship,
        role: "owner",
      }).valid,
    ).toBe(false);
    expect(
      guardianRelationshipSchema.validate({
        ...activeRelationship,
        relationshipId: "bad/id",
      }).valid,
    ).toBe(false);
  });

  it("uses the economy-compatible one-to-128-character ASCII identifier grammar", () => {
    expect(
      guardianRelationshipSchema.validate({
        ...activeRelationship,
        relationshipId: "r",
        householdId: "h",
        guardianAccountId: "g",
        childAccountId: "c",
      }).valid,
    ).toBe(true);
    expect(
      guardianRelationshipSchema.validate({
        ...activeRelationship,
        relationshipId: "a".repeat(129),
      }).valid,
    ).toBe(false);
    expect(
      guardianRelationshipSchema.validate({
        ...activeRelationship,
        relationshipId: "é",
      }).valid,
    ).toBe(false);
  });

  it("requires terminated relationships to record an end timestamp", () => {
    const result = guardianRelationshipSchema.validate({
      ...activeRelationship,
      status: GuardianRelationshipStatus.REVOKED,
    });

    expect(result.valid).toBe(false);
  });

  it("validates an adulthood transition and incremented authorization version", () => {
    const result = guardianRelationshipSchema.validate({
      ...activeRelationship,
      status: GuardianRelationshipStatus.ADULTHOOD_TRANSITION,
      authorizationVersion: 2,
      endedAt: expiresAt,
    });

    expect(result.valid).toBe(true);
  });

  it("applies the canonical UTC timestamp contract to relationship times", () => {
    const result = guardianRelationshipSchema.validate({
      ...activeRelationship,
      status: GuardianRelationshipStatus.REVOKED,
      endedAt: "2025-02-29T09:00:00.000Z",
    });

    expect(result.valid).toBe(false);
  });
});

describe("guardianRoleAssignmentSchema", () => {
  const activeAssignment = {
    type: "guardianRoleAssignment",
    version: "1.0.0",
    householdId: "household-001",
    guardianAccountId,
    assignmentKind: GuardianRoleAssignmentKind.CO_GUARDIAN,
    role: GuardianRole.CHILD_MANAGEMENT,
    status: GuardianRoleAssignmentStatus.ACTIVE,
    authorizationVersion: 0,
    grantedAt: createdAt,
    grantedByAccountId: "host-guardian-001",
  };

  it("validates an active explicit household guardian role", () => {
    expect(guardianRoleAssignmentSchema.validate(activeAssignment).valid).toBe(true);
  });

  it("requires a revocation actor and timestamp for revoked authority", () => {
    const incomplete = guardianRoleAssignmentSchema.validate({
      ...activeAssignment,
      status: GuardianRoleAssignmentStatus.REVOKED,
    });
    const valid = guardianRoleAssignmentSchema.validate({
      ...activeAssignment,
      status: GuardianRoleAssignmentStatus.REVOKED,
      authorizationVersion: 1,
      revokedAt: expiresAt,
      revokedByAccountId: "host-guardian-001",
    });

    expect(incomplete.valid).toBe(false);
    expect(valid.valid).toBe(true);
  });

  it("keeps role grant and revocation actors out of public serialization", () => {
    const serialized = guardianRoleAssignmentSchema.serialize(activeAssignment);

    expect(serialized).not.toHaveProperty("grantedByAccountId");
    expect(serialized).not.toHaveProperty("revokedByAccountId");
  });

  it("distinguishes host authority and requires the host to retain both roles", () => {
    const hostKind: GuardianRoleAssignmentKind = "host-guardian";

    expect(Object.values(GuardianRoleAssignmentKind)).toEqual([
      "host-guardian",
      "co-guardian",
    ]);
    expect(hostKind).toBe(GuardianRoleAssignmentKind.HOST_GUARDIAN);
    expect(
      guardianRoleAssignmentSchema.validate({
        ...activeAssignment,
        assignmentKind: GuardianRoleAssignmentKind.HOST_GUARDIAN,
      }).valid,
    ).toBe(false);
    expect(
      guardianRoleAssignmentSchema.validate({
        ...activeAssignment,
        assignmentKind: GuardianRoleAssignmentKind.HOST_GUARDIAN,
        role: GuardianRole.BOTH,
      }).valid,
    ).toBe(true);
  });

  it("applies the canonical UTC timestamp contract to role audit times", () => {
    const result = guardianRoleAssignmentSchema.validate({
      ...activeAssignment,
      grantedAt: "2025-07-15T09:00:00.12Z",
    });

    expect(result.valid).toBe(false);
  });
});

describe("household guardian boundary", () => {
  const household = {
    householdId: "household-001",
    hostGuardianAccountId: guardianAccountId,
    createdAt,
    createdByAccountId: guardianAccountId,
  };
  const activeHost = {
    householdId: household.householdId,
    guardianAccountId,
    assignmentKind: GuardianRoleAssignmentKind.HOST_GUARDIAN,
    role: GuardianRole.BOTH,
    status: GuardianRoleAssignmentStatus.ACTIVE,
    authorizationVersion: 0,
    grantedAt: createdAt,
    grantedByAccountId: guardianAccountId,
  };
  const activeCoGuardian = {
    householdId: household.householdId,
    guardianAccountId: "co-guardian-account-001",
    assignmentKind: GuardianRoleAssignmentKind.CO_GUARDIAN,
    role: GuardianRole.CHILD_MANAGEMENT,
    status: GuardianRoleAssignmentStatus.ACTIVE,
    authorizationVersion: 0,
    grantedAt: createdAt,
    grantedByAccountId: guardianAccountId,
  };
  const boundary = {
    type: "householdGuardianBoundary",
    version: "1.0.0",
    household,
    guardianAssignments: [activeHost, activeCoGuardian],
  };

  it("validates a household identity and exactly one matching active host", () => {
    expect(
      householdIdentitySchema.validate({
        type: "householdIdentity",
        version: "1.0.0",
        ...household,
      }).valid,
    ).toBe(true);
    expect(householdGuardianBoundarySchema.validate(boundary).valid).toBe(true);
    expect(validateHouseholdGuardianBoundary(boundary)).toBe(true);
  });

  it("rejects zero, duplicate, and mismatched active hosts", () => {
    expect(
      householdGuardianBoundarySchema.validate({
        ...boundary,
        guardianAssignments: [activeCoGuardian],
      }).valid,
    ).toBe(false);
    expect(
      householdGuardianBoundarySchema.validate({
        ...boundary,
        guardianAssignments: [
          activeHost,
          {
            ...activeHost,
            guardianAccountId: "other-host-account-001",
          },
        ],
      }).valid,
    ).toBe(false);
    expect(
      householdGuardianBoundarySchema.validate({
        ...boundary,
        household: {
          ...household,
          hostGuardianAccountId: "other-host-account-001",
        },
      }).valid,
    ).toBe(false);
  });

  it("prevents revoking the last host without an atomic replacement", () => {
    const revokedHost = {
      ...activeHost,
      status: GuardianRoleAssignmentStatus.REVOKED,
      authorizationVersion: 1,
      revokedAt: expiresAt,
      revokedByAccountId: guardianAccountId,
    };

    expect(
      householdGuardianBoundarySchema.validate({
        ...boundary,
        guardianAssignments: [revokedHost, activeCoGuardian],
      }).valid,
    ).toBe(false);

    const replacementHost = {
      ...activeHost,
      guardianAccountId: activeCoGuardian.guardianAccountId,
      grantedAt: expiresAt,
      grantedByAccountId: guardianAccountId,
    };
    expect(
      householdGuardianBoundarySchema.validate({
        ...boundary,
        household: {
          ...household,
          hostGuardianAccountId: replacementHost.guardianAccountId,
        },
        guardianAssignments: [revokedHost, replacementHost],
      }).valid,
    ).toBe(true);
  });

  it("retains host audit actors internally and enforces canonical creation time", () => {
    const serialized = householdIdentitySchema.serialize({
      type: "householdIdentity",
      version: "1.0.0",
      ...household,
    });
    expect(householdIdentitySchema.describe().shape).toHaveProperty(
      "createdByAccountId",
    );
    expect(serialized).not.toHaveProperty("createdByAccountId");
    expect(
      householdIdentitySchema.validate({
        type: "householdIdentity",
        version: "1.0.0",
        ...household,
        createdAt: "2025-07-15T10:00:00+01:00",
      }).valid,
    ).toBe(false);
  });
});

describe("guardianInvitationSchema", () => {
  const childLinkInvitation = {
    type: "guardianInvitation",
    version: "1.0.0",
    invitationId: "guardian-invitation-001",
    householdId: "household-001",
    kind: GuardianInvitationKind.EXISTING_CHILD_LINK,
    initiatedByAccountId: guardianAccountId,
    targetAccountId: childAccountId,
    childAccountId,
    targetAgeBand: AgeBand.SIX_TO_NINE,
    targetAssurance: guardianAssurance,
    status: GuardianInvitationStatus.PENDING,
    createdAt,
    expiresAt,
  };

  it("validates an expiring two-sided existing-child invitation", () => {
    expect(guardianInvitationSchema.validate(childLinkInvitation).valid).toBe(true);
  });

  it("rejects an invitation whose expiry is not after creation", () => {
    const result = guardianInvitationSchema.validate({
      ...childLinkInvitation,
      expiresAt: createdAt,
    });

    expect(result.valid).toBe(false);
  });

  it("requires both approvals and rejects an outsider resolver when accepted", () => {
    const incomplete = guardianInvitationSchema.validate({
      ...childLinkInvitation,
      status: GuardianInvitationStatus.ACCEPTED,
      targetApprovedAt: "2025-07-15T10:00:00.000Z",
      resolvedAt: "2025-07-15T11:00:00.000Z",
      resolvedByAccountId: childAccountId,
    });
    const mismatchedTarget = guardianInvitationSchema.validate({
      ...childLinkInvitation,
      status: GuardianInvitationStatus.ACCEPTED,
      targetApprovedAt: "2025-07-15T10:00:00.000Z",
      guardianApprovedAt: "2025-07-15T10:30:00.000Z",
      resolvedAt: "2025-07-15T11:00:00.000Z",
      resolvedByAccountId: "different-account-001",
    });

    expect(incomplete.valid).toBe(false);
    expect(mismatchedTarget.valid).toBe(false);
  });

  it("allows either authenticated participant to complete atomic acceptance", () => {
    for (const resolvedByAccountId of [guardianAccountId, childAccountId]) {
      const result = guardianInvitationSchema.validate({
        ...childLinkInvitation,
        status: GuardianInvitationStatus.ACCEPTED,
        targetApprovedAt: "2025-07-15T10:00:00.000Z",
        guardianApprovedAt: "2025-07-15T10:30:00.000Z",
        resolvedAt: "2025-07-15T11:00:00.000Z",
        resolvedByAccountId,
      });

      expect(result.valid).toBe(true);
    }
  });

  it("rejects acceptance after the invitation expiry", () => {
    const result = guardianInvitationSchema.validate({
      ...childLinkInvitation,
      status: GuardianInvitationStatus.ACCEPTED,
      targetApprovedAt: "2025-07-15T10:00:00.000Z",
      guardianApprovedAt: "2025-07-15T10:30:00.000Z",
      resolvedAt: "2025-07-17T11:00:00.000Z",
      resolvedByAccountId: childAccountId,
    });

    expect(result.valid).toBe(false);
  });

  it("requires a resolver for every terminal invitation outcome", () => {
    for (const status of [
      GuardianInvitationStatus.DECLINED,
      GuardianInvitationStatus.REVOKED,
      GuardianInvitationStatus.EXPIRED,
    ]) {
      const resolvedAt =
        status === GuardianInvitationStatus.EXPIRED
          ? expiresAt
          : "2025-07-15T11:00:00.000Z";
      expect(
        guardianInvitationSchema.validate({
          ...childLinkInvitation,
          status,
          resolvedAt,
        }).valid,
      ).toBe(false);
      expect(
        guardianInvitationSchema.validate({
          ...childLinkInvitation,
          status,
          resolvedAt,
          resolvedByAccountId: guardianAccountId,
        }).valid,
      ).toBe(true);
    }
  });

  it("rejects acceptance with assurance asserted after or expired at resolution", () => {
    const acceptance = {
      ...childLinkInvitation,
      status: GuardianInvitationStatus.ACCEPTED,
      targetApprovedAt: "2025-07-15T10:00:00.000Z",
      guardianApprovedAt: "2025-07-15T10:30:00.000Z",
      resolvedAt: "2025-07-15T11:00:00.000Z",
      resolvedByAccountId: childAccountId,
    };

    expect(
      guardianInvitationSchema.validate({
        ...acceptance,
        targetAssurance: {
          ...guardianAssurance,
          assertedAt: "2025-07-15T12:00:00.000Z",
        },
      }).valid,
    ).toBe(false);
    expect(
      guardianInvitationSchema.validate({
        ...acceptance,
        targetAssurance: {
          ...guardianAssurance,
          expiresAt: acceptance.resolvedAt,
        },
      }).valid,
    ).toBe(false);
    expect(
      guardianInvitationSchema.validate({
        ...acceptance,
        targetAssurance: {
          ...guardianAssurance,
          expiresAt: "2025-07-15T12:00:00.000Z",
        },
      }).valid,
    ).toBe(true);
  });

  it("rejects any terminal child-link record with assurance asserted after resolution", () => {
    const result = guardianInvitationSchema.validate({
      ...childLinkInvitation,
      status: GuardianInvitationStatus.DECLINED,
      targetAssurance: {
        ...guardianAssurance,
        assertedAt: "2025-07-15T12:00:00.000Z",
      },
      resolvedAt: "2025-07-15T11:00:00.000Z",
      resolvedByAccountId: guardianAccountId,
    });

    expect(result.valid).toBe(false);
  });

  it("applies the canonical UTC timestamp contract to invitation times", () => {
    const result = guardianInvitationSchema.validate({
      ...childLinkInvitation,
      expiresAt: "2025-07-16T09:00:00.0000Z",
    });

    expect(result.valid).toBe(false);
  });

  it("requires a role and excludes child assurance for co-guardian invitations", () => {
    const invalid = guardianInvitationSchema.validate({
      ...childLinkInvitation,
      kind: GuardianInvitationKind.CO_GUARDIAN,
      targetAccountId: "co-guardian-account-001",
      childAccountId: undefined,
      targetAgeBand: undefined,
      targetAssurance: undefined,
    });
    const valid = guardianInvitationSchema.validate({
      ...childLinkInvitation,
      kind: GuardianInvitationKind.CO_GUARDIAN,
      targetAccountId: "co-guardian-account-001",
      childAccountId: undefined,
      targetAgeBand: undefined,
      targetAssurance: undefined,
      role: GuardianRole.CHILD_MANAGEMENT,
    });

    expect(invalid.valid).toBe(false);
    expect(valid.valid).toBe(true);
  });
});
