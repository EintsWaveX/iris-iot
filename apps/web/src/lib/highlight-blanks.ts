/**
 * Marks the `________` blank runs in a read-only sketch listing (the Code
 * step, Stage 7) so a praktikan can spot them without the real editor and
 * server-side validation that Stage 8 adds. This never runs on anything a
 * student's answer touches -- it only decorates the static source text
 * copied into src/content/sketches/, so there is nothing here for a secret
 * scanner or an answer key to worry about.
 */
function escapeHtml(source: string): string {
  return source.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function highlightBlanks(source: string): string {
  return escapeHtml(source).replace(
    /_{4,}/g,
    (match) => `<mark class="code-blank">${match}</mark>`,
  );
}
