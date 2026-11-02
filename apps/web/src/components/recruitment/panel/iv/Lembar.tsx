/**
 * The sheet of one CaAs (mockup r4-lembar, Wawancara and Mengajar). A pair or
 * panel fills ONE document: the answers, the conclusions and the verdict are
 * shared, saved by themselves; each examiner's 1 to 5 level per parameter is
 * private until every sheet is sent. Three steps (Pertanyaan, Kesimpulan,
 * Keputusan); Kirim never sits dead: pressed with a gap it jumps to the first
 * empty field. A special case (late, absent, ill) is decided by the
 * template's rules and recorded on the sheet.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  WrenchIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowSquareOutIcon,
  CheckCircleIcon,
  CheckIcon,
  ClockCountdownIcon,
  DoorOpenIcon,
  EyeIcon,
  FileTextIcon,
  PaperPlaneTiltIcon,
  PlusIcon,
  QuestionIcon,
  RecordIcon,
  TimerIcon,
  UserIcon,
  UserMinusIcon,
  WarningIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import Dialog from "../../../ui/Dialog";
import Dropdown from "../../../ui/Dropdown";
import IconButton from "../../../ui/IconButton";
import Pill from "../../../ui/Pill";
import Popover from "../../../ui/Popover";
import Tooltip from "../../../ui/Tooltip";
import { Stepper } from "../../../ui/Controls";
import { localeOf } from "../../../../lib/app";
import type { Lang } from "../../../../lib/kelas";
import { isFail, recPost } from "../../../../lib/recruitment/client";
import {
  fetchIvSheet,
  useIvMine,
  type IvSheetResponse,
} from "../../../../lib/recruitment/iv-client";
import { useSiaran } from "../../../../lib/siaran";
import { baseOf, mixSheet, sheetDelta, type SheetBase } from "../../../../lib/recruitment/iv-sync";
import {
  caseKindsFor,
  EXCUSE_WHY,
  LATE_WHY,
  caseOutcome,
  sheetMissing,
  sheetScore,
  type CaseKind,
  type IvQuestion,
  type IvStage,
  type Verdict,
} from "../../../../lib/recruitment/interview";
import { IV, STEP, bi, kasusText } from "./ivStrings";
import { LM } from "./lembarStrings";
import { M6 } from "./lembar6Strings";
import { ASKED_PREFIX, CATATAN_KEY, Catatan, T5, readAsked } from "./TubesParts";
import {
  Amati,
  NOTE_PREFIX,
  PanelSent,
  TOPIC_KEY,
  TurnClock,
  mmss,
  newNoteId,
  noteValue,
  readNotes,
} from "./MengajarParts";
import { PN } from "./penilaianStrings";

type Step = "tanya" | "simpul" | "putus";
const VERDICTS: Verdict[] = ["lolos", "ragu", "cut"];
const toast = (m: string, tone: "ok" | "warn" | "danger" = "ok") => window.Toast?.show(m, tone);
const pad = (n: number) => String(n).padStart(2, "0");
const calm = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
type View = "sheet" | "sent" | "kasus";
/** A card the examiner added for themselves: kept on this browser only, never in the template or on the server. */
interface OwnCard {
  id: string;
  t: string;
}
const ownKey = (stage: string, id: number) => `iris:rec:own:${stage}:${id}`;
const readOwn = (
  stage: string,
  id: number,
): { extra: OwnCard[]; ans: Record<string, string>; skip: string[] } => {
  try {
    const v = JSON.parse(localStorage.getItem(ownKey(stage, id)) ?? "null");
    if (v && Array.isArray(v.extra) && v.ans && typeof v.ans === "object")
      return { extra: v.extra, ans: v.ans, skip: Array.isArray(v.skip) ? v.skip : [] };
  } catch {
    /* no storage: start with none */
  }
  return { extra: [], ans: {}, skip: [] };
};

