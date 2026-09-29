/**
 * "Sesi selesai" (P8.6b): right after ending, the console turns into a
 * projector screen: a big QR code of the feedback link, the number of
 * students who have responded (filling live), and the next steps: open the
 * report, keep entering scores, resume (inside the cap), or start anew.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { BarChart3, MessageSquareHeart, Play, PlusCircle, Table2 } from "lucide-react";
import { CountUp, ProgressRing, QrCode } from "../ui/Display";
import { getJson, href, menitBerjalan, postJson } from "../../lib/app";
import { SESI_CAP_MENIT } from "../../lib/jadwal";
import { langForKelas, type Lang } from "../../lib/kelas";
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

  const studentLang = langForKelas(sesi.kelas ?? "reguler");
  const link =
    typeof location !== "undefined"
      ? `${location.origin}${href(studentLang, "/dashboard")}?feedback=1`
      : "";
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
            <BarChart3 size={19} aria-hidden="true" /> {t.doneReport}
          </a>
          <button type="button" className="btn btn--secondary btn--lg" onClick={onScores}>
            <Table2 size={19} aria-hidden="true" /> {t.doneScores}
          </button>
          {canResume && (
            <button type="button" className="btn btn--ghost btn--lg" onClick={() => void resume()}>
              <Play size={19} aria-hidden="true" /> {t.doneResume}
            </button>
          )}
          <button type="button" className="btn btn--ghost btn--lg" onClick={onNew}>
            <PlusCircle size={19} aria-hidden="true" /> {t.doneNew}
          </button>
        </div>
      </div>

      <figure className="done__qr">
        <QrCode text={link} size={260} label={t.doneQr} />
        <figcaption>
          <MessageSquareHeart size={18} aria-hidden="true" /> {t.doneQr}
          <span className="mono faint done__link">{link.replace(/^https?:\/\//, "")}</span>
        </figcaption>
      </figure>
    </section>
  );
}
