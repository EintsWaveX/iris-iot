/**
 * The sheet of one CaAs (mockup r4-lembar, Wawancara and Mengajar). A pair or
 * panel fills ONE document: the answers, the conclusions and the verdict are
 * shared, saved by themselves; each examiner's 1 to 5 level per parameter is
 * private until every sheet is sent. Three steps (Pertanyaan, Kesimpulan,
 * Keputusan); Kirim never sits dead: pressed with a gap it jumps to the first
 * empty field. A special case (late, absent, ill) is decided by the
 * template's rules and recorded on the sheet.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Dialog from "../../../ui/Dialog";
import Dropdown from "../../../ui/Dropdown";
import Pill from "../../../ui/Pill";
import { Stepper } from "../../../ui/Controls";
import type { Lang } from "../../../../lib/kelas";
import { isFail, recPost } from "../../../../lib/recruitment/client";
import { fetchIvSheet, type IvSheetResponse } from "../../../../lib/recruitment/iv-client";
import { useSiaran } from "../../../../lib/siaran";
import { baseOf, mixSheet, sheetDelta, type SheetBase } from "../../../../lib/recruitment/iv-sync";
import {
  CASE_KINDS,
  EXCUSE_WHY,
  LATE_WHY,
  caseOutcome,
  sheetMissing,
  sheetScore,
  verdictOf,
  type CaseKind,
  type IvStage,
  type Verdict,
} from "../../../../lib/recruitment/interview";
import { IV, STEP, bi } from "./ivStrings";

type Step = "tanya" | "simpul" | "putus";
const VERDICTS: Verdict[] = ["lolos", "ragu", "cut"];
const toast = (m: string, tone: "ok" | "warn" | "danger" = "ok") => window.Toast?.show(m, tone);
const pad = (n: number) => String(n).padStart(2, "0");

function clock(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(sec % 60)}` : `${pad(m)}:${pad(sec % 60)}`;
}

const wibJam = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(iso))
    .replace(":", ".");

/* ------------------------------------------------------------ special cases */

function Kasus({
  lang,
  stage,
  data,
  onClose,
  onDone,
}: {
  lang: Lang;
  stage: IvStage;
  data: IvSheetResponse;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = IV(lang).kasus;
  const tpl = data.template;
  const [kind, setKind] = useState<CaseKind>("telat");
  const [min, setMin] = useState(tpl.late + 2);
  const [why, setWhy] = useState("akademik");
  const [izin, setIzin] = useState("kuliah");
  const [busy, setBusy] = useState(false);
  const alasan = kind === "telat" ? why : kind === "absen" ? izin : undefined;
  const out = caseOutcome({ kind, minutes: min, why: alasan }, tpl);
  const tone = out.status === "gugur" ? "danger" : out.status === "susulan" ? "warn" : "ok";
  const simpan = async () => {
    setBusy(true);
    const r = await recPost<{ ok: true }>("iv-case", {
      stage,
      id: data.candidate.id,
      kind,
      ...(kind === "telat" ? { minutes: min } : {}),
      ...(alasan ? { why: alasan } : {}),
    });
    setBusy(false);
    if (isFail(r)) return toast(IV(lang).err[r.kode] ?? r.kode, "danger");
    onDone();
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t.title}
      description={t.desc(data.candidate.nama)}
      lang={lang}
      size="md"
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t.cancel}
          </button>
          <button
            type="button"
            className={`btn ${out.status === "gugur" ? "btn--danger" : "btn--primary"}`}
            disabled={busy}
            onClick={() => void simpan()}
          >
            {out.end ? (out.status === "gugur" ? t.recordGugur : t.recordEnd) : t.record}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="r4cases" role="radiogroup" aria-label={t.title}>
          {CASE_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              className="r4cases__b"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
            >
              <span>{t.kinds[k]}</span>
            </button>
          ))}
        </div>
        {kind === "telat" && (
          <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <span className="hint">{t.minutes}</span>
            <Stepper
              value={min}
              onChange={setMin}
              min={1}
              max={120}
              label={t.minutes}
              {...STEP(lang)}
            />
            {min > tpl.late && (
              <Dropdown
                id="iv-late-why"
                label={t.why}
                value={why}
                onChange={setWhy}
                options={LATE_WHY.map((w) => ({ value: w, label: t.lateWhy[w] }))}
              />
            )}
          </div>
        )}
        {kind === "absen" && (
          <Dropdown
            id="iv-excuse-why"
            label={t.why}
            value={izin}
            onChange={setIzin}
            options={EXCUSE_WHY.map((w) => ({ value: w, label: t.excuseWhy[w] }))}
          />
        )}
        <div className={`rec-note r4cases__out`} data-t={tone}>
          <b>
            {out.status === "gugur"
              ? t.tag.gugur
              : out.status === "susulan"
                ? t.tag.susulan
                : t.tag.carry}
          </b>
          <span>{t.out[out.code]}</span>
        </div>
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------ the sheet */

