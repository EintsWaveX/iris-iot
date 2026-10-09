/**
 * The Ready check tab (Phase 9 Stage 5; Phase 10 grid, mockup s12-server):
 * the head card runs diag.siap (the Pi's own preflight) for a module; one
 * card per module below shows that module's newest result, each check with
 * its one-line fix and, where the site can do it, a fix button, and Check
 * This Module. The check history and the Updates card run underneath.
 */
import { useRef, useState, type CSSProperties } from "react";
import {
  ArrowClockwiseIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  ClockIcon,
  InfoIcon,
  ListChecksIcon,
  PlayIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { href, MODUL_NAMA, sejak, useTick } from "../../lib/app";
import { modulLabel } from "../../lib/labels";
import type { Lang } from "../../lib/kelas";
import { bacaHasilSiap, MODUL_SIAP, type CekSiap } from "../../lib/server-shared";
import Updates from "./Updates";
import { kirim, sedangBerjalan, waktuPendek, type Bisa, type Detail } from "./data";
import { S } from "./strings";
import { S12 } from "./server12Strings";
import Pill from "../ui/Pill";

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
  const now = useTick(1_000);
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
            <ArrowDownIcon size={16} aria-hidden="true" />
            {t.fixUpd}
          </button>
        ) : fix && (bisa.server || fix.aksi === "jam.selaraskan") ? (
          <button
            type="button"
            className="btn btn--sm"
            disabled={sedangBerjalan(data, fix.aksi, fix.argumen.layanan)}
            onClick={() => void kirim(id, fix.aksi, fix.argumen, lang).then(refresh)}
          >
            <PlayIcon size={16} aria-hidden="true" />
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

  return (
    <div className="s12grid">
      <section className="panel panel--key panel--raised s12span12">
        <div className="panel__head">
          <div className="stack stack--sm">
            <h2 className="panel__title" style={{ fontSize: "1.5rem" }}>
              {t.readyTitle}
            </h2>
            <span className="hint">
              {last
                ? t.readyLast(
                    sejak(last.selesaiPada ?? last.dimintaPada, lang, now),
                    siapa(last.dimintaOleh),
                  )
                : t.readyNever}
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
            <a className="btn btn--sm btn--primary" href={`${href(lang, "/session")}#persiapan`}>
              <ArrowLeftIcon size={16} aria-hidden="true" />
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
            <pre className="srv-log">{last.keluaran ?? "·"}</pre>
          </div>
        )}
      </section>

      {!!last && (
        <section
          className="panel s12span3 s12readymod"
          style={{ "--m": "var(--mod-1)" } as CSSProperties}
        >
          <div className="panel__head">
            <Pill modul={1}>{modulLabel(1, lang)}</Pill>
            <span className="pill">{w.noPi}</span>
          </div>
          <b>{MODUL_NAMA[1]}</b>
          <div className="s12checks">
            <div className="checkrow" data-st="info">
              <span className="checkrow__ic">
                <InfoIcon size={22} aria-hidden="true" />
              </span>
              <span className="stack stack--sm grow">
                <b>{w.noPi}</b>
              </span>
            </div>
          </div>
        </section>
      )}
      {!!last &&
        perModul.map(({ m, r, h }) => {
          const cek = h ? h.cek.filter((c) => c.status !== "info") : [];
          return (
            <section
              key={m}
              className="panel s12span3 s12readymod"
              style={{ "--m": `var(--mod-${m})` } as CSSProperties}
            >
              <div className="panel__head">
                <Pill modul={Number(m)}>{modulLabel(Number(m), lang)}</Pill>
                <span className={`pill ${!h ? "" : h.gagal ? "pill--warn" : "pill--ok"}`}>
                  {!r ? w.notChecked : !h ? w.unreadable : h.gagal ? w.toFix(h.gagal) : w.ready}
                </span>
              </div>
              <b>{MODUL_NAMA[Number(m)]}</b>
              {r && (
                <span className="hint">
                  {w.lastRun(sejak(r.selesaiPada ?? r.dimintaPada, lang, now))}
                </span>
              )}
              <div className="s12checks">{h ? (cek.length ? cek : h.cek).map(baris) : null}</div>
              <div className="panel__actions" style={{ marginTop: "auto" }}>
                <button
                  type="button"
                  className="btn btn--sm btn--block"
                  disabled={pending}
                  onClick={() => {
                    setModul(m);
                    run(m);
                  }}
                >
                  <ArrowClockwiseIcon size={16} aria-hidden="true" />
                  {w.checkThis}
                </button>
              </div>
            </section>
          );
        })}

      <section className="panel s12span12">
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
      <div ref={upd} className="s12span12" style={{ scrollMarginTop: 90 }}>
        <Updates lang={lang} id={id} data={data} refresh={refresh} bisa={bisa} />
      </div>
    </div>
  );
}
