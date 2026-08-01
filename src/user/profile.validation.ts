import {
  createSchema,
  field,
  validateDisplayName,
  validateEmail,
  validateName,
  type Infer,
  type ValidationIssue,
  type ValidationIssueInput,
  type ValidationResult,
} from "@plasius/schema";
import { UserEmailPreferences } from "./user.entity.js";
import { PreferredDisplayOrder } from "./user.name.js";
import {
  editableUserProfileFieldTranslationKeys,
  editableUserProfileValidationTranslationKeys,
  translateEditableUserProfileFieldLabel,
  translateEditableUserProfileValidationText,
  type EditableUserProfileFieldTranslationKey,
  type EditableUserProfileValidationTranslationKey,
} from "./profile.validation.translations.js";

const PROFILE_PROFANITY_LEXICON = {
  en: [
    "arse",
    "asshole",
    "bastard",
    "bitch",
    "bollocks",
    "bullshit",
    "cunt",
    "damn",
    "fuck",
    "motherfucker",
    "shit",
    "twat",
  ],
} as const;

export const PROFILE_PROFANITY_SUPPORTED_LOCALES = Object.freeze(
  Object.keys(PROFILE_PROFANITY_LEXICON),
) as readonly string[];

export const PROFILE_DEFAULT_PROFANITY_LOCALE = "en";

export type EditableUserProfileFieldName =
  | "name.firstName"
  | "name.middleName"
  | "name.lastName"
  | "name.displayName"
  | "name.preferredDisplayOrder"
  | "email"
  | "emailPreferences";

export type EditableUserProfileFieldErrors = Partial<
  Record<EditableUserProfileFieldName, string>
>;

export interface EditableUserProfileValidationIssue extends ValidationIssue {
  field?: EditableUserProfileFieldName;
  fieldKey?: EditableUserProfileFieldTranslationKey;
  messageKey?: EditableUserProfileValidationTranslationKey;
}

const EDITABLE_PROFILE_FIELD_NAMES = new Set<EditableUserProfileFieldName>([
  "name.firstName",
  "name.middleName",
  "name.lastName",
  "name.displayName",
  "name.preferredDisplayOrder",
  "email",
  "emailPreferences",
]);

type ProfileTextFieldRule = {
  field: EditableUserProfileFieldName;
  maxLength: number;
  required: boolean;
  format: "name" | "displayName" | "email";
};

