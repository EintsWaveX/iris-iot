/**
 * The assistant console (P8.1), /session and /en/session. Replaces the
 * nine-tab SessionConsole with two modes:
 *
 * - no session: Asisten home (schedule, start form, my feedback), with
 *   Persiapan reachable before anything starts
 * - a running session: the sticky session bar, then Persiapan | Papan |
 *   Tabel nilai. Papan is the group board + inspector (+ live activity),
 *   laid out per width:
 *     >= 1680  three resizable panes: board · inspector · activity
 *     >= 1024  two resizable panes: board and activity · inspector
 *     <  1024  board and activity, the inspector as a bottom sheet
 * - just ended: "Sesi selesai" with the feedback QR
 *
 * Keys: 1 to 9 and 0 (Group 10) pick a group, Esc closes the inspector; the Ctrl+K palette
 * (AsistenCommands) talks to this component through `iris:console` events
 * or the URL hash.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { namaAsisten } from "../../lib/people";
import BackButton from "../ui/BackButton";
import Fade from "../ui/Fade";
import { shortcutsOn } from "../../lib/prefs";
import Dialog from "../ui/Dialog";
import { ShieldWarningIcon, SignInIcon, SquaresFourIcon } from "@phosphor-icons/react";
import ResizablePanes from "../ui/ResizablePanes";
import { OfflineBanner, StateView, UpdatedAgo } from "../ui/Display";
import { Kbd } from "../ui/Controls";
import { isTypingTarget } from "../ui/ShortcutSheet";
import { useMe } from "../../lib/app";
import { useMinWidth } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import { CONSOLE_EVENT, type ConsoleCommand } from "../shell/AsistenCommands";
import { S } from "./strings";
import { useAssignment, useCurrent, useLaporan, useNilaiLive, useServers } from "./data";
import SessionBar from "./SessionBar";
import GroupBoard, { ActivityFeed } from "./GroupBoard";
import GroupInspector from "./GroupInspector";
import NilaiTable from "./NilaiTable";
import PrepView from "./PrepView";
import ServerDrawer from "./ServerDrawer";
import EndFlow from "./EndFlow";
import DoneView from "./DoneView";
import NextView from "./NextView";
import AsistenHome from "./AsistenHome";
import SeelabsView, { type SeelabsTab } from "./seelabs/SeelabsView";
import { useSeelabs } from "./seelabs/data";
import { SL } from "./seelabs/strings";
import type { AsistenRef, FeedItem, Laporan, SesiRunning, View } from "./types";
import "./console.css";

const DONE_KEY = "iris-console-done";

function readDone(): (SesiRunning & { hadir: number }) | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(DONE_KEY) || "null");
    return v && typeof v.id === "number" ? v : null;
  } catch {
    return null;
  }
}

function readHash(): { view?: View; group?: number; cmd?: string; seelabs?: boolean } {
  const h = location.hash.replace(/^#/, "");
  if (h === "prep" || h === "board" || h === "table") return { view: h };
  if (h === "seelabs") return { seelabs: true };
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
  const current = useCurrent();
  const sesi = isAsisten ? (current.data?.sesi ?? null) : null;
  const roster = current.data?.roster ?? [];
  const [view, setView] = useState<View>("board");
  const [prepOnly, setPrepOnly] = useState(false);
  const [done, setDone] = useState<(SesiRunning & { hadir: number; selesaiPada?: string }) | null>(
    null,
  );
  const [nextOpen, setNextOpen] = useState(false);
  const [prepPilih, setPrepPilih] = useState<string | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [announce, setAnnounce] = useState(false);
  const [feed, setFeed] = useState<FeedItem[]>([]);
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

  const pushFeed = useCallback((items: FeedItem[]) => {
    if (!items.length) return;
    setFeed((f) => {
      const seen = new Set(f.map((x) => x.id));
      return [...items.filter((x) => !seen.has(x.id)), ...f]
        .sort((a, b) => b.at - a.at)
        .slice(0, 30);
    });
  }, []);

  const nilai = useNilaiLive(
    sesi?.id ?? (doneTable ? (done?.id ?? null) : null),
    me?.nim,
    (rows) => {
      const byNim = new Map<string, { who: string; at: string }>();
      for (const r of rows) {
        const prev = byNim.get(r.nim);
        if (!prev || r.diubahPada > prev.at)
          byNim.set(r.nim, { who: r.diubahOleh ?? "", at: r.diubahPada });
      }
      const all = lap.data?.kelompok ?? [];
      pushFeed(
        [...byNim.entries()].map(([nim, { who, at }]) => {
          const g = all.find((k) => k.anggota.some((a) => a.nim === nim));
          const nama = g?.anggota.find((a) => a.nim === nim)?.nama ?? nim;
          return {
            id: `score-${nim}-${at}`,
            at: new Date(at).getTime(),
            g: g?.nomor ?? null,
            kind: "score" as const,
            text: t.evScore(namaOf(who), nama.split(" ")[0]),
          };
        }),
      );
    },
  );

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
      if (h.seelabs) setSee({});
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
      } else if (e.key === "Escape" && sel !== null) pick(null);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [sesi, lap.data, sel, pick]);

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

  // Activity feed from successive board polls.
  const prevLap = useRef<Laporan | null>(null);
  useEffect(() => {
    const cur = lap.data;
    if (!cur?.ok || !cur.sesi) return;
    const prev = prevLap.current;
    prevLap.current = cur;
    const now = Date.now();
    const out: FeedItem[] = [];
    if (!prev) {
      // Seed with the latest blank attempts so the feed is never blank.
      for (const g of cur.kelompok) {
        const rinci = g.blankRinci ?? [];
        for (const b of rinci.filter((x) => !x.benar)) {
          out.push({
            id: `w-${g.id}-${b.soalKode}-${b.percobaan}`,
            at: new Date(b.diubahPada).getTime(),
            g: g.nomor,
            kind: "wrong",
            text: t.evWrong(g.nomor, b.soalKode.toUpperCase(), b.percobaan),
          });
        }
        const right = rinci.filter((x) => x.benar);
        if (right.length) {
          const at = Math.max(...right.map((x) => new Date(x.diubahPada).getTime()));
          out.push({
            id: `r-${g.id}-${g.benar}`,
            at,
            g: g.nomor,
            kind: g.benar >= g.total ? "done" : "right",
            text: g.benar >= g.total ? t.evDone(g.nomor) : t.evRight(g.nomor, g.benar, g.total),
          });
        }
      }
      for (const [kid, at] of Object.entries(cur.tangan ?? {})) {
        const g = cur.kelompok.find((k) => k.id === Number(kid));
        if (g)
          out.push({
            id: `h-${kid}-${at}`,
            at: new Date(at).getTime(),
            g: g.nomor,
            kind: "hand",
            text: t.evHand(g.nomor),
          });
      }
      pushFeed(out.sort((a, b) => b.at - a.at).slice(0, 10));
      return;
    }
    for (const g of cur.kelompok) {
      const pg = prev.kelompok.find((k) => k.id === g.id);
      if (!pg) continue;
      for (const a of g.anggota) {
        if (a.hadir && !pg.anggota.find((x) => x.nim === a.nim)?.hadir)
          out.push({
            id: `in-${a.nim}`,
            at: now,
            g: g.nomor,
            kind: "login",
            text: t.evLogin(a.nama),
          });
      }
      if (g.benar > pg.benar)
        out.push({
          id: `r-${g.id}-${g.benar}`,
          at: now,
          g: g.nomor,
          kind: g.benar >= g.total ? "done" : "right",
          text: g.benar >= g.total ? t.evDone(g.nomor) : t.evRight(g.nomor, g.benar, g.total),
        });
      for (const b of g.blankRinci ?? []) {
        const pb = pg.blankRinci?.find((x) => x.soalKode === b.soalKode);
        if (!b.benar && (!pb || b.percobaan > pb.percobaan))
          out.push({
            id: `w-${g.id}-${b.soalKode}-${b.percobaan}`,
            at: now,
            g: g.nomor,
            kind: "wrong",
            text: t.evWrong(g.nomor, b.soalKode.toUpperCase(), b.percobaan),
          });
      }
      const h = cur.tangan?.[g.id];
      const ph = prev.tangan?.[g.id];
      if (h && h !== ph)
        out.push({
          id: `h-${g.id}-${h}`,
          at: now,
          g: g.nomor,
          kind: "hand",
          text: t.evHand(g.nomor),
        });
      if (!h && ph)
        out.push({
          id: `hd-${g.id}-${ph}`,
          at: now,
          g: g.nomor,
          kind: "note",
          text: t.evHandDown(g.nomor),
        });
    }
    pushFeed(out);
  }, [lap.data, pushFeed, t]);

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
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => window.LoginDialog?.open()}
            >
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
            }}
            pilih={prepPilih}
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
          onPrep={() => setPrepOnly(true)}
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
  const selGroup = groups.find((g) => g.id === sel) ?? null;

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
        <span className="console__hints hint">
          <UpdatedAgo since={lap.updatedAt} template={t.updated} />
          <span className="console__kbd">
            <Kbd>Ctrl K</Kbd> {t.kbdHint} · <Kbd>?</Kbd> {t.kbdShort}
          </span>
        </span>
      </div>

      <Fade k={view} className="console__view">
        {view === "prep" && (
          <PrepView
            t={t}
            lang={lang}
            sesi={sesi}
            roster={roster}
            assign={assign.data}
            meNim={me!.nim}
            meKode={(me!.kode ?? "").toUpperCase()}
            onChanged={refreshAll}
          />
        )}

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
          <BoardLayout
            board={
              <GroupBoard
                t={t}
                lang={lang}
                groups={groups}
                stuck={stuck}
                tangan={tangan}
                pemilik={pemilik}
                asisten={asisten}
                meNim={me!.nim}
                sel={sel}
                onSelect={(id) => pick(sel === id ? null : id)}
              />
            }
            feed={
              <ActivityFeed
                t={t}
                lang={lang}
                items={feed}
                onPick={(n) => pick(groups.find((g) => g.nomor === n)?.id ?? null)}
              />
            }
            inspector={
              selGroup ? (
                <GroupInspector
                  key={selGroup.id}
                  t={t}
                  lang={lang}
                  sesiId={sesi.id}
                  modul={sesi.modul}
                  g={selGroup}
                  stuck={stuck.filter((s) => s.kelompokId === selGroup.id)}
                  hand={tangan[selGroup.id] ?? null}
                  ownerNim={pemilik[selGroup.id] ?? null}
                  asisten={asisten}
                  meNim={me!.nim}
                  bolehPasang={me?.hak?.pair !== false}
                  nilai={nilai}
                  onChanged={refreshAll}
                  onOpenTable={() => go("table")}
                  seelabs={seelabs.data}
                  onSeelabs={openSeelabs}
                  onSeelabsChanged={seelabs.refresh}
                />
              ) : null
            }
            empty={
              <div className="insp-empty">
                <SquaresFourIcon size={28} aria-hidden="true" />
                <b>{t.pickGroup}</b>
                <span className="hint">{t.pickGroupBody}</span>
                <span className="row">
                  {Array.from({ length: Math.min(groups.length || 5, 10) }, (_, i) => (
                    <Kbd key={i}>{(i + 1) % 10}</Kbd>
                  ))}
                </span>
              </div>
            }
            sheetTitle={selGroup ? t.groupFull(selGroup.nomor) : ""}
            onCloseSheet={() => pick(null)}
            lang={lang}
            handleLabel={lang !== "id" ? "Resize panes" : "Ubah ukuran panel"}
            labels={{
              board: t.boardTitle,
              inspector: t.groupFull(selGroup?.nomor ?? 1),
              feed: t.feed,
            }}
          />
        )}
      </Fade>

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

function BoardLayout({
  board,
  feed,
  inspector,
  empty,
  sheetTitle,
  onCloseSheet,
  lang,
  handleLabel,
  labels,
}: {
  board: ReactNode;
  feed: ReactNode;
  inspector: ReactNode | null;
  empty: ReactNode;
  sheetTitle: string;
  onCloseSheet: () => void;
  lang: Lang;
  handleLabel: string;
  labels: { board: string; inspector: string; feed: string };
}) {
  const xl = useMinWidth(1680);
  const lg = useMinWidth(1024);
  const insp = <div className="console__insp">{inspector ?? empty}</div>;

  if (xl) {
    return (
      <ResizablePanes
        id="console-board-3"
        className="console__panes"
        handleLabel={handleLabel}
        panes={[
          {
            id: "board",
            label: labels.board,
            defaultSize: 29,
            minSize: 22,
            maxSize: 40,
            content: board,
          },
          { id: "inspector", label: labels.inspector, defaultSize: 47, minSize: 34, content: insp },
          {
            id: "feed",
            label: labels.feed,
            defaultSize: 24,
            minSize: 16,
            maxSize: 34,
            collapsible: true,
            content: <div className="console__feedcol">{feed}</div>,
          },
        ]}
      />
    );
  }
  if (lg) {
    return (
      <ResizablePanes
        id="console-board-2"
        className="console__panes"
        handleLabel={handleLabel}
        panes={[
          {
            id: "board",
            label: labels.board,
            defaultSize: 40,
            minSize: 30,
            maxSize: 55,
            content: (
              <div className="stack stack--lg">
                {board}
                {feed}
              </div>
            ),
          },
          { id: "inspector", label: labels.inspector, defaultSize: 60, minSize: 45, content: insp },
        ]}
      />
    );
  }
  return (
    <div className="stack stack--lg">
      {board}
      {feed}
      <Dialog
        open={!!inspector}
        onOpenChange={(o) => !o && onCloseSheet()}
        title={sheetTitle}
        sheet
        size="xl"
        lang={lang}
      >
        {inspector}
      </Dialog>
    </div>
  );
}
