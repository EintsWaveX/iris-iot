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
 *   one bundled with the site. Module 4 bundles none, so without an upload
 *   the schematic cell is left out. A Wokwi, Tinkercad or Canva link
 *   (Phase 9) shows live in a frame instead.
 *
 * `variant="full"` is the Persiapan step's layout; `variant="dock"` is the
 * narrow panel docked beside the code.
 *
 * 2026-10-12: the wiring has two views. Diagram is the drawing above;
 * Papan is the real board's two headers with draggable jumpers
 * (BoardJumper.tsx). It starts empty: every wire waits above its part
 * until it is plugged in, and a wire not plugged in keeps the module's pin
 * in the table and the code. A Praktikan in the running session wires it
 * for their group only: the table and the group's Kode step follow, the
 * module's own pins stay (lib/pin-grup.ts). Anyone else can try it out
 * unsaved. An Asisten with the Jadwal right also gets Atur Pin, the pin
 * settings dialog that sets the module's pins for everyone (PinDialog.tsx).
 */
import { useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import {
  ArrowCounterClockwiseIcon,
  ArrowSquareOutIcon,
  ArrowsOutSimpleIcon,
} from "@phosphor-icons/react";
import SchematicViewer from "../ui/SchematicViewer";
import SegmentedControl from "../ui/SegmentedControl";
import { namaLayanan } from "../../lib/tautan";
import { getJson, dict, useMe } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import "./PinSchematic.css";
import { dengar } from "../../lib/siaran";
import { arahSel, gabungPin, papanModul, type BarisPin } from "../../lib/pin-kode";
import { cekPad, labelPad, padDariLabel, PAPAN, type Pad, type Papan } from "../../lib/papan";
import { usePinGrup } from "../../lib/pin-grup";
import { usePin } from "./usePin";
import BoardJumper from "./BoardJumper";
import PinDialog, { jumpersDari } from "./PinDialog";
import { PJ } from "./pinStrings";
import Disclose from "../ui/Disclose";

const VIEW_KEY = "iris-pin-view";

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
    image: "Gambar",
    source: "Sumber skema",
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
    image: "Image",
    source: "Schematic source",
    zoom: "Enlarge the schematic",
    uploaded: "Schematic from the assistant",
    legend: { pwr: "Power", gnd: "Ground", sig: "Signal" },
    hint: "Point at a table row or a wire to trace the connection.",
    board: "Board",
    open: "Open in a new tab",
  },
  zh: {
    wiring: "接线图",
    schematic: "实际电路图",
    image: "图片",
    source: "电路图来源",
    zoom: "放大电路图",
    uploaded: "助教上传的电路图",
    legend: { pwr: "电源", gnd: "接地", sig: "信号" },
    hint: "指向表格的一行或一根线，可以追踪连接。",
    board: "板子",
    open: "在新标签页打开",
  },
});

function kindOf(pin: string): Kind {
  const p = pin.toUpperCase();
  if (p.includes("GND")) return "gnd";
  if (/3V3|5V|VCC|VIN|VBUS/.test(p)) return "pwr";
  return "sig";
}

/** "DHT (DATA)" -> ["DHT", "DATA"]; "Tombol (kaki 1)" -> ["Tombol", "kaki 1"].
 *  Mandarin writes full-width brackets, "按钮（脚 1）" (2026-10-07: each pin
 *  became its own part, with no signal). */
function splitPart(s: string): [string, string] {
  const m = /^(.*?)\s*[(（](.*)[)）]\s*$/.exec(s);
  return m ? [m[1].trim(), m[2].trim()] : [s.trim(), ""];
}

export function boardsFrom(pin: PinData, mcu: string): Board[] {
  const pairs = Math.floor(pin.kolom.length / 2);
  const out: Board[] = [];
  for (let p = 0; p < pairs; p++) {
    const head = pin.kolom[p * 2];
    const label = /[(（](.*)[)）]/.exec(head)?.[1] ?? mcu;
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
        signal: signalFull.split(/[,，]/)[0].trim(),
        signalFull,
        kind: kindOf(pn),
      });
    });
    out.push({ label: pairs > 1 ? `${mcu} ${label}` : label, wires });
  }
  return out;
}

