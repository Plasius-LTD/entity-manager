import { field, createSchema } from "@plasius/schema";
import type { Infer, SchemaShape } from "@plasius/schema";
import { BaseEntity } from "../base.entity.js";

export const baseComponentShape: SchemaShape = {
  name: field
    .string()
    .version("1.0")
    .description("The name of the component")
    .optional(),

  description: field
    .string()
    .version("1.0")
    .description("A brief description of the component")
    .optional(),
};

export const baseComponentSchema = createSchema(baseComponentShape, "BaseComponent", {
  version: "1.0.0",
  piiEnforcement: "strict",
});

export type BaseComponent = Infer<typeof baseComponentSchema> & BaseEntity;
