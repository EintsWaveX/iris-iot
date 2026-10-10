/**
 * Phase 10's shared pieces (mockup instruments.js): each module drawn as a
 * constellation, the phosphor trace, the session clock, the session log,
 * the module journey (star path), gauges and one live instrument per
 * module. Motion runs at motion tier 1 and up (Normal or HD background
 * detail, no reduced motion); tier 0 draws the same things still.
 */
import { AngkaGulir } from "../ui/Sorot";
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CheckIcon, LockSimpleIcon, PulseIcon, TrophyIcon } from "@phosphor-icons/react";
import { href, useTick } from "../../lib/app";
import { useMotionTier } from "../../lib/hooks";
import { modulLabel } from "../../lib/labels";
import type { Lang } from "../../lib/kelas";
import type { Reading } from "../../lib/telemetry-sim";
import { useTelemetry } from "../live/useTelemetry";
import Pill from "../ui/Pill";
import { IN } from "./instrumentStrings";
import "./instruments.css";

const IOT_BOARD_URL = "http://192.168.4.1:8080/";

/** True when animations may run (motion tier 1 or 2). False on the first
 *  render, so a server-rendered drawing hydrates as the same still one. */
export function useMoving(): boolean {
  const tier = useMotionTier();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && tier > 0;
}

const cssVar = (el: Element, name: string) =>
  getComputedStyle(el).getPropertyValue(name).trim() || "#7dd3fc";

/* ======================================================================
   The phosphor trace
   ====================================================================== */

/** The serial plotter's look: a graticule, the trace, and while moving a
 *  phosphor afterglow (each frame fades the last instead of clearing). */
