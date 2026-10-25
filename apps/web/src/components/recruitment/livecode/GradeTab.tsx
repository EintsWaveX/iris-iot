/**
 * Grading Live Coding (prompt 12, mockup r3-lcpanel, EXAM-ENGINE 9.8, 11.3 item
 * 1): the room's seats with their topic, protocol, last compile and flash, and
 * who has sheeted each; a sheet opens in a wide drawer with the seat's live
 * traffic on the left and the rubric on the right. Each row is a five step
 * choice in words with its number; the sheet's score shows once every row is
 * set. The other grader's values are never sent to this page, only who and
 * when. Graders are the room's plotted pengawas, Akademik and the Ketua; the
 * first two sheets from two people count.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Drawer from "../../ui/Drawer";
import Pill from "../../ui/Pill";
import type { Lang } from "../../../lib/kelas";
import { usePoll } from "../../../lib/hooks";
import { isFail, recGet, recPost } from "../../../lib/recruitment/client";
import type { GradeRoom, GradeSeat, RubricView } from "../../../lib/recruitment/lc-api";
import { livecodeScore } from "../../../lib/recruitment/scoring";
import { PROTOCOL_NAME, clock } from "../../../lib/recruitment/lc-ui";
import { Md } from "../exam/render/text";
import { LC } from "./lcStrings";
import { TrafficList } from "./SidePanels";
import { useLcGateway } from "./useLcGateway";

import "../recruitment-s3-lc.css";

const toast = (m: string, tone: "ok" | "warn" | "danger" = "ok") =>
  (window as unknown as { Toast?: { show: (m: string, t: string) => void } }).Toast?.show(m, tone);

type Filter = "all" | "needs" | "mine";

export default function GradeTab({ lang, roomId }: { lang: Lang; roomId: number }) {
  const L = LC[lang].grade;
  const poll = usePoll<GradeRoom | null>(
    async () => {
      const r = await recGet<GradeRoom & { ok: true }>("lc-room", { id: String(roomId) });
      if (!isFail(r)) return r;
      if (r.kode === "offline" || r.status >= 500) throw new Error(String(r.status || 408));
      return null;
    },
    300_000,
    true,
    ["reclive", "recroom"],
    300,
    roomId,
  );
  const data = poll.data;
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<number | null>(null);

  const rows = useMemo(() => {
    const all = data?.seats ?? [];
    if (filter === "needs") return all.filter((s) => s.sheets.length < 2);
    if (filter === "mine") return all.filter((s) => s.mine);
    return all;
  }, [data, filter]);

  if (!data)
    return poll.data === null && poll.updatedAt ? (
      <p className="hint">{L.noRight}</p>
    ) : (
      <span className="skeleton" style={{ height: 160 }} />
    );

  return (
    <section className="r3grade panel">
      <div className="panel__head">
        <div className="stack" style={{ gap: 2 }}>
          <h3 className="panel__title">{L.title}</h3>
          <span className="hint">{L.hint}</span>
        </div>
        <Pill tone={data.open ? "ok" : "warn"}>{data.open ? L.open : L.closed}</Pill>
      </div>

      <div className="r3chips" role="group" aria-label={L.filters.label}>
        {(["all", "needs", "mine"] as Filter[]).map((f) => (
          <Pill key={f} pressed={filter === f} onClick={() => setFilter(f)}>
            {L.filters[f]}
          </Pill>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="hint">{L.none}</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="r3grade__list">
            <thead>
              <tr>
                <th>{L.col.no}</th>
                <th>{L.col.name}</th>
                <th>{L.col.topic}</th>
                <th>{L.col.protocol}</th>
                <th>{L.col.compile}</th>
                <th>{L.col.flash}</th>
                <th>{L.col.sheets}</th>
                <th aria-label={L.col.act} />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <Row key={s.seatId} lang={lang} s={s} onOpen={() => setOpen(s.seatId)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open !== null && (
        <Sheet
          lang={lang}
          roomId={roomId}
          seat={data.seats.find((s) => s.seatId === open) ?? null}
          onClose={() => setOpen(null)}
          onChanged={poll.refresh}
        />
      )}
    </section>
  );
}

function Row({ lang, s, onOpen }: { lang: Lang; s: GradeSeat; onOpen: () => void }) {
  const L = LC[lang].grade;
  const run = (r: GradeSeat["lastCompile"]) =>
    r ? `${r.ok ? L.ok : L.bad} ${clock(r.at).slice(0, 5)}` : "-";
  return (
    <tr>
      <td className="num">{s.no}</td>
      <td>{s.nama || "-"}</td>
      <td>{s.topic ?? L.notDealt}</td>
      <td>{s.protocol ? PROTOCOL_NAME[s.protocol] : "-"}</td>
      <td className="num">{run(s.lastCompile)}</td>
      <td className="num">{run(s.lastFlash)}</td>
      <td>
        <span className="lcdots" title={s.sheets.map((x) => x.name).join(", ")}>
          <i data-on={s.sheets.length > 0 ? "yes" : "no"} />
          <i data-on={s.sheets.length > 1 ? "yes" : "no"} />
        </span>{" "}
        <span className="hint">{s.sheets.map((x) => x.name.split(" ")[0]).join(", ")}</span>
      </td>
      <td>
        <button type="button" className="btn btn--inverse" onClick={onOpen}>
          {s.mine ? L.sheet.mine : s.sheets.length >= 2 ? L.sheet.view : L.sheet.new}
        </button>
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ sheet */

