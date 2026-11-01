/**
 * The panel's compact header (the mockup's N7.Head): the area's icon tile,
 * the title with the role badge and the area chip, one line under it, and the
 * Oprec switch on the right. It replaces the big page title; the way back to
 * the practicum is the account menu's "Buka IRIS Praktikum".
 */
import type { ReactNode } from "react";
import Pill from "../../ui/Pill";
import type { PanelTab } from "../../../lib/recruitment/panel-tab";
import { AREA } from "./areas";

export default function PanelHead({
  tab,
  title,
  badge,
  area,
  stc,
  sub,
  children,
}: {
  tab: PanelTab;
  title: string;
  badge?: string;
  /** The tab's name, as the navbar writes it */
  area: string;
  /** The Subject to Change mark and what it says on hover (Mengajar, Penerimaan) */
  stc?: string;
  sub: ReactNode;
  /** The Oprec switch */
  children?: ReactNode;
}) {
  const a = AREA[tab];
  return (
    <header className="rec-head2" style={{ "--tc": a.c } as React.CSSProperties}>
      <span className="rec-head2__ic" key={tab}>
        <a.icon size={24} aria-hidden="true" />
      </span>
      <div className="rec-head2__t">
        <div className="rec-head2__row">
          <h1 className="rec-head2__h">{title}</h1>
          {badge && <Pill>{badge}</Pill>}
          <span className="rec-head2__area" key={"a" + tab}>
            {area}
          </span>
          {stc && (
            <span className="rec-stc" title={stc}>
              STC
            </span>
          )}
        </div>
        <span className="hint">{sub}</span>
      </div>
      <span className="grow" />
      {children}
    </header>
  );
}
