import {
  createSchema,
  field,
  type Infer,
  validateDisplayName,
  validateName,
} from "@plasius/schema";

export enum PreferredDisplayOrder {
  FIRST_NAME = "first_name",
  LAST_NAME = "last_name",
  MIDDLE_NAME = "middle_name",
  DISPLAY_NAME = "display_name",
}

export enum UserNameStatus {
  COMPLETE = "complete",
  INCOMPLETE = "incomplete",
}

export interface UserName {
  firstName: string;
  middleName?: string;
  lastName: string;
  displayName: string;
  status?: UserNameStatus;
  preferredDisplayOrder: PreferredDisplayOrder;
}

export const userNameShape = {
  firstName: field
    .string()
    .description("User's first name")
    .version("1.0")
    .validator(validateName)
    .PID({
      classification: "high",
      logHandling: "redact",
      action: "encrypt",
    }),

  middleName: field
    .string()
    .description("User's middle name")
    .version("1.0")
    .optional()
    .validator(validateName)
    .PID({
      classification: "high",
      logHandling: "redact",
      action: "encrypt",
    }),

  lastName: field
    .string()
    .description("User's last name")
    .version("1.0")
    .validator(validateName)
    .PID({
      classification: "high",
      logHandling: "redact",
      action: "encrypt",
    }),

  displayName: field
    .string()
    .description("User's display name (may differ from legal name)")
    .version("1.0")
    .validator(validateDisplayName)
    .PID({
      classification: "high",
      logHandling: "redact",
      action: "encrypt",
    }),

  status: field
    .string()
    .description("Whether the personal name has been completed by the user")
    .version("1.0")
    .optional()
    .enum([...Object.values(UserNameStatus)]),

  preferredDisplayOrder: field
    .string()
    .description("Preferred order for displaying the user's name")
    .version("1.0")
    .enum([...Object.values(PreferredDisplayOrder)]),
};

function validateUserNameSchema(
  userName: Infer<typeof userNameShape>
): boolean {
  const hasDisplayName =
    !!userName.displayName &&
    (userName.displayName).trim().length > 0;
  const hasFirstName =
    !!userName.firstName && (userName.firstName).trim().length > 0;
  const hasLastName =
    !!userName.lastName && (userName.lastName).trim().length > 0;

  // Rule: must have at least one displayable name
  return hasDisplayName || hasFirstName || hasLastName;
}

export const userNameSchema = createSchema(userNameShape, "userName", {
  version: "1.0.0",
  piiEnforcement: "strict",
  table: "",
  schemaValidator: validateUserNameSchema,
});
