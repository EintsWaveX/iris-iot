/**
 * An expander drawn by the kit, in place of the browser's <details> marker
 * (Phase 9: no native widgets). The head is a real button with
 * aria-expanded; the body fades in when opened.
 *
 * Usage:
 *   <Disclose head={t.history}>{rows}</Disclose>
 */
import { useEffect, useId, useState, type ReactNode } from "react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { calmMotion } from "../../lib/calm-motion";
import "./Disclose.css";

interface Props {
  head: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export default function Disclose({ head, children, defaultOpen = false, className }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  // The body stays mounted while it fades out after the head is pressed again.
  const [mounted, setMounted] = useState(defaultOpen);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    if (!mounted) return;
    if (calmMotion()) {
      setMounted(false);
      return;
    }
    const id = window.setTimeout(() => setMounted(false), 120);
    return () => window.clearTimeout(id);
  }, [open, mounted]);
  return (
    <div className={className ? `disc ${className}` : "disc"} data-open={open ? "yes" : "no"}>
      <button
        type="button"
        className="disc__head"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen(!open)}
      >
        <span className="grow">{head}</span>
        <CaretDownIcon size={18} aria-hidden="true" />
      </button>
      {(open || mounted) && (
        <div id={bodyId} className={open ? "disc__body fade" : "disc__body fade fade--out"}>
          {children}
        </div>
      )}
    </div>
  );
}
