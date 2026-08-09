import { describe, it, expect } from "vitest";
import {
  baseEntitySchema,
  userEntitySchema,
  roleEntitySchema,
  permissionsEntitySchema,
  assetEntitySchema,
  PROFILE_DEFAULT_PROFANITY_LOCALE,
  PROFILE_PROFANITY_SUPPORTED_LOCALES,
  ComponentTypes,
  PreferredDisplayOrder,
  Role,
  Scope,
  EntityTypes,
  UserNameStatus,
  type UserName,
  editableUserProfileFieldTranslationKeys,
  editableUserProfileValidationTranslationKeys,
  entityManagerEnGbTranslations,
  isValidAzureTableKey,
  objectAssetEntitySchema,
  mapEditableUserProfileValidationErrors,
  translateEditableUserProfileFieldLabel,
  translateEditableUserProfileValidationText,
  userAvatarSchema,
  validateEditableUserProfile,
} from "../src/index.js";

const now = new Date("2025-01-02T00:00:00Z").toISOString();
const userId = "123456789012345678901";

describe("isValidAzureTableKey", () => {
  it("accepts bounded keys and rejects empty, oversized, reserved, or padded keys", () => {
    expect(isValidAzureTableKey("group:moon-guild")).toBe(true);
    expect(isValidAzureTableKey("")).toBe(false);
    expect(isValidAzureTableKey("x".repeat(1025))).toBe(false);
    expect(isValidAzureTableKey("group/moon-guild")).toBe(false);
    expect(isValidAzureTableKey(" padded")).toBe(false);
    expect(isValidAzureTableKey(42 as unknown as string)).toBe(false);
  });
});

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
  const legacyNameWithoutStatus = {
    firstName: "Alice",
    lastName: "Lovelace",
    displayName: "Alice L",
    preferredDisplayOrder: PreferredDisplayOrder.DISPLAY_NAME,
  } satisfies UserName;
  const baseUser = {
    type: "userEntity",
    version: "1.0.0",
    email: "alice@example.com",
    name: legacyNameWithoutStatus,
  };

  it("validates a minimal user entity", () => {
    const result = userEntitySchema.validate(baseUser);
    expect(result.valid).toBe(true);
  });

  it("accepts explicit incomplete names while preserving legacy omission", () => {
    expect(userEntitySchema.validate(baseUser).valid).toBe(true);
    expect(userEntitySchema.validate({
      ...baseUser,
      name: {
        ...baseUser.name,
        status: UserNameStatus.INCOMPLETE,
      },
    }).valid).toBe(true);
  });

  it("rejects unsupported name status values", () => {
    const result = userEntitySchema.validate({
      ...baseUser,
      name: {
        ...baseUser.name,
        status: "pending",
      },
    });

    expect(result.valid).toBe(false);
  });

  it("allows digits in display names but not personal-name fields", () => {
    expect(userEntitySchema.validate({
      ...baseUser,
      name: {
        ...baseUser.name,
        displayName: "Player 2",
      },
    }).valid).toBe(true);

    expect(userEntitySchema.validate({
      ...baseUser,
      name: {
        ...baseUser.name,
        firstName: "Player2",
      },
    }).valid).toBe(false);
  });

  it("uses the same display-name distinction for editable profiles", () => {
    expect(validateEditableUserProfile({
      ...baseUser,
      name: {
        ...baseUser.name,
        displayName: "Player 2",
      },
    }).valid).toBe(true);

    expect(validateEditableUserProfile({
      ...baseUser,
      name: {
        ...baseUser.name,
        firstName: "Player2",
      },
    }).valid).toBe(false);
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

    const mapped = mapEditableUserProfileValidationErrors(result);
    expect(mapped.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "name.displayName",
          fieldKey: editableUserProfileFieldTranslationKeys["name.displayName"],
          code: "name.displayName.profanity",
          messageKey: editableUserProfileValidationTranslationKeys.profanity,
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
          fieldKey: editableUserProfileFieldTranslationKeys["name.firstName"],
          code: "name.firstName.required",
          messageKey: editableUserProfileValidationTranslationKeys.required,
        }),
      ]),
    );
  });

  it("exports editable profile translation keys and en-GB defaults", () => {
    expect(
      entityManagerEnGbTranslations[
        editableUserProfileFieldTranslationKeys["name.displayName"]
      ],
    ).toBe("Display name");
    expect(translateEditableUserProfileFieldLabel("name.firstName")).toBe("First name");
    expect(
      translateEditableUserProfileValidationText(
        editableUserProfileValidationTranslationKeys.tooLong,
        { field: "First name", maxLength: 64 },
      ),
    ).toBe("First name must be 64 characters or fewer.");
  });

  it("falls back to package translations when a supplied profile translator misses", () => {
    expect(
      translateEditableUserProfileValidationText(
        editableUserProfileValidationTranslationKeys.required,
        { field: "First name" },
        (key) => key,
      ),
    ).toBe("First name is required.");
    expect(
      translateEditableUserProfileFieldLabel(
        "email",
        (key) => (key === editableUserProfileFieldTranslationKeys.email ? "Courriel" : key),
      ),
    ).toBe("Courriel");
  });

  it("rejects editable profile fields that exceed the supported length", () => {
    const result = validateEditableUserProfile({
      ...baseUser,
      name: {
        ...baseUser.name,
        firstName: "A".repeat(65),
      },
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "name.firstName",
          code: "name.firstName.too_long",
        }),
      ]),
    );

    const mapped = mapEditableUserProfileValidationErrors(result);
    expect(mapped.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "name.firstName",
          fieldKey: editableUserProfileFieldTranslationKeys["name.firstName"],
          code: "name.firstName.too_long",
          messageKey: editableUserProfileValidationTranslationKeys.tooLong,
        }),
      ]),
    );
  });

  it("rejects unsupported characters in profile name fields", () => {
    const result = validateEditableUserProfile({
      ...baseUser,
      name: {
        ...baseUser.name,
        lastName: "Lovelace!",
      },
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "name.lastName",
          code: "name.lastName.invalid_format",
        }),
      ]),
    );

    const mapped = mapEditableUserProfileValidationErrors(result);
    expect(mapped.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "name.lastName",
          fieldKey: editableUserProfileFieldTranslationKeys["name.lastName"],
          code: "name.lastName.invalid_format",
          messageKey: editableUserProfileValidationTranslationKeys.nameUnsupportedCharacters,
        }),
      ]),
    );
  });

  it("rejects invalid editable profile email addresses", () => {
    const result = validateEditableUserProfile({
      ...baseUser,
      email: "alice-at-example.com",
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "email",
          code: "email.invalid_format",
        }),
      ]),
    );

    const mapped = mapEditableUserProfileValidationErrors(result);
    expect(mapped.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "email",
          fieldKey: editableUserProfileFieldTranslationKeys.email,
          code: "email.invalid_format",
          messageKey: editableUserProfileValidationTranslationKeys.emailInvalid,
        }),
      ]),
    );
  });

  it("exports the default profanity locale in the supported locale list", () => {
    expect(PROFILE_DEFAULT_PROFANITY_LOCALE).toBe("en");
    expect(PROFILE_PROFANITY_SUPPORTED_LOCALES).toContain(PROFILE_DEFAULT_PROFANITY_LOCALE);
  });

  it("maps legacy validation errors and preserves non-field form errors", () => {
    const mapped = mapEditableUserProfileValidationErrors({
      issues: [
        {
          path: "profile",
          code: "profile.invalid",
          message: "Profile request is invalid.",
        },
        {
          path: "name.displayName",
          code: "name.displayName.profanity",
          message: "Display name contains blocked language.",
        },
      ],
      errors: [
        "Display name contains blocked language.",
        "Missing required field: name.lastName",
        "Field is immutable: email",
        "Field must be a string: emailPreferences",
        "Unsupported profile payload: profile",
      ],
    });

    expect(mapped.fieldErrors["name.displayName"]).toBe("Display name contains blocked language.");
    expect(mapped.fieldErrors["name.lastName"]).toBe("Last name is required.");
    expect(mapped.fieldErrors.email).toBe("Email cannot be changed.");
    expect(mapped.fieldErrors.emailPreferences).toBe("Field must be a string: emailPreferences");
    expect(mapped.formErrors).toEqual([
      "Profile request is invalid.",
      "Unsupported profile payload: profile",
    ]);
    expect(mapped.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "name.lastName",
          fieldKey: editableUserProfileFieldTranslationKeys["name.lastName"],
          code: "name.lastName.required",
          messageKey: editableUserProfileValidationTranslationKeys.required,
        }),
        expect.objectContaining({
          field: "email",
          fieldKey: editableUserProfileFieldTranslationKeys.email,
          code: "email.immutable",
          messageKey: editableUserProfileValidationTranslationKeys.immutable,
        }),
        expect.objectContaining({
          field: "emailPreferences",
          fieldKey: editableUserProfileFieldTranslationKeys.emailPreferences,
          code: "emailPreferences.invalid_type",
          messageKey: editableUserProfileValidationTranslationKeys.invalidType,
        }),
      ]),
    );
  });

  it("maps unclassified field errors into deterministic invalid-value issues", () => {
    const mapped = mapEditableUserProfileValidationErrors({
      issues: [],
      errors: ["Unsupported preference selection: emailPreferences"],
    });

    expect(mapped.fieldErrors.emailPreferences).toBe(
      "Unsupported preference selection: emailPreferences",
    );
    expect(mapped.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "emailPreferences",
          code: "emailPreferences.invalid_value",
          fieldKey: editableUserProfileFieldTranslationKeys.emailPreferences,
          messageKey: editableUserProfileValidationTranslationKeys.invalidValue,
        }),
      ]),
    );
  });

  it("decorates existing immutable, type, and value issue codes with translation keys", () => {
    const mapped = mapEditableUserProfileValidationErrors({
      issues: [
        {
          path: "email",
          code: "email.immutable",
          message: "Email cannot be changed.",
        },
        {
          path: "emailPreferences",
          code: "emailPreferences.invalid_type",
          message: "Email preferences has an invalid type.",
        },
        {
          path: "emailPreferences",
          code: "emailPreferences.invalid_value",
          message: "Email preferences has an invalid value.",
        },
      ],
      errors: [],
    });

    expect(mapped.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "email",
          fieldKey: editableUserProfileFieldTranslationKeys.email,
          messageKey: editableUserProfileValidationTranslationKeys.immutable,
        }),
        expect.objectContaining({
          field: "emailPreferences",
          fieldKey: editableUserProfileFieldTranslationKeys.emailPreferences,
          code: "emailPreferences.invalid_type",
          messageKey: editableUserProfileValidationTranslationKeys.invalidType,
        }),
        expect.objectContaining({
          field: "emailPreferences",
          fieldKey: editableUserProfileFieldTranslationKeys.emailPreferences,
          code: "emailPreferences.invalid_value",
          messageKey: editableUserProfileValidationTranslationKeys.invalidValue,
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

  it("validates a complete object asset payload", () => {
    const result = objectAssetEntitySchema.validate({
      type: "objectAssetEntity",
      version: "1.0.0",
      url: "https://example.com/assets/tree.glb",
      thumbnailUrl: "https://example.com/assets/tree-thumb.png",
      format: "gltf",
      size: 2048,
      components: [
        {
          type: ComponentTypes.PHYSICS,
          config: { mass: 10 },
        },
      ],
    });

    expect(result.valid).toBe(true);
  });

  it("rejects invalid object asset payloads", () => {
    const result = objectAssetEntitySchema.validate({
      type: "objectAssetEntity",
      version: "1.0.0",
      url: "https://example.com/assets/tree.glb",
      components: [{ type: "unsupported", config: {} }],
    });

    expect(result.valid).toBe(false);
  });
});
