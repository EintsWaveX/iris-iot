/**
 * Pins and schematic, together (Phase 8): the interactive wiring diagram
 * (the board on the left, the parts on the right, one colour-coded wire per
 * pin row), the pin table beside it, and the real schematic image with a
 * pan and zoom viewer.
 *
 * - The diagram is generated from the module's own pin table, so it can
 *   never disagree with it: "DHT (DATA)" -> "GPIO16" becomes a wire from the
 *   board's GPIO16 to the DHT part's DATA pin. Tables with two column pairs
 *   (Module 1's Central and Peripheral) become two boards.
 * - Hover or focus a table row, or hover a wire, and both light up together;
 *   data wires carry a moving pulse at motion tier 1+.
 * - The schematic is the assistant's uploaded one when there is an active
 *   upload for this module (GET /api/presentasi/schematics), otherwise the
 *   one bundled with the site. A Wokwi, Tinkercad or Canva link (Phase 9)
 *   shows live in a frame instead.
 *
 * `variant="full"` is the Persiapan step's layout; `variant="dock"` is the
 * narrow panel docked beside the code.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ArrowSquareOutIcon, ArrowsOutSimpleIcon } from "@phosphor-icons/react";
import SchematicViewer from "../ui/SchematicViewer";
import { getJson, dict } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import "./PinSchematic.css";

export interface PinData {
  judul: string;
  kolom: string[];
  baris: string[][];
  catatan: string[];
}

type Kind = "pwr" | "gnd" | "sig";

interface Wire {
  row: number;
  pin: string;
  part: string;
  signal: string;
  signalFull: string;
  kind: Kind;
}

interface Board {
  label: string;
  wires: Wire[];
}

const T = dict({
  id: {
    wiring: "Diagram rangkaian",
    schematic: "Skema asli",
    zoom: "Perbesar skema",
    uploaded: "Skema dari asisten",
    legend: { pwr: "Daya", gnd: "Ground", sig: "Sinyal" },
    hint: "Arahkan ke baris tabel atau kabel untuk menelusuri sambungannya.",
    board: "Papan",
    open: "Buka di tab baru",
  },
  en: {
    wiring: "Wiring diagram",
    schematic: "Actual schematic",
    zoom: "Enlarge the schematic",
    uploaded: "Schematic from the assistant",
    legend: { pwr: "Power", gnd: "Ground", sig: "Signal" },
    hint: "Point at a table row or a wire to trace the connection.",
    board: "Board",
    open: "Open in a new tab",
  },
});

function kindOf(pin: string): Kind {
  const p = pin.toUpperCase();
  if (p.includes("GND")) return "gnd";
  if (/3V3|5V|VCC|VIN|VBUS/.test(p)) return "pwr";
  return "sig";
}

/** "DHT (DATA)" -> ["DHT", "DATA"]; "Tombol (kaki 1)" -> ["Tombol", "kaki 1"]. */
function splitPart(s: string): [string, string] {
  const m = /^(.*?)\s*\((.*)\)\s*$/.exec(s);
  return m ? [m[1].trim(), m[2].trim()] : [s.trim(), ""];
}

export function boardsFrom(pin: PinData, mcu: string): Board[] {
  const pairs = Math.floor(pin.kolom.length / 2);
  const out: Board[] = [];
  for (let p = 0; p < pairs; p++) {
    const head = pin.kolom[p * 2];
    const label = /\((.*)\)/.exec(head)?.[1] ?? mcu;
    const wires: Wire[] = [];
    pin.baris.forEach((row, r) => {
      const comp = row[p * 2];
      const pn = row[p * 2 + 1];
      if (!comp || !pn) return;
      const [part, signalFull] = splitPart(comp);
      wires.push({
        row: r,
        pin: pn,
        part,
        signal: signalFull.split(",")[0].trim(),
        signalFull,
        kind: kindOf(pn),
      });
    });
    out.push({ label: pairs > 1 ? `${mcu} ${label}` : label, wires });
  }
  return out;
}

type Aktif = Record<string, { url: string; namaBerkas: string; bingkai?: boolean }>;
let skemaCache: Promise<Aktif> | null = null;
function activeSchematics() {
  if (!skemaCache) {
    skemaCache = getJson<{ ok: boolean; aktif: Aktif }>("/api/presentasi/schematics")
      .then((d) => (d.ok ? d.aktif : {}))
      .catch(() => ({}));
  }
  return skemaCache;
}

