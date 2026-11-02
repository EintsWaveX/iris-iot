/**
 * Berkas review in the Kandidat side sheet (06, PRD 6 Kandidat and 8, mockup
 * r2-berkas), for Admin and the Ketua (the documents and approve rights). The
 * drawer widens: the kit's PdfViewer on the left, the checks on the right,
 * Sesuai or Perbaiki per file, Nilai Berkas kept and badged "Menunggu
 * keputusan" (a dash until set; Cutting ignores it), V1 and V2 when a fix
 * came back, and a queue of those waiting with arrows; Setujui moves on to
 * the next one. Everyone else on the Panitia keeps the S1 sheet without
 * documents.
 *
 * The files follow the Google Form's list (2026-10-25): six required kinds as
 * chips that wrap, Portofolio when there is one. hakPenuh also uploads a
 * candidate's PDFs here and corrects their details (Tambah CaAs).
 */
import { useEffect, useRef, useState } from "react";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import gsap from "gsap";
import Confirm from "../../../ui/Confirm";
import Dialog from "../../../ui/Dialog";
import Disclose from "../../../ui/Disclose";
import Drawer from "../../../ui/Drawer";
import IconButton from "../../../ui/IconButton";
import PdfViewer from "../../../ui/PdfViewer";
import Pill from "../../../ui/Pill";
import SegmentedControl from "../../../ui/SegmentedControl";
import { Stepper, Switch } from "../../../ui/Controls";
import type { Lang } from "../../../../lib/kelas";
import { isFail, recGet, recPost } from "../../../../lib/recruitment/client";
import { tanggalWib } from "../../../../lib/recruitment/gates";
import {
  type BerkasFile,
  type CandidateDetailResponse,
  type CandidateRow,
  type DocKind,
  type DocVerdict,
  type ReviewResponse,
} from "../../../../lib/recruitment/types";
import { S2 } from "../../s2Strings";
import { tgl } from "../../shared";
import { useRevealMotion } from "../../reveal/fx";
import { PN } from "../panelStrings";
import AkunCek from "./AkunCek";
import TambahCaAs, { BerkasPanitia } from "./TambahCaAs";

const waktu = (iso: string, lang: Lang) => {
  const w = tanggalWib(new Date(iso));
  return `${tgl(w.tanggal, lang)}, ${w.jam}`;
};

