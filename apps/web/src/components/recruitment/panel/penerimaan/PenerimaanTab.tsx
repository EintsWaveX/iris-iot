/**
 * The Penerimaan tab (mockup r8-final, r8-hasil, r8-rayakan, r8-tutup). One job:
 * confirm the final list. Three guided steps: Tinjau (the CaAs who passed
 * Mengajar with every score, who is in and who is out), Kode (a unique three
 * letter code for each new Asisten, proposed from the name and editable) and
 * Konfirmasi (a summary and a hold button). Only the Ketua confirms; the rest
 * of the Panitia read. Under it: the result, and closing the edition.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  CalendarCheckIcon,
  CaretRightIcon,
  CheckCircleIcon,
  CheckIcon,
  EnvelopeSimpleIcon,
  ClockIcon,
  ConfettiIcon,
  InfoIcon,
  KeyIcon,
  ListChecksIcon,
  LockSimpleIcon,
  MagnifyingGlassIcon,
  SealCheckIcon,
  UsersThreeIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import Confirm from "../../../ui/Confirm";
import Dialog from "../../../ui/Dialog";
import { Stepper } from "../../../ui/Controls";
import { Stc } from "../../shared";
import Dropdown from "../../../ui/Dropdown";
import HoldButton from "../../../ui/HoldButton";
import Pill from "../../../ui/Pill";
import type { Lang } from "../../../../lib/kelas";
import { isFail, recPost } from "../../../../lib/recruitment/client";
import { cekKode, usulKode } from "../../../../lib/recruitment/penerimaan";
import { ACCEPT_DEFAULT } from "../../../../lib/recruitment/settings";
import {
  useRecPn,
  type PnConfirmResponse,
  type PnListResponse,
  type PnRow,
} from "../../../../lib/recruitment/pn-client";
import Rayakan from "./Rayakan";
import { PNW } from "./pnStrings";
import { PL } from "./pnLook";
import "../../recruitment-r8.css";
import "../../recruitment-r8m.css";

type Step = "tinjau" | "kode" | "konfirmasi";
const toast = (m: string, tone: "ok" | "warn" | "danger" = "ok") => window.Toast?.show(m, tone);
const tglJam = (iso: string, lang: Lang) =>
  new Intl.DateTimeFormat(lang === "id" ? "id-ID" : lang === "zh" ? "zh-CN" : "en-GB", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
const tgl = (iso: string, lang: Lang) =>
  new Intl.DateTimeFormat(lang === "id" ? "id-ID" : lang === "zh" ? "zh-CN" : "en-GB", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));

function Tutup({
  lang,
  d,
  can,
  refresh,
}: {
  lang: Lang;
  d: PnListResponse;
  can: boolean;
  refresh: () => void;
}) {
  const w = PNW(lang).close;
  const err = PNW(lang).err;
  const [tanya, setTanya] = useState(false);
  const c = d.close;
  const tutup = async () => {
    const r = await recPost<{ ok: true }>("pn-close", { confirm: true });
    if (isFail(r)) return toast(err[r.kode] ?? r.kode, "danger");
    toast(w.done);
    refresh();
  };
  return (
    <section className="panel r8close" data-closed={c.closed ? "yes" : undefined}>
      <div className="panel__head">
        <h3 className="panel__title">{w.title}</h3>
        <Pill tone={c.closed ? "danger" : "ok"}>{c.closed ? w.closed : w.open}</Pill>
      </div>
      <ul className="r8close__l">
        {c.closedAt && c.closedBy && <li>{w.byHand(tglJam(c.closedAt, lang))}</li>}
        {!c.closedAt && c.closeAt && <li>{w.auto(tgl(c.closeAt, lang), c.closeDays)}</li>}
        {!c.closeAt && !c.closedAt && <li className="hint">{w.noAuto}</li>}
        {c.keepUntil && <li>{w.keep(tgl(c.keepUntil, lang), c.retentionMonths)}</li>}
      </ul>
      {can && !c.closed && (
        <>
          <button type="button" className="btn btn--ghost" onClick={() => setTanya(true)}>
            {w.button}
          </button>
          <Confirm
            open={tanya}
            onOpenChange={setTanya}
            title={w.confirmTitle}
            body={w.confirmBody}
            confirmLabel={w.confirmLabel}
            cancelLabel={PNW(lang).confirm.back}
            lang={lang}
            onConfirm={() => void tutup()}
          />
        </>
      )}
    </section>
  );
}

const ACK_KEY = "iris:rec:pn-ack";
const bacaAck = (): number[] => {
  try {
    const v = JSON.parse(localStorage.getItem(ACK_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => Number.isInteger(x)) : [];
  } catch {
    return [];
  }
};

type Saring = "semua" | "terima" | "tolak" | "cek";
type Urut = "mengajar" | "wawancara" | "tes" | "nama";

/** A score with its bar: the value, how far it reaches, and (Wawancara) the verdict under it. */
function Nilai({
  v,
  max,
  tone,
  verdict,
  verdictLabel,
}: {
  v: number | null;
  max: number;
  tone: "info" | "gold";
  verdict?: "lolos" | "ragu" | "cut" | null;
  verdictLabel?: string;
}) {
  if (v === null) return <span className="hint">-</span>;
  const sc = (
    <span
      className="r8-sc"
      style={
        { "--v": `${Math.round(Math.max(0, Math.min(100, (v / max) * 100)))}%` } as CSSProperties
      }
      data-strong={tone === "gold" ? "yes" : undefined}
    >
      <b className="num">{Math.round(v)}</b>
      <i />
    </span>
  );
  return verdict && verdictLabel ? (
    <div className="r8-waw">
      {sc}
      <span className="r8-vd" data-v={verdict}>
        {verdictLabel}
      </span>
    </div>
  ) : (
    sc
  );
}

