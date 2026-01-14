import {
  field,
  createComponentSchema,
  type Infer,
  SchemaShape,
} from "@plasius/schema";
import {type BaseComponent } from "./basecomponent.js";

export const shadowComponentShape : SchemaShape = {
  casts: field.boolean()
    .optional()
    .description("Whether this entity casts shadows"),

  receives: field.boolean()
    .optional()
    .description("Whether this entity receives shadows"),
};

export const shadowComponentSchema = createComponentSchema(
  shadowComponentShape,
  "ShadowComponent",
  "1.0",
  "components"
);

export type ShadowComponent = Infer<typeof shadowComponentSchema> & BaseComponent;