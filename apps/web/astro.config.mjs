// @ts-check
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  vite: {
    server: {
      fs: {
        // Base.astro imports packages/kosmik/style/*.css by relative path
        // (a sibling of apps/, not a dependency of this project) rather
        // than as an npm package -- see that import's own comment for why.
        // Vite's dev server otherwise refuses to serve anything outside
        // the project root it detects (apps/web itself, since there is no
        // workspace root package.json), which only matters for `astro dev`
        // -- `astro build`'s Rollup pipeline bundles the file regardless,
        // so this has never affected CI, only local development.
        allow: [fileURLToPath(new URL("../..", import.meta.url))],
      },
    },
  },
});
