/**
 * A section's header band (see SectionBand.css): an optional eyebrow, the heading, an optional line of sub, and an
 * optional action on the right (it drops under the heading on a phone). One per section, the full width of the
 * column, so every section on a page starts the same way.
 */
import type { ReactNode } from "react";
import "./SectionBand.css";

export default function SectionBand({
  id,
  eyebrow,
  title,
  lede,
  action,
  reveal = false,
}: {
  /** The heading's id, for aria-labelledby on the section */
  id?: string;
  eyebrow?: string;
  title: string;
  lede?: string;
  action?: ReactNode;
  /** Lifts in once as it enters the view (profil.css's [data-rv]) */
  reveal?: boolean;
}) {
  return (
    <div className="sec-band" data-rv={reveal ? "" : undefined}>
      <div className="sec-band__text">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2 className="sec-band__title" id={id}>
          {title}
        </h2>
        {lede && <p className="sec-band__lede">{lede}</p>}
      </div>
      {action && <div className="sec-band__action">{action}</div>}
    </div>
  );
}
