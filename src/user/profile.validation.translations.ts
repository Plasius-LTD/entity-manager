import { createI18n } from "@plasius/translations";
import type { TranslationArgs, TranslationDictionary } from "@plasius/translations";
import type { EditableUserProfileFieldName } from "./profile.validation.js";

export const editableUserProfileFieldTranslationKeys = {
  "name.firstName": "entityManager.profile.field.firstName",
  "name.middleName": "entityManager.profile.field.middleName",
  "name.lastName": "entityManager.profile.field.lastName",
  "name.displayName": "entityManager.profile.field.displayName",
  "name.preferredDisplayOrder": "entityManager.profile.field.preferredDisplayOrder",
  email: "entityManager.profile.field.email",
  emailPreferences: "entityManager.profile.field.emailPreferences",
} as const satisfies Record<EditableUserProfileFieldName, string>;

export const editableUserProfileValidationTranslationKeys = {
  emailInvalid: "entityManager.profile.validation.emailInvalid",
  immutable: "entityManager.profile.validation.immutable",
  invalidType: "entityManager.profile.validation.invalidType",
  invalidValue: "entityManager.profile.validation.invalidValue",
  nameUnsupportedCharacters:
    "entityManager.profile.validation.nameUnsupportedCharacters",
  profanity: "entityManager.profile.validation.profanity",
  required: "entityManager.profile.validation.required",
  tooLong: "entityManager.profile.validation.tooLong",
} as const;

export type EditableUserProfileFieldTranslationKey =
  (typeof editableUserProfileFieldTranslationKeys)[keyof typeof editableUserProfileFieldTranslationKeys];

export type EditableUserProfileValidationTranslationKey =
  (typeof editableUserProfileValidationTranslationKeys)[keyof typeof editableUserProfileValidationTranslationKeys];

export type EditableUserProfileTranslationKey =
  | EditableUserProfileFieldTranslationKey
  | EditableUserProfileValidationTranslationKey;

export type EditableUserProfileTranslate = (
  key: EditableUserProfileTranslationKey,
  args?: TranslationArgs,
) => string | undefined;

export const entityManagerEnGbTranslations = {
  [editableUserProfileFieldTranslationKeys["name.firstName"]]: "First name",
  [editableUserProfileFieldTranslationKeys["name.middleName"]]: "Middle name",
  [editableUserProfileFieldTranslationKeys["name.lastName"]]: "Last name",
  [editableUserProfileFieldTranslationKeys["name.displayName"]]: "Display name",
  [editableUserProfileFieldTranslationKeys["name.preferredDisplayOrder"]]:
    "Preferred name display",
  [editableUserProfileFieldTranslationKeys.email]: "Email",
  [editableUserProfileFieldTranslationKeys.emailPreferences]: "Email preferences",
  [editableUserProfileValidationTranslationKeys.emailInvalid]:
    "{field} must be a valid email address.",
  [editableUserProfileValidationTranslationKeys.immutable]: "{field} cannot be changed.",
  [editableUserProfileValidationTranslationKeys.invalidType]:
    "{field} has an invalid type.",
  [editableUserProfileValidationTranslationKeys.invalidValue]:
    "{field} has an invalid value.",
  [editableUserProfileValidationTranslationKeys.nameUnsupportedCharacters]:
    "{field} contains unsupported characters.",
  [editableUserProfileValidationTranslationKeys.profanity]:
    "{field} contains blocked language.",
  [editableUserProfileValidationTranslationKeys.required]: "{field} is required.",
  [editableUserProfileValidationTranslationKeys.tooLong]:
    "{field} must be {maxLength} characters or fewer.",
} satisfies TranslationDictionary;

export const entityManagerTranslations = {
  "en-GB": entityManagerEnGbTranslations,
} satisfies Partial<Record<string, TranslationDictionary>>;

const entityManagerI18n = createI18n({
  language: "en-GB",
  fallback: "en-GB",
  translations: entityManagerTranslations,
});

export function translateEditableUserProfileValidationText(
  key: EditableUserProfileTranslationKey,
  args?: TranslationArgs,
  translate?: EditableUserProfileTranslate,
): string {
  const translated = translate?.(key, args);
  if (translated && translated !== key) {
    return translated;
  }

  return entityManagerI18n.t(key, args);
}

export function translateEditableUserProfileFieldLabel(
  field: EditableUserProfileFieldName,
  translate?: EditableUserProfileTranslate,
): string {
  return translateEditableUserProfileValidationText(
    editableUserProfileFieldTranslationKeys[field],
    undefined,
    translate,
  );
}
