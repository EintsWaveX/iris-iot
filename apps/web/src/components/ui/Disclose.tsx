/**
 * An expander drawn by the kit, in place of the browser's <details> marker
 * (Phase 9: no native widgets). The head is a real button with
 * aria-expanded; the body fades in when opened.
 *
 * Usage:
 *   <Disclose head={t.history}>{rows}</Disclose>
 */
import { useId, useState, type ReactNode } from "react";
import { CaretDownIcon } from "@phosphor-icons/react";
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
      {open && (
        <div id={bodyId} className="disc__body fade">
          {children}
        </div>
      )}
    </div>
  );
}
