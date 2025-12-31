import { describe, it, expect } from "vitest";
import {
  baseEntitySchema,
  ensureValid,
  bumpVersion,
  wrapExternalSchema,
} from "../src/entityManager";

describe("entity manager", () => {
  it("validates a base entity", () => {
    const e = {
      id: "abc" as any,
      type: "product",
      version: "1.0.0",
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
      version: "not-a-version",
      createdAt: "not-a-date",
      updatedAt: "also-not-a-date",
    };
    expect(() => ensureValid(baseEntitySchema, bad)).toThrow();
  });

  it("accepts relaxed ISO timestamps", () => {
    const e = {
      id: "abc" as any,
      type: "product",
      version: "1.0.0",
      createdAt: "2025-01-01T00:00:00Z", // no milliseconds
      updatedAt: "2025-01-01T00:00:01Z",
    };
    const ok = ensureValid(baseEntitySchema, e);
    expect(ok.createdAt).toBe("2025-01-01T00:00:00Z");
  });

  it("bumps version and updates timestamp", () => {
    const now = new Date("2025-01-01T00:00:00Z");
    const e = {
      id: "abc" as any,
      type: "product",
      version: "1.0.0",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    const next = bumpVersion(e, new Date("2025-01-01T01:00:00Z"));
    expect(next.version).toBe("1.0.1");
    expect(next.updatedAt).toBe("2025-01-01T01:00:00.000Z");
  });

  it("guards against clock skew when bumping version", () => {
    const created = new Date("2025-01-01T04:00:00Z");
    const earlier = new Date("2025-01-01T03:00:00Z");
    const e = {
      id: "abc" as any,
      type: "product",
      version: "2.0.0",
      createdAt: created.toISOString(),
      updatedAt: created.toISOString(),
    };
    const next = bumpVersion(e, earlier);
    expect(new Date(next.updatedAt).getTime()).toBe(
      new Date(e.createdAt).getTime(),
    );
  });

  it("does not mutate original entity when bumping version", () => {
    const now = new Date("2025-01-01T02:00:00Z");
    const e = {
      id: "abc" as any,
      type: "product",
      version: "2.3.4",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    const next = bumpVersion(e, new Date("2025-01-01T03:00:00Z"));
    expect(e.version).toBe("2.3.4");
    expect(next.version).toBe("2.3.5");
    expect(e.updatedAt).toBe(now.toISOString());
  });

  it("wraps an external schema validator", () => {
    const calls: unknown[] = [];
    const schema = wrapExternalSchema<string>({
      name: "External",
      validate(value: unknown) {
        calls.push(value);
        if (typeof value !== "string") {
          throw new Error("expected string");
        }
      },
    });

    expect(() => ensureValid(schema, 123)).toThrow("expected string");
    expect(calls).toEqual([123]);

    const ok = ensureValid(schema, "fine");
    expect(ok).toBe("fine");
  });

  it("fails validation when updatedAt is before createdAt", () => {
    const created = new Date("2025-01-01T04:00:00Z");
    const earlier = new Date("2025-01-01T03:00:00Z");
    const e = {
      id: "abc" as any,
      type: "product",
      version: "1.0.0",
      createdAt: created.toISOString(),
      updatedAt: earlier.toISOString(),
    };
    expect(() => ensureValid(baseEntitySchema, e)).toThrow();
  });

  it("retains input type values even though schema has its own entityType", () => {
    const e = {
      id: "abc" as any,
      type: "order",
      version: "1.0.0",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    };
    const ok = ensureValid(baseEntitySchema, e);
    expect(ok.type).toBe("order");
  });
});