import TabLine from "../../../ui/TabLine";
import { useDocRules } from "../../../../lib/recruitment/doc-rules";
export default function BerkasReview({
  lang,
  id: id0,
  queue,
  canAdd = false,
  onClose,
  onChanged,
}: {
  lang: Lang;
  id: number;
  /** Those waiting for a decision, in list order */
  queue: CandidateRow[];
  /** hakPenuh: upload the candidate's PDFs and correct their details (Tambah CaAs) */
  canAdd?: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = S2[lang].berkas;
  const p = PN[lang].cand;
  const motion = useRevealMotion();
  const rules = useDocRules();
  /** The name as Atur Berkas set it, else the built-in one. */
  const dn = (k: DocKind) =>
    rules.label(k, lang, (t.docs as Partial<Record<DocKind, string>>)[k] ?? k);
  const [id, setId] = useState(id0);
  const [d, setD] = useState<CandidateDetailResponse | null | "gagal">(null);
  const [doc, setDoc] = useState<DocKind>(rules.required[0] ?? rules.optional[0]);
  const [ubah, setUbah] = useState(false);
  const [hapus, setHapus] = useState(false);
  const [ver, setVer] = useState<"1" | "2">("2");
  const [cek, setCek] = useState<Partial<Record<DocKind, DocVerdict | null>>>({});
  const [skor, setSkor] = useState<number | null>(null);
  const [minta, setMinta] = useState(false);
  const [catatan, setCatatan] = useState("");
  const [busy, setBusy] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const arah = useRef(0);

  const qi = queue.findIndex((x) => x.id === id);
  const muat = async () => {
    const r = await recGet<CandidateDetailResponse>("candidate", { id: String(id) });
    if (isFail(r)) return setD("gagal");
    setD(r);
    setSkor(r.candidate.berkasScore);
    setCek(Object.fromEntries((r.documents ?? []).map((x) => [x.kind, x.verdict])));
  };
  useEffect(() => {
    setD(null);
    void muat();
  }, [id]);
  useEffect(() => {
    if (body.current && arah.current && motion !== "reduce")
      gsap.fromTo(
        body.current,
        { opacity: 0, x: 10 * arah.current },
        { opacity: 1, x: 0, duration: 0.18, ease: "power3.out" },
      );
    arah.current = 0;
  }, [d, motion]);

  const c = d && d !== "gagal" ? d.candidate : null;
  const files = d && d !== "gagal" ? (d.documents ?? []) : [];
  const berkas = (k: DocKind): BerkasFile | undefined => files.find((x) => x.kind === k);
  const aktif = berkas(doc);
  // The required kinds, then an optional one only when it was sent.
  const jenis = [...rules.required, ...rules.optional.filter((k) => !!berkas(k))];
  const yaTidak = (v: boolean | null | undefined) =>
    v === true ? t.ya : v === false ? t.tidak : null;
  const perbaikan = files.some((x) => x.hasPrev);
  const sudah = c?.status === "approved";
  const pindah = (dir: number) => {
    const nx = queue[qi + dir];
    if (!nx) return;
    arah.current = dir;
    setId(nx.id);
    setDoc(rules.required[0] ?? rules.optional[0]);
  };

  async function putus(
    decision: "approve" | "revision" | "withdraw",
    note?: string,
  ): Promise<boolean> {
    setBusy(true);
    const r = await recPost<ReviewResponse>("review", {
      id,
      decision,
      note,
      score: skor,
      files: cek,
    });
    setBusy(false);
    if (isFail(r)) {
      window.Toast?.show(r.kode === "berkas_kurang" ? p.needDocs : t.fail, "danger");
      return false;
    }
    onChanged();
    return true;
  }
  async function setujui() {
    if (!c || !(await putus("approve"))) return;
    const nx = queue[qi + 1];
    window.Toast?.show(
      nx
        ? t.verifiedNext(c.nama.split(" ")[0], nx.nama.split(" ")[0])
        : t.verified(c.nama.split(" ")[0]),
      "ok",
    );
    if (nx) pindah(1);
    else onClose();
  }
  const ditandai = rules.required.filter((k) => cek[k] === "fix");

  const antrean =
    !sudah && qi >= 0 ? (
      <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
        <IconButton
          icon={CaretLeftIcon}
          label={t.prev}
          disabled={qi <= 0}
          onClick={() => pindah(-1)}
        />
        <IconButton
          icon={CaretRightIcon}
          label={t.next}
          disabled={qi >= queue.length - 1}
          onClick={() => pindah(1)}
        />
      </span>
    ) : undefined;

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={c?.nama ?? "..."}
      description={c ? p.sheetSub(c.nim, c.kelas ?? "-", String(c.angkatan ?? "-")) : undefined}
      headerActions={antrean}
      storeKey="rec-berkas"
      minWidth={520}
      closeLabel={p.sheetClose}
      resizeLabel={p.resize}
      foot={
        c ? (
          sudah ? (
            <>
              <span className="hint">
                {c.reviewedAt ? t.approvedAt(waktu(c.reviewedAt, lang)) : ""}
              </span>
              <span className="grow" />
              {/* Only while the CaAs is still at the document check; the server says no past it. */}
              {c.stage === "berkas" && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={busy}
                  onClick={async () => {
                    if (await putus("withdraw")) window.Toast?.show(t.withdrawn, "warn");
                  }}
                >
                  {t.withdraw}
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={busy}
                onClick={() => setMinta(true)}
              >
                {t.ask}
              </button>
              <span className="hint r2foot__q num">
                {qi >= 0 ? t.queue(qi + 1, queue.length) : ""}
              </span>
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() => void setujui()}
              >
                <span className="btn__label">{t.approve}</span>
              </button>
            </>
          )
        ) : undefined
      }
    >
      {d === null ? (
        <span className="skeleton" style={{ height: 360 }} />
      ) : d === "gagal" || !c ? (
        <p className="banner banner--warn">{p.loadFail}</p>
      ) : (
        <div className="r2rev" ref={body}>
          <div className="r2rev__nav">
            <div style={{ flex: 1, minWidth: 0 }}>
              <TabLine
                label={t.files}
                value={doc}
                onChange={setDoc}
                tabs={jenis.map((k) => ({
                  v: k,
                  label: dn(k) + (cek[k] === "ok" ? " ✓" : ""),
                  tone:
                    cek[k] === "ok"
                      ? ("ok" as const)
                      : cek[k] === "fix"
                        ? ("bad" as const)
                        : undefined,
                }))}
              />
            </div>
          </div>
          <div className="r2rev__grid">
            <div className="stack stack--sm" style={{ minWidth: 0 }}>
              {aktif?.hasPrev && (
                <SegmentedControl
                  aria-label={t.version}
                  value={ver}
                  onValueChange={(v) => setVer(v as "1" | "2")}
                  options={[
                    { value: "1", label: "V1" },
                    { value: "2", label: "V2" },
                  ]}
                />
              )}
              {aktif ? (
                <PdfViewer
                  key={`${aktif.id}-${aktif.hasPrev ? ver : "2"}`}
                  url={`/api/recruitment/berkas?id=${aktif.id}${aktif.hasPrev && ver === "1" ? "&v=1" : ""}`}
                  name={`${doc}_${c.nim}.pdf`}
                  title={dn(doc)}
                  lang={lang}
                  shape="page"
                />
              ) : (
                <p className="empty-note">{t.noFile}</p>
              )}
            </div>
            <div className="stack r2rev__side">
              {perbaikan && (
                <div className="rec-note rec-note--warn">
                  <b>{t.fixIn}</b>
                  <span>
                    {t.fixBody(
                      waktu(files.find((x) => x.hasPrev)?.uploadedAt ?? c.appliedAt, lang),
                    )}
                  </span>
                  <span className="hint">{t.compare}</span>
                </div>
              )}
              <section className="stack stack--sm">
                <h3 className="h3">{t.checks}</h3>
                {jenis.map((k) => (
                  <div className="r2chk" key={k}>
                    <span>{dn(k)}</span>
                    <span className="r2pro">
                      <button
                        type="button"
                        className="chipbtn r2pro__b"
                        data-v="lolos"
                        aria-pressed={cek[k] === "ok"}
                        onClick={() => setCek({ ...cek, [k]: cek[k] === "ok" ? null : "ok" })}
                      >
                        {t.fine}
                      </button>
                      <button
                        type="button"
                        className="chipbtn r2pro__b"
                        data-v="gagal"
                        aria-pressed={cek[k] === "fix"}
                        onClick={() => setCek({ ...cek, [k]: cek[k] === "fix" ? null : "fix" })}
                      >
                        {t.fix}
                      </button>
                    </span>
                  </div>
                ))}
              </section>
              <AkunCek lang={lang} nim={c.nim} nama={c.nama} roster={c.namaRoster} />
              <section className="stack stack--sm r2score">
                <div className="row row--between" style={{ gap: 8 }}>
                  <h3 className="h3">{t.score}</h3>
                  <Pill tone="warn">{t.scoreNone}</Pill>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <Stepper
                    value={skor ?? 70}
                    min={0}
                    max={100}
                    step={5}
                    label={t.scoreLabel}
                    lessLabel={t.less}
                    moreLabel={t.more}
                    fmt={(v) => (skor === null ? "-" : String(v))}
                    onChange={setSkor}
                  />
                  {skor !== null && (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => setSkor(null)}
                    >
                      {t.clearScore}
                    </button>
                  )}
                </div>
                <span className="hint">{t.scoreHint}</span>
              </section>
              {d.biodata && (
                <Disclose head={<b>{t.details}</b>}>
                  <div className="rec-sum">
                    {(
                      [
                        [
                          t.prodi,
                          d.biodata.prodi ? PN[lang].tambah.prodiNama[d.biodata.prodi] : null,
                        ],
                        [t.wa, d.biodata.phone],
                        [t.line, d.biodata.lineId],
                        [t.mkIot, yaTidak(d.biodata.mkIot)],
                        [t.praktikumIot, yaTidak(d.biodata.praktikumIot)],
                        [t.lives, d.biodata.address],
                        [t.motivation, d.biodata.motivation],
                      ] as const
                    )
                      .filter(([, v]) => !!v)
                      .map(([k, v]) => (
                        <span key={k} style={{ display: "contents" }}>
                          <span className="hint">{k}</span>
                          <b>{v}</b>
                        </span>
                      ))}
                  </div>
                </Disclose>
              )}
              {c.revisions > 0 && (
                <span className="hint">
                  {c.status === "applied" ? t.resent : t.round(c.revisions)}
                </span>
              )}
              <DataPanitia
                key={`d${c.id}`}
                lang={lang}
                id={c.id}
                ipk={c.ipk}
                potensi={c.potensiCut}
                onChanged={onChanged}
              />
              <CatatanPanitia key={c.id} lang={lang} id={c.id} note={c.panitiaNote} />
              {canAdd && (
                <Disclose head={<b>{t.upload}</b>}>
                  <BerkasPanitia
                    lang={lang}
                    id={c.id}
                    documents={files}
                    onChanged={() => {
                      onChanged();
                      void muat();
                    }}
                  />
                </Disclose>
              )}
              {canAdd && (
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => setUbah(true)}
                  >
                    {t.edit}
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => setHapus(true)}
                  >
                    {p.del}
                  </button>
                </div>
              )}
              {c.status === "revision" && c.reviewNote && (
                <div className="rec-note rec-note--warn">
                  <b>{p.fixAsked}</b>
                  <span>{c.reviewNote}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {hapus && c && (
        <Confirm
          open
          onOpenChange={(o) => !o && setHapus(false)}
          title={p.delTitle(c.nama)}
          body={p.delBody}
          confirmLabel={p.delYes}
          lang={lang}
          onConfirm={async () => {
            const res = await recPost<{ ok: true }>("candidate-delete", { id });
            if (isFail(res)) {
              window.Toast?.show(
                res.kode === "sudah_ada_hasil" || res.kode === "sudah_jadi_asisten"
                  ? p.delBlocked
                  : p.delFail,
                "danger",
              );
              return false;
            }
            window.Toast?.show(p.delDone, "ok");
            onChanged();
            onClose();
          }}
        />
      )}
      {ubah && c && (
        <TambahCaAs
          lang={lang}
          open
          onOpenChange={(o) => !o && setUbah(false)}
          edit={{
            id: c.id,
            nim: c.nim,
            nama: c.nama,
            biodata: d && d !== "gagal" ? d.biodata : null,
          }}
          onSaved={() => {
            onChanged();
            void muat();
          }}
        />
      )}
      {minta && c && (
        <Dialog
          open
          onOpenChange={(o) => !o && setMinta(false)}
          title={t.askTitle}
          description={t.askDesc(c.nama)}
          size="sm"
          lang={lang}
          actions={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setMinta(false)}>
                {t.cancel}
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy || !catatan.trim()}
                onClick={async () => {
                  if (await putus("revision", catatan.trim())) {
                    window.Toast?.show(t.sent, "ok");
                    setMinta(false);
                    setCatatan("");
                    const nx = queue[qi + 1];
                    if (nx) pindah(1);
                    else onClose();
                  }
                }}
              >
                {t.send}
              </button>
            </>
          }
        >
          <div className="stack">
            <span className="hint">
              {t.marked}
              <b>{ditandai.map((k) => dn(k)).join(", ") || t.none}</b>
            </span>
            <div className="rec-chips">
              {t.quick.map((x) => (
                <button
                  type="button"
                  className="chipbtn"
                  key={x}
                  aria-pressed={catatan === x}
                  onClick={() => setCatatan(x)}
                >
                  {x}
                </button>
              ))}
            </div>
            <textarea
              className="textarea"
              rows={3}
              maxLength={500}
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
            />
          </div>
        </Dialog>
      )}
    </Drawer>
  );
}

