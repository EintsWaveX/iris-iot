/**
 * Tubes, Pengumpulan: each team's submission and how complete it is, a
 * viewer for every part (a download, a link, an mp4 played in the page), the
 * Ketua's override for a late team (a note is required), and the parts
 * themselves (file types and limits) for the Akademik and the Ketua to edit.
 */
import { useState } from "react";
import {
  ArrowSquareOutIcon,
  FileArchiveIcon,
  FilePdfIcon,
  LinkIcon,
  PlayIcon,
} from "@phosphor-icons/react";
import Dialog from "../../ui/Dialog";
import Pill from "../../ui/Pill";
import { isFail } from "../../../lib/recruitment/client";
import { TUBES_MAX_MB, type TubesPart } from "../../../lib/recruitment/tubes";
import type { TubesBoardTeam, TubesFileView } from "../../../lib/recruitment/tubes-api";
import { bacaFileTubes } from "../../../lib/recruitment/tubes-client";
import { dariLokal, kapan, keLokal, StatusPill, toast, type PanelCtx } from "./panelShared";

/* ------------------------------------------------------------ viewing one team */

function PartView({ c, team, part }: { c: PanelCtx; team: TubesBoardTeam; part: TubesPart }) {
  const { w, lang } = c;
  const f: TubesFileView | undefined = team.files.find((x) => x.part === part.key);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const label = part.label[lang === "en" ? "en" : "id"];
  const isVideo = !!f && f.kind === "file" && f.name.toLowerCase().endsWith(".mp4");
  const open = async (inline: boolean) => {
    setBusy(true);
    const r = await bacaFileTubes(team.id, part.key);
    setBusy(false);
    if (isFail(r)) return toast(c.say(r.kode), "danger");
    if (inline) setUrl(r.url);
    else window.open(r.url, "_blank", "noopener,noreferrer");
  };
  return (
    <li className="tb-part" data-have={f ? "yes" : undefined}>
      <span className="tb-part__ic" aria-hidden="true">
        {f?.kind === "link" ? (
          <LinkIcon size={20} />
        ) : part.key === "report" ? (
          <FilePdfIcon size={20} />
        ) : part.key === "demo" ? (
          <PlayIcon size={20} />
        ) : (
          <FileArchiveIcon size={20} />
        )}
      </span>
      <span className="stack" style={{ gap: 2, minWidth: 0 }}>
        <b>{label}</b>
        {f ? (
          <>
            <span className="hint" style={{ overflowWrap: "anywhere" }}>
              {f.kind === "link" ? f.url : `${f.name} · ${(f.size / 1048576).toFixed(1)} MB`}
            </span>
            <span className="hint">
              {kapan(f.at, lang)} · {c.all.caas.by(f.by)}
            </span>
          </>
        ) : (
          <span className="hint">
            {part.required ? c.all.caas.partNeeded : c.all.caas.partOptional}
          </span>
        )}
        {url && isVideo && (
          <video
            className="tb-video"
            src={url}
            controls
            preload="metadata"
            style={{ width: "100%", maxHeight: 360, borderRadius: 12 }}
          />
        )}
      </span>
      <span className="tb-part__s">
        {f && isVideo && !url && (
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={busy}
            onClick={() => void open(true)}
          >
            <PlayIcon size={14} aria-hidden="true" />
            <span className="btn__label">{c.all.caas.open}</span>
          </button>
        )}
        {f && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={busy}
            onClick={() => void open(false)}
          >
            <ArrowSquareOutIcon size={14} aria-hidden="true" />
            <span className="btn__label">{f.kind === "link" ? w.openLink : w.openFile}</span>
          </button>
        )}
      </span>
    </li>
  );
}

