/**
 * The session report's Phase 18 blocks: Asisten Attendance (check-in,
 * status, cut, the PJ's notes), Score Input (each group's Kirim Nilai and
 * SeeLabs times, same day or late) and a plain report text to copy.
 * Data comes with GET /api/session/rekap (api/_lib/hadir-laporan.ts).
 */
import { tanggalPanjang } from "../../lib/app";
import { kelasLabel, kelompokLabel, modulLabel } from "../../lib/labels";
import type { Kelas, Lang } from "../../lib/kelas";
import type { StatusLive } from "../../lib/hadir-mengajar";
import { teksLaporanHadir } from "../../lib/hadir-mengajar";
import type { Direktori } from "../../lib/people";
import Pill from "../ui/Pill";
import { jamWib, tanggalWib } from "./data";
import { H, NADA_HADIR, labelHadir, rpPendek } from "./hadirStrings";
import "./HadirRingkas.css";

export interface HadirSesiData {
  kunci: string;
  otomatis: string | null;
  geser: { dari: string; ke: string; alasan: string; oleh: string } | null;
  pj: string | null;
  baris: {
    nim: string;
    kode: string;
    status: StatusLive;
    menit: number | null;
    hadirPada: string | null;
    potong: number;
    nolkanUnit: boolean;
    hitungMangkir: boolean;
    ubah: { status: string; alasan: string | null; oleh: string | null } | null;
  }[];
  ambilAlih: { dari: string; nomor: number | null; oleh: string; pada: string }[];
}

export interface InputNilaiData {
  nomor: number;
  pemegang: string | null;
  kirim: { oleh: string; pada: string } | null;
  simpan: { pada: string; cara: "robot" | "tangan" | null; akun: string } | null;
  kurang: ("kirim" | "seelabs")[];
  menyusulPada: string | null;
  alasanAkun: "kelompok_kedua" | "sesi_ketiga" | null;
  status: "tepat" | "menyusul" | "lupa" | "terbuka";
}

interface SesiMini {
  tanggal: string;
  slot: number | null;
  modul: number;
  kelas: Kelas;
  status: string;
}

/** "12:29", or the long date and the time when it is not the practicum day itself. */
function waktu(iso: string, tanggal: string, lang: Lang): string {
  const hari = tanggalWib(iso);
  return hari === tanggal ? jamWib(iso) : `${tanggalPanjang(hari, lang)} ${jamWib(iso)}`;
}

