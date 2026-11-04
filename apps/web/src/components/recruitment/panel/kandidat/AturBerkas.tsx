/**
 * Atur Berkas, as the mockup draws it (screens-rec1.js DocsEditor): the Ketua
 * and Admin set which documents a CaAs sends, in which order, which are
 * required, which are typed instead of a PDF, and the one largest PDF size.
 * Saved as the "docs" setting (settings.ts), audited on the server; the
 * candidate page, the Berkas review and Tambah CaAs read the same list.
 * A new row takes a key not yet in the list (the defaults first, then the
 * spares in types.ts DOC_SPARE): the key is what an upload is stored under.
 */
import { useEffect, useState } from "react";
import {
  ArrowCounterClockwiseIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import Dialog from "../../../ui/Dialog";
import IconButton from "../../../ui/IconButton";
import { Stepper, Switch } from "../../../ui/Controls";
import type { Lang } from "../../../../lib/kelas";
import { isFail, recPost } from "../../../../lib/recruitment/client";
import { useDocRules } from "../../../../lib/recruitment/doc-rules";
import { DOCS_DEFAULT, type DocSetting } from "../../../../lib/recruitment/settings";
import { DOC_SPARE } from "../../../../lib/recruitment/types";
import { leaveRow } from "../../../ui/leaveRow";

const T = {
  id: {
    title: "Atur Berkas",
    desc: "Berkas yang dikirim CaAs. Daftar ini dipakai di rincian kandidat, meja Berkas, Tambah CaAs, dan halaman CaAs. Hanya Admin dan Ketua yang mengubahnya; tiap perubahan tercatat.",
    sizeTitle: "Ukuran PDF paling besar",
    sizeHint: "Berlaku untuk setiap berkas PDF (bawaan 5 MB).",
    mb: (n: number) => `${n} MB`,
    less: "Kurangi",
    more: "Tambah",
    add: "Tambah Berkas",
    noSpare: "Slot berkas tambahan sudah habis.",
    name: "Nama berkas",
    required: "Wajib",
    typed: "Diketik, bukan PDF",
    up: "Naikkan",
    down: "Turunkan",
    del: "Hapus",
    oneLeft: "Paling sedikit satu berkas",
    removed: (n: string) => `${n} dihapus dari daftar. Berkas yang sudah masuk tetap tersimpan.`,
    undo: "Urungkan",
    newName: "Berkas baru",
    reset: "Kembalikan Bawaan",
    done: "Selesai",
    note: "Berkas diketik (seperti biodata) tidak punya slot PDF. Yang wajib harus ada sebelum Admin memverifikasi.",
    saved: "Daftar berkas disimpan.",
    fail: "Belum tersimpan. Coba lagi.",
    resetDone: "Daftar berkas kembali ke bawaan. Tekan Selesai untuk menyimpan.",
  },
  en: {
    title: "Set the Documents",
    desc: "The documents a CaAs sends. This list feeds the candidate sheet, the Berkas desk, Add CaAs and the CaAs page. Only Admin and the Ketua edit it; every change is logged.",
    sizeTitle: "Largest PDF",
    sizeHint: "Applies to every PDF (5 MB by default).",
    mb: (n: number) => `${n} MB`,
    less: "Less",
    more: "More",
    add: "Add a Document",
    noSpare: "No extra document slots left.",
    name: "Document name",
    required: "Required",
    typed: "Typed, not a PDF",
    up: "Move up",
    down: "Move down",
    del: "Delete",
    oneLeft: "At least one document",
    removed: (n: string) => `${n} removed from the list. Files already sent stay.`,
    undo: "Undo",
    newName: "New document",
    reset: "Restore the Default",
    done: "Done",
    note: "A typed document (like the biodata) has no PDF slot. A required one has to be there before Admin verifies.",
    saved: "Document list saved.",
    fail: "Not saved. Try again.",
    resetDone: "The document list is back to the default. Press Done to save.",
  },
} as const;

interface Row {
  kind: DocSetting["kind"];
  /** The names as stored; the field shows the one in the page language. */
  id: string;
  en: string;
  name: string;
  required: boolean;
  typed: boolean;
}

const MB_DEFAULT = 5;

function fromSettings(docs: readonly DocSetting[], lang: "id" | "en"): Row[] {
  return docs.map((d) => ({
    kind: d.kind,
    id: d.label.id,
    en: d.label.en,
    name: lang === "id" ? d.label.id : d.label.en,
    required: d.required,
    typed: d.mode === "typed",
  }));
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
  const l = lang === "id" ? "id" : "en";
  const t = T[l];
  const rules = useDocRules();
  const [rows, setRows] = useState<Row[]>(() => fromSettings(rules.docs, l));
  const [mb, setMb] = useState(() => rules.docs[0]?.maxMb ?? MB_DEFAULT);
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  // Start from what is saved each time it opens.
  useEffect(() => {
    if (!open) return;
    setRows(fromSettings(rules.docs, l));
    setMb(rules.docs[0]?.maxMb ?? MB_DEFAULT);
    setGalat(null);
  }, [open]);

  const patch = (i: number, p: Partial<Row>) =>
    setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: -1 | 1) =>
    setRows((r) => {
      const j = i + d;
      if (j < 0 || j >= r.length) return r;
      const n = [...r];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const hapus = (i: number) => {
    if (rows.length < 2) return;
    const gone = rows[i];
    setRows((r) => r.filter((_, j) => j !== i));
    window.Toast?.show(t.removed(gone.name), "info", {
      action: {
        label: t.undo,
        onClick: () =>
          setRows((r) => {
            const n = [...r];
            n.splice(Math.min(i, n.length), 0, gone);
            return n;
          }),
      },
    });
  };

  // The next key to offer: a default that was removed, else a spare.
  const sisa = [...DOCS_DEFAULT.map((d) => d.kind), ...DOC_SPARE].filter(
    (k) => !rows.some((r) => r.kind === k),
  );
  const tambah = () => {
    const kind = sisa[0];
    if (!kind) return;
    const def = DOCS_DEFAULT.find((d) => d.kind === kind);
    setRows((r) => [
      ...r,
      {
        kind,
        id: def?.label.id ?? T.id.newName,
        en: def?.label.en ?? T.en.newName,
        name: def ? (l === "id" ? def.label.id : def.label.en) : t.newName,
        required: def?.required ?? false,
        typed: false,
      },
    ]);
  };

  const bawaan = fromSettings(DOCS_DEFAULT, l);
  const sama = (a: Row[], b: Row[]) =>
    a.length === b.length &&
    a.every(
      (x, i) =>
        x.kind === b[i].kind &&
        x.name === b[i].name &&
        x.required === b[i].required &&
        x.typed === b[i].typed,
    );
  const diBawaan = sama(rows, bawaan) && mb === MB_DEFAULT;
  const awal = fromSettings(rules.docs, l);
  const berubah = !sama(rows, awal) || mb !== (rules.docs[0]?.maxMb ?? MB_DEFAULT);

  async function selesai() {
    if (!berubah) return onOpenChange(false);
    const value: DocSetting[] = rows.map((r) => {
      const asal = l === "id" ? r.id : r.en;
      const label =
        r.name.trim() === asal ? { id: r.id, en: r.en } : { id: r.name.trim(), en: r.name.trim() };
      return {
        kind: r.kind,
        label,
        required: r.required,
        mode: r.typed ? "typed" : "pdf",
        maxMb: mb,
      };
    });
    if (value.some((v) => !v.label.id)) return setGalat(t.fail);
    setGalat(null);
    setBusy(true);
    const res = await recPost<{ ok: true }>("setting-save", { key: "docs", value });
    setBusy(false);
    if (isFail(res)) return setGalat(t.fail);
    window.Toast?.show(t.saved, "ok");
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t.title}
      description={t.desc}
      size="form"
      lang={lang}
      alt={
        <button
          type="button"
          className="btn btn--ghost"
          disabled={diBawaan || busy}
          onClick={() => {
            setRows(bawaan);
            setMb(MB_DEFAULT);
            window.Toast?.show(t.resetDone, "ok");
          }}
        >
          <ArrowCounterClockwiseIcon size={18} aria-hidden="true" />
          <span className="btn__label">{t.reset}</span>
        </button>
      }
      actions={
        <button type="button" className="btn btn--primary" disabled={busy} onClick={selesai}>
          <span className="btn__label">{t.done}</span>
        </button>
      }
    >
      <div className="stack">
        <div className="row" style={{ gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <span className="stack" style={{ gap: 2 }}>
            <b>{t.sizeTitle}</b>
            <span className="hint">{t.sizeHint}</span>
          </span>
          <Stepper
            value={mb}
            min={1}
            max={25}
            label={t.sizeTitle}
            fmt={t.mb}
            lessLabel={t.less}
            moreLabel={t.more}
            onChange={setMb}
          />
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="btn btn--sm"
            disabled={!sisa.length}
            title={sisa.length ? undefined : t.noSpare}
            onClick={tambah}
          >
            <PlusIcon size={16} aria-hidden="true" />
            <span className="btn__label">{t.add}</span>
          </button>
        </div>
        <ul className="r9docs">
          {rows.map((r, i) => (
            <li key={r.kind} className="r9docs__r">
              <label className="stack stack--sm">
                <span className="hint">{t.name}</span>
                <input
                  className="field__input"
                  value={r.name}
                  maxLength={40}
                  onChange={(e) => patch(i, { name: e.target.value })}
                />
              </label>
              <label className="r9docs__s">
                <Switch
                  on={r.required}
                  onChange={(v) => patch(i, { required: v })}
                  label={`${t.required}: ${r.name}`}
                />
                <span className="hint">{t.required}</span>
              </label>
              <label className="r9docs__s">
                <Switch
                  on={r.typed}
                  onChange={(v) => patch(i, { typed: v })}
                  label={`${t.typed}: ${r.name}`}
                />
                <span className="hint">{t.typed}</span>
              </label>
              <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                <IconButton
                  sm
                  icon={ArrowUpIcon}
                  label={t.up}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                />
                <IconButton
                  sm
                  icon={ArrowDownIcon}
                  label={t.down}
                  disabled={i === rows.length - 1}
                  onClick={() => move(i, 1)}
                />
                <IconButton
                  sm
                  kind="danger"
                  icon={TrashIcon}
                  label={rows.length < 2 ? t.oneLeft : t.del}
                  disabled={rows.length < 2}
                  onClick={(e) => void leaveRow(e.currentTarget, ".r9docs__r").then(() => hapus(i))}
                />
              </span>
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
