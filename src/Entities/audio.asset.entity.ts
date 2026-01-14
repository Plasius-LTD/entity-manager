import { AssetEntity } from "./asset.entity.js";
import { field, createSchema } from "@plasius/schema";
import type { Infer, SchemaShape } from "@plasius/schema";

export enum AudioChannel {
  LEFT = "left",
  RIGHT = "right",
  FRONT = "front",
  REAR = "rear",
  ALL = "all",
  DYNAMIC = "dynamic", // used for location based audio
}

const audioAssetEntityShape: SchemaShape = {
  duration: field
    .number()
    .version("1.0")
    .description("Audio clip duration")
    .optional(),

  repeats: field
    .boolean()
    .version("1.0")
    .description("Does this clip repeat?")
    .optional(),

  channel: field
    .string()
    .version("1.0")
    .description("Where to play the clip, positional or dynamic")
    .optional()
    .enum([...Object.values(AudioChannel)]),
};

export const audioAssetEntitySchema = createSchema(
  audioAssetEntityShape,
  "AudioAssetEntity",
  {
    version: "1.0.0",
    piiEnforcement: "strict",
    table: "assets",
  }
);
export type AudioAssetEntity = Infer<typeof audioAssetEntitySchema> & AssetEntity;
