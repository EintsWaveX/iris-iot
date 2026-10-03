/**
 * "The Pi right now" (Phase 9 Stage 5, mockup v-over PiGauges): six
 * numbers from the newest heartbeat and its `kondisi` block. CPU, memory,
 * temperature and storage open their own chart (range switch, the limit
 * band, now/lowest/highest/average, the latest readings and a CSV);
 * network and uptime have no series, so they are plain cards.
 */
import { useEffect, useState } from "react";
import { ArrowsOutSimpleIcon, DownloadSimpleIcon } from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import { getJson, localeOf } from "../../lib/app";
import { unduhCsv } from "../../lib/csv";
import { durasiLabel } from "../../lib/labels";
import type { Lang } from "../../lib/kelas";
import { bacaKondisi } from "../../lib/server-shared";
import ZoomChart, { useZoom } from "./ZoomChart";
import { angka, laju, WARN_CPU, WARN_TEMP, type Denyut, type Detail, type Riwayat } from "./data";
import { S } from "./strings";

type Metrik = "cpu" | "memori" | "suhu" | "disk";

const META: Record<Metrik, { unit: string; lo: number; hi: number; batas?: number; c: string }> = {
  cpu: { unit: "%", lo: 0, hi: 100, batas: WARN_CPU, c: "var(--accent)" },
  memori: { unit: "%", lo: 0, hi: 100, c: "var(--chart-2)" },
  suhu: { unit: "°C", lo: 30, hi: 90, batas: WARN_TEMP, c: "var(--warn)" },
  disk: { unit: "%", lo: 0, hi: 100, batas: 90, c: "var(--chart-4)" },
};

