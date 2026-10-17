/** Bayar's SeeLabs read-back cards for the Admins (2026-10-17): the days and
 *  shifts where Rekap BAP and Bayar disagree, and the SeeLabs scores with no
 *  IRIS session, with Periksa Semua Sekarang. Flags only: pay never changes
 *  from them. */
import { useState } from "react";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { postJson, tanggalPanjang } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { PRAKTIKUM_SEELABS } from "../../lib/seelabs-robot";
import { useSiaran } from "../../lib/siaran";
import { BC } from "../console/seelabs/bacaStrings";
import type { BayarData } from "./data";
import { B } from "./strings";

const kelasDari = (praktikum: number) =>
  praktikum === PRAKTIKUM_SEELABS.internasional ? "internasional" : "reguler";

export default function BacaCards({
  lang,
  data,
  nama,
  reload,
}: {
  lang: Lang;
  data: BayarData;
  nama: (nim: string | null) => string;
  reload: () => void;
}) {
  const b = BC[lang];
  const t = B[lang];
  const [busy, setBusy] = useState(false);
  // The robot's reads land as "seelabs"; Bayar's own topics don't carry them.
  useSiaran(["seelabs"], reload, !!data.bedaBap);
  if (!data.bedaBap || !data.lepas) return null;
  const bap = [...data.bedaBap].sort(
    (x, y) => y.tanggal.localeCompare(x.tanggal) || x.shift - y.shift,
  );
  const lepas = [...data.lepas].sort((x, y) => x.modul - y.modul || x.nim.localeCompare(y.nim));

  async function periksaSemua() {
    setBusy(true);
    const r = await postJson<{ ok: boolean; tugas?: number[] }>("/api/session/robot", {
      aksi: "periksa",
      semua: true,
    }).catch(() => ({ ok: false, tugas: [] }));
    setBusy(false);
    window.Toast?.show(
      !r.ok ? b.gagal : r.tugas?.length ? b.periksaOk : b.periksaTanpa,
      r.ok && r.tugas?.length ? "ok" : "danger",
    );
  }

  const tombol = (
    <button
      type="button"
      className="btn btn--ghost btn--sm"
      disabled={busy}
      onClick={() => void periksaSemua()}
    >
      {b.periksaSemua}
      <ArrowClockwiseIcon size={16} weight="bold" aria-hidden="true" />
    </button>
  );

  return (
    <div className="bayar-baca">
      <section className="panel panel--flush">
        <div className="panel__head bayar-baca__head">
          <h2 className="panel__title">{b.bapH}</h2>
          <span className={`pill ${bap.length ? "pill--warn" : "pill--ok"}`}>{bap.length}</span>
          {tombol}
        </div>
        <p className="hint bayar-baca__hint">{b.bapHint}</p>
        {bap.length === 0 ? (
          <p className="hint bayar-baca__hint">{b.bapKosong}</p>
        ) : (
          <div className="bayar-scroll">
            <table className="bayar-table">
              <thead>
                <tr>
                  <th>{b.kolTanggal}</th>
                  <th className="num">{b.kolShift}</th>
                  <th>{b.kolAkun}</th>
                  <th>{b.kolJenis}</th>
                  <th>{b.kolPenilai}</th>
                </tr>
              </thead>
              <tbody>
                {bap.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <span className="bayar-baca__tgl">{tanggalPanjang(f.tanggal, lang)}</span>
                      <span className="hint bayar-baca__kelas">{t[kelasDari(f.praktikum)]}</span>
                    </td>
                    <td className="num">{f.shift}</td>
                    <td>{nama(f.akunNim)}</td>
                    <td>
                      <span className="pill pill--warn">
                        {f.jenis === "hanya_iris" ? b.hanyaIris : b.hanyaSeelabs}
                      </span>
                    </td>
                    <td>{f.penilai.length ? f.penilai.map((n) => nama(n)).join(", ") : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel panel--flush">
        <div className="panel__head bayar-baca__head">
          <h2 className="panel__title">{b.lepasH}</h2>
          <span className={`pill ${lepas.length ? "pill--warn" : "pill--ok"}`}>{lepas.length}</span>
        </div>
        <p className="hint bayar-baca__hint">{b.lepasHint}</p>
        {lepas.length === 0 ? (
          <p className="hint bayar-baca__hint">{b.lepasKosong}</p>
        ) : (
          <div className="bayar-scroll">
            <table className="bayar-table">
              <thead>
                <tr>
                  <th>{b.kolNim}</th>
                  <th className="num">{b.kolModul}</th>
                  <th className="num">{b.kolKlp}</th>
                  <th>{b.kolAkun}</th>
                  <th className="num">TP</th>
                  <th className="num">TA</th>
                  <th className="num">{b.praktikum}</th>
                  <th className="num">{b.jurnal}</th>
                </tr>
              </thead>
              <tbody>
                {lepas.map((l) => (
                  <tr key={l.id}>
                    <td className="mono">
                      {l.nim}
                      <span className="hint"> · {t[kelasDari(l.praktikum)]}</span>
                    </td>
                    <td className="num">{l.modul}</td>
                    <td className="num">{l.klp}</td>
                    <td>{nama(l.akunNim)}</td>
                    <td className="num">{l.nilai.tp}</td>
                    <td className="num">{l.nilai.ta}</td>
                    <td className="num">{l.nilai.praktikum}</td>
                    <td className="num">{l.nilai.jurnal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