export function Trace({
  values,
  min,
  max,
  color = "--accent",
  label,
  unit = "",
  h = 72,
}: {
  values: number[];
  min: number;
  max: number;
  color?: string;
  label: string;
  unit?: string;
  h?: number;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  const data = useRef(values);
  data.current = values;
  const moving = useMoving();
  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    let raf = 0;
    let alive = true;
    const draw = (glow: boolean) => {
      const r = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const W = Math.max(1, Math.round(r.width * dpr));
      const H = Math.max(1, Math.round(r.height * dpr));
      if (c.width !== W || c.height !== H) {
        c.width = W;
        c.height = H;
      }
      const x = c.getContext("2d");
      if (!x) return;
      const col = cssVar(c, color);
      const grid = cssVar(c, "--hairline");
      if (glow) {
        x.globalCompositeOperation = "destination-out";
        x.fillStyle = "rgba(0,0,0,0.22)";
        x.fillRect(0, 0, W, H);
        x.globalCompositeOperation = "source-over";
      } else x.clearRect(0, 0, W, H);
      x.strokeStyle = grid;
      x.lineWidth = 1;
      x.globalAlpha = 0.55;
      for (let i = 1; i < 4; i++) {
        x.beginPath();
        x.moveTo(0, (H * i) / 4);
        x.lineTo(W, (H * i) / 4);
        x.stroke();
      }
      for (let i = 1; i < 10; i++) {
        x.beginPath();
        x.moveTo((W * i) / 10, 0);
        x.lineTo((W * i) / 10, H);
        x.stroke();
      }
      x.globalAlpha = 1;
      const d = data.current;
      if (d.length < 2) return;
      const y = (v: number) =>
        H - ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * (H - 8 * dpr) - 4 * dpr;
      x.beginPath();
      d.forEach((v, i) => {
        const px = (i / (d.length - 1)) * W;
        if (i) x.lineTo(px, y(v));
        else x.moveTo(px, y(v));
      });
      x.strokeStyle = col;
      x.lineWidth = 2 * dpr;
      x.lineJoin = "round";
      if (glow) {
        x.shadowColor = col;
        x.shadowBlur = 10 * dpr;
      }
      x.stroke();
      x.shadowBlur = 0;
      x.fillStyle = col;
      x.beginPath();
      x.arc(W - 3 * dpr, y(d[d.length - 1]), 3.5 * dpr, 0, 7);
      x.fill();
    };
    if (moving) {
      let t0 = 0;
      const loop = (t: number) => {
        if (!alive) return;
        if (t - t0 > 60) {
          draw(true);
          t0 = t;
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    } else draw(false);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [moving, color, min, max, moving ? 0 : values]);
  return (
    <figure className="trace" style={{ "--h": `${h}px` } as CSSProperties}>
      <canvas ref={cv} role="img" aria-label={label} />
      <figcaption>
        <span>{label}</span>
        <span className="mono">
          {min}
          {unit} · {max}
          {unit}
        </span>
      </figcaption>
    </figure>
  );
}

/* ======================================================================
   Constellations
   ====================================================================== */

interface Star {
  x: number;
  y: number;
  label: string;
  r?: number;
  kind?: "dev" | "hub" | "via";
}
interface LinkOpt {
  via?: string;
  flow?: boolean;
  arc?: number;
  dash?: boolean;
  dur?: number;
  back?: boolean;
}
type Link = [number, number, LinkOpt?];

/** Each module's devices and links, in a 100 x 60 box. */
const TOPO: Record<
  number,
  { nodes: Star[]; links: Link[]; rings?: number[]; ring?: [number, number] }
> = {
  1: {
    nodes: [
      { x: 18, y: 30, label: "ESP32 Central" },
      { x: 82, y: 30, label: "ESP32 Peripheral" },
    ],
    links: [
      [0, 1, { via: "GATT", flow: true, arc: 10 }],
      [1, 0, { flow: true, arc: -10, dur: 3 }],
    ],
  },
  2: {
    nodes: [
      { x: 16, y: 34, label: "ESP32 + DHT22" },
      { x: 50, y: 20, r: 1.6, kind: "via", label: "Wi-Fi" },
      { x: 84, y: 34, r: 3.4, kind: "hub", label: "Orange Pi" },
    ],
    links: [
      [0, 1, { flow: true, dur: 1.6 }],
      [1, 2, { via: "WebSocket", flow: true, dur: 1.6 }],
    ],
  },
  3: {
    nodes: [
      { x: 14, y: 42, label: "Pico W" },
      { x: 50, y: 24, r: 3.4, kind: "hub", label: "Mosquitto" },
      { x: 86, y: 42, label: "Pico W" },
    ],
    links: [
      [0, 1, { via: "publish", flow: true }],
      [1, 2, { via: "subscribe", flow: true }],
    ],
  },
  4: {
    nodes: [
      { x: 24, y: 32, label: "Beacon" },
      { x: 78, y: 32, label: "Hunter" },
    ],
    links: [[0, 1, { via: "LoRa P2P", flow: true, dash: true, dur: 3.2 }]],
    rings: [7, 14, 21],
    ring: [24, 32],
  },
};

/** A module's devices as stars with faint links; a link with `flow`
 *  carries packets while moving. Module 4 adds the beacon's range rings. */
export function ModConstellation({ m, h = 150, lang }: { m: number; h?: number; lang: Lang }) {
  const t = TOPO[m] ?? TOPO[1];
  const moving = useMoving();
  const uid = useId().replace(/:/g, "");
  return (
    <svg
      className="cst"
      viewBox="0 0 100 60"
      preserveAspectRatio="xMidYMid meet"
      style={{ "--m": `var(--mod-${m})`, height: h } as CSSProperties}
      role="img"
      aria-label={IN[lang].rasi(modulLabel(m, lang))}
    >
      {t.rings?.map((r, i) => (
        <circle
          key={r}
          className="cst__ring"
          cx={t.ring![0]}
          cy={t.ring![1]}
          r={r}
          style={{ animationDelay: `${i * 0.8}s` }}
          data-moving={moving ? "yes" : "no"}
        />
      ))}
      {t.links.map(([a, b, o = {}], i) => {
        const A = t.nodes[a];
        const B = t.nodes[b];
        const d = o.arc
          ? `M${A.x} ${A.y} Q ${(A.x + B.x) / 2} ${Math.min(A.y, B.y) - o.arc} ${B.x} ${B.y}`
          : `M${A.x} ${A.y} L ${B.x} ${B.y}`;
        const id = `cl-${uid}-${i}`;
        const dur = o.dur ?? 2.4;
        return (
          <g key={i}>
            <path className={"cst__link" + (o.dash ? " cst__link--dash" : "")} d={d} id={id} />
            {o.via && (
              <text
                className="cst__via"
                x={(A.x + B.x) / 2}
                y={(o.arc ? Math.min(A.y, B.y) - o.arc / 2 : (A.y + B.y) / 2) - 3}
                textAnchor="middle"
              >
                {o.via}
              </text>
            )}
            {moving &&
              o.flow &&
              [0, 1].map((k) => (
                <circle key={k} className="cst__pkt" r="1.3">
                  <animateMotion
                    dur={`${dur}s`}
                    begin={`${(k * dur) / 2}s`}
                    repeatCount="indefinite"
                    keyPoints={o.back ? "1;0" : "0;1"}
                    keyTimes="0;1"
                    calcMode="linear"
                  >
                    <mpath href={`#${id}`} />
                  </animateMotion>
                </circle>
              ))}
          </g>
        );
      })}
      {t.nodes.map((n, i) => {
        const r = n.r ?? 2.6;
        const above = n.kind === "hub" || n.kind === "via";
        return (
          <g key={i} className="cst__star" data-kind={n.kind ?? "dev"}>
            <circle className="cst__halo" cx={n.x} cy={n.y} r={r * 2.6} />
            <circle className="cst__core" cx={n.x} cy={n.y} r={r} />
            <text
              className="cst__name"
              x={n.x}
              y={above ? n.y - r - 3 : n.y + r + 6}
              textAnchor="middle"
            >
              {n.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ======================================================================
   The module journey (star path)
   ====================================================================== */

export type StopState = "done" | "now" | "next" | "locked";
export interface Stop {
  m: number;
  state: StopState;
  /** A done module's average, null while it waits for grading. */
  score?: number | null;
}

export function stopWord(x: Stop, lang: Lang): string {
  const t = IN[lang].stop;
  if (x.state === "done") return x.score != null ? t.done(x.score) : t.awaiting;
  return x.state === "now" ? t.now : x.state === "next" ? t.next : t.locked;
}

/** The four modules as a star path from the practicums attended: done
 *  ones with their average, the running one now, the one after the
 *  furthest done or running module next, the rest not open yet. */
export function journeyFrom(
  list: { modul: number; status: string; rataRata: number | null }[],
  now: number | null,
): Stop[] {
  const done = new Map(
    list.filter((x) => x.status === "selesai").map((x) => [x.modul, x.rataRata]),
  );
  const furthest = Math.max(0, now ?? 0, ...done.keys());
  return [1, 2, 3, 4].map((m): Stop => {
    if (m === now) return { m, state: "now" };
    if (done.has(m)) return { m, state: "done", score: done.get(m) ?? null };
    return { m, state: m === furthest + 1 ? "next" : "locked" };
  });
}

/** The group's four modules as a star path: done (lit, with its score),
 *  now (pulsing), next and locked (hollow). Never colour alone: each star
 *  also has a mark and a word. */
export function Journey({
  mods,
  compact,
  onPick,
  lang,
  names,
}: {
  mods: Stop[];
  compact?: boolean;
  onPick?: (x: Stop) => void;
  lang: Lang;
  names: Record<number, string>;
}) {
  return (
    <ol className={"journey" + (compact ? " journey--compact" : "")} aria-label={IN[lang].journey}>
      {mods.map((x) => (
        <li
          key={x.m}
          className="journey__stop"
          data-state={x.state}
          style={{ "--m": `var(--mod-${x.m})` } as CSSProperties}
        >
          <button
            type="button"
            className="journey__star"
            aria-label={`${modulLabel(x.m, lang)}: ${stopWord(x, lang)}`}
            onClick={() => onPick?.(x)}
            disabled={!onPick || x.state === "locked"}
          >
            {x.state === "done" ? (
              <CheckIcon size={compact ? 14 : 16} weight="bold" aria-hidden="true" />
            ) : x.state === "now" ? (
              <span className="journey__pulse" />
            ) : x.state === "locked" ? (
              <LockSimpleIcon size={compact ? 14 : 16} aria-hidden="true" />
            ) : (
              <span className="journey__dot" />
            )}
          </button>
          <span className="journey__m">{modulLabel(x.m, lang)}</span>
          {!compact && <b className="journey__name">{names[x.m]}</b>}
          <span className="journey__st">{stopWord(x, lang)}</span>
        </li>
      ))}
    </ol>
  );
}

/* ======================================================================
   The session clock
   ====================================================================== */

const hms = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

/** T+ since the session started, the ring filling toward the session's
 *  length, and the minutes left under it. */
export function MissionClock({
  mulaiPada,
  durasiMenit,
  size = 128,
  lang,
  noLeft = false,
}: {
  mulaiPada: string | null;
  durasiMenit: number;
  size?: number;
  lang: Lang;
  /** Drop "sisa N menit" where the session bar already shows the time left */
  noLeft?: boolean;
}) {
  const now = useTick(1000);
  const t0 = mulaiPada ? new Date(mulaiPada).getTime() : now;
  const sec = Math.max(0, Math.floor((now - (Number.isNaN(t0) ? now : t0)) / 1000));
  const total = Math.max(60, durasiMenit * 60);
  const p = Math.min(1, sec / total);
  const left = Math.max(0, Math.ceil((total - sec) / 60));
  const R = 44;
  const C = 2 * Math.PI * R;
  return (
    <div
      className="mclock"
      data-warn={left <= 30 ? "yes" : "no"}
      style={{ "--s": `${size}px` } as CSSProperties}
      role="timer"
      aria-label={IN[lang].clockAria(Math.floor(sec / 60), left)}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="mclock__track" cx="50" cy="50" r={R} />
        {[0, 0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            className="mclock__tick"
            x1="50"
            y1="3"
            x2="50"
            y2="8"
            transform={`rotate(${f * 360} 50 50)`}
          />
        ))}
        <circle
          className="mclock__arc"
          cx="50"
          cy="50"
          r={R}
          style={{ strokeDasharray: C, strokeDashoffset: C * (1 - p) }}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <span className="mclock__in">
        <span className="mclock__t mono">T+{hms(sec)}</span>
        {!noLeft && <span className="mclock__left">{IN[lang].sisa(left)}</span>}
      </span>
    </div>
  );
}

/** The same clock before the session starts: a dashed ring, "T-". */
export function IdleClock({ size = 112, lang }: { size?: number; lang: Lang }) {
  return (
    <div
      className="mclock mclock--idle"
      style={{ "--s": `${size}px` } as CSSProperties}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100">
        <circle className="mclock__track" cx="50" cy="50" r="44" />
      </svg>
      <span className="mclock__in">
        <span className="mclock__t mono">T-</span>
        <span className="mclock__left">{IN[lang].belumMulai}</span>
      </span>
    </div>
  );
}

/* ======================================================================
   The session log
   ====================================================================== */

export interface LogItem {
  pada: string;
  jenis: string;
  n?: number;
  dari?: number;
  teks?: string;
}

const TAG: Record<string, [keyof (typeof IN)["id"]["tag"], string]> = {
  mulai: ["sesi", "accent"],
  masuk: ["sesi", "accent"],
  selesai: ["sesi", "accent"],
  blank: ["blank", "ok"],
  salah: ["blank", "warn"],
  tangkap: ["tangkap", "violet"],
  jarak: ["tangkap", "violet"],
  info: ["info", "accent"],
  bantu: ["bantu", "warn"],
  data: ["data", "ok"],
};

/** "13:41" in lab time, the same in every language. */
export const jamLab = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });

function logText(x: LogItem, lang: Lang): string {
  const t = IN[lang].log;
  if (x.jenis === "blank") return t.blank(x.n ?? 0, x.dari ?? 0);
  if (x.jenis === "info") return t.info(x.teks ?? "");
  const v = t[x.jenis as Exclude<keyof typeof t, "blank" | "info">];
  return typeof v === "string" ? v : x.jenis;
}

/** Newest first: a time, a tag and one line. Lines that arrive after the
 *  log first drew slide in (while moving). */
export function SessionLog({
  items,
  lang,
  max = 7,
}: {
  items: LogItem[];
  lang: Lang;
  max?: number;
}) {
  const seen = useRef<Set<string> | null>(null);
  const list = [...items].sort((a, b) => b.pada.localeCompare(a.pada)).slice(0, max);
  const key = (x: LogItem) => `${x.pada}|${x.jenis}|${x.n ?? ""}`;
  const first = seen.current === null;
  const fresh = new Set(first ? [] : list.map(key).filter((k) => !seen.current!.has(k)));
  useEffect(() => {
    seen.current = new Set([...(seen.current ?? []), ...list.map(key)]);
  });
  if (!list.length) return <p className="hint">{IN[lang].logKosong}</p>;
  return (
    <ol className="elog">
      {list.map((x) => {
        const [tag, tone] = TAG[x.jenis] ?? ["info", "accent"];
        return (
          <li className="elog__row" data-fresh={fresh.has(key(x)) ? "yes" : "no"} key={key(x)}>
            <time className="mono" dateTime={x.pada}>
              {jamLab(x.pada)}
            </time>
            <span className="elog__tag mono" data-tone={tone}>
              {IN[lang].tag[tag]}
            </span>
            <span className="elog__text">{logText(x, lang)}</span>
          </li>
        );
      })}
    </ol>
  );
}

/* ======================================================================
   Gauges and readouts
   ====================================================================== */

export function Readout({
  v,
  unit,
  label,
  digits = 0,
}: {
  v: number | null | undefined;
  unit: string;
  label: string;
  digits?: number;
}) {
  const ok = v != null && Number.isFinite(v);
  return (
    <div className="readout">
      <b className="mono">
        {ok ? v.toFixed(digits) : "-"}
        {ok && <small>{unit}</small>}
      </b>
      <span>{label}</span>
    </div>
  );
}

/** A 240 degree arc gauge. */
export function Arc({
  v,
  min,
  max,
  unit,
  label,
  color,
  digits = 0,
}: {
  v: number | null;
  min: number;
  max: number;
  unit: string;
  label: string;
  color: string;
  digits?: number;
}) {
  const ok = v != null && Number.isFinite(v);
  const p = ok ? Math.max(0, Math.min(1, (v - min) / (max - min))) : 0;
  const R = 40;
  const C = 2 * Math.PI * R;
  const span = C * (240 / 360);
  const text = ok ? v.toFixed(digits) : "-";
  return (
    <div className="arcg" style={{ "--c": `var(${color})` } as CSSProperties}>
      <svg viewBox="0 0 100 86" role="img" aria-label={`${label} ${text} ${ok ? unit : ""}`}>
        <circle
          className="arcg__track"
          cx="50"
          cy="50"
          r={R}
          style={{ strokeDasharray: `${span} ${C}` }}
          transform="rotate(150 50 50)"
        />
        <circle
          className="arcg__val"
          cx="50"
          cy="50"
          r={R}
          style={{ strokeDasharray: `${span * p} ${C}` }}
          transform="rotate(150 50 50)"
        />
      </svg>
      <span className="arcg__in">
        <b className="mono">
          {text}
          {ok && <small>{unit}</small>}
        </b>
        <span>{label}</span>
      </span>
    </div>
  );
}

/** A segmented meter: one cell per item, lit when done. */
export function Cells({
  label,
  a,
  b,
  tone,
}: {
  label: string;
  a: number;
  b: number;
  tone?: string;
}) {
  const n = Math.max(1, Math.min(b, 12));
  const on = b > 0 ? Math.round((Math.min(a, b) / b) * n) : 0;
  return (
    <div className="cells" style={tone ? ({ "--c": `var(${tone})` } as CSSProperties) : undefined}>
      <span className="cells__l">{label}</span>
      <span className="cells__row" role="img" aria-label={`${label} ${a}/${b}`}>
        {Array.from({ length: n }, (_, i) => (
          <i key={i} data-on={i < on ? "yes" : "no"} />
        ))}
      </span>
      <b className="mono">
        <AngkaGulir value={a} />/{b}
      </b>
    </div>
  );
}

/* ======================================================================
   One instrument per module
   ====================================================================== */

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const nums = (xs: (number | null | undefined)[]) =>
  xs.filter((x): x is number => x != null && Number.isFinite(x));

/** "13:41:07:250" to milliseconds since midnight. */
function msOf(s: string | null): number | null {
  if (!s) return null;
  const p = s.split(":").map(Number);
  if (p.length < 3 || p.some((x) => Number.isNaN(x))) return null;
  return ((p[0] * 60 + p[1]) * 60 + p[2]) * 1000 + (p[3] ?? 0);
}

function Servo({ pos, lang }: { pos: number | null; lang: Lang }) {
  const ang = -90 + ((pos ?? 0) / 100) * 180;
  return (
    <svg
      className="servo"
      viewBox="0 0 120 70"
      role="img"
      aria-label={IN[lang].servoAria(Math.round(pos ?? 0))}
    >
      <path className="servo__track" d="M10 62 A50 50 0 0 1 110 62" />
      {[0, 30, 60, 90, 120, 150, 180].map((a) => (
        <line
          key={a}
          className="servo__tick"
          x1="60"
          y1="16"
          x2="60"
          y2="21"
          transform={`rotate(${a - 90} 60 62)`}
        />
      ))}
      <g className="servo__arm" style={{ transform: `rotate(${ang}deg)` }}>
        <line x1="60" y1="62" x2="60" y2="20" />
        <circle cx="60" cy="20" r="3.2" />
      </g>
      <circle className="servo__hub" cx="60" cy="62" r="5" />
      <text x="12" y="70" className="servo__lab">
        0°
      </text>
      <text x="108" y="70" textAnchor="end" className="servo__lab">
        180°
      </text>
    </svg>
  );
}

function Radar({ rssi, lang }: { rssi: number | null; lang: Lang }) {
  const moving = useMoving();
  const v = rssi ?? -120;
  const rr = 6 + ((-52 - Math.max(-112, Math.min(-52, v))) / 60) * 36;
  return (
    <svg
      className="radar"
      viewBox="0 0 100 100"
      role="img"
      aria-label={IN[lang].radarAria(Math.round(v))}
    >
      {[12, 24, 36, 46].map((r, i) => (
        <g key={r}>
          <circle className="radar__ring" cx="50" cy="50" r={r} />
          <text className="radar__lab" x={50 + r * 0.72} y={50 - r * 0.72}>
            {[-60, -80, -100, -120][i]}
          </text>
        </g>
      ))}
      <line className="radar__axis" x1="4" y1="50" x2="96" y2="50" />
      <line className="radar__axis" x1="50" y1="4" x2="50" y2="96" />
      <g className="radar__sweep" data-moving={moving ? "yes" : "no"}>
        <path d="M50 50 L50 4 A46 46 0 0 1 82.5 17.5 Z" />
      </g>
      {rssi != null && (
        <circle className="radar__blip" cx={50 + rr * 0.6} cy={50 - rr * 0.8} r="3" />
      )}
      <circle className="radar__me" cx="50" cy="50" r="2.4" />
    </svg>
  );
}

/** What each module's instrument shows from the group's telemetry. */
function readings(m: number, rows: Reading[], lang: Lang) {
  const t = IN[lang];
  const got = rows.filter((r) => r.rx !== null);
  const last = got[got.length - 1];
  const v = (last?.nilai ?? {}) as Record<string, number | undefined>;
  const delays = nums(rows.map((r) => r.delayMs));
  const lost = rows.length ? (rows.filter((r) => r.rx === null).length / rows.length) * 100 : null;
  if (m === 2) {
    const times = nums(got.map((r) => msOf(r.rx)));
    const gaps = times
      .slice(1)
      .map((x, i) => x - times[i])
      .filter((g) => g > 0 && g < 60_000);
    const temps = nums(got.map((r) => (r.nilai as Record<string, number> | undefined)?.suhu));
    return {
      vis: (
        <div className="arcpair">
          <Arc
            v={v.suhu ?? null}
            min={15}
            max={40}
            unit="°C"
            label={t.suhu}
            color="--mod-2"
            digits={1}
          />
          <Arc v={v.lembap ?? null} min={0} max={100} unit="%" label={t.lembap} color="--accent" />
        </div>
      ),
      read: [
        <Readout key="a" v={got.length} unit="" label={t.pesanServer} />,
        <Readout
          key="b"
          v={gaps.length ? avg(gaps)! / 1000 : null}
          unit=" s"
          digits={1}
          label={t.jeda}
        />,
      ],
      trace: { values: temps, min: 20, max: 35, unit: "°C" },
    };
  }
  if (m === 3) {
    const pos = nums(got.map((r) => (r.nilai as Record<string, number> | undefined)?.posisi));
    return {
      vis: <Servo pos={v.posisi ?? null} lang={lang} />,
      read: [
        <Readout key="a" v={v.posisi ?? null} unit=" %" label={t.posisi} />,
        <Readout key="b" v={avg(delays)} unit=" ms" label={t.delaySatu} />,
      ],
      trace: { values: pos, min: 0, max: 100, unit: "%" },
    };
  }
  if (m === 4) {
    const rssi = v.rssiHalus ?? last?.rssi ?? null;
    const series = nums(
      got.map((r) => (r.nilai as Record<string, number> | undefined)?.rssiHalus ?? r.rssi),
    );
    return {
      vis: <Radar rssi={rssi} lang={lang} />,
      read: [
        <Readout key="a" v={rssi} unit=" dBm" label={t.rssi} />,
        <Readout key="b" v={v.jarak ?? null} unit=" m" digits={1} label={t.jarak} />,
      ],
      trace: { values: series, min: -120, max: -50, unit: "" },
    };
  }
  return {
    vis: <ModConstellation m={1} h={160} lang={lang} />,
    read: [
      <Readout key="a" v={avg(delays)} unit=" ms" label={t.delayRata} />,
      <Readout key="b" v={lost} unit=" %" label={t.hilang} />,
    ],
    trace: { values: delays, min: 0, max: 100, unit: " ms" },
  };
}

/** The live card: the module's instrument, two readouts, the trace of the
 *  last minute, and Open Live (plus the hunt's Scoreboard on Module 4). */
export function Instrument({
  m,
  kelompok,
  lang,
  title,
  nim,
  extra,
  sesiId = null,
}: {
  m: number;
  kelompok: number;
  lang: Lang;
  title: string;
  nim: string;
  extra?: ReactNode;
  /** The running session, for its stream room */
  sesiId?: number | null;
}) {
  const t = IN[lang];
  const tel = useTelemetry(m, kelompok, false, 2000, null, true, sesiId);
  const r = readings(m, tel.history.slice(-60), lang);
  return (
    <section className="panel instr" style={{ "--m": `var(--mod-${m})` } as CSSProperties}>
      <div className="panel__head">
        <h2 className="panel__title">{title}</h2>
        <Pill tone={tel.live ? "ok" : undefined}>
          {tel.live && <span className="dot dot--ok dot--pulse" aria-hidden="true" />}
          {tel.live ? t.langsung : t.simulasi}
        </Pill>
      </div>
      <div className="instr__body">
        <div className="instr__vis">{r.vis}</div>
        <div className="instr__read">{r.read}</div>
      </div>
      <Trace
        values={r.trace.values}
        min={r.trace.min}
        max={r.trace.max}
        unit={r.trace.unit}
        color={`--mod-${m}`}
        label={t.trace[m]}
      />
      {m === 4 && <p className="hint">{t.huntHint}</p>}
      {extra}
      <div className="panel__actions">
        <a className="btn dash__live-cta" href={href(lang, `/modules/${m}?step=live`)}>
          <PulseIcon size={18} aria-hidden="true" />
          {t.bukaLive}
        </a>
        {m === 4 && (
          <a
            className="btn"
            href={`${IOT_BOARD_URL}?nim=${encodeURIComponent(nim)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <TrophyIcon size={18} aria-hidden="true" />
            {t.papanSkor}
          </a>
        )}
      </div>
    </section>
  );
}