function clock(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(sec % 60)}` : `${pad(m)}:${pad(sec % 60)}`;
}

/* ------------------------------------------------------------ special cases */

const CASE_ICON: Record<CaseKind, typeof UserIcon> = {
  telat: ClockCountdownIcon,
  absen: UserMinusIcon,
  sakit: WarningIcon,
  teknis: WrenchIcon,
  lewat: TimerIcon,
  nametag: UserIcon,
  keluar: DoorOpenIcon,
};

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
      description={kasusText(t.desc(data.candidate.nama), stage, lang, null)}
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
          {caseKindsFor(stage).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              className="r4cases__b"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
            >
              {(() => {
                const Ic = CASE_ICON[k];
                return <Ic size={20} aria-hidden="true" />;
              })()}
              <span>{kasusText(t.kinds[k], stage, lang, null)}</span>
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
          <span>
            {kasusText(
              t.out[out.code],
              stage,
              lang,
              data.makeup
                ? new Intl.DateTimeFormat(localeOf(lang), {
                    timeZone: "Asia/Jakarta",
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  }).format(new Date(`${data.makeup}T12:00:00+07:00`))
                : null,
            )}
          </span>
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
  onNext,
}: {
  lang: Lang;
  stage: IvStage;
  id: number;
  onClose: () => void;
  /** Open the sheet of the next CaAs in the slot (the teaching test's Giliran Berikutnya) */
  onNext?: (id: number) => void;
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
  const [view, setView] = useState<View>("sheet");
  const [extra, setExtra] = useState<OwnCard[]>(() => readOwn(stage, id).extra);
  const [ownAns, setOwnAns] = useState<Record<string, string>>(() => readOwn(stage, id).ans);
  const [ownSkip, setOwnSkip] = useState<string[]>(() => readOwn(stage, id).skip);
  const [ownText, setOwnText] = useState("");
  const [tag, setTag] = useState("");
  const [askDraft, setAskDraft] = useState("");
  const [noteTxt, setNoteTxt] = useState("");
  /** The teaching clock can be paused on this laptop (a technical problem); the pause is not shared */
  const [pauseAt, setPauseAt] = useState<number | null>(null);
  const [pausedMs, setPausedMs] = useState(0);
  const [fopen, setFopen] = useState(false);
  const [vid, setVid] = useState<{ kelas: "tidak" | "ya" | null; at: string; ok: boolean }>({
    kelas: null,
    at: "",
    ok: false,
  });
  const mine = useIvMine(stage);
  const L = LM[lang];
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

  const init = useCallback(
    (d: IvSheetResponse) => {
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
      setView(d.mine.sentAt ? "sent" : "sheet");
      setVid({
        kelas: null,
        at: new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Jakarta",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date(Date.parse(d.slot.endsAt) + 3_600_000)),
        ok: false,
      });
      setStep(
        d.template.questions.length || stage === "mengajar" || stage === "tubes"
          ? "tanya"
          : "simpul",
      );
      base.current = baseOf(d);
      ready.current = true;
    },
    [stage],
  );

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

  useEffect(() => {
    try {
      localStorage.setItem(
        ownKey(stage, id),
        JSON.stringify({ extra, ans: ownAns, skip: ownSkip }),
      );
    } catch {
      /* the cards still show */
    }
  }, [stage, id, extra, ownAns, ownSkip]);

  /** The step and the question slide in from the side (the mockup's 0.18 s), unless motion is reduced. */
  const slide = (dir: number) => {
    const el = body.current;
    if (!el || calm() || !el.animate) return;
    el.animate(
      [
        { opacity: 0, transform: `translateX(${10 * dir}px)` },
        { opacity: 1, transform: "translateX(0)" },
      ],
      { duration: 180, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
    );
  };

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
  const own = useMemo(
    () =>
      tpl
        ? extra.map((e): IvQuestion => ({
            id: e.id,
            g: "saya",
            m: 0,
            p: tpl.params[0]?.key ?? "",
            t: { id: e.t, en: e.t },
            h: null,
            only: null,
          }))
        : [],
    [tpl, extra],
  );
  const list = useMemo(() => {
    if (!tpl) return [];
    return tpl.questions
      .filter(
        (q) =>
          !q.only || (q.only === "fm" && data?.cond.fm) || (q.only === "lab" && ans._lab === "1"),
      )
      .concat(own);
  }, [tpl, data?.cond.fm, ans._lab, own]);

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

  const isOwn = (id: string) => extra.some((e) => e.id === id);
  const skipped = (id: string) => (isOwn(id) ? ownSkip.includes(id) : skip.includes(id));
  const toggleSkip = (id: string) => {
    const set = isOwn(id) ? setOwnSkip : setSkip;
    set((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };
  const valOf = (id: string) => (isOwn(id) ? (ownAns[id] ?? "") : (ans[id] ?? ""));
  const setVal = (id: string, v: string) =>
    isOwn(id) ? setOwnAns({ ...ownAns, [id]: v }) : setAns({ ...ans, [id]: v });
  const q = list[Math.min(qi, Math.max(0, list.length - 1))];
  const doneQ = list.filter((x) => valOf(x.id).trim() || skipped(x.id)).length;
  const unanswered = list.length - doneQ;
  const plan = list.reduce((a, x) => a + x.m, 0);
  const upto = list.slice(0, qi + 1).reduce((a, x) => a + x.m, 0);
  const mySent = sent;
  const allLv = tpl.params.every((p) => lv[p.key] != null);
  const sc = sheetScore(lv, tpl.params);
  const elapsed = started ? Math.max(0, Math.floor((now - new Date(started).getTime()) / 1000)) : 0;
  const over = started ? elapsed > tpl.minutes * 60 : false;
  const grup = (k: string) => {
    if (k === "saya") return L.mine;
    const g = tpl.groups.find((x) => x.key === k);
    return g ? bi(g.label, lang) : k;
  };
  const mate = data.pair.find((p) => p.nim !== data.me)?.kode ?? "";
  const first = (data.candidate.nama ?? "").split(" ")[0];
  const meKode = data.pair.find((p) => p.nim === data.me)?.kode ?? "";
  /** Me first, then the partner or the rest of the panel (the form's "Kode Pewawancara": you / your partner) */
  const pairMeFirst = [...data.pair].sort(
    (a, b) => Number(b.nim === data.me) - Number(a.nim === data.me),
  );
  const doneParams = tpl.params.filter((p) => lv[p.key] != null && (cl[p.key] ?? "").trim()).length;
  const simpulLeft = tpl.params.length - doneParams;
  const hm = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  const dayLong = (iso: string) =>
    new Intl.DateTimeFormat(localeOf(lang), {
      timeZone: "Asia/Jakarta",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(iso));
  const durText = (min: number) => `${Math.floor(min / 60)}:${pad(Math.round(min % 60))}:00`;
  const durShort = (min: number) => `${Math.floor(min / 60)}:${pad(Math.round(min % 60))}`;
  const verdictName = verdict ? w.mine.verdict[verdict] : "-";

  // The teaching test (mockup r6-lembar): a turn of the panel, timed notes, a countdown that can be paused.
  const mg = stage === "mengajar";
  const tb = stage === "tubes";
  const T = T5[lang];
  const asked = tb ? readAsked(ans) : [];
  const catatan = ans[CATATAN_KEY] ?? "";
  const addAsked = () => {
    const tx = askDraft.trim();
    if (!tx || locked) return;
    const nid = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
    setAns({ ...ans, [ASKED_PREFIX + nid]: tx });
    setAskDraft("");
  };
  const removeAsked = (qid: string) => setAns({ ...ans, [ASKED_PREFIX + qid]: "" });
  const M = M6[lang];
  const mates = data.pair.filter((p) => p.nim !== data.me).map((p) => p.kode);
  const notes = mg ? readNotes(ans) : [];
  const topic = ans[TOPIC_KEY] ?? "";
  const turnMs = (tpl.minutes + tpl.gap) * 60_000;
  const turnFrom = new Date(Date.parse(data.slot.startsAt) + (data.slot.booth - 1) * turnMs);
  const turnTo = new Date(turnFrom.getTime() + tpl.minutes * 60_000);
  const startedMs = started ? new Date(started).getTime() : 0;
  const turnSec = started
    ? Math.max(0, Math.floor(((pauseAt ?? now) - startedMs - pausedMs) / 1000))
    : 0;
  const turnLeft = tpl.minutes * 60 - turnSec;
  const turnOver = started && turnLeft < 0;
  const addNote = (text: string, row?: string) => {
    const t = text.trim();
    if (!t || locked) return;
    const nid = newNoteId();
    setAns({
      ...ans,
      [NOTE_PREFIX + nid]: noteValue({
        t: mmss(Math.min(turnSec, 99 * 60)),
        row: row ?? tag,
        text: t,
      }),
    });
    setNoteTxt("");
  };
  const removeNote = (nid: string) => setAns({ ...ans, [NOTE_PREFIX + nid]: "" });
  const togglePause = () => {
    if (pauseAt === null) setPauseAt(Date.now());
    else {
      setPausedMs((m) => m + (Date.now() - pauseAt));
      setPauseAt(null);
    }
  };
  const nextTurnCand = mg
    ? mine.data?.slots
        .find((x) => x.id === data.slot.id)
        ?.booths.filter((b) => b.index + 1 > data.slot.booth && b.candidate)[0]
    : undefined;

  const steps: { v: Step; l: string; sub: string; ok: boolean }[] = [
    ...(tb
      ? [
          {
            v: "tanya" as Step,
            l: T.steps[0],
            sub: T.count(asked.length),
            ok: catatan.trim().length > 0 || asked.length > 0,
          },
        ]
      : mg
        ? [
            {
              v: "tanya" as Step,
              l: M.steps[0],
              sub: M.notesN(notes.length),
              ok: notes.length > 0,
            },
          ]
        : tpl.questions.length
          ? [
              {
                v: "tanya" as Step,
                l: L.steps[0],
                sub: L.ofN(doneQ, list.length),
                ok: unanswered === 0,
              },
            ]
          : []),
    {
      v: "simpul",
      l: tb ? T.steps[1] : mg ? M.steps[1] : L.steps[1],
      sub: L.ofN(doneParams, tpl.params.length),
      ok: simpulLeft === 0,
    },
    {
      v: "putus",
      l: tb ? T.steps[2] : mg ? M.steps[2] : L.steps[2],
      sub: verdict ? verdictName : L.notYet,
      ok: !!verdict,
    },
  ];

  const geser = (s: Step) => {
    if (s === step) return;
    slide(1);
    setStep(s);
  };
  const keQ = (i: number) => {
    if (i === qi) return;
    slide(i > qi ? 1 : -1);
    setQi(Math.max(0, Math.min(list.length - 1, i)));
  };
  const ring = (key: string) => {
    setMiss(key);
    setTimeout(() => {
      body.current
        ?.querySelector(`[data-key="${key}"]`)
        ?.scrollIntoView({ block: "center", behavior: calm() ? "auto" : "smooth" });
    }, 80);
    setTimeout(() => setMiss(null), 1500);
  };
  const kirim = async () => {
    if (missing.length) {
      const m = missing[0];
      geser(m === "verdict" ? "putus" : "simpul");
      ring(m);
      return;
    }
    if (!(await flush())) return toast(t.saveFail, "warn");
    if (mySent) return toast(L.changesSaved);
    const r = await recPost<{ ok: true }>("iv-sheet-send", { stage, id });
    if (isFail(r)) return toast(w.err[r.kode] ?? r.kode, "danger");
    const fresh = await fetchIvSheet(stage, id);
    if (!isFail(fresh)) setData(fresh);
    setSent(true);
    setView("sent");
  };
  const tarik = async () => {
    const r = await recPost<{ ok: true }>("iv-sheet-reopen", { stage, id });
    if (isFail(r)) return toast(w.err[r.kode] ?? r.kode, "danger");
    setSent(false);
    setView("sheet");
    toast(mg ? M.withdrawn : L.withdrawn(mate), "warn");
  };
  const mulai = async () => {
    const r = await recPost<{ ok: true }>("iv-sheet-save", { stage, id, shared: { start: true } });
    if (isFail(r)) return toast(w.err[r.kode] ?? r.kode, "danger");
    setStarted(new Date().toISOString());
  };
  const tambahKartu = () => {
    const tx = ownText.trim();
    if (!tx) return;
    let n = extra.length + 1;
    while (extra.some((e) => e.id === `x${n}`)) n++;
    setExtra([...extra, { id: `x${n}`, t: tx }]);
    setOwnText("");
    toast(L.ownAdded);
    setTimeout(() => setQi(list.length), 0);
  };
  const tambahBa = (tx: string) => setBa((ba ? `${ba}\n` : "") + tx + ".");
  const catatTenggat = () => {
    tambahBa(L.vidBa(vid.at).replace(/\.$/, ""));
    setVid({ ...vid, ok: true });
    toast(L.vidToast(vid.at, first));
  };

  const slotFrom = hm(data.slot.startsAt);
  const slotTo = hm(data.slot.endsAt);
  const subLine = `${data.slot.room} · ${L.sub(dayLong(data.slot.startsAt), slotFrom, slotTo)}`;
  const savedLabel =
    save === "saving"
      ? t.saving
      : save === "fail"
        ? t.saveFail
        : save === "saved"
          ? L.saved(hm(new Date(now).toISOString()))
          : "";
  const nextSlot = mine.data?.slots
    .filter((s) => s.role === "penguji" && Date.parse(s.startsAt) > Date.parse(data.slot.startsAt))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0];
  const nextBooth = nextSlot?.booths.find((b) => b.mine);

  const files = (
    <span className="r4files">
      <Popover
        open={fopen}
        onOpenChange={setFopen}
        trigger={
          <button type="button" className="btn btn--ghost btn--sm">
            <FileTextIcon size={18} aria-hidden="true" />
            <span className="btn__label">{L.files}</span>
          </button>
        }
      >
        <div className="stack stack--sm">
          <b>{L.filesOf(first)}</b>
          <span className="hint">{L.filesHint}</span>
          {data.files.length === 0 && <span className="hint">{L.filesNone}</span>}
          {data.files.map((f) => (
            <a
              key={f.id}
              className="r4pick__o"
              href={`/api/recruitment/berkas?id=${f.id}`}
              target="_blank"
              rel="noreferrer"
            >
              <FileTextIcon size={18} aria-hidden="true" />
              <b>{bi(f.label, lang)}</b>
              <ArrowSquareOutIcon size={18} aria-hidden="true" />
            </a>
          ))}
        </div>
      </Popover>
    </span>
  );

  const head = (
    <header className="r4cand">
      <div className="stack" style={{ gap: 2, minWidth: 0 }}>
        <span className="eyebrow rec-eyebrow num">
          {tb
            ? T.turn(data.slot.room, data.slot.booth, hm(turnFrom.toISOString()))
            : mg
              ? M.turn(
                  data.slot.booth,
                  data.slot.room,
                  hm(turnFrom.toISOString()),
                  hm(turnTo.toISOString()),
                )
              : L.eyebrow(data.slot.booth, data.slot.room, slotFrom, slotTo, stage)}
        </span>
        <h2 className="h2 r4cand__n">{data.candidate.nama}</h2>
        <span className="hint mono">
          {data.candidate.nim} · {data.candidate.kelas}
        </span>
      </div>
      <div className="r4cand__side">
        <Tooltip label={mg ? M.panelTip : L.pairTip}>
          <span className="r4pair">
            {pairMeFirst.map((p, i) => (
              <Fragment key={p.nim}>
                {i > 0 && <span className="r4pair__s">/</span>}
                <span className={`acode${p.nim === data.me ? " acode--me" : ""}`}>{p.kode}</span>
              </Fragment>
            ))}
          </span>
        </Tooltip>
        {data.here && <Pill tone="ok">{L.here(hm(data.here))}</Pill>}
        {!mg && !tb && files}
        {!mg && !tb && (
          <button
            type="button"
            className="r4rec"
            aria-pressed={rec}
            data-warn={!rec && !!started ? "yes" : undefined}
            title={L.recTip}
            disabled={locked}
            onClick={() => setRec(!rec)}
          >
            <RecordIcon size={18} aria-hidden="true" />
            <span>{rec ? L.recOn : L.recOff}</span>
          </button>
        )}
        {!mySent &&
          (mg && started ? (
            <TurnClock
              lang={lang}
              minutes={tpl.minutes}
              left={turnLeft}
              running={pauseAt === null}
              onToggle={togglePause}
            />
          ) : started ? (
            <span
              className="r4clock"
              data-over={over ? "yes" : undefined}
              role="timer"
              aria-label={L.clock}
            >
              <b className="num">{clock(elapsed)}</b>
              <span
                className="hint num"
                title={L.clockTip(durText(tpl.minutes), durText(tpl.maxMinutes))}
              >
                {L.clockOf(durShort(tpl.minutes))}
              </span>
            </span>
          ) : (
            !locked && (
              <button
                type="button"
                className="btn btn--inverse btn--sm"
                onClick={() => void mulai()}
              >
                <span className="btn__label">{tb ? T.start : mg ? M.startTurn : L.start}</span>
              </button>
            )
          ))}
      </div>
    </header>
  );

  const nav = (
    <nav className="r4steps" role="tablist" aria-label={L.stepsAria}>
      {steps.map((s, i) => (
        <button
          key={s.v}
          type="button"
          role="tab"
          className="r4steps__b"
          aria-selected={step === s.v}
          data-ok={s.ok ? "yes" : undefined}
          onClick={() => geser(s.v)}
        >
          <span className="r4steps__n">
            {s.ok ? <CheckIcon size={16} weight="bold" aria-hidden="true" /> : i + 1}
          </span>
          <span className="stack" style={{ gap: 0, minWidth: 0 }}>
            <b>{s.l}</b>
            <span className="hint num">{s.sub}</span>
          </span>
        </button>
      ))}
    </nav>
  );

  let lastG: string | null = null;
  const narrow = typeof window !== "undefined" && window.innerWidth < 900;
  const rail = (
    <aside className="r4rail" aria-label={L.rail}>
      <div className="r4rail__sum">
        <b className="num">
          {doneQ}/{list.length}
        </b>
        <span className="hint num">
          {L.planned(Math.round(upto * 10) / 10, Math.round(plan * 10) / 10)}
        </span>
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
          const st = skipped(x.id) ? "skip" : valOf(x.id).trim() ? "done" : "todo";
          return (
            <Fragment key={x.id}>
              {g && (
                <li className="r4rail__g" aria-hidden="true">
                  {grup(x.g)}
                </li>
              )}
              <li>
                <button
                  type="button"
                  className="r4rail__b"
                  data-st={st}
                  aria-current={i === qi ? "step" : undefined}
                  onClick={() => keQ(i)}
                >
                  <span className="r4rail__d" aria-hidden="true" />
                  <span className="r4rail__t">{bi(x.t, lang)}</span>
                  {x.only && <span className="r4rail__k">{L.special.toLowerCase()}</span>}
                  {x.m ? <span className="hint num">{x.m}′</span> : ""}
                </button>
              </li>
            </Fragment>
          );
        })}
      </ol>
      {!locked && (
        <div className="r4own">
          <input
            className="field__input input"
            value={ownText}
            onChange={(e) => setOwnText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              tambahKartu();
            }}
            placeholder={L.own}
            aria-label={L.ownAria}
          />
          <IconButton
            icon={PlusIcon}
            label={L.ownAdd}
            onClick={tambahKartu}
            disabled={!ownText.trim()}
          />
        </div>
      )}
      {!locked && (
        <label className="check" style={{ marginTop: 8 }}>
          <input
            type="checkbox"
            checked={ans._lab === "1"}
            onChange={(e) => setAns({ ...ans, _lab: e.target.checked ? "1" : "" })}
          />
          <span>{L.labToggle}</span>
        </label>
      )}
    </aside>
  );
  const pilih = narrow && list.length > 0 && (
    <Dropdown
      id="iv-q-pick"
      label={L.steps[0]}
      hideLabel
      value={String(qi)}
      onChange={(v) => keQ(Number(v))}
      options={list.map((x, i) => ({ value: String(i), label: `${i + 1}. ${bi(x.t, lang)}` }))}
    />
  );

  const tanya = (
    <div className="r4qa">
      {!narrow && rail}
      <div className="stack" style={{ minWidth: 0 }}>
        {pilih}
        {q && (
          <section className="panel r4qc" data-key="q">
            <div className="row r4qc__top">
              <span className="eyebrow num">
                {L.qEyebrow(Math.min(qi, list.length - 1) + 1, list.length, grup(q.g))}
              </span>
              <span className="grow" />
              {q.only && <Pill tone="warn">{L.special}</Pill>}
              {q.g === "inggris" && <Pill>{L.en}</Pill>}
              {q.m ? (
                <Pill>
                  <TimerIcon size={14} aria-hidden="true" /> {L.about(q.m)}
                </Pill>
              ) : null}
            </div>
            <h3 className="h2 r4qc__t">{bi(q.t, lang)}</h3>
            {q.h && (
              <div className="rec-note">
                <span>{bi(q.h, lang)}</span>
              </div>
            )}
            {q.only && <span className="hint">{L.shownBecause(L.cond[q.only])}</span>}
            {q.reveal && (
              <div className="r4reveal">
                {score && data.scores ? (
                  <div className="rec-sum">
                    <span className="hint">{L.revealTotal}</span>
                    <b className="num">{data.scores.total ?? "-"}</b>
                    {data.scores.rank !== null && (
                      <>
                        <span className="hint">{L.revealRank}</span>
                        <b className="num">
                          {data.scores.rank} {L.revealOf(data.scores.of)}
                        </b>
                      </>
                    )}
                  </div>
                ) : (
                  <button type="button" className="btn btn--inverse" onClick={() => setScore(true)}>
                    <EyeIcon size={18} aria-hidden="true" />
                    <span className="btn__label">{L.revealBtn}</span>
                  </button>
                )}
                <span className="hint">{L.revealHint}</span>
              </div>
            )}
            <label className="stack stack--sm">
              <span className="hint">{L.answer}</span>
              <textarea
                className="field__input r4qc__a"
                rows={6}
                value={valOf(q.id)}
                disabled={skipped(q.id) || locked}
                placeholder={skipped(q.id) ? L.skippedPh : L.answerPh}
                onChange={(e) => setVal(q.id, e.target.value)}
              />
            </label>
          </section>
        )}
        {mate && (
          <div className="rec-note r4mate">
            <span className="r4mate__d" aria-hidden="true" />
            <span>{partnerAt ? L.mateLive(mate) : L.mate(mate)}</span>
          </div>
        )}
      </div>
    </div>
  );

  const catatanStep = (
    <Catatan
      lang={lang}
      text={catatan}
      asked={asked}
      draft={askDraft}
      locked={locked}
      mates={mates}
      setText={(v) => setAns({ ...ans, [CATATAN_KEY]: v })}
      setDraft={setAskDraft}
      add={addAsked}
      remove={removeAsked}
    />
  );

  const amati = (
    <Amati
      lang={lang}
      tpl={tpl}
      notes={notes}
      topic={topic}
      tag={tag}
      txt={noteTxt}
      locked={locked}
      mates={mates}
      partnerLive={!!partnerAt}
      setTopic={(v) => setAns({ ...ans, [TOPIC_KEY]: v })}
      setTag={setTag}
      setTxt={setNoteTxt}
      addNote={addNote}
      removeNote={removeNote}
    />
  );

  const simpul = (
    <div className="stack r4par">
      {tpl.hideLevels && mate && (
        <div className="rec-note">
          <span>{mg ? M.levelHint(mates.join(", ")) : L.levelHint(mate)}</span>
        </div>
      )}
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
                {bi(p.label, lang)} {mg && p.example && <Pill tone="warn">{M.sample}</Pill>}
              </h3>
              <span className="r4row__v">
                {v == null ? (
                  <span className="hint">{L.notYet}</span>
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
            {mg && notes.some((n) => n.row === p.key) && (
              <ul className="r6mini">
                {notes
                  .filter((n) => n.row === p.key)
                  .map((n) => (
                    <li key={n.id}>
                      <span className="num">{n.t}</span> {n.text}
                    </li>
                  ))}
              </ul>
            )}
            <div
              className="r4row"
              data-key={`lv-${p.key}`}
              data-miss={miss === `lv-${p.key}` ? "yes" : undefined}
              data-set={v != null ? "yes" : undefined}
            >
              <span className="hint">{L.myLevel}</span>
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
              <span className="hint">{L.sharedConcl}</span>
              <textarea
                className="field__input"
                rows={2}
                value={cl[p.key] ?? ""}
                disabled={locked}
                placeholder={bi(p.eg, lang)}
                onChange={(e) => setCl({ ...cl, [p.key]: e.target.value })}
              />
            </label>
          </section>
        );
      })}
      <section className="panel r4p">
        <label className="stack stack--sm">
          <h3 className="h3">{L.other}</h3>
          <textarea
            className="field__input"
            rows={3}
            value={other}
            disabled={locked}
            placeholder={mg ? M.otherPh : L.otherPh}
            onChange={(e) => setOther(e.target.value)}
          />
        </label>
      </section>
    </div>
  );

  const VICON = { lolos: CheckCircleIcon, ragu: QuestionIcon, cut: XCircleIcon } as const;
  const kurangSimpul = missing.filter((m) => m !== "verdict").length;
  const putus = (
    <div className="r4end">
      <section
        className="panel r4p"
        data-key="verdict"
        data-miss={miss === "verdict" ? "yes" : undefined}
      >
        <h3 className="h3">{mg ? M.verdictTitle : L.verdictTitle}</h3>
        <div className="r4verd" role="radiogroup" aria-label={L.steps[2]}>
          {VERDICTS.map((x) => {
            const Ic = VICON[x];
            return (
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
                <Ic size={28} aria-hidden="true" />
                <b>{w.mine.verdict[x]}</b>
              </button>
            );
          })}
        </div>
        <span className="hint">{mg ? M.verdictHint(mates.join(", ")) : L.verdictHint(mate)}</span>
      </section>
      <section className="panel r4p">
        <h3 className="h3">{L.ba}</h3>
        <div className="rec-chips">
          {(mg ? M.baChips : L.baChips).map((x) => (
            <button key={x} type="button" className="chipbtn" onClick={() => tambahBa(x)}>
              {x}
            </button>
          ))}
        </div>
        <textarea
          className="field__input"
          rows={3}
          value={ba}
          disabled={locked}
          placeholder={mg ? M.baPh : L.baPh}
          onChange={(e) => setBa(e.target.value)}
        />
        {!locked && (
          <span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setKasus(true)}>
              <WarningIcon size={18} aria-hidden="true" />
              <span className="btn__label">{L.caseBtn}</span>
            </button>
          </span>
        )}
      </section>
      <section className="panel r4sum">
        <h3 className="h3">{L.before}</h3>
        <ul className="r4sum__l">
          <li data-ok={(mg ? notes.length > 0 : unanswered === 0) ? "yes" : "warn"}>
            {(mg ? notes.length > 0 : unanswered === 0) ? (
              <CheckCircleIcon size={18} aria-hidden="true" />
            ) : (
              <WarningIcon size={18} aria-hidden="true" />
            )}
            <span>
              {mg
                ? notes.length > 0
                  ? M.chkNotes(notes.length)
                  : M.chkNoNotes
                : unanswered === 0
                  ? L.chkAll
                  : L.chkQ(unanswered)}
            </span>
          </li>
          <li data-ok={kurangSimpul ? "no" : "yes"}>
            {kurangSimpul ? (
              <XCircleIcon size={18} aria-hidden="true" />
            ) : (
              <CheckCircleIcon size={18} aria-hidden="true" />
            )}
            <span>
              {kurangSimpul
                ? L.chkConcl(kurangSimpul)
                : mg
                  ? M.chkRows(tpl.params.length)
                  : L.chkConclOk}
            </span>
          </li>
          <li data-ok={verdict ? "yes" : "no"}>
            {verdict ? (
              <CheckCircleIcon size={18} aria-hidden="true" />
            ) : (
              <XCircleIcon size={18} aria-hidden="true" />
            )}
            <span>{verdict ? L.chkVerdict(verdictName) : L.chkNoVerdict}</span>
          </li>
          <li data-ok={(mg ? !turnOver : rec) ? "yes" : "warn"}>
            {(mg ? !turnOver : rec) ? (
              <CheckCircleIcon size={18} aria-hidden="true" />
            ) : (
              <WarningIcon size={18} aria-hidden="true" />
            )}
            <span>
              {mg
                ? turnOver
                  ? M.chkTimeOver(mmss(Math.abs(turnLeft)), tpl.minutes)
                  : M.chkTimeOk
                : rec
                  ? L.chkRecOn
                  : L.chkRecOff}
            </span>
          </li>
        </ul>
      </section>
    </div>
  );

  const sentView = (
    <div className="r4sent" data-rv>
      <span className="r4sent__ic" aria-hidden="true">
        <svg viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="28" pathLength="100" />
          <path d="M20 33 l8 8 l16 -18" pathLength="100" />
        </svg>
      </span>
      <h2 className="h2">{L.sentTitle(first)}</h2>
      <p className="hint">
        {mg
          ? M.sentBody(
              verdictName,
              allLv ? sc : 0,
              data.cutting ? dayLong(`${data.cutting}T12:00:00+07:00`) : null,
            )
          : L.sentBody(
              verdictName,
              allLv ? sc : 0,
              PN[lang].cuttingOf[stage],
              data.cutting ? dayLong(`${data.cutting}T12:00:00+07:00`) : null,
            )}
      </p>
      {mg ? (
        <PanelSent
          lang={lang}
          tpl={tpl}
          me={meKode}
          panel={pairMeFirst.map((p) => ({ kode: p.kode, sent: p.sent }))}
          levelsOf={(k) =>
            k === meKode ? lv : (data.others.find((o) => o.kode === k)?.levels ?? {})
          }
          revealed={data.pair.every((p) => p.sent) || !tpl.hideLevels}
          nextName={nextTurnCand?.candidate?.nama ?? null}
          nextWhen={
            nextTurnCand
              ? `${hm(new Date(Date.parse(data.slot.startsAt) + nextTurnCand.index * turnMs).toISOString())} ${M.turnTo} ${hm(new Date(Date.parse(data.slot.startsAt) + nextTurnCand.index * turnMs + tpl.minutes * 60_000).toISOString())}`
              : null
          }
        />
      ) : (
        <>
          <section className="panel r4next r4vid">
            <span className="eyebrow">{L.vidEyebrow}</span>
            <b>{L.vidTitle}</b>
            <span className="hint">{L.vidBody}</span>
            <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span className="hint">{L.vidClass}</span>
              <div className="r4yn" role="radiogroup" aria-label={L.vidClass}>
                {(
                  [
                    ["tidak", L.no],
                    ["ya", L.yes],
                  ] as const
                ).map(([x, l]) => (
                  <button
                    key={x}
                    type="button"
                    role="radio"
                    className="r4yn__b"
                    aria-checked={vid.kelas === x}
                    onClick={() => setVid({ ...vid, kelas: x, ok: false })}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {vid.kelas && (
              <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <span className="hint">{L.vidDeadline}</span>
                {vid.kelas === "tidak" ? (
                  <>
                    <b className="num">{vid.at} WIB</b>
                    <span className="hint">{L.vidPlus}</span>
                  </>
                ) : (
                  <>
                    <input
                      className="field__input input r4vid__t"
                      type="time"
                      value={vid.at}
                      onChange={(e) => setVid({ ...vid, at: e.target.value, ok: false })}
                      aria-label={L.vidDeadline}
                    />
                    <span className="hint">{L.vidAdjust}</span>
                  </>
                )}
                <span className="grow" />
                <button
                  type="button"
                  className={`btn ${vid.ok ? "btn--ghost" : "btn--primary"}`}
                  disabled={vid.ok}
                  onClick={catatTenggat}
                >
                  {vid.ok ? (
                    <CheckIcon size={18} aria-hidden="true" />
                  ) : (
                    <PaperPlaneTiltIcon size={18} aria-hidden="true" />
                  )}
                  <span className="btn__label">{vid.ok ? L.vidDone : L.vidTell}</span>
                </button>
              </div>
            )}
          </section>
          {nextSlot && nextBooth && (
            <div className="panel r4next">
              <span className="eyebrow">{L.nextEyebrow}</span>
              <div className="row row--between" style={{ gap: 10, flexWrap: "wrap" }}>
                <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                  <b className="r4next__n">
                    {nextSlot.room}
                    {stage === "wawancara" ? ` · ${L.nextBooth} ${nextBooth.index + 1}` : ""}
                  </b>
                  <span className="hint num">
                    {L.sub(dayLong(nextSlot.startsAt), hm(nextSlot.startsAt), hm(nextSlot.endsAt))}
                    {nextBooth.pair.length ? ` · ${L.withLabel} ${nextBooth.pair.join(", ")}` : ""}
                  </span>
                </span>
              </div>
            </div>
          )}
        </>
      )}
      {!mg && (
        <div className="row r4sent__acts">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setView("sheet");
              setStep("putus");
            }}
          >
            {L.editSheet}
          </button>
          <button type="button" className="btn btn--primary" onClick={onClose}>
            {L.backSlots}
          </button>
        </div>
      )}
    </div>
  );
  const kasusInfo = data.shared?.case ?? null;
  const caseView = kasusInfo && (
    <div className="r4sent r4sent--case" data-rv>
      <span className="r4sent__ic r4sent__ic--w" aria-hidden="true">
        <WarningIcon size={32} />
      </span>
      <h2 className="h2">
        {kasusInfo.status === "gugur" ? L.caseGugur(first) : L.caseSusulan(first)}
      </h2>
      <p className="hint">
        {kasusText(
          w.kasus.out[kasusInfo.note as keyof typeof w.kasus.out] ?? "",
          stage,
          lang,
          data.makeup
            ? new Intl.DateTimeFormat(localeOf(lang), {
                timeZone: "Asia/Jakarta",
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              }).format(new Date(`${data.makeup}T12:00:00+07:00`))
            : null,
        )}
      </p>
      <p className="hint">{L.caseConfirm}</p>
      <div className="row r4sent__acts">
        <button type="button" className="btn btn--ghost" onClick={() => setView("sheet")}>
          {L.caseUndo}
        </button>
        <button type="button" className="btn btn--primary" onClick={onClose}>
          {L.backSlots}
        </button>
      </div>
    </div>
  );

  const left = missing.length;
  const nowSave = savedLabel
    ? savedLabel
    : mySent
      ? L.sentAt(hm(data.mine.sentAt ?? new Date(now).toISOString()))
      : Object.keys(ans).length || Object.keys(lv).length
        ? L.saved(hm(new Date(now).toISOString()))
        : L.empty;
  const goEdit = () => {
    setView("sheet");
    setStep("putus");
  };
  const foot =
    view === "sent" && mg ? (
      <>
        <button type="button" className="btn btn--ghost" onClick={goEdit}>
          {L.editSheet}
        </button>
        <span className="grow" />
        <button
          type="button"
          className={`btn ${nextTurnCand && onNext ? "btn--ghost" : "btn--primary"}`}
          onClick={onClose}
        >
          {L.backSlots}
        </button>
        {nextTurnCand && onNext && (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => nextTurnCand.candidate && onNext(nextTurnCand.candidate.id)}
          >
            <span className="btn__label">{M.nextBtn}</span>
            <ArrowRightIcon size={18} aria-hidden="true" />
          </button>
        )}
      </>
    ) : view !== "sheet" ? (
      <>
        <span className="grow" />
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          {L.close}
        </button>
      </>
    ) : (
      <>
        {mySent && !locked && (
          <button type="button" className="btn btn--ghost" onClick={() => void tarik()}>
            {L.withdraw}
          </button>
        )}
        <span className="r4save hint" role="status">
          {locked
            ? t.locked
            : partnerAt && save !== "saving" && save !== "fail"
              ? t.partner
              : nowSave}
        </span>
        <span className="grow" />
        {allLv && (
          <span className="r3score r4score">
            <span className="hint">{L.mySheet}</span>
            <b className="num">{sc}</b>
            <span className="hint">/100</span>
          </span>
        )}
        {step !== "tanya" && (mg || tb || tpl.questions.length > 0) && (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => geser(step === "putus" ? "simpul" : "tanya")}
          >
            <ArrowLeftIcon size={18} aria-hidden="true" />
            <span className="btn__label">{L.back}</span>
          </button>
        )}
        {step === "tanya" && (mg || tb) ? (
          <button type="button" className="btn btn--primary" onClick={() => geser("simpul")}>
            <span className="btn__label">{tb ? T.toScoring : L.toConcl}</span>
            <ArrowRightIcon size={18} aria-hidden="true" />
          </button>
        ) : step === "tanya" && tpl.questions.length ? (
          <>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={locked}
              onClick={() => q && toggleSkip(q.id)}
            >
              {q && skipped(q.id) ? L.unskip : L.skip}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={qi === 0}
              onClick={() => keQ(qi - 1)}
            >
              <ArrowLeftIcon size={18} aria-hidden="true" />
              <span className="btn__label">{L.prev}</span>
            </button>
            {qi < list.length - 1 ? (
              <button type="button" className="btn btn--primary" onClick={() => keQ(qi + 1)}>
                <span className="btn__label">{L.next}</span>
                <ArrowRightIcon size={18} aria-hidden="true" />
              </button>
            ) : (
              <button type="button" className="btn btn--primary" onClick={() => geser("simpul")}>
                <span className="btn__label">{L.toConcl}</span>
                <ArrowRightIcon size={18} aria-hidden="true" />
              </button>
            )}
          </>
        ) : step === "simpul" ? (
          <button
            type="button"
            className={`btn ${simpulLeft ? "btn--inverse" : "btn--primary"}`}
            onClick={() => geser("putus")}
          >
            <span className="btn__label">{L.toVerdict}</span>
            <ArrowRightIcon size={18} aria-hidden="true" />
          </button>
        ) : (
          !locked && (
            <button type="button" className="btn btn--primary" onClick={() => void kirim()}>
              {mySent ? L.saveChanges : left ? L.sendLeft(left) : L.send}
            </button>
          )
        )}
      </>
    );

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={tb ? T.sheet : mg ? M.title : L.title[stage]}
      description={subLine}
      lang={lang}
      size="xl"
      actions={foot}
    >
      <div className="r4sheet" ref={body}>
        {view === "sent" ? (
          sentView
        ) : view === "kasus" && caseView ? (
          caseView
        ) : (
          <>
            {head}
            {nav}
            {step === "tanya" && (mg || tb || tpl.questions.length)
              ? tb
                ? catatanStep
                : mg
                  ? amati
                  : tanya
              : step === "simpul"
                ? simpul
                : putus}
          </>
        )}
      </div>
      {kasus && (
        <Kasus
          lang={lang}
          stage={stage}
          data={data}
          onClose={() => setKasus(false)}
          onDone={() => {
            setKasus(false);
            void fetchIvSheet(stage, id).then((r) => {
              if (isFail(r)) return;
              setData(r);
              if (r.shared?.case?.status) setView("kasus");
              else toast(L.caseNoted);
            });
          }}
        />
      )}
    </Dialog>
  );
}