/** IPK and Potensi Cut: what the sheet's IPK column and POTENSI-CUT status did. Both save at once. */
function DataPanitia({
  lang,
  id,
  ipk,
  potensi,
  onChanged,
}: {
  lang: Lang;
  id: number;
  ipk: number | null;
  potensi: boolean;
  onChanged: () => void;
}) {
  const t = S2[lang].berkas;
  const tulis = (n: number | null) =>
    n === null ? "" : String(n).replace(".", lang === "id" ? "," : ".");
  const [teks, setTeks] = useState(tulis(ipk));
  const [simpan, setSimpan] = useState(tulis(ipk));
  const [salah, setSalah] = useState(false);
  const [on, setOn] = useState(potensi);
  const [sibuk, setSibuk] = useState(false);
  const untuk = `rec-ipk-${id}`;
  async function kirim(body: { ipk?: number | null; potensiCut?: boolean }) {
    const r = await recPost<{ ok: true }>("candidate-meta", { id, ...body });
    if (isFail(r)) {
      window.Toast?.show(t.metaFail, "danger");
      return false;
    }
    window.Toast?.show(t.metaSaved, "ok");
    onChanged();
    return true;
  }
  async function simpanIpk() {
    const v = teks.trim().replace(",", ".");
    if (v === simpan.trim().replace(",", ".")) return;
    const n = v === "" ? null : Number(v);
    if (n !== null && (!Number.isFinite(n) || n < 0 || n > 4)) return setSalah(true);
    setSalah(false);
    if (await kirim({ ipk: n === null ? null : Math.round(n * 100) / 100 })) setSimpan(teks);
  }
  async function ubahCut(v: boolean) {
    setSibuk(true);
    if (await kirim({ potensiCut: v })) setOn(v);
    setSibuk(false);
  }
  return (
    <section className="stack stack--sm">
      <div className="row" style={{ gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div className="stack stack--sm" style={{ width: 120 }}>
          <h3 className="h3">
            <label htmlFor={untuk}>{t.ipk}</label>
          </h3>
          <input
            id={untuk}
            className="field__input"
            inputMode="decimal"
            maxLength={4}
            placeholder={t.ipkPh}
            value={teks}
            aria-invalid={salah || undefined}
            onChange={(e) => setTeks(e.target.value)}
            onBlur={() => void simpanIpk()}
          />
        </div>
        <div className="stack stack--sm">
          <h3 className="h3">{t.cutFlag}</h3>
          <Switch
            on={on}
            onChange={(v) => void ubahCut(v)}
            label={t.cutFlag}
            busy={sibuk}
            disabled={sibuk}
          />
        </div>
      </div>
      {salah && (
        <span className="field__error" role="alert">
          {t.ipkBad}
        </span>
      )}
      <span className="hint">{t.cutHint}</span>
    </section>
  );
}

/** Catatan Panitia: a note only the Panitia read; it saves when the box loses focus. */
function CatatanPanitia({ lang, id, note }: { lang: Lang; id: number; note: string | null }) {
  const t = S2[lang].berkas;
  const [teks, setTeks] = useState(note ?? "");
  const [simpan, setSimpan] = useState(note ?? "");
  const untuk = `rec-note-${id}`;
  async function kirim() {
    if (teks.trim() === simpan.trim()) return;
    const r = await recPost<{ ok: true }>("candidate-note", { id, note: teks });
    if (isFail(r)) return void window.Toast?.show(t.noteFail, "danger");
    setSimpan(teks);
    window.Toast?.show(t.noteSaved, "ok");
  }
  return (
    <section className="stack stack--sm">
      <h3 className="h3">
        <label htmlFor={untuk}>{t.note}</label>
      </h3>
      <textarea
        id={untuk}
        className="textarea"
        rows={3}
        maxLength={2000}
        placeholder={t.notePh}
        value={teks}
        onChange={(e) => setTeks(e.target.value)}
        onBlur={() => void kirim()}
      />
    </section>
  );
}
