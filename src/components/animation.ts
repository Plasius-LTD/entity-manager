import {
  createComponentSchema,
  field,
  Infer,
  SchemaShape,
} from "@plasius/schema";
import { type BaseComponent } from "./basecomponent.js";

const animationComponentShape : SchemaShape = {
  animated: field.boolean()
    .optional()
    .description("Is this entity animated?")
    .version("1.0"),

  availableAnimations: field.array(field.string())
    .optional()
    .description("List of available animations for this entity")
    .version("1.0"),
};

export const animationComponentSchema = createComponentSchema(
  animationComponentShape,
  "AnimationComponent",
  "1.0",
  "components"
);
export type AnimationComponent = Infer<typeof animationComponentSchema> & BaseComponent;
