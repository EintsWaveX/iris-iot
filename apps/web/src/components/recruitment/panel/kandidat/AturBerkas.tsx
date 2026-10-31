/**
 * Atur Berkas (mockup Kandidat, 28 Oct 2026): the Ketua and Admin set which
 * documents a CaAs sends, which are required, their names and the largest PDF.
 * Saved as the "docs" setting (settings.ts), audited on the server; the
 * candidate page, the Berkas review and Tambah CaAs read the same list.
 */
import { useState } from "react";
import Dialog from "../../../ui/Dialog";
import { Checkbox, Stepper } from "../../../ui/Controls";
import type { Lang } from "../../../../lib/kelas";
import { isFail, recPost } from "../../../../lib/recruitment/client";
import { useDocRules } from "../../../../lib/recruitment/doc-rules";
import { DOCS_DEFAULT, type DocSetting } from "../../../../lib/recruitment/settings";

const T = {
  id: {
    title: "Atur Berkas",
    desc: "Dokumen apa yang dikirim CaAs. Perubahan langsung dipakai halaman CaAs, Pemeriksaan Berkas dan Tambah CaAs.",
    asked: "Diminta",
    required: "Wajib",
    nameId: "Nama (Indonesia)",
    nameEn: "Nama (Inggris)",
    size: "PDF terbesar",
    mb: (n: number) => `${n} MB`,
    less: "Kurangi",
    more: "Tambah",
    cancel: "Batal",
    reset: "Kembalikan Bawaan",
    save: "Simpan",
    saved: "Daftar berkas disimpan.",
    reseted: "Daftar berkas kembali ke bawaan.",
    fail: "Belum tersimpan. Coba lagi.",
    needOne: "Minta paling sedikit satu dokumen.",
    note: "Berkas yang sudah diunggah tetap tersimpan walau tidak lagi diminta.",
  },
  en: {
    title: "Set Documents",
    desc: "Which documents a CaAs sends. A change applies at once to the CaAs page, the Document Check and Add CaAs.",
    asked: "Asked for",
    required: "Required",
    nameId: "Name (Indonesian)",
    nameEn: "Name (English)",
    size: "Largest PDF",
    mb: (n: number) => `${n} MB`,
    less: "Less",
    more: "More",
    cancel: "Cancel",
    reset: "Restore Defaults",
    save: "Save",
    saved: "Document list saved.",
    reseted: "Document list is back to the default.",
    fail: "Not saved. Try again.",
    needOne: "Ask for at least one document.",
    note: "Documents already uploaded stay stored even if they are no longer asked for.",
  },
} as const;

interface Row {
  kind: DocSetting["kind"];
  asked: boolean;
  required: boolean;
  id: string;
  en: string;
  maxMb: number;
}

export default function AturBerkas({
  lang,
  open,
  onOpenChange,
  onSaved,
}: {
  lang: Lang;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const t = T[lang === "id" ? "id" : "en"];
  const rules = useDocRules();
  const [rows, setRows] = useState<Row[]>(() =>
    DOCS_DEFAULT.map((d) => {
      const now = rules.docs.find((x) => x.kind === d.kind);
      const s = now ?? d;
      return {
        kind: d.kind,
        asked: !!now,
        required: s.required,
        id: s.label.id,
        en: s.label.en,
        maxMb: s.maxMb,
      };
    }),
  );
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const set = (kind: Row["kind"], p: Partial<Row>) =>
    setRows((r) => r.map((x) => (x.kind === kind ? { ...x, ...p } : x)));

  async function simpan() {
    const value: DocSetting[] = rows
      .filter((r) => r.asked)
      .map((r) => ({
        kind: r.kind,
        label: { id: r.id.trim(), en: r.en.trim() },
        required: r.required,
        mode: "pdf",
        maxMb: r.maxMb,
      }));
    if (!value.length) return setGalat(t.needOne);
    setGalat(null);
    setBusy(true);
    const res = await recPost<{ ok: true }>("setting-save", { key: "docs", value });
    setBusy(false);
    if (isFail(res)) return setGalat(t.fail);
    window.Toast?.show(t.saved, "ok");
    onSaved();
    onOpenChange(false);
  }
  async function pulihkan() {
    setBusy(true);
    const res = await recPost<{ ok: true }>("setting-reset", { key: "docs" });
    setBusy(false);
    if (isFail(res)) return setGalat(t.fail);
    window.Toast?.show(t.reseted, "ok");
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t.title}
      description={t.desc}
      size="xl"
      lang={lang}
      alt={
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={pulihkan}>
          {t.reset}
        </button>
      }
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={() => onOpenChange(false)}>
            {t.cancel}
          </button>
          <button type="button" className="btn btn--primary" disabled={busy} onClick={simpan}>
            <span className="btn__label">{t.save}</span>
          </button>
        </>
      }
    >
      <div className="stack">
        <ul className="b2-docs">
          {rows.map((r) => (
            <li key={r.kind} data-off={r.asked ? undefined : "yes"}>
              <div className="b2-docs__flags">
                <Checkbox
                  checked={r.asked}
                  onChange={(v) => set(r.kind, { asked: v })}
                  label={t.asked}
                  ariaLabel={`${t.asked}: ${r.id}`}
                />
                <Checkbox
                  checked={r.required}
                  disabled={!r.asked}
                  onChange={(v) => set(r.kind, { required: v })}
                  label={t.required}
                  ariaLabel={`${t.required}: ${r.id}`}
                />
              </div>
              <label className="field">
                <span className="field__label">{t.nameId}</span>
                <input
                  className="field__input"
                  value={r.id}
                  maxLength={40}
                  disabled={!r.asked}
                  onChange={(e) => set(r.kind, { id: e.target.value })}
                />
              </label>
              <label className="field">
                <span className="field__label">{t.nameEn}</span>
                <input
                  className="field__input"
                  value={r.en}
                  maxLength={40}
                  disabled={!r.asked}
                  onChange={(e) => set(r.kind, { en: e.target.value })}
                />
              </label>
              <div className="field">
                <span className="field__label">{t.size}</span>
                <Stepper
                  value={r.maxMb}
                  min={1}
                  max={25}
                  disabled={!r.asked}
                  label={`${t.size}: ${r.id}`}
                  fmt={t.mb}
                  lessLabel={t.less}
                  moreLabel={t.more}
                  onChange={(v) => set(r.kind, { maxMb: v })}
                />
              </div>
            </li>
          ))}
        </ul>
        <span className="hint">{t.note}</span>
        {galat && (
          <p className="banner banner--warn" role="alert">
            {galat}
          </p>
        )}
      </div>
    </Dialog>
  );
}
