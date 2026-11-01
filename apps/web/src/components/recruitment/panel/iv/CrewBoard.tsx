/**
 * Plotting, Penguji section for Wawancara and Mengajar (mockup r4-plot):
 * who examines each slot and who is PJ of each shift, with a check that lists
 * every clash (an examiner in two rooms at once, a PJ who also examines), every
 * slot short of examiners and every room over capacity. Picking is by dialog;
 * each change is one request (iv-crew-set), live on the reciv topic.
 */
import { useMemo, useState } from "react";
import Dialog from "../../../ui/Dialog";
import Pill from "../../../ui/Pill";
import type { Lang } from "../../../../lib/kelas";
import { isFail, recPost } from "../../../../lib/recruitment/client";
import {
  useIvCrew,
  type IvCrewResponse,
  type IvCrewSlot,
} from "../../../../lib/recruitment/iv-client";
import { crewNeed, type IvStage } from "../../../../lib/recruitment/interview";
import { bukaBagian } from "../../../../lib/recruitment/panel-tab";
import type { RecRights } from "../../../../lib/recruitment/types";
import { IV } from "./ivStrings";
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
  new Intl.DateTimeFormat(lang === "id" ? "id-ID" : "en-GB", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
const overlap = (a: IvCrewSlot, b: IvCrewSlot) =>
  a.id !== b.id && a.startsAt < b.endsAt && b.startsAt < a.endsAt;

interface Flag {
  tone: "danger" | "warn";
  text: string;
  at: string;
}

export default function CrewBoard({
  lang,
  stage,
  rights,
}: {
  lang: Lang;
  stage: IvStage;
  rights: RecRights;
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
        if (o) out.push({ tone: "danger", text: t.clashEx(kodeOf(n), o.room), at: at(s) });
      }
      for (const n of [...s.pjOut, ...s.pjIn]) {
        const o = slots.find((x) => (x.id === s.id || overlap(s, x)) && x.penguji.includes(n));
        if (o) out.push({ tone: "danger", text: t.clashPj(kodeOf(n), o.room), at: at(s) });
      }
      if (s.booths.length > s.capacity)
        out.push({ tone: "danger", text: t.over(s.booths.length, s.capacity), at: at(s) });
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
        });
    }
    for (const sh of shifts) {
      const a = sh[0];
      const luar = new Set(sh.flatMap((s) => s.pjOut));
      const dalam = new Set(sh.flatMap((s) => s.pjIn));
      if (luar.size < d.template.pjOut)
        out.push({ tone: "warn", text: `${t.out}: ${luar.size}/${d.template.pjOut}`, at: at(a) });
      if (dalam.size < d.template.pjIn)
        out.push({ tone: "warn", text: `${t.inn}: ${dalam.size}/${d.template.pjIn}`, at: at(a) });
    }
    return out.sort((x, y) => (x.tone === y.tone ? 0 : x.tone === "danger" ? -1 : 1));
  }, [d, shifts, lang]);

  if (!d) return <span className="skeleton" style={{ height: 320 }} />;
  const nD = flags.filter((f) => f.tone === "danger").length;
  const nW = flags.length - nD;

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

  return (
    <div className="stack">
      <section
        className="panel r4check"
        data-ok={flags.length ? undefined : "yes"}
        aria-live="polite"
      >
        <div className="panel__head">
          <h3 className="panel__title">{t.check}</h3>
          <span className="row" style={{ gap: 6 }}>
            {nD > 0 && <Pill tone="danger">{t.clashes(nD)}</Pill>}
            {nW > 0 && <Pill tone="warn">{t.toFill(nW)}</Pill>}
            {!flags.length && <Pill tone="ok">{t.ready}</Pill>}
          </span>
        </div>
        {flags.length > 0 && (
          <ul className="r4check__list">
            {flags.map((f, i) => (
              <li key={i} data-t={f.tone}>
                <span className="r4check__dot" aria-hidden="true" />
                <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                  <b>{f.text}</b>
                  <span className="hint">{f.at}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="hint">{t.lede[d.template.mode]}</p>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        style={{ alignSelf: "flex-start" }}
        onClick={() => bukaBagian(stage)}
      >
        {w.seg.template}
      </button>

      {d.slots.length === 0 && <p className="hint">{w.nilai.none}</p>}
      <div className="stack">
        {d.slots.map((s) => {
          const want = crewNeed(s.booths.length, d.template);
          return (
            <section
              key={s.id}
              className="panel r4lane"
              data-short={s.penguji.length < want ? "yes" : undefined}
            >
              <div className="panel__head">
                <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                  <h3 className="panel__title">{s.room}</h3>
                  <span className="hint num">
                    {hari(s.startsAt, lang)}, {jam(s.startsAt)} - {jam(s.endsAt)} ·{" "}
                    {s.booths.length}/{s.capacity}
                  </span>
                </div>
                <span className="r4lane__n num">{t.count(s.penguji.length, want)}</span>
              </div>
              <div className="r4lane__z">
                {s.penguji.map((n) =>
                  chip(
                    n,
                    () =>
                      void simpan(
                        [s],
                        "penguji",
                        s.penguji.filter((x) => x !== n),
                      ),
                    !!bentrok(n, [s], "penguji"),
                  ),
                )}
                {!s.penguji.length && <span className="r4lane__none">{t.empty}</span>}
                {can && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => setPick({ role: "penguji", slots: [s] })}
                  >
                    +
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>

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

      {pick && (
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
      )}
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
      size="lg"
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
