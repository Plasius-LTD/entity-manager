import {
  Infer,
  createSchema,
  field,
  validateRichText,
  validateSafeText,
} from "@plasius/schema";

export const translatableSchema = createSchema(
  {
    index: field
      .string()
      .required()
      .immutable()
      .description("Unique string index for the translation"),
    text: field.string().optional().validator(validateRichText),
    translated: field.string().required().validator(validateRichText),
    context: field.string().optional().validator(validateSafeText),
  },
  "translatable",
  {
    version: "",
    piiEnforcement: "none",
    table: "translatable",
  }
);

export type Translatable = Infer<typeof translatableSchema>;
