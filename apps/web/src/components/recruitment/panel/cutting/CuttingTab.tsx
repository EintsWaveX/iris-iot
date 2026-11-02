/**
 * The panel's Cutting tab (06, PRD 6 Cutting, mockup r2-cutting). One board
 * per stage, picked by line tabs that appear when that stage's Cutting
 * starts. Any Panitia member with the propose right sets Lolos or Gagal per
 * candidate (the latest wins, and the toast names whose proposal they
 * replaced); a threshold slider makes bulk proposals; the Ketua locks the
 * stage with a hold, and the lock copies the reveal time from the stage's
 * Pengumuman. A locked stage can be unlocked only before that time.
 *
 * Everything shown is the server's: GET results, POST propose, lock and
 * unlock, live on the reccutting topic.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckIcon,
  ChatsCircleIcon,
  CpuIcon,
  SealCheckIcon,
  EnvelopeSimpleOpenIcon,
  FileTextIcon,
  GraduationCapIcon,
  ListChecksIcon,
  LockSimpleIcon,
  MagnifyingGlassIcon,
  ScissorsIcon,
  SlidersHorizontalIcon,
  TimerIcon,
  type IconProps,
} from "@phosphor-icons/react";
import type { ComponentType } from "react";
import TabLine from "../../../ui/TabLine";
import Confirm from "../../../ui/Confirm";
import Dropdown from "../../../ui/Dropdown";
import HoldButton from "../../../ui/HoldButton";
import Pill from "../../../ui/Pill";
import Popover from "../../../ui/Popover";
import SegmentedControl from "../../../ui/SegmentedControl";
import { useMinWidth } from "../../../../lib/hooks";
import type { Lang } from "../../../../lib/kelas";
import { isFail, recPost, useRecCut, useRecSettings } from "../../../../lib/recruitment/client";
import { thresholdProposals, type Ambang, type CutRow } from "../../../../lib/recruitment/cutting";
import { tanggalWib } from "../../../../lib/recruitment/gates";
import {
  CUT_STAGES,
  type CutRowView,
  type CutStage,
  type LockResponse,
  type Proposal,
  type ProposeResponse,
  type RecEvent,
  type RecRights,
} from "../../../../lib/recruitment/types";
import {
  cuttingFor,
  type CuttingStageKey,
  type SettingMap,
} from "../../../../lib/recruitment/settings";
import { S2 } from "../../s2Strings";
import "../../recruitment-b1.css";
import "../../recruitment-kandidat.css";
import "../../recruitment-cutting.css";
import { TUBES } from "../../tubes/tubesStrings";
import { CS } from "./cutStrings";
import { AturTitikAwal, UbahTeksAmplop } from "./CutSettings";
import { Countdown, tgl } from "../../shared";

const waktu = (iso: string, lang: Lang) => {
  const w = tanggalWib(new Date(iso));
  return `${tgl(w.tanggal, lang)}, ${w.jam} WIB`;
};

/** The stages whose Cutting has started (their cutting or review event began). */
function tahapAktif(events: RecEvent[], hariIni: string): CutStage[] {
  return CUT_STAGES.filter((s) =>
    events.some(
      (e) =>
        e.stage === s &&
        ((e.kind === "cutting" && e.startsOn <= hariIni) ||
          (s === "berkas" && e.kind === "review" && e.startsOn <= hariIni)),
    ),
  );
}

/* ------------------------------------------------------------- slider */

