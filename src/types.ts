export interface EntityIdBrand {
  readonly __brand: "EntityId";
}
export type EntityId = string & EntityIdBrand;

export interface BaseEntity {
  id: EntityId;
  type: string;
  version: number;
  createdAt: string; // ISO8601
  updatedAt: string; // ISO8601
}
