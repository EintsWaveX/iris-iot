/**
 * A full-screen schematic viewer (Phase 8): the real wiring diagram, big,
 * with pan and zoom. The app's own lightbox rather than opening the PNG in
 * a new tab.
 *
 * - wheel or pinch to zoom around the pointer; drag to pan
 * - buttons (and + / - / 0 keys) to zoom in, out and fit
 * - Esc closes (Radix Dialog), focus returns to the thumbnail
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { Maximize2, Minus, Plus, X, Download } from "lucide-react";
import "./SchematicViewer.css";
import type { Lang } from "../../lib/kelas";
import { dict } from "../../lib/app";

const T = dict({
  id: {
    in: "Perbesar",
    out: "Perkecil",
    fit: "Pas layar",
    close: "Tutup",
    hint: "Gulir atau cubit untuk memperbesar, seret untuk menggeser.",
    open: "Buka gambar asli",
  },
  en: {
    in: "Zoom in",
    out: "Zoom out",
    fit: "Fit to screen",
    close: "Close",
    hint: "Scroll or pinch to zoom, drag to pan.",
    open: "Open the original image",
  },
});

const MIN = 0.5;
const MAX = 6;

export default function SchematicViewer({
  open,
  onOpenChange,
  src,
  title,
  lang = "id",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  src: string;
  title: string;
  lang?: Lang;
}) {
  const t = T[lang];
  const [z, setZ] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const stage = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);

  const fit = useCallback(() => {
    setZ(1);
    setPos({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (open) fit();
  }, [open, src, fit]);

  const zoomAt = useCallback(
    (nz: number, cx?: number, cy?: number) => {
      const el = stage.current;
      const clamped = Math.min(MAX, Math.max(MIN, nz));
      if (!el || cx === undefined || cy === undefined) {
        setZ(clamped);
        return;
      }
      const r = el.getBoundingClientRect();
      const ox = cx - (r.left + r.width / 2);
      const oy = cy - (r.top + r.height / 2);
      setPos((p) => ({
        x: ox - ((ox - p.x) * clamped) / z,
        y: oy - ((oy - p.y) * clamped) / z,
      }));
      setZ(clamped);
    },
    [z],
  );

  function onWheel(e: WheelEvent<HTMLDivElement>) {
    zoomAt(z * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY);
  }

  function onDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z };
      drag.current = null;
    } else {
      drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
    }
  }

  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt((pinch.current.z * d) / pinch.current.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
    } else if (drag.current) {
      setPos({
        x: drag.current.px + e.clientX - drag.current.x,
        y: drag.current.py + e.clientY - drag.current.y,
      });
    }
  }

  function onUp(e: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
  }

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="schemv__overlay" />
        <RadixDialog.Content
          className="schemv"
          aria-describedby={undefined}
          onKeyDown={(e) => {
            if (e.key === "+" || e.key === "=") zoomAt(z * 1.25);
            else if (e.key === "-") zoomAt(z / 1.25);
            else if (e.key === "0") fit();
          }}
        >
          <header className="schemv__bar sweep-edge">
            <RadixDialog.Title className="schemv__title">{title}</RadixDialog.Title>
            <span className="schemv__hint">{t.hint}</span>
            <div className="schemv__tools">
              <button
                type="button"
                className="btn btn--ghost btn--icon"
                aria-label={t.out}
                onClick={() => zoomAt(z / 1.25)}
              >
                <Minus size={18} aria-hidden="true" />
              </button>
              <span className="schemv__pct num" aria-live="polite">
                {Math.round(z * 100)}%
              </span>
              <button
                type="button"
                className="btn btn--ghost btn--icon"
                aria-label={t.in}
                onClick={() => zoomAt(z * 1.25)}
              >
                <Plus size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--icon"
                aria-label={t.fit}
                onClick={fit}
              >
                <Maximize2 size={18} aria-hidden="true" />
              </button>
              <a
                className="btn btn--ghost btn--icon"
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t.open}
              >
                <Download size={18} aria-hidden="true" />
              </a>
              <RadixDialog.Close className="btn btn--secondary btn--icon" aria-label={t.close}>
                <X size={18} aria-hidden="true" />
              </RadixDialog.Close>
            </div>
          </header>
          <div
            ref={stage}
            className="schemv__stage"
            onWheel={onWheel}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onDoubleClick={(e) => (z > 1.5 ? fit() : zoomAt(2.5, e.clientX, e.clientY))}
            data-grab={drag.current ? "yes" : undefined}
          >
            {src && (
              <img
                src={src}
                alt={title}
                draggable={false}
                className="schemv__img"
                style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${z})` }}
              />
            )}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
