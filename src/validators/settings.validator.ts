import { validateSafeText, validateDateTimeISO } from "@plasius/schema";

/**
 * Validates that a settings value is an allowed type:
 * - string (safe)
 * - number
 * - boolean
 * - ISO date string
 * - array of allowed types
 * - object of allowed types (optional - shallow)
 */
export function validateSettingValue(value: unknown): boolean {
  if (typeof value === "string") {
    // Allow safe string (reuse your validateSafeText or ISO date validator)
    return validateSafeText(value) || validateDateTimeISO(value);
  }

  if (typeof value === "number") return true;
  if (typeof value === "boolean") return true;

  if (Array.isArray(value)) {
    // Recursively validate array items
    return value.every(validateSettingValue);
  }

  if (typeof value === "object" && value !== null) {
    // Optionally allow shallow object of valid items
    return Object.values(value).every(validateSettingValue);
  }

  // Everything else rejected
  return false;
}
