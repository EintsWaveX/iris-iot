/**
 * One candidate's whole picture inside Cutting (3 Nov 2026), so nobody has to go to Kandidat, Berkas or
 * Penilaian to see why a row sits where it does: the reasons in plain words, Berkas, attendance, the stages
 * before, the examiners' sheets, who proposed what and when, and the notes. The Usul Lolos / Usul Gagal buttons
 * are right here, and Prev / Next (also J / K and the arrow keys) walk the list as it is filtered now.
 */
import { useEffect, useRef, useState } from "react";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import Drawer from "../../../ui/Drawer";
import { Stepper } from "../../../ui/Controls";
import type { Lang } from "../../../../lib/kelas";
import { isFail, recPost, useRecCutDetail } from "../../../../lib/recruitment/client";
import { reasonsOf, type ReasonKey } from "../../../../lib/recruitment/cutting";
import { tanggalWib } from "../../../../lib/recruitment/gates";
import type {
  CutDetailResponse,
  CutRowView,
  CutStage,
  Proposal,
} from "../../../../lib/recruitment/types";
import { S2 } from "../../s2Strings";
import { tgl } from "../../shared";
import { CW } from "./cutWhyStrings";

const stamp = (iso: string, lang: Lang) => {
  const w = tanggalWib(new Date(iso));
  return `${tgl(w.tanggal, lang)}, ${w.jam}`;
};

/** A key press that belongs to a text field never walks the list. */
const typing = (el: EventTarget | null) => {
  const n = el as HTMLElement | null;
  if (!n || !n.tagName) return false;
  return (
    ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(n.tagName) ||
    n.isContentEditable ||
    !!n.closest("[role=separator]")
  );
};

