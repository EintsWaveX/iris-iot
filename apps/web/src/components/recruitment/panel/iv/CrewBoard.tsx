/**
 * Plotting, Penguji section for Wawancara and Mengajar (mockup r4-plot):
 * who examines each slot and who is PJ of each shift, with a check that lists
 * every clash (an examiner in two rooms at once, a PJ who also examines), every
 * slot short of examiners and every room over capacity. Picking is by dialog;
 * each change is one request (iv-crew-set), live on the reciv topic.
 */
import CrewRule from "./CrewRule";
import { useMemo, useState, type ReactNode } from "react";
import Dialog from "../../../ui/Dialog";
import type { Lang } from "../../../../lib/kelas";
import { isFail, recPost } from "../../../../lib/recruitment/client";
import {
  useIvCrew,
  type IvCrewResponse,
  type IvCrewSlot,
} from "../../../../lib/recruitment/iv-client";
import { crewNeed, type IvStage } from "../../../../lib/recruitment/interview";
import type { RecRights } from "../../../../lib/recruitment/types";
import { IV } from "./ivStrings";
import { CB } from "./crewBoardStrings";
import {
  CrewLane,
  CrewTop,
  type CrewCtx,
  type CrewFlag,
  type ExData,
  type LaneEnv,
} from "./CrewPapan";
import "../../recruitment-r4.css";

type Role = "penguji" | "pj_luar" | "pj_dalam";
const toast = (m: string, tone: "ok" | "warn" | "danger" = "ok") => window.Toast?.show(m, tone);

const jam = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(iso))
    .replace(":", ".");
