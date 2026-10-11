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
        "@phosphor-icons/react",
        "react-day-picker",
        "react-resizable-panels",
        "uplot",
        "@xterm/xterm",
        "@xterm/addon-fit",
        "pdfjs-dist",
      ],
      // Konsol Pi's noVNC is plain ES modules with a top-level await; served
      // as is rather than pre-bundled.
      exclude: ["@novnc/novnc"],
    },
    build: {
      // Fonts always ship as files. A few Noto Sans SC subsets are under
      // Vite's 4 KB inline limit and became data: URLs, which the CSP's
      // `font-src 'self'` blocks on every page.
      assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
      // Fewer, larger chunks (2026-10-11): a page pulled 60 to 140 scripts,
      // two thirds of them under 2 KB, and every one is a Vercel edge
      // request on the first visit after each deploy (Hobby: 1M a month).
      // Code shared by two or more islands goes to a few chunks, grouped by
      // the islands that use it; the heavy libraries only some views load
      // lazily keep their own.
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: "react",
                test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
                priority: 3,
              },
              {
                name: "vendor",
                test: (id) =>
                  /node_modules/.test(id) &&
                  !/node_modules[\\/](pdfjs-dist|fontkit|@pdf-lib|pdf-lib|@xterm|@novnc|xlsx|write-excel-file|read-excel-file|uplot)[\\/]/.test(
                    id,
                  ),
                minShareCount: 2,
                priority: 2,
                // Grouped by the pages that use them, small groups folded
                // into a neighbour: few chunks, little code a page won't run.
                entriesAware: true,
                entriesAwareMergeThreshold: 20_000,
              },
              {
                name: "app",
                test: /[\\/]src[\\/](lib|components[\\/](ui|shell|shared))[\\/]/,
                minShareCount: 2,
                priority: 1,
                entriesAware: true,
                entriesAwareMergeThreshold: 20_000,
              },
            ],
          },
        },
      },
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
