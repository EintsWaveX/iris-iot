/**
 * Small pieces the host and player screens share: answer shapes, the timer
 * ring, count-up numbers, the animated backdrop, the answer tiles and the
 * leaderboard. Motion follows the site's three levels (`m`): full and ldm
 * animate (ldm with less), reduce shows the end state at once.
 */
import gsap from "gsap";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { BarisPapan } from "../../lib/kuis/engine";
import type { SoalPublik } from "../../lib/kuis/types";
import { warnaUntuk, type WarnaPilihan } from "../../lib/kuis/warna";
import { calmMotion } from "../../lib/calm-motion";
import type { MotionLevel } from "../recruitment/reveal/fx";
import type { KuisTeks } from "./kuisStrings";

// ---------------------------------------------------------------- shapes

export function Bentuk({ bentuk, size = 26 }: { bentuk: WarnaPilihan["bentuk"]; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {bentuk === "segitiga" && <polygon points="12,3 22.5,21 1.5,21" />}
      {bentuk === "belah-ketupat" && <polygon points="12,1 23,12 12,23 1,12" />}
      {bentuk === "lingkaran" && <circle cx="12" cy="12" r="10" />}
      {bentuk === "kotak" && <rect x="3" y="3" width="18" height="18" rx="2.5" />}
    </svg>
  );
}

/** Rank movement and streak, drawn (no text glyphs or emoji standing in for icons). */
export function Panah({ arah, size = 12 }: { arah: "naik" | "turun"; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true">
      <path
        d={arah === "naik" ? "M6 2.2l4.2 6.6H1.8z" : "M6 9.8L1.8 3.2h8.4z"}
        fill="currentColor"
      />
    </svg>
  );
}

export function Api({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12.5 2.5C13.1 5.7 11.3 7.1 9.8 8.8 8.4 10.4 7 11.8 7 14.3 7 17.4 9.2 20 12 20s5-2.6 5-5.7c0-2.1-1-3.6-2-4.8-.4 1.3-1.1 2-1.8 2.2.5-3-.3-6.3-.7-9.2z"
        fill="currentColor"
      />
    </svg>
  );
}

// ------------------------------------------------------------ the clock

/** Whole seconds left on a timed phase, ticking at 10 Hz; frozen at `sisaJeda` while paused. */
export function useDetikSisa(
  akhir: number | null,
  sisaJeda: number | null,
  sekarang: () => number,
  aktif: boolean,
): number | null {
  const [ms, setMs] = useState<number | null>(null);
  useEffect(() => {
    if (!aktif) return setMs(null);
    if (akhir === null) return setMs(sisaJeda);
    const tik = () => setMs(Math.max(0, akhir - sekarang()));
    tik();
    const id = window.setInterval(tik, 100);
    return () => window.clearInterval(id);
  }, [akhir, sisaJeda, aktif, sekarang]);
  return ms === null ? null : Math.ceil(ms / 1000);
}

/**
 * The countdown ring. The sweep is a CSS animation that starts part way in
 * (a negative delay) when the page opens mid question, so it is smooth and
 * costs no re-render; it stands still while the clock is paused.
 */
export function Cincin({
  totalMs,
  sisaMs,
  dijeda,
  detik,
  kunci,
}: {
  totalMs: number;
  sisaMs: number | null;
  dijeda: boolean;
  detik: number | null;
  kunci: string | number;
}) {
  const lewat = sisaMs === null ? 0 : Math.max(0, totalMs - sisaMs);
  const gaya = {
    "--kz-dur": `${totalMs}ms`,
    "--kz-tunda": `${-lewat}ms`,
  } as CSSProperties;
  const genting = detik !== null && detik <= 5 && !dijeda;
  return (
    <div
      className="kz__cincin"
      data-genting={genting ? "1" : undefined}
      data-jeda={dijeda ? "1" : undefined}
      style={gaya}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="kz__cincin-alas" cx="50" cy="50" r="44" />
        <circle key={kunci} className="kz__cincin-isi" cx="50" cy="50" r="44" pathLength="100" />
      </svg>
      <b className="kz__cincin-angka" aria-live="off">
        {detik ?? "·"}
      </b>
    </div>
  );
}

// --------------------------------------------------------------- numbers

/** A number that counts up to its value. */
export function Angka({
  nilai,
  m,
  durasi = 0.9,
  awal,
}: {
  nilai: number;
  m: MotionLevel;
  durasi?: number;
  awal?: number;
}) {
  const [tampil, setTampil] = useState(m === "reduce" ? nilai : (awal ?? nilai));
  const dari = useRef(awal ?? nilai);
  useEffect(() => {
    if (m === "reduce") {
      setTampil(nilai);
      dari.current = nilai;
      return;
    }
    const o = { v: dari.current };
    const tw = gsap.to(o, {
      v: nilai,
      duration: durasi,
      ease: "power2.out",
      onUpdate: () => setTampil(Math.round(o.v)),
      onComplete: () => {
        dari.current = nilai;
      },
    });
    return () => {
      tw.kill();
      dari.current = o.v;
    };
  }, [nilai, m, durasi]);
  return <>{tampil.toLocaleString()}</>;
}

