/**
 * The landing hero (Phase 8), role-aware:
 * - signed out: the brand line and "Masuk";
 * - praktikan: "Lanjutkan Modul N" with the time left when a session runs;
 * - asisten: the running session, or their next scheduled slot (day, time,
 *   class, which groups) from the schedule, leading into the console.
 */
import { useEffect, useState } from "react";
import { ArrowRight, CalendarClock, LayoutDashboard, LogIn, MonitorPlay } from "lucide-react";
import {
  getJson,
  href,
  KELOMPOK_NAMA,
  MODUL_NAMA,
  menitBerjalan,
  useMe,
  useSessionNow,
  useTick,
} from "../../lib/app";
import { hariIniWib, SESI_CAP_MENIT, SLOT_MULAI } from "../../lib/jadwal";
import { slotBerikutnya, type BarisJadwal, type SlotBerikutnya } from "../../lib/jadwal-next";
import { hariDariTanggal, semesterDariTanggal } from "../../lib/jadwal-parser";
import type { Lang } from "../../lib/kelas";
import "./HomeHero.css";

const T = {
  id: {
    eyebrow: "Praktikum IoT · Laboratorium IRIS",
    title: ["Empat modul.", "Satu papan."],
    lede: "BLE, WebSocket, MQTT, dan LoRa: satu tempat untuk jurnal, jadwal sesi, dan papan skor praktikum IoT IRIS.",
    masuk: "Masuk",
    browse: "Lihat modul",
    running: (m: number) => `Sesi berjalan · Modul ${m}`,
    left: (m: number) => `sisa ${m} menit`,
    lanjut: (m: number) => `Lanjutkan Modul ${m}`,
    dasbor: "Dasbor",
    noSession: "Belum ada sesi berjalan. Modul yang sudah dibuka bisa kamu pelajari dulu.",
    kelompok: (k: number) => `Kelompok ${k}`,
    next: "Sesi berikutnya",
    today: "hari ini",
    tomorrow: "besok",
    inDays: (n: number) => `${n} hari lagi`,
    nowRunning: "sedang berlangsung",
    groups: (g: number[]) => (g.length ? `Kelompok ${g.join(", ")}` : "Pengganti"),
    inter: "Internasional",
    reguler: "Reguler",
    konsol: "Buka konsol",
    noSlot: "Tidak ada jadwal mengajar minggu ini.",
    hari: ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"],
  },
  en: {
    eyebrow: "IoT Practicum · IRIS Laboratory",
    title: ["Four modules.", "One board."],
    lede: "BLE, WebSocket, MQTT and LoRa: one place for the journals, the session schedule and the scoreboard of the IRIS IoT practicum.",
    masuk: "Sign in",
    browse: "Browse modules",
    running: (m: number) => `Session running · Module ${m}`,
    left: (m: number) => `${m} min left`,
    lanjut: (m: number) => `Continue Module ${m}`,
    dasbor: "Dashboard",
    noSession: "No session is running yet. You can study the modules that are already open.",
    kelompok: (k: number) => `Group ${k}`,
    next: "Next session",
    today: "today",
    tomorrow: "tomorrow",
    inDays: (n: number) => `in ${n} days`,
    nowRunning: "happening now",
    groups: (g: number[]) => (g.length ? `Group ${g.join(", ")}` : "Substitute"),
    inter: "International",
    reguler: "Regular",
    konsol: "Open console",
    noSlot: "No teaching slots this week.",
    hari: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  },
};

function menitWib(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const g = (k: string) => Number(parts.find((p) => p.type === k)?.value ?? 0);
  return g("hour") * 60 + g("minute");
}

