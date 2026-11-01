/**
 * The Penerimaan tab (mockup r8-final, r8-hasil, r8-rayakan, r8-tutup). One job:
 * confirm the final list. Three guided steps: Tinjau (the CaAs who passed
 * Mengajar with every score, who is in and who is out), Kode (a unique three
 * letter code for each new Asisten, proposed from the name and editable) and
 * Konfirmasi (a summary and a hold button). Only the Ketua confirms; the rest
 * of the Panitia read. Under it: the result, and closing the edition.
 */
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  CalendarCheckIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckCircleIcon,
  CheckIcon,
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
  return (
    <span className="r8sc" data-tone={tone}>
      <b className="num">{v}</b>
      <span className="r8sc__bar">
        <i style={{ width: `${Math.max(0, Math.min(100, (v / max) * 100))}%` }} />
      </span>
      {verdict && verdictLabel && (
        <span className="r8vd" data-v={verdict}>
          {verdictLabel}
        </span>
      )}
    </span>
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
    <nav className="r8st" aria-label={w.title}>
      {(["tinjau", "kode", "konfirmasi"] as Step[]).map((s, i) => {
        const selesai =
          s === "tinjau"
            ? catatan.length === 0 && step !== "tinjau"
            : s === "kode"
              ? step === "konfirmasi" && masalah.length === 0
              : false;
        return (
          <button
            key={s}
            type="button"
            className="r8st__c"
            aria-current={step === s ? "step" : undefined}
            data-done={selesai ? "yes" : undefined}
            onClick={() => setStep(s)}
          >
            <span className="r8st__n">
              {selesai ? <CheckIcon size={16} weight="bold" aria-hidden="true" /> : i + 1}
            </span>
            <span className="stack" style={{ gap: 0, minWidth: 0 }}>
              <b>{w.steps[i]}</b>
              <span className="hint">
                {s === "tinjau"
                  ? l.stepSub.tinjau(catatan.length)
                  : s === "kode"
                    ? l.stepSub.kode(terima.length, masalah.length)
                    : l.stepSub.konfirmasi(siap && catatan.length === 0)}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
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
          <section className="panel r8tg">
            <div className="stack" style={{ gap: 8 }}>
              <span className="eyebrow">{l.target}</span>
              <div className="row" style={{ gap: 10, alignItems: "center" }}>
                <span className="r8tg__step">
                  <button
                    type="button"
                    className="iconbtn"
                    aria-label={l.targetLess}
                    disabled={!can}
                    onClick={() => void ubahTarget(-1)}
                  >
                    <CaretLeftIcon size={16} aria-hidden="true" />
                  </button>
                  <b className="num">{d.quota}</b>
                  <button
                    type="button"
                    className="iconbtn"
                    aria-label={l.targetMore}
                    disabled={!can}
                    onClick={() => void ubahTarget(1)}
                  >
                    <CaretRightIcon size={16} aria-hidden="true" />
                  </button>
                </span>
                <span className="hint">{l.targetUnit(ACCEPT_DEFAULT.quota)}</span>
              </div>
            </div>
            <span className="r8tg__bar" aria-hidden="true">
              <i
                style={{ width: `${Math.min(100, (terima.length / Math.max(1, d.quota)) * 100)}%` }}
              />
            </span>
            <div className="stack" style={{ gap: 4, minWidth: 0 }}>
              <b>{l.targetLine(terima.length, diff)}</b>
              <span className="hint">{l.targetNote}</span>
            </div>
          </section>

          <div className="row rec-tools r8tools">
            <label className="rec9-search">
              <MagnifyingGlassIcon size={18} aria-hidden="true" />
              <input
                className="field__input"
                value={cari}
                placeholder={l.search}
                aria-label={l.search}
                onChange={(e) => setCari(e.target.value)}
              />
            </label>
            <div className="rec9-chips" role="group">
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
                  className="rec9-chip"
                  data-k={
                    k === "terima"
                      ? "disetujui"
                      : k === "tolak"
                        ? "revisi"
                        : k === "cek"
                          ? "menunggu"
                          : "semua"
                  }
                  aria-pressed={saring === k}
                  onClick={() => setSaring(k)}
                >
                  <span>{t}</span>
                  <b className="num">{n}</b>
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

          <section className="panel rec-tablecard r8card">
            <div className="scrollx">
              <table className="table rec-table r8table">
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
                    <tr key={r.id} data-out={r.decision === "tolak" ? "yes" : undefined}>
                      <td className="num r8rank">{i + 1}</td>
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
                          <span className="r8note">
                            <span className="r8flag" data-t="warn">
                              <WarningIcon size={14} aria-hidden="true" />
                              {l.noteRagu}
                            </span>
                            <button
                              type="button"
                              className="r8ack"
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
                          </span>
                        ) : (
                          <span className="hint">-</span>
                        )}
                      </td>
                      <td>
                        {r.promotedNim ? (
                          <Pill tone="ok">{w.review.promoted}</Pill>
                        ) : (
                          <div className="r8seg" role="radiogroup" aria-label={r.nama}>
                            {(["terima", "tolak"] as const).map((x) => (
                              <button
                                key={x}
                                type="button"
                                role="radio"
                                className="r8seg__b"
                                data-t={x === "terima" ? "ok" : "danger"}
                                aria-checked={r.decision === x}
                                disabled={!can}
                                onClick={() => set(r.id, { decision: x })}
                              >
                                {x === "terima" ? w.review.accept : w.review.reject}
                              </button>
                            ))}
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
          <span className="hint r8legend">{l.legend(rows.length - terima.length)}</span>
          <div className="r8bar">
            <span className="hint">
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
          <section className="panel r8rule">
            <span className="r8rule__ic">
              <KeyIcon size={20} aria-hidden="true" />
            </span>
            <div className="stack" style={{ gap: 2, minWidth: 0 }}>
              <b>{l.ruleTitle}</b>
              <span className="hint">{l.ruleHint}</span>
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
            size="lg"
            lang={lang}
            actions={
              <button type="button" className="btn btn--primary" onClick={() => setPakai(false)}>
                <span className="btn__label">{l.close}</span>
              </button>
            }
          >
            <div className="r8used">
              {[...d.taken].sort().map((k) => (
                <b key={k} className="r8usedc mono">
                  {k}
                </b>
              ))}
            </div>
          </Dialog>
          {masalah.length > 0 && (
            <div className="rec-note rec-note--warn" role="alert">
              <b>{l.clash(masalah.length)}</b>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                {masalah.map((c) => {
                  const r = rows.find((x) => x.id === c.id)!;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className="r8clashchip"
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
          <section className="panel rec-tablecard r8card">
            <div className="scrollx">
              <table className="table rec-table r8table">
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
                      <tr key={r.id} data-bad={c?.problem ? "yes" : undefined}>
                        <td className="num r8rank">{i + 1}</td>
                        <td>
                          <span className="stack" style={{ gap: 0 }}>
                            <b>{r.nama}</b>
                            <span className="hint mono">{r.nim}</span>
                          </span>
                        </td>
                        <td>
                          <input
                            className="field__input r8code"
                            data-code={r.id}
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
          <div className="r8bar">
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
          <div className="r8konf">
            <section className="panel r8check">
              <div className="panel__head">
                <h3 className="panel__title">{l.readiness}</h3>
                <Pill tone={siap && catatan.length === 0 ? "ok" : "warn"}>
                  {siap && catatan.length === 0 ? l.ready : l.notReady}
                </Pill>
              </div>
              <ul className="r8tasks">
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
                      className="r8task"
                      data-ok={r.ok ? "yes" : "no"}
                      data-info={r.info ? "yes" : undefined}
                      disabled={!r.go}
                      onClick={r.go}
                    >
                      <span className="r8task__st">
                        {r.info ? (
                          <InfoIcon size={20} aria-hidden="true" />
                        ) : r.ok ? (
                          <CheckCircleIcon size={20} aria-hidden="true" />
                        ) : (
                          <ClockIcon size={20} aria-hidden="true" />
                        )}
                      </span>
                      <span className="r8task__ic">
                        <r.ic size={18} aria-hidden="true" />
                      </span>
                      <span className="stack" style={{ gap: 1, minWidth: 0 }}>
                        <b>{r.t}</b>
                        <span className="hint">{r.sub}</span>
                      </span>
                      {r.go && <CaretRightIcon size={16} aria-hidden="true" />}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            <aside className="panel r8go" data-ready={siap && catatan.length === 0 ? "yes" : "no"}>
              <span className="eyebrow">{l.goEyebrow}</span>
              <div className="r8go__big">
                <b className="num">{terima.length}</b>
                <span>{l.goUnit}</span>
              </div>
              <span className="hint">{l.goHint}</span>
              <span className="r8go__hint">
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
          <div className="r8bar">
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
            size="lg"
            lang={lang}
            actions={
              <>
                <button type="button" className="btn btn--ghost" onClick={() => setRingkas(false)}>
                  <span className="btn__label">{l.back}</span>
                </button>
                <HoldButton
                  label={d.done ? w.result.again : w.confirm.hold}
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
            <div className="r8sum">
              <div className="r8tiles">
                <div data-t="ok">
                  <b className="num">{terima.length}</b>
                  <small>{l.sumBecome}</small>
                </div>
                <div data-t="faint">
                  <b className="num">{rows.length - terima.length}</b>
                  <small>{l.sumOut}</small>
                </div>
              </div>
              <div className="r8sum2">
                <section className="stack stack--sm">
                  <h3 className="h3">{l.sumCodes}</h3>
                  <div className="r8chips">
                    {terima.map((r) => (
                      <span key={r.id} className="r8chip" title={r.nama}>
                        <b className="acode">{r.code || "---"}</b>
                        {r.nama.split(" ")[0]}
                      </span>
                    ))}
                  </div>
                </section>
                <section className="stack stack--sm">
                  <h3 className="h3">{l.sumWhat}</h3>
                  <ul className="r8will">
                    {l.what.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                    {d.revealAt && <li>{w.confirm.envelope(tglJam(d.revealAt, lang))}</li>}
                  </ul>
                </section>
              </div>
            </div>
          </Dialog>
        </>
      )}

      {(hasil || d.done) && (
        <section className="panel r8hero" data-st={hasil ? "new" : "again"} aria-live="polite">
          <span className="r8hero__seal">
            <SealCheckIcon size={30} aria-hidden="true" />
          </span>
          <div className="stack stack--sm" style={{ minWidth: 0 }}>
            <span className="eyebrow">{hasil ? l.doneEyebrow : l.doneAgain}</span>
            <h2 className="r8hero__t">
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
        <section className="panel rec-tablecard r8card">
          <div className="panel__head">
            <h3 className="panel__title">{l.created}</h3>
          </div>
          <div className="scrollx">
            <table className="table rec-table r8table">
              <thead>
                <tr>
                  <th>{l.colCode}</th>
                  <th>{l.colName}</th>
                  <th>{l.colNim}</th>
                </tr>
              </thead>
              <tbody>
                {hasil.created.map((c) => (
                  <tr key={c.nim}>
                    <td>
                      <b className="acode">{c.kode}</b>
                    </td>
                    <td>
                      <b>{c.nama}</b>
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
