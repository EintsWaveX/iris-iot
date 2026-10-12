/**
 * Preparation (Phase 9 Stage 3, mockup c-prep): everything a session needs,
 * before it or during it.
 *
 * The head row names whose roster is open ("Roster for": every weekly slot
 * with a practicum, the makeup drafts, and a new makeup session) and the
 * server's Ready state. One tab line follows, each tab with its status lamp
 * and the open one's status line under it: Roster (the two-pane editor; while
 * a session runs, the group assistants come first), Module Access, Module
 * Brief, Kode Jurnal (the ASO division and Admins only, prep/CodeEditor.tsx),
 * Slides, Wiring Schematics and Server. Each tab is tinted by its state:
 * green when all is set, yellow when it needs a look, red when something
 * went wrong. Mode TOT has its own page (/tot, tot/TotPage.tsx). Switching
 * rosters with unsaved changes asks first: Save and Move, Discard, or Stay.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import * as RadixPopover from "@radix-ui/react-popover";
import {
  ArrowRightIcon,
  CaretDownIcon,
  CheckIcon,
  HardDrivesIcon,
  ListChecksIcon,
  LockSimpleIcon,
  MagnifyingGlassIcon,
  PlayIcon,
} from "@phosphor-icons/react";
import BackButton from "../ui/BackButton";
import TabLine from "../ui/TabLine";
import Dialog from "../ui/Dialog";
import Dropdown from "../ui/Dropdown";
import Fade from "../ui/Fade";
import { useDialogHost } from "../ui/dialogHost";
import { DateField, Stepper, TimeField } from "../ui/Controls";
import {
  dict,
  getJson,
  href,
  jamMenit,
  namaKelompok,
  postJson,
  sejak,
  tanggalPanjang,
  useMe,
} from "../../lib/app";
import { sendCommand } from "../server/ops";
import { hariIniWib, KELOMPOK_MAKS, SESI_CAP_MENIT, SLOT_MULAI } from "../../lib/jadwal";
import { menitDariJam, menitSekarangWib } from "../../lib/sesi-mulai";
import { hariDariTanggal, semesterDariTanggal } from "../../lib/jadwal-parser";
import { hariLabel, modulLabel, slotLabel } from "../../lib/labels";
import type { Kelas, Lang } from "../../lib/kelas";
import { pesan, type Strings } from "./strings";
import { AccessForm } from "./SessionBar";
import ChangeAssistant, { usePasangan } from "./ChangeAssistant";
import RosterEditor, { type RosterHandle, type RosterTarget } from "./prep/RosterEditor";
import BriefEditor from "./prep/BriefEditor";
import SchematicEditor from "./prep/SchematicEditor";
import SlidesEditor from "./prep/SlidesEditor";
import CodeEditor from "./prep/CodeEditor";
import RiwayatPanel from "./RiwayatPanel";
import { P, type Px } from "./prepStrings";
import { cekSiap, type Beranda } from "./AsistenHome";
import { H } from "./homeStrings";
import "../ui/Tabs.css";
import "./day.css";
import "./run.css";
import type { AsistenRef, Penugasan, RosterGroup, SesiRunning } from "./types";
import { useSiaran } from "../../lib/siaran";
import { useBelumSimpan } from "../../lib/belum-simpan";

interface JadwalRow {
  hari: number;
  slot: number;
  kelas: Kelas;
  status: string;
  asisten: string[];
}

interface Draf {
  id: number;
  tanggal: string;
  mulai: string;
  modul: number;
  jumlahKelompok: number;
}

const TABS = ["roster", "akses", "brief", "kode", "slides", "skema", "server"] as const;
export const PREP_TABS = TABS;

/** A tab's state: all set, needs a look, or something went wrong. */
type Tone = "ok" | "warn" | "bad";

