import { getSchemaForType } from "@plasius/schema";

export function isValidEntityType(entityType: string): boolean {
  return !!getSchemaForType(entityType);
}
