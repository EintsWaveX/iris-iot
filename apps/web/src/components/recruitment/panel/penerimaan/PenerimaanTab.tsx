/**
 * The Penerimaan tab (mockup r8-final, r8-hasil, r8-rayakan, r8-tutup). One job:
 * confirm the final list. Three guided steps: Tinjau (the CaAs who passed
 * Mengajar with every score, who is in and who is out), Kode (a unique three
 * letter code for each new Asisten, proposed from the name and editable) and
 * Konfirmasi (a summary and a hold button). Only the Ketua confirms; the rest
 * of the Panitia read. Under it: the result, and closing the edition.
 */
import { useEffect, useMemo, useState } from "react";
import Confirm from "../../../ui/Confirm";
import HoldButton from "../../../ui/HoldButton";
import Pill from "../../../ui/Pill";
import type { Lang } from "../../../../lib/kelas";
import { isFail, recPost } from "../../../../lib/recruitment/client";
import { cekKode } from "../../../../lib/recruitment/penerimaan";
import {
  useRecPn,
  type PnConfirmResponse,
  type PnListResponse,
  type PnRow,
} from "../../../../lib/recruitment/pn-client";
import Rayakan from "./Rayakan";
import { PNW } from "./pnStrings";
import "../../recruitment-r8.css";

type Step = "tinjau" | "kode" | "konfirmasi";
const TONE = { lolos: "ok", ragu: "warn", cut: "danger" } as const;
const toast = (m: string, tone: "ok" | "warn" | "danger" = "ok") => window.Toast?.show(m, tone);
const tglJam = (iso: string, lang: Lang) =>
  new Intl.DateTimeFormat(lang === "id" ? "id-ID" : "en-GB", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
const tgl = (iso: string, lang: Lang) =>
  new Intl.DateTimeFormat(lang === "id" ? "id-ID" : "en-GB", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));

function Skor({ v, verdict }: { v: number | null; verdict?: "lolos" | "ragu" | "cut" | null }) {
  if (v === null) return <span className="hint">-</span>;
  return (
    <span className="stack" style={{ gap: 2, alignItems: "flex-start" }}>
      <b className="num">{v}</b>
      {verdict && <span className="r8dot" data-t={TONE[verdict]} aria-hidden="true" />}
    </span>
  );
}

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

