/**
 * One server (Phase 9 Stage 5; Phase 10 head, mockup s12-server): the back
 * link, then one hero card: a status ring (up, off or new with the
 * heartbeat's age), the status, server number and session badges, the name
 * with its agent protocol and bundle, the Compact/Full switch (Full only
 * with the full right, remembered in this browser), the location, LAN,
 * heartbeat, uptime and notes, and a glance row (services, the last Ready
 * check, site updates, the Pi clock) with Run the Ready Check and Pi
 * Console. The tab line follows. The detail is polled every 6 s and handed
 * to the tab.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ClockIcon,
  IdentificationBadgeIcon,
  ListBulletsIcon,
  ListChecksIcon,
  LockSimpleIcon,
  MapPinIcon,
  NoteIcon,
  PlugsConnectedIcon,
  TerminalWindowIcon,
} from "@phosphor-icons/react";
import Pill from "../ui/Pill";
import { dict } from "../../lib/app";
import { durasiLabel, modulLabel, nil } from "../../lib/labels";
import Nil from "../ui/Nil";
import { svcTone } from "./ops";
import { bacaBundel, bacaHasilSiap, bacaKondisi, barisPembaruan } from "../../lib/server-shared";
import "./server12.css";

/* Phase 10 (s12-server): the hero's words. */
const SH = dict({
  id: {
    up: "HIDUP",
    off: "MATI",
    neu: "BARU",
    num: (n: number) => `Server #${n}`,
    inUse: (m: string) => `Dipakai sesi ${m}`,
    sub: (p: string, b: string) => `agen protokol ${p} · bundel ${b}`,
    subWait: "Belum pernah mengirim denyut. Lanjutkan pemasangannya dari server ini.",
    upSince: "Menyala sejak",
    svcOk: (n: number) => `${n} layanan sehat`,
    svcNone: "Layanan belum dilaporkan",
    svcBad: (n: number) => `${n} layanan gagal`,
    readyOk: (m: string) => `Siap untuk ${m}`,
    readyAll: "Lulus cek siap",
    readyFail: (n: number) => `${n} cek perlu dibereskan`,
    readyNone: "Belum dicek",
    upd: (n: number) => (n ? `${n} pembaruan` : "Semua terbaru"),
    clockOk: (ms: string) => `Jam selisih ${ms}`,
    clockBad: (ms: string) => `Jam selisih ${ms}`,
    runReady: "Cek Siap Praktikum",
    konsol: "Konsol Pi",
    s: "detik",
    m: "menit",
    h: "jam",
  },
  en: {
    up: "UP",
    off: "OFF",
    neu: "NEW",
    num: (n: number) => `Server #${n}`,
    inUse: (m: string) => `In use by a ${m} session`,
    sub: (p: string, b: string) => `agent protocol ${p} · bundle ${b}`,
    subWait: "Hasn't sent a heartbeat yet. Continue its setup from this server.",
    upSince: "Up for",
    svcOk: (n: number) => `${n} services healthy`,
    svcNone: "Services not reported yet",
    svcBad: (n: number) => `${n} services failed`,
    readyOk: (m: string) => `Ready for ${m}`,
    readyAll: "Ready check passed",
    readyFail: (n: number) => `${n} checks to fix`,
    readyNone: "Not checked yet",
    upd: (n: number) => (n ? `${n} updates` : "All up to date"),
    clockOk: (ms: string) => `Clock ${ms} apart`,
    clockBad: (ms: string) => `Clock ${ms} apart`,
    runReady: "Run the Ready Check",
    konsol: "Pi Console",
    s: "seconds",
    m: "minutes",
    h: "hours",
  },
  zh: {
    up: "运行",
    off: "离线",
    neu: "新",
    num: (n: number) => `服务器 #${n}`,
    inUse: (m: string) => `${m}的课正在使用`,
    sub: (p: string, b: string) => `代理协议 ${p} · 程序包 ${b}`,
    subWait: "还没发送过心跳。从这台服务器继续安装。",
    upSince: "已运行",
    svcOk: (n: number) => `${n} 个服务正常`,
    svcNone: "还没报告服务",
    svcBad: (n: number) => `${n} 个服务失败`,
    readyOk: (m: string) => `${m}已就绪`,
    readyAll: "就绪检查通过",
    readyFail: (n: number) => `${n} 项要处理`,
    readyNone: "还没检查",
    upd: (n: number) => (n ? `${n} 个更新` : "都是最新"),
    clockOk: (ms: string) => `时钟相差 ${ms}`,
    clockBad: (ms: string) => `时钟相差 ${ms}`,
    runReady: "上课就绪检查",
    konsol: "Pi 控制台",
    s: "秒",
    m: "分",
    h: "小时",
  },
});

