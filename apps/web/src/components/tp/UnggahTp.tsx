/**
 * The TP upload in IRIS (2026-10-14), inside the module's TP step: the
 * Praktikan picks photos of their pages or a scanned PDF, orders them, and
 * sends one PDF (src/lib/tp-unggah.ts). The LMS can refuse their upload
 * until the iGracias survey is filled; this one never asks.
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, FilePdfIcon, XIcon } from "@phosphor-icons/react";
import { FileDrop } from "../ui/Controls";
import type { Lang } from "../../lib/kelas";
import {
  GagalUnggah,
  HALAMAN_MAKS,
  JENIS_UNGGAH,
  kirimUnggah,
  susunPdf,
} from "../../lib/tp-unggah";
import { TPS } from "./tpStrings";

/** A photo straight off a phone camera can be large; it is shrunk here. */
const BERKAS_MAKS = 25 * 1024 * 1024;

export default function UnggahTp({
  lang,
  modul,
  adaBerkas,
  onSelesai,
}: {
  lang: Lang;
  modul: number;
  /** They already have a file: the new one replaces it. */
  adaBerkas: boolean;
  onSelesai: () => void;
}) {
  const t = TPS[lang];
  const [halaman, setHalaman] = useState<File[]>([]);
  const [tahap, setTahap] = useState<"diam" | "susun" | "kirim">("diam");
  const [galat, setGalat] = useState<string | null>(null);
  const pratinjau = useMemo(
    () => halaman.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : null)),
    [halaman],
  );
  useEffect(
    () => () => {
      for (const u of pratinjau) if (u) URL.revokeObjectURL(u);
    },
    [pratinjau],
  );

  const tambah = (fs: File[]) => {
    setGalat(null);
    const semua = [...halaman, ...fs];
    if (semua.length > HALAMAN_MAKS) setGalat(t.maksHalaman(HALAMAN_MAKS));
    setHalaman(semua.slice(0, HALAMAN_MAKS));
  };
  const geser = (i: number, arah: -1 | 1) => {
    const j = i + arah;
    if (j < 0 || j >= halaman.length) return;
    const baru = [...halaman];
    [baru[i], baru[j]] = [baru[j], baru[i]];
    setHalaman(baru);
  };
  const kirim = async () => {
    setGalat(null);
    setTahap("susun");
    let pdf: Uint8Array;
    try {
      pdf = await susunPdf(halaman);
    } catch (e) {
      setTahap("diam");
      return setGalat(t.galatUnggah[e instanceof GagalUnggah ? e.kode : "rusak"]);
    }
    setTahap("kirim");
    const r = await kirimUnggah(modul, pdf);
    setTahap("diam");
    if (!r.ok) return setGalat(t.galatUnggah[r.kode ?? "lain"] ?? t.galatUnggah.lain);
    window.Toast?.show(r.sama ? t.unggahSama : t.unggahBerhasil, "ok");
    setHalaman([]);
    onSelesai();
  };

  const sibuk = tahap !== "diam";
  return (
    <div className="tpup">
      <p className="hint">{t.unggahIrisHint}</p>
      {halaman.length > 0 && (
        <ol className="tpup__list" aria-label={t.jumlahHalaman(halaman.length)}>
          {halaman.map((f, i) => (
            <li key={`${f.name}-${f.size}-${f.lastModified}-${i}`} className="tpup__item">
              {pratinjau[i] ? (
                <img className="tpup__thumb" src={pratinjau[i]!} alt="" />
              ) : (
                <span className="tpup__thumb tpup__thumb--pdf" aria-hidden="true">
                  <FilePdfIcon size={22} />
                </span>
              )}
              <span className="stack tpup__txt">
                <b>{t.halamanKe(i + 1)}</b>
                <span className="hint tpup__name">{f.name}</span>
              </span>
              <span className="tpup__act">
                <button
                  type="button"
                  className="iconbtn iconbtn--sm iconbtn--ghost"
                  disabled={sibuk || i === 0}
                  aria-label={`${t.naikkan}: ${t.halamanKe(i + 1)}`}
                  title={t.naikkan}
                  onClick={() => geser(i, -1)}
                >
                  <ArrowUpIcon size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="iconbtn iconbtn--sm iconbtn--ghost"
                  disabled={sibuk || i === halaman.length - 1}
                  aria-label={`${t.turunkan}: ${t.halamanKe(i + 1)}`}
                  title={t.turunkan}
                  onClick={() => geser(i, 1)}
                >
                  <ArrowDownIcon size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="iconbtn iconbtn--sm iconbtn--ghost iconbtn--danger"
                  disabled={sibuk}
                  aria-label={t.hapusHalaman(i + 1)}
                  title={t.hapusHalaman(i + 1)}
                  onClick={() => setHalaman(halaman.filter((_, k) => k !== i))}
                >
                  <XIcon size={16} aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
      <FileDrop
        accept={JENIS_UNGGAH}
        maxBytes={BERKAS_MAKS}
        onFiles={tambah}
        busy={sibuk}
        lang={lang}
        kinds={t.unggahJenis}
        dropLabel={t.unggahDrop}
        compact={halaman.length > 0}
      />
      {galat && (
        <p className="tpup__err" role="alert">
          {galat}
        </p>
      )}
      {halaman.length > 0 && (
        <>
          {adaBerkas && <p className="hint">{t.gantiCatatan}</p>}
          <div className="tpup__foot">
            <button
              type="button"
              className="btn btn--ghost"
              disabled={sibuk}
              onClick={() => {
                setHalaman([]);
                setGalat(null);
              }}
            >
              {t.kosongkan}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={sibuk}
              onClick={() => void kirim()}
            >
              {tahap === "susun" ? t.menyiapkan : tahap === "kirim" ? t.mengunggah : t.kirimTp}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
