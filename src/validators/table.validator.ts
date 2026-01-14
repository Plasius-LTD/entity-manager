export function isValidAzureTableKey(value: string): boolean {
  if (typeof value !== "string") return false;
  if (value.length === 0) return false;
  if (value.length > 1024) return false;
  if (/[/\\#?]/.test(value)) return false;
  if (/^\s|\s$/.test(value)) return false;
  return true;
}
