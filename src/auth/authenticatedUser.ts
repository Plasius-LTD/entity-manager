import { createSchema, field, Infer, SchemaShape } from "@plasius/schema";
import {
  actorSubjectPrincipalShape,
  type ActorSubjectPrincipal,
} from "../family/principal.js";

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

  principal: field
    .object(actorSubjectPrincipalShape)
    .optional()
    .version("1.1")
    .description(
      "Server-issued actor/subject principal; the active subject must match sub.",
    )
    .as<ActorSubjectPrincipal>(),
};

function validateAuthenticatedUserPrincipal(
  user: Record<string, unknown>,
): boolean {
  if (user.principal === undefined) {
    return true;
  }

  if (
    typeof user.principal !== "object" ||
    user.principal === null ||
    Array.isArray(user.principal)
  ) {
    return false;
  }

  const subject = (user.principal as { subject?: unknown }).subject;
  return (
    typeof user.sub === "string" &&
    typeof subject === "object" &&
    subject !== null &&
    !Array.isArray(subject) &&
    (subject as { accountId?: unknown }).accountId === user.sub
  );
}

export const authenticatedUserSchema = createSchema(
  authenticatedUserShape,
  "AuthenticatedUser",
  {
    version: "1.1.0",
    piiEnforcement: "strict",
    table: "authenticatedUsers",
    schemaValidator: validateAuthenticatedUserPrincipal,
  }
);

export type AuthenticatedUser = Infer<typeof authenticatedUserSchema>;
