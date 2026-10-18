/**
 * /schedule (Phase 9 Stage 4, mockups s-week and s-slot): the teaching
 * schedule, Asisten only.
 *
 * - The week grid, days by the four slots, from the semester's jadwal rows.
 *   For the semester in progress each cell shows the slot's next date: a
 *   holiday, izin (struck code, with the cover), covers and volunteers.
 *   International in violet, Soon in teal, No Practicum in the sheet's
 *   orange or red. Phones get one card per day.
 * - The weekly teaching load: every Asisten with their slots a week.
 * - Every slot opens the editor (SlotEditor) in a drawer. Leaving it with
 *   unsaved changes (another slot, the semester, closing, the page) asks
 *   first.
 * - The gear (the Schedule right): Schedule Settings, the start window's
 *   default and the bounds for slot Asisten.
 * - Impor dari Sheet opens the two-pane import (ImportView).
 * - Per Modul (ModulView) and the drawer are one (2026-10-15): the drawer's
 *   Buka Per Modul opens that slot there, its Lihat di Jadwal opens the
 *   slot's drawer here.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CalendarBlankIcon,
  CaretDownIcon,
  CaretUpIcon,
  GearSixIcon,
  LockSimpleIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import Drawer from "../ui/Drawer";
import Dropdown from "../ui/Dropdown";
import IconButton from "../ui/IconButton";
import Pill from "../ui/Pill";
import Tooltip from "../ui/Tooltip";
import { StateView } from "../ui/Display";
import { Stepper, Switch } from "../ui/Controls";
import { getJson, href, postJson, useMe } from "../../lib/app";
import { useMinWidth } from "../../lib/hooks";
import { hariIniWib, SLOT_MULAI } from "../../lib/jadwal";
import { hariDariTanggal, semesterDariTanggal } from "../../lib/jadwal-parser";
import { hariLabel, kelompokLabel, slotLabel as slotName } from "../../lib/labels";
import { mingguDepan, pasanganSemester, type MingguSlot } from "../../lib/penugasan-minggu";
import { JENDELA_MAX, JENDELA_MIN } from "../../lib/sesi-mulai";
import type { Lang } from "../../lib/kelas";
import SlotEditor, { type SlotEditorHandle } from "./SlotEditor";
import ImportView from "./ImportView";
import ModulView from "./ModulView";
import { J, pesanJ, type Jx } from "./strings";
import { HARI, SLOTS, type DataJadwal, type JadwalRow, type PengaturanJendela } from "./types";
import "./SchedulePage.css";
import { useSiaran } from "../../lib/siaran";
import { useBelumSimpan } from "../../lib/belum-simpan";

/* ------------------------------------------------------------ semesters */

const urut = (s: string) => {
  const [y, j] = s.split("-");
  return Number(y) * 2 + (j === "ganjil" ? 1 : 0);
};
const dariUrut = (n: number) => `${Math.floor(n / 2)}-${n % 2 ? "ganjil" : "genap"}`;
/** Odd 2026/2027 is the first semester the app knows. */
const PERTAMA = urut("2026-ganjil");

export function semesterPilihan(kini: string): string[] {
  const k = urut(kini);
  return [k - 1, k, k + 1, k + 2].filter((n) => n >= PERTAMA).map(dariUrut);
}

export function labelSemester(s: string, t: Jx): string {
  const [y, j] = s.split("-");
  const n = Number(y);
  return j === "ganjil" ? t.semesterLabel(true, n, n + 1) : t.semesterLabel(false, n - 1, n);
}

/* -------------------------------------------------------------- cells */

interface CellProps {
  t: Jx;
  lang: Lang;
  row: JadwalRow | undefined;
  minggu: MingguSlot | undefined;
  meKode: string;
  dim: boolean;
  known: Set<string>;
  label: string;
  onOpen: () => void;
}

