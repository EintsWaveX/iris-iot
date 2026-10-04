/**
 * The Overview tab (Phase 9 Stage 5, mockup v-over): the Pi right now,
 * quick actions, then two rows of equal height, [Chart | Services] and
 * [History | Commands], with the Full view's cards between them. Every
 * command says it runs on the next heartbeat; nothing pretends it already
 * happened.
 */
import { useEffect, useState, type CSSProperties } from "react";
import {
  ArrowClockwiseIcon,
  ArrowsCounterClockwiseIcon,
  CaretRightIcon,
  CircleNotchIcon,
  ClockIcon,
  ListBulletsIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  PlayIcon,
  PowerIcon,
  PulseIcon,
  TerminalWindowIcon,
  WifiHighIcon,
} from "@phosphor-icons/react";
import Confirm from "../ui/Confirm";
import IconButton from "../ui/IconButton";
import { Switch } from "../ui/Controls";
import { getJson, sejak, useTick } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { hotspotMenyala, LAYANAN_URUT, urutkanLayanan } from "../../lib/server-shared";
import type { Perintah } from "../console/types";
import Gauges from "./Gauges";
import PiFull from "./PiFull";
import ZoomChart, { useZoom } from "./ZoomChart";
import {
  CommandsDialog,
  HistoryDialog,
  OutputDialog,
  StatusPill,
  labelPerintah,
} from "./LogDialogs";
import {
  kejadianDari,
  kirim,
  sedangBerjalan,
  svcTone,
  terakhirDari,
  TONE_PILL,
  WARN_CPU,
  WARN_TEMP,
  type Bisa,
  type Detail,
  type Riwayat,
} from "./data";
import { S } from "./strings";

interface Props {
  lang: Lang;
  id: number;
  data: Detail;
  refresh: () => void;
  bisa: Bisa;
  full: boolean;
  siapa: (nim: string | null) => string;
  autoCmd?: boolean;
  onAutoCmd?: () => void;
  onJournal: () => void;
}

const MODUL_HUE: Record<string, string> = { "modul2-ws": "2", mosquitto: "3", modul4: "4" };

function Tile({
  icon: Icon,
  title,
  hint,
  onClick,
  busy,
  disabled,
}: {
  icon: typeof ClockIcon;
  title: string;
  hint: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="qa__b"
      aria-disabled={disabled || busy || undefined}
      onClick={() => !disabled && !busy && onClick()}
    >
      {busy ? (
        <CircleNotchIcon size={26} className="ctl-spin" aria-hidden="true" />
      ) : (
        <Icon size={26} aria-hidden="true" />
      )}
      <span className="stack stack--sm">
        <b>{title}</b>
        <span className="hint">{hint}</span>
      </span>
      <CaretRightIcon size={18} aria-hidden="true" />
    </button>
  );
}

