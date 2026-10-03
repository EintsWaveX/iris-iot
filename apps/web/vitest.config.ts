import { defineConfig } from "vitest/config";

export default defineConfig({
  // JSX for the .tsx islands, which the Mandarin check imports.
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "api/**/*.test.ts"],
  },
});
