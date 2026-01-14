import { describe, it, expect } from "vitest";
import {
  ensureValid,
  userSchema,
  familySchema,
  groupSchema,
  characterSchema,
  permissionsSchema,
} from "../src/entityManager";

const now = new Date("2025-01-02T00:00:00Z");

const baseMeta = {
  type: "",
  version: "1.0.0",
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
};

describe("domain entity schemas", () => {
  it("validates a user", () => {
    const user = {
      ...baseMeta,
      type: "user",
      id: "user-1",
      email: "user@example.com",
      displayName: "Ada Lovelace",
    };
    const ok = ensureValid(userSchema, user);
    expect(ok.email).toBe("user@example.com");
  });

  it("rejects wrong type for user", () => {
    const user = {
      ...baseMeta,
      type: "family",
      id: "user-1",
      email: "user@example.com",
    };
    expect(() => ensureValid(userSchema, user)).toThrow();
  });

  it("validates a family", () => {
    const fam = {
      ...baseMeta,
      type: "family",
      id: "fam-1",
      name: "Lovelace",
      ownerId: "user-1",
      memberIds: ["user-1"],
    };
    const ok = ensureValid(familySchema, fam);
    expect(ok.memberIds?.length).toBe(1);
  });

  it("validates a group with default members", () => {
    const grp = {
      ...baseMeta,
      type: "group",
      id: "grp-1",
      name: "Admins",
    };
    const ok = ensureValid(groupSchema, grp);
    expect(ok.memberIds).toEqual([]);
  });

  it("validates a character with integer level", () => {
    const character = {
      ...baseMeta,
      type: "character",
      id: "char-1",
      name: "Ranger",
      class: "Archer",
      level: 3,
    };
    const ok = ensureValid(characterSchema, character);
    expect(ok.level).toBe(3);
  });

  it("rejects character with non-integer level", () => {
    const character = {
      ...baseMeta,
      type: "character",
      id: "char-1",
      name: "Mage",
      class: "Wizard",
      level: 2.5,
    };
    expect(() => ensureValid(characterSchema, character)).toThrow();
  });

  it("validates permissions", () => {
    const perm = {
      ...baseMeta,
      type: "permissions",
      id: "perm-1",
      role: "admin",
      subjectType: "group",
      subjectId: "grp-1",
      scopes: ["read", "write"],
    };
    const ok = ensureValid(permissionsSchema, perm);
    expect(ok.role).toBe("admin");
  });

  it("rejects permissions with invalid role", () => {
    const perm = {
      ...baseMeta,
      type: "permissions",
      id: "perm-1",
      role: "unknown",
      subjectType: "group",
      subjectId: "grp-1",
    };
    expect(() => ensureValid(permissionsSchema, perm)).toThrow();
  });
});
