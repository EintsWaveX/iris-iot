/**
 * The Master console (prompt 11, mockup r3-konsol, EXAM-ENGINE 5 and 6): who
 * is Master and the handover, the video-style controls with the guard of every
 * disabled one in words (the same act() the API runs, so the two never
 * disagree), the budget bar, the seat grid with its filters and drawer, the
 * activity feed from 1280 px and the boards by hotspot.
 *
 * Time is the server's: jamServer() and nothing on the laptop. The page
 * redraws once a second for the clocks and asks the API again when the relay
 * says something changed; only while the socket is down does it ask on a
 * timer, every 15 s.
 */
import { useEffect, useMemo, useState } from "react";
import { NotePencilIcon } from "@phosphor-icons/react";
import Dialog from "../../../../ui/Dialog";
import Drawer from "../../../../ui/Drawer";
import Dropdown from "../../../../ui/Dropdown";
import HoldButton from "../../../../ui/HoldButton";
import Pill from "../../../../ui/Pill";
import type { Lang } from "../../../../../lib/kelas";
import { isFail, recPost } from "../../../../../lib/recruitment/client";
import type { PartKey, PartRun } from "../../../../../lib/recruitment/exam-types";
import { PART_KEYS } from "../../../../../lib/recruitment/exam-types";
import { tanggalWib } from "../../../../../lib/recruitment/gates";
import {
  FILTERS,
  countFilters,
  matchFilter,
  type Filter,
  type Tile,
} from "../../../../../lib/recruitment/kejadian";
import {
  REROLL_REASONS,
  type ConsoleSeat,
  type ConsoleView,
  type RerollReason,
  type RoomLogLine,
} from "../../../../../lib/recruitment/room-api";
import type { Hadir, Kemajuan, StatusLangsung } from "../../../../../lib/recruitment/room-client";
import {
  act,
  budget,
  clock,
  roomLeft,
  roomView,
  seatLeft,
  type Action,
  type ActCtx,
} from "../../../../../lib/recruitment/room";
import { tgl } from "../../../shared";
import { RG } from "./ruangStrings";

const MIN = 60_000;

const hm = (ms: number) => tanggalWib(new Date(ms)).jam;
const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const hms = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const j = Math.floor(s / 3600);
  return `${String(j).padStart(2, "0")}:${mmss((s % 3600) * 1000)}`;
};
const depan = (n: string) => n.split(" ")[0] ?? n;
const inisial = (kode: string, nama: string) =>
  (
    kode ||
    nama
      .split(" ")
      .map((x) => x[0])
      .join("")
  )
    .slice(0, 3)
    .toUpperCase();

const toast = (m: string, tone: "ok" | "warn" | "danger" = "ok") => window.Toast?.show(m, tone);

/* ------------------------------------------------------------ the guards */

interface Kontrol {
  can: (
    a: Omit<Action, "seq"> & Record<string, unknown>,
  ) => { ok: true } | { ok: false; kode: string };
  next: PartKey | null;
  isLast: boolean;
}

/** The client's copy of the API's context, so a disabled control can say why. */
function useKontrol(v: ConsoleView, now: number): Kontrol {
  return useMemo(() => {
    const ctx: ActCtx = {
      now,
      nim: v.me.nim,
      canBeMaster: () => v.me.canBeMaster,
      masterStale: v.master?.stale ?? false,
      isToday: v.room.isToday,
      rehearsal: v.room.rehearsal,
      seatsIn: v.seats.filter((s) => s.checkedIn && s.seatId !== null).map((s) => s.seatId!),
      poolOk: (p) => (p === "livecode" ? true : (v.pool[p]?.ok ?? false)),
      config: v.config,
    };
    const order = v.config.order;
    const cur = v.state.cur;
    const rv = roomView(v.state, now).view;
    // The part Start would begin; while one runs it is the one after it (Start waits).
    const next: PartKey | null =
      rv === "persiapan" || rv === "setup"
        ? order[0]
        : rv === "livecode-spin"
          ? "livecode"
          : cur
            ? (order[order.indexOf(cur) + 1] ?? null)
            : null;
    return {
      can: (a) => {
        const r = act(v.state, { ...a, seq: v.state.seq } as Action, ctx);
        return r.ok ? { ok: true } : { ok: false, kode: r.kode };
      },
      next,
      isLast: cur === order[order.length - 1],
    };
  }, [v, now]);
}

/* ----------------------------------------------------------------- Timer */

function Timer({
  ms,
  frozen,
  label,
  big,
}: {
  ms: number;
  frozen?: boolean;
  label: string;
  big?: boolean;
}) {
  const tone = frozen ? undefined : ms < 30_000 ? "danger" : ms < 120_000 ? "warn" : undefined;
  return (
    <span
      className={`r3timer${big ? " r3timer--big" : ""}`}
      data-tone={tone}
      data-frozen={frozen ? "yes" : undefined}
    >
      <small>{label}</small>
      <b>{hms(ms)}</b>
    </span>
  );
}

