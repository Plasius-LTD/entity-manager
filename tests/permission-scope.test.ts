import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { Scope as RootScope } from "../src/index.js";
import { Scope as PermissionScope } from "../src/permissions.js";

const require = createRequire(import.meta.url);

describe("permission Scope package surface", () => {
  it("preserves the root Scope contract through the registration-free module", () => {
    expect(PermissionScope).toBe(RootScope);
    expect(Object.values(PermissionScope)).toEqual([
      "read",
      "write",
      "delete",
      "create",
      "update",
      "execute",
      "manage",
      "admin",
      "view",
      "edit",
      "share",
      "download",
      "upload",
      "publish",
      "subscribe",
      "unpublish",
      "unsubscribe",
      "approve",
      "reject",
      "archive",
      "restore",
      "delete_permanently",
      "list",
    ]);
  });

  it("loads the CommonJS package subpath without loading schema registration code", () => {
    const output = execFileSync(
      process.execPath,
      [
        "-e",
        [
          'const scope = require("@plasius/entity-manager/permissions").Scope;',
          "const loadedSchema = Object.keys(require.cache).some((path) =>",
          '  path.includes("/@plasius/schema/") || path.includes("\\\\@plasius\\\\schema\\\\")',
          ");",
          'process.stdout.write(JSON.stringify({ loadedSchema, values: Object.values(scope) }));',
        ].join("\n"),
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_OPTIONS: "",
        },
      },
    );

    const result = JSON.parse(output) as {
      loadedSchema: boolean;
      values: string[];
    };

    expect(result.loadedSchema).toBe(false);
    expect(result.values).toEqual(Object.values(PermissionScope));
  });

  it("resolves the documented package subpath for both module systems", () => {
    expect(
      require.resolve("@plasius/entity-manager/permissions"),
    ).toMatch(/dist[/\\]permissions\.cjs$/u);
  });

  it("shares the canonical enum between the ESM root and subpath exports", () => {
    const output = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        [
          'const root = await import("@plasius/entity-manager");',
          'const permissions = await import("@plasius/entity-manager/permissions");',
          "process.stdout.write(String(root.Scope === permissions.Scope));",
        ].join("\n"),
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_OPTIONS: "",
        },
      },
    );

    expect(output).toBe("true");
  });
});
