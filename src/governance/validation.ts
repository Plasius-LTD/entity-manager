const GOVERNANCE_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const GOVERNANCE_KEY_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;
const PLATFORM_SUBJECT_PATTERN = /^[\x21-\x7e]{1,255}$/u;

export function isGovernanceIdentifier(value: unknown): value is string {
  return typeof value === "string" && GOVERNANCE_IDENTIFIER_PATTERN.test(value);
}

export function isGovernanceKey(value: unknown): value is string {
  return typeof value === "string" && GOVERNANCE_KEY_PATTERN.test(value);
}

/**
 * OIDC issuers are canonical HTTPS URLs without query, fragment, or embedded
 * credentials. Treating issuer as a URL avoids ambiguous provider aliases.
 */
export function isPlatformIdentityIssuer(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 9 || value.length > 256) {
    return false;
  }

  try {
    const issuer = new URL(value);
    const canonicalIssuer = issuer.toString();
    return (
      issuer.protocol === "https:" &&
      issuer.username.length === 0 &&
      issuer.password.length === 0 &&
      issuer.search.length === 0 &&
      issuer.hash.length === 0 &&
      (canonicalIssuer === value || canonicalIssuer === `${value}/`)
    );
  } catch {
    return false;
  }
}

/** OIDC subject identifiers are case-sensitive, non-empty printable strings. */
export function isPlatformIdentitySubject(value: unknown): value is string {
  return typeof value === "string" && PLATFORM_SUBJECT_PATTERN.test(value);
}

export function isPositiveGovernanceRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

/**
 * Professional interface keys are deliberately isolated from platform
 * security capabilities.
 */
export function isProfessionalInterfaceKey(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > 160 ||
    !value.startsWith("game.professional.")
  ) {
    return false;
  }

  const segments = value.slice("game.professional.".length).split(".");
  return (
    segments.length > 0 &&
    segments.every((segment) => GOVERNANCE_KEY_PATTERN.test(segment))
  );
}
