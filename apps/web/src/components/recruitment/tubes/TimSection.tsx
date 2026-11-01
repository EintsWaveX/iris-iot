/**
 * Tubes, Tim dan Malam: every team and who is in it, the CaAs still without a
 * team, the team lock, and the lab evenings with their seats and attendance.
 * Panitia with the Plotting right edit teams and evenings; attendance keepers
 * tick a member present by hand (the QR is the normal way, on the evening
 * the team picked). Everything is live on the `rectubes` topic.
 */
import { useState } from "react";
import {
  ClockCountdownIcon,
  CrownSimpleIcon,
  PencilSimpleIcon,
  QrCodeIcon,
  TrashIcon,
  UserPlusIcon,
} from "@phosphor-icons/react";
import Dialog from "../../ui/Dialog";
import IconButton from "../../ui/IconButton";
import Pill from "../../ui/Pill";
import { isFail, recPost } from "../../../lib/recruitment/client";
import type {
  TubesBoardCandidate,
  TubesBoardSession,
  TubesBoardTeam,
} from "../../../lib/recruitment/tubes-api";
import { tgl } from "../shared";
import { dariLokal, toast, wibDate, wibTime, type PanelCtx } from "./panelShared";

/* ------------------------------------------------------------ small dialogs */

function Ask({
  c,
  title,
  body,
  go,
  danger,
  run,
  onClose,
}: {
  c: PanelCtx;
  title: string;
  body: string;
  go: string;
  danger?: boolean;
  run: () => Promise<unknown>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={body}
      lang={c.lang}
      size="sm"
      blocking
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            <span className="btn__label">{c.w.cancel}</span>
          </button>
          <button
            type="button"
            className={`btn btn--${danger ? "danger" : "primary"}`}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await run();
              setBusy(false);
              onClose();
            }}
          >
            <span className="btn__label">{go}</span>
          </button>
        </>
      }
    />
  );
}

function NameDialog({
  c,
  team,
  onClose,
}: {
  c: PanelCtx;
  team: TubesBoardTeam;
  onClose: () => void;
}) {
  const [v, setV] = useState(team.name);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={c.w.renameTeam}
      lang={c.lang}
      size="sm"
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            <span className="btn__label">{c.w.cancel}</span>
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() =>
              void c
                .post("tubes-team-admin", { op: "rename", teamId: team.id, name: v })
                .then((ok) => ok && onClose())
            }
          >
            <span className="btn__label">{c.w.save}</span>
          </button>
        </>
      }
    >
      <input
        className="field__input"
        value={v}
        maxLength={40}
        onChange={(e) => setV(e.target.value)}
      />
    </Dialog>
  );
}