/** A slider the page draws (no native range input): drag, or keys: arrows, Page Up and Down, Home, End. */
function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  fmt,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
  fmt: (v: number) => string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const set = (x: number) => {
    const el = track.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (x - r.left) / r.width));
    const v = min + Math.round((f * (max - min)) / step) * step;
    if (v !== value) onChange(v);
  };
  return (
    <div
      className="r2slider"
      onPointerDown={(e) => {
        if (e.button > 0) return;
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        set(e.clientX);
        const mv = (ev: PointerEvent) => set(ev.clientX);
        const up = () => {
          el.removeEventListener("pointermove", mv);
          el.removeEventListener("pointerup", up);
        };
        el.addEventListener("pointermove", mv);
        el.addEventListener("pointerup", up);
      }}
    >
      <div className="r2slider__track" ref={track}>
        <i className="r2slider__fill" style={{ width: `${pct}%` }} />
      </div>
      <div
        className="r2slider__thumb"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={fmt(value)}
        style={{ left: `${pct}%` }}
        onKeyDown={(e) => {
          const big = Math.max(step, Math.round((max - min) / 10 / step) * step);
          const k = {
            ArrowRight: step,
            ArrowUp: step,
            ArrowLeft: -step,
            ArrowDown: -step,
            PageUp: big,
            PageDown: -big,
          }[e.key];
          if (k) {
            e.preventDefault();
            onChange(Math.max(min, Math.min(max, value + k)));
          }
          if (e.key === "Home") {
            e.preventDefault();
            onChange(min);
          }
          if (e.key === "End") {
            e.preventDefault();
            onChange(max);
          }
        }}
      >
        <span className="r2slider__tip num">{fmt(value)}</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- chips */

function ProChips({
  c,
  lang,
  can,
  onSet,
}: {
  c: CutRowView;
  lang: Lang;
  can: boolean;
  onSet: (c: CutRowView, p: Proposal) => void;
}) {
  const t = S2[lang].cut;
  return (
    <span className="n7-seg" role="group" aria-label={t.proposalFor(c.nama)}>
      {(["lolos", "gagal"] as const).map((v) => (
        <button
          key={v}
          type="button"
          data-v={v}
          aria-pressed={c.proposal === v}
          disabled={!can}
          onClick={() => onSet(c, v)}
        >
          {t.reason[v]}
        </button>
      ))}
    </span>
  );
}

function NoteBtn({
  c,
  lang,
  can,
  onNote,
}: {
  c: CutRowView;
  lang: Lang;
  can: boolean;
  onNote: (c: CutRowView, note: string) => void;
}) {
  const t = S2[lang].cut;
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(c.note ?? "");
  useEffect(() => setV(c.note ?? ""), [c.note]);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      trigger={
        <button
          type="button"
          className="iconbtn iconbtn--sm"
          aria-label={c.note ? `${t.note}: ${c.note}` : t.writeNote}
          aria-pressed={!!c.note}
        >
          <span aria-hidden="true">✎</span>
        </button>
      }
    >
      <div className="stack stack--sm" style={{ width: 280 }}>
        <b>{t.noteOn(c.nama.split(" ")[0])}</b>
        <textarea
          className="textarea"
          rows={3}
          value={v}
          maxLength={200}
          disabled={!can}
          onChange={(e) => setV(e.target.value)}
          placeholder={t.notePh}
        />
        {can && (
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => {
              onNote(c, v);
              setOpen(false);
            }}
          >
            {t.save}
          </button>
        )}
      </div>
    </Popover>
  );
}

function Att({ c, lang }: { c: CutRowView; lang: Lang }) {
  const t = S2[lang].cut;
  return (
    <span className="r2att">
      <i className="n7-tag" data-ok={c.fm ? "yes" : "no"} title={c.fm ? t.fmYes : t.fmNo}>
        FM
      </i>
      <i className="n7-tag" data-ok={c.tt ? "yes" : "no"} title={c.tt ? t.ttYes : t.ttNo}>
        TT
      </i>
    </span>
  );
}

/* ---------------------------------------------------------------- distribution */

function Dist({ rows, rule, skala = 4000 }: { rows: CutRowView[]; rule: Ambang; skala?: number }) {
  const ada = rows.filter((r) => r.total !== null);
  if (!ada.length) return <div className="r2dist" aria-hidden="true" />;
  if (rule.mode === "top") {
    const urut = [...ada].sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
    return (
      <div className="r2dist r2dist--rank" aria-hidden="true">
        {urut.map((c, i) => (
          <i
            key={c.id}
            style={{ height: `${Math.max(2, ((c.total ?? 0) / skala) * 100)}%` }}
            data-pass={i < rule.n ? "yes" : undefined}
          />
        ))}
        <span className="r2dist__cut" style={{ left: `${(rule.n / urut.length) * 100}%` }} />
      </div>
    );
  }
  const bins = Array.from({ length: 20 }, () => 0);
  for (const c of ada) bins[Math.min(19, Math.floor(((c.total ?? 0) / skala) * 20))]++;
  const top = Math.max(...bins, 1);
  return (
    <div className="r2dist" aria-hidden="true">
      {bins.map((b, i) => (
        <i
          key={i}
          style={{ height: `${(b / top) * 100}%` }}
          data-pass={i * 200 >= rule.min ? "yes" : undefined}
        />
      ))}
      <span className="r2dist__cut" style={{ left: `${(rule.min / skala) * 100}%` }} />
    </div>
  );
}

