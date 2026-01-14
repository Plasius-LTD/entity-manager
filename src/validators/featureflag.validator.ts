/**
 * Validates that a feature flag value is an allowed type and format.
 * Allowed:
 * - boolean: true / false
 * - number: 0..1000 (example) — you can tune this
 * - string: safe identifier /^[a-zA-Z0-9._-]{1,64}$/
 *
 * Global Standard: OWASP Safe String + Feature Flag best practice (LaunchDarkly, Unleash)
 */
export function validateFeatureFlagValue(value: unknown): boolean {
  if (typeof value === "boolean") return true;

  if (typeof value === "number") {
    // Example clamp — you can tune these limits
    return value >= 0 && value <= 1000;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    // Allow booleans as strings
    if (trimmed === "true" || trimmed === "false") return true;

    // Allow numeric strings — e.g. "42", "3.14"
    if (/^\d+(\.\d+)?$/.test(trimmed)) return true;

    // Allow safe identifiers — variants, modes, named states
    if (/^[a-zA-Z0-9._-]{1,64}$/.test(trimmed)) return true;

    // Reject anything else
    return false;
  }

  // Reject all other types
  return false;
}
