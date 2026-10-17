/**
 * Laporan › Beban Asisten, second card (Phase 18): per Asisten, how many
 * finished sessions of the semester were on time, late, Mangkir Mengajar,
 * Mangkir or excused, the cuts, and the Lupa Input Nilai records (how many
 * were put in late). Data: GET /api/session/hadirrekap, Asisten only.
 */
import { useCallback, useEffect, useState } from "react";
import { getJson } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import type { Direktori } from "../../lib/people";
import { useSegar } from "../../lib/siaran";
import Pill from "../ui/Pill";
import { H, rpPendek } from "./hadirStrings";
import "./HadirRingkas.css";

interface Baris {
  nim: string;
  tepat: number;
  telat: number;
  mm: number;
  mangkir: number;
  izin: number;
  potong: number;
  sesiNol: number;
  lupa: number;
  lupaMenyusul: number;
}

export default function HadirSemester({ lang, dir }: { lang: Lang; dir: Direktori }) {
  const t = H[lang];
  const [rows, setRows] = useState<Baris[] | null>(null);
  const [fail, setFail] = useState(false);
  const segar = useSegar(["hadir", "sesi", "laporan"]);
  const muat = useCallback(() => {
    getJson<{ ok: boolean; orang: Baris[] }>("/api/session/hadirrekap")
      .then((d) => {
        if (!d.ok) return setFail(true);
        setRows(d.orang);
        setFail(false);
      })
      .catch(() => setFail(true));
  }, []);
  useEffect(muat, [muat, segar]);

  if (fail && !rows) return <p className="hint">{t.loadFail}</p>;
  if (!rows) return <span className="skeleton" style={{ height: 160 }} />;
  const urut = [...rows].sort((a, b) => dir.nama(a.nim).localeCompare(dir.nama(b.nim)));
  return (
    <section className="rp-card rp-card--flush" style={{ marginTop: "var(--space-5)" }}>
      <div className="row row--between" style={{ padding: "16px 20px" }}>
        <h2 className="panel__title">{t.semTitle}</h2>
        <span className="hint">{t.semHint}</span>
      </div>
      {urut.length === 0 ? (
        <p className="hint" style={{ padding: "0 20px 16px" }}>
          {t.semNone}
        </p>
      ) : (
        <div className="rp-scrollx" tabIndex={0} aria-label={t.semTitle}>
          <table className="rp-table">
            <thead>
              <tr>
                <th>{t.colAsisten}</th>
                <th className="num">{t.colOnTime}</th>
                <th className="num">{t.colLate}</th>
                <th className="num">{t.colMm}</th>
                <th className="num">{t.colMangkir}</th>
                <th className="num">{t.colExcused}</th>
                <th className="num">{t.colCuts}</th>
                <th className="num">{t.colLupa}</th>
              </tr>
            </thead>
            <tbody>
              {urut.map((r) => (
                <tr key={r.nim}>
                  <td>{dir.nama(r.nim)}</td>
                  <td className="num">{r.tepat}</td>
                  <td className="num">{r.telat || ""}</td>
                  <td className="num">{r.mm || ""}</td>
                  <td className="num">{r.mangkir || ""}</td>
                  <td className="num">{r.izin || ""}</td>
                  <td className="num">{r.potong ? rpPendek(r.potong) : ""}</td>
                  <td className="num">
                    {r.lupa ? <Pill tone="warn">{t.lupaCount(r.lupa, r.lupaMenyusul)}</Pill> : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