/* ---------------------------------------------------------- master & hand */

function MasterBar({
  lang,
  v,
  jalan,
}: {
  lang: Lang;
  v: ConsoleView;
  jalan: (aksi: string, body: Record<string, unknown>) => Promise<unknown>;
}) {
  const t = RG[lang].con;
  const m = v.master;
  const [ambil, setAmbil] = useState(false);
  const aku = v.me.isMaster;
  const tanya = v.ask?.nim === v.me.nim;

  // The Master's console says it is alive every 20 s; 60 s without one makes it stale.
  useEffect(() => {
    if (!aku) return;
    const kirim = () => void recPost("room-master", { id: v.room.id, act: "ping" });
    kirim();
    const i = setInterval(kirim, 20_000);
    return () => clearInterval(i);
  }, [aku, v.room.id]);

  async function master(a: string, ok: string, to?: string) {
    const r = await recPost<{ ok: true }>("room-master", {
      id: v.room.id,
      act: a,
      ...(to ? { to } : {}),
    });
    if (isFail(r)) toast(t.guard[r.kode] ?? t.fail, "danger");
    else toast(ok);
    await jalan("room", {});
  }

  return (
    <>
      <div className="r3con__bar">
        <span className="r3mchip" data-stale={m?.stale ? "yes" : "no"}>
          <span className="r3mchip__k">{m ? inisial(m.kode, m.nama) : "?"}</span>
          <span className="stack" style={{ gap: 0, minWidth: 0 }}>
            <span className="hint">{t.masterK}</span>
            <b>
              {aku ? t.you : m ? m.nama : t.none}
              {m?.stale ? ` (${t.stale})` : ""}
            </b>
          </span>
        </span>
        <div className="r3con__role">
          {!aku && m && !m.stale && v.me.canBeMaster && (
            <>
              <span className="hint">{t.roleLine}</span>
              <button
                type="button"
                className="btn btn--inverse"
                disabled={tanya}
                onClick={() => void master("ask", t.asked)}
              >
                {tanya ? t.asked : t.askBtn}
              </button>
            </>
          )}
          {!aku && !v.me.canBeMaster && (
            <span className="hint">{v.me.isPengawas ? t.roleLine : t.noRole}</span>
          )}
          {aku && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => void master("release", t.released)}
            >
              {t.release}
            </button>
          )}
        </div>
      </div>

      {aku && v.ask && (
        <div className="handover r3hand">
          <div className="stack" style={{ gap: 2, minWidth: 0 }}>
            <b>{t.hand.askTitle(v.ask.nama)}</b>
            <span className="hint">{t.hand.askBody}</span>
          </div>
          <div className="row r3hand__acts">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => void master("decline", t.hand.declined)}
            >
              {t.hand.decline}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void master("give", t.hand.given, v.ask!.nim)}
            >
              {t.hand.give}
            </button>
          </div>
        </div>
      )}
      {!aku && m?.stale && v.me.canBeMaster && (
        <div className="handover r3hand">
          <div className="stack" style={{ gap: 2, minWidth: 0 }}>
            <b>{t.hand.staleTitle}</b>
            <span className="hint">{t.hand.staleBody(m.nama)}</span>
          </div>
          <div className="row r3hand__acts">
            <button type="button" className="btn btn--primary" onClick={() => setAmbil(true)}>
              {t.hand.takeOver}
            </button>
          </div>
          <Dialog
            open={ambil}
            onOpenChange={setAmbil}
            size="sm"
            lang={lang}
            title={t.hand.takeTitle}
            description={t.hand.takeBody(m.nama)}
            actions={
              <>
                <button type="button" className="btn btn--ghost" onClick={() => setAmbil(false)}>
                  {t.cancel}
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => {
                    setAmbil(false);
                    void master("claim", t.hand.now);
                  }}
                >
                  {t.hand.takeYes}
                </button>
              </>
            }
          />
        </div>
      )}
      {!m && v.me.canBeMaster && v.view !== "finished" && (
        <div className="handover r3hand">
          <div className="stack" style={{ gap: 2, minWidth: 0 }}>
            <b>{t.hand.noneTitle}</b>
            <span className="hint">{t.hand.noneBody}</span>
          </div>
          <div className="row r3hand__acts">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void master("claim", t.hand.now)}
            >
              {t.hand.claim}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------- Transport */

function Transport({
  lang,
  v,
  now,
  jalan,
}: {
  lang: Lang;
  v: ConsoleView;
  now: number;
  jalan: (aksi: string, body: Record<string, unknown>) => Promise<unknown>;
}) {
  const t = RG[lang];
  const c = t.con.ctl;
  const k = useKontrol(v, now);
  const rv = roomView(v.state, now);
  const cur = v.state.cur;
  const run: PartRun | undefined = cur ? v.state.runs[cur] : undefined;
  const [reopen, setReopen] = useState(false);
  const [tambah, setTambah] = useState(2);
  const [awal, setAwal] = useState(false);
  const [alasan, setAlasan] = useState("");

  const kirim = async (body: Record<string, unknown>, ok?: string) => {
    const r = await recPost<{ ok: true }>("room-act", { id: v.room.id, seq: v.state.seq, ...body });
    if (isFail(r)) toast(t.con.guard[r.kode] ?? t.con.fail, "danger");
    else if (ok) toast(ok);
    await jalan("room", {});
    return !isFail(r);
  };
  const guard = (a: Record<string, unknown>) => {
    const r = k.can(a as never);
    return r.ok ? undefined : (t.con.guard[r.kode] ?? t.con.fail);
  };
  const Ctl = ({
    a,
    label,
    kind = "inverse",
    onClick,
  }: {
    a: Record<string, unknown>;
    label: string;
    kind?: string;
    onClick: () => void;
  }) => {
    const why = guard(a);
    return (
      <button
        type="button"
        className={`btn btn--${kind}`}
        disabled={!!why}
        title={why}
        aria-label={why ? `${label}. ${why}` : undefined}
        onClick={onClick}
      >
        {label}
      </button>
    );
  };

  const nextL = k.next ? t.part[k.next].l : "";
  const left = run && rv.view !== "lobby" ? roomLeft(run, now) : 0;
  const showClock =
    rv.view === "part-running" ||
    rv.view === "livecode-running" ||
    rv.view === "part-paused" ||
    rv.view === "part-ended";
  const label =
    rv.view === "setup"
      ? c.notStarted
      : rv.view === "persiapan"
        ? c.notStarted
        : rv.view === "livecode-spin"
          ? c.spin
          : rv.view === "part-paused" && cur
            ? c.pausedLabel(t.part[cur].l)
            : rv.view === "lobby" && cur
              ? c.endedAt(t.part[cur].l)
              : rv.view === "finished"
                ? t.view.finished
                : cur
                  ? c.runningLabel(t.part[cur].l)
                  : c.notStarted;
  const seatsExtra = v.seats.filter((s) => s.extraMs > 0).length;
  const nowLine =
    rv.view === "setup"
      ? t.con.now.setup
      : rv.view === "persiapan"
        ? t.con.now.persiapan
        : rv.view === "part-paused"
          ? t.con.now.paused
          : rv.view === "part-ended"
            ? t.con.now.ended
            : rv.view === "lobby"
              ? t.con.now.lobby
              : rv.view === "livecode-spin"
                ? t.con.now.spin
                : rv.view === "finished"
                  ? t.con.now.finished
                  : t.con.now.running + (seatsExtra ? ` ${t.con.now.extra(seatsExtra)}` : "");

  const closed = rv.view === "finished";
  const finishHold = rv.view === "lobby" && k.isLast;
  const needReason = rv.view === "lobby" || rv.view === "livecode-spin" || rv.view === "persiapan";
  const reopenPart = cur ? t.part[cur].l : "";
  const sisa = run ? Math.round(run.leftAtSkip / MIN) : 0;

  return (
    <section className="panel r3tp" aria-label={c.aria}>
      <div className="r3tp__clock">
        <span className="eyebrow">{label}</span>
        {showClock && run ? (
          <Timer ms={left} frozen={rv.view === "part-paused"} big label={c.left} />
        ) : k.next ? (
          <b className="r3tp__next">
            {c.next}: {nextL}
          </b>
        ) : null}
      </div>
      <div className="r3tp__ctl">
        <div className="r3tp__grp">
          {rv.view === "setup" ? (
            <Ctl
              a={{ act: "open" }}
              kind="primary"
              label={c.open}
              onClick={() => void kirim({ act: "open" })}
            />
          ) : k.next ? (
            <Ctl
              a={{ act: "start" }}
              kind="primary"
              label={k.next === "livecode" ? c.startLc : c.start(nextL)}
              onClick={() => void kirim({ act: "start" })}
            />
          ) : null}
          {rv.view === "part-paused" ? (
            <Ctl
              a={{ act: "resume" }}
              kind="primary"
              label={c.resume}
              onClick={() => void kirim({ act: "resume" })}
            />
          ) : (
            <Ctl
              a={{ act: "pause" }}
              label={c.pause}
              onClick={() => void kirim({ act: "pause" })}
            />
          )}
          <Ctl
            a={{ act: "skip" }}
            label={c.skip}
            onClick={() => void kirim({ act: "skip" }, t.con.skipDone)}
          />
          <Ctl a={{ act: "reopen", addMs: MIN }} label={c.reopen} onClick={() => setReopen(true)} />
        </div>
        <div className="r3tp__grp r3tp__time" role="group" aria-label={c.timeAria}>
          {[-1, 1, 5].map((d) => (
            <Ctl
              key={d}
              a={{ act: "time", deltaMs: d * MIN }}
              label={`${d > 0 ? "+" : "−"}${Math.abs(d)} ${c.min}`}
              onClick={() => void kirim({ act: "time", deltaMs: d * MIN })}
            />
          ))}
        </div>
        <div className="r3tp__grp r3tp__end">
          {closed ? null : finishHold ? (
            <HoldButton
              label={c.hold}
              ms={1600}
              onDone={() => void kirim({ act: "finish" }, t.con.finishDone)}
            />
          ) : needReason ? (
            <button type="button" className="btn btn--danger-soft" onClick={() => setAwal(true)}>
              {c.finishEarly}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--danger-soft"
              disabled
              title={t.con.guard.tahap_salah}
            >
              {c.finishEarly}
            </button>
          )}
        </div>
      </div>
      <p className="hint r3tp__now">{nowLine}</p>

      <Dialog
        open={reopen}
        onOpenChange={setReopen}
        size="sm"
        lang={lang}
        title={t.con.reopen.title(reopenPart)}
        description={t.con.reopen.body}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setReopen(false)}>
              {t.con.cancel}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={sisa <= 0 && tambah <= 0}
              onClick={async () => {
                setReopen(false);
                if (await kirim({ act: "reopen", addMs: tambah * MIN }, t.con.reopen.done))
                  setTambah(2);
              }}
            >
              {t.con.reopen.yes}
            </button>
          </>
        }
      >
        <div className="stack">
          <div className="rec-sum">
            <span className="hint">{t.con.reopen.left}</span>
            <b>{t.con.reopen.leftVal(sisa)}</b>
          </div>
          <span className="label-caps">{t.con.reopen.add}</span>
          <div className="rec-chips">
            {[1, 2, 5].map((m) => (
              <button
                key={m}
                type="button"
                className="r3chip"
                aria-pressed={tambah === m}
                onClick={() => setTambah(m)}
              >
                +{m} {c.min}
              </button>
            ))}
          </div>
          <span className="hint">{t.con.reopen.need}</span>
        </div>
      </Dialog>

      <Dialog
        open={awal}
        onOpenChange={setAwal}
        size="sm"
        lang={lang}
        title={t.con.early.title}
        description={t.con.early.body}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setAwal(false)}>
              {t.con.cancel}
            </button>
            <HoldButton
              label={t.con.early.hold}
              ms={1600}
              disabled={!alasan.trim()}
              onDone={async () => {
                setAwal(false);
                if (
                  await kirim(
                    { act: "finish", early: true, reason: alasan.trim() },
                    t.con.finishDone,
                  )
                )
                  setAlasan("");
              }}
            />
          </>
        }
      >
        <div className="stack stack--sm">
          <label className="r3lbl">
            <span className="label-caps">{t.con.early.reason}</span>
            <textarea
              className="field__input"
              rows={3}
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
            />
          </label>
        </div>
      </Dialog>
    </section>
  );
}