/** Pick a CaAs without a team to put into `team`. */
function AddMember({
  c,
  team,
  onClose,
}: {
  c: PanelCtx;
  team: TubesBoardTeam;
  onClose: () => void;
}) {
  const free = c.b.candidates.filter((x) => x.status !== "joined");
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${c.w.addMember} · ${team.name}`}
      lang={c.lang}
      size="lg"
      actions={
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          <span className="btn__label">{c.w.close}</span>
        </button>
      }
    >
      {free.length === 0 ? (
        <p className="hint">{c.w.unteamed(0)}</p>
      ) : (
        <div className="tp-list">
          {free.map((x) => (
            <button
              key={x.id}
              type="button"
              className="tp-pick"
              disabled={c.busy}
              onClick={() =>
                void c
                  .post("tubes-team-admin", { op: "add", teamId: team.id, candidateId: x.id })
                  .then((ok) => ok && onClose())
              }
            >
              <span className="stack" style={{ gap: 0 }}>
                <b>{x.nama}</b>
                <span className="hint num">
                  {x.nim} · {x.kelas}
                </span>
              </span>
              <UserPlusIcon size={18} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}

/** Pick an evening for a team (Panitia moves it past the CaAs's own cutoff). */
function MoveDialog({
  c,
  team,
  onClose,
}: {
  c: PanelCtx;
  team: TubesBoardTeam;
  onClose: () => void;
}) {
  const { w, b, lang } = c;
  const [ask, setAsk] = useState<TubesBoardSession | null>(null);
  const go = async (s: TubesBoardSession | null, force = false) => {
    const r = await recPost<{ ok: true }>("tubes-session-set", {
      teamId: team.id,
      sessionId: s?.id ?? null,
      force,
    });
    if (isFail(r)) {
      if (r.kode === "penuh" && s) return setAsk(s);
      return toast(c.say(r.kode), "danger");
    }
    onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${w.move} · ${team.name}`}
      lang={lang}
      size="lg"
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={() => void go(null)}>
            <span className="btn__label">{w.topicNone}</span>
          </button>
          <span className="grow" />
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            <span className="btn__label">{w.close}</span>
          </button>
        </>
      }
    >
      {b.sessions.length === 0 ? (
        <p className="hint">{w.noEvenings}</p>
      ) : (
        <div className="tp-list">
          {b.sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              className="tp-pick"
              role="radio"
              aria-checked={team.sessionId === s.id}
              onClick={() => void go(s)}
            >
              <span className="stack" style={{ gap: 0 }}>
                <b>{tgl(wibDate(s.startsAt), lang)}</b>
                <span className="hint num">
                  {wibTime(s.startsAt)} - {wibTime(s.endsAt)}
                </span>
              </span>
              <span className="hint num">{w.eveningSeats(s.used, s.capacity)}</span>
            </button>
          ))}
        </div>
      )}
      {ask && (
        <Ask
          c={c}
          title={w.force}
          body={w.moveFull}
          go={w.force}
          run={() => go(ask, true)}
          onClose={() => setAsk(null)}
        />
      )}
    </Dialog>
  );
}

