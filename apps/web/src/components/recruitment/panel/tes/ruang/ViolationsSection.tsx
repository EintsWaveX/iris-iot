/**
 * A seat's violations in the drawer of the room console (9 Nov 2026): the points, warning level and
 * suggested cut per part, the timeline with a way to excuse one, the decision on each cut (the board
 * right), a message to the seat and holding it (the Master). The numbers come from the API
 * (ConsoleSeat.violations); nothing here counts. Every write asks the API and then re-reads the room.
 */
import { useState } from "react";
import Dialog from "../../../../ui/Dialog";
import { Stepper } from "../../../../ui/Controls";
import type { Lang } from "../../../../../lib/kelas";
import { isFail, recPost } from "../../../../../lib/recruitment/client";
import { PART_KEYS, type PartKey } from "../../../../../lib/recruitment/exam-types";
import { tanggalWib } from "../../../../../lib/recruitment/gates";
import type { ConsoleSeat, ConsoleView } from "../../../../../lib/recruitment/room-api";
import { RG } from "./ruangStrings";

const toast = (m: string, tone: "ok" | "warn" | "danger" = "ok") => window.Toast?.show(m, tone);
const hm = (ms: number) => tanggalWib(new Date(ms)).jam;
const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export default function ViolationsSection({
  lang,
  s,
  v,
  jalan,
}: {
  lang: Lang;
  s: ConsoleSeat;
  v: ConsoleView;
  jalan: (aksi: string, body: Record<string, unknown>) => Promise<unknown>;
}) {
  const T = RG[lang];
  const t = T.con.vio;
  const kinds = T.con.drawer.kinds;
  const seatId = s.seatId;
  const [forgive, setForgive] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [text, setText] = useState("");
  const [custom, setCustom] = useState<PartKey | null>(null);
  const [pct, setPct] = useState(10);
  const [note, setNote] = useState("");
  const parts = PART_KEYS.filter(
    (p) => s.violations[p] || s.kejadian.some((k) => k.part === p) || s.penalties[p],
  );

  async function post(aksi: string, body: Record<string, unknown>, ok: string) {
    const r = await recPost<{ ok: true; creditedMs?: number }>(aksi, { id: v.room.id, ...body });
    if (isFail(r)) toast(T.con.fail, "danger");
    else toast(ok);
    await jalan("room", {});
    return r;
  }
  async function excuse(strikeId: string, on: boolean) {
    if (seatId === null) return;
    await post(
      "room-strike",
      { seatId, strikeId, excuse: on, ...(on ? { reason: reason.trim() } : {}) },
      on ? t.forgiven : t.unforgiven,
    );
    setForgive(null);
    setReason("");
  }
  async function decide(part: PartKey, body: Record<string, unknown>) {
    if (seatId === null) return;
    await post("room-penalty", { seatId, part, ...body }, t.decision.saved);
    setCustom(null);
    setNote("");
  }
  async function warn(msg: string) {
    if (seatId === null || !msg.trim()) return;
    await post("room-warn", { seatId, text: msg.trim() }, t.warn.sent);
    setText("");
  }
  async function hold(on: boolean) {
    if (seatId === null) return;
    const r = await post("room-hold", { seatId, hold: on }, on ? t.hold.held : t.hold.released(0));
    if (!on && !isFail(r) && r.creditedMs)
      toast(t.hold.released(Math.round(r.creditedMs / 60_000)));
  }

  const canWarn = seatId !== null && s.checkedIn;
  return (
    <>
      <section className="stack stack--sm">
        <h3 className="label-caps">{t.title}</h3>
        {parts.length === 0 ? <p className="empty-note empty-note--sm">{t.none}</p> : null}
        {parts.map((p) => {
          const x = s.violations[p];
          const d = s.penalties[p];
          const cut = x?.cut ?? 0;
          const open = cut > 0 && !d;
          return (
            <div
              key={p}
              className="r3vio"
              data-level={x?.level ?? 0}
              data-open={open ? "yes" : "no"}
            >
              <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                <b>{T.part[p].l}</b>
                <span className="num">
                  {t.points(x?.points ?? 0)} · {t.levels[x?.level ?? 0]}
                </span>
              </div>
              <span className="hint">{cut > 0 ? t.suggested(cut) : t.noCut}</span>
              {s.overflow[p] ? (
                <span className="hint">{t.overflow(s.overflow[p] ?? 0)}</span>
              ) : null}
              {(cut > 0 || d) && (
                <div className="stack stack--sm">
                  <span>
                    <b>{t.decision.title}: </b>
                    {d
                      ? d.state === "applied"
                        ? t.decision.applied(d.pct)
                        : t.decision.waived
                      : t.decision.pending}
                    {d ? <span className="hint"> · {t.decision.by(d.by)}</span> : null}
                    {d?.note ? <span className="hint"> · {d.note}</span> : null}
                  </span>
                  {v.me.canPenalty ? (
                    <div className="rec-chips">
                      {cut > 0 && (
                        <button
                          type="button"
                          className="r3chip"
                          onClick={() => void decide(p, { state: "applied", pct: cut })}
                        >
                          {t.decision.apply(cut)}
                        </button>
                      )}
                      <button
                        type="button"
                        className="r3chip"
                        onClick={() => (setCustom(p), setPct(d?.pct || cut || 10))}
                      >
                        {t.decision.custom}
                      </button>
                      <button
                        type="button"
                        className="r3chip"
                        onClick={() => void decide(p, { state: "waived" })}
                      >
                        {t.decision.waive}
                      </button>
                      {d && (
                        <button
                          type="button"
                          className="r3chip"
                          onClick={() => void decide(p, { clear: true })}
                        >
                          {t.decision.undo}
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="hint">{t.decision.onlyBoard}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="stack stack--sm">
        <h3 className="label-caps">{t.timeline}</h3>
        {s.kejadian.length ? (
          <ol className="r3tline">
            {s.kejadian.map((x) => (
              <li
                key={x.id}
                data-open={x.backAt === null ? "yes" : "no"}
                data-excused={x.excused ? "yes" : "no"}
              >
                <span className="num hint">{hm(x.at)}</span>
                <span className="stack" style={{ gap: 0 }}>
                  <b>{x.kinds.map((q) => kinds[q] ?? q).join(", ")}</b>
                  <span className="hint">
                    {T.part[x.part].s} ·{" "}
                    {x.backAt === null ? t.stillAway : t.away(mmss(x.backAt - x.at))}
                  </span>
                  {x.excused ? (
                    <span className="hint">{t.excused(x.excused.by, x.excused.reason)}</span>
                  ) : null}
                  <span className="row" style={{ gap: 8 }}>
                    {x.excused ? (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => void excuse(x.id, false)}
                      >
                        {t.unforgive}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => setForgive(x.id)}
                      >
                        {t.forgive}
                      </button>
                    )}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty-note empty-note--sm">{t.none}</p>
        )}
      </section>

      {canWarn && (
        <section className="stack stack--sm">
          <h3 className="label-caps">{t.warn.title}</h3>
          <div className="rec-chips">
            {t.warn.presets.map((m) => (
              <button key={m} type="button" className="r3chip" onClick={() => void warn(m)}>
                {m}
              </button>
            ))}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <input
              className="field__input"
              style={{ flex: 1, minWidth: 0 }}
              maxLength={300}
              placeholder={t.warn.ph}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={!text.trim()}
              onClick={() => void warn(text)}
            >
              {t.warn.send}
            </button>
          </div>
          {s.warnings.length > 0 && (
            <ul className="stack stack--sm" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              <li className="hint">{t.warn.history}</li>
              {s.warnings.map((w) => (
                <li key={w.id} className="hint">
                  {hm(w.at)} · {w.source === "auto" ? t.warn.auto(w.level) : t.warn.staff(w.by)} ·{" "}
                  {w.seen ? t.warn.seen : t.warn.unseen}
                  {w.source === "staff" ? ` · ${w.text}` : ""}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {canWarn && (
        <section className="stack stack--sm">
          <h3 className="label-caps">{t.hold.title}</h3>
          <span className="hint">{t.hold.body}</span>
          {s.heldAt !== null && <b>{t.hold.since(hm(s.heldAt))}</b>}
          {v.me.isMaster ? (
            <div className="row">
              <button
                type="button"
                className="btn btn--inverse btn--sm"
                onClick={() => void hold(s.heldAt === null)}
              >
                {s.heldAt === null ? t.hold.hold : t.hold.release}
              </button>
            </div>
          ) : (
            <span className="hint">{t.hold.onlyMaster}</span>
          )}
        </section>
      )}

      <Dialog
        open={forgive !== null}
        onOpenChange={(o) => !o && setForgive(null)}
        size="sm"
        lang={lang}
        title={t.forgiveTitle}
        description={t.forgiveBody}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setForgive(null)}>
              {t.cancel}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={reason.trim().length < 3}
              onClick={() => forgive && void excuse(forgive, true)}
            >
              {t.forgive}
            </button>
          </>
        }
      >
        <input
          className="field__input"
          maxLength={300}
          placeholder={t.reasonPh}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Dialog>

      <Dialog
        open={custom !== null}
        onOpenChange={(o) => !o && setCustom(null)}
        size="sm"
        lang={lang}
        title={t.decision.custom}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setCustom(null)}>
              {t.cancel}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => custom && void decide(custom, { state: "applied", pct, note })}
            >
              {t.decision.save}
            </button>
          </>
        }
      >
        <div className="stack stack--sm">
          <Stepper
            value={pct}
            min={0}
            max={100}
            step={5}
            label={t.decision.pctLabel}
            fmt={(n) => `${n}%`}
            lessLabel={t.decision.less}
            moreLabel={t.decision.more}
            onChange={setPct}
          />
          <input
            className="field__input"
            maxLength={300}
            placeholder={t.decision.notePh}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </Dialog>
    </>
  );
}
