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
import { ShieldWarningIcon, SignInIcon } from "@phosphor-icons/react";
import { OfflineBanner, StateView } from "../ui/Display";
import { isTypingTarget } from "../ui/ShortcutSheet";
import { href, useMe } from "../../lib/app";
import { masukProyektor } from "../../lib/proyektor";
import { useMinWidth } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import { CONSOLE_EVENT, type ConsoleCommand } from "../shell/AsistenCommands";
import { S } from "./strings";
import { useAssignment, useCurrent, useLaporan, useNilaiLive, useServers } from "./data";
import SessionBar from "./SessionBar";
import GroupBoard from "./GroupBoard";
import ViewAsDialog from "./ViewAsDialog";
import TierBadge from "../ui/TierBadge";
import GroupInspector from "./GroupInspector";
import NilaiTable from "./NilaiTable";
import PrepView, { type PrepTab } from "./PrepView";
import LivePrep from "./LivePrep";
import ServerDrawer from "./ServerDrawer";
import EndFlow from "./EndFlow";
import DoneView from "./DoneView";
import NextView from "./NextView";
import AsistenHome from "./AsistenHome";
import SeelabsView, { type SeelabsTab } from "./seelabs/SeelabsView";
import { useSeelabs } from "./seelabs/data";
import { SL } from "./seelabs/strings";
import type { AsistenRef, SesiRunning, View } from "./types";
import "./console.css";
import { openSignIn } from "../../lib/signin";

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
} {
  const h = location.hash.replace(/^#/, "");
  // #tot: Preparation's Mode TOT tab (the TOT banner links here).
  if (h === "tot") return { tot: true };
  if (h === "prep" || h === "board" || h === "table") return { view: h };
  if (h === "seelabs") return { seelabs: true };
  // #seelabs=pasang (the Account page's "Cara Pakai") opens one tab.
  const st = /^seelabs=(salin|pasang|cara|tidak|titipan)$/.exec(h);
  if (st) return { seelabs: true, seelabsTab: st[1] as SeelabsTab };
  const g = /^k([1-9]|10)$/.exec(h);
  if (g) return { view: "board", group: Number(g[1]) };
  const c = /^cmd=(\w+)$/.exec(h);
  if (c) return { cmd: c[1] };
  return {};
}

export default function Console({ lang }: { lang: Lang }) {
  const t = S[lang];
  const me = useMe();
  const isAsisten = me?.role === "asisten";
  const current = useCurrent(isAsisten);
  const sesi = isAsisten ? (current.data?.sesi ?? null) : null;
  const roster = current.data?.roster ?? [];
  const [view, setView] = useState<View>("board");
  const [prepOnly, setPrepOnly] = useState(false);
  // In a running session Preparation is the live view; its Module Access
  // and Slides buttons open the full tabs, with a way back.
  const [prepFull, setPrepFull] = useState<"akses" | "slides" | "tot" | null>(null);
  const [prepTab, setPrepTab] = useState<PrepTab | undefined>(undefined);
  const [done, setDone] = useState<(SesiRunning & { hadir: number; selesaiPada?: string }) | null>(
    null,
  );
  const [nextOpen, setNextOpen] = useState(false);
  const [prepPilih, setPrepPilih] = useState<string | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [announce, setAnnounce] = useState(false);
  const [asP, setAsP] = useState<number | null>(null);
  const wide = useMinWidth(1024);
  const [doneTable, setDoneTable] = useState(false);
  // Kirim ke SeeLabs, over whatever view is open (Phase 9 Stage 3g).
  const [see, setSee] = useState<{ tab?: SeelabsTab; nomor?: number | null } | null>(null);

  const lap = useLaporan(!!sesi);
  const assign = useAssignment(sesi?.id ?? done?.id ?? null);
  const seelabs = useSeelabs(sesi?.id ?? done?.id ?? null);
  const servers = useServers(!!sesi, drawer);
  const asisten = useMemo(
    () => new Map<string, AsistenRef>((assign.data?.asisten ?? []).map((a) => [a.nim, a])),
    [assign.data],
  );
  const namaOf = useCallback(
    (nim: string | null) => (nim ? namaAsisten(asisten.get(nim), nim) : "?"),
    [asisten],
  );

  const nilai = useNilaiLive(sesi?.id ?? (doneTable ? (done?.id ?? null) : null), me?.nim);

  // Restore the done screen after a reload.
  useEffect(() => setDone(readDone()), []);

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
      if (h.tot) {
        setView("prep");
        setPrepFull("tot");
        setPrepTab("tot");
        setPrepOnly(true);
      }
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
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
              <SignInIcon size={18} aria-hidden="true" /> {t.signIn}
            </button>
          ) : undefined
        }
      />
    );
  }

  const offline = (
    <OfflineBanner
      errors={Math.max(current.errors, lap.errors)}
      text={t.offline}
      retry={refreshAll}
      retryLabel={t.retry}
    />
  );

  // No running session.
  if (!sesi) {
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
              setNextOpen(false);
              setDone(null);
              setPrepPilih(pilih);
              setPrepOnly(true);
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
          <DoneView
            t={t}
            lang={lang}
            sesi={done}
            hadir={done.hadir}
            seelabs={seelabs.data}
            onSeelabs={() => openSeelabs("salin")}
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
    if (prepOnly) {
      return (
        <div className="console">
          {offline}
          <PrepView
            key={prepTab ?? "roster"}
            t={t}
            lang={lang}
            sesi={null}
            roster={roster}
            assign={null}
            meNim={me!.nim}
            meKode={(me!.kode ?? "").toUpperCase()}
            onChanged={refreshAll}
            onBack={() => {
              setPrepOnly(false);
              setPrepPilih(null);
              setPrepTab(undefined);
              if (location.hash === "#tot") history.replaceState(null, "", location.pathname);
            }}
            pilih={prepPilih}
            tab0={prepTab}
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
          onPrep={(pilih) => {
            setPrepPilih(pilih);
            setPrepOnly(true);
          }}
          onHeld={() => openSeelabs("titipan")}
        />
      </div>
    );
  }

  const L = lap.data;
  const groups = L?.kelompok ?? [];
  const stuck = L?.stuck ?? [];
  const tangan = L?.tangan ?? {};
  const pemilik = L?.pemilik ?? {};
  // The inspector always shows a group (mockup c-run): the picked one, else
  // the first group I hold, else the first group.
  // Projector mode shows the first group I hold (ruled 2026-10-04).
  const milikku = groups.find((g) => pemilik[g.id] === me?.nim) ?? null;
  const selGroup =
    groups.find((g) => g.id === sel) ??
    groups.find((g) => pemilik[g.id] === me?.nim) ??
    groups[0] ??
    null;

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
        />
      </div>
    );
  }

  return (
    <div className="console" style={{ "--mod-hue": `var(--mod-${sesi.modul})` } as CSSProperties}>
      {offline}
      <SessionBar
        t={t}
        lang={lang}
        sesi={sesi}
        servers={servers.data}
        onDrawer={() => setDrawer(true)}
        onEnd={() => setEndOpen(true)}
        onView={go}
        onChanged={refreshAll}
        onAsPraktikan={() => setAsP(selGroup?.id ?? groups[0]?.id ?? null)}
        onProjector={
          milikku
            ? () => {
                masukProyektor(milikku.nomor);
                location.assign(href(lang, "/dashboard"));
              }
            : undefined
        }
        announceOpen={announce}
        setAnnounceOpen={setAnnounce}
      />

      <div className="console__modes">
        <div className="seg seg--views" role="tablist" aria-label={t.viewLabel}>
          {(["prep", "board", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              aria-pressed={view === v}
              onClick={() => go(v)}
            >
              {t.views[v]}
            </button>
          ))}
        </div>
        <span className="console__me">
          <span className="hint">{t.youLabel}:</span>
          <b>{namaOf(me!.nim)}</b>
          {me?.tier && <TierBadge tier={me.tier} lang={lang} />}
        </span>
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

        {view === "board" && (
          <div className="boardgrid">
            <GroupBoard
              t={t}
              groups={groups}
              stuck={stuck}
              tangan={tangan}
              pemilik={pemilik}
              asisten={asisten}
              meNim={me!.nim}
              sel={selGroup?.id ?? null}
              onSelect={(id) => {
                pick(id);
                if (!wide)
                  requestAnimationFrame(() =>
                    document
                      .querySelector(".boardgrid .inspector")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" }),
                  );
              }}
            />
            {selGroup && (
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
              />
            )}
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

      <EndFlow
        t={t}
        lang={lang}
        open={endOpen}
        onOpenChange={setEndOpen}
        sesi={sesi}
        groups={groups}
        stuck={stuck}
        tangan={tangan}
        nilai={nilai.data}
        onJumpGroup={(id) => pick(id)}
        onJumpTable={() => go("table")}
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
