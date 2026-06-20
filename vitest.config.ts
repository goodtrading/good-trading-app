import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "lib/**/*.test.ts", "hooks/**/*.test.ts"],
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
