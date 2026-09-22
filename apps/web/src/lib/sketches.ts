/**
 * Raw source text for the sketch files copied into src/content/sketches/ --
 * see that directory's own note for why these are a web-facing copy rather
 * than a build-time link into the separate practicum repo. Vite resolves
 * this glob at build time (and on each file change in dev), so no fs access
 * is needed from the pages that call getSketchSource().
 */
const files = import.meta.glob("../content/sketches/*/*", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export function getSketchSource(bahasa: string, filename: string): string {
  const key = `../content/sketches/${bahasa}/${filename}`;
  const src = files[key];
  if (src === undefined) {
    throw new Error(`missing sketch source: ${key}`);
  }
  return src;
}
