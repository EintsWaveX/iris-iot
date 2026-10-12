/**
 * The board seen from above with its jumper wires (2026-10-12): both pin
 * headers of the real board as two rows of pads, each named level on the
 * board, the module's parts below, and one wire per connection from its pin
 * to the part.
 *
 * The wires run like a drawn schematic: out of the header, along a lane of
 * their own above or below the board, round its nearer side instead of over
 * the chip, turning with 45 degree corners. The lanes are ordered so as few
 * wires cross as can be. A wire with no pin yet (label "") waits unplugged
 * just above its part.
 *
 * With `onMove`, each wire's plug can be dragged to a pad, or picked with a
 * click (or Enter) and then dropped with a click on a pad. While a wire is
 * held, only the pads that can take it light up (papan.ts says which: no
 * flash or serial pins, no input only pin for an output, ADC1 only for an
 * analog part, one GPIO per wire); the rest dim and say why, and the
 * module's own pin for it wears a dashed ring. A moved wire glides to its
 * new pin. Without `onMove` the board only shows, and a click on a wire
 * still shows where it could go.
 *
 * The view zooms like an MCU editor: the buttons, Ctrl with the wheel (or a
 * trackpad pinch), or two fingers; dragging the background pans it. A phone
 * opens it zoomed in far enough to read the pins.
 *
 * Shared by every Pin dan Skema card (a Praktikan's own wiring) and the pin
 * settings dialog (the Asisten's, saved for everyone).
 */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as RPointerEvent,
} from "react";
import { MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon } from "@phosphor-icons/react";
import IconButton from "../ui/IconButton";
import Tooltip from "../ui/Tooltip";
import {
  cekPad,
  labelPad,
  namaPad,
  padDariLabel,
  type Arah,
  type Pad,
  type Papan,
} from "../../lib/papan";
import type { PJx } from "./pinStrings";

export interface Jumper {
  /** The pin table's row */
  row: number;
  part: string;
  signal: string;
  /** The pin it is on now, as the table writes it ("" = not plugged in) */
  label: string;
  /** The module's own pin for it, ringed while the wire is held */
  bawaan?: string;
  arah: Arah;
  kind: "pwr" | "gnd" | "sig";
}

interface Titik {
  x: number;
  y: number;
}

interface PadPos extends Titik {
  key: string;
  pad: Pad;
  atas: boolean;
}

/* ---------------------------------------------------------------- sizes */
const P = 32;
const TEPI = 22;
const PAD_IN = 22;
const BOARD_H = 200;
const PART_H = 64;
const SIG_W = 64;
/** The room between two wires' lanes */
const L = 10;
/** How far a corner is cut, so a turn is two 45 degree bends */
const CH = 7;
/** How far above its part an unplugged wire's end waits */
const PARK = 26;
const Z_MAX = 4;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** A pad's name in lines short enough to sit level between two pads:
 *  "3V3_EN" -> ["3V3", "EN"], "ADC_VREF" -> ["ADC", "VREF"]. */
function barisNama(pad: Pad): string[] {
  const s = namaPad(pad);
  if (s.length <= 4) return [s];
  return s.replace(/\)$/, "").split(/[_(]/).filter(Boolean).slice(0, 2);
}

/* -------------------------------------------------------------- routing */

interface Kawat {
  row: number;
  dari: Titik;
  ke: Titik;
  atas: boolean;
}

interface Geo {
  laneAtas: (k: number) => number;
  laneKiri: (k: number) => number;
  laneKanan: (k: number) => number;
  laneBawah: (k: number) => number;
}

/** Drops repeated points and the middle of straight runs */
function rapikan(pts: Titik[]): Titik[] {
  const out: Titik[] = [];
  for (const p of pts) {
    const a = out[out.length - 1];
    if (a && Math.abs(a.x - p.x) < 0.5 && Math.abs(a.y - p.y) < 0.5) continue;
    const b = out[out.length - 2];
    if (
      a &&
      b &&
      ((Math.abs(b.x - a.x) < 0.5 && Math.abs(a.x - p.x) < 0.5) ||
        (Math.abs(b.y - a.y) < 0.5 && Math.abs(a.y - p.y) < 0.5))
    )
      out.pop();
    out.push(p);
  }
  return out;
}

