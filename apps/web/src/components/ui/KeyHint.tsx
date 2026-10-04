/**
 * A control's keyboard shortcut as a small key cap, shown only when the
 * reader turned on "Tampilkan Tombol Pintasan" in the "?" sheet (the
 * `data-keyhints` attribute on <html>, styles/app.css). `corner` pins it to
 * the top right of a positioned parent so tight rows (the nav) keep their
 * layout; otherwise it sits inline after the label.
 */
export default function KeyHint({ k, corner }: { k: string; corner?: boolean }) {
  return (
    <kbd className={corner ? "keyhint keyhint--corner" : "keyhint"} aria-hidden="true">
      {k}
    </kbd>
  );
}
