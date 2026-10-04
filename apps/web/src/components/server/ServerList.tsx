/**
 * The server list (Phase 9 Stage 5, mockup v-list): status tiles with a
 * tinted wash, a labelled separator, then one card per Pi (location and LAN
 * address, 24-hour CPU and temperature sparklines, services in module
 * order) and the register card with its slow colour sweep.
 */
import { useState, type CSSProperties } from "react";
import { MapPinIcon, PlusIcon, WifiXIcon } from "@phosphor-icons/react";
import { OfflineBanner } from "../ui/Display";
import { usePoll } from "../../lib/hooks";
import { getJson, sejak, useTick } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { urutkanLayanan } from "../../lib/server-shared";
import Enroll from "./Enroll";
import { isOnline, svcTone, TONE_PILL, type Bisa, type Riwayat, type ServerRow } from "./data";
import { S } from "./strings";

function Spark({ vals, c }: { vals: number[]; c: string }) {
  if (vals.length < 2) return <span className="spark" aria-hidden="true" />;
  const min = Math.min(...vals);
  const range = Math.max(...vals) - min || 1;
  const pts = vals
    .map(
      (v, i) =>
        `${((i / (vals.length - 1)) * 100).toFixed(2)},${(30 - ((v - min) / range) * 26 - 2).toFixed(2)}`,
    )
    .join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="spark" aria-hidden="true">
      <polyline
        points={pts}
        fill="none"
        stroke={c}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default function ServerList({
  lang,
  bisa,
  onOpen,
}: {
  lang: Lang;
  bisa: Bisa;
  onOpen: (id: number) => void;
}) {
  const t = S[lang];
  const [enroll, setEnroll] = useState(false);
  const now = useTick(1_000);
  const poll = usePoll(async () => {
    const d = await getJson<{ ok: boolean; server: ServerRow[] }>("/api/server");
    const list = d.ok ? d.server : [];
    const hist: Record<number, Riwayat> = {};
    await Promise.all(
      list
        .filter((s) => s.terdaftar)
        .map(async (s) => {
          const r = await getJson<{ ok: boolean } & Riwayat>(
            `/api/server/${s.id}?aksi=riwayat&rentang=24h`,
          ).catch(() => null);
          if (r?.ok) hist[s.id] = r;
        }),
    );
    return { list, hist };
  }, 15_000);
  // Online servers first, then by name (mockup v-list).
  const list = [...(poll.data?.list ?? [])].sort(
    (a, b) =>
      Number(isOnline(b.denyutTerakhir, b.batasLuringDetik)) -
        Number(isOnline(a.denyutTerakhir, a.batasLuringDetik)) || a.nama.localeCompare(b.nama),
  );
  const hist = poll.data?.hist ?? {};
  const online = list.filter((s) => isOnline(s.denyutTerakhir, s.batasLuringDetik)).length;
  const last = list
    .map((s) => s.denyutTerakhir?.pada)
    .filter((p): p is string => !!p)
    .sort()
    .at(-1);

  const open = () => setEnroll(true);

  return (
    <div className="srv">
      <OfflineBanner
        errors={poll.errors}
        text={t.offlineBanner}
        retry={poll.refresh}
        retryLabel={t.retry}
      />
      <header className="page-header">
        <div className="page-header__row">
          <div className="page-header__heading">
            <span className="page-header__eyebrow">{t.eyebrow}</span>
            <h1 className="page-header__title">{t.title}</h1>
          </div>
          {bisa.full && (
            <div className="page-header__actions">
              <button type="button" className="btn btn--primary" onClick={open}>
                <PlusIcon size={18} aria-hidden="true" />
                {t.register}
              </button>
            </div>
          )}
        </div>
      </header>

      {poll.data === null ? (
        <div className="srv-stats">
          {[0, 1, 2].map((i) => (
            <span key={i} className="skeleton" style={{ height: 84 }} />
          ))}
        </div>
      ) : (
        <div className="srv-stats">
          <div className="srv-stat" data-st="on">
            <b>{online}</b>
            <span>
              <span className="dot dot--ok" aria-hidden="true" /> {t.online}
            </span>
          </div>
          <div className="srv-stat" data-st="off">
            <b>{list.length - online}</b>
            <span>
              <span className="dot dot--danger" aria-hidden="true" /> {t.offline}
            </span>
          </div>
          <div className="srv-stat">
            <b className="srv-stat__sm">{last ? sejak(last, lang, now) : t.never}</b>
            <span>{t.lastReport}</span>
          </div>
        </div>
      )}

      <div className="seplabel">
        <span>{t.list}</span>
      </div>

      {poll.data && list.length === 0 && !bisa.full ? (
        <p className="empty-note">{t.empty}</p>
      ) : (
        <div className="srv-g3">
          {list.map((s) => {
            const on = isOnline(s.denyutTerakhir, s.batasLuringDetik);
            const st = !s.terdaftar ? "wait" : on ? "on" : "off";
            const d = s.denyutTerakhir;
            const seri = hist[s.id]?.seri ?? [];
            const layanan = urutkanLayanan(d?.layanan);
            return (
              <button
                key={s.id}
                type="button"
                className="panel srvcard"
                data-st={st}
                onClick={() => onOpen(s.id)}
              >
                <span className="row row--between" style={{ flexWrap: "nowrap" }}>
                  <b className="srvcard__name">{s.nama}</b>
                  <span className="stchip" data-st={st}>
                    <span
                      className={`dot ${st === "on" ? "dot--ok dot--pulse" : st === "off" ? "dot--danger" : "dot--warn"}`}
                      aria-hidden="true"
                    />
                    {st === "on" ? t.online : st === "off" ? t.offline : t.waiting}
                  </span>
                </span>
                <span className="srvcard__loc">
                  <MapPinIcon size={16} aria-hidden="true" />
                  {s.lokasi || <span className="faint">{t.none}</span>}
                  {s.alamatLan && (
                    <>
                      {" · "}
                      <span className="mono">{s.alamatLan}</span>
                    </>
                  )}
                </span>
                {on ? (
                  <span className="srv-g2" style={{ gap: 10 }}>
                    <span
                      className="srvcard__spark"
                      style={{ "--c": "var(--accent)" } as CSSProperties}
                    >
                      <span>
                        {t.cpu} {d?.cpu != null ? `${Math.round(d.cpu)}%` : "·"}
                      </span>
                      <Spark
                        vals={seri.map((x) => x.cpu).filter((v): v is number => v != null)}
                        c="var(--accent)"
                      />
                    </span>
                    <span className="srvcard__spark">
                      <span>
                        {t.temp} {d?.suhu != null ? `${Math.round(d.suhu)} °C` : "·"}
                      </span>
                      <Spark
                        vals={seri.map((x) => x.suhu).filter((v): v is number => v != null)}
                        c="var(--warn)"
                      />
                    </span>
                  </span>
                ) : (
                  <span className="banner srv-banner-off">
                    <WifiXIcon size={20} aria-hidden="true" />
                    <span>{d ? t.offlineSince(sejak(d.pada, lang, now)) : t.neverBeat}</span>
                  </span>
                )}
                <span className="srvcard__svc">
                  {(layanan.length
                    ? layanan
                    : urutkanLayanan({ "modul2-ws": "", mosquitto: "", modul4: "" })
                  ).map(([k, v]) => {
                    const tone = svcTone(v);
                    return (
                      <span key={k} className="row row--between" style={{ flexWrap: "nowrap" }}>
                        <span>{t.svc[k] ?? k}</span>
                        {on && v ? (
                          <span className={`pill ${TONE_PILL[tone]}`}>{t.st[tone]}</span>
                        ) : (
                          <span className="pill">{t.unknown}</span>
                        )}
                      </span>
                    );
                  })}
                </span>
              </button>
            );
          })}
          {bisa.full && (
            <button type="button" className="panel enroll sweep-live" onClick={open}>
              <PlusIcon size={28} aria-hidden="true" />
              <b>{t.newCard}</b>
              <span className="hint">{t.newCardHint}</span>
            </button>
          )}
        </div>
      )}

      {enroll && (
        <Enroll
          lang={lang}
          onClose={() => {
            setEnroll(false);
            poll.refresh();
          }}
          onOpen={(id) => {
            setEnroll(false);
            onOpen(id);
          }}
        />
      )}
    </div>
  );
}
