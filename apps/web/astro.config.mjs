// @ts-check
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import { phosphorWeights } from "./vite/phosphor-weights.ts";

// https://astro.build/config
export default defineConfig({
  integrations: [react()],
  // No `prefetch` option on purpose: <ClientRouter /> (Base.astro) already switches prefetch on, hover
  // strategy, every link (checked in the built ClientRouter script). Setting it here as well adds an
  // inline script, which the CSP would need a hash for (vercel.json, scripts/check_csp_hashes.mjs).
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
      // One chunk per module group (15 Nov 2026). It used to merge: from 2026-10-11 the shared code of two
      // or more islands was folded into a few big chunks, because every file was a Vercel edge request on
      // the first visit after a deploy (Hobby: 1M a month). On the PC that quota is gone, and the merge
      // cost real bytes: Home's first load was 50 files and 1.13 MB (357 KB Brotli), and any change to one
      // module renamed the whole chunk it sat in, so every visitor downloaded it again after each deploy.
      // Unmerged it is 97 files and 0.87 MB (295 KB Brotli) on Home (static imports before hydration), 18% less, with no deeper an import chain,
      // and a deploy only renames the chunks whose code changed. What stays grouped is what must be one
      // file: React itself, and the heavy libraries only some views load lazily (QR maker, C++ editor).
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: "react",
                test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
                priority: 3,
              },
              // The QR maker (21 KB) is used by three views and had been folded
              // into a chunk with the icons that most pages download.
              {
                name: "qrcode",
                test: /node_modules[\\/]qrcode-generator[\\/]/,
                priority: 4,
              },
              // The C++ code editor (470 KB) in a chunk of its own, loaded only
              // by the views that open it. Only the core the C++ editor needs:
              // the Python, Markdown and JS parsers keep their own chunks.
              {
                name: "codemirror",
                test: /node_modules[\\/](@codemirror[\\/](view|state|autocomplete|commands|language|lang-cpp)|@lezer[\\/](common|lr|highlight|cpp)|@marijn|style-mod|w3c-keyname)[\\/]/,
                priority: 4,
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
