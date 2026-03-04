import { describe, it, expect } from "vitest";
import {
  baseEntitySchema,
  userEntitySchema,
  roleEntitySchema,
  permissionsEntitySchema,
  PreferredDisplayOrder,
  Role,
  Scope,
  EntityTypes,
} from "../src/index.js";

const now = new Date("2025-01-02T00:00:00Z").toISOString();
const userId = "123456789012345678901";

describe("baseEntitySchema", () => {
  const base = {
    type: "baseEntity",
    version: "1.0.0",
    entityType: EntityTypes.BaseEntity,
    partitionKey: "user-123",
    id: "row-001",
    createdAt: now,
    createdBy: userId,
    isDeleted: false,
  };

  it("validates a non-deleted entity", () => {
    const result = baseEntitySchema.validate(base);
    expect(result.valid).toBe(true);
  });

  it("rejects non-deleted entity with deleted fields", () => {
    const entity = {
      ...base,
      deletedAt: now,
      deletedBy: userId,
      deletedReason: "should-not-be-set",
    };
    const result = baseEntitySchema.validate(entity);
    expect(result.valid).toBe(false);
  });

  it("validates a deleted entity with required fields", () => {
    const entity = {
      ...base,
      isDeleted: true,
      deletedAt: now,
      deletedBy: userId,
      deletedReason: "soft-removed",
    };
    const result = baseEntitySchema.validate(entity);
    expect(result.valid).toBe(true);
  });

  it("rejects a deleted entity missing deletedReason", () => {
    const entity = {
      ...base,
      isDeleted: true,
      deletedAt: now,
      deletedBy: userId,
    };
    const result = baseEntitySchema.validate(entity);
    expect(result.valid).toBe(false);
  });
});

describe("userEntitySchema", () => {
  const baseUser = {
    type: "userEntity",
    version: "1.0.0",
    email: "alice@example.com",
    name: {
      firstName: "Alice",
      lastName: "Lovelace",
      displayName: "Alice L",
      preferredDisplayOrder: PreferredDisplayOrder.DISPLAY_NAME,
    },
  };

  it("validates a minimal user entity", () => {
    const result = userEntitySchema.validate(baseUser);
    expect(result.valid).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = userEntitySchema.validate({
      ...baseUser,
      email: "not-an-email",
    });
    expect(result.valid).toBe(false);
  });
});

describe("roleEntitySchema", () => {
  const baseRole = {
    type: "roleEntity",
    version: "1.0.0",
    roles: [Role.USER],
    active: true,
    activatedBy: userId,
  };

  it("validates an active role entity", () => {
    const result = roleEntitySchema.validate(baseRole);
    expect(result.valid).toBe(true);
  });

  it("rejects active role entity missing activatedBy", () => {
    const { activatedBy: _activatedBy, ...rest } = baseRole;
    const result = roleEntitySchema.validate(rest);
    expect(result.valid).toBe(false);
  });

  it("validates an inactive role entity with deactivatedBy", () => {
    const result = roleEntitySchema.validate({
      ...baseRole,
      active: false,
      deactivatedBy: userId,
    });
    expect(result.valid).toBe(true);
  });
});

describe("permissionsEntitySchema", () => {
  it("validates a permissions entity with scopes", () => {
    const result = permissionsEntitySchema.validate({
      type: "permissionsEntity",
      version: "1.0.0",
      scopes: [Scope.READ, Scope.WRITE],
      granted: true,
      grantedBy: userId,
      grantedAt: now,
    });
    expect(result.valid).toBe(true);
  });
});
