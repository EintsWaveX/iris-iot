/**
 * One board's tab in the Live Coding editor (prompt 12, mockup r3-lc, EXAM-ENGINE
 * 9.3a, 9.4, 9.5): its code with autosave, the chip picker, Compile with the
 * queue and the log, Flash with its bar, and the serial monitor's button. Each
 * board has its own code, revision, job and monitor; the seat's two tabs never
 * share them.
 *
 * Code is saved 700 ms after the last key through `lc-code` with the board's
 * revision. If the server changed it meanwhile (a re-roll, a switch of
 * protocol) the server's copy wins and the page says so. Compile sends the
 * code with the revision the page knows; flash uses the image of the newest
 * good compile and refuses while the code differs from what was compiled.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import SegmentedControl from "../../ui/SegmentedControl";
import type { Lang } from "../../../lib/kelas";
import type { LiveCodeSelf, SelfBoard, SelfJob } from "../../../lib/recruitment/lc-api";
import type { Chip, QueueChip } from "../../../lib/recruitment/lc-types";
import {
  chipLabel,
  myPlace,
  otherChip,
  parseBuildLog,
  isProblemLine,
  type MotionTier,
} from "../../../lib/recruitment/lc-ui";
import { fetchImage, flashImage, pickPort, serialOk, type FlashStep } from "./flash";
import type { CodeEditorHandle } from "./CodeEditor";
import { LC } from "./lcStrings";
import type { LcApi } from "./useLc";
import type { useExamSerial } from "./useExamSerial";

const CodeEditor = lazy(() => import("./CodeEditor"));
const toast = (m: string, tone: "ok" | "warn" | "danger" = "ok") =>
  (window as unknown as { Toast?: { show: (m: string, t: string) => void } }).Toast?.show(m, tone);

export type SaveUi = "ok" | "ing" | "wait";

type FlashUi =
  | { k: "idle" }
  | { k: "working"; step: FlashStep | null; p: number }
  | { k: "done"; ms: number }
  | { k: "fail"; kode: string; found?: string };

interface Props {
  lang: Lang;
  tier: MotionTier;
  lc: LiveCodeSelf;
  board: SelfBoard;
  job: SelfJob | null;
  queue: QueueChip[];
  typicalMs: Record<Chip, number | null>;
  api: LcApi;
  serial: ReturnType<typeof useExamSerial>;
  onSave: (s: SaveUi) => void;
  /** The Master moved the board or the account changed: the last good compile is out of date */
  stale: boolean;
}