/* ----------------------------------------------------------------- Budget */

function Budget({ lang, v, now }: { lang: Lang; v: ConsoleView; now: number }) {
  const t = RG[lang];
  const b = useMemo(() => budget(v.state, v.config, now), [v.state, v.config, now]);
  const st = v.state;
  const start = st.startedAt;
  if (start === null) {
    return (
      <section className="panel r3bud" aria-label={t.con.bud.aria}>
        <div className="panel__head">
          <h2 className="panel__title">{t.con.bud.title(v.config.budgetMin)}</h2>
        </div>
        <p className="hint">{t.con.bud.sumPre}</p>
      </section>
    );
  }
  const span = Math.max(b.budgetMs, b.projectedMs) + 5 * MIN;
  const x = (at: number) => `${(100 * (at - start)) / span}%`;
  const w = (d: number) => `${(100 * d) / span}%`;
  // The plan: what the running part has left, then the parts not started, one after another.
  const plan: { part: PartKey; at: number; d: number }[] = [];
  let at = now;
  for (const part of v.config.order) {
    const r = st.runs[part];
    const d = r
      ? r.state === "ended"
        ? 0
        : roomLeft(r, now)
      : (part === "livecode" ? v.config.livecode.minutes : v.config.parts[part].minutes) * MIN;
    if (d > 0 && st.stage !== "finished") {
      plan.push({ part, at, d });
      at += d;
    }
  }
  const ticks: number[] = [];
  for (let m = 0; m * MIN <= span; m += 15) ticks.push(m);
  const over = Math.round(b.overMs / MIN);
  const budgetLine = start + b.budgetMs;
  return (
    <section className="panel r3bud" aria-label={t.con.bud.aria}>
      <div className="panel__head">
        <h2 className="panel__title">{t.con.bud.title(v.config.budgetMin)}</h2>
        <Pill tone={over > 0 ? "warn" : "ok"}>
          {over > 0 ? t.con.bud.over(over) : t.con.bud.within}
        </Pill>
      </div>
      <div className="r3bud__track">
        {b.segments.map((s) => (
          <span
            key={s.part}
            className="r3bud__seg"
            data-p={s.part}
            title={t.part[s.part].l}
            style={{ left: x(s.start), width: w((s.end ?? now) - s.start) }}
          >
            <b>{t.part[s.part].s}</b>
          </span>
        ))}
        {plan.map((p, i) => (
          <span
            key={p.part}
            className="r3bud__seg r3bud__seg--plan"
            data-p={p.part}
            title={t.con.bud.plan(t.part[p.part].l)}
            style={{ left: x(p.at), width: w(p.d) }}
          >
            {i > 0 && <b>{t.part[p.part].s}</b>}
          </span>
        ))}
        <i
          className="r3bud__line"
          style={{ left: x(budgetLine) }}
          title={t.con.bud.line(hm(budgetLine))}
        />
        {over > 0 && (
          <i className="r3bud__over" style={{ left: x(budgetLine), width: w(b.overMs) }} />
        )}
        <i className="r3bud__now" style={{ left: x(now) }}>
          <b>{hm(now)}</b>
        </i>
      </div>
      <div className="r3bud__ticks" aria-hidden="true">
        {ticks.map((m) => (
          <span key={m} style={{ left: `${(100 * m * MIN) / span}%` }}>
            {hm(start + m * MIN)}
          </span>
        ))}
      </div>
      <p className="hint">
        {t.con.bud.sum(
          hm(start),
          Math.round(b.elapsedMs / MIN),
          Math.round(b.plannedLeftMs / MIN),
          hm(start + b.projectedMs),
        )}
      </p>
    </section>
  );
}

