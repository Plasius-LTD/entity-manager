import { createSchema, field } from "@plasius/schema";
import type { Infer, SchemaShape } from "@plasius/schema";
import { AssetEntity } from "./asset.entity.js";
import { ComponentTypes } from "../components/index.js";
import { ModelAssetFormat } from "./model.asset.entity.js";


export const objectAssetEntityShape : SchemaShape = {
  url: field.string()
    .version("1.0")
    .description("URL of the blob or file storage containing the object asset")
    .required(),

  thumbnailUrl: field.string()
    .version("1.0")
    .description("URL of the thumbnail image for the object asset")
    .optional(),

  format: field.string()
    .version("1.0")
    .description("Format of the object asset")
    .optional()
    .enum([...Object.values(ModelAssetFormat)]),

  size: field.number()
    .version("1.0")
    .description("Size of the object asset in bytes")
    .optional(),

  components: field.array(
    field.object({
      type: field.string()
        .description("Type of the component")
        .version("1.0")
        .enum([...Object.values(ComponentTypes)]),
      config: field.object({})
        .optional()
        .description("Configuration for the component")
        .version("1.0"),
    })
  )
    .version("1.0")
    .description("List of components attached to this object asset")
    .optional(),
};

export const objectAssetEntitySchema = createSchema(
  objectAssetEntityShape,
  "objectAssetEntity",
  {
    version: "1.0.0",
    piiEnforcement: "strict",
    table: "objects"
  }
);
export type ObjectAssetEntity = Infer<typeof objectAssetEntitySchema> & AssetEntity;
