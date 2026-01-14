import {
  createSchema,
  field,
  validateUserId,
  validateSafeText,
  validateUrl,
  validateDateTimeISO,
  type Infer,
} from "@plasius/schema";
import { BaseEntity } from "../base.entity.js";

export enum AvatarMimeType {
  PNG = "image/png",
  JPEG = "image/jpeg",
  JPG = "image/jpg",
  GIF = "image/gif",
  WEBP = "image/webp",
  SVG = "image/svg+xml",
  BMP = "image/bmp",
  AVIF = "image/avif",
}

export const userAvatarShape = {
  partitionKey: field
    .string()
    .description("Avatar partition key, typically 'domain'")
    .validator(validateSafeText),

  id: field.string().description("User ID").validator(validateSafeText),

  filename: field
    .string()
    .description("Original filename")
    .validator(validateSafeText),

  contentType: field
    .string()
    .description("MIME type of the avatar")
    .validator(validateSafeText)
    .enum([...Object.values(AvatarMimeType)]),

  url: field
    .string()
    .description("Public or signed URL to the avatar image")
    .validator(validateUrl),

  size: field.number().description("Size of the file in bytes"),

  width: field.number().description("Width of the image in pixels"),

  height: field.number().description("Height of the image in pixels"),

  createdAt: field
    .string()
    .description("Upload timestamp")
    .validator(validateDateTimeISO)
    .as<Date>(),

  createdBy: field
    .string()
    .description("User who uploaded the avatar")
    .validator(validateUserId),

  version: field.number().description("Version of this avatar record"),
};

export const userAvatarSchema = createSchema(userAvatarShape, "userAvatar", {
  version: "1.0.0",
  piiEnforcement: "strict",
  table: "avatars",
});

export type UserAvatarEntity = Infer<typeof userAvatarSchema> & BaseEntity;