function Cell({ t, lang, row, minggu: m, meKode, dim, known, label, onOpen }: CellProps) {
  const status = m?.status ?? row?.status ?? "kosong";
  const subs = row?.pengganti.length ?? 0;
  if (status === "libur")
    return (
      <button type="button" className="jcell jcell--libur" aria-label={label} onClick={onOpen}>
        <Pill lg>{t.holiday}</Pill>
        <span className="hint">{t.holidayHint(!!m && mingguDepan(m.tanggal, hariIniWib()))}</span>
      </button>
    );
  if (status === "kosong" || !row)
    return (
      <button
        type="button"
        className="jcell jcell--off"
        data-c={row?.warnaKosong ?? "oranye"}
        aria-label={label}
        onClick={onOpen}
      >
        <span className="jcell__off">{t.none}</span>
      </button>
    );
  const kursi =
    m?.kursi ??
    pasanganSemester(row.asisten, row.jumlahKelompok).map((k, i) => ({
      nomor: i + 1,
      kode: k,
      jenis: "tetap" as const,
      tetap: k,
      izin: false,
    }));
  const filled = kursi.filter((k) => k.kode || k.tetap).length;
  if (status === "segera" || filled === 0)
    return (
      <button
        type="button"
        className="jcell jcell--soon"
        data-st={status}
        aria-label={label}
        onClick={onOpen}
      >
        <Pill tone="teal" lg>
          {status === "segera" ? t.soon : t.active}
        </Pill>
        <span className="hint">{filled ? t.someAsisten(filled, kursi.length) : t.noAsisten}</span>
        <span className="hint">{t.subsCount(subs)}</span>
      </button>
    );
  const helpers = (m?.tugas ?? []).filter(
    (x) => x.status === "diterima" && x.kelompokNomor == null,
  );
  const code = (k: string, extra = "") => (
    <span
      className={["acode", k === meKode && "acode--me", !known.has(k) && "acode--unknown", extra]
        .filter(Boolean)
        .join(" ")}
    >
      {k}
    </span>
  );
  return (
    <button
      type="button"
      className={`jcell${row.kelas === "internasional" ? " jcell--intl" : ""}`}
      data-dim={dim ? "yes" : undefined}
      aria-label={label}
      onClick={onOpen}
    >
      {row.kelas === "internasional" && <Pill tone="violet">{t.inter}</Pill>}
      {kursi.map((k) => (
        <span key={k.nomor} className="jrow">
          <Pill group={k.nomor}>{kelompokLabel(k.nomor, lang)}</Pill>
          {k.izin && k.tetap ? (
            <Tooltip label={t.izinTip(k.tetap, k.kode)}>
              <span className="row jrow__codes" tabIndex={-1}>
                {code(k.tetap, "acode--izin")}
                {k.kode && code(k.kode)}
              </span>
            </Tooltip>
          ) : k.kode ? (
            <span className="row jrow__codes">
              {code(k.kode, k.jenis !== "tetap" ? `acode--${k.jenis}` : "")}
            </span>
          ) : (
            <span className="hint">{t.noneYet}</span>
          )}
        </span>
      ))}
      {helpers.length > 0 && (
        <span className="row jrow__codes">
          {helpers.map((h) => code(h.kode, "acode--sukarela"))}
        </span>
      )}
      {subs > 0 && <span className="hint">{t.subsMore(subs)}</span>}
    </button>
  );
}

/* --------------------------------------------------------------- load */