function toIssue(
  fieldName: EditableUserProfileFieldName,
  code: string,
  messageKey: EditableUserProfileValidationTranslationKey,
  args: Record<string, string | number | boolean> = {},
): ValidationIssueInput {
  const fieldLabel = translateEditableUserProfileFieldLabel(fieldName);

  return {
    path: fieldName,
    code,
    message: translateEditableUserProfileValidationText(messageKey, {
      field: fieldLabel,
      ...args,
    }),
  };
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function isEditableUserProfileFieldName(
  value: string,
): value is EditableUserProfileFieldName {
  return EDITABLE_PROFILE_FIELD_NAMES.has(value as EditableUserProfileFieldName);
}

function readFieldNameFromTextError(
  error: string,
): EditableUserProfileFieldName | null {
  const fieldPath = error.match(/:\s*([a-zA-Z]+(?:\.[a-zA-Z]+)*)$/)?.[1] ?? "";
  if (!isEditableUserProfileFieldName(fieldPath)) {
    return null;
  }

  return fieldPath;
}

function createLegacyIssueFromError(
  error: string,
): EditableUserProfileValidationIssue | null {
  const field = readFieldNameFromTextError(error);
  if (!field) {
    return null;
  }

  if (error.startsWith("Missing required field:")) {
    return {
      field,
      fieldKey: editableUserProfileFieldTranslationKeys[field],
      messageKey: editableUserProfileValidationTranslationKeys.required,
      path: field,
      code: `${field}.required`,
      message: translateEditableUserProfileValidationText(
        editableUserProfileValidationTranslationKeys.required,
        { field: translateEditableUserProfileFieldLabel(field) },
      ),
    };
  }

  if (error.startsWith("Field is immutable:")) {
    return {
      field,
      fieldKey: editableUserProfileFieldTranslationKeys[field],
      messageKey: editableUserProfileValidationTranslationKeys.immutable,
      path: field,
      code: `${field}.immutable`,
      message: translateEditableUserProfileValidationText(
        editableUserProfileValidationTranslationKeys.immutable,
        { field: translateEditableUserProfileFieldLabel(field) },
      ),
    };
  }

  if (error.startsWith("Field ")) {
    return {
      field,
      fieldKey: editableUserProfileFieldTranslationKeys[field],
      messageKey: editableUserProfileValidationTranslationKeys.invalidType,
      path: field,
      code: `${field}.invalid_type`,
      message: error,
    };
  }

  return {
    field,
    fieldKey: editableUserProfileFieldTranslationKeys[field],
    messageKey: editableUserProfileValidationTranslationKeys.invalidValue,
    path: field,
    code: `${field}.invalid_value`,
    message: error,
  };
}

function messageKeyForProfileValidationIssue(
  field: EditableUserProfileFieldName | undefined,
  code: string,
): EditableUserProfileValidationTranslationKey | undefined {
  if (code.endsWith(".required")) {
    return editableUserProfileValidationTranslationKeys.required;
  }
  if (code.endsWith(".immutable")) {
    return editableUserProfileValidationTranslationKeys.immutable;
  }
  if (code.endsWith(".invalid_type")) {
    return editableUserProfileValidationTranslationKeys.invalidType;
  }
  if (code.endsWith(".invalid_value")) {
    return editableUserProfileValidationTranslationKeys.invalidValue;
  }
  if (code.endsWith(".too_long")) {
    return editableUserProfileValidationTranslationKeys.tooLong;
  }
  if (code.endsWith(".invalid_format")) {
    return field === "email"
      ? editableUserProfileValidationTranslationKeys.emailInvalid
      : editableUserProfileValidationTranslationKeys.nameUnsupportedCharacters;
  }
  if (code.endsWith(".profanity")) {
    return editableUserProfileValidationTranslationKeys.profanity;
  }

  return undefined;
}

function normalizeValidationIssue(
  issue: ValidationIssue,
): EditableUserProfileValidationIssue {
  const field = isEditableUserProfileFieldName(issue.path)
    ? issue.path
    : undefined;
  const messageKey = messageKeyForProfileValidationIssue(field, issue.code);

  return {
    ...issue,
    field,
    fieldKey: field ? editableUserProfileFieldTranslationKeys[field] : undefined,
    messageKey,
  };
}

function findProfanityMatch(value: string, locale: string): string | null {
  const lexicon =
    PROFILE_PROFANITY_LEXICON[locale as keyof typeof PROFILE_PROFANITY_LEXICON]
    ?? PROFILE_PROFANITY_LEXICON[PROFILE_DEFAULT_PROFANITY_LOCALE];
  const normalizedValue = ` ${normalizeToken(value).replace(/[^a-z0-9]+/g, " ")} `;

  for (const token of lexicon) {
    if (normalizedValue.includes(` ${token} `)) {
      return token;
    }
  }

  return null;
}

function validateProfileTextField(
  value: unknown,
  rule: ProfileTextFieldRule,
): true | ValidationIssueInput {
  if (typeof value !== "string") {
    return true;
  }

  const normalizedValue = value.trim();
  if (normalizedValue.length === 0) {
    if (!rule.required) {
      return true;
    }

    return toIssue(
      rule.field,
      `${rule.field}.required`,
      editableUserProfileValidationTranslationKeys.required,
    );
  }

  if (normalizedValue.length > rule.maxLength) {
    return toIssue(
      rule.field,
      `${rule.field}.too_long`,
      editableUserProfileValidationTranslationKeys.tooLong,
      { maxLength: rule.maxLength },
    );
  }

  if (rule.format === "name" && !validateName(normalizedValue)) {
    return toIssue(
      rule.field,
      `${rule.field}.invalid_format`,
      editableUserProfileValidationTranslationKeys.nameUnsupportedCharacters,
    );
  }

  if (rule.format === "displayName" && !validateDisplayName(normalizedValue)) {
    return toIssue(
      rule.field,
      `${rule.field}.invalid_format`,
      editableUserProfileValidationTranslationKeys.nameUnsupportedCharacters,
    );
  }

  if (rule.format === "email" && !validateEmail(normalizedValue)) {
    return toIssue(
      rule.field,
      `${rule.field}.invalid_format`,
      editableUserProfileValidationTranslationKeys.emailInvalid,
    );
  }

  const profanityToken = findProfanityMatch(normalizedValue, PROFILE_DEFAULT_PROFANITY_LOCALE);
  if (profanityToken) {
    return toIssue(
      rule.field,
      `${rule.field}.profanity`,
      editableUserProfileValidationTranslationKeys.profanity,
    );
  }

  return true;
}

export const editableProfileNameShape = {
  firstName: field
    .string()
    .validator((value) =>
      validateProfileTextField(value, {
        field: "name.firstName",
        maxLength: 64,
        required: true,
        format: "name",
      })
    ),

  middleName: field
    .string()
    .optional()
    .validator((value) =>
      validateProfileTextField(value, {
        field: "name.middleName",
        maxLength: 64,
        required: false,
        format: "name",
      })
    ),

  lastName: field
    .string()
    .validator((value) =>
      validateProfileTextField(value, {
        field: "name.lastName",
        maxLength: 64,
        required: true,
        format: "name",
      })
    ),

  displayName: field
    .string()
    .validator((value) =>
      validateProfileTextField(value, {
        field: "name.displayName",
        maxLength: 80,
        required: true,
        format: "displayName",
      })
    ),

  preferredDisplayOrder: field
    .string()
    .enum([...Object.values(PreferredDisplayOrder)]),
};

export const editableUserProfileSchema = createSchema(
  {
    email: field
      .string()
      .validator((value) =>
        validateProfileTextField(value, {
          field: "email",
          maxLength: 254,
          required: true,
          format: "email",
        })
      ),

    name: field.object(editableProfileNameShape),

    emailPreferences: field
      .array(
        field
          .string()
          .enum([...Object.values(UserEmailPreferences)])
          .as<UserEmailPreferences>()
      )
      .optional()
      .as<UserEmailPreferences[]>(),
  },
  "userProfileEditable",
  {
    version: "1.0.0",
    piiEnforcement: "strict",
    table: "",
  },
);

export type EditableUserProfile = Infer<(typeof editableUserProfileSchema)["_shape"]>;

export function validateEditableUserProfile(
  input: unknown,
): ValidationResult<EditableUserProfile> {
  return editableUserProfileSchema.validate(input);
}

export function mapEditableUserProfileValidationErrors(
  validation: Pick<ValidationResult<EditableUserProfile>, "errors" | "issues">,
): {
  fieldErrors: EditableUserProfileFieldErrors;
  formErrors: string[];
  issues: EditableUserProfileValidationIssue[];
} {
  const issues: EditableUserProfileValidationIssue[] = (validation.issues ?? []).map(
    normalizeValidationIssue,
  );
  const fieldErrors: EditableUserProfileFieldErrors = {};
  const formErrors: string[] = [];
  const seenMessages = new Set(issues.map((issue) => issue.message));

  for (const issue of issues) {
    if (issue.field) {
      fieldErrors[issue.field] ??= issue.message;
      continue;
    }

    formErrors.push(issue.message);
  }

  for (const rawError of validation.errors ?? []) {
    const error = String(rawError);
    if (seenMessages.has(error)) {
      continue;
    }

    const issue = createLegacyIssueFromError(error);
    if (!issue) {
      formErrors.push(error);
      continue;
    }

    issues.push(issue);
    if (issue.field) {
      fieldErrors[issue.field] ??= issue.message;
    }
  }

  return {
    fieldErrors,
    formErrors,
    issues,
  };
}
