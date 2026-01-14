import { field, createComponentSchema } from "@plasius/schema";
import type { Infer, SchemaShape } from "@plasius/schema";
import { type BaseComponent } from "./basecomponent.js";

export const levelOfDetailComponentShape: SchemaShape = {
  lodUrl: field
    .string()
    .version("1.0")
    .description("The alternative Url for LOD")
    .optional(),
  minRange: field
    .number()
    .version("1.0")
    .description("Closest distance you will see this LOD")
    .optional(),
  maxRange: field
    .number()
    .version("1.0")
    .description("Furthest distance you will see this LOD")
    .optional(),
};

export const levelOfDetailComponentSchema = createComponentSchema(
  levelOfDetailComponentShape,
  "LevelOfDetailComponent",
  "1.0",
  "components"
);

export type LevelOfDetailComponent = Infer<typeof levelOfDetailComponentSchema> &
  BaseComponent;
