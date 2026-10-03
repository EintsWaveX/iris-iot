/**
 * The Live room (Phase 9 Stage 7e, mockup p-live), the same frame for all
 * four modules, inside the module page's Live step and on /modules/N/live.
 *
 * - Top row: the group picker (own group marked) and Live / Try It.
 * - A status line: real, simulated or no new data, updated N seconds ago,
 *   Pause.
 * - Connect Your Boards (a Praktikan on their own group): every board the
 *   module uses, over Web Serial on this laptop (useSerialBoard).
 * - Value cards per module: every value the journal table asks for.
 * - Serial Monitor with source tabs (Combined, each board, the Pi server
 *   for Modules 2 and 3), the message flow and the latest readings. From
 *   1600 wide, Serial and Flow sit side by side with Readings below;
 *   narrower, one card with a tab line.
 *
 * Records (live-records.ts) pair the boards' lines with the Pi's rows by
 * message number, so send, receive, one-way and round-trip come out the
 * way the journal wants them.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  CheckIcon,
  PauseIcon,
  PlayIcon,
  PlugsConnectedIcon,
  PlugsIcon,
  UsbIcon,
  ArrowClockwiseIcon,
  ClockIcon,
} from "@phosphor-icons/react";
import GroupPicker from "../ui/GroupPicker";
import SegmentedControl from "../ui/SegmentedControl";
import IconButton from "../ui/IconButton";
import Fade from "../ui/Fade";
import TabLine from "../ui/TabLine";
import LiveSandbox from "../LiveSandbox";
import { useMe, useSessionNow, useTick } from "../../lib/app";
import { KELOMPOK_DEFAULT } from "../../lib/jadwal";
import { useMinWidth } from "../../lib/hooks";
import type { Lang } from "../../lib/kelas";
import { BOARDS, type BoardRole, type SerialEvent } from "../../lib/serial-lines";
import { LiveRecords } from "../../lib/live-records";
import { Modul1Pairer, parseModul1Line } from "../../lib/serial-modul1";
import type { Reading } from "../../lib/telemetry-sim";
import { useTelemetry } from "./useTelemetry";
import { serialSupported, useSerialBoard, type BoardStatus, type LogLine } from "./useSerialBoard";
import { FlowPane, ReadingsPane, SerialMonitor, ValueCards, type Source } from "./LivePanes";
import { LV } from "./liveStrings";
import "./live-room.css";

interface Layer {
  nama: string;
  nilai: string;
}

const EVENTS_MAX = 600;

interface SlotState {
  status: BoardStatus;
  role: BoardRole | null;
  synced: boolean;
}

/** One board on this laptop. Owns its port; reports lines and state up. */
function PortRow({
  lang,
  modul,
  slot,
  role,
  optional,
  onLine,
  onState,
}: {
  lang: Lang;
  modul: number;
  slot: number;
  role: BoardRole;
  optional: boolean;
  onLine: (slot: number, line: LogLine, ev: SerialEvent) => void;
  onState: (slot: number, s: SlotState) => void;
}) {
  const t = LV[lang];
  const handler = useCallback((l: LogLine, ev: SerialEvent) => onLine(slot, l, ev), [slot, onLine]);
  const b = useSerialBoard(modul, handler);
  const open = b.status === "open";
  useEffect(() => {
    onState(slot, { status: b.status, role: b.role, synced: b.synced });
  }, [slot, b.status, b.role, b.synced, onState]);
  const sub = open
    ? t.portOn(modul === 1 ? b.synced : null)
    : b.status === "idle" && optional
      ? t.optional
      : t.status[b.status];
  return (
    <div
      className="port"
      data-on={open ? "yes" : "no"}
      data-warn={b.status === "busy" || b.status === "lost" ? "yes" : undefined}
    >
      <span className="port__ic" aria-hidden="true">
        {open ? <PlugsConnectedIcon size={22} /> : <UsbIcon size={22} />}
      </span>
      <span className="port__t">
        <b>{t.board(b.role ?? role)}</b>
        <span className="hint">{sub}</span>
      </span>
      <span className="port__act">
        {open ? (
          <>
            {modul === 1 && (
              <IconButton
                sm
                icon={ClockIcon}
                label={t.sendTime}
                onClick={() => void b.sendTime()}
              />
            )}
            <IconButton
              sm
              icon={ArrowClockwiseIcon}
              label={t.restart(modul)}
              onClick={() => void b.reset()}
            />
            <IconButton
              sm
              kind="ghost"
              icon={PlugsIcon}
              label={t.disconnect}
              onClick={() => void b.close()}
            />
          </>
        ) : (
          <button
            type="button"
            className={`btn btn--sm ${optional ? "btn--secondary" : "btn--primary"}`}
            onClick={() => void b.connect()}
          >
            <UsbIcon aria-hidden="true" />
            {t.connect}
          </button>
        )}
      </span>
    </div>
  );
}

