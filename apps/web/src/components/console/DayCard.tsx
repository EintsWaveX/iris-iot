/**
 * The Asisten's card on Home (Phase 10, mockup h11-home): the Konsol's day
 * strip in small, so Home and Konsol read as the same day, then one line
 * about what matters now: the running session's clock and the groups I
 * hold, my slot's open start window with its readiness, or my next slot.
 * A Waiting on You count opens the Konsol inbox.
 */
import { useEffect, useState, type ReactNode } from "react";
import Pill from "../ui/Pill";
import { getJson, href, type Me } from "../../lib/app";
import { hariIniWib, SLOT_MULAI } from "../../lib/jadwal";
import { hariLabel, kelasLabel } from "../../lib/labels";
import { useMenitWib } from "../../lib/jam";
import type { Lang } from "../../lib/kelas";
import { useSiaran } from "../../lib/siaran";
import { useTitipan } from "./seelabs/data";
import { jumlahBantuan, useBantuan } from "./HelpCard";
import DayStrip, { dayStates, WinClock, type DaySlot } from "./DayStrip";
import { D } from "./dayStrings";
import type { Beranda } from "./AsistenHome";
import "../shared/instruments.css";
import "./day.css";

export default function DayCard({
  lang,
  me,
  live,
  next,
}: {
  lang: Lang;
  me: Me;
  /** The running session's clock and groups, when one runs. */
  live: ReactNode | null;
  /** The next slot block (Home's own), shown once nothing is open today. */
  next: ReactNode;
}) {
  const d = D[lang];
  const [data, setData] = useState<Beranda | null>(null);
  const now = useMenitWib();
  const held = useTitipan();
  const bantuan = useBantuan();
  const load = () =>
    getJson<{ ok: boolean } & Beranda>("/api/session/beranda")
      .then((x) => x.ok && setData(x))
      .catch(() => {});
  useSiaran(["sesi", "jadwal", "tim", "nilai", "roster", "server", "akses", "presentasi"], load);
  useEffect(() => {
    void load();
  }, []);

  const myCode = (me.kode ?? "").toUpperCase();
  const row = (s: number) => data?.hariIni.find((r) => r.slot === s) ?? null;
  const codes = (s: number) => {
    const r = row(s);
    return r
      ? [...new Set([...r.asisten, ...(r.bantu ?? [])].map((k) => k.toUpperCase()).filter(Boolean))]
      : [];
  };
  const ada = (s: number) => row(s)?.status === "aktif" && codes(s).length > 0;
  const winOf = (s: number) => row(s)?.jendelaMulaiMenit ?? data?.jendelaDefault ?? 15;
  const mine = (s: number) =>
    codes(s).includes(myCode) || !!row(s)?.pengganti.some((p) => p.kode.toUpperCase() === myCode);
  const st = dayStates(
    [1, 2, 3, 4].map((s) => {
      const j = data?.jalan?.[String(s)];
      return {
        slot: s,
        win: winOf(s),
        kosong: !ada(s),
        jalan: j?.status === "berjalan" ? "berjalan" : j?.status === "selesai" ? "selesai" : null,
      };
    }),
    now,
  );
  const slots: DaySlot[] = [1, 2, 3, 4].map((s) => ({
    slot: s,
    state: st[s],
    mine: mine(s),
    kelas: row(s)?.kelas ?? "reguler",
    codes: codes(s),
    kosong: !ada(s),
    ran: null,
    win: winOf(s),
  }));
  // My slot with its start window open and nothing started in it yet.
  const open = [1, 2, 3, 4].find((s) => st[s] === "now" && mine(s)) ?? null;
  const waiting =
    (data?.perluNilai.length ?? 0) +
    (data?.belumKirim?.length ?? 0) +
    jumlahBantuan(bantuan.data) +
    ((held.data?.titipan.length ?? 0) > 0 ? 1 : 0);

  const konsol = href(lang, "/session");
  const ready = (() => {
    if (!data || open === null) return null;
    const r = row(open);
    let ok = 0;
    let n = 0;
    if (r && ada(open)) {
      n++;
      if (r.roster.praktikan > 0) ok++;
    }
    n += 3;
    if (data.terbuka.length) ok++;
    if (data.presentasiAktif) ok++;
    const sk = data.skemaAktif;
    if (sk) {
      n++;
      if (sk.gambar || sk.tautan) ok++;
    }
    const siap = data.server?.siap;
    if (
      siap?.lulus &&
      siap.waktu &&
      new Date(siap.waktu).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }) ===
        hariIniWib()
    )
      ok++;
    return [ok, n] as const;
  })();

  return (
    <div className="panel panel--key bridge h11card">
      <div className="row row--between">
        <span className="eyebrow lp__eyebrow">
          {d.todayEyebrow(data ? hariLabel(data.hari, lang) : "")}
        </span>
        {waiting > 0 && (
          <a className="pill pill--warn h11inbox" href={konsol}>
            {d.waiting(waiting)}
          </a>
        )}
      </div>
      {data ? (
        <DayStrip
          small
          slots={slots}
          now={now}
          sel={open}
          onPick={() => location.assign(konsol)}
          me={myCode}
          nameOf={(k) => k}
          lang={lang}
        />
      ) : (
        <span className="skeleton" style={{ height: 64 }} />
      )}
      {live ??
        (open !== null ? (
          <div className="bridge__top">
            <WinClock now={now} slot={open} win={winOf(open)} lang={lang} size={92} />
            <div className="stack stack--sm">
              <div className="row" style={{ gap: 8 }}>
                <Pill tone="ok">{d.windowOpen}</Pill>
                <Pill>
                  Slot {open} · {SLOT_MULAI[open]}
                </Pill>
                {row(open)?.kelas === "internasional" && (
                  <Pill tone="violet">{kelasLabel("internasional", lang)}</Pill>
                )}
              </div>
              <h2 className="home__h2">{d.canStartNow}</h2>
              {ready && <span className="hint">{d.readyLine(ready[0], ready[1])}</span>}
            </div>
          </div>
        ) : (
          next
        ))}
      <div className="panel__actions">
        <a className="btn btn--inverse btn--lg" href={konsol}>
          {live ? d.openBoard : d.openConsole}
        </a>
        <a className="btn btn--lg" href={href(lang, "/schedule")}>
          {d.schedule}
        </a>
      </div>
    </div>
  );
}
