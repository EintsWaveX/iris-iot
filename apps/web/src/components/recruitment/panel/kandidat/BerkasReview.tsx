/**
 * Berkas review in the Kandidat side sheet (06, PRD 6 Kandidat and 8, mockup
 * r2-berkas), for Admin and the Ketua (the documents and approve rights). The
 * drawer widens: the kit's PdfViewer on the left, the checks on the right,
 * Sesuai or Perbaiki per file, Nilai Berkas kept and badged "Menunggu
 * keputusan" (a dash until set; Cutting ignores it), V1 and V2 when a fix
 * came back, and a queue of those waiting with arrows; Setujui moves on to
 * the next one. Everyone else on the Panitia keeps the S1 sheet without
 * documents.
 */
import { useEffect, useRef, useState } from "react";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import gsap from "gsap";
import Dialog from "../../../ui/Dialog";
import Disclose from "../../../ui/Disclose";
import Drawer from "../../../ui/Drawer";
import IconButton from "../../../ui/IconButton";
import PdfViewer from "../../../ui/PdfViewer";
import Pill from "../../../ui/Pill";
import SegmentedControl from "../../../ui/SegmentedControl";
import { Stepper } from "../../../ui/Controls";
import type { Lang } from "../../../../lib/kelas";
import { isFail, recGet, recPost } from "../../../../lib/recruitment/client";
import { tanggalWib } from "../../../../lib/recruitment/gates";
import {
  DOC_REQUIRED,
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

const waktu = (iso: string, lang: Lang) => {
  const w = tanggalWib(new Date(iso));
  return `${tgl(w.tanggal, lang)}, ${w.jam}`;
};

export default function BerkasReview({
  lang,
  id: id0,
  queue,
  onClose,
  onChanged,
}: {
  lang: Lang;
  id: number;
  /** Those waiting for a decision, in list order */
  queue: CandidateRow[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = S2[lang].berkas;
  const p = PN[lang].cand;
  const motion = useRevealMotion();
  const [id, setId] = useState(id0);
  const [d, setD] = useState<CandidateDetailResponse | null | "gagal">(null);
  const [doc, setDoc] = useState<DocKind>("cv");
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
  const perbaikan = files.some((x) => x.hasPrev);
  const sudah = c?.status === "approved";
  const pindah = (dir: number) => {
    const nx = queue[qi + dir];
    if (!nx) return;
    arah.current = dir;
    setId(nx.id);
    setDoc("cv");
  };

  async function putus(decision: "approve" | "revision", note?: string): Promise<boolean> {
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
  const ditandai = DOC_REQUIRED.filter((k) => cek[k] === "fix");

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={c?.nama ?? "..."}
      description={c ? p.sheetSub(c.nim, c.kelas ?? "-", String(c.angkatan ?? "-")) : undefined}
      storeKey="rec-berkas"
      minWidth={520}
      closeLabel={p.sheetClose}
      resizeLabel={p.resize}
      foot={
        c ? (
          sudah ? (
            <span className="hint">
              {c.reviewedAt ? t.approvedAt(waktu(c.reviewedAt, lang)) : ""}
            </span>
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
            <SegmentedControl
              aria-label={t.files}
              value={doc}
              onValueChange={(v) => setDoc(v as DocKind)}
              options={DOC_REQUIRED.map((k) => ({
                value: k,
                label: t.docs[k] + (cek[k] === "ok" ? " ✓" : ""),
              }))}
            />
            <span className="grow" style={{ flex: 1 }} />
            {!sudah && qi >= 0 && (
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
            )}
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
                  title={t.docs[doc]}
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
                {DOC_REQUIRED.map((k) => (
                  <div className="r2chk" key={k}>
                    <span>{t.docs[k]}</span>
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
                        [t.wa, d.biodata.phone],
                        [t.line, d.biodata.lineId],
                        [t.lives, d.biodata.address],
                        [t.motivation, d.biodata.motivation],
                      ] as const
                    ).map(([k, v]) => (
                      <span key={k} style={{ display: "contents" }}>
                        <span className="hint">{k}</span>
                        <b>{v}</b>
                      </span>
                    ))}
                  </div>
                </Disclose>
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
              <b>{ditandai.map((k) => t.docs[k]).join(", ") || t.none}</b>
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
