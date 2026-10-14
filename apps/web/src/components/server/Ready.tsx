/**
 * The Ready check tab (Phase 9 Stage 5; Phase 10 grid, mockup s12-server):
 * the head card runs diag.siap (the Pi's own preflight) for a module; one
 * card per module below shows that module's newest result, each check with
 * its one-line fix and, where the site can do it, a fix button, and Check
 * This Module. The check history and the Updates card run underneath.
 */
import { useRef, useState, type CSSProperties } from "react";
import {
  CheckCircleIcon,
  CircleNotchIcon,
  ClockIcon,
  InfoIcon,
  ListChecksIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { href, MODUL_NAMA } from "../../lib/app";
import { modulLabel, nil } from "../../lib/labels";
import type { Lang } from "../../lib/kelas";
import {
  bacaHasilSiap,
  bacaPulih,
  modulCek,
  MODUL_SIAP,
  type CekSiap,
} from "../../lib/server-shared";
import Updates from "./Updates";
import { kirim, sedangBerjalan, waktuPendek, type Bisa, type Detail } from "./data";
import { S } from "./strings";
import { S12 } from "./server12Strings";
import Pill from "../ui/Pill";
import Lalu from "../ui/Lalu";

/** A failed check the site can fix with one command. */
function perbaikan(id: string): { aksi: string; argumen: Record<string, string> } | "upd" | null {
  if (id === "mosquitto") return { aksi: "layanan.mulai", argumen: { layanan: "mosquitto" } };
  if (id === "iris-modul2-ws.service")
    return { aksi: "layanan.mulai", argumen: { layanan: "modul2-ws" } };
  if (id === "modul4.service") return { aksi: "layanan.mulai", argumen: { layanan: "modul4" } };
  if (id === "chrony") return { aksi: "jam.selaraskan", argumen: {} };
  if (id === "agen" || id === "versi-agen") return "upd";
  return null;
}

export default function Ready({
  lang,
  id,
  data,
  refresh,
  bisa,
  siapa,
  dari = null,
}: {
  lang: Lang;
  id: number;
  data: Detail;
  refresh: () => void;
  bisa: Bisa;
  siapa: (nim: string | null) => string;
  dari?: string | null;
}) {
  const t = S[lang];
  const upd = useRef<HTMLDivElement | null>(null);
  const runs = data.siapRiwayat;
  const pending = sedangBerjalan(data, "diag.siap");
  const last = runs[0] ?? null;
  const hasil = bacaHasilSiap(last?.keluaran);
  const [modul, setModul] = useState<string>(() => {
    const m = data.sesiModul;
    if (m !== null && m >= 2 && m <= 4) return String(m);
    return last?.argumen?.modul ?? "";
  });

  const w = S12[lang];
  // What the server's self-repair last fixed or could not fix (agent infoSistem.pulih)
  const pulih = bacaPulih(data.server.infoSistem);

  function run(m = modul) {
    void kirim(id, "diag.siap", m ? { modul: m } : {}, lang, t.readyWait).then(refresh);
  }

  /** One check row, with its fix where the site has one. */
  const baris = (c: CekSiap, i: number) => {
    const Icon = c.status === "ok" ? CheckCircleIcon : c.status === "info" ? InfoIcon : WarningIcon;
    const fix = c.status === "gagal" ? perbaikan(c.id) : null;
    return (
      <div key={i} className="checkrow" data-st={c.status}>
        <span className="checkrow__ic">
          <Icon size={22} aria-hidden="true" />
        </span>
        <span className="stack stack--sm grow" style={{ minWidth: 0 }}>
          <b>{c.judul}</b>
          {c.status !== "ok" && c.perbaikan && <span className="hint">{c.perbaikan}</span>}
        </span>
        {fix === "upd" ? (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => upd.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            {t.fixUpd}
          </button>
        ) : fix && (bisa.server || fix.aksi === "jam.selaraskan") ? (
          <button
            type="button"
            className="btn btn--sm"
            disabled={sedangBerjalan(data, fix.aksi, fix.argumen.layanan)}
            onClick={() => void kirim(id, fix.aksi, fix.argumen, lang).then(refresh)}
          >
            {fix.aksi === "jam.selaraskan" ? t.fixSync : t.fixOn}
          </button>
        ) : null}
      </div>
    );
  };

  // Each module's newest run: its own, or the newest run of every module.
  const perModul = (["2", "3", "4"] as const).map((m) => {
    const r = runs.find((x) => (x.argumen?.modul ?? "") === m || !x.argumen?.modul) ?? null;
    return { m, r, h: bacaHasilSiap(r?.keluaran) };
  });
  const umum = hasil ? hasil.cek.filter((c) => modulCek(c.id) === null) : [];
  const umumGagal = umum.filter((c) => c.status === "gagal").length;

  /** The check history: beside the Pi's checks, or alone before any run. */
  const riwayat = (cls: string) => (
    <section className={`panel ${cls}`}>
      <h2 className="panel__title">{t.readyHist}</h2>
      {runs.length <= 1 ? (
        <p className="hint">{t.readyHistNone}</p>
      ) : (
        runs.slice(1, 9).map((p) => {
          const h = bacaHasilSiap(p.keluaran);
          const lulus = h ? h.cek.filter((c) => c.status === "ok").length : 0;
          return (
            <div key={p.id} className="histrow">
              <span className="stack grow" style={{ gap: 0 }}>
                <b>{waktuPendek(p.selesaiPada ?? p.dimintaPada, lang)}</b>
                <span className="hint">
                  {p.argumen?.modul ? t.readyMod(p.argumen.modul) : t.readyAll}
                  {p.dimintaOleh ? ` · ${siapa(p.dimintaOleh)}` : ""}
                </span>
              </span>
              {h ? (
                <>
                  <span className="pill pill--ok">{t.readyPassed(lulus)}</span>
                  {h.gagal > 0 && <span className="pill pill--warn">{t.readyWarn(h.gagal)}</span>}
                </>
              ) : (
                <span className="pill pill--danger">{t.status.gagal}</span>
              )}
            </div>
          );
        })
      )}
      <span className="hint panel__actions">{t.readyPrep}</span>
    </section>
  );

  return (
    <div className="s12grid">
      <section className="panel panel--key panel--raised s12span12">
        <div className="panel__head">
          <div className="stack stack--sm">
            <h2 className="panel__title" style={{ fontSize: "1.5rem" }}>
              {t.readyTitle}
            </h2>
            <span className="hint">
              {last ? (
                <Lalu
                  iso={last.selesaiPada ?? last.dimintaPada}
                  lang={lang}
                  fmt={(s) => t.readyLast(s, siapa(last.dimintaOleh))}
                />
              ) : (
                t.readyNever
              )}
            </span>
          </div>
          <button
            type="button"
            className="btn btn--primary btn--lg"
            disabled={pending}
            onClick={() => run()}
          >
            {pending ? (
              <CircleNotchIcon size={18} className="ctl-spin" aria-hidden="true" />
            ) : (
              <ListChecksIcon size={18} aria-hidden="true" />
            )}
            {t.readyRun}
          </button>
        </div>

        <div className="stack stack--sm">
          <span className="label-caps">{t.readyModul}</span>
          <div className="seg" role="group" aria-label={t.readyModul}>
            {MODUL_SIAP.map((m) => (
              <button
                key={m || "semua"}
                type="button"
                aria-pressed={modul === m}
                onClick={() => setModul(m)}
              >
                {m ? t.readyMod(m) : t.readyAll}
              </button>
            ))}
          </div>
          <span className="hint">{w.m1Note}</span>
        </div>

        {pending && (
          <div className="banner" aria-live="polite">
            <ClockIcon size={20} aria-hidden="true" />
            <span>{t.readyWait}</span>
          </div>
        )}

        {hasil && hasil.lulus && !pending && dari === "persiapan" && (
          <div className="banner banner--ok" role="status">
            <CheckCircleIcon size={20} aria-hidden="true" />
            <span>{t.readyBackBody}</span>
            <a className="btn btn--inverse" href={href(lang, "/preparation#server")}>
              {t.backPrep}
            </a>
          </div>
        )}
        {hasil && (
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className={`pill ${hasil.lulus ? "pill--ok" : "pill--warn"}`}>
              {hasil.lulus ? t.readyPass : t.readyFail(hasil.gagal)}
            </span>
            <span className="hint">{hasil.modul ? t.readyMod(hasil.modul) : t.readyAll}</span>
            <span className="hint">· {t.readyNote}</span>
          </div>
        )}
        {last && !hasil && (
          <div className="stack stack--sm">
            <span className="hint">{t.readyBad}</span>
            <pre className="srv-log">{last.keluaran ?? nil(lang)}</pre>
          </div>
        )}
      </section>

      {!!last && (
        <>
          {/* The checks every module shares, once, from the newest run. */}
          <div className="s12span6 s12col s12readyleft">
            <section className="panel s12readypi">
              <div className="panel__head">
                <div className="stack stack--sm">
                  <h2 className="panel__title">{w.piTitle}</h2>
                  <span className="hint">{w.piSub}</span>
                </div>
                {hasil && (
                  <span className={`pill ${umumGagal ? "pill--warn" : "pill--ok"}`}>
                    {umumGagal ? w.toFix(umumGagal) : w.ready}
                  </span>
                )}
              </div>
              <div className="s12checks">{umum.map(baris)}</div>
              {pulih && (
                <div className="stack stack--sm s12repair">
                  <span className="stack" style={{ gap: 0 }}>
                    <b>{w.repairTitle}</b>
                    <span className="hint">
                      {pulih.pada ? (
                        <Lalu
                          iso={new Date(pulih.pada * 1000).toISOString()}
                          lang={lang}
                          fmt={w.repairAt}
                        />
                      ) : (
                        w.repairSub
                      )}
                    </span>
                  </span>
                  <div className="s12checks">
                    {pulih.gagal.map((l, i) => (
                      <div key={`g${i}`} className="checkrow" data-st="gagal">
                        <span className="checkrow__ic">
                          <WarningIcon size={22} aria-hidden="true" />
                        </span>
                        <span className="grow">{l}</span>
                      </div>
                    ))}
                    {pulih.diperbaiki.map((l, i) => (
                      <div key={`d${i}`} className="checkrow" data-st="ok">
                        <span className="checkrow__ic">
                          <CheckCircleIcon size={22} aria-hidden="true" />
                        </span>
                        <span className="grow">{l}</span>
                      </div>
                    ))}
                    {!pulih.gagal.length && !pulih.diperbaiki.length && (
                      <span className="hint">{w.repairClean}</span>
                    )}
                  </div>
                </div>
              )}
            </section>
            {riwayat("s12readyhist")}
          </div>
          {/* Each module keeps only its own checks, from its own newest run. */}
          <div className="s12span6 s12col s12readymods">
            {perModul.map(({ m, r, h }) => {
              const milik = h ? h.cek.filter((c) => modulCek(c.id) === m) : [];
              const penting = milik.filter((c) => c.status !== "info");
              const gagal = milik.filter((c) => c.status === "gagal").length;
              return (
                <section
                  key={m}
                  className="panel s12readymod"
                  style={{ "--m": `var(--mod-${m})` } as CSSProperties}
                >
                  <div className="panel__head">
                    <span className="row" style={{ gap: 8 }}>
                      <Pill modul={Number(m)}>{modulLabel(Number(m), lang)}</Pill>
                      <b>{MODUL_NAMA[Number(m)]}</b>
                    </span>
                    <span className={`pill ${!h ? "" : gagal ? "pill--warn" : "pill--ok"}`}>
                      {!r ? w.notChecked : !h ? w.unreadable : gagal ? w.toFix(gagal) : w.ready}
                    </span>
                  </div>
                  {h && (
                    <div className="s12checks">
                      {milik.length ? (
                        (penting.length ? penting : milik).map(baris)
                      ) : (
                        <span className="hint">{w.modNone}</span>
                      )}
                    </div>
                  )}
                  <div className="row s12readymod__foot">
                    {r && (
                      <span className="hint grow">
                        <Lalu iso={r.selesaiPada ?? r.dimintaPada} lang={lang} fmt={w.lastRun} />
                      </span>
                    )}
                    <button
                      type="button"
                      className="btn btn--sm"
                      disabled={pending}
                      onClick={() => {
                        setModul(m);
                        run(m);
                      }}
                    >
                      {w.checkThis}
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
      {!last && riwayat("s12span12")}

      <div ref={upd} className="s12span12" style={{ scrollMarginTop: 90 }}>
        <Updates lang={lang} id={id} data={data} refresh={refresh} bisa={bisa} />
      </div>
    </div>
  );
}
