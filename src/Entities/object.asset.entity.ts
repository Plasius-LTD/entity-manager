import { createSchema, field } from "@plasius/schema";
import type { Infer, SchemaShape } from "@plasius/schema";
import { AssetEntity, assetEntityShape } from "./asset.entity.js";


export const objectAssetEntityShape : SchemaShape = {
  // ...TODO
  type: field.string().required()
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
