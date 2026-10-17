/**
 * Tim › Pembayaran (Phase 9 Stage 6, mockup t-pay), for the Bendahara and
 * Admins. Transfers still to make (each month's kotor from the Bendahara to
 * each Asisten, then each Asisten's uang kas back to the Kas IRIS) with
 * "Mark as Transferred" and Undo across the full width, the Uang Kas card
 * beside the unit rates, and the semester ledger with an XLSX export.
 */
import { useMemo, useState, type ReactNode } from "react";
import { tanggalPanjang } from "../../lib/app";
import { jumlahkan, namaPeriode, rupiah } from "../../lib/bayar";
import type { Lang } from "../../lib/kelas";
import { unduhXlsx } from "../../lib/xlsx";
import BacaCards from "./BacaCards";
import KasCard from "./KasCard";
import { kirimBayar, potonganDari, type BayarData } from "./data";
import { Stepper } from "../ui/Controls";
import { TELAT_MAKS } from "../../lib/hadir-mengajar";
import { B, pesanB } from "./strings";
import "./bayar.css";

/** One row per Asisten who scored this semester, by name. */
function bukuBesar(data: BayarData, nama: (nim: string | null) => string) {
  const per = new Map<string, BayarData["units"]>();
  for (const u of data.units) per.set(u.nimPenilai, [...(per.get(u.nimPenilai) ?? []), u]);
  const masukKe = (nim: string, jenis: "kotor" | "balik") =>
    data.transfer
      .filter((x) => x.nim === nim && x.jenis === jenis)
      .reduce((a, x) => a + x.jumlah, 0);
  return [...per.entries()]
    .map(([nim, us]) => ({
      nim,
      j: jumlahkan(us, potonganDari(data, nim)),
      masuk: masukKe(nim, "kotor"),
      balik: masukKe(nim, "balik"),
      persen: [...new Set(us.map((u) => u.kasPersen))],
    }))
    .sort((a, b) => nama(a.nim).localeCompare(nama(b.nim)));
}

/** The header's Download XLSX button on Tim › Pembayaran. */
export function XlsxButton({
  lang,
  data,
  nama,
}: {
  lang: Lang;
  data: BayarData;
  nama: (nim: string | null) => string;
}) {
  const t = B[lang];
  const xlsx = () =>
    void unduhXlsx(
      `buku-besar-${data.semester}`,
      [t.cAsisten, t.reguler, t.internasional, t.cKotor, t.cKas, t.cBersih, t.cKotorIn, t.cBalik],
      bukuBesar(data, nama).map((r) => [
        nama(r.nim),
        r.j.reguler,
        r.j.internasional,
        r.j.kotor,
        r.j.kas,
        r.j.bersih,
        r.masuk,
        r.balik,
      ]),
      t.ledger,
    ).then(() => window.Toast?.show(t.xlsxDone, "ok"));
  return (
    <button type="button" className="btn" onClick={xlsx}>
      {t.xlsx}
    </button>
  );
}