// ------------------------------------------------------------- backdrop

/**
 * The painted cosmos (Cosmos.astro) is the sky behind the whole game. This is only a soft scrim over it that
 * deepens the middle of the screen for legibility and warms toward Module 4's colour as the game runs.
 * Decorative only; costs one gradient, no blur.
 */
export function Latar({ fase }: { m?: MotionLevel; fase: string }) {
  return <div className="kz__latar" aria-hidden="true" data-fase={fase} />;
}

// ------------------------------------------------------------ leaving things

/**
 * Keeps a thing on screen for `ms` after it should go, so it can fade out (the Fade kit's rule: a calm-motion
 * browser removes it at once). Returns whether to render it, and whether it is on its way out.
 */
export function useKeluar(tampil: boolean, ms = 180): { ada: boolean; keluar: boolean } {
  const [ada, setAda] = useState(tampil);
  useEffect(() => {
    if (tampil) return setAda(true);
    if (calmMotion()) return setAda(false);
    const id = window.setTimeout(() => setAda(false), ms);
    return () => window.clearTimeout(id);
  }, [tampil, ms]);
  return { ada: ada || tampil, keluar: !tampil };
}

/** A banner or toast that fades in and out. Holds its last content while it leaves. */
export function Selimut({
  tampil,
  kelas,
  role,
  children,
}: {
  tampil: boolean;
  kelas: string;
  role: "status" | "alert";
  children: ReactNode;
}) {
  const { ada, keluar } = useKeluar(tampil, 200);
  const terakhir = useRef<ReactNode>(children);
  if (tampil) terakhir.current = children;
  if (!ada) return null;
  return (
    <div className={kelas} role={role} data-keluar={keluar ? "1" : undefined}>
      {tampil ? children : terakhir.current}
    </div>
  );
}

/**
 * A list that keeps the rows that just left on screen while they fade, so a player dropping out of the lobby
 * eases away. Rows come back in their last known order with `keluar` set on the ones that went.
 */
export function useDaftarKeluar<T>(
  daftar: readonly T[],
  kunci: (x: T) => string,
  ms = 220,
): { item: T; keluar: boolean }[] {
  const [sisa, setSisa] = useState<Map<string, T>>(new Map());
  const lalu = useRef<Map<string, T>>(new Map());
  const sekarang = new Map(daftar.map((x) => [kunci(x), x]));
  useEffect(() => {
    const pergi = new Map<string, T>();
    for (const [k, x] of lalu.current) if (!sekarang.has(k)) pergi.set(k, x);
    lalu.current = sekarang;
    if (pergi.size === 0 || calmMotion()) return;
    setSisa((m) => new Map([...m, ...pergi]));
    const id = window.setTimeout(
      () =>
        setSisa((m) => {
          const n = new Map(m);
          for (const k of pergi.keys()) n.delete(k);
          return n;
        }),
      ms,
    );
    return () => window.clearTimeout(id);
  }, [daftar]);
  const baris = daftar.map((item) => ({ item, keluar: false }));
  for (const [k, item] of sisa) if (!sekarang.has(k)) baris.push({ item, keluar: true });
  return baris;
}

// ----------------------------------------------------------- the tiles

export interface PropsPilihan {
  soal: SoalPublik;
  t: KuisTeks;
  /** Reveal: which is right, and (for the host) how many chose each. */
  benar?: number;
  sebaran?: number[];
  totalJawab?: number;
  /** The option this player chose. */
  dipilih?: number | null;
  /** Tap handler; omitted on the host's screen and once locked. */
  onPilih?: (i: number) => void;
  ukuran: "besar" | "ponsel";
}

