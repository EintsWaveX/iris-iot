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
import { useEffect, useMemo, useRef, useState } from "react";
import Confirm from "../../../ui/Confirm";
import Dropdown from "../../../ui/Dropdown";
import HoldButton from "../../../ui/HoldButton";
import Pill from "../../../ui/Pill";
import Popover from "../../../ui/Popover";
import SegmentedControl from "../../../ui/SegmentedControl";
import { useMinWidth } from "../../../../lib/hooks";
import type { Lang } from "../../../../lib/kelas";
import { isFail, recPost, useRecCut } from "../../../../lib/recruitment/client";
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
import { S2 } from "../../s2Strings";
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
    <span className="r2pro" role="group" aria-label={t.proposalFor(c.nama)}>
      {(["lolos", "gagal"] as const).map((v) => (
        <button
          key={v}
          type="button"
          className="chipbtn r2pro__b"
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
      <i data-ok={c.fm ? "yes" : "no"} title={c.fm ? t.fmYes : t.fmNo}>
        FM
      </i>
      <i data-ok={c.tt ? "yes" : "no"} title={c.tt ? t.ttYes : t.ttNo}>
        TT
      </i>
    </span>
  );
}

const nilai = (v: number | null) =>
  v == null ? <span className="hint">-</span> : <span className="num">{v}</span>;

/* ---------------------------------------------------------------- distribution */

function Dist({ rows, rule }: { rows: CutRowView[]; rule: Ambang }) {
  const ada = rows.filter((r) => r.total !== null);
  if (!ada.length) return <div className="r2dist" aria-hidden="true" />;
  if (rule.mode === "top") {
    const urut = [...ada].sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
    return (
      <div className="r2dist r2dist--rank" aria-hidden="true">
        {urut.map((c, i) => (
          <i
            key={c.id}
            style={{ height: `${Math.max(2, ((c.total ?? 0) / 4000) * 100)}%` }}
            data-pass={i < rule.n ? "yes" : undefined}
          />
        ))}
        <span className="r2dist__cut" style={{ left: `${(rule.n / urut.length) * 100}%` }} />
      </div>
    );
  }
  const bins = Array.from({ length: 20 }, () => 0);
  for (const c of ada) bins[Math.min(19, Math.floor((c.total ?? 0) / 200))]++;
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
      <span className="r2dist__cut" style={{ left: `${(rule.min / 4000) * 100}%` }} />
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
  const lebar = useMinWidth(1100);
  const [q, setQ] = useState("");
  const [f, setF] = useState("semua");
  const [thr, setThr] = useState(false);
  const [mode, setMode] = useState<"top" | "min">("top");
  const [n, setN] = useState(60);
  const [minS, setMinS] = useState(2000);
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
  const pratinjau =
    thr && pilih === "tes_tulis"
      ? thresholdProposals(cutRows, rule, { noShowsFail: absFail, replaceExisting: timpa })
      : null;
  const bagus = (c: CutRowView): Proposal | null =>
    pratinjau ? (pratinjau.get(c.id) ?? c.proposal) : c.proposal;
  const lolosN = baris.filter((c) => bagus(c) === "lolos").length;
  const gagalN = baris.filter((c) => bagus(c) === "gagal").length;
  const belum = Math.max(0, baris.length - lolosN - gagalN);
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
    if (!items.length) return setThr(false);
    await usul(items, t.applied(items.length));
    setThr(false);
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
  const cutAt = pratinjau ? daftar.findIndex((c) => bagus(c) === "gagal" && c.tt) : -1;

  const head = (
    <div className="r2cut__top">
      <SegmentedControl
        aria-label={t.stage}
        value={pilih}
        onValueChange={(v) => setStage(v as CutStage)}
        options={aktif.map((s) => ({ value: s, label: t.stageName[s] }))}
      />
      <span className="hint r2cut__later">{t.later}</span>
    </div>
  );

  const tally = (
    <section className="panel r2tally">
      <div className="r2tally__nums">
        <span>
          <b className="num" data-t="ok">
            {lolosN}
          </b>
          <span className="hint">{pratinjau ? t.wouldPass : t.proposedPass}</span>
        </span>
        <span>
          <b className="num" data-t="no">
            {gagalN}
          </b>
          <span className="hint">{pratinjau ? t.wouldFail : t.proposedFail}</span>
        </span>
        <span>
          <b className="num">{belum}</b>
          <span className="hint">{t.none}</span>
        </span>
      </div>
      <div className="r2tally__bar" aria-hidden="true">
        <i data-t="ok" style={{ flex: lolosN }} />
        <i data-t="no" style={{ flex: gagalN }} />
        <i style={{ flex: belum }} />
      </div>
      {d?.target && (
        <span className="hint">{t.target(d.target.min, d.target.max, t.stageName[pilih])}</span>
      )}
    </section>
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

  const lockBar = !dikunci && (
    <section className="panel r2lockbar" ref={bar}>
      <div className="stack stack--sm" style={{ minWidth: 0 }}>
        <b>{ketua ? t.lockTitle(t.stageName[pilih]) : t.lockOnly}</b>
        <span className="hint">
          {lock?.defaultRevealAt ? t.lockOpens(waktu(lock.defaultRevealAt, lang)) : t.noAnnounce}{" "}
          {missing > 0 ? (
            <>
              <b className="r2warn">{t.lockMissing(missing)}</b>{" "}
              <button type="button" className="rec-link" onClick={() => setF("belum")}>
                {t.show}
              </button>
            </>
          ) : (
            baris.length > 0 && t.allProposed
          )}
        </span>
      </div>
      {ketua ? (
        <HoldButton
          label={t.hold}
          tone="primary"
          ms={1600}
          disabled={missing > 0 || baris.length === 0 || !lock?.defaultRevealAt}
          onDone={kunci}
        />
      ) : (
        <span className="hint">{t.keepProposing}</span>
      )}
    </section>
  );

  const tools = (
    <div className="row rec-tools">
      <div className="rec-search">
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
      {bisaUsul && pilih === "tes_tulis" && (
        <button
          type="button"
          className={`btn btn--sm ${thr ? "btn--primary" : ""}`.trim()}
          onClick={() => setThr(!thr)}
        >
          <span className="btn__label">{t.threshold}</span>
        </button>
      )}
      {bisaUsul && lolosBerkas && (
        <button
          type="button"
          className="btn btn--sm"
          disabled={busy || missing === 0}
          onClick={() => void dariBerkas()}
        >
          <span className="btn__label">{t.fromBerkas}</span>
        </button>
      )}
    </div>
  );

  const adaSkor = baris.some((r) => r.total !== null);
  const thrPanel = thr && pilih === "tes_tulis" && (
    <section className="panel r2thr">
      <div className="panel__head">
        <h3 className="panel__title">{t.thrTitle}</h3>
        <SegmentedControl
          aria-label={t.mode}
          value={mode}
          onValueChange={(v) => setMode(v as "top" | "min")}
          options={[
            { value: "top", label: t.top },
            { value: "min", label: t.min },
          ]}
        />
      </div>
      <div className="r2thr__grid">
        <div className="stack">
          <Dist rows={baris} rule={rule} />
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
              max={4000}
              step={50}
              onChange={setMinS}
              label={t.minLabel}
              fmt={(v) => `≥ ${v}`}
            />
          )}
          <span className="hint">
            {adaSkor
              ? mode === "top"
                ? t.lineAt(
                    [...baris].sort((a, b) => (b.total ?? 0) - (a.total ?? 0))[Math.max(0, n - 1)]
                      ?.total ?? 0,
                  )
                : t.minHint
              : t.scoreCut}
          </span>
        </div>
        <div className="stack r2thr__side">
          <div className="r2thr__read" aria-live="polite">
            <b className="num" data-t="ok">
              {lolosN}
            </b>
            <span>{t.readPass}</span>
            <b className="num" data-t="no">
              {gagalN}
            </b>
            <span>{t.readFail}</span>
          </div>
          {d?.target && (
            <span className="hint">
              {lolosN < d.target.min
                ? t.below(d.target.min)
                : lolosN > d.target.max
                  ? t.above(d.target.max)
                  : t.inside(d.target.min, d.target.max)}
            </span>
          )}
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
          <div className="row r2thr__acts">
            <button type="button" className="btn btn--ghost" onClick={() => setThr(false)}>
              {t.cancel}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || !pratinjau || pratinjau.size === 0}
              onClick={() => void terapkan()}
            >
              {timpa ? t.proposeAll(pratinjau?.size ?? 0) : t.proposeRest(pratinjau?.size ?? 0)}
            </button>
          </div>
        </div>
      </div>
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
    c.proposedBy ? <span className="acode">{c.proposedBy}</span> : <span className="hint">-</span>;

  const tabel = !lebar ? (
    <ul className="r2clist">
      {daftar.map((c, i) => (
        <li key={c.id} style={{ display: "contents" }}>
          {i === cutAt && (
            <span className="r2cutline">
              <span>{t.cutLine}</span>
            </span>
          )}
          <span className="r2crow" data-cut={pratinjau ? (bagus(c) ?? undefined) : undefined}>
            <span className="r2crow__rank num">{i + 1}</span>
            <span className="stack" style={{ gap: 2, minWidth: 0 }}>
              <b>{c.nama}</b>
              <span className="hint">
                {lolosBerkas
                  ? c.berkas?.status === "approved"
                    ? t.docOk
                    : t.docNo
                  : c.total !== null
                    ? `${c.total} / 4000`
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
    <section className="panel rec-tablecard">
      <div className="scrollx">
        <table className="rec-table r2table" data-stage={pilih}>
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
                  <th className="num">{t.logic}</th>
                  <th className="num">{t.blanks}</th>
                  <th className="num">{t.debug}</th>
                  <th className="num">{t.live}</th>
                  <th className="num">{t.total}</th>
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
            {daftar.map((c, i) => (
              <>
                {i === cutAt && (
                  <tr className="r2cutline" key={`cut-${c.id}`}>
                    <td colSpan={12}>
                      <span>{`${t.cutLine} · ${lolosN} / ${gagalN}`}</span>
                    </td>
                  </tr>
                )}
                <tr key={c.id} data-cut={pratinjau ? (bagus(c) ?? undefined) : undefined}>
                  <td className="num hint">{i + 1}</td>
                  <td>
                    <span className="stack" style={{ gap: 0 }}>
                      <b>{c.nama}</b>
                      <span className="hint mono">{c.nim}</span>
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
                      <td>{nilai(c.parts[0])}</td>
                      <td>{nilai(c.parts[1])}</td>
                      <td>{nilai(c.parts[2])}</td>
                      <td>{nilai(c.parts[3])}</td>
                      <td>
                        <span className="r2tot">
                          <b className="num">{c.total ?? "-"}</b>
                          {c.total !== null && (
                            <i style={{ width: `${(c.total / 4000) * 100}%` }} />
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
              </>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  if (!d)
    return (
      <div className="stack">
        {head}
        <span className="skeleton" style={{ height: 320 }} />
      </div>
    );
  return (
    <div className="stack r2cut" data-locked={dikunci ? "yes" : "no"}>
      {head}
      {lockedCard}
      <div className="r2cut__sum">
        {tally}
        {lockBar}
      </div>
      {tools}
      {thrPanel}
      {baris.length === 0 ? <p className="empty-note">{t.empty}</p> : tabel}
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
    </div>
  );
}