export default function PayBoard({
  lang,
  data,
  nama,
  orang,
  reload,
  siapa,
}: {
  lang: Lang;
  data: BayarData;
  nama: (nim: string | null) => string;
  orang: { nim: string; label: string }[];
  reload: () => void;
  /** The ledger's person cell (code, name, role), as on the Team list. */
  siapa?: (nim: string) => ReactNode;
}) {
  const t = B[lang];
  const [potong, setPotong] = useState(data.tarifPotongan);
  const [rate, setRate] = useState({
    reguler: String(data.tarifUnit.reguler),
    internasional: String(data.tarifUnit.internasional),
  });
  const per = useMemo(() => {
    const m = new Map<string, BayarData["units"]>();
    for (const u of data.units) m.set(u.nimPenilai, [...(m.get(u.nimPenilai) ?? []), u]);
    return m;
  }, [data.units]);
  const unitsOf = (nim: string, periode: string) =>
    (per.get(nim) ?? []).filter((u) => u.tanggal.startsWith(periode));
  const bendahara = data.bendahara ? nama(data.bendahara) : t.bendahara;

  async function tandai(s: BayarData["sisa"][number]) {
    const r = await kirimBayar({
      aksi: "tandai",
      periode: s.periode,
      jenis: s.jenis,
      nim: s.nim,
      jumlah: s.jumlah,
    });
    if (!r.ok) return window.Toast?.show(pesanB(t, r.kode), "danger");
    window.Toast?.show(t.marked, "ok", {
      action: {
        label: t.undo,
        onClick: () =>
          void kirimBayar({ aksi: "batal", id: r.id }).then((x) => {
            window.Toast?.show(x.ok ? t.undone : pesanB(t, x.kode), x.ok ? "ok" : "danger");
            reload();
          }),
      },
    });
    reload();
  }

  const ledger = bukuBesar(data, nama);

  return (
    <div className="bayar">
      <section className="panel bayar-due">
        <div className="panel__head">
          <h2 className="panel__title">{t.toPay}</h2>
          <span className={`pill ${data.sisa.length ? "pill--warn" : "pill--ok"}`}>
            {t.pending(data.sisa.length)}
          </span>
        </div>
        <p className="panel__sub">{t.toPayHint}</p>
        {data.sisa.length === 0 ? (
          <p className="hint bayar-due__none">{t.nothingDue}</p>
        ) : (
          <div className="tabstops txstops">
            {data.sisa.map((s) => {
              const us = unitsOf(s.nim, s.periode);
              const j = jumlahkan(us, potonganDari(data, s.nim));
              const pinjam = us.filter(
                (u) => u.nimAkunSeelabs && u.nimAkunSeelabs !== u.nimPenilai,
              ).length;
              const dipotong = potonganDari(data, s.nim)
                .filter((c) => c.tanggal.startsWith(s.periode))
                .reduce((a, c) => a + c.jumlah, 0);
              const persen = [...new Set(us.map((u) => `${u.kasPersen}%`))].join(", ");
              const p = namaPeriode(s.periode, lang);
              return (
                <div key={`${s.periode}${s.jenis}${s.nim}`} className="tabstops__row">
                  <span className="pill pill--warn">{t.waiting}</span>
                  <span className="stack" style={{ gap: 0 }}>
                    <b>
                      {s.jenis === "kotor"
                        ? `${bendahara} → ${nama(s.nim)}`
                        : `${nama(s.nim)} → ${t.kasIris}`}
                    </b>
                    <span className="hint">
                      {s.jenis === "kotor"
                        ? t.kotorCtx(p, j.reguler, j.internasional)
                        : t.balikCtx(p, persen)}
                      {s.jenis === "kotor" && dipotong > 0
                        ? ` · ${t.cutOff(rupiah(dipotong))}`
                        : ""}
                      {s.jenis === "kotor" && pinjam > 0 ? ` · ${t.borrowed(pinjam)}` : ""}
                      {s.jumlah < s.total ? ` · ${t.sisaDari(rupiah(s.total))}` : ""}
                    </span>
                  </span>
                  <b className="num">{rupiah(s.jumlah)}</b>
                  <button type="button" className="btn btn--sm" onClick={() => void tandai(s)}>
                    {t.mark}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {data.transfer.length > 0 && (
          <>
            <h3 className="panel__title" style={{ fontSize: "1rem" }}>
              {t.paidList}
            </h3>
            <div className="tabstops txstops">
              {data.transfer.slice(0, 12).map((x) => (
                <div key={x.id} className="tabstops__row">
                  <span className="pill pill--ok">{t.paid}</span>
                  <span className="stack" style={{ gap: 0 }}>
                    <b>
                      {x.jenis === "kotor"
                        ? `${bendahara} → ${nama(x.nim)}`
                        : `${nama(x.nim)} → ${t.kasIris}`}
                    </b>
                    <span className="hint">{namaPeriode(x.periode, lang)}</span>
                  </span>
                  <b className="num">{rupiah(x.jumlah)}</b>
                  <span className="hint">
                    {t.paidBy(nama(x.oleh), tanggalPanjang(x.pada.slice(0, 10), lang))}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <div className="bayar-side">
        <KasCard
          lang={lang}
          data={data}
          bisa={data.admin}
          nama={nama}
          orang={orang}
          reload={reload}
        />
        <section className="panel">
          <h2 className="panel__title">{t.rates}</h2>
          {(["reguler", "internasional"] as const).map((k) => (
            <div key={k} className="field">
              <label className="field__label" htmlFor={`rate-${k}`}>
                {t[k]}
              </label>
              <span className="moneyin">
                <span>Rp</span>
                <input
                  id={`rate-${k}`}
                  className="field__input mono"
                  inputMode="numeric"
                  value={Number(rate[k] || 0).toLocaleString("id-ID")}
                  onChange={(e) =>
                    setRate({ ...rate, [k]: e.target.value.replace(/\D/g, "").slice(0, 8) })
                  }
                />
                <span>,00</span>
              </span>
            </div>
          ))}
          <span className="hint">{t.ratesHint}</span>
          <div className="panel__actions">
            <button
              type="button"
              className="btn btn--primary btn--block"
              disabled={!Number(rate.reguler) || !Number(rate.internasional)}
              onClick={async () => {
                const r = await kirimBayar({
                  aksi: "tarif",
                  reguler: Number(rate.reguler),
                  internasional: Number(rate.internasional),
                });
                window.Toast?.show(r.ok ? t.ratesSaved : pesanB(t, r.kode), r.ok ? "ok" : "danger");
                reload();
              }}
            >
              {t.ratesSave}
            </button>
          </div>
          <h3 className="panel__title" style={{ fontSize: "1rem", marginTop: 8 }}>
            {t.cutsHead}
          </h3>
          <div className="field">
            <span className="field__label">{t.cutRate}</span>
            <Stepper
              value={potong.perMenit}
              min={0}
              max={10000}
              step={500}
              onChange={(v) => setPotong({ ...potong, perMenit: v })}
              fmt={rupiah}
              label={t.cutRateLabel}
              lessLabel="-500"
              moreLabel="+500"
            />
          </div>
          <div className="field">
            <span className="field__label">{t.cutMax}</span>
            <Stepper
              value={potong.maks}
              min={1}
              max={TELAT_MAKS}
              onChange={(v) => setPotong({ ...potong, maks: v })}
              fmt={t.cutMin}
              label={t.cutMaxLabel}
              lessLabel="-1"
              moreLabel="+1"
            />
          </div>
          <span className="hint">{t.cutHint(rupiah(potong.perMenit * potong.maks))}</span>
          <div className="panel__actions" style={{ marginTop: "auto" }}>
            <button
              type="button"
              className="btn btn--primary btn--block"
              onClick={async () => {
                const r = await kirimBayar({
                  aksi: "potongan",
                  perMenit: potong.perMenit,
                  maks: potong.maks,
                });
                window.Toast?.show(r.ok ? t.cutSaved : pesanB(t, r.kode), r.ok ? "ok" : "danger");
                reload();
              }}
            >
              {t.cutSave}
            </button>
          </div>
        </section>
      </div>

      <section className="panel panel--flush">
        <div className="panel__head" style={{ padding: "16px 20px 0" }}>
          <h2 className="panel__title">{t.ledger}</h2>
        </div>
        {ledger.length === 0 ? (
          <p className="hint" style={{ padding: "0 20px 20px" }}>
            {t.ledgerEmpty}
          </p>
        ) : (
          <div className="bayar-scroll">
            <table className="bayar-table">
              <thead>
                <tr>
                  <th>{t.cAsisten}</th>
                  <th className="num">{t.cUnit}</th>
                  <th className="num">{t.cKotor}</th>
                  <th className="num">{t.cKas}</th>
                  <th className="num">{t.cBersih}</th>
                  <th>{t.cKotorIn}</th>
                  <th>{t.cBalik}</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((r) => (
                  <tr key={r.nim}>
                    <td>{siapa ? siapa(r.nim) : nama(r.nim)}</td>
                    <td className="num">
                      {r.j.reguler} + {r.j.internasional}
                    </td>
                    <td className="num">{rupiah(r.j.kotor)}</td>
                    <td className="num">
                      {rupiah(r.j.kas)}{" "}
                      {r.persen.length === 1 && r.persen[0] !== data.kas.persen && (
                        <span className="pill pill--violet">{r.persen[0]}%</span>
                      )}
                    </td>
                    <td className="num">
                      <b>{rupiah(r.j.bersih)}</b>
                    </td>
                    {r.nim === data.bendahara ? (
                      <td colSpan={2}>
                        <span className="pill">{t.bendahara}</span>
                      </td>
                    ) : (
                      <>
                        <td>
                          <span
                            className={`pill ${r.masuk >= r.j.kotor ? "pill--ok" : "pill--warn"}`}
                          >
                            {r.masuk >= r.j.kotor ? t.arrived : t.notYet}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`pill ${r.balik >= r.j.kas ? "pill--ok" : "pill--warn"}`}
                          >
                            {r.balik >= r.j.kas ? t.lunas : t.notYet}
                          </span>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 2026-10-17: the SeeLabs read-back's flags, Admins only */}
      <BacaCards lang={lang} data={data} nama={nama} reload={reload} />
    </div>
  );
}
