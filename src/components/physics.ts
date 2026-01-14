import { createComponentSchema, field, Infer, SchemaShape } from "@plasius/schema";
import { type BaseComponent } from "./basecomponent.js";

export enum PhysicsShape {
  BOX = "box",
  SPHERE = "sphere",
  MESH = "mesh",
  CAPSULE = "capsule",
  CYLINDER = "cylinder",
  CONVEX_HULL = "convex_hull",
}

export const physicsComponentShape : SchemaShape = {
  enabled: field.boolean()
    .optional()
    .description("Is physics enabled for this entity?")
    .version("1.0"),

  shape: field.string()
    .enum([...Object.values(PhysicsShape)])
    .optional()
    .description("The shape of the physics collider.")
    .version("1.0"),

  mass: field.number()
    .optional()
    .description("The mass of the entity in kg.")
    .version("1.0"),
};

export const physicsComponentSchema = createComponentSchema(
  physicsComponentShape,
  "PhysicsComponent",
  "1.0",
  "components"
);

export type PhysicsComponent = Infer<typeof physicsComponentSchema> & BaseComponent;