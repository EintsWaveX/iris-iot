/**
 * Preparation (Phase 9 Stage 3, mockup c-prep): everything a session needs,
 * before it or during it.
 *
 * The head row names whose roster is open ("Roster for": every weekly slot
 * with a practicum, the makeup drafts, and a new makeup session) and the
 * server's Ready state. Five tabs follow: Roster (the two-pane editor; while
 * a session runs, the group assistants come first), Module Access, Slides,
 * Wiring Schematics and Module Brief. Switching rosters with unsaved
 * changes asks first: Save and Move, Discard, or Stay.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import * as RadixPopover from "@radix-ui/react-popover";
import {
  ArrowRightIcon,
  CaretDownIcon,
  CheckIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import BackButton from "../ui/BackButton";
import Dialog from "../ui/Dialog";
import Dropdown from "../ui/Dropdown";
import Fade from "../ui/Fade";
import { DateField, Stepper, TimeField } from "../ui/Controls";
import { getJson, href, namaKelompok, postJson, tanggalPanjang } from "../../lib/app";
import { hariIniWib, KELOMPOK_MAKS, SLOT_MULAI } from "../../lib/jadwal";
import { hariDariTanggal, semesterDariTanggal } from "../../lib/jadwal-parser";
import { hariLabel, modulLabel } from "../../lib/labels";
import type { Kelas, Lang } from "../../lib/kelas";
import { pesan, type Strings } from "./strings";
import { AccessForm } from "./SessionBar";
import ChangeAssistant, { usePasangan } from "./ChangeAssistant";
import RosterEditor, { type RosterHandle, type RosterTarget } from "./prep/RosterEditor";
import BriefEditor from "./prep/BriefEditor";
import SchematicEditor from "./prep/SchematicEditor";
import SlidesEditor from "./prep/SlidesEditor";
import { P, type Px } from "./prepStrings";
import "../ui/Tabs.css";
import type { AsistenRef, Penugasan, RosterGroup, SesiRunning } from "./types";

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

const TABS = ["roster", "akses", "slides", "skema", "brief"] as const;
type Tab = (typeof TABS)[number];

export default function PrepView({
  t,
  lang,
  sesi,
  roster,
  assign,
  meNim,
  meKode,
  onChanged,
  onBack,
  pilih = null,
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
}) {
  const p = P[lang];
  const [tab, setTab] = useState<Tab>("roster");
  const [jadwal, setJadwal] = useState<JadwalRow[] | null>(null);
  const [draf, setDraf] = useState<Draf[]>([]);
  const [sel, setSel] = useState<string | null>(pilih);
  const [dirty, setDirty] = useState(false);
  const [ask, setAsk] = useState<string | null>(null);
  const [newDraft, setNewDraft] = useState(false);
  const [server, setServer] = useState<{ siap: boolean } | null>(null);
  const editor = useRef<RosterHandle>(null);

  const loadDraf = () =>
    getJson<{ ok: boolean; draf: Draf[] }>("/api/session/susulan")
      .then((d) => d.ok && setDraf(d.draf))
      .catch(() => {});

  useEffect(() => {
    const today = hariIniWib();
    getJson<{ ok: boolean; jadwal: JadwalRow[] }>(
      `/api/session/schedule?semester=${semesterDariTanggal(today)}`,
    )
      .then((d) => setJadwal(d.ok ? d.jadwal : []))
      .catch(() => setJadwal([]));
    void loadDraf();
    getJson<{
      ok: boolean;
      server: { siap: { lulus: boolean; waktu: string | null } | null } | null;
    }>("/api/session/beranda")
      .then((d) => {
        const s = d.server?.siap;
        const hariIni =
          !!s?.waktu &&
          new Date(s.waktu).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }) === today;
        setServer({ siap: !!s?.lulus && hariIni });
      })
      .catch(() => {});
  }, []);

  const slots = useMemo(
    () => (jadwal ?? []).filter((j) => j.status === "aktif" && j.asisten.length > 0),
    [jadwal],
  );

  // The first roster to open: the running session's slot, else my slot
  // today, else my first slot this week, else the first slot.
  useEffect(() => {
    if (!jadwal || sel !== null) return;
    const mine = (j: JadwalRow) => j.asisten.some((k) => k.toUpperCase() === meKode);
    const hari = hariDariTanggal(hariIniWib());
    const pick =
      (sesi?.slot
        ? slots.find((j) => j.hari === hariDariTanggal(sesi.tanggal) && j.slot === sesi.slot)
        : undefined) ??
      slots.find((j) => j.hari === hari && mine(j)) ??
      slots.find(mine) ??
      slots[0];
    if (pick) setSel(`${pick.hari}-${pick.slot}`);
    else if (draf[0]) setSel(`d${draf[0].id}`);
  }, [jadwal, draf]);

  const target: RosterTarget | null = useMemo(() => {
    if (!sel) return null;
    if (sel.startsWith("d")) return { jenis: "susulan", sesiId: Number(sel.slice(1)) };
    const [h, s] = sel.split("-").map(Number);
    const row = slots.find((j) => j.hari === h && j.slot === s);
    return row ? { jenis: "slot", hari: h, slot: s, kelas: row.kelas } : null;
  }, [sel, slots]);

  const labelOf = (v: string | null): string => {
    if (!v) return "";
    if (v.startsWith("d")) {
      const d = draf.find((x) => x.id === Number(v.slice(1)));
      return d ? p.draftOpt(tanggalPanjang(d.tanggal, lang), d.mulai.replace(":", ".")) : "";
    }
    const [h, s] = v.split("-").map(Number);
    return `${hariLabel(h, lang)} slot ${s}`;
  };

  const options = [
    ...slots.map((j) => ({
      value: `${j.hari}-${j.slot}`,
      label:
        p.slotOpt(hariLabel(j.hari, lang), j.slot, SLOT_MULAI[j.slot].replace(":", ".")) +
        (j.kelas === "internasional" ? ` · ${p.intl}` : ""),
    })),
    ...draf.map((d) => ({
      value: `d${d.id}`,
      label: p.draftOpt(tanggalPanjang(d.tanggal, lang), d.mulai.replace(":", ".")),
    })),
    { value: "new", label: p.newDraft },
  ];

  function choose(v: string) {
    if (v === "new") return setNewDraft(true);
    if (v === sel) return;
    if (dirty) return setAsk(v);
    setSel(v);
  }

  const tablist = (
    <div className="tabs-scroll">
      <nav className="tabs" role="tablist" aria-label={p.title}>
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            tabIndex={tab === id ? 0 : -1}
            className="tabs__tab"
            onClick={() => setTab(id)}
          >
            {p.tabs[id]}
          </button>
        ))}
      </nav>
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
          <a className="srvchip" href={`${href(lang, "/servers")}#siap`}>
            <span className={`dot ${server?.siap ? "dot--ok" : "dot--warn"}`} aria-hidden="true" />
            {server?.siap ? p.serverReady : p.serverCheck}
            <ArrowRightIcon size={14} aria-hidden="true" />
          </a>
        </div>
      </div>

      {tablist}

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
              <RosterEditor
                key={sel ?? ""}
                ref={editor}
                target={target}
                label={labelOf(sel)}
                p={p}
                lang={lang}
                onDirty={setDirty}
              />
            ) : (
              jadwal !== null && <p className="hint">{p.noSlots}</p>
            )}
          </div>
        )}
        {tab === "akses" && (
          <section className="panel panel--solo">
            <div className="panel__head">
              <h2 className="panel__title">{t.accTitle}</h2>
            </div>
            <AccessForm t={t} lang={lang} bare />
          </section>
        )}
        {tab === "slides" && <SlidesEditor lang={lang} />}
        {tab === "skema" && <SchematicEditor lang={lang} />}
        {tab === "brief" && <BriefEditor lang={lang} />}
      </Fade>

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
            to={21}
            step={15}
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
  const byGroup = new Map((assign?.penugasan ?? []).map((p) => [p.kelompokId, p.asistenNim]));
  const holds = new Map<string, number>();
  for (const nim of byGroup.values()) holds.set(nim, (holds.get(nim) ?? 0) + 1);
  const groups = roster.filter((g) => g.aktif !== false);
  // A group that already has an assistant changes through the reason
  // dialog (Phase 9); a free one is set straight away.
  const [ask, setAsk] = useState<{ g: RosterGroup; cur: string; pick: string } | null>(null);
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
          const nim = byGroup.get(g.id) ?? null;
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
                onPick={(x) => {
                  if (!x || x.nim === nim) return;
                  if (nim) setAsk({ g, cur: nim, pick: x.nim });
                  else void set(g.id, g.nomor, x.nim);
                }}
              />
            </li>
          );
        })}
      </ul>
      {ask && (
        <ChangeAssistant
          t={t}
          lang={lang}
          open
          onOpenChange={(o) => !o && setAsk(null)}
          sesiId={sesi.id}
          kelompokId={ask.g.id}
          nomor={ask.g.nomor}
          cur={ask.cur}
          awal={awalOf(ask.g.id)}
          meNim={meNim}
          asisten={byNim}
          pick={ask.pick}
          onDone={() => {
            pasangan.reload();
            onChanged();
          }}
        />
      )}
    </section>
  );
}

function AssistantPicker({
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
      <RadixPopover.Portal>
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
