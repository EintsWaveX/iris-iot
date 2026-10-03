/**
 * The Updates card (Phase 9 Stage 5, mockup v-ready Updates). The agent
 * reports what is installed (its protocol, the bundle's commits, apt's
 * upgradable count) and the site compares that with what it knows is
 * newest. Installing happens from a laptop over SSH, never from the site:
 * "How to Update" shows the exact lines to run.
 */
import { useState } from "react";
import {
  ArrowsClockwiseIcon,
  CircleNotchIcon,
  CopyIcon,
  QuestionIcon,
} from "@phosphor-icons/react";
import Dialog from "../ui/Dialog";
import IconButton from "../ui/IconButton";
import { sejak, useTick } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { barisPembaruan, type BarisPembaruan } from "../../lib/server-shared";
import { kirim, sedangBerjalan, type Bisa, type Detail } from "./data";
import { S, type SStrings } from "./strings";

const TONE = {
  terbaru: "pill--ok",
  perlu: "pill--warn",
  beda: "pill--accent",
  tidak_tahu: "",
} as const;

function Baris({ t, b }: { t: SStrings; b: BarisPembaruan }) {
  if (b.k === "agen") return <>{t.updProto(b.sekarang, b.baru ?? "")}</>;
  if (b.k === "apt") return <>{t.updApt(b.sekarang, b.keamanan ?? 0)}</>;
  if (b.k === "modul4") return <>{t.updSite(b.sekarang, b.baru)}</>;
  return <>{b.sekarang ? b.sekarang.slice(0, 7) : t.updSite(null, null)}</>;
}

function Salin({ t, teks }: { t: SStrings; teks: string }) {
  return (
    <div className="srv-cmd">
      <pre>{teks}</pre>
      <IconButton
        icon={CopyIcon}
        label={t.copy}
        onClick={() =>
          void navigator.clipboard?.writeText(teks).then(() => window.Toast?.show(t.copied, "ok"))
        }
      />
    </div>
  );
}

export default function Updates({
  lang,
  id,
  data,
  refresh,
  bisa,
}: {
  lang: Lang;
  id: number;
  data: Detail;
  refresh: () => void;
  bisa: Bisa;
}) {
  const t = S[lang];
  const now = useTick(1_000);
  const [how, setHow] = useState<BarisPembaruan["k"] | null>(null);
  const s = data.server;
  const rows = barisPembaruan(s.infoSistem, s.agenVersi, data.situsIot);
  const checking = sedangBerjalan(data, "info.segarkan");

  return (
    <section className="panel">
      <div className="panel__head">
        <div className="stack stack--sm">
          <h2 className="panel__title">{t.upd}</h2>
          <span className="hint">
            {s.infoSistemPada ? t.updHint(sejak(s.infoSistemPada, lang, now)) : t.updNever}
          </span>
        </div>
        {bisa.server && (
          <button
            type="button"
            className="btn btn--sm"
            disabled={checking}
            onClick={() => void kirim(id, "info.segarkan", {}, lang, t.updChecking).then(refresh)}
          >
            {checking ? (
              <CircleNotchIcon size={16} className="ctl-spin" aria-hidden="true" />
            ) : (
              <ArrowsClockwiseIcon size={16} aria-hidden="true" />
            )}
            {t.updCheck}
          </button>
        )}
      </div>
      <div className="tabstops tabstops--3 srv-upd">
        {rows.map((b) => (
          <div key={b.k} className="tabstops__row">
            <span className={`pill ${TONE[b.status]}`}>{t.updSt[b.status]}</span>
            <span className="stack" style={{ gap: 0 }}>
              <b>{t.updRow[b.k]}</b>
              <span className="hint mono">
                <Baris t={t} b={b} />
              </span>
            </span>
            {b.status === "perlu" || b.status === "beda" ? (
              <button type="button" className="btn btn--sm" onClick={() => setHow(b.k)}>
                <QuestionIcon size={16} aria-hidden="true" />
                {t.updHow}
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
      </div>
      <span className="hint panel__actions">{t.updNote}</span>
      {how && (
        <Dialog
          open
          onOpenChange={(o) => !o && setHow(null)}
          title={t.howTitle}
          description={t.updRow[how]}
          lang={lang}
          actions={
            <button type="button" className="btn btn--primary" onClick={() => setHow(null)}>
              {t.close}
            </button>
          }
        >
          <div className="stack">
            {how === "apt" ? (
              <>
                <p className="hint">{t.howApt}</p>
                <Salin t={t} teks={"ssh orangepi\nsudo apt update && sudo apt upgrade"} />
              </>
            ) : (
              <>
                <p className="hint">{t.howBundle}</p>
                <Salin
                  t={t}
                  teks={"python orangepi/build_bundle.py\nsh orangepi/deploy.sh orangepi --modul 4"}
                />
              </>
            )}
            <div className="banner banner--warn">
              <span>{t.howSession}</span>
            </div>
          </div>
        </Dialog>
      )}
    </section>
  );
}