type Pilihan = { url: string; namaBerkas: string; bingkai?: boolean; jenis?: "berkas" | "tautan" };
type Aktif = Record<string, Pilihan & { pilihan?: Pilihan[] }>;
let skemaCache: Promise<Aktif> | null = null;
function activeSchematics() {
  if (!skemaCache) {
    skemaCache = getJson<{ ok: boolean; aktif: Aktif }>("/api/presentasi/schematics")
      .then((d) => (d.ok ? d.aktif : {}))
      .catch(() => ({}));
  }
  return skemaCache;
}

/** The module's schematic: the Asisten's upload or link when there is one,
 *  else the bundled image. With both an image and a link active,
 *  `pilihan` holds both and `pilih` switches between them. */
export function useSchematic(
  modul: number,
  fallback: string,
): {
  src: string;
  uploaded: boolean;
  frame: boolean;
  gagal: () => void;
  pilihan: Pilihan[];
  idx: number;
  pilih: (i: number) => void;
} {
  const [pilihan, setPilihan] = useState<Pilihan[]>([]);
  const [idx, setIdx] = useState(0);
  const [rusak, setRusak] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const muat = () =>
      void activeSchematics().then((a) => {
        const hit = a[String(modul)];
        if (!alive) return;
        const list = hit ? (hit.pilihan ?? [hit]) : [];
        setPilihan(list);
        setIdx((i) => Math.min(i, Math.max(0, list.length - 1)));
      });
    muat();
    // An Asisten replacing or removing the schematic (live updates).
    const lepas = dengar(["presentasi"], () => {
      skemaCache = null;
      muat();
    });
    return () => {
      alive = false;
      lepas();
    };
  }, [modul]);
  const cur = pilihan[idx] ?? null;
  // An uploaded image that no longer loads falls back to the handbook's own.
  const pakai = cur && cur.url !== rusak ? cur : null;
  return {
    src: pakai ? pakai.url : fallback,
    uploaded: !!pakai,
    frame: !!pakai?.bingkai,
    gagal: () => cur && setRusak(cur.url),
    pilihan,
    idx,
    pilih: setIdx,
  };
}

/* ------------------------------------------------------------ the diagram */

const ROW = 40;
const PAD = 26;
/** The band at the top of each box that holds its name (2026-10-07: the
 *  name sat on the first pin, and a long one ran out of its box). */
const HEAD = 30;

let kanvas: CanvasRenderingContext2D | null | undefined;
/** A label's drawn width: measured with the page's own font once mounted,
 *  estimated before (the same on the server and the first client render). */
function lebar(s: string, bold: boolean, px: number, ukur: boolean): number {
  if (ukur && typeof document !== "undefined") {
    if (kanvas === undefined) kanvas = document.createElement("canvas").getContext("2d");
    if (kanvas) {
      const css = getComputedStyle(document.documentElement);
      const fam = css.getPropertyValue(bold ? "--font-body" : "--font-mono").trim() || "sans-serif";
      kanvas.font = `${bold ? 700 : 400} ${px}px ${fam}`;
      return kanvas.measureText(s).width;
    }
  }
  return [...s].reduce((a, c) => a + (/[　-鿿＀-￯]/.test(c) ? px : px * 0.64), 0);
}

