// @ts-check
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import { phosphorWeights } from "./vite/phosphor-weights.ts";

// https://astro.build/config
export default defineConfig({
  integrations: [react()],
  vite: {
    // Cuts the thin and light drawings out of every Phosphor icon (see the file).
    plugins: [phosphorWeights()],
    // Dependencies only some islands import. Without this, the dev server
    // discovers them on first visit and answers "504 Outdated Optimize Dep",
    // leaving that page's island unhydrated until a restart.
    optimizeDeps: {
      include: [
        "@radix-ui/react-dialog",
        "@radix-ui/react-popover",
        "@radix-ui/react-toggle-group",
        "@radix-ui/react-tooltip",
        "cmdk",
        "date-fns",
        "@phosphor-icons/react",
        "react-day-picker",
        "@xterm/xterm",
        "@xterm/addon-fit",
        "pdfjs-dist",
      ],
      // Konsol PC's noVNC is plain ES modules with a top-level await; served
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
              // The C++ code editor (470 KB) in a chunk of its own, loaded only
              // by the views that open it. The vendor group below folds small
              // groups into a neighbour, and once pako left it (next comment)
              // the neighbour it picked was this editor, so the Console and the
              // candidate landing page downloaded it. Only the core the C++
              // editor needs: the Python, Markdown and JS parsers keep their
              // own chunks.
              {
                name: "codemirror",
                test: /node_modules[\\/](@codemirror[\\/](view|state|autocomplete|commands|language|lang-cpp)|@lezer[\\/](common|lr|highlight|cpp)|@marijn|style-mod|w3c-keyname)[\\/]/,
                priority: 4,
              },
              {
                name: "vendor",
                test: (id) =>
                  /node_modules/.test(id) &&
                  // pako is pdf-lib's: it should follow that lazy code, not the pages.
                  !/node_modules[\\/](pdfjs-dist|fontkit|@pdf-lib|pdf-lib|pako|@xterm|@novnc|write-excel-file|read-excel-file)[\\/]/.test(
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