function LoadPanel({
  t,
  lang,
  rows,
  meKode,
  nama,
}: {
  t: Jx;
  lang: Lang;
  rows: JadwalRow[];
  meKode: string;
  nama: Map<string, string>;
}) {
  const phone = !useMinWidth(640);
  const [shut, setShut] = useState(phone);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => setShut(phone), [phone]);
  const list = useMemo(() => {
    const m = new Map<string, JadwalRow[]>();
    for (const j of rows) {
      if (j.status === "kosong") continue;
      for (const k of new Set(pasanganSemester(j.asisten, j.jumlahKelompok)))
        if (k) m.set(k, [...(m.get(k) ?? []), j]);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [rows]);
  return (
    <section className="panel loadcard">
      <div className="panel__head">
        <h2 className="panel__title">{t.loadTitle}</h2>
        {phone ? (
          <IconButton
            icon={shut ? CaretDownIcon : CaretUpIcon}
            label={shut ? t.showList : t.hideList}
            sm
            onClick={() => setShut(!shut)}
          />
        ) : (
          <Pill>{t.loadCount(list.length)}</Pill>
        )}
      </div>
      {!shut && (
        <div className="loadlist">
          {list.map(([k, slots]) => (
            <div key={k} className="loadrow" data-open={open === k ? "yes" : undefined}>
              <button
                type="button"
                className="loadrow__btn"
                aria-expanded={open === k}
                onClick={() => setOpen(open === k ? null : k)}
              >
                <span className={`acode${k === meKode ? " acode--me" : ""}`}>{k}</span>
                <span className="loadrow__name">
                  {nama.get(k) ?? <Pill tone="danger">{t.unknownCode}</Pill>}
                </span>
                <Pill tone={slots.length >= 3 ? "warn" : undefined}>
                  {t.sessions(slots.length)}
                </Pill>
                <CaretDownIcon size={16} aria-hidden="true" className="loadrow__caret" />
              </button>
              {open === k && (
                <div className="loadrow__slots">
                  {slots.map((j) => (
                    <Pill key={j.id}>
                      {hariLabel(j.hari, lang)} · {SLOT_MULAI[j.slot]}
                    </Pill>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------ settings */

function Settings({
  t,
  lang,
  jendela,
  onClose,
  onSaved,
}: {
  t: Jx;
  lang: Lang;
  jendela: PengaturanJendela;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [d, setD] = useState(jendela.default);
  const [mn, setMn] = useState(jendela.min);
  const [mx, setMx] = useState(jendela.max);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t.setTitle}
      lang={lang}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t.cancel}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await postJson<{ ok: boolean; kode?: string }>("/api/session/penugasan", {
                aksi: "pengaturan",
                default: d,
                min: mn,
                max: mx,
              }).catch(() => ({ ok: false, kode: undefined }));
              setBusy(false);
              if (!r.ok) return window.Toast?.show(pesanJ(t, r.kode), "danger");
              window.Toast?.show(t.setSaved, "ok");
              onSaved();
              onClose();
            }}
          >
            {t.save}
          </button>
        </>
      }
    >
      <div className="stack stack--lg jset">
        <div className="field">
          <span className="field__label">{t.setDefault}</span>
          <Stepper
            value={d}
            onChange={setD}
            min={mn}
            max={mx}
            step={5}
            label={t.setDefault}
            fmt={t.minutes}
            lessLabel={t.fewer}
            moreLabel={t.more}
          />
          <span className="field__hint">{t.setDefaultHint}</span>
        </div>
        <div className="grid-2 jset__bounds">
          <div className="field">
            <span className="field__label">{t.setMin}</span>
            <Stepper
              value={mn}
              onChange={setMn}
              min={JENDELA_MIN}
              max={d}
              step={5}
              label={t.setMin}
              fmt={t.minutes}
              lessLabel={t.fewer}
              moreLabel={t.more}
            />
          </div>
          <div className="field">
            <span className="field__label">{t.setMax}</span>
            <Stepper
              value={mx}
              onChange={setMx}
              min={d}
              max={JENDELA_MAX}
              step={5}
              label={t.setMax}
              fmt={t.minutes}
              lessLabel={t.fewer}
              moreLabel={t.more}
            />
          </div>
        </div>
        <span className="hint">{t.setHint}</span>
      </div>
    </Dialog>
  );
}

/* --------------------------------------------------------------- page */

type Tujuan =
  | { hari: number; slot: number }
  | { semester: string }
  | { perModul: { hari: number; slot: number } }
  | "tutup";

export default function SchedulePage({ lang }: { lang: Lang }) {
  const t = J[lang];
  const me = useMe();
  const kini = semesterDariTanggal(hariIniWib());
  const [semester, setSemester] = useState(kini);
  const [data, setData] = useState<DataJadwal | null>(null);
  const [err, setErr] = useState(false);
  const [sel, setSel] = useState<{ hari: number; slot: number } | null>(null);
  const [highlight, setHighlight] = useState(false);
  const [view, setView] = useState<"week" | "import" | "modul">("week");
  // The slot the drawer's Buka Per Modul came from, flashed there
  const [sorotModul, setSorotModul] = useState<{ hari: number; slot: number } | null>(null);
  const [setting, setSetting] = useState(false);
  const [dirty, setDirty] = useState(false);
  useBelumSimpan(dirty);
  const [ask, setAsk] = useState<Tujuan | null>(null);
  const editor = useRef<SlotEditorHandle>(null);
  const grid = useMinWidth(640);
  const narrow = !useMinWidth(820);
  const wide = useMinWidth(1440);
  // Konsol's Jadwal Saya Minggu Ini (2026-10-12): ?sorot=1 turns Sorot Kode
  // Saya on, and &slot=hari-slot flashes that slot once the week is drawn.
  const [fokus, setFokus] = useState<{ hari: number; slot: number } | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get("sorot") === "1") setHighlight(true);
    const [h, s] = (q.get("slot") ?? "").split("-").map(Number);
    if ((HARI as readonly number[]).includes(h) && (SLOTS as readonly number[]).includes(s))
      setFokus({ hari: h, slot: s });
  }, []);

  useEffect(() => {
    if (!fokus || !data) return;
    const label = `${hariLabel(fokus.hari, lang)} · ${slotName(fokus.slot, lang)} · ${SLOT_MULAI[fokus.slot]}`;
    const id = requestAnimationFrame(() => {
      const el = [...document.querySelectorAll<HTMLElement>(".jpage [aria-label]")].find(
        (x) => x.getAttribute("aria-label") === label,
      );
      if (!el) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.dataset.fokus = "yes";
      window.setTimeout(() => delete el.dataset.fokus, 3200);
      setFokus(null);
    });
    return () => cancelAnimationFrame(id);
  }, [fokus, data]);

  function load() {
    setErr(false);
    getJson<{ ok: boolean } & DataJadwal>(`/api/session/schedule?semester=${semester}`)
      .then((d) => {
        if (!d.ok) throw new Error();
        setData(d);
      })
      .catch(() => setErr(true));
  }
  useEffect(() => {
    if (me?.role === "asisten") load();
  }, [me, semester]);
  // Someone else's change shows at once, unless this page has unsaved edits.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useSiaran(["jadwal", "tim"], () => !dirtyRef.current && load(), me?.role === "asisten");

  // Leaving the page with unsaved changes asks the browser's own question.
  useEffect(() => {
    if (!dirty) return;
    const on = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", on);
    return () => window.removeEventListener("beforeunload", on);
  }, [dirty]);

  const meKode = (me?.kode ?? "").toUpperCase();
  const bolehJadwal = me?.hak?.jadwal !== false && !!me?.hak;
  const bolehModul = me?.hak?.jadwal === true;
  const known = useMemo(
    () => new Set((data?.asisten ?? []).map((a) => a.kode.toUpperCase())),
    [data],
  );
  const namaKode = useMemo(
    () => new Map((data?.asisten ?? []).map((a) => [a.kode.toUpperCase(), a.nama])),
    [data],
  );

  if (me === undefined) return <span className="skeleton" style={{ height: 420 }} />;
  if (me?.role !== "asisten") {
    return (
      <StateView
        icon={<LockSimpleIcon size={28} />}
        title={t.forbiddenH}
        body={t.forbidden}
        actions={
          <a className="btn btn--primary" href={href(lang, "/")}>
            {t.home}
          </a>
        }
      />
    );
  }
  if (err) {
    return (
      <StateView
        tone="danger"
        icon={<CalendarBlankIcon size={28} />}
        title={t.loadFail}
        actions={
          <button type="button" className="btn btn--primary" onClick={load}>
            {t.retry}
          </button>
        }
      />
    );
  }

  if (view === "modul" && data && bolehModul) {
    return (
      <ModulView
        key={semester}
        lang={lang}
        semester={semester}
        data={data}
        meKode={meKode}
        boleh={bolehModul}
        onBack={() => {
          setSorotModul(null);
          setView("week");
        }}
        onSaved={load}
        sorot={sorotModul}
        onJadwal={(hari, slot) => {
          setSorotModul(null);
          setView("week");
          setSel({ hari, slot });
        }}
      />
    );
  }

  if (view === "import" && data) {
    return (
      <ImportView
        lang={lang}
        semester={semester}
        semesterLabel={labelSemester(semester, t)}
        data={data}
        meKode={meKode}
        onBack={() => setView("week")}
        onDone={() => {
          setView("week");
          load();
        }}
      />
    );
  }

  const rows = data?.jadwal ?? [];
  const rowAt = (h: number, s: number) => rows.find((r) => r.hari === h && r.slot === s);
  const mingguOf = (r: JadwalRow | undefined) => (r ? data?.minggu[String(r.id)] : undefined);
  const today = semester === kini ? hariDariTanggal(hariIniWib()) : -1;
  const slotLabel = (h: number, s: number) =>
    `${hariLabel(h, lang)} · ${slotName(s, lang)} · ${SLOT_MULAI[s]}`;
  const mine = (r: JadwalRow | undefined, m: MingguSlot | undefined) =>
    !!r &&
    (m
      ? m.kursi.some((k) => k.kode === meKode) ||
        m.tugas.some((x) => x.kode === meKode && x.status === "diterima")
      : pasanganSemester(r.asisten, r.jumlahKelompok).includes(meKode));

  function pergi(to: Tujuan) {
    setAsk(null);
    setDirty(false);
    if (to === "tutup") setSel(null);
    else if ("semester" in to) {
      setSel(null);
      setSemester(to.semester);
      setData(null);
    } else if ("perModul" in to) {
      setSel(null);
      setSorotModul(to.perModul);
      setView("modul");
    } else setSel(to);
  }
  const coba = (to: Tujuan) => (dirty ? setAsk(to) : pergi(to));

  const cell = (h: number, s: number) => {
    const r = rowAt(h, s);
    const m = mingguOf(r);
    return (
      <Cell
        key={`${h}-${s}`}
        t={t}
        lang={lang}
        row={r}
        minggu={m}
        meKode={meKode}
        dim={highlight && !mine(r, m)}
        known={known}
        label={slotLabel(h, s)}
        onOpen={() => (sel?.hari === h && sel.slot === s ? undefined : coba({ hari: h, slot: s }))}
      />
    );
  };

  // A slot with no practicum this week (phones fold these into one line).
  const kosongAt = (h: number, s: number) => {
    const r = rowAt(h, s);
    return !r || (mingguOf(r)?.status ?? r.status) === "kosong";
  };

  const selRow = sel ? rowAt(sel.hari, sel.slot) : undefined;
  const selM = mingguOf(selRow);
  const onSelSlot =
    !!selM &&
    (selM.kursi.some((k) => k.kode === meKode) ||
      (selRow?.pengganti ?? []).some((p) => p.kode.toUpperCase() === meKode));

  return (
    <div className="jpage">
      <div className="jpage__head">
        <div className="page-header__heading">
          <span className="page-header__eyebrow">{t.eyebrow}</span>
          <h1 className="page-header__title">{t.title}</h1>
        </div>
        <div className="jtools">
          <div className="jtools__sem">
            <Dropdown
              id="jadwal-semester"
              label={t.semester}
              hideLabel
              options={semesterPilihan(kini).map((s) => ({ value: s, label: labelSemester(s, t) }))}
              value={semester}
              onChange={(v) => v !== semester && coba({ semester: v })}
            />
          </div>
          <label className="togglechip">
            <Switch on={highlight} onChange={setHighlight} label={t.mine} />
            <span>{t.mine}</span>
          </label>
          {bolehModul && (
            <button type="button" className="btn" onClick={() => setView("modul")}>
              {t.pm.open}
            </button>
          )}
          {bolehJadwal &&
            (narrow ? (
              <IconButton
                icon={UploadSimpleIcon}
                label={t.import}
                onClick={() => setView("import")}
              />
            ) : (
              <button type="button" className="btn" onClick={() => setView("import")}>
                {t.import}
              </button>
            ))}
          {bolehJadwal && (
            <IconButton icon={GearSixIcon} label={t.settings} onClick={() => setSetting(true)} />
          )}
        </div>
      </div>

      <div className="jlegend">
        {[1, 2, 3, 4, 5].map((g) => (
          <Pill key={g} group={g}>
            {kelompokLabel(g, lang)}
          </Pill>
        ))}
        <Pill tone="violet">{t.inter}</Pill>
        <span className="pill jswatch" data-c="segera">
          {t.soon}
        </span>
        {/* One chip for both colours (2026-10-06): two identical labels
            read as two different states. */}
        <Tooltip label={t.statusHint.kosong}>
          <span className="pill jswatch" data-c="kosong" tabIndex={0}>
            {t.none}
          </span>
        </Tooltip>
        <Tooltip label={t.fitTip}>
          <span tabIndex={0}>
            <Pill tone="fit">{t.fit}</Pill>
          </span>
        </Tooltip>
        <Tooltip label={t.a24Tip}>
          <span tabIndex={0}>
            <Pill tone="a24">{t.a24}</Pill>
          </span>
        </Tooltip>
        <span className="row jlegend__izin">
          <span className="acode acode--izin">ABC</span>
          <span className="hint">{t.onLeave}</span>
        </span>
        <span className="pill jswatch" data-c="libur">
          {t.holiday}
        </span>
      </div>

      {/* The cells open the slot editor; nothing on them said so. */}
      <p className="hint">{bolehJadwal ? t.gridHint : t.gridHintRo}</p>

      <div className="jlayout" data-wide={wide ? "yes" : undefined}>
        <div className="jlayout__main">
          {!data ? (
            <span className="skeleton" style={{ height: 520 }} />
          ) : grid ? (
            <div className="jgrid-scroll">
              <div className="jgrid" role="grid" aria-label={t.title}>
                <span />
                {SLOTS.map((s) => (
                  <span key={s} className="jgrid__h" role="columnheader">
                    {slotName(s, lang)}
                    <b className="num">{SLOT_MULAI[s]}</b>
                  </span>
                ))}
                {HARI.map((h) => (
                  <div key={h} className="jgrid__row" role="row">
                    <span
                      className="jgrid__day"
                      data-today={h === today ? "yes" : undefined}
                      role="rowheader"
                    >
                      {hariLabel(h, lang)}
                      {h === today && <Pill tone="accent">{t.today}</Pill>}
                    </span>
                    {SLOTS.map((s) => cell(h, s))}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="jdays">
              {HARI.map((h) => (
                <DayCard
                  key={h}
                  open0={h === today || h === fokus?.hari || (today < 1 && h === 1)}
                  title={hariLabel(h, lang)}
                  today={h === today ? t.today : null}
                >
                  {SLOTS.filter((s) => !kosongAt(h, s)).map((s) => (
                    <div key={s} className="jdays__slot">
                      <span className="hint">
                        {slotName(s, lang)} · {SLOT_MULAI[s]}
                      </span>
                      {cell(h, s)}
                    </div>
                  ))}
                  {SLOTS.some((s) => kosongAt(h, s)) && (
                    <div className="jdays__off">
                      <span className="hint">{t.none}</span>
                      <span className="row">
                        {SLOTS.filter((s) => kosongAt(h, s)).map((s) => (
                          <button
                            key={s}
                            type="button"
                            className="pill pill--button"
                            aria-label={slotLabel(h, s)}
                            onClick={() => coba({ hari: h, slot: s })}
                          >
                            {slotName(s, lang)} · {SLOT_MULAI[s]}
                          </button>
                        ))}
                      </span>
                    </div>
                  )}
                </DayCard>
              ))}
            </div>
          )}
        </div>
        {data && <LoadPanel t={t} lang={lang} rows={rows} meKode={meKode} nama={namaKode} />}
      </div>

      <Drawer
        open={sel !== null}
        onOpenChange={(o) => !o && coba("tutup")}
        title={t.editH}
        description={sel ? slotLabel(sel.hari, sel.slot) : undefined}
        storeKey="jadwal-p9"
        minWidth={360}
        closeLabel={t.close}
        resizeLabel={t.resize}
        foot={
          sel && (
            <>
              {dirty && (
                <span className="drawer__alt">
                  <Pill tone="warn">{t.notSaved}</Pill>
                </span>
              )}
              <button type="button" className="btn btn--ghost" onClick={() => coba("tutup")}>
                {bolehJadwal || onSelSlot ? t.cancel : t.close}
              </button>
              {(bolehJadwal || onSelSlot) && (
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={!dirty}
                  onClick={async () => {
                    if (await editor.current?.save()) {
                      setDirty(false);
                      setSel(null);
                    }
                  }}
                >
                  {t.save}
                </button>
              )}
            </>
          )
        }
      >
        {sel && data && (
          <SlotEditor
            ref={editor}
            key={`${semester}-${sel.hari}-${sel.slot}-${selRow?.id ?? 0}`}
            t={t}
            lang={lang}
            semester={semester}
            kini={semester === kini}
            hari={sel.hari}
            slot={sel.slot}
            row={selRow}
            minggu={selM}
            orang={data.asisten}
            jendela={data.jendela}
            meKode={meKode}
            meNim={me.nim}
            klp={data.klp?.[`${sel.hari}-${sel.slot}`]}
            bolehJadwal={bolehJadwal}
            bolehModul={bolehModul}
            diajar={selRow ? data.diajar?.[String(selRow.id)] : undefined}
            onPerModul={
              bolehModul ? () => coba({ perModul: { hari: sel.hari, slot: sel.slot } }) : undefined
            }
            onDirty={setDirty}
            onSaved={load}
          />
        )}
      </Drawer>

      <Dialog
        open={ask !== null}
        onOpenChange={(o) => !o && setAsk(null)}
        title={t.unsavedTitle}
        description={sel ? t.unsavedBody(slotLabel(sel.hari, sel.slot)) : undefined}
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
                const to = ask;
                if (to && (await editor.current?.save())) pergi(to);
              }}
            >
              {t.saveAndMove}
            </button>
            <button
              type="button"
              className="btn btn--danger-soft"
              onClick={() => ask && pergi(ask)}
            >
              {t.discard}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setAsk(null)}>
              {t.stay}
            </button>
          </>
        }
      />

      {setting && data && (
        <Settings
          t={t}
          lang={lang}
          jendela={data.jendela}
          onClose={() => setSetting(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}

function DayCard({
  open0,
  title,
  today,
  children,
}: {
  open0: boolean;
  title: string;
  today: string | null;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(open0);
  return (
    <section className="panel jdays__day" data-open={open ? "yes" : undefined}>
      <button
        type="button"
        className="jdays__head"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <b>{title}</b>
        {today && <Pill tone="accent">{today}</Pill>}
        <CaretDownIcon size={18} aria-hidden="true" className="jdays__caret" />
      </button>
      {open && <div className="jdays__slots">{children}</div>}
    </section>
  );
}