/* Each section's status line, shown under the tabs while it is open. */
const PN = dict({
  id: {
    nav: "Bagian persiapan",
    ready: (a: number, b: number) => `${a}/${b} siap`,
    server: "Server",
    rosterNone: "Belum ada roster dipilih",
    briefSub: "Ringkasan per modul",
    kodeSub: "Kode jurnal dan kuncinya",
    skemaSub: "Bawaan dan tautan Wokwi",
    loadFail: "Status belum bisa dimuat. Coba muat ulang halaman.",
    rosterFail: "Jadwal belum bisa dimuat",
    srvOffline: (x: string) => `Pi tidak berdenyut sejak ${x}`,
    backKonsol: "Kembali ke Konsol",
    srvNone: "Belum ada server terdaftar",
    srvBeat: (x: string) => `denyut ${x}`,
    srvNoBeat: "belum ada denyut",
    pi: "Pi",
    check: "Cek Siap Praktikum",
    runCheck: "Jalankan Cek Sekarang",
    openServer: "Buka Server",
    sent: "Cek dijalankan di Pi. Hasilnya muncul di sini dalam beberapa detik.",
    backStart: "Kembali dan Mulai",
  },
  en: {
    nav: "Preparation sections",
    ready: (a: number, b: number) => `${a}/${b} ready`,
    server: "Server",
    rosterNone: "No roster picked yet",
    briefSub: "A brief per module",
    kodeSub: "Journal code and its keys",
    skemaSub: "Built in and Wokwi links",
    loadFail: "The status couldn't load. Try reloading the page.",
    rosterFail: "The schedule couldn't load",
    srvOffline: (x: string) => `No Pi heartbeat since ${x}`,
    backKonsol: "Back to the Console",
    srvNone: "No server registered yet",
    srvBeat: (x: string) => `beat ${x}`,
    srvNoBeat: "no heartbeat yet",
    pi: "Pi",
    check: "Ready check",
    runCheck: "Run the Check Now",
    openServer: "Open the Server",
    sent: "The check is running on the Pi. Its result shows here in a few seconds.",
    backStart: "Back and Start",
  },
  zh: {
    nav: "准备的部分",
    ready: (a: number, b: number) => `${a}/${b} 就绪`,
    server: "服务器",
    rosterNone: "还没选名单",
    briefSub: "每个模块的概要",
    kodeSub: "实验报告代码和答案",
    skemaSub: "内置和 Wokwi 链接",
    loadFail: "状态无法加载，请刷新页面。",
    rosterFail: "课表无法加载",
    srvOffline: (x: string) => `Pi 自 ${x} 起没有心跳`,
    backKonsol: "返回控制台",
    srvNone: "还没有注册服务器",
    srvBeat: (x: string) => `心跳 ${x}`,
    srvNoBeat: "还没有心跳",
    pi: "Pi",
    check: "上课就绪检查",
    runCheck: "现在检查",
    openServer: "打开服务器",
    sent: "检查正在 Pi 上运行，几秒后结果显示在这里。",
    backStart: "返回并开始",
  },
});

/** The slot the clock is in ("2-3"): today's first slot that hasn't ended
 *  (start plus the session cap), else the next day's first slot, Sunday
 *  skipped. Whether it has a practicum is decided by the schedule. */
function slotJam(): string {
  const hari = hariDariTanggal(hariIniWib());
  const m = menitSekarangWib();
  const s = [1, 2, 3, 4].find((n) => m < menitDariJam(SLOT_MULAI[n]) + SESI_CAP_MENIT);
  if (hari >= 1 && hari <= 6 && s) return `${hari}-${s}`;
  return `${hari >= 1 && hari < 6 ? hari + 1 : 1}-1`;
}
type Tab = (typeof TABS)[number];

export type PrepTab = Tab;