export default function PenerimaanTab({ lang }: { lang: Lang }) {
  const w = PNW(lang);
  const pn = useRecPn(true);
  const d = pn.data;
  const [step, setStep] = useState<Step>("tinjau");
  const [rows, setRows] = useState<PnRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasil, setHasil] = useState<PnConfirmResponse | null>(null);
  const [pesta, setPesta] = useState(false);

  // The server's list seeds the local edits; a change from elsewhere replaces it unless the Ketua is mid-edit.
  const sumber = useMemo(() => (d ? JSON.stringify(d.rows) : ""), [d]);
  useEffect(() => {
    if (d) setRows(structuredClone(d.rows));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const stepNav = (
    <nav className="r8steps" aria-label={w.title}>
      {(["tinjau", "kode", "konfirmasi"] as Step[]).map((s, i) => (
        <button
          key={s}
          type="button"
          className="r8steps__b"
          aria-current={step === s ? "step" : undefined}
          onClick={() => setStep(s)}
        >
          <span className="r8steps__n">{i + 1}</span>
          <b>{w.steps[i]}</b>
        </button>
      ))}
    </nav>
  );

  if (!rows.length)
    return (
      <div className="stack">
        <p className="hint">{w.lede}</p>
        <div className="rec-note">
          <b>{w.empty}</b>
          <span>{w.emptyHint}</span>
        </div>
        <Tutup lang={lang} d={d} can={d.canConfirm} refresh={pn.refresh} />
      </div>
    );

  return (
    <div className="stack r8">
      <p className="hint">{w.lede}</p>
      {!d.canConfirm && (
        <div className="rec-note">
          <span>{w.readOnly}</span>
        </div>
      )}
      {stepNav}

      {step === "tinjau" && (
        <section className="panel stack">
          <div className="row row--between" style={{ gap: 12, flexWrap: "wrap" }}>
            <span className="hint">{w.quota(terima.length, d.quota)}</span>
            <Pill tone={terima.length >= d.quota ? "ok" : "warn"}>
              {w.review.inCount(terima.length, rows.length)}
            </Pill>
          </div>
          <div className="scrollx">
            <table className="table r8table">
              <thead>
                <tr>
                  <th>{w.review.cols.name}</th>
                  <th className="num">{w.review.cols.berkas}</th>
                  <th className="num">{w.review.cols.tes}</th>
                  <th className="num">{w.review.cols.wawancara}</th>
                  <th className="num">{w.review.cols.mengajar}</th>
                  <th>{w.review.cols.decision}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} data-out={r.decision === "tolak" ? "yes" : undefined}>
                    <td>
                      <span className="stack" style={{ gap: 0 }}>
                        <b>{r.nama}</b>
                        <span className="hint mono">{r.nim}</span>
                      </span>
                    </td>
                    <td className="num">
                      <Skor v={r.scores.berkas} />
                    </td>
                    <td className="num">
                      <Skor v={r.scores.tes} />
                    </td>
                    <td className="num">
                      <Skor v={r.scores.wawancara} verdict={r.scores.wawancaraVerdict} />
                    </td>
                    <td className="num">
                      <Skor v={r.scores.mengajar} verdict={r.scores.mengajarVerdict} />
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
              </tbody>
            </table>
          </div>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy}
              onClick={() => void kePindah("kode")}
            >
              {w.review.next}
            </button>
          </div>
        </section>
      )}

      {step === "kode" && (
        <section className="panel stack">
          <p className="hint">{w.code.lede}</p>
          <div className="scrollx">
            <table className="table r8table">
              <thead>
                <tr>
                  <th>{w.review.cols.name}</th>
                  <th>{w.code.col}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {terima.map((r) => {
                  const c = cek.find((x) => x.id === r.id);
                  return (
                    <tr key={r.id}>
                      <td>
                        <b>{r.nama}</b>
                      </td>
                      <td>
                        <input
                          className="field__input r8code"
                          maxLength={3}
                          value={r.code ?? ""}
                          placeholder={w.code.placeholder}
                          disabled={!can || !!r.promotedNim}
                          aria-invalid={c?.problem ? true : undefined}
                          aria-label={`${w.code.col} ${r.nama}`}
                          onChange={(e) =>
                            set(r.id, { code: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })
                          }
                        />
                      </td>
                      <td>
                        {c?.problem ? (
                          <Pill tone="danger">{w.code.problem[c.problem]}</Pill>
                        ) : r.promotedNim ? (
                          <Pill tone="ok">{w.review.promoted}</Pill>
                        ) : r.proposedCode && r.proposedCode === r.code ? (
                          <span className="hint">{w.code.propose}</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <span className={masalah.length ? "hint r8bad" : "hint r8good"} role="status">
            {masalah.length ? w.code.fix(masalah.length) : w.code.ok} · {w.code.rule}
          </span>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <button type="button" className="btn btn--ghost" onClick={() => setStep("tinjau")}>
              {w.code.back}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy}
              onClick={() => void kePindah("konfirmasi")}
            >
              {w.code.next}
            </button>
          </div>
        </section>
      )}

      {step === "konfirmasi" && (
        <section className="panel stack">
          <h3 className="panel__title">{w.confirm.title}</h3>
          <p>{w.confirm.summary(terima.length, rows.length - terima.length)}</p>
          <ul className="r8close__l">
            <li>{w.confirm.noDivision}</li>
            <li>{w.confirm.history}</li>
            <li>{w.confirm.twice}</li>
            <li>{w.confirm.audit}</li>
            {d.revealAt && <li>{w.confirm.envelope(tglJam(d.revealAt, lang))}</li>}
          </ul>
          <div className="r8chips">
            {terima.map((r) => (
              <span key={r.id} className="r8chip">
                <b className="acode">{r.code || "---"}</b>
                {r.nama}
              </span>
            ))}
          </div>
          {masalah.length > 0 && (
            <div className="rec-note rec-note--warn">
              <span>{w.confirm.blocked(masalah.length)}</span>
            </div>
          )}
          {!d.canConfirm && <span className="hint">{w.confirm.notKetua}</span>}
          <div
            className="row"
            style={{
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <button type="button" className="btn btn--ghost" onClick={() => setStep("kode")}>
              {w.confirm.back}
            </button>
            <div className="stack" style={{ gap: 4, alignItems: "flex-end" }}>
              <HoldButton
                label={d.done ? w.result.again : w.confirm.hold}
                tone="primary"
                disabled={!can || masalah.length > 0 || busy}
                onDone={() => void jalankan()}
                ms={1600}
              />
              <span className="hint">{w.confirm.holdHint}</span>
            </div>
          </div>
        </section>
      )}

      {(hasil || d.done) && (
        <section className="panel stack r8hasil" aria-live="polite">
          <h3 className="panel__title">{w.result.title}</h3>
          {hasil ? (
            <>
              <p>
                {hasil.created.length ? w.result.created(hasil.created.length) : w.result.nothing}
              </p>
              {hasil.created.length > 0 && (
                <ul className="r8close__l">
                  {hasil.created.map((c) => (
                    <li key={c.nim}>
                      <b className="acode">{c.kode}</b> {c.nama}{" "}
                      <span className="hint mono">{c.nim}</span>
                    </li>
                  ))}
                </ul>
              )}
              {hasil.already.length > 0 && (
                <p className="hint">
                  {w.result.already}: {hasil.already.map((a) => `${a.kode} (${a.nim})`).join(", ")}
                </p>
              )}
              {hasil.rejected > 0 && <p className="hint">{w.result.rejected(hasil.rejected)}</p>}
              <span className="hint">{w.result.auditLine}</span>
            </>
          ) : (
            <p className="hint">{w.result.nothing}</p>
          )}
          {hasil && hasil.created.length > 0 && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              style={{ alignSelf: "flex-start" }}
              onClick={() => setPesta(true)}
            >
              {w.result.celebrate}
            </button>
          )}
        </section>
      )}

      <Tutup lang={lang} d={d} can={d.canConfirm} refresh={pn.refresh} />
      {pesta && hasil && (
        <Rayakan lang={lang} baru={hasil.created} onClose={() => setPesta(false)} />
      )}
    </div>
  );
}