export default function Lembar({
  lang,
  stage,
  id,
  onClose,
}: {
  lang: Lang;
  stage: IvStage;
  id: number;
  onClose: () => void;
}) {
  const w = IV(lang);
  const t = w.sheet;
  const [data, setData] = useState<IvSheetResponse | null>(null);
  const [fail, setFail] = useState<string | null>(null);
  const [ans, setAns] = useState<Record<string, string>>({});
  const [skip, setSkip] = useState<string[]>([]);
  const [lv, setLv] = useState<Record<string, number>>({});
  const [cl, setCl] = useState<Record<string, string>>({});
  const [other, setOther] = useState("");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [ba, setBa] = useState("");
  const [rec, setRec] = useState(false);
  const [step, setStep] = useState<Step>("tanya");
  const [qi, setQi] = useState(0);
  const [sent, setSent] = useState(false);
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "fail">("idle");
  const [kasus, setKasus] = useState(false);
  const [miss, setMiss] = useState<string | null>(null);
  const [score, setScore] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [started, setStarted] = useState<string | null>(null);
  const [partnerAt, setPartnerAt] = useState(0);
  const ready = useRef(false);
  /** What the server last held (and this examiner last sent): the autosave sends only what differs from it. */
  const base = useRef<SheetBase>(baseOf(null));
  const body = useRef<HTMLDivElement | null>(null);
  /** The latest values on screen, for a refresh that lands while the examiner is typing. */
  const now_ = useRef({
    ans: {} as Record<string, string>,
    skip: [] as string[],
    cl: {} as Record<string, string>,
    other: "",
    verdict: null as Verdict | null,
    ba: "",
    rec: false,
  });

  const init = useCallback((d: IvSheetResponse) => {
    setData(d);
    const s = d.shared;
    setAns(s?.answers ?? {});
    setSkip(s?.skipped ?? []);
    setCl(s?.concl ?? {});
    setOther(s?.other ?? "");
    setVerdict(s?.verdict ?? null);
    setBa(s?.ba ?? "");
    setRec(s?.recording ?? false);
    setStarted(s?.startedAt ?? null);
    setLv(d.mine.levels);
    setSent(!!d.mine.sentAt);
    setStep(d.template.questions.length ? "tanya" : "simpul");
    base.current = baseOf(d);
    ready.current = true;
  }, []);

  /** The pair shares one sheet, so what the other examiner saved comes in while
   *  this one is open. A field this examiner has not touched since the last sync
   *  takes the other's value; one they are typing in keeps theirs. */
  const join = useCallback((d: IvSheetResponse) => {
    const b = base.current;
    const r = baseOf(d);
    const c = now_.current;
    const m = mixSheet(
      {
        answers: c.ans,
        skipped: c.skip,
        concl: c.cl,
        other: c.other,
        verdict: c.verdict,
        ba: c.ba,
        recording: c.rec,
      },
      b,
      r,
    );
    setAns(m.next.answers);
    setSkip(m.next.skipped);
    setCl(m.next.concl);
    setOther(m.next.other);
    setVerdict(m.next.verdict);
    setBa(m.next.ba);
    setRec(m.next.recording);
    setStarted(d.shared?.startedAt ?? null);
    setSent(!!d.mine.sentAt);
    setData(d);
    base.current = { ...r, levels: b.levels };
    if (m.changed) {
      setPartnerAt(Date.now());
      setTimeout(() => setPartnerAt(0), 4000);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void fetchIvSheet(stage, id).then((r) => {
      if (!alive) return;
      if (isFail(r)) setFail(w.err[r.kode] ?? r.kode);
      else init(r);
    });
    return () => {
      alive = false;
    };
  }, [stage, id, init, w.err]);

  useEffect(() => {
    if (!started) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [started]);

  const tpl = data?.template ?? null;
  const locked = !!data?.locked;
  const snap = JSON.stringify([ans, skip, lv, cl, other, verdict, ba, rec]);
  now_.current = { ans, skip, cl, other, verdict, ba, rec };

  const flush = useCallback(async (): Promise<boolean> => {
    if (!data || locked) return true;
    const sent_ = sheetDelta(base.current, {
      answers: ans,
      skipped: skip,
      concl: cl,
      other,
      verdict,
      ba,
      recording: rec,
      levels: lv,
    });
    if (!sent_) return true;
    setSave("saving");
    const r = await recPost<{ ok: true }>("iv-sheet-save", { stage, id, ...sent_.body });
    if (isFail(r)) {
      setSave("fail");
      return false;
    }
    // Only what was sent counts as saved; a change made meanwhile is still pending.
    base.current = sent_.next;
    setSave("saved");
    return true;
  }, [data, locked, stage, id, snap]);

  // Autosave 1.2 s after the last change; a failed save tries again.
  useEffect(() => {
    if (!ready.current || locked) return;
    if (
      !sheetDelta(base.current, {
        answers: ans,
        skipped: skip,
        concl: cl,
        other,
        verdict,
        ba,
        recording: rec,
        levels: lv,
      })
    )
      return;
    const tm = setTimeout(() => void flush(), save === "fail" ? 4000 : 1200);
    return () => clearTimeout(tm);
  }, [snap, locked, flush, save]);

  // The other examiner of the pair writes into the same sheet: ask again when it
  // changes (or when a sheet is sent), then mix it in without touching what is being typed.
  useSiaran(
    ["recsheet", "reciv"],
    () => {
      if (!ready.current) return;
      void fetchIvSheet(stage, id).then((r) => {
        if (!isFail(r)) join(r);
      });
    },
    !fail,
    800,
  );

  const missing = useMemo(
    () => (tpl ? sheetMissing({ levels: lv, concl: cl, verdict }, tpl.params) : []),
    [tpl, lv, cl, verdict],
  );
  const list = useMemo(() => {
    if (!tpl) return [];
    return tpl.questions.filter(
      (q) =>
        !q.only || (q.only === "fm" && data?.cond.fm) || (q.only === "lab" && ans._lab === "1"),
    );
  }, [tpl, data?.cond.fm, ans._lab]);

  if (fail)
    return (
      <Dialog
        open
        onOpenChange={(o) => !o && onClose()}
        title={w.title[stage]}
        lang={lang}
        size="sm"
      >
        <div className="rec-note rec-note--warn">{fail}</div>
      </Dialog>
    );
  if (!data || !tpl)
    return (
      <Dialog
        open
        onOpenChange={(o) => !o && onClose()}
        title={w.title[stage]}
        lang={lang}
        size="xl"
      >
        <span className="skeleton" style={{ height: 320 }} />
      </Dialog>
    );

  const q = list[Math.min(qi, Math.max(0, list.length - 1))];
  const doneQ = list.filter((x) => (ans[x.id] ?? "").trim() || skip.includes(x.id)).length;
  const plan = list.reduce((a, x) => a + x.m, 0);
  const upto = list.slice(0, qi + 1).reduce((a, x) => a + x.m, 0);
  const mySent = sent;
  const sc = sheetScore(lv, tpl.params);
  const suggested = verdictOf(sc, tpl.cut);
  const elapsed = started ? Math.max(0, Math.floor((now - new Date(started).getTime()) / 1000)) : 0;
  const over = started ? elapsed > tpl.minutes * 60 : false;
  const grup = (k: string) => {
    const g = tpl.groups.find((x) => x.key === k);
    return g ? bi(g.label, lang) : k;
  };
  const doneParams = tpl.params.filter((p) => lv[p.key] != null && (cl[p.key] ?? "").trim()).length;
  const steps: { v: Step; l: string; sub: string; ok: boolean }[] = [
    ...(tpl.questions.length
      ? [
          {
            v: "tanya" as Step,
            l: t.steps[0],
            sub: t.of(doneQ, list.length),
            ok: doneQ === list.length,
          },
        ]
      : []),
    {
      v: "simpul",
      l: t.steps[1],
      sub: t.of(doneParams, tpl.params.length),
      ok: doneParams === tpl.params.length,
    },
    { v: "putus", l: t.steps[2], sub: verdict ? w.mine.verdict[verdict] : "-", ok: !!verdict },
  ];

  const ring = (key: string) => {
    setMiss(key);
    setTimeout(() => {
      body.current
        ?.querySelector(`[data-key="${key}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 80);
    setTimeout(() => setMiss(null), 1500);
  };
  const kirim = async () => {
    if (missing.length) {
      const m = missing[0];
      setStep(m === "verdict" ? "putus" : "simpul");
      ring(m);
      return;
    }
    if (!(await flush())) return toast(t.saveFail, "warn");
    const r = await recPost<{ ok: true }>("iv-sheet-send", { stage, id });
    if (isFail(r)) return toast(w.err[r.kode] ?? r.kode, "danger");
    const fresh = await fetchIvSheet(stage, id);
    if (!isFail(fresh)) setData(fresh);
    setSent(true);
    toast(t.sent);
  };
  const buka = async () => {
    const r = await recPost<{ ok: true }>("iv-sheet-reopen", { stage, id });
    if (isFail(r)) return toast(w.err[r.kode] ?? r.kode, "danger");
    setSent(false);
    setStep("putus");
  };
  const mulai = async () => {
    const r = await recPost<{ ok: true }>("iv-sheet-save", { stage, id, shared: { start: true } });
    if (isFail(r)) return toast(w.err[r.kode] ?? r.kode, "danger");
    setStarted(new Date().toISOString());
  };

  const slotJam = `${wibJam(data.slot.startsAt)} - ${wibJam(data.slot.endsAt)}`;
  const savedLabel =
    save === "saving" ? t.saving : save === "fail" ? t.saveFail : save === "saved" ? t.saved : "";
  const sisa = data.pair.filter((p) => !p.sent && p.nim !== data.me).length;

  const head = (
    <header className="r4cand">
      <div className="stack" style={{ gap: 2, minWidth: 0 }}>
        <span className="eyebrow rec-eyebrow num">
          {stage === "wawancara" ? `${w.mine.booth(data.slot.booth)} · ` : ""}
          {data.slot.room} · {slotJam}
        </span>
        <h2 className="h2 r4cand__n">{data.candidate.nama}</h2>
        <span className="hint mono">
          {data.candidate.nim} · {data.candidate.kelas}
        </span>
      </div>
      <div className="r4cand__side">
        <span className="r4pair">
          {data.pair.map((p, i) => (
            <span
              key={p.nim}
              className={`acode${p.nim === data.me ? " acode--me" : ""}`}
              title={p.sent ? t.sent : ""}
            >
              {i > 0 && <span className="r4pair__s">/</span>}
              {p.kode}
            </span>
          ))}
        </span>
        <button
          type="button"
          className="r4rec"
          aria-pressed={rec}
          title={t.recTip}
          disabled={locked}
          onClick={() => setRec(!rec)}
        >
          <span>{rec ? t.recOn : t.recOff}</span>
        </button>
        {started ? (
          <span
            className="r4clock"
            data-over={over ? "yes" : undefined}
            role="timer"
            aria-label={t.clock}
          >
            <b className="num">{clock(elapsed)}</b>
            <span className="hint num">/ {tpl.minutes}′</span>
          </span>
        ) : (
          !mySent &&
          !locked && (
            <button type="button" className="btn btn--inverse btn--sm" onClick={() => void mulai()}>
              {t.start}
            </button>
          )
        )}
        {!locked && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setKasus(true)}>
            {t.special}
          </button>
        )}
      </div>
    </header>
  );

  const nav = (
    <nav className="r4steps" role="tablist" aria-label={w.title[stage]}>
      {steps.map((s, i) => (
        <button
          key={s.v}
          type="button"
          role="tab"
          className="r4steps__b"
          aria-selected={step === s.v}
          data-ok={s.ok ? "yes" : undefined}
          onClick={() => setStep(s.v)}
        >
          <span className="r4steps__n">{s.ok ? "✓" : i + 1}</span>
          <span className="stack" style={{ gap: 0, minWidth: 0 }}>
            <b>{s.l}</b>
            <span className="hint num">{s.sub}</span>
          </span>
        </button>
      ))}
    </nav>
  );

  let lastG: string | null = null;
  const tanya = (
    <div className="r4qa">
      <aside className="r4rail" aria-label={t.questions}>
        <div className="r4rail__sum">
          <b className="num">
            {doneQ}/{list.length}
          </b>
          <span className="hint num">{t.planned(Math.round(upto), Math.round(plan))}</span>
          <span className="r4rail__bar">
            <i
              style={{ width: `${Math.min(100, (upto / Math.max(1, tpl.minutes)) * 100)}%` }}
              data-over={plan > tpl.minutes ? "yes" : undefined}
            />
          </span>
        </div>
        <ol className="r4rail__l">
          {list.map((x, i) => {
            const g = x.g !== lastG;
            lastG = x.g;
            const st = skip.includes(x.id) ? "skip" : (ans[x.id] ?? "").trim() ? "done" : "todo";
            return (
              <li key={x.id} style={{ display: "contents" }}>
                {g && (
                  <span className="r4rail__g" aria-hidden="true">
                    {grup(x.g)}
                  </span>
                )}
                <button
                  type="button"
                  className="r4rail__b"
                  data-st={st}
                  aria-current={i === qi ? "step" : undefined}
                  onClick={() => setQi(i)}
                >
                  <span className="r4rail__d" aria-hidden="true" />
                  <span className="r4rail__t">{bi(x.t, lang)}</span>
                  {x.only && <span className="r4rail__k">{t.onlyFm}</span>}
                  {x.m ? <span className="hint num">{x.m}′</span> : null}
                </button>
              </li>
            );
          })}
        </ol>
        {!locked && (
          <label className="check" style={{ marginTop: 8 }}>
            <input
              type="checkbox"
              checked={ans._lab === "1"}
              onChange={(e) => setAns({ ...ans, _lab: e.target.checked ? "1" : "" })}
            />
            <span>{t.labToggle}</span>
          </label>
        )}
      </aside>
      <div className="stack" style={{ minWidth: 0 }}>
        {q && (
          <section className="panel r4qc" data-key="q">
            <div className="row r4qc__top">
              <span className="eyebrow num">
                {t.of(Math.min(qi, list.length - 1) + 1, list.length)} · {grup(q.g)}
              </span>
              <span className="grow" />
              {q.only && <Pill tone="warn">{t.onlyFm}</Pill>}
              {q.m ? <Pill>{q.m}′</Pill> : null}
            </div>
            <h3 className="h2 r4qc__t">{bi(q.t, lang)}</h3>
            {q.h && (
              <div className="rec-note">
                <span>{bi(q.h, lang)}</span>
              </div>
            )}
            {q.reveal && (
              <div className="r4reveal">
                {score && data.scores ? (
                  <div className="rec-sum">
                    <span className="hint">{t.reveal}</span>
                    <b className="num">{data.scores.total ?? "-"}</b>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn--inverse btn--sm"
                    onClick={() => setScore(true)}
                  >
                    {t.revealBtn}
                  </button>
                )}
              </div>
            )}
            <label className="stack stack--sm">
              <span className="hint">{t.answer}</span>
              <textarea
                className="field__input r4qc__a"
                rows={6}
                value={ans[q.id] ?? ""}
                disabled={skip.includes(q.id) || locked}
                placeholder={t.answerPh}
                onChange={(e) => setAns({ ...ans, [q.id]: e.target.value })}
              />
            </label>
            <div className="row" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={locked}
                onClick={() =>
                  setSkip(skip.includes(q.id) ? skip.filter((x) => x !== q.id) : [...skip, q.id])
                }
              >
                {skip.includes(q.id) ? t.unskip : t.skip}
              </button>
              <span className="grow" />
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={qi === 0}
                onClick={() => setQi(qi - 1)}
              >
                {t.prev}
              </button>
              {qi < list.length - 1 ? (
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => setQi(qi + 1)}
                >
                  {t.next}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => setStep("simpul")}
                >
                  {t.toConcl}
                </button>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );

  const simpul = (
    <div className="stack r4par">
      <div className="rec-note">
        <span>{tpl.hideLevels ? t.levelHint : ""}</span>
      </div>
      {tpl.params.map((p) => {
        const levels = Array.from({ length: p.max - p.min + 1 }, (_, i) => p.min + i);
        const v = lv[p.key];
        return (
          <section
            key={p.key}
            className="panel r4p"
            data-done={v != null && (cl[p.key] ?? "").trim() ? "yes" : undefined}
          >
            <div className="row row--between" style={{ gap: 8 }}>
              <h3 className="h3">
                {bi(p.label, lang)}{" "}
                {p.example && (
                  <Pill tone="warn" title={w.tpl.exampleTip}>
                    {w.tpl.example}
                  </Pill>
                )}
              </h3>
              <span className="r4row__v">
                {v == null ? (
                  <span className="hint">-</span>
                ) : (
                  <>
                    <b className="num">{v}</b> <span>{bi(tpl.levels[v - p.min], lang)}</span>
                  </>
                )}
              </span>
            </div>
            {p.ind.length > 0 && (
              <ul className="r4ind">
                {p.ind.map((x, i) => (
                  <li key={i}>{bi(x, lang)}</li>
                ))}
              </ul>
            )}
            <div
              className="r4row"
              data-key={`lv-${p.key}`}
              data-miss={miss === `lv-${p.key}` ? "yes" : undefined}
              data-set={v != null ? "yes" : undefined}
            >
              <span className="hint">{t.levels}</span>
              <div className="r4seg" role="radiogroup" aria-label={bi(p.label, lang)}>
                {levels.map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    className="r4seg__b"
                    aria-checked={v === n}
                    aria-label={`${n}, ${bi(tpl.levels[n - p.min], lang)}`}
                    disabled={locked}
                    onClick={() => setLv({ ...lv, [p.key]: n })}
                  >
                    <b className="num">{n}</b>
                    <span className="r4seg__w">{bi(tpl.levels[n - p.min], lang)}</span>
                  </button>
                ))}
              </div>
            </div>
            <label
              className="stack stack--sm r4row"
              data-key={`cl-${p.key}`}
              data-miss={miss === `cl-${p.key}` ? "yes" : undefined}
            >
              <span className="hint">{t.concl}</span>
              <textarea
                className="field__input"
                rows={2}
                value={cl[p.key] ?? ""}
                disabled={locked}
                placeholder={t.conclPh(bi(p.eg, lang))}
                onChange={(e) => setCl({ ...cl, [p.key]: e.target.value })}
              />
            </label>
          </section>
        );
      })}
      <section className="panel r4p">
        <label className="stack stack--sm">
          <h3 className="h3">{t.other}</h3>
          <textarea
            className="field__input"
            rows={3}
            value={other}
            disabled={locked}
            placeholder={t.otherPh}
            onChange={(e) => setOther(e.target.value)}
          />
        </label>
      </section>
    </div>
  );

  const putus = (
    <div className="r4end">
      <section
        className="panel r4p"
        data-key="verdict"
        data-miss={miss === "verdict" ? "yes" : undefined}
      >
        <h3 className="h3">{t.verdict}</h3>
        <div className="r4verd" role="radiogroup" aria-label={t.verdict}>
          {VERDICTS.map((x) => (
            <button
              key={x}
              type="button"
              role="radio"
              className="r4verd__b"
              data-t={x === "lolos" ? "ok" : x === "ragu" ? "warn" : "danger"}
              aria-checked={verdict === x}
              disabled={locked}
              onClick={() => setVerdict(x)}
            >
              <b>{w.mine.verdict[x]}</b>
            </button>
          ))}
        </div>
        {tpl.params.every((p) => lv[p.key] != null) && (
          <span className="hint">
            {sc}/100 · {w.mine.verdict[suggested]}
          </span>
        )}
      </section>
      <section className="panel r4p">
        <h3 className="h3">{t.ba}</h3>
        <textarea
          className="field__input"
          rows={3}
          value={ba}
          disabled={locked}
          placeholder={t.baPh}
          onChange={(e) => setBa(e.target.value)}
        />
      </section>
      {data.shared?.case && (
        <div className="rec-note rec-note--warn">
          <b>
            {data.shared.case.status === "gugur"
              ? w.mine.caseGugur
              : data.shared.case.status === "susulan"
                ? w.mine.caseSusulan
                : w.kasus.tag.carry}
          </b>
          <span>{w.kasus.out[data.shared.case.note as keyof typeof w.kasus.out] ?? ""}</span>
        </div>
      )}
      {mySent && (
        <div className="rec-note">
          <b>{t.sent}</b>
          <span>{t.sentBody}</span>
          <span>{sisa > 0 ? t.waitMate(sisa) : t.allSent}</span>
        </div>
      )}
      {data.others.length > 0 && (
        <section className="panel r4p">
          <h3 className="h3">{t.mates}</h3>
          <ul className="r4sum__l">
            {data.others.map((o) => (
              <li key={o.kode} data-ok="yes">
                <span>
                  {o.kode}: {sheetScore(o.levels, tpl.params)}/100
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );

  const aksi = locked ? null : mySent ? (
    <button type="button" className="btn btn--ghost" onClick={() => void buka()}>
      {t.reopen}
    </button>
  ) : (
    <button type="button" className="btn btn--primary" onClick={() => void kirim()}>
      {missing.length ? `${t.send} · ${missing.length}` : t.send}
    </button>
  );

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={w.title[stage]}
      description={`${data.slot.room} · ${slotJam}`}
      lang={lang}
      size="xl"
      actions={
        <>
          <span className="r4save hint" role="status">
            {locked
              ? t.locked
              : partnerAt && save !== "saving" && save !== "fail"
                ? t.partner
                : savedLabel}
          </span>
          <span className="grow" />
          {tpl.params.every((p) => lv[p.key] != null) && (
            <span className="r3score r4score">
              <b className="num">{sc}</b>
              <span className="hint">/100</span>
            </span>
          )}
          {aksi}
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t.close}
          </button>
        </>
      }
    >
      <div className="r4sheet" ref={body}>
        {head}
        {nav}
        {step === "tanya" && tpl.questions.length ? tanya : step === "simpul" ? simpul : putus}
      </div>
      {kasus && (
        <Kasus
          lang={lang}
          stage={stage}
          data={data}
          onClose={() => setKasus(false)}
          onDone={() => {
            setKasus(false);
            toast(w.kasus.tag.carry);
            void fetchIvSheet(stage, id).then((r) => {
              if (!isFail(r)) setData(r);
            });
          }}
        />
      )}
    </Dialog>
  );
}
