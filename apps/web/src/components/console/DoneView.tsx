/**
 * "Sesi selesai" (P8.6b): right after ending, the console shows how many
 * students have given feedback (filling live; they can do it any time from
 * their dashboard) and the next steps: open the report, keep entering
 * scores, resume (inside the cap), or start anew.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { CountUp, ProgressRing } from "../ui/Display";
import { getJson, href, menitBerjalan, postJson } from "../../lib/app";
import { SESI_CAP_MENIT } from "../../lib/jadwal";
import type { Lang } from "../../lib/kelas";
import { pesan, type Strings } from "./strings";
import type { SesiRunning } from "./types";

export default function DoneView({
  t,
  lang,
  sesi,
  hadir,
  onScores,
  onResumed,
  onNew,
}: {
  t: Strings;
  lang: Lang;
  sesi: SesiRunning;
  hadir: number;
  onScores: () => void;
  onResumed: () => void;
  onNew: () => void;
}) {
  const [n, setN] = useState(0);
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

  const canResume = menitBerjalan(sesi.mulaiPada) < SESI_CAP_MENIT;
  const total = Math.max(hadir, n);

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
    <section
      className="done panel panel--raised sweep-edge"
      style={{ "--mod-hue": `var(--mod-${sesi.modul})` } as CSSProperties}
    >
      <div className="done__main">
        <div className="done__hero">
          <span className="done__burst" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="label-caps">
            {t.modul(sesi.modul)} · {t.modulNama(sesi.modul)}
          </span>
          <h1 className="done__title">{t.doneTitle}</h1>
          <p className="hint">{t.doneSub}</p>
        </div>

        <div className="done__count">
          <ProgressRing
            value={n}
            max={Math.max(total, 1)}
            size="lg"
            label={`${n}`}
            color="var(--ok)"
          />
          <span className="stack" style={{ gap: 2 }}>
            <span className="done__num">
              <CountUp value={n} />
              <span className="faint"> / {total}</span>
            </span>
            <span className="hint">{t.doneCount(n, total)}</span>
          </span>
        </div>

        <div className="done__actions">
          <a className="btn btn--primary btn--lg" href={href(lang, `/reports?sesi=${sesi.id}`)}>
            {t.doneReport}
          </a>
          <button type="button" className="btn btn--secondary btn--lg" onClick={onScores}>
            {t.doneScores}
          </button>
          {canResume && (
            <button type="button" className="btn btn--ghost btn--lg" onClick={() => void resume()}>
              {t.doneResume}
            </button>
          )}
          <button type="button" className="btn btn--ghost btn--lg" onClick={onNew}>
            {t.doneNew}
          </button>
        </div>
      </div>
    </section>
  );
}
