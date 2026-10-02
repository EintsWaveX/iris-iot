/**
 * "Sesi sudah ditutup" (P8.6b, rebuilt from the Phase 9 mockup c-after):
 * right after ending, four numbers (feedback filling live, scores complete,
 * blanks correct, average delay), what comes next, and what is still
 * missing. Scores stay editable. A session that reached 150 minutes can't
 * resume; it offers "Get the Next Session Ready" (NextView) instead.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { CountUp } from "../ui/Display";
import Pill from "../ui/Pill";
import { getJson, href, menitBerjalan, postJson } from "../../lib/app";
import { SESI_CAP_MENIT } from "../../lib/jadwal";
import { hariDariTanggal } from "../../lib/jadwal-parser";
import type { Lang } from "../../lib/kelas";
import { modulLabel } from "../../lib/labels";
import { pesan, type Strings } from "./strings";
import { useRingkasSesi } from "./ringkasSesi";
import SeelabsLine from "./seelabs/SeelabsLine";
import type { SeelabsData } from "./seelabs/data";
import type { SesiRunning } from "./types";

export function kapanSesi(t: Strings, sesi: SesiRunning): string {
  const hari = t.hari[hariDariTanggal(sesi.tanggal)];
  return sesi.slot ? `${hari} ${t.slot(sesi.slot).toLowerCase()}` : `${hari} · ${sesi.mulai}`;
}

export default function DoneView({
  t,
  lang,
  sesi,
  hadir,
  seelabs,
  onSeelabs,
  onScores,
  onResumed,
  onNext,
  onNew,
}: {
  t: Strings;
  lang: Lang;
  sesi: SesiRunning & { selesaiPada?: string };
  hadir: number;
  seelabs: SeelabsData | null;
  onSeelabs: () => void;
  onScores: () => void;
  onResumed: () => void;
  onNext: () => void;
  onNew: () => void;
}) {
  const [n, setN] = useState(0);
  const sum = useRingkasSesi(sesi.id);
  useEffect(() => {
    let alive = true;
    const load = () =>
      getJson<{ ok: boolean; ringkasan: { jumlah: number } }>(
        `/api/session/feedback?scope=lab&sesiId=${sesi.id}`,
      )
        .then((d) => alive && d.ok && setN(d.ringkasan.jumlah))
        .catch(() => {});
    void load();
    const id = setInterval(load, 5_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [sesi.id]);

  // Resume works until 150 minutes after the start.
  const capped = menitBerjalan(sesi.mulaiPada) >= SESI_CAP_MENIT;
  const ran = Math.min(
    SESI_CAP_MENIT,
    Math.round(
      sesi.selesaiPada && sesi.mulaiPada
        ? (new Date(sesi.selesaiPada).getTime() - new Date(sesi.mulaiPada).getTime()) / 60_000
        : menitBerjalan(sesi.mulaiPada),
    ),
  );
  const total = Math.max(hadir, n, sum?.siswa ?? 0);
  const missing = (sum?.grup ?? []).filter(
    (g) => g.lengkap < g.anggota || g.benar < g.total || !g.catatan,
  );

  async function resume() {
    try {
      const r = await postJson<{ ok: boolean; kode?: string }>("/api/session/lanjutkan", {
        sesiId: sesi.id,
      });
      if (!r.ok) return window.Toast?.show(pesan(t, r.kode), "danger");
      window.Toast?.show(t.resumed, "ok");
      onResumed();
    } catch {
      window.Toast?.show(t.fail, "danger");
    }
  }

  return (
    <div className="after" style={{ "--mod-hue": `var(--mod-${sesi.modul})` } as CSSProperties}>
      <header className="page-header__heading">
        <span className="page-header__eyebrow">
          {t.afterEyebrow(modulLabel(sesi.modul, lang), kapanSesi(t, sesi))}
        </span>
        <h1 className="page-header__title">{t.doneTitle}</h1>
        <p className="page-header__subtitle">{t.afterLede}</p>
      </header>

      <div className="after__stats">
        <div className="stat">
          <span className="stat__value">
            <CountUp value={n} />
            <span className="faint">/{total}</span>
          </span>
          <span className="stat__label">{t.statFeedback}</span>
        </div>
        <div className="stat">
          <span className="stat__value">
            {sum ? sum.lengkap : "·"}
            <span className="faint">/{sum ? sum.siswa : "·"}</span>
          </span>
          <span className="stat__label">{t.statScores}</span>
        </div>
        <div className="stat">
          <span className="stat__value">
            {sum ? sum.benar : "·"}
            <span className="faint">/{sum ? sum.total : "·"}</span>
          </span>
          <span className="stat__label">{t.statBlanks}</span>
        </div>
        <div className="stat">
          <span className="stat__value">
            {sum?.delay ?? "·"}
            {sum?.delay != null && <span className="faint"> ms</span>}
          </span>
          <span className="stat__label">{t.statDelay}</span>
        </div>
      </div>

      <div className="grid-2 after__cards">
        <section className="panel panel--key">
          <h2 className="panel__title">{t.afterNext}</h2>
          <div className="stack">
            <button
              type="button"
              className="btn btn--inverse btn--lg btn--block"
              onClick={onScores}
            >
              {t.doneScores}
            </button>
            <a
              className="btn btn--secondary btn--block"
              href={href(lang, `/reports?sesi=${sesi.id}`)}
            >
              {t.doneReport}
            </a>
            {capped ? (
              <>
                <button type="button" className="btn btn--ghost btn--block" disabled>
                  {t.afterCapped}
                </button>
                <button type="button" className="btn btn--secondary btn--block" onClick={onNext}>
                  {t.afterNextReady}
                </button>
                <span className="hint">{t.afterNextHint}</span>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn--ghost btn--block"
                  onClick={() => void resume()}
                >
                  {t.afterResume}
                </button>
                <span className="hint">{t.afterStopped(ran, SESI_CAP_MENIT - ran)}</span>
              </>
            )}
            <button type="button" className="btn btn--ghost btn--block" onClick={onNew}>
              {t.doneNew}
            </button>
          </div>
        </section>

        <section className="panel">
          <h2 className="panel__title">{t.afterMissing}</h2>
          <SeelabsLine lang={lang} data={seelabs} onOpen={onSeelabs} as="div" />
          {!sum ? (
            <span className="skeleton" style={{ height: 96 }} />
          ) : missing.length === 0 ? (
            <p className="hint">{t.afterNone}</p>
          ) : (
            <ul className="missing">
              {missing.map((g) => (
                <li key={g.id}>
                  <Pill tone="warn">{t.group(g.nomor)}</Pill>
                  <span className="stack" style={{ gap: 2 }}>
                    {g.lengkap < g.anggota && (
                      <span className="hint">{t.missScores(g.anggota - g.lengkap)}</span>
                    )}
                    {g.benar < g.total && (
                      <span className="hint">{t.missBlanks(g.benar, g.total)}</span>
                    )}
                    {!g.catatan && <span className="hint">{t.missNote}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
