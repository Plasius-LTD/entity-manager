const OPAQUE_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const CANONICAL_UTC_TIMESTAMP_PATTERN =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{3}))?Z$/u;

export function isOpaqueIdentifier(value: unknown): value is string {
  return typeof value === "string" && OPAQUE_IDENTIFIER_PATTERN.test(value);
}

/**
 * Accepts a real UTC instant using seconds or exactly millisecond precision.
 * The round-trip check rejects calendar rollovers such as 2025-02-29.
 */
export function isCanonicalUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;

  const match = CANONICAL_UTC_TIMESTAMP_PATTERN.exec(value);
  if (match === null) return false;

  const timestamp = Date.parse(value);
  const base = match[1];
  const fraction = match[2] ?? "000";

  return (
    Number.isFinite(timestamp) &&
    base !== undefined &&
    new Date(timestamp).toISOString() === `${base}.${fraction}Z`
  );
}

export function isSafeAuthorizationVersion(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

export function isPresentString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isChronologicallyAfter(
  later: unknown,
  earlier: unknown,
): boolean {
  if (!isCanonicalUtcTimestamp(later) || !isCanonicalUtcTimestamp(earlier)) {
    return false;
  }

  const laterTimestamp = Date.parse(later);
  const earlierTimestamp = Date.parse(earlier);

  return (
    Number.isFinite(laterTimestamp) &&
    Number.isFinite(earlierTimestamp) &&
    laterTimestamp > earlierTimestamp
  );
}

export function isChronologicallyAtOrAfter(
  later: unknown,
  earlier: unknown,
): boolean {
  if (!isCanonicalUtcTimestamp(later) || !isCanonicalUtcTimestamp(earlier)) {
    return false;
  }

  const laterTimestamp = Date.parse(later);
  const earlierTimestamp = Date.parse(earlier);

  return (
    Number.isFinite(laterTimestamp) &&
    Number.isFinite(earlierTimestamp) &&
    laterTimestamp >= earlierTimestamp
  );
}

export function isTimestampAtOrBeforeInstant(
  value: unknown,
  instant: number,
): boolean {
  return (
    isCanonicalUtcTimestamp(value) &&
    Number.isFinite(instant) &&
    Date.parse(value) <= instant
  );
}

export function isTimestampAfterInstant(
  value: unknown,
  instant: number,
): boolean {
  return (
    isCanonicalUtcTimestamp(value) &&
    Number.isFinite(instant) &&
    Date.parse(value) > instant
  );
}
