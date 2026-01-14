import { createSchema, field, Infer, SchemaShape } from "@plasius/schema";

export enum AuthProvider {
  GOOGLE = "google",
  APPLE = "apple",
  MICROSOFT = "microsoft",
  NONE = "none",
}

export const authenticatedUserShape: SchemaShape = {
  sub: field.string().description("Unique user identifier").version("1.0"),

  name: field.string().description("User's full name").version("1.0").PID({
    classification: "high",
    action: "encrypt",
    logHandling: "pseudonym",
    purpose: "user identification",
  }),

  email: field
    .string()
    .optional()
    .description("User's email address")
    .version("1.0")
    .PID({
      classification: "high",
      action: "encrypt",
      logHandling: "pseudonym",
      purpose: "user identification",
    }),

  groups: field
    .array(
      field.string().optional().description("User group").version("1.0").PID({
        classification: "low",
        action: "encrypt",
        logHandling: "pseudonym",
        purpose: "group membership",
      })
    )
    .optional()
    .description("List of user groups")
    .version("1.0")
    .PID({
      classification: "low",
      action: "encrypt",
      logHandling: "pseudonym",
      purpose: "group membership",
    }),

  provider: field
    .string()
    .enum([...Object.values(AuthProvider)])
    .description("Authentication provider used by the user"),
};

export const authenticatedUserSchema = createSchema(
  authenticatedUserShape,
  "AuthenticatedUser",
  {
    version: "1.0.0",
    piiEnforcement: "strict",
    table: "authenticatedUsers",
  }
);

export type AuthenticatedUser = Infer<typeof authenticatedUserSchema>;
