/**
 * Press and hold to confirm (2026-10-22, the session's Akhiri): the fill
 * sweeps across while it is held, slow and linear while the person decides,
 * and snaps back fast on release. Holding Space or Enter does the same, so
 * a click or a stray Enter (the dialog's main-button key) never fires it.
 */
import { useEffect, useRef, useState, type ComponentType, type CSSProperties } from "react";
import type { IconProps } from "@phosphor-icons/react";
import { pageLang } from "../../lib/app";
import "./HoldButton.css";

const TAG: Record<string, string> = { id: "Tahan", en: "Hold", zh: "按住" };

export default function HoldButton({
  label,
  onDone,
  ms = 1200,
  tone = "danger",
  disabled = false,
  tint,
  icon: Icon,
}: {
  label: string;
  onDone: () => void;
  ms?: number;
  tone?: "danger" | "primary";
  disabled?: boolean;
  /** The mockup's look (N7.Hold): a tinted outline, an icon, the label and a small "hold" tag. */
  tint?: "danger" | "warn" | "ok";
  icon?: ComponentType<IconProps>;
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
      className={tint ? "hold hold--tint" : `btn btn--${tone} hold`}
      data-tint={tint}
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
      {tint ? (
        <span className="hold__t">
          {Icon && <Icon size={18} aria-hidden="true" />}
          <span className="btn__label">{label}</span>
          <small>{TAG[pageLang()] ?? TAG.id}</small>
        </span>
      ) : (
        <span className="btn__label">{label}</span>
      )}
    </button>
  );
}
