/**
 * Check-in on /recruitment/test (mockup r3-checkin, EXAM-ENGINE 5.5): one
 * card, no steps. The checks start on their own (the name first, then the
 * server round trip, the live link, the laptop clock and the lab PC's C
 * judge), so nobody presses Lanjut to learn the server answered. One press
 * then asks for full screen, which the browser only allows from a click, and
 * records the three steps (fullscreen, connection, name) the console's seat
 * tile fills its dots from. A failed server check stops the button and
 * offers Coba Lagi; the judge and the browser only warn.
 */
import { useEffect, useRef, useState } from "react";
import { ArrowsOutIcon, HandWavingIcon, WarningIcon, WifiHighIcon } from "@phosphor-icons/react";
import type { Lang } from "../../../lib/kelas";
import { selisihJam } from "../../../lib/jam";
import { isFail, recGet } from "../../../lib/recruitment/client";
import type { SeatLink } from "../../../lib/recruitment/seat-client";
import type { TestView } from "../../../lib/recruitment/seat-types";
import { tanggalWib } from "../../../lib/recruitment/gates";
import { screenCount } from "../../../lib/recruitment/seat-lockdown";
import { tgl } from "../shared";
import { CheckRow, type Motion } from "./parts";
import { postCheckin, toast } from "./seatApi";
import { TS } from "./testStrings";

/** The lab computers run Chrome; anything else only gets a warning row */
function chromium(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } };
  const brands = nav.userAgentData?.brands?.map((b) => b.brand) ?? [];
  return brands.length
    ? brands.some((b) => /chrom|edge/i.test(b) && !/not/i.test(b))
    : /Chrome\/|Edg\//.test(navigator.userAgent);
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rtt, setRtt] = useState<number | null | false>(null);
  const [liveWait, setLiveWait] = useState(true);
  const [round, setRound] = useState(0);
  const okBrowser = useRef(chromium());
  // A second screen counts as a violation during the test, so say so before it starts. Read in an
  // effect, not in the first render, so the server's page and the browser's agree; a browser that
  // cannot tell (Firefox, Safari) gets no row at all.
  const [screens, setScreens] = useState<"one" | "more" | "unknown">("unknown");
  useEffect(() => {
    const read = () => setScreens(screenCount(window.screen as { isExtended?: boolean }));
    read();
    const id = setInterval(read, 1000);
    return () => clearInterval(id);
  }, []);

  // One round trip to the API (the faster of two); the live link gets a few seconds.
  useEffect(() => {
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
  }, [round]);

  const serverSt = rtt === null ? "wait" : rtt === false ? "bad" : "ok";
  const liveOk = link === "live";
  // The live channel belongs to a seat, and the seat is made by the first check-in: until then there is
  // nothing to connect, which is not a fault (2026-11-07: it showed "Belum tersambung" as a warning).
  const noSeat = tv.seat === null;
  const liveSt = liveOk ? "ok" : noSeat ? "todo" : liveWait && link !== "mati" ? "wait" : "warn";
  const clockSt = rtt === null ? "wait" : "ok";
  const judgeSt = rtt === null ? "wait" : tv.judge ? "ok" : "warn";
  const failed = rtt === false;
  const ready = rtt !== null && rtt !== false && liveSt !== "wait";
  const hero = failed ? "gagal" : ready ? "nama" : "sambungan";

  // One press: full screen (needs this click), then the three steps the server keeps.
  async function masuk() {
    setBusy(true);
    setErr(null);
    try {
      // The room may have changed under the page (opened, finished): say which, and reload it.
      const gagal = (kode: string) => {
        setErr(TS[lang].reason[kode] ?? t.failed);
        if (kode in TS[lang].reason) refresh();
      };
      if (!c.fullscreen) {
        if (!(await enter())) return setErr(t.fsFail);
        const f = await postCheckin("fullscreen");
        if (!f.ok) return gagal(f.kode);
      }
      if (!c.connection) {
        const r = await postCheckin("connection", {
          rttMs: typeof rtt === "number" ? rtt : undefined,
          offsetMs: selisihJam(),
          chromium: okBrowser.current,
        });
        if (!r.ok) return gagal(r.kode);
      }
      const n = await postCheckin("name");
      if (!n.ok) return gagal(n.kode);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="r3gate" data-m={motion}>
      <div className="panel panel--raised r3gate__card r3gate__card--check">
        <div className="n7t-gatehead">
          <span className="n7t-hero" data-s={hero} key={hero} aria-hidden="true">
            <i />
            <i />
            {failed ? (
              <WarningIcon size={30} />
            ) : ready ? (
              <ArrowsOutIcon size={30} />
            ) : (
              <WifiHighIcon size={30} />
            )}
          </span>
          <div className="stack" style={{ gap: 4, minWidth: 0 }}>
            <span className="eyebrow rec-eyebrow">{TS[lang].eyebrow}</span>
            <h1 className="r3h1">{t.title}</h1>
            <span className="hint">{roomLine(tv, lang)}</span>
          </div>
        </div>
        <ul className="r3chks" aria-label={t.checksLabel}>
          <CheckRow
            st="ok"
            title={tv.me.nama}
            sub={tv.me.nim}
            act={
              <button
                type="button"
                className="r3chk__act"
                onClick={() => toast(t.notMeToast, "warn")}
              >
                {t.notMe}
              </button>
            }
          />
          <CheckRow
            st={serverSt}
            title={t.server}
            sub={rtt === null ? t.wait : rtt === false ? t.serverDown : t.serverOk(rtt)}
          />
          <CheckRow
            st={liveSt}
            title={t.live}
            sub={
              liveOk ? t.liveOk : noSeat ? t.liveLater : liveSt === "wait" ? t.waiting : t.liveBad
            }
          />
          <CheckRow
            st={clockSt}
            title={t.clock}
            sub={rtt === null ? t.waiting : t.clockOk((Math.abs(selisihJam()) / 1000).toFixed(1))}
          />
          {!okBrowser.current && <CheckRow st="warn" title={t.browser} sub={t.browserBad} />}
          {screens !== "unknown" && (
            <CheckRow
              st={screens === "more" ? "warn" : "ok"}
              title={t.screens}
              sub={screens === "more" ? t.screensBad : t.screensOk}
            />
          )}
          <CheckRow
            st={judgeSt}
            title={t.judge}
            sub={rtt === null ? t.waiting : tv.judge ? t.judgeOk : t.judgeBad}
          />
        </ul>
        <div className="stack">
          <div className="row r3gate__help">
            <span className="hint">{t.help}</span>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => toast(t.callToast, "warn")}
            >
              <HandWavingIcon size={16} aria-hidden="true" />
              <span className="btn__label">{t.callAsisten}</span>
            </button>
          </div>
          <span className="hint">{t.fsNote}</span>
          {err && (
            <span className="field__error" role="alert">
              {err}
            </span>
          )}
          {failed ? (
            <button
              type="button"
              className="btn btn--primary btn--lg"
              onClick={() => setRound((n) => n + 1)}
            >
              {t.retry}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--primary btn--lg"
              disabled={busy || !ready}
              onClick={() => void masuk()}
            >
              {ready ? t.enter : t.checking}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