export default function BoardPane({
  lang,
  tier,
  lc,
  board,
  job,
  queue,
  typicalMs,
  api,
  serial,
  onSave,
  stale,
}: Props) {
  const L = LC[lang].work;
  const n = board.n;
  const editable = lc.editable;
  const [code, setCode] = useState(board.code);
  const known = useRef(board.rev); // the revision the server has for what we last saved or loaded
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef<Promise<unknown> | null>(null);
  const codeRef = useRef(board.code);
  const editor = useRef<CodeEditorHandle | null>(null);

  /* ----------------------------------------------------------------- code */
  // The server changed the board (re-roll, protocol, variant): its copy wins.
  useEffect(() => {
    if (board.rev === known.current) return;
    if (dirty.current && board.rev <= known.current) return;
    if (dirty.current) toast(L.reloaded, "warn");
    known.current = board.rev;
    dirty.current = false;
    codeRef.current = board.code;
    setCode(board.code);
    onSave("ok");
  }, [board.rev, board.code, L.reloaded, onSave]);

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (saving.current) await saving.current;
    if (!dirty.current) return true;
    const text = codeRef.current;
    onSave("ing");
    const p = api.saveCode(n, text, known.current);
    saving.current = p;
    const r = await p;
    saving.current = null;
    if (r.ok) {
      known.current = r.rev;
      if (codeRef.current === text) {
        dirty.current = false;
        onSave("ok");
      } else onSave("wait");
      return true;
    }
    if (r.kode === "versi_lama") {
      dirty.current = false;
      api.refresh();
    } else onSave("wait");
    return false;
  }, [api, n, onSave]);

  const onChange = useCallback(
    (text: string) => {
      if (!editable) return;
      codeRef.current = text;
      setCode(text);
      dirty.current = true;
      onSave("wait");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 700);
    },
    [editable, flush, onSave],
  );
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /* -------------------------------------------------------------- compile */
  const sentCode = useRef(new Map<number, string>()); // job id -> the code compiled
  const [busy, setBusy] = useState(false);
  const place = myPlace(queue, n);
  const status = job?.status ?? null;
  const waiting = status === "antre";
  const running = status === "diambil";
  const okJob = job && job.ok && status === "selesai" ? job : null;
  const typical = typicalMs[board.chip];

  async function compile() {
    if (busy || running) return;
    setBusy(true);
    if (timer.current) clearTimeout(timer.current);
    if (saving.current) await saving.current;
    const text = codeRef.current;
    const r = await api.compile(n, text, known.current);
    setBusy(false);
    if (!r.ok) {
      if (r.kode === "versi_lama") toast(L.reloaded, "warn");
      else
        toast(
          r.kode === "berbahaya"
            ? L.unsafe
            : r.kode === "sedang_jalan"
              ? L.running
              : r.kode === "gateway_belum_diatur"
                ? L.noGateway
                : L.compileFail,
          "danger",
        );
      return;
    }
    known.current = r.rev;
    dirty.current = false;
    onSave("ok");
    sentCode.current.set(r.job, text);
  }

  // The elapsed time of a running compile, from when this page saw it start
  const [since, setSince] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (running) setSince((s) => s ?? Date.now());
    else setSince(null);
  }, [running, job?.id]);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  const elapsed = since ? Math.max(0, Math.round((Date.now() - since) / 1000)) : 0;
  void tick;

  const problems = useMemo(
    () => (job?.log && status === "gagal" ? parseBuildLog(job.log) : []),
    [job?.log, status],
  );
  const errorLines = useMemo(
    () => problems.filter((p) => p.level === "error").map((p) => p.line),
    [problems],
  );

  /* ---------------------------------------------------------------- flash */
  const [fl, setFl] = useState<FlashUi>({ k: "idle" });
  const image = useRef<{ job: number; bytes: Uint8Array } | null>(null);
  const [imageFor, setImageFor] = useState<number | null>(null);
  const compiledOk = okJob ? sentCode.current.get(okJob.id) : undefined;
  const codeMatches = compiledOk === undefined || compiledOk === code;

  // The image of the newest good compile is fetched once, so Flash is instant and still inside the click.
  useEffect(() => {
    if (!okJob || image.current?.job === okJob.id) return;
    let live = true;
    void fetchImage(okJob.id).then((bytes) => {
      if (!live || !bytes) return;
      image.current = { job: okJob.id, bytes };
      setImageFor(okJob.id);
    });
    return () => {
      live = false;
    };
  }, [okJob]);

  async function flash() {
    if (!okJob || fl.k === "working") return;
    const port = await pickPort();
    if (!port) return;
    let img = image.current?.job === okJob.id ? image.current.bytes : null;
    if (!img) {
      img = await fetchImage(okJob.id);
      if (!img) return toast(L.flash.imageFail, "danger");
    }
    await serial.close();
    setFl({ k: "working", step: null, p: 0 });
    const r = await flashImage({
      port,
      image: img,
      target: board.chip,
      onStep: (step) => setFl((s) => (s.k === "working" ? { ...s, step } : s)),
      onProgress: (p) => setFl((s) => (s.k === "working" ? { ...s, p } : s)),
    });
    if (r.ok) {
      setFl({ k: "done", ms: r.ms });
      void api.flashed({ job: okJob.id, ok: true, ms: r.ms, chip: r.found });
      if (r.port) void serial.attach(r.port);
    } else {
      setFl({ k: "fail", kode: r.kode ?? "gagal_tulis", found: r.found });
      void api.flashed({
        job: okJob.id,
        ok: false,
        ms: r.ms,
        chip: r.found?.slice(0, 20),
        kode: r.kode,
      });
    }
  }

  async function swapChip() {
    const to = otherChip(board.chip);
    const r = await api.setChip(n, to);
    if (!r.ok) return toast(L.compileFail, "danger");
    setFl({ k: "idle" });
    await compile();
  }

  /* --------------------------------------------------------------- render */
  const queueNode = (
    <ol className="lcq" aria-label={L.queue}>
      {queue.map((c, i) => (
        <li key={i} data-mine={c.mine ? "yes" : "no"} data-st={c.state}>
          {c.mine ? L.you : c.seat}
          {c.board === 2 ? <sub>2</sub> : null}
        </li>
      ))}
    </ol>
  );

  const stateLine = busy
    ? L.sending
    : waiting
      ? L.waiting(place ?? 1)
      : running
        ? L.compiling(elapsed, typical ? Math.round(typical / 1000) : null)
        : status === "selesai"
          ? L.compiled(
              job?.ms ? Math.round(job.ms / 1000) : 0,
              job?.size ? Math.round(job.size / 1024) : 0,
            )
          : status === "gagal"
            ? job?.kode === "agen_diam"
              ? L.agentSilent
              : job?.kode === "waktu_habis"
                ? L.timeout
                : job?.kode === "berbahaya"
                  ? L.unsafe
                  : L.failed(problems.filter((p) => p.level === "error").length)
            : lc.agent
              ? L.ready
              : L.noAgent;

  return (
    <div className="r3board" data-board={n}>
      <div className="r3board__bar">
        <SegmentedControl
          value={board.chip}
          onValueChange={(v) => {
            if (v && v !== board.chip) void api.setChip(n, v as Chip);
          }}
          options={[
            { value: "esp32", label: chipLabel("esp32") },
            { value: "esp32s3", label: chipLabel("esp32s3") },
          ]}
          aria-label={L.chip}
        />
        {stale && <span className="pill pill--warn">{L.staleShort}</span>}
      </div>

      <div className="r3board__ed" data-edit={editable ? "yes" : "no"}>
        <Suspense fallback={<div className="skeleton" style={{ height: 320 }} />}>
          <CodeEditor
            ref={editor}
            value={code}
            onChange={onChange}
            readOnly={!editable}
            errorLines={errorLines}
            ariaLabel={L.editorLabel(n)}
            still={tier === "reduce"}
          />
        </Suspense>
      </div>

      {stale && (
        <div className="r3banner" data-tone="warn" role="status">
          <span>{L.stale}</span>
          <button
            type="button"
            className="btn btn--inverse"
            disabled={busy || running || !editable}
            onClick={() => void compile()}
          >
            {L.recompile}
          </button>
        </div>
      )}

      <div className="r3build" data-st={status ?? "none"}>
        <div className="r3build__row">
          <button
            type="button"
            className="btn btn--primary"
            disabled={!editable || busy || running || (!lc.gateway && lc.protocol !== "ble")}
            onClick={() => void compile()}
          >
            {waiting ? L.update : L.compile}
          </button>
          <span className="r3build__state" role="status" aria-live="polite">
            {stateLine}
          </span>
          {(waiting || running) && queue.length > 0 && queueNode}
        </div>
        {(waiting || running) && (
          <div className="r3bar" data-k={running ? "run" : "wait"} data-m={tier} aria-hidden="true">
            <i />
          </div>
        )}
        {status === "selesai" && (
          <div className="r3bar" data-k="ok" aria-hidden="true">
            <i />
          </div>
        )}
        {status === "gagal" && job?.log && (
          <div className="r3log" data-m={tier}>
            {problems.length > 0 && (
              <ul className="r3log__links">
                {problems.slice(0, 8).map((p, i) => (
                  <li key={i} data-level={p.level}>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => editor.current?.jumpTo(p.line)}
                    >
                      {L.line(p.line)}
                    </button>
                    <span>{p.text}</span>
                  </li>
                ))}
              </ul>
            )}
            <pre className="r3log__pre" tabIndex={0}>
              {job.log.split("\n").map((l, i) => (
                <span key={i} data-problem={isProblemLine(l) ? "yes" : "no"}>
                  {l}
                  {"\n"}
                </span>
              ))}
            </pre>
          </div>
        )}
      </div>

      <div className="r3flash" data-st={fl.k}>
        <div className="r3build__row">
          <button
            type="button"
            className="btn btn--inverse"
            disabled={!okJob || !codeMatches || fl.k === "working" || !serialOk() || !editable}
            title={
              !serialOk() ? L.flash.needChrome : !codeMatches ? L.flash.codeChanged : undefined
            }
            onClick={() => void flash()}
          >
            {L.flash.button}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!serialOk() || serial.status === "open" || fl.k === "working"}
            onClick={() => void serial.connect()}
          >
            {serial.status === "open" ? L.flash.monitorOn : L.flash.monitor}
          </button>
          <span className="r3build__state" role="status" aria-live="polite">
            {fl.k === "working"
              ? flashStep(L.flash, fl.step)
              : fl.k === "done"
                ? L.flash.done(Math.round(fl.ms / 1000))
                : fl.k === "fail"
                  ? (L.flash.fail[fl.kode as keyof typeof L.flash.fail] ?? L.flash.fail.gagal_tulis)
                  : !serialOk()
                    ? L.flash.needChrome
                    : okJob
                      ? imageFor === okJob.id
                        ? L.flash.ready
                        : L.flash.loading
                      : L.flash.first}
          </span>
        </div>
        {fl.k === "working" && (
          <div
            className="r3bar"
            data-k={fl.step?.k === "retry" ? "retry" : "flash"}
            aria-hidden="true"
          >
            <i style={{ transform: `scaleX(${Math.max(0.02, fl.p)})` }} />
          </div>
        )}
        {fl.k === "fail" && fl.kode === "chip_beda" && (
          <div className="r3banner" data-tone="warn" role="alert">
            <span>{L.flash.mismatch(fl.found ?? "?", chipLabel(board.chip))}</span>
            <button type="button" className="btn btn--inverse" onClick={() => void swapChip()}>
              {L.flash.swap(chipLabel(otherChip(board.chip)))}
            </button>
          </div>
        )}
        {fl.k === "fail" && fl.kode === "tidak_menjawab" && (
          <p className="hint">{L.flash.bootHint}</p>
        )}
      </div>
    </div>
  );
}

function flashStep(f: (typeof LC)["id"]["work"]["flash"], s: FlashStep | null): string {
  if (!s) return f.picking;
  if (s.k === "connect") return f.connecting(s.baud);
  if (s.k === "found") return f.found(s.chip);
  if (s.k === "write") return f.writing(s.baud);
  return f.retry(s.baud, s.boot);
}