/** "8 dtk", "14 mnt", "46 jam": a heartbeat's age, short. */
/** "Lokasi, Alamat LAN dan Catatan" in the page language */
function daftar(items: string[], lang: Lang): string {
  return new Intl.ListFormat(localeOf(lang), { type: "conjunction" }).format(items);
}

function umurPendek(iso: string | null | undefined, now: number, h: (typeof SH)["id"]): string {
  if (!iso) return "·";
  const d = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (d < 120) return `${d} ${h.s}`;
  if (d < 7200) return `${Math.round(d / 60)} ${h.m}`;
  return `${Math.round(d / 3600)} ${h.h}`;
}

/** "40 ms", "2,1 s", "2 min" for the Pi clock's offset. */
function selisih(ms: number, lang: Lang): string {
  const a = Math.abs(ms);
  if (a < 1000) return `${Math.round(a)} ms`;
  if (a < 120_000)
    return `${(a / 1000).toLocaleString(lang === "en" ? "en-GB" : "id-ID", { maximumFractionDigits: 1 })} s`;
  return durasiLabel(Math.round(a / 60_000), lang);
}
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import "../ui/SegmentedControl.css";
import "../ui/Tabs.css";
import BackButton from "../ui/BackButton";
import Fade from "../ui/Fade";
import Tooltip from "../ui/Tooltip";
import { OfflineBanner } from "../ui/Display";
import { usePoll } from "../../lib/hooks";
import { getJson, href, localeOf, useTick } from "../../lib/app";
import { useBatas } from "../../lib/siaran";
import { perintahHabisPada } from "../../lib/server-shared";
import type { Lang } from "../../lib/kelas";
import { useDirektori } from "../../lib/people";
import { isOnline, useDenyutLangsung, type Bisa, type Detail } from "./data";
import Overview from "./Overview";
import Ready from "./Ready";
import Settings from "./Settings";
import Enroll from "./Enroll";
import KonsolPi, { KonsolBanner } from "./konsol/KonsolPi";
import { konsolBerakhirPada, type KonsolData } from "./konsol/data";
import { S } from "./strings";
import { S12 } from "./server12Strings";

export type Tab = "ringkasan" | "siap" | "pengaturan" | "konsol";
const KUNCI_DETAIL = "iris-srv-detail";

function bacaTab(tabs: Tab[]): Tab {
  const h = typeof location !== "undefined" ? location.hash.slice(1) : "";
  return (tabs as string[]).includes(h) ? (h as Tab) : "ringkasan";
}