const hari = (iso: string, lang: Lang) =>
  new Intl.DateTimeFormat(lang === "id" ? "id-ID" : lang === "zh" ? "zh-CN" : "en-GB", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
const overlap = (a: IvCrewSlot, b: IvCrewSlot) =>
  a.id !== b.id && a.startsAt < b.endsAt && b.startsAt < a.endsAt;

type Flag = CrewFlag;

export default function CrewBoard({
  part = "slot",
  lang,
  stage,
  rights,
  children,
}: {
  lang: Lang;
  stage: IvStage;
  rights: RecRights;

  /** The mockup puts the crew rule and the PJ of each shift in the Slot tab; the Papan gets the check, the pool and a lane per slot card */
  part?: "slot" | "papan";
  /** Papan only: the board is drawn by the caller and takes the crew pieces to place */
  children?: (c: CrewCtx) => ReactNode;
}) {
  const w = IV(lang);
  const t = w.crew;
  const crew = useIvCrew(stage);
  const d = crew.data;
  const can = rights.plotPengawas === true;
  const [pick, setPick] = useState<{ role: Role; slots: IvCrewSlot[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const kode = useMemo(() => new Map((d?.pool ?? []).map((p) => [p.nim, p.kode])), [d?.pool]);
  const kodeOf = (n: string) => kode.get(n) ?? n;

  const shifts = useMemo(() => {
    const m = new Map<string, IvCrewSlot[]>();
    for (const s of d?.slots ?? []) m.set(s.startsAt, [...(m.get(s.startsAt) ?? []), s]);
    return [...m.values()];
  }, [d?.slots]);

  const flags = useMemo<Flag[]>(() => {
    if (!d) return [];
    const out: Flag[] = [];
    const slots = d.slots;
    const at = (s: IvCrewSlot) => `${hari(s.startsAt, lang)}, ${jam(s.startsAt)} · ${s.room}`;
    for (const s of slots) {
      for (const n of s.penguji) {
        const o = slots.find((x) => overlap(s, x) && x.id > s.id && x.penguji.includes(n));
        if (o)
          out.push({
            tone: "danger",
            text: t.clashEx(kodeOf(n), o.room),
            at: at(s),
            go: s.id,
            slotId: s.id,
          });
      }
      for (const n of [...s.pjOut, ...s.pjIn]) {
        const o = slots.find((x) => (x.id === s.id || overlap(s, x)) && x.penguji.includes(n));
        if (o)
          out.push({
            tone: "danger",
            text: t.clashPj(kodeOf(n), o.room),
            at: at(s),
            go: s.id,
            slotId: null,
          });
      }
      if (s.booths.length > s.capacity)
        out.push({
          tone: "danger",
          text: t.over(s.booths.length, s.capacity),
          at: at(s),
          go: s.id,
          slotId: s.id,
        });
      const kurang = crewNeed(s.booths.length, d.template) - s.penguji.length;
      if (kurang > 0)
        out.push({
          tone: "warn",
          text: s.penguji.length
            ? d.template.mode === "panel"
              ? t.shortPanel(kurang)
              : t.short(kurang, s.booths.length)
            : t.none,
          at: at(s),
          go: s.id,
          slotId: s.id,
        });
    }
    for (const sh of shifts) {
      const a = sh[0];
      const luar = new Set(sh.flatMap((s) => s.pjOut));
      const dalam = new Set(sh.flatMap((s) => s.pjIn));
      if (luar.size < d.template.pjOut)
        out.push({
          tone: "warn",
          text: `${t.out}: ${luar.size}/${d.template.pjOut}`,
          at: at(a),
          go: a.id,
          slotId: null,
        });
      if (dalam.size < d.template.pjIn)
        out.push({
          tone: "warn",
          text: `${t.inn}: ${dalam.size}/${d.template.pjIn}`,
          at: at(a),
          go: a.id,
          slotId: null,
        });
    }
    return out.sort((x, y) => (x.tone === y.tone ? 0 : x.tone === "danger" ? -1 : 1));
  }, [d, shifts, lang]);

  if (!d) return <span className="skeleton" style={{ height: 320 }} />;
  const simpan = async (slots: IvCrewSlot[], role: Role, nims: string[]) => {
    setBusy(true);
    const r = await recPost<{ ok: true }>("iv-crew-set", {
      stage,
      slotIds: slots.map((s) => s.id),
      role,
      nims,
    });
    setBusy(false);
    if (isFail(r)) return toast(w.err[r.kode] ?? t.saveFail, "danger");
    crew.refresh();
  };

  const nSlot = (nim: string) => d.slots.filter((s) => s.penguji.includes(nim)).length;
  const bentrok = (nim: string, slots: IvCrewSlot[], role: Role): IvCrewSlot | undefined =>
    d.slots.find(
      (x) =>
        !slots.some((s) => s.id === x.id) &&
        slots.some((s) => overlap(s, x)) &&
        (role === "penguji"
          ? x.penguji.includes(nim) || x.pjOut.includes(nim) || x.pjIn.includes(nim)
          : x.penguji.includes(nim)),
    );

  const chip = (nim: string, onX: () => void, clash: boolean) => (
    <span key={nim} className="r4ex" data-clash={clash ? "yes" : undefined} data-static="yes">
      <b>{kodeOf(nim)}</b>
      {can && (
        <button
          type="button"
          className="r4ex__x"
          aria-label={`${t.save} ${kodeOf(nim)}`}
          onClick={onX}
          disabled={busy}
        >
          ×
        </button>
      )}
    </span>
  );

  const picker = pick && (
    <Picker
      lang={lang}
      d={d}
      pick={pick}
      bentrok={bentrok}
      nSlot={nSlot}
      busy={busy}
      onClose={() => setPick(null)}
      onToggle={(nim, on) => {
        const live = pick.slots.map((s) => d.slots.find((x) => x.id === s.id) ?? s);
        const cur =
          pick.role === "penguji"
            ? live[0].penguji
            : pick.role === "pj_luar"
              ? [...new Set(live.flatMap((s) => s.pjOut))]
              : [...new Set(live.flatMap((s) => s.pjIn))];
        void simpan(live, pick.role, on ? [...cur, nim] : cur.filter((x) => x !== nim));
      }}
    />
  );

  /* ---------------------------------------------------- the Papan's examiner pieces */
  const cb = CB(lang);
  const panel = d.template.mode === "panel";
  const when = (s: IvCrewSlot) => (panel ? hari(s.startsAt, lang).split(",")[0] : jam(s.startsAt));
  const slotOf = (id: number) => d.slots.find((x) => x.id === id);
  const clashAt = (nim: string, s: IvCrewSlot) => bentrok(nim, [s], "penguji");
  const env: LaneEnv = {
    d,
    lang,
    can,
    busy,
    kodeOf,
    clashAt,
    want: (s) => crewNeed(s.booths.length, d.template),
    when,
    onRemove: (s, nim) =>
      void change(
        [{ s, nims: s.penguji.filter((x) => x !== nim) }],
        cb.removed(kodeOf(nim), s.room, when(s)),
        "ok",
      ),
    onPlus: (s) => setPick({ role: "penguji", slots: [s] }),
  };
  /** Saves each slot's new list in turn, then says what happened with one Urungkan that restores them. */
  async function change(
    edits: { s: IvCrewSlot; nims: string[] }[],
    msg: string,
    tone: "ok" | "warn",
  ) {
    setBusy(true);
    for (const e of edits) {
      const r = await recPost<{ ok: true }>("iv-crew-set", {
        stage,
        slotIds: [e.s.id],
        role: "penguji",
        nims: e.nims,
      });
      if (isFail(r)) {
        setBusy(false);
        crew.refresh();
        return toast(w.err[r.kode] ?? t.saveFail, "danger");
      }
    }
    setBusy(false);
    crew.refresh();
    const back = edits.map((e) => ({ s: e.s, nims: e.s.penguji }));
    window.Toast?.show(msg, tone, {
      action: {
        label: cb.undo,
        onClick: async () => {
          for (const e of back)
            await recPost("iv-crew-set", {
              stage,
              slotIds: [e.s.id],
              role: "penguji",
              nims: e.nims,
            });
          crew.refresh();
        },
      },
    } as never);
  }
  const drop = (x: ExData, overId: string | null) => {
    if (!can || !overId || busy) return;
    const code = kodeOf(x.nim);
    const src = x.from === "pool" ? null : (slotOf(x.from) ?? null);
    let dst: IvCrewSlot | null = null;
    let at: number | null = null;
    if (overId === "expool") {
      if (src)
        void change(
          [{ s: src, nims: src.penguji.filter((n) => n !== x.nim) }],
          cb.removed(code, src.room, when(src)),
          "ok",
        );
      return;
    }
    if (overId.startsWith("exc:")) {
      const [, sid, nim] = overId.split(":");
      dst = slotOf(Number(sid)) ?? null;
      if (dst && nim === x.nim) return;
      at = dst ? dst.penguji.indexOf(nim) : null;
    } else if (overId.startsWith("ex:")) {
      dst = slotOf(Number(overId.slice(3))) ?? null;
    }
    if (!dst) return;
    if (src && src.id === dst.id) {
      const rest = dst.penguji.filter((n) => n !== x.nim);
      const i = at === null || at < 0 ? rest.length : rest.indexOf(overId.split(":")[2]);
      rest.splice(i < 0 ? rest.length : i, 0, x.nim);
      if (rest.join() !== dst.penguji.join())
        void change([{ s: dst, nims: rest }], cb.added(code, dst.room, when(dst)), "ok");
      return;
    }
    if (dst.penguji.includes(x.nim)) return void toast(cb.already(code, panel), "warn");
    const next = dst.penguji.slice();
    next.splice(at === null || at < 0 ? next.length : at, 0, x.nim);
    const other = d.slots.find(
      (o) =>
        o.id !== dst.id &&
        o.id !== src?.id &&
        overlap(dst, o) &&
        (o.penguji.includes(x.nim) || o.pjOut.includes(x.nim) || o.pjIn.includes(x.nim)),
    );
    const edits = [{ s: dst, nims: next }];
    if (src) edits.unshift({ s: src, nims: src.penguji.filter((n) => n !== x.nim) });
    void change(
      edits,
      other ? cb.clashNow(code, other.room, panel) : cb.added(code, dst.room, when(dst)),
      other ? "warn" : "ok",
    );
  };
  const jump = (id: number) => {
    const el = document.querySelector<HTMLElement>(`[data-col="${id}"]`);
    if (!el) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "nearest", inline: "center", behavior: still ? "auto" : "smooth" });
    if (!still && el.animate)
      el.animate(
        [
          { boxShadow: "0 0 0 0 var(--accent)" },
          { boxShadow: "0 0 0 3px var(--accent)", offset: 0.25 },
          { boxShadow: "0 0 0 0 transparent" },
        ],
        { duration: 1100, easing: "cubic-bezier(0.23, 1, 0.32, 1)", delay: 220 },
      );
  };
  if (part === "papan") {
    const ctx: CrewCtx = {
      stage,
      top: (extra) => (
        <CrewTop
          env={env}
          flags={[...flags, ...extra].sort((a, b) =>
            a.tone === b.tone ? 0 : a.tone === "danger" ? -1 : 1,
          )}
          jump={jump}
        />
      ),
      lane: (id) => {
        const s = slotOf(id);
        return s ? <CrewLane env={env} s={s} /> : null;
      },
      flagsOf: (id) => flags.filter((f) => f.slotId === id),
      drop,
      overlay: (x) =>
        x.from === "pool" ? (
          <span className="r4pc" style={{ "--c": "var(--accent)" } as React.CSSProperties}>
            <b>{kodeOf(x.nim)}</b>
          </span>
        ) : (
          <span className="r4ex">
            <b>{kodeOf(x.nim)}</b>
          </span>
        ),
      picker,
    };
    return <>{children?.(ctx)}</>;
  }

  return (
    <div className="stack">
      <CrewRule lang={lang} stage={stage} />

      {shifts.length > 0 && (d.template.pjOut > 0 || d.template.pjIn > 0) && (
        <section className="panel r4pj">
          <div className="panel__head">
            <div className="stack" style={{ gap: 2 }}>
              <h3 className="panel__title">{t.pjTitle}</h3>
              <span className="hint">{t.pjLede}</span>
            </div>
          </div>
          <div className="scrollx">
            <table className="table">
              <thead>
                <tr>
                  <th />
                  {d.template.pjOut > 0 && <th>{t.out}</th>}
                  {d.template.pjIn > 0 && <th>{t.inn}</th>}
                </tr>
              </thead>
              <tbody>
                {shifts.map((sh) => {
                  const a = sh[0];
                  const luar = [...new Set(sh.flatMap((s) => s.pjOut))];
                  const dalam = [...new Set(sh.flatMap((s) => s.pjIn))];
                  const cell = (role: Role, list: string[], need: number) => (
                    <td>
                      <div className="r4pj__z" data-short={list.length < need ? "yes" : undefined}>
                        {list.map((n) =>
                          chip(
                            n,
                            () =>
                              void simpan(
                                sh,
                                role,
                                list.filter((x) => x !== n),
                              ),
                            !!bentrok(n, sh, role),
                          ),
                        )}
                        {!list.length && <span className="r4lane__none">{t.empty}</span>}
                        {can && (
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => setPick({ role, slots: sh })}
                          >
                            +
                          </button>
                        )}
                      </div>
                    </td>
                  );
                  return (
                    <tr key={a.startsAt}>
                      <td>
                        <span className="stack" style={{ gap: 0 }}>
                          <b>{hari(a.startsAt, lang)}</b>
                          <span className="hint num">
                            {jam(a.startsAt)} - {jam(a.endsAt)}
                          </span>
                        </span>
                      </td>
                      {d.template.pjOut > 0 && cell("pj_luar", luar, d.template.pjOut)}
                      {d.template.pjIn > 0 && cell("pj_dalam", dalam, d.template.pjIn)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {picker}
    </div>
  );
}

function Picker({
  lang,
  d,
  pick,
  bentrok,
  nSlot,
  busy,
  onClose,
  onToggle,
}: {
  lang: Lang;
  d: IvCrewResponse;
  pick: { role: Role; slots: IvCrewSlot[] };
  bentrok: (nim: string, slots: IvCrewSlot[], role: Role) => IvCrewSlot | undefined;
  nSlot: (nim: string) => number;
  busy: boolean;
  onClose: () => void;
  onToggle: (nim: string, on: boolean) => void;
}) {
  const t = IV(lang).crew;
  const live = pick.slots.map((s) => d.slots.find((x) => x.id === s.id) ?? s);
  const cur =
    pick.role === "penguji"
      ? new Set(live[0].penguji)
      : pick.role === "pj_luar"
        ? new Set(live.flatMap((s) => s.pjOut))
        : new Set(live.flatMap((s) => s.pjIn));
  const first = live[0];
  const title =
    pick.role === "penguji"
      ? t.pick(first.room, jam(first.startsAt))
      : pick.role === "pj_luar"
        ? t.out
        : t.inn;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      lang={lang}
      actions={
        <button type="button" className="btn btn--primary" onClick={onClose}>
          {t.save}
        </button>
      }
    >
      <div className="r4pick">
        {d.pool.map((p) => {
          const here = cur.has(p.nim);
          const cl = bentrok(p.nim, live, pick.role);
          return (
            <button
              key={p.nim}
              type="button"
              className="r4pick__o"
              aria-pressed={here}
              data-clash={cl && !here ? "yes" : undefined}
              disabled={busy}
              onClick={() => onToggle(p.nim, !here)}
            >
              <span className="acode">{p.kode}</span>
              <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                <b>{p.nama}</b>
                <span className="hint">
                  {here
                    ? t.here
                    : cl
                      ? t.elsewhere(cl.room)
                      : nSlot(p.nim)
                        ? t.slots(nSlot(p.nim))
                        : t.free}
                </span>
              </span>
              {here && <span aria-hidden="true">✓</span>}
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
