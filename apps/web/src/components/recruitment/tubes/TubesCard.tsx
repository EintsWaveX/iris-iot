/**
 * Tubes on the CaAs's own page (R5, mockup N7.R5.CaasTubes): the team, the work
 * evening, the topic, the submission and the Presentasi turn, as five cards
 * under one head that says what to do next. The server decides every state
 * (src/lib/recruitment/tubes.ts); this only shows it and sends the answers.
 * Everything refetches live on the `rectubes` topic.
 */
import { useRef, useState, type ReactNode } from "react";
import {
  ArrowSquareOutIcon,
  CheckCircleIcon,
  CircleIcon,
  ClockCountdownIcon,
  CrownSimpleIcon,
  FileArchiveIcon,
  FilePdfIcon,
  LinkIcon,
  PlayIcon,
  UserPlusIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import Dialog from "../../ui/Dialog";
import Pill from "../../ui/Pill";
import type { Lang } from "../../../lib/kelas";
import { isFail, recPost } from "../../../lib/recruitment/client";
import { tanggalWib } from "../../../lib/recruitment/gates";
import { bacaFileTubes, kirimFileTubes, useTubes } from "../../../lib/recruitment/tubes-client";
import type {
  TubesFileView,
  TubesMine,
  TubesSessionView,
} from "../../../lib/recruitment/tubes-api";
import type { TubesPart } from "../../../lib/recruitment/tubes";
import { Countdown, tgl } from "../shared";
import { TUBES } from "./tubesStrings";
import "../recruitment-tubes.css";

const wib = (iso: string) => tanggalWib(new Date(iso));
const kapan = (iso: string, lang: Lang) => {
  const w = wib(iso);
  return `${tgl(w.tanggal, lang)}, ${w.jam}`;
};
const toast = (msg: string, tone?: "danger" | "warn") => window.Toast?.show(msg, tone);

type Say = (kode: unknown) => string;

/* ------------------------------------------------------------ small pieces */

function Step({ n, label, done }: { n: number; label: string; done: boolean }) {
  return (
    <li className="tb-step" data-done={done ? "yes" : undefined}>
      <span className="tb-step__dot" aria-hidden="true">
        {done ? <CheckCircleIcon size={18} weight="fill" /> : <CircleIcon size={18} />}
      </span>
      <span className="tb-step__n num">{n}</span>
      <span>{label}</span>
    </li>
  );
}

function Section({
  icon,
  title,
  aside,
  children,
  tone,
}: {
  icon: ReactNode;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  tone?: "ok";
}) {
  return (
    <section className="panel tb-card" data-tone={tone}>
      <header className="tb-card__head">
        <span className="tb-card__ic" aria-hidden="true">
          {icon}
        </span>
        <h3 className="tb-card__t">{title}</h3>
        {aside && <span className="tb-card__aside">{aside}</span>}
      </header>
      <div className="tb-card__body">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------ team */

function InviteDialog({
  lang,
  say,
  onClose,
  onDone,
}: {
  lang: Lang;
  say: Say;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = TUBES[lang].caas;
  const [nim, setNim] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    if (!nim.trim()) return setErr(t.nimHint);
    setBusy(true);
    const r = await recPost<{ ok: true }>("tubes-invite", { nim });
    setBusy(false);
    if (isFail(r)) return setErr(say(r.kode));
    toast(t.send);
    onDone();
    onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t.inviteTitle}
      description={t.inviteBody}
      lang={lang}
      size="sm"
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            <span className="btn__label">{t.cancel}</span>
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy}
            onClick={() => void go()}
          >
            <span className="btn__label">{t.send}</span>
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">{t.nim}</span>
        <input
          className="field__input"
          value={nim}
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          placeholder={t.nimHint}
          maxLength={20}
          onChange={(e) => {
            setNim(e.target.value);
            setErr(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && void go()}
          aria-invalid={err ? true : undefined}
        />
        {err && (
          <span className="field__error" role="alert">
            {err}
          </span>
        )}
      </label>
    </Dialog>
  );
}

function RenameDialog({
  lang,
  say,
  name,
  onClose,
  onDone,
}: {
  lang: Lang;
  say: Say;
  name: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = TUBES[lang].caas;
  const [v, setV] = useState(name);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    const r = await recPost<{ ok: true }>("tubes-team-name", { name: v });
    if (isFail(r)) return setErr(say(r.kode));
    onDone();
    onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t.renameTitle}
      lang={lang}
      size="sm"
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            <span className="btn__label">{t.cancel}</span>
          </button>
          <button type="button" className="btn btn--primary" onClick={() => void go()}>
            <span className="btn__label">{t.save}</span>
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">{t.teamName}</span>
        <input
          className="field__input"
          value={v}
          maxLength={40}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void go()}
        />
        {err && (
          <span className="field__error" role="alert">
            {err}
          </span>
        )}
      </label>
    </Dialog>
  );
}

function TeamCard({
  lang,
  d,
  say,
  refresh,
}: {
  lang: Lang;
  d: TubesMine;
  say: Say;
  refresh: () => void;
}) {
  const t = TUBES[lang].caas;
  const [dlg, setDlg] = useState<null | "invite" | "rename" | "leave" | "disband">(null);
  const [busy, setBusy] = useState(false);
  const team = d.team;
  const min = d.setting.teamMin;
  const max = d.setting.teamMax;

  const post = async (aksi: string, body: unknown = {}, ok?: string) => {
    setBusy(true);
    const r = await recPost<{ ok: true }>(aksi, body);
    setBusy(false);
    if (isFail(r)) toast(say(r.kode), "danger");
    else if (ok) toast(ok);
    refresh();
    return !isFail(r);
  };

  const lockNote = d.times.locked ? (
    <p className="rec-note" data-t="warn">
      <b>{t.locked}</b>
      <span>{d.times.lockAt ? t.lockedAt(kapan(d.times.lockAt, lang)) : ""}</span>
    </p>
  ) : d.times.lockAt ? (
    <p className="hint">{t.lockSoon(kapan(d.times.lockAt, lang))}</p>
  ) : null;

  if (!team)
    return (
      <Section icon={<UsersThreeIcon size={22} />} title={t.step.team}>
        <div className="stack">
          <div className="stack stack--sm">
            <b>{t.noTeam}</b>
            <span className="hint">{t.noTeamBody(min, max)}</span>
          </div>
          {d.invites.length > 0 && (
            <div className="stack stack--sm">
              <span className="eyebrow">{t.invitesTitle}</span>
              {d.invites.map((v) => (
                <div className="tb-row" key={v.teamId}>
                  <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                    <b>{v.teamName}</b>
                    <span className="hint">{t.inviteFrom(v.leaderNama, v.size, v.max)}</span>
                  </span>
                  <span className="row" style={{ gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={busy}
                      onClick={() => void post("tubes-answer", { teamId: v.teamId, accept: false })}
                    >
                      <span className="btn__label">{t.decline}</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      disabled={busy || d.times.locked}
                      onClick={() => void post("tubes-answer", { teamId: v.teamId, accept: true })}
                    >
                      <span className="btn__label">{t.accept}</span>
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
          {lockNote}
          <div>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || d.times.locked}
              onClick={() => void post("tubes-team-make")}
            >
              <span className="btn__label">{t.make}</span>
            </button>
          </div>
        </div>
      </Section>
    );

  return (
    <Section
      icon={<UsersThreeIcon size={22} />}
      title={team.name}
      aside={<Pill tone={team.problem ? "warn" : "ok"}>{t.members(team.size, min, max)}</Pill>}
    >
      <div className="stack">
        <ul className="tb-members">
          {team.members.map((m) => (
            <li
              className="tb-member"
              key={m.candidateId}
              data-wait={m.status === "invited" ? "yes" : undefined}
            >
              <span className="tb-member__av" aria-hidden="true">
                {m.leader ? <CrownSimpleIcon size={16} weight="fill" /> : m.nama.slice(0, 1)}
              </span>
              <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                <b>
                  {m.nama}
                  {m.me ? ` (${t.you})` : ""}
                </b>
                <span className="hint num">
                  {m.nim} · {m.kelas}
                </span>
              </span>
              <span className="tb-member__s">
                {m.leader ? (
                  <Pill>{t.leader}</Pill>
                ) : m.status === "invited" ? (
                  <Pill tone="warn">{t.waiting}</Pill>
                ) : null}
                {team.leader && !m.me && !d.times.locked && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={busy}
                    onClick={() =>
                      void post(m.status === "invited" ? "tubes-invite-cancel" : "tubes-kick", {
                        candidateId: m.candidateId,
                      })
                    }
                  >
                    <span className="btn__label">
                      {m.status === "invited" ? t.cancelInvite : t.kick}
                    </span>
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
        {team.problem === "kurang" && <p className="hint tb-warn">{t.tooFew(min)}</p>}
        {team.problem === "lebih" && <p className="hint tb-warn">{t.tooMany(max)}</p>}
        {lockNote}
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {team.leader && !d.times.locked && team.members.length < max && (
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => setDlg("invite")}
            >
              <UserPlusIcon size={16} aria-hidden="true" />
              <span className="btn__label">{t.invite}</span>
            </button>
          )}
          {team.leader && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setDlg("rename")}
            >
              <span className="btn__label">{t.rename}</span>
            </button>
          )}
          {!team.leader && !d.times.locked && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setDlg("leave")}
            >
              <span className="btn__label">{t.leave}</span>
            </button>
          )}
          {team.leader && !d.times.locked && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setDlg("disband")}
            >
              <span className="btn__label">{t.disband}</span>
            </button>
          )}
        </div>
      </div>
      {dlg === "invite" && (
        <InviteDialog lang={lang} say={say} onClose={() => setDlg(null)} onDone={refresh} />
      )}
      {dlg === "rename" && (
        <RenameDialog
          lang={lang}
          say={say}
          name={team.name}
          onClose={() => setDlg(null)}
          onDone={refresh}
        />
      )}
      {dlg === "leave" && (
        <ConfirmAsk
          lang={lang}
          title={t.leave}
          body={t.leaveAsk}
          go={t.leave}
          onClose={() => setDlg(null)}
          run={() => post("tubes-leave")}
        />
      )}
      {dlg === "disband" && (
        <ConfirmAsk
          lang={lang}
          title={t.disband}
          body={t.disbandAsk}
          go={t.disband}
          danger
          onClose={() => setDlg(null)}
          run={() => post("tubes-disband")}
        />
      )}
    </Section>
  );
}

/** A small confirm with its own run, so the dialog closes after the answer. */
function ConfirmAsk({
  lang,
  title,
  body,
  go,
  danger,
  run,
  onClose,
}: {
  lang: Lang;
  title: string;
  body: string;
  go: string;
  danger?: boolean;
  run: () => Promise<unknown>;
  onClose: () => void;
}) {
  const t = TUBES[lang].caas;
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={body}
      lang={lang}
      size="sm"
      blocking
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            <span className="btn__label">{t.cancel}</span>
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

/* ------------------------------------------------------------ the work evening */

function EveningRow({
  lang,
  s,
  picked,
  onPick,
}: {
  lang: Lang;
  s: TubesSessionView;
  picked: boolean;
  onPick: () => void;
}) {
  const t = TUBES[lang].caas;
  const a = wib(s.startsAt);
  const b = wib(s.endsAt);
  const blocked = s.problem !== null && !s.mine;
  return (
    <button
      type="button"
      className="tb-eve"
      role="radio"
      aria-checked={picked}
      data-mine={s.mine ? "yes" : undefined}
      disabled={blocked}
      onClick={onPick}
    >
      <span className="stack" style={{ gap: 2, textAlign: "left" }}>
        <b>{tgl(a.tanggal, lang)}</b>
        <span className="hint num">
          {a.jam} - {b.jam} · {s.place}
        </span>
      </span>
      <span className="stack" style={{ gap: 4, alignItems: "flex-end" }}>
        <span className="tb-pips" aria-hidden="true">
          {Array.from({ length: Math.min(s.capacity, 40) }, (_, i) => (
            <i key={i} data-on={i < s.used ? "yes" : undefined} />
          ))}
        </span>
        <span className="hint">
          {s.mine
            ? t.eveningMine
            : s.problem === "penuh"
              ? t.eveningFull
              : s.problem === "lewat"
                ? t.eveningPast
                : t.eveningSeats(s.left, s.capacity)}
        </span>
      </span>
    </button>
  );
}

function EveningDialog({
  lang,
  d,
  say,
  onClose,
  onDone,
}: {
  lang: Lang;
  d: TubesMine;
  say: Say;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = TUBES[lang].caas;
  const [pick, setPick] = useState<number | null>(d.sessions.find((x) => x.mine)?.id ?? null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (pick === null) return;
    setBusy(true);
    const r = await recPost<{ ok: true }>("tubes-session-pick", { sessionId: pick });
    setBusy(false);
    if (isFail(r)) toast(say(r.kode), "danger");
    else toast(t.confirm);
    onDone();
    if (!isFail(r)) onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t.eveningTitle}
      description={`${t.eveningLede} ${t.eveningCutoff}`}
      lang={lang}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            <span className="btn__label">{t.cancel}</span>
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || pick === null || pick === d.sessions.find((x) => x.mine)?.id}
            onClick={() => void go()}
          >
            <span className="btn__label">{t.confirm}</span>
          </button>
        </>
      }
    >
      {d.sessions.length === 0 ? (
        <p className="empty-note">{t.noEvenings}</p>
      ) : (
        <div className="tb-eves" role="radiogroup" aria-label={t.eveningTitle}>
          {d.sessions.map((s) => (
            <EveningRow
              key={s.id}
              lang={lang}
              s={s}
              picked={pick === s.id}
              onPick={() => setPick(s.id)}
            />
          ))}
        </div>
      )}
    </Dialog>
  );
}

function EveningCard({
  lang,
  d,
  say,
  refresh,
}: {
  lang: Lang;
  d: TubesMine;
  say: Say;
  refresh: () => void;
}) {
  const t = TUBES[lang].caas;
  const [open, setOpen] = useState(false);
  const team = d.team;
  const mine = d.sessions.find((x) => x.mine) ?? null;
  const canPick = !!team?.leader && team.problem === null;
  return (
    <Section
      icon={<ClockCountdownIcon size={22} />}
      title={t.step.evening}
      tone={mine ? "ok" : undefined}
      aside={mine && d.attended ? <Pill tone="ok">{t.eveningCame}</Pill> : undefined}
    >
      {!team ? (
        <p className="hint">{t.eveningNeedTeam}</p>
      ) : mine ? (
        <div className="stack">
          <div className="tb-big">
            <b>{tgl(wib(mine.startsAt).tanggal, lang)}</b>
            <span className="num">
              {wib(mine.startsAt).jam} - {wib(mine.endsAt).jam} · {mine.place}
            </span>
          </div>
          <span className="hint">{d.attended ? t.eveningCame : t.eveningQr}</span>
          {team.leader ? (
            <div>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setOpen(true)}
              >
                <span className="btn__label">{t.eveningChange}</span>
              </button>
              <span className="hint" style={{ marginLeft: 10 }}>
                {t.eveningCutoff}
              </span>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="stack">
          <b>{t.eveningNone}</b>
          <span className="hint">{t.eveningBody}</span>
          {team.problem === "kurang" ? (
            <span className="hint tb-warn">{t.tooFew(d.setting.teamMin)}</span>
          ) : team.leader ? (
            <div>
              <button type="button" className="btn btn--primary" onClick={() => setOpen(true)}>
                <span className="btn__label">{t.eveningPick}</span>
              </button>
            </div>
          ) : (
            <span className="hint">{t.eveningMembersWait}</span>
          )}
        </div>
      )}
      {open && canPick && (
        <EveningDialog
          lang={lang}
          d={d}
          say={say}
          onClose={() => setOpen(false)}
          onDone={refresh}
        />
      )}
    </Section>
  );
}

/* ------------------------------------------------------------ the topic */

function TopicCard({ lang, d }: { lang: Lang; d: TubesMine }) {
  const t = TUBES[lang].caas;
  const team = d.team;
  const tt = team?.topic ?? null;
  return (
    <Section icon={<FilePdfIcon size={22} />} title={t.step.topic} tone={tt ? "ok" : undefined}>
      {tt ? (
        <div className="stack stack--sm">
          <h4 className="tb-topic">{tt.title}</h4>
          <span className="eyebrow">{t.topicBrief}</span>
          <p className="tb-brief">{tt.brief}</p>
        </div>
      ) : !team ? (
        <p className="hint">{t.eveningNeedTeam}</p>
      ) : team.topicPending ? (
        <p className="hint">{t.topicWait}</p>
      ) : (
        <div className="stack stack--sm">
          <p className="hint">
            {d.times.published
              ? t.topicNone
              : d.times.techmeetAt
                ? t.topicSoon(kapan(d.times.techmeetAt, lang))
                : t.topicNone}
          </p>
        </div>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------ the submission */

const PART_ICON: Record<string, ReactNode> = {
  code: <FileArchiveIcon size={20} />,
  report: <FilePdfIcon size={20} />,
  demo: <PlayIcon size={20} />,
};

function SendDialog({
  lang,
  part,
  have,
  say,
  onClose,
  onDone,
}: {
  lang: Lang;
  part: TubesPart;
  have: TubesFileView | undefined;
  say: Say;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = TUBES[lang].caas;
  const [mode, setMode] = useState<"file" | "link">(
    part.link && have?.kind === "link" ? "link" : "file",
  );
  const [link, setLink] = useState(have?.kind === "link" ? (have.url ?? "") : "");
  const [pct, setPct] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const sendFile = async (f: File) => {
    setErr(null);
    setPct(0);
    const r = await kirimFileTubes(part, f, setPct);
    setPct(null);
    if (!r.ok) return setErr(say(r.kode));
    toast(t.sentOk);
    onDone();
    onClose();
  };
  const saveLink = async () => {
    setErr(null);
    const r = await recPost<{ ok: true }>("tubes-file-save", { part: part.key, link });
    if (isFail(r)) return setErr(say(r.kode));
    toast(t.sentOk);
    onDone();
    onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && pct === null && onClose()}
      title={part.label[lang === "en" ? "en" : "id"]}
      description={t.limit(part.ext.join(", "), part.mb)}
      lang={lang}
      size="md"
      actions={
        <button type="button" className="btn btn--ghost" disabled={pct !== null} onClick={onClose}>
          <span className="btn__label">{t.close}</span>
        </button>
      }
    >
      <div className="stack">
        {part.link && (
          <div
            className="tb-seg"
            role="radiogroup"
            aria-label={part.label[lang === "en" ? "en" : "id"]}
          >
            {(["file", "link"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                className="tb-seg__b"
                onClick={() => setMode(m)}
              >
                {m === "file" ? t.asFile : t.asLink}
              </button>
            ))}
          </div>
        )}
        {mode === "file" ? (
          <div className="stack stack--sm">
            <input
              ref={fileRef}
              type="file"
              aria-label={part.label[lang === "en" ? "en" : "id"]}
              className="tb-file"
              accept={part.ext.join(",")}
              disabled={pct !== null}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void sendFile(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="btn btn--primary"
              disabled={pct !== null}
              onClick={() => fileRef.current?.click()}
            >
              <span className="btn__label">{pct === null ? t.pickFile : t.uploading(pct)}</span>
            </button>
            {pct !== null && (
              <div className="tb-bar" aria-hidden="true">
                <i style={{ transform: `translateX(${pct - 100}%)` }} />
              </div>
            )}
          </div>
        ) : (
          <label className="field">
            <span className="field__label">{t.linkLabel}</span>
            <input
              className="field__input"
              value={link}
              placeholder="https://"
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void saveLink()}
            />
            <span className="hint">{t.linkHint}</span>
            <div>
              <button type="button" className="btn btn--primary" onClick={() => void saveLink()}>
                <span className="btn__label">{t.linkSave}</span>
              </button>
            </div>
          </label>
        )}
        {err && (
          <p className="rec-note" data-t="danger" role="alert">
            <span>{err}</span>
          </p>
        )}
      </div>
    </Dialog>
  );
}

function SubmitCard({
  lang,
  d,
  say,
  refresh,
}: {
  lang: Lang;
  d: TubesMine;
  say: Say;
  refresh: () => void;
}) {
  const t = TUBES[lang].caas;
  const team = d.team;
  const [send, setSend] = useState<TubesPart | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const state = d.times.submit;
  const can = !!team && (state === "buka" || state === "izin");

  const open = async (part: string) => {
    if (!team) return;
    setBusy(part);
    const r = await bacaFileTubes(team.id, part);
    setBusy(null);
    if (isFail(r)) return toast(say(r.kode), "danger");
    window.open(r.url, "_blank", "noopener,noreferrer");
  };
  const remove = async (part: string) => {
    const r = await recPost<{ ok: true }>("tubes-file-delete", { part });
    if (isFail(r)) toast(say(r.kode), "danger");
    else toast(t.removedOk);
    refresh();
  };

  const status = team?.status ?? "none";
  return (
    <Section
      icon={<FileArchiveIcon size={22} />}
      title={t.submitTitle}
      tone={status === "complete" || status === "over" ? "ok" : undefined}
      aside={
        team ? (
          <Pill
            tone={
              status === "complete"
                ? "ok"
                : status === "late"
                  ? "danger"
                  : status === "over"
                    ? "warn"
                    : undefined
            }
          >
            {t.status[status]}
          </Pill>
        ) : undefined
      }
    >
      {!team ? (
        <p className="hint">{t.eveningNeedTeam}</p>
      ) : (
        <div className="stack">
          <span className="hint">{t.submitBody}</span>
          {state === "belum" && d.times.workStart && (
            <p className="hint">{t.submitNotYet(kapan(d.times.workStart, lang))}</p>
          )}
          {d.times.closeAt && state !== "belum" && state !== "tutup" && (
            <div className="row tb-close" style={{ gap: 10, flexWrap: "wrap" }}>
              <span className="hint">{t.closesIn}</span>
              <Countdown ke={new Date(d.times.closeAt).getTime()} label={t.closesIn} lang={lang} />
            </div>
          )}
          {state === "tutup" && (
            <p className="rec-note" data-t="danger">
              <span>{t.closedLate}</span>
            </p>
          )}
          {team.override && (
            <p className="rec-note" data-t="warn">
              <b>{t.overridden(team.override.until ? kapan(team.override.until, lang) : "")}</b>
              <span>
                {t.overrideNote}: {team.override.note}
              </span>
            </p>
          )}
          <ul className="tb-parts">
            {d.setting.parts.map((p) => {
              const f = team.files.find((x) => x.part === p.key);
              return (
                <li className="tb-part" key={p.key} data-have={f ? "yes" : undefined}>
                  <span className="tb-part__ic" aria-hidden="true">
                    {f?.kind === "link" ? (
                      <LinkIcon size={20} />
                    ) : (
                      (PART_ICON[p.key] ?? <FileArchiveIcon size={20} />)
                    )}
                  </span>
                  <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                    <b>{p.label[lang === "en" ? "en" : "id"]}</b>
                    <span className="hint">
                      {f
                        ? `${f.kind === "link" ? f.url : f.name}${f.kind === "file" ? ` · ${(f.size / 1048576).toFixed(1)} MB` : ""}`
                        : `${p.required ? t.partNeeded : t.partOptional} · ${t.limit(p.ext.join(", "), p.mb)}`}
                    </span>
                    {f && <span className="hint">{t.by(f.by)}</span>}
                  </span>
                  <span className="tb-part__s">
                    {f && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={busy === p.key}
                        onClick={() => void open(p.key)}
                      >
                        <ArrowSquareOutIcon size={14} aria-hidden="true" />
                        <span className="btn__label">{t.open}</span>
                      </button>
                    )}
                    {can && (
                      <button
                        type="button"
                        className="btn btn--primary btn--sm"
                        onClick={() => setSend(p)}
                      >
                        <span className="btn__label">{f ? t.replace : t.sendFile}</span>
                      </button>
                    )}
                    {can && f && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => void remove(p.key)}
                      >
                        <span className="btn__label">{t.remove}</span>
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {send && team && (
        <SendDialog
          lang={lang}
          part={send}
          have={team.files.find((x) => x.part === send.key)}
          say={say}
          onClose={() => setSend(null)}
          onDone={refresh}
        />
      )}
    </Section>
  );
}

/* ------------------------------------------------------------ the Presentasi turn */

function TurnCard({ lang, d }: { lang: Lang; d: TubesMine }) {
  const t = TUBES[lang].caas;
  const turn = d.team?.turn ?? null;
  return (
    <Section icon={<PlayIcon size={22} />} title={t.turnTitle} tone={turn ? "ok" : undefined}>
      {turn ? (
        <div className="stack stack--sm">
          <div className="tb-big">
            <b>{turn.table}</b>
            <span className="num">{t.turnBody(turn.place, wib(turn.startsAt).jam)}</span>
          </div>
          <span className="hint">
            {d.times.presentasiAt ? tgl(wib(d.times.presentasiAt).tanggal, lang) : ""}
          </span>
        </div>
      ) : (
        <p className="empty-note">{t.turnNone}</p>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------ the whole */

export default function TubesCard({ lang, enabled }: { lang: Lang; enabled: boolean }) {
  const q = useTubes(enabled);
  const w = TUBES[lang];
  const t = w.caas;
  const d = q.data;
  const say: Say = (k) => (w.err as Record<string, string>)[String(k)] ?? w.err.lain ?? "";
  if (!enabled || !d || !d.eligible) return null;

  const team = d.team;
  const done = {
    team: !!team && team.problem === null,
    evening: !!team?.sessionId,
    topic: !!team?.topic,
    submit: team?.status === "complete" || team?.status === "over",
    turn: !!team?.turn,
  };
  const next = !done.team
    ? t.next.team
    : !done.evening
      ? t.next.evening
      : !done.topic
        ? t.next.topic
        : !done.submit
          ? t.next.submit
          : !done.turn
            ? t.next.turn
            : t.next.done;

  return (
    <div className="tb" aria-label={t.title}>
      <section className="panel tb-head">
        <div className="stack stack--sm" style={{ minWidth: 0 }}>
          <span className="eyebrow">{t.title}</span>
          <h2 className="h3" style={{ margin: 0 }}>
            {next}
          </h2>
          <span className="hint">{t.lede}</span>
        </div>
        <ol className="tb-steps">
          <Step n={1} label={t.step.team} done={done.team} />
          <Step n={2} label={t.step.evening} done={done.evening} />
          <Step n={3} label={t.step.topic} done={done.topic} />
          <Step n={4} label={t.step.submit} done={done.submit} />
          <Step n={5} label={t.step.turn} done={done.turn} />
        </ol>
      </section>
      <div className="tb-grid">
        <TeamCard lang={lang} d={d} say={say} refresh={q.refresh} />
        <EveningCard lang={lang} d={d} say={say} refresh={q.refresh} />
        <TopicCard lang={lang} d={d} />
        <TurnCard lang={lang} d={d} />
        <div className="tb-wide">
          <SubmitCard lang={lang} d={d} say={say} refresh={q.refresh} />
        </div>
      </div>
    </div>
  );
}