export default function PrepView({
  t,
  lang,
  sesi,
  roster,
  assign,
  meNim,
  onChanged,
  onBack,
  pilih = null,
  tab0 = "roster",
}: {
  t: Strings;
  lang: Lang;
  sesi: SesiRunning | null;
  roster: RosterGroup[];
  assign: Penugasan | null;
  meNim: string;
  meKode: string;
  onChanged: () => void;
  /** Standalone page (no session): shows Back and the page title. */
  onBack?: () => void;
  /** The roster to open first ("4-3" for a slot, "d12" for a draft). */
  pilih?: string | null;
  /** The tab to open first. */
  tab0?: Tab;
}) {
  const p = P[lang];
  const me = useMe();
  const bolehKode = me?.hak?.kode === true;
  const bolehJadwal = me?.hak?.jadwal === true;
  const tabs = TABS.filter((id) => id !== "kode" || bolehKode);
  const [tab, setTab] = useState<Tab>(tab0);
  // The Persiapan page keeps its tab in the address, so a reload or a
  // language switch opens the same tab (2026-10-07: it went back to the
  // default view).
  const standalone = !!onBack;
  useEffect(() => {
    if (!standalone) return;
    const want = tab === "roster" ? "" : `#${tab}`;
    if (location.hash !== want)
      history.replaceState(null, "", location.pathname + location.search + want);
  }, [tab, standalone]);
  const [jadwal, setJadwal] = useState<JadwalRow[] | null>(null);
  const [draf, setDraf] = useState<Draf[]>([]);
  const [sel, setSel] = useState<string | null>(pilih);
  const [dirty, setDirty] = useState(false);
  useBelumSimpan(dirty);
  const [ask, setAsk] = useState<string | null>(null);
  const [newDraft, setNewDraft] = useState(false);
  // The readiness checks (2026-10-06): the same ones as Home, each a way
  // to its fix; before, only a small chip linked to the server list.
  const [beranda, setBeranda] = useState<Beranda | null>(null);
  const [berandaGagal, setBerandaGagal] = useState(false);
  const [jadwalGagal, setJadwalGagal] = useState(false);
  const muatBeranda = () =>
    getJson<{ ok: boolean } & Beranda>("/api/session/beranda")
      .then((d) => {
        setBerandaGagal(!d.ok);
        if (d.ok) setBeranda(d);
      })
      .catch(() => setBerandaGagal(true));
  useSiaran(["akses", "server", "presentasi", "roster", "jadwal"], muatBeranda);
  const editor = useRef<RosterHandle>(null);

  const loadDraf = () =>
    getJson<{ ok: boolean; draf: Draf[] }>("/api/session/susulan")
      .then((d) => d.ok && setDraf(d.draf))
      .catch(() => {});
  useSiaran(["roster", "sesi"], loadDraf);
  useSiaran(["jadwal"], () => {
    getJson<{ ok: boolean; jadwal: JadwalRow[] }>(
      `/api/session/schedule?semester=${semesterDariTanggal(hariIniWib())}`,
    )
      .then((d) => d.ok && setJadwal(d.jadwal))
      .catch(() => {});
  });

  useEffect(() => {
    const today = hariIniWib();
    getJson<{ ok: boolean; jadwal: JadwalRow[] }>(
      `/api/session/schedule?semester=${semesterDariTanggal(today)}`,
    )
      .then((d) => {
        setJadwalGagal(!d.ok);
        setJadwal(d.ok ? d.jadwal : []);
      })
      .catch(() => {
        setJadwalGagal(true);
        setJadwal([]);
      });
    void loadDraf();
    void muatBeranda();
  }, []);

  const slots = useMemo(
    () => (jadwal ?? []).filter((j) => j.status === "aktif" && j.asisten.length > 0),
    [jadwal],
  );

  // The first roster to open: the running session's slot, else the slot
  // the clock is in (a slot without a practicum says so, see kosong).
  useEffect(() => {
    if (!jadwal || sel !== null) return;
    const jalan = sesi?.slot ? `${hariDariTanggal(sesi.tanggal)}-${sesi.slot}` : null;
    if (jalan) return setSel(jalan);
    if (sesi && !sesi.slot) {
      // A makeup session runs: its draft, when it is still listed.
      if (draf[0]) setSel(`d${draf[0].id}`);
      return;
    }
    // My own next slot with a practicum (2026-10-06: it opened the slot the
    // clock was in, often one without a practicum or someone else's), else
    // the slot the clock is in.
    const kini = slotJam();
    const [kh, ks] = kini.split("-").map(Number);
    const kode = (me?.kode ?? "").toUpperCase();
    const punyaku = slots
      .filter((j) => j.asisten.some((k) => k.toUpperCase() === kode))
      .sort((a, b) => a.hari - b.hari || a.slot - b.slot);
    const berikut =
      punyaku.find((j) => j.hari > kh || (j.hari === kh && j.slot >= ks)) ?? punyaku[0];
    setSel(berikut ? `${berikut.hari}-${berikut.slot}` : kini);
  }, [jadwal, draf]);

  // The picked slot when it has no practicum this semester: not in the
  // schedule, "Tidak Ada Praktikum", or "Segera" without its Asisten yet.
  const kosong = useMemo(() => {
    if (!sel || sel.startsWith("d") || !jadwal) return null;
    const [h, s] = sel.split("-").map(Number);
    if (slots.some((j) => j.hari === h && j.slot === s)) return null;
    const row = jadwal.find((j) => j.hari === h && j.slot === s);
    const urut = [...slots].sort((a, b) => a.hari - b.hari || a.slot - b.slot);
    const lanjut = urut.find((j) => j.hari > h || (j.hari === h && j.slot > s)) ?? urut[0];
    return {
      segera: row?.status === "segera" || (row?.status === "aktif" && row.asisten.length === 0),
      lanjut: lanjut ? `${lanjut.hari}-${lanjut.slot}` : null,
    };
  }, [sel, jadwal, slots]);

  const target: RosterTarget | null = useMemo(() => {
    if (!sel) return null;
    if (sel.startsWith("d")) return { jenis: "susulan", sesiId: Number(sel.slice(1)) };
    const [h, s] = sel.split("-").map(Number);
    const row = slots.find((j) => j.hari === h && j.slot === s);
    return row ? { jenis: "slot", hari: h, slot: s, kelas: row.kelas } : null;
  }, [sel, slots]);

  // The roster saves only for this slot's Asisten or the Jadwal right; a
  // makeup draft needs the full "pair" right (api/_lib/persiapan.ts).
  // Anyone else sees it read only, told why, instead of a refused save.
  const rosterRo: string | null = useMemo(() => {
    if (!target || bolehJadwal) return null;
    if (target.jenis === "susulan") return me?.hak?.pair === true ? null : p.rosterRoDraft;
    const row = slots.find((j) => j.hari === target.hari && j.slot === target.slot);
    const kode = (me?.kode ?? "").toUpperCase();
    return row?.asisten.some((k) => k.toUpperCase() === kode) ? null : p.rosterRoSlot;
  }, [target, bolehJadwal, slots, me, p]);

  const labelOf = (v: string | null): string => {
    if (!v) return "";
    if (v.startsWith("d")) {
      const d = draf.find((x) => x.id === Number(v.slice(1)));
      return d ? p.draftOpt(tanggalPanjang(d.tanggal, lang), d.mulai) : "";
    }
    const [h, s] = v.split("-").map(Number);
    return `${hariLabel(h, lang)} ${slotLabel(s, lang)}`;
  };

  const options = [
    // The slot the clock picked, when it has no practicum: listed so the
    // picker names it instead of showing the first slot.
    ...(kosong && sel
      ? [{ value: sel, label: `${labelOf(sel)} · ${kosong.segera ? p.segeraTag : p.kosongTag}` }]
      : []),
    ...slots.map((j) => ({
      value: `${j.hari}-${j.slot}`,
      label:
        p.slotOpt(hariLabel(j.hari, lang), j.slot, SLOT_MULAI[j.slot]) +
        (j.kelas === "internasional" ? ` · ${p.intl}` : ""),
    })),
    ...draf.map((d) => ({
      value: `d${d.id}`,
      label: p.draftOpt(tanggalPanjang(d.tanggal, lang), d.mulai),
    })),
    { value: "new", label: p.newDraft },
  ];

  function choose(v: string) {
    if (v === "new") return setNewDraft(true);
    if (v === sel) return;
    if (dirty) return setAsk(v);
    setSel(v);
  }

  // Each tab's colour and one line (2026-10-12): green all set, yellow look
  // at it, red something went wrong (a status that can't load, a silent Pi,
  // a failed Ready check).
  const pn = PN[lang];
  const cek = beranda ? cekSiap(beranda, 1, true, H[lang], lang) : [];
  const cekOf = (k: string) => cek.find((c) => c.key === k);
  const dariCek = (k: string, ganti?: string): { sub: string; tone?: Tone } =>
    berandaGagal && !beranda
      ? { sub: pn.loadFail, tone: "bad" }
      : {
          sub: cekOf(k)?.text ?? ganti ?? "",
          tone: !beranda ? undefined : cekOf(k)?.ok === false ? "warn" : "ok",
        };
  const srv = beranda?.server ?? null;
  const pingLama =
    !!srv && (!srv.denyutPada || Date.now() - Date.parse(srv.denyutPada) > 5 * 60_000);
  const nav: Record<Tab, { sub: string; tone?: Tone }> = {
    roster: jadwalGagal
      ? { sub: pn.rosterFail, tone: "bad" }
      : {
          sub: sel ? labelOf(sel) || pn.rosterNone : pn.rosterNone,
          tone: jadwal === null ? undefined : kosong || !target ? "warn" : "ok",
        },
    akses: dariCek("akses"),
    brief: {
      sub: pn.briefSub,
      tone: berandaGagal && !beranda ? "bad" : beranda ? "ok" : undefined,
    },
    kode: { sub: pn.kodeSub, tone: berandaGagal && !beranda ? "bad" : beranda ? "ok" : undefined },
    slides: dariCek("slides"),
    skema: dariCek("skema", pn.skemaSub),
    server: (() => {
      const d = dariCek("server");
      if (!beranda) return d;
      // No Pi at all, a Pi gone quiet, or a Ready check that failed today.
      if (!srv) return { sub: d.sub, tone: "bad" as const };
      if (pingLama)
        return {
          sub: srv.denyutPada
            ? pn.srvOffline(sejak(srv.denyutPada, lang, Date.now()))
            : pn.srvNoBeat,
          tone: "bad" as const,
        };
      const gagalHariIni =
        !!srv.siap?.waktu &&
        !srv.siap.lulus &&
        new Date(srv.siap.waktu).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }) ===
          hariIniWib();
      if (gagalHariIni) return { sub: d.sub, tone: "bad" as const };
      return d;
    })(),
  };
  const lit = tabs.filter((id) => nav[id].tone);
  const siapN = lit.filter((id) => nav[id].tone === "ok").length;
  const burukN = lit.filter((id) => nav[id].tone === "bad").length;

  const tablist = (
    <div className="prep12__tabs">
      <TabLine
        label={pn.nav}
        value={tab}
        onChange={setTab}
        tabs={tabs.map((id) => ({
          v: id,
          tone: nav[id].tone,
          label: (
            <span className="prep12__tab">
              <span
                className="lights__lamp"
                data-tone={nav[id].tone ?? "none"}
                aria-hidden="true"
              />
              {id === "server" ? pn.server : p.tabs[id]}
            </span>
          ),
        }))}
      />
      {nav[tab].sub && <span className="hint prep12__sub">{nav[tab].sub}</span>}
    </div>
  );

  return (
    <div className="prep">
      {onBack && <BackButton lang={lang} label={p.back} onClick={onBack} />}
      <div className="prep__head">
        {onBack && (
          <div className="page-header__heading">
            <span className="page-header__eyebrow">{p.eyebrow}</span>
            <h1 className="page-header__title">{p.title}</h1>
          </div>
        )}
        <div className="prep__tools">
          {onBack && (
            <button type="button" className="btn btn--primary" onClick={onBack}>
              <PlayIcon size={18} weight="fill" aria-hidden="true" />
              {sesi ? pn.backKonsol : pn.backStart}
            </button>
          )}
          {tab === "roster" && (
            <div className="prep__for">
              {options.length > 1 ? (
                <>
                  {/* The mockup's inline label; the Dropdown keeps its own
                      (visually hidden) label for screen readers. */}
                  <span className="prep__forlabel" aria-hidden="true">
                    {p.rosterFor}
                  </span>
                  <Dropdown
                    id="prep-for"
                    label={p.rosterFor}
                    hideLabel
                    value={sel ?? ""}
                    onChange={choose}
                    options={options}
                  />
                </>
              ) : (
                <span className="hint">{p.noSlots}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {beranda && lit.length > 0 && (
        <div className="row prep12__ready">
          <span
            className={`pill${burukN ? " pill--danger" : siapN < lit.length ? " pill--warn" : " pill--ok"}`}
          >
            {pn.ready(siapN, lit.length)}
          </span>
          <span className="hint">{p.readyLabel}</span>
        </div>
      )}

      <div className="prep12__grid">
        {tablist}

        <div className="prep12__body">
          <Fade k={tab}>
            {tab === "roster" && (
              <div className="stack">
                {sesi && (
                  <AssignmentPanel
                    t={t}
                    lang={lang}
                    sesi={sesi}
                    roster={roster}
                    assign={assign}
                    meNim={meNim}
                    onChanged={onChanged}
                  />
                )}
                {target ? (
                  <>
                    {rosterRo && (
                      <div className="banner banner--lock" role="note">
                        <LockSimpleIcon size={20} aria-hidden="true" />
                        <span>{rosterRo}</span>
                      </div>
                    )}
                    <div inert={!!rosterRo} className={rosterRo ? "prep__ro" : undefined}>
                      <RosterEditor
                        key={sel ?? ""}
                        ref={editor}
                        target={target}
                        label={labelOf(sel)}
                        p={p}
                        lang={lang}
                        onDirty={setDirty}
                      />
                    </div>
                  </>
                ) : kosong && sel ? (
                  <section className="panel panel--solo prep__kosong">
                    <div className="panel__head">
                      <h2 className="panel__title">{labelOf(sel)}</h2>
                      <span className={`pill${kosong.segera ? " pill--warn" : ""}`}>
                        {kosong.segera ? p.segeraTag : p.kosongTag}
                      </span>
                    </div>
                    <p>{kosong.segera ? p.segeraBody : p.kosongBody}</p>
                    <p className="hint">{p.kosongHint}</p>
                    {kosong.lanjut && (
                      <div className="row">
                        <button
                          type="button"
                          className="btn btn--primary"
                          onClick={() => choose(kosong.lanjut!)}
                        >
                          {p.bukaSlot(labelOf(kosong.lanjut))}
                          <ArrowRightIcon aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </section>
                ) : (
                  jadwal !== null && <p className="hint">{p.noSlots}</p>
                )}
              </div>
            )}
            {tab === "akses" && (
              <div className="stack">
                <section className="panel panel--solo">
                  <div className="panel__head">
                    <h2 className="panel__title">{t.accTitle}</h2>
                  </div>
                  <AccessForm t={t} lang={lang} bare />
                </section>
                <RiwayatPanel lang={lang} />
              </div>
            )}
            {tab === "slides" && <SlidesEditor lang={lang} />}
            {tab === "skema" && <SchematicEditor lang={lang} />}
            {tab === "brief" && <BriefEditor lang={lang} />}
            {tab === "kode" && bolehKode && <CodeEditor lang={lang} />}
            {tab === "server" && (
              <ServerSection lang={lang} beranda={beranda} onSent={muatBeranda} />
            )}
          </Fade>
        </div>
      </div>

      <Dialog
        open={ask !== null}
        onOpenChange={(o) => !o && setAsk(null)}
        title={p.unsavedTitle}
        description={p.unsavedBody(labelOf(sel))}
        size="sm"
        lang={lang}
        blocking
        foot="12"
        actions={
          <>
            <button
              type="button"
              className="btn btn--primary"
              onClick={async () => {
                const v = ask;
                if (await editor.current?.save()) {
                  setAsk(null);
                  setSel(v);
                }
              }}
            >
              {p.saveAndMove}
            </button>
            <button
              type="button"
              className="btn btn--danger-soft"
              onClick={() => {
                const v = ask;
                setAsk(null);
                setDirty(false);
                setSel(v);
              }}
            >
              {p.discard}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setAsk(null)}>
              {p.stay}
            </button>
          </>
        }
      />

      {newDraft && (
        <NewDraftDialog
          p={p}
          lang={lang}
          t={t}
          onClose={() => setNewDraft(false)}
          onCreated={async (id) => {
            await loadDraf();
            setSel(`d${id}`);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------ new draft */

function NewDraftDialog({
  p,
  t,
  lang,
  onClose,
  onCreated,
}: {
  p: Px;
  t: Strings;
  lang: Lang;
  onClose: () => void;
  onCreated: (id: number) => Promise<void>;
}) {
  const [tanggal, setTanggal] = useState(hariIniWib());
  const [jam, setJam] = useState("13:00");
  const [modul, setModul] = useState("1");
  const [jumlah, setJumlah] = useState(5);
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    const r = await postJson<{ ok: boolean; kode?: string; id?: number }>("/api/session/susulan", {
      tanggal,
      mulai: jam,
      modul: Number(modul),
      jumlahKelompok: jumlah,
    }).catch(() => ({ ok: false, kode: "gagal" }) as { ok: boolean; kode?: string; id?: number });
    setBusy(false);
    if (!r.ok || !r.id)
      return window.Toast?.show(p.errors[r.kode ?? "gagal"] ?? p.errors.gagal, "danger");
    window.Toast?.show(p.created, "ok");
    await onCreated(r.id);
    onClose();
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={p.draftTitle}
      description={p.draftDesc}
      lang={lang}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {p.cancel}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy}
            onClick={() => void create()}
          >
            {p.create}
          </button>
        </>
      }
    >
      <div className="draftgrid">
        <div className="field">
          <span className="field__label" id="dr-date">
            {p.date}
          </span>
          <DateField
            value={tanggal}
            onChange={setTanggal}
            label={p.date}
            labelledBy="dr-date"
            lang={lang}
            min={hariIniWib()}
          />
        </div>
        <div className="field">
          <span className="field__label" id="dr-time">
            {p.time}
          </span>
          <TimeField
            value={jam}
            onChange={setJam}
            label={p.time}
            labelledBy="dr-time"
            lang={lang}
            from={6}
          />
        </div>
        <Dropdown
          id="dr-mod"
          label={p.module}
          value={modul}
          onChange={setModul}
          options={[1, 2, 3, 4].map((m) => ({
            value: String(m),
            label: `${modulLabel(m, lang)} · ${t.modulNama(m)}`,
          }))}
        />
        <div className="field">
          <span className="field__label">{p.groups}</span>
          <Stepper
            value={jumlah}
            onChange={setJumlah}
            min={1}
            max={KELOMPOK_MAKS}
            label={p.groups}
            lessLabel={p.fewer}
            moreLabel={p.more}
          />
        </div>
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------ assignment */

/** Changing a group's assistant during a session, shared by the roster
 *  tab's assignment list and the live Preparation view: a free group is
 *  set straight away, a held one goes through the reason dialog. */
export function usePairing({
  t,
  lang,
  sesi,
  assign,
  meNim,
  onChanged,
}: {
  t: Strings;
  lang: Lang;
  sesi: SesiRunning;
  assign: Penugasan | null;
  meNim: string;
  onChanged: () => void;
}) {
  const byGroup = new Map((assign?.penugasan ?? []).map((p) => [p.kelompokId, p.asistenNim]));
  const [ask, setAsk] = useState<{ id: number; nomor: number; cur: string; pick: string } | null>(
    null,
  );
  const pasangan = usePasangan(sesi.id);
  const byNim = useMemo(() => new Map((assign?.asisten ?? []).map((a) => [a.nim, a])), [assign]);
  const awalOf = (kelompokId: number) => {
    const first = pasangan.list.find((x) => x.kelompokId === kelompokId);
    return first ? (first.awal ?? first.dari) : (byGroup.get(kelompokId) ?? null);
  };

  async function set(kelompokId: number, nomor: number, nim: string | null) {
    try {
      const r = await postJson<{ ok: boolean; kode?: string }>("/api/session/assignment", {
        sesiId: sesi.id,
        kelompokId,
        asistenNim: nim,
        alasan: nim ? "ubah" : "hapus",
      });
      if (!r.ok) {
        window.Toast?.show(pesan(t, r.kode), "danger");
        return;
      }
      const k = assign?.asisten.find((a) => a.nim === nim)?.kode ?? "";
      window.Toast?.show(nim ? t.assigned(nomor, k) : t.cleared(nomor), "ok");
      onChanged();
    } catch {
      window.Toast?.show(t.fail, "danger");
    }
  }

  const pick = (g: { id: number; nomor: number }, x: AsistenRef | null) => {
    const nim = byGroup.get(g.id) ?? null;
    if (!x || x.nim === nim) return;
    if (nim) setAsk({ id: g.id, nomor: g.nomor, cur: nim, pick: x.nim });
    else void set(g.id, g.nomor, x.nim);
  };

  const dialog = ask && (
    <ChangeAssistant
      t={t}
      lang={lang}
      open
      onOpenChange={(o) => !o && setAsk(null)}
      sesiId={sesi.id}
      kelompokId={ask.id}
      nomor={ask.nomor}
      cur={ask.cur}
      awal={awalOf(ask.id)}
      meNim={meNim}
      asisten={byNim}
      pick={ask.pick}
      onDone={() => {
        pasangan.reload();
        onChanged();
      }}
    />
  );

  return { byGroup, byNim, awalOf, pick, dialog };
}

function AssignmentPanel({
  t,
  lang,
  sesi,
  roster,
  assign,
  meNim,
  onChanged,
}: {
  t: Strings;
  lang: Lang;
  sesi: SesiRunning;
  roster: RosterGroup[];
  assign: Penugasan | null;
  meNim: string;
  onChanged: () => void;
}) {
  const pair = usePairing({ t, lang, sesi, assign, meNim, onChanged });
  const holds = new Map<string, number>();
  for (const nim of pair.byGroup.values()) holds.set(nim, (holds.get(nim) ?? 0) + 1);
  const groups = roster.filter((g) => g.aktif !== false);

  return (
    <section className="panel">
      <div className="panel__head">
        <div className="stack stack--sm">
          <h2 className="panel__title">{t.assignTitle}</h2>
          <p className="panel__sub">{t.assignSub}</p>
        </div>
      </div>
      {!assign?.jadwal && <p className="hint">{t.noSchedule}</p>}
      <ul className="assign">
        {groups.map((g) => {
          const nim = pair.byGroup.get(g.id) ?? null;
          const a = nim ? (assign?.asisten.find((x) => x.nim === nim) ?? null) : null;
          const n = nim ? (holds.get(nim) ?? 0) : 0;
          return (
            <li
              key={g.id}
              className="assign__row"
              style={{ "--g": `var(--group-${g.nomor})` } as CSSProperties}
            >
              <span className="assign__group">
                <span className="assign__num">{g.nomor}</span>
                <span className="stack" style={{ gap: 0 }}>
                  <b>{namaKelompok(g.nomor, g.nama)}</b>
                  <span className="hint truncate">
                    {g.anggota.map((m) => (m.nama ? m.nama.split(" ")[0] : m.nim)).join(", ")}
                  </span>
                </span>
                {n > 1 && <span className="pill pill--warn">{t.assignHolds(n)}</span>}
              </span>
              <AssistantPicker
                t={t}
                value={a}
                me={meNim}
                assign={assign}
                slotIndex={g.nomor - 1}
                onPick={(x) => pair.pick(g, x)}
              />
            </li>
          );
        })}
      </ul>
      {pair.dialog}
    </section>
  );
}

export function AssistantPicker({
  t,
  value,
  me,
  assign,
  slotIndex,
  onPick,
}: {
  t: Strings;
  value: AsistenRef | null;
  me: string;
  assign: Penugasan | null;
  slotIndex: number;
  onPick: (a: AsistenRef | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const dialogHost = useDialogHost();
  const [q, setQ] = useState("");
  const all = assign?.asisten ?? [];
  const byKode = useMemo(() => new Map(all.map((a) => [a.kode.toUpperCase(), a])), [all]);
  const sched = (assign?.jadwal?.asisten ?? [])
    .map((k) => byKode.get(k.toUpperCase()))
    .filter((a): a is AsistenRef => !!a);
  const subs = (assign?.jadwal?.pengganti ?? [])
    .map((p) => ({ a: byKode.get(p.kode.toUpperCase()), tag: p.tag }))
    .filter((x): x is { a: AsistenRef; tag: "fit" | "a24" | null } => !!x.a);
  const ql = q.trim().toLowerCase();
  const match = (a: AsistenRef) =>
    !ql || a.kode.toLowerCase().includes(ql) || a.nama.toLowerCase().includes(ql);
  const suggested = sched[slotIndex] ?? null;

  const row = (a: AsistenRef, tag?: "fit" | "a24" | null, star?: boolean) => (
    <button
      key={a.nim + (tag ?? "")}
      type="button"
      className="picker__row"
      aria-pressed={value?.nim === a.nim}
      onClick={() => {
        onPick(a);
        setOpen(false);
      }}
    >
      <span className="code-badge" data-me={a.nim === me ? "yes" : undefined}>
        {a.kode}
      </span>
      <span className="grow truncate">{a.nama}</span>
      {star && <span className="pill pill--accent">{t.assignFromSchedule}</span>}
      {tag === "fit" && <span className="pill pill--danger">{t.tagFit}</span>}
      {tag === "a24" && <span className="pill pill--gold">{t.tagA24}</span>}
      {value?.nim === a.nim && <CheckIcon size={18} aria-hidden="true" />}
    </button>
  );

  return (
    <RadixPopover.Root open={open} onOpenChange={setOpen}>
      <RadixPopover.Trigger asChild>
        <button type="button" className="picker__trigger">
          <span
            className={`code-badge${value ? "" : " code-badge--empty"}`}
            data-me={value?.nim === me ? "yes" : undefined}
          >
            {value?.kode ?? "?"}
          </span>
          <span className="grow truncate">{value?.nama ?? t.assignPick}</span>
          <CaretDownIcon size={18} aria-hidden="true" />
        </button>
      </RadixPopover.Trigger>
      {dialogHost.marker}
      <RadixPopover.Portal container={dialogHost.host}>
        <RadixPopover.Content
          className="console-pop picker sweep-edge"
          align="end"
          sideOffset={8}
          collisionPadding={12}
        >
          <label className="picker__search">
            <MagnifyingGlassIcon size={16} aria-hidden="true" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t.assignPick}
              autoFocus
              aria-label={t.assignPick}
            />
          </label>
          <div className="picker__list">
            {sched.filter(match).length > 0 && (
              <>
                <span className="label-caps">{t.assignFromSchedule}</span>
                {sched.filter(match).map((a) => row(a, null, a === suggested))}
              </>
            )}
            {subs.filter((x) => match(x.a)).length > 0 && (
              <>
                <span className="label-caps">{t.assignSubs}</span>
                {subs.filter((x) => match(x.a)).map((x) => row(x.a, x.tag))}
              </>
            )}
            <span className="label-caps">{t.filters.all}</span>
            {all.filter(match).map((a) => row(a))}
          </div>
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}

/* ------------------------------------------------------------- server */

/** Preparation's Server section (c12-prep): the Pi's heartbeat and the
 *  last Ready check as lights, Run the Check Now and Open the Server. */
function ServerSection({
  lang,
  beranda,
  onSent,
}: {
  lang: Lang;
  beranda: Beranda | null;
  onSent: () => void;
}) {
  const pn = PN[lang];
  const [busy, setBusy] = useState(false);
  const srv = beranda?.server ?? null;
  const cek = beranda
    ? cekSiap(beranda, 1, true, H[lang], lang).find((c) => c.key === "server")
    : null;
  if (!beranda) return <span className="skeleton" style={{ height: 160 }} />;
  if (!srv)
    return (
      <section className="panel panel--solo">
        <p>{pn.srvNone}</p>
        <div className="row">
          <a className="btn" href={href(lang, "/servers?dari=persiapan")}>
            <HardDrivesIcon size={18} aria-hidden="true" />
            {pn.openServer}
          </a>
        </div>
      </section>
    );
  const beatOk = !!srv.denyutPada && Date.now() - Date.parse(srv.denyutPada) < 5 * 60_000;
  return (
    <section className="panel panel--solo stack">
      <div className="panel__head">
        <h2 className="panel__title">{srv.nama}</h2>
      </div>
      <ul className="lights">
        <li className="lights__i" data-ok={beatOk ? "yes" : "no"}>
          <span className="lights__lamp" aria-hidden="true" />
          <span className="lights__txt">
            <b>{pn.pi}</b>
            <span className="hint">
              {srv.denyutPada ? pn.srvBeat(sejak(srv.denyutPada, lang, Date.now())) : pn.srvNoBeat}
            </span>
          </span>
        </li>
        <li className="lights__i" data-ok={cek?.ok ? "yes" : "no"}>
          <span className="lights__lamp" aria-hidden="true" />
          <span className="lights__txt">
            <b>{pn.check}</b>
            <span className="hint">
              {cek?.text}
              {srv.siap?.waktu ? ` · ${jamMenit(srv.siap.waktu, lang)}` : ""}
            </span>
          </span>
        </li>
      </ul>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const ok = await sendCommand(srv.id, "diag.siap", {}, lang, true);
            setBusy(false);
            if (ok) window.Toast?.show(pn.sent, "ok");
            onSent();
          }}
        >
          <ListChecksIcon size={18} aria-hidden="true" />
          {pn.runCheck}
        </button>
        <a className="btn" href={href(lang, `/servers?id=${srv.id}&dari=persiapan#siap`)}>
          <HardDrivesIcon size={18} aria-hidden="true" />
          {pn.openServer}
        </a>
      </div>
    </section>
  );
}
