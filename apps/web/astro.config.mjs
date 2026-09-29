// @ts-check
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import react from "@astrojs/react";

// https://astro.build/config
export default defineConfig({
  integrations: [react()],
  vite: {
    // Dependencies only some islands import. Without this, the dev server
    // discovers them on first visit and answers "504 Outdated Optimize Dep",
    // leaving that page's island unhydrated until a restart.
    optimizeDeps: {
      include: [
        "@radix-ui/react-dialog",
        "@radix-ui/react-hover-card",
        "@radix-ui/react-popover",
        "@radix-ui/react-scroll-area",
        "@radix-ui/react-tabs",
        "@radix-ui/react-toggle-group",
        "@radix-ui/react-tooltip",
        "@vercel/blob/client",
        "cmdk",
        "date-fns",
        "lucide-react",
        "react-day-picker",
        "react-resizable-panels",
        "uplot",
      ],
    },
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
