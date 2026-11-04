/**
 * A faint tiled mark with the candidate's NIM and first name over the whole exam page (4 Nov 2026).
 * It cannot stop a screenshot or a photo of the screen; it makes one traceable to the seat it came
 * from. It never takes a click (pointer-events none), stays readable-neutral on the dark and the
 * light theme (mid grey, low opacity) and is drawn as one background image, so it costs no nodes.
 */
import { useMemo } from "react";

const esc = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

export default function Watermark({ text }: { text: string }) {
  const url = useMemo(() => {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200">` +
      `<text x="160" y="100" text-anchor="middle" transform="rotate(-24 160 100)" ` +
      `font-family="Inter, Arial, sans-serif" font-size="15" font-weight="600" ` +
      `fill="rgb(128,128,128)" fill-opacity="0.2">${esc(text)}</text></svg>`;
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  }, [text]);
  return <div className="r3wm" aria-hidden="true" style={{ backgroundImage: url }} />;
}
