import { createSchema, field, validateUrl } from "@plasius/schema";
import type { Infer, SchemaShape } from "@plasius/schema";
import { AssetEntity, assetEntityShape } from "./asset.entity.js";

const imageAssetEntityShape: SchemaShape = {
  url: field
    .string()
    .version("1.0")
    .description("URL of the blob or file storage containing the asset")
    .as<URL>()
    .validator(validateUrl),

  thumbnailUrl: field
    .string()
    .version("1.0")
    .description("URL of the thumbnail image for the asset")
    .optional()
    .as<URL>()
    .validator(validateUrl),

  width: field
    .number()
    .version("1.0")
    .description("Width of the image in pixels")
    .optional(),

  height: field
    .number()
    .version("1.0")
    .description("Height of the image in pixels")
    .optional(),
};

export const imageAssetEntitySchema = createSchema(
  imageAssetEntityShape,
  "ImageAssetEntity",
  {
    version: "1.0.0",
    piiEnforcement: "strict",
    table: "assets"
  }
);
export type ImageAssetEntity = Infer<typeof imageAssetEntitySchema> & AssetEntity;
