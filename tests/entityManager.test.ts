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

  it("rejects invalid base entity shapes", () => {
    const bad = {
      id: "" as any,
      type: "product",
      version: -1,
      createdAt: "not-a-date",
      updatedAt: "also-not-a-date",
    };
    expect(() => ensureValid(baseEntitySchema, bad)).toThrow();
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

  it("does not mutate original entity when bumping version", () => {
    const now = new Date("2025-01-01T02:00:00Z");
    const e = {
      id: "abc" as any,
      type: "product",
      version: 5,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    const next = bumpVersion(e, new Date("2025-01-01T03:00:00Z"));
    expect(e.version).toBe(5);
    expect(next.version).toBe(6);
    expect(e.updatedAt).toBe(now.toISOString());
  });
});
