/**
 * The Overview tab (Phase 9 Stage 5; Phase 10 grid, mockup s12-server):
 * the Pi right now, then rows of equal height on one 12 column grid:
 * [Chart 8 | Ready 4], [Services 8 | Quick actions 4], the Full view's
 * cards, and [History and commands 8 | Updates 4]. Every command says it
 * runs on the next heartbeat; nothing pretends it already happened.
 */
import { useEffect, useState, type CSSProperties } from "react";
import {
  ArrowClockwiseIcon,
  ArrowRightIcon,
  ArrowsCounterClockwiseIcon,
  CaretRightIcon,
  CircleNotchIcon,
  ClockIcon,
  ListBulletsIcon,
  ListChecksIcon,
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
import { getJson, postJson, sejak, useTick } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import {
  bacaHasilSiap,
  bacaKondisi,
  hotspotMenyala,
  LAYANAN_URUT,
  urutkanLayanan,
} from "../../lib/server-shared";
import { durasiLabel, modulLabel } from "../../lib/labels";
import type { Perintah } from "../console/types";
import Gauges from "./Gauges";
import PiFull from "./PiFull";
import Updates from "./Updates";
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
import { S12 } from "./server12Strings";

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
  onTab: (t: "siap") => void;
}

const MODUL_HUE: Record<string, string> = { "modul2-ws": "2", mosquitto: "3", modul4: "4" };

