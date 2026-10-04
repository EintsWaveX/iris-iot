/**
 * One server (Phase 9 Stage 5, mockup v-over/v-ready/v-settings head): the
 * back link, the name with its status chip, the Compact/Full switch (Full
 * only with the full right, remembered in this browser), the location strip
 * and the tab line. The detail is polled every 6 s and handed to the tab.
 */
import { useEffect, useMemo, useState } from "react";
import {
  HeartbeatIcon,
  ListBulletsIcon,
  LockSimpleIcon,
  MapPinIcon,
  NoteIcon,
  PlugsConnectedIcon,
  TerminalWindowIcon,
} from "@phosphor-icons/react";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import "../ui/SegmentedControl.css";
import "../ui/Tabs.css";
import BackButton from "../ui/BackButton";
import Fade from "../ui/Fade";
import Tooltip from "../ui/Tooltip";
import { OfflineBanner } from "../ui/Display";
import { usePoll } from "../../lib/hooks";
import { getJson, href, sejak, useTick } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import { useDirektori } from "../../lib/people";
import { isOnline, type Bisa, type Detail } from "./data";
import Overview from "./Overview";
import Ready from "./Ready";
import Settings from "./Settings";
import KonsolPi, { KonsolBanner } from "./konsol/KonsolPi";
import type { KonsolData } from "./konsol/data";
import { S } from "./strings";

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
}: {
  lang: Lang;
  id: number;
  bisa: Bisa;
  onBack: () => void;
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

  const poll = usePoll(async () => {
    const d = await getJson<{ ok: boolean } & Detail>(`/api/server/${id}`);
    if (!d.ok) throw new Error("gone");
    return d as Detail;
  }, 6_000);
  const data = poll.data;
  // Phase 9 Stage 9: Konsol Pi's state, for the tab and the banner.
  const konsol = usePoll(async () => {
    const d = await getJson<KonsolData | { ok: false }>(`/api/server/${id}?aksi=konsol`);
    if (!d.ok) throw new Error("konsol");
    return { d: d as KonsolData, pada: Date.now() };
  }, 4_000);
  const kd = konsol.data?.d ?? null;
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

  const loc = [
    { ic: MapPinIcon, l: t.location, v: s.lokasi, mono: false },
    { ic: NoteIcon, l: t.notes, v: s.catatan, mono: false },
    { ic: PlugsConnectedIcon, l: t.lan, v: s.alamatLan, mono: true },
    { ic: HeartbeatIcon, l: t.lastBeat, v: hb ? sejak(hb.pada, lang, now) : null, mono: false },
  ];

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
    <div className="srv">
      <OfflineBanner
        errors={poll.errors}
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
          />
        )}
        <BackButton lang={lang} label={t.back} href={href(lang, "/servers")} onClick={onBack} />
        <div className="srv-head__row">
          <div className="srv-head__name">
            <h1 className="page-header__title">{s.nama}</h1>
            <span className="stchip" data-st={st}>
              <span
                className={`dot ${st === "on" ? "dot--ok dot--pulse" : st === "off" ? "dot--danger" : "dot--warn"}`}
                aria-hidden="true"
              />
              {st === "on" ? t.online : st === "off" ? t.offline : t.waiting}
            </span>
          </div>
          <div className="detailsw">
            {bisa.full ? (
              sw
            ) : (
              <Tooltip label={t.fullLocked}>
                <span tabIndex={0}>{sw}</span>
              </Tooltip>
            )}
          </div>
        </div>
        <div className="locstrip">
          {loc.map((x) => (
            <span key={x.l} className="locstrip__i">
              <x.ic size={20} aria-hidden="true" />
              <span>
                <small>{x.l}</small>
                <b className={`${x.mono ? "mono" : ""}${x.v ? "" : " is-empty"}`}>
                  {x.v || t.none}
                </b>
              </span>
            </span>
          ))}
        </div>
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
          />
        )}
        {tab === "siap" && (
          <Ready lang={lang} id={id} data={data} refresh={poll.refresh} bisa={bisa} siapa={siapa} />
        )}
        {tab === "konsol" && bisa.konsol && (
          <KonsolPi
            lang={lang}
            serverId={id}
            serverNama={s.nama}
            data={kd}
            dibaca={konsol.data?.pada ?? 0}
            refresh={konsol.refresh}
            pencipta={bisa.pencipta}
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
