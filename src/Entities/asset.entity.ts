import { field, createSchema } from "@plasius/schema";
import { BaseEntity } from "../base.entity.js";
import type { Infer, SchemaShape } from "@plasius/schema";

export const assetEntityShape: SchemaShape = {
  cacheable: field.boolean()
    .version("1.0")
    .description("Is this asset safe to store in local cache?"),

  userUploaded: field.boolean()
    .version("1.0")
    .description("User uploaded from their machine, verification of ownership required.")
    .optional(),

  userCreated: field.boolean()
    .version("1.0")
    .description("User created using local tools, verification of ownership not required.")
    .optional(),

  validated: field.boolean()
    .version("1.0")
    .description("has this content been validated as safe for use")
    .optional(),

  validatedBy: field.string()
    .internal()
    .version("1.0")
    .description("Who validated this content")
    .optional(),

  validatedAt: field.string()
    .version("1.0")
    .description("When was this content validated?")
    .optional(),
};

export const assetEntitySchema = createSchema(
  assetEntityShape,
  "AssetEntity",
  {
    version: "1.0.0",
    piiEnforcement: "strict",
    table: "assets"
  }
);
export type AssetEntity = Infer<typeof assetEntitySchema> & BaseEntity;