function DataDialog({
  lang,
  id,
  m,
  label,
  nama,
  onClose,
}: {
  lang: Lang;
  id: number;
  m: Metrik;
  label: string;
  nama: string;
  onClose: () => void;
}) {
  const t = S[lang];
  const [rentang, setRentang] = useState("24h");
  const [h, setH] = useState<Riwayat | null>(null);
  useEffect(() => {
    setH(null);
    getJson<{ ok: boolean } & Riwayat>(`/api/server/${id}?aksi=riwayat&rentang=${rentang}`)
      .then((d) => d.ok && setH(d))
      .catch(() => window.Toast?.show(t.fail, "danger"));
  }, [id, rentang, t.fail]);
  const k = META[m];
  const seri = (h?.seri ?? []).map((d: Denyut) => ({
    t: new Date(d.pada).getTime(),
    v: { [m]: d[m] ?? null },
  }));
  const zoom = useZoom(seri.length);
  const vals = seri.map((s) => s.v[m]).filter((v): v is number => v !== null);
  const f = (v: number | undefined) =>
    v === undefined ? "·" : `${angka(v, lang, m === "suhu" ? 1 : 0)} ${k.unit}`;
  const stats: [string, string][] = [
    [t.dNow, f(vals.at(-1))],
    [t.dLow, f(vals.length ? Math.min(...vals) : undefined)],
    [t.dHigh, f(vals.length ? Math.max(...vals) : undefined)],
    [t.dAvg, f(vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : undefined)],
  ];
  const fmt = (ms: number) =>
    new Date(ms).toLocaleString(localeOf(lang), {
      timeZone: "Asia/Jakarta",
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={label}
      description={`${nama} · ${t.ranges[rentang]}`}
      size="lg"
      lang={lang}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t.close}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!seri.length}
            onClick={() =>
              unduhCsv(
                `${m}-${nama}-${rentang}.csv`,
                [t.dWhen, `${label} ${k.unit}`],
                seri.map((s) => [new Date(s.t).toISOString(), s.v[m] ?? ""]),
              )
            }
          >
            <DownloadSimpleIcon size={18} aria-hidden="true" />
            {t.csv}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="seg" role="group" aria-label={t.range}>
          {["1h", "24h", "7d"].map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={rentang === r}
              onClick={() => setRentang(r)}
            >
              {t.ranges[r]}
            </button>
          ))}
        </div>
        <div
          className="srv-stats"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}
        >
          {stats.map(([l, v]) => (
            <div key={l} className="srv-stat">
              <b className="srv-stat__sm">{v}</b>
              <span>{l}</span>
            </div>
          ))}
        </div>
        {h === null ? (
          <span className="skeleton" style={{ height: 220, display: "block" }} />
        ) : (
          <ZoomChart
            seri={seri}
            panels={[
              {
                k: m,
                label,
                judul: `${t.panel(label, String(k.lo), `${k.hi} ${k.unit}`)}${k.batas !== undefined ? ` · ${t.dLimit(`${k.batas} ${k.unit}`)}` : ""}`,
                lo: k.lo,
                hi: k.hi,
                c: k.c,
                unit: k.unit,
                batas: k.batas,
              },
            ]}
            zoom={zoom}
            lang={lang}
            harian={rentang === "7d"}
            sm
            label={label}
            empty={t.chartEmpty}
          />
        )}
        <span className="hint">{zoom.zoomed ? t.zoomed : t.zoomHint}</span>
        {seri.length > 0 && (
          <div className="stack stack--sm">
            <h3 className="panel__title" style={{ fontSize: "1rem" }}>
              {t.dReadings}
            </h3>
            <table className="srv-table srv-table--tight">
              <thead>
                <tr>
                  <th>{t.dWhen}</th>
                  <th className="num">{t.dValue}</th>
                </tr>
              </thead>
              <tbody>
                {seri
                  .slice(-6)
                  .reverse()
                  .map((s) => (
                    <tr key={s.t}>
                      <td>{fmt(s.t)}</td>
                      <td className="num">{f(s.v[m] ?? undefined)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function bootLabel(uptime: number, lang: Lang) {
  return new Date(Date.now() - uptime * 1000).toLocaleString(localeOf(lang), {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Gauges({ lang, data }: { lang: Lang; data: Detail }) {
  const t = S[lang];
  const [open, setOpen] = useState<Metrik | null>(null);
  const hb = data.denyutTerakhir;
  const k = bacaKondisi(data.server.kondisi);
  const nol = (n: number | null | undefined) =>
    n === null || n === undefined ? "·" : String(Math.round(n));
  const label: Record<Metrik, string> = { cpu: t.cpu, memori: t.mem, suhu: t.temp, disk: t.disk };
  const beban = k?.beban?.map((v) => angka(v, lang, 2)).join(" · ");

  const cards: { m: Metrik; v: string; unit: string; sub: string; warn?: boolean }[] = [
    {
      m: "cpu",
      v: nol(hb?.cpu),
      unit: "%",
      sub: beban ? t.load(beban) : t.noData,
      warn: (hb?.cpu ?? 0) >= WARN_CPU,
    },
    {
      m: "memori",
      v: nol(hb?.memori),
      unit: "%",
      sub: k?.memori ? t.memOf(k.memori[0], k.memori[1]) : t.noData,
    },
    {
      m: "suhu",
      v: nol(hb?.suhu),
      unit: "°C",
      sub: hb?.suhu == null ? t.noData : hb.suhu >= WARN_TEMP ? t.tempHot : t.tempOk,
      warn: (hb?.suhu ?? 0) >= WARN_TEMP,
    },
    {
      m: "disk",
      v: nol(hb?.disk),
      unit: "%",
      sub: k?.disk ? t.diskFree(k.disk[1] - k.disk[0], k.disk[1]) : t.noData,
      warn: (hb?.disk ?? 0) >= 90,
    },
  ];
  const net = k?.jaringan;
  const up = hb?.uptimeSec ?? null;
  const ms = k?.jamSelisihMs;

  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">{t.nowTitle}</h2>
        <span className="hint">{t.nowHint}</span>
      </div>
      <div className="dcards">
        {cards.map((c) => (
          <button
            key={c.m}
            type="button"
            className="dcard"
            data-warn={c.warn ? "yes" : undefined}
            aria-haspopup="dialog"
            onClick={() => setOpen(c.m)}
          >
            <span className="dcard__l">{label[c.m]}</span>
            <span className="dcard__v">
              <b>{c.v}</b>
              <small>{c.unit}</small>
            </span>
            <span className="hint">{c.sub}</span>
            <span className="dcard__more" aria-hidden="true">
              <ArrowsOutSimpleIcon size={16} />
            </span>
          </button>
        ))}
        <div className="dcard dcard--static">
          <span className="dcard__l">{t.net}</span>
          <span className="dcard__v">
            <b>{net ? laju(net.masuk + net.keluar, lang).split(" ")[0] : "·"}</b>
            <small>{net ? laju(net.masuk + net.keluar, lang).split(" ")[1] : ""}</small>
          </span>
          <span className="hint">
            {net ? t.netIo(net.antarmuka, laju(net.masuk, lang), laju(net.keluar, lang)) : t.noData}
          </span>
        </div>
        <div className="dcard dcard--static">
          <span className="dcard__l">{t.upFor}</span>
          <span className="dcard__v">
            <b>{up ? durasiLabel(Math.floor(up / 60), lang) : "·"}</b>
          </span>
          <span className="hint">
            {up ? t.bootAt(bootLabel(up, lang)) : t.noData}
            {ms !== null && ms !== undefined
              ? ` · ${t.clockOff(`${ms >= 0 ? "+" : ""}${angka(ms, lang, 1)}`)}`
              : ""}
          </span>
        </div>
      </div>
      {open && (
        <DataDialog
          lang={lang}
          id={data.server.id}
          m={open}
          label={label[open]}
          nama={data.server.nama}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
