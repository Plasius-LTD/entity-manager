export { type PhysicsComponent, physicsComponentSchema } from "./physics.js";
export { type ShadowComponent, shadowComponentSchema } from "./shadow.js";
export {
  type AnimationComponent,
  animationComponentSchema,
} from "./animation.js";

export * from "./basecomponent.js"

export enum ComponentTypes {
  PHYSICS = "physics",
  ANIMATION = "animation",
  SHADOW = "shadow",
}
