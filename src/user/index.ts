export {
  settingsEntitySchema,
  type SettingsEntity,
} from "./settings.entity.js";
export {
  permissionsEntitySchema,
  type PermissionsEntity,
} from "./permissions.entity.js";
export { Scope } from "../permissions.js";
export { type RoleEntity, Role, roleEntitySchema } from "./role.entity.js";
export {
  type UserEntity,
  UserEmailPreferences,
  UserNotificationPreferences,
  userEntitySchema,
} from "./user.entity.js";
export { PreferredDisplayOrder } from "./user.name.js";
export {
  featureFlagEntitySchema,
  featureFlagEntityShape,
  type FeatureFlagEntity,
} from "./feature.flag.entity.js";

export {
  type UserAvatarEntity,
  userAvatarSchema,
} from "./user.avatar.js";

export { type UserName, userNameSchema } from "./user.name.js";
export {
  PROFILE_DEFAULT_PROFANITY_LOCALE,
  PROFILE_PROFANITY_SUPPORTED_LOCALES,
  editableUserProfileSchema,
  type EditableUserProfileFieldErrors,
  type EditableUserProfileFieldName,
  type EditableUserProfileValidationIssue,
  type EditableUserProfile,
  mapEditableUserProfileValidationErrors,
  validateEditableUserProfile,
} from "./profile.validation.js";
export * from "./profile.validation.translations.js";
