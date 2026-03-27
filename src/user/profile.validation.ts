import {
  createSchema,
  field,
  validateEmail,
  validateName,
  type Infer,
  type ValidationIssue,
  type ValidationIssueInput,
  type ValidationResult,
} from "@plasius/schema";
import { UserEmailPreferences } from "./user.entity.js";
import { PreferredDisplayOrder } from "./user.name.js";

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

const EDITABLE_PROFILE_FIELD_LABELS: Record<EditableUserProfileFieldName, string> = {
  "name.firstName": "First name",
  "name.middleName": "Middle name",
  "name.lastName": "Last name",
  "name.displayName": "Display name",
  "name.preferredDisplayOrder": "Preferred name display",
  email: "Email",
  emailPreferences: "Email preferences",
};

type ProfileTextFieldRule = {
  path: string;
  label: string;
  maxLength: number;
  required: boolean;
  format: "name" | "email";
};

function toIssue(
  path: string,
  code: string,
  message: string,
): ValidationIssueInput {
  return {
    path,
    code,
    message,
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
      path: field,
      code: `${field}.required`,
      message: `${EDITABLE_PROFILE_FIELD_LABELS[field]} is required.`,
    };
  }

  if (error.startsWith("Field is immutable:")) {
    return {
      field,
      path: field,
      code: `${field}.immutable`,
      message: `${EDITABLE_PROFILE_FIELD_LABELS[field]} cannot be changed.`,
    };
  }

  if (error.startsWith("Field ")) {
    return {
      field,
      path: field,
      code: `${field}.invalid_type`,
      message: error,
    };
  }

  return {
    field,
    path: field,
    code: `${field}.invalid_value`,
    message: error,
  };
}

function normalizeValidationIssue(
  issue: ValidationIssue,
): EditableUserProfileValidationIssue {
  const field = isEditableUserProfileFieldName(issue.path)
    ? issue.path
    : undefined;

  return {
    ...issue,
    field,
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
      rule.path,
      `${rule.path}.required`,
      `${rule.label} is required.`,
    );
  }

  if (normalizedValue.length > rule.maxLength) {
    return toIssue(
      rule.path,
      `${rule.path}.too_long`,
      `${rule.label} must be ${rule.maxLength} characters or fewer.`,
    );
  }

  if (rule.format === "name" && !validateName(normalizedValue)) {
    return toIssue(
      rule.path,
      `${rule.path}.invalid_format`,
      `${rule.label} contains unsupported characters.`,
    );
  }

  if (rule.format === "email" && !validateEmail(normalizedValue)) {
    return toIssue(
      rule.path,
      `${rule.path}.invalid_format`,
      `${rule.label} must be a valid email address.`,
    );
  }

  const profanityToken = findProfanityMatch(normalizedValue, PROFILE_DEFAULT_PROFANITY_LOCALE);
  if (profanityToken) {
    return toIssue(
      rule.path,
      `${rule.path}.profanity`,
      `${rule.label} contains blocked language.`,
    );
  }

  return true;
}

export const editableProfileNameShape = {
  firstName: field
    .string()
    .validator((value) =>
      validateProfileTextField(value, {
        path: "name.firstName",
        label: "First name",
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
        path: "name.middleName",
        label: "Middle name",
        maxLength: 64,
        required: false,
        format: "name",
      })
    ),

  lastName: field
    .string()
    .validator((value) =>
      validateProfileTextField(value, {
        path: "name.lastName",
        label: "Last name",
        maxLength: 64,
        required: true,
        format: "name",
      })
    ),

  displayName: field
    .string()
    .validator((value) =>
      validateProfileTextField(value, {
        path: "name.displayName",
        label: "Display name",
        maxLength: 80,
        required: true,
        format: "name",
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
          path: "email",
          label: "Email",
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
    } else {
      formErrors.push(issue.message);
    }
  }

  return {
    fieldErrors,
    formErrors,
    issues,
  };
}
