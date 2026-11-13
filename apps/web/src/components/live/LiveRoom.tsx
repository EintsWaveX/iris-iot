/**
 * The Live room (Phase 9 Stage 7e, mockup p-live), the same frame for all
 * four modules, inside the module page's Live step and on /modules/N/live.
 *
 * - Top row: the group picker (own group marked) and Langsung / Lapisan
 *   (the same messages, each opened layer by layer).
 * - A status line: real, simulated or no new data, updated N seconds ago,
 *   Pause.
 * - Connect Your Boards (a Praktikan on their own group): every board the
 *   module uses, over Web Serial on this laptop (useSerialBoard).
 * - Value cards per module: every value the journal table asks for.
 * - Serial Monitor with source tabs (Combined, each board, the PC server
 *   for Modules 2 and 3), the message flow and the latest readings. From
 *   1600 wide, Serial and Flow sit side by side with Readings below;
 *   narrower, one card with a tab line.
 *
 * Lihat Sebagai Praktikan (`wakil`): the room is fixed on that group. The
 * Asisten who holds it gets the ports, captures and uploads a Praktikan
 * would (saved under their own name); any other Asisten only looks.
 *
 * Records (live-records.ts) pair the boards' lines with the PC's rows by
 * message number, so send, receive, one-way and round-trip come out the
 * way the journal wants them.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ArrowClockwiseIcon,
  CameraIcon,
  CaretDownIcon,
  ClockIcon,
  EyeIcon,
  PauseIcon,
  PlayIcon,
  PlugsConnectedIcon,
  PlugsIcon,
  UploadSimpleIcon,
  UsbIcon,
} from "@phosphor-icons/react";
import GroupPicker from "../ui/GroupPicker";
import Disclose from "../ui/Disclose";
import SegmentedControl from "../ui/SegmentedControl";
import IconButton from "../ui/IconButton";
import Fade from "../ui/Fade";
import TabLine from "../ui/TabLine";
import LayerView from "./LayerView";
import { useMe, useSessionNow, useTick } from "../../lib/app";
import { kirimNaik, useAliran, useCadangan, usePenonton } from "../../lib/aliran-ruang";
import { useProyektor } from "../../lib/proyektor";
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
import { CV } from "./captureStrings";
import { CaptureDialog, useTangkapan } from "./Capture";
import { validateUploadValues, type UploadValues } from "../../lib/live-build";
import UploadPanel from "./UploadPanel";
import { UP, uploadError } from "./uploadStrings";
import { useUploadBoard } from "./useUploadBoard";
import { useUploadSettings } from "./useUploadSettings";
import "./live-room.css";

interface Layer {
  nama: string;
  nilai: string;
}

const EVENTS_MAX = 600;
/** The laptop mirror: at most this many lines per POST, one POST per tick. */
const MIRROR_BATCH = 60;
const MIRROR_TICK = 2000;
/** While the room carries the stream, the reports' copy is stored this often */
const SIMPAN_TICK = 10_000;
/** A burst of board lines goes up the room as one message after this */
const NAIK_JEDA = 150;

interface BarisCermin {
  id?: number;
  sumber: string;
  teks: string;
  t: number;
}

/** Ids for mirror lines that came through the room (the API's are positive) */
let idCermin = -1;

/** A group's mirror when the view moved to another group, kept per page */
const MIRROR_KEPT = new Map<number, { lines: LogLine[]; last: number; seen: Set<string> }>();

