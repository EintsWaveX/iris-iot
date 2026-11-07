/**
 * The grey shimmer box shown while a screen loads. It is also a polite status
 * message ("Memuat" / "Loading" / "加载中") so a screen reader hears that something is on
 * its way; the text is hidden on screen. The language comes from the page
 * (`<html lang>`, in CSS), so call sites only pass the height.
 */
import "./Display.css";

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

/** All three words are in the HTML and `Display.css` shows the one that fits
 *  `<html lang>`. Choosing in JS (reading `document`) gave the server "Memuat"
 *  and an English browser "Loading": a hydration mismatch (React #418). */
function Words() {
  return (
    <>
      <span className="skw skw--id">Memuat</span>
      <span className="skw skw--en">Loading</span>
      <span className="skw skw--zh">加载中</span>
    </>
  );
}

export default function Skeleton({ height, label }: { height: number | string; label?: string }) {
  return (
    <span className="skeleton" style={{ height, position: "relative" }} role="status">
      <span style={HIDDEN}>{label ?? <Words />}</span>
    </span>
  );
}
