/**
 * Impor Soal (mockup r3-bank): one .md file, a dry run that says per question
 * what would happen (new, update, unchanged, or refused with its line number),
 * then Impor N Soal, which saves only the clean ones. Nothing is saved before
 * the person presses it.
 */
import { useEffect, useState } from "react";
import { DownloadSimpleIcon, FileArrowUpIcon } from "@phosphor-icons/react";
import { FileDrop } from "../../../../ui/Controls";
import Dialog from "../../../../ui/Dialog";
import Pill from "../../../../ui/Pill";
import type { Lang } from "../../../../../lib/kelas";
import type { ImportItem, ImportResponse } from "../../../../../lib/recruitment/bank-api";
import { isFail, recPost } from "../../../../../lib/recruitment/client";
import { SAMPLE_MD } from "./bankSample";
import { BK } from "./bankStrings";

const toast = (m: string, tone: "ok" | "warn" | "danger" = "ok") => window.Toast?.show(m, tone);
const MAX_BYTES = 2_500_000;

function Aksi({ lang, it }: { lang: Lang; it: ImportItem }) {
  const t = BK[lang];
  if (it.action === "error") return <Pill tone="danger">{t.importSkipped}</Pill>;
  if (it.action === "create") return <Pill tone="ok">{t.importNew}</Pill>;
  if (it.action === "update") return <Pill tone="accent">{t.importUpdate}</Pill>;
  return <Pill>{t.importSame}</Pill>;
}

export default function BankImport({
  lang,
  open,
  onClose,
  onDone,
}: {
  lang: Lang;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = BK[lang];
  const [file, setFile] = useState<{ name: string; size: number; text: string } | null>(null);
  const [dry, setDry] = useState<ImportResponse | null>(null);
  const [busy, setBusy] = useState<"" | "dry" | "run">("");
  const [note, setNote] = useState("");
  const [fail, setFail] = useState("");
  useEffect(() => {
    if (!open) {
      setFile(null);
      setDry(null);
      setNote("");
      setFail("");
      setBusy("");
    }
  }, [open]);

  async function pilih(f: File) {
    setDry(null);
    setFail("");
    const text = await f.text();
    setFile({ name: f.name, size: f.size, text });
  }

  async function coba() {
    if (!file) return;
    setBusy("dry");
    setFail("");
    const r = await recPost<ImportResponse>("bank-import", { text: file.text, dry: true });
    setBusy("");
    if (isFail(r))
      return setFail(r.kode === "terlalu_besar" ? t.importTooBig : (t.err[r.kode] ?? t.err.other));
    if (r.items.length === 0) setFail(t.importEmpty);
    setDry(r);
  }

  async function impor() {
    if (!file || !dry) return;
    setBusy("run");
    const r = await recPost<ImportResponse>("bank-import", {
      text: file.text,
      dry: false,
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    setBusy("");
    if (isFail(r)) return setFail(t.err[r.kode] ?? t.err.other);
    toast(t.importDone(r.counts.create + r.counts.update, r.counts.error));
    onDone();
    onClose();
  }

  const n = dry ? dry.counts.create + dry.counts.update : 0;
  const sample = () => {
    const url = URL.createObjectURL(new Blob([SAMPLE_MD], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = t.sampleName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !busy && !o && onClose()}
      title={t.importTitle}
      description={t.importDesc}
      size="lg"
      lang={lang}
      alt={
        <button type="button" className="btn btn--ghost" onClick={sample}>
          <DownloadSimpleIcon size={18} aria-hidden="true" /> {t.importSample}
        </button>
      }
      actions={
        <>
          <button type="button" className="btn btn--ghost" disabled={!!busy} onClick={onClose}>
            {t.cancel}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!dry || n === 0 || !!busy}
            onClick={() => void impor()}
          >
            {busy === "run" ? t.importRunning : n ? t.importRun(n) : t.importNone}
          </button>
        </>
      }
    >
      <div className="stack">
        {file ? (
          <div className="r3drop">
            <FileArrowUpIcon size={22} aria-hidden="true" />
            <span>
              <b>{file.name}</b> · {Math.max(1, Math.round(file.size / 1024))} KB
            </span>
            <span className="grow" />
            <button
              type="button"
              className="btn btn--inverse btn--sm"
              disabled={!!busy}
              onClick={() => void coba()}
            >
              {busy === "dry" ? t.importTrying : t.importTry}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={!!busy}
              onClick={() => {
                setFile(null);
                setDry(null);
                setFail("");
              }}
            >
              {t.importChange}
            </button>
          </div>
        ) : (
          <FileDrop
            accept={[".md", "text/markdown", "text/plain"]}
            maxBytes={MAX_BYTES}
            kinds={t.importKinds}
            lang={lang}
            onFile={(f) => void pilih(f)}
            dropLabel={t.importPick}
          />
        )}
        {fail && (
          <span className="r3err" role="alert">
            {fail}
          </span>
        )}
        {dry && dry.items.length > 0 && (
          <div className="scrollx">
            <table className="rec-table">
              <thead>
                <tr>
                  <th>{t.importCols.n}</th>
                  <th>{t.importCols.title}</th>
                  <th>{t.importCols.action}</th>
                  <th>{t.importCols.problems}</th>
                </tr>
              </thead>
              <tbody>
                {dry.items.map((it) => (
                  <tr key={it.index}>
                    <td className="num hint">{it.index}</td>
                    <td>
                      <b>{it.title || "-"}</b>
                    </td>
                    <td>
                      <Aksi lang={lang} it={it} />
                    </td>
                    <td>
                      {it.errors.length ? (
                        <span className="stack" style={{ gap: 2 }}>
                          {it.errors.map((e, i) => (
                            <span className="r3err" key={i}>
                              {t.importLine(e.line)}: {t.importErr(e.kode)}
                              {e.detail ? ` (${e.detail})` : ""}
                              {e.field ? ` [${e.field}]` : ""}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="hint">{t.importNoProblems}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {dry && n > 0 && (
          <label className="stack stack--sm">
            <span className="label-caps">{t.importNote}</span>
            <input
              className="field__input"
              value={note}
              maxLength={300}
              onChange={(e) => setNote(e.target.value)}
            />
            <span className="hint">{t.importNoteHelp}</span>
          </label>
        )}
        <span className="hint">{t.importFoot}</span>
      </div>
    </Dialog>
  );
}