export function useSchematic(
  modul: number,
  fallback: string,
): { src: string; uploaded: boolean; frame: boolean } {
  const [state, setState] = useState({ src: fallback, uploaded: false, frame: false });
  useEffect(() => {
    let alive = true;
    void activeSchematics().then((a) => {
      const hit = a[String(modul)];
      if (alive && hit) setState({ src: hit.url, uploaded: true, frame: !!hit.bingkai });
    });
    return () => {
      alive = false;
    };
  }, [modul]);
  return state;
}

/* ------------------------------------------------------------ the diagram */

const ROW = 40;
const PAD = 26;

function Diagram({
  board,
  active,
  setActive,
  modul,
  compact = false,
}: {
  board: Board;
  active: number | null;
  setActive: (r: number | null) => void;
  modul: number;
  compact?: boolean;
}) {
  const pins = [...new Set(board.wires.map((w) => w.pin))];
  const parts = [...new Set(board.wires.map((w) => w.part))];
  const partSignals = parts.map((p) => board.wires.filter((w) => w.part === p));
  const rightRows = partSignals.reduce((a, s) => a + s.length, 0) + (parts.length - 1) * 0.6;
  const h = Math.max(pins.length, rightRows) * ROW + PAD * 2;
  // The dock is narrow, so its drawing is narrower too (text keeps its size).
  const W = compact ? 380 : 560;
  const mcuX = compact ? 8 : 24;
  const mcuW = compact ? 118 : 150;
  const partX = compact ? 254 : 380;
  const partW = compact ? 118 : 150;
  const pinY = (i: number) => PAD + ROW / 2 + i * ROW + (h - PAD * 2 - pins.length * ROW) / 2;

  let cursor = PAD + (h - PAD * 2 - rightRows * ROW) / 2;
  const partBoxes = partSignals.map((sigs, i) => {
    const top = cursor;
    cursor += sigs.length * ROW + 0.6 * ROW;
    return { name: parts[i], top, height: sigs.length * ROW, sigs };
  });
  const sigY = (w: Wire) => {
    const box = partBoxes.find((b) => b.name === w.part)!;
    const idx = box.sigs.indexOf(w);
    return box.top + ROW / 2 + idx * ROW;
  };

  return (
    <svg
      className="wiring"
      viewBox={`0 0 ${W} ${h}`}
      role="img"
      aria-label={board.wires.map((w) => `${w.part} ${w.signal} ${w.pin}`).join(", ")}
      style={{ "--mod-hue": `var(--mod-${modul})` } as CSSProperties}
    >
      <defs>
        <filter id={`glow-${modul}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* board */}
      <rect
        className="wiring__mcu"
        x={mcuX}
        y={PAD - 8}
        width={mcuW}
        height={h - PAD * 2 + 16}
        rx="12"
      />
      <text className="wiring__mcu-label" x={mcuX + 14} y={PAD + 12}>
        {board.label}
      </text>
      {pins.map((p, i) => (
        <g key={p}>
          <rect
            className="wiring__pad"
            x={mcuX + mcuW - 10}
            y={pinY(i) - 7}
            width="14"
            height="14"
            rx="3"
          />
          <text className="wiring__pin" x={mcuX + mcuW - 16} y={pinY(i) + 4} textAnchor="end">
            {p}
          </text>
        </g>
      ))}

      {/* parts */}
      {partBoxes.map((b) => (
        <g key={b.name}>
          <rect
            className="wiring__part"
            x={partX}
            y={b.top - 6}
            width={partW}
            height={b.height + 12}
            rx="10"
          />
          <text
            className="wiring__part-label"
            x={partX + partW - 12}
            y={b.top + 14}
            textAnchor="end"
          >
            {b.name}
          </text>
          {b.sigs.map((w) => (
            <g key={w.row}>
              <rect
                className="wiring__pad"
                x={partX - 4}
                y={sigY(w) - 7}
                width="14"
                height="14"
                rx="3"
              />
              <text className="wiring__sig" x={partX + 16} y={sigY(w) + 4}>
                {w.signal}
              </text>
            </g>
          ))}
        </g>
      ))}

      {/* wires */}
      {board.wires.map((w) => {
        const y1 = pinY(pins.indexOf(w.pin));
        const y2 = sigY(w);
        const x1 = mcuX + mcuW + 4;
        const x2 = partX - 4;
        const bend = compact ? 50 : 90;
        const d = `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`;
        const on = active === w.row;
        return (
          <g
            key={w.row}
            className="wiring__wire"
            data-kind={w.kind}
            data-on={on ? "yes" : undefined}
            data-dim={active !== null && !on ? "yes" : undefined}
            onMouseEnter={() => setActive(w.row)}
            onMouseLeave={() => setActive(null)}
          >
            <path d={d} className="wiring__hit" />
            <path d={d} className="wiring__line" filter={on ? `url(#glow-${modul})` : undefined} />
            {w.kind === "sig" && <path d={d} className="wiring__pulse" />}
          </g>
        );
      })}
    </svg>
  );
}

