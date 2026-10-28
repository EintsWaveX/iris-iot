/**
 * "Berkasku" (prompt 03, mockup DocsDrawer): the candidate's own three PDFs,
 * what Admin asked to fix, a way to open each one and a way to replace it
 * while registration is open or Admin asked for a revision. A replacement
 * goes ticket → R2 → POST document, the same two steps as the application;
 * the server answers `applied` again after a revision upload.
 */
import { useRef, useState } from "react";
import { FilePdfIcon } from "@phosphor-icons/react";
import Drawer from "../../ui/Drawer";
import { tanggalPanjang } from "../../../lib/app";
import type { Lang } from "../../../lib/kelas";
import { isFail, recPost } from "../../../lib/recruitment/client";
import { tanggalWib } from "../../../lib/recruitment/gates";
import { kirimBerkas } from "../../../lib/recruitment/upload";
import {
  type CandidateSelf,
  type DocKind,
  type DocumentResponse,
  type MeResponse,
} from "../../../lib/recruitment/types";
import { DF, CP } from "./candidateStrings";

const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;

import { useDocRules } from "../../../lib/recruitment/doc-rules";
export default function DocsDrawer({
  lang,
  open,
  onOpenChange,
  candidate,
  documents,
  canReplace,
  onChanged,
}: {
  lang: Lang;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  candidate: CandidateSelf;
  documents: MeResponse["documents"];
  canReplace: boolean;
  onChanged: () => void;
}) {
  const t = CP[lang].docs;
  const rules = useDocRules();
  const d = DF[lang].slot;
  const fix = candidate.status === "revision";
  const [busy, setBusy] = useState<DocKind | null>(null);
  const [persen, setPersen] = useState(0);
  const [galat, setGalat] = useState<{ kind: DocKind; msg: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const target = useRef<DocKind | null>(null);

  async function ganti(kind: DocKind, f: File) {
    setBusy(kind);
    setPersen(0);
    setGalat(null);
    const r = await kirimBerkas(kind, f, setPersen, undefined, undefined, rules.maxBytes(kind));
    if (!r.ok) {
      const msg =
        r.kode === "bukan_pdf"
          ? d.notPdfHint
          : r.kode === "terlalu_besar"
            ? d.tooBigHint
            : r.kode === "jaringan"
              ? d.offline
              : r.kode === "jendela_tutup"
                ? d.closed
                : r.kode === "status_salah"
                  ? d.status
                  : r.kode === "penyimpanan_mati"
                    ? d.storage
                    : r.kode === "kosong"
                      ? d.empty
                      : d.other;
      setGalat({ kind, msg: `${f.name}: ${msg}` });
      setBusy(null);
      return;
    }
    if (!r.sama) {
      const done = await recPost<DocumentResponse>("document", { kind, tiket: r.tiket });
      if (isFail(done)) {
        setGalat({ kind, msg: d.other });
        setBusy(null);
        return;
      }
    }
    setBusy(null);
    window.Toast?.show(t.replaced, "ok");
    onChanged();
  }

  const when = (iso: string) => {
    const w = tanggalWib(new Date(iso));
    return `${tanggalPanjang(w.tanggal, lang)}, ${w.jam}`;
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={t.drawerTitle}
      description={fix ? t.drawerSubFix : canReplace ? t.drawerSub : t.drawerSubLocked}
      storeKey="rec-docs"
      closeLabel={t.closeLabel}
      resizeLabel={t.resizeLabel}
    >
      <div className="stack">
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f && target.current) void ganti(target.current, f);
          }}
        />
        {fix && (
          <div className="rec-note rec-note--warn">
            <b>{t.note}</b>
            <span>{candidate.reviewNote ?? CP[lang].revision.noNote}</span>
          </div>
        )}
        {rules.required.map((kind) => {
          const doc = documents.find((x) => x.kind === kind);
          return (
            <div key={kind} className="rec-doc">
              <span className="rec-doc__ic">
                <FilePdfIcon size={20} />
              </span>
              <span className="stack" style={{ gap: 0, minWidth: 0, flex: 1 }}>
                <b>{rules.label(kind, lang, t.kind[kind])}</b>
                <span className="hint rec-doc__f">
                  {busy === kind
                    ? `${t.uploading} ${persen}%`
                    : doc
                      ? `${kb(doc.size)} · ${t.uploaded(when(doc.uploadedAt))}`
                      : t.missing}
                </span>
                {galat?.kind === kind && (
                  <span className="field__error" role="alert">
                    {galat.msg}
                  </span>
                )}
              </span>
              <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
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
                <button
                  type="button"
                  className={`btn btn--sm ${fix ? "btn--primary" : ""}`.trim()}
                  disabled={!canReplace || busy !== null}
                  onClick={() => {
                    target.current = kind;
                    input.current?.click();
                  }}
                >
                  {doc ? t.replace : d.pick}
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </Drawer>
  );
}