export default function HadirSesi({
  hadir,
  nilai,
  sesi,
  lang,
  dir,
}: {
  hadir: HadirSesiData | null;
  nilai: InputNilaiData[] | null;
  sesi: SesiMini;
  lang: Lang;
  dir: Direktori;
}) {
  const t = H[lang];
  if (!hadir && !nilai) return null;
  const kode = (nim: string | null | undefined) => (nim ? (dir.byNim.get(nim)?.kode ?? nim) : "?");
  const selesai = sesi.status === "selesai";

  const teks = hadir
    ? teksLaporanHadir({
        lang,
        tanggal: tanggalPanjang(sesi.tanggal, lang),
        sesi:
          lang === "zh"
            ? `第 ${sesi.slot ?? "?"} 节课`
            : lang === "en"
              ? `Session ${sesi.slot ?? "?"}`
              : `Sesi ${sesi.slot ?? "?"}`,
        modul: modulLabel(sesi.modul, lang),
        kelas: kelasLabel(sesi.kelas, lang),
        mulaiOtomatis: hadir.otomatis ? jamWib(hadir.otomatis) : null,
        geser: hadir.geser,
        orang: hadir.baris.map((b) => ({
          kode: b.kode,
          status: b.status,
          menit: b.menit,
          jam: b.hadirPada ? jamWib(b.hadirPada) : null,
          potong: b.potong,
          hitungMangkir: b.hitungMangkir,
          ambilAlih: hadir.ambilAlih
            .filter((a) => a.dari === b.nim)
            .map((a) => ({ kode: kode(a.oleh), nomor: a.nomor, jam: jamWib(a.pada) })),
          ubah:
            b.ubah?.alasan && b.ubah.oleh
              ? { oleh: kode(b.ubah.oleh), alasan: b.ubah.alasan }
              : null,
        })),
        nilai:
          selesai && nilai
            ? nilai.map((n) => ({
                nomor: n.nomor,
                lupa: n.status === "lupa" || n.status === "menyusul",
                menyusul: n.menyusulPada ? waktu(n.menyusulPada, sesi.tanggal, lang) : null,
              }))
            : null,
      })
    : "";

  const salin = async () => {
    try {
      await navigator.clipboard.writeText(teks);
      window.Toast?.show(t.copied, "ok");
    } catch {
      window.Toast?.show(t.copyFail, "danger");
    }
  };

  return (
    <>
      {hadir && (
        <section className="panel panel--flush">
          <div className="row row--between" style={{ padding: "16px 20px" }}>
            <div className="stack stack--sm">
              <h2 className="panel__title">{t.attTitle}</h2>
              <span className="hint">
                {[
                  hadir.otomatis ? t.attStarted(jamWib(hadir.otomatis)) : null,
                  hadir.geser ? t.attClockMoved(hadir.geser.dari, hadir.geser.ke) : t.attClockKept,
                  hadir.pj ? t.attPj(hadir.pj.toUpperCase()) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            <button type="button" className="btn btn--sm" onClick={() => void salin()}>
              {t.copyText}
            </button>
          </div>
          {hadir.baris.length === 0 ? (
            <p className="hint" style={{ padding: "0 20px 16px" }}>
              {t.attNone}
            </p>
          ) : (
            <div className="rp-scrollx" tabIndex={0} aria-label={t.attTitle}>
              <table className="rp-table rp-table--tight">
                <thead>
                  <tr>
                    <th>{t.colAsisten}</th>
                    <th>{t.colHere}</th>
                    <th>{t.colStatus}</th>
                    <th>{t.colCut}</th>
                    <th>{t.colNote}</th>
                  </tr>
                </thead>
                <tbody>
                  {hadir.baris.map((b) => {
                    const catatan = [
                      ...hadir.ambilAlih
                        .filter((a) => a.dari === b.nim)
                        .map((a) => t.tookOver(a.nomor, kode(a.oleh), jamWib(a.pada))),
                      b.status === "mm" && b.hitungMangkir ? t.mmCounted : null,
                      b.ubah?.alasan && b.ubah.oleh
                        ? t.changedBy(kode(b.ubah.oleh), b.ubah.alasan)
                        : null,
                    ].filter(Boolean);
                    return (
                      <tr key={b.nim}>
                        <td>{dir.nama(b.nim)}</td>
                        <td className="mono num">{b.hadirPada ? jamWib(b.hadirPada, true) : ""}</td>
                        <td>
                          <Pill tone={NADA_HADIR[b.status]}>
                            {labelHadir(lang, b.status, b.menit)}
                          </Pill>
                        </td>
                        <td className="num">
                          {b.nolkanUnit ? t.notPaid : b.potong > 0 ? rpPendek(b.potong) : ""}
                        </td>
                        <td className="hint">{catatan.join(" ")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {nilai && nilai.length > 0 && (
        <section className="panel panel--flush">
          <div className="row row--between" style={{ padding: "16px 20px" }}>
            <h2 className="panel__title">{t.scoreTitle}</h2>
            <span className="hint">{t.scoreHint}</span>
          </div>
          <div className="rp-scrollx" tabIndex={0} aria-label={t.scoreTitle}>
            <table className="rp-table rp-table--tight">
              <thead>
                <tr>
                  <th>{t.colGroup}</th>
                  <th>{t.colAsisten}</th>
                  <th>{t.colSent}</th>
                  <th>{t.colSaved}</th>
                  <th>{t.colStatus}</th>
                </tr>
              </thead>
              <tbody>
                {nilai.map((n) => (
                  <tr key={n.nomor}>
                    <td>
                      <Pill group={n.nomor}>{kelompokLabel(n.nomor, lang)}</Pill>
                    </td>
                    <td>
                      {n.pemegang ? dir.nama(n.pemegang) : ""}
                      {hadir?.ambilAlih
                        .filter((a) => a.nomor === n.nomor)
                        .map((a) => (
                          <span key={a.dari} className="hint">
                            {t.dari(kode(a.dari))}
                          </span>
                        ))}
                    </td>
                    <td className="num">
                      {n.kirim ? waktu(n.kirim.pada, sesi.tanggal, lang) : ""}
                    </td>
                    <td>
                      {n.simpan
                        ? [
                            n.simpan.cara === "robot"
                              ? t.viaRobot(waktu(n.simpan.pada, sesi.tanggal, lang))
                              : n.simpan.cara === "tangan"
                                ? t.viaHand(waktu(n.simpan.pada, sesi.tanggal, lang))
                                : t.saved(waktu(n.simpan.pada, sesi.tanggal, lang)),
                            n.simpan.akun !== n.pemegang
                              ? t.lewat(
                                  kode(n.simpan.akun),
                                  n.alasanAkun === "sesi_ketiga"
                                    ? t.alasanKetiga(kode(n.pemegang))
                                    : t.alasanKedua,
                                )
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" ")
                        : ""}
                    </td>
                    <td>
                      {n.status === "tepat" ? (
                        <Pill tone="ok">{t.sameDay}</Pill>
                      ) : n.status === "menyusul" ? (
                        <>
                          <Pill tone="warn">{t.lateIn}</Pill>
                          {n.menyusulPada && (
                            <div className="hint">{waktu(n.menyusulPada, sesi.tanggal, lang)}</div>
                          )}
                        </>
                      ) : n.status === "lupa" ? (
                        <>
                          <Pill tone="danger">{t.lateOpen}</Pill>
                          <div className="hint">
                            {t.missing(n.kurang.includes("kirim"), n.kurang.includes("seelabs"))}
                          </div>
                        </>
                      ) : (
                        <Pill>{t.open}</Pill>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {hadir && (
        <section className="panel">
          <h2 className="panel__title">{t.textTitle}</h2>
          <p className="hadir-teks">{teks}</p>
        </section>
      )}
    </>
  );
}
