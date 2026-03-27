import { describe, it, expect } from "vitest";
import {
  baseEntitySchema,
  userEntitySchema,
  roleEntitySchema,
  permissionsEntitySchema,
  assetEntitySchema,
  PreferredDisplayOrder,
  Role,
  Scope,
  EntityTypes,
  mapEditableUserProfileValidationErrors,
  userAvatarSchema,
  validateEditableUserProfile,
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

  it("serializes only public base entity fields by default", () => {
    const serialized = baseEntitySchema.serialize({
      ...base,
      updatedBy: userId,
      deletedBy: userId,
      deletedReason: "internal-note",
      ignored: "drop",
    });

    expect(serialized).toEqual({
      type: "baseEntity",
      version: "1.0.0",
      entityType: EntityTypes.BaseEntity,
      id: "row-001",
      createdAt: now,
      isDeleted: false,
    });
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

  it("reports structured profanity validation issues for editable profile fields", () => {
    const result = validateEditableUserProfile({
      ...baseUser,
      name: {
        ...baseUser.name,
        displayName: "Alice Fuck",
      },
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "name.displayName",
          code: "name.displayName.profanity",
        }),
      ]),
    );
  });

  it("allows optional middle-name fields to be cleared without failing validation", () => {
    const result = validateEditableUserProfile({
      ...baseUser,
      name: {
        ...baseUser.name,
        middleName: "",
      },
    });

    expect(result.valid).toBe(true);
  });

  it("maps editable profile validation issues into deterministic field errors", () => {
    const validation = validateEditableUserProfile({
      ...baseUser,
      name: {
        ...baseUser.name,
        firstName: "",
      },
    });

    const mapped = mapEditableUserProfileValidationErrors(validation);

    expect(mapped.fieldErrors["name.firstName"]).toBe("First name is required.");
    expect(mapped.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "name.firstName",
          code: "name.firstName.required",
        }),
      ]),
    );
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

  it("omits role audit actor ids from public serialization", () => {
    const serialized = roleEntitySchema.serialize({
      type: "roleEntity",
      version: "1.0.0",
      roles: [Role.USER],
      active: true,
      activatedBy: userId,
      activatedAt: now,
      deactivatedBy: userId,
    });

    expect(serialized).toEqual({
      type: "roleEntity",
      version: "1.0.0",
      roles: [Role.USER],
      active: true,
      activatedAt: now,
    });
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

  it("omits permission grant/revoke actor ids from public serialization", () => {
    const serialized = permissionsEntitySchema.serialize({
      type: "permissionsEntity",
      version: "1.0.0",
      scopes: [Scope.READ],
      granted: true,
      grantedBy: userId,
      grantedAt: now,
      revokedBy: userId,
      revokedAt: now,
    });

    expect(serialized).toEqual({
      type: "permissionsEntity",
      version: "1.0.0",
      scopes: [Scope.READ],
      granted: true,
      grantedAt: now,
      revokedAt: now,
    });
  });
});

describe("asset and avatar schemas", () => {
  it("omits asset validator actor ids from public serialization", () => {
    const serialized = assetEntitySchema.serialize({
      type: "AssetEntity",
      version: "1.0.0",
      cacheable: true,
      validated: true,
      validatedBy: userId,
      validatedAt: now,
    });

    expect(serialized).toEqual({
      type: "AssetEntity",
      version: "1.0.0",
      cacheable: true,
      validated: true,
      validatedAt: now,
    });
  });

  it("omits avatar storage metadata from public serialization", () => {
    const serialized = userAvatarSchema.serialize({
      type: "userAvatar",
      version: "1.0.0",
      partitionKey: "tenant-a",
      id: "user-1",
      filename: "avatar.png",
      contentType: "image/png",
      url: "https://example.com/avatar.png",
      size: 120,
      width: 64,
      height: 64,
      createdAt: now,
      createdBy: userId,
    });

    expect(serialized).toEqual({
      type: "userAvatar",
      version: "1.0.0",
      id: "user-1",
      filename: "avatar.png",
      contentType: "image/png",
      url: "https://example.com/avatar.png",
      size: 120,
      width: 64,
      height: 64,
      createdAt: now,
    });
  });
});