/** True once mounted and the fonts are in, so labels are measured for real. */
function useUkur(): boolean {
  const [siap, setSiap] = useState(false);
  useEffect(() => {
    let alive = true;
    const go = () => alive && setSiap(true);
    if (document.fonts?.ready) void document.fonts.ready.then(go);
    else go();
    return () => {
      alive = false;
    };
  }, []);
  return siap;
}

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
  const ukur = useUkur();
  // Each drawing owns its glow (a shared id could point at another copy's).
  const glow = `glow-${useId().replace(/[^\w-]/g, "")}`;
  const pins = [...new Set(board.wires.map((w) => w.pin))];
  const parts = [...new Set(board.wires.map((w) => w.part))];
  const partSignals = parts.map((p) => board.wires.filter((w) => w.part === p));

  // Widths: each box fits its name and its pin labels; the wires give up
  // room first, and the drawing only widens when they can't (text keeps its
  // size, since the drawing scales to its container).
  const mcuX = compact ? 8 : 24;
  const mcuW = Math.max(
    compact ? 118 : 150,
    lebar(board.label, true, 14, ukur) + 30,
    Math.max(0, ...pins.map((p) => lebar(p, false, 12, ukur))) + 40,
  );
  const partW = Math.max(
    compact ? 118 : 150,
    Math.max(0, ...parts.map((p) => lebar(p, true, 14, ukur))) + 26,
    Math.max(0, ...board.wires.map((w) => lebar(w.signal, false, 12, ukur))) + 36,
  );
  const W = Math.max(compact ? 380 : 560, mcuX * 2 + mcuW + partW + (compact ? 96 : 140));
  const partX = W - mcuX - partW;

  // Heights: a name band on top of every box, then one row per pin.
  const leftH = HEAD + pins.length * ROW;
  const rightH =
    partSignals.reduce((a, sg) => a + HEAD + sg.length * ROW, 0) + (parts.length - 1) * 0.6 * ROW;
  const h = Math.max(leftH, rightH) + PAD * 2;
  const mcuTop = (h - leftH) / 2;
  const pinY = (i: number) => mcuTop + HEAD + ROW / 2 + i * ROW;

  let cursor = (h - rightH) / 2;
  const partBoxes = partSignals.map((sigs, i) => {
    const top = cursor;
    cursor += HEAD + sigs.length * ROW + 0.6 * ROW;
    return { name: parts[i], top, height: HEAD + sigs.length * ROW, sigs };
  });
  const sigY = (w: Wire) => {
    const box = partBoxes.find((b) => b.name === w.part)!;
    const idx = box.sigs.indexOf(w);
    return box.top + HEAD + ROW / 2 + idx * ROW;
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
        {/* Sized in the drawing's own units: a straight, level wire has a
            box zero high, and a region in percent of it draws nothing. */}
        <filter id={glow} filterUnits="userSpaceOnUse" x={0} y={0} width={W} height={h}>
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
        y={mcuTop - 4}
        width={mcuW}
        height={leftH + 8}
        rx="12"
      />
      <text className="wiring__mcu-label" x={mcuX + 14} y={mcuTop + 20}>
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
            y={b.top - 4}
            width={partW}
            height={b.height + 8}
            rx="10"
          />
          <text
            className="wiring__part-label"
            x={partX + partW - 12}
            y={b.top + 20}
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
        const bend = Math.min(compact ? 50 : 90, (x2 - x1) * 0.42);
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
            <path d={d} className="wiring__line" filter={on ? `url(#${glow})` : undefined} />
            {w.kind === "sig" && <path d={d} className="wiring__pulse" />}
          </g>
        );
      })}
    </svg>
  );
}

/* --------------------------------------------------------------- the panel */

/** The wires not plugged in keep the module's pins, unless one just plugged
 *  in took such a pin: that wire moves to the board's first free pin that
 *  suits it, so the table stays one the board can take. */
function geserTerhalang(
  modul: number,
  bawaan: BarisPin,
  baris: BarisPin,
  k: number,
  papan: Papan,
  dicolok: Set<string>,
): BarisPin {
  const out = baris.map((r) => [...r]);
  const gpio = (q: number) => {
    const x = padDariLabel(papan, out[q]?.[k] ?? "");
    return typeof x === "number" ? x : null;
  };
  out.forEach((_, q) => {
    if (dicolok.has(`${q}:${k}`)) return;
    const mine = gpio(q);
    if (mine === null) return;
    const bentrok = out.some((__, r) => r !== q && dicolok.has(`${r}:${k}`) && gpio(r) === mine);
    if (!bentrok) return;
    const dipakai = new Set<number>();
    out.forEach((__, r) => {
      const g = r === q ? null : gpio(r);
      if (g !== null) dipakai.add(g);
    });
    const arah = arahSel(modul, bawaan, q, k);
    const lain = [...papan.kiri, ...papan.kanan].find(
      (p): p is number => typeof p === "number" && cekPad(papan, p, arah, dipakai) === null,
    );
    if (lain !== undefined) out[q][k] = labelPad(papan, lain);
  });
  return out;
}