/* ------------------------------------------------------------------ the tab */

export default function CuttingTab({
  lang,
  events,
  hariIni,
  rights,
}: {
  lang: Lang;
  events: RecEvent[];
  hariIni: string;
  rights: RecRights;
}) {
  const t = S2[lang].cut;
  const aktif = useMemo(() => tahapAktif(events, hariIni), [events, hariIni]);
  const [stage, setStage] = useState<CutStage | null>(null);
  const pilih: CutStage | null = stage && aktif.includes(stage) ? stage : (aktif[0] ?? null);
  const board = useRecCut(pilih ?? "berkas", pilih !== null);
  // Wawancara and Mengajar score out of 100 (the examiners' sheets); the written test out of 4000.
  const ivStage = pilih === "wawancara" || pilih === "mengajar" || pilih === "tubes";
  const skala = ivStage ? 100 : 4000;
  const lebar = useMinWidth(1100);
  const [q, setQ] = useState("");
  const [f, setF] = useState("semua");
  const [more, setMore] = useState(20);
  const [opsi, setOpsi] = useState(false);
  const [mode, setMode] = useState<"top" | "min">("top");
  const [n, setN] = useState(60);
  const [minS, setMinS] = useState(2000);
  // The editors' starting point (Atur Titik Awal) seeds the sliders; the stage's own numbers when it has none.
  const cfg = useRecSettings(true);
  const cfgOf = (key: string) => cfg.data?.settings.find((x) => x.key === key);
  const mulai = cuttingFor(
    cfgOf("cutting")?.value as SettingMap["cutting"] | undefined,
    pilih ?? "",
  );
  const bisaAtur = cfgOf("cutting")?.canEdit === true;
  const [atur, setAtur] = useState(false);
  const [teks, setTeks] = useState(false);
  useEffect(() => {
    if (!mulai) return;
    setN(mulai.top);
    setMinS(mulai.minScore);
  }, [pilih, mulai?.top, mulai?.minScore]);
  const [absFail, setAbsFail] = useState(true);
  const [timpa, setTimpa] = useState(false);
  const [buka, setBuka] = useState(false);
  const [busy, setBusy] = useState(false);
  // What was just set, shown at once; the refetch (siaran) replaces it with the server's word.
  const [lokal, setLokal] = useState<
    Record<number, { proposal: Proposal | null; note?: string | null }>
  >({});
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => setLokal({}), [board.data?.now, pilih]);
  useEffect(() => setMore(20), [pilih, q, f]);

  if (!pilih)
    return (
      <div className="stack">
        <p className="empty-note">{t.later}</p>
      </div>
    );

  const d = board.data;
  const baris: CutRowView[] = (d?.rows ?? []).map((r) =>
    lokal[r.id]
      ? {
          ...r,
          proposal: lokal[r.id].proposal,
          note: lokal[r.id].note !== undefined ? (lokal[r.id].note ?? null) : r.note,
        }
      : r,
  );
  const lock = d?.lock;
  const dikunci = lock?.locked === true;
  const dibuka = lock?.revealed === true;
  const bisaUsul = !dikunci && rights.cuttingPropose;
  const ketua = rights.cuttingLock;
  const rule: Ambang = mode === "top" ? { mode: "top", n } : { mode: "min", min: minS };
  const cutRows: CutRow[] = baris.map((r) => ({
    id: r.id,
    total: r.total,
    present: pilih === "berkas" ? true : r.tt,
    proposal: r.proposal,
  }));
  const garis = pilih === "tes_tulis" || ivStage;
  const pratinjau = garis
    ? thresholdProposals(cutRows, rule, { noShowsFail: absFail, replaceExisting: timpa })
    : null;
  // The counts are the proposals; the cut line only previews what Terapkan would add.
  const lolosN = baris.filter((c) => c.proposal === "lolos").length;
  const gagalN = baris.filter((c) => c.proposal === "gagal").length;
  const belum = Math.max(0, baris.length - lolosN - gagalN);
  const potongLolos = pratinjau ? [...pratinjau.values()].filter((v) => v === "lolos").length : 0;
  const potongN =
    mode === "top" ? Math.min(n, baris.length) : baris.filter((c) => (c.total ?? 0) >= minS).length;
  const missing = baris.filter((c) => !c.proposal).length;

  const daftar = baris.filter((c) => {
    if (q && !`${c.nama} ${c.nim}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (f === "belum") return !c.proposal;
    if (f === "lolos" || f === "gagal") return c.proposal === f;
    if (f === "absen") return !c.tt || !c.fm;
    return true;
  });

  async function usul(
    items: { id: number; proposal: Proposal | null; note?: string | null }[],
    toast?: string,
  ) {
    if (!pilih) return;
    setBusy(true);
    setLokal((x) => ({
      ...x,
      ...Object.fromEntries(items.map((i) => [i.id, { proposal: i.proposal, note: i.note }])),
    }));
    const r = await recPost<ProposeResponse>("propose", { stage: pilih, items });
    setBusy(false);
    if (isFail(r)) {
      setLokal({});
      window.Toast?.show(r.kode === "terkunci" ? t.locked2 : t.proposeFail, "danger");
      board.refresh();
      return;
    }
    if (toast) window.Toast?.show(toast, "ok");
    for (const o of r.overwrote) {
      const c = baris.find((x) => x.id === o.id);
      const it = items.find((x) => x.id === o.id);
      if (c && it?.proposal)
        window.Toast?.show(
          t.overwrote(o.by, c.nama.split(" ")[0], t.reason[it.proposal]),
          undefined,
        );
    }
    board.refresh();
  }
  const set = (c: CutRowView, p: Proposal) => void usul([{ id: c.id, proposal: p, note: c.note }]);
  const note = (c: CutRowView, v: string) =>
    void usul([{ id: c.id, proposal: c.proposal, note: v.trim() || null }]);

  async function terapkan() {
    if (!pratinjau) return;
    const items = [...pratinjau].map(([id, proposal]) => ({
      id,
      proposal,
      note: baris.find((c) => c.id === id)?.note ?? null,
    }));
    if (!items.length) return;
    await usul(items, t.applied(items.length));
  }
  async function dariBerkas() {
    const items = baris
      .filter((c) => !c.proposal)
      .map((c) => ({
        id: c.id,
        proposal: (c.berkas?.status === "approved" ? "lolos" : "gagal") as Proposal,
        note: c.note,
      }));
    if (items.length) await usul(items, t.fromBerkasDone);
  }
  async function kunci() {
    if (!pilih) return;
    const r = await recPost<LockResponse>("lock", { stage: pilih });
    if (isFail(r)) {
      window.Toast?.show(r.kode === "tanpa_pengumuman" ? t.noAnnounce : t.lockFail, "danger");
      return;
    }
    window.Toast?.show(t.locked(t.stageName[pilih], waktu(r.revealAt ?? "", lang)), "ok");
    board.refresh();
  }

  const lolosBerkas = pilih === "berkas";
  const tampak = daftar.slice(0, more);
  // The dashed line sits after the last row that is inside the cut (only on the whole list).
  const cutAt =
    garis && f === "semua" && !q && potongN > 0 && potongN < tampak.length ? potongN : -1;
  const rail = CS[lang].rail;
  const railAt = dibuka ? 2 : dikunci ? 1 : 0;
  const IK_RAIL: ComponentType<IconProps>[] = [
    ListChecksIcon,
    LockSimpleIcon,
    EnvelopeSimpleOpenIcon,
  ];
  const IK_STAGE: Record<CutStage, ComponentType<IconProps>> = {
    berkas: FileTextIcon,
    tes_tulis: TimerIcon,
    wawancara: ChatsCircleIcon,
    mengajar: GraduationCapIcon,
    tubes: CpuIcon,
    penerimaan: SealCheckIcon,
  };

  const head = (
    <div className="n7-bar">
      <TabLine
        label={t.stage}
        value={pilih}
        onChange={(v) => setStage(v)}
        tabs={aktif.map((s) => {
          const Ik = IK_STAGE[s];
          return {
            v: s,
            label: (
              <>
                <Ik size={16} aria-hidden="true" />
                {t.stageName[s]}
              </>
            ),
          };
        })}
      />
      <span className="hint r2cut__later">{t.later}</span>
      <span className="grow" />
      <ol className="n7-miniRail" aria-label={CS[lang].railLabel}>
        {rail.map((r, i) => {
          const Ik = i < railAt ? CheckIcon : IK_RAIL[i];
          return (
            <li key={r} data-st={i < railAt ? "done" : i === railAt ? "cur" : "next"}>
              <Ik size={16} aria-hidden="true" />
              <span>{r}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );

  const lockedCard = dikunci && lock && (
    <section className="panel r2lockd">
      <span className="r2lockd__ic" aria-hidden="true">
        🔒
      </span>
      <div className="stack stack--sm" style={{ minWidth: 0 }}>
        <b>
          {dibuka && lock.revealAt
            ? t.announced(waktu(lock.revealAt, lang))
            : t.lockedBy(lock.lockedBy ?? "", lock.lockedAt ? waktu(lock.lockedAt, lang) : "")}
        </b>
        <span className="hint">
          {dibuka
            ? t.openedCount(lock.opened, baris.length)
            : lock.revealAt
              ? t.lockedHint(waktu(lock.revealAt, lang))
              : ""}
        </span>
      </div>
      {!dibuka && lock.revealAt && (
        <div className="r2lockd__right">
          <span className="hint">{t.opensIn}</span>
          <Countdown ke={Date.parse(lock.revealAt)} label={t.opensIn} lang={lang} />
          {ketua && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setBuka(true)}>
              {t.unlock}
            </button>
          )}
        </div>
      )}
    </section>
  );

  const kunciCard = (
    <aside className="panel n7-lock" data-locked={dikunci ? "yes" : "no"} ref={bar}>
      <div className="n7-count3">
        <div data-t="ok">
          <b className="num">{lolosN}</b>
          <small>{t.proposedPass}</small>
        </div>
        <div data-t="bad">
          <b className="num">{gagalN}</b>
          <small>{t.proposedFail}</small>
        </div>
        <div data-t="faint">
          <b className="num">{belum}</b>
          <small>{t.none}</small>
        </div>
      </div>
      <div className="n7-stack3" aria-hidden="true">
        <i data-t="ok" style={{ flex: lolosN }} />
        <i data-t="bad" style={{ flex: gagalN }} />
        <i data-t="faint" style={{ flex: belum }} />
      </div>
      <span className="hint">
        {lock?.defaultRevealAt || lock?.revealAt
          ? CS[lang].envelopes(waktu(lock.revealAt ?? lock.defaultRevealAt ?? "", lang))
          : t.noAnnounce}
      </span>
      {bisaAtur && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setTeks(true)}>
          <EnvelopeSimpleOpenIcon size={18} aria-hidden="true" />
          <span className="btn__label">{CS[lang].words}</span>
        </button>
      )}
      {dikunci ? null : ketua ? (
        <>
          <HoldButton
            label={t.hold}
            tint="warn"
            icon={LockSimpleIcon}
            tone="primary"
            ms={1600}
            disabled={missing > 0 || baris.length === 0 || !lock?.defaultRevealAt}
            onDone={kunci}
          />
          {missing > 0 && baris.length > 0 && (
            <button type="button" className="n7-link" onClick={() => setF("belum")}>
              {t.lockMissing(missing)} {t.show}
            </button>
          )}
        </>
      ) : (
        <span className="n7-note">
          <LockSimpleIcon size={16} aria-hidden="true" />
          {t.lockOnly} {t.keepProposing}
        </span>
      )}
    </aside>
  );

  const tools = (
    <div className="row rec-tools">
      <div className="rec9-search">
        <MagnifyingGlassIcon size={16} aria-hidden="true" />
        <input
          className="field__input"
          placeholder={t.search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={t.searchLabel}
        />
      </div>
      <Dropdown
        id="rec-cut-filter"
        label={t.filter}
        hideLabel
        value={f}
        onChange={setF}
        options={[
          { value: "semua", label: t.all },
          { value: "belum", label: t.notProposed },
          { value: "lolos", label: t.proposedLolos },
          { value: "gagal", label: t.proposedGagal },
          ...(pilih === "tes_tulis" ? [{ value: "absen", label: t.missed }] : []),
        ]}
      />
      <span className="grow" />
      <span className="hint num">{t.of(daftar.length, baris.length)}</span>
      {pilih === "tes_tulis" && typeof board.data?.scoreFinal === "boolean" && (
        <Pill tone={board.data.scoreFinal ? "ok" : "warn"}>
          {board.data.scoreFinal ? t.scoresFinal : t.scoresProvisional}
        </Pill>
      )}
      {/* A stage with no cut line (Berkas) still has its start and targets to set */}
      {!garis && bisaAtur && (
        <button
          type="button"
          className="iconbtn iconbtn--sm"
          aria-label={CS[lang].setStart}
          title={CS[lang].setStart}
          onClick={() => setAtur(true)}
        >
          <SlidersHorizontalIcon size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  );

  const garisCard = (
    <section className="panel n7-cutline">
      <div className="panel__head">
        <h3 className="panel__title">{CS[lang].cutLine}</h3>
        {garis && (
          <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
            {bisaAtur && (
              <button
                type="button"
                className="iconbtn iconbtn--sm"
                aria-label={CS[lang].setStart}
                title={CS[lang].setStart}
                onClick={() => setAtur(true)}
              >
                <SlidersHorizontalIcon size={18} aria-hidden="true" />
              </button>
            )}
            <SegmentedControl
              aria-label={t.mode}
              value={mode}
              onValueChange={(v) => setMode(v as "top" | "min")}
              options={[
                { value: "top", label: t.top },
                { value: "min", label: t.min },
              ]}
            />
          </span>
        )}
      </div>
      {garis ? (
        <>
          <Dist rows={baris} rule={rule} skala={skala} />
          {mode === "top" ? (
            <Slider
              value={n}
              min={0}
              max={Math.max(1, baris.length)}
              onChange={setN}
              label={t.topLabel}
              fmt={t.topFmt}
            />
          ) : (
            <Slider
              value={minS}
              min={0}
              max={skala}
              step={ivStage ? 1 : 50}
              onChange={setMinS}
              label={t.minLabel}
              fmt={(v) => `≥ ${v}`}
            />
          )}
          <span className="n7-range__v" aria-live="polite">
            <b className="num">{potongN}</b> {t.readPass} ·{" "}
            <b className="num">{baris.length - potongN}</b> {t.readFail}
            {mode === "min" && (
              <>
                {" "}
                · {CS[lang].minimal} <b className="num">{minS}</b>
              </>
            )}
          </span>
          <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
            {bisaUsul && (
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy || !pratinjau || pratinjau.size === 0}
                onClick={() => void terapkan()}
              >
                <CheckIcon size={18} aria-hidden="true" />
                <span className="btn__label">
                  {timpa ? t.proposeAll(pratinjau?.size ?? 0) : CS[lang].apply}
                </span>
              </button>
            )}
            {d?.target && (
              <span className="hint">
                {potongLolos >= 0 && d.target.min > 0
                  ? t.target(d.target.min, d.target.max, t.stageName[pilih])
                  : ""}
              </span>
            )}
            <button
              type="button"
              className="rec-link"
              aria-expanded={opsi}
              onClick={() => setOpsi(!opsi)}
            >
              {CS[lang].options}
            </button>
          </div>
          {opsi && (
            <div className="stack stack--sm">
              <button
                type="button"
                className="checkitem"
                role="checkbox"
                aria-checked={absFail}
                onClick={() => setAbsFail(!absFail)}
              >
                <span className="checkitem__box" aria-hidden="true">
                  ✓
                </span>
                <span>{t.noShows}</span>
              </button>
              <button
                type="button"
                className="checkitem"
                role="checkbox"
                aria-checked={timpa}
                onClick={() => setTimpa(!timpa)}
              >
                <span className="checkitem__box" aria-hidden="true">
                  ✓
                </span>
                <span>{t.replace(baris.filter((c) => c.proposal).length)}</span>
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <span className="hint">{CS[lang].berkasHint}</span>
          <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
            {bisaUsul && (
              <button
                type="button"
                className="btn btn--inverse"
                disabled={busy || missing === 0}
                onClick={() => void dariBerkas()}
              >
                <ListChecksIcon size={18} aria-hidden="true" />
                <span className="btn__label">{t.fromBerkas}</span>
              </button>
            )}
            {d?.target && (
              <span className="hint">
                {t.target(d.target.min, d.target.max, t.stageName[pilih])}
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );

  const hasilCell = (c: CutRowView) =>
    dikunci ? (
      c.proposal ? (
        <Pill tone={c.proposal === "lolos" ? "ok" : "danger"}>{t.reason[c.proposal]}</Pill>
      ) : (
        <span className="hint">{t.noProposal}</span>
      )
    ) : (
      <ProChips c={c} lang={lang} can={bisaUsul} onSet={set} />
    );
  const siapa = (c: CutRowView) =>
    c.proposedBy ? (
      <span className="n7-by mono">{c.proposedBy}</span>
    ) : (
      <span className="hint">-</span>
    );

  const tabel = !lebar ? (
    <ul className="r2clist">
      {tampak.map((c, i) => (
        <li key={c.id} style={{ display: "contents" }}>
          {i === cutAt && (
            <span className="r2cutline">
              <span>{t.cutLine}</span>
            </span>
          )}
          <span className="r2crow" data-p={c.proposal ?? "belum"}>
            <span className="r2crow__rank num">{i + 1}</span>
            <span className="stack" style={{ gap: 2, minWidth: 0 }}>
              <b>{c.nama}</b>
              <span className="hint">
                {lolosBerkas
                  ? c.berkas?.status === "approved"
                    ? t.docOk
                    : t.docNo
                  : c.total !== null
                    ? `${c.total} / ${skala}`
                    : t.scoreCut}
              </span>
              {!lolosBerkas && <Att c={c} lang={lang} />}
            </span>
            <span className="r2crow__act">
              {hasilCell(c)}
              <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                {siapa(c)}
                <NoteBtn c={c} lang={lang} can={bisaUsul} onNote={note} />
              </span>
            </span>
          </span>
        </li>
      ))}
    </ul>
  ) : (
    <section className="panel rec-tablecard n7-tablecard">
      <div className="scrollx">
        <table className="rec-table r2table n7-table n7-ctable" data-stage={pilih}>
          <thead>
            <tr>
              <th className="num">{t.rank}</th>
              <th>{t.candidate}</th>
              {lolosBerkas ? (
                <>
                  <th>{t.docStatus}</th>
                  <th>{t.docScore}</th>
                </>
              ) : (
                <>
                  <th>{t.present}</th>
                  {ivStage ? (
                    <>
                      <th className="num">
                        {lang === "id" ? "Lembar" : lang === "zh" ? "评分表" : "Sheets"}
                      </th>
                      <th className="num">
                        {lang === "id" ? "Selisih" : lang === "zh" ? "分歧" : "Spread"}
                      </th>
                      <th>
                        {lang === "id"
                          ? "Keputusan penguji"
                          : lang === "zh"
                            ? "考官的决定"
                            : "Examiners' verdict"}
                      </th>
                    </>
                  ) : (
                    <></>
                  )}
                  <th>{t.total}</th>
                </>
              )}
              <th>{dikunci ? t.result : t.proposal}</th>
              <th>{t.by}</th>
              <th>
                <span className="sr">{t.note}</span>
              </th>
              {dibuka && <th>{t.envelope}</th>}
            </tr>
          </thead>
          <tbody>
            {tampak.map((c, i) => (
              <Fragment key={c.id}>
                {i === cutAt && (
                  <tr className="n7-cutmark" key={`cut-${c.id}`}>
                    <td colSpan={12}>
                      <span>
                        <ScissorsIcon size={16} aria-hidden="true" />{" "}
                        {CS[lang].cutMark(potongN, baris.length - potongN)}
                      </span>
                    </td>
                  </tr>
                )}
                <tr className="n7-crow" data-p={c.proposal ?? "belum"}>
                  <td className="num hint">{i + 1}</td>
                  <td>
                    <span className="stack" style={{ gap: 0 }}>
                      <b>{c.nama}</b>
                      <span className="hint mono">{c.nim}</span>
                      {c.tubes && (
                        <span className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                          <span className="hint">
                            {c.tubes.team ?? TUBES[lang].panel.noTeamYet}
                          </span>
                          {c.tubes.submission && (
                            <Pill
                              tone={
                                c.tubes.submission === "complete"
                                  ? "ok"
                                  : c.tubes.submission === "late"
                                    ? "danger"
                                    : c.tubes.submission === "none"
                                      ? undefined
                                      : "warn"
                              }
                            >
                              {TUBES[lang].panel.status[c.tubes.submission]}
                            </Pill>
                          )}
                          {c.tubes.attended !== null && (
                            <Pill tone={c.tubes.attended ? "ok" : "danger"}>
                              {c.tubes.attended
                                ? TUBES[lang].panel.ticked
                                : TUBES[lang].panel.attend}
                            </Pill>
                          )}
                        </span>
                      )}
                    </span>
                  </td>
                  {lolosBerkas ? (
                    <>
                      <td>
                        <Pill tone={c.berkas?.status === "approved" ? "ok" : "danger"}>
                          {c.berkas?.status === "approved" ? t.verified : t.notFixed}
                        </Pill>
                      </td>
                      <td>
                        {c.berkas?.score != null ? (
                          <span className="num">{c.berkas.score}</span>
                        ) : (
                          <span className="hint">{t.docScoreNone}</span>
                        )}
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        <Att c={c} lang={lang} />
                      </td>
                      {ivStage ? (
                        <>
                          <td className="num">
                            {c.iv ? (
                              `${c.iv.sheets}/${c.iv.expected}`
                            ) : (
                              <span className="hint">-</span>
                            )}
                          </td>
                          <td className="num">
                            {c.iv?.spread != null ? (
                              <Pill tone={c.iv.wide ? "warn" : undefined}>{c.iv.spread}</Pill>
                            ) : (
                              <span className="hint">-</span>
                            )}
                          </td>
                          <td>
                            {c.iv?.case?.status ? (
                              <Pill tone={c.iv.case.status === "gugur" ? "danger" : "warn"}>
                                {c.iv.case.status === "gugur"
                                  ? "Gugur"
                                  : lang === "id"
                                    ? "Susulan"
                                    : lang === "zh"
                                      ? "补考"
                                      : "Makeup"}
                              </Pill>
                            ) : c.iv?.verdict ? (
                              <Pill
                                tone={
                                  { lolos: "ok", ragu: "warn", cut: "danger" }[c.iv.verdict] as "ok"
                                }
                              >
                                {
                                  { lolos: "Fix Lolos", ragu: "Ragu-ragu", cut: "Fix Cut" }[
                                    c.iv.verdict
                                  ]
                                }
                              </Pill>
                            ) : (
                              <span className="hint">-</span>
                            )}
                          </td>
                        </>
                      ) : null}
                      <td>
                        <span className="n7-crow__tot">
                          <b className="num">{c.total ?? "-"}</b>
                          {!ivStage && (
                            <span
                              className="n7-parts"
                              title={c.parts.map((x) => (x == null ? "-" : x)).join(" · ")}
                            >
                              {c.parts.map((x, k) => (
                                <i
                                  key={k}
                                  style={{
                                    height: `${Math.max(12, ((x ?? 0) / (skala / 4)) * 100)}%`,
                                  }}
                                />
                              ))}
                            </span>
                          )}
                        </span>
                      </td>
                    </>
                  )}
                  <td>{hasilCell(c)}</td>
                  <td>{siapa(c)}</td>
                  <td>
                    <NoteBtn c={c} lang={lang} can={bisaUsul} onNote={note} />
                  </td>
                  {dibuka && (
                    <td>
                      <span className="hint">{c.opened ? t.envOpened("") : t.envNot}</span>
                    </td>
                  )}
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  // Mounted only while open, so each opening starts from what is saved now.
  const dialogs = (
    <>
      {atur && (
        <AturTitikAwal
          lang={lang}
          open
          stage={pilih as CuttingStageKey}
          onApply={() => setMode("top")}
          onOpenChange={setAtur}
          value={cfgOf("cutting")?.value as SettingMap["cutting"] | undefined}
          onSaved={() => {
            cfg.refresh();
            board.refresh();
          }}
        />
      )}
      {teks && (
        <UbahTeksAmplop
          lang={lang}
          open
          onOpenChange={setTeks}
          value={cfgOf("words")?.value as SettingMap["words"] | undefined}
          onSaved={cfg.refresh}
        />
      )}
    </>
  );

  if (!d)
    return (
      <div className="stack">
        {head}
        <span className="skeleton" style={{ height: 320 }} />
        {dialogs}
      </div>
    );
  return (
    <div className="stack r2cut n7-cut" data-locked={dikunci ? "yes" : "no"}>
      {head}
      {lockedCard}
      <div className="n7-cutrow">
        {garisCard}
        {kunciCard}
      </div>
      {tools}
      {baris.length === 0 ? <p className="empty-note">{t.empty}</p> : tabel}
      {more < daftar.length && (
        <div className="row" style={{ justifyContent: "center" }}>
          <button type="button" className="btn btn--ghost" onClick={() => setMore(more + 20)}>
            <span className="btn__label">{CS[lang].more}</span>
          </button>
        </div>
      )}
      <Confirm
        open={buka}
        onOpenChange={setBuka}
        title={t.unlockTitle}
        body={t.unlockBody(lock?.revealAt ? waktu(lock.revealAt, lang) : "")}
        confirmLabel={t.unlock}
        tone="primary"
        lang={lang}
        onConfirm={async () => {
          const r = await recPost<LockResponse>("unlock", { stage: pilih });
          if (isFail(r)) {
            window.Toast?.show(t.lockFail, "danger");
            return false;
          }
          window.Toast?.show(t.unlockDone, "warn");
          board.refresh();
        }}
      />
      {dialogs}
    </div>
  );
}