export default function ServerDetail({
  lang,
  id,
  bisa,
  onBack,
  dari = null,
}: {
  lang: Lang;
  id: number;
  bisa: Bisa;
  onBack: () => void;
  /** "persiapan": opened from a readiness check, which Ready links back to. */
  dari?: string | null;
}) {
  const t = S[lang];
  const now = useTick(1_000);
  // Konsol Pi is hidden, not disabled, for anyone without DEV or Pencipta.
  const TABS = useMemo<Tab[]>(
    () => ["ringkasan", "siap", "pengaturan", ...(bisa.konsol ? (["konsol"] as const) : [])],
    [bisa.konsol],
  );
  const [tab, setTab] = useState<Tab>(() => bacaTab(TABS));
  const [autoCmd, setAutoCmd] = useState(false);
  const [setup, setSetup] = useState(false);
  const [lengkap, setLengkap] = useState(() => {
    try {
      return localStorage.getItem(KUNCI_DETAIL) === "full";
    } catch {
      return false;
    }
  });
  const full = bisa.full && lengkap;

  useEffect(() => {
    const on = () => setTab(bacaTab(TABS));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, [TABS]);

  const poll = usePoll(
    async () => {
      const d = await getJson<{ ok: boolean } & Detail>(`/api/server/${id}`);
      if (!d.ok) throw new Error("gone");
      return d as Detail;
    },
    60_000,
    true,
    ["server"],
  );
  const data = poll.data;
  // Each beat lands as it comes (the gauges, services, the age), Phase 12.
  useDenyutLangsung(
    true,
    (d) => {
      if (d.serverId !== id) return;
      poll.ubah((x) => ({
        ...x,
        denyutTerakhir: d.denyut,
        server: d.kondisi
          ? { ...x.server, kondisi: d.kondisi, kondisiPada: d.kondisiPada ?? null }
          : x.server,
      }));
    },
    poll.refresh,
  );
  // The next open command to run out, and the Konsol request or console
  // to end: each is a moment the page asks again by itself.
  const habis = useMemo(() => {
    const t = (data?.perintah ?? []).map(perintahHabisPada).filter((x): x is number => x !== null);
    return t.length ? Math.min(...t) : null;
  }, [data?.perintah]);
  useBatas(habis, ["server"]);
  // Phase 9 Stage 9: Konsol Pi's state, for the tab and the banner.
  const konsol = usePoll(
    async () => {
      const d = await getJson<KonsolData | { ok: false }>(`/api/server/${id}?aksi=konsol`);
      if (!d.ok) throw new Error("konsol");
      return { d: d as KonsolData, pada: Date.now() };
    },
    60_000,
    true,
    ["server"],
  );
  const kd = konsol.data?.d ?? null;
  useBatas(konsolBerakhirPada(kd, konsol.data?.pada ?? null), ["server"]);
  const dir = useDirektori();
  const siapa = (n: string | null) => (n ? dir.nama(n) : "");

  useEffect(() => {
    if (poll.errors >= 3 && !data) {
      window.Toast?.show(t.notFound, "danger");
      onBack();
    }
  }, [poll.errors, data, onBack, t.notFound]);

  function go(next: Tab) {
    setTab(next);
    history.replaceState(null, "", `#${next}`);
  }

  function setDetail(v: string) {
    if (!bisa.full || !v) return;
    setLengkap(v === "full");
    try {
      localStorage.setItem(KUNCI_DETAIL, v);
    } catch {
      /* private mode: the switch still works for this visit */
    }
  }

  if (!data) {
    return (
      <div className="stack stack--lg" aria-busy="true">
        <span className="skeleton" style={{ height: 120 }} />
        <span className="skeleton" style={{ height: 360 }} />
      </div>
    );
  }

  const s = data.server;
  const hb = data.denyutTerakhir;
  const st = !s.terdaftar ? "wait" : isOnline(hb, data.batasLuringDetik) ? "on" : "off";

  const sh = SH[lang];
  const protokol =
    typeof s.infoSistem?.protokol === "number" ? String(s.infoSistem.protokol) : null;
  const bundel = bacaBundel(s.agenVersi).aso?.slice(0, 7) ?? null;
  // The glance row: services, the last Ready check, site updates, the clock.
  const layanan = Object.values(hb?.layanan ?? {});
  const svcGagal = layanan.filter((x) => svcTone(x) === "bad").length;
  const svcSehat = layanan.filter((x) => svcTone(x) === "ok").length;
  const siap = bacaHasilSiap(data.siapRiwayat[0]?.keluaran);
  const perlu = barisPembaruan(s.infoSistem, s.agenVersi, data.situsIot, data.bundelTerbit).filter(
    (b) => b.status === "perlu",
  ).length;
  const jam = bacaKondisi(s.kondisi)?.jamSelisihMs ?? null;
  const glance: ["ok" | "warn" | "bad", string][] = [
    svcGagal
      ? ["bad", sh.svcBad(svcGagal)]
      : layanan.length
        ? ["ok", sh.svcOk(svcSehat)]
        : ["warn", sh.svcNone],
    !siap
      ? ["warn", sh.readyNone]
      : siap.lulus
        ? ["ok", data.sesiModul ? sh.readyOk(modulLabel(data.sesiModul, lang)) : sh.readyAll]
        : ["warn", sh.readyFail(siap.gagal)],
    [perlu ? "warn" : "ok", sh.upd(perlu)],
    ...(jam !== null || hb
      ? [
          (hb?.jamSelaras === false || (jam !== null && Math.abs(jam) >= 60_000)
            ? ["warn", sh.clockBad(selisih(jam ?? 0, lang))]
            : ["ok", sh.clockOk(jam !== null ? selisih(jam, lang) : "< 1 s")]) as [
            "ok" | "warn",
            string,
          ],
        ]
      : []),
  ];

  // Location, LAN address, uptime and the person in charge in one row; the
  // notes, often long, on their own row below (2026-10-09, 2026-10-12).
  const loc = [
    { k: "lokasi", ic: MapPinIcon, l: t.location, v: s.lokasi, mono: false },
    { k: "lan", ic: PlugsConnectedIcon, l: t.lan, v: s.alamatLan, mono: true },
    {
      k: "uptime",
      ic: ClockIcon,
      l: sh.upSince,
      v: hb?.uptimeSec ? durasiLabel(Math.floor(hb.uptimeSec / 60), lang) : null,
      mono: false,
    },
    { k: "pj", ic: IdentificationBadgeIcon, l: t.pic, v: s.penanggungJawab, mono: false },
    { k: "catatan", ic: NoteIcon, l: t.notes, v: s.catatan, mono: false },
  ];
  // Filled facts show; the empty ones are named once, with where to fill them.
  const isi = loc.filter((x) => x.v);
  const kosong = loc.filter((x) => !x.v && x.k !== "uptime");
  // The short facts (all but the notes) share one row on a wide screen.
  const pendek = isi.filter((x) => x.k !== "catatan").length;
  const s12 = S12[lang];

  const sw = (
    <ToggleGroup.Root
      type="single"
      className="segmented"
      value={full ? "full" : "min"}
      onValueChange={setDetail}
      aria-label={t.detail}
    >
      <ToggleGroup.Item className="segmented__item" value="min">
        <ListBulletsIcon size={17} aria-hidden="true" />
        {t.compact}
      </ToggleGroup.Item>
      <ToggleGroup.Item
        className="segmented__item"
        value="full"
        aria-disabled={!bisa.full || undefined}
      >
        {bisa.full ? (
          <TerminalWindowIcon size={17} aria-hidden="true" />
        ) : (
          <LockSimpleIcon size={17} aria-hidden="true" />
        )}
        {t.full}
      </ToggleGroup.Item>
    </ToggleGroup.Root>
  );

  return (
    <div className="srv srv--detail">
      <OfflineBanner
        errors={poll.ditolak ? 0 : poll.errors}
        text={t.offlineBanner}
        retry={poll.refresh}
        retryLabel={t.retry}
      />
      <div className="stack">
        {kd?.aktif && kd.aktif.oleh !== bisa.nim && (
          <KonsolBanner
            lang={lang}
            row={kd.aktif}
            dibaca={konsol.data?.pada ?? 0}
            bisaPutus={bisa.putus}
            refresh={konsol.refresh}
            onJoin={tab === "konsol" ? undefined : () => go("konsol")}
          />
        )}
        <BackButton lang={lang} label={t.back} href={href(lang, "/servers")} onClick={onBack} />
        <section className="panel panel--key panel--raised s12hero">
          <div className="s12hero__top">
            <div className="srv12ring" data-off={st === "on" ? "no" : "yes"} aria-hidden="true">
              <span className="srv12ring__dot" />
              <b className="mono">{st === "on" ? sh.up : st === "off" ? sh.off : sh.neu}</b>
              <span className="hint">
                {st === "wait" ? <Nil dot /> : umurPendek(hb?.pada, now, sh)}
              </span>
            </div>
            <div className="s12hero__id">
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <span className="stchip" data-st={st}>
                  <span
                    className={`dot ${st === "on" ? "dot--ok dot--pulse" : st === "off" ? "dot--danger" : "dot--warn"}`}
                    aria-hidden="true"
                  />
                  {st === "on" ? t.online : st === "off" ? t.offline : t.waiting}
                </span>
                <Pill>{sh.num(s.id)}</Pill>
                {st === "on" && data.sesiModul && (
                  <Pill tone="accent">{sh.inUse(modulLabel(data.sesiModul, lang))}</Pill>
                )}
              </div>
              <h1 className="page-header__title s12hero__name">{s.nama}</h1>
              {(st === "wait" || protokol || bundel) && (
                <span className="hint">
                  {st === "wait" ? sh.subWait : sh.sub(protokol ?? nil(lang), bundel ?? nil(lang))}
                </span>
              )}
            </div>
            <div className="detailsw s12hero__side">
              {bisa.full ? (
                sw
              ) : (
                <Tooltip label={t.fullLocked}>
                  <span tabIndex={0}>{sw}</span>
                </Tooltip>
              )}
              {!bisa.full && <span className="hint">{t.fullLocked}</span>}
            </div>
          </div>
          <div
            className="locstrip s12facts"
            data-ganjil={pendek % 2 ? "yes" : undefined}
            style={{ "--n": Math.max(1, pendek) } as CSSProperties}
          >
            {isi.map((x) => (
              <span key={x.k} className="locstrip__i" data-k={x.k}>
                <x.ic size={20} aria-hidden="true" />
                <span>
                  <small>{x.l}</small>
                  <b className={x.mono ? "mono" : undefined}>{x.v}</b>
                </span>
              </span>
            ))}
            {kosong.length > 0 && (
              <span className="locstrip__i s12facts__empty">
                <NoteIcon size={20} aria-hidden="true" />
                <span className="hint">
                  {s12.factsEmpty(
                    daftar(
                      kosong.map((x) => x.l),
                      lang,
                    ),
                  )}
                </span>
                {bisa.full && (
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    onClick={() => go("pengaturan")}
                  >
                    {s12.factsFill}
                  </button>
                )}
              </span>
            )}
          </div>
          {st !== "wait" && (
            <div className="s12glance">
              {glance.map(([tone, text]) => (
                <span key={text} className="s12glance__i" data-t={tone}>
                  <span
                    className={`dot dot--${tone === "ok" ? "ok" : tone === "bad" ? "danger" : "warn"}`}
                    aria-hidden="true"
                  />
                  {text}
                </span>
              ))}
              <span className="grow" />
              <button type="button" className="btn btn--primary" onClick={() => go("siap")}>
                <ListChecksIcon size={18} aria-hidden="true" />
                {sh.runReady}
              </button>
              {bisa.konsol && (
                <button type="button" className="btn" onClick={() => go("konsol")}>
                  <TerminalWindowIcon size={18} aria-hidden="true" />
                  {sh.konsol}
                </button>
              )}
            </div>
          )}
        </section>
        {st === "wait" && bisa.full && (
          <div className="banner banner--warn srv-setupban">
            <PlugsConnectedIcon size={20} aria-hidden="true" />
            <span>{t.setupBanner}</span>
            <button type="button" className="btn btn--sm" onClick={() => setSetup(true)}>
              {t.setupContinue}
            </button>
          </div>
        )}
        {setup && (
          <Enroll
            lang={lang}
            server={{ id: s.id, kode: s.kode, nama: s.nama }}
            onClose={() => {
              setSetup(false);
              poll.refresh();
            }}
          />
        )}
        <div className="tabs-scroll">
          <nav className="tabs" role="tablist" aria-label={t.tabsLabel}>
            {TABS.map((k, i) => (
              <button
                key={k}
                type="button"
                role="tab"
                className="tabs__tab"
                aria-selected={tab === k}
                tabIndex={tab === k ? 0 : -1}
                onClick={() => go(k)}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                  const n =
                    TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
                  go(n);
                  const list = e.currentTarget.parentElement;
                  requestAnimationFrame(() =>
                    (list?.querySelector('[aria-selected="true"]') as HTMLElement | null)?.focus(),
                  );
                }}
              >
                {t.tabs[k]}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <Fade k={tab}>
        {tab === "ringkasan" && (
          <Overview
            lang={lang}
            id={id}
            data={data}
            refresh={poll.refresh}
            bisa={bisa}
            full={full}
            siapa={siapa}
            autoCmd={autoCmd}
            onAutoCmd={() => setAutoCmd(false)}
            onJournal={() => go("pengaturan")}
            onTab={go}
          />
        )}
        {tab === "siap" && (
          <Ready
            lang={lang}
            id={id}
            data={data}
            refresh={poll.refresh}
            bisa={bisa}
            siapa={siapa}
            dari={dari}
          />
        )}
        {tab === "konsol" && bisa.konsol && (
          <KonsolPi
            lang={lang}
            serverId={id}
            serverNama={s.nama}
            data={kd}
            dibaca={konsol.data?.pada ?? 0}
            refresh={konsol.refresh}
            badges={bisa.badges}
            admin={bisa.admin}
            onOverview={() => go("ringkasan")}
          />
        )}
        {tab === "pengaturan" && (
          <Settings
            lang={lang}
            id={id}
            data={data}
            refresh={poll.refresh}
            bisa={bisa}
            full={full}
            onDeleted={onBack}
            onCommands={() => {
              setAutoCmd(true);
              go("ringkasan");
            }}
          />
        )}
      </Fade>
    </div>
  );
}
