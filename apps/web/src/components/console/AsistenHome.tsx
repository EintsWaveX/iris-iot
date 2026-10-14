/**
 * Konsol home (Phase 10, mockup c11-home): what /session shows while no
 * session runs, as the Asisten's day.
 *
 * - Today: one strip from 06:00 to 18:30 with the four slots to scale
 *   (DayStrip), their start windows, the now line and My Week under it.
 *   Picking a slot fills the launch panel.
 * - The launch panel reads as a launch: 1 Readiness (Preparation's checks
 *   as lights, each with Fix), 2 Window (a clock counting to the window,
 *   then how long it stays open; outside it the slot's own Asisten sets it,
 *   5 to 30 minutes), 3 Start (class type, length, module; Start pinned at
 *   the bottom). A slot that already ran shows what happened and what is
 *   left to send instead. The Makeup switch opens the Praktikum Susulan form
 *   (Pengelola and Admin).
 * - Waiting on You: one ranked inbox (help requests and offers, groups
 *   scored but not sent, groups still missing scores, SeeLabs holds).
 * - Earnings and feedback as one slim strip at the foot.
 *
 * The server enforces every rule shown here (api/session/index.ts and
 * src/lib/sesi-mulai.ts); this page only explains them ahead of time.
 */
import SusulanSide from "./SusulanSide";
import RobotInbox from "./seelabs/RobotInbox";
import { batalSusulan, BS } from "./batalSusulan";
import HelpRows, { jumlahBantuan, useBantuan } from "./HelpCard";
import StartCheck, { type BelumSiap } from "./StartCheck";
import DayStrip, { dayStates, SlotCodes, WinClock, type DaySlot } from "./DayStrip";
import { useTitipan } from "./seelabs/data";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  CheckIcon,
  ClockCountdownIcon,
  LockSimpleIcon,
  MoonStarsIcon,
  PaperPlaneTiltIcon,
  PlayIcon,
  ProhibitIcon,
  UsersThreeIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { DateField, Stepper, Switch, TimeField } from "../ui/Controls";
import Confirm from "../ui/Confirm";
import Dropdown from "../ui/Dropdown";
import Fade from "../ui/Fade";
import Pill from "../ui/Pill";
import SegmentedControl from "../ui/SegmentedControl";
import TierBadge from "../ui/TierBadge";
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
import { hariLabel, kelasLabel, kelompokLabel, menitLabel, modulLabel } from "../../lib/labels";
import { useDirektori } from "../../lib/people";
import { useMenitWib } from "../../lib/jam";
import {
  jamDariMenit,
  jendelaSlot,
  menitDariJam,
  JENDELA_MAX,
  JENDELA_MIN,
} from "../../lib/sesi-mulai";
import type { Kelas, Lang } from "../../lib/kelas";
import type { Ringkasan } from "../../lib/umpan-balik";
import { jumlahkan, rupiah } from "../../lib/bayar";
import { periodeKini, useBayar } from "../bayar/data";
import { pesan, type Strings } from "./strings";
import { H, type Hx } from "./homeStrings";
import { D, type Dx } from "./dayStrings";
import type { PrepTab } from "./PrepView";
import { useSiaran } from "../../lib/siaran";
import "../shared/instruments.css";
import "./day.css";

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

/** What a slot ran today (Phase 10). */
export interface Jalan {
  sesiId: number;
  modul: number;
  status: string;
  selesaiPada: string | null;
  kelompok: number;
  hadir: number;
  orang: number;
  kirim: number;
}

