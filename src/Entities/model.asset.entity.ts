import { createSchema, field } from "@plasius/schema";
import type { Infer, SchemaShape } from "@plasius/schema";
import { AssetEntity } from "./asset.entity.js";
import { ComponentTypes } from "../components/index.js";

export enum ModelAssetFormat {
  GLTF = "gltf",
  GLB = "glb",
  OBJ = "obj",
  FBX = "fbx",
  USDZ = "usdz",
  PLY = "ply",
  STL = "stl",
}

export const modelAssetEntityShape: SchemaShape = {
  url: field.string()
    .version("1.0")
    .description("URL of the blob or file storage containing the asset"),

  thumbnailUrl: field.string()
    .version("1.0")
    .description("URL of the thumbnail image for the asset")
    .optional(),

  format: field.string()
    .version("1.0")
    .description("Format of the model asset")
    .optional()
    .enum([...Object.values(ModelAssetFormat)]),

  size: field.number()
    .version("1.0")
    .description("Size of the model asset in bytes")
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
    .description("List of components attached to this model asset")
    .optional(),
};

export const modelAssetEntitySchema = createSchema(
  modelAssetEntityShape,
  "ModelAssetEntity",
  { version:"1.0",
   piiEnforcement: "strict" ,
  table: "assets" }
);

export type ModelAssetEntity = Infer<typeof modelAssetEntitySchema> & AssetEntity;