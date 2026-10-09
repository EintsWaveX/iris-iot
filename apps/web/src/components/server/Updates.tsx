/**
 * The Updates card (Phase 9 Stage 5, mockup v-ready Updates). The agent
 * reports what is installed (its protocol, the bundle's commits, apt's
 * upgradable count) and the site compares that with what is newest: the
 * bundle CI built, signed and published. Since 2026-10-07 each row that is
 * behind has an Update button that sends the command to the Pi: the three
 * bundle rows install that one signed bundle (root on the Pi checks the
 * signature first), the apt row runs apt upgrade. Never during a session.
 */
import { useState } from "react";
import { ArrowsClockwiseIcon, CircleNotchIcon, DownloadSimpleIcon } from "@phosphor-icons/react";
import Confirm from "../ui/Confirm";
import { sejak, useTick } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { bacaHasilPembaruan, barisPembaruan, type BarisPembaruan } from "../../lib/server-shared";
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
  return <>{t.updSite(b.sekarang, b.baru)}</>;
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
  const [ask, setAsk] = useState<BarisPembaruan["aksi"] | null>(null);
  const s = data.server;
  const terbit = data.bundelTerbit;
  const rows = barisPembaruan(s.infoSistem, s.agenVersi, data.situsIot, terbit);
  const checking = sedangBerjalan(data, "info.segarkan");
  const hasil = {
    "pembaruan.bundel": bacaHasilPembaruan(s.infoSistem, "bundel", now),
    "pembaruan.apt": bacaHasilPembaruan(s.infoSistem, "apt", now),
  };
  // Sent and not yet picked up, or picked up and still installing.
  const jalan = (a: BarisPembaruan["aksi"]) =>
    sedangBerjalan(data, a) || hasil[a]?.status === "berjalan";
  const sesi = data.sesiModul !== null;

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
        {rows.map((b) => {
          const behind = b.status === "perlu" || b.status === "beda";
          const tanpaBundel = b.aksi === "pembaruan.bundel" && !terbit;
          const busy = jalan(b.aksi);
          const alasan = sesi ? t.updInSession : tanpaBundel ? t.updNoBundle : undefined;
          return (
            <div key={b.k} className="tabstops__row">
              <span className={`pill ${TONE[b.status]}`}>{t.updSt[b.status]}</span>
              <span className="stack" style={{ gap: 0 }}>
                <b>{t.updRow[b.k]}</b>
                <span className="hint mono">
                  <Baris t={t} b={b} />
                </span>
              </span>
              {bisa.server && (behind || busy) ? (
                <button
                  type="button"
                  className="btn btn--sm btn--primary"
                  disabled={busy || !!alasan}
                  title={alasan}
                  onClick={() => setAsk(b.aksi)}
                >
                  {busy ? (
                    <CircleNotchIcon size={16} className="ctl-spin" aria-hidden="true" />
                  ) : (
                    <DownloadSimpleIcon size={16} aria-hidden="true" />
                  )}
                  {t.updDo}
                </button>
              ) : (
                <span />
              )}
            </div>
          );
        })}
      </div>
      {(["pembaruan.bundel", "pembaruan.apt"] as const).map((a) => {
        const h = hasil[a];
        if (!h) return null;
        return (
          <p key={a} className="hint">
            {t.updLast[a === "pembaruan.bundel" ? "bundel" : "apt"]}: {t.updHasilSt[h.status]}
            {h.pada ? ` · ${sejak(new Date(h.pada * 1000).toISOString(), lang, now)}` : ""}
            {h.status === "gagal" && h.pesan ? (
              <>
                <br />
                <span className="mono">{h.pesan}</span>
              </>
            ) : null}
          </p>
        );
      })}
      <span className="hint panel__actions">{sesi ? t.updInSession : t.updNote}</span>
      <Confirm
        open={ask !== null}
        onOpenChange={(o) => !o && setAsk(null)}
        title={ask === "pembaruan.apt" ? t.updAskApt : t.updAskBundle}
        body={
          ask === "pembaruan.apt"
            ? t.updAptBody
            : t.updBundleBody(terbit?.aso ?? "", terbit?.iot ?? "")
        }
        confirmLabel={t.updDo}
        cancelLabel={t.updCancel}
        tone="primary"
        lang={lang}
        onConfirm={async () => {
          if (!ask) return false;
          const ok = await kirim(id, ask, {}, lang, t.updSent);
          refresh();
          return ok;
        }}
      />
    </section>
  );
}
