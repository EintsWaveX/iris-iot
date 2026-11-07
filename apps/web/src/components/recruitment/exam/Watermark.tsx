/**
 * A faint mark with the candidate's NIM and first name over the whole exam page (4 Nov 2026).
 * It cannot stop a screenshot or a photo of the screen; it makes one traceable to the seat it came
 * from. It never takes a click (pointer-events none) and stays readable-neutral on the dark and the
 * light theme (mid grey, low opacity).
 *
 * Since 7 Nov 2026 the lines drift along their own slant, one up, the next down, the next up again.
 * Two layers do it, so the cost stays at two nodes and two compositor layers however big the screen
 * is: layer A holds lines 1, 3, 5... and slides up, layer B holds lines 2, 4, 6... (half a row
 * lower, half a tile over) and slides down. Each layer is one background image, a tile that repeats
 * in both directions, so the slide loops without a seam after exactly one tile width. Under reduced
 * motion, or with the page's motion switched to "reduce", the lines stand still.
 */
import { useMemo } from "react";

/** One repeat of the text along a line, and the distance between two lines (the CSS reads the same two) */
const TILE_W = 380;
const ROW_H = 120;

const esc = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

export default function Watermark({ text }: { text: string }) {
  // The tile holds one line of text and one empty line, so a layer's own lines sit two rows apart
  // and the other layer's lines fall in between.
  const url = useMemo(() => {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="${ROW_H * 2}">` +
      `<text x="${TILE_W / 2}" y="${ROW_H / 2}" text-anchor="middle" dominant-baseline="middle" ` +
      `font-family="Inter, Arial, sans-serif" font-size="15" font-weight="600" ` +
      `fill="rgb(128,128,128)" fill-opacity="0.2">${esc(text)}</text></svg>`;
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  }, [text]);
  return (
    <div
      className="r3wm"
      aria-hidden="true"
      style={{ "--wm-w": `${TILE_W}px`, "--wm-h": `${ROW_H}px` } as React.CSSProperties}
    >
      <div className="r3wm__sheet">
        <i className="r3wm__lane r3wm__lane--up" style={{ backgroundImage: url }} />
        <i className="r3wm__lane r3wm__lane--down" style={{ backgroundImage: url }} />
      </div>
    </div>
  );
}