export default function PenerimaanTab({ lang }: { lang: Lang }) {
  const w = PNW(lang);
  const l = PL[lang];
  const pn = useRecPn(true);
  const d = pn.data;
  const [step, setStep] = useState<Step>("tinjau");
  const [rows, setRows] = useState<PnRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasil, setHasil] = useState<PnConfirmResponse | null>(null);
  const [pesta, setPesta] = useState(false);
  const [cari, setCari] = useState("");
  const [saring, setSaring] = useState<Saring>("semua");
  const [urut, setUrut] = useState<Urut>("mengajar");
  const [ack, setAck] = useState<number[]>(bacaAck);
  const [pakai, setPakai] = useState(false);
  const [ringkas, setRingkas] = useState(false);

  // The server's list seeds the local edits; a change from elsewhere replaces it unless the Ketua is mid-edit.
  const sumber = useMemo(() => (d ? JSON.stringify(d.rows) : ""), [d]);
  useEffect(() => {
    if (d) setRows(structuredClone(d.rows));
  }, [sumber]);

  if (!d || !rows) return <span className="skeleton" style={{ height: 360 }} />;
  const can = d.canConfirm && !d.close.closed;
  const terima = rows.filter((r) => r.decision === "terima");
  const baru = terima.filter((r) => !r.promotedNim);
  const taken = new Set(d.taken);
  // Codes already held by Asisten who were promoted from this list are theirs; they are not clashes.
  for (const r of rows) if (r.promotedNim && r.code) taken.delete(r.code);
  const cek = cekKode(
    baru.map((r) => ({ id: r.id, code: r.code })),
    taken,
  );
  const masalah = cek.filter((c) => c.problem);
  const set = (id: number, x: Partial<PnRow>) =>
    setRows(rows.map((r) => (r.id === id ? { ...r, ...x } : r)));
  // A note is an undecided verdict nobody has looked at again; the tick is a reading aid kept on this browser.
  const ragu = (r: PnRow) =>
    r.scores.wawancaraVerdict === "ragu" || r.scores.mengajarVerdict === "ragu";
  const catatan = rows.filter((r) => ragu(r) && !ack.includes(r.id));
  const tandai = (id: number) => {
    const n = ack.includes(id) ? ack.filter((x) => x !== id) : [...ack, id];
    setAck(n);
    try {
      localStorage.setItem(ACK_KEY, JSON.stringify(n));
    } catch {
      /* the tick still shows */
    }
  };
  const siap = masalah.length === 0 && baru.length + rows.filter((r) => r.promotedNim).length > 0;

  const simpanKode = async (): Promise<boolean> => {
    const r = await recPost<{ ok: true }>("pn-codes", {
      items: rows
        .filter((x) => !x.promotedNim)
        .map((x) => ({
          id: x.id,
          code: x.decision === "terima" ? (x.code ?? "") : "",
          decision: x.decision,
          reason: x.decision === "tolak" ? (x.reason ?? "Kuota") : null,
        })),
    });
    if (isFail(r)) {
      toast(w.err[r.kode] ?? w.code.saveFail, "danger");
      return false;
    }
    return true;
  };
  const kePindah = async (ke: Step) => {
    if (!can) return setStep(ke);
    setBusy(true);
    const ok = await simpanKode();
    setBusy(false);
    if (ok) {
      pn.refresh();
      setStep(ke);
    }
  };
  const jalankan = async () => {
    if (!(await simpanKode())) return;
    const r = await recPost<PnConfirmResponse>("pn-confirm", {});
    if (isFail(r)) return toast(w.err[r.kode] ?? r.kode, "danger");
    setHasil(r);
    pn.refresh();
    if (r.created.length) setPesta(true);
  };
  const ubahTarget = async (delta: number) => {
    const q = Math.max(1, Math.min(200, d.quota + delta));
    if (q === d.quota) return;
    const r = await recPost<{ ok: true }>("setting-save", {
      key: "penerimaan",
      value: { quota: q, closeDays: d.close.closeDays, retentionMonths: d.close.retentionMonths },
    });
    if (isFail(r)) return toast(w.err[r.kode] ?? r.kode, "danger");
    pn.refresh();
  };
  const lainKode = (r: PnRow) => {
    const pakaiLain = new Set([
      ...taken,
      ...rows.filter((x) => x.id !== r.id).map((x) => x.code ?? ""),
    ]);
    if (r.code) pakaiLain.add(r.code);
    const k = usulKode(r.nama, pakaiLain);
    if (k) set(r.id, { code: k, proposedCode: k });
  };

  const cards = (
    <ol className="r8-steps" aria-label={w.title}>
      {(["tinjau", "kode", "konfirmasi"] as Step[]).map((s, i) => {
        const selesai =
          s === "tinjau"
            ? catatan.length === 0 && step !== "tinjau"
            : s === "kode"
              ? step === "konfirmasi" && masalah.length === 0
              : false;
        return (
          <li key={s}>
            <button
              type="button"
              className="r8-step"
              data-st={step === s ? "cur" : selesai ? "done" : "next"}
              aria-current={step === s ? "step" : undefined}
              onClick={() => setStep(s)}
            >
              <span className="r8-step__n">
                {selesai && step !== s ? <CheckIcon size={16} aria-hidden="true" /> : i + 1}
              </span>
              <span className="r8-step__t">
                <b>{w.steps[i]}</b>
                <small>
                  {s === "tinjau"
                    ? l.stepSub.tinjau(catatan.length)
                    : s === "kode"
                      ? l.stepSub.kode(terima.length, masalah.length)
                      : l.stepSub.konfirmasi(siap && catatan.length === 0)}
                </small>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );

  if (!rows.length)
    return (
      <div className="stack">
        <div className="rec-note">
          <b>{w.empty}</b>
          <span>{w.emptyHint}</span>
        </div>
        <Tutup lang={lang} d={d} can={d.canConfirm} refresh={pn.refresh} />
      </div>
    );

  const kata = cari.trim().toLowerCase();
  const nilaiUrut = (r: PnRow) =>
    urut === "mengajar"
      ? (r.scores.mengajar ?? -1)
      : urut === "wawancara"
        ? (r.scores.wawancara ?? -1)
        : (r.scores.tes ?? -1);
  const tampil = rows
    .filter((r) => !kata || r.nama.toLowerCase().includes(kata) || r.nim.includes(kata))
    .filter((r) =>
      saring === "terima"
        ? r.decision === "terima"
        : saring === "tolak"
          ? r.decision === "tolak"
          : saring === "cek"
            ? ragu(r) && !ack.includes(r.id)
            : true,
    )
    .sort((a, b) => (urut === "nama" ? a.nama.localeCompare(b.nama) : nilaiUrut(b) - nilaiUrut(a)));
  const diff = d.quota - terima.length;

  return (
    <div className="stack r8">
      {!d.canConfirm && (
        <div className="rec-note">
          <span>{w.readOnly}</span>
        </div>
      )}
      {cards}

      {step === "tinjau" && (
        <>
          <section
            className="panel r8-quota"
            data-st={diff < 0 ? "over" : diff === 0 ? "at" : "under"}
            aria-label={l.target}
          >
            <div className="r8-quota__main">
              <span className="eyebrow">
                {l.target} <Stc tip={l.stcTip} />
              </span>
              <div className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
                {can ? (
                  <Stepper
                    value={d.quota}
                    min={1}
                    max={60}
                    onChange={(v) => void ubahTarget(v - d.quota)}
                    label={l.target}
                    lessLabel={l.targetLess}
                    moreLabel={l.targetMore}
                  />
                ) : (
                  <b className="r8-quota__n num">{d.quota}</b>
                )}
                <span className="hint">{l.targetUnit(ACCEPT_DEFAULT.quota)}</span>
              </div>
            </div>
            <div className="r8-quota__bar" aria-hidden="true">
              <i
                style={{
                  width: `${Math.min(100, Math.round((terima.length / Math.max(1, d.quota)) * 100))}%`,
                }}
              />
            </div>
            <div className="stack" style={{ gap: 2, minWidth: 0 }}>
              <b>{l.targetLine(terima.length, diff)}</b>
              <span className="hint">{l.targetNote}</span>
            </div>
          </section>

          <div className="row rec-tools r8-tools">
            <div className="rec-search">
              <MagnifyingGlassIcon className="ic" size={18} aria-hidden="true" />
              <input
                className="field__input"
                value={cari}
                placeholder={l.search}
                aria-label={l.search}
                onChange={(e) => setCari(e.target.value)}
              />
            </div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }} role="group">
              {(
                [
                  ["semua", l.fAll, rows.length],
                  ["terima", l.fIn, terima.length],
                  ["tolak", l.fOut, rows.length - terima.length],
                  ["cek", l.fCheck, catatan.length],
                ] as [Saring, string, number][]
              ).map(([k, t, n]) => (
                <button
                  key={k}
                  type="button"
                  className="n7-chip r8-chip"
                  data-k={k}
                  aria-pressed={saring === k}
                  onClick={() => setSaring(k)}
                >
                  {t} <b className="num">{n}</b>
                </button>
              ))}
            </div>
            <span className="grow" />
            <Dropdown
              id="pn-urut"
              label={l.sortLabel}
              hideLabel
              value={urut}
              onChange={(v) => setUrut(v as Urut)}
              options={(["mengajar", "wawancara", "tes", "nama"] as Urut[]).map((u) => ({
                value: u,
                label: l.sorts[u],
              }))}
            />
          </div>

          <section className="panel rec-tablecard r8-tablecard">
            <div className="scrollx">
              <table className="table rec-table r8-table">
                <thead>
                  <tr>
                    <th>{l.colNo}</th>
                    <th>{w.review.cols.name}</th>
                    <th>{w.review.cols.berkas}</th>
                    <th>{w.review.cols.tes}</th>
                    <th>{w.review.cols.wawancara}</th>
                    <th>{w.review.cols.mengajar}</th>
                    <th>{l.colNote}</th>
                    <th>{l.colDecision}</th>
                  </tr>
                </thead>
                <tbody>
                  {tampil.map((r, i) => (
                    <tr
                      key={r.id}
                      className="r8-row"
                      data-in={r.decision === "tolak" ? "no" : "yes"}
                      data-need={ragu(r) && !ack.includes(r.id) ? "yes" : undefined}
                    >
                      <td className="num r8-rank">{i + 1}</td>
                      <td>
                        <span className="stack" style={{ gap: 0 }}>
                          <b>{r.nama}</b>
                          <span className="hint mono">
                            {r.nim}
                            {r.kelas ? ` · ${r.kelas}` : ""}
                          </span>
                        </span>
                      </td>
                      <td>
                        <Nilai v={r.scores.berkas} max={100} tone="info" />
                      </td>
                      <td>
                        <Nilai v={r.scores.tes} max={4000} tone="info" />
                      </td>
                      <td>
                        <Nilai
                          v={r.scores.wawancara}
                          max={100}
                          tone="info"
                          verdict={r.scores.wawancaraVerdict}
                          verdictLabel={
                            r.scores.wawancaraVerdict
                              ? w.review.verdict[r.scores.wawancaraVerdict]
                              : undefined
                          }
                        />
                      </td>
                      <td>
                        <Nilai
                          v={r.scores.mengajar}
                          max={100}
                          tone="gold"
                          verdict={r.scores.mengajarVerdict}
                          verdictLabel={
                            r.scores.mengajarVerdict
                              ? w.review.verdict[r.scores.mengajarVerdict]
                              : undefined
                          }
                        />
                      </td>
                      <td>
                        {ragu(r) ? (
                          <div className="r8-notes">
                            <span className="r8-flag" data-t="warn">
                              <WarningIcon size={14} aria-hidden="true" />
                              {l.noteRagu}
                            </span>
                            <button
                              type="button"
                              className="r8-ack"
                              aria-pressed={ack.includes(r.id)}
                              onClick={() => tandai(r.id)}
                            >
                              {ack.includes(r.id) ? (
                                <CheckCircleIcon size={14} aria-hidden="true" />
                              ) : (
                                <ClockIcon size={14} aria-hidden="true" />
                              )}
                              {ack.includes(r.id) ? l.checked : l.markChecked}
                            </button>
                          </div>
                        ) : (
                          <span className="hint">-</span>
                        )}
                      </td>
                      <td>
                        {r.promotedNim ? (
                          <Pill tone="ok">{w.review.promoted}</Pill>
                        ) : (
                          <div className="r8-dec">
                            <span className="n7-seg r8-seg" role="group" aria-label={r.nama}>
                              {(["terima", "tolak"] as const).map((x) => (
                                <button
                                  key={x}
                                  type="button"
                                  data-v={x === "terima" ? "lolos" : "gagal"}
                                  aria-pressed={r.decision === x}
                                  disabled={!can}
                                  onClick={() => {
                                    if ((x === "terima") === (r.decision === "terima")) return;
                                    set(r.id, {
                                      decision: x,
                                      reason: x === "tolak" ? "Kuota" : null,
                                    });
                                    toast(
                                      (x === "terima" ? l.toastYes : l.toastNo)(
                                        r.nama.split(" ")[0],
                                      ),
                                    );
                                  }}
                                >
                                  {x === "terima" ? w.review.accept : l.rejectShort}
                                </button>
                              ))}
                            </span>
                            {r.decision === "tolak" && (
                              <Dropdown
                                id={`pn-alasan-${r.id}`}
                                label={l.reasonLabel}
                                hideLabel
                                value={r.reason ?? "Kuota"}
                                disabled={!can}
                                onChange={(v) =>
                                  set(r.id, { reason: v as NonNullable<PnRow["reason"]> })
                                }
                                options={(["Kuota", "Mundur", "Pleno", "Lain"] as const).map(
                                  (k) => ({
                                    value: k,
                                    label: l.reasons[k],
                                  }),
                                )}
                              />
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {tampil.length === 0 && (
                    <tr>
                      <td colSpan={8}>
                        <span className="hint">{l.none}</span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
          <span className="hint r8-legend">{l.legend(rows.length - terima.length)}</span>
          <div className="r8-foot">
            <span className="r8-foot__info">
              {l.foot(terima.length, rows.length - terima.length, catatan.length)}
            </span>
            <span className="grow" />
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy}
              onClick={() => {
                if (catatan.length) setSaring("cek");
                else void kePindah("kode");
              }}
            >
              <span className="btn__label">
                {catatan.length ? l.footCheck(catatan.length) : l.footNext}
              </span>
              <ArrowRightIcon size={16} weight="bold" aria-hidden="true" />
            </button>
          </div>
        </>
      )}

      {step === "kode" && (
        <>
          <section className="panel r8-rule">
            <div className="r8-rule__t">
              <span className="r8-rule__ic">
                <KeyIcon size={20} aria-hidden="true" />
              </span>
              <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                <b>{l.ruleTitle}</b>
                <span className="hint">{l.ruleHint}</span>
              </div>
            </div>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPakai(true)}>
              <ListChecksIcon size={16} aria-hidden="true" />
              <span className="btn__label">{l.usedBtn(d.taken.length)}</span>
            </button>
          </section>
          <Dialog
            open={pakai}
            onOpenChange={setPakai}
            title={l.usedTitle}
            description={l.usedHint(d.taken.length)}
            size="form"
            lang={lang}
            actions={
              <button type="button" className="btn btn--primary" onClick={() => setPakai(false)}>
                <span className="btn__label">{l.close}</span>
              </button>
            }
          >
            <div className="r8-used">
              {[...d.taken].sort().map((k) => (
                <span key={k} className="r8-usedc">
                  <b className="mono">{k}</b>
                </span>
              ))}
            </div>
          </Dialog>
          {masalah.length > 0 && (
            <div className="rec-note rec-note--warn r8-clashnote" role="alert">
              <b>{l.clash(masalah.length)}</b>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                {masalah.map((c) => {
                  const r = rows.find((x) => x.id === c.id)!;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className="r8-clashchip"
                      onClick={() => {
                        const el = document.querySelector<HTMLElement>(`[data-code="${c.id}"]`);
                        el?.scrollIntoView({ block: "center" });
                        el?.focus();
                      }}
                    >
                      <b className="mono">{r.code || "???"}</b>
                      {r.nama.split(" ")[0]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <section className="panel rec-tablecard r8-tablecard">
            <div className="scrollx">
              <table className="table rec-table r8-table r8-ctable">
                <thead>
                  <tr>
                    <th>{l.colNo}</th>
                    <th>{w.review.cols.name}</th>
                    <th>{l.colCode}</th>
                    <th>{l.colCheck}</th>
                    <th>{l.colWhy}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {terima.map((r, i) => {
                    const c = cek.find((x) => x.id === r.id);
                    return (
                      <tr key={r.id} className="r8-row" data-bad={c?.problem ? "yes" : undefined}>
                        <td className="num r8-rank">{i + 1}</td>
                        <td>
                          <div className="r8-who">
                            <b>{r.nama}</b>
                            <span className="hint mono">{r.nim}</span>
                          </div>
                        </td>
                        <td>
                          <input
                            className="input mono r8-code"
                            data-code={r.id}
                            data-bad={c?.problem ? "yes" : undefined}
                            spellCheck={false}
                            autoCapitalize="characters"
                            maxLength={3}
                            value={r.code ?? ""}
                            placeholder={w.code.placeholder}
                            disabled={!can || !!r.promotedNim}
                            aria-invalid={c?.problem ? true : undefined}
                            aria-label={`${w.code.col} ${r.nama}`}
                            onChange={(e) =>
                              set(r.id, {
                                code: e.target.value.toUpperCase().replace(/[^A-Z]/g, ""),
                              })
                            }
                          />
                        </td>
                        <td>
                          {c?.problem ? (
                            <Pill tone="danger">{w.code.problem[c.problem]}</Pill>
                          ) : r.promotedNim ? (
                            <Pill tone="ok">{w.review.promoted}</Pill>
                          ) : (
                            <Pill tone="ok">
                              <CheckIcon size={12} aria-hidden="true" /> {l.unique}
                            </Pill>
                          )}
                        </td>
                        <td>
                          <span className="hint">
                            {r.proposedCode && r.proposedCode === r.code
                              ? l.whyProposed
                              : l.whyEdited}
                          </span>
                        </td>
                        <td>
                          {can && !r.promotedNim && (
                            <button
                              type="button"
                              className="iconbtn"
                              aria-label={l.another}
                              title={l.another}
                              onClick={() => lainKode(r)}
                            >
                              <ArrowsClockwiseIcon size={16} aria-hidden="true" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <span className={masalah.length ? "hint r8bad" : "hint r8good"} role="status">
            {masalah.length ? w.code.fix(masalah.length) : w.code.ok} · {w.code.rule}
          </span>
          <div className="r8-foot">
            <button type="button" className="btn btn--ghost" onClick={() => setStep("tinjau")}>
              <span className="btn__label">{w.code.back}</span>
            </button>
            <span className="grow" />
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy}
              onClick={() => void kePindah("konfirmasi")}
            >
              <span className="btn__label">{w.code.next}</span>
              <ArrowRightIcon size={16} weight="bold" aria-hidden="true" />
            </button>
          </div>
        </>
      )}

      {step === "konfirmasi" && (
        <>
          <div className="r8-konf">
            <section className="panel r8-check">
              <div className="panel__head">
                <h3 className="panel__title">{l.readiness}</h3>
                <Pill tone={siap && catatan.length === 0 ? "ok" : "warn"}>
                  {siap && catatan.length === 0 ? l.ready : l.notReady}
                </Pill>
              </div>
              <ul className="r8-tasks">
                {(
                  [
                    {
                      ok: catatan.length === 0,
                      ic: ListChecksIcon,
                      t: l.rowReviewed,
                      sub:
                        catatan.length === 0
                          ? l.rowReviewedSub(terima.length, rows.length - terima.length)
                          : l.rowReviewedOpen(catatan.length),
                      go: () => setStep("tinjau"),
                    },
                    {
                      ok: masalah.length === 0 && terima.length > 0,
                      ic: KeyIcon,
                      t: l.rowCodes,
                      sub:
                        masalah.length === 0
                          ? l.rowCodesSub(terima.length)
                          : l.rowCodesBad(masalah.length),
                      go: () => setStep("kode"),
                    },
                    {
                      ok: true,
                      info: true,
                      ic: UsersThreeIcon,
                      t: l.rowTarget,
                      sub: l.targetLine(terima.length, diff),
                    },
                    ...(d.revealAt
                      ? [
                          {
                            ok: true,
                            info: true,
                            ic: CalendarCheckIcon,
                            t: l.rowAnnounce,
                            sub: tglJam(d.revealAt, lang),
                          },
                        ]
                      : []),
                    {
                      ok: true,
                      info: true,
                      ic: LockSimpleIcon,
                      t: l.rowClose,
                      sub: l.rowCloseSub(d.close.closeDays),
                    },
                  ] as {
                    ok: boolean;
                    info?: boolean;
                    ic: typeof KeyIcon;
                    t: string;
                    sub: string;
                    go?: () => void;
                  }[]
                ).map((r) => (
                  <li key={r.t}>
                    <button
                      type="button"
                      className="r8-task"
                      data-ok={r.ok ? "yes" : "no"}
                      data-info={r.info ? "yes" : undefined}
                      disabled={!r.go}
                      onClick={r.go}
                    >
                      <span className="r8-task__st">
                        {r.info ? (
                          <InfoIcon size={20} aria-hidden="true" />
                        ) : r.ok ? (
                          <CheckCircleIcon size={20} aria-hidden="true" />
                        ) : (
                          <ClockIcon size={20} aria-hidden="true" />
                        )}
                      </span>
                      <span className="r8-task__ic">
                        <r.ic size={18} aria-hidden="true" />
                      </span>
                      <span className="r8-task__b">
                        <b>{r.t}</b>
                        <span className="hint">{r.sub}</span>
                      </span>
                      {r.go && <CaretRightIcon size={16} aria-hidden="true" />}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            <aside className="panel r8-go" data-ready={siap && catatan.length === 0 ? "yes" : "no"}>
              <span className="eyebrow">{l.goEyebrow}</span>
              <div className="r8-go__big">
                <b className="num">{terima.length}</b>
                <span>{l.goUnit}</span>
              </div>
              <span className="hint">{l.goHint}</span>
              <span className="r8-go__hint">
                <ArrowDownIcon size={14} aria-hidden="true" />
                {d.canConfirm ? l.goBar : w.confirm.notKetua}
              </span>
            </aside>
          </div>
          {masalah.length > 0 && (
            <div className="rec-note rec-note--warn">
              <span>{w.confirm.blocked(masalah.length)}</span>
            </div>
          )}
          <div className="r8-foot">
            <button type="button" className="btn btn--ghost" onClick={() => setStep("kode")}>
              <span className="btn__label">{w.confirm.back}</span>
            </button>
            <span className="grow" />
            <button
              type="button"
              className="btn btn--primary"
              disabled={!can || masalah.length > 0 || busy}
              onClick={() => setRingkas(true)}
            >
              <SealCheckIcon size={18} aria-hidden="true" />
              <span className="btn__label">{d.done ? w.result.again : l.goButton}</span>
            </button>
          </div>
          <Dialog
            open={ringkas}
            onOpenChange={setRingkas}
            title={l.sumTitle}
            description={l.sumDesc}
            size="form"
            lang={lang}
            actions={
              <>
                <button type="button" className="btn btn--ghost" onClick={() => setRingkas(false)}>
                  <span className="btn__label">{l.back}</span>
                </button>
                <HoldButton
                  label={d.done ? w.result.again : w.confirm.hold}
                  tint="ok"
                  icon={SealCheckIcon}
                  tone="primary"
                  disabled={!can || masalah.length > 0 || busy}
                  onDone={() => {
                    setRingkas(false);
                    void jalankan();
                  }}
                  ms={1600}
                />
              </>
            }
          >
            <div className="r8-sum">
              <div className="r8-tiles">
                <div data-t="ok">
                  <b className="num">{terima.length}</b>
                  <small>{l.sumBecome}</small>
                </div>
                <div data-t="faint">
                  <b className="num">{rows.length - terima.length}</b>
                  <small>{l.sumOut}</small>
                </div>
              </div>
              <div className="r8-sum2">
                <section className="stack stack--sm">
                  <h3 className="h3">{l.sumCodes}</h3>
                  <div className="r8-codes">
                    {terima.map((r) => (
                      <span key={r.id} className="r8-codec" title={r.nama}>
                        <b className="mono">{r.code || "---"}</b>
                        <span>{r.nama.split(" ")[0]}</span>
                      </span>
                    ))}
                  </div>
                </section>
                <section className="stack stack--sm">
                  <h3 className="h3">{l.sumWhat}</h3>
                  <ul className="r8-will">
                    {l.what.map((x) => (
                      <li key={x}>
                        <CheckIcon size={16} aria-hidden="true" />
                        <span>{x}</span>
                      </li>
                    ))}
                    {d.revealAt && (
                      <li>
                        <EnvelopeSimpleIcon size={16} aria-hidden="true" />
                        <span>{w.confirm.envelope(tglJam(d.revealAt, lang))}</span>
                      </li>
                    )}
                  </ul>
                </section>
              </div>
            </div>
          </Dialog>
        </>
      )}

      {(hasil || d.done) && (
        <section className="panel r8-hero" data-st={hasil ? "new" : "again"} aria-live="polite">
          <span className="r8-hero__seal">
            <SealCheckIcon size={30} aria-hidden="true" />
          </span>
          <div className="stack stack--sm" style={{ minWidth: 0 }}>
            <span className="eyebrow">{hasil ? l.doneEyebrow : l.doneAgain}</span>
            <h2 className="r8-hero__t">
              {hasil && hasil.created.length
                ? w.result.created(hasil.created.length)
                : w.result.nothing}
            </h2>
            <span className="hint">{l.doneHint}</span>
            {hasil && hasil.rejected > 0 && (
              <span className="hint">{w.result.rejected(hasil.rejected)}</span>
            )}
          </div>
          <span className="grow" />
          {hasil && hasil.created.length > 0 && (
            <button type="button" className="btn btn--inverse" onClick={() => setPesta(true)}>
              <ConfettiIcon size={18} aria-hidden="true" />
              <span className="btn__label">{w.result.celebrate}</span>
            </button>
          )}
        </section>
      )}
      {hasil && hasil.created.length > 0 && (
        <section className="panel rec-tablecard r8-tablecard">
          <div className="panel__head">
            <h3 className="panel__title">{l.created}</h3>
          </div>
          <div className="scrollx">
            <table className="table rec-table r8-table r8-htable">
              <thead>
                <tr>
                  <th>{l.colCode}</th>
                  <th>{l.colName}</th>
                  <th>{l.colNim}</th>
                </tr>
              </thead>
              <tbody>
                {hasil.created.map((c) => (
                  <tr key={c.nim} className="r8-row">
                    <td>
                      <span className="r8-pcode mono">{c.kode}</span>
                    </td>
                    <td>
                      <div className="r8-who">
                        <b>{c.nama}</b>
                        <span className="mono hint">{c.nim}</span>
                      </div>
                    </td>
                    <td className="hint mono">{c.nim}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Tutup lang={lang} d={d} can={d.canConfirm} refresh={pn.refresh} />
      {pesta && hasil && (
        <Rayakan lang={lang} baru={hasil.created} onClose={() => setPesta(false)} />
      )}
    </div>
  );
}
