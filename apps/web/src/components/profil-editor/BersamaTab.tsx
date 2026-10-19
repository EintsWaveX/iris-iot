/**
 * Profil Lab › Foto Bersama: one row per kepengurusan year, newest first,
 * each with its photo and caption (the caption is also the photo's alt
 * text). Tambah Kepengurusan opens a row for the year after the newest.
 */
import { useEffect, useState } from "react";
import Confirm from "../ui/Confirm";
import type { Lang } from "../../lib/kelas";
import {
  TEKS_MAKS,
  bahasaKosong,
  tahunValid,
  type Foto,
  type FotoBersama,
  type ProfilData,
  type TeksTiga,
} from "../../lib/profil";
import { E } from "./editorStrings";
import { FotoPilih, TEKS_KOSONG, TriField, toast } from "./fields";
import { tulis } from "./ProfilEditor";

/** "2026/2027" -> "2027/2028"; the current year's when there is none. */
function tahunBerikut(list: FotoBersama[]): string {
  const m = /^(\d{4})/.exec(list[0]?.tahun ?? "");
  const a = m ? Number(m[1]) + 1 : new Date().getFullYear();
  return `${a}/${a + 1}`;
}

function Baris({
  lang,
  awal,
  baru,
  muat,
  onBatal,
}: {
  lang: Lang;
  awal: FotoBersama | { id: null; tahun: string; foto: Foto | null; keterangan: TeksTiga };
  baru?: boolean;
  muat: () => void;
  onBatal?: () => void;
}) {
  const t = E[lang];
  const [tahun, setTahun] = useState(awal.tahun);
  const [ket, setKet] = useState(awal.keterangan);
  const [foto, setFoto] = useState<Foto | null>(awal.foto);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hapus, setHapus] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    setTahun(awal.tahun);
    setKet(awal.keterangan);
    setFoto(awal.foto);
  }, [JSON.stringify(awal)]);

  const ubah =
    baru ||
    tahun !== awal.tahun ||
    foto?.besar !== awal.foto?.besar ||
    JSON.stringify(ket) !== JSON.stringify(awal.keterangan);

  async function simpan() {
    setTried(true);
    setGalat(null);
    if (!tahunValid(tahun)) return setGalat(t.tahunSalah);
    if (!foto) return setGalat(t.fotoWajib);
    if (bahasaKosong(ket).length) return;
    setBusy(true);
    const r = await tulis(lang, "bersama-simpan", {
      ...(awal.id ? { id: awal.id } : {}),
      tahun,
      keterangan: ket,
      ...(foto.besar !== awal.foto?.besar ? { foto } : {}),
    });
    setBusy(false);
    if (r.ok) {
      onBatal?.();
      muat();
    } else if (r.kode === "tahun_ada") setGalat(t.tahunAda);
    else toast(t.gagal, "danger");
  }

  return (
    <div className="pl-edyear">
      <FotoPilih
        lang={lang}
        foto={foto}
        label={t.pilihFoto}
        nama={`bersama-${tahun.replace("/", "-")}`}
        ratio="16 / 9"
        onFoto={setFoto}
      />
      <div className="stack">
        <div
          className="field"
          data-invalid={galat === t.tahunSalah || galat === t.tahunAda ? "yes" : undefined}
        >
          <label className="field__label" htmlFor={`tahun-${awal.id ?? "baru"}`}>
            {t.tahun}
          </label>
          <input
            id={`tahun-${awal.id ?? "baru"}`}
            className="field__input mono"
            value={tahun}
            inputMode="numeric"
            maxLength={9}
            onChange={(e) => setTahun(e.target.value.trim())}
          />
          <span className="field__hint">{t.tahunHint}</span>
        </div>
        <TriField
          lang={lang}
          label={t.keterangan}
          value={ket}
          onChange={setKet}
          maks={TEKS_MAKS.keterangan}
          long
          tried={tried}
        />
        {galat && <span className="field__error">{galat}</span>}
        <div className="pl-edfoot">
          {awal.id ? (
            <button type="button" className="btn btn--ghost" onClick={() => setHapus(true)}>
              {t.hapus}
            </button>
          ) : (
            <button type="button" className="btn btn--ghost" onClick={onBatal}>
              {t.batal}
            </button>
          )}
          <button
            type="button"
            className="btn btn--primary"
            disabled={!ubah || busy}
            data-loading={busy ? "yes" : undefined}
            onClick={simpan}
          >
            {t.simpan}
          </button>
        </div>
      </div>
      {awal.id && (
        <Confirm
          open={hapus}
          onOpenChange={setHapus}
          title={t.hapusTahunJudul(awal.tahun)}
          body={t.hapusTahunIsi}
          confirmLabel={t.hapus}
          cancelLabel={t.batal}
          lang={lang}
          onConfirm={async () => {
            const r = await tulis(lang, "bersama-hapus", { id: awal.id }, true);
            if (!r.ok) {
              toast(t.gagal, "danger");
              return false;
            }
            toast(t.terhapus);
            muat();
          }}
        />
      )}
    </div>
  );
}

export default function BersamaTab({
  lang,
  data,
  muat,
}: {
  lang: Lang;
  data: ProfilData;
  muat: () => void;
}) {
  const t = E[lang];
  const [draf, setDraf] = useState<string | null>(null);
  return (
    <div className="panel stack pl-edcard">
      <div className="panel__head">
        <h2 className="panel__title">{t.bersamaJudul}</h2>
        <button
          type="button"
          className="btn btn--inverse btn--sm"
          disabled={draf !== null}
          onClick={() => setDraf(tahunBerikut(data.bersama))}
        >
          {t.tambahTahun}
        </button>
      </div>
      {draf !== null && (
        <Baris
          lang={lang}
          key="baru"
          baru
          awal={{ id: null, tahun: draf, foto: null, keterangan: TEKS_KOSONG }}
          muat={muat}
          onBatal={() => setDraf(null)}
        />
      )}
      {data.bersama.map((b) => (
        <Baris key={b.id} lang={lang} awal={b} muat={muat} />
      ))}
      {!data.bersama.length && draf === null && <p className="hint">{t.belumBersama}</p>}
    </div>
  );
}
