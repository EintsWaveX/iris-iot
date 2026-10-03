/**
 * An Asisten's own earnings (Phase 9 Stage 6): the Account page's
 * "Pendapatan" card (semester and month as Bersih, Kotor and Uang Kas, and
 * this month's two transfers) and the Console home's "Pendapatan Bulan
 * Ini". Private: only the person and the Admins see these numbers.
 */
import { ArrowRightIcon, LockSimpleIcon } from "@phosphor-icons/react";
import Tooltip from "../ui/Tooltip";
import { href } from "../../lib/app";
import { jumlahkan, namaPeriode, rupiah, type Ringkasan } from "../../lib/bayar";
import type { Lang } from "../../lib/kelas";
import { useDirektori } from "../../lib/people";
import { periodeKini, useBayar, type BayarData } from "./data";
import { B, type BStrings } from "./strings";
import "./bayar.css";

function Pribadi({ t }: { t: BStrings }) {
  return (
    <Tooltip label={t.privateTip}>
      <span className="pill" tabIndex={0}>
        <LockSimpleIcon size={13} aria-hidden="true" />
        {t.private}
      </span>
    </Tooltip>
  );
}

/** One average rate across the units shown, for the labels. */
function persenDari(us: BayarData["units"], dflt: number): string {
  const s = [...new Set(us.map((u) => u.kasPersen))];
  return s.length === 0 ? `${dflt}%` : s.map((x) => `${x}%`).join(", ");
}

export function KasFigures({
  t,
  r,
  persen,
  sub,
}: {
  t: BStrings;
  r: Ringkasan;
  persen: string;
  sub?: string;
}) {
  return (
    <div className="kasfig">
      <div className="kasfig__i kasfig__net">
        <span className="label-caps">{t.net}</span>
        <b className="money num">{rupiah(r.bersih)}</b>
        {sub && <span className="hint">{sub}</span>}
      </div>
      <div className="kasfig__i">
        <span className="label-caps">{t.gross}</span>
        <b className="num">{rupiah(r.kotor)}</b>
      </div>
      <div className="kasfig__i">
        <span className="label-caps">{t.kasPct(persen)}</span>
        <b className="num kasfig__cut">− {rupiah(r.kas)}</b>
      </div>
    </div>
  );
}

export function EarningsCard({ lang, nim }: { lang: Lang; nim: string }) {
  const t = B[lang];
  const { data } = useBayar();
  const dir = useDirektori();
  if (!data) return <span className="skeleton" style={{ height: 220 }} />;
  const mine = data.units.filter((u) => u.nimPenilai === nim);
  const periode = periodeKini();
  const bulan = mine.filter((u) => u.tanggal.startsWith(periode));
  const sem = jumlahkan(mine);
  const bln = jumlahkan(bulan);
  const tf = data.transfer.filter((x) => x.nim === nim && x.periode === periode);
  const masuk = tf.filter((x) => x.jenis === "kotor").reduce((a, x) => a + x.jumlah, 0);
  const balik = tf.filter((x) => x.jenis === "balik").reduce((a, x) => a + x.jumlah, 0);
  const persen = persenDari(bulan.length ? bulan : mine, data.kas.persenSaya);
  const p = namaPeriode(periode, lang);
  return (
    <section className="panel panel--key">
      <div className="panel__head">
        <h2 className="panel__title">{t.earnings}</h2>
        <Pribadi t={t} />
      </div>
      {mine.length === 0 ? (
        <p className="hint">{t.noEarnings}</p>
      ) : (
        <div className="earn">
          <div className="stack stack--sm">
            <span className="label-caps">{t.thisSemester}</span>
            <KasFigures
              t={t}
              r={sem}
              persen={persenDari(mine, data.kas.persenSaya)}
              sub={t.unitsRate(
                sem.reguler,
                rupiah(data.tarifUnit.reguler),
                sem.internasional,
                rupiah(data.tarifUnit.internasional),
              )}
            />
          </div>
          <div className="stack stack--sm">
            <span className="label-caps">{t.thisMonth}</span>
            <KasFigures
              t={t}
              r={bln}
              persen={persen}
              sub={t.unitsLine(bln.reguler, bln.internasional)}
            />
          </div>
          <div className="stack stack--sm">
            <span className="label-caps">{t.monthTransfers}</span>
            {nim === data.bendahara ? (
              <p className="hint">{t.selfHeld}</p>
            ) : (
              <div className="paylines">
                <div className="payline">
                  <span className="payline__t">
                    {t.kotorFrom(data.bendahara ? dir.nama(data.bendahara) : "", p)}
                  </span>
                  <span className="payline__v">
                    <b className="num">{rupiah(bln.kotor)}</b>
                    <span
                      className={`pill ${bln.kotor > 0 && masuk >= bln.kotor ? "pill--ok" : "pill--warn"}`}
                    >
                      {bln.kotor > 0 && masuk >= bln.kotor ? t.arrived : t.notYet}
                    </span>
                  </span>
                </div>
                <div className="payline">
                  <span className="payline__t">{t.balikTo(persen)}</span>
                  <span className="payline__v">
                    <b className="num">{rupiah(bln.kas)}</b>
                    <span
                      className={`pill ${bln.kas > 0 && balik >= bln.kas ? "pill--ok" : "pill--warn"}`}
                    >
                      {bln.kas > 0 && balik >= bln.kas ? t.lunas : t.notYet}
                    </span>
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {nim !== data.bendahara && (
        <span className="hint">{t.accountRule(`${data.kas.persenSaya}%`)}</span>
      )}
    </section>
  );
}

export function EarningsMini({ lang, nim }: { lang: Lang; nim: string }) {
  const t = B[lang];
  const { data } = useBayar();
  if (!data) return <span className="skeleton" style={{ height: 150 }} />;
  const periode = periodeKini();
  const bulan = data.units.filter((u) => u.nimPenilai === nim && u.tanggal.startsWith(periode));
  const r = jumlahkan(bulan);
  const masuk = data.transfer
    .filter((x) => x.nim === nim && x.periode === periode && x.jenis === "kotor")
    .reduce((a, x) => a + x.jumlah, 0);
  const menunggu = r.kotor > masuk && nim !== data.bendahara ? 1 : 0;
  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">{t.monthEarnings}</h2>
        <Pribadi t={t} />
      </div>
      <div className="row row--between">
        <span className="stack" style={{ gap: 0 }}>
          <span className="label-caps">{t.net}</span>
          <b className="money num">{rupiah(r.bersih)}</b>
        </span>
        <a className="btn btn--ghost btn--sm" href={href(lang, "/account")}>
          {t.details}
          <ArrowRightIcon size={16} aria-hidden="true" />
        </a>
      </div>
      <span className="hint num">
        {t.kasLine(rupiah(r.kotor), persenDari(bulan, data.kas.persenSaya), rupiah(r.kas))}
      </span>
      <span className="hint">
        {t.unitsLine(r.reguler, r.internasional)}
        {t.pendingIn(menunggu)}
      </span>
    </section>
  );
}