function Sec({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="cwd__sec">
      <div className="cwd__sechead">
        <h4 className="label-caps">{title}</h4>
        {hint && <span className="hint">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Fact({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="cwd__fact">
      <dt>{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default function CuttingDrawer({
  lang,
  stage,
  id,
  list,
  total,
  rankOf,
  passN,
  ivStage,
  skala,
  can,
  locked,
  onId,
  onClose,
  onPropose,
  onNote,
  onKandidat,
}: {
  lang: Lang;
  stage: CutStage;
  id: number;
  /** The rows in the order and filter the page shows now: what Prev and Next walk */
  list: CutRowView[];
  /** Everyone on the board */
  total: number;
  /** A row's place on the whole board (1-based, in score order) */
  rankOf: (id: number) => number;
  passN: number | null;
  ivStage: boolean;
  skala: number;
  /** May propose: holds the right and the stage is not locked */
  can: boolean;
  locked: boolean;
  onId: (id: number) => void;
  onClose: () => void;
  onPropose: (c: CutRowView, p: Proposal) => void;
  onNote: (c: CutRowView, note: string) => void;
  /** Set when the viewer may review documents: opens this CaAs in Kandidat, with a way back here. */
  onKandidat?: () => void;
}) {
  const t = CW[lang];
  const s2 = S2[lang];
  const det = useRecCutDetail(stage, id);
  const d: CutDetailResponse | null = det.data;
  const i = list.findIndex((r) => r.id === id);
  const c = i >= 0 ? list[i] : null;
  const rank = rankOf(id);
  const go = (dir: number) => {
    const nx = list[i + dir];
    if (nx) onId(nx.id);
  };
  const goRef = useRef(go);
  goRef.current = go;
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      if (e.key === "j" || e.key === "ArrowRight") goRef.current(1);
      else if (e.key === "k" || e.key === "ArrowLeft") goRef.current(-1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  // The two notes keep a draft until saved; a new candidate, or a change from someone else, resets them.
  const [panitia, setPanitia] = useState("");
  const [busy, setBusy] = useState(false);
  const serverNote = d?.candidate.panitiaNote ?? "";
  useEffect(() => setPanitia(serverNote), [serverNote, id]);
  const [cut, setCut] = useState("");
  useEffect(() => setCut(c?.note ?? ""), [c?.note, id]);

  async function simpanPanitia() {
    setBusy(true);
    const r = await recPost<{ ok: true }>("candidate-note", { id, note: panitia });
    setBusy(false);
    if (isFail(r)) return void window.Toast?.show(t.saveFail, "danger");
    window.Toast?.show(t.saved, "ok");
    det.refresh();
  }

  const reasons = c ? reasonsOf(c, { stage, ivStage, rank, passN: passN }) : [];
  const sebab = reasons.filter((r) => r.key !== "nearAbove" && r.key !== "nearBelow");
  const why: string[] = [];
  if (c && passN !== null) why.push(t.whyLine(rank, passN, rank <= passN));
  if (c && stage !== "berkas")
    why.push(c.total !== null ? t.whyScore(c.total, skala) : t.whyNoScore);
  for (const r of sebab) why.push(t.whyText[r.key as ReasonKey](r.n));
  if (!sebab.length && why.length <= 1) why.push(t.whyNone);

  const verdictOf = (v: "ok" | "fix" | null) =>
    v === "ok" ? t.verdict.ok : v === "fix" ? t.verdict.fix : t.verdict.none;
  const docs = s2.berkas.docs as Record<string, string>;

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={c?.nama ?? d?.candidate.nama ?? "..."}
      description={c ? t.sub(c.nim, rank, total) : undefined}
      headerActions={
        i >= 0 && list.length > 1 ? (
          <div className="cwd__nav">
            <Stepper
              value={i + 1}
              min={1}
              max={list.length}
              label={t.jump}
              lessLabel={t.prev}
              moreLabel={t.next}
              fmt={(n) => t.pos(n, list.length)}
              onChange={(n) => {
                const next = list[n - 1];
                if (next) onId(next.id);
              }}
            />
          </div>
        ) : undefined
      }
      storeKey="rec-cutting-1-3"
      compact
      minWidth={440}
      closeLabel={t.close}
      resizeLabel={t.resize}
      foot={
        c ? (
          <>
            <span className="hint cwd__keys">{t.keys}</span>
            <span className="grow" />
            <span
              className="n7-seg n7-seg--lg"
              role="group"
              aria-label={s2.cut.proposalFor(c.nama)}
            >
              {(["lolos", "gagal"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  data-v={v}
                  aria-pressed={c.proposal === v}
                  disabled={!can}
                  onClick={() => onPropose(c, v)}
                >
                  {v === "lolos" ? t.proposeLolos : t.proposeGagal}
                </button>
              ))}
            </span>
          </>
        ) : undefined
      }
    >
      {!c ? (
        <p className="empty-note">{t.loadFail}</p>
      ) : (
        <div className="cwd">
          {locked && <p className="hint">{t.lockedHint}</p>}
          <section className="cwd__why" aria-label={t.why}>
            <h4 className="label-caps">{t.why}</h4>
            <ul>
              {why.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <span className="hint">
              {c.proposal ? t.proposedNow(s2.cut.reason[c.proposal], c.proposedBy) : t.proposalNone}
            </span>
          </section>

          {!d ? (
            <span className="skeleton" style={{ height: 220 }} aria-label={t.loading} />
          ) : (
            <>
              <Sec title={t.berkas}>
                <dl className="cwd__facts">
                  <Fact k={t.status}>{t.statusName[d.candidate.status] ?? d.candidate.status}</Fact>
                  <Fact k={t.score}>
                    {d.candidate.berkasScore !== null ? (
                      <span className="num">{d.candidate.berkasScore}</span>
                    ) : (
                      <span className="hint">-</span>
                    )}
                  </Fact>
                  <Fact k={t.ipk}>
                    {d.candidate.ipk !== null ? (
                      <span className="num">{d.candidate.ipk.toFixed(2)}</span>
                    ) : (
                      <span className="hint">-</span>
                    )}
                  </Fact>
                  <Fact k={t.potensi}>{d.candidate.potensiCut ? t.yes : t.no}</Fact>
                  <Fact k={t.revisions}>
                    <span className="num">{d.candidate.revisions}</span>
                  </Fact>
                </dl>
                {d.candidate.reviewNote && (
                  <p className="cwd__quote">
                    <b>{t.reviewNote}</b> {d.candidate.reviewNote}
                  </p>
                )}
                {d.candidate.reviewedBy && d.candidate.reviewedAt && (
                  <span className="hint">
                    {t.reviewedBy(d.candidate.reviewedBy, stamp(d.candidate.reviewedAt, lang))}
                  </span>
                )}
                {onKandidat && (
                  <div>
                    <button type="button" className="btn btn--inverse btn--sm" onClick={onKandidat}>
                      <ArrowSquareOutIcon size={16} aria-hidden="true" />
                      <span className="btn__label">{t.openKand}</span>
                    </button>
                  </div>
                )}
                {d.files ? (
                  <ul className="cwd__list" aria-label={t.files}>
                    {d.files.map((f) => (
                      <li key={f.kind}>
                        <span>{docs[f.kind] ?? f.kind}</span>
                        <span className="cwd__list-v" data-v={f.verdict ?? "none"}>
                          {verdictOf(f.verdict)}
                          {f.replaced ? ` · ${t.replaced}` : ""}
                        </span>
                        {f.note && <span className="hint cwd__list-n">{f.note}</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-note empty-note--sm">{t.noRight}</p>
                )}
              </Sec>

              <Sec title={t.hadir}>
                {d.attendance.length === 0 ? (
                  <p className="empty-note empty-note--sm">{t.hadirNone}</p>
                ) : (
                  <ul className="cwd__list">
                    {d.attendance.map((a) => (
                      <li key={`${a.title}-${a.at ?? "x"}`}>
                        <span>{a.title}</span>
                        {a.at ? (
                          <span className="cwd__list-v" data-v="ok">
                            {t.came(tanggalWib(new Date(a.at)).jam)} ·{" "}
                            {a.via === "manual" ? t.viaManual(a.by) : t.viaQr}
                          </span>
                        ) : (
                          <span className="cwd__list-v" data-v="fix">
                            {t.missed}
                          </span>
                        )}
                        {a.reason && <span className="hint cwd__list-n">{a.reason}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </Sec>

              <Sec title={t.trail}>
                {d.trail.length === 0 ? (
                  <p className="empty-note empty-note--sm">{t.trailNone}</p>
                ) : (
                  <ul className="cwd__list">
                    {d.trail.map((r) => (
                      <li key={r.stage}>
                        <span>{s2.cut.stageName[r.stage]}</span>
                        <span className="num">
                          {r.score !== null ? t.trailScore(r.score, r.max) : t.trailNoScore}
                        </span>
                        {r.verdict && <span className="hint">{t.verdicts[r.verdict]}</span>}
                        <span className="cwd__list-v" data-v={r.proposal ?? "none"}>
                          {r.proposal ? t.result[r.proposal] : t.notProposed}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Sec>

              {d.iv && (
                <Sec title={t.iv}>
                  <dl className="cwd__facts">
                    <Fact k={t.ivMean}>
                      {d.iv.mean !== null ? (
                        <span className="num">{Math.round(d.iv.mean)}</span>
                      ) : (
                        <span className="hint">-</span>
                      )}
                    </Fact>
                    <Fact k={t.ivSpread}>
                      {d.iv.spread !== null ? (
                        <span className="num">{d.iv.spread}</span>
                      ) : (
                        <span className="hint">-</span>
                      )}
                    </Fact>
                    <Fact k={t.ivVerdict}>
                      {d.iv.verdict ? t.verdicts[d.iv.verdict] : <span className="hint">-</span>}
                    </Fact>
                    <Fact k={t.ivSuggested}>
                      {d.iv.suggested ? (
                        t.verdicts[d.iv.suggested]
                      ) : (
                        <span className="hint">-</span>
                      )}
                    </Fact>
                  </dl>
                  <span className="hint">{t.ivSheets(d.iv.sheets.length, d.iv.expected)}</span>
                  <h5 className="cwd__sub">{t.ivConcl}</h5>
                  <ul className="cwd__concl">
                    {d.iv.conclusions.map((q) => (
                      <li key={q.label.id}>
                        <b>{lang === "id" ? q.label.id : q.label.en}</b>
                        <span className={q.text ? undefined : "hint"}>{q.text || t.ivNoConcl}</span>
                      </li>
                    ))}
                  </ul>
                </Sec>
              )}

              <Sec title={t.history}>
                {d.history.length === 0 ? (
                  <p className="empty-note empty-note--sm">{t.historyNone}</p>
                ) : (
                  <ul className="cwd__list">
                    {d.history.map((h, k) => (
                      <li key={`${h.at}-${k}`}>
                        <span>
                          {h.proposal
                            ? t.proposed(h.by, s2.cut.reason[h.proposal])
                            : t.cleared(h.by)}
                        </span>
                        <span className="hint">{stamp(h.at, lang)}</span>
                        {h.note && <span className="hint cwd__list-n">{h.note}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </Sec>

              <Sec title={t.panitiaNote} hint={t.panitiaHint}>
                <textarea
                  className="textarea"
                  rows={3}
                  maxLength={2000}
                  value={panitia}
                  disabled={!d.candidate.canEditNote}
                  aria-label={t.panitiaNote}
                  onChange={(e) => setPanitia(e.target.value)}
                />
                {d.candidate.canEditNote ? (
                  <div className="row">
                    <button
                      type="button"
                      className="btn btn--inverse btn--sm"
                      disabled={busy || panitia.trim() === serverNote.trim()}
                      onClick={() => void simpanPanitia()}
                    >
                      {t.save}
                    </button>
                  </div>
                ) : (
                  <p className="empty-note empty-note--sm">{t.noEdit}</p>
                )}
              </Sec>

              <Sec title={t.cutNote} hint={t.cutHint}>
                <textarea
                  className="textarea"
                  rows={2}
                  maxLength={200}
                  value={cut}
                  disabled={!can}
                  aria-label={t.cutNote}
                  onChange={(e) => setCut(e.target.value)}
                />
                {can && (
                  <div className="row">
                    <button
                      type="button"
                      className="btn btn--inverse btn--sm"
                      disabled={cut.trim() === (c.note ?? "").trim()}
                      onClick={() => onNote(c, cut)}
                    >
                      {t.save}
                    </button>
                  </div>
                )}
              </Sec>
            </>
          )}
        </div>
      )}
    </Drawer>
  );
}
