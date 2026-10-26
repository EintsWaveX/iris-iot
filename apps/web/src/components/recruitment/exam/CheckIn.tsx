/**
 * Check-in on /recruitment/test (prompt 10, mockup r3-checkin, EXAM-ENGINE
 * 5.5): three steps on one card. Full screen (a button, since the browser
 * needs a click), a connection check (the server round trip, the live link,
 * the clock offset jamServer() already applied, and the Chromium check for
 * Live Coding, which warns but never blocks), and the name. Each step is a
 * POST test-checkin; the console's seat tile fills its dots as they arrive.
 */
import { useEffect, useRef, useState } from "react";
import { CheckIcon } from "@phosphor-icons/react";
import type { Lang } from "../../../lib/kelas";
import { selisihJam } from "../../../lib/jam";
import { isFail, recGet } from "../../../lib/recruitment/client";
import type { SeatLink } from "../../../lib/recruitment/seat-client";
import type { TestView } from "../../../lib/recruitment/seat-types";
import { tanggalWib } from "../../../lib/recruitment/gates";
import { tgl } from "../shared";
import { CheckRow, type Motion } from "./parts";
import { postCheckin, toast } from "./seatApi";
import { TS } from "./testStrings";

type Chromium = { ok: boolean; name: string };

/** Web Serial and Web Bluetooth are what Live Coding flashes and pairs with */
function chromium(): Chromium {
  const nav = navigator as Navigator & {
    serial?: unknown;
    bluetooth?: unknown;
    userAgentData?: { brands?: { brand: string; version: string }[] };
  };
  const brand = nav.userAgentData?.brands?.find(
    (b) => /chrom|edge/i.test(b.brand) && !/not/i.test(b.brand),
  );
  const name = brand
    ? `${brand.brand} ${brand.version}`
    : (/(Firefox|Safari)\/[\d.]+/.exec(navigator.userAgent)?.[0] ?? "");
  return { ok: !!nav.serial && !!nav.bluetooth, name };
}

export function roomLine(tv: TestView, lang: Lang): string {
  const i = tv.info;
  if (!i) return "";
  const parts = [i.title];
  if (i.startsAt) {
    const s = new Date(i.startsAt);
    parts.push(tgl(tanggalWib(s).tanggal, lang));
    if (i.endsAt)
      parts.push(
        `${tanggalWib(s).jam} ${TS[lang].notYet.to} ${tanggalWib(new Date(i.endsAt)).jam} WIB`,
      );
  }
  return parts.join(" · ");
}

