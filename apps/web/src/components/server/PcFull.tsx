/**
 * The Overview's Full part (Phase 9 Stage 5, mockup v-over PcFull), from
 * diag.rinci: per-core CPU, memory and swap, every mount; interfaces, the
 * hotspot, NTP and DNS; services with uptime, restarts and memory; the top
 * processes, versions and the journal's error count. Opening Full asks the
 * PC for a fresh report when the last one is older than five minutes, and
 * again whenever a newer heartbeat shows a service in another state than
 * the report does, so the services table keeps up with History.
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { ArrowClockwiseIcon, CaretRightIcon, CircleNotchIcon } from "@phosphor-icons/react";
import { useTick } from "../../lib/app";
import { durasiLabel, nil } from "../../lib/labels";
import Nil from "../ui/Nil";
import type { Lang } from "../../lib/kelas";
import { bacaBundel, bacaRinci } from "../../lib/server-shared";
import {
  angka,
  kirim,
  laju,
  rinciUsang,
  sedangBerjalan,
  svcTone,
  terakhirDari,
  TONE_PILL,
  ukuran,
  type Detail,
} from "./data";
import { S } from "./strings";
import Lalu from "../ui/Lalu";

const SEGAR_MS = 5 * 60_000;

function Meter({ l, p, txt, tone }: { l: ReactNode; p: number; txt: string; tone?: string }) {
  return (
    <div className="srv-meter">
      <span className="srv-meter__l">{l}</span>
      <span
        className="srv-meter__t"
        style={tone ? ({ "--c": `var(--${tone})` } as CSSProperties) : undefined}
      >
        <i style={{ width: `${Math.max(0, Math.min(100, p))}%` }} />
      </span>
      <b className="num">{txt}</b>
    </div>
  );
}

const pct = (u: number, t: number) => (t > 0 ? Math.round((u / t) * 100) : 0);

export default function PcFull({
  lang,
  id,
  data,
  refresh,
  onJournal,
}: {
  lang: Lang;
  id: number;
  data: Detail;
  refresh: () => void;
  onJournal: () => void;
}) {
  const t = S[lang];
  const now = useTick(1_000);
  const last = terakhirDari(data, "diag.rinci");
  const r = bacaRinci(last?.keluaran);
  const jalan = sedangBerjalan(data, "diag.rinci");
  const umur = last ? now - new Date(last.selesaiPada ?? last.dimintaPada).getTime() : Infinity;
  const diminta = useRef(false);

  function minta() {
    void kirim(id, "diag.rinci", {}, lang, false).then(refresh);
  }

  useEffect(() => {
    if (diminta.current || jalan || umur < SEGAR_MS) return;
    diminta.current = true;
    minta();
    // Once per visit of the Full view; the button asks again.
  }, []);

  const usang =
    !!r &&
    !!last &&
    rinciUsang(data.denyutTerakhir, r.layanan, last.selesaiPada ?? last.dimintaPada, t.unit);

  useEffect(() => {
    if (usang && !jalan) minta();
  }, [usang, jalan]);

  const head = (
    <div className="row row--between">
      <span className="hint" aria-live="polite">
        {jalan ? (
          t.fullWait
        ) : last && !r && last.status === "gagal" ? (
          t.fullOld
        ) : last ? (
          <Lalu iso={last.selesaiPada ?? last.dimintaPada} lang={lang} fmt={t.fullAt} />
        ) : (
          t.fullWait
        )}
      </span>
      <button type="button" className="btn btn--sm" disabled={jalan} onClick={minta}>
        {jalan ? (
          <CircleNotchIcon size={16} className="ctl-spin" aria-hidden="true" />
        ) : (
          <ArrowClockwiseIcon size={16} aria-hidden="true" />
        )}
        {t.refresh}
      </button>
    </div>
  );

  if (!r) {
    return (
      <section className="panel">
        {head}
        <span className="skeleton" style={{ height: 120, display: "block" }} />
      </section>
    );
  }

  const bundel = bacaBundel(data.server.agenVersi);
  const protokol = data.server.infoSistem?.protokol;
  const versi: [string, string][] = [
    [r.paket.os ?? nil(lang), t.vSystem],
    [r.paket.kernel ?? nil(lang), t.vKernel],
    [typeof protokol === "number" ? String(protokol) : nil(lang), t.vAgent],
    [bundel.aso ?? nil(lang), t.vBundle],
    [r.paket.python ?? nil(lang), t.vPython],
  ];

  return (
    <div className="stack">
      {head}
      <div className="srv-g2 srv-g2--wide">
        <section className="panel">
          <h2 className="panel__title">{t.cpuMemDisk}</h2>
          <div className="stack" style={{ gap: 8 }}>
            {r.inti.map((v, i) => (
              <Meter
                key={i}
                l={`${t.core} ${i}`}
                p={v ?? 0}
                txt={v === null ? nil(lang) : `${v}%`}
              />
            ))}
            {r.beban && (
              <span className="hint">
                {t.loadLine(
                  r.beban.map((v) => angka(v, lang, 2)).join(" · "),
                  r.inti.length,
                  r.frekuensiMhz ? `${angka(r.frekuensiMhz, lang)} MHz` : "",
                )}
              </span>
            )}
            <hr className="srv-sep" />
            {r.memori && (
              <Meter
                l={t.mem}
                p={pct(r.memori[0], r.memori[1])}
                txt={`${ukuran(r.memori[0], lang)} / ${ukuran(r.memori[1], lang)}`}
              />
            )}
            {r.swap && r.swap[1] > 0 && (
              <Meter
                l={t.swap}
                p={pct(r.swap[0], r.swap[1])}
                txt={`${ukuran(r.swap[0], lang)} / ${ukuran(r.swap[1], lang)}`}
              />
            )}
            <hr className="srv-sep" />
            {r.mount.map((m) => {
              const p = pct(m.pakai, m.total);
              return (
                <Meter
                  key={m.m}
                  l={<span className="mono">{m.m}</span>}
                  p={p}
                  tone={p >= 90 ? "danger" : p >= 60 && m.m === "/var/log" ? "warn" : undefined}
                  txt={`${ukuran(m.pakai, lang)} / ${ukuran(m.total, lang)}`}
                />
              );
            })}
          </div>
        </section>

        <section className="panel">
          <h2 className="panel__title">{t.network}</h2>
          <div className="srv-scroll">
            <table className="srv-table srv-table--tight">
              <thead>
                <tr>
                  <th>{t.cIface}</th>
                  <th>{t.cAddr}</th>
                  <th className="num">{t.cIn}</th>
                  <th className="num">{t.cOut}</th>
                  <th>{t.cState}</th>
                </tr>
              </thead>
              <tbody>
                {r.antarmuka.map((a) => (
                  <tr key={a.nama}>
                    <td className="mono">{a.nama}</td>
                    <td className="mono">
                      {a.alamat.find((x) => !x.includes(":")) ?? <Nil dot />}
                    </td>
                    <td className="num">{laju(a.masuk, lang)}</td>
                    <td className="num">{laju(a.keluar, lang)}</td>
                    <td>
                      {a.uplink ? (
                        <span className="pill pill--ok">{t.uplink}</span>
                      ) : (
                        <span className="pill">{a.keadaan === "up" ? t.ifUp : t.ifDown}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="tabstops">
            <div className="tabstops__row">
              <span className={`pill ${r.hotspot.menyala ? "pill--ok" : ""}`}>{t.hotspot}</span>
              <span>{t.hsLine(r.hotspot.menyala, r.hotspot.klien)}</span>
            </div>
            <div className="tabstops__row">
              <span className={`pill ${r.ntp.tersinkron ? "pill--ok" : "pill--warn"}`}>NTP</span>
              <span>
                {t.ntpLine(
                  r.ntp.tersinkron,
                  r.ntp.stratum === null ? "" : String(r.ntp.stratum),
                  r.ntp.selisihMs === null
                    ? ""
                    : `${r.ntp.selisihMs >= 0 ? "+" : ""}${angka(r.ntp.selisihMs, lang, 1)}`,
                  r.ntp.sumber,
                )}
              </span>
            </div>
            {r.dns && (
              <div className="tabstops__row">
                <span className={`pill ${r.dns.ms === null ? "pill--danger" : "pill--ok"}`}>
                  DNS
                </span>
                <span>{t.dnsLine(r.dns.server, r.dns.ms)}</span>
              </div>
            )}
          </div>
        </section>

        <section className="panel">
          <h2 className="panel__title">{t.svcDetail}</h2>
          <div className="srv-scroll">
            <table className="srv-table srv-table--tight">
              <thead>
                <tr>
                  <th>{t.cUnit}</th>
                  <th>{t.cState}</th>
                  <th className="num">{t.cUp}</th>
                  <th className="num">{t.cRestarts}</th>
                  <th className="num">{t.cMem}</th>
                </tr>
              </thead>
              <tbody>
                {r.layanan.map((x) => {
                  const tone = svcTone(x.keadaan);
                  const sejakMs = x.sejak
                    ? Date.parse(
                        x.sejak.replace(/^\w+ /, "").replace(" WIB", "+07:00").replace(" ", "T"),
                      )
                    : NaN;
                  return (
                    <tr key={x.unit}>
                      <td className="mono">{x.unit}</td>
                      <td>
                        <span className={`pill ${TONE_PILL[tone]}`}>{t.st[tone]}</span>
                      </td>
                      <td className="num nowrap">
                        {tone === "ok" && Number.isFinite(sejakMs) ? (
                          durasiLabel(Math.floor((now - sejakMs) / 60_000), lang)
                        ) : (
                          <Nil dot />
                        )}
                      </td>
                      <td className="num">{x.mulaiUlang ?? <Nil dot />}</td>
                      <td className="num">{x.memori ? ukuran(x.memori, lang) : <Nil dot />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <h2 className="panel__title">{t.procs}</h2>
          <div className="srv-scroll">
            <table className="srv-table srv-table--tight">
              <thead>
                <tr>
                  <th className="num">PID</th>
                  <th>{t.cProc}</th>
                  <th className="num">CPU</th>
                  <th className="num">{t.cMem}</th>
                </tr>
              </thead>
              <tbody>
                {r.proses.map((p) => (
                  <tr key={p.pid}>
                    <td className="num">{p.pid}</td>
                    <td className="mono truncate" style={{ maxWidth: 260 }}>
                      {p.nama}
                    </td>
                    <td className="num">{angka(p.cpu, lang, 1)}%</td>
                    <td className="num">{ukuran(p.memori, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="tabstops tabstops--3">
            {versi.map(([v, l]) => (
              <div key={l} className="tabstops__row">
                <span className="kbd">{v}</span>
                <span>{l}</span>
                <span />
              </div>
            ))}
            {r.galatJurnal24j !== null && (
              <div className="tabstops__row">
                <span className={`pill ${r.galatJurnal24j > 0 ? "pill--warn" : "pill--ok"}`}>
                  {r.galatJurnal24j}
                </span>
                <span>{t.journalErr}</span>
                <button type="button" className="btn btn--ghost btn--sm" onClick={onJournal}>
                  {t.view}
                  <CaretRightIcon size={16} weight="bold" className="btn__go" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
