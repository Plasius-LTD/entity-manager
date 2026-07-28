import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    permissions: "src/permissions.ts",
  },
  dts: true,
  sourcemap: true,
  clean: true,
  format: ["esm", "cjs"],
  target: "es2022",
  outDir: "dist",
  tsconfig: "tsconfig.build.json",
});