interface MirrorLine {
  sumber: string;
  teks: string;
  t: number;
}

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
  values,
  onLine,
  onState,
}: {
  lang: Lang;
  modul: number;
  slot: number;
  role: BoardRole;
  optional: boolean;
  /** Live Upload's settings, shared by every row */
  values: UploadValues;
  onLine: (slot: number, line: LogLine, ev: SerialEvent) => void;
  onState: (slot: number, s: SlotState) => void;
}) {
  const t = LV[lang];
  const u = UP[lang];
  const handler = useCallback((l: LogLine, ev: SerialEvent) => onLine(slot, l, ev), [slot, onLine]);
  const b = useSerialBoard(modul, handler);
  const open = b.status === "open";
  const up = useUploadBoard(modul, role, lang, b, values);
  const ready = validateUploadValues(modul, role, values).ok;
  useEffect(() => {
    onState(slot, { status: b.status, role: b.role, synced: b.synced });
  }, [slot, b.status, b.role, b.synced, onState]);
  const st = up.state;
  // While the chip is being erased there is no percentage to show: the bar just moves.
  const percent = st.stage === "flashing" && st.phase !== "erase" ? (st.percent ?? 0) : null;
  const sub = up.busy
    ? st.stage === "building"
      ? st.pos
        ? u.stage.queue(st.pos)
        : u.stage.building
      : st.stage === "downloading"
        ? u.stage.downloading
        : st.phase === "erase"
          ? u.stage.erasing
          : u.stage.flashing(st.percent ?? 0)
    : st.stage === "done"
      ? u.stage.done
      : open
        ? t.portOn(modul === 1 ? b.synced : null)
        : b.status === "idle" && optional
          ? t.optional
          : t.status[b.status];
  return (
    <div
      className="port"
      data-on={open ? "yes" : "no"}
      data-warn={
        b.status === "busy" || b.status === "lost" || st.stage === "error" ? "yes" : undefined
      }
    >
      <span className="port__ic" aria-hidden="true">
        {open ? <PlugsConnectedIcon size={22} /> : <UsbIcon size={22} />}
      </span>
      <span className="port__t">
        <b>{t.board(b.role ?? role)}</b>
        <span className="hint">{sub}</span>
      </span>
      <span className="port__act">
        {up.busy ? (
          <button type="button" className="btn btn--sm btn--ghost" onClick={up.cancel}>
            {u.cancel}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--sm btn--secondary"
            disabled={!ready}
            data-tip={ready ? u.uploadTip : u.fillFirst}
            onClick={() => void up.start()}
          >
            <UploadSimpleIcon aria-hidden="true" />
            {u.upload}
          </button>
        )}
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
            {t.connect}
          </button>
        )}
      </span>
      {(up.busy || st.stage === "error") && (
        <div className="port__extra">
          {up.busy ? (
            <span
              className="port__bar"
              data-wait={percent === null ? "yes" : undefined}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent ?? undefined}
              aria-label={sub}
            >
              <i style={{ width: `${percent ?? 40}%` }} />
            </span>
          ) : (
            <div className="port__err" role="alert">
              <b>{u.errorHead}</b>
              <span>{uploadError(lang, st.kode ?? "")}</span>
              {st.log && (
                <details>
                  <summary>{u.log}</summary>
                  <pre>{st.log}</pre>
                </details>
              )}
              <span className="row">
                <button
                  type="button"
                  className="btn btn--sm btn--primary"
                  onClick={() => void up.start()}
                >
                  {u.again}
                </button>
                <button type="button" className="btn btn--sm btn--ghost" onClick={up.clear}>
                  {u.cancel}
                </button>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type Upload =
  { kind: "idle" } | { kind: "sent"; n: number } | { kind: "noSession" } | { kind: "offline" };

export default function LiveRoom({
  lang,
  modul,
  layers,
  wakil,
  embed,
  praktik,
}: {
  lang: Lang;
  modul: number;
  layers: Layer[];
  /** Inside the module page: a Praktikan sees only their own group, live
   * (mockup p-module Live has no group picker and no Lapisan). */
  embed?: boolean;
  /** Lihat Sebagai Praktikan: the group an Asisten views the room as. */
  wakil?: { nomor: number; own: boolean; sesiId: number };
  /** The Live of the Modules menu (2026-11-13): Hubungkan and Upload for anyone, any group,
   *  with nothing saved to a session and nothing of a running one mixed in. */
  praktik?: boolean;
}) {
  const t = LV[lang];
  const tc = CV[lang];
  const me = useMe();
  const praktikan = me?.role === "praktikan";
  // Projector mode: the room looks exactly as the Praktikan's does.
  const pro = useProyektor(me);
  // The Asisten holding the viewed group acts for it, like a Praktikan would.
  const acting = !!wakil?.own;
  const ownGroup = praktikan ? (me?.kelompok ?? null) : wakil ? wakil.nomor : null;
  // /now needs a sign-in; a guest's room just shows the default group count.
  const sesiNow = useSessionNow(!!me);
  // However many groups the lab has now (3, 5, 10 ...): the room, the picker and Upload all follow it.
  const jumlah = sesiNow.data?.jumlahKelompok ?? KELOMPOK_DEFAULT;
  const GROUPS = useMemo(() => Array.from({ length: jumlah }, (_, i) => i + 1), [jumlah]);
  const [group, setGroup] = useState(1);
  const [picked, setPicked] = useState(false);
  const [mode, setMode] = useState<"live" | "lapis">("live");
  const [paused, setPaused] = useState(false);
  const [pane, setPane] = useState<"serial" | "flow" | "read">("serial");
  const [cara, setCara] = useState(false);
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
  /** The boards on this laptop report into the session: the own group of a running session's room */
  const canPorts = (praktikan || acting) && own;
  /** The Modules menu's Live for anyone else: ports and Upload with nothing saved to a session */
  const practice = !!praktik && !canPorts;
  /** The ports (Hubungkan and Upload) are on screen */
  const showPorts = canPorts || practice;

  // Live Upload: the settings every board's Upload uses; Module 4 in a session brings the group's
  // board key and hotspot from the Hunt step.
  const [huntKey, setHuntKey] = useState<string | null>(null);
  const [huntNet, setHuntNet] = useState<{ ssid: string; sandi: string } | null>(null);
  useEffect(() => {
    if (modul !== 4 || !canPorts) return;
    let alive = true;
    const q = acting && wakil ? `?kelompok=${wakil.nomor}` : "";
    const ask = async () => {
      try {
        const r = await fetch(`/api/session/perburuan${q}`);
        const d = (await r.json()) as {
          kunciPapan?: string | null;
          hotspot?: { ssid: string; sandi: string } | null;
          wifi?: { ssid: string; sandi: string } | null;
        };
        if (!alive) return;
        if (typeof d.kunciPapan === "string") setHuntKey(d.kunciPapan);
        const net = d.hotspot ?? d.wifi ?? null;
        if (net) setHuntNet((old) => (old?.ssid === net.ssid ? old : net));
      } catch {
        /* not in a hunt: the person types the values */
      }
    };
    void ask();
    // The key appears only once the Asisten opens the hunt: ask again until it does.
    const id = window.setInterval(() => {
      if (!huntKeyRef.current) void ask();
    }, 20_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [modul, canPorts, acting, wakil?.nomor]);
  const huntKeyRef = useRef<string | null>(null);
  huntKeyRef.current = huntKey;
  const settings = useUploadSettings(ownGroup, huntKey, huntNet);
  /** Sent with every write when an Asisten acts for the group. */
  const wakilBody = acting && wakil ? { kelompok: wakil.nomor } : {};

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
  const mirrorQ = useRef<MirrorLine[]>([]);
  const [capOpen, setCapOpen] = useState(false);
  const saved = useTangkapan(
    modul,
    canPorts,
    acting && wakil ? { sesiId: wakil.sesiId, nomor: wakil.nomor } : null,
  );

  useEffect(() => {
    pairer.current = new Modul1Pairer(ownGroup ?? 1);
  }, [ownGroup]);

  const anyOpen = Object.values(slotState).some((s) => s.status === "open");

  // Phase 12: this laptop's socket in the session's stream room. Its board
  // lines go up it while an Asisten looks at the group, its Module 1
  // readings while anyone does; the API keeps a slower copy for the
  // reports, and takes over at the old pace while the room is down.
  const sesiId = sesiNow.data?.id ?? null;
  const ruangLaptop = {
    ruang: "sesi" as const,
    sesiId,
    kelompok: acting && wakil ? wakil.nomor : null,
    aktif: canPorts && anyOpen && sesiId !== null,
  };
  const ruangLaptopRef = useRef(ruangLaptop);
  ruangLaptopRef.current = ruangLaptop;
  const ruangStatus = useAliran(ruangLaptop, [], () => {});
  const penonton = usePenonton(ruangLaptop);
  const naik = useRef({ live: false, semua: 0, asisten: 0 });
  naik.current = { live: ruangStatus === "live", ...penonton };
  const naikQ = useRef<{ tel: Reading[]; serial: MirrorLine[] }>({ tel: [], serial: [] });
  const naikTimer = useRef<number | null>(null);
  const kirimNaikSekarang = useCallback(() => {
    naikTimer.current = null;
    const q = naikQ.current;
    naikQ.current = { tel: [], serial: [] };
    const n = naik.current;
    if (!n.live) return;
    if (n.asisten > 0) kirimNaik(ruangLaptopRef.current, "serial", q.serial.slice(-MIRROR_BATCH));
    if (n.semua > 0)
      kirimNaik(
        ruangLaptopRef.current,
        "tel",
        q.tel.slice(-50).map((x) => ({ tx: x.tx, rx: x.rx, delayMs: x.delayMs, nilai: x.nilai })),
      );
  }, []);
  useEffect(
    () => () => {
      if (naikTimer.current !== null) window.clearTimeout(naikTimer.current);
    },
    [],
  );

  const onLine = useCallback(
    (slot: number, line: LogLine, ev: SerialEvent) => {
      setLastBoard(Date.now());
      setBoardLines((m) => ({ ...m, [slot]: [...(m[slot] ?? []), line].slice(-300) }));
      const baris = { sumber: `b${slot}`, teks: line.text.slice(0, 300), t: Math.floor(line.t) };
      mirrorQ.current = [...mirrorQ.current, baris].slice(-200);
      naikQ.current.serial.push(baris);
      if (ev && (ev.k === "send" || ev.k === "recv" || ev.k === "echo"))
        setEvents((e) => [...e, ev].slice(-EVENTS_MAX));
      if (modul === 1) {
        const r = pairer.current.push(parseModul1Line(line.text));
        if (r.length) {
          queue.current = [...queue.current, ...r].slice(-200);
          naikQ.current.tel.push(...r);
        }
      }
      // A burst of lines goes up as one message, 150 ms after the first.
      if (naikTimer.current === null)
        naikTimer.current = window.setTimeout(kirimNaikSekarang, NAIK_JEDA);
    },
    [modul, kirimNaikSekarang],
  );
  const onState = useCallback((slot: number, s: SlotState) => {
    setSlotState((m) => {
      const p = m[slot];
      return p && p.status === s.status && p.role === s.role && p.synced === s.synced
        ? m
        : { ...m, [slot]: s };
    });
  }, []);

  const roomLive = ruangStatus === "live";

  // Module 1: the Central's readings are stored for the reports, and while
  // the room is down they reach the Asisten and groupmates this way too.
  useEffect(() => {
    if (modul !== 1 || !canPorts || !anyOpen) return;
    const id = window.setInterval(
      async () => {
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
              siar: !naik.current.live,
              ...wakilBody,
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
      },
      roomLive ? SIMPAN_TICK : 1500,
    );
    return () => window.clearInterval(id);
  }, [modul, canPorts, anyOpen, acting, roomLive]);

  // The laptop mirror: this laptop's newest raw lines are kept for the
  // reports, and while the room is down they reach the Asisten this way.
  useEffect(() => {
    if (!canPorts || !anyOpen) return;
    let stop = false;
    const id = window.setInterval(
      async () => {
        if (stop) return;
        const batch = mirrorQ.current.slice(-MIRROR_BATCH);
        if (!batch.length) return;
        mirrorQ.current = [];
        try {
          const r = await fetch("/api/session/cermin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ baris: batch, siar: !naik.current.live, ...wakilBody }),
          });
          const d = (await r.json()) as { ok: boolean; kode?: string };
          // No running session: nobody can read the mirror, so stop sending.
          if (!d.ok && d.kode === "tidak_ada_sesi") stop = true;
        } catch {
          /* the next tick sends newer lines; the mirror is best effort */
        }
      },
      roomLive ? SIMPAN_TICK : MIRROR_TICK,
    );
    return () => window.clearInterval(id);
  }, [canPorts, anyOpen, acting, roomLive]);

  // The Asisten reads a group's mirror while Live is on screen.
  const asisten = me?.role === "asisten";
  const [mirror, setMirror] = useState<{ g: number; lines: LogLine[] }>({ g: 0, lines: [] });
  const mirrorOn = asisten && mode === "live" && !paused;
  const mirrorLast = useRef(0);
  const mirrorSeen = useRef(new Set<string>());
  const mirrorGroup = useRef(group);
  mirrorGroup.current = group;
  /** Lines from the room or the API's copy, each once */
  const tambahMirror = useCallback((g: number, rows: BarisCermin[]) => {
    if (g !== mirrorGroup.current) return;
    const add: LogLine[] = [];
    for (const x of rows) {
      const k = `${x.sumber}|${x.t}|${x.teks}`;
      if (mirrorSeen.current.has(k)) continue;
      mirrorSeen.current.add(k);
      add.push({
        id: x.id ?? idCermin--,
        text: `${Number(x.sumber.slice(1)) + 1} │ ${x.teks}`,
        t: x.t,
      });
    }
    if (mirrorSeen.current.size > 1200)
      mirrorSeen.current = new Set([...mirrorSeen.current].slice(-600));
    if (!add.length) return;
    setMirror((m) => ({ g, lines: [...(m.g === g ? m.lines : []), ...add].slice(-300) }));
  }, []);
  /** What the API kept: on open, after a reconnect, and while the room is down */
  const tarikMirror = useCallback(async () => {
    const g = group;
    try {
      const r = await fetch(`/api/session/cermin?kelompok=${g}&sesudah=${mirrorLast.current}`);
      const d = (await r.json()) as { ok: boolean; baris?: BarisCermin[] };
      if (!d.ok || !d.baris?.length || g !== mirrorGroup.current) return;
      mirrorLast.current = d.baris[d.baris.length - 1].id ?? mirrorLast.current;
      tambahMirror(g, d.baris);
    } catch {
      /* the room or the next stand in call brings them */
    }
  }, [group, tambahMirror]);
  const mirrorRef = useRef(mirror);
  mirrorRef.current = mirror;
  useEffect(() => {
    if (!mirrorOn) return;
    const kept = MIRROR_KEPT.get(group);
    mirrorLast.current = kept?.last ?? 0;
    mirrorSeen.current = kept?.seen ?? new Set();
    setMirror({ g: group, lines: kept?.lines ?? [] });
    void tarikMirror();
    return () => {
      const m = mirrorRef.current;
      MIRROR_KEPT.set(group, {
        lines: m.g === group ? m.lines : [],
        last: mirrorLast.current,
        seen: mirrorSeen.current,
      });
    };
  }, [mirrorOn, group]);
  const mirrorStatus = useAliran(
    { ruang: "sesi", sesiId, aktif: mirrorOn && sesiId !== null },
    ["serial"],
    (m) => {
      if (Array.isArray(m.d) && m.g !== null) tambahMirror(m.g, m.d as BarisCermin[]);
    },
    () => void tarikMirror(),
  );
  useCadangan(() => void tarikMirror(), MIRROR_TICK, mirrorOn && mirrorStatus !== "live");

  // Practice with a board of your own plugged in: that board alone, none of a running session's rows.
  const tel = useTelemetry(modul, group, paused, 1000, null, true, sesiId, !(practice && anyOpen));
  const localEvents = showPorts ? events : [];
  const live = tel.live || localEvents.length > 0;

  const records = useMemo(() => {
    const s = new LiveRecords(modul);
    // Module 1's PC rows come from this very laptop's Central; and the
    // simulator only stands in while nothing real is arriving.
    const skipPc = localEvents.length > 0 && (modul === 1 || !tel.live);
    if (!skipPc) for (const r of tel.history) s.pc(r);
    for (const e of localEvents) s.board(e);
    return s.list();
  }, [modul, tel.history, tel.live, localEvents]);

  const now = useTick(1000);
  const lastAt = Math.max(tel.updatedAt ?? 0, showPorts ? (lastBoard ?? 0) : 0);
  const ago = lastAt ? Math.max(0, Math.round((now - lastAt) / 1000)) : null;
  const stale =
    tel.live && tel.updatedAt !== null && now - tel.updatedAt > 20_000 && !localEvents.length;

  // Serial Monitor sources.
  const sources: Source[] = useMemo(() => {
    const out: Source[] = [];
    if (showPorts)
      slots.forEach((s, i) =>
        out.push({
          k: `b${i}`,
          label: t.board(slotState[i]?.role ?? s.role),
          lines: boardLines[i] ?? [],
          open: slotState[i]?.status === "open",
        }),
      );
    if (modul === 2 || modul === 3) {
      // The simulator's rows too, so the PC tab shows what a real day looks like.
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
      out.push({
        k: "pc",
        label: t.pcServer,
        lines,
        note: praktikan || acting ? undefined : t.pcOnlyAsisten,
      });
    }
    if (asisten)
      out.push({
        k: "mir",
        label: tc.mirror,
        lines: mirror.g === group ? mirror.lines : [],
        note: tc.mirrorNote,
        empty: tc.mirrorEmpty,
      });
    return out;
  }, [
    showPorts,
    acting,
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
    tc,
    asisten,
    praktikan,
    mirror,
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
      role={praktikan ? (own ? "own" : "other") : acting ? "own" : "asisten"}
    />
  );
  const flow = <FlowPane lang={lang} records={shown.current.records} />;
  const readings = (
    <ReadingsPane lang={lang} modul={modul} group={group} records={shown.current.records} />
  );

  return (
    <div className="stack stack--lg liveroom" style={{ "--m": hue } as CSSProperties}>
      {!(embed && (praktikan || pro)) && (
        <div className="liveroom__top">
          {wakil ? (
            <span className="pill">
              <EyeIcon aria-hidden="true" />
              {t.viewingGroup(wakil.nomor)}
            </span>
          ) : (
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
              size="lg"
            />
          )}
          <SegmentedControl
            value={mode}
            onValueChange={(v) => setMode(v as "live" | "lapis")}
            aria-label={t.mode}
            options={[
              { value: "live", label: t.modeLive },
              { value: "lapis", label: t.modeLayers },
            ]}
          />
        </div>
      )}

      <div className="livebar">
        {/* Phase 21 (f7): Simulasi is the chip alone; its sentence is the tip. */}
        <span
          className={`pill ${paused ? "pill--mono" : live ? (stale ? "pill--warn" : "pill--ok") : "pill--mono"}`}
          data-tip={!live && !paused ? t.simNote(group) : undefined}
          tabIndex={!live && !paused ? 0 : undefined}
        >
          <span
            className={`dot ${paused ? "dot--off" : live ? (stale ? "dot--warn" : "dot--ok dot--pulse") : "dot--off"}`}
            aria-hidden="true"
          />
          {paused ? t.paused : live ? (stale ? t.stale : t.real) : t.sim}
        </span>
        {ago !== null && <span className="hint">{t.updated(ago)}</span>}
        {practice && <span className="pill">{UP[lang].practice}</span>}
        <IconButton
          sm
          icon={paused ? PlayIcon : PauseIcon}
          label={paused ? t.resume : t.pause}
          pressed={paused}
          onClick={() => setPaused((p) => !p)}
        />
        {wakil && !wakil.own && (
          <span className="pill livebar__cap">
            <EyeIcon aria-hidden="true" />
            {t.viewOnly}
          </span>
        )}
        {canPorts && (
          <span className="livebar__cap row">
            {saved.rows !== null && (
              <span className="hint">
                {/* One Module 4 save writes both tables: count saves, not rows. */}
                {tc.savedCount(
                  Math.max(
                    saved.rows.filter((x) => x.jenis === "paket").length,
                    saved.rows.filter((x) => x.jenis === "jarak").length,
                  ),
                )}
              </span>
            )}
            <button type="button" className="btn btn--primary" onClick={() => setCapOpen(true)}>
              <CameraIcon aria-hidden="true" />
              <span className="livebar__capl">{tc.capture}</span>
              <span className="livebar__caps">{tc.captureShort}</span>
            </button>
          </span>
        )}
      </div>

      {/* Kept mounted in Lapisan so an open port is not dropped. */}
      {showPorts && (
        <section className="panel ports" data-ok={missing ? "no" : "yes"} hidden={mode !== "live"}>
          {/* Phase 21 (f7): once every board is connected the panel is just
              their rows; the three steps open on demand. */}
          {missing > 0 && (
            <div className="panel__head">
              <h2 className="panel__title">{t.ports}</h2>
              <span className="pill pill--warn">{t.notConnected(missing)}</span>
              {supported !== false && (
                <button
                  type="button"
                  className="btn btn--sm btn--ghost ports__how"
                  aria-expanded={cara}
                  onClick={() => setCara((v) => !v)}
                >
                  {t.howConnect}
                  <CaretDownIcon size={14} weight="bold" aria-hidden="true" />
                </button>
              )}
            </div>
          )}
          {supported === false ? (
            <p className="hint">{t.unsupported}</p>
          ) : (
            <>
              {missing > 0 && cara && (
                <ol className="ports__steps fade">
                  <li>{t.step1}</li>
                  <li>{t.step2(modul)}</li>
                  <li>{t.step3}</li>
                </ol>
              )}
              {practice && <p className="hint">{UP[lang].practiceNote}</p>}
              <Disclose
                head={
                  <span className="uploadset__head">
                    <UploadSimpleIcon aria-hidden="true" />
                    {UP[lang].title}
                  </span>
                }
                defaultOpen
              >
                <UploadPanel
                  lang={lang}
                  modul={modul}
                  groups={GROUPS}
                  ownGroup={ownGroup}
                  values={settings.values}
                  onChange={settings.change}
                  keyFilled={settings.keyFilled}
                />
              </Disclose>
              <div className="ports__list">
                {slots.map((s, i) => (
                  <PortRow
                    key={`${modul}-${i}`}
                    lang={lang}
                    modul={modul}
                    slot={i}
                    role={s.role}
                    optional={!!s.optional}
                    values={settings.values}
                    onLine={onLine}
                    onState={onState}
                  />
                ))}
              </div>
              {(missing > 0 || (modul === 1 && upload.kind !== "idle")) && (
                <span className="hint">
                  {modul === 1 && upload.kind !== "idle"
                    ? upload.kind === "sent"
                      ? t.uploadSent(upload.n)
                      : upload.kind === "noSession"
                        ? t.uploadNoSession
                        : t.uploadOffline
                    : t.portsHint}
                </span>
              )}
            </>
          )}
        </section>
      )}

      <Fade k={`${mode}-${group}`}>
        {mode === "lapis" ? (
          <LayerView
            lang={lang}
            modul={modul}
            group={group}
            history={tel.history}
            layers={layers}
          />
        ) : (
          <div className="stack stack--lg">
            <ValueCards
              lang={lang}
              modul={modul}
              records={shown.current.records}
              group={group}
              live={live}
            />

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
      {canPorts && (
        <CaptureDialog
          lang={lang}
          modul={modul}
          group={group}
          records={records}
          open={capOpen}
          onOpenChange={setCapOpen}
          onSaved={saved.reload}
          kelompok={acting && wakil ? wakil.nomor : undefined}
        />
      )}
    </div>
  );
}