export default function HomeHero({ lang }: { lang: Lang }) {
  const t = T[lang];
  const me = useMe();
  const now = useSessionNow(30_000, Boolean(me));
  useTick(30_000);
  const [next, setNext] = useState<SlotBerikutnya | null | undefined>(undefined);

  useEffect(() => {
    if (me?.role !== "asisten") return;
    const today = hariIniWib();
    getJson<{ ok: boolean; jadwal: BarisJadwal[] }>(
      `/api/session/schedule?semester=${semesterDariTanggal(today)}`,
    )
      .then((d) =>
        setNext(
          d.ok ? slotBerikutnya(d.jadwal, me.kode ?? "", hariDariTanggal(today), menitWib()) : null,
        ),
      )
      .catch(() => setNext(null));
  }, [me]);

  const s = now.data;
  const menit = s ? menitBerjalan(s.mulaiPada) : 0;
  const sisa = Math.max(0, SESI_CAP_MENIT - menit);

  let card = null;
  if (me?.role === "praktikan") {
    const k = me.kelompok ?? 0;
    card = (
      <div
        className="hhero__card sweep-edge"
        style={{ "--g": `var(--group-${k || 1})` } as React.CSSProperties}
      >
        <span className="hhero__who">
          <span className="hhero__dot" aria-hidden="true" />
          {t.kelompok(k)}
          {KELOMPOK_NAMA[k] ? ` · ${KELOMPOK_NAMA[k]}` : ""}
        </span>
        {s ? (
          <>
            <b className="hhero__cardtitle">
              {t.running(s.modul)} · {MODUL_NAMA[s.modul]}
            </b>
            <span className="hhero__track" aria-hidden="true">
              <span style={{ width: `${Math.min(100, (menit / SESI_CAP_MENIT) * 100)}%` }} />
            </span>
            <span className="hint num">{t.left(sisa)}</span>
            <div className="hhero__actions">
              <a
                className="btn btn--primary btn--lg"
                href={href(lang, `/modules/${s.modul}?step=code`)}
              >
                {t.lanjut(s.modul)} <ArrowRight size={18} aria-hidden="true" />
              </a>
              <a className="btn btn--ghost btn--lg" href={href(lang, "/dashboard")}>
                <LayoutDashboard size={18} aria-hidden="true" />
                {t.dasbor}
              </a>
            </div>
          </>
        ) : (
          <>
            <span className="hint">{t.noSession}</span>
            <div className="hhero__actions">
              <a className="btn btn--primary btn--lg" href={href(lang, "/dashboard")}>
                <LayoutDashboard size={18} aria-hidden="true" />
                {t.dasbor}
              </a>
            </div>
          </>
        )}
      </div>
    );
  } else if (me?.role === "asisten") {
    card = (
      <div className="hhero__card sweep-edge">
        {s ? (
          <>
            <span className="hhero__who">
              <span className="dot dot--ok dot--pulse" aria-hidden="true" />
              {t.running(s.modul)}
            </span>
            <b className="hhero__cardtitle">{MODUL_NAMA[s.modul]}</b>
            <span className="hint num">{t.left(sisa)}</span>
          </>
        ) : (
          <>
            <span className="hhero__who">
              <CalendarClock size={16} aria-hidden="true" />
              {t.next}
            </span>
            {next === undefined ? (
              <span className="skeleton" style={{ height: 48 }} />
            ) : next ? (
              <>
                <b className="hhero__cardtitle">
                  {t.hari[next.hari]} · {SLOT_MULAI[next.slot]}
                </b>
                <span className="hhero__meta">
                  <span className="pill pill--accent">
                    {next.sedangBerjalan
                      ? t.nowRunning
                      : next.hariLagi === 0
                        ? t.today
                        : next.hariLagi === 1
                          ? t.tomorrow
                          : t.inDays(next.hariLagi)}
                  </span>
                  <span className={`pill ${next.kelas === "internasional" ? "pill--gold" : ""}`}>
                    {next.kelas === "internasional" ? t.inter : t.reguler}
                  </span>
                  <span className="pill pill--mono">{t.groups(next.kelompok)}</span>
                </span>
              </>
            ) : (
              <span className="hint">{t.noSlot}</span>
            )}
          </>
        )}
        <div className="hhero__actions">
          <a className="btn btn--primary btn--lg" href={href(lang, "/session")}>
            <MonitorPlay size={18} aria-hidden="true" />
            {t.konsol}
          </a>
        </div>
      </div>
    );
  }

  return (
    <section className="hhero">
      <p className="eyebrow eyebrow--accent">{t.eyebrow}</p>
      <h1 className="hhero__title">
        {t.title[0]}
        <br />
        {t.title[1]}
      </h1>
      <p className="hhero__lede">{t.lede}</p>
      {me === undefined ? (
        <span className="skeleton" style={{ height: 56, maxWidth: 320 }} />
      ) : me === null ? (
        <div className="hhero__actions">
          <button
            type="button"
            className="btn btn--primary btn--lg"
            onClick={() => window.LoginDialog?.open()}
          >
            <LogIn size={18} aria-hidden="true" />
            {t.masuk}
          </button>
          <a className="btn btn--ghost btn--lg" href={href(lang, "/modules")}>
            {t.browse}
          </a>
        </div>
      ) : (
        card
      )}
    </section>
  );
}
