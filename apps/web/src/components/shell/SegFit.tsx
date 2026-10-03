/**
 * Phase 9: every switch (.seg and SegmentedControl's .segmented) shares its
 * width in equal parts. When its options can no longer be equal in one row
 * (a narrow card, long labels, a phone), this sets data-cols="2" (two per
 * row) or data-cols="1" (stacked) on it, and the CSS lays it out. One
 * observer for the whole page, so a new switch needs no wiring. Renders
 * nothing. A switch with its own narrow layout opts out with
 * data-segfit="off" (the module page's steps).
 */
import { useEffect } from "react";

const SEL = ".seg, .segmented";

/** An option's width with its label on one line. */
function natural(item: HTMLElement): number {
  const cs = getComputedStyle(item);
  const r = document.createRange();
  r.selectNodeContents(item);
  const px = (v: string) => parseFloat(v) || 0;
  return (
    r.getBoundingClientRect().width +
    px(cs.paddingLeft) +
    px(cs.paddingRight) +
    px(cs.borderLeftWidth) +
    px(cs.borderRightWidth)
  );
}

function fit(el: HTMLElement) {
  if (!el.isConnected || el.clientWidth === 0 || el.dataset.segfit === "off") return;
  const items = [...el.children].filter(
    (c): c is HTMLElement => c instanceof HTMLElement && c.getClientRects().length > 0,
  );
  const n = items.length;
  if (n < 2) return;
  // Measure as one row: a switch that sizes to its content would otherwise
  // keep the narrow width its own stacked layout gave it.
  delete el.dataset.cols;
  const cs = getComputedStyle(el);
  const px = (v: string) => parseFloat(v) || 0;
  const gap = px(cs.columnGap);
  const pad =
    px(cs.paddingLeft) + px(cs.paddingRight) + px(cs.borderLeftWidth) + px(cs.borderRightWidth);
  const par = el.parentElement;
  const pcs = par ? getComputedStyle(par) : null;
  const room = par && pcs ? par.clientWidth - px(pcs.paddingLeft) - px(pcs.paddingRight) : Infinity;
  const inner = Math.min(el.getBoundingClientRect().width, room) - pad;
  const nat = items.map(natural);
  const w = Math.max(...nat);
  // A grid switch (.seg) forces equal columns, so every column needs the
  // widest label. A flex one (.segmented) shares out spare room equally but
  // lets a long label keep its width, so it only needs all the labels to fit.
  const satu = cs.display.includes("flex") ? nat.reduce((a, b) => a + b, 0) : n * w;
  const cols =
    inner + 1 >= satu + (n - 1) * gap ? "" : n > 2 && inner + 1 >= 2 * w + gap ? "2" : "1";
  if (cols) el.dataset.cols = cols;
}

export default function SegFit() {
  useEffect(() => {
    const seen = new WeakSet<Element>();
    const ro = new ResizeObserver((entries) =>
      entries.forEach((e) => fit(e.target as HTMLElement)),
    );
    let raf = 0;
    const scan = () => {
      raf = 0;
      document.querySelectorAll<HTMLElement>(SEL).forEach((el) => {
        if (!seen.has(el)) {
          seen.add(el);
          ro.observe(el);
        }
        fit(el);
      });
    };
    const later = () => {
      if (!raf) raf = requestAnimationFrame(scan);
    };
    // New switches, and labels that change with the language.
    const mo = new MutationObserver(later);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    scan();
    void document.fonts?.ready.then(later);
    return () => {
      mo.disconnect();
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}