function Tile({
  icon: Icon,
  title,
  hint,
  onClick,
  busy,
  disabled,
  warn,
}: {
  icon: typeof ClockIcon;
  title: string;
  hint: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  warn?: boolean;
}) {
  return (
    <button
      type="button"
      className="qa__b"
      data-warn={warn ? "yes" : undefined}
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
  // The Pi's clock against the site's (measured on each heartbeat): a
  // minute or more apart is shown, whatever chrony thinks.
  const selisih = bacaKondisi(data.server.kondisi)?.selisihDetik ?? 0;
  const jauh = Math.abs(selisih) >= 60;
  const tip = bisa.server ? undefined : t.needRight;

  const restartAll = async () => {
    for (const layanan of LAYANAN_URUT) {
      await kirim(id, "layanan.mulai_ulang", { layanan }, lang, false);
    }
    window.Toast?.show(t.restartAllSent, "ok");
    refresh();
  };

  return (
    <section className="panel s12span4">
      <div className="panel__head">
        <h2 className="panel__title">{t.quick}</h2>
        {tip && <span className="hint">{tip}</span>}
      </div>
      <div className="qa">
        <Tile
          icon={ClockIcon}
          title={t.sync}
          warn={jauh}
          hint={
            jauh
              ? t.clockApart(durasiLabel(Math.max(1, Math.round(Math.abs(selisih) / 60)), lang))
              : hb?.jamSelaras
                ? t.syncOk
                : t.syncHint
          }
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
    <section className="panel srv-chartcard s12span8">
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
    <section className="panel s12span8">
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

/** Each module's last Ready check (mockup ReadySnap): Module 1 needs no
 *  Pi; 2 to 4 read their newest run, or the newest run of every module. */
function ReadySnap({ lang, id, data, refresh, bisa, siapa, onTab }: Props) {
  const t = S[lang];
  const w = S12[lang];
  const now = useTick(1_000);
  const runs = data.siapRiwayat;
  const last = runs[0] ?? null;
  const jalan = sedangBerjalan(data, "diag.siap");
  const run = (modul: string) =>
    void kirim(id, "diag.siap", modul ? { modul } : {}, lang, t.readyWait).then(refresh);
  const rows = (["1", "2", "3", "4"] as const).map((m) => {
    if (m === "1") return { m, tone: "idle" as const, sub: w.noPi };
    const r = runs.find((x) => (x.argumen?.modul ?? "") === m || !x.argumen?.modul);
    if (!r) return { m, tone: "warn" as const, sub: w.notChecked };
    const h = bacaHasilSiap(r.keluaran);
    if (!h) return { m, tone: "warn" as const, sub: w.unreadable };
    const lolos = h.cek.filter((c) => c.status === "ok").length;
    return h.gagal
      ? { m, tone: "warn" as const, sub: w.toFix(h.gagal) }
      : { m, tone: "ok" as const, sub: w.passed(lolos) };
  });
  return (
    <section className="panel s12span4">
      <div className="panel__head">
        <div className="stack stack--sm">
          <h2 className="panel__title">{w.readyTitle}</h2>
          <span className="hint">
            {last
              ? t.readyLast(
                  sejak(last.selesaiPada ?? last.dimintaPada, lang, now),
                  siapa(last.dimintaOleh),
                )
              : t.readyNever}
          </span>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onTab("siap")}>
          {w.details}
          <ArrowRightIcon size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="stack stack--sm">
        {rows.map((x) => (
          <div
            key={x.m}
            className="s12mod"
            data-t={x.tone}
            style={{ "--m": `var(--mod-${x.m})` } as CSSProperties}
          >
            <span className="s12lamp" aria-hidden="true" />
            <span className="stack" style={{ gap: 0, minWidth: 0 }}>
              <b>{modulLabel(Number(x.m), lang)}</b>
              <span className="hint">{x.sub}</span>
            </span>
            {x.m === "1" ? (
              <span />
            ) : (
              <IconButton
                icon={jalan ? CircleNotchIcon : ArrowClockwiseIcon}
                label={w.checkMod(modulLabel(Number(x.m), lang))}
                sm
                tip={bisa.server ? undefined : t.needRight}
                disabled={!bisa.server || jalan}
                onClick={() => run(x.m)}
              />
            )}
          </div>
        ))}
      </div>
      <div className="panel__actions" style={{ marginTop: "auto" }}>
        <button
          type="button"
          className="btn btn--block"
          disabled={!bisa.server || jalan}
          onClick={() => run("")}
        >
          {jalan ? (
            <CircleNotchIcon size={18} className="ctl-spin" aria-hidden="true" />
          ) : (
            <ListChecksIcon size={18} aria-hidden="true" />
          )}
          {w.checkAll}
        </button>
      </div>
    </section>
  );
}

type Baris =
  | { k: "ev"; pada: string; teks: string; tone: "ok" | "warn" | "danger" }
  | { k: "cmd"; pada: string; p: Perintah };

/** Events on the Pi and commands from the site in one list (mockup
 *  Activity), filtered All, Commands or Events, with Retry and Cancel
 *  where a command allows it and both full lists one press away. */
function ActivityCard({ lang, id, data, refresh, bisa, siapa, autoCmd, onAutoCmd }: Props) {
  const t = S[lang];
  const w = S12[lang];
  const now = useTick(1_000);
  const [h, setH] = useState<Riwayat | null>(null);
  const [f, setF] = useState<"all" | "cmd" | "ev">("all");
  const [hist, setHist] = useState(false);
  const [cmds, setCmds] = useState(false);
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
  useEffect(() => {
    if (autoCmd) {
      setCmds(true);
      onAutoCmd?.();
    }
  }, [autoCmd, onAutoCmd]);

  async function ulang(p: Perintah, tipe: "perintah_ulang" | "perintah_batal") {
    try {
      const r = await postJson<{ ok: boolean; kode?: string }>("/api/action", { tipe, id: p.id });
      if (!r.ok) window.Toast?.show(t.fail, "danger");
      else if (tipe === "perintah_ulang") window.Toast?.show(t.cmdRetried, "ok");
      refresh();
    } catch {
      window.Toast?.show(t.fail, "danger");
    }
  }

  const semua: Baris[] = [
    ...kejadianDari(h, lang).map((e) => ({ k: "ev" as const, ...e })),
    ...data.perintah.map((p) => ({ k: "cmd" as const, pada: p.selesaiPada ?? p.dimintaPada, p })),
  ].sort((a, b) => (a.pada < b.pada ? 1 : -1));
  const rows = semua.filter((r) => f === "all" || r.k === f).slice(0, 6);

  return (
    <section className="panel s12span8">
      <div className="panel__head">
        <div className="stack stack--sm">
          <h2 className="panel__title">{w.actTitle}</h2>
          <span className="hint">{w.actSub}</span>
        </div>
        <div className="seg" role="group" aria-label={w.actTitle}>
          {(
            [
              ["all", w.fAll],
              ["cmd", w.fCmd],
              ["ev", w.fEv],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" aria-pressed={f === v} onClick={() => setF(v)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {h === null && f !== "cmd" ? (
        <span className="skeleton" style={{ height: 160, display: "block" }} />
      ) : rows.length === 0 ? (
        <p className="hint">{f === "ev" ? t.noHistory : f === "cmd" ? t.noCommands : w.actEmpty}</p>
      ) : (
        <ol className="s12act">
          {rows.map((r, i) => (
            <li key={r.k === "cmd" ? `c${r.p.id}` : `e${i}`}>
              <time className="num">{sejak(r.pada, lang, now)}</time>
              {r.k === "cmd" ? (
                <StatusPill t={t} p={r.p} />
              ) : (
                <span className="s12act__tag" data-tone={r.tone}>
                  {w.evTag}
                </span>
              )}
              {r.k === "cmd" ? (
                <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                  <b>{labelPerintah(t, r.p)}</b>
                  {r.p.dimintaOleh && <span className="hint">{siapa(r.p.dimintaOleh)}</span>}
                </span>
              ) : (
                <span>{r.teks}</span>
              )}
              {r.k === "cmd" && bisa.server && r.p.status === "menunggu" ? (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => void ulang(r.p, "perintah_batal")}
                >
                  {t.cancelCmd}
                </button>
              ) : r.k === "cmd" &&
                bisa.server &&
                (r.p.status === "gagal" || r.p.status === "kedaluwarsa") ? (
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => void ulang(r.p, "perintah_ulang")}
                >
                  <ArrowClockwiseIcon size={16} aria-hidden="true" />
                  {t.retryCmd}
                </button>
              ) : (
                <span />
              )}
            </li>
          ))}
        </ol>
      )}
      <div className="s12pair">
        <button type="button" className="btn" onClick={() => setHist(true)}>
          <ListBulletsIcon size={18} aria-hidden="true" />
          {t.fullHistory}
        </button>
        <button type="button" className="btn" onClick={() => setCmds(true)}>
          <ListBulletsIcon size={18} aria-hidden="true" />
          {t.allCommands}
        </button>
      </div>
      {hist && (
        <HistoryDialog
          lang={lang}
          serverId={id}
          nama={data.server.nama}
          bisaHapus={bisa.full}
          onClose={() => setHist(false)}
          refresh={() => {
            refresh();
            setH((x) => (x ? { ...x, reboot: [], gap: [], timelineLayanan: [] } : x));
          }}
        />
      )}
      {cmds && (
        <CommandsDialog
          lang={lang}
          serverId={id}
          nama={data.server.nama}
          awal={data.perintah}
          bisaHapus={bisa.full}
          bisaKendali={bisa.server}
          siapa={siapa}
          onClose={() => setCmds(false)}
          refresh={refresh}
        />
      )}
    </section>
  );
}

export default function Overview(p: Props) {
  const t = S[p.lang];
  return (
    <div className="s12grid">
      <div className="s12span12">
        <Gauges lang={p.lang} data={p.data} />
      </div>
      <ChartCard lang={p.lang} id={p.id} />
      <ReadySnap {...p} />
      <Services {...p} />
      <QuickActions {...p} />
      {p.full && (
        <div className="s12span12 srv">
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
        </div>
      )}
      <ActivityCard {...p} />
      <div className="s12span4">
        <Updates lang={p.lang} id={p.id} data={p.data} refresh={p.refresh} bisa={p.bisa} />
      </div>
    </div>
  );
}
