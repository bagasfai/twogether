import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    // next-intl ships pure ESM; Vitest externalizes it by default and Node's
    // native ESM loader then resolves bare specifiers like "next/server"
    // literally (Next's package.json has no "exports" map for extensionless
    // resolution), which throws. Inlining routes it through Vite's resolver
    // instead, which handles this the way Next's own bundler does.
    server: { deps: { inline: [/next-intl/] } },
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, ".") },
  },
});