/** The 2x2 (or 1x2) answer tiles, the same for the projector and the phone. */
export function Pilihan({
  soal,
  t,
  benar,
  sebaran,
  totalJawab = 0,
  dipilih,
  onPilih,
  ukuran,
}: PropsPilihan) {
  const buka = benar !== undefined;
  const n = soal.pilihan.length;
  return (
    <ul className="kz__pilihan" data-n={n} data-u={ukuran} data-buka={buka ? "1" : undefined}>
      {soal.pilihan.map((teks, i) => {
        const w = warnaUntuk(n, i);
        const st = buka ? (i === benar ? "benar" : "salah") : dipilih === i ? "pilih" : undefined;
        const jumlah = sebaran?.[i] ?? 0;
        const bagian = totalJawab > 0 ? jumlah / totalJawab : 0;
        const gaya = { "--kz-bg": w.bg, "--kz-ink": w.ink, "--i": i } as CSSProperties;
        const isi = (
          <>
            <span className="kz__pil-bentuk">
              <Bentuk bentuk={w.bentuk} size={ukuran === "besar" ? 30 : 24} />
            </span>
            <span className="kz__pil-teks">{teks}</span>
            {buka && sebaran && (
              <span className="kz__pil-jumlah" aria-label={`${jumlah}`}>
                {jumlah}
              </span>
            )}
            {buka && i === benar && (
              <svg
                className="kz__pil-centang"
                viewBox="0 0 24 24"
                width="30"
                height="30"
                aria-hidden="true"
              >
                <path
                  d="M4 12.5l5 5L20 6.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            {buka && sebaran && (
              <i className="kz__pil-batang" style={{ transform: `scaleX(${bagian})` }} />
            )}
          </>
        );
        return (
          <li key={i} style={gaya} data-st={st}>
            {onPilih ? (
              <button
                type="button"
                className="kz__pil"
                onClick={() => onPilih(i)}
                aria-label={`${t.bentuk[w.bentuk]}: ${teks}`}
              >
                {isi}
              </button>
            ) : (
              <div className="kz__pil" data-st={st}>
                {isi}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ----------------------------------------------------------- leaderboard

function inisial(nama: string): string {
  const k = nama.trim().split(/\s+/);
  return ((k[0]?.[0] ?? "?") + (k.length > 1 ? (k[k.length - 1][0] ?? "") : "")).toUpperCase();
}

/** A stable colour from a NIM, so a person keeps one colour the whole game. */
export function warnaOrang(nim: string): string {
  let h = 0;
  for (let i = 0; i < nim.length; i++) h = (h * 31 + nim.charCodeAt(i)) >>> 0;
  return ["#c92a3a", "#1a6fd1", "#7b4de0", "#0e8f7e", "#b86a00", "#a3358f"][h % 6];
}

export function Avatar({ nim, nama, ukuran = 38 }: { nim: string; nama: string; ukuran?: number }) {
  return (
    <span
      className="kz__avatar"
      style={{
        background: warnaOrang(nim),
        width: ukuran,
        height: ukuran,
        fontSize: ukuran * 0.38,
      }}
      aria-hidden="true"
    >
      {inisial(nama)}
    </span>
  );
}

/** The ranked rows. When the order changes the rows glide to their new places (FLIP). */
export function DaftarPapan({
  baris,
  m,
  t,
  saya,
  maks = 5,
}: {
  baris: BarisPapan[];
  m: MotionLevel;
  t: KuisTeks;
  saya?: string | null;
  maks?: number;
}) {
  const ol = useRef<HTMLOListElement>(null);
  const posisi = useRef(new Map<string, number>());
  const tampil = baris.slice(0, maks);

  useLayoutEffect(() => {
    const el = ol.current;
    if (!el) return;
    const baru = new Map<string, number>();
    const anak = [...el.children] as HTMLElement[];
    for (const c of anak) baru.set(c.dataset.nim ?? "", c.offsetTop);
    if (m !== "reduce") {
      anak.forEach((c, idx) => {
        const nim = c.dataset.nim ?? "";
        const lama = posisi.current.get(nim);
        if (lama === undefined) {
          gsap.fromTo(
            c,
            { opacity: 0, y: 10 },
            { opacity: 1, y: 0, duration: 0.42, delay: idx * 0.05, ease: "power3.out" },
          );
        } else if (lama !== c.offsetTop) {
          gsap.fromTo(c, { y: lama - c.offsetTop }, { y: 0, duration: 0.8, ease: "power3.out" });
        }
      });
    }
    posisi.current = baru;
  });

  return (
    <ol className="kz__papan" ref={ol}>
      {tampil.map((b) => (
        <li
          key={b.nim}
          data-nim={b.nim}
          data-saya={b.nim === saya ? "1" : undefined}
          data-top={b.peringkat <= 3 ? b.peringkat : undefined}
        >
          <span className="kz__papan-rank">{b.peringkat}</span>
          <Avatar nim={b.nim} nama={b.nama} />
          <span className="kz__papan-nama">
            <b>{b.nama}</b>
            {b.kelompok !== null && <small>{t.rataKelompok(b.kelompok)}</small>}
          </span>
          {b.naik !== 0 && (
            <span
              className="kz__papan-delta"
              data-arah={b.naik > 0 ? "naik" : "turun"}
              title={b.naik > 0 ? t.naikN(b.naik) : t.turunN(-b.naik)}
            >
              <Panah arah={b.naik > 0 ? "naik" : "turun"} />
              {Math.abs(b.naik)}
            </span>
          )}
          {b.streak >= 2 && (
            <span className="kz__papan-api" title={t.streakN(b.streak)}>
              <Api />
              {b.streak}
            </span>
          )}
          <b className="kz__papan-skor">
            <Angka nilai={b.skor} m={m} />
          </b>
        </li>
      ))}
    </ol>
  );
}

/** A child that fades and rises in when it mounts; `kunci` re-runs it. */
export function Masuk({
  children,
  kunci,
  m,
  kelas = "",
}: {
  children: ReactNode;
  kunci: string | number;
  m: MotionLevel;
  kelas?: string;
}) {
  return (
    <div key={kunci} className={`kz__layar ${kelas}`} data-anim={m === "reduce" ? undefined : "1"}>
      {children}
    </div>
  );
}
