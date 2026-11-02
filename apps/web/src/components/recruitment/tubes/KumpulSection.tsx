/**
 * Tubes, Pengumpulan: each team's submission and how complete it is, a
 * viewer for every part (a download, a link, an mp4 played in the page), the
 * Ketua's override for a late team (a note is required), and the parts
 * themselves (file types and limits) for the Akademik and the Ketua to edit.
 */
import { useState } from "react";
import type { Lang } from "../../../lib/kelas";
import {
  ArrowSquareOutIcon,
  FileArchiveIcon,
  FilePdfIcon,
  LinkIcon,
  LockSimpleIcon,
  LockSimpleOpenIcon,
  MagnifyingGlassIcon,
  PackageIcon,
  PlayIcon,
  SlidersHorizontalIcon,
  TimerIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import Dialog from "../../ui/Dialog";
import { Checkbox } from "../../ui/Controls";
import { isFail } from "../../../lib/recruitment/client";
import {
  TUBES_MAX_MB,
  type SubmissionStatus,
  type TubesPart,
} from "../../../lib/recruitment/tubes";
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
  startOv = false,
}: {
  c: PanelCtx;
  team: TubesBoardTeam;
  onClose: () => void;
  startOv?: boolean;
}) {
  const { w, b } = c;
  const [ov, setOv] = useState(startOv);
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
              <Checkbox
                checked={p.required}
                onChange={(v) => set(i, { required: v })}
                label={w.partReq}
              />
              <Checkbox checked={p.link} onChange={(v) => set(i, { link: v })} label={w.partLink} />
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

const KX: Record<
  Lang,
  {
    closesIn: (d: string) => string;
    closedTitle: string;
    closeNote: (when: string) => string;
    partsLong: string;
    search: string;
    searchAria: string;
    filterAria: string;
    all: string;
    of: string;
    teamNote: (max: number) => string;
    open: string;
    allow: string;
    onlyKetua: string;
    miss: string;
    optional: string;
    optionalTip: string;
    statusHead: string;
    actionsHead: string;
    d: string;
    h: string;
    m: string;
  }
> = {
  id: {
    closesIn: (d) => `Tutup dalam ${d}`,
    closedTitle: "Pengumpulan sudah ditutup",
    closeNote: (when) =>
      `Tutup saat Presentasi mulai: ${when}. Diambil dari Kalender. Yang telat ditolak; hanya Ketua yang bisa membukanya lagi, dengan catatan.`,
    partsLong: "Atur Isi Pengumpulan",
    search: "Cari nama",
    searchAria: "Cari tim",
    filterAria: "Saring menurut status",
    all: "Semua",
    of: "dari",
    teamNote: (n) =>
      `Satu pengumpulan untuk seluruh tim (sampai ${n} orang), dan satu nilai Presentasi untuk semuanya. Satu baris di sini adalah satu tim.`,
    open: "Buka",
    allow: "Beri Izin",
    onlyKetua: "Hanya Ketua",
    miss: "Belum ada",
    optional: "opsional",
    optionalTip: "Boleh kosong",
    statusHead: "Status",
    actionsHead: "Aksi",
    d: "hari",
    h: "jam",
    m: "menit",
  },
  en: {
    closesIn: (d) => `Closes in ${d}`,
    closedTitle: "The submission is closed",
    closeNote: (when) =>
      `Closes when Presentasi starts: ${when}. Taken from the Calendar. Late ones are refused; only the Ketua can reopen one, with a note.`,
    partsLong: "Set What Is Submitted",
    search: "Search name",
    searchAria: "Search teams",
    filterAria: "Filter by status",
    all: "All",
    of: "of",
    teamNote: (n) =>
      `One submission for the whole team (up to ${n} people), and one Presentasi score for all of them. One row here is one team.`,
    open: "Open",
    allow: "Allow",
    onlyKetua: "Only the Ketua",
    miss: "Missing",
    optional: "optional",
    optionalTip: "Can stay empty",
    statusHead: "Status",
    actionsHead: "Actions",
    d: "d",
    h: "h",
    m: "min",
  },
  zh: {
    closesIn: (d) => `${d}后截止`,
    closedTitle: "提交已截止",
    closeNote: (when) =>
      `答辩开始时截止：${when}。取自日历。迟交会被拒绝；只有组长可以备注后重新开放。`,
    partsLong: "设置提交内容",
    search: "搜索名称",
    searchAria: "搜索小组",
    filterAria: "按状态筛选",
    all: "全部",
    of: "/",
    teamNote: (n) => `整个小组（最多 ${n} 人）一次提交、一个答辩成绩。这里一行就是一个小组。`,
    open: "打开",
    allow: "允许",
    onlyKetua: "仅组长",
    miss: "缺少",
    optional: "可选",
    optionalTip: "可以留空",
    statusHead: "状态",
    actionsHead: "操作",
    d: "天",
    h: "小时",
    m: "分钟",
  },
};

const partIcon = (p: TubesPart) =>
  p.ext.some((e) => e.toLowerCase() === ".zip")
    ? PackageIcon
    : p.ext.some((e) => e.toLowerCase() === ".pdf")
      ? FilePdfIcon
      : PlayIcon;

function PartChip({
  p,
  f,
  k,
}: {
  p: TubesPart;
  f: TubesFileView | undefined;
  k: (typeof KX)["id"];
}) {
  const Ic = partIcon(p);
  if (f) {
    const size = f.kind === "link" ? "link" : `${(f.size / 1048576).toFixed(1)} MB`;
    return (
      <span
        className="tp-pc"
        data-ok="yes"
        title={f.kind === "link" ? f.name : `${f.name} · ${size}`}
      >
        <Ic size={16} aria-hidden="true" />
        <span className="num">{size}</span>
      </span>
    );
  }
  return (
    <span
      className="tp-pc"
      data-ok={p.required ? "no" : "opt"}
      title={p.required ? k.miss : k.optionalTip}
    >
      <Ic size={16} aria-hidden="true" />
      <span>{p.required ? "-" : k.optional}</span>
    </span>
  );
}

export default function KumpulSection({ c }: { c: PanelCtx }) {
  const { w, b, lang } = c;
  const k = KX[lang];
  const [view, setView] = useState<{ t: TubesBoardTeam; ov: boolean } | null>(null);
  const [parts, setParts] = useState(false);
  const [f, setF] = useState<"semua" | SubmissionStatus>("semua");
  const [q, setQ] = useState("");
  const live = view ? (b.teams.find((t) => t.id === view.t.id) ?? view.t) : null;
  const closed = b.times.submit === "tutup" || b.times.submit === "izin";
  const left = b.times.closeAt
    ? Math.max(0, new Date(b.times.closeAt).getTime() - new Date(b.times.now).getTime())
    : 0;
  const dur = (ms: number) => {
    const m = Math.floor(ms / 60000);
    const d = Math.floor(m / 1440);
    const h = Math.floor((m % 1440) / 60);
    const mi = m % 60;
    return d ? `${d} ${k.d} ${h} ${k.h}` : h ? `${h} ${k.h} ${mi} ${k.m}` : `${mi} ${k.m}`;
  };
  const STS: SubmissionStatus[] = ["complete", "partial", "none", "late", "over"];
  const cnt = (s: SubmissionStatus) => b.teams.filter((t) => t.status === s).length;
  const shown = b.teams.filter(
    (t) =>
      (f === "semua" || t.status === f) &&
      (!q || t.name.toLowerCase().includes(q.trim().toLowerCase())),
  );
  return (
    <div className="stack">
      <section className="panel tp-close" data-closed={closed ? "yes" : "no"}>
        <span className="tp-close__ic">
          {closed ? (
            <LockSimpleIcon size={22} aria-hidden="true" />
          ) : (
            <TimerIcon size={22} aria-hidden="true" />
          )}
        </span>
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <b>{closed ? k.closedTitle : k.closesIn(dur(left))}</b>
          <span className="hint">
            {b.times.closeAt ? k.closeNote(kapan(b.times.closeAt, lang)) : ""}
          </span>
        </div>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={!b.rights.config}
          onClick={() => setParts(true)}
        >
          <SlidersHorizontalIcon size={18} aria-hidden="true" />
          <span className="btn__label">{k.partsLong}</span>
        </button>
      </section>
      {b.teams.length === 0 ? (
        <p className="hint">{w.noTeamYet}</p>
      ) : (
        <>
          <div className="row rec-tools">
            <div className="rec-search">
              <MagnifyingGlassIcon className="ic" size={18} aria-hidden="true" />
              <input
                className="field__input input"
                placeholder={k.search}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label={k.searchAria}
              />
            </div>
            <div className="tp-subt" role="group" aria-label={k.filterAria}>
              <button
                type="button"
                className="tp-subt__b"
                aria-pressed={f === "semua"}
                onClick={() => setF("semua")}
              >
                <b className="num">{b.teams.length}</b>
                <span className="hint">{k.all}</span>
              </button>
              {STS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="tp-subt__b"
                  aria-pressed={f === s}
                  onClick={() => setF(f === s ? "semua" : s)}
                >
                  <b className="num" data-t={s === "late" ? "no" : undefined}>
                    {cnt(s)}
                  </b>
                  <span className="hint">{w.status[s]}</span>
                </button>
              ))}
            </div>
            <span className="grow" />
            <span className="hint num">
              {shown.length} {k.of} {b.teams.length}
            </span>
          </div>
          <div className="rec-note tp-teamnote">
            <UsersThreeIcon size={16} aria-hidden="true" />
            <span>{k.teamNote(b.setting.teamMax)}</span>
          </div>
          <div className="tp-wrap panel panel--flush">
            <table className="tp-table tp-subtab">
              <thead>
                <tr>
                  <th>{w.teams}</th>
                  {b.setting.parts.map((p) => (
                    <th key={p.key}>{p.label[lang === "en" ? "en" : "id"].split(" (")[0]}</th>
                  ))}
                  <th>{k.statusHead}</th>
                  <th>
                    <span className="sr">{k.actionsHead}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => (
                  <tr key={t.id} data-st={t.status}>
                    <td>
                      <span className="stack" style={{ gap: 0 }}>
                        <b>{t.name}</b>
                        <span className="hint">
                          {b.topics.find((x) => x.id === t.topicId)?.title ?? w.topicNone}
                        </span>
                      </span>
                    </td>
                    {b.setting.parts.map((p) => (
                      <td key={p.key}>
                        <PartChip p={p} f={t.files.find((x) => x.part === p.key)} k={k} />
                      </td>
                    ))}
                    <td>
                      <StatusPill s={t.status} w={w} />
                    </td>
                    <td>
                      <div className="tp-act">
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => setView({ t, ov: false })}
                        >
                          <span className="btn__label">{k.open}</span>
                        </button>
                        {closed &&
                          t.status !== "complete" &&
                          t.status !== "over" &&
                          !t.override && (
                            <button
                              type="button"
                              className="btn btn--inverse btn--sm"
                              disabled={!b.rights.override}
                              title={b.rights.override ? undefined : k.onlyKetua}
                              onClick={() => setView({ t, ov: true })}
                            >
                              <LockSimpleOpenIcon size={16} aria-hidden="true" />
                              <span className="btn__label">{k.allow}</span>
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {live && view && (
        <TeamDialog c={c} team={live} startOv={view.ov} onClose={() => setView(null)} />
      )}
      {parts && <PartsDialog c={c} onClose={() => setParts(false)} />}
    </div>
  );
}
