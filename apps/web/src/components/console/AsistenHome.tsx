/**
 * Console home (Phase 9 Stage 3, mockup c-home): what /session shows while
 * no session runs.
 *
 * - Today: the four slots (Done, Now, Next) with their assistants, and the
 *   Asisten's own week as a strip under them. Picking a slot fills Start.
 * - Session Preparation: what is ready for the picked slot (roster, open
 *   modules, active slides, the server's last Ready check), and the way in.
 * - Start a Session: the picked slot inside its start window, or a
 *   Praktikum Susulan with its own date and time (Pengelola and Admin).
 *   Outside the window the form becomes an info block that says why and
 *   when, and the slot's own Asisten can change its window (5 to 30
 *   minutes). Class type, length (30 to 150) and module (closed ones are
 *   off) come next; Start is pinned to the card bottom.
 * - Still Needs Scores, Earnings This Month (Stage 6) and Feedback for You
 *   on the right.
 *
 * The server enforces every rule shown here (api/session/index.ts and
 * src/lib/sesi-mulai.ts); this page only explains them ahead of time.
 */
import HelpCard from "./HelpCard";
import StartCheck, { type BelumSiap } from "./StartCheck";
import { EarningsMini } from "../bayar/Earnings";
import { useTitipan } from "./seelabs/data";
import { SL } from "./seelabs/strings";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  CalendarBlankIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckCircleIcon,
  ClockCountdownIcon,
  HourglassHighIcon,
  ListChecksIcon,
  LockSimpleIcon,
  PencilSimpleIcon,
  PlayIcon,
  ProhibitIcon,
  UsersThreeIcon,
  WarningIcon,
  ArrowRightIcon,
} from "@phosphor-icons/react";
import { Checkbox, DateField, Stepper, Switch, TimeField } from "../ui/Controls";
import Confirm from "../ui/Confirm";
import Dropdown from "../ui/Dropdown";
import Fade from "../ui/Fade";
import IconButton from "../ui/IconButton";
import Pill from "../ui/Pill";
import Popover from "../ui/Popover";
import SegmentedControl from "../ui/SegmentedControl";
import Tooltip from "../ui/Tooltip";
import {
  getJson,
  href,
  jamMenit,
  localeOf,
  postJson,
  tanggalPanjang,
  type Me,
} from "../../lib/app";
import { hariIniWib, SESI_CAP_MENIT, SESI_MIN_MENIT, SLOT_MULAI } from "../../lib/jadwal";
import { hariDariTanggal } from "../../lib/jadwal-parser";
import {
  durasiLabel,
  hariLabel,
  kelasLabel,
  kelompokLabel,
  menitLabel,
  modulLabel,
} from "../../lib/labels";
import { useDirektori } from "../../lib/people";
import {
  jamDariMenit,
  jendelaSlot,
  menitDariJam,
  menitSekarangWib,
  JENDELA_MAX,
  JENDELA_MIN,
} from "../../lib/sesi-mulai";
import type { Kelas, Lang } from "../../lib/kelas";
import type { Ringkasan } from "../../lib/umpan-balik";
import { pesan, type Strings } from "./strings";
import { H, type Hx } from "./homeStrings";
import type { PrepTab } from "./PrepView";
import { useSiaran } from "../../lib/siaran";

interface SlotHariIni {
  slot: number;
  kelas: Kelas;
  /** Today's status: a holiday or No Practicum shows here too (Phase 9). */
  status: "aktif" | "segera" | "libur" | "kosong";
  /** One code per group today ("" for an open seat). */
  asisten: string[];
  /** Covers and volunteers helping without a group, and who is excused. */
  bantu?: string[];
  izin?: string[];
  pengganti: { kode: string }[];
  jumlahKelompok: number;
  jendelaMulaiMenit: number | null;
  jendelaDiaturOleh: string | null;
  roster: { kelompok: number; praktikan: number };
}

export interface Beranda {
  tanggal: string;
  hari: number;
  jendelaDefault: number;
  hariIni: SlotHariIni[];
  mingguSaya: { hari: number; slot: number; kelas: Kelas; kelompok: number[] }[];
  terbuka: number[];
  presentasiAktif: { nama: string; jenis: string } | null;
  server: {
    id: number;
    nama: string;
    denyutPada: string | null;
    siap: { lulus: boolean; gagal: number; waktu: string | null } | null;
  } | null;
  perluNilai: {
    sesiId: number;
    modul: number;
    tanggal: string;
    slot: number | null;
    mulai: string;
    kelompok: { nomor: number; tanpaNilai: number }[];
  }[];
}

type SlotState = "done" | "now" | "next" | "later";

const DURASI_CEPAT = [60, 90, 120, 150];