/** How badly a set of routes tangles: each crossing counts 1, two wires
 *  running along the same line count 3. */
function kusut(rutes: Titik[][]): number {
  const seg = rutes.map((r) => r.slice(1).map((p, i) => [r[i], p] as const));
  let n = 0;
  for (let i = 0; i < seg.length; i++)
    for (let j = i + 1; j < seg.length; j++)
      for (const [a1, a2] of seg[i])
        for (const [b1, b2] of seg[j]) {
          const aV = Math.abs(a1.x - a2.x) < 0.5;
          const bV = Math.abs(b1.x - b2.x) < 0.5;
          if (aV !== bV) {
            const [v1, v2, h1, h2] = aV ? [a1, a2, b1, b2] : [b1, b2, a1, a2];
            const x = v1.x;
            const y = h1.y;
            if (
              x > Math.min(h1.x, h2.x) + 0.5 &&
              x < Math.max(h1.x, h2.x) - 0.5 &&
              y > Math.min(v1.y, v2.y) + 0.5 &&
              y < Math.max(v1.y, v2.y) - 0.5
            )
              n += 1;
          } else if (aV && Math.abs(a1.x - b1.x) < 0.5) {
            const lo = Math.max(Math.min(a1.y, a2.y), Math.min(b1.y, b2.y));
            const hi = Math.min(Math.max(a1.y, a2.y), Math.max(b1.y, b2.y));
            if (hi - lo > 0.5) n += 3;
          } else if (!aV && Math.abs(a1.y - b1.y) < 0.5) {
            const lo = Math.max(Math.min(a1.x, a2.x), Math.min(b1.x, b2.x));
            const hi = Math.min(Math.max(a1.x, a2.x), Math.max(b1.x, b2.x));
            if (hi - lo > 0.5) n += 3;
          }
        }
  return n;
}

/** Every wire's route. A bottom header wire drops into its lane below the
 *  board and runs to its part; a top header wire climbs to a lane above,
 *  goes round the nearer side and joins the lanes below. The lanes above
 *  and beside are ordered so those wires never cross each other; the lanes
 *  below are ordered by a short search for the fewest crossings. */
function rutekan(ws: Kawat[], g: Geo, kiriX: number, kananX: number): Map<number, Titik[]> {
  const atas = ws.filter((w) => w.atas);
  const sisi = new Map<number, "kiri" | "kanan">();
  for (const w of atas) {
    const kiri = w.dari.x - kiriX + Math.abs(w.ke.x - kiriX);
    const kanan = kananX - w.dari.x + Math.abs(kananX - w.ke.x);
    sisi.set(w.row, kiri <= kanan ? "kiri" : "kanan");
  }
  const ki = atas.filter((w) => sisi.get(w.row) === "kiri").sort((a, b) => a.dari.x - b.dari.x);
  const ka = atas.filter((w) => sisi.get(w.row) === "kanan").sort((a, b) => b.dari.x - a.dari.x);
  // The two sides share the lanes above unless their runs overlap.
  const tumpang =
    ki.length > 0 &&
    ka.length > 0 &&
    Math.max(...ki.map((w) => w.dari.x)) > Math.min(...ka.map((w) => w.dari.x));
  const lajurAtas = new Map<number, number>();
  ki.forEach((w, i) => lajurAtas.set(w.row, i));
  ka.forEach((w, i) => lajurAtas.set(w.row, i + (tumpang ? ki.length : 0)));
  const sisiLajur = new Map<number, number>();
  ki.forEach((w, i) => sisiLajur.set(w.row, i));
  ka.forEach((w, i) => sisiLajur.set(w.row, i));

  const rute = (w: Kawat, bawah: number): Titik[] => {
    const yb = g.laneBawah(bawah);
    if (!w.atas) return rapikan([w.dari, { x: w.dari.x, y: yb }, { x: w.ke.x, y: yb }, w.ke]);
    const ya = g.laneAtas(lajurAtas.get(w.row) ?? 0);
    const k = sisiLajur.get(w.row) ?? 0;
    const xs = sisi.get(w.row) === "kiri" ? g.laneKiri(k) : g.laneKanan(k);
    return rapikan([
      w.dari,
      { x: w.dari.x, y: ya },
      { x: xs, y: ya },
      { x: xs, y: yb },
      { x: w.ke.x, y: yb },
      w.ke,
    ]);
  };

  // Start from the side the wire comes down on, then swap lanes while it
  // untangles anything.
  const masuk = (w: Kawat) =>
    !w.atas ? w.dari.x : sisi.get(w.row) === "kiri" ? -1e4 + w.dari.x : 1e4 - w.dari.x;
  const urut = [...ws].sort((a, b) => masuk(a) - masuk(b) || a.ke.x - b.ke.x);
  const nilai = (o: Kawat[]) => kusut(o.map((w, i) => rute(w, i)));
  let terbaik = nilai(urut);
  for (let putaran = 0; putaran < 12 && terbaik > 0; putaran++) {
    let lebihBaik = false;
    for (let i = 0; i < urut.length; i++)
      for (let j = i + 1; j < urut.length; j++) {
        [urut[i], urut[j]] = [urut[j], urut[i]];
        const v = nilai(urut);
        if (v < terbaik) {
          terbaik = v;
          lebihBaik = true;
        } else [urut[i], urut[j]] = [urut[j], urut[i]];
      }
    if (!lebihBaik) break;
  }
  return new Map(urut.map((w, i) => [w.row, rute(w, i)]));
}