function QuickActions({ lang, id, data, refresh, bisa }: Props) {
  const t = S[lang];
  const now = useTick(1_000);
  const hb = data.denyutTerakhir;
  const on = hotspotMenyala(hb?.modeJaringan);
  const [want, setWant] = useState<boolean | null>(null);
  const [ask, setAsk] = useState(false);
  const [diag, setDiag] = useState(false);
  useEffect(() => {
    if (want !== null && want === on) setWant(null);
  }, [on, want]);
  const shown = want ?? on;
  const netLast = terakhirDari(data, "diag.jaringan");
  const netRun = sedangBerjalan(data, "diag.jaringan");
  const syncRun = sedangBerjalan(data, "jam.selaraskan");
  const tip = bisa.server ? undefined : t.needRight;

  const restartAll = async () => {
    for (const layanan of LAYANAN_URUT) {
      await kirim(id, "layanan.mulai_ulang", { layanan }, lang, false);
    }
    window.Toast?.show(t.restartAllSent, "ok");
    refresh();
  };

  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">{t.quick}</h2>
        {tip && <span className="hint">{tip}</span>}
      </div>
      <div className="qa">
        <Tile
          icon={ClockIcon}
          title={t.sync}
          hint={hb?.jamSelaras ? t.syncOk : t.syncHint}
          busy={syncRun}
          onClick={() => void kirim(id, "jam.selaraskan", {}, lang, t.syncSent).then(refresh)}
        />
        <Tile
          icon={PulseIcon}
          title={t.netDiag}
          hint={
            netRun
              ? t.netDiagWait
              : netLast
                ? t.netDiagDone(sejak(netLast.selesaiPada ?? netLast.dimintaPada, lang, now))
                : t.netDiagHint
          }
          busy={netRun}
          disabled={!bisa.server && !netLast}
          onClick={() => {
            if (netLast) setDiag(true);
            else void kirim(id, "diag.jaringan", {}, lang).then(refresh);
          }}
        />
        <Tile
          icon={ArrowClockwiseIcon}
          title={t.restartAll}
          hint={t.restartAllHint}
          disabled={!bisa.server}
          onClick={() => (data.sesiModul !== null ? setAsk(true) : void restartAll())}
        />
        <div className="qa__b qa__b--hot" data-on={shown ? "yes" : "no"}>
          <WifiHighIcon size={26} aria-hidden="true" />
          <span className="stack stack--sm grow">
            <span className="qa__title">
              <b>{t.hotspot}</b>
              <span className={`pill ${shown ? "pill--ok" : ""}`}>
                {shown ? t.hotspotOn : t.hotspotOff}
              </span>
            </span>
            <span className="hint">{want !== null ? t.hotspotWait : t.hotspotHint}</span>
          </span>
          <Switch
            on={shown}
            busy={want !== null}
            label={t.hotspot}
            onChange={(v) => {
              setWant(v);
              void kirim(id, v ? "ap.nyala" : "ap.mati", {}, lang).then((ok) => {
                if (!ok) setWant(null);
                refresh();
              });
            }}
          />
        </div>
      </div>
      <Confirm
        open={ask}
        onOpenChange={setAsk}
        title={t.restartAllAsk}
        body={t.restartAllBody}
        confirmLabel={t.restart}
        lang={lang}
        onConfirm={restartAll}
      />
      {diag && (
        <OutputDialog
          lang={lang}
          title={t.netDiag}
          desc={data.server.nama}
          hasil={netLast}
          jalan={netRun}
          run={
            bisa.server
              ? () => void kirim(id, "diag.jaringan", {}, lang, false).then(refresh)
              : undefined
          }
          file={`jaringan-${data.server.nama}.txt`}
          onClose={() => setDiag(false)}
        />
      )}
    </section>
  );
}

