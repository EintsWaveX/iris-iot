/**
 * One Praktikan's own TP extension (2026-10-21: IRIS keeps it now, the LMS
 * did before): their window reopens until the time set here, and they
 * upload from their module page. POST /api/tp/perpanjang.
 */
import { useEffect, useState } from "react";
import Dialog from "../ui/Dialog";
import { DateField, TimeField } from "../ui/Controls";
import { postJson } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { bagiWib, isoWib } from "../../lib/tp";
import { TPS } from "../tp/tpStrings";

export default function PerpanjangDialog({
  open,
  onOpenChange,
  lang,
  modul,
  nim,
  nama,
  ada,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lang: Lang;
  modul: number;
  nim: string;
  nama: string;
  /** The extension they have now, if any. */
  ada: { sampai: string; alasan: string | null } | null;
  onSaved: () => void;
}) {
  const t = TPS[lang];
  const awal = () => bagiWib(ada?.sampai ?? new Date(Date.now() + 86_400_000).toISOString());
  const [w, setW] = useState(awal);
  const [alasan, setAlasan] = useState(ada?.alasan ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setW(awal());
    setAlasan(ada?.alasan ?? "");
  }, [open]);

  const kirim = async (sampai: string | null) => {
    setBusy(true);
    const r = await postJson<{ ok: boolean; kode?: string }>("/api/tp/perpanjang", {
      modul,
      nim,
      sampai,
      alasan,
    }).catch(() => ({ ok: false, kode: "" }));
    setBusy(false);
    if (!r.ok) return window.Toast?.show(r.kode === "sudah_lewat" ? t.sudahLewat : t.gagal, "warn");
    window.Toast?.show(sampai ? t.perpanjangDisimpan : t.perpanjangDihapus, "ok");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={t.perpanjangJudul(nama)}
      description={t.perpanjangDesc}
      lang={lang}
      alt={
        ada ? (
          <button
            type="button"
            className="btn btn--ghost btn--danger-soft"
            disabled={busy}
            onClick={() => void kirim(null)}
          >
            {t.hapusPerpanjang}
          </button>
        ) : undefined
      }
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={() => onOpenChange(false)}>
            {t.batal}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy}
            onClick={() => void kirim(isoWib(w.tanggal, w.jam))}
          >
            {t.simpan}
          </button>
        </>
      }
    >
      <div className="tpwinform">
        <div className="field">
          <span className="field__label">{t.sampaiLabel}</span>
          <div className="tpwinform__row">
            <DateField
              value={w.tanggal}
              onChange={(v) => setW({ ...w, tanggal: v })}
              label={t.tglTutup}
              lang={lang}
            />
            <TimeField
              value={w.jam}
              onChange={(v) => setW({ ...w, jam: v })}
              label={t.jamTutup}
              lang={lang}
            />
          </div>
        </div>
        <label className="field">
          <span className="field__label">{t.alasanLabel}</span>
          <input
            className="field__input"
            value={alasan}
            maxLength={200}
            onChange={(e) => setAlasan(e.target.value)}
          />
        </label>
      </div>
    </Dialog>
  );
}
