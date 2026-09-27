/**
 * The mobile "Akun" trigger + bottom sheet (P7.3). Nav.astro's own inline
 * motion toggle / language link / Masuk-Keluar stay in the DOM for the
 * 640px-and-up top bar; this island renders the same three things again
 * for the sheet and CSS hides whichever of the two doesn't apply at the
 * current width (see Nav.astro's own style block) -- a small, deliberate
 * duplication that avoids wiring a vanilla script and a React island
 * through a shared open/close state for what is, on each side, three
 * simple controls.
 *
 * The motion toggle can't reuse cosmos-router.js's ID-based button the way
 * the desktop copy does: that script binds its click listener once, on
 * page load, by looking up #kurangi-efek-toggle -- but Radix unmounts a
 * closed Dialog's content from the DOM, so a button that only exists while
 * the sheet is open would never get bound. `window.CosmosRouter` already
 * exposes get/cycle as a plain function API for exactly this reason (see
 * that file's own comment), so this component calls it directly instead.
 *
 * Masuk/Keluar close the sheet before acting rather than acting while it's
 * still open, so this Dialog and LoginDialog.tsx's own (both z-index
 * 100/101) never end up stacked on screen at once.
 */
import { useEffect, useState } from "react";
import Dialog from "./ui/Dialog";
import "./AkunSheet.css";

type MotionPref = "auto" | "penuh" | "kurangi";

const MOTION_LABELS: Record<MotionPref, string> = {
  auto: "Otomatis",
  penuh: "Penuh",
  kurangi: "Kurangi",
};

function MotionToggle() {
  const [pref, setPref] = useState<MotionPref>("auto");

  useEffect(() => {
    const current = window.CosmosRouter?.getMotionPref();
    if (current) setPref(current);
  }, []);

  return (
    <button
      type="button"
      className="akun-sheet__item"
      onClick={() => {
        const next = window.CosmosRouter?.cycleMotionPref();
        if (next) setPref(next);
      }}
    >
      <span>Efek gerak pada latar</span>
      <span className="akun-sheet__item-value">{MOTION_LABELS[pref]}</span>
    </button>
  );
}

interface Props {
  lang?: "id" | "en";
  langHref?: string;
  langLabel?: string;
}

export default function AkunSheet({ langHref, langLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((me: { ok?: boolean }) => setSignedIn(!!me.ok))
      .catch(() => setSignedIn(false));
  }, []);

  return (
    <>
      <button
        type="button"
        className="akun-sheet__trigger"
        onClick={() => setOpen(true)}
        aria-label="Akun"
      >
        Akun
      </button>

      <Dialog open={open} onOpenChange={setOpen} title="Akun" sheet>
        <div className="akun-sheet__list">
          <MotionToggle />

          {langHref && (
            <a className="akun-sheet__item" href={langHref}>
              <span>Bahasa</span>
              <span className="akun-sheet__item-value">{langLabel}</span>
            </a>
          )}

          {signedIn === false && (
            <button
              type="button"
              className="btn btn--primary akun-sheet__action"
              onClick={() => {
                setOpen(false);
                window.LoginDialog?.open();
              }}
            >
              <span className="btn__label">Masuk</span>
            </button>
          )}

          {signedIn === true && (
            <button
              type="button"
              className="btn btn--secondary akun-sheet__action"
              onClick={async () => {
                setOpen(false);
                await fetch("/api/auth/logout", { method: "POST" });
                const tujuan = location.pathname === "/" ? "/" : "/?login=1";
                location.assign(tujuan);
              }}
            >
              Keluar
            </button>
          )}
        </div>
      </Dialog>
    </>
  );
}