/* --------------------------------------------------------------- the panel */

export default function PinSchematic({
  lang,
  modul,
  pin,
  mcu,
  skema,
  variant = "full",
}: {
  lang: Lang;
  modul: number;
  pin: PinData;
  mcu: string;
  skema: string;
  variant?: "full" | "dock";
}) {
  const t = T[lang];
  const boards = useMemo(() => boardsFrom(pin, mcu), [pin, mcu]);
  const [active, setActive] = useState<number | null>(null);
  const [view, setView] = useState(false);
  const sch = useSchematic(modul, skema);

  const table = (
    <table className="pintable">
      <caption className="visually-hidden">{pin.judul}</caption>
      <thead>
        <tr>
          {pin.kolom.map((k, i) => (
            <th key={i} scope="col">
              {k}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {pin.baris.map((row, r) => (
          <tr
            key={r}
            tabIndex={0}
            data-on={active === r ? "yes" : undefined}
            onMouseEnter={() => setActive(r)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(r)}
            onBlur={() => setActive(null)}
          >
            {row.map((c, i) => (
              <td key={i} className={i % 2 ? "mono" : undefined}>
                {i % 2 ? (
                  <span className="pintable__pin" data-kind={kindOf(c)}>
                    {c}
                  </span>
                ) : (
                  c
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  const legend = (
    <div className="wiring-legend" aria-hidden="true">
      {(["pwr", "gnd", "sig"] as const).map((k) => (
        <span key={k} data-kind={k}>
          <i /> {t.legend[k]}
        </span>
      ))}
    </div>
  );

  const schematic = sch.frame ? (
    <div className="schem-thumb schem-thumb--frame">
      <iframe src={sch.src} title={`${t.uploaded} · ${pin.judul}`} loading="lazy" allowFullScreen />
      <span className="schem-thumb__bar">
        <span className="schem-thumb__title">{t.uploaded}</span>
        <a href={sch.src} target="_blank" rel="noopener noreferrer" aria-label={t.open}>
          <ArrowSquareOutIcon size={16} aria-hidden="true" />
        </a>
      </span>
    </div>
  ) : (
    <button
      type="button"
      className="schem-thumb sweep-hover"
      onClick={() => setView(true)}
      aria-label={t.zoom}
    >
      <img src={sch.src} alt={pin.judul} loading="lazy" />
      <span className="schem-thumb__bar">
        <span className="schem-thumb__title">{sch.uploaded ? t.uploaded : t.schematic}</span>
        <ArrowsOutSimpleIcon size={16} aria-hidden="true" />
      </span>
    </button>
  );

  return (
    <div className={`pins pins--${variant}`}>
      <div className="pins__wiring">
        <div className="row row--between">
          <span className="label-caps">
            {t.wiring} · {pin.judul}
          </span>
          {legend}
        </div>
        {boards.map((b) => (
          <Diagram
            key={b.label}
            board={b}
            active={active}
            setActive={setActive}
            modul={modul}
            compact={variant === "dock"}
          />
        ))}
        {variant === "full" && <p className="hint">{t.hint}</p>}
      </div>
      <div className="pins__table">{table}</div>
      <div className="pins__schem">{schematic}</div>
      {pin.catatan.length > 0 && (
        <ul className="pins__notes">
          {pin.catatan.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      )}
      <SchematicViewer
        open={view}
        onOpenChange={setView}
        src={sch.src}
        title={`${pin.judul}`}
        lang={lang}
      />
    </div>
  );
}
