/**
 * The editor's two building blocks: a text in three languages (small
 * ID / EN / ZH tabs over one box; an empty language marks its tab and, once
 * a save was tried, says what is missing), and a photo slot that shows the
 * photo and picks, shrinks and uploads a new one.
 */
import { useId, useRef, useState, type CSSProperties } from "react";
import { CircleNotchIcon, ImageIcon } from "@phosphor-icons/react";
import type { Lang } from "../../lib/kelas";
import {
  BAHASA_TEKS,
  FOTO_TIPE_MASUK,
  bahasaKosong,
  type Foto,
  type TeksTiga,
} from "../../lib/profil";
import { E } from "./editorStrings";
import { FotoGagal, unggahFoto } from "./fotoUnggah";

export const TEKS_KOSONG: TeksTiga = { id: "", en: "", zh: "" };

export function toast(msg: string, tone: "ok" | "danger" = "ok") {
  window.Toast?.show(msg, tone);
}

export function TriField({
  lang,
  label,
  value,
  onChange,
  maks,
  long,
  tried,
}: {
  lang: Lang;
  label: string;
  value: TeksTiga;
  onChange: (v: TeksTiga) => void;
  maks: number;
  long?: boolean;
  /** A save was tried: show what is still missing. */
  tried?: boolean;
}) {
  const t = E[lang];
  const [b, setB] = useState<Lang>(lang);
  const id = useId();
  const kosong = bahasaKosong(value);
  const props = {
    id,
    className: long ? "field__input field__textarea" : "field__input",
    value: value[b],
    maxLength: maks,
    placeholder: kosong.includes(b) ? t.wajib : undefined,
    "aria-invalid": tried && kosong.includes(b) ? true : undefined,
    onChange: (e: { target: { value: string } }) => onChange({ ...value, [b]: e.target.value }),
  };
  return (
    <div className="field pl-tri" data-invalid={tried && kosong.length ? "yes" : undefined}>
      <div className="pl-tri__head">
        <label className="field__label" htmlFor={id}>
          {label}
        </label>
        <div className="pl-tri__tabs" role="tablist" aria-label={`${label}, ${t.bahasa}`}>
          {BAHASA_TEKS.map((x) => (
            <button
              key={x}
              type="button"
              role="tab"
              aria-selected={b === x}
              onClick={() => setB(x)}
            >
              {x.toUpperCase()}
              {kosong.includes(x) && <i aria-label={t.kosong} />}
            </button>
          ))}
        </div>
      </div>
      {long ? <textarea rows={4} {...props} /> : <input {...props} />}
      {tried && kosong.length > 0 && (
        <span className="field__error">
          {t.kurang(
            label,
            kosong.map((x) => x.toUpperCase()),
          )}
        </span>
      )}
    </div>
  );
}

/** A photo slot: shows `foto`, and on pick uploads and hands back the new one. */
export function FotoPilih({
  lang,
  foto,
  label,
  nama,
  ratio,
  onFoto,
  onHapus,
  compact,
}: {
  lang: Lang;
  foto: Foto | null;
  label: string;
  /** Used in the uploaded file's name. */
  nama: string;
  ratio: string;
  onFoto: (f: Foto) => void | Promise<void>;
  onHapus?: () => void;
  compact?: boolean;
}) {
  const t = E[lang];
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  async function pilih(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      await onFoto(await unggahFoto(file, nama));
    } catch (err) {
      toast(t[err instanceof FotoGagal ? err.kode : "gagalUnggah"], "danger");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div
      className="pl-pick"
      style={{ aspectRatio: ratio } as CSSProperties}
      data-busy={busy ? "yes" : undefined}
    >
      {foto && <img src={foto.kecil} alt="" decoding="async" />}
      <button
        type="button"
        className={`pl-pick__btn${foto ? " pl-pick__btn--over" : ""}`}
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={`${foto ? t.gantiFoto : t.pilihFoto}: ${label}`}
      >
        {busy ? (
          <CircleNotchIcon className="ctl-spin" size={24} aria-label={t.mengunggah} />
        ) : foto ? (
          <span className="pl-pick__swap">{t.gantiFoto}</span>
        ) : (
          <>
            <ImageIcon size={compact ? 22 : 28} aria-hidden="true" />
            <span>{label}</span>
            {!compact && <span className="hint">{t.jenisFoto}</span>}
          </>
        )}
      </button>
      {foto && onHapus && !busy && (
        <button type="button" className="pl-pick__del btn btn--ghost btn--sm" onClick={onHapus}>
          {t.hapusFoto}
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept={FOTO_TIPE_MASUK.join(",")}
        hidden
        onChange={(e) => pilih(e.target.files?.[0])}
      />
    </div>
  );
}
