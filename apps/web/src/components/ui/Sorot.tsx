/**
 * The feel of live data (Phase 12): a value that changed while on screen
 * gets a quiet wash of the accent for about a second (the kit's score
 * flash, ctl-flash), numbers tick to their new value, and rows that arrive
 * after the first load slide in like the room feed's (p10-log-in). The
 * first load never animates, and motion tier 0 (which reduced motion
 * implies) shows the new value at once.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMotionTier } from "../../lib/hooks";

// ---------- Highlight ----------
// ---------- Highlight ----------
// ---------- Highlight ----------

/** "a" or "b" after each change of `value` (alternating restarts the
 *  animation), undefined before the first change */
export function useSorot(value: unknown): "a" | "b" | undefined {
  const kunci = JSON.stringify(value ?? null);
  const lama = useRef<string | null>(null);
  const [sorot, setSorot] = useState<"a" | "b" | undefined>(undefined);
  useEffect(() => {
    const awal = lama.current === null;
    const kosong = kunci === "null";
    if (!awal && !kosong && lama.current !== "null" && lama.current !== kunci)
      setSorot((s) => (s === "a" ? "b" : "a"));
    lama.current = kunci;
  }, [kunci]);
  return sorot;
}

/** Wraps a value that may change live */
export function Sorot({
  value,
  children,
  className,
}: {
  value: unknown;
  children: ReactNode;
  className?: string;
}) {
  const s = useSorot(value);
  return (
    <span className={className ? `sorot ${className}` : "sorot"} data-sorot={s}>
      {children}
    </span>
  );
}

// ---------- Ticking Numbers ----------
// ---------- Ticking Numbers ----------
// ---------- Ticking Numbers ----------

const GULIR_MS = 280;

/**
 * A number that counts to its new value in under 300 ms (ease-out), in
 * tabular figures so the width never jumps. `format` turns the in-between
 * values into text; the first value shows at once.
 */
export function AngkaGulir({
  value,
  format = (n) => String(Math.round(n)),
  className,
}: {
  value: number | null | undefined;
  format?: (n: number) => string;
  className?: string;
}) {
  const tier = useMotionTier();
  const [shown, setShown] = useState<number | null>(value ?? null);
  const dari = useRef<number | null>(value ?? null);
  const s = useSorot(value);
  useEffect(() => {
    if (value === null || value === undefined) {
      setShown(null);
      dari.current = null;
      return;
    }
    const awal = dari.current;
    dari.current = value;
    if (awal === null || awal === value || tier === 0) {
      setShown(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const langkah = (t: number) => {
      const p = Math.min(1, (t - t0) / GULIR_MS);
      const e = 1 - (1 - p) ** 3;
      setShown(awal + (value - awal) * e);
      if (p < 1) raf = requestAnimationFrame(langkah);
    };
    raf = requestAnimationFrame(langkah);
    return () => cancelAnimationFrame(raf);
  }, [value, tier]);
  if (shown === null) return null;
  return (
    <span className={className ? `sorot angka ${className}` : "sorot angka"} data-sorot={s}>
      {format(shown)}
    </span>
  );
}

// ---------- New Rows ----------
// ---------- New Rows ----------
// ---------- New Rows ----------

/**
 * The keys that arrived after the first load, for a row's `data-baru`
 * (it slides in); each is forgotten after a second so a re-render never
 * replays it.
 */
export function useBaru(keys: readonly (string | number)[]): ReadonlySet<string> {
  const dikenal = useRef<Set<string> | null>(null);
  const hidup = useRef(true);
  const [baru, setBaru] = useState<ReadonlySet<string>>(new Set());
  const gabung = keys.join("\u0001");
  useEffect(() => {
    const kini = keys.map(String);
    if (dikenal.current === null) {
      if (kini.length) dikenal.current = new Set(kini);
      return;
    }
    const masuk = kini.filter((k) => !dikenal.current!.has(k));
    for (const k of kini) dikenal.current.add(k);
    if (!masuk.length) return;
    setBaru((b) => new Set([...b, ...masuk]));
    window.setTimeout(() => {
      if (!hidup.current) return;
      setBaru((b) => {
        const n = new Set(b);
        for (const k of masuk) n.delete(k);
        return n;
      });
    }, 1000);
  }, [gabung]);
  useEffect(
    () => () => {
      hidup.current = false;
    },
    [],
  );
  return baru;
}