function ChartCard({ lang, id }: { lang: Lang; id: number }) {
  const t = S[lang];
  const [rentang, setRentang] = useState("24h");
  const [h, setH] = useState<Riwayat | null>(null);
  useEffect(() => {
    setH(null);
    let alive = true;
    const load = () =>
      getJson<{ ok: boolean } & Riwayat>(`/api/server/${id}?aksi=riwayat&rentang=${rentang}`)
        .then((d) => alive && d.ok && setH(d))
        .catch(() => {});
    void load();
    const timer = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [id, rentang]);
  const seri = (h?.seri ?? []).map((d) => ({
    t: new Date(d.pada).getTime(),
    v: { cpu: d.cpu ?? null, suhu: d.suhu ?? null },
  }));
  const zoom = useZoom(seri.length);
  const now = h?.seri.at(-1);

  return (
    <section className="panel srv-chartcard">
      <div className="srv-charthead">
        <h2 className="panel__title">{t.chart}</h2>
        <div className="srv-charthead__r">
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
        </div>
        <div className="srv-charthead__z">
          <IconButton
            icon={MagnifyingGlassPlusIcon}
            label={t.zoomIn}
            onClick={() => zoom.zoom(0.6)}
          />
          <IconButton
            icon={MagnifyingGlassMinusIcon}
            label={t.zoomOut}
            onClick={() => zoom.zoom(1.6)}
          />
          <IconButton icon={ArrowsCounterClockwiseIcon} label={t.zoomReset} onClick={zoom.reset} />
        </div>
      </div>
      {h === null ? (
        <span className="skeleton" style={{ height: 270, display: "block" }} />
      ) : (
        <ZoomChart
          seri={seri}
          panels={[
            {
              k: "cpu",
              label: t.cpu,
              judul: t.panel(t.cpu, "0", "100%"),
              lo: 0,
              hi: 100,
              c: "var(--accent)",
              unit: "%",
              batas: WARN_CPU,
            },
            {
              k: "suhu",
              label: t.temp,
              judul: t.panel(t.temp, "30", "90 °C"),
              lo: 30,
              hi: 90,
              c: "var(--warn)",
              unit: "°C",
              batas: WARN_TEMP,
            },
          ]}
          zoom={zoom}
          lang={lang}
          harian={rentang === "7d"}
          label={t.chart}
          empty={t.chartEmpty}
        />
      )}
      <div className="row row--between panel__actions">
        <span className="row" style={{ gap: 14 }}>
          <span className="legend" style={{ "--c": "var(--accent)" } as CSSProperties}>
            {t.cpu} {now?.cpu != null ? `${Math.round(now.cpu)}%` : ""}
          </span>
          <span className="legend" style={{ "--c": "var(--warn)" } as CSSProperties}>
            {t.temp} {now?.suhu != null ? `${Math.round(now.suhu)} °C` : ""}
          </span>
        </span>
        <span className="hint">{zoom.zoomed ? t.zoomed : t.zoomHint}</span>
      </div>
    </section>
  );
}

function Services({ lang, id, data, refresh, bisa }: Props) {
  const t = S[lang];
  const [off, setOff] = useState<string | null>(null);
  const [log, setLog] = useState<string | null>(null);
  const hb = data.denyutTerakhir;
  const rows = urutkanLayanan(
    hb?.layanan && Object.keys(hb.layanan).length
      ? hb.layanan
      : { "modul2-ws": "", mosquitto: "", modul4: "" },
  );
  const tip = bisa.server ? undefined : t.needRight;

  function mintaLog(svc: string) {
    void kirim(id, "diag.log", { layanan: svc }, lang, false).then(refresh);
  }

  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">{t.services}</h2>
        <span className="hint">{t.servicesHint}</span>
      </div>
      <div>
        {rows.map(([k, st]) => {
          const tone = st ? svcTone(st) : null;
          const running = tone === "ok";
          const busy =
            sedangBerjalan(data, "layanan.mulai_ulang", k) ||
            sedangBerjalan(data, "layanan.mulai", k) ||
            sedangBerjalan(data, "layanan.henti", k);
          return (
            <div
              key={k}
              className="svcrow"
              style={{ "--m": `var(--mod-${MODUL_HUE[k] ?? "2"})` } as CSSProperties}
            >
              <div className="stack stack--sm">
                <b>{t.svc[k] ?? k}</b>
                <span className="hint mono">{t.unit[k] ?? `${k}.service`}</span>
              </div>
              {tone ? (
                <span className={`pill ${TONE_PILL[busy ? "wait" : tone]}`}>
                  {t.st[busy ? "wait" : tone]}
                </span>
              ) : (
                <span className="pill">{t.unknown}</span>
              )}
              <div className="svcrow__btns">
                {running ? (
                  <IconButton
                    icon={busy ? CircleNotchIcon : ArrowClockwiseIcon}
                    label={`${t.restart} ${k}`}
                    tip={tip}
                    disabled={!bisa.server || busy}
                    onClick={() =>
                      void kirim(
                        id,
                        "layanan.mulai_ulang",
                        { layanan: k },
                        lang,
                        t.restartSent(k),
                      ).then(refresh)
                    }
                  />
                ) : (
                  <IconButton
                    icon={busy ? CircleNotchIcon : PlayIcon}
                    label={`${t.start} ${k}`}
                    tip={tip}
                    disabled={!bisa.server || busy}
                    onClick={() =>
                      void kirim(id, "layanan.mulai", { layanan: k }, lang, t.startSent(k)).then(
                        refresh,
                      )
                    }
                  />
                )}
                <IconButton
                  icon={TerminalWindowIcon}
                  label={`${t.viewLog} ${k}`}
                  onClick={() => {
                    setLog(k);
                    const l = terakhirDari(data, "diag.log", k);
                    const umur = l
                      ? Date.now() - new Date(l.selesaiPada ?? l.dimintaPada).getTime()
                      : Infinity;
                    if (bisa.server && umur > 30_000 && !sedangBerjalan(data, "diag.log", k))
                      mintaLog(k);
                  }}
                />
                {running && (
                  <IconButton
                    icon={PowerIcon}
                    kind="danger"
                    label={`${t.turnOff} ${k}`}
                    tip={tip}
                    disabled={!bisa.server || busy}
                    onClick={() => setOff(k)}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <Confirm
        open={!!off}
        onOpenChange={(o) => !o && setOff(null)}
        title={t.offAsk(off ?? "")}
        body={t.offBody}
        confirmLabel={t.turnOff}
        lang={lang}
        onConfirm={async () => {
          if (off) await kirim(id, "layanan.henti", { layanan: off }, lang);
          refresh();
        }}
      >
        <p className="hint">{t.svc[off ?? ""] ?? ""}</p>
      </Confirm>
      {log && (
        <OutputDialog
          lang={lang}
          title={t.logTitle(t.unit[log] ?? log)}
          desc={t.logDesc}
          hasil={terakhirDari(data, "diag.log", log)}
          jalan={sedangBerjalan(data, "diag.log", log)}
          run={bisa.server ? () => mintaLog(log) : undefined}
          file={`${log}.log`}
          onClose={() => setLog(null)}
        />
      )}
    </section>
  );
}

function HistoryCard({ lang, id, data, refresh, bisa }: Props) {
  const t = S[lang];
  const now = useTick(1_000);
  const [h, setH] = useState<Riwayat | null>(null);
  const [open, setOpen] = useState(false);
  const sejakKosong = data.server.riwayatSejak;
  useEffect(() => {
    let alive = true;
    const load = () =>
      getJson<{ ok: boolean } & Riwayat>(`/api/server/${id}?aksi=riwayat&rentang=7d`)
        .then((d) => alive && d.ok && setH(d))
        .catch(() => {});
    void load();
    const timer = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [id, sejakKosong]);
  const rows = kejadianDari(h, lang).slice(0, 4);
  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">{t.history}</h2>
        <button type="button" className="btn btn--sm" onClick={() => setOpen(true)}>
          <ListBulletsIcon size={16} aria-hidden="true" />
          {t.fullHistory}
        </button>
      </div>
      {h === null ? (
        <span className="skeleton" style={{ height: 120, display: "block" }} />
      ) : rows.length === 0 ? (
        <p className="hint">{t.noHistory}</p>
      ) : (
        <div className="logrows">
          {rows.map((r, i) => (
            <div key={i} className="logrow">
              <span className={`dot dot--${r.tone}`} aria-hidden="true" />
              <span>{r.teks}</span>
              <span className="hint num">{sejak(r.pada, lang, now)}</span>
            </div>
          ))}
        </div>
      )}
      {open && (
        <HistoryDialog
          lang={lang}
          serverId={id}
          nama={data.server.nama}
          bisaHapus={bisa.full}
          onClose={() => setOpen(false)}
          refresh={() => {
            refresh();
            setH((x) => (x ? { ...x, reboot: [], gap: [], timelineLayanan: [] } : x));
          }}
        />
      )}
    </section>
  );
}

function CommandsCard({ lang, id, data, refresh, bisa, siapa, autoCmd, onAutoCmd }: Props) {
  const t = S[lang];
  const now = useTick(1_000);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (autoCmd) {
      setOpen(true);
      onAutoCmd?.();
    }
  }, [autoCmd, onAutoCmd]);
  const rows: Perintah[] = data.perintah.slice(0, 4);
  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">{t.commands}</h2>
        <button type="button" className="btn btn--sm" onClick={() => setOpen(true)}>
          <ListBulletsIcon size={16} aria-hidden="true" />
          {t.allCommands}
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="hint">{t.noCommands}</p>
      ) : (
        <div className="logrows">
          {rows.map((p) => (
            <div key={p.id} className="logrow">
              <StatusPill t={t} p={p} />
              <span className="stack" style={{ gap: 0 }}>
                <b>{labelPerintah(t, p)}</b>
                <span className="hint">{siapa(p.dimintaOleh) || "·"}</span>
              </span>
              <span className="hint num">{sejak(p.selesaiPada ?? p.dimintaPada, lang, now)}</span>
            </div>
          ))}
        </div>
      )}
      {open && (
        <CommandsDialog
          lang={lang}
          serverId={id}
          nama={data.server.nama}
          awal={data.perintah}
          bisaHapus={bisa.full}
          bisaKendali={bisa.server}
          siapa={siapa}
          onClose={() => setOpen(false)}
          refresh={refresh}
        />
      )}
    </section>
  );
}

export default function Overview(p: Props) {
  const t = S[p.lang];
  return (
    <div className="srv">
      <Gauges lang={p.lang} data={p.data} />
      <QuickActions {...p} />
      <div className="srv-g2">
        <ChartCard lang={p.lang} id={p.id} />
        <Services {...p} />
      </div>
      {p.full && (
        <>
          <div className="seplabel">
            <span>{t.fullSep}</span>
          </div>
          <PiFull
            lang={p.lang}
            id={p.id}
            data={p.data}
            refresh={p.refresh}
            onJournal={p.onJournal}
          />
        </>
      )}
      <div className="srv-g2">
        <HistoryCard {...p} />
        <CommandsCard {...p} />
      </div>
    </div>
  );
}
