/**
 * The extras on the QR wall (the user's notes on the Belum Mulai screenshot, 4 Nov):
 * a lobby where each CaAs appears the moment they check in, a bottom strip of
 * lines moving right to left, and a few sparkling stars. All three are for the
 * projector only; reduced motion and Low Detail get a still ticker and no stars.
 */
import { useMemo, useRef } from "react";
import type { AttendanceRow } from "../../../lib/recruitment/types";

/** The people checked in so far, newest first, each popping in as they arrive (Kahoot's lobby). */
export function Lobby({
  title,
  empty,
  rows,
  waiting,
}: {
  title: string;
  empty: string;
  /** null while the list is not loaded yet */
  rows: AttendanceRow[] | null;
  /** The event has not started: nothing to show yet, only the hint */
  waiting: boolean;
}) {
  const here = useMemo(
    () =>
      (rows ?? []).filter((r) => r.present).sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")),
    [rows],
  );
  // Whoever is here when the list first loads is not "new": only later arrivals pop in.
  const first = useRef<Set<number> | null>(null);
  if (first.current === null && rows !== null) first.current = new Set(here.map((r) => r.id));
  return (
    <section className="r2proj__lobby" aria-label={title}>
      <header>
        <span className="r2proj__eyebrow">{title}</span>
        {!waiting && rows !== null && <b className="num">{here.length}</b>}
      </header>
      {waiting || (rows !== null && here.length === 0) ? (
        <p className="empty-note empty-note--sm">{empty}</p>
      ) : (
        <ul className="r2proj__lobbylist">
          {here.map((r) => (
            <li key={r.id} data-new={first.current && !first.current.has(r.id) ? "yes" : undefined}>
              <i style={{ ["--h" as string]: (r.id * 47) % 360 }} aria-hidden="true">
                {r.nama.trim().charAt(0).toUpperCase()}
              </i>
              <span>{r.nama}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Lines running from the right edge to the left, over and over. Still (the first lines) when motion is off. */
export function Ticker({ lines, still }: { lines: string[]; still: boolean }) {
  const chars = lines.reduce((n, l) => n + l.length, 0);
  const group = (k: string) => (
    <span className="r2proj__tickgroup" key={k}>
      {lines.map((l, i) => (
        <span key={i} className="r2proj__tickitem">
          {l}
        </span>
      ))}
    </span>
  );
  if (still)
    return (
      <div className="r2proj__tick" aria-hidden="true">
        <span className="r2proj__tickstill">{lines.slice(0, 2).join("   ·   ")}</span>
      </div>
    );
  return (
    <div className="r2proj__tick" aria-hidden="true">
      <div
        className="r2proj__tickrun"
        style={{ animationDuration: `${Math.max(30, Math.round(chars * 0.14))}s` }}
      >
        {group("a")}
        {group("b")}
      </div>
    </div>
  );
}

const STARS = Array.from({ length: 22 }, (_, i) => {
  // A fixed scatter over the left and right margins (no randomness, so the wall looks the same on every load).
  const r = (n: number) => Math.abs((Math.sin((i + 1) * n) * 10000) % 1);
  return {
    // The QR and its text sit in the middle, so the stars twinkle in the two margins.
    x: i % 2 === 0 ? 1 + r(12.9898) * 11 : 87 + r(12.9898) * 11,
    y: 5 + r(78.233) * 60,
    s: 9 + Math.round(r(39.346) * 14),
    d: Math.round(r(11.135) * 40) / 10,
    t: 2.2 + Math.round(r(93.989) * 22) / 10,
    gold: i % 3 === 0,
  };
});

/** A few four-point stars twinkling in the side margins. Decorative only. */
export function Stars() {
  return (
    <div className="r2proj__stars" aria-hidden="true">
      {STARS.map((s, i) => (
        <i
          key={i}
          data-gold={s.gold ? "yes" : undefined}
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.s,
            height: s.s,
            animationDelay: `${s.d}s`,
            animationDuration: `${s.t}s`,
          }}
        />
      ))}
    </div>
  );
}
