/**
 * The panel's Kandidat (prompt 03, mockup r1-panel): everyone who applied,
 * as a table from 820 px and a list below, with a search and a status
 * filter, and a side sheet per candidate. The sheet shows the biodata and
 * the three PDFs only to the documents right (Admin and the Ketua); the
 * approve right (Admin and the Ketua) approves, or bounces the application
 * back with a note the candidate sees on their page and on Home.
 * The approve right also sees the oprec account beside the practicum
 * roster's name, with Reset Akun (AkunCek, 2026-10-24).
 *
 * GET candidates and GET candidate?id=; POST review. A review reaches the
 * candidate's own page through the reccandidates topic.
 */
import { useEffect, useState } from "react";
import Dialog from "../../ui/Dialog";
import Drawer from "../../ui/Drawer";
import Dropdown from "../../ui/Dropdown";
import Pill from "../../ui/Pill";
import { tanggalPanjang } from "../../../lib/app";
import type { Lang } from "../../../lib/kelas";
import { isFail, recGet, recPost } from "../../../lib/recruitment/client";
import { tanggalWib } from "../../../lib/recruitment/gates";
import {
  CANDIDATE_STATUS,
  DOC_REQUIRED,
  type CandidateDetailResponse,
  type CandidateRow,
  type RecRights,
  type ReviewResponse,
} from "../../../lib/recruitment/types";
import { CP } from "../candidate/candidateStrings";
import { REC } from "../recruitmentStrings";
import { StatusPill } from "../shared";
import { PN } from "./panelStrings";
import AkunCek from "./kandidat/AkunCek";

const SHOWN = CANDIDATE_STATUS.filter((s) => s !== "accepted");

const waktu = (iso: string, lang: Lang) => {
  const w = tanggalWib(new Date(iso));
  return `${tanggalPanjang(w.tanggal, lang)}, ${w.jam}`;
};
const pendek = (iso: string, lang: Lang) => {
  const w = tanggalWib(new Date(iso));
  return `${new Date(`${w.tanggal}T00:00:00Z`).toLocaleDateString(
    lang === "en" ? "en-GB" : lang === "zh" ? "zh-CN" : "id-ID",
    { day: "numeric", month: "long", timeZone: "UTC" },
  )}, ${w.jam}`;
};