/* ----------------------------------------------------------------- Seats */

function Jauh({ since, now }: { since: number; now: number }) {
  return <span className="num">{mmss(now - since)}</span>;
}

function SeatTile({
  lang,
  s,
  v,
  now,
  online,
  kemajuan,
  onOpen,
}: {
  lang: Lang;
  s: ConsoleSeat;
  v: ConsoleView;
  now: number;
  online: boolean | null;
  kemajuan?: Kemajuan[number];
  onOpen: () => void;
}) {
  const t = RG[lang].con.grid;
  const cur = v.state.cur;
  const handed = cur ? s.done[cur] !== undefined : false;
  const prep = v.view === "persiapan" || v.view === "setup";
  const st = !s.checkedIn
    ? "absent"
    : s.outSince !== null
      ? "away"
      : online === false
        ? "off"
        : handed
          ? "done"
          : "on";
  // The relay's last word moves the bar between two reads, only for the part running now.
  const baru =
    kemajuan && kemajuan.part === cur && kemajuan.answered > s.answered ? kemajuan : null;
  const jawab = baru ? baru.answered : s.answered;
  const jumlah = baru ? baru.total : s.total;
  const pct = jumlah ? Math.round((100 * jawab) / jumlah) : 0;
  const langs = RG[lang].con;
  const steps = [!!s.checkin.fullscreen, !!s.checkin.connection, !!s.checkin.name];
  return (
    <button
      type="button"
      className="r3tile"
      data-st={st}
      onClick={onOpen}
      aria-label={`${s.nama}, ${t.seat(s.no)}`}
    >
      <span className="r3tile__top">
        <span className="r3tile__no num">{String(s.no).padStart(2, "0")}</span>
        <b className="r3tile__n">{s.nama}</b>
      </span>
      {!s.checkedIn && !s.checkin.fullscreen ? (
        <span className="r3tile__absent">{t.notIn}</span>
      ) : prep || !cur ? (
        <span className="r3tile__ck">
          {steps.map((on, i) => (
            <i key={i} data-on={on ? "yes" : "no"} title={t.steps[i]} />
          ))}
        </span>
      ) : (
        <span className="r3tile__prog">
          <span className="r3pbar">
            <i style={{ transform: `scaleX(${handed ? 1 : pct / 100})` }} />
          </span>
          <span className="num hint">{handed ? t.handed : `${jawab}/${jumlah}`}</span>
        </span>
      )}
      <span className="r3tile__foot">
        {s.checkedIn && (
          <span
            className="r3dot"
            data-on={online === false ? "no" : online ? "yes" : undefined}
            title={online === false ? t.offline : online ? t.online : undefined}
          />
        )}
        {s.outSince !== null ? (
          <span className="r3tile__away">
            {t.away} <Jauh since={s.outSince} now={now} />
          </span>
        ) : s.count ? (
          <span className="r3tile__strike">
            {t.events(s.count)} · {mmss(s.awayMs)}
          </span>
        ) : (
          <span />
        )}
        {s.extraMs > 0 && (
          <span className="r3tile__extra">
            +{Math.round(s.extraMs / MIN)} {langs.ctl.min}
          </span>
        )}
        {v.notes.some((n) => n.candidateId === s.candidateId) && (
          <span className="r3tile__note" title={t.noteMark}>
            <NotePencilIcon size={16} aria-hidden="true" />
          </span>
        )}
      </span>
    </button>
  );
}

