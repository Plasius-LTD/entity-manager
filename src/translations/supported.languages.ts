import { createSchema, field, Infer } from "@plasius/schema";

export const supportedLanguagesSchema = createSchema(
  {
    code: field
      .string()
      .description("Language code, e.g. 'en', 'fr-FR'")
      .immutable(),
    label: field
      .string()
      .description("Human-readable name for the language")
      .immutable(),
    direction: field
      .string()
      .enum(["ltr", "rtl"])
      .description("Text direction")
      .immutable(),
  },
  "supportedLanguages"
);
export type SupportedLanguage = Infer<typeof supportedLanguagesSchema>;