/** A route as a path with its corners cut at 45 degrees */
function jalur(pts: Titik[]): string {
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, b, c] = [pts[i - 1], pts[i], pts[i + 1]];
    const l1 = Math.hypot(b.x - a.x, b.y - a.y);
    const l2 = Math.hypot(c.x - b.x, c.y - b.y);
    const k = Math.min(CH, l1 / 2, l2 / 2);
    d += ` L${b.x - ((b.x - a.x) / l1) * k},${b.y - ((b.y - a.y) / l1) * k}`;
    d += ` L${b.x + ((c.x - b.x) / l2) * k},${b.y + ((c.y - b.y) / l2) * k}`;
  }
  const z = pts[pts.length - 1];
  return `${d} L${z.x},${z.y}`;
}

/* ---------------------------------------------------------------- board */

export default function BoardJumper({
  papan,
  judul,
  jumpers,
  modul,
  active,
  setActive,
  onMove,
  t,
}: {
  papan: Papan;
  judul: string;
  jumpers: Jumper[];
  modul: number;
  active: number | null;
  setActive: (r: number | null) => void;
  onMove?: (row: number, pad: Pad) => void;
  t: PJx;
}) {
  const glow = `jg-${useId().replace(/[^\w-]/g, "")}`;
  const svg = useRef<SVGSVGElement | null>(null);
  const wrap = useRef<HTMLDivElement | null>(null);

  /* ------------------------------------------------------------ layout */
  // Sized for every wire plugged in, so plugging one never moves the board.
  const nKabel = jumpers.length;
  const n = Math.max(papan.kiri.length, papan.kanan.length);
  const boardW = n * P + TEPI * 2;
  const parts = useMemo(() => {
    const names = [...new Set(jumpers.map((j) => j.part))];
    return names.map((name) => ({ name, sigs: jumpers.filter((j) => j.part === name) }));
  }, [jumpers]);
  const partW = parts.map((p) => Math.max(p.sigs.length * SIG_W + 20, p.name.length * 8.5 + 28));
  const partsTotal = partW.reduce((a, b) => a + b, 0) + Math.max(0, parts.length - 1) * 22;
  const SIDE = 40 + nKabel * L;
  const W = Math.max(boardW + SIDE * 2, partsTotal + 40);
  const boardX = (W - boardW) / 2;
  const BOARD_Y = 34 + nKabel * L;
  const topY = BOARD_Y + PAD_IN;
  const botY = BOARD_Y + BOARD_H - PAD_IN;
  const laneBawah0 = BOARD_Y + BOARD_H + 20;
  const partsY = laneBawah0 + nKabel * L + 44;
  const H = partsY + PART_H + 16;
  const geo: Geo = {
    laneAtas: (k) => BOARD_Y - 16 - k * L,
    laneKiri: (k) => boardX - 30 - k * L,
    laneKanan: (k) => boardX + boardW + 16 + k * L,
    laneBawah: (k) => laneBawah0 + k * L,
  };

  const pads: PadPos[] = useMemo(() => {
    const out: PadPos[] = [];
    const row = (list: Pad[], atas: boolean) =>
      list.forEach((pad, i) =>
        out.push({
          key: `${atas ? "a" : "b"}${i}`,
          pad,
          atas,
          x: boardX + TEPI + P / 2 + i * P,
          y: atas ? topY : botY,
        }),
      );
    row(papan.kiri, true);
    row(papan.kanan, false);
    return out;
  }, [papan, boardX, topY, botY]);

  const sigPos = useMemo(() => {
    const m = new Map<number, Titik>();
    let x = (W - partsTotal) / 2;
    parts.forEach((p, i) => {
      const w = partW[i];
      const lebarSig = p.sigs.length * SIG_W;
      p.sigs.forEach((j, k) =>
        m.set(j.row, { x: x + (w - lebarSig) / 2 + SIG_W / 2 + k * SIG_W, y: partsY }),
      );
      x += w + 22;
    });
    return m;
  }, [parts, partW, partsTotal, W, partsY]);

  /* ------------------------------------------- which pad each wire is on */
  // Power and ground name several pads: the one a wire was dropped on is
  // remembered, else the first of that name.
  const [fisik, setFisik] = useState<Record<number, string>>({});
  const padOf = (j: Jumper): PadPos | null => {
    if (!j.label) return null;
    const pad = padDariLabel(papan, j.label);
    if (pad === null) return null;
    const ingat = fisik[j.row];
    const hit = pads.find((p) => p.key === ingat && p.pad === pad);
    return hit ?? pads.find((p) => p.pad === pad) ?? null;
  };
  const dipakaiSelain = (row: number) => {
    const s = new Set<number>();
    for (const j of jumpers) {
      if (j.row === row || !j.label) continue;
      const p = padDariLabel(papan, j.label);
      if (typeof p === "number") s.add(p);
    }
    return s;
  };
  const parkir = (j: Jumper): Titik | null => {
    const s = sigPos.get(j.row);
    return s ? { x: s.x, y: s.y - PARK } : null;
  };

  /* ---------------------------------------------- holding and moving */
  const [pegang, setPegang] = useState<{ row: number; at: Titik | null; mulai: Titik } | null>(
    null,
  );
  const [pilih, setPilih] = useState<number | null>(null);
  const kabel = pegang?.row ?? pilih;
  const kabelJ = kabel === null ? null : (jumpers.find((j) => j.row === kabel) ?? null);
  const alasanPad = (p: PadPos): string | null => {
    if (!kabelJ) return null;
    return cekPad(papan, p.pad, kabelJ.arah, dipakaiSelain(kabelJ.row));
  };
  // The module's own pin for the held wire (the first pad of that name).
  const padRumah = useMemo(() => {
    const b = kabelJ?.bawaan ? padDariLabel(papan, kabelJ.bawaan) : null;
    return b === null ? null : (pads.find((p) => p.pad === b)?.key ?? null);
  }, [kabelJ, papan, pads]);

  // The glide: a wire whose pin changed moves from where it was last drawn.
  const lalu = useRef(new Map<number, Titik>());
  const kini = useRef(new Map<number, Titik>());
  const [anim, setAnim] = useState<Record<number, { dari: Titik; t0: number }>>({});
  const [, setFrame] = useState(0);
  const target = (j: Jumper): Titik | null => {
    const p = padOf(j);
    return p ? { x: p.x, y: p.y } : parkir(j);
  };
  const sebelum = useRef(new Map<number, string>());
  useLayoutEffect(() => {
    const baru: Record<number, { dari: Titik; t0: number }> = {};
    for (const j of jumpers) {
      const kunci = padOf(j)?.key ?? "parkir";
      const lama = sebelum.current.get(j.row);
      if (lama !== undefined && lama !== kunci) {
        const dari = lalu.current.get(j.row);
        if (dari) baru[j.row] = { dari, t0: performance.now() };
      }
      sebelum.current.set(j.row, kunci);
    }
    lalu.current = kini.current;
    if (Object.keys(baru).length) setAnim((a) => ({ ...a, ...baru }));
  });
  useEffect(() => {
    if (!Object.keys(anim).length) return;
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const sisa = Object.fromEntries(
        Object.entries(anim).filter(([, a]) => now - a.t0 < 420),
      ) as typeof anim;
      if (Object.keys(sisa).length !== Object.keys(anim).length) setAnim(sisa);
      else setFrame((f) => f + 1);
      if (Object.keys(sisa).length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [anim]);

  const reduce =
    typeof document !== "undefined" && document.documentElement.dataset.motionTier === "0";
  const posOf = (j: Jumper): Titik | null => {
    if (pegang?.row === j.row && pegang.at) return pegang.at;
    const to = target(j);
    if (!to) return null;
    const a = anim[j.row];
    if (!a || reduce) return to;
    const k = ease(Math.min(1, (performance.now() - a.t0) / 420));
    return { x: lerp(a.dari.x, to.x, k), y: lerp(a.dari.y, to.y, k) };
  };

  function keSvg(e: { clientX: number; clientY: number }): Titik | null {
    const el = svg.current;
    const m = el?.getScreenCTM();
    if (!el || !m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }

  function terdekat(at: Titik): PadPos | null {
    let best: PadPos | null = null;
    let d = 22 * 22;
    for (const p of pads) {
      const dd = (p.x - at.x) ** 2 + (p.y - at.y) ** 2;
      if (dd < d) {
        d = dd;
        best = p;
      }
    }
    return best;
  }

  /** Drops a wire on a pad; false when it stays where it was */
  function lepas(row: number, p: PadPos | null): boolean {
    const j = jumpers.find((x) => x.row === row);
    if (!j || !p || !onMove) return false;
    const sekarang = padOf(j);
    if (sekarang?.key === p.key) return false;
    const why = cekPad(papan, p.pad, j.arah, dipakaiSelain(row));
    if (why) {
      window.Toast?.show(t.cantDrop(labelPad(papan, p.pad), t.alasan[why] ?? why), "warn");
      return false;
    }
    if (typeof p.pad === "string") {
      setFisik((f) => ({ ...f, [row]: p.key }));
      // Another pad of the same name: only the drawing moves.
      if (sekarang && padDariLabel(papan, j.label) === p.pad) return true;
    }
    onMove(row, p.pad);
    return true;
  }

  /* ------------------------------------------------------------- zoom */
  const [lebarWrap, setLebarWrap] = useState(0);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setLebarWrap(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const sempit = lebarWrap > 0 && lebarWrap < 560;
  // A phone shows a taller window onto the board than the board itself.
  const rasio = sempit ? Math.max(H / W, 1.05) : H / W;
  const [vista, setVista] = useState({ z: 1, x: 0, y: 0 });
  const vw = W / vista.z;
  const vh = vw * rasio;
  const tata = (z: number, x: number, y: number) => {
    const zz = clamp(z, 1, Z_MAX);
    const w = W / zz;
    const h = w * rasio;
    return {
      z: zz,
      x: w >= W ? (W - w) / 2 : clamp(x, 0, W - w),
      y: h >= H ? (H - h) / 2 : clamp(y, 0, H - h),
    };
  };
  const vx = tata(vista.z, vista.x, vista.y).x;
  const vy = tata(vista.z, vista.x, vista.y).y;
  const zoomDi = (f: number, p: Titik) =>
    setVista((v) => {
      const a = tata(v.z, v.x, v.y);
      const w0 = W / a.z;
      const h0 = w0 * rasio;
      const z = clamp(a.z * f, 1, Z_MAX);
      const w = W / z;
      const h = w * rasio;
      return tata(z, p.x - ((p.x - a.x) / w0) * w, p.y - ((p.y - a.y) / h0) * h);
    });
  const tengah = () => ({ x: vx + vw / 2, y: vy + vh / 2 });
  // The first look: a phone zooms in until the pads are a fingertip apart,
  // the whole drawing's middle in view.
  const awal = useRef(false);
  useEffect(() => {
    if (awal.current || lebarWrap <= 0) return;
    awal.current = true;
    const jarak = P * (lebarWrap / W);
    const z = sempit ? clamp(Math.floor((22 / jarak) * 4) / 4, 1, 3) : 1;
    const w = W / z;
    setVista(tata(z, W / 2 - w / 2, H / 2 - (w * rasio) / 2));
  }, [lebarWrap]);

  // Ctrl (or a trackpad pinch) with the wheel zooms; a plain wheel scrolls
  // the page as ever.
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const on = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const p = keSvg(e);
      if (p) zoomDi(Math.exp(-e.deltaY * 0.0025), p);
    };
    el.addEventListener("wheel", on, { passive: false });
    return () => el.removeEventListener("wheel", on);
  });

  // Dragging the background pans; two fingers pinch.
  const jari = useRef(new Map<number, { x: number; y: number }>());
  const geser = useRef<{ cx: number; cy: number; vx: number; vy: number } | null>(null);
  const cubit = useRef<{ d: number; z: number; mid: Titik } | null>(null);
  const diperbesar = vw < W - 0.5 || vh < H - 0.5;

  const bgTurun = (e: RPointerEvent<SVGSVGElement>) => {
    if ((e.target as Element).closest?.(".jumper__plug, .jumper__target")) return;
    jari.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    svg.current?.setPointerCapture?.(e.pointerId);
    if (jari.current.size === 2) {
      const [a, b] = [...jari.current.values()];
      const mid = keSvg({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
      if (mid) cubit.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: vista.z, mid };
      geser.current = null;
    } else if (jari.current.size === 1) {
      geser.current = { cx: e.clientX, cy: e.clientY, vx, vy };
    }
  };
  const bgGerak = (e: RPointerEvent<SVGSVGElement>) => {
    if (!jari.current.has(e.pointerId)) return false;
    jari.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const c = cubit.current;
    if (c && jari.current.size >= 2) {
      const [a, b] = [...jari.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (c.d > 0) zoomDi((c.z * (d / c.d)) / vista.z, c.mid);
      return true;
    }
    const g = geser.current;
    const el = svg.current;
    if (g && el && diperbesar) {
      const s = vw / el.getBoundingClientRect().width;
      setVista({ z: vista.z, x: g.vx - (e.clientX - g.cx) * s, y: g.vy - (e.clientY - g.cy) * s });
      return true;
    }
    return false;
  };
  const bgNaik = (e: RPointerEvent<SVGSVGElement>) => {
    jari.current.delete(e.pointerId);
    if (jari.current.size < 2) cubit.current = null;
    if (!jari.current.size) geser.current = null;
  };

  /* ------------------------------------------------ the plug's pointer */
  const turun = (j: Jumper) => (e: RPointerEvent<SVGElement>) => {
    if (e.button !== 0) return;
    const at = keSvg(e);
    if (!at) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setPegang({ row: j.row, at: null, mulai: at });
    setActive(j.row);
  };
  const gerak = (e: RPointerEvent<SVGSVGElement>) => {
    if (bgGerak(e)) return;
    if (!pegang || !onMove) return;
    const at = keSvg(e);
    if (!at) return;
    const jauh = (at.x - pegang.mulai.x) ** 2 + (at.y - pegang.mulai.y) ** 2 > 16;
    if (pegang.at || jauh) setPegang({ ...pegang, at });
  };
  const naik = (e: RPointerEvent<SVGSVGElement>) => {
    bgNaik(e);
    if (!pegang) return;
    const row = pegang.row;
    if (pegang.at) {
      const dari = pegang.at;
      // A wire dropped where it can't go springs back to its pin.
      if (!lepas(row, terdekat(dari)))
        setAnim((a) => ({ ...a, [row]: { dari, t0: performance.now() } }));
      setPilih(null);
    } else {
      // A click without a drag picks the wire (or drops the pick).
      setPilih((p) => (p === row ? null : row));
    }
    setPegang(null);
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  };

  useEffect(() => {
    if (pilih === null) return;
    const on = (e: KeyboardEvent) => e.key === "Escape" && setPilih(null);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [pilih]);

  const hover = pegang?.at ? terdekat(pegang.at) : null;

  /* ------------------------------------------------------------ drawing */
  const posisi = new Map<number, Titik>();
  for (const j of jumpers) {
    const p = posOf(j);
    if (p) posisi.set(j.row, p);
  }
  kini.current = posisi;

  // The routes of the plugged wires, worked out again only when a pin moves.
  const kunciRute = jumpers.map((j) => `${j.row}:${padOf(j)?.key ?? ""}`).join(",");
  const rutes = useMemo(() => {
    const ws: Kawat[] = [];
    for (const j of jumpers) {
      const p = padOf(j);
      const s = sigPos.get(j.row);
      if (p && s) ws.push({ row: j.row, dari: { x: p.x, y: p.y }, ke: s, atas: p.atas });
    }
    return rutekan(ws, geo, geo.laneKiri(0), geo.laneKanan(0));
  }, [kunciRute, sigPos, W, H]);

  const zoomBar = (
    <div className="jumper-zoom" role="group" aria-label={t.zoomLabel}>
      <IconButton
        icon={MagnifyingGlassMinusIcon}
        label={t.zoomOut}
        sm
        disabled={vista.z <= 1}
        onClick={() => zoomDi(1 / 1.4, tengah())}
      />
      <Tooltip label={t.zoomFit}>
        <button
          type="button"
          className="jumper-zoom__pct mono"
          aria-label={t.zoomFit}
          onClick={() => setVista(tata(1, 0, 0))}
        >
          {Math.round(vista.z * 100)}%
        </button>
      </Tooltip>
      <IconButton
        icon={MagnifyingGlassPlusIcon}
        label={t.zoomIn}
        sm
        disabled={vista.z >= Z_MAX}
        onClick={() => zoomDi(1.4, tengah())}
      />
    </div>
  );

  return (
    <div className="jumper-wrap" ref={wrap}>
      {zoomBar}
      <svg
        ref={svg}
        className="jumper"
        viewBox={`${vx} ${vy} ${vw} ${vh}`}
        role="group"
        aria-label={`${judul}: ${jumpers.map((j) => `${j.part} ${j.signal} ${j.label}`).join(", ")}`}
        style={
          {
            "--mod-hue": `var(--mod-${modul})`,
            touchAction: diperbesar ? "none" : "pan-y",
          } as CSSProperties
        }
        data-holding={kabel !== null ? "yes" : undefined}
        data-zoom={diperbesar ? "yes" : undefined}
        onPointerDown={bgTurun}
        onPointerMove={gerak}
        onPointerUp={naik}
        onPointerCancel={bgNaik}
      >
        <defs>
          <filter id={glow} filterUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* the board, its USB port on the left */}
        <rect
          className="jumper__usb"
          x={boardX - 14}
          y={BOARD_Y + BOARD_H / 2 - 18}
          width={22}
          height={36}
          rx={4}
        />
        <rect
          className="wiring__mcu"
          x={boardX}
          y={BOARD_Y}
          width={boardW}
          height={BOARD_H}
          rx={14}
        />
        <rect
          className="jumper__chip"
          x={boardX + boardW * 0.18}
          y={BOARD_Y + BOARD_H / 2 - 15}
          width={boardW * 0.64}
          height={30}
          rx={6}
        />
        <text
          className="wiring__mcu-label"
          x={boardX + boardW / 2}
          y={BOARD_Y + BOARD_H / 2 + 5}
          textAnchor="middle"
        >
          {judul}
        </text>

        {pads.map((p) => {
          const why = alasanPad(p);
          const bisa = kabelJ !== null && why === null;
          const dipakai = jumpers.some((j) => padOf(j)?.key === p.key);
          const lbl = labelPad(papan, p.pad);
          const strap = typeof p.pad === "number" && papan.strap.includes(p.pad);
          const rumah = padRumah === p.key;
          const baris = barisNama(p.pad);
          const isi = (
            <>
              <title>
                {[
                  lbl,
                  why ? (t.alasan[why] ?? why) : strap ? t.strap : null,
                  rumah ? t.modulPin : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </title>
              {rumah && <circle className="jumper__home" cx={p.x} cy={p.y} r={13} />}
              <circle
                className="jumper__pad"
                cx={p.x}
                cy={p.y}
                r={8}
                data-ok={kabelJ ? (bisa ? "yes" : "no") : undefined}
                data-hover={hover?.key === p.key ? "yes" : undefined}
                data-used={dipakai ? "yes" : undefined}
                data-power={typeof p.pad === "string" ? "yes" : undefined}
              />
              <text
                className="jumper__lbl"
                x={p.x}
                textAnchor="middle"
                data-dim={kabelJ && !bisa ? "yes" : undefined}
              >
                {baris.map((s, i) => (
                  <tspan
                    key={i}
                    x={p.x}
                    y={p.atas ? p.y + 19 + i * 11 : p.y - 19 - (baris.length - 1 - i) * 11}
                  >
                    {s}
                  </tspan>
                ))}
              </text>
            </>
          );
          return pilih !== null && bisa && onMove ? (
            <g
              key={p.key}
              role="button"
              tabIndex={0}
              className="jumper__target"
              aria-label={t.moveTo(kabelJ!.signal, lbl)}
              onClick={() => {
                lepas(pilih, p);
                setPilih(null);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                lepas(pilih, p);
                setPilih(null);
              }}
            >
              {isi}
            </g>
          ) : (
            <g key={p.key}>{isi}</g>
          );
        })}

        {/* the parts, their pins on top */}
        {parts.map((p, i) => {
          const x0 = (W - partsTotal) / 2 + partW.slice(0, i).reduce((a, b) => a + b + 22, 0);
          return (
            <g key={p.name}>
              <rect
                className="wiring__part"
                x={x0}
                y={partsY}
                width={partW[i]}
                height={PART_H}
                rx={10}
              />
              <text
                className="wiring__part-label"
                x={x0 + partW[i] / 2}
                y={partsY + PART_H - 12}
                textAnchor="middle"
              >
                {p.name}
              </text>
              {p.sigs.map((j) => {
                const s = sigPos.get(j.row)!;
                return (
                  <g key={j.row}>
                    <rect
                      className="wiring__pad"
                      x={s.x - 7}
                      y={s.y - 7}
                      width={14}
                      height={14}
                      rx={3}
                    />
                    <text className="wiring__sig" x={s.x} y={s.y + 24} textAnchor="middle">
                      {j.signal}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* the wires, then their plugs on top */}
        {jumpers.map((j) => {
          const a = posisi.get(j.row);
          const b = sigPos.get(j.row);
          if (!a || !b) return null;
          const lurus = (pegang?.row === j.row && pegang.at) || (anim[j.row] && !reduce);
          const r = rutes.get(j.row);
          // Held, gliding or waiting unplugged: a straight lead from the part.
          const d = !lurus && r && padOf(j) ? jalur(r) : `M${b.x},${b.y} L${a.x},${a.y}`;
          const on = active === j.row || kabel === j.row;
          return (
            <g
              key={j.row}
              className="wiring__wire"
              data-kind={j.kind}
              data-on={on ? "yes" : undefined}
              data-dim={(active !== null || kabel !== null) && !on ? "yes" : undefined}
              data-parked={!padOf(j) ? "yes" : undefined}
              onMouseEnter={() => setActive(j.row)}
              onMouseLeave={() => setActive(null)}
            >
              <path d={d} className="wiring__hit" />
              <path d={d} className="wiring__line" filter={on ? `url(#${glow})` : undefined} />
              {j.kind === "sig" && padOf(j) && <path d={d} className="wiring__pulse" />}
            </g>
          );
        })}
        {jumpers.map((j) => {
          const a = posisi.get(j.row);
          if (!a) return null;
          return (
            <circle
              key={j.row}
              className="jumper__plug"
              data-kind={j.kind}
              data-on={kabel === j.row ? "yes" : undefined}
              data-edit={onMove ? "yes" : undefined}
              data-parked={!padOf(j) ? "yes" : undefined}
              cx={a.x}
              cy={a.y}
              r={7}
              role="button"
              tabIndex={0}
              aria-label={j.label ? t.pickWire(j.signal, j.label) : t.parked(j.signal)}
              aria-pressed={pilih === j.row}
              onPointerDown={turun(j)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                setPilih((p) => (p === j.row ? null : j.row));
                setActive(j.row);
              }}
            />
          );
        })}
      </svg>
    </div>
  );
}