type Upload =
  { kind: "idle" } | { kind: "sent"; n: number } | { kind: "noSession" } | { kind: "offline" };

export default function LiveRoom({
  lang,
  modul,
  layers,
}: {
  lang: Lang;
  modul: number;
  layers: Layer[];
}) {
  const t = LV[lang];
  const me = useMe();
  const praktikan = me?.role === "praktikan";
  const ownGroup = praktikan ? (me?.kelompok ?? null) : null;
  const sesiNow = useSessionNow(60_000);
  const jumlah = sesiNow.data?.jumlahKelompok ?? KELOMPOK_DEFAULT;
  const GROUPS = useMemo(() => Array.from({ length: jumlah }, (_, i) => i + 1), [jumlah]);
  const [group, setGroup] = useState(1);
  const [picked, setPicked] = useState(false);
  const [mode, setMode] = useState<"live" | "try">("live");
  const [paused, setPaused] = useState(false);
  const [pane, setPane] = useState<"serial" | "flow" | "read">("serial");
  const wide = useMinWidth(1600);
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => setSupported(serialSupported()), []);

  useEffect(() => {
    if (picked) return;
    const q = Number(new URLSearchParams(location.search).get("kelompok"));
    if (GROUPS.includes(q)) setGroup(q);
    else if (ownGroup && GROUPS.includes(ownGroup)) setGroup(ownGroup);
  }, [ownGroup, picked, GROUPS]);

  const own = ownGroup !== null && group === ownGroup;
  const canPorts = praktikan && own;

  // Board lines and events from this laptop, kept for the own group only.
  const slots = BOARDS[modul] ?? BOARDS[1];
  const [boardLines, setBoardLines] = useState<Record<number, LogLine[]>>({});
  const [events, setEvents] = useState<SerialEvent[]>([]);
  const [slotState, setSlotState] = useState<Record<number, SlotState>>({});
  const pairer = useRef(new Modul1Pairer(ownGroup ?? 1));
  const queue = useRef<Reading[]>([]);
  const sentN = useRef(0);
  const [upload, setUpload] = useState<Upload>({ kind: "idle" });
  const [lastBoard, setLastBoard] = useState<number | null>(null);

  useEffect(() => {
    pairer.current = new Modul1Pairer(ownGroup ?? 1);
  }, [ownGroup]);

  const onLine = useCallback(
    (slot: number, line: LogLine, ev: SerialEvent) => {
      setLastBoard(Date.now());
      setBoardLines((m) => ({ ...m, [slot]: [...(m[slot] ?? []), line].slice(-300) }));
      if (ev && (ev.k === "send" || ev.k === "recv" || ev.k === "echo"))
        setEvents((e) => [...e, ev].slice(-EVENTS_MAX));
      if (modul === 1) {
        const r = pairer.current.push(parseModul1Line(line.text));
        if (r.length) queue.current = [...queue.current, ...r].slice(-200);
      }
    },
    [modul],
  );
  const onState = useCallback((slot: number, s: SlotState) => {
    setSlotState((m) => {
      const p = m[slot];
      return p && p.status === s.status && p.role === s.role && p.synced === s.synced
        ? m
        : { ...m, [slot]: s };
    });
  }, []);

  const anyOpen = Object.values(slotState).some((s) => s.status === "open");

  // Module 1: the Central's readings go up so the Asisten and groupmates see them.
  useEffect(() => {
    if (modul !== 1 || !praktikan || !anyOpen) return;
    const id = window.setInterval(async () => {
      const batch = queue.current.slice(0, 50);
      if (!batch.length) return;
      try {
        const r = await fetch("/api/session/telemetry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            readings: batch.map((x) => ({
              tx: x.tx,
              rx: x.rx,
              delayMs: x.delayMs,
              nilai: x.nilai,
            })),
          }),
        });
        const d = (await r.json()) as { ok: boolean; kode?: string };
        if (d.ok) {
          queue.current = queue.current.slice(batch.length);
          sentN.current += batch.length;
          setUpload({ kind: "sent", n: sentN.current });
        } else if (d.kode === "tidak_ada_sesi") {
          queue.current = [];
          setUpload({ kind: "noSession" });
        } else setUpload({ kind: "offline" });
      } catch {
        setUpload({ kind: "offline" });
      }
    }, 1500);
    return () => window.clearInterval(id);
  }, [modul, praktikan, anyOpen]);

  const tel = useTelemetry(modul, group, paused || mode !== "live", 1000, null);
  const localEvents = own ? events : [];
  const live = tel.live || localEvents.length > 0;

  const records = useMemo(() => {
    const s = new LiveRecords(modul);
    // Module 1's Pi rows come from this very laptop's Central; and the
    // simulator only stands in while nothing real is arriving.
    const skipPi = localEvents.length > 0 && (modul === 1 || !tel.live);
    if (!skipPi) for (const r of tel.history) s.pi(r);
    for (const e of localEvents) s.board(e);
    return s.list();
  }, [modul, tel.history, tel.live, localEvents]);

  const now = useTick(1000);
  const lastAt = Math.max(tel.updatedAt ?? 0, own ? (lastBoard ?? 0) : 0);
  const ago = lastAt ? Math.max(0, Math.round((now - lastAt) / 1000)) : null;
  const stale =
    tel.live && tel.updatedAt !== null && now - tel.updatedAt > 20_000 && !localEvents.length;

  // Serial Monitor sources.
  const sources: Source[] = useMemo(() => {
    const out: Source[] = [];
    if (own)
      slots.forEach((s, i) =>
        out.push({
          k: `b${i}`,
          label: t.board(slotState[i]?.role ?? s.role),
          lines: boardLines[i] ?? [],
        }),
      );
    if (modul === 2 || modul === 3) {
      // The simulator's rows too, so the Pi tab shows what a real day looks like.
      const lines: LogLine[] =
        !paused && (tel.live || !localEvents.length)
          ? tel.history
              .filter((r) => r.rx)
              .map((r, i) => {
                const n = r.nilai ?? {};
                const text =
                  modul === 2
                    ? `[${r.rx}] grup${group} #${r.seq}: ${n.suhu ?? "?"} C, ${n.lembap ?? "?"} %`
                    : `[${r.rx}] iris/grup${group}/pot #${r.seq}: ${n.posisi ?? "?"} %`;
                const m = /^(\d{2}):(\d{2}):(\d{2}):(\d{3})$/.exec(r.rx ?? "");
                const ms = m ? ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 + +m[4] : i;
                return { id: -1 - i, text, t: ms };
              })
          : [];
      out.push({ k: "pi", label: t.piServer, lines });
    }
    return out;
  }, [
    own,
    slots,
    slotState,
    boardLines,
    modul,
    tel.history,
    tel.live,
    localEvents.length,
    paused,
    group,
    t,
  ]);

  // Pause freezes what is shown; ports keep reading underneath.
  const shown = useRef({ records, sources });
  if (!paused) shown.current = { records, sources };

  const missing = slots.filter((s, i) => !s.optional && slotState[i]?.status !== "open").length;
  const hue = `var(--mod-${modul})`;

  const serial = (
    <SerialMonitor
      lang={lang}
      modul={modul}
      sources={shown.current.sources}
      role={praktikan ? (own ? "own" : "other") : "asisten"}
    />
  );
  const flow = <FlowPane lang={lang} records={shown.current.records} />;
  const readings = (
    <ReadingsPane lang={lang} modul={modul} group={group} records={shown.current.records} />
  );

  return (
    <div className="stack stack--lg liveroom" style={{ "--m": hue } as CSSProperties}>
      <div className="liveroom__top">
        <GroupPicker
          value={group}
          onValueChange={(g) => {
            setPicked(true);
            setGroup(g);
          }}
          groups={GROUPS}
          label={t.group}
          aria-label={t.pickGroup}
          mark={ownGroup ?? undefined}
          markLabel={t.mine}
        />
        <SegmentedControl
          value={mode}
          onValueChange={(v) => setMode(v as "live" | "try")}
          aria-label={t.mode}
          options={[
            { value: "live", label: t.modeLive },
            { value: "try", label: t.modeTry },
          ]}
        />
      </div>

      {/* Kept mounted in Try It so an open port is not dropped. */}
      {canPorts && (
        <section className="panel ports" data-ok={missing ? "no" : "yes"} hidden={mode !== "live"}>
          <div className="panel__head">
            <h2 className="panel__title">{t.ports}</h2>
            {missing ? (
              <span className="pill pill--warn">{t.notConnected(missing)}</span>
            ) : (
              <span className="pill pill--ok">
                <CheckIcon aria-hidden="true" />
                {t.allConnected}
              </span>
            )}
          </div>
          {supported === false ? (
            <p className="hint">{t.unsupported}</p>
          ) : (
            <>
              {missing > 0 && (
                <ol className="ports__steps">
                  <li>{t.step1}</li>
                  <li>{t.step2(modul)}</li>
                  <li>{t.step3}</li>
                </ol>
              )}
              <div className="ports__list">
                {slots.map((s, i) => (
                  <PortRow
                    key={`${modul}-${i}`}
                    lang={lang}
                    modul={modul}
                    slot={i}
                    role={s.role}
                    optional={!!s.optional}
                    onLine={onLine}
                    onState={onState}
                  />
                ))}
              </div>
              <span className="hint">
                {modul === 1 && upload.kind !== "idle"
                  ? upload.kind === "sent"
                    ? t.uploadSent(upload.n)
                    : upload.kind === "noSession"
                      ? t.uploadNoSession
                      : t.uploadOffline
                  : t.portsHint}
              </span>
            </>
          )}
        </section>
      )}

      <Fade k={`${mode}-${group}`}>
        {mode === "try" ? (
          <section className="panel liveroom__try">
            <p className="hint">{t.tryHint}</p>
            <LiveSandbox modul={modul} groups={[group]} layers={layers} lang={lang} />
          </section>
        ) : (
          <div className="stack stack--lg">
            <div className="livebar">
              <span
                className={`pill ${paused ? "pill--mono" : live ? (stale ? "pill--warn" : "pill--ok") : "pill--mono"}`}
              >
                <span
                  className={`dot ${paused ? "dot--off" : live ? (stale ? "dot--warn" : "dot--ok dot--pulse") : "dot--off"}`}
                  aria-hidden="true"
                />
                {paused ? t.paused : live ? (stale ? t.stale : t.real) : t.sim}
              </span>
              {ago !== null && <span className="hint">{t.updated(ago)}</span>}
              <IconButton
                sm
                icon={paused ? PlayIcon : PauseIcon}
                label={paused ? t.resume : t.pause}
                pressed={paused}
                onClick={() => setPaused((p) => !p)}
              />
            </div>
            {!live && !paused && (
              <p className="banner" role="status">
                <span>{t.simNote(group)}</span>
              </p>
            )}

            <ValueCards lang={lang} modul={modul} records={shown.current.records} />

            {wide ? (
              <>
                <div className="livepair">
                  <section className="panel">
                    <h2 className="panel__title">{t.serial}</h2>
                    {serial}
                  </section>
                  <section className="panel">
                    <h2 className="panel__title">{t.flow}</h2>
                    {flow}
                  </section>
                </div>
                <section className="panel">
                  <h2 className="panel__title">{t.readings}</h2>
                  {readings}
                </section>
              </>
            ) : (
              <section className="panel">
                <TabLine
                  value={pane}
                  onChange={setPane}
                  label={t.panes}
                  tabs={[
                    { v: "serial", label: t.serial },
                    { v: "flow", label: t.flowShort },
                    { v: "read", label: t.readingsShort },
                  ]}
                />
                <Fade k={pane}>
                  {pane === "serial" ? serial : pane === "flow" ? flow : readings}
                </Fade>
              </section>
            )}
          </div>
        )}
      </Fade>
    </div>
  );
}
