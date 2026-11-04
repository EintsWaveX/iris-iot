/**
 * The grey shimmer box shown while a screen loads. It is also a polite status
 * message ("Memuat" / "Loading") so a screen reader hears that something is on
 * its way; the text is hidden on screen. The language comes from the page
 * (`<html lang>`), so call sites only pass the height.
 */
const HIDDEN = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

function word(): string {
  const l = typeof document === "undefined" ? "id" : document.documentElement.lang.toLowerCase();
  return l.startsWith("en") ? "Loading" : "Memuat";
}

export default function Skeleton({ height, label }: { height: number | string; label?: string }) {
  return (
    <span className="skeleton" style={{ height, position: "relative" }} role="status">
      <span style={HIDDEN}>{label ?? word()}</span>
    </span>
  );
}
