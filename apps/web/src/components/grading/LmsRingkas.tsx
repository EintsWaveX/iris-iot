/**
 * Sumber LMS, 2026-10-14: Silang Data (who is registered where: IRIS,
 * SeeLabs, each LMS class with ADD, and the Praktikan who are Asisten too)
 * and Riwayat Sinkron (the last 10 on the page, the whole history in its
 * own dialog, 100 a page).
 */
import { useEffect, useState } from "react";
import { ArrowsOutSimpleIcon, ClockCounterClockwiseIcon } from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import Disclose from "../ui/Disclose";
import TabLine from "../ui/TabLine";
import { getJson } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { TPS } from "../tp/tpStrings";
import { jam, waktuPanjang } from "../tp/shared";
import { LK } from "./lmsKelolaStrings";

export interface SilangInfo {
  iris: number;
  lms: number;
  adaData: boolean;
  perKelas: { label: string; iris: number; luar: number; lms: number }[];
  seelabs: {
    pada: string;
    total: number;
    klp: number;
    bukanIris: { nim: string; nama: string }[];
    tanpaSeelabs: { nim: string; nama: string; kelas: string }[];
  } | null;
  asisten: { nim: string; nama: string; kode: string; kelas: string; kursus: string[] }[];
}

export interface BarisLog {
  id: number;
  mulai: string;
  oleh: string;
  hasil: "ok" | "gagal";
  baru: number;
  diperbarui: number;
  durasiMs: number;
  galat: string | null;
}

/* ========================================================= Silang Data */