function OverrideDialog({
  c,
  team,
  onClose,
}: {
  c: PanelCtx;
  team: TubesBoardTeam;
  onClose: () => void;
}) {
  const { w } = c;
  const [note, setNote] = useState(team.override?.note ?? "");
  const [limit, setLimit] = useState(!!team.override?.until);
  const [until, setUntil] = useState(
    keLokal(team.override?.until ?? new Date(Date.now() + 3 * 3600_000).toISOString()),
  );
  const [miss, setMiss] = useState(false);
  const go = async () => {
    if (note.trim().length < 5) return setMiss(true);
    const ok = await c.post(
      "tubes-override",
      { teamId: team.id, note, until: limit ? dariLokal(until) : null },
      w.overrideSave,
    );
    if (ok) onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${w.overrideTitle} · ${team.name}`}
      description={w.overrideBody}
      lang={c.lang}
      size="md"
      actions={
        <>
          {team.override && (
            <span className="dialog__alt">
              <button
                type="button"
                className="btn btn--ghost"
                disabled={c.busy}
                onClick={() =>
                  void c
                    .post("tubes-override-clear", { teamId: team.id })
                    .then((ok) => ok && onClose())
                }
              >
                <span className="btn__label">{w.overrideClear}</span>
              </button>
            </span>
          )}
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            <span className="btn__label">{w.cancel}</span>
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={c.busy}
            onClick={() => void go()}
          >
            <span className="btn__label">{w.overrideSave}</span>
          </button>
        </>
      }
    >
      <div className="stack">
        <label className="field">
          <span className="field__label">{w.overrideNote}</span>
          <textarea
            className="field__input"
            rows={3}
            value={note}
            maxLength={300}
            placeholder={w.overrideNoteHint}
            aria-invalid={miss ? true : undefined}
            onChange={(e) => {
              setNote(e.target.value);
              setMiss(false);
            }}
          />
          {miss && (
            <span className="field__error" role="alert">
              {c.say("data_salah")}
            </span>
          )}
        </label>
        <div className="tp-seg" role="radiogroup" aria-label={w.overrideUntil}>
          <button
            type="button"
            role="radio"
            aria-checked={!limit}
            className="tp-seg__b"
            onClick={() => setLimit(false)}
          >
            {w.overrideNone}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={limit}
            className="tp-seg__b"
            onClick={() => setLimit(true)}
          >
            {w.overrideUntil}
          </button>
        </div>
        {limit && (
          <input
            className="field__input"
            type="datetime-local"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            aria-label={w.overrideUntil}
          />
        )}
      </div>
    </Dialog>
  );
}

function TeamDialog({
  c,
  team,
  onClose,
}: {
  c: PanelCtx;
  team: TubesBoardTeam;
  onClose: () => void;
}) {
  const { w, b } = c;
  const [ov, setOv] = useState(false);
  const closed = b.times.submit === "tutup" || b.times.submit === "izin";
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={team.name}
      description={team.members
        .filter((m) => m.status === "joined")
        .map((m) => m.nama)
        .join(", ")}
      lang={c.lang}
      size="xl"
      actions={
        <>
          {closed && (
            <span className="dialog__alt">
              <button
                type="button"
                className="btn btn--ghost"
                disabled={!b.rights.override}
                onClick={() => setOv(true)}
                title={b.rights.override ? undefined : w.overrideOnly}
              >
                <span className="btn__label">{team.override ? w.overrideTitle : w.override}</span>
              </button>
            </span>
          )}
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            <span className="btn__label">{w.close}</span>
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <StatusPill s={team.status} w={w} />
          {team.override && (
            <span className="hint">
              {w.overrideBy(team.override.by)}
              {team.override.until ? ` · ${kapan(team.override.until, c.lang)}` : ""} ·{" "}
              {team.override.note}
            </span>
          )}
        </div>
        <ul className="tb-parts">
          {b.setting.parts.map((p) => (
            <PartView key={p.key} c={c} team={team} part={p} />
          ))}
        </ul>
      </div>
      {ov && <OverrideDialog c={c} team={team} onClose={() => setOv(false)} />}
    </Dialog>
  );
}

/* ------------------------------------------------------------ the parts editor */

function PartsDialog({ c, onClose }: { c: PanelCtx; onClose: () => void }) {
  const { w, lang } = c;
  const [parts, setParts] = useState(
    c.b.setting.parts.map((p) => ({ ...p, extText: p.ext.join(", "), mbText: String(p.mb) })),
  );
  const set = (i: number, patch: Partial<(typeof parts)[number]>) =>
    setParts((x) => x.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const go = async () => {
    const out = parts.map((p) => ({
      key: p.key,
      label: p.label,
      ext: p.extText
        .split(",")
        .map((e) =>
          e
            .trim()
            .toLowerCase()
            .replace(/^(?!\.)/, "."),
        )
        .filter((e) => e !== "."),
      mb: Number(p.mbText),
      required: p.required,
      link: p.link,
    }));
    const ok = await c.post(
      "setting-save",
      { key: "tim", value: { ...c.b.setting, parts: out } },
      w.save,
    );
    if (ok) onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={w.partsEdit}
      description={`${w.partsHint} (${w.partCap(TUBES_MAX_MB)})`}
      lang={lang}
      size="xl"
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
        {parts.map((p, i) => (
          <div className="panel stack" key={p.key}>
            <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
              <label className="field" style={{ flex: "1 1 160px" }}>
                <span className="field__label">{w.partLabel} (ID)</span>
                <input
                  className="field__input"
                  value={p.label.id}
                  maxLength={60}
                  onChange={(e) => set(i, { label: { ...p.label, id: e.target.value } })}
                />
              </label>
              <label className="field" style={{ flex: "1 1 160px" }}>
                <span className="field__label">{w.partLabel} (EN)</span>
                <input
                  className="field__input"
                  value={p.label.en}
                  maxLength={60}
                  onChange={(e) => set(i, { label: { ...p.label, en: e.target.value } })}
                />
              </label>
              <label className="field" style={{ flex: "1 1 160px" }}>
                <span className="field__label">{w.partExt}</span>
                <input
                  className="field__input"
                  value={p.extText}
                  onChange={(e) => set(i, { extText: e.target.value })}
                />
              </label>
              <label className="field" style={{ flex: "0 0 110px" }}>
                <span className="field__label">{w.partMb}</span>
                <input
                  className="field__input"
                  type="number"
                  min={1}
                  max={TUBES_MAX_MB}
                  value={p.mbText}
                  onChange={(e) => set(i, { mbText: e.target.value })}
                />
              </label>
            </div>
            <div className="row" style={{ gap: 18, flexWrap: "wrap" }}>
              <label className="row" style={{ gap: 8 }}>
                <input
                  type="checkbox"
                  checked={p.required}
                  onChange={(e) => set(i, { required: e.target.checked })}
                />
                <span>{w.partReq}</span>
              </label>
              <label className="row" style={{ gap: 8 }}>
                <input
                  type="checkbox"
                  checked={p.link}
                  onChange={(e) => set(i, { link: e.target.checked })}
                />
                <span>{w.partLink}</span>
              </label>
              {parts.length > 1 && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setParts((x) => x.filter((_, j) => j !== i))}
                >
                  <span className="btn__label">{w.topicDelete}</span>
                </button>
              )}
            </div>
          </div>
        ))}
        {parts.length < 6 && (
          <div>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() =>
                setParts((x) => [
                  ...x,
                  {
                    key: `bagian${x.length + 1}`,
                    label: { id: "Bagian baru", en: "New part" },
                    ext: [".pdf"],
                    extText: ".pdf",
                    mb: 10,
                    mbText: "10",
                    required: false,
                    link: false,
                  },
                ])
              }
            >
              <span className="btn__label">{w.partAdd}</span>
            </button>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------ the section */

export default function KumpulSection({ c }: { c: PanelCtx }) {
  const { w, b, lang } = c;
  const [view, setView] = useState<TubesBoardTeam | null>(null);
  const [parts, setParts] = useState(false);
  const live = view ? (b.teams.find((t) => t.id === view.id) ?? view) : null;
  return (
    <div className="stack">
      <div className="tp-bar">
        <span className="hint">
          {b.times.closeAt ? w.closeAt(kapan(b.times.closeAt, lang)) : ""}
        </span>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={!b.rights.config}
          onClick={() => setParts(true)}
        >
          <span className="btn__label">{w.partsEdit}</span>
        </button>
      </div>
      {b.teams.length === 0 ? (
        <p className="hint">{w.noTeamYet}</p>
      ) : (
        <div className="tp-wrap panel panel--flush">
          <table className="tp-table">
            <thead>
              <tr>
                <th>{w.teams}</th>
                {b.setting.parts.map((p) => (
                  <th key={p.key}>{p.label[lang === "en" ? "en" : "id"]}</th>
                ))}
                <th />
                <th />
              </tr>
            </thead>
            <tbody>
              {b.teams.map((t) => (
                <tr key={t.id}>
                  <td>
                    <b>{t.name}</b>
                    <div className="hint">
                      {b.topics.find((x) => x.id === t.topicId)?.title ?? w.topicNone}
                    </div>
                  </td>
                  {b.setting.parts.map((p) => {
                    const f = t.files.find((x) => x.part === p.key);
                    return (
                      <td key={p.key}>
                        {f ? (
                          <Pill tone="ok">
                            {f.kind === "link" ? "link" : `${(f.size / 1048576).toFixed(1)} MB`}
                          </Pill>
                        ) : (
                          <span className="hint">{p.required ? "-" : "·"}</span>
                        )}
                      </td>
                    );
                  })}
                  <td>
                    <StatusPill s={t.status} w={w} />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => setView(t)}
                    >
                      <span className="btn__label">{w.view}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {live && <TeamDialog c={c} team={live} onClose={() => setView(null)} />}
      {parts && <PartsDialog c={c} onClose={() => setParts(false)} />}
    </div>
  );
}