function Lembar({
  lang,
  id,
  rights,
  onClose,
  onChanged,
}: {
  lang: Lang;
  id: number;
  rights: RecRights;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = PN[lang].cand;
  const r = REC[lang];
  const docs = CP[lang].docs;
  const [d, setD] = useState<CandidateDetailResponse | null | "gagal">(null);
  const [minta, setMinta] = useState(false);
  const [catatan, setCatatan] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const muat = async () => {
    const res = await recGet<CandidateDetailResponse>("candidate", { id: String(id) });
    setD(isFail(res) ? "gagal" : res);
  };
  useEffect(() => {
    setD(null);
    void muat();
  }, [id]);

  async function putus(decision: "approve" | "revision", note?: string): Promise<boolean> {
    setBusy(true);
    const res = await recPost<ReviewResponse>("review", { id, decision, note });
    setBusy(false);
    if (isFail(res)) {
      window.Toast?.show(res.kode === "berkas_kurang" ? t.needDocs : t.fail, "danger");
      return false;
    }
    onChanged();
    await muat();
    return true;
  }

  const c = d && d !== "gagal" ? d.candidate : null;
  const boleh = rights.approve && !!c && ["applied", "revision", "approved"].includes(c.status);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={c?.nama ?? "…"}
      description={c ? t.sheetSub(c.nim, c.kelas ?? "-", String(c.angkatan ?? "-")) : undefined}
      storeKey="rec-kandidat"
      minWidth={420}
      closeLabel={t.sheetClose}
      resizeLabel={t.resize}
      foot={
        boleh ? (
          <>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={busy}
              onClick={() => setMinta(true)}
            >
              {t.askFix}
            </button>
            {c.status !== "approved" && (
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={async () => {
                  if (await putus("approve")) {
                    window.Toast?.show(t.approved(c.nama), "ok");
                    onClose();
                  }
                }}
              >
                <span className="btn__label">{t.approve}</span>
              </button>
            )}
          </>
        ) : undefined
      }
    >
      {d === null ? (
        <span className="skeleton" style={{ height: 240 }} />
      ) : d === "gagal" || !c ? (
        <p className="banner banner--warn">{t.loadFail}</p>
      ) : (
        <div className="stack stack--lg">
          <div className="row" style={{ gap: 8 }}>
            <StatusPill status={c.status} lang={lang} />
            <span className="hint">
              {t.appliedAt} {waktu(c.appliedAt, lang)}
            </span>
          </div>
          {d.biodata ? (
            <div className="rec-sum">
              {(
                [
                  [t.phone, d.biodata.phone],
                  [t.line, d.biodata.lineId],
                  [t.address, d.biodata.address],
                  [t.motivation, d.biodata.motivation],
                ] as const
              ).map(([k, v]) => (
                <span key={k} style={{ display: "contents" }}>
                  <span className="hint">{k}</span>
                  <b>{v}</b>
                </span>
              ))}
            </div>
          ) : null}
          <section className="stack stack--sm">
            <h3 className="rec-h3">{t.docsTitle}</h3>
            {d.documents ? (
              DOC_REQUIRED.map((k) => {
                const doc = d.documents!.find((x) => x.kind === k);
                return (
                  <div key={k} className="rec-doc">
                    <span className="rec-doc__ic" data-ok={doc ? "yes" : undefined} />
                    <span className="stack" style={{ gap: 0, minWidth: 0, flex: 1 }}>
                      <b>{docs.kind[k]}</b>
                      <span className="hint rec-doc__f">
                        {doc ? `${Math.max(1, Math.round(doc.size / 1024))} KB` : t.notUploaded}
                      </span>
                    </span>
                    {doc && (
                      <a
                        className="btn btn--ghost btn--sm"
                        href={`/api/recruitment/berkas?id=${doc.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t.view}
                      </a>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="rec-note">
                <span>{t.noDocsRight}</span>
              </div>
            )}
          </section>
          {rights.approve && (
            <AkunCek lang={lang} nim={c.nim} nama={c.nama} roster={c.namaRoster} />
          )}
          {c.status === "revision" && c.reviewNote && (
            <div className="rec-note rec-note--warn">
              <b>{t.fixAsked}</b>
              <span>{c.reviewNote}</span>
              {c.reviewedAt && <span className="hint">{waktu(c.reviewedAt, lang)}</span>}
            </div>
          )}
        </div>
      )}
      {minta && c && (
        <Dialog
          open
          onOpenChange={(o) => !o && setMinta(false)}
          title={t.fixTitle}
          description={t.fixDesc(c.nama)}
          size="sm"
          lang={lang}
          actions={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setMinta(false)}>
                {r.cancel}
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={async () => {
                  if (!catatan.trim()) return setGalat(t.noteRequired);
                  setGalat(null);
                  if (await putus("revision", catatan.trim())) {
                    window.Toast?.show(t.sent, "ok");
                    setMinta(false);
                    setCatatan("");
                  }
                }}
              >
                <span className="btn__label">{t.sendFix}</span>
              </button>
            </>
          }
        >
          <div className="stack">
            <div className="rec-chips">
              {t.quick.map((x) => (
                <Pill key={x} onClick={() => setCatatan(x)} pressed={catatan === x}>
                  {x}
                </Pill>
              ))}
            </div>
            <label className="field" data-invalid={galat ? "yes" : undefined}>
              <span className="field__label">{t.noteLabel}</span>
              <textarea
                className="field__input"
                rows={3}
                maxLength={500}
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
              />
              {galat && (
                <span className="field__error" role="alert">
                  {galat}
                </span>
              )}
            </label>
          </div>
        </Dialog>
      )}
    </Drawer>
  );
}

export default function Kandidat({
  lang,
  rights,
  rows,
  refresh,
  wide,
}: {
  lang: Lang;
  rights: RecRights;
  rows: CandidateRow[];
  refresh: () => void;
  wide: boolean;
}) {
  const t = PN[lang].cand;
  const r = REC[lang];
  const [q, setQ] = useState("");
  const [f, setF] = useState("semua");
  const [sel, setSel] = useState<number | null>(null);
  const cari = q.trim().toLowerCase();
  const list = rows.filter(
    (c) =>
      (f === "semua" || c.status === f) &&
      (!cari || `${c.nama} ${c.nim}`.toLowerCase().includes(cari)),
  );
  return (
    <div className="stack">
      <div className="row rec-tools">
        <div className="rec-search">
          <input
            className="field__input"
            placeholder={t.search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={t.searchLabel}
          />
        </div>
        <Dropdown
          id="rec-kandidat-status"
          label={t.filter}
          hideLabel
          value={f}
          onChange={setF}
          options={[
            { value: "semua", label: t.all },
            ...SHOWN.map((s) => ({ value: s, label: r.status[s] })),
          ]}
        />
        <span className="grow" />
        <span className="hint num">{t.count(list.length, rows.length)}</span>
      </div>
      {!list.length ? (
        <p className="empty-note">{rows.length ? t.emptyFilter : t.empty}</p>
      ) : wide ? (
        <section className="panel rec-tablecard">
          <div className="scrollx">
            <table className="rec-table">
              <thead>
                <tr>
                  <th>{t.name}</th>
                  <th>{t.nim}</th>
                  <th>{t.kelas}</th>
                  <th>{t.year}</th>
                  <th>{t.docs}</th>
                  <th>{t.applied}</th>
                  <th>{t.status}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr
                    key={c.id}
                    tabIndex={0}
                    onClick={() => setSel(c.id)}
                    onKeyDown={(e) => e.key === "Enter" && setSel(c.id)}
                  >
                    <td>
                      <b>{c.nama}</b>
                    </td>
                    <td className="mono hint">{c.nim}</td>
                    <td>{c.kelas ?? "-"}</td>
                    <td className="num">{c.angkatan ?? "-"}</td>
                    <td className="num">{c.docs}/3</td>
                    <td className="hint">{pendek(c.appliedAt, lang)}</td>
                    <td>
                      <StatusPill status={c.status} lang={lang} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <ul className="rec-clist">
          {list.map((c) => (
            <li key={c.id}>
              <button type="button" className="rec-crow" onClick={() => setSel(c.id)}>
                <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                  <b>{c.nama}</b>
                  <span className="hint mono">
                    {c.nim} · {c.kelas ?? "-"}
                  </span>
                </span>
                <StatusPill status={c.status} lang={lang} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {sel !== null && (
        <Lembar
          lang={lang}
          id={sel}
          rights={rights}
          onClose={() => setSel(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
