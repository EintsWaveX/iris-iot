/**
 * The assistant console (P8.1), /session and /en/session. Replaces the
 * nine-tab SessionConsole with two modes:
 *
 * - no session: Asisten home (schedule, start form, my feedback), with
 *   Persiapan reachable before anything starts
 * - a running session (Phase 9 mockup c-run): the session bar band, then
 *   Persiapan | Papan | Tabel Nilai with "Kamu: Full Name (CODE)" and the
 *   tier on the right. Papan is the group list beside the inspector of one
 *   group (stacked under 1024; picking a row scrolls to it). A group is
 *   always open: the picked one, else my first, else the first.
 * - just ended: "Sesi selesai" with the feedback QR
 *
 * Keys: 1 to 9 and 0 (Group 10) pick a group; the Ctrl+K palette
 * (AsistenCommands) talks to this component through `iris:console` events
 * or the URL hash.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { namaAsisten } from "../../lib/people";
import BackButton from "../ui/BackButton";
import Fade from "../ui/Fade";
import { shortcutsOn } from "../../lib/prefs";
import { ShieldWarningIcon, WarningIcon } from "@phosphor-icons/react";
import { OfflineBanner, StateView } from "../ui/Display";
import { isTypingTarget } from "../ui/ShortcutSheet";
import { getJson, href, menitBerjalan, useMe, useTick } from "../../lib/app";
import { durasiSesi } from "../../lib/jadwal";
import {
  blankMacet,
  Counters,
  Feed,
  feedRows,
  kolomDari,
  Matrix,
  Rail,
  SessionTrack,
  useMatriks,
  type GoTo,
  type WorkTab,
} from "./RunBoard";
import HelpDrawer, { adaMasalah } from "./HelpDrawer";
import { R } from "./runStrings";
import "./run.css";
import { masukProyektor } from "../../lib/proyektor";
import { useMinWidth } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import { kelompokLabel } from "../../lib/labels";
import { CONSOLE_EVENT, type ConsoleCommand } from "../shell/AsistenCommands";
import { S } from "./strings";
import { useAssignment, useCurrent, useLaporan, useNilaiLive, useServers } from "./data";
import SessionBar from "./SessionBar";
import ViewAsDialog from "./ViewAsDialog";
import TierBadge from "../ui/TierBadge";
import GroupInspector from "./GroupInspector";
import NilaiTable from "./NilaiTable";
import PrepView, { type PrepTab } from "./PrepView";
import { prepHref } from "./PreparationPage";
import LivePrep from "./LivePrep";
import ServerDrawer from "./ServerDrawer";
import EndFlow from "./EndFlow";
import EndPage from "./EndPage";
import NextView from "./NextView";
import AsistenHome from "./AsistenHome";
import SeelabsView, { type SeelabsTab } from "./seelabs/SeelabsView";
import { useSeelabs } from "./seelabs/data";
import { SL } from "./seelabs/strings";
import type { AsistenRef, SesiRunning, View } from "./types";
import "./console.css";
import "../ui/Tabs.css";
import { openSignIn } from "../../lib/signin";
import { hakPenuh } from "../../lib/hak";

const DONE_KEY = "iris-console-done";

function readDone(): (SesiRunning & { hadir: number }) | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(DONE_KEY) || "null");
    return v && typeof v.id === "number" ? v : null;
  } catch {
    return null;
  }
}

function readHash(): {
  view?: View;
  group?: number;
  cmd?: string;
  seelabs?: boolean;
  seelabsTab?: SeelabsTab;
  tot?: boolean;
  prep?: PrepTab;
} {
  const h = location.hash.replace(/^#/, "");
  // #persiapan (or #persiapan=akses) and #tot: older links to Preparation
  // and Mode TOT, which have their own pages since 2026-10-12.
  const pr = /^persiapan(?:=(roster|akses|brief|kode|slides|skema|server))?$/.exec(h);
  if (pr) return { prep: (pr[1] as PrepTab | undefined) ?? "roster" };
  if (h === "tot") return { tot: true };
  if (h === "prep" || h === "board" || h === "table" || h === "matrix") return { view: h };
  if (h === "seelabs") return { seelabs: true };
  // #seelabs=pasang (the Account page's "Cara Pakai") opens one tab.
  const st = /^seelabs=(panduan|salin|pasang|cara|tidak|titipan)$/.exec(h);
  if (st) return { seelabs: true, seelabsTab: st[1] as SeelabsTab };
  const g = /^k([1-9]|10)$/.exec(h);
  if (g) return { view: "board", group: Number(g[1]) };
  const c = /^cmd=(\w+)$/.exec(h);
  if (c) return { cmd: c[1] };
  return {};
}

// Phase 10 (c12-run): Papan, Matriks Blank, Tabel Nilai, Persiapan.
const VIEWS = ["board", "matrix", "table", "prep"] as const;

export default function Console({ lang }: { lang: Lang }) {
  const t = S[lang];
  const me = useMe();
  const isAsisten = me?.role === "asisten";
  const current = useCurrent(isAsisten);
  const sesi = isAsisten ? (current.data?.sesi ?? null) : null;
  const roster = current.data?.roster ?? [];
  const [view, setView] = useState<View>("board");
  // In a running session Preparation is the live view; its Module Access
  // and Slides buttons open the full tabs, with a way back.
  const [prepFull, setPrepFull] = useState<PrepTab | null>(null);
  const [done, setDone] = useState<(SesiRunning & { hadir: number; selesaiPada?: string }) | null>(
    null,
  );
  const [nextOpen, setNextOpen] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [announce, setAnnounce] = useState(false);
  const [asP, setAsP] = useState<number | null>(null);
  const wide = useMinWidth(1024);
  const [doneTable, setDoneTable] = useState(false);
  // Phase 10 (c11-home): an ended session's Score Table or Kirim ke SeeLabs,
  // opened from the Konsol home's launch panel or inbox.
  // Phase 13: Penilaian opens a past session's table or SeeLabs page here
  // with ?tabel=ID or ?seelabs=ID.
  const [lalu, setLalu] = useState<{ id: number; view: "table" | "seelabs" } | null>(() => {
    if (typeof location === "undefined") return null;
    const q = new URLSearchParams(location.search);
    const id = Number(q.get("tabel") ?? q.get("seelabs"));
    return Number.isInteger(id) && id > 0
      ? { id, view: q.has("seelabs") ? "seelabs" : "table" }
      : null;
  });
  // Kirim ke SeeLabs, over whatever view is open (Phase 9 Stage 3g).
  const [see, setSee] = useState<{ tab?: SeelabsTab; nomor?: number | null } | null>(null);
  // Phase 10 (c12-run): the workspace tab, a blank to bring into view, the
  // shared Show the Keys switch, Ada Masalah? and the class matrix.
  const [tab, setTab] = useState<WorkTab>("ringkasan");
  const [fokus, setFokus] = useState<string | null>(null);
  const [kunci, setKunci] = useState(false);
  const [help, setHelp] = useState(false);
  const rs = R[lang];
  const now = useTick(15_000);

  const lap = useLaporan(!!sesi, sesi?.id ?? null);
  const assign = useAssignment(sesi?.id ?? lalu?.id ?? done?.id ?? null);
  const seelabs = useSeelabs(sesi?.id ?? done?.id ?? null);
  const servers = useServers(!!sesi, drawer || help);
  const mtx = useMatriks(!!sesi, lang, sesi?.id ?? null);
  const kolom = useMemo(() => kolomDari(mtx.data ?? null), [mtx.data]);
  const asisten = useMemo(
    () => new Map<string, AsistenRef>((assign.data?.asisten ?? []).map((a) => [a.nim, a])),
    [assign.data],
  );
  const namaOf = useCallback(
    (nim: string | null) => (nim ? namaAsisten(asisten.get(nim), nim) : "?"),
    [asisten],
  );

  const nilai = useNilaiLive(
    sesi?.id ?? (lalu?.view === "table" ? lalu.id : null) ?? done?.id ?? null,
    me?.nim,
  );
  const seelabsLalu = useSeelabs(lalu?.view === "seelabs" ? lalu.id : null);

  // Restore the done screen after a reload.
  useEffect(() => setDone(readDone()), []);

  // Ended elsewhere (another tab, device or Asisten): the closed screen, as
  // after this Console's own Akhiri, not a jump to Home mid-scoring
  // (2026-10-07). A cancelled session (batal) just goes back to Home.
  const tadi = useRef<{ s: SesiRunning; hadir: number } | null>(null);
  useEffect(() => {
    if (sesi) {
      const hadir = (lap.data?.kelompok ?? []).reduce((n, g) => n + (g.hadir ?? 0), 0);
      tadi.current = { s: sesi, hadir };
      return;
    }
    const lama = tadi.current;
    tadi.current = null;
    if (!lama || readDone()?.id === lama.s.id) return;
    void getJson<{ ok: boolean; sesi?: { status?: string; selesaiPada?: string | null } | null }>(
      `/api/session/laporan?sesiId=${lama.s.id}`,
    )
      .then((d) => {
        if (d.ok && d.sesi?.status === "batal") window.Toast?.show(t.cancelledElsewhere, "warn");
        if (!d.ok || d.sesi?.status !== "selesai") return;
        const snap = {
          ...lama.s,
          hadir: lama.hadir,
          selesaiPada: d.sesi.selesaiPada ?? new Date().toISOString(),
        };
        try {
          sessionStorage.setItem(DONE_KEY, JSON.stringify(snap));
        } catch {
          /* ignore */
        }
        setDone(snap);
        window.Toast?.show(t.endedElsewhere, "warn");
      })
      .catch(() => {});
  }, [sesi?.id, lap.data]);

  // Hash routing (views, #k3, #cmd=announce from the palette elsewhere).
  useEffect(() => {
    const apply = () => {
      const h = readHash();
      if (h.view) setView(h.view);
      if (h.group) setSel(h.group);
      if (h.cmd === "announce") setAnnounce(true);
      if (h.cmd === "drawer") setDrawer(true);
      if (h.cmd === "end") setEndOpen(true);
      if (h.seelabs) setSee(h.seelabsTab ? { tab: h.seelabsTab } : {});
      if (h.prep) location.replace(prepHref(lang, null, h.prep));
      if (h.tot) location.replace(href(lang, "/tot"));
    };
    apply();
    // A link to this page's own #... (the Mode TOT banner, the readiness
    // chips) did nothing here: the site router moves the address with
    // pushState, which fires no hashchange (2026-10-07). Apply it directly.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement) || a.target || !a.hash) return;
      const u = new URL(a.href);
      if (u.origin !== location.origin || u.pathname !== location.pathname) return;
      e.preventDefault();
      history.pushState(null, "", u.pathname + u.search + u.hash);
      apply();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("hashchange", apply);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("hashchange", apply);
    };
  }, []);

  const go = useCallback((v: View) => {
    setView(v);
    history.replaceState(null, "", `#${v}`);
  }, []);

  const pick = useCallback((id: number | null) => {
    setSel(id);
    if (id !== null) {
      setView("board");
      history.replaceState(null, "", `#k${id}`);
    } else history.replaceState(null, "", "#board");
  }, []);

  // Where a counter, the feed or the matrix leads: a view, a group, its
  // tab and one blank.
  const goTo = useCallback(
    (o: GoTo) => {
      if (o.g !== undefined) pick(o.g);
      if (o.view && o.view !== "board") go(o.view);
      else if (o.g === undefined) go("board");
      if (o.tab) setTab(o.tab);
      setFokus(o.b ?? null);
      if (o.g !== undefined)
        requestAnimationFrame(() =>
          document
            .querySelector(".kboard .work")
            ?.scrollIntoView({ behavior: "smooth", block: "start" }),
        );
    },
    [go, pick],
  );

  // Palette commands.
  useEffect(() => {
    const on = (e: Event) => {
      const c = (e as CustomEvent<ConsoleCommand>).detail;
      if (c.type === "group") pick(c.n);
      else if (c.type === "announce") setAnnounce(true);
      else if (c.type === "drawer") setDrawer(true);
      else if (c.type === "end") setEndOpen(true);
      else if (c.type === "view") go(c.view);
    };
    window.addEventListener(CONSOLE_EVENT, on);
    return () => window.removeEventListener(CONSOLE_EVENT, on);
  }, [go, pick]);

  // Keys 1-9, 0 for Group 10, and Esc.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!sesi || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      if (document.querySelector("[role=dialog]")) return;
      if (/^[0-9]$/.test(e.key) && shortcutsOn()) {
        const nomor = e.key === "0" ? 10 : Number(e.key);
        const g = lap.data?.kelompok.find((k) => k.nomor === nomor);
        if (g) {
          e.preventDefault();
          pick(g.id);
        }
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [sesi, lap.data, pick]);

  // A raised hand reaches me wherever I am in the console (2026-10-06:
  // it only marked the group on Papan, unseen from Persiapan or Tabel
  // Nilai): my groups and groups nobody holds, once per raise.
  const tanganLalu = useRef<Set<string> | null>(null);
  useEffect(() => {
    const L = lap.data;
    if (!L) return;
    const kini = new Set(Object.keys(L.tangan ?? {}));
    const lalu = tanganLalu.current;
    tanganLalu.current = kini;
    if (!lalu) return;
    for (const id of kini) {
      if (lalu.has(id)) continue;
      const g = L.kelompok.find((k) => String(k.id) === id);
      const pemegang = L.pemilik?.[g?.id ?? -1] ?? null;
      if (!g || (pemegang && pemegang !== me?.nim)) continue;
      window.Toast?.show(t.handToast(kelompokLabel(g.nomor, lang)), "warn", {
        duration: 15_000,
        action: { label: t.handLook, onClick: () => pick(g.id) },
      });
    }
  }, [lap.data]);

  // The sky follows the session (the "sesi" scene is deliberately calm).
  const inSesiScene = useRef(false);
  useEffect(() => {
    if (sesi) {
      window.Cosmos?.setModuleTint(sesi.modul);
      if (!inSesiScene.current) {
        inSesiScene.current = true;
        window.Cosmos?.setScene("sesi");
      }
    } else if (inSesiScene.current) {
      inSesiScene.current = false;
      window.Cosmos?.setScene("kerja");
      window.Cosmos?.setModuleTint(0);
    }
  }, [sesi]);

  // Tell the whole page when this island's view of the session changes.
  const refreshAll = useCallback(() => {
    current.refresh();
    lap.refresh();
    assign.refresh();
    seelabs.refresh();
  }, [current, lap, assign, seelabs]);

  const openSeelabs = useCallback((tab?: SeelabsTab, nomor?: number | null) => {
    setSee({ tab, nomor });
    history.replaceState(null, "", "#seelabs");
    window.scrollTo({ top: 0 });
  }, []);
  const closeSeelabs = useCallback(() => {
    setSee(null);
    seelabs.refresh();
    history.replaceState(null, "", location.pathname + location.search);
  }, [seelabs]);

  /* ------------------------------------------------------------ render */

  if (me === undefined || (isAsisten && current.data === null && current.errors < 2)) {
    return (
      <div className="console-loading" aria-busy="true">
        <span className="skeleton" style={{ height: 96 }} />
        <div className="console-loading__row">
          <span className="skeleton" style={{ height: 420 }} />
          <span className="skeleton" style={{ height: 420 }} />
        </div>
        <span className="visually-hidden">{t.loading}</span>
      </div>
    );
  }

  if (!isAsisten) {
    return (
      <StateView
        icon={<ShieldWarningIcon size={28} />}
        title={t.forbidden}
        body={t.forbiddenBody}
        tone="warn"
        actions={
          me === null ? (
            <button type="button" className="btn btn--primary" onClick={() => openSignIn()}>
              {t.signIn}
            </button>
          ) : undefined
        }
      />
    );
  }

  const offline = (
    <OfflineBanner
      errors={current.ditolak || lap.ditolak ? 0 : Math.max(current.errors, lap.errors)}
      text={t.offline}
      retry={refreshAll}
      retryLabel={t.retry}
    />
  );

  // No running session.
  if (!sesi) {
    if (lalu) {
      const tutupLalu = () => {
        setLalu(null);
        const q = new URLSearchParams(location.search);
        q.delete("tabel");
        q.delete("seelabs");
        history.replaceState(null, "", location.pathname + (q.size ? `?${q}` : ""));
      };
      return (
        <div className="console">
          {offline}
          {lalu.view === "seelabs" ? (
            <SeelabsView
              lang={lang}
              sesiId={lalu.id}
              meNim={me!.nim}
              tab="salin"
              onBack={tutupLalu}
              backLabel={SL[lang].backHome}
              onTable={() => setLalu({ id: lalu.id, view: "table" })}
            />
          ) : (
            <>
              <div className="console__modes">
                <BackButton lang={lang} label={SL[lang].backHome} onClick={tutupLalu} />
              </div>
              <NilaiTable
                t={t}
                lang={lang}
                sesiId={lalu.id}
                nilai={nilai}
                groups={[]}
                asisten={asisten}
                meNim={me!.nim}
                seelabs={seelabsLalu.data}
                onSeelabs={() => setLalu({ id: lalu.id, view: "seelabs" })}
                onSeelabsChanged={seelabsLalu.refresh}
              />
            </>
          )}
        </div>
      );
    }
    if (see) {
      return (
        <div className="console">
          {offline}
          <SeelabsView
            lang={lang}
            sesiId={done?.id ?? null}
            meNim={me!.nim}
            tab={see.tab}
            nomor={see.nomor}
            onBack={closeSeelabs}
            backLabel={done ? undefined : SL[lang].backHome}
            onTable={
              done
                ? () => {
                    closeSeelabs();
                    setDoneTable(true);
                  }
                : undefined
            }
          />
        </div>
      );
    }
    if (done && doneTable) {
      return (
        <div className="console">
          {offline}
          <div className="console__modes">
            <BackButton lang={lang} label={t.back} onClick={() => setDoneTable(false)} />
            <h1 className="console__h">
              {t.doneTitle} · {t.modul(done.modul)}
            </h1>
          </div>
          <NilaiTable
            t={t}
            lang={lang}
            sesiId={done.id}
            nilai={nilai}
            groups={[]}
            asisten={asisten}
            meNim={me!.nim}
            seelabs={seelabs.data}
            onSeelabs={openSeelabs}
            onSeelabsChanged={seelabs.refresh}
          />
        </div>
      );
    }
    if (done && nextOpen) {
      return (
        <div className="console">
          {offline}
          <NextView
            t={t}
            lang={lang}
            sesi={done}
            seelabs={seelabs.data}
            onSeelabs={() => openSeelabs("salin")}
            onBack={() => setNextOpen(false)}
            onPrep={(pilih) => {
              sessionStorage.removeItem(DONE_KEY);
              location.assign(prepHref(lang, pilih));
            }}
            onHome={() => {
              sessionStorage.removeItem(DONE_KEY);
              setNextOpen(false);
              setDone(null);
            }}
          />
        </div>
      );
    }
    if (done) {
      return (
        <div className="console">
          {offline}
          <EndPage
            t={t}
            lang={lang}
            sesi={done}
            hadir={done.hadir}
            seelabs={seelabs.data}
            nilai={nilai}
            asisten={asisten}
            meNim={me!.nim}
            onSeelabs={(tab) => openSeelabs(tab ?? "salin")}
            onScores={() => setDoneTable(true)}
            onNext={() => setNextOpen(true)}
            onResumed={() => {
              sessionStorage.removeItem(DONE_KEY);
              setDone(null);
              refreshAll();
            }}
            onNew={() => {
              sessionStorage.removeItem(DONE_KEY);
              setDone(null);
            }}
          />
        </div>
      );
    }
    return (
      <div className="console">
        {offline}
        <AsistenHome
          t={t}
          lang={lang}
          me={me!}
          onStarted={refreshAll}
          onPrep={(pilih, tab) => location.assign(prepHref(lang, pilih, tab))}
          onHeld={() => openSeelabs("titipan")}
          onTable={(id) => {
            setLalu({ id, view: "table" });
            window.scrollTo({ top: 0 });
          }}
          onSeelabsSesi={(id) => {
            setLalu({ id, view: "seelabs" });
            window.scrollTo({ top: 0 });
          }}
        />
      </div>
    );
  }

  const L = lap.data;
  const groups = L?.kelompok ?? [];
  const stuck = L?.stuck ?? [];
  const tangan = L?.tangan ?? {};
  const pemilik = L?.pemilik ?? {};
  // The workspace always shows a group (mockup c-run): the picked one, else
  // the first group I hold, else the first group.
  // Projector mode shows the first group I hold (ruled 2026-10-04).
  const milikku = groups.find((g) => pemilik[g.id] === me?.nim) ?? null;
  const selGroup =
    groups.find((g) => g.id === sel) ??
    groups.find((g) => pemilik[g.id] === me?.nim) ??
    groups[0] ??
    null;
  const durasi = durasiSesi(sesi);
  const sisa = Math.max(0, durasi - menitBerjalan(sesi.mulaiPada, now));
  const kode = [
    ...new Set(
      Object.values(pemilik)
        .map((nim) => asisten.get(nim)?.kode?.toUpperCase())
        .filter((x): x is string => !!x),
    ),
  ];
  const meKode = (me?.kode ?? "").toUpperCase();
  const announceOk = sesi.kendali !== false;

  if (see) {
    return (
      <div className="console" style={{ "--mod-hue": `var(--mod-${sesi.modul})` } as CSSProperties}>
        {offline}
        <SeelabsView
          lang={lang}
          sesiId={sesi.id}
          meNim={me!.nim}
          tab={see.tab}
          nomor={see.nomor}
          onBack={closeSeelabs}
          onTable={() => {
            closeSeelabs();
            go("table");
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="console krun"
      style={{ "--mod-hue": `var(--mod-${sesi.modul})` } as CSSProperties}
    >
      {offline}
      <SessionBar
        t={t}
        lang={lang}
        sesi={sesi}
        servers={servers.data}
        onDrawer={() => {
          // One lab Pi and no session server picked: go straight to it.
          const list = servers.data?.list ?? [];
          if (!servers.data?.detail && list.length === 1)
            location.assign(href(lang, `/servers?id=${list[0].id}`));
          else setDrawer(true);
        }}
        onEnd={() => setEndOpen(true)}
        onView={go}
        onChanged={refreshAll}
        onProjector={
          milikku
            ? () => {
                masukProyektor(milikku.nomor);
                location.assign(href(lang, "/dashboard"));
              }
            : undefined
        }
        announceOpen={announce && announceOk}
        setAnnounceOpen={setAnnounce}
        track={
          <SessionTrack
            sesi={sesi}
            durasi={durasi}
            groups={groups}
            tangan={tangan}
            mtx={mtx.data}
            now={now}
            lang={lang}
          />
        }
        codes={
          kode.length > 0 && (
            <span className="day__codes" style={{ display: "inline-flex", gap: 4 }}>
              {kode.map((k) => (
                <span key={k} className={`acode${k === meKode ? " acode--me" : ""}`}>
                  {k}
                </span>
              ))}
            </span>
          )
        }
        onSeelabs={() => openSeelabs()}
        onHelp={() => setHelp(true)}
        helpWarn={adaMasalah(servers.data, groups)}
      />

      <Counters
        groups={groups}
        stuck={stuck}
        tangan={tangan}
        mtx={mtx.data}
        kolom={kolom}
        nilai={nilai}
        go={goTo}
        lang={lang}
      />

      {/* The views as the Server page's underline tabs, sharing the full
          width with the rainbow line under the open one (2026-10-09). */}
      <div className="console__modes">
        <span className="console__me">
          <span className="hint">{t.youLabel}:</span>
          <b>{namaOf(me!.nim)}</b>
          {me?.tier && <TierBadge tier={me.tier} lang={lang} />}
        </span>
        <div className="tabs-scroll">
          <nav className="tabs" role="tablist" aria-label={t.viewLabel}>
            {VIEWS.map((v, i) => (
              <button
                key={v}
                type="button"
                role="tab"
                className="tabs__tab"
                aria-selected={view === v}
                tabIndex={view === v ? 0 : -1}
                onClick={() => go(v)}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                  const n =
                    VIEWS[(i + (e.key === "ArrowRight" ? 1 : VIEWS.length - 1)) % VIEWS.length];
                  go(n);
                  const list = e.currentTarget.parentElement;
                  requestAnimationFrame(() =>
                    (list?.querySelector('[aria-selected="true"]') as HTMLElement | null)?.focus(),
                  );
                }}
              >
                {rs.views[v]}
                {v === "board" && Object.keys(tangan).length > 0 && (
                  <span className="pill pill--warn console__hands">
                    {Object.keys(tangan).length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <Fade k={view} className="console__view">
        {view === "prep" &&
          (prepFull ? (
            <div className="stack">
              <BackButton lang={lang} label={t.lp.back} onClick={() => setPrepFull(null)} />
              <PrepView
                key={prepFull}
                t={t}
                lang={lang}
                sesi={sesi}
                roster={roster}
                assign={assign.data}
                meNim={me!.nim}
                meKode={(me!.kode ?? "").toUpperCase()}
                onChanged={refreshAll}
                tab0={prepFull}
              />
            </div>
          ) : (
            <LivePrep
              t={t}
              lang={lang}
              sesi={sesi}
              assign={assign.data}
              meNim={me!.nim}
              onChanged={refreshAll}
              onOpen={setPrepFull}
              hakPenuh={hakPenuh({ tier: me!.tier ?? "asisten", badges: me!.badges ?? [] })}
            />
          ))}

        {view === "table" && (
          <NilaiTable
            t={t}
            lang={lang}
            sesiId={sesi.id}
            nilai={nilai}
            groups={groups}
            asisten={asisten}
            meNim={me!.nim}
            seelabs={seelabs.data}
            onSeelabs={openSeelabs}
            onSeelabsChanged={seelabs.refresh}
          />
        )}

        {view === "matrix" && (
          <Matrix
            groups={groups}
            mtx={mtx.data}
            kolom={kolom}
            showKey={kunci}
            setShowKey={setKunci}
            onAnnounce={announceOk ? () => setAnnounce(true) : undefined}
            go={goTo}
            lang={lang}
          />
        )}

        {/* A session with nobody in it (a susulan started before its roster
            was filled): nobody can sign in, so say so and how to recover. */}
        {view === "board" && lap.data && groups.length === 0 && (
          <div className="banner banner--warn" role="status">
            <WarningIcon size={20} aria-hidden="true" />
            <span>
              <b>{t.emptyRosterH}</b> {t.emptyRosterP}
            </span>
            <button type="button" className="btn btn--inverse" onClick={() => go("prep")}>
              {t.emptyRosterGo}
            </button>
          </div>
        )}
        {view === "board" && (
          <div className="kboard">
            <Rail
              groups={groups}
              stuck={stuck}
              tangan={tangan}
              pemilik={pemilik}
              asisten={asisten}
              meNim={me!.nim}
              mtx={mtx.data}
              kolom={kolom}
              terkirim={nilai.data?.terkirim ?? {}}
              sel={selGroup?.id ?? null}
              onPick={(id) => {
                pick(id);
                setFokus(null);
                if (!wide)
                  requestAnimationFrame(() =>
                    document
                      .querySelector(".kboard .work")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" }),
                  );
              }}
              lang={lang}
            />
            {selGroup ? (
              <GroupInspector
                key={selGroup.id}
                t={t}
                lang={lang}
                sesiId={sesi.id}
                modul={sesi.modul}
                g={selGroup}
                groups={groups}
                stuck={stuck.filter((s) => s.kelompokId === selGroup.id)}
                hand={tangan[selGroup.id] ?? null}
                ownerNim={pemilik[selGroup.id] ?? null}
                asisten={asisten}
                meNim={me!.nim}
                bolehPasang={me?.hak?.pair !== false}
                nilai={nilai}
                onChanged={refreshAll}
                onAsPraktikan={(id) => setAsP(id)}
                seelabs={seelabs.data}
                onSeelabs={openSeelabs}
                onSeelabsChanged={seelabs.refresh}
                tab={tab}
                onTab={(x) => {
                  setTab(x);
                  setFokus(null);
                }}
                mtx={mtx.data}
                kolom={kolom}
                kunci={kunci}
                onKunci={setKunci}
                fokus={fokus}
                onPrep={() => go("prep")}
              />
            ) : (
              <span />
            )}
            <Feed
              rows={feedRows(groups, tangan, mtx.data, kolom, rs)}
              macet={blankMacet(mtx.data, kolom)}
              onAnnounce={announceOk ? () => setAnnounce(true) : undefined}
              go={goTo}
              lang={lang}
            />
          </div>
        )}
      </Fade>

      {asP !== null && (
        <ViewAsDialog
          t={t}
          lang={lang}
          modul={sesi.modul}
          groups={groups}
          pemilik={pemilik}
          asisten={asisten}
          meNim={me!.nim}
          initial={asP}
          onClose={() => setAsP(null)}
        />
      )}

      <ServerDrawer
        t={t}
        lang={lang}
        open={drawer}
        onOpenChange={setDrawer}
        servers={servers.data}
        refresh={servers.refresh}
        asisten={asisten}
      />

      <HelpDrawer
        lang={lang}
        open={help}
        onOpenChange={setHelp}
        sesi={sesi}
        sisa={sisa}
        groups={groups}
        servers={servers.data}
        kunci={kunci}
        onKunci={setKunci}
        onView={go}
        onGroup={(id) => goTo({ g: id, tab: "ringkasan" })}
        onAnnounce={() => setAnnounce(true)}
        onServer={() => setDrawer(true)}
        onSeelabs={(tab) => openSeelabs(tab)}
        onRefresh={refreshAll}
      />

      <EndFlow
        t={t}
        lang={lang}
        open={endOpen && sesi.kendali !== false}
        onOpenChange={setEndOpen}
        sesi={sesi}
        groups={groups}
        stuck={stuck}
        tangan={tangan}
        nilai={nilai.data}
        onJumpGroup={(id) => pick(id)}
        onJumpTable={() => go("table")}
        onMarkAbsent={async (nims) => {
          let ok = 0;
          let gagal = 0;
          for (let i = 0; i < nims.length; i += 4) {
            const hasil = await Promise.all(
              nims.slice(i, i + 4).map((n) => nilai.setAbsen(n, true)),
            );
            ok += hasil.filter((x) => x === "ok").length;
            gagal += hasil.filter((x) => x !== "ok").length;
          }
          window.Toast?.show(t.markedAbsent(ok, gagal), gagal ? "danger" : "ok");
        }}
        onEnded={(kind) => {
          if (kind === "end") {
            const hadir = groups.reduce((a, g) => a + g.hadir, 0);
            const snap = { ...sesi, hadir, selesaiPada: new Date().toISOString() };
            try {
              sessionStorage.setItem(DONE_KEY, JSON.stringify(snap));
            } catch {
              /* ignore */
            }
            setDone(snap);
          }
          refreshAll();
        }}
      />
    </div>
  );
}
