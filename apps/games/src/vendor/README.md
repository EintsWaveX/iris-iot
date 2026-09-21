# Vendored browser bundles

These are pre-built, unmodified distribution files copied out of `node_modules`
and committed so that `build.py` can inline them into the single-file page. The
page must stay self-contained: the Artifact build target runs under a CSP that
blocks most external hosts, and on event night 25 phones on venue wifi should
not each be resolving five extra origins.

Refresh them with:

    npm install --no-save gsap@3 canvas-confetti@1
    cp node_modules/gsap/dist/{gsap,CustomEase,SplitText,DrawSVGPlugin}.min.js src/vendor/
    cp node_modules/canvas-confetti/dist/confetti.browser.js src/vendor/

| File | Package | Version | Global | Licence |
|---|---|---|---|---|
| `gsap.min.js` | gsap | 3.15.0 | `gsap` | GreenSock Standard ("no charge") |
| `CustomEase.min.js` | gsap | 3.15.0 | `CustomEase` | GreenSock Standard |
| `SplitText.min.js` | gsap | 3.15.0 | `SplitText` | GreenSock Standard |
| `DrawSVGPlugin.min.js` | gsap | 3.15.0 | `DrawSVGPlugin` | GreenSock Standard |
| `confetti.browser.js` | canvas-confetti | 1.9.4 | `confetti` | ISC |

Since GSAP 3.13 the formerly-premium plugins (SplitText, DrawSVGPlugin,
MorphSVG, Physics2D…) ship in the public npm package under the standard
no-charge licence, which covers a non-commercial university lab event site like
this one. See <https://gsap.com/standard-license>.

Two constraints `build.py` depends on, worth re-checking after any refresh:

1. None of these files may contain the literal `<!doctype`, `<html`, `<head`,
   `<body` or `</script` — the build aborts on the first four, and the last
   would terminate the inlined `<script>` early.
2. They are concatenated into one `<script>`, joined with `;` separators, so
   each must be a complete top-level program.