export default function CheckIn({
  lang,
  tv,
  motion,
  link,
  enter,
  refresh,
}: {
  lang: Lang;
  tv: TestView;
  motion: Motion;
  link: SeatLink;
  enter: () => Promise<boolean>;
  refresh: () => void;
}) {
  const t = TS[lang].check;
  const c = tv.seat?.checkin ?? {};
  const step = !c.fullscreen ? 0 : !c.connection ? 1 : 2;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rtt, setRtt] = useState<number | null | false>(null);
  const [liveWait, setLiveWait] = useState(true);
  const cr = useRef(chromium());

  // Step 2: one round trip to the API (the faster of two), then the live link gets a few seconds.
  useEffect(() => {
    if (step !== 1) return;
    let off = false;
    setRtt(null);
    setLiveWait(true);
    (async () => {
      let best = Infinity;
      for (let i = 0; i < 2; i++) {
        const t0 = performance.now();
        const r = await recGet<TestView>("test");
        if (!isFail(r)) best = Math.min(best, Math.round(performance.now() - t0));
      }
      if (!off) setRtt(Number.isFinite(best) ? best : false);
    })();
    const w = setTimeout(() => !off && setLiveWait(false), 6000);
    return () => {
      off = true;
      clearTimeout(w);
    };
  }, [step]);

  async function goFullscreen() {
    setBusy(true);
    setErr(null);
    const ok = await enter();
    if (!ok) {
      setErr(t.fsFail);
      setBusy(false);
      return;
    }
    const r = await postCheckin("fullscreen");
    setBusy(false);
    if (!r.ok) return setErr(t.failed);
    refresh();
  }
  async function goConnection() {
    setBusy(true);
    setErr(null);
    const r = await postCheckin("connection", {
      rttMs: typeof rtt === "number" ? rtt : undefined,
      offsetMs: selisihJam(),
      chromium: cr.current.ok,
    });
    setBusy(false);
    if (!r.ok) return setErr(t.failed);
    refresh();
  }
  async function goName() {
    setBusy(true);
    setErr(null);
    const r = await postCheckin("name");
    setBusy(false);
    if (!r.ok) return setErr(t.failed);
    refresh();
  }

  const serverSt = rtt === null ? "wait" : rtt === false ? "warn" : "ok";
  const liveOk = link === "live";
  const liveSt = liveOk ? "ok" : liveWait && link !== "mati" ? "wait" : "warn";
  const clockSt = rtt === null ? "wait" : "ok";
  const ready = rtt !== null && rtt !== false && !(liveSt === "wait");
  const initials = tv.me.nama
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <div className="r3gate" data-m={motion}>
      <div className="panel panel--raised r3gate__card">
        <div className="stack" style={{ gap: 4 }}>
          <span className="eyebrow rec-eyebrow">{TS[lang].eyebrow}</span>
          <h1 className="r3h1">{t.title}</h1>
          <span className="hint">{roomLine(tv, lang)}</span>
        </div>
        <ol className="r3steps" aria-label={t.stepsLabel}>
          {t.steps.map((s, i) => (
            <li key={s} data-st={i < step ? "done" : i === step ? "now" : "next"}>
              <span className="r3steps__n num">
                {i < step ? <CheckIcon weight="bold" /> : i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>
        <div className="stack r3step" key={step}>
          {step === 0 && (
            <>
              <p className="lede">{t.fsLede}</p>
              <button
                type="button"
                className="btn btn--primary btn--lg"
                disabled={busy}
                onClick={goFullscreen}
              >
                {t.fsGo}
              </button>
            </>
          )}
          {step === 1 && (
            <>
              <ul className="r3chks">
                <CheckRow
                  st={serverSt}
                  title={t.server}
                  sub={rtt === null ? t.wait : rtt === false ? t.serverBad : t.serverOk(rtt)}
                />
                <CheckRow
                  st={liveSt}
                  title={t.live}
                  sub={liveOk ? t.liveOk : liveSt === "wait" ? t.waiting : t.liveBad}
                />
                <CheckRow
                  st={clockSt}
                  title={t.clock}
                  sub={
                    rtt === null ? t.waiting : t.clockOk((Math.abs(selisihJam()) / 1000).toFixed(1))
                  }
                />
                <CheckRow
                  st={cr.current.ok ? "ok" : "warn"}
                  title={t.browser}
                  sub={cr.current.ok ? t.browserOk(cr.current.name || "Chrome") : t.browserBad}
                />
              </ul>
              <button
                type="button"
                className="btn btn--primary btn--lg"
                disabled={busy || !ready}
                onClick={goConnection}
              >
                {t.next}
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <p className="lede">{t.nameLede}</p>
              <div className="r3me">
                <span className="r3me__av" aria-hidden="true">
                  {initials}
                </span>
                <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                  <b className="r3me__n">{tv.me.nama}</b>
                  <span className="hint mono">{tv.me.nim}</span>
                </div>
              </div>
              <div className="row r3gate__acts">
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => toast(t.notMeToast, "warn")}
                >
                  {t.notMe}
                </button>
                <button
                  type="button"
                  className="btn btn--primary btn--lg"
                  disabled={busy}
                  onClick={goName}
                >
                  {t.itsMe}
                </button>
              </div>
            </>
          )}
          {err && (
            <span className="field__error" role="alert">
              {err}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
