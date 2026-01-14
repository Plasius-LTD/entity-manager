import {
  assetEntitySchema,
  imageAssetEntitySchema,
  audioAssetEntitySchema,
  modelAssetEntitySchema,
  objectAssetEntitySchema,
} from "../Entities/index.js";
import type { EntityTypes } from "../types.js";

export function validateAssetSchema(asset: { type: keyof EntityTypes }): void {
  const typeValidators = {
    AssetEntity: assetEntitySchema,
    ImageAssetEntity: imageAssetEntitySchema,
    AudioAssetEntity: audioAssetEntitySchema,
    ModelAssetEntity: modelAssetEntitySchema,
    ObjectAssetEntity: objectAssetEntitySchema,
  };

  const validator = typeValidators[asset.type as keyof typeof typeValidators];
  if (!validator) {
    throw new Error("Unsupported asset type");
  }
  if (!validator.validate(asset)) {
    throw new Error(`Invalid ${asset.type as string} format`);
  }
}
