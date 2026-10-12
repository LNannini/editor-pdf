import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  build: { target: "esnext", outDir: "dist", emptyOutDir: true },
  worker: { format: "es" },
  optimizeDeps: { exclude: ["mupdf"] },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 30000,
  },
});
