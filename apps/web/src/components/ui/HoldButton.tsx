/**
 * Press and hold to confirm (2026-10-22, the session's Akhiri): the fill
 * sweeps across while it is held, slow and linear while the person decides,
 * and snaps back fast on release. Holding Space or Enter does the same, so
 * a click or a stray Enter (the dialog's main-button key) never fires it.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import "./HoldButton.css";

export default function HoldButton({
  label,
  onDone,
  ms = 1200,
  tone = "danger",
  disabled = false,
}: {
  label: string;
  onDone: () => void;
  ms?: number;
  tone?: "danger" | "primary";
  disabled?: boolean;
}) {
  const [tahan, setTahan] = useState(false);
  const jam = useRef<number | null>(null);
  const selesai = useRef(onDone);
  selesai.current = onDone;

  const lepas = () => {
    if (jam.current !== null) window.clearTimeout(jam.current);
    jam.current = null;
    setTahan(false);
  };
  const mulai = () => {
    if (disabled || jam.current !== null) return;
    setTahan(true);
    jam.current = window.setTimeout(() => {
      jam.current = null;
      setTahan(false);
      selesai.current();
    }, ms);
  };
  useEffect(() => lepas, []);
  useEffect(() => {
    if (disabled) lepas();
  }, [disabled]);

  return (
    <button
      type="button"
      className={`btn btn--${tone} hold`}
      data-hold={tahan ? "yes" : undefined}
      style={{ "--hold-ms": `${ms}ms` } as CSSProperties}
      disabled={disabled}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        mulai();
      }}
      onPointerUp={lepas}
      onPointerCancel={lepas}
      onLostPointerCapture={lepas}
      onKeyDown={(e) => {
        if (e.key !== " " && e.key !== "Enter") return;
        e.preventDefault();
        if (!e.repeat) mulai();
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") lepas();
      }}
      onBlur={lepas}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="hold__fill" aria-hidden="true" />
      <span className="btn__label">{label}</span>
    </button>
  );
}
