/**
 * The board seen from above with its jumper wires (2026-10-12): both pin
 * headers of the real board as two rows of pads, the module's parts below,
 * and one wire per connection from its pin to the part.
 *
 * With `onMove`, each wire's plug can be dragged to another pad, or picked
 * with a click (or Enter) and then dropped with a click on a pad. While a
 * wire is held, only the pads that can take it light up (papan.ts says
 * which: no flash or serial pins, no input only pin for an output, ADC1
 * only for an analog part, one GPIO per wire); the rest dim and say why.
 * A moved wire glides to its new pin. Without `onMove` the board only
 * shows, and a click on a wire still shows where it could go.
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
  /** The pin it is on now, as the table writes it */
  label: string;
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

const P = 30;
const TEPI = 22;
const BOARD_Y = 72;
const BOARD_H = 204;
const GAP = 128;
const PART_H = 64;
const SIG_W = 64;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

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

  /* ------------------------------------------------------------ layout */
  const n = Math.max(papan.kiri.length, papan.kanan.length);
  const boardW = n * P + TEPI * 2;
  const parts = useMemo(() => {
    const names = [...new Set(jumpers.map((j) => j.part))];
    return names.map((name) => ({ name, sigs: jumpers.filter((j) => j.part === name) }));
  }, [jumpers]);
  const partW = parts.map((p) => Math.max(p.sigs.length * SIG_W + 20, p.name.length * 8.5 + 28));
  const partsTotal = partW.reduce((a, b) => a + b, 0) + Math.max(0, parts.length - 1) * 22;
  const W = Math.max(boardW + 60, partsTotal + 40);
  const boardX = (W - boardW) / 2;
  const topY = BOARD_Y + 22;
  const botY = BOARD_Y + BOARD_H - 22;
  const partsY = BOARD_Y + BOARD_H + GAP;
  const H = partsY + PART_H + 16;

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
    const pad = padDariLabel(papan, j.label);
    if (pad === null) return null;
    const ingat = fisik[j.row];
    const hit = pads.find((p) => p.key === ingat && p.pad === pad);
    return hit ?? pads.find((p) => p.pad === pad) ?? null;
  };
  const dipakaiSelain = (row: number) => {
    const s = new Set<number>();
    for (const j of jumpers) {
      if (j.row === row) continue;
      const p = padDariLabel(papan, j.label);
      if (typeof p === "number") s.add(p);
    }
    return s;
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

  // The glide: a wire whose pin changed moves from where it was last drawn.
  const lalu = useRef(new Map<number, Titik>());
  const kini = useRef(new Map<number, Titik>());
  const [anim, setAnim] = useState<Record<number, { dari: Titik; t0: number }>>({});
  const [, setFrame] = useState(0);
  const target = (j: Jumper): Titik | null => {
    const p = padOf(j);
    return p ? { x: p.x, y: p.y } : null;
  };
  const sebelum = useRef(new Map<number, string>());
  useLayoutEffect(() => {
    const baru: Record<number, { dari: Titik; t0: number }> = {};
    for (const j of jumpers) {
      const p = padOf(j);
      const kunci = p?.key ?? "";
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

  const posOf = (j: Jumper): Titik | null => {
    if (pegang?.row === j.row && pegang.at) return pegang.at;
    const to = target(j);
    if (!to) return null;
    const a = anim[j.row];
    const reduce =
      typeof document !== "undefined" && document.documentElement.dataset.motionTier === "0";
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
      if (padDariLabel(papan, j.label) === p.pad) return true;
    }
    onMove(row, p.pad);
    return true;
  }

  const turun = (j: Jumper) => (e: RPointerEvent<SVGElement>) => {
    if (e.button !== 0) return;
    const at = keSvg(e);
    if (!at) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setPegang({ row: j.row, at: null, mulai: at });
    setActive(j.row);
  };
  const gerak = (e: RPointerEvent<SVGElement>) => {
    if (!pegang || !onMove) return;
    const at = keSvg(e);
    if (!at) return;
    const jauh = (at.x - pegang.mulai.x) ** 2 + (at.y - pegang.mulai.y) ** 2 > 16;
    if (pegang.at || jauh) setPegang({ ...pegang, at });
  };
  const naik = (e: RPointerEvent<SVGElement>) => {
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
  const path = (a: Titik, b: Titik, atas: boolean) =>
    atas
      ? `M${a.x},${a.y} C${a.x},${a.y - 64} ${b.x},${BOARD_Y - 70} ${b.x},${b.y}`
      : `M${a.x},${a.y} C${a.x},${a.y + 60} ${b.x},${b.y - 64} ${b.x},${b.y}`;

  const posisi = new Map<number, Titik>();
  for (const j of jumpers) {
    const p = posOf(j);
    if (p) posisi.set(j.row, p);
  }
  kini.current = posisi;

  return (
    <div className="jumper-wrap">
      <svg
        ref={svg}
        className="jumper"
        viewBox={`0 0 ${W} ${H}`}
        role="group"
        aria-label={`${judul}: ${jumpers.map((j) => `${j.part} ${j.signal} ${j.label}`).join(", ")}`}
        style={{ "--mod-hue": `var(--mod-${modul})` } as CSSProperties}
        data-holding={kabel !== null ? "yes" : undefined}
        onPointerMove={gerak}
        onPointerUp={naik}
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
        {/* the module shield, with the board's name on it (the looping
          wires pass above the board, so nothing sits there) */}
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
          const isi = (
            <>
              <title>
                {why ? `${lbl} · ${t.alasan[why] ?? why}` : strap ? `${lbl} · ${t.strap}` : lbl}
              </title>
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
                y={p.atas ? p.y + 16 : p.y - 16}
                transform={`rotate(${p.atas ? 90 : -90} ${p.x} ${p.atas ? p.y + 16 : p.y - 16})`}
                data-dim={kabelJ && !bisa ? "yes" : undefined}
              >
                {namaPad(p.pad)}
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
          const atas =
            pegang?.row === j.row && pegang.at
              ? a.y < BOARD_Y + BOARD_H / 2
              : (padOf(j)?.atas ?? false);
          const d = path(a, b, atas);
          const on = active === j.row || kabel === j.row;
          return (
            <g
              key={j.row}
              className="wiring__wire"
              data-kind={j.kind}
              data-on={on ? "yes" : undefined}
              data-dim={(active !== null || kabel !== null) && !on ? "yes" : undefined}
              onMouseEnter={() => setActive(j.row)}
              onMouseLeave={() => setActive(null)}
            >
              <path d={d} className="wiring__hit" />
              <path d={d} className="wiring__line" filter={on ? `url(#${glow})` : undefined} />
              {j.kind === "sig" && <path d={d} className="wiring__pulse" />}
            </g>
          );
        })}
        {jumpers.map((j) => {
          const a = posisi.get(j.row);
          if (!a) return null;
          const lbl = j.label;
          return (
            <circle
              key={j.row}
              className="jumper__plug"
              data-kind={j.kind}
              data-on={kabel === j.row ? "yes" : undefined}
              data-edit={onMove ? "yes" : undefined}
              cx={a.x}
              cy={a.y}
              r={7}
              role="button"
              tabIndex={0}
              aria-label={t.pickWire(j.signal, lbl)}
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
