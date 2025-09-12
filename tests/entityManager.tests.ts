import { describe, it, expect } from "vitest";
import {
  baseEntitySchema,
  ensureValid,
  bumpVersion,
} from "../src/entityManager";

describe("entity manager", () => {
  it("validates a base entity", () => {
    const e = {
      id: "abc" as any,
      type: "product",
      version: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const ok = ensureValid(baseEntitySchema, e);
    expect(ok.type).toBe("product");
  });

  it("bumps version and updates timestamp", () => {
    const now = new Date("2025-01-01T00:00:00Z");
    const e = {
      id: "abc" as any,
      type: "product",
      version: 1,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    const next = bumpVersion(e, new Date("2025-01-01T01:00:00Z"));
    expect(next.version).toBe(2);
    expect(next.updatedAt).toBe("2025-01-01T01:00:00.000Z");
  });
});