function TickDialog({
  c,
  who,
  eventId,
  onClose,
}: {
  c: PanelCtx;
  who: { id: number; nama: string };
  eventId: number;
  onClose: () => void;
}) {
  const [why, setWhy] = useState("");
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${c.w.tick} · ${who.nama}`}
      lang={c.lang}
      size="sm"
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            <span className="btn__label">{c.w.cancel}</span>
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={c.busy}
            onClick={() =>
              void c
                .post("attend-manual", {
                  id: who.id,
                  event: eventId,
                  reason: why.trim() || undefined,
                })
                .then((ok) => ok && onClose())
            }
          >
            <span className="btn__label">{c.w.tick}</span>
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">{c.w.overrideNote}</span>
        <input
          className="field__input"
          value={why}
          maxLength={60}
          placeholder={c.w.overrideNoteHint}
          onChange={(e) => setWhy(e.target.value)}
        />
      </label>
    </Dialog>
  );
}

/* ------------------------------------------------------------ the evenings */

function EveningDialog({
  c,
  s,
  onClose,
}: {
  c: PanelCtx;
  s: TubesBoardSession | null;
  onClose: () => void;
}) {
  const { w } = c;
  const first = c.b.sessions[0];
  const base = s ?? first;
  const [date, setDate] = useState(base ? wibDate(base.startsAt) : "");
  const [from, setFrom] = useState(base ? wibTime(base.startsAt) : "18:30");
  const [to, setTo] = useState(base ? wibTime(base.endsAt) : "22:00");
  const [cap, setCap] = useState(String(s?.capacity ?? base?.capacity ?? 12));
  const [place, setPlace] = useState(s?.place ?? base?.place ?? "Lab IRIS");
  const go = async () => {
    const n = Number(cap);
    if (!date || !Number.isInteger(n) || n < 0) return toast(c.say("data_salah"), "danger");
    const ok = await c.post("tubes-session-save", {
      id: s?.id,
      startsAt: dariLokal(`${date}T${from}`),
      endsAt: dariLokal(`${date}T${to}`),
      capacity: n,
      place,
    });
    if (ok) onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={s ? w.eveningEdit : w.eveningAdd}
      lang={c.lang}
      size="md"
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            <span className="btn__label">{w.cancel}</span>
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={c.busy}
            onClick={() => void go()}
          >
            <span className="btn__label">{w.save}</span>
          </button>
        </>
      }
    >
      <div className="stack">
        <label className="field">
          <span className="field__label">{w.eveningDate}</span>
          <input
            className="field__input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <div className="row" style={{ gap: 12 }}>
          <label className="field" style={{ flex: 1 }}>
            <span className="field__label">{w.eveningFrom}</span>
            <input
              className="field__input"
              type="time"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span className="field__label">{w.eveningTo}</span>
            <input
              className="field__input"
              type="time"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
        <label className="field">
          <span className="field__label">{w.eveningCap}</span>
          <input
            className="field__input"
            type="number"
            min={0}
            max={500}
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            style={{ maxWidth: 140 }}
          />
        </label>
        <label className="field">
          <span className="field__label">{w.eveningPlace}</span>
          <input
            className="field__input"
            value={place}
            maxLength={60}
            onChange={(e) => setPlace(e.target.value)}
          />
        </label>
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------ one team */

function TeamCard({
  c,
  t,
  onName,
  onAdd,
  onMove,
  onDisband,
  onTick,
}: {
  c: PanelCtx;
  t: TubesBoardTeam;
  onName: () => void;
  onAdd: () => void;
  onMove: () => void;
  onDisband: () => void;
  onTick: (who: { id: number; nama: string }) => void;
}) {
  const { w, b, lang } = c;
  const can = b.rights.teams;
  const topic = b.topics.find((x) => x.id === t.topicId);
  const sess = b.sessions.find((x) => x.id === t.sessionId);
  const dayOk = () => !!sess && !!b.workEventId;
  return (
    <section className="panel tp-team">
      <div className="row row--between" style={{ gap: 8, alignItems: "flex-start" }}>
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <h3 className="h4" style={{ margin: 0, overflowWrap: "anywhere" }}>
            {t.name}
          </h3>
          <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <span className="tp-chip" data-t={t.problem ? "warn" : "ok"}>
              {w.size(t.size)}
              {t.problem ? ` · ${t.problem === "kurang" ? w.tooFew : w.tooMany}` : ""}
            </span>
            {t.table && (
              <span className="tp-chip">
                {b.tables.find((x) => x.slotId === t.table!.slotId)?.room}
              </span>
            )}
          </span>
        </div>
        {can && (
          <span className="row" style={{ gap: 2 }}>
            <IconButton sm icon={PencilSimpleIcon} label={w.renameTeam} onClick={onName} />
            <IconButton sm icon={UserPlusIcon} label={w.addMember} onClick={onAdd} />
            <IconButton sm kind="danger" icon={TrashIcon} label={w.disband} onClick={onDisband} />
          </span>
        )}
      </div>
      <ul className="tp-team__m">
        {t.members.map((m) => (
          <li key={m.candidateId}>
            <span className="tp-team__who">
              <b>
                {m.leader && <CrownSimpleIcon size={14} weight="fill" aria-hidden="true" />}
                {m.nama}
              </b>
              <span className="hint num">
                {m.nim}
                {m.status === "invited" ? " · " + c.all.caas.waiting : ""}
              </span>
            </span>
            <span className="tp-team__a">
              {sess &&
                m.status === "joined" &&
                (m.attended ? (
                  <span className="tp-chip" data-t="ok">
                    {w.ticked}
                  </span>
                ) : (
                  b.rights.attend &&
                  dayOk() && (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => onTick({ id: m.candidateId, nama: m.nama })}
                    >
                      <span className="btn__label">{w.tick}</span>
                    </button>
                  )
                ))}
              {can && !m.leader && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={c.busy}
                  onClick={() =>
                    void c.post("tubes-team-admin", {
                      op: "remove",
                      teamId: t.id,
                      candidateId: m.candidateId,
                    })
                  }
                >
                  <span className="btn__label">{w.removeMember}</span>
                </button>
              )}
              {can && !m.leader && m.status === "joined" && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={c.busy}
                  onClick={() =>
                    void c.post("tubes-team-admin", {
                      op: "leader",
                      teamId: t.id,
                      candidateId: m.candidateId,
                    })
                  }
                >
                  <span className="btn__label">{w.makeLeader}</span>
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <div className="stack stack--sm">
        <span className="hint">
          <ClockCountdownIcon size={14} aria-hidden="true" />{" "}
          {sess
            ? `${tgl(wibDate(sess.startsAt), lang)}, ${wibTime(sess.startsAt)}`
            : w.noEvenings.split(".")[0]}
        </span>
        <span className="hint">
          {w.topicSet}: {topic ? topic.title : w.topicNone}
        </span>
        {can && (
          <div>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onMove}>
              <span className="btn__label">{w.move}</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ the section */

export default function TimSection({ c }: { c: PanelCtx }) {
  const { w, b, lang } = c;
  const can = b.rights.teams;
  const [name, setName] = useState<TubesBoardTeam | null>(null);
  const [add, setAdd] = useState<TubesBoardTeam | null>(null);
  const [move, setMove] = useState<TubesBoardTeam | null>(null);
  const [off, setOff] = useState<TubesBoardTeam | null>(null);
  const [tick, setTick] = useState<{ id: number; nama: string } | null>(null);
  const [eve, setEve] = useState<TubesBoardSession | "new" | null>(null);
  const [delEve, setDelEve] = useState<TubesBoardSession | null>(null);
  const [auto, setAuto] = useState(false);
  const free: TubesBoardCandidate[] = b.candidates.filter((x) => x.status === "none");
  const lock = b.teamsLock;
  const lockNow = b.times.locked;

  return (
    <div className="stack">
      <section className="panel tp-ctl">
        <div className="tp-ctl__g">
          <div className="stack stack--sm">
            <span className="hint">{w.teams}</span>
            <b>
              {w.teamsOf(b.teams.length)} · {w.unteamed(free.length)}
            </b>
          </div>
          <div className="stack stack--sm">
            <span className="hint">{lockNow ? w.locked : w.open}</span>
            <div className="tp-seg" role="radiogroup" aria-label={w.locked}>
              {([null, "open", "closed"] as const).map((m) => (
                <button
                  key={String(m)}
                  type="button"
                  role="radio"
                  aria-checked={lock === m}
                  className="tp-seg__b"
                  disabled={!can || c.busy}
                  onClick={() => void c.post("tubes-team-lock", { mode: m })}
                >
                  {m === null ? w.lockAuto.split(":")[0] : m === "open" ? w.open : w.locked}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="tp-ctl__p">
          <span className="hint">
            {lock === null ? w.lockAuto : w.lockForced(lock === "open" ? w.open : w.locked)}
          </span>
          <span className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={!can || free.length === 0}
              onClick={() => setAuto(true)}
            >
              <span className="btn__label">{w.makeTeams}</span>
            </button>
          </span>
        </div>
      </section>

      {b.teams.length === 0 ? (
        <p className="hint">{w.noTeamYet}</p>
      ) : (
        <div className="tp-grid">
          {b.teams.map((t) => (
            <TeamCard
              key={t.id}
              c={c}
              t={t}
              onName={() => setName(t)}
              onAdd={() => setAdd(t)}
              onMove={() => setMove(t)}
              onDisband={() => setOff(t)}
              onTick={setTick}
            />
          ))}
        </div>
      )}

      {free.length > 0 && (
        <section className="panel stack">
          <div className="row row--between">
            <b>{w.unteamed(free.length)}</b>
          </div>
          <div className="tp-list">
            {free.map((x) => (
              <div key={x.id} className="tp-pick" role="group">
                <span className="stack" style={{ gap: 0 }}>
                  <b>{x.nama}</b>
                  <span className="hint num">
                    {x.nim} · {x.kelas}
                  </span>
                </span>
                {can && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={c.busy}
                    onClick={() =>
                      void c.post("tubes-team-admin", { op: "make", candidateId: x.id })
                    }
                  >
                    <span className="btn__label">{w.newTeam}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="stack">
        <div className="tp-bar">
          <h3 className="h4" style={{ margin: 0 }}>
            {w.evenings}
          </h3>
          <span className="row" style={{ gap: 8 }}>
            {b.workEventId && (
              <a className="btn btn--ghost btn--sm" href={`/recruitment/qr`}>
                <QrCodeIcon size={16} aria-hidden="true" />
                <span className="btn__label">{w.qrOpen}</span>
              </a>
            )}
            {b.sessions.length === 0 && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={!b.rights.sessions || c.busy}
                onClick={() => void c.post("tubes-session-seed", { capacity: 12 })}
              >
                <span className="btn__label">{w.eveningSeed}</span>
              </button>
            )}
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={!b.rights.sessions}
              onClick={() => setEve("new")}
            >
              <span className="btn__label">{w.eveningAdd}</span>
            </button>
          </span>
        </div>
        <span className="hint">{w.qrNote}</span>
        {b.sessions.length === 0 ? (
          <p className="hint">{w.noEvenings}</p>
        ) : (
          <div className="tp-wrap panel panel--flush">
            <table className="tp-table">
              <thead>
                <tr>
                  <th>{w.eveningDate}</th>
                  <th>{w.eveningPlace}</th>
                  <th>{w.eveningCap}</th>
                  <th>{w.teams}</th>
                  <th>{w.attend}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {b.sessions.map((s) => {
                  const on = b.teams.filter((t) => t.sessionId === s.id);
                  const people = on.flatMap((t) => t.members.filter((m) => m.status === "joined"));
                  const here = people.filter((m) => m.attended).length;
                  return (
                    <tr key={s.id}>
                      <td>
                        <b>{tgl(wibDate(s.startsAt), lang)}</b>
                        <div className="hint num">
                          {wibTime(s.startsAt)} - {wibTime(s.endsAt)}
                        </div>
                      </td>
                      <td>{s.place}</td>
                      <td className="num">
                        <span className="tp-chip" data-t={s.used > s.capacity ? "warn" : undefined}>
                          {w.eveningSeats(s.used, s.capacity)}
                        </span>
                      </td>
                      <td>
                        {on.length === 0 ? (
                          <span className="hint">{w.eveningNoTeam}</span>
                        ) : (
                          on.map((t) => t.name).join(", ")
                        )}
                      </td>
                      <td className="num">
                        {people.length ? w.attendHere(here, people.length) : "-"}
                      </td>
                      <td>
                        <span className="row" style={{ gap: 2 }}>
                          <IconButton
                            sm
                            icon={PencilSimpleIcon}
                            label={w.eveningEdit}
                            disabled={!b.rights.sessions}
                            onClick={() => setEve(s)}
                          />
                          <IconButton
                            sm
                            kind="danger"
                            icon={TrashIcon}
                            label={w.topicDelete}
                            disabled={!b.rights.sessions}
                            onClick={() => setDelEve(s)}
                          />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {name && <NameDialog c={c} team={name} onClose={() => setName(null)} />}
      {add && <AddMember c={c} team={add} onClose={() => setAdd(null)} />}
      {move && <MoveDialog c={c} team={move} onClose={() => setMove(null)} />}
      {tick && b.workEventId && (
        <TickDialog c={c} who={tick} eventId={b.workEventId} onClose={() => setTick(null)} />
      )}
      {eve && <EveningDialog c={c} s={eve === "new" ? null : eve} onClose={() => setEve(null)} />}
      {off && (
        <Ask
          c={c}
          title={`${w.disband} · ${off.name}`}
          body={w.disbandAsk}
          go={w.disband}
          danger
          run={() => c.post("tubes-team-admin", { op: "disband", teamId: off.id })}
          onClose={() => setOff(null)}
        />
      )}
      {delEve && (
        <Ask
          c={c}
          title={tgl(wibDate(delEve.startsAt), lang)}
          body={w.topicDelete}
          go={w.topicDelete}
          danger
          run={() => c.post("tubes-session-delete", { id: delEve.id })}
          onClose={() => setDelEve(null)}
        />
      )}
      {auto && (
        <Ask
          c={c}
          title={w.makeTeams}
          body={w.makeTeamsBody(free.length, b.setting.teamMin, b.setting.teamMax)}
          go={w.makeTeams}
          run={() => c.post("tubes-team-auto", {})}
          onClose={() => setAuto(false)}
        />
      )}
    </div>
  );
}