/** "1, 2 dan 3" in the page language. */
function daftar(items: string[], and: string): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]}`;
}

interface Draf {
  id: number;
  tanggal: string;
  mulai: string;
  modul: number;
  jumlahKelompok: number;
  praktikan: number;
}

export default function AsistenHome({
  t,
  lang,
  me,
  onStarted,
  onPrep,
  onHeld,
}: {
  t: Strings;
  lang: Lang;
  me: Me;
  onStarted: () => void;
  /** Opens Preparation on the roster Start has picked ("2-1": Selasa,
   *  slot 1), or with no pick for a makeup session. */
  onPrep: (pilih: string | null, tab?: PrepTab) => void;
  /** Opens Kirim ke SeeLabs on "Titipan" (scores held for my account). */
  onHeld: () => void;
}) {
  const h = H[lang];
  const held = useTitipan();
  const heldN = held.data?.titipan.length ?? 0;
  const dir = useDirektori();
  const [data, setData] = useState<Beranda | null>(null);
  const [mine, setMine] = useState<Ringkasan | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const [susulan, setSusulan] = useState(false);
  const [susTanggal, setSusTanggal] = useState(hariIniWib());
  const [susJam, setSusJam] = useState("13:00");
  const [kelas, setKelas] = useState<Kelas>("reguler");
  const [durasi, setDurasi] = useState(SESI_CAP_MENIT);
  const [modul, setModul] = useState<number | null>(null);
  const [butuhAp, setButuhAp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resume, setResume] = useState<number | null>(null);
  const [belum, setBelum] = useState<BelumSiap | null>(null);
  // Susulan drafts made in Preparation, Roster (2026-10-06): starting one
  // brings its roster. Before this Home could only start an empty susulan.
  const [drafts, setDrafts] = useState<Draf[] | null>(null);
  const [draf, setDraf] = useState<number | "baru">("baru");
  const [menitNow, setMenitNow] = useState(() => menitSekarangWib());
  // A closed module picked in Start: say so and offer Module Access.
  const [tutup, setTutup] = useState<number | null>(null);

  const load = () =>
    getJson<{ ok: boolean } & Beranda>("/api/session/beranda")
      .then((d) => d.ok && setData(d))
      .catch(() => {});
  useSiaran(["sesi", "jadwal", "tim", "akses", "server", "roster"], load);

  useEffect(() => {
    void load();
    getJson<{ ok: boolean; ringkasan: Ringkasan }>("/api/session/feedback?scope=mine")
      .then((d) => d.ok && setMine(d.ringkasan))
      .catch(() => {});
    const id = setInterval(() => setMenitNow(menitSekarangWib()), 30_000);
    return () => clearInterval(id);
  }, []);

  const penuh = me.hak?.pair === true;

  const muatDraf = (pilihUlang: boolean) =>
    getJson<{ ok: boolean; draf: Draf[] }>("/api/session/susulan")
      .then((d) => {
        if (!d.ok) return;
        setDrafts(d.draf);
        if (!pilihUlang) return;
        // The first draft with people in it, else a new one.
        const pilih = d.draf.find((x) => x.praktikan > 0) ?? null;
        setDraf(pilih ? pilih.id : "baru");
        if (pilih) setModul(pilih.modul);
      })
      .catch(() => setDrafts([]));
  useEffect(() => {
    if (susulan && penuh) void muatDraf(true);
  }, [susulan, penuh]);
  useSiaran(["roster", "sesi"], () => void muatDraf(false), susulan && penuh);
  const drafDipilih = draf === "baru" ? null : (drafts?.find((x) => x.id === draf) ?? null);
  // A susulan starts only with Praktikan in it (2026-10-06): one started
  // empty had nobody who could sign in, and its roster can't be filled
  // once it runs. Until then the main button makes the susulan and opens
  // its roster.
  const perluRoster = susulan && (!drafDipilih || drafDipilih.praktikan === 0);

  async function buatRoster() {
    if (drafDipilih) return onPrep(`d${drafDipilih.id}`);
    if (modul === null) return;
    setBusy(true);
    try {
      const r = await postJson<{ ok: boolean; kode?: string; id?: number }>(
        "/api/session/susulan",
        { tanggal: susTanggal, mulai: susJam, modul, jumlahKelompok: 5 },
      );
      if (!r.ok || !r.id) {
        window.Toast?.show(pesan(t, r.kode), "danger");
        return;
      }
      window.Toast?.show(h.susCreated, "ok");
      onPrep(`d${r.id}`);
    } catch {
      window.Toast?.show(t.fail, "danger");
    } finally {
      setBusy(false);
    }
  }
  const bisaJadwal = me.hak?.jadwal !== undefined && me.hak.jadwal !== false;
  const myCode = (me.kode ?? "").toUpperCase();

  const row = (s: number) => data?.hariIni.find((r) => r.slot === s) ?? null;
  // Everyone teaching a slot today, once each: the seats, then helpers.
  const kodeSlot = (r: SlotHariIni) => [
    ...new Set([...r.asisten, ...(r.bantu ?? [])].map((k) => k.toUpperCase()).filter(Boolean)),
  ];
  const jendelaOf = (s: number) => row(s)?.jendelaMulaiMenit ?? data?.jendelaDefault ?? 15;
  const ada = (s: number) => {
    const r = row(s);
    return !!r && r.status === "aktif" && kodeSlot(r).length > 0;
  };

  // Done, Now (inside its start window), Next (the first upcoming slot with
  // a practicum, else the first upcoming one), Later.
  const states = useMemo(() => {
    const out: Record<number, SlotState> = {};
    const upcoming: number[] = [];
    for (const s of [1, 2, 3, 4]) {
      const p = jendelaSlot(SLOT_MULAI[s], jendelaOf(s), menitNow).posisi;
      out[s] = p === "lewat" ? "done" : p === "buka" ? "now" : "later";
      if (p === "belum") upcoming.push(s);
    }
    const next = upcoming.find(ada) ?? upcoming[0];
    if (next) out[next] = "next";
    return out;
  }, [data, menitNow]);

  // Once the data arrives: the slot running now, else the next one, and
  // the newest open module.
  useEffect(() => {
    if (!data || slot !== null) return;
    const s =
      [1, 2, 3, 4].find((n) => states[n] === "now" && ada(n)) ??
      [1, 2, 3, 4].find((n) => states[n] === "next") ??
      [1, 2, 3, 4].find((n) => states[n] === "now") ??
      4;
    pick(s);
    if (modul === null && data.terbuka.length) setModul(Math.max(...data.terbuka));
  }, [data]);

  function pick(s: number) {
    setSlot(s);
    setSusulan(false);
    setKelas(row(s)?.kelas ?? "reguler");
  }

  const sel = slot ?? 1;
  const r = row(sel);
  const diSlot =
    !!r &&
    (kodeSlot(r).includes(myCode) || r.pengganti.some((p) => p.kode.toUpperCase() === myCode));
  const win = jendelaSlot(SLOT_MULAI[sel], jendelaOf(sel), menitNow);
  const blok: "past" | "future" | "notMine" | "empty" | null = susulan
    ? null
    : win.posisi === "lewat"
      ? "past"
      : win.posisi === "belum"
        ? "future"
        : !ada(sel) && !penuh
          ? "empty"
          : !penuh && !diSlot
            ? "notMine"
            : null;
  const can = !blok && modul !== null && !!data?.terbuka.includes(modul);

  // The end time: from the start (or now, when starting late).
  const mulaiMenit = susulan ? menitDariJam(susJam) : menitDariJam(SLOT_MULAI[sel]);
  const dariMenit =
    susulan && susTanggal !== hariIniWib() ? mulaiMenit : Math.max(mulaiMenit, menitNow);
  const selesai = jamDariMenit(dariMenit + durasi);

  async function start(paksa?: string, apPaksa?: boolean) {
    if (modul === null) return;
    const ap = apPaksa ?? butuhAp;
    setBusy(true);
    try {
      const body = drafDipilih
        ? { jenis: "susulan", sesiId: drafDipilih.id }
        : susulan
          ? { jenis: "susulan", tanggal: susTanggal, mulai: susJam }
          : { tanggal: data?.tanggal ?? hariIniWib(), slot: sel };
      const d = await postJson<{
        ok: boolean;
        kode?: string;
        ditugaskan?: number;
        apDiantre?: boolean | null;
        sesiLama?: { id: number; status: string; bisaDilanjutkan: boolean } | null;
        cek?: BelumSiap["cek"];
        serverId?: number | null;
      }>("/api/session", {
        ...body,
        modul,
        kelas,
        durasiMenit: durasi,
        butuhAp: modul === 4 && ap,
        paksa,
      });
      // The lab check found something: show it instead of a toast.
      if (d.kode === "belum_siap" && d.cek) {
        setBelum({ cek: d.cek, serverId: d.serverId ?? null });
        return;
      }
      setBelum(null);
      if (d.ok) {
        window.Toast?.show(d.ditugaskan ? t.startedAssign(d.ditugaskan) : t.started, "ok");
        if (d.apDiantre === false) window.Toast?.show(t.apNotQueued, "warn", { duration: 12_000 });
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

  // The roster Preparation opens on: the picked slot when it has a
  // practicum, else Preparation's own pick (my next slot, 2026-10-06).
  const pilihPrep = susulan || !ada(sel) ? null : `${hariDariTanggal(hariIniWib())}-${sel}`;
  const hariNama = data ? hariLabel(data.hari, lang) : "";
  const whoMe = me.kode ? `${me.nama} (${me.kode})` : me.nama;

  return (
    <div className="home">
      <header className="page-header home__head">
        <div className="page-header__heading">
          <span className="page-header__eyebrow">
            {h.eyebrow(tanggalPanjang(data?.tanggal ?? hariIniWib(), lang))}
          </span>
          <h1 className="page-header__title">{h.greet(whoMe)}</h1>
        </div>
      </header>

      {me.perluAturSandi && (
        <a className="home__pw" href={`${href(lang, "/account")}#sandi`}>
          <WarningIcon size={20} aria-hidden="true" />
          <span className="grow stack" style={{ gap: 2 }}>
            <b>{t.pwReminder}</b>
            <span className="hint">{t.pwReminderBody}</span>
          </span>
          <span className="btn btn--secondary btn--sm">{t.pwGo}</span>
        </a>
      )}

      <section className="panel home__today" aria-label={h.today(hariNama)}>
        <div className="panel__head">
          <h2 className="panel__title">{h.today(hariNama)}</h2>
          <a className="btn btn--ghost btn--sm" href={href(lang, "/schedule")}>
            {h.mySchedule}
            <ArrowRightIcon size={16} aria-hidden="true" />
          </a>
        </div>
        <div className="slots">
          {[1, 2, 3, 4].map((s) => {
            const rs = row(s);
            const st = states[s];
            const label = { done: h.done, now: h.now, next: h.next, later: "" }[st];
            return (
              <button
                key={s}
                type="button"
                className="slot sweep-hover"
                data-state={st}
                aria-pressed={!susulan && sel === s}
                onClick={() => pick(s)}
              >
                <span className="slot__top">
                  <b className="slot__time num">{SLOT_MULAI[s]}</b>
                  {label && (
                    <Pill tone={st === "now" ? "ok" : st === "next" ? "accent" : undefined}>
                      {label}
                    </Pill>
                  )}
                </span>
                <span className="slot__label">
                  <span className="hint">{h.slot(s)}</span>
                  {rs?.kelas === "internasional" && (
                    <Pill tone="violet">{kelasLabel("internasional", lang)}</Pill>
                  )}
                </span>
                {ada(s) ? (
                  <span className="slot__codes">
                    {kodeSlot(rs!).map((k) => (
                      <span key={k} className={`acode${k === myCode ? " acode--me" : ""}`}>
                        {k}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="hint">
                    {rs?.status === "segera"
                      ? h.soon
                      : rs?.status === "libur"
                        ? h.holiday
                        : h.noPracticum}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="weekstrip">
          <span className="weekstrip__k">{h.myWeek}</span>
          {data && data.mingguSaya.length === 0 && <span className="hint">{h.myWeekEmpty}</span>}
          {data?.mingguSaya.map((w) => (
            <span
              key={`${w.hari}-${w.slot}`}
              className="weekchip"
              data-now={w.hari === data.hari && states[w.slot] === "now" ? "yes" : undefined}
            >
              <b>
                {hariLabel(w.hari, lang)} · {SLOT_MULAI[w.slot]}
              </b>
              <span className="hint">{h.groups(daftar(w.kelompok.map(String), h.and))}</span>
              {w.kelas === "internasional" && (
                <Pill tone="violet">{kelasLabel("internasional", lang)}</Pill>
              )}
            </span>
          ))}
        </div>
      </section>

      <HelpCard lang={lang} nama={dir.nama} onChanged={load} />

      <section className="panel panel--key panel--raised prepcard">
        <div className="prepcard__text">
          <h2 className="prepcard__title">{h.prepTitle}</h2>
          <span className="hint">{h.prepHint}</span>
          <div className="checks">
            {data ? (
              <PrepChecks
                data={data}
                slot={sel}
                susulan={susulan}
                h={h}
                lang={lang}
                onGo={(tab) => onPrep(pilihPrep, tab)}
              />
            ) : (
              <span className="skeleton" style={{ height: 24, width: 320 }} />
            )}
          </div>
        </div>
        <button
          type="button"
          className="btn btn--inverse btn--lg"
          onClick={() => onPrep(pilihPrep)}
        >
          <ListChecksIcon size={20} aria-hidden="true" />
          {h.prepOpen}
        </button>
      </section>

      <div className="homecols">
        <section className="panel panel--raised startcard">
          <div className="panel__head">
            <h2 className="panel__title">{h.startTitle}</h2>
            <label className="startcard__sus">
              <span className="hint">{h.susulan}</span>
              <Switch
                on={susulan}
                onChange={(v) => setSusulan(v)}
                label={h.susulan}
                disabled={!penuh}
              />
            </label>
          </div>
          {!penuh && susulan === false && blok === "past" && (
            <span className="hint">{h.susulanLocked}</span>
          )}

          <Fade k={`${susulan}-${sel}`}>
            {susulan ? (
              <div className="startcard__sus-fields">
                <div className="startcard__wide">
                  <Dropdown
                    id="sus-roster"
                    label={h.susRoster}
                    value={String(draf)}
                    onChange={(v) => {
                      const id = v === "baru" ? "baru" : Number(v);
                      setDraf(id);
                      const d = drafts?.find((x) => x.id === id);
                      if (d) setModul(d.modul);
                    }}
                    options={[
                      ...(drafts ?? []).map((d) => ({
                        value: String(d.id),
                        label: h.susDraft(
                          tanggalPanjang(d.tanggal, lang),
                          d.mulai,
                          d.modul,
                          d.praktikan,
                        ),
                      })),
                      { value: "baru", label: h.susNew },
                    ]}
                  />
                </div>
                {drafDipilih ? (
                  <span className="startcard__wide row" style={{ alignItems: "center", gap: 8 }}>
                    <span className="hint grow">
                      {drafDipilih.praktikan
                        ? h.susDraftInfo(drafDipilih.praktikan, drafDipilih.jumlahKelompok)
                        : h.susDraftEmpty}
                    </span>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => onPrep(`d${drafDipilih.id}`)}
                    >
                      {h.susEdit}
                    </button>
                  </span>
                ) : (
                  <>
                    <div className="field">
                      <span className="field__label" id="sus-date-l">
                        {h.date}
                      </span>
                      <DateField
                        value={susTanggal}
                        onChange={setSusTanggal}
                        label={h.date}
                        labelledBy="sus-date-l"
                        lang={lang}
                        min={hariIniWib()}
                      />
                    </div>
                    <div className="field">
                      <span className="field__label" id="sus-time-l">
                        {h.startTime}
                      </span>
                      <TimeField
                        value={susJam}
                        onChange={setSusJam}
                        label={h.startTime}
                        labelledBy="sus-time-l"
                        lang={lang}
                        from={6}
                      />
                    </div>
                    <span className="hint startcard__wide">{h.susEmpty}</span>
                  </>
                )}
                <span className="hint startcard__wide">{h.susulanHint}</span>
              </div>
            ) : (
              <div className="banner">
                <CalendarBlankIcon size={20} aria-hidden="true" />
                <b>
                  {hariNama} · {h.slot(sel)} · {SLOT_MULAI[sel]}
                </b>
                {ada(sel) ? (
                  <span className="row" style={{ gap: 4 }}>
                    {kodeSlot(r!).map((k) => {
                      const a = [...dir.byNim.values()].find((x) => x.kode?.toUpperCase() === k);
                      return (
                        <Tooltip key={k} label={a ? `${a.nama} (${k})` : k}>
                          <span className={`acode${k === myCode ? " acode--me" : ""}`} tabIndex={0}>
                            {k}
                          </span>
                        </Tooltip>
                      );
                    })}
                  </span>
                ) : (
                  <span className="hint">{h.noAssistants}</span>
                )}
              </div>
            )}
          </Fade>

          {blok ? (
            <WindowInfo
              kind={blok}
              slot={sel}
              open={win.buka}
              end={win.tutup}
              minutesToOpen={menitDariJam(win.buka) - menitNow}
              row={r}
              def={data?.jendelaDefault ?? 15}
              canEdit={diSlot || bisaJadwal}
              canSusulan={penuh}
              onSusulan={() => setSusulan(true)}
              onSaved={load}
              h={h}
              lang={lang}
              nameOf={(nim) => dir.nama(nim)}
              hari={data?.hari ?? 0}
            />
          ) : (
            <>
              <div className="field">
                <span className="field__label">{h.classType}</span>
                <SegmentedControl
                  aria-label={h.classType}
                  value={kelas}
                  onValueChange={(v) => setKelas(v as Kelas)}
                  options={[
                    { value: "reguler", label: kelasLabel("reguler", lang) },
                    { value: "internasional", label: kelasLabel("internasional", lang) },
                  ]}
                />
                <span className="field__hint">{h.classHint[kelas]}</span>
              </div>
              <div className="field">
                <span className="field__label">{h.length}</span>
                <div className="startcard__len">
                  <Stepper
                    value={durasi}
                    onChange={setDurasi}
                    min={SESI_MIN_MENIT}
                    max={SESI_CAP_MENIT}
                    step={15}
                    label={h.length}
                    fmt={(v) => menitLabel(v, lang)}
                    lessLabel={h.shorter}
                    moreLabel={h.longer}
                  />
                  {DURASI_CEPAT.map((v) => (
                    <button
                      key={v}
                      type="button"
                      className="chipbtn"
                      aria-pressed={durasi === v}
                      aria-label={menitLabel(v, lang)}
                      onClick={() => setDurasi(v)}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <span className="field__hint">{h.lengthHint(selesai)}</span>
              </div>
              <div className="field">
                <span className="field__label">{h.module}</span>
                <div className="modpick" role="radiogroup" aria-label={h.module}>
                  {[1, 2, 3, 4].map((m) => {
                    const off = !data?.terbuka.includes(m);
                    const b = (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={modul === m}
                        aria-disabled={off || undefined}
                        className="modpick__b"
                        style={{ "--m": `var(--mod-${m})` } as CSSProperties}
                        onClick={() => (off ? setTutup(m) : (setModul(m), setTutup(null)))}
                      >
                        <span className="modpick__top">
                          <Pill modul={m}>{modulLabel(m, lang)}</Pill>
                          {off && (
                            <Pill>
                              <LockSimpleIcon size={12} aria-hidden="true" />
                              {h.closed}
                            </Pill>
                          )}
                        </span>
                        <b>{t.modulNama(m)}</b>
                      </button>
                    );
                    return off ? (
                      <Tooltip key={m} label={h.closedTip}>
                        {b}
                      </Tooltip>
                    ) : (
                      b
                    );
                  })}
                </div>
              </div>
              {tutup !== null && (
                <div className="banner banner--warn" role="status">
                  <LockSimpleIcon size={20} aria-hidden="true" />
                  <span className="grow">{h.closedPick(modulLabel(tutup, lang))}</span>
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => onPrep(null, "akses")}
                  >
                    {h.openAccess}
                    <ArrowRightIcon size={16} aria-hidden="true" />
                  </button>
                </div>
              )}
              {modul === 4 && (
                <Checkbox
                  checked={butuhAp}
                  onChange={setButuhAp}
                  label={t.apLabel}
                  hint={t.apHint}
                />
              )}
            </>
          )}

          <div className="panel__actions">
            {can && perluRoster ? (
              <button
                type="button"
                className="btn btn--primary btn--lg btn--block"
                disabled={busy}
                data-loading={busy ? "yes" : undefined}
                onClick={() => void buatRoster()}
              >
                <UsersThreeIcon size={20} aria-hidden="true" />
                <span className="btn__label">{drafDipilih ? h.susFill : h.susCreate}</span>
                <span className="btn__spinner" aria-hidden="true" />
              </button>
            ) : can ? (
              <button
                type="button"
                className="btn btn--primary btn--lg btn--block"
                disabled={busy}
                data-loading={busy ? "yes" : undefined}
                onClick={() => void start()}
              >
                <PlayIcon size={20} weight="fill" aria-hidden="true" />
                <span className="btn__label">{h.start(modulLabel(modul ?? 1, lang))}</span>
                <span className="btn__spinner" aria-hidden="true" />
              </button>
            ) : (
              <Tooltip label={blok ? h.outsideTip : h.closedTip}>
                <button
                  type="button"
                  className="btn btn--primary btn--lg btn--block"
                  aria-disabled="true"
                >
                  <PlayIcon size={20} weight="fill" aria-hidden="true" />
                  {h.start(modulLabel(modul ?? 1, lang))}
                </button>
              </Tooltip>
            )}
          </div>
        </section>

        <div className="homecols__side">
          {heldN > 0 && (
            <section className="panel panel--key">
              <div className="panel__head">
                <h2 className="panel__title">{SL[lang].heldCard(heldN)}</h2>
                <Pill tone="warn">{heldN}</Pill>
              </div>
              <span className="hint">{SL[lang].heldCardBody}</span>
              <div className="panel__actions">
                <button type="button" className="btn btn--primary btn--sm" onClick={onHeld}>
                  {SL[lang].open}
                  <ArrowRightIcon size={16} aria-hidden="true" />
                </button>
              </div>
            </section>
          )}
          <section className="panel">
            <div className="panel__head">
              <h2 className="panel__title">{h.needScores}</h2>
              {data && data.perluNilai.length > 0 && (
                <Pill tone="warn">{data.perluNilai.length}</Pill>
              )}
            </div>
            {!data ? (
              <span className="skeleton" style={{ height: 60 }} />
            ) : data.perluNilai.length === 0 ? (
              <span className="hint">{h.needScoresNone}</span>
            ) : (
              <div className="needrows">
                {data.perluNilai.map((p) => (
                  <div key={p.sesiId} className="needrow">
                    <Pill modul={p.modul}>{modulLabel(p.modul, lang)}</Pill>
                    <span className="needrow__text">
                      <b>
                        {tanggalPanjang(p.tanggal, lang)}
                        {p.slot ? ` · ${h.slot(p.slot)}` : ""}
                      </b>
                      <span className="hint">
                        {h.needScoresLine(
                          daftar(
                            p.kelompok.map((k) => kelompokLabel(k.nomor, lang)),
                            h.and,
                          ),
                          p.kelompok.reduce((a, k) => a + k.tanpaNilai, 0),
                        )}
                      </span>
                    </span>
                    <a
                      className="btn btn--sm"
                      href={`${href(lang, "/reports")}?sesi=${p.sesiId}#nilai`}
                    >
                      <PencilSimpleIcon size={16} aria-hidden="true" />
                      {h.enterScores}
                    </a>
                  </div>
                ))}
              </div>
            )}
          </section>

          <EarningsMini lang={lang} nim={me.nim} />

          <FeedbackCard data={mine} h={h} lang={lang} />
        </div>
      </div>

      <StartCheck
        data={belum}
        modul={modul ?? 1}
        tot={false}
        lang={lang}
        busy={busy}
        onClose={() => setBelum(null)}
        onRecheck={() => void start()}
        onForce={(alasan) => void start(alasan)}
        onApOn={() => {
          setButuhAp(true);
          void start(undefined, true);
        }}
      />

      <Confirm
        open={resume !== null}
        onOpenChange={(o) => !o && setResume(null)}
        title={t.resumeTitle}
        body={resume !== null ? t.resumeBody(resume) : ""}
        confirmLabel={t.resume}
        tone="primary"
        lang={lang}
        onConfirm={async () => {
          const res = await postJson<{ ok: boolean; kode?: string }>("/api/session/lanjutkan", {
            sesiId: resume,
          }).catch(() => ({ ok: false, kode: undefined }));
          if (!res.ok) {
            window.Toast?.show(pesan(t, res.kode), "danger");
            return false;
          }
          window.Toast?.show(t.resumed, "ok");
          onStarted();
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------- prep checks */

export function PrepChecks({
  data,
  slot,
  susulan,
  h,
  lang,
  onGo,
}: {
  data: Beranda;
  slot: number;
  susulan: boolean;
  h: Hx;
  lang: Lang;
  /** Opens Preparation on the tab that fixes a check. */
  onGo: (tab: PrepTab) => void;
}) {
  const r = data.hariIni.find((x) => x.slot === slot);
  const hari = hariLabel(data.hari, lang);
  // Each check leads to where it is fixed (2026-10-06: they were plain
  // text, and the server check needed the Server tab found by hand).
  type Item = [boolean, string, PrepTab | string];
  const items: Item[] = [];
  // A slot without a practicum today needs no roster: no warning for it.
  const adaPraktikum =
    !!r && r.status === "aktif" && [...r.asisten, ...(r.bantu ?? [])].some(Boolean);
  if (!susulan && adaPraktikum) {
    items.push(
      r && r.roster.praktikan > 0
        ? [true, h.chkRoster(hari, slot, r.roster.kelompok, r.roster.praktikan), "roster"]
        : [false, h.chkRosterNone(hari, slot), "roster"],
    );
  }
  items.push(
    data.terbuka.length
      ? [
          true,
          h.chkAccess(
            daftar(
              data.terbuka.map((m) => modulLabel(m, lang)),
              h.and,
            ),
          ),
          "akses",
        ]
      : [false, h.chkAccessNone, "akses"],
  );
  items.push(
    data.presentasiAktif
      ? [true, h.chkSlides(data.presentasiAktif.nama), "slides"]
      : [false, h.chkSlidesNone, "slides"],
  );
  const srvHref = data.server
    ? `${href(lang, "/servers")}?id=${data.server.id}&dari=persiapan#siap`
    : `${href(lang, "/servers")}?dari=persiapan`;
  const siap = data.server?.siap;
  const hariIni =
    !!siap?.waktu &&
    new Date(siap.waktu).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }) === hariIniWib();
  items.push(
    !data.server
      ? [false, h.chkServerAbsent, srvHref]
      : siap && hariIni
        ? siap.lulus
          ? [true, h.chkServer(jamMenit(siap.waktu!, lang)), srvHref]
          : [false, h.chkServerFail(siap.gagal), srvHref]
        : [false, h.chkServerNone, srvHref],
  );
  return (
    <>
      {items.map(([ok, text, to]) => {
        const isi = (
          <>
            {ok ? (
              <CheckCircleIcon size={20} aria-hidden="true" />
            ) : (
              <WarningIcon size={20} aria-hidden="true" />
            )}
            <span>{text}</span>
            {!ok && <span className="checks__go">{h.goFix}</span>}
            <ArrowRightIcon size={14} aria-hidden="true" className="checks__arrow" />
          </>
        );
        return to.startsWith("/") ? (
          <a key={text} className="checks__i" data-ok={ok ? "yes" : "no"} href={to}>
            {isi}
          </a>
        ) : (
          <button
            key={text}
            type="button"
            className="checks__i"
            data-ok={ok ? "yes" : "no"}
            onClick={() => onGo(to as PrepTab)}
          >
            {isi}
          </button>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------- window info */

function WindowInfo({
  kind,
  slot,
  open,
  end,
  minutesToOpen,
  row,
  def,
  canEdit,
  canSusulan,
  onSusulan,
  onSaved,
  h,
  lang,
  nameOf,
  hari,
}: {
  kind: "past" | "future" | "notMine" | "empty";
  slot: number;
  open: string;
  end: string;
  minutesToOpen: number;
  row: SlotHariIni | null;
  def: number;
  canEdit: boolean;
  canSusulan: boolean;
  onSusulan: () => void;
  onSaved: () => void;
  h: Hx;
  lang: Lang;
  nameOf: (nim: string) => string;
  hari: number;
}) {
  if (kind === "past" || kind === "notMine" || kind === "empty") {
    const title =
      kind === "past" ? h.pastTitle(slot) : kind === "empty" ? h.emptyTitle(slot) : h.notMineTitle;
    const body =
      kind === "past" ? h.pastBody(end, open) : kind === "empty" ? h.emptyBody : h.notMineBody;
    return (
      <div className="wininfo" data-tone="past">
        <span className="wininfo__ic" aria-hidden="true">
          {kind === "past" ? <ClockCountdownIcon size={26} /> : <ProhibitIcon size={26} />}
        </span>
        <div className="wininfo__text">
          <b className="wininfo__title">{title}</b>
          <span>{body}</span>
          {kind === "past" && <span className="hint">{h.pastHint}</span>}
          {canSusulan && (
            <div className="row">
              <button type="button" className="btn btn--sm" onClick={onSusulan}>
                <CalendarBlankIcon size={16} aria-hidden="true" />
                {h.useSusulan}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }
  const own = row?.jendelaMulaiMenit ?? null;
  return (
    <div className="wininfo" data-tone="future">
      <span className="wininfo__ic" aria-hidden="true">
        <HourglassHighIcon size={26} />
      </span>
      <div className="wininfo__text">
        <b className="wininfo__title">{h.futureTitle(slot)}</b>
        <span>{h.futureBody(open, end)}</span>
        <span className="hint">
          {own !== null && row?.jendelaDiaturOleh
            ? h.winOwn(own, nameOf(row.jendelaDiaturOleh))
            : h.winDefault(def)}
        </span>
        <div className="row row--between">
          <span className="hint num">{h.opensIn(durasiLabel(minutesToOpen, lang))}</span>
          {canEdit && row && (
            <WinEdit slot={slot} hari={hari} cur={own ?? def} h={h} lang={lang} onSaved={onSaved} />
          )}
        </div>
      </div>
    </div>
  );
}

function WinEdit({
  slot,
  hari,
  cur,
  h,
  lang,
  onSaved,
}: {
  slot: number;
  hari: number;
  cur: number;
  h: Hx;
  lang: Lang;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(cur);
  useEffect(() => setV(cur), [cur, open]);
  const save = async (menit: number | null) => {
    const r = await postJson<{ ok: boolean }>("/api/session/jendela", { hari, slot, menit }).catch(
      () => ({ ok: false }),
    );
    if (!r.ok) return window.Toast?.show(h.winSaveFail, "danger");
    window.Toast?.show(menit === null ? h.winReset(slot) : h.winSaved(slot, menit), "ok");
    setOpen(false);
    onSaved();
  };
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      trigger={
        <button type="button" className="btn btn--ghost btn--sm">
          <HourglassHighIcon size={16} aria-hidden="true" />
          {h.winChange}
        </button>
      }
    >
      <div className="winedit">
        <b className="winedit__title">{h.winTitle(slot)}</b>
        <Stepper
          value={v}
          onChange={setV}
          min={JENDELA_MIN}
          max={JENDELA_MAX}
          step={5}
          label={h.winTitle(slot)}
          fmt={(x) => menitLabel(x, lang)}
          lessLabel={h.shorter}
          moreLabel={h.longer}
        />
        <span className="hint">{h.winHint}</span>
        <div className="winedit__act">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void save(null)}>
            {h.winUseDefault}
          </button>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => void save(v)}>
            {h.winSave}
          </button>
        </div>
      </div>
    </Popover>
  );
}

/* ---------------------------------------------------------- feedback */

function FeedbackCard({ data, h, lang }: { data: Ringkasan | null; h: Hx; lang: Lang }) {
  const [i, setI] = useState(0);
  const q = data?.komentar ?? [];
  const n = data?.jumlah ?? 0;
  return (
    <section className="panel fbcard">
      <div className="panel__head">
        <h2 className="panel__title">{h.feedbackTitle}</h2>
        <Tooltip label={h.privateTip}>
          <span tabIndex={0}>
            <Pill>
              <LockSimpleIcon size={12} aria-hidden="true" />
              {h.private}
            </Pill>
          </span>
        </Tooltip>
      </div>
      {!data ? (
        <span className="skeleton" style={{ height: 90 }} />
      ) : n === 0 ? (
        <span className="hint">{h.noFeedback}</span>
      ) : (
        <>
          <div className="fbcard__top">
            <div className="fbcard__avgbox">
              <b className="fbcard__avg num">{data.rataRata?.toLocaleString(localeOf(lang))}</b>
              <span className="hint">{h.ofFive(n)}</span>
            </div>
            <div className="fbdist">
              {[5, 4, 3, 2, 1].map((s) => {
                const c = data.sebaran[s - 1];
                return (
                  <div key={s} className="fbdist__r">
                    <span className="num hint">{s}</span>
                    <span className="fbdist__t">
                      <i style={{ width: `${n ? (c / n) * 100 : 0}%` }} />
                    </span>
                    <span className="num hint">{c}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {q.length > 0 && (
            <div className="quotes">
              <Fade k={String(i)}>
                <blockquote className="quote">
                  <p>{q[i % q.length].teks}</p>
                  <span className="hint">{tanggalPanjang(q[i % q.length].pada, lang)}</span>
                </blockquote>
              </Fade>
              {q.length > 1 && (
                <div className="row" style={{ gap: 6 }}>
                  <IconButton
                    icon={CaretLeftIcon}
                    label={h.prevQuote}
                    sm
                    onClick={() => setI((i + q.length - 1) % q.length)}
                  />
                  <span className="hint num">
                    {(i % q.length) + 1}/{q.length}
                  </span>
                  <IconButton
                    icon={CaretRightIcon}
                    label={h.nextQuote}
                    sm
                    onClick={() => setI((i + 1) % q.length)}
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}
      <div className="panel__actions">
        <a className="btn btn--ghost btn--sm" href={href(lang, "/reports")}>
          {h.allFeedback}
          <ArrowRightIcon size={16} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
