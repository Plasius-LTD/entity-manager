import { createSchema, field } from "@plasius/schema";
import type { Infer, SchemaShape, FieldBuilder } from "@plasius/schema";
import { type BaseEntity } from "../base.entity.js";
import { validateSettingValue } from "../validators/index.js";

const settingsEntityShape: SchemaShape = {
  settings: field
    .object<Record<string, FieldBuilder<unknown>>>({} as SchemaShape)
    .version("1.0")
    .description("List of key-value settings assigned for the user.")
    .validator((value) => {
      if (typeof value !== "object" || value === null) return false;
      return Object.values(value).every(validateSettingValue);
    })
    .as<Record<string, unknown>>(),
};

export const settingsEntitySchema = createSchema(
  settingsEntityShape,
  "settingsEntity",
  {
    version: "1.0.0",
    piiEnforcement: "strict",
    table: "settings",
  }
);
export type SettingsEntity = Infer<typeof settingsEntitySchema> & BaseEntity;