export interface Beranda {
  tanggal: string;
  hari: number;
  jendelaDefault: number;
  hariIni: SlotHariIni[];
  mingguSaya: { hari: number; slot: number; kelas: Kelas; kelompok: number[] }[];
  terbuka: number[];
  presentasiAktif: { nama: string; jenis: string } | null;
  skemaAktif?: {
    modul: number;
    gambar: "unggahan" | "bawaan" | null;
    tautan: boolean;
  } | null;
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
  jalan?: Record<string, Jalan>;
  belumKirim?: {
    sesiId: number;
    modul: number;
    tanggal: string;
    slot: number | null;
    kelompok: { nomor: number; id: number }[];
  }[];
}

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
  onTable,
  onSeelabsSesi,
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
  /** An ended session's Score Table (Kirim Nilai lives there). */
  onTable: (sesiId: number) => void;
  /** An ended session's Kirim ke SeeLabs. */
  onSeelabsSesi: (sesiId: number) => void;
}) {
  const h = H[lang];
  const d = D[lang];
  const held = useTitipan();
  const heldN = held.data?.titipan.length ?? 0;
  const dir = useDirektori();
  const bantuan = useBantuan();
  const [data, setData] = useState<Beranda | null>(null);
  const [mine, setMine] = useState<Ringkasan | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const [susulan, setSusulan] = useState(false);
  const [susTanggal, setSusTanggal] = useState(hariIniWib());
  const [susJam, setSusJam] = useState("13:00");
  const [kelas, setKelas] = useState<Kelas>("reguler");
  const [durasi, setDurasi] = useState(SESI_CAP_MENIT);
  const [modul, setModul] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [resume, setResume] = useState<number | null>(null);
  const [belum, setBelum] = useState<BelumSiap | null>(null);
  // Susulan drafts made in Preparation, Roster (2026-10-06): starting one
  // brings its roster. Before this Home could only start an empty susulan.
  const [drafts, setDrafts] = useState<Draf[] | null>(null);
  const [draf, setDraf] = useState<number | "baru">("baru");
  const menitNow = useMenitWib();
  // A closed module picked in Start: say so and offer Module Access.
  const [tutup, setTutup] = useState<number | null>(null);

  const load = () =>
    getJson<{ ok: boolean } & Beranda>("/api/session/beranda")
      .then((x) => x.ok && setData(x))
      .catch(() => {});
  // presentasi: the readiness card's "Presentasi aktif" line (2026-10-07: it
  // kept naming a deck turned off elsewhere until it was clicked).
  useSiaran(["sesi", "jadwal", "tim", "akses", "server", "roster", "presentasi", "nilai"], load);
  const muatUmpan = () =>
    getJson<{ ok: boolean; ringkasan: Ringkasan }>("/api/session/feedback?scope=mine")
      .then((x) => x.ok && setMine(x.ringkasan))
      .catch(() => {});
  useSiaran(["umpan"], muatUmpan);

  useEffect(() => {
    void load();
    void muatUmpan();
  }, []);

  const penuh = me.hak?.pair === true;

  const muatDraf = (pilihUlang: boolean) =>
    getJson<{ ok: boolean; draf: Draf[] }>("/api/session/susulan")
      .then((x) => {
        if (!x.ok) return;
        setDrafts(x.draf);
        if (!pilihUlang) return;
        // The first draft with people in it, else a new one.
        const pilih = x.draf.find((y) => y.praktikan > 0) ?? null;
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
  const jalanOf = (s: number): Jalan | null => data?.jalan?.[String(s)] ?? null;
  const mineSlot = (s: number) => {
    const r = row(s);
    return (
      !!r &&
      (kodeSlot(r).includes(myCode) || r.pengganti.some((p) => p.kode.toUpperCase() === myCode))
    );
  };

  const states = useMemo(
    () =>
      dayStates(
        [1, 2, 3, 4].map((s) => {
          const j = jalanOf(s);
          return {
            slot: s,
            win: jendelaOf(s),
            kosong: !ada(s),
            jalan:
              j?.status === "berjalan" ? "berjalan" : j?.status === "selesai" ? "selesai" : null,
          };
        }),
        menitNow,
      ),
    [data, menitNow],
  );

  // Once the data arrives: the slot running or open now, else my next slot,
  // else a slot of mine still unsent, else the next one.
  useEffect(() => {
    if (!data || slot !== null) return;
    const order = [1, 2, 3, 4];
    const up = (s: number) => states[s] === "next" || states[s] === "later";
    const unsent = (s: number) => {
      const j = jalanOf(s);
      return states[s] === "done" && !!j && j.kirim < j.kelompok;
    };
    const s =
      order.find((n) => (states[n] === "now" || states[n] === "live") && ada(n)) ??
      order.find((n) => up(n) && mineSlot(n)) ??
      [...order].reverse().find((n) => mineSlot(n) && unsent(n)) ??
      order.find(up) ??
      order.find((n) => states[n] === "now") ??
      [...order].reverse().find((n) => states[n] === "done" && mineSlot(n)) ??
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
  const diSlot = mineSlot(sel);
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

  async function start(paksa?: string) {
    if (modul === null) return;
    setBusy(true);
    try {
      const body = drafDipilih
        ? { jenis: "susulan", sesiId: drafDipilih.id }
        : susulan
          ? { jenis: "susulan", tanggal: susTanggal, mulai: susJam }
          : { tanggal: data?.tanggal ?? hariIniWib(), slot: sel };
      const x = await postJson<{
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
        // Every Module 4 session may run the hunt; the hotspot waits for Mulai Perburuan
        butuhAp: modul === 4,
        paksa,
      });
      // The lab check found something: show it instead of a toast.
      if (x.kode === "belum_siap" && x.cek) {
        setBelum({ cek: x.cek, serverId: x.serverId ?? null });
        return;
      }
      setBelum(null);
      if (x.ok) {
        window.Toast?.show(x.ditugaskan ? t.startedAssign(x.ditugaskan) : t.started, "ok");
        if (x.apDiantre === false) window.Toast?.show(t.apNotQueued, "warn", { duration: 12_000 });
        onStarted();
        return;
      }
      if (x.kode === "sudah_ada" && x.sesiLama?.status === "berjalan") {
        window.Toast?.show(t.alreadyRunning, "info");
        onStarted();
      } else if (x.kode === "sudah_ada" && x.sesiLama?.bisaDilanjutkan) {
        setResume(x.sesiLama.id);
      } else window.Toast?.show(pesan(t, x.kode), "danger");
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
  const nameOfKode = (k: string) => {
    const a = [...dir.byNim.values()].find((x) => x.kode?.toUpperCase() === k);
    return a ? `${a.nama} (${k})` : k;
  };

  const slots: DaySlot[] = [1, 2, 3, 4].map((s) => {
    const rs = row(s);
    const j = jalanOf(s);
    return {
      slot: s,
      state: states[s] ?? "later",
      mine: mineSlot(s),
      kelas: rs?.kelas ?? "reguler",
      codes: rs ? kodeSlot(rs) : [],
      kosong: !ada(s),
      ran: j
        ? { modul: j.modul, selesai: j.selesaiPada ? jamMenit(j.selesaiPada, lang) : null }
        : null,
      win: jendelaOf(s),
    };
  });

  // The day is over: no slot left open or to come.
  const lastEnd = menitDariJam(SLOT_MULAI[4]) + SESI_CAP_MENIT;
  const dayOver = !!data && menitNow >= lastEnd;
  const nextMine = useMemo(() => {
    if (!data) return null;
    const list = [...data.mingguSaya].sort((a, b) => a.hari - b.hari || a.slot - b.slot);
    return list.find((w) => w.hari > data.hari) ?? list[0] ?? null;
  }, [data]);

  const cek = data ? cekSiap(data, sel, false, h, lang) : [];
  const siapN = cek.filter((c) => c.ok).length;
  const goCek = (to: PrepTab | string) =>
    to.startsWith("/") ? location.assign(to) : onPrep(pilihPrep, to as PrepTab);

  /* -------------------------------------------------------- launch */
  const susSwitch = (
    <Tooltip label={penuh ? h.susulan : d.makeupLocked}>
      <label className="lp__sus-sw">
        <span className="hint">{d.makeup}</span>
        <Switch
          on={susulan}
          onChange={(v) => {
            if (!penuh) {
              window.Toast?.show(d.makeupLocked, "warn");
              return;
            }
            setSusulan(v);
          }}
          label={d.makeup}
        />
      </label>
    </Tooltip>
  );
  const head = (
    <div className="panel__head">
      <div className="stack" style={{ gap: 2, minWidth: 0 }}>
        <span className="eyebrow lp__eyebrow">
          {susulan ? d.makeupEyebrow : `${hariNama} · Slot ${sel} · ${SLOT_MULAI[sel]}`}
        </span>
        <h2 className="panel__title">{d.startTitle}</h2>
      </div>
      {susSwitch}
    </div>
  );

  const startButton = (
    <div className="panel__actions">
      <hr className="lp__rule" />
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
        <Tooltip
          label={
            blok === "future"
              ? d.seqFrom(win.buka)
              : blok
                ? h.outsideTip
                : modul === null
                  ? h.module
                  : h.closedTip
          }
        >
          <button
            type="button"
            className="btn btn--primary btn--lg btn--block"
            aria-disabled="true"
          >
            {h.start(modulLabel(modul ?? 1, lang))}
          </button>
        </Tooltip>
      )}
    </div>
  );

  const startForm = (
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
            className="btn btn--inverse btn--sm"
            onClick={() => onPrep(null, "akses")}
          >
            {h.openAccess}
          </button>
        </div>
      )}
    </>
  );

  let launch: ReactNode;
  const st = states[sel];
  const j = jalanOf(sel);
  if (susulan) {
    launch = (
      <section className="panel panel--key panel--raised lp" data-area="launch">
        {head}
        <Fade k="sus">
          <div className="lp__sus">
            <div className="lp__wide">
              <Dropdown
                id="sus-roster"
                label={h.susRoster}
                value={String(draf)}
                onChange={(v) => {
                  const id = v === "baru" ? "baru" : Number(v);
                  setDraf(id);
                  const x = drafts?.find((y) => y.id === id);
                  if (x) setModul(x.modul);
                }}
                options={[
                  ...(drafts ?? []).map((x) => ({
                    value: String(x.id),
                    label: h.susDraft(
                      tanggalPanjang(x.tanggal, lang),
                      x.mulai,
                      x.modul,
                      x.praktikan,
                    ),
                  })),
                  { value: "baru", label: h.susNew },
                ]}
              />
            </div>
            {drafDipilih ? (
              <span className="lp__wide row" style={{ alignItems: "center", gap: 8 }}>
                <span className="hint grow">
                  {drafDipilih.praktikan
                    ? h.susDraftInfo(drafDipilih.praktikan, drafDipilih.jumlahKelompok)
                    : h.susDraftEmpty}
                </span>
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={() => {
                    const id = drafDipilih.id;
                    void batalSusulan(
                      id,
                      `${tanggalPanjang(drafDipilih.tanggal, lang)} · ${drafDipilih.mulai}`,
                      lang,
                      (pulih) => {
                        setDraf(pulih ? id : "baru");
                        void muatDraf(false);
                      },
                    );
                  }}
                >
                  {BS[lang].cancel}
                </button>
                <button
                  type="button"
                  className="btn btn--inverse"
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
                <span className="hint lp__wide">{h.susEmpty}</span>
              </>
            )}
            <span className="hint lp__wide">{h.susulanHint}</span>
          </div>
        </Fade>
        <div className="lp__body">
          {!drafDipilih && (
            <div className="lp__left">
              {startForm}
              <button
                type="button"
                className="btn btn--inverse btn--lg btn--block"
                onClick={() => onPrep(null)}
              >
                {h.prepOpen}
              </button>
            </div>
          )}
          <div className={drafDipilih ? "lp__right lp__span" : "lp__right"}>
            <SusulanSide
              lang={lang}
              draf={drafDipilih ?? null}
              drafts={drafts ?? []}
              onPick={(id) => {
                setDraf(id);
                const x = drafts?.find((y) => y.id === id);
                if (x) setModul(x.modul);
              }}
            />
          </div>
        </div>
        {startButton}
      </section>
    );
  } else if (st === "done" || st === "live" || (blok === "past" && !j)) {
    // A slot that already ran (or is running): what happened, what is left.
    const a = menitDariJam(SLOT_MULAI[sel]);
    const ranM = j ? modulLabel(j.modul, lang) : "";
    const sentLeft = j ? Math.max(0, j.kelompok - j.kirim) : 0;
    launch = (
      <section className="panel lp" data-area="launch" data-state={st}>
        {head}
        <Seq
          steps={[
            ["ok", d.seqReady, d.seqChecked],
            ["ok", d.seqWindow, d.seqClosed(jamDariMenit(a + SESI_CAP_MENIT))],
            [
              "ok",
              d.seqSession,
              j?.status === "berjalan"
                ? d.seqRunning
                : j?.selesaiPada
                  ? d.seqEnded(jamMenit(j.selesaiPada, lang))
                  : d.seqNotStarted,
            ],
          ]}
        />
        {j ? (
          <div className="lp__ran">
            <div className="lp__nums">
              <div>
                <b className="mono">{j.kelompok}</b>
                <span>{d.ranNums.groups}</span>
              </div>
              <div>
                <b className="mono">
                  {j.hadir}/{j.orang}
                </b>
                <span>{d.ranNums.here}</span>
              </div>
              <div data-tone={sentLeft > 0 ? "warn" : "ok"}>
                <b className="mono">
                  {j.kirim}/{j.kelompok}
                </b>
                <span>{d.ranNums.sent}</span>
              </div>
            </div>
            <span className="hint">
              {j.status === "berjalan"
                ? d.ranLive(ranM)
                : diSlot
                  ? sentLeft > 0
                    ? d.ranUnsent(ranM, sentLeft)
                    : d.ranAllSent(ranM)
                  : d.ranHeld(ranM, r ? kodeSlot(r).join(", ") : "")}
            </span>
          </div>
        ) : (
          <span className="hint">{d.ranNone}</span>
        )}
        <div className="panel__actions">
          {j?.status === "berjalan" && (
            <button type="button" className="btn btn--primary" onClick={onStarted}>
              {d.openBoard}
            </button>
          )}
          {j && j.status === "selesai" && (
            <>
              <button
                type="button"
                className={`btn${sentLeft > 0 && diSlot ? " btn--primary" : ""}`}
                onClick={() => onTable(j.sesiId)}
              >
                {d.scoreTable}
              </button>
              <button type="button" className="btn" onClick={() => onSeelabsSesi(j.sesiId)}>
                {d.toSeelabs}
              </button>
            </>
          )}
          {penuh && (
            <button type="button" className="btn" onClick={() => setSusulan(true)}>
              {d.makeMakeup}
            </button>
          )}
          <button type="button" className="btn btn--inverse btn--lg" onClick={() => onPrep(null)}>
            {h.prepOpen}
          </button>
        </div>
      </section>
    );
  } else {
    const open = win.posisi === "buka";
    launch = (
      <section className="panel panel--key panel--raised lp" data-area="launch" data-state={st}>
        {head}
        <Seq
          steps={[
            [siapN === cek.length ? "ok" : "warn", d.seqReady, d.seqReadyN(siapN, cek.length)],
            [
              open ? "ok" : "wait",
              d.seqWindow,
              open ? d.seqOpenUntil(win.tutup) : d.seqOpens(win.buka),
            ],
            [open && !blok ? "go" : "lock", d.seqStart, open ? d.seqPress : d.seqFrom(win.buka)],
          ]}
        />
        <div className="lp__body">
          <div className="lp__left">
            <div className="lp__clockrow">
              <WinClock now={menitNow} slot={sel} win={jendelaOf(sel)} lang={lang} />
              <div className="stack stack--sm">
                <b>{d.slotRange(sel, SLOT_MULAI[sel], win.tutup)}</b>
                {ada(sel) ? (
                  <SlotCodes codes={r ? kodeSlot(r) : []} me={myCode} nameOf={nameOfKode} />
                ) : (
                  <span className="hint">
                    {r?.status === "segera"
                      ? h.soon
                      : r?.status === "libur"
                        ? h.holiday
                        : h.noPracticum}
                  </span>
                )}
                {ada(sel) && !diSlot && <span className="hint">{d.notYourSlot}</span>}
              </div>
            </div>
            <Lights items={cek} d={d} onGo={goCek} />
            <button
              type="button"
              className="btn btn--inverse btn--lg btn--block"
              onClick={() => onPrep(pilihPrep)}
            >
              {h.prepOpen}
            </button>
          </div>
          <div className="lp__right">
            {blok === "future" ? (
              <>
                <WinInline
                  slot={sel}
                  hari={data?.hari ?? 0}
                  cur={jendelaOf(sel)}
                  own={r?.jendelaMulaiMenit ?? null}
                  canEdit={(diSlot || bisaJadwal) && !!r}
                  mineHint={diSlot}
                  d={d}
                  h={h}
                  lang={lang}
                  onSaved={load}
                />
                <div className="lp__wait">
                  <ClockCountdownIcon size={26} aria-hidden="true" />
                  <span className="stack" style={{ gap: 2 }}>
                    <b>{d.waitBig(win.buka)}</b>
                    <span className="hint">{d.waitSmall}</span>
                  </span>
                </div>
              </>
            ) : blok === "notMine" || blok === "empty" ? (
              <WindowInfo
                kind={blok}
                slot={sel}
                h={h}
                canSusulan={penuh}
                onSusulan={() => setSusulan(true)}
              />
            ) : (
              startForm
            )}
          </div>
        </div>
        {startButton}
      </section>
    );
  }

  /* ---------------------------------------------------------- inbox */
  const today = data?.tanggal ?? hariIniWib();
  const bk = data?.belumKirim ?? [];
  const pn = data?.perluNilai ?? [];
  const whenOf = (x: { tanggal: string; slot: number | null }) =>
    x.tanggal === today
      ? `${d.todayWord}${x.slot ? ` · Slot ${x.slot}` : ""}`
      : `${tanggalPanjang(x.tanggal, lang)}${x.slot ? ` · Slot ${x.slot}` : ""}`;
  const groupsOf = (ns: number[]) =>
    daftar(
      ns.map((n) => kelompokLabel(n, lang)),
      h.and,
    );
  const [sending, setSending] = useState<number | null>(null);
  const [robotN, setRobotN] = useState(0);
  async function kirimSemua(x: (typeof bk)[number]) {
    setSending(x.sesiId);
    let ok = 0;
    let gagal = 0;
    for (const g of x.kelompok) {
      const res = await postJson<{ ok: boolean }>("/api/session/nilai", {
        sesiId: x.sesiId,
        kelompokId: g.id,
        kirim: true,
      }).catch(() => ({ ok: false }));
      if (res.ok) ok++;
      else gagal++;
    }
    setSending(null);
    if (ok) window.Toast?.show(d.kirimOk(groupsOf(x.kelompok.map((g) => g.nomor))), "ok");
    if (gagal)
      window.Toast?.show(d.kirimSome, "warn", {
        action: { label: d.scoreTable, onClick: () => onTable(x.sesiId) },
      });
    void load();
  }
  const kirimRow = (x: (typeof bk)[number]) => (
    <li key={`k${x.sesiId}`} className="elog__row todo10__row">
      <span className="elog__tag mono" data-tone="ok">
        {d.tag.kirim}
      </span>
      <span className="elog__text">
        {d.kirimLine(
          modulLabel(x.modul, lang),
          whenOf(x),
          groupsOf(x.kelompok.map((g) => g.nomor)),
        )}
      </span>
      <span className="todo10__acts">
        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={sending !== null}
          data-loading={sending === x.sesiId ? "yes" : undefined}
          onClick={() => void kirimSemua(x)}
        >
          <PaperPlaneTiltIcon size={16} aria-hidden="true" />
          <span className="btn__label">{d.sendScores}</span>
          <span className="btn__spinner" aria-hidden="true" />
        </button>
        <button type="button" className="btn btn--sm" onClick={() => onTable(x.sesiId)}>
          {d.scoreTable}
        </button>
      </span>
    </li>
  );
  const nilaiRow = (p: (typeof pn)[number]) => (
    <li key={`n${p.sesiId}`} className="elog__row todo10__row">
      <span className="elog__tag mono" data-tone="warn">
        {d.tag.nilai}
      </span>
      <span className="elog__text">
        {d.nilaiLine(
          modulLabel(p.modul, lang),
          whenOf(p),
          groupsOf(p.kelompok.map((k) => k.nomor)),
          p.kelompok.reduce((a, k) => a + k.tanpaNilai, 0),
        )}
      </span>
      <span className="todo10__acts">
        <button type="button" className="btn btn--sm" onClick={() => onTable(p.sesiId)}>
          {d.enterScores}
        </button>
      </span>
    </li>
  );
  const helpN = jumlahBantuan(bantuan.data);
  const todayK = bk.filter((x) => x.tanggal === today);
  const todayN = pn.filter((x) => x.tanggal === today);
  const oldK = bk.filter((x) => x.tanggal !== today);
  const oldN = pn.filter((x) => x.tanggal !== today);
  const inboxN = helpN + bk.length + pn.length + (heldN > 0 ? 1 : 0);
  const semuaN = inboxN + robotN;
  const earlierN = oldK.length + oldN.length + (heldN > 0 ? 1 : 0);

  return (
    <div className="dt">
      <header className="page-header home__head">
        <div className="page-header__heading">
          <span className="page-header__eyebrow">
            {h.eyebrow(tanggalPanjang(data?.tanggal ?? hariIniWib(), lang))}
          </span>
          <h1 className="page-header__title">{h.greet(me.nama.split(" ")[0])}</h1>
          <span className="row" style={{ gap: 8 }}>
            <span className="hint">{me.kode ? `${me.nama} (${me.kode})` : me.nama}</span>
            {me.tier && <TierBadge tier={me.tier} lang={lang} />}
          </span>
        </div>
      </header>

      {me.perluAturSandi && (
        <a className="home__pw" href={`${href(lang, "/account")}#sandi`}>
          <WarningIcon size={20} aria-hidden="true" />
          <span className="grow stack" style={{ gap: 2 }}>
            <b>{d.pwTitle}</b>
            <span className="hint">{d.pwBody}</span>
          </span>
          <span className="btn btn--secondary btn--sm">{d.pwGo}</span>
        </a>
      )}

      <section className="panel panel--raised dtday" aria-label={d.todayEyebrow(hariNama)}>
        <div className="panel__head">
          <span className="eyebrow lp__eyebrow">{d.todayEyebrow(hariNama)}</span>
          <a className="btn btn--ghost btn--sm" href={href(lang, "/schedule?sorot=1")}>
            {h.mySchedule}
          </a>
        </div>
        {data ? (
          <DayStrip
            slots={slots}
            now={menitNow}
            sel={susulan ? null : sel}
            onPick={pick}
            me={myCode}
            nameOf={nameOfKode}
            lang={lang}
          />
        ) : (
          <span className="skeleton" style={{ height: 176 }} />
        )}
        {dayOver && (
          <div className="banner">
            <MoonStarsIcon size={20} aria-hidden="true" />
            <span className="grow">
              {nextMine
                ? d.dayOver(
                    `${tanggalPanjang(tanggalBerikut(data!.tanggal, data!.hari, nextMine.hari), lang)} · ${SLOT_MULAI[nextMine.slot]}`,
                  )
                : d.dayOverNone}
            </span>
          </div>
        )}
        <div className="weekstrip">
          <span className="weekstrip__k">{h.myWeek}</span>
          {data && data.mingguSaya.length === 0 && <span className="hint">{h.myWeekEmpty}</span>}
          {data?.mingguSaya.map((w) => (
            // Each of my slots opens the Jadwal with Sorot Kode Saya on and
            // that slot flashed (2026-10-12; its roster stays in Persiapan).
            <a
              key={`${w.hari}-${w.slot}`}
              className="weekchip"
              data-now={w.hari === data.hari && states[w.slot] === "now" ? "yes" : undefined}
              href={href(lang, `/schedule?sorot=1&slot=${w.hari}-${w.slot}`)}
            >
              <b>
                {hariLabel(w.hari, lang)} · {SLOT_MULAI[w.slot]}
              </b>
              <span className="hint">{h.groups(daftar(w.kelompok.map(String), h.and))}</span>
              {w.kelas === "internasional" && (
                <Pill tone="violet">{kelasLabel("internasional", lang)}</Pill>
              )}
            </a>
          ))}
        </div>
      </section>

      <div className="dt__grid">
        {data ? launch : <span className="skeleton lp" style={{ height: 420 }} />}

        <section className="panel inbox" data-area="inbox">
          <div className="panel__head">
            <h2 className="panel__title">{d.inboxTitle}</h2>
            {semuaN > 0 && <Pill tone="warn">{semuaN}</Pill>}
          </div>
          {/* Phase 14: SeeLabs robot jobs of mine that stopped */}
          <RobotInbox lang={lang} tag={d.tag.seelabs} onTable={onTable} onCount={setRobotN} />
          {!data ? (
            <span className="skeleton" style={{ height: 120 }} />
          ) : semuaN === 0 ? (
            <div className="todo10__empty">
              <span className="state10__ic">
                <CheckCircleIcon size={30} aria-hidden="true" />
              </span>
              <b>{d.inboxEmpty}</b>
              <span className="hint">{d.inboxEmptyBody}</span>
            </div>
          ) : (
            <>
              {helpN + todayK.length + todayN.length > 0 && (
                <>
                  <span className="label-caps inbox__k">{d.inboxToday}</span>
                  <ol className="elog todo10">
                    <HelpRows
                      lang={lang}
                      nama={dir.nama}
                      poll={bantuan}
                      onChanged={load}
                      tags={d.tag}
                    />
                    {todayK.map(kirimRow)}
                    {todayN.map(nilaiRow)}
                  </ol>
                </>
              )}
              {earlierN > 0 && (
                <>
                  <span className="label-caps inbox__k">{d.inboxEarlier}</span>
                  <ol className="elog todo10">
                    {heldN > 0 && (
                      <li className="elog__row todo10__row">
                        <span className="elog__tag mono" data-tone="accent">
                          {d.tag.seelabs}
                        </span>
                        <span className="elog__text">{d.heldLine(heldN)}</span>
                        <span className="todo10__acts">
                          <button type="button" className="btn btn--sm" onClick={onHeld}>
                            {d.open}
                          </button>
                        </span>
                      </li>
                    )}
                    {oldK.map(kirimRow)}
                    {oldN.map(nilaiRow)}
                  </ol>
                </>
              )}
              <span className="hint">{d.inboxHint}</span>
            </>
          )}
        </section>

        <DayFoot lang={lang} nim={me.nim} fb={mine} />
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

/** The date of the next given weekday after `tanggal` (a week on when it
 *  is the same day), as an ISO date. */
function tanggalBerikut(tanggal: string, hari: number, ke: number): string {
  const maju = (ke - hari + 7) % 7 || 7;
  const d = new Date(`${tanggal}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + maju);
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------- the launch */

type SeqState = "ok" | "warn" | "wait" | "go" | "lock";

/** The three stops of a launch: ready, window, start. */
function Seq({ steps }: { steps: [SeqState, string, string][] }) {
  return (
    <ol className="seq">
      {steps.map(([state, title, sub], i) => (
        <li key={title} className="seq__st" data-state={state}>
          <span className="seq__node mono" aria-hidden="true">
            {state === "ok" ? (
              <CheckIcon size={14} weight="bold" />
            ) : state === "lock" ? (
              <LockSimpleIcon size={14} />
            ) : (
              i + 1
            )}
          </span>
          <span className="stack" style={{ gap: 0, minWidth: 0 }}>
            <b>{title}</b>
            <span className="hint">{sub}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Readiness as lights, each one leading to where it is fixed. */
function Lights({ items, d, onGo }: { items: Cek[]; d: Dx; onGo: (to: PrepTab | string) => void }) {
  return (
    <ul className="lights">
      {items.map((c) => (
        <li key={c.key} className="lights__i" data-ok={c.ok ? "yes" : "no"}>
          <span className="lights__lamp" aria-hidden="true" />
          <span className="lights__txt">
            <b>{d.chk[c.key]}</b>
            <span className="hint">{c.text}</span>
          </span>
          {c.ok ? (
            <span className="lights__word">{d.ready}</span>
          ) : (
            <button type="button" className="btn btn--sm" onClick={() => onGo(c.to)}>
              {d.fix}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------- prep checks */

export interface Cek {
  ok: boolean;
  key: "roster" | "akses" | "slides" | "skema" | "server";
  text: string;
  /** A Preparation tab, or a page path. */
  to: PrepTab | string;
}

/** What is ready for a slot: its roster, the open modules, the active
 *  slides and the server's Ready check, each with where it is fixed. */
export function cekSiap(data: Beranda, slot: number, susulan: boolean, h: Hx, lang: Lang): Cek[] {
  const r = data.hariIni.find((x) => x.slot === slot);
  const hari = hariLabel(data.hari, lang);
  const items: Cek[] = [];
  // A slot without a practicum today needs no roster: no warning for it.
  const adaPraktikum =
    !!r && r.status === "aktif" && [...r.asisten, ...(r.bantu ?? [])].some(Boolean);
  if (!susulan && adaPraktikum) {
    items.push(
      r && r.roster.praktikan > 0
        ? {
            ok: true,
            key: "roster",
            text: h.chkRoster(hari, slot, r.roster.kelompok, r.roster.praktikan),
            to: "roster",
          }
        : { ok: false, key: "roster", text: h.chkRosterNone(hari, slot), to: "roster" },
    );
  }
  items.push(
    data.terbuka.length
      ? {
          ok: true,
          key: "akses",
          text: h.chkAccess(
            daftar(
              data.terbuka.map((m) => modulLabel(m, lang)),
              h.and,
            ),
          ),
          to: "akses",
        }
      : { ok: false, key: "akses", text: h.chkAccessNone, to: "akses" },
  );
  items.push(
    data.presentasiAktif
      ? { ok: true, key: "slides", text: h.chkSlides(data.presentasiAktif.nama), to: "slides" }
      : { ok: false, key: "slides", text: h.chkSlidesNone, to: "slides" },
  );
  const sk = data.skemaAktif;
  if (sk) {
    const m = modulLabel(sk.modul, lang);
    items.push(
      sk.gambar || sk.tautan
        ? {
            ok: true,
            key: "skema",
            text: h.chkSkema(m, sk.gambar === "unggahan", sk.gambar === "bawaan", sk.tautan),
            to: "skema",
          }
        : { ok: false, key: "skema", text: h.chkSkemaNone(m), to: "skema" },
    );
  }
  const srvHref = data.server
    ? `${href(lang, "/servers")}?id=${data.server.id}&dari=persiapan#siap`
    : `${href(lang, "/servers")}?dari=persiapan`;
  const siap = data.server?.siap;
  const hariIni =
    !!siap?.waktu &&
    new Date(siap.waktu).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }) === hariIniWib();
  items.push(
    !data.server
      ? { ok: false, key: "server", text: h.chkServerAbsent, to: srvHref }
      : siap && hariIni
        ? siap.lulus
          ? { ok: true, key: "server", text: h.chkServer(jamMenit(siap.waktu!, lang)), to: srvHref }
          : { ok: false, key: "server", text: h.chkServerFail(siap.gagal), to: srvHref }
        : { ok: false, key: "server", text: h.chkServerNone, to: srvHref },
  );
  return items;
}

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
  // Each check leads to where it is fixed (2026-10-06: they were plain
  // text, and the server check needed the Server tab found by hand).
  return (
    <>
      {cekSiap(data, slot, susulan, h, lang).map(({ ok, text, to }) => {
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

/** Inside the window but not this Asisten's to start, or nothing to start. */
function WindowInfo({
  kind,
  slot,
  h,
  canSusulan,
  onSusulan,
}: {
  kind: "notMine" | "empty";
  slot: number;
  h: Hx;
  canSusulan: boolean;
  onSusulan: () => void;
}) {
  return (
    <div className="wininfo" data-tone="past">
      <span className="wininfo__ic" aria-hidden="true">
        <ProhibitIcon size={26} />
      </span>
      <div className="wininfo__text">
        <b className="wininfo__title">{kind === "empty" ? h.emptyTitle(slot) : h.notMineTitle}</b>
        <span>{kind === "empty" ? h.emptyBody : h.notMineBody}</span>
        {canSusulan && (
          <div className="row">
            <button type="button" className="btn btn--sm" onClick={onSusulan}>
              {h.useSusulan}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** A slot's own start window, set in place by its Asisten (or the Jadwal
 *  right): 5 to 30 minutes, or back to the default. */
function WinInline({
  slot,
  hari,
  cur,
  own,
  canEdit,
  mineHint,
  d,
  h,
  lang,
  onSaved,
}: {
  slot: number;
  hari: number;
  cur: number;
  own: number | null;
  canEdit: boolean;
  mineHint: boolean;
  d: Dx;
  h: Hx;
  lang: Lang;
  onSaved: () => void;
}) {
  const [v, setV] = useState(cur);
  const [busy, setBusy] = useState(false);
  useEffect(() => setV(cur), [cur, slot]);
  const save = async (menit: number | null) => {
    setBusy(true);
    const r = await postJson<{ ok: boolean }>("/api/session/jendela", { hari, slot, menit }).catch(
      () => ({ ok: false }),
    );
    setBusy(false);
    if (!r.ok) return window.Toast?.show(h.winSaveFail, "danger");
    window.Toast?.show(menit === null ? h.winReset(slot) : h.winSaved(slot, menit), "ok");
    onSaved();
  };
  return (
    <div className="field lp__win">
      <span className="field__label">{d.winLabel}</span>
      {canEdit ? (
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
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
          {v !== cur && (
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={busy}
              onClick={() => void save(v)}
            >
              {d.winSave}
            </button>
          )}
          {own !== null && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={busy}
              onClick={() => void save(null)}
            >
              {d.winDefault}
            </button>
          )}
        </div>
      ) : (
        <b className="num">{menitLabel(cur, lang)}</b>
      )}
      <span className="field__hint">{mineHint ? d.winMine : d.winOthers}</span>
    </div>
  );
}

/* --------------------------------------------- earnings and feedback */

/** "Oktober" for "2026-10". */
function bulanNama(periode: string, lang: Lang): string {
  const [y, m] = periode.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(localeOf(lang), {
    month: "long",
    timeZone: "UTC",
  });
}

function periodeSebelum(periode: string): string {
  const [y, m] = periode.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** One strip at the foot: this month's pay by week with the change from
 *  last month, the class split and the cash fund; the feedback average with
 *  its stars, spread and a quote. Private to the person. */
function DayFoot({ lang, nim, fb }: { lang: Lang; nim: string; fb: Ringkasan | null }) {
  const d = D[lang];
  const { data } = useBayar();
  const [q, setQ] = useState(0);
  const periode = periodeKini();
  const lalu = periodeSebelum(periode);
  const mine = (data?.units ?? []).filter((u) => u.nimPenilai === nim);
  const bulan = mine.filter((u) => u.tanggal.startsWith(periode));
  const sebelum = mine.filter((u) => u.tanggal.startsWith(lalu));
  const r = jumlahkan(bulan);
  const rLalu = jumlahkan(sebelum);
  const delta = r.bersih - rLalu.bersih;
  const weeks = [1, 2, 3, 4, 5].map((w) => {
    const us = bulan.filter((u) => Math.ceil(Number(u.tanggal.slice(8, 10)) / 7) === w);
    return { w, n: us.length, rp: us.reduce((a, u) => a + u.bersih, 0) };
  });
  const max = Math.max(1, ...weeks.map((w) => w.rp));
  const kasPct =
    [...new Set(bulan.map((u) => `${u.kasPersen}%`))].join(", ") ||
    `${data?.kas.persenSaya ?? 10}%`;
  const n = fb?.jumlah ?? 0;
  const quotes = fb?.komentar ?? [];
  const avg = fb?.rataRata ?? 0;
  return (
    <section className="panel dtfoot" data-area="foot">
      <div className="dtfoot__c">
        <div className="stack" style={{ gap: 4, minWidth: 0 }}>
          <span className="dtfoot__k">{d.earnLabel(bulanNama(periode, lang))}</span>
          {!data ? (
            <span className="skeleton" style={{ height: 28, width: 140 }} />
          ) : (
            <>
              <span className="row" style={{ gap: 8, alignItems: "baseline" }}>
                <b className="mono dtfoot__big">{rupiah(r.bersih).replace(/,00$/, "")}</b>
                {delta !== 0 && (
                  <span className="dtfoot__up" data-down={delta < 0 ? "yes" : undefined}>
                    {delta > 0 ? (
                      <ArrowUpIcon size={12} aria-hidden="true" />
                    ) : (
                      <ArrowDownIcon size={12} aria-hidden="true" />
                    )}
                    {rupiah(Math.abs(delta)).replace(/,00$/, "")}
                  </span>
                )}
              </span>
              <span className="hint">{d.earnVs(bulanNama(lalu, lang))}</span>
              <span className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                <Pill tone="accent">
                  {r.reguler} {d.regular}
                </Pill>
                <Pill tone="violet">
                  {r.internasional} {d.intl}
                </Pill>
              </span>
            </>
          )}
        </div>
        <div className="dtfoot__chart" role="img" aria-label={d.earnWeeks}>
          {weeks.map((w) => (
            <Tooltip key={w.w} label={d.weekTip(w.w, w.n, rupiah(w.rp).replace(/,00$/, ""))}>
              <span className="dtfoot__wk" tabIndex={0}>
                <i
                  style={
                    { "--h": `${w.rp ? Math.max(8, (w.rp / max) * 100) : 4}%` } as CSSProperties
                  }
                  data-zero={w.rp ? undefined : "yes"}
                />
                <small className="mono">
                  {lang === "zh" ? `${w.w}周` : `${lang === "en" ? "W" : "M"}${w.w}`}
                </small>
              </span>
            </Tooltip>
          ))}
        </div>
        <div className="dtfoot__side">
          <span className="hint">{d.kas(kasPct, rupiah(r.kas).replace(/,00$/, ""))}</span>
          <span className="hint">{d.paidEnd}</span>
          <a className="btn btn--ghost btn--sm" href={href(lang, "/account")}>
            {d.details}
          </a>
        </div>
      </div>
      <div className="dtfoot__c">
        <div className="stack" style={{ gap: 4, minWidth: 0 }}>
          <span className="dtfoot__k">{d.fbLabel}</span>
          {!fb ? (
            <span className="skeleton" style={{ height: 28, width: 120 }} />
          ) : n === 0 ? (
            <span className="hint">{d.fbNone}</span>
          ) : (
            <>
              <span className="row" style={{ gap: 8, alignItems: "baseline" }}>
                <b className="mono dtfoot__big">
                  {avg.toLocaleString(localeOf(lang))}
                  <small>/5</small>
                </b>
                {!!fb.sejakBulanLalu && (
                  <Tooltip label={d.fbVs(bulanNama(lalu, lang))}>
                    <span
                      className="dtfoot__up"
                      tabIndex={0}
                      data-down={fb.sejakBulanLalu < 0 ? "yes" : undefined}
                    >
                      {fb.sejakBulanLalu > 0 ? (
                        <ArrowUpIcon size={12} aria-hidden="true" />
                      ) : (
                        <ArrowDownIcon size={12} aria-hidden="true" />
                      )}
                      {Math.abs(fb.sejakBulanLalu).toLocaleString(localeOf(lang))}
                    </span>
                  </Tooltip>
                )}
              </span>
              <span className="dtfoot__stars" aria-hidden="true">
                {[1, 2, 3, 4, 5].map((i) => (
                  <i
                    key={i}
                    style={
                      { "--f": `${Math.max(0, Math.min(1, avg - i + 1)) * 100}%` } as CSSProperties
                    }
                  />
                ))}
              </span>
              <span className="hint">{d.fbResponses(n)}</span>
            </>
          )}
        </div>
        <div className="dtfoot__dist" role="img" aria-label={d.fbSpread}>
          {[5, 4, 3, 2, 1].map((s) => {
            const c = fb?.sebaran[s - 1] ?? 0;
            return (
              <span key={s} className="dtfoot__dr">
                <small className="mono">{s}</small>
                <span className="dtfoot__db">
                  <i style={{ width: `${n ? (c / n) * 100 : 0}%` }} />
                </span>
                <small className="mono">{c}</small>
              </span>
            );
          })}
        </div>
        <div className="dtfoot__side">
          {quotes.length > 0 && (
            <Tooltip label={d.fbNext}>
              <button
                type="button"
                className="dtfoot__q"
                onClick={() => setQ((q + 1) % quotes.length)}
              >
                <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  {quotes[q % quotes.length].modul && (
                    <Pill modul={quotes[q % quotes.length].modul}>
                      {modulLabel(quotes[q % quotes.length].modul!, lang)}
                    </Pill>
                  )}
                  <time className="mono">
                    {tanggalPanjang(quotes[q % quotes.length].pada, lang)}
                  </time>
                </span>
                <q>{quotes[q % quotes.length].teks}</q>
              </button>
            </Tooltip>
          )}
          <a className="btn btn--ghost btn--sm" href={href(lang, "/reports")}>
            {d.all}
          </a>
        </div>
      </div>
    </section>
  );
}
