import { describe, expect, it } from "vitest";
import {
  AgeAssuranceLevel,
  AgeAssuranceMethod,
  AgeBand,
  AuthProvider,
  PrincipalAccountType,
  PrincipalType,
  authenticatedUserSchema,
} from "../src/index.js";

const authenticatedAt = "2026-07-26T09:00:00.000Z";

describe("authenticatedUserSchema actor/subject principal", () => {
  it("publishes the additive authenticated-user contract version", () => {
    expect(authenticatedUserSchema.describe().version).toBe("1.1.0");
  });

  it("preserves backwards compatibility for a legacy self session", () => {
    const result = authenticatedUserSchema.validate({
      sub: "adult-account-001",
      name: "Ada",
      email: "ada@example.test",
      groups: ["players"],
      provider: AuthProvider.GOOGLE,
    });

    expect(result.valid).toBe(true);
    expect(result.value).not.toHaveProperty("principal");
  });

  it("accepts a server-issued self principal whose subject matches sub", () => {
    const result = authenticatedUserSchema.validate({
      sub: "adult-account-001",
      name: "Ada",
      groups: ["players"],
      provider: AuthProvider.GOOGLE,
      principal: {
        actor: {
          accountId: "adult-account-001",
          accountType: PrincipalAccountType.USER,
        },
        subject: {
          accountId: "adult-account-001",
          accountType: PrincipalAccountType.USER,
        },
        principalType: PrincipalType.SELF,
        ageBand: AgeBand.ADULT,
        assurance: {
          level: AgeAssuranceLevel.VERIFIED,
          method: AgeAssuranceMethod.VERIFIED_PROVIDER,
          assertedAt: authenticatedAt,
        },
        authenticatedAt,
      },
    });

    expect(result.valid).toBe(true);
    expect(result.value).toMatchObject({
      sub: "adult-account-001",
      principal: {
        principalType: PrincipalType.SELF,
        subject: { accountId: "adult-account-001" },
      },
    });
  });

  it("uses the managed child as sub and retains the guardian only as actor", () => {
    const result = authenticatedUserSchema.validate({
      sub: "managed-child-001",
      name: "Moon Explorer",
      groups: [],
      provider: AuthProvider.GOOGLE,
      principal: {
        actor: {
          accountId: "guardian-account-001",
          accountType: PrincipalAccountType.USER,
        },
        subject: {
          accountId: "managed-child-001",
          accountType: PrincipalAccountType.MANAGED_CHILD,
        },
        principalType: PrincipalType.GUARDIAN_DELEGATED,
        relationshipId: "guardian-relationship-001",
        authorizationVersion: 3,
        ageBand: AgeBand.SIX_TO_NINE,
        assurance: {
          level: AgeAssuranceLevel.GUARDIAN_ATTESTED,
          method: AgeAssuranceMethod.GUARDIAN_ATTESTATION,
          assertedAt: authenticatedAt,
        },
        authenticatedAt,
      },
    });

    expect(result.valid).toBe(true);
    expect(result.value).toMatchObject({
      sub: "managed-child-001",
      principal: {
        actor: { accountId: "guardian-account-001" },
        subject: { accountId: "managed-child-001" },
      },
    });
  });

  it("rejects a guardian sub that would inherit guardian authorization in child mode", () => {
    const result = authenticatedUserSchema.validate({
      sub: "guardian-account-001",
      name: "Moon Explorer",
      groups: ["finance-guardians"],
      provider: AuthProvider.GOOGLE,
      principal: {
        actor: {
          accountId: "guardian-account-001",
          accountType: PrincipalAccountType.USER,
        },
        subject: {
          accountId: "managed-child-001",
          accountType: PrincipalAccountType.MANAGED_CHILD,
        },
        principalType: PrincipalType.GUARDIAN_DELEGATED,
        relationshipId: "guardian-relationship-001",
        authorizationVersion: 3,
        ageBand: AgeBand.SIX_TO_NINE,
        assurance: {
          level: AgeAssuranceLevel.GUARDIAN_ATTESTED,
          method: AgeAssuranceMethod.GUARDIAN_ATTESTATION,
          assertedAt: authenticatedAt,
        },
        authenticatedAt,
      },
    });

    expect(result.valid).toBe(false);
  });

  it("rejects an invalid nested principal instead of silently stripping it", () => {
    const result = authenticatedUserSchema.validate({
      sub: "managed-child-001",
      name: "Moon Explorer",
      groups: [],
      provider: AuthProvider.GOOGLE,
      principal: {
        actor: {
          accountId: "guardian-account-001",
          accountType: PrincipalAccountType.USER,
        },
        subject: {
          accountId: "managed-child-001",
          accountType: PrincipalAccountType.MANAGED_CHILD,
        },
        principalType: PrincipalType.GUARDIAN_DELEGATED,
        relationshipId: "guardian-relationship-001",
        authorizationVersion: -1,
        ageBand: AgeBand.SIX_TO_NINE,
        assurance: {
          level: AgeAssuranceLevel.GUARDIAN_ATTESTED,
          method: AgeAssuranceMethod.GUARDIAN_ATTESTATION,
          assertedAt: authenticatedAt,
        },
        authenticatedAt,
      },
    });

    expect(result.valid).toBe(false);
  });
});
