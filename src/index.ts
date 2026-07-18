export {
  type BaseEntity,
  baseEntityShape,
  baseEntitySchema,
} from "./base.entity.js";

export * from "./user/index.js";
export * from "./Entities/index.js";
export * from "./components/index.js";
export * from "./types.js";
export * from "./validators/index.js";
export * from "./auth/index.js";
export * from "./translations/index.js";
export * from "./family/index.js";
export * from "./governance/index.js";

import { AssetEntity } from "./Entities/asset.entity.js";
import { AudioAssetEntity } from "./Entities/audio.asset.entity.js";
import { ImageAssetEntity } from "./Entities/image.asset.entity.js";
import { ModelAssetEntity } from "./Entities/model.asset.entity.js";
import { ObjectAssetEntity } from "./Entities/object.asset.entity.js";

export type AnyAssetEntity =
  | AssetEntity
  | AudioAssetEntity
  | ImageAssetEntity
  | ModelAssetEntity
  | ObjectAssetEntity;