export default function PinSchematic({
  lang,
  modul,
  pin: pinBawaan,
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
  const pj = PJ[lang];
  const me = useMe();
  // The module's pins as set by the Asisten over this language's table
  // (names stay), then the group's own wiring over those.
  const data = usePin();
  const simpan = data?.pin[String(modul)] ?? null;
  const papanIds = data?.papan[String(modul)] ?? papanModul(modul);
  const grup = usePinGrup(modul);
  const dasar = useMemo(() => gabungPin(pinBawaan.baris, simpan), [pinBawaan, simpan]);
  const efektif = useMemo(
    () => (grup.baris ? gabungPin(pinBawaan.baris, grup.baris) : dasar),
    [pinBawaan, grup.baris, dasar],
  );
  const pin = useMemo(() => ({ ...pinBawaan, baris: efektif }), [pinBawaan, efektif]);
  const boards = useMemo(
    () => boardsFrom(pin, PAPAN[papanIds[0]]?.nama ?? mcu),
    [pin, mcu, papanIds.join()],
  );
  const [active, setActive] = useState<number | null>(null);
  const [lihat, setLihat] = useState<"diagram" | "papan">(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "diagram" ? "diagram" : "papan";
    } catch {
      return "papan";
    }
  });
  const [atur, setAtur] = useState(false);
  const bolehAtur = me?.role === "asisten" && me.hak?.jadwal === true;
  const diubah = (r: number, k: number) => efektif[r]?.[k] !== dasar[r]?.[k];
  const bawaanId = data?.bawaan[String(modul)] ?? null;
  const dasarId: BarisPin = bawaanId ? gabungPin(bawaanId, simpan) : dasar;

  // Every wire's pin cell ("row:column") on the boards, and those plugged in.
  const semuaSel = useMemo(() => {
    const out: string[] = [];
    papanIds.forEach((_, p) => {
      const k = p * 2 + 1;
      pinBawaan.baris.forEach((row, r) => {
        if (row[k - 1] && efektif[r]?.[k]) out.push(`${r}:${k}`);
      });
    });
    return out;
  }, [papanIds.join(), pinBawaan, efektif]);
  const dicolok = semuaSel.filter((c) => {
    const [r, k] = c.split(":").map(Number);
    return grup.terpasang(r, k);
  });

  /** Plugs one wire in (or moves it) for the group, or as a try out */
  async function pindah(p: number, row: number, pad: Pad) {
    const b = PAPAN[papanIds[p]];
    const k = p * 2 + 1;
    const lama = grup.baris ?? dasarId;
    const colok = new Set([...dicolok, `${row}:${k}`]);
    const baru = geserTerhalang(
      modul,
      bawaanId ?? dasarId,
      lama.map((r, i) => (i === row ? r.map((c, j) => (j === k ? labelPad(b, pad) : c)) : r)),
      k,
      b,
      colok,
    );
    const ok = await grup.simpan(baru, [...colok]);
    const comp = pinBawaan.baris[row]?.[p * 2] ?? "";
    if (ok) window.Toast?.show(pj.moved(comp, labelPad(b, pad)), "ok");
    else window.Toast?.show(pj.fail, "danger");
  }
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
                  <span
                    className="pintable__pin"
                    data-kind={kindOf(c)}
                    data-changed={diubah(r, i) ? "yes" : undefined}
                    title={diubah(r, i) ? `${dasar[r][i]} → ${c}` : undefined}
                  >
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

  const schematic = !sch.src ? null : sch.frame ? (
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
      <img src={sch.src} alt={pin.judul} loading="lazy" onError={sch.gagal} />
      <span className="schem-thumb__bar">
        <span className="schem-thumb__title">{sch.uploaded ? t.uploaded : t.schematic}</span>
        <ArrowsOutSimpleIcon size={16} aria-hidden="true" />
      </span>
    </button>
  );

  return (
    <div className={`pins pins--${variant}${schematic ? "" : " pins--noschem"}`}>
      <div className="pins__wiring">
        <div className="row row--between">
          <span className="label-caps">
            {t.wiring} · {pin.judul}
          </span>
          {legend}
        </div>
        <div className="pins__tools">
          <SegmentedControl
            fill
            aria-label={pj.viewLabel}
            value={lihat}
            onValueChange={(v) => {
              const x = v === "diagram" ? "diagram" : "papan";
              setLihat(x);
              try {
                localStorage.setItem(VIEW_KEY, x);
              } catch {
                /* private mode: this visit keeps it */
              }
            }}
            options={[
              { value: "papan", label: pj.papan },
              { value: "diagram", label: pj.diagram },
            ]}
          />
          {bolehAtur && (
            <button type="button" className="btn btn--inverse" onClick={() => setAtur(true)}>
              {pj.open}
            </button>
          )}
        </div>
        {lihat === "diagram"
          ? boards.map((b) => (
              <Diagram
                key={b.label}
                board={b}
                active={active}
                setActive={setActive}
                modul={modul}
                compact={variant === "dock"}
              />
            ))
          : papanIds.map((id, p) => {
              const kepala = /[(（](.*)[)）]/.exec(pin.kolom[p * 2] ?? "")?.[1];
              return (
                <BoardJumper
                  key={`${id}-${p}`}
                  papan={PAPAN[id]}
                  judul={
                    papanIds.length > 1 && kepala ? `${PAPAN[id].nama} · ${kepala}` : PAPAN[id].nama
                  }
                  jumpers={jumpersDari(
                    modul,
                    pinBawaan.baris,
                    pinBawaan.baris,
                    efektif,
                    p,
                    grup.terpasang,
                    dasar,
                  )}
                  modul={modul}
                  active={active}
                  setActive={setActive}
                  t={pj}
                  onMove={grup.boleh ? (row, pad) => void pindah(p, row, pad) : undefined}
                />
              );
            })}
        {lihat === "papan" && (
          <div className="pins__mine">
            {grup.baris && (
              <span className="pill pill--warn">{grup.grup ? pj.yours : pj.yoursTry}</span>
            )}
            <span className="grow" />
            {grup.boleh && dicolok.length < semuaSel.length && (
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={async () => {
                  if (await grup.simpan(grup.baris ?? dasarId, semuaSel))
                    window.Toast?.show(pj.plugAllDone, "ok");
                }}
              >
                {pj.plugAll}
              </button>
            )}
            {grup.baris && grup.boleh && (
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={async () => {
                  if (await grup.simpan(null)) window.Toast?.show(pj.resetDone, "ok");
                }}
              >
                <ArrowCounterClockwiseIcon size={16} weight="bold" aria-hidden="true" />
                {pj.reset}
              </button>
            )}
          </div>
        )}
        {/* Phase 21 (f8): the board's how-to on demand. */}
        {lihat === "papan" && (
          <Disclose className="pins__cara" head={pj.howTo}>
            <p className="hint">
              {!grup.boleh ? pj.readHint : grup.grup ? pj.yoursHint : pj.tryHint}
            </p>
          </Disclose>
        )}
        {variant === "full" && lihat === "diagram" && <p className="hint">{t.hint}</p>}
      </div>
      <div className="pins__table">{table}</div>
      {schematic && (
        <div className="pins__schem">
          {sch.pilihan.length > 1 && (
            <SegmentedControl
              fill
              aria-label={t.source}
              value={String(sch.idx)}
              onValueChange={(v) => sch.pilih(Number(v))}
              options={sch.pilihan.map((p, i) => ({
                value: String(i),
                label: p.jenis === "tautan" ? namaLayanan(p.url) : t.image,
              }))}
            />
          )}
          {schematic}
        </div>
      )}
      {pin.catatan.length > 0 && (
        <ul className="pins__notes">
          {pin.catatan.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      )}
      {bolehAtur && (
        <PinDialog
          lang={lang}
          modul={modul}
          open={atur}
          onOpenChange={setAtur}
          nama={pinBawaan.baris}
          kolom={pinBawaan.kolom}
        />
      )}
      {schematic && (
        <SchematicViewer
          open={view}
          onOpenChange={setView}
          src={sch.src}
          title={`${pin.judul}`}
          lang={lang}
        />
      )}
    </div>
  );
}
