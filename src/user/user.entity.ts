import { BaseEntity } from "../base.entity.js";
import { UserAvatarEntity, userAvatarShape } from "./user.avatar.js";
import {
  createSchema,
  field,
  validateEmail,
  type Infer,
} from "@plasius/schema";
import { UserName, userNameShape } from "./user.name.js";

export enum UserEmailPreferences {
  ALL = "all",
  NONE = "none",
  IMPORTANT = "important",
  CUSTOM = "custom",
  PROMOTIONAL = "promotional",
  TRANSACTIONAL = "transactional",
  UPDATES = "updates",
  NEWSLETTER = "newsletter",
  MARKETING = "marketing",
  SECURITY = "security",
  ACCOUNT = "account",
  PRIVACY = "privacy",
}

export enum UserNotificationPreferences {
  ALL = "all",
  NONE = "none",
  IMPORTANT = "important",
}

export const userEntitySchema = createSchema(
  {
    email: field
      .string()
      .description("User's email address")
      .version("1.0")
      .immutable()
      .validator(validateEmail)
      .PID({
        classification: "high",
        logHandling: "redact",
        action: "encrypt",
      }),

    name: field
      .object(userNameShape)
      .description("Structured user name including display preferences")
      .version("1.0")
      .as<UserName>(),

    emailPreferences: field
      .array(
        field
          .string()
          .enum([...Object.values(UserEmailPreferences)])
          .as<UserEmailPreferences>()
      )
      .description("List of email categories the user wants to receive")
      .version("1.0")
      .optional()
      .as<UserEmailPreferences[]>(),

    notificationPreferences: field
      .string()
      .description("General notification preference")
      .version("1.0")
      .optional()
      .enum([...Object.values(UserNotificationPreferences)]),

    avatar: field
      .object(userAvatarShape)
      .description("Users avatar")
      .version("1.0")
      .optional()
      .as<UserAvatarEntity | undefined>(),
  },
  "userEntity",
  {
    version: "1.0.0",
    piiEnforcement: "strict",
    table: "users",
  }
);
export type UserEntity = Infer<typeof userEntitySchema> & BaseEntity;