function SeatDrawer({
  lang,
  s,
  v,
  now,
  online,
  jalan,
  onClose,
}: {
  lang: Lang;
  s: ConsoleSeat;
  v: ConsoleView;
  now: number;
  online: boolean | null;
  jalan: (aksi: string, body: Record<string, unknown>) => Promise<unknown>;
  onClose: () => void;
}) {
  const t = RG[lang].con;
  const d = t.drawer;
  const k = useKontrol(v, now);
  const cur = v.state.cur;
  const run = cur ? v.state.runs[cur] : undefined;
  const sisa = run && s.seatId !== null ? seatLeft(run, s.seatId, now) : null;
  const mine = v.notes.find((n) => n.candidateId === s.candidateId && n.mine);
  const [catatan, setCatatan] = useState(mine?.text ?? "");
  const [alasan, setAlasan] = useState<RerollReason>("kit_rusak");
  const lain = v.notes.filter((n) => n.candidateId === s.candidateId && !n.mine);
  const rv = roomView(v.state, now).view;
  const bisaWaktu =
    v.me.isMaster && s.seatId !== null && rv !== "setup" && rv !== "persiapan" && rv !== "finished";
  const bisaUndi =
    v.me.isMaster && s.seatId !== null && (rv === "livecode-spin" || rv === "livecode-running");

  async function waktu(m: number) {
    if (s.seatId === null) return;
    const r = await recPost<{ ok: true }>("room-act", {
      id: v.room.id,
      seq: v.state.seq,
      act: "seat-time",
      seatId: s.seatId,
      deltaMs: m * MIN,
    });
    if (isFail(r)) toast(t.guard[r.kode] ?? t.fail, "danger");
    else toast(d.gave(depan(s.nama), m));
    await jalan("room", {});
  }
  async function undi(what: "topic" | "protocol") {
    if (s.seatId === null) return;
    const r = await recPost<{ ok: true }>("room-act", {
      id: v.room.id,
      seq: v.state.seq,
      act: "reroll",
      seatId: s.seatId,
      what,
      reason: alasan,
    });
    if (isFail(r)) toast(t.guard[r.kode] ?? t.fail, "danger");
    else toast(d.redrawDone);
    await jalan("room", {});
  }
  async function simpan() {
    const r = await recPost<{ ok: true }>("room-note", {
      id: v.room.id,
      candidateId: s.candidateId,
      text: catatan,
    });
    if (isFail(r)) toast(t.fail, "danger");
    else toast(d.noteSaved);
    await jalan("room", {});
  }
  void k;

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={s.nama}
      description={d.sub(s.nim, s.no, s.kit?.code ?? null)}
      storeKey="rec-ruang"
      minWidth={420}
      closeLabel={d.close}
      resizeLabel={d.resize}
    >
      <div className="stack stack--lg">
        <div className="rec-sum">
          <span className="hint">{d.part}</span>
          <b>
            {cur && s.done[cur] !== undefined
              ? d.handed
              : cur
                ? d.answered(s.answered, s.total)
                : "-"}
          </b>
          <span className="hint">{d.timeLeft}</span>
          <b className="num">
            {sisa === null ? "-" : hms(sisa)}
            {s.extraMs ? ` (${d.withExtra(Math.round(s.extraMs / MIN))})` : ""}
          </b>
          <span className="hint">{d.connection}</span>
          <b>
            {!s.checkedIn
              ? RG[lang].con.grid.notIn
              : online === false
                ? RG[lang].con.grid.offline
                : RG[lang].con.grid.online}
          </b>
        </div>
        <section className="stack stack--sm">
          <h3 className="label-caps">{d.events}</h3>
          {s.kejadian.length ? (
            <ol className="r3tline">
              {s.kejadian.map((x) => (
                <li key={x.id} data-open={x.backAt === null ? "yes" : "no"}>
                  <span className="num hint">{hm(x.at)}</span>
                  <span className="stack" style={{ gap: 0 }}>
                    <b>{x.kinds.map((q) => d.kinds[q] ?? q).join(", ")}</b>
                    <span className="hint">
                      {x.backAt === null ? d.stillAway : d.away(mmss(x.backAt - x.at))}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <span className="hint">{d.noEvents}</span>
          )}
        </section>
        {bisaWaktu && (
          <section className="stack stack--sm">
            <h3 className="label-caps">{d.timeFor}</h3>
            <div className="rec-chips">
              {[1, 3, 5, 10].map((m) => (
                <button key={m} type="button" className="r3chip" onClick={() => void waktu(m)}>
                  +{m} {t.ctl.min}
                </button>
              ))}
            </div>
            <span className="hint">{d.timeHint}</span>
          </section>
        )}
        {bisaUndi && (
          <section className="stack stack--sm">
            <h3 className="label-caps">{d.redraw}</h3>
            <Dropdown
              id={`r3-alasan-${s.candidateId}`}
              label={d.redrawAsk}
              value={alasan}
              onChange={(x) => setAlasan(x as RerollReason)}
              options={REROLL_REASONS.map((r) => ({ value: r, label: d.reasons[r] }))}
            />
            <div className="row">
              <button
                type="button"
                className="btn btn--inverse btn--sm"
                onClick={() => void undi("topic")}
              >
                {d.redrawTopic}
              </button>
              <button
                type="button"
                className="btn btn--inverse btn--sm"
                onClick={() => void undi("protocol")}
              >
                {d.redrawProto}
              </button>
            </div>
            <span className="hint">{d.redrawHint}</span>
          </section>
        )}
        <section className="stack stack--sm">
          <h3 className="label-caps">{d.notes}</h3>
          {lain.map((n) => (
            <div key={n.authorNim} className="rec-note">
              <span>{n.text}</span>
              <span className="hint">
                {n.authorNama} · {hm(n.at)}
              </span>
            </div>
          ))}
          <textarea
            className="field__input"
            rows={3}
            placeholder={d.notePh}
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
          />
          <div className="row row--end">
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => void simpan()}
            >
              {d.noteSave}
            </button>
          </div>
        </section>
        <span className="hint">{d.moveHint}</span>
      </div>
    </Drawer>
  );
}

function SeatGrid({
  lang,
  v,
  now,
  hadir,
  live,
  kemajuan,
  jalan,
}: {
  lang: Lang;
  v: ConsoleView;
  now: number;
  hadir: Hadir | null;
  live: StatusLangsung;
  kemajuan: Kemajuan;
  jalan: (aksi: string, body: Record<string, unknown>) => Promise<unknown>;
}) {
  const t = RG[lang].con.grid;
  const [f, setF] = useState<Filter>("semua");
  const [pilih, setPilih] = useState<number | null>(null);
  const tahu = hadir !== null && live === "live";
  const online = (s: ConsoleSeat) =>
    !tahu || s.seatId === null ? null : hadir!.kursi.includes(s.seatId);
  const tiles: Tile[] = v.seats.map((s) => ({
    checkedIn: s.checkedIn,
    connected: online(s),
    count: s.count,
    open: s.outSince !== null,
  }));
  const n = countFilters(tiles);
  const seats = v.seats.filter((_, i) => matchFilter(f, tiles[i]));
  const terbuka = v.seats.find((s) => s.candidateId === pilih) ?? null;
  const terhubung = v.seats.filter((s) => online(s) === true).length;
  return (
    <section className="stack r3grid">
      <div className="row r3grid__tools">
        <div className="rec-chips" role="group" aria-label={t.aria}>
          {FILTERS.map((k) => (
            <button
              key={k}
              type="button"
              className="r3chip r3fchip"
              aria-pressed={f === k}
              data-k={k}
              onClick={() => setF(k)}
            >
              {t.filters[k]} <span className="num">{n[k]}</span>
            </button>
          ))}
        </div>
        <span className="hint">
          {v.view === "persiapan"
            ? t.dotsHint
            : tahu
              ? `${t.connected(terhubung)}${hadir!.panitia.length ? ` · ${t.panitia(hadir!.panitia.length)}` : ""}`
              : ""}
        </span>
      </div>
      {v.seats.length === 0 ? (
        <p className="hint">{t.noSeats}</p>
      ) : seats.length === 0 ? (
        <p className="hint">{t.empty}</p>
      ) : (
        <div className="r3tiles">
          {seats.map((s) => (
            <SeatTile
              key={s.candidateId}
              lang={lang}
              s={s}
              v={v}
              now={now}
              online={online(s)}
              kemajuan={s.seatId !== null ? kemajuan[s.seatId] : undefined}
              onOpen={() => setPilih(s.candidateId)}
            />
          ))}
        </div>
      )}
      {terbuka && (
        <SeatDrawer
          lang={lang}
          s={terbuka}
          v={v}
          now={now}
          online={online(terbuka)}
          jalan={jalan}
          onClose={() => setPilih(null)}
        />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ Feed */

function Feed({ lang, v, log }: { lang: Lang; v: ConsoleView; log: RoomLogLine[] }) {
  const t = RG[lang].con.feed;
  const name = (nim: string) => v.seats.find((s) => s.nim === nim)?.nama ?? nim;
  const rows = [
    ...log.map((l) => ({
      at: l.at,
      tone: "",
      text: `${l.nama} ${t.acts[l.act] ?? l.act}${l.act === "start" && v.state.cur ? ` ${RG[lang].part[v.state.cur].l}` : ""}`,
    })),
    ...v.seats.flatMap((s) =>
      s.kejadian.map((x) => ({
        at: x.at,
        tone: "warn",
        text: t.strike(
          depan(s.nama),
          x.kinds.map((q) => RG[lang].con.drawer.kinds[q] ?? q).join(", "),
        ),
      })),
    ),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 30);
  void name;
  return (
    <section className="panel r3feed">
      <div className="panel__head">
        <h2 className="panel__title">{t.title}</h2>
        <span className="hint">{t.live}</span>
      </div>
      {rows.length ? (
        <ol className="r3tline">
          {rows.map((r, i) => (
            <li key={i} data-tone={r.tone}>
              <span className="num hint">{hm(r.at)}</span>
              <span>{r.text}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="hint">{t.empty}</p>
      )}
    </section>
  );
}

/* --------------------------------------------------- boards by hotspot */

function PapanPerHotspot({ lang, v }: { lang: Lang; v: ConsoleView }) {
  const t = RG[lang].hs;
  const p = v.plan;
  if (!p.wifi) return null;
  const seatOf = (id: number) => v.seats.find((s) => s.seatId === id);
  const kartu = (h: ConsoleView["hotspots"][number]) => {
    const g = p.groups[h.id];
    const papan = p.assignments.filter((a) => a.hotspot === h.id);
    const punya = typeof h.owner === "object";
    const sk = punya ? seatOf((h.owner as { seat: number }).seat) : null;
    return (
      <section key={h.id} className="panel r3hg" data-own={punya ? "yes" : "no"}>
        <div className="panel__head">
          <div className="stack" style={{ gap: 2, minWidth: 0 }}>
            <h3 className="panel__title r3hg__t">{h.ssid}</h3>
            <span className="hint">
              {sk ? t.seatOf(sk.no, depan(sk.nama)) : `${t.fallback}: ${String(h.owner)}`} ·{" "}
              {t.group(papan.length, g?.cap ?? h.cap)}
            </span>
          </div>
        </div>
        <ul className="r3hg__list">
          {papan.map((a) => {
            const s = seatOf(a.seatId);
            return (
              <li key={`${a.seatId}-${a.n}`} data-on="yes">
                <span className="r3dot" data-on="yes" />
                <b className="num">
                  {s?.no ?? a.seatId}·{a.n}
                </b>
                <span className="r3hg__n">{s ? depan(s.nama) : ""}</span>
              </li>
            );
          })}
        </ul>
      </section>
    );
  };
  const punya = v.hotspots.filter((h) => typeof h.owner === "object");
  const cadangan = v.hotspots.filter((h) => typeof h.owner !== "object");
  return (
    <div className="stack stack--lg">
      <div className="row row--between r3hg__sum">
        <span className="eyebrow">{t.byGroup}</span>
        <Pill tone={p.short ? "danger" : "ok"}>{t.need(p.need, p.have)}</Pill>
      </div>
      {punya.length > 0 && (
        <div className="stack stack--sm">
          <span className="label-caps">{t.cand}</span>
          <div className="r3hgroups r3hgroups--own">{punya.map(kartu)}</div>
        </div>
      )}
      <div className="stack stack--sm">
        <span className="label-caps">{t.fallback}</span>
        <div className="r3hgroups">{cadangan.map(kartu)}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- Finished */

function Selesai({ lang, v, now }: { lang: Lang; v: ConsoleView; now: number }) {
  const t = RG[lang].con.done;
  const st = v.state;
  return (
    <section className="panel r3done">
      <div className="panel__head">
        <h2 className="panel__title">
          {t.title} {st.finishedAt ? hm(st.finishedAt) : hm(now)}
        </h2>
        {v.master && <Pill tone="ok">{t.by(v.master.nama)}</Pill>}
      </div>
      <div className="r3done__tbl">
        <table className="table">
          <thead>
            <tr>
              <th>{t.part}</th>
              <th>{t.ran}</th>
              <th>{t.minutes}</th>
            </tr>
          </thead>
          <tbody>
            {PART_KEYS.filter((p) => st.runs[p]).map((p) => {
              const r = st.runs[p]!;
              return (
                <tr key={p}>
                  <td>
                    <b>{RG[lang].part[p].l}</b>
                  </td>
                  <td className="hint">
                    {hm(r.startedAt)} {t.until} {r.endedAt ? hm(r.endedAt) : hm(now)}
                  </td>
                  <td className="num">{Math.round(clock(r, r.endedAt ?? now) / MIN)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="hint" style={{ margin: 0, paddingLeft: 18 }}>
        {t.effects.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </section>
  );
}

/* --------------------------------------------------------------- Console */

export default function Konsol({
  lang,
  v,
  now,
  hadir,
  live,
  kemajuan,
  log,
  refresh,
}: {
  lang: Lang;
  v: ConsoleView;
  now: number;
  hadir: Hadir | null;
  live: StatusLangsung;
  kemajuan: Kemajuan;
  log: RoomLogLine[];
  refresh: () => void;
}) {
  const jalan = async (_aksi: string, _body: Record<string, unknown>) => refresh();
  const rv = roomView(v.state, now).view;
  void tgl;
  return (
    <div className="stack r3con__body">
      <MasterBar lang={lang} v={v} jalan={jalan} />
      {rv === "finished" ? (
        <Selesai lang={lang} v={v} now={now} />
      ) : (
        <>
          {v.me.isMaster && <Transport lang={lang} v={v} now={now} jalan={jalan} />}
          {rv !== "persiapan" && rv !== "setup" && <Budget lang={lang} v={v} now={now} />}
          <div className="r3con__main">
            <SeatGrid
              lang={lang}
              v={v}
              now={now}
              hadir={hadir}
              live={live}
              kemajuan={kemajuan}
              jalan={jalan}
            />
            <Feed lang={lang} v={v} log={log} />
          </div>
          <PapanPerHotspot lang={lang} v={v} />
        </>
      )}
    </div>
  );
}