export function SilangPanel({ lang, silang }: { lang: Lang; silang: SilangInfo }) {
  const t = LK[lang];
  const s = silang.seelabs;
  const tile = (label: string, n: number | string) => (
    <div className="tpsilang__tile">
      <dt>{label}</dt>
      <dd className="mono">{n}</dd>
    </div>
  );
  return (
    <section className="panel tpsilang">
      <div className="panel__head">
        <h2 className="panel__title">{t.silangH}</h2>
        <span className="hint">{t.silangLede}</span>
      </div>
      <dl className="tpsilang__tiles">
        {tile(t.sIris, silang.iris)}
        {tile(t.sSeelabs, s ? s.total : "…")}
        {tile(t.sLms, silang.adaData ? silang.lms : "…")}
        {tile(t.sAsisten, silang.asisten.length)}
      </dl>
      <p className="hint tpsilang__pada">
        {s ? t.sSeelabsPada(waktuPanjang(s.pada, lang).split(" · ")[0], s.klp) : t.sSeelabsBelum}
      </p>
      <div className="tpsilang__isi">
        <h3 className="tpsilang__h">{t.asistenH}</h3>
        <p className="hint">{t.asistenHint}</p>
        {silang.asisten.length ? (
          <ul className="tppeserta__list tpsilang__list">
            {silang.asisten.map((a) => (
              <li key={a.nim}>
                <span className="grow stack" style={{ gap: 0 }}>
                  <b>{a.nama}</b>
                  <span className="hint mono">
                    {a.nim} · {a.kode}
                  </span>
                </span>
                <span className="stack tpsilang__kelas">
                  <b className="mono">{a.kursus.length ? a.kursus.join(", ") : t.tanpaKelasLms}</b>
                  <span className="hint">{t.kelasIris[a.kelas] ?? a.kelas}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">{t.kosong}</p>
        )}
        {s && (
          <>
            <Disclose head={t.bukanIrisH(s.bukanIris.length)}>
              {s.bukanIris.length ? (
                <ul className="tppeserta__list">
                  {s.bukanIris.map((p) => (
                    <li key={p.nim}>
                      <span className="grow stack" style={{ gap: 0 }}>
                        <b>{p.nama}</b>
                        <span className="hint mono">{p.nim}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint">{t.kosong}</p>
              )}
            </Disclose>
            <Disclose head={t.tanpaSeelabsH(s.tanpaSeelabs.length)}>
              {s.tanpaSeelabs.length ? (
                <ul className="tppeserta__list">
                  {s.tanpaSeelabs.map((p) => (
                    <li key={p.nim}>
                      <span className="grow stack" style={{ gap: 0 }}>
                        <b>{p.nama}</b>
                        <span className="hint mono">
                          {p.nim} · {t.kelasIris[p.kelas] ?? p.kelas}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint">{t.kosong}</p>
              )}
            </Disclose>
          </>
        )}
      </div>
    </section>
  );
}

/* ====================================================== Riwayat Sinkron */

function Baris({ lang, r }: { lang: Lang; r: BarisLog }) {
  const t = TPS[lang];
  const oleh =
    r.oleh === "pi"
      ? t.olehPi
      : r.oleh === "halaman"
        ? t.olehHalaman
        : r.oleh.startsWith("manual:")
          ? t.olehManual(r.oleh.slice(7))
          : r.oleh;
  return (
    <li data-tone={r.hasil === "gagal" ? "danger" : "ok"}>
      <span className="mono">{jam(r.mulai)}</span>
      <span className="grow stack" style={{ gap: 0 }}>
        <b>
          {r.hasil === "gagal" ? t.hasilGagal(r.galat ?? "") : t.hasilBerkas(r.baru, r.diperbarui)}
        </b>
        <span className="hint">
          {oleh} · {(r.durasiMs / 1000).toFixed(1)} s ·{" "}
          {waktuPanjang(r.mulai, lang).split(" · ")[0]}
        </span>
      </span>
    </li>
  );
}

export function RiwayatPanel({ lang, log, total }: { lang: Lang; log: BarisLog[]; total: number }) {
  const t = LK[lang];
  const tp = TPS[lang];
  const [buka, setBuka] = useState(false);
  return (
    <section className="panel tpriwayat">
      <div className="panel__head tpriwayat__head">
        <div className="stack stack--sm">
          <h2 className="panel__title">{t.riwayatH}</h2>
          {log.length > 0 && <span className="hint">{t.riwayatLede(log.length, total)}</span>}
        </div>
        {total > 0 && (
          <button type="button" className="btn" onClick={() => setBuka(true)}>
            <ArrowsOutSimpleIcon size={18} aria-hidden="true" />
            {t.lihatSemua}
          </button>
        )}
      </div>
      {log.length ? (
        <ul className="tplog tplog--lebar">
          {log.map((r) => (
            <Baris key={r.id} lang={lang} r={r} />
          ))}
        </ul>
      ) : (
        <p className="hint">{tp.riwayatKosong}</p>
      )}
      <RiwayatDialog open={buka} onOpenChange={setBuka} lang={lang} />
    </section>
  );
}

function RiwayatDialog({
  open,
  onOpenChange,
  lang,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lang: Lang;
}) {
  const t = LK[lang];
  const [rows, setRows] = useState<BarisLog[]>([]);
  const [total, setTotal] = useState(0);
  const [lagi, setLagi] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [saring, setSaring] = useState<"semua" | "gagal">("semua");

  const muat = async (sebelum?: number) => {
    setSibuk(true);
    type Jawab = { ok: boolean; total: number; lagi: boolean; log: BarisLog[] };
    const d = await getJson<Jawab>(`/api/tp/riwayat${sebelum ? `?sebelum=${sebelum}` : ""}`).catch(
      () => null,
    );
    setSibuk(false);
    if (!d?.ok) return;
    setTotal(d.total);
    setLagi(d.lagi);
    setRows((x) => (sebelum ? [...x, ...d.log] : d.log));
  };
  useEffect(() => {
    if (open) {
      setSaring("semua");
      void muat();
    }
  }, [open]);

  const tampil = saring === "gagal" ? rows.filter((r) => r.hasil === "gagal") : rows;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t.riwayatJudul}
      description={total ? t.riwayatSemuaLede(total) : undefined}
      size="lg"
      lang={lang}
      actions={
        <button type="button" className="btn btn--ghost" onClick={() => onOpenChange(false)}>
          {t.tutup}
        </button>
      }
    >
      <div className="stack">
        <TabLine
          seg
          value={saring}
          onChange={setSaring}
          label={t.riwayatH}
          tabs={[
            { v: "semua", label: t.hasilSemua },
            {
              v: "gagal",
              label: t.hasilGagalSaja,
              n: rows.filter((r) => r.hasil === "gagal").length || undefined,
            },
          ]}
        />
        {tampil.length ? (
          <ul className="tplog">
            {tampil.map((r) => (
              <Baris key={r.id} lang={lang} r={r} />
            ))}
          </ul>
        ) : (
          <p className="hint">{sibuk ? t.memuat : t.kosong}</p>
        )}
        {lagi && (
          <button
            type="button"
            className="btn"
            disabled={sibuk}
            onClick={() => void muat(rows[rows.length - 1]?.id)}
          >
            <ClockCounterClockwiseIcon size={18} aria-hidden="true" />
            {sibuk ? t.memuat : t.muatLagi}
          </button>
        )}
      </div>
    </Dialog>
  );
}
