/**
 * Asisten home (P8.6): what /session shows while no session runs.
 *
 * - today's four slots from the schedule (done, now, next), each one a
 *   shortcut that fills the start form
 * - "Mulai sesi": date (our own calendar), slot, module and class, all
 *   prefilled from the schedule and the WIB clock, plus the Module 4
 *   hotspot option; resuming an ended session goes through a real dialog
 * - "Jadwal saya": this assistant's week, by their code
 * - "Umpan balik saya" (only theirs) and the Lab summary (everyone's)
 * - a reminder while the starting password is still in use
 * - "Siapkan sebelum mulai" opens Persiapan without a session
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  CalendarClock,
  CalendarRange,
  KeyRound,
  ListChecks,
  MessageSquareHeart,
  Play,
  Sparkles,
} from "lucide-react";
import { Checkbox, DatePicker } from "../ui/Controls";
import Confirm from "../ui/Confirm";
import FeedbackSummary from "../shared/FeedbackSummary";
import { getJson, href, postJson, type Me } from "../../lib/app";
import { hariIniWib, SLOT_MULAI } from "../../lib/jadwal";
import { hariDariTanggal, semesterDariTanggal } from "../../lib/jadwal-parser";
import type { Kelas, Lang } from "../../lib/kelas";
import type { Ringkasan } from "../../lib/umpan-balik";
import { pesan, type Strings } from "./strings";

interface JadwalRow {
  hari: number;
  slot: number;
  kelas: Kelas;
  status: "aktif" | "segera";
  asisten: string[];
}

function slotSekarang(): number {
  const jam = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
  if (jam < 8) return 1;
  if (jam < 11) return 2;
  if (jam < 14) return 3;
  return 4;
}

function menitSekarangWib(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const g = (k: string) => Number(parts.find((p) => p.type === k)?.value ?? 0);
  return g("hour") * 60 + g("minute");
}

function slotStatus(slot: number, isToday: boolean): "done" | "now" | "next" | "later" {
  if (!isToday) return "later";
  const [h, m] = SLOT_MULAI[slot].split(":").map(Number);
  const start = h * 60 + m;
  const now = menitSekarangWib();
  if (now >= start + 150) return "done";
  if (now >= start - 30) return "now";
  return "next";
}

export default function AsistenHome({
  t,
  lang,
  me,
  onStarted,
  onPrep,
}: {
  t: Strings;
  lang: Lang;
  me: Me;
  onStarted: () => void;
  onPrep: () => void;
}) {
  const today = hariIniWib();
  const [tanggal, setTanggal] = useState(today);
  const [slot, setSlot] = useState(slotSekarang());
  const [modul, setModul] = useState(1);
  const [kelasPilih, setKelasPilih] = useState<Kelas | "auto">("auto");
  const [butuhAp, setButuhAp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resume, setResume] = useState<number | null>(null);
  const [jadwal, setJadwal] = useState<JadwalRow[] | null>(null);
  const [mine, setMine] = useState<Ringkasan | null>(null);
  const [lab, setLab] = useState<Ringkasan | null>(null);

  useEffect(() => {
    getJson<{ ok: boolean; jadwal: JadwalRow[] }>(
      `/api/session/schedule?semester=${semesterDariTanggal(today)}`,
    )
      .then((d) => setJadwal(d.ok ? d.jadwal : []))
      .catch(() => setJadwal([]));
    getJson<{ ok: boolean; ringkasan: Ringkasan }>("/api/session/feedback?scope=mine")
      .then((d) => d.ok && setMine(d.ringkasan))
      .catch(() => {});
    getJson<{ ok: boolean; ringkasan: Ringkasan }>("/api/session/feedback?scope=lab")
      .then((d) => d.ok && setLab(d.ringkasan))
      .catch(() => {});
  }, [today]);

  const hari = hariDariTanggal(tanggal);
  const hariIni = hariDariTanggal(today);
  const row = (h: number, s: number) => jadwal?.find((j) => j.hari === h && j.slot === s) ?? null;
  const picked = row(hari, slot);
  const kelasJadwal: Kelas = picked?.kelas ?? "reguler";
  const kelas: Kelas = kelasPilih === "auto" ? kelasJadwal : kelasPilih;
  const myCode = (me.kode ?? "").toUpperCase();
  const mySlots = useMemo(
    () => (jadwal ?? []).filter((j) => j.asisten.some((k) => k.toUpperCase() === myCode)),
    [jadwal, myCode],
  );

  async function start() {
    setBusy(true);
    try {
      const d = await postJson<{
        ok: boolean;
        kode?: string;
        ditugaskan?: number;
        sesiLama?: { id: number; status: string; bisaDilanjutkan: boolean } | null;
      }>("/api/session", {
        tanggal,
        slot,
        modul,
        butuhAp: modul === 4 && butuhAp,
        ...(kelasPilih === "auto" ? {} : { kelas: kelasPilih }),
      });
      if (d.ok) {
        window.Toast?.show(d.ditugaskan ? t.startedAssign(d.ditugaskan) : t.started, "ok");
        onStarted();
        return;
      }
      if (d.kode === "sudah_ada" && d.sesiLama?.status === "berjalan") {
        window.Toast?.show(t.alreadyRunning, "info");
        onStarted();
      } else if (d.kode === "sudah_ada" && d.sesiLama?.bisaDilanjutkan) {
        setResume(d.sesiLama.id);
      } else window.Toast?.show(pesan(t, d.kode), "danger");
    } catch {
      window.Toast?.show(t.fail, "danger");
    } finally {
      setBusy(false);
    }
  }

  const statusLabel = { done: t.slotDone, now: t.slotNow, next: t.slotNext, later: "" };

  return (
    <div className="home">
      <header className="home__hero rise">
        <span className="label-caps">{t.homeTitle}</span>
        <h1 className="home__title">{t.homeGreet(me.kode || me.nama.split(" ")[0])}</h1>
        <p className="hint home__sub">{t.homeSub}</p>
      </header>

      {me.perluAturSandi && (
        <a className="home__pw rise" href={href(lang, "/account")}>
          <KeyRound size={20} aria-hidden="true" />
          <span className="grow stack" style={{ gap: 2 }}>
            <b>{t.pwReminder}</b>
            <span className="hint">{t.pwReminderBody}</span>
          </span>
          <span className="btn btn--secondary btn--sm">{t.pwGo}</span>
        </a>
      )}

      <section className="home__today rise" aria-label={t.today}>
        <div className="panel__head">
          <h2 className="panel__title">
            <CalendarClock size={18} aria-hidden="true" /> {t.today} · {t.hari[hariIni]}
          </h2>
          <a className="btn btn--ghost btn--sm" href={href(lang, "/schedule")}>
            <CalendarRange size={16} aria-hidden="true" /> {t.mySchedule}
          </a>
        </div>
        <div className="slots">
          {[1, 2, 3, 4].map((s) => {
            const r = row(hariIni, s);
            const st = slotStatus(s, true);
            const has = r && r.status === "aktif" && r.asisten.length > 0;
            const soon = r?.status === "segera";
            return (
              <button
                key={s}
                type="button"
                className="slot sweep-hover"
                data-state={st}
                data-empty={has ? undefined : "yes"}
                aria-current={tanggal === today && slot === s}
                onClick={() => {
                  setTanggal(today);
                  setSlot(s);
                  setKelasPilih("auto");
                }}
              >
                <span className="slot__time num">{SLOT_MULAI[s]}</span>
                <span className="slot__label">
                  {t.slot(s)}
                  {st !== "later" && (
                    <span className={`slot__state slot__state--${st}`}>{statusLabel[st]}</span>
                  )}
                </span>
                {has ? (
                  <span className="slot__codes">
                    {r!.asisten.map((k) => (
                      <span
                        key={k}
                        className="code-badge"
                        data-me={k.toUpperCase() === myCode ? "yes" : undefined}
                      >
                        {k}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="hint">{soon ? t.slotSoon : t.slotNone}</span>
                )}
                {r?.kelas === "internasional" && <span className="pill pill--gold">INTER</span>}
              </button>
            );
          })}
        </div>
      </section>

      <div className="home__grid">
        <section className="panel panel--raised home__start rise">
          <div className="panel__head">
            <div className="stack stack--sm">
              <h2 className="panel__title">
                <Play size={18} aria-hidden="true" /> {t.startTitle}
              </h2>
              <p className="panel__sub">{t.startSub}</p>
            </div>
          </div>

          <div className="start__row">
            <DatePicker value={tanggal} onChange={setTanggal} label={t.date} lang={lang} />
            <div className="ctl-field">
              <span className="ctl-field__label">{t.kelasLabel}</span>
              <div className="seg seg--wide" role="radiogroup" aria-label={t.kelasLabel}>
                {(["auto", "reguler", "internasional"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={kelasPilih === k}
                    aria-pressed={kelasPilih === k}
                    onClick={() => setKelasPilih(k)}
                  >
                    {k === "auto" ? t.kelasAutoShort : t.kelas[k]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="ctl-field">
            <span className="ctl-field__label">{t.slotLabel}</span>
            <div className="start__slots" role="radiogroup" aria-label={t.slotLabel}>
              {[1, 2, 3, 4].map((s) => {
                const r = row(hari, s);
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={slot === s}
                    className="start__slot"
                    onClick={() => setSlot(s)}
                  >
                    <b>{t.slot(s)}</b>
                    <span className="num hint">{SLOT_MULAI[s]}</span>
                    {r?.kelas === "internasional" && <span className="pill pill--gold">INTER</span>}
                  </button>
                );
              })}
            </div>
            <span className="hint">
              {picked && picked.asisten.length
                ? t.fromSchedule(picked.asisten.join(" "))
                : t.notScheduled}
              {" · "}
              {t.kelas[kelas]}
              {kelasPilih === "auto" ? ` (${t.kelasAuto})` : ""}
              {" · "}
              {t.kelasLang[kelas]}
            </span>
          </div>

          <div className="ctl-field">
            <span className="ctl-field__label">{t.modulLabel}</span>
            <div className="start__mods" role="radiogroup" aria-label={t.modulLabel}>
              {[1, 2, 3, 4].map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={modul === m}
                  className="start__mod sweep-hover"
                  style={{ "--mod-hue": `var(--mod-${m})` } as CSSProperties}
                  onClick={() => setModul(m)}
                >
                  <span className="start__mod-n">M{m}</span>
                  <span className="start__mod-name">{t.modulNama(m)}</span>
                </button>
              ))}
            </div>
          </div>

          {modul === 4 && (
            <Checkbox checked={butuhAp} onChange={setButuhAp} label={t.apLabel} hint={t.apHint} />
          )}

          <button
            type="button"
            className="btn btn--primary btn--lg home__go"
            disabled={busy}
            data-loading={busy ? "yes" : undefined}
            onClick={() => void start()}
          >
            <Play size={20} aria-hidden="true" />
            <span className="btn__label">{t.startBtn}</span>
            <span className="btn__spinner" aria-hidden="true" />
          </button>
        </section>

        <div className="home__side">
          <section className="panel rise">
            <div className="panel__head">
              <div className="stack stack--sm">
                <h2 className="panel__title">
                  <ListChecks size={18} aria-hidden="true" /> {t.prepEarly}
                </h2>
                <p className="panel__sub">{t.prepEarlySub}</p>
              </div>
              <button type="button" className="btn btn--secondary" onClick={onPrep}>
                {t.openPrep}
              </button>
            </div>
          </section>

          <section className="panel rise">
            <div className="panel__head">
              <h2 className="panel__title">
                <CalendarRange size={18} aria-hidden="true" /> {t.mySchedule}
              </h2>
              {mySlots.length > 0 && <span className="hint">{t.mySlots(mySlots.length)}</span>}
            </div>
            {jadwal === null ? (
              <span className="skeleton" style={{ height: 80 }} />
            ) : mySlots.length === 0 ? (
              <p className="hint">{t.myScheduleEmpty(myCode || "?")}</p>
            ) : (
              <ul className="myweek">
                {mySlots.map((j) => (
                  <li
                    key={`${j.hari}-${j.slot}`}
                    data-today={j.hari === hariIni ? "yes" : undefined}
                  >
                    <b>{t.hari[j.hari]}</b>
                    <span className="num">
                      {t.slot(j.slot)} · {SLOT_MULAI[j.slot]}
                    </span>
                    {j.kelas === "internasional" && <span className="pill pill--gold">INTER</span>}
                    <span className="grow" />
                    <span className="hint">
                      K{j.asisten.findIndex((k) => k.toUpperCase() === myCode) + 1}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel rise">
            <div className="panel__head">
              <div className="stack stack--sm">
                <h2 className="panel__title">
                  <MessageSquareHeart size={18} aria-hidden="true" /> {t.myFeedback}
                </h2>
                <p className="panel__sub">{t.myFeedbackSub}</p>
              </div>
            </div>
            <FeedbackSummary
              data={mine}
              lang={lang}
              empty={t.myFeedbackEmpty}
              countLabel={t.ratings}
            />
          </section>

          <section className="panel rise">
            <div className="panel__head">
              <div className="stack stack--sm">
                <h2 className="panel__title">
                  <Sparkles size={18} aria-hidden="true" /> {t.labFeedback}
                </h2>
                <p className="panel__sub">{t.labFeedbackSub}</p>
              </div>
            </div>
            <FeedbackSummary
              data={lab}
              lang={lang}
              empty={t.myFeedbackEmpty}
              countLabel={t.ratings}
              maxComments={2}
            />
          </section>
        </div>
      </div>

      <Confirm
        open={resume !== null}
        onOpenChange={(o) => !o && setResume(null)}
        title={t.resumeTitle}
        body={resume !== null ? t.resumeBody(resume) : ""}
        confirmLabel={t.resume}
        tone="primary"
        lang={lang}
        onConfirm={async () => {
          const r = await postJson<{ ok: boolean; kode?: string }>("/api/session/lanjutkan", {
            sesiId: resume,
          }).catch(() => ({ ok: false, kode: undefined }));
          if (!r.ok) {
            window.Toast?.show(pesan(t, r.kode), "danger");
            return false;
          }
          window.Toast?.show(t.resumed, "ok");
          onStarted();
        }}
      />
    </div>
  );
}