function Sheet({
  lang,
  roomId,
  seat,
  onClose,
  onChanged,
}: {
  lang: Lang;
  roomId: number;
  seat: GradeSeat | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const L = LC[lang].grade;
  const seatId = seat?.seatId ?? 0;
  const view = usePoll<RubricView | null>(
    async () => {
      const r = await recGet<RubricView & { ok: true }>("lc-rubric", { seat: String(seatId) });
      if (!isFail(r)) return r;
      if (r.kode === "offline" || r.status >= 500) throw new Error(String(r.status || 408));
      return null;
    },
    300_000,
    !!seat,
    ["reclive"],
    300,
    seatId,
  );
  const gw = useLcGateway({ enabled: !!seat, role: "grader", roomId, watch: seatId });
  useEffect(() => {
    if (gw.status === "live") gw.send({ t: "history", s: seatId, n: 300 });
  }, [gw.status, seatId]);
  const rv = view.data;
  const [values, setValues] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(0);

  // My own sheet fills the form once, when it first arrives
  useEffect(() => {
    if (!rv || loaded === seatId) return;
    setLoaded(seatId);
    setValues(rv.mine?.values ?? {});
    setNote(rv.mine?.note ?? "");
  }, [rv, loaded, seatId]);

  const rubric = rv
    ? { id: 0, stage: "tes_tulis" as const, kind: "livecode" as const, rows: rv.rows }
    : null;
  const complete = !!rv && rv.rows.every((r) => Number.isInteger(values[r.key]));
  const score = useMemo(() => {
    if (!rubric || !complete) return null;
    const a = { grader: "a", at: 1, values };
    return livecodeScore(rubric, [a, { ...a, grader: "b", at: 2 }]);
  }, [rubric, complete, values]);

  const send = useCallback(async () => {
    if (!rv) return;
    setBusy(true);
    const r = await recPost<{ ok: true }>("lc-grade", { seatId, values, note });
    setBusy(false);
    if (isFail(r)) {
      return toast(
        (r.kode as string) === "sudah_dua"
          ? L.err.full
          : (r.kode as string) === "belum_dibuka"
            ? L.err.closed
            : L.err.fail,
        "danger",
      );
    }
    toast(rv.mine ? L.savedAgain : L.saved);
    view.refresh();
    onChanged();
  }, [rv, seatId, values, note, view, onChanged, L]);

  const withdraw = useCallback(async () => {
    setBusy(true);
    const r = await recPost<{ ok: true }>("lc-grade-withdraw", { seatId });
    setBusy(false);
    if (isFail(r)) return toast(L.err.fail, "danger");
    toast(L.withdrawn);
    setValues({});
    setNote("");
    view.refresh();
    onChanged();
  }, [seatId, view, onChanged, L]);

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={L.sheetTitle(seat?.no ?? 0, seat?.nama ?? "")}
      storeKey="rec-lc-sheet"
      minWidth={760}
      closeLabel={L.close}
      resizeLabel={L.resize}
    >
      {!rv ? (
        <span className="skeleton" style={{ height: 200 }} />
      ) : (
        <div className="r3sheet">
          <div className="stack" style={{ gap: 12, minWidth: 0 }}>
            {rv.topic && (
              <div className="stack" style={{ gap: 6 }}>
                <b>{rv.topic.title}</b>
                <Md src={rv.topic.brief} />
                {rv.topic.hints && (
                  <div className="stack" style={{ gap: 4 }}>
                    <span className="hint">{L.hints}</span>
                    <Md src={rv.topic.hints} />
                  </div>
                )}
              </div>
            )}
            <div className="stack" style={{ gap: 6 }}>
              <span className="hint">{L.traffic}</span>
              <TrafficList
                lines={gw.lines.filter((l) => l.s === seatId)}
                lang={lang}
                empty={L.trafficEmpty}
              />
            </div>
          </div>

          <div className="stack" style={{ gap: 12, minWidth: 0 }}>
            {!rv.open && <p className="hint">{L.notOpen}</p>}
            <div className="r3sheet__rows">
              {rv.rows.map((r) => (
                <div key={r.key} className="r3row">
                  <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                    <b>{r.label}</b>
                    <span className="hint num">
                      {Number.isInteger(values[r.key])
                        ? `${values[r.key]} / ${r.max}`
                        : `- / ${r.max}`}
                    </span>
                  </div>
                  <div
                    className="r3row__steps"
                    role="radiogroup"
                    aria-label={r.label}
                    style={{ gridTemplateColumns: `repeat(${r.max + 1}, minmax(0, 1fr))` }}
                  >
                    {Array.from({ length: r.max + 1 }, (_, v) => (
                      <button
                        key={v}
                        type="button"
                        role="radio"
                        aria-checked={values[r.key] === v}
                        className="r3row__step"
                        disabled={!rv.open}
                        onClick={() => setValues((x) => ({ ...x, [r.key]: v }))}
                      >
                        {r.max === 4 ? L.levels[v] : v}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <label className="stack" style={{ gap: 4 }}>
              <span className="hint">{L.note}</span>
              <textarea
                className="field__textarea"
                rows={3}
                maxLength={1000}
                value={note}
                disabled={!rv.open}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <div
              className="row"
              style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}
            >
              <div className="stack" style={{ gap: 0 }}>
                <span className="hint">{L.score}</span>
                <span className="r3score num">{score === null ? "-" : `${score} / 1000`}</span>
              </div>
              <div className="row" style={{ gap: 8 }}>
                {rv.mine && (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={busy || !rv.open}
                    onClick={() => void withdraw()}
                  >
                    {L.withdraw}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={busy || !complete || !rv.open}
                  onClick={() => void send()}
                >
                  {rv.mine ? L.saveAgain : L.send}
                </button>
              </div>
            </div>
            <div className="stack" style={{ gap: 4 }}>
              <span className="hint">{L.others}</span>
              {rv.others.length === 0 ? (
                <span className="hint">{L.noOthers}</span>
              ) : (
                <ul className="stack" style={{ gap: 2, margin: 0, padding: 0, listStyle: "none" }}>
                  {rv.others.map((o, i) => (
                    <li key={i} className="hint">
                      {L.sheetBy(o.name, clock(o.at).slice(0, 5))}
                    </li>
                  ))}
                </ul>
              )}
              <span className="hint">{L.hiddenNote}</span>
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}
